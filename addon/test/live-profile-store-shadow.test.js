"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createLiveProfileStoreShadow,
  canaryBucket,
  isLiveShadowSelected,
  isLiveShadowStatusAuthorized,
  sourceChecksum
} = require("../utils/live-profile-store-shadow");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForIdle(observer, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (observer.status().background.active && Date.now() < deadline) await wait(5);
  assert.equal(observer.status().background.active, 0);
}

function jsonAccount() {
  return {
    catalogs: ["base"],
    collections: [{ id: "base-collection" }],
    traktAccessToken: "base-trakt-fixture",
    passwordHash: "password-fixture",
    createdAt: "2026-01-01T00:00:00.000Z",
    profiles: {
      mobile: {
        name: "Mobile",
        createdAt: "2026-01-02T00:00:00.000Z",
        overrides: {
          catalogs: ["profile"],
          collections: [{ id: "profile-collection" }],
          profileTraktToken: "profile-trakt-fixture",
          profileSimklToken: "profile-simkl-fixture"
        }
      }
    }
  };
}

function accountRow(json = jsonAccount(), overrides = {}) {
  return {
    id: 41,
    password_hash: json.passwordHash ?? null,
    config_json: {
      catalogs: json.catalogs,
      collections: json.collections
    },
    secrets_json: {
      ...(json.traktAccessToken ? { traktAccessToken: json.traktAccessToken } : {})
    },
    metadata_json: {
      ...(json.createdAt ? { createdAt: json.createdAt } : {}),
      ...(json.profiles ? { _profileStoreProfilesObjectPresent: true } : {}),
      unknownFields: []
    },
    source_checksum: sourceChecksum(json),
    source_revision: 0,
    ...overrides
  };
}

function profileRows() {
  return [{
    profile_id: "mobile",
    name: "Mobile",
    overrides_json: {
      catalogs: ["profile"],
      collections: [{ id: "profile-collection" }]
    },
    secrets_json: {
      profileTraktToken: "profile-trakt-fixture",
      profileSimklToken: "profile-simkl-fixture"
    },
    metadata_json: { name: "Mobile", createdAt: "2026-01-02T00:00:00.000Z" }
  }];
}

function poolFixture({ row = accountRow(), profiles = profileRows(), delayMs = 0, error = null } = {}) {
  return {
    totalCount: 1,
    idleCount: 1,
    waitingCount: 0,
    async query(query) {
      if (delayMs) await wait(delayMs);
      if (error) throw error;
      if (String(query.text).includes("FROM profile_accounts")) {
        return row ? { rowCount: 1, rows: [row] } : { rowCount: 0, rows: [] };
      }
      return { rowCount: profiles.length, rows: profiles };
    }
  };
}

test("decimal deterministic cohorts are stable and monotonic", () => {
  for (let index = 0; index < 5000; index++) {
    const token = `fixture-${index}`;
    assert.equal(canaryBucket(token), canaryBucket(token));
    if (isLiveShadowSelected(token, 0.5)) assert.equal(isLiveShadowSelected(token, 1), true);
    assert.equal(isLiveShadowSelected(token, 0), false);
    assert.equal(isLiveShadowSelected(token, 100), true);
  }
});

test("status authentication fails closed when either secret is absent", () => {
  assert.equal(isLiveShadowStatusAuthorized(undefined, undefined), false);
  assert.equal(isLiveShadowStatusAuthorized("", ""), false);
  assert.equal(isLiveShadowStatusAuthorized("admin", undefined), false);
  assert.equal(isLiveShadowStatusAuthorized(undefined, "admin"), false);
  assert.equal(isLiveShadowStatusAuthorized("wrong", "admin"), false);
  assert.equal(isLiveShadowStatusAuthorized("admin", "admin"), true);
});

test("disabled shadow mode performs no PostgreSQL work", async () => {
  let queries = 0;
  const pool = poolFixture();
  const query = pool.query.bind(pool);
  pool.query = async request => { queries++; return query(request); };
  const observer = createLiveProfileStoreShadow({ enabled: false, percentage: 100, pool });
  assert.equal(observer.observe("fixture", jsonAccount()), false);
  await wait(10);
  assert.equal(queries, 0);
  assert.equal(observer.status().counters.live_shadow_selected_total, 0);
});

