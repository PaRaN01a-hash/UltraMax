const crypto = require("crypto");
const { Pool } = require("pg");

const SENSITIVE_KEY = /(password|passwordhash|secret|credential|apikey|api_key|accesskey|privatekey|authorization|cookie|refresh.?token|access.?token|mdblistkey|tmdbkey|trakt|simkl|anilist|mal|google.?ai|debrid|stream.?account)/i;
const DEFAULTS = Object.freeze({ timeoutMs: 100, sampleRate: 1, maxConcurrent: 4, maxPending: 100 });

class ProfileStoreMirrorError extends Error {
  constructor(cause) {
    super("Profile Store mirror failed after JSON persistence", { cause });
    this.name = "ProfileStoreMirrorError";
    this.code = "PROFILE_STORE_MIRROR_FAILED";
    this.statusCode = 503;
  }
}

class ProfileStoreReadError extends Error {
  constructor(cause) {
    super("Profile Store read failed", { cause });
    this.name = "ProfileStoreReadError";
    this.code = "PROFILE_STORE_READ_FAILED";
    this.statusCode = 503;
  }
}

class ProfileStoreWriteError extends Error {
  constructor(cause) {
    super("Profile Store authoritative write failed", { cause });
    this.name = "ProfileStoreWriteError";
    this.code = "PROFILE_STORE_WRITE_FAILED";
    this.statusCode = 503;
  }
}

class ProfileStoreAccountExistsError extends Error {
  constructor() {
    super("Profile Store account already exists");
    this.name = "ProfileStoreAccountExistsError";
    this.code = "PROFILE_STORE_ACCOUNT_EXISTS";
    this.statusCode = 409;
  }
}

function enabled(value) { return /^(1|true|yes|on)$/i.test(String(value || "")); }
function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
function deadlineError() { const error = new Error("profile store dual write timeout"); error.name = "AbortError"; return error; }
function assertBeforeDeadline(deadline) { if (deadline && Date.now() >= deadline) throw deadlineError(); }
function shortFingerprint(value) { return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sourceChecksum(value) { return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex"); }
function isPlainRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function classifiedError(code, message) { const error = new Error(message); error.code = code; return error; }

function safeClone(value) {
  if (Array.isArray(value)) return value.map(safeClone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, safeClone(v)]));
  return value;
}

// This is the only diagnostic serializer used by the adapter. It redacts by
// key at every depth, while allowing callers to log an already-created token
// fingerprint because that is not the credential itself.
function redactSensitive(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(item => redactSensitive(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactSensitive(v, k)]));
  return value;
}

function safeDiagnostic(value) { return JSON.stringify(redactSensitive(value)); }

const METADATA_KEYS = new Set(["createdAt", "updatedAt", "lastAccessed", "timestamp", "preauth"]);
const PROFILES_PRESENT_KEY = "_profileStoreProfilesObjectPresent";
const PROFILE_SOURCE_SHAPE_KEY = "_profileStoreSourceShape";
function transformAccount(token, source, sourceVersion = "configs-json-v1") {
  const config = {}, secrets = {}, metadata = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (key === "profiles") continue;
    if (SENSITIVE_KEY.test(key)) secrets[key] = safeClone(value);
    else if (METADATA_KEYS.has(key)) metadata[key] = safeClone(value);
    else config[key] = safeClone(value);
  }
  metadata.unknownFields = [];
  if (source && Object.prototype.hasOwnProperty.call(source, "profiles")) {
    if (isPlainRecord(source.profiles)) metadata[PROFILES_PRESENT_KEY] = true;
    else metadata.profiles = safeClone(source.profiles);
  }
  const profileEntries = isPlainRecord(source?.profiles) ? Object.entries(source.profiles) : [];
  const profiles = profileEntries.filter(([, profile]) => profile && typeof profile === "object" && !Array.isArray(profile)).map(([profileId, profile]) => {
    const overrides = {}, profileSecrets = {};
    const rawOverrides = profile.overrides;
    if (isPlainRecord(rawOverrides)) {
      for (const [key, value] of Object.entries(rawOverrides)) (SENSITIVE_KEY.test(key) ? profileSecrets : overrides)[key] = safeClone(value);
    }
    const profileMetadata = {};
    for (const key of ["name", "createdAt", "updatedAt", "installFingerprint"]) if (Object.prototype.hasOwnProperty.call(profile, key)) profileMetadata[key] = safeClone(profile[key]);
    const extraFields = {};
    for (const [key, value] of Object.entries(profile)) {
      if (!["name", "createdAt", "updatedAt", "installFingerprint", "overrides"].includes(key)) extraFields[key] = safeClone(value);
    }
    profileMetadata[PROFILE_SOURCE_SHAPE_KEY] = {
      overridesPresent: Object.prototype.hasOwnProperty.call(profile, "overrides"),
      overridesObject: isPlainRecord(rawOverrides),
      ...(Object.prototype.hasOwnProperty.call(profile, "overrides") && !isPlainRecord(rawOverrides)
        ? { rawOverrides: safeClone(rawOverrides) }
        : {}),
      extraFields
    };
    return { profileId, name: profile.name, overrides, secrets: profileSecrets, metadata: profileMetadata, installFingerprint: profile.installFingerprint, createdAt: profile.createdAt, updatedAt: profile.updatedAt };
  });
  return { token, passwordHash: typeof secrets.passwordHash === "string" ? secrets.passwordHash : null, preauth: typeof metadata.preauth === "boolean" ? metadata.preauth : null, config, secrets, metadata, profiles, sourceChecksum: sourceChecksum(source || {}), sourceVersion };
}

function compare(left, right, path = "$") {
  const differences = [];
  const walk = (a, b, at, key = "") => {
    const sensitive = SENSITIVE_KEY.test(key);
    if (a === undefined || b === undefined) {
      if (a !== b) differences.push({ path: at, kind: "field_presence", sensitive });
      return;
    }
    if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
      differences.push({ path: at, kind: "type", sensitive }); return;
    }
    if (Array.isArray(a)) {
      if (a.length !== b.length) differences.push({ path: `${at}.length`, kind: "value", sensitive });
      for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], `${at}[${i}]`);
      return;
    }
    if (a && typeof a === "object") {
      for (const child of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[child], b[child], `${at}.${child}`, child);
      return;
    }
    if (a !== b) differences.push({ path: at, kind: sensitive ? "secure_digest" : "value", sensitive });
  };
  walk(left, right, path);
  return differences;
}

