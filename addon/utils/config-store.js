const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR =
  process.env.DATA_DIR ||
  path.join(__dirname, "..");

const CONFIGS_FILE =
  path.join(DATA_DIR, "configs.json");
const REVISIONS_FILE = path.join(DATA_DIR, "config-revisions.json");

const MUTATION_REASONS = Object.freeze({
  EXPLICIT_CONFIG: "explicit-config",
  OAUTH_INTEGRATION: "oauth-integration",
  PROFILE_COLLECTION: "profile-collection",
  PASSWORD_AUTH: "password-auth",
  HOUSEKEEPING_LAST_ACCESSED: "housekeeping-last-accessed"
});

function enabledEnv(name, fallback) {
  if (process.env[name] === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(String(process.env[name]));
}

function ownershipPolicy() {
  const ownershipEnabled = enabledEnv("PROFILE_STORE_ENABLED", false);
  return {
    ownershipEnabled,
    pgNativeCreateEnabled: enabledEnv("PROFILE_STORE_PG_NATIVE_CREATE_ENABLED", ownershipEnabled),
    migrateOnWriteEnabled: enabledEnv("PROFILE_STORE_MIGRATE_ON_WRITE_ENABLED", ownershipEnabled),
    migrateLastAccessedEnabled: enabledEnv("PROFILE_STORE_MIGRATE_LAST_ACCESSED_ENABLED", false),
    legacyFallbackEnabled: ownershipEnabled ? enabledEnv("PROFILE_STORE_LEGACY_FALLBACK_ENABLED", true) : true
  };
}

function migrationRolloutPercent() {
  const raw = process.env.PROFILE_STORE_MIGRATE_ROLLOUT_PERCENT;
  if (raw === undefined) return 0;

  const value = Number(raw);
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(100, value));
}

function tokenInMigrationRollout(token, percent) {
  if (percent <= 0) return false;
  if (percent >= 100) return true;

  const bucket = crypto
    .createHash("sha256")
    .update(String(token))
    .digest()
    .readUInt32BE(0) % 10000;

  return bucket < Math.floor(percent * 100);
}

function shouldMigrateLegacy(token, reason) {
  const policy = ownershipPolicy();
  if (!policy.migrateOnWriteEnabled) return false;

  if (reason === MUTATION_REASONS.HOUSEKEEPING_LAST_ACCESSED) {
    if (!policy.migrateLastAccessedEnabled) return false;
  }

  return tokenInMigrationRollout(
    token,
    migrationRolloutPercent()
  );
}

let CONFIG_CACHE = null;
let CONFIG_CACHE_MTIME = 0;
let CONFIG_PERSISTED_SNAPSHOT = null;
let PROFILE_STORE_ADAPTER = null;
let ACCOUNT_REVISIONS = {};
try { ACCOUNT_REVISIONS = JSON.parse(fs.readFileSync(REVISIONS_FILE, "utf8")); } catch (_) { ACCOUNT_REVISIONS = {}; }

function configureProfileStoreAdapter(adapter) {
  PROFILE_STORE_ADAPTER = adapter;
}

function loadConfigs() {
  let stat;

  try {
    stat = fs.statSync(CONFIGS_FILE);
  } catch (e) {
    return {};
  }

  const mtime = stat.mtimeMs;

  if (
    CONFIG_CACHE &&
    CONFIG_CACHE_MTIME === mtime
  ) {
    return CONFIG_CACHE;
  }

  let parsed;

  try {
    parsed = JSON.parse(
      fs.readFileSync(CONFIGS_FILE, "utf8")
    );
  } catch (e) {
    console.error(
      "[config-store] configs.json is malformed JSON:",
      e.message
    );

    throw new Error(
      `configs.json contains invalid JSON: ${e.message}`
    );
  }

  CONFIG_CACHE = parsed;
  CONFIG_CACHE_MTIME = mtime;
  CONFIG_PERSISTED_SNAPSHOT = cloneConfig(parsed);
  for (const token of Object.keys(parsed)) if (!Number.isInteger(ACCOUNT_REVISIONS[token])) ACCOUNT_REVISIONS[token] = 0;
  return CONFIG_CACHE;
}

function loadConfig(token, profileId) {
  const configs = loadConfigs();
  const config = configs[token];
  if (config && PROFILE_STORE_ADAPTER) PROFILE_STORE_ADAPTER.schedule(config, token, profileId || null);
  return config;
}