test("enabled mode with no database configuration fails only in background", async () => {
  const oldUrl = process.env.PROFILE_STORE_LIVE_SHADOW_DATABASE_URL;
  const oldFile = process.env.PROFILE_STORE_LIVE_SHADOW_ENV_FILE;
  delete process.env.PROFILE_STORE_LIVE_SHADOW_DATABASE_URL;
  delete process.env.PROFILE_STORE_LIVE_SHADOW_ENV_FILE;
  try {
    const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100 });
    assert.equal(observer.observe("fixture", jsonAccount()), true);
    await waitForIdle(observer);
    assert.equal(observer.status().counters.live_shadow_error_total, 1);
  } finally {
    if (oldUrl === undefined) delete process.env.PROFILE_STORE_LIVE_SHADOW_DATABASE_URL; else process.env.PROFILE_STORE_LIVE_SHADOW_DATABASE_URL = oldUrl;
    if (oldFile === undefined) delete process.env.PROFILE_STORE_LIVE_SHADOW_ENV_FILE; else process.env.PROFILE_STORE_LIVE_SHADOW_ENV_FILE = oldFile;
  }
});

test("shadow comparison is background-only and covers real profile semantics", async () => {
  const json = jsonAccount();
  const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100, pool: poolFixture({ delayMs: 10 }) });
  const started = process.hrtime.bigint();
  assert.equal(observer.observe("raw-account-token", json, "mobile"), true);
  const returnedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(returnedMs < 10, `observe returned in ${returnedMs}ms`);
  await waitForIdle(observer);
  const status = observer.status();
  assert.equal(status.counters.live_shadow_completed_total, 1);
  assert.equal(status.counters.live_shadow_match_total, 1);
  assert.equal(status.counters.live_shadow_mismatch_total, 0);
  assert.equal(status.counters.live_shadow_profile_account_total, 1);
  assert.equal(status.counters.live_shadow_profile_read_total, 1);
  assert.equal(status.counters.live_shadow_valid_profile_read_total, 1);
  assert.equal(status.counters.live_shadow_profile_credential_promotion_total, 1);
  assert.equal(status.counters.live_shadow_profile_collection_override_total, 1);
});

test("missing-profile fallback is observed without affecting the caller", async () => {
  const json = jsonAccount();
  const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100, pool: poolFixture() });
  assert.equal(observer.observe("fixture", json, "missing-profile"), true);
  await waitForIdle(observer);
  const status = observer.status();
  assert.equal(status.counters.live_shadow_match_total, 1);
  assert.equal(status.counters.live_shadow_missing_profile_fallback_total, 1);
});

test("PG failures never alter the synchronous JSON read boundary", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "live-shadow-config-store-"));
  const json = { fixture: { marker: "json-authority" } };
  fs.writeFileSync(path.join(temp, "configs.json"), JSON.stringify(json));
  const oldDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = temp;
  const modulePath = require.resolve("../utils/config-store");
  delete require.cache[modulePath];
  const store = require("../utils/config-store");
  store.configureLiveProfileStoreShadow({ observe() { throw new Error("database raw-secret"); } });
  const returned = await store.readConfig("fixture");
  assert.strictEqual(returned, store.loadConfigs().fixture);
  assert.equal(returned.marker, "json-authority");
  if (oldDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDataDir;
  delete require.cache[modulePath];
});

test("failure classes stay background-only and bounded", async t => {
  const json = jsonAccount();
  const cases = [
    ["unavailable", { pool: poolFixture({ error: new Error("database raw-secret") }) }, "live_shadow_error_total"],
    ["timeout", { pool: poolFixture({ delayMs: 30 }), timeoutMs: 5 }, "live_shadow_timeout_total"],
    ["missing", { pool: poolFixture({ row: null, profiles: [] }) }, "live_shadow_missing_total"],
    ["malformed", { pool: poolFixture({ row: accountRow(json, { config_json: "bad-row" }) }) }, "live_shadow_reconstruction_error_total"],
    ["comparison", { pool: poolFixture(), compareFn() { throw new Error("compare raw-secret"); } }, "live_shadow_error_total"]
  ];
  for (const [name, options, counter] of cases) await t.test(name, async () => {
    const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100, ...options });
    assert.equal(observer.observe("raw-account-token", json), true);
    await waitForIdle(observer);
    const statusText = JSON.stringify(observer.status());
    assert.equal(observer.status().counters[counter], 1);
    assert.equal(statusText.includes("raw-account-token"), false);
    assert.equal(statusText.includes("raw-secret"), false);
  });
});