function reconstruct(row, profileRows) {
  if (!isPlainRecord(row) || !isPlainRecord(row.config_json) || !isPlainRecord(row.secrets_json) || !isPlainRecord(row.metadata_json) || !Array.isArray(profileRows)) {
    throw classifiedError("PG_READ_RECONSTRUCTION", "invalid profile account row");
  }
  for (const profile of profileRows) {
    if (!isPlainRecord(profile) || typeof profile.profile_id !== "string" || !isPlainRecord(profile.overrides_json) || !isPlainRecord(profile.secrets_json) || !isPlainRecord(profile.metadata_json)) {
      throw classifiedError("PG_READ_RECONSTRUCTION", "invalid profile row");
    }
  }
  const metadata = safeClone(row.metadata_json || {});
  const profilesObjectPresent = metadata[PROFILES_PRESENT_KEY] === true;
  delete metadata.unknownFields;
  delete metadata[PROFILES_PRESENT_KEY];
  const account = { ...safeClone(row.config_json || {}), ...safeClone(row.secrets_json || {}), ...metadata };
  if (row.password_hash !== null && row.password_hash !== undefined) account.passwordHash = row.password_hash;
  if (profileRows.length || profilesObjectPresent) {
    account.profiles = Object.fromEntries(profileRows.map(profile => {
      const metadata = profile.metadata_json || {};
      const sourceShape = isPlainRecord(metadata[PROFILE_SOURCE_SHAPE_KEY]) ? metadata[PROFILE_SOURCE_SHAPE_KEY] : null;
      const raw = sourceShape && isPlainRecord(sourceShape.extraFields) ? safeClone(sourceShape.extraFields) : {};
      for (const key of ["name", "createdAt", "updatedAt", "installFingerprint"]) {
        if (profile[key] !== null && profile[key] !== undefined) raw[key] = safeClone(profile[key]);
      }
      for (const [key, value] of Object.entries(profile.overrides_json || {})) raw.overrides = { ...(raw.overrides || {}), [key]: safeClone(value) };
      for (const [key, value] of Object.entries(profile.secrets_json || {})) raw.overrides = { ...(raw.overrides || {}), [key]: safeClone(value) };
      for (const key of Object.keys(metadata)) if (["name", "createdAt", "updatedAt", "installFingerprint"].includes(key)) raw[key] = safeClone(metadata[key]);
      if (sourceShape?.overridesPresent && sourceShape.overridesObject === false) raw.overrides = safeClone(sourceShape.rawOverrides);
      else if (sourceShape?.overridesPresent || raw.overrides) raw.overrides = raw.overrides || {};
      return [profile.profile_id, raw];
    }));
  }
  return account;
}

