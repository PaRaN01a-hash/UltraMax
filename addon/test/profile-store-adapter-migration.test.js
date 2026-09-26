"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProfileStoreAdapter
} = require("../utils/profile-store-adapter");

function baseAccount() {
  return {
    catalogs: ["base"],
    passwordHash: "fixture-password-hash",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function createPool({ existing = "absent" } = {}) {
  const queries = [];
  const accountId = 41;

  const storedRow = {
    id: accountId,
    token: "fixture-token",
    password_hash: "fixture-password-hash",
    preauth: null,
    config_json: { catalogs: ["base"] },
    secrets_json: { passwordHash: "fixture-password-hash" },
    metadata_json: {
      createdAt: "2026-01-01T00:00:00.000Z",
      unknownFields: []
    },
    source_checksum: "",
    source_version: "legacy-migrate-on-write-v1",
    source_revision: 1,
    deleted_at: null
  };

  let migratedChecksum = null;

  const client = {
    async query(request) {
      const text = typeof request === "string" ? request : request.text;
      const values = typeof request === "string" ? [] : (request.values || []);
      queries.push(text);

      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rowCount: 0, rows: [] };
      }

      if (text.includes("pg_advisory_xact_lock")) {
        return { rowCount: 1, rows: [{}] };
      }

      if (text.includes("SELECT id, deleted_at FROM profile_accounts WHERE token=$1 FOR UPDATE")) {
        if (existing === "absent") return { rowCount: 0, rows: [] };
        return {
          rowCount: 1,
          rows: [{
            id: accountId,
            deleted_at: existing === "deleted"
              ? "2026-01-02T00:00:00.000Z"
              : null
          }]
        };
      }

      if (text.startsWith("INSERT INTO profile_accounts")) {
        migratedChecksum = values[9];
        storedRow.source_checksum = migratedChecksum;
        storedRow.deleted_at = null;
        return { rowCount: 1, rows: [{ id: accountId }] };
      }

      if (text.startsWith("UPDATE profile_accounts SET password_hash=")) {
        migratedChecksum = values[9];
        storedRow.source_checksum = migratedChecksum;
        storedRow.deleted_at = null;
        return { rowCount: 1, rows: [] };
      }

      if (text.includes("SELECT * FROM profile_accounts WHERE id=$1 AND deleted_at IS NULL")) {
        return { rowCount: 1, rows: [storedRow] };
      }

      if (text.startsWith("INSERT INTO profiles")) {
        return { rowCount: 1, rows: [] };
      }

      if (text.includes("SELECT * FROM profiles WHERE account_id=$1 AND deleted_at IS NULL")) {
        return { rowCount: 0, rows: [] };
      }

      if (text.startsWith("UPDATE profiles SET deleted_at=now()")) {
        return { rowCount: 0, rows: [] };
      }

      throw new Error(`Unexpected query: ${text}`);
    },

    release() {}
  };

  return {
    pool: {
      totalCount: 1,
      idleCount: 1,
      waitingCount: 0,
      async connect() {
        return client;
      },
      async query() {
        throw new Error("Unexpected pool.query");
      }
    },
    queries
  };
}

test("migrateLegacyAccount inserts when token is absent", async () => {
  const fixture = createPool({ existing: "absent" });
  const adapter = createProfileStoreAdapter({
    enabled: true,
    pool: fixture.pool,
    timeoutMs: 1000
  });

  const result = await adapter.migrateLegacyAccount(
    "fixture-token",
    baseAccount(),
    async () => {}
  );

  assert.equal(result.migrated, true);
  assert.equal(
    fixture.queries.some(q => q.startsWith("INSERT INTO profile_accounts")),
    true
  );
});

test("migrateLegacyAccount resurrects a soft-deleted token", async () => {
  const fixture = createPool({ existing: "deleted" });
  const adapter = createProfileStoreAdapter({
    enabled: true,
    pool: fixture.pool,
    timeoutMs: 1000
  });

  const result = await adapter.migrateLegacyAccount(
    "fixture-token",
    baseAccount(),
    async () => {}
  );

  assert.equal(result.migrated, true);
  assert.equal(
    fixture.queries.some(q =>
      q.includes("source_revision=1,deleted_at=NULL WHERE id=$1")
    ),
    true
  );
  assert.equal(
    fixture.queries.some(q => q.startsWith("INSERT INTO profile_accounts")),
    false
  );
});

test("migrateLegacyAccount does not insert over an active token", async () => {
  const fixture = createPool({ existing: "active" });
  const adapter = createProfileStoreAdapter({
    enabled: true,
    pool: fixture.pool,
    timeoutMs: 1000
  });

  await assert.rejects(
    adapter.migrateLegacyAccount(
      "fixture-token",
      baseAccount(),
      async () => {}
    )
  );

  assert.equal(
    fixture.queries.some(q => q.startsWith("INSERT INTO profile_accounts")),
    false
  );
});

test("migrateLegacyAccount resurrects existing profile rows safely", async () => {
  const fixture = createPool({ existing: "deleted" });

  const originalConnect = fixture.pool.connect.bind(fixture.pool);

  fixture.pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);

    client.query = async request => {
      const text = typeof request === "string" ? request : request.text;

      if (text.includes("SELECT * FROM profiles WHERE account_id=$1 AND deleted_at IS NULL")) {
        return {
          rowCount: 1,
          rows: [{
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
            metadata_json: {
              name: "Mobile",
              createdAt: "2026-01-02T00:00:00.000Z"
            },
            install_fingerprint: null,
            created_at: "2026-01-02T00:00:00.000Z",
            updated_at: null,
            deleted_at: null
          }]
        };
      }

      return originalQuery(request);
    };

    return client;
  };

  const adapter = createProfileStoreAdapter({
    enabled: true,
    pool: fixture.pool,
    timeoutMs: 1000
  });

  const result = await adapter.migrateLegacyAccount(
    "fixture-token",
    {
      ...baseAccount(),
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
    },
    async () => {}
  );

  assert.equal(result.migrated, true);

  assert.equal(
    fixture.queries.some(q =>
      q.includes("ON CONFLICT (account_id,profile_id) DO UPDATE")
    ),
    true
  );

  assert.equal(
    fixture.queries.some(q =>
      q.startsWith("UPDATE profiles SET deleted_at=now()")
    ),
    true
  );
});
