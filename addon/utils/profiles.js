// A "profile" is a named, near-complete alternate config layered on top of
// a token's base config — e.g. a "4K TV" profile with different catalogs,
// collections and debrid settings than a "Mobile" profile. The base config
// is untouched and is what every existing install URL (no ?profile= param)
// resolves to, so tokens created before profiles existed keep working
// exactly as before.

// Only account-identity/bookkeeping fields are blocked from being set via a
// profile override — everything a user actually configures (catalogs,
// collections, streamAddons, debrid settings, API keys, streamFormat, etc.)
// is fair game, because a profile is created by the token's own owner
// (password-gated) acting on their own data. Blocking these specific keys
// stops a profile overrides payload from smuggling in a fake password hash,
// nesting profiles inside profiles, or forging bookkeeping timestamps.
const BLOCKED_OVERRIDE_KEYS = [
  "passwordHash",
  "profiles",
  "createdAt",
  "updatedAt",
  "lastAccessed",
  "preauth"
];

// Generous but bounded — profiles duplicate catalogs/collections arrays,
// so this just guards against a pathological payload bloating configs.json.
const MAX_OVERRIDES_BYTES = 300 * 1024;

class ProfileOverridesTooLargeError extends Error {}

function sanitiseProfileOverrides(overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return {};

  const safe = {};
  for (const key of Object.keys(overrides)) {
    if (BLOCKED_OVERRIDE_KEYS.includes(key)) continue;
    safe[key] = overrides[key];
  }

  if (Buffer.byteLength(JSON.stringify(safe)) > MAX_OVERRIDES_BYTES) {
    throw new ProfileOverridesTooLargeError(`Profile settings too large (max ${MAX_OVERRIDES_BYTES / 1024}KB)`);
  }

  return safe;
}

function resolveConfigForProfile(config, profileId) {
  if (!config || !profileId) return config;
  const profile = config.profiles && config.profiles[profileId];
  if (!profile) return config;
  const resolved = { ...config, ...(profile.overrides || {}) };

  // A profile can connect its own Trakt/Simkl account (see the
  // ?profile=<id> handling on /auth/trakt|simkl/connect/:token in
  // auth-service.js), stored under these profile* keys so it never
  // collides with the base config's own connection. When the profile
  // hasn't connected its own account, these are unset and
  // traktAccessToken/simklAccessToken already fell through from the base
  // config untouched by the spread above — that's the fallback.
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

module.exports = {
  BLOCKED_OVERRIDE_KEYS,
  MAX_OVERRIDES_BYTES,
  ProfileOverridesTooLargeError,
  sanitiseProfileOverrides,
  resolveConfigForProfile
};
