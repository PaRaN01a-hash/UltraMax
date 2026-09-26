"use strict";

const crypto = require("crypto");
const fs = require("fs");
const { Pool } = require("pg");

const SENSITIVE_KEY = /(password|passwordhash|secret|credential|apikey|api_key|accesskey|privatekey|authorization|cookie|refresh.?token|access.?token|trakt|simkl|anilist|mal|google.?ai|debrid|stream.?account)/i;
const PROFILES_PRESENT_KEY = "_profileStoreProfilesObjectPresent";
const DEFAULTS = Object.freeze({ percentage: 0, timeoutMs: 100, maxConcurrency: 4 });

function enabled(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function isLiveShadowStatusAuthorized(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || expected.length === 0) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && crypto.timingSafeEqual(providedBytes, expectedBytes);
}

function readDedicatedDatabaseConfig(file) {
  if (!file) return null;
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  const database = values.PROFILE_STORE_LIVE_SHADOW_DB;
  const user = values.PROFILE_STORE_LIVE_SHADOW_USER;
  const password = values.PROFILE_STORE_LIVE_SHADOW_PASSWORD;
  const port = Number(values.PROFILE_STORE_LIVE_SHADOW_HOST_PORT || 55441);
  if (!database || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw classifiedError("LIVE_SHADOW_UNAVAILABLE");
  }
  return { host: "127.0.0.1", port, database, user, password };
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function canaryBucket(token) {
  return crypto.createHash("sha256").update(String(token)).digest().readUInt32BE(0) % 10000;
}

function isLiveShadowSelected(token, percentage) {
  const bounded = Math.max(0, Math.min(100, Number(percentage) || 0));
  return canaryBucket(token) < Math.round(bounded * 100);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sourceChecksum(value) {
  return crypto.createHash("sha256").update(stableStringify(value), "utf8").digest("hex");
}

function shortFingerprint(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

// Fixed-memory linear-counting cardinality estimate. This avoids retaining
// an ever-growing set of account fingerprints during a long observation
// window while still providing an aggregate cohort estimate.
function createCardinalityEstimator(bucketCount = 16384) {
  const buckets = new Uint8Array(Math.ceil(bucketCount / 8));
  let occupied = 0;
  return {
    add(value) {
      const bucket = crypto.createHash("sha256").update(String(value)).digest().readUInt32BE(4) % bucketCount;
      const byte = bucket >> 3;
      const bit = 1 << (bucket & 7);
      if ((buckets[byte] & bit) === 0) {
        buckets[byte] |= bit;
        occupied++;
      }
    },
    estimate() {
      if (!occupied) return 0;
      if (occupied >= bucketCount) return bucketCount;
      return Math.round(-bucketCount * Math.log((bucketCount - occupied) / bucketCount));
    }
  };
}

function safeClone(value) {
  if (Array.isArray(value)) return value.map(safeClone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, safeClone(child)]));
  }
  return value;
}

function shadowComparableAccount(value) {
  const comparable = safeClone(value || {});
  if (comparable && typeof comparable === "object" && !Array.isArray(comparable)) {
    delete comparable.lastAccessed;
  }
  return comparable;
}

function shadowSourceChecksum(value) {
  return sourceChecksum(shadowComparableAccount(value));
}

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function classifiedError(code) {
  const error = new Error("LIVE Profile Store shadow comparison failed");
  error.code = code;
  return error;
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
      differences.push({ path: at, kind: "type", sensitive });
      return;
    }
    if (Array.isArray(a)) {
      if (a.length !== b.length) differences.push({ path: `${at}.length`, kind: "checksum", sensitive });
      for (let index = 0; index < Math.max(a.length, b.length); index++) walk(a[index], b[index], `${at}[]`);
      return;
    }
    if (a && typeof a === "object") {
      for (const child of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[child], b[child], `${at}.${child}`, child);
      return;
    }
    if (a !== b) differences.push({ path: at, kind: sensitive ? "secure_digest" : "checksum", sensitive });
  };
  walk(left, right, path);
  return differences;
}