function createProfileStoreAdapter(options = {}) {
  const config = {
    enabled: options.enabled ?? enabled(process.env.PROFILE_STORE_ENABLED),
    shadowReads: options.shadowReads ?? enabled(process.env.PROFILE_STORE_SHADOW_READS),
    dualWrites: options.dualWrites ?? enabled(process.env.PROFILE_STORE_DUAL_WRITES),
    dualWriteStrict: options.dualWriteStrict ?? enabled(process.env.PROFILE_STORE_DUAL_WRITE_STRICT),
    pgReadTimeoutMs: options.pgReadTimeoutMs ?? numberEnv("PROFILE_STORE_PG_READ_TIMEOUT_MS", 100),
    dualWriteTimeoutMs: options.dualWriteTimeoutMs ?? numberEnv("PROFILE_STORE_DUAL_WRITE_TIMEOUT_MS", 250),
    timeoutMs: options.timeoutMs ?? numberEnv("PROFILE_STORE_TIMEOUT_MS", DEFAULTS.timeoutMs),
    poolMax: options.poolMax ?? Math.max(1, numberEnv("PROFILE_STORE_POOL_MAX", 8)),
    sampleRate: options.sampleRate ?? Math.min(1, numberEnv("PROFILE_STORE_SHADOW_SAMPLE_RATE", DEFAULTS.sampleRate)),
    maxConcurrent: options.maxConcurrent ?? numberEnv("PROFILE_STORE_SHADOW_MAX_CONCURRENT", DEFAULTS.maxConcurrent),
    maxPending: options.maxPending ?? numberEnv("PROFILE_STORE_SHADOW_MAX_PENDING", DEFAULTS.maxPending)
  };
  const counters = { shadow_reads_total: 0, shadow_matches_total: 0, shadow_mismatches_total: 0, shadow_timeouts_total: 0, shadow_db_errors_total: 0, shadow_skipped_total: 0, dual_write_attempts_total: 0, dual_write_success_total: 0, dual_write_failures_total: 0, dual_write_timeouts_total: 0, dual_write_skipped_total: 0, dual_write_reconciliations_total: 0, dual_write_stale_rejected_total: 0, dual_write_revision_conflicts_total: 0, authoritative_read_attempts_total: 0, pg_owned_reads_total: 0, legacy_reads_total: 0, legacy_json_fallback_reads_total: 0, authoritative_read_timeout_total: 0, authoritative_read_error_total: 0, authoritative_reconstruction_error_total: 0, account_exists_checks_total: 0, authoritative_write_attempts_total: 0, authoritative_write_success_total: 0, authoritative_write_failures_total: 0, authoritative_write_duplicates_total: 0, migrate_on_write_attempts_total: 0, migrate_on_write_success_total: 0, migrate_on_write_failures_total: 0, migrate_on_write_already_pg_races_total: 0, migrate_on_write_checksum_verification_failures_total: 0 };
  const migrationSkipsByReason = Object.create(null);
  const successfulMigrationTimes = [];
  const timings = { mutation_total_ms: [], json_persist_ms: [], profile_transform_ms: [], pg_mirror_ms: [], pg_read_ms: [], json_read_ms: [], json_fallback_ms: [], total_read_ms: [] };
  const recordTiming = (name, value) => { if (timings[name]) { timings[name].push(Number(value.toFixed(3))); if (timings[name].length > 1000) timings[name].shift(); } };
  const percentile = values => { if (!values.length) return null; const sorted = [...values].sort((a, b) => a - b); return { p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)], p99: sorted[Math.floor((sorted.length - 1) * 0.99)] }; };
  let active = 0;
  let pending = 0;
  let lastMismatchTimestamp = null;
  let lastDbErrorTimestamp = null;
  let lastSuccessfulMigrationTimestamp = null;
  let lastMigrationFailureTimestamp = null;
  let pool = options.pool || null;
  if (!pool && config.enabled && process.env.PROFILE_STORE_DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.PROFILE_STORE_DATABASE_URL, max: config.poolMax, connectionTimeoutMillis: config.timeoutMs, idleTimeoutMillis: 30000, statement_timeout: config.timeoutMs, application_name: "ultramax-profile-store-authoritative" });
    pool.on("error", error => { lastDbErrorTimestamp = new Date().toISOString(); console.error("[profile-store] pool error", error instanceof Error ? error.message : "unknown"); });
  }

  async function getAccountRecord(token, timeoutMs = config.timeoutMs) {
    if (!pool) throw classifiedError("PG_READ_UNAVAILABLE", "profile store unavailable");
    const result = await pool.query({ text: "SELECT * FROM profile_accounts WHERE token=$1 AND deleted_at IS NULL", values: [token], statement_timeout: timeoutMs });
    if (!result.rowCount) return undefined;
    const profiles = await pool.query({ text: "SELECT * FROM profiles WHERE account_id=$1 AND deleted_at IS NULL ORDER BY profile_id", values: [result.rows[0].id], statement_timeout: timeoutMs });
    return { account: reconstruct(result.rows[0], profiles.rows), revision: Number(result.rows[0].source_revision || 0) };
  }

  async function getAccount(token) {
    const record = await getAccountRecord(token);
    return record?.account;
  }

  async function hasAccount(token) {
    if (!pool) throw new ProfileStoreReadError(classifiedError("PG_READ_UNAVAILABLE", "profile store unavailable"));
    counters.account_exists_checks_total++;
    try {
      const result = await pool.query({
        text: "SELECT 1 FROM profile_accounts WHERE token=$1 AND deleted_at IS NULL",
        values: [token],
        statement_timeout: config.pgReadTimeoutMs
      });
      return Boolean(result.rowCount);
    } catch (error) {
      throw new ProfileStoreReadError(error);
    }
  }

  async function deleteAccount(token) {
    counters.authoritative_write_attempts_total++;
    if (!config.enabled || !pool) {
      counters.authoritative_write_failures_total++;
      throw new ProfileStoreWriteError(classifiedError("PG_WRITE_UNAVAILABLE", "profile store unavailable"));
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const existing = await client.query({
        text: "SELECT id FROM profile_accounts WHERE token=$1 AND deleted_at IS NULL FOR UPDATE",
        values: [token],
        statement_timeout: config.timeoutMs
      });

      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return false;
      }

      await client.query({
        text: "DELETE FROM profile_accounts WHERE id=$1",
        values: [existing.rows[0].id],
        statement_timeout: config.timeoutMs
      });
      await client.query("COMMIT");
      counters.authoritative_write_success_total++;
      return true;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      counters.authoritative_write_failures_total++;
      throw error?.code === "PROFILE_STORE_WRITE_FAILED" ? error : new ProfileStoreWriteError(error);
    } finally {
      client?.release();
    }
  }

  function validateMutatedAccount(account) {
    if (!isPlainRecord(account)) {
      throw classifiedError("PG_MUTATION_INVALID", "account mutation must produce an object");
    }
    try {
      return JSON.parse(JSON.stringify(account));
    } catch (_) {
      throw classifiedError("PG_MUTATION_INVALID", "account mutation must remain JSON serializable");
    }
  }

  async function mutateAccount(token, mutator) {
    counters.authoritative_write_attempts_total++;
    if (!config.enabled || !pool) {
      counters.authoritative_write_failures_total++;
      throw new ProfileStoreWriteError(classifiedError("PG_WRITE_UNAVAILABLE", "profile store unavailable"));
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const existing = await client.query({
        text: "SELECT * FROM profile_accounts WHERE token=$1 AND deleted_at IS NULL FOR UPDATE",
        values: [token],
        statement_timeout: config.timeoutMs
      });
      if (!existing.rowCount) {
        await client.query("ROLLBACK");
        return undefined;
      }

      const profileRows = await client.query({
        text: "SELECT * FROM profiles WHERE account_id=$1 AND deleted_at IS NULL ORDER BY profile_id FOR UPDATE",
        values: [existing.rows[0].id],
        statement_timeout: config.timeoutMs
      });
      const current = reconstruct(existing.rows[0], profileRows.rows);
      let next = safeClone(current);
      await mutator(next);
      next = validateMutatedAccount(next);

      const dto = transformAccount(token, next, existing.rows[0].source_version || "postgres-native-v1");
      const previousChecksum = existing.rows[0].source_checksum;
      if (dto.sourceChecksum === previousChecksum) {
        await client.query("COMMIT");
        counters.authoritative_write_success_total++;
        return {
          account: current,
          revision: Number(existing.rows[0].source_revision || 0),
          sourceChecksum: previousChecksum,
          changed: false
        };
      }

      const revision = Number(existing.rows[0].source_revision || 0) + 1;
      const accountId = existing.rows[0].id;
      await client.query({
        text: "UPDATE profile_accounts SET password_hash=$2,preauth=$3,config_json=$4::jsonb,secrets_json=$5::jsonb,metadata_json=$6::jsonb,created_at=$7,updated_at=$8,last_accessed_at=$9,source_checksum=$10,source_version=$11,source_revision=$12 WHERE id=$1",
        values: [accountId, dto.passwordHash, dto.preauth, JSON.stringify(dto.config), JSON.stringify(dto.secrets), JSON.stringify(dto.metadata), dto.metadata.createdAt || null, dto.metadata.updatedAt || null, dto.metadata.lastAccessed || null, dto.sourceChecksum, dto.sourceVersion, revision],
        statement_timeout: config.timeoutMs
      });
      for (const profile of dto.profiles) {
        await client.query({
          text: "INSERT INTO profiles (account_id,profile_id,name,overrides_json,secrets_json,metadata_json,install_fingerprint,created_at,updated_at,deleted_at) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,NULL) ON CONFLICT (account_id,profile_id) DO UPDATE SET name=EXCLUDED.name,overrides_json=EXCLUDED.overrides_json,secrets_json=EXCLUDED.secrets_json,metadata_json=EXCLUDED.metadata_json,install_fingerprint=EXCLUDED.install_fingerprint,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=NULL",
          values: [accountId, profile.profileId, JSON.stringify(profile.name ?? null), JSON.stringify(profile.overrides), JSON.stringify(profile.secrets), JSON.stringify(profile.metadata), JSON.stringify(profile.installFingerprint ?? null), profile.createdAt || null, profile.updatedAt || null],
          statement_timeout: config.timeoutMs
        });
      }
      await client.query({
        text: "UPDATE profiles SET deleted_at=now() WHERE account_id=$1 AND deleted_at IS NULL AND NOT (profile_id=ANY($2::text[]))",
        values: [accountId, dto.profiles.map(profile => profile.profileId)],
        statement_timeout: config.timeoutMs
      });
      await client.query("COMMIT");
      counters.authoritative_write_success_total++;
      return { account: safeClone(next), revision, sourceChecksum: dto.sourceChecksum, changed: true };
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      counters.authoritative_write_failures_total++;
      throw error?.code === "PROFILE_STORE_WRITE_FAILED" ? error : new ProfileStoreWriteError(error);
    } finally {
      client?.release();
    }
  }

  async function migrateLegacyAccount(token, legacySource, mutator) {
    counters.migrate_on_write_attempts_total++;
    if (!config.enabled || !pool) {
      counters.migrate_on_write_failures_total++;
      lastMigrationFailureTimestamp = new Date().toISOString();
      throw new ProfileStoreWriteError(classifiedError("PG_WRITE_UNAVAILABLE", "profile store unavailable"));
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query({
        text: "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        values: [token],
        statement_timeout: config.timeoutMs
      });
      const existing = await client.query({
        text: "SELECT 1 FROM profile_accounts WHERE token=$1 AND deleted_at IS NULL",
        values: [token],
        statement_timeout: config.timeoutMs
      });
      if (existing.rowCount) {
        counters.migrate_on_write_already_pg_races_total++;
        await client.query("ROLLBACK");
        client.release();
        client = null;
        const committed = await mutateAccount(token, mutator);
        if (!committed) throw classifiedError("PG_MIGRATION_RACE_LOST", "migrated account disappeared");
        return committed;
      }

      let intended = safeClone(legacySource);
      await mutator(intended);
      intended = validateMutatedAccount(intended);
      const dto = transformAccount(token, intended, "legacy-migrate-on-write-v1");
      const inserted = await client.query({
        text: "INSERT INTO profile_accounts (token,password_hash,preauth,config_json,secrets_json,metadata_json,created_at,updated_at,last_accessed_at,source_checksum,source_version,source_revision) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,1) RETURNING id",
        values: [token, dto.passwordHash, dto.preauth, JSON.stringify(dto.config), JSON.stringify(dto.secrets), JSON.stringify(dto.metadata), dto.metadata.createdAt || null, dto.metadata.updatedAt || null, dto.metadata.lastAccessed || null, dto.sourceChecksum, dto.sourceVersion],
        statement_timeout: config.timeoutMs
      });
      const accountId = inserted.rows[0].id;
      for (const profile of dto.profiles) {
        await client.query({
          text: "INSERT INTO profiles (account_id,profile_id,name,overrides_json,secrets_json,metadata_json,install_fingerprint,created_at,updated_at,deleted_at) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,NULL)",
          values: [accountId, profile.profileId, JSON.stringify(profile.name ?? null), JSON.stringify(profile.overrides), JSON.stringify(profile.secrets), JSON.stringify(profile.metadata), JSON.stringify(profile.installFingerprint ?? null), profile.createdAt || null, profile.updatedAt || null],
          statement_timeout: config.timeoutMs
        });
      }

      const storedAccount = await client.query({
        text: "SELECT * FROM profile_accounts WHERE id=$1 AND deleted_at IS NULL",
        values: [accountId],
        statement_timeout: config.timeoutMs
      });
      const storedProfiles = await client.query({
        text: "SELECT * FROM profiles WHERE account_id=$1 AND deleted_at IS NULL ORDER BY profile_id",
        values: [accountId],
        statement_timeout: config.timeoutMs
      });
      const reconstructed = reconstruct(storedAccount.rows[0], storedProfiles.rows);
      const reconstructedChecksum = sourceChecksum(reconstructed);
      const differences = compare(intended, reconstructed);
      if (reconstructedChecksum !== dto.sourceChecksum || differences.length) {
        counters.migrate_on_write_checksum_verification_failures_total++;
        console.warn(
          "[profile-store] migrate-on-write verification failed",
          `record=${shortFingerprint(token)}`,
          `differences=${differences.slice(0, 12).map(item => `${item.path}:${item.kind}`).join(",") || "checksum-only"}`
        );
        throw classifiedError("PG_MIGRATION_VERIFICATION", "migrated account verification failed");
      }

      await client.query("COMMIT");
      counters.migrate_on_write_success_total++;
      lastSuccessfulMigrationTimestamp = new Date().toISOString();
      successfulMigrationTimes.push(Date.now());
      while (successfulMigrationTimes.length > 10000) successfulMigrationTimes.shift();
      return { account: reconstructed, revision: 1, sourceChecksum: dto.sourceChecksum, changed: true, migrated: true };
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      counters.migrate_on_write_failures_total++;
      lastMigrationFailureTimestamp = new Date().toISOString();
      throw error?.code === "PROFILE_STORE_WRITE_FAILED" ? error : new ProfileStoreWriteError(error);
    } finally {
      client?.release();
    }
  }

  async function writeAccount(token, source, options = {}) {
    counters.authoritative_write_attempts_total++;
    if (!config.enabled || !pool) {
      counters.authoritative_write_failures_total++;
      throw new ProfileStoreWriteError(classifiedError("PG_WRITE_UNAVAILABLE", "profile store unavailable"));
    }
    const dto = transformAccount(token, source, options.sourceVersion || "postgres-native-v1");
    const revision = Number.isInteger(options.revision) ? options.revision : 1;
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const existing = await client.query({
        text: "SELECT id FROM profile_accounts WHERE token=$1 FOR UPDATE",
        values: [token],
        statement_timeout: config.timeoutMs
      });
      if (existing.rowCount && options.createOnly) throw new ProfileStoreAccountExistsError();

      let accountId;
      if (!existing.rowCount) {
        const inserted = await client.query({
          text: "INSERT INTO profile_accounts (token,password_hash,preauth,config_json,secrets_json,metadata_json,created_at,updated_at,last_accessed_at,source_checksum,source_version,source_revision) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12) RETURNING id",
          values: [token, dto.passwordHash, dto.preauth, JSON.stringify(dto.config), JSON.stringify(dto.secrets), JSON.stringify(dto.metadata), dto.metadata.createdAt || null, dto.metadata.updatedAt || null, dto.metadata.lastAccessed || null, dto.sourceChecksum, dto.sourceVersion, revision],
          statement_timeout: config.timeoutMs
        });
        accountId = inserted.rows[0].id;
      } else {
        accountId = existing.rows[0].id;
        await client.query({
          text: "UPDATE profile_accounts SET password_hash=$2,preauth=$3,config_json=$4::jsonb,secrets_json=$5::jsonb,metadata_json=$6::jsonb,created_at=$7,updated_at=$8,last_accessed_at=$9,source_checksum=$10,source_version=$11,source_revision=$12,deleted_at=NULL WHERE id=$1",
          values: [accountId, dto.passwordHash, dto.preauth, JSON.stringify(dto.config), JSON.stringify(dto.secrets), JSON.stringify(dto.metadata), dto.metadata.createdAt || null, dto.metadata.updatedAt || null, dto.metadata.lastAccessed || null, dto.sourceChecksum, dto.sourceVersion, revision],
          statement_timeout: config.timeoutMs
        });
      }

      for (const profile of dto.profiles) {
        await client.query({
          text: "INSERT INTO profiles (account_id,profile_id,name,overrides_json,secrets_json,metadata_json,install_fingerprint,created_at,updated_at,deleted_at) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,NULL) ON CONFLICT (account_id,profile_id) DO UPDATE SET name=EXCLUDED.name,overrides_json=EXCLUDED.overrides_json,secrets_json=EXCLUDED.secrets_json,metadata_json=EXCLUDED.metadata_json,install_fingerprint=EXCLUDED.install_fingerprint,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=NULL",
          values: [accountId, profile.profileId, JSON.stringify(profile.name ?? null), JSON.stringify(profile.overrides), JSON.stringify(profile.secrets), JSON.stringify(profile.metadata), JSON.stringify(profile.installFingerprint ?? null), profile.createdAt || null, profile.updatedAt || null],
          statement_timeout: config.timeoutMs
        });
      }
      await client.query({
        text: "UPDATE profiles SET deleted_at=now() WHERE account_id=$1 AND deleted_at IS NULL AND NOT (profile_id=ANY($2::text[]))",
        values: [accountId, dto.profiles.map(profile => profile.profileId)],
        statement_timeout: config.timeoutMs
      });
      await client.query("COMMIT");
      counters.authoritative_write_success_total++;
      return { account: safeClone(source), sourceChecksum: dto.sourceChecksum };
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      if (error?.code === "PROFILE_STORE_ACCOUNT_EXISTS" || error?.code === "23505") {
        counters.authoritative_write_duplicates_total++;
        throw error?.code === "PROFILE_STORE_ACCOUNT_EXISTS" ? error : new ProfileStoreAccountExistsError();
      }
      counters.authoritative_write_failures_total++;
      throw error?.code === "PROFILE_STORE_WRITE_FAILED" ? error : new ProfileStoreWriteError(error);
    } finally {
      client?.release();
    }
  }

  async function mirrorAccount(token, source, revision = 0, deadline = 0) {
    counters.dual_write_attempts_total++;
    if (!pool || !config.dualWrites) { counters.dual_write_skipped_total++; return; }
    const transformStarted = process.hrtime.bigint();
    const dto = source ? transformAccount(token, source) : null;
    recordTiming("profile_transform_ms", Number(process.hrtime.bigint() - transformStarted) / 1e6);
    let client;
    try {
      client = await pool.connect();
      assertBeforeDeadline(deadline);
      await client.query("BEGIN");
      const old = await client.query({ text: "SELECT id, source_checksum, source_revision FROM profile_accounts WHERE token=$1 FOR UPDATE", values: [token], statement_timeout: config.dualWriteTimeoutMs });
      assertBeforeDeadline(deadline);
      if (old.rowCount && Number(old.rows[0].source_revision || 0) > Number(revision || 0)) {
        counters.dual_write_stale_rejected_total++;
        counters.dual_write_revision_conflicts_total++;
        await client.query("ROLLBACK");
        return;
      }
      if (!dto) {
        if (old.rowCount) await client.query({ text: "UPDATE profile_accounts SET deleted_at=now() WHERE id=$1", values: [old.rows[0].id], statement_timeout: config.dualWriteTimeoutMs });
      } else if (!old.rowCount) {
        const inserted = await client.query({ text: "INSERT INTO profile_accounts (token,password_hash,preauth,config_json,secrets_json,metadata_json,created_at,updated_at,last_accessed_at,source_checksum,source_version,source_revision) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12) RETURNING id", values: [token, dto.passwordHash, dto.preauth, JSON.stringify(dto.config), JSON.stringify(dto.secrets), JSON.stringify(dto.metadata), dto.metadata.createdAt || null, dto.metadata.updatedAt || null, dto.metadata.lastAccessed || null, dto.sourceChecksum, dto.sourceVersion, revision], statement_timeout: config.dualWriteTimeoutMs });
        old.rows.push({ id: inserted.rows[0].id });
      } else {
        await client.query({ text: "UPDATE profile_accounts SET password_hash=$2,preauth=$3,config_json=$4::jsonb,secrets_json=$5::jsonb,metadata_json=$6::jsonb,created_at=$7,updated_at=$8,last_accessed_at=$9,source_checksum=$10,source_version=$11,source_revision=$12,deleted_at=NULL WHERE id=$1 AND source_revision <= $12", values: [old.rows[0].id, dto.passwordHash, dto.preauth, JSON.stringify(dto.config), JSON.stringify(dto.secrets), JSON.stringify(dto.metadata), dto.metadata.createdAt || null, dto.metadata.updatedAt || null, dto.metadata.lastAccessed || null, dto.sourceChecksum, dto.sourceVersion, revision], statement_timeout: config.dualWriteTimeoutMs });
      }
      if (dto) {
        const accountId = old.rows[0].id;
        for (const profile of dto.profiles) {
          await client.query({ text: "INSERT INTO profiles (account_id,profile_id,name,overrides_json,secrets_json,metadata_json,install_fingerprint,created_at,updated_at,deleted_at) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,NULL) ON CONFLICT (account_id,profile_id) DO UPDATE SET name=EXCLUDED.name,overrides_json=EXCLUDED.overrides_json,secrets_json=EXCLUDED.secrets_json,metadata_json=EXCLUDED.metadata_json,install_fingerprint=EXCLUDED.install_fingerprint,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,deleted_at=NULL", values: [accountId, profile.profileId, JSON.stringify(profile.name ?? null), JSON.stringify(profile.overrides), JSON.stringify(profile.secrets), JSON.stringify(profile.metadata), JSON.stringify(profile.installFingerprint ?? null), profile.createdAt || null, profile.updatedAt || null], statement_timeout: config.dualWriteTimeoutMs });
        }
        await client.query({ text: "UPDATE profiles SET deleted_at=now() WHERE account_id=$1 AND deleted_at IS NULL AND NOT (profile_id=ANY($2::text[]))", values: [accountId, dto.profiles.map(profile => profile.profileId)], statement_timeout: config.dualWriteTimeoutMs });
      }
      assertBeforeDeadline(deadline);
      await client.query("COMMIT");
      counters.dual_write_success_total++;
      recordTiming("pg_mirror_ms", Number(process.hrtime.bigint() - transformStarted) / 1e6);
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client?.release(); }
  }

  async function mirrorAccounts(changes) {
    if (!config.dualWrites) { counters.dual_write_skipped_total++; return; }
    for (const change of changes) {
      let timeout;
      const deadline = Date.now() + config.dualWriteTimeoutMs;
      try {
        await Promise.race([
          mirrorAccount(change.token, change.account, change.revision, deadline),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(deadlineError()), config.dualWriteTimeoutMs); })
        ]);
      }
      catch (error) {
        if (error && (error.code === "57014" || error.name === "AbortError")) counters.dual_write_timeouts_total++;
        else counters.dual_write_failures_total++;
        console.warn("[profile-store] dual write failed", error && error.name === "AbortError" ? "timeout" : "database error");
        if (config.dualWriteStrict) throw new ProfileStoreMirrorError(error);
      }
      finally { clearTimeout(timeout); }
    }
  }

  function recordJsonPersistDuration(durationMs) { recordTiming("json_persist_ms", durationMs); }
  function recordMutationTotalDuration(durationMs) { recordTiming("mutation_total_ms", durationMs); }

  function emitMismatch(token, scope, differences) {
    for (const difference of differences.slice(0, 25)) console.warn("profile_store_shadow_mismatch", `record=${shortFingerprint(token)}`, `scope=${scope}`, `class=${difference.kind}`, `field=${difference.path}`);
  }
  async function compareAccount(jsonAccount, token, profileId) {
    counters.shadow_reads_total++;
    if (!pool) { counters.shadow_db_errors_total++; lastDbErrorTimestamp = new Date().toISOString(); return; }
    try {
      const stored = await getAccount(token);
      if (!stored) { counters.shadow_mismatches_total++; emitMismatch(token, profileId ? "resolved_profile" : "account", [{ kind: "field_presence", path: "$" }]); return; }
      const differences = compare(jsonAccount, stored);
      if (profileId) {
        const local = require("./profiles").resolveConfigForProfile(jsonAccount, profileId);
        const storedResolved = require("./profiles").resolveConfigForProfile(stored, profileId);
        differences.push(...compare(local, storedResolved).map(item => ({ ...item, path: item.path })));
      }
      if (!differences.length) counters.shadow_matches_total++;
      else { counters.shadow_mismatches_total++; lastMismatchTimestamp = new Date().toISOString(); emitMismatch(token, profileId ? "resolved_profile" : "account", differences); }
    } catch (error) {
      if (error && (error.code === "57014" || error.name === "AbortError")) counters.shadow_timeouts_total++;
      else counters.shadow_db_errors_total++;
      lastDbErrorTimestamp = new Date().toISOString();
      console.warn("[profile-store] shadow lookup failed", error instanceof Error ? error.message : "unknown");
    }
  }
  function compareKnownAccount(jsonAccount, stored, token, profileId) {
    counters.shadow_reads_total++;
    const differences = compare(jsonAccount, stored);
    if (profileId) {
      const resolve = require("./profiles").resolveConfigForProfile;
      differences.push(...compare(resolve(jsonAccount, profileId), resolve(stored, profileId)));
    }
    if (!differences.length) counters.shadow_matches_total++;
    else {
      counters.shadow_mismatches_total++;
      lastMismatchTimestamp = new Date().toISOString();
      emitMismatch(token, profileId ? "resolved_profile" : "account", differences);
    }
  }
  function enqueue(run) {
    if (active >= config.maxConcurrent || pending >= config.maxPending) { counters.shadow_skipped_total++; return false; }
    pending++;
    void (async () => {
      pending--;
      active++;
      try { await run(); }
      catch (_) { counters.shadow_timeouts_total++; }
      finally { active--; }
    })();
    return true;
  }
  function schedule(jsonAccount, token, profileId) {
    if (!config.enabled || !config.shadowReads || Math.random() > config.sampleRate) { counters.shadow_skipped_total++; return; }
    // Callers may mutate the cached JSON object immediately after a read
    // (notably lastAccessed). Compare the exact read snapshot, not a later
    // in-memory mutation that may still be waiting to persist and mirror.
    const jsonSnapshot = safeClone(jsonAccount);
    enqueue(async () => {
      let timeout;
      try {
        await Promise.race([compareAccount(jsonSnapshot, token, profileId), new Promise((_, reject) => { timeout = setTimeout(() => { const error = new Error("profile store shadow timeout"); error.name = "AbortError"; reject(error); }, config.timeoutMs); })]);
      } finally { clearTimeout(timeout); }
    });
  }
  async function readAccount(token, options = {}) {
    const totalStarted = process.hrtime.bigint();
    let jsonLoaded = Object.prototype.hasOwnProperty.call(options, "jsonAccount");
    let jsonAccount = options.jsonAccount;
    let jsonReadMs = Number(options.jsonReadMs || 0);
    const loadJson = () => {
      if (jsonLoaded) return jsonAccount;
      const started = process.hrtime.bigint();
      jsonAccount = options.jsonLoader();
      jsonReadMs = Number(process.hrtime.bigint() - started) / 1e6;
      jsonLoaded = true;
      recordTiming("json_read_ms", jsonReadMs);
      return jsonAccount;
    };

    const serveJson = (isFallback = false) => {
      const fallbackStarted = process.hrtime.bigint();
      const account = loadJson();
      if (isFallback) {
        counters.legacy_reads_total++;
        counters.legacy_json_fallback_reads_total++;
        recordTiming("json_fallback_ms", Number(process.hrtime.bigint() - fallbackStarted) / 1e6);
      }
      recordTiming("total_read_ms", Number(process.hrtime.bigint() - totalStarted) / 1e6);
      // Route code historically mutates the object it reads while preparing
      // a save. Under migrate-on-write that preparation must never mutate the
      // cached legacy owner before the PG transaction commits.
      return safeClone(account);
    };

    if (!config.enabled) return serveJson(false);

    counters.authoritative_read_attempts_total++;
    const pgStarted = process.hrtime.bigint();
    let timeout;
    try {
      if (!pool) throw classifiedError("PG_READ_UNAVAILABLE", "profile store unavailable");
      const record = await Promise.race([
        getAccountRecord(token, config.pgReadTimeoutMs),
        new Promise((_, reject) => { timeout = setTimeout(() => { const error = classifiedError("PG_READ_TIMEOUT", "profile store read timeout"); error.name = "AbortError"; reject(error); }, config.pgReadTimeoutMs); })
      ]);
      if (!record) {
        recordTiming("pg_read_ms", Number(process.hrtime.bigint() - pgStarted) / 1e6);
        return serveJson(true);
      }
      counters.pg_owned_reads_total++;
      recordTiming("pg_read_ms", Number(process.hrtime.bigint() - pgStarted) / 1e6);
      recordTiming("total_read_ms", Number(process.hrtime.bigint() - totalStarted) / 1e6);
      return record.account;
    } catch (error) {
      const timedOut = error && (error.code === "57014" || error.code === "PG_READ_TIMEOUT" || error.name === "AbortError");
      if (timedOut) counters.authoritative_read_timeout_total++;
      else if (error?.code === "PG_READ_RECONSTRUCTION") counters.authoritative_reconstruction_error_total++;
      else counters.authoritative_read_error_total++;
      lastDbErrorTimestamp = new Date().toISOString();
      recordTiming("pg_read_ms", Number(process.hrtime.bigint() - pgStarted) / 1e6);
      throw new ProfileStoreReadError(error);
    } finally { clearTimeout(timeout); }
  }
  function percentage(numerator, denominator) {
    return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : 0;
  }

  async function accountStats() {
    if (!pool) throw new ProfileStoreReadError(classifiedError("PG_READ_UNAVAILABLE", "profile store unavailable"));
    try {
      const result = await pool.query({
        text: `SELECT
          count(*)::int AS total_installs,
          count(*) FILTER (WHERE COALESCE(last_accessed_at, updated_at, created_at) > now() - interval '1 day')::int AS active_24_hours,
          count(*) FILTER (WHERE COALESCE(last_accessed_at, updated_at, created_at) > now() - interval '7 days')::int AS active_7_days,
          count(*) FILTER (WHERE COALESCE(last_accessed_at, updated_at, created_at) > now() - interval '30 days')::int AS active_30_days,
          count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS new_today,
          count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_7_days,
          count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new_30_days
        FROM profile_accounts
        WHERE deleted_at IS NULL`,
        values: [],
        statement_timeout: Math.max(config.timeoutMs, 500)
      });
      const row = result.rows[0] || {};
      return {
        totalInstalls: Number(row.total_installs || 0),
        active24Hours: Number(row.active_24_hours || 0),
        active7Days: Number(row.active_7_days || 0),
        active30Days: Number(row.active_30_days || 0),
        newToday: Number(row.new_today || 0),
        new7Days: Number(row.new_7_days || 0),
        new30Days: Number(row.new_30_days || 0)
      };
    } catch (error) {
      lastDbErrorTimestamp = new Date().toISOString();
      throw new ProfileStoreReadError(error);
    }
  }

  let catalogPopularityCache = { expiresAt: 0, limit: 0, rows: [] };
  let catalogPopularityRefresh = null;

  async function catalogPopularity(limit = 10) {
    if (!pool) throw new ProfileStoreReadError(classifiedError("PG_READ_UNAVAILABLE", "profile store unavailable"));
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    if (catalogPopularityCache.limit === safeLimit && catalogPopularityCache.expiresAt > Date.now()) {
      return safeClone(catalogPopularityCache.rows);
    }
    if (catalogPopularityRefresh) return safeClone(await catalogPopularityRefresh);

    catalogPopularityRefresh = (async () => {
      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await client.query("SET LOCAL statement_timeout = '2000ms'");
        const result = await client.query({
          text: `SELECT catalog_id AS id, count(*)::int AS count
            FROM profile_accounts
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(config_json->'catalogs') = 'array' THEN config_json->'catalogs' ELSE '[]'::jsonb END
            ) AS catalog_id
            WHERE deleted_at IS NULL
            GROUP BY catalog_id
            ORDER BY count(*) DESC, catalog_id ASC
            LIMIT $1`,
          values: [safeLimit]
        });
        await client.query("COMMIT");
        const rows = result.rows.map(row => ({ id: String(row.id), count: Number(row.count || 0) }));
        catalogPopularityCache = { expiresAt: Date.now() + 10 * 60 * 1000, limit: safeLimit, rows };
        return rows;
      } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => undefined);
        lastDbErrorTimestamp = new Date().toISOString();
        throw new ProfileStoreReadError(error);
      } finally {
        client?.release();
        catalogPopularityRefresh = null;
      }
    })();

    return safeClone(await catalogPopularityRefresh);
  }

  async function status(options = {}) {
    let dbReachable = false;
    let inventory = { available: false };
    const legacyTokens = [...new Set((options.legacyTokens || []).filter(token => typeof token === "string"))];
    if (pool) {
      try {
        const totals = await pool.query({
          text: "SELECT count(*)::int AS active_pg_accounts, count(*) FILTER (WHERE source_version='postgres-native-v1')::int AS pg_native_accounts, count(*) FILTER (WHERE source_version='legacy-migrate-on-write-v1')::int AS migrate_on_write_accounts, count(*) FILTER (WHERE source_version NOT IN ('postgres-native-v1','legacy-migrate-on-write-v1'))::int AS other_origin_accounts FROM profile_accounts WHERE deleted_at IS NULL",
          values: [],
          statement_timeout: config.timeoutMs
        });
        const profileTotals = await pool.query({
          text: "SELECT count(*)::int AS active_pg_profiles FROM profiles WHERE deleted_at IS NULL",
          values: [],
          statement_timeout: config.timeoutMs
        });
        const overlapResult = legacyTokens.length
          ? await pool.query({
              text: "SELECT count(*)::int AS overlap FROM profile_accounts WHERE deleted_at IS NULL AND token=ANY($1::text[])",
              values: [legacyTokens],
              statement_timeout: config.timeoutMs
            })
          : { rows: [{ overlap: 0 }] };
        const activePgAccounts = Number(totals.rows[0].active_pg_accounts || 0);
        const overlap = Number(overlapResult.rows[0].overlap || 0);
        const legacyOnly = Math.max(0, legacyTokens.length - overlap);
        const knownAccounts = activePgAccounts + legacyOnly;
        inventory = {
          available: true,
          activePgAccounts,
          activePgProfiles: Number(profileTotals.rows[0].active_pg_profiles || 0),
          pgNativeAccounts: Number(totals.rows[0].pg_native_accounts || 0),
          migrateOnWriteAccounts: Number(totals.rows[0].migrate_on_write_accounts || 0),
          otherOriginAccounts: Number(totals.rows[0].other_origin_accounts || 0),
          activeLegacyEntries: legacyTokens.length,
          legacyOnlyAccounts: legacyOnly,
          accountsInBothPgAndLegacy: overlap,
          knownAccounts,
          pgOwnedPercentage: percentage(activePgAccounts, knownAccounts),
          legacyOnlyPercentage: percentage(legacyOnly, knownAccounts)
        };
        dbReachable = true;
      } catch (_) {
        lastDbErrorTimestamp = new Date().toISOString();
      }
    }
    const servedReads = counters.pg_owned_reads_total + counters.legacy_reads_total;
    const traffic = {
      window: "current-process-lifetime",
      servedReads,
      pgOwnedReads: counters.pg_owned_reads_total,
      legacyReads: counters.legacy_reads_total,
      pgOwnedReadPercentage: percentage(counters.pg_owned_reads_total, servedReads),
      legacyReadPercentage: percentage(counters.legacy_reads_total, servedReads)
    };
    const failures = {
      authoritativePgReadFailures: counters.authoritative_read_timeout_total + counters.authoritative_read_error_total + counters.authoritative_reconstruction_error_total,
      authoritativePgWriteFailures: counters.authoritative_write_failures_total,
      migrationFailures: counters.migrate_on_write_failures_total,
      checksumShapeVerificationFailures: counters.migrate_on_write_checksum_verification_failures_total
    };
    const now = Date.now();
    const recentMigrationRate = {
      window: "current-process-lifetime",
      lastMinute: successfulMigrationTimes.filter(value => now - value <= 60000).length,
      lastFiveMinutes: successfulMigrationTimes.filter(value => now - value <= 300000).length,
      lastFifteenMinutes: successfulMigrationTimes.filter(value => now - value <= 900000).length
    };
    return { enabled: config.enabled, ownershipMode: config.enabled ? "postgres-existence-first" : "legacy-json-only", migrationPolicy: options.migrationPolicy || null, shadowReads: config.shadowReads, dualWrites: config.dualWrites, dualWriteStrict: config.dualWriteStrict, dbReachable, inventory, traffic, failures, migrationSkips: { total: Object.values(migrationSkipsByReason).reduce((sum, value) => sum + value, 0), lastAccessedSuppressions: migrationSkipsByReason["housekeeping-last-accessed"] || 0, byReason: { ...migrationSkipsByReason } }, recentMigrationRate, lastSuccessfulMigrationTimestamp, lastMigrationFailureTimestamp, poolStatus: pool ? { configuredMax: config.poolMax, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, active, pending } : { configuredMax: config.poolMax, total: 0, idle: 0, waiting: 0, active, pending }, counters: { ...counters }, timings: Object.fromEntries(Object.entries(timings).map(([name, values]) => [name, percentile(values)])), lastMismatchTimestamp, lastDbErrorTimestamp };
  }
  function recordLegacyRead() { counters.legacy_reads_total++; }
  function recordMigrationSkipped(reason) { migrationSkipsByReason[reason] = (migrationSkipsByReason[reason] || 0) + 1; }
  return { hasAccount, getAccount, writeAccount, mutateAccount, deleteAccount, migrateLegacyAccount, recordLegacyRead, recordMigrationSkipped, createAccount: (token, source) => writeAccount(token, source, { createOnly: true }), getResolvedConfig: async (token, profileId) => { const account = await getAccount(token); return account ? require("./profiles").resolveConfigForProfile(account, profileId) : undefined; }, readAccount, accountStats, catalogPopularity, shadowCompareAccount: compareAccount, shadowCompareResolvedProfile: compareAccount, mirrorAccount, mirrorAccounts, recordJsonPersistDuration, recordMutationTotalDuration, schedule, status, close: async () => { if (pool && !options.pool) await pool.end(); }, diagnostics: { redactSensitive, safeDiagnostic } };
}

module.exports = {
  createProfileStoreAdapter,
  redactSensitive,
  safeDiagnostic,
  ProfileStoreMirrorError,
  ProfileStoreReadError,
  ProfileStoreWriteError,
  ProfileStoreAccountExistsError,
  _test: {
    transformAccount,
    reconstruct
  }
};