test("stale and revision relationships are classified separately", async () => {
  const json = jsonAccount();
  const staleChecksum = createLiveProfileStoreShadow({ enabled: true, percentage: 100, pool: poolFixture({ row: accountRow(json, { source_checksum: "older" }) }) });
  staleChecksum.observe("fixture-a", json);
  const staleRevision = createLiveProfileStoreShadow({ enabled: true, percentage: 100, pool: poolFixture({ row: accountRow(json, { source_revision: 2 }) }) });
  staleRevision.observe("fixture-b", json, null, 3);
  const newerRevision = createLiveProfileStoreShadow({ enabled: true, percentage: 100, pool: poolFixture({ row: accountRow(json, { source_revision: 4 }) }) });
  newerRevision.observe("fixture-c", json, null, 3);
  await Promise.all([waitForIdle(staleChecksum), waitForIdle(staleRevision), waitForIdle(newerRevision)]);
  assert.equal(staleChecksum.status().counters.live_shadow_stale_total, 1);
  assert.equal(staleRevision.status().counters.live_shadow_stale_total, 1);
  assert.equal(newerRevision.status().counters.live_shadow_newer_revision_total, 1);
  assert.equal(staleChecksum.status().counters.live_shadow_mismatch_total, 0);
});

test("hard concurrency limit skips instead of queueing", async () => {
  const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100, maxConcurrency: 1, pool: poolFixture({ delayMs: 30 }) });
  assert.equal(observer.observe("fixture-a", jsonAccount()), true);
  assert.equal(observer.observe("fixture-b", jsonAccount()), false);
  assert.equal(observer.status().background.pending, 0);
  assert.equal(observer.status().counters.live_shadow_concurrency_skip_total, 1);
  await waitForIdle(observer);
});

test("mismatch diagnostics and status redact tokens and secret values", async () => {
  const json = { marker: "json-value", traktAccessToken: "oauth-raw-secret" };
  const row = accountRow(json, {
    password_hash: null,
    config_json: { marker: "pg-value" },
    secrets_json: { traktAccessToken: "different-raw-secret" },
    metadata_json: { unknownFields: [] },
    source_checksum: sourceChecksum(json)
  });
  const messages = [];
  const originalWarn = console.warn;
  console.warn = (...parts) => messages.push(parts.join(" "));
  try {
    const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100, pool: poolFixture({ row, profiles: [] }) });
    observer.observe("raw-account-token", json);
    await waitForIdle(observer);
    const output = `${messages.join("\n")}\n${JSON.stringify(observer.status())}`;
    assert.equal(observer.status().counters.live_shadow_mismatch_total, 1);
    assert.equal(observer.status().counters.live_shadow_structural_mismatch_total, 1);
    assert.equal(observer.status().counters.live_shadow_checksum_mismatch_total, 1);
    for (const forbidden of ["raw-account-token", "oauth-raw-secret", "different-raw-secret", "json-value", "pg-value"]) {
      assert.equal(output.includes(forbidden), false);
    }
  } finally {
    console.warn = originalWarn;
  }
});

test("field, profile, and resolved-profile mismatch classes are aggregated without values", async () => {
  const json = jsonAccount();
  const row = accountRow(json, {
    config_json: { catalogs: "wrong-type", collections: json.collections, addedOnlyInPg: true },
    source_checksum: sourceChecksum(json)
  });
  const profiles = profileRows();
  profiles[0].overrides_json.collections = [{ id: "different-profile-collection" }];
  const messages = [];
  const originalWarn = console.warn;
  console.warn = (...parts) => messages.push(parts.join(" "));
  try {
    const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100, pool: poolFixture({ row, profiles }) });
    observer.observe("raw-account-token", json, "mobile");
    await waitForIdle(observer);
    const counters = observer.status().counters;
    assert.equal(counters.live_shadow_structural_mismatch_total, 1);
    assert.equal(counters.live_shadow_field_presence_mismatch_total, 1);
    assert.equal(counters.live_shadow_type_mismatch_total, 1);
    assert.equal(counters.live_shadow_checksum_mismatch_total, 1);
    assert.equal(counters.live_shadow_profile_mismatch_total, 1);
    assert.equal(counters.live_shadow_resolved_profile_mismatch_total, 1);
    assert.ok(messages.every(message => !message.includes("raw-account-token")));
    assert.ok(messages.every(message => !message.includes("different-profile-collection")));
  } finally {
    console.warn = originalWarn;
  }
});

