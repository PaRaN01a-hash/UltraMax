const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const BCRYPT_ROUNDS = 12;

function legacyHash(p) {
  return crypto
    .createHash("sha256")
    .update(p + "ultramax_salt")
    .digest("hex");
}

function hashPassword(p) {
  return bcrypt.hashSync(p, BCRYPT_ROUNDS);
}

// Verifies a password against a stored hash. Supports bcrypt hashes
// (starting with $2) and legacy SHA-256 hashes for backwards compatibility
// with configs created before the bcrypt migration.
function verifyPassword(provided, stored) {
  if (!provided || !stored) return false;

  if (stored.startsWith("$2")) {
    return bcrypt.compareSync(provided, stored);
  }

  return legacyHash(provided) === stored;
}

function isLegacyHash(stored) {
  return !!stored && !stored.startsWith("$2");
}

function generateToken() {
  return crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase();
}

module.exports = {
  hashPassword,
  verifyPassword,
  isLegacyHash,
  generateToken
};
