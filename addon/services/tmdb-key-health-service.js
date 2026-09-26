"use strict";

const crypto = require("crypto");

const DEFAULT_VALID_TTL_MS = 60 * 60 * 1000;
const DEFAULT_INVALID_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 4000;

const validationCache = new Map();

function normalizeKey(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function credentialIdentity(value) {
  const normalized = normalizeKey(value) || "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function verifyTmdbKey(key, options = {}) {
  const normalized = normalizeKey(key);
  if (!normalized) return false;

  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const identity = credentialIdentity(normalized);
  const cached = validationCache.get(identity);
  if (cached && cached.expiresAt > now) return cached.valid;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;

  const timeoutMs = Number.isFinite(Number(options.timeoutMs))
    ? Math.max(250, Number(options.timeoutMs))
    : DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    const response = await fetchImpl(
      `https://api.themoviedb.org/3/authentication?api_key=${encodeURIComponent(normalized)}`,
      { signal: controller.signal }
    );

    let valid = null;
    if (response.ok) valid = true;
    else if (response.status === 401 || response.status === 403) valid = false;

    if (valid !== null) {
      const ttl = valid
        ? (Number(options.validTtlMs) || DEFAULT_VALID_TTL_MS)
        : (Number(options.invalidTtlMs) || DEFAULT_INVALID_TTL_MS);
      validationCache.set(identity, {
        valid,
        expiresAt: now + Math.max(1000, ttl)
      });
    }

    return valid;
  } catch (_) {
    // A verifier outage must not break otherwise-working configured keys.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveRuntimeTmdbKey(capabilities = {}, options = {}) {
  const configuredTmdbKey = normalizeKey(capabilities.configuredTmdbKey);
  const effectiveTmdbKey = normalizeKey(capabilities.effectiveTmdbKey);
  const serverTmdbKey = normalizeKey(options.serverTmdbKey);

  if (!configuredTmdbKey) {
    return {
      tmdbKey: effectiveTmdbKey,
      source: serverTmdbKey && effectiveTmdbKey === serverTmdbKey ? "server" : "effective",
      fellBack: false,
      validation: null
    };
  }

  // Preserve the existing provider contract unless MDBList already entitles
  // the account to the server-owned TMDB fallback.
  if (!capabilities.hasMdblist || !serverTmdbKey || configuredTmdbKey === serverTmdbKey) {
    return {
      tmdbKey: configuredTmdbKey,
      source: "configured",
      fellBack: false,
      validation: null
    };
  }

  const validation = await verifyTmdbKey(configuredTmdbKey, options);
  if (validation === false) {
    return {
      tmdbKey: serverTmdbKey,
      source: "server-fallback",
      fellBack: true,
      validation: false
    };
  }

  return {
    tmdbKey: configuredTmdbKey,
    source: "configured",
    fellBack: false,
    validation
  };
}

function clearTmdbKeyValidationCache() {
  validationCache.clear();
}

module.exports = {
  verifyTmdbKey,
  resolveRuntimeTmdbKey,
  credentialIdentity,
  clearTmdbKeyValidationCache,
  _validationCache: validationCache
};