async function readConfig(token, profileId) {
  if (!PROFILE_STORE_ADAPTER?.readAccount) {
    const configs = loadConfigs();
    const config = configs[token];
    if (config && PROFILE_STORE_ADAPTER) PROFILE_STORE_ADAPTER.schedule(config, token, profileId || null);
    return config;
  }
  const options = { profileId: profileId || null };
  if (ownershipPolicy().legacyFallbackEnabled) options.jsonLoader = () => loadConfigs()[token];
  else options.jsonAccount = undefined;
  return PROFILE_STORE_ADAPTER.readAccount(token, options);
}

async function hasAccount(token) {
  if (PROFILE_STORE_ADAPTER?.hasAccount && await PROFILE_STORE_ADAPTER.hasAccount(token)) return true;
  if (!ownershipPolicy().legacyFallbackEnabled) return false;
  return Object.prototype.hasOwnProperty.call(loadConfigs(), token);
}

async function createAccount(token, account) {
  if (!ownershipPolicy().pgNativeCreateEnabled) {
    const configs = loadConfigs();
    if (Object.prototype.hasOwnProperty.call(configs, token)) {
      const error = new Error("Account already exists");
      error.code = "PROFILE_STORE_ACCOUNT_EXISTS";
      error.statusCode = 409;
      throw error;
    }
    configs[token] = cloneConfig(account);
    await saveConfigs(configs);
    return cloneConfig(account);
  }
  if (!PROFILE_STORE_ADAPTER?.createAccount) {
    const error = new Error("Profile Store authoritative writer is unavailable");
    error.code = "PROFILE_STORE_WRITE_FAILED";
    error.statusCode = 503;
    throw error;
  }
  return PROFILE_STORE_ADAPTER.createAccount(token, account);
}

function getConfigs() { return loadConfigs(); }

function getAccount(token) { return loadConfigs()[token]; }

function getResolvedProfile(token, profileId) {
  const account = getAccount(token);
  return account ? require("./profiles").resolveConfigForProfile(account, profileId) : undefined;
}

async function readResolvedProfile(token, profileId) {
  const account = await readConfig(token, profileId);
  return account ? require("./profiles").resolveConfigForProfile(account, profileId) : undefined;
}