function safeFieldCategory(path) {
  const match = String(path || "").match(/^\$\.([^.[\]]+)/);
  const field = match ? match[1] : "root";
  return SENSITIVE_KEY.test(field) ? "sensitive" : field.slice(0, 64);
}

function reconstruct(row, profileRows) {
  if (!isPlainRecord(row) || !isPlainRecord(row.config_json) || !isPlainRecord(row.secrets_json) || !isPlainRecord(row.metadata_json) || !Array.isArray(profileRows)) {
    throw classifiedError("LIVE_SHADOW_RECONSTRUCTION");
  }
  for (const profile of profileRows) {
    if (!isPlainRecord(profile) || typeof profile.profile_id !== "string" || !isPlainRecord(profile.overrides_json) || !isPlainRecord(profile.secrets_json) || !isPlainRecord(profile.metadata_json)) {
      throw classifiedError("LIVE_SHADOW_RECONSTRUCTION");
    }
  }

  const metadata = safeClone(row.metadata_json);
  const profilesObjectPresent = metadata[PROFILES_PRESENT_KEY] === true;
  delete metadata.unknownFields;
  delete metadata[PROFILES_PRESENT_KEY];
  const account = { ...safeClone(row.config_json), ...safeClone(row.secrets_json), ...metadata };
  if (row.password_hash !== null && row.password_hash !== undefined) account.passwordHash = row.password_hash;

  if (profileRows.length || profilesObjectPresent || Object.prototype.hasOwnProperty.call(account, "profiles")) {
    account.profiles = Object.fromEntries(profileRows.map(profile => {
      const profileMetadata = profile.metadata_json;
      const raw = {};
      if (profile.name !== null && profile.name !== undefined) raw.name = safeClone(profile.name);
      for (const key of ["createdAt", "updatedAt", "installFingerprint"]) {
        if (profileMetadata[key] !== undefined) raw[key] = safeClone(profileMetadata[key]);
      }
      for (const [key, value] of Object.entries(profile.overrides_json)) raw.overrides = { ...(raw.overrides || {}), [key]: safeClone(value) };
      for (const [key, value] of Object.entries(profile.secrets_json)) raw.overrides = { ...(raw.overrides || {}), [key]: safeClone(value) };
      raw.overrides = raw.overrides || {};
      return [profile.profile_id, raw];
    }));
  }
  return account;
}

// Equivalent to the request-path resolver, except that missing-profile
// fallback is intentionally silent so background diagnostics never log a
// user-supplied profile identifier.
function resolveForComparison(config, profileId) {
  if (!config || !profileId) return config;
  const profile = isPlainRecord(config.profiles) && isPlainRecord(config.profiles[profileId])
    ? config.profiles[profileId]
    : null;
  if (!profile) return config;
  const resolved = { ...config, ...(isPlainRecord(profile.overrides) ? profile.overrides : {}) };
  if (resolved.profileTraktToken) {
    resolved.traktAccessToken = resolved.profileTraktToken;
    resolved.traktRefreshToken = resolved.profileTraktRefreshToken || null;
    resolved.traktTokenExpiry = resolved.profileTraktTokenExpiry || null;
    resolved.traktUser = resolved.profileTraktUser || resolved.traktUser;
  }
  if (resolved.profileSimklToken) {
    resolved.simklAccessToken = resolved.profileSimklToken;
    resolved.simklUser = resolved.profileSimklUser || resolved.simklUser;
  }
  return resolved;
}

