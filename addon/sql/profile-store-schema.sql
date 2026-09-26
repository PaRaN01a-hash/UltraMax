BEGIN;

CREATE TABLE IF NOT EXISTS profile_accounts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    token text NOT NULL UNIQUE,

    password_hash text,
    preauth boolean,

    config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    secrets_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz,
    updated_at timestamptz,
    last_accessed_at timestamptz,

    source_checksum text NOT NULL,
    source_version text NOT NULL,
    source_revision bigint NOT NULL DEFAULT 1,

    deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS profiles (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    account_id bigint NOT NULL
        REFERENCES profile_accounts(id)
        ON DELETE CASCADE,

    profile_id text NOT NULL,

    name jsonb,

    overrides_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    secrets_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,

    install_fingerprint jsonb,

    created_at timestamptz,
    updated_at timestamptz,
    deleted_at timestamptz,

    CONSTRAINT profiles_account_profile_unique
        UNIQUE (account_id, profile_id)
);

CREATE INDEX IF NOT EXISTS profile_accounts_active_source_version_idx
    ON profile_accounts (source_version)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS profiles_active_account_idx
    ON profiles (account_id, profile_id)
    WHERE deleted_at IS NULL;

-- Server-only storage.
-- No anon/authenticated policies are intentionally created.
ALTER TABLE profile_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE profile_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE profiles FROM anon, authenticated;

COMMIT;