test("aggregate cohort cardinality uses fixed-memory estimates", async () => {
  const observer = createLiveProfileStoreShadow({ enabled: true, percentage: 100, maxConcurrency: 8, pool: poolFixture() });
  for (let index = 0; index < 100; index++) observer.observe(`fixture-${index}`, jsonAccount());
  await waitForIdle(observer);
  const status = observer.status();
  assert.ok(status.uniqueSelectedAccountsApprox >= 95 && status.uniqueSelectedAccountsApprox <= 105);
  assert.equal(Object.prototype.hasOwnProperty.call(status, "uniqueSelectedAccounts"), false);
});

function shadowFixtureChecksum(account) {
  const comparable = JSON.parse(JSON.stringify(account));
  delete comparable.lastAccessed;
  return sourceChecksum(comparable);
}

test("lastAccessed-only drift remains a shadow match", async () => {
  const seeded = jsonAccount();
  seeded.lastAccessed = "2026-09-01T17:00:00.000Z";

  const live = JSON.parse(JSON.stringify(seeded));
  live.lastAccessed = "2026-09-01T18:00:00.000Z";

  const row = accountRow(seeded, {
    metadata_json: {
      createdAt: seeded.createdAt,
      lastAccessed: seeded.lastAccessed,
      _profileStoreProfilesObjectPresent: true,
      unknownFields: []
    },
    source_checksum: shadowFixtureChecksum(seeded)
  });

  const observer = createLiveProfileStoreShadow({
    enabled: true,
    percentage: 100,
    pool: poolFixture({ row })
  });

  observer.observe("fixture-last-accessed", live);
  await waitForIdle(observer);

  const counters = observer.status().counters;
  assert.equal(counters.live_shadow_match_total, 1);
  assert.equal(counters.live_shadow_stale_total, 0);
  assert.equal(counters.live_shadow_mismatch_total, 0);
});

test("meaningful config drift remains stale", async () => {
  const seeded = jsonAccount();

  const live = JSON.parse(JSON.stringify(seeded));
  live.catalogs = ["changed-after-seed"];

  const row = accountRow(seeded, {
    source_checksum: shadowFixtureChecksum(seeded)
  });

  const observer = createLiveProfileStoreShadow({
    enabled: true,
    percentage: 100,
    pool: poolFixture({ row })
  });

  observer.observe("fixture-meaningful-drift", live);
  await waitForIdle(observer);

  const counters = observer.status().counters;
  assert.equal(counters.live_shadow_stale_total, 1);
  assert.equal(counters.live_shadow_match_total, 0);
  assert.equal(counters.live_shadow_mismatch_total, 0);
});

test("reconstruction differences remain mismatches when checksum is current", async () => {
  const json = jsonAccount();

  const row = accountRow(json, {
    config_json: {
      catalogs: ["different-reconstruction"],
      collections: json.collections
    },
    source_checksum: shadowFixtureChecksum(json)
  });

  const observer = createLiveProfileStoreShadow({
    enabled: true,
    percentage: 100,
    pool: poolFixture({ row })
  });

  observer.observe("fixture-reconstruction-difference", json);
  await waitForIdle(observer);

  const counters = observer.status().counters;
  assert.equal(counters.live_shadow_stale_total, 0);
  assert.equal(counters.live_shadow_mismatch_total, 1);
  assert.equal(counters.live_shadow_match_total, 0);
});

test("profile comparison ignores account lastAccessed drift", async () => {
  const seeded = jsonAccount();
  seeded.lastAccessed = "2026-09-01T17:00:00.000Z";

  const live = JSON.parse(JSON.stringify(seeded));
  live.lastAccessed = "2026-09-01T18:00:00.000Z";

  const row = accountRow(seeded, {
    metadata_json: {
      createdAt: seeded.createdAt,
      lastAccessed: seeded.lastAccessed,
      _profileStoreProfilesObjectPresent: true,
      unknownFields: []
    },
    source_checksum: shadowFixtureChecksum(seeded)
  });

  const observer = createLiveProfileStoreShadow({
    enabled: true,
    percentage: 100,
    pool: poolFixture({ row, profiles: profileRows() })
  });

  observer.observe("fixture-profile-last-accessed", live, "mobile");
  await waitForIdle(observer);

  const counters = observer.status().counters;
  assert.equal(counters.live_shadow_match_total, 1);
  assert.equal(counters.live_shadow_stale_total, 0);
  assert.equal(counters.live_shadow_mismatch_total, 0);
  assert.equal(counters.live_shadow_profile_read_total, 1);
  assert.equal(counters.live_shadow_valid_profile_read_total, 1);
});