function createLiveProfileStoreShadow(options = {}) {
  const schema = options.schema ?? process.env.PROFILE_STORE_LIVE_SHADOW_SCHEMA ?? "profile_store_shadow";

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error("Invalid PROFILE_STORE_LIVE_SHADOW_SCHEMA");
  }

  const config = {
    enabled: options.enabled ?? enabled(process.env.PROFILE_STORE_LIVE_SHADOW),
    percentage: options.percentage ?? Math.max(0, Math.min(100, numberValue(process.env.PROFILE_STORE_LIVE_SHADOW_PERCENT, DEFAULTS.percentage))),
    timeoutMs: options.timeoutMs ?? numberValue(process.env.PROFILE_STORE_LIVE_SHADOW_TIMEOUT_MS, DEFAULTS.timeoutMs),
    maxConcurrency: Math.max(1, Math.floor(options.maxConcurrency ?? numberValue(process.env.PROFILE_STORE_LIVE_SHADOW_MAX_CONCURRENCY, DEFAULTS.maxConcurrency))),
    schema
  };

  const counters = {
    live_shadow_eligible_total: 0,
    live_shadow_selected_total: 0,
    live_shadow_completed_total: 0,
    live_shadow_match_total: 0,
    live_shadow_mismatch_total: 0,
    live_shadow_error_total: 0,
    live_shadow_timeout_total: 0,
    live_shadow_missing_total: 0,
    live_shadow_stale_total: 0,
    live_shadow_newer_revision_total: 0,
    live_shadow_reconstruction_error_total: 0,
    live_shadow_concurrency_skip_total: 0,
    live_shadow_structural_mismatch_total: 0,
    live_shadow_field_presence_mismatch_total: 0,
    live_shadow_type_mismatch_total: 0,
    live_shadow_checksum_mismatch_total: 0,
    live_shadow_profile_mismatch_total: 0,
    live_shadow_resolved_profile_mismatch_total: 0,
    live_shadow_revision_mismatch_total: 0,
    live_shadow_base_account_total: 0,
    live_shadow_profile_account_total: 0,
    live_shadow_profile_read_total: 0,
    live_shadow_valid_profile_read_total: 0,
    live_shadow_missing_profile_fallback_total: 0,
    live_shadow_profile_credential_promotion_total: 0,
    live_shadow_profile_collection_override_total: 0
  };
  const timings = { live_shadow_pg_read_ms: [], live_shadow_compare_ms: [], live_shadow_total_ms: [] };
  const selectedAccounts = createCardinalityEstimator();
  const profileAccounts = createCardinalityEstimator();
  let active = 0;
  let lastMismatchTimestamp = null;
  let lastErrorTimestamp = null;

  const recordTiming = (name, value) => {
    const values = timings[name];
    if (!values) return;
    values.push(Number(value.toFixed(3)));
    if (values.length > 5000) values.shift();
  };
  const percentile = values => {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return { p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)], p99: sorted[Math.floor((sorted.length - 1) * 0.99)] };
  };

  let pool = options.pool || null;
  if (!pool && config.enabled) {
    let databaseConfig = null;
    try {
      databaseConfig = process.env.PROFILE_STORE_LIVE_SHADOW_DATABASE_URL
        ? { connectionString: process.env.PROFILE_STORE_LIVE_SHADOW_DATABASE_URL }
        : readDedicatedDatabaseConfig(process.env.PROFILE_STORE_LIVE_SHADOW_ENV_FILE);
    } catch (_) {
      databaseConfig = null;
    }
    if (databaseConfig) {
      pool = new Pool({
        ...databaseConfig,
        max: config.maxConcurrency,
        connectionTimeoutMillis: config.timeoutMs,
        idleTimeoutMillis: 30000,
        statement_timeout: config.timeoutMs,
        application_name: "ultramax-live-profile-shadow",
        options: `-c search_path=${config.schema}`
      });
      pool.on("error", () => {
        lastErrorTimestamp = new Date().toISOString();
        console.warn("[live-profile-shadow] pool_error");
      });
    }
  }

  async function getAccountRecord(token) {
    if (!pool) throw classifiedError("LIVE_SHADOW_UNAVAILABLE");
    const pgStarted = process.hrtime.bigint();
    try {
      const result = await pool.query({
        text: "SELECT id,password_hash,config_json,secrets_json,metadata_json,source_checksum,source_revision FROM profile_accounts WHERE token=$1 AND deleted_at IS NULL",
        values: [token],
        statement_timeout: config.timeoutMs,
        query_timeout: config.timeoutMs
      });
      if (!result.rowCount) throw classifiedError("LIVE_SHADOW_MISSING");
      const profiles = await pool.query({
        text: "SELECT profile_id,name,overrides_json,secrets_json,metadata_json FROM profiles WHERE account_id=$1 AND deleted_at IS NULL ORDER BY profile_id",
        values: [result.rows[0].id],
        statement_timeout: config.timeoutMs,
        query_timeout: config.timeoutMs
      });
      return {
        account: reconstruct(result.rows[0], profiles.rows),
        checksum: String(result.rows[0].source_checksum || ""),
        revision: Number(result.rows[0].source_revision || 0)
      };
    } finally {
      recordTiming("live_shadow_pg_read_ms", Number(process.hrtime.bigint() - pgStarted) / 1e6);
    }
  }

  function emitMismatch(token, scope, differences) {
    const fingerprint = shortFingerprint(token);
    const summaries = new Set(differences.slice(0, 25).map(item => `${item.kind}:${safeFieldCategory(item.path)}`));
    for (const summary of summaries) console.warn("[live-profile-shadow] mismatch", `record=${fingerprint}`, `scope=${scope}`, `class=${summary}`);
  }

  async function compareSnapshot(token, jsonAccount, profileId, knownRevision) {
    const record = await getAccountRecord(token);
    const jsonChecksum = shadowSourceChecksum(jsonAccount);
    if (Number.isInteger(knownRevision) && record.revision < knownRevision) return { outcome: "stale", revisionMismatch: true };
    if (Number.isInteger(knownRevision) && record.revision > knownRevision) return { outcome: "newer", revisionMismatch: true };
    if (record.checksum !== jsonChecksum) return { outcome: "stale" };

    const compareStarted = process.hrtime.bigint();
    try {
      const compareFn = options.compareFn || compare;
      const accountDifferences = compareFn(
        shadowComparableAccount(jsonAccount),
        shadowComparableAccount(record.account)
      );
      const resolvedDifferences = profileId
        ? compareFn(
          shadowComparableAccount(resolveForComparison(jsonAccount, profileId)),
          shadowComparableAccount(resolveForComparison(record.account, profileId))
        )
        : [];
      return {
        outcome: accountDifferences.length || resolvedDifferences.length ? "mismatch" : "match",
        accountDifferences,
        resolvedDifferences
      };
    } finally {
      recordTiming("live_shadow_compare_ms", Number(process.hrtime.bigint() - compareStarted) / 1e6);
    }
  }

  function recordProfileMetrics(token, snapshot, profileId) {
    const profiles = isPlainRecord(snapshot.profiles) ? snapshot.profiles : {};
    const ids = Object.keys(profiles);
    if (ids.length) {
      counters.live_shadow_profile_account_total++;
      profileAccounts.add(token);
    } else {
      counters.live_shadow_base_account_total++;
    }
    if (!profileId) return;
    counters.live_shadow_profile_read_total++;
    const profile = profiles[profileId];
    if (!isPlainRecord(profile)) {
      counters.live_shadow_missing_profile_fallback_total++;
      return;
    }
    counters.live_shadow_valid_profile_read_total++;
    const overrides = isPlainRecord(profile.overrides) ? profile.overrides : {};
    if (overrides.profileTraktToken || overrides.profileSimklToken) counters.live_shadow_profile_credential_promotion_total++;
    if (Object.prototype.hasOwnProperty.call(overrides, "collections")) counters.live_shadow_profile_collection_override_total++;
  }

  function classifyFailure(error) {
    lastErrorTimestamp = new Date().toISOString();
    if (error?.code === "LIVE_SHADOW_TIMEOUT" || error?.code === "57014" || error?.name === "AbortError") counters.live_shadow_timeout_total++;
    else if (error?.code === "LIVE_SHADOW_MISSING") counters.live_shadow_missing_total++;
    else if (error?.code === "LIVE_SHADOW_RECONSTRUCTION") counters.live_shadow_reconstruction_error_total++;
    else counters.live_shadow_error_total++;
  }

  function observe(token, jsonAccount, profileId = null, knownRevision) {
    if (!token || !isPlainRecord(jsonAccount)) return false;
    counters.live_shadow_eligible_total++;
    if (!config.enabled || !isLiveShadowSelected(token, config.percentage)) return false;
    counters.live_shadow_selected_total++;
    selectedAccounts.add(token);
    if (active >= config.maxConcurrency) {
      counters.live_shadow_concurrency_skip_total++;
      return false;
    }

    let snapshot;
    try {
      snapshot = safeClone(jsonAccount);
    } catch (_) {
      counters.live_shadow_reconstruction_error_total++;
      return false;
    }
    recordProfileMetrics(token, snapshot, profileId);
    active++;
    const totalStarted = process.hrtime.bigint();

    setImmediate(() => {
      const operation = compareSnapshot(token, snapshot, profileId, knownRevision);
      let timeout;
      const timeoutResult = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(classifiedError("LIVE_SHADOW_TIMEOUT")), config.timeoutMs);
      });
      void Promise.race([operation, timeoutResult])
        .then(result => {
          if (result.outcome === "match") counters.live_shadow_match_total++;
          else if (result.outcome === "mismatch") {
            counters.live_shadow_mismatch_total++;
            counters.live_shadow_structural_mismatch_total++;
            lastMismatchTimestamp = new Date().toISOString();
            const accountDifferences = result.accountDifferences || [];
            const resolvedDifferences = result.resolvedDifferences || [];
            const allDifferences = [...accountDifferences, ...resolvedDifferences];
            if (allDifferences.some(item => item.kind === "field_presence")) counters.live_shadow_field_presence_mismatch_total++;
            if (allDifferences.some(item => item.kind === "type")) counters.live_shadow_type_mismatch_total++;
            if (allDifferences.some(item => item.kind === "checksum" || item.kind === "secure_digest")) counters.live_shadow_checksum_mismatch_total++;
            if (accountDifferences.some(item => item.path.startsWith("$.profiles"))) counters.live_shadow_profile_mismatch_total++;
            if (resolvedDifferences.length) counters.live_shadow_resolved_profile_mismatch_total++;
            if (accountDifferences.length) emitMismatch(token, "account", accountDifferences);
            if (resolvedDifferences.length) emitMismatch(token, "resolved_profile", resolvedDifferences);
          } else if (result.outcome === "stale") {
            counters.live_shadow_stale_total++;
            if (result.revisionMismatch) counters.live_shadow_revision_mismatch_total++;
          } else if (result.outcome === "newer") {
            counters.live_shadow_newer_revision_total++;
            if (result.revisionMismatch) counters.live_shadow_revision_mismatch_total++;
          }
        })
        .catch(classifyFailure)
        .finally(async () => {
          clearTimeout(timeout);
          await operation.catch(() => undefined);
          counters.live_shadow_completed_total++;
          recordTiming("live_shadow_total_ms", Number(process.hrtime.bigint() - totalStarted) / 1e6);
          active--;
        });
    });
    return true;
  }

  function status() {
    return {
      shadowEnabled: config.enabled,
      shadowPercentage: config.percentage,
      timeoutMs: config.timeoutMs,
      maxConcurrency: config.maxConcurrency,
      counters: { ...counters },
      uniqueSelectedAccountsApprox: selectedAccounts.estimate(),
      uniqueProfileAccountsApprox: profileAccounts.estimate(),
      pool: pool ? { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } : { total: 0, idle: 0, waiting: 0 },
      background: { active, pending: 0 },
      timings: Object.fromEntries(Object.entries(timings).map(([name, values]) => [name, percentile(values)])),
      lastMismatchTimestamp,
      lastErrorTimestamp
    };
  }

  return {
    observe,
    status,
    close: async () => { if (pool && !options.pool) await pool.end(); }
  };
}

module.exports = {
  createLiveProfileStoreShadow,
  canaryBucket,
  isLiveShadowSelected,
  isLiveShadowStatusAuthorized,
  sourceChecksum
};