function cloneConfig(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

async function mutateAccount(token, mutator, options = {}) {
  const reason = options.reason || MUTATION_REASONS.EXPLICIT_CONFIG;
  if (PROFILE_STORE_ADAPTER?.mutateAccount && PROFILE_STORE_ADAPTER?.hasAccount) {
    // PostgreSQL existence owns the decision. A database error is allowed to
    // fail the request, never to become permission to mutate JSON.
    if (await PROFILE_STORE_ADAPTER.hasAccount(token)) {
      const committed = await PROFILE_STORE_ADAPTER.mutateAccount(token, mutator);
      return committed?.account;
    }

    if (!ownershipPolicy().legacyFallbackEnabled) return undefined;
    const legacyAccount = getAccount(token);
    if (!legacyAccount) return undefined;
    PROFILE_STORE_ADAPTER.recordLegacyRead?.();
    if (PROFILE_STORE_ADAPTER.migrateLegacyAccount && shouldMigrateLegacy(token, reason)) {
      const committed = await PROFILE_STORE_ADAPTER.migrateLegacyAccount(
        token,
        cloneConfig(legacyAccount),
        mutator
      );
      return committed.account;
    }
    PROFILE_STORE_ADAPTER.recordMigrationSkipped?.(reason);

    // Legacy JSON accounts must not rewrite the entire configs.json file on
    // routine manifest access. The manifest route considers lastAccessed stale
    // after 24 hours, but the legacy store is hundreds of MB in Production.
    // Persist legacy housekeeping at most once every 30 days. Explicit user
    // mutations are unaffected.
    if (reason === MUTATION_REASONS.HOUSEKEEPING_LAST_ACCESSED) {
      const lastAccessedMs = new Date(legacyAccount.lastAccessed || 0).getTime();
      const legacyHousekeepingIntervalMs = 30 * 24 * 60 * 60 * 1000;

      if (
        Number.isFinite(lastAccessedMs) &&
        Date.now() - lastAccessedMs < legacyHousekeepingIntervalMs
      ) {
        return legacyAccount;
      }
    }
  }

  // Compatibility mode for deployments without the authoritative adapter.
  const account = getAccount(token);
  if (!account) return undefined;
  const next = cloneConfig(account);
  await mutator(next);
  await saveAccount(token, next);
  return next;
}

async function saveAccount(token, next) {
  const configs = loadConfigs();
  if (!configs[token]) return false;
  configs[token] = next;
  await saveConfigs(configs);
  return true;
}

async function deleteAccount(token) {
  let deleted = false;
  const policy = ownershipPolicy();

  if (policy.ownershipEnabled && PROFILE_STORE_ADAPTER?.hasAccount) {
    const existsInProfileStore = await PROFILE_STORE_ADAPTER.hasAccount(token);
    if (existsInProfileStore) {
      if (!PROFILE_STORE_ADAPTER.deleteAccount) {
        const error = new Error("Profile Store delete operation is unavailable");
        error.code = "PROFILE_STORE_WRITE_FAILED";
        error.statusCode = 503;
        throw error;
      }
      deleted = (await PROFILE_STORE_ADAPTER.deleteAccount(token)) || deleted;
    }
  }

  const configs = loadConfigs();
  if (Object.prototype.hasOwnProperty.call(configs, token)) {
    delete configs[token];
    await saveConfigs(configs);
    deleted = true;
  }

  return deleted;
}

function writeConfigsStreaming(configs) {
  const tmpFile = path.join(
    DATA_DIR,
    `.configs.json.${process.pid}.` +
      `${crypto.randomBytes(6).toString("hex")}.tmp`
  );

  let fd;

  try {
    fd = fs.openSync(tmpFile, "w", 0o600);

    fs.writeSync(fd, "{");

    let first = true;

    for (
      const [token, config] of Object.entries(configs)
    ) {
      if (!first) {
        fs.writeSync(fd, ",");
      }

      first = false;

      fs.writeSync(
        fd,
        JSON.stringify(token)
      );

      fs.writeSync(fd, ":");

      fs.writeSync(
        fd,
        JSON.stringify(config)
      );
    }

    fs.writeSync(fd, "}\n");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    fs.renameSync(
      tmpFile,
      CONFIGS_FILE
    );

    // rename preserves the temporary file's mode on normal filesystems, but
    // enforce the credential-store contract explicitly for portability and
    // for pre-existing files created with a broader umask.
    fs.chmodSync(CONFIGS_FILE, 0o600);

    const stat =
      fs.statSync(CONFIGS_FILE);

    CONFIG_CACHE = configs;
    CONFIG_CACHE_MTIME = stat.mtimeMs;
    CONFIG_PERSISTED_SNAPSHOT = cloneConfig(configs);
  } catch (error) {
    if (fd !== undefined && fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (_) {}
    }

    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {}

    throw error;
  }
}

function saveConfigs(configs) {
  const previous = CONFIG_PERSISTED_SNAPSHOT || {};
  const changedTokens = [...new Set([...Object.keys(previous), ...Object.keys(configs)])]
    .filter(token => JSON.stringify(previous[token]) !== JSON.stringify(configs[token]));
  const persistStarted = process.hrtime.bigint();
  writeConfigsStreaming(configs);
  PROFILE_STORE_ADAPTER?.recordJsonPersistDuration?.(Number(process.hrtime.bigint() - persistStarted) / 1e6);
  for (const token of changedTokens) ACCOUNT_REVISIONS[token] = (ACCOUNT_REVISIONS[token] || 0) + 1;
  const revisionTmp = `${REVISIONS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(revisionTmp, JSON.stringify(ACCOUNT_REVISIONS));
  fs.renameSync(revisionTmp, REVISIONS_FILE);
  if (!PROFILE_STORE_ADAPTER?.mirrorAccounts) return Promise.resolve();
  const changes = changedTokens.map(token => ({ token, account: configs[token], revision: ACCOUNT_REVISIONS[token] }));
  if (!changes.length) return Promise.resolve();
  return PROFILE_STORE_ADAPTER.mirrorAccounts(changes).finally(() => {
    PROFILE_STORE_ADAPTER.recordMutationTotalDuration?.(Number(process.hrtime.bigint() - persistStarted) / 1e6);
  });
}

module.exports = {
  getConfigs,
  getAccount,
  getResolvedProfile,
  mutateAccount,
  saveAccount,
  deleteAccount,
  loadConfigs,
  loadConfig,
  readConfig,
  readResolvedProfile,
  hasAccount,
  createAccount,
  configureProfileStoreAdapter,
  MUTATION_REASONS,
  ownershipPolicy,
  migrationRolloutPercent,
  tokenInMigrationRollout,
  saveConfigs
};
