"use strict";

// Storage for opaque, revocable Fusion share links. Deliberately isolated
// from utils/config-store.js — this is public-facing pointer data (shareId
// -> which token/profile to render), never the config itself, and never a
// place secrets can end up.
//
// Record shape (nothing more is stored):
//   { shareId, token, profileId: string|null, createdAt, updatedAt, enabled }

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const SHARES_FILE = path.join(DATA_DIR, "fusion-shares.json");

// 24 random bytes (192 bits) as base64url -> 32-char opaque id. Not derived
// from the setup token in any way, and long/random enough that it isn't
// guessable or enumerable.
const SHARE_ID_BYTES = 24;
const SHARE_ID_RE = /^[A-Za-z0-9_-]{32}$/;

function isValidShareId(shareId) {
  return typeof shareId === "string" && SHARE_ID_RE.test(shareId);
}

function generateShareId() {
  return crypto.randomBytes(SHARE_ID_BYTES).toString("base64url");
}

let cache = null;
let cacheMtime = 0;

function loadShares() {
  let stat;
  try {
    stat = fs.statSync(SHARES_FILE);
  } catch (e) {
    return {};
  }

  if (cache && cacheMtime === stat.mtimeMs) return cache;

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(SHARES_FILE, "utf8"));
  } catch (e) {
    console.error("[fusion-share-service] fusion-shares.json is malformed JSON:", e.message);
    return {};
  }

  cache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  cacheMtime = stat.mtimeMs;
  return cache;
}

// Atomic write: write-to-temp then rename, same pattern as
// utils/config-store.js. Synchronous — share writes are rare, low-volume
// admin actions, not a hot path.
function saveShares(shares) {
  const tmpFile = path.join(
    DATA_DIR,
    `.fusion-shares.json.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  fs.writeFileSync(tmpFile, JSON.stringify(shares, null, 2));
  fs.renameSync(tmpFile, SHARES_FILE);
  const stat = fs.statSync(SHARES_FILE);
  cache = shares;
  cacheMtime = stat.mtimeMs;
}

function normalizeProfileId(profileId) {
  const trimmed = String(profileId || "").trim();
  return trimmed ? trimmed : null;
}

// Returns the current enabled share for a token/profile pair, if any.
function findActiveShare(token, profileId) {
  const shares = loadShares();
  const wantProfile = normalizeProfileId(profileId);
  for (const record of Object.values(shares)) {
    if (
      record &&
      record.enabled !== false &&
      record.token === token &&
      normalizeProfileId(record.profileId) === wantProfile
    ) {
      return record;
    }
  }
  return null;
}

// Creates a fresh share for a token/profile, revoking whatever active share
// already existed for that same pair first — this is what backs both
// "Generate Import URL" (first time) and "regenerate" (replace) in the UI,
// since both are the same safe operation from the storage layer's view.
function createOrRegenerateShare({ token, profileId }) {
  if (!token || typeof token !== "string") {
    throw new Error("createOrRegenerateShare requires a token");
  }

  const shares = loadShares();
  const wantProfile = normalizeProfileId(profileId);
  const now = new Date().toISOString();

  for (const record of Object.values(shares)) {
    if (record && record.enabled !== false && record.token === token && normalizeProfileId(record.profileId) === wantProfile) {
      record.enabled = false;
      record.updatedAt = now;
    }
  }

  let shareId = generateShareId();
  while (shares[shareId]) shareId = generateShareId();

  const record = {
    shareId,
    token,
    profileId: wantProfile,
    createdAt: now,
    updatedAt: now,
    enabled: true
  };
  shares[shareId] = record;
  saveShares(shares);

  return record;
}

// Public lookup by shareId only — must never require or reveal the setup
// token. Returns null for unknown ids (caller maps to 404) and a record
// with enabled:false for revoked ones (caller maps to 410).
function getShareById(shareId) {
  if (!isValidShareId(shareId)) return undefined; // undefined = malformed, distinct from null = not found
  const shares = loadShares();
  return shares[shareId] || null;
}

// Scoped revoke — requires the owning token so a leaked/guessed shareId
// alone can't be used to revoke someone else's link.
function revokeShare({ shareId, token }) {
  const shares = loadShares();
  const record = shares[shareId];
  if (!record || record.token !== token) return null;
  if (record.enabled === false) return record;
  record.enabled = false;
  record.updatedAt = new Date().toISOString();
  saveShares(shares);
  return record;
}

// All enabled shares for a token, across base config + every profile —
// backs "get current share-link status" for the whole setup.
function listSharesForToken(token) {
  const shares = loadShares();
  return Object.values(shares).filter(record => record && record.enabled !== false && record.token === token);
}

module.exports = {
  SHARE_ID_RE,
  isValidShareId,
  findActiveShare,
  createOrRegenerateShare,
  getShareById,
  revokeShare,
  listSharesForToken
};
