"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
let deleteTokenFingerprints = () => false;
try {
  ({ deleteTokenFingerprints } = require("./install-fingerprint-store"));
} catch (error) {
  if (error?.code !== "MODULE_NOT_FOUND") throw error;
}
const { deleteEmailRegistrationsForToken } = require("../token-recovery");

function setupDigest(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("base64url");
}

function removeSupporterLease(dataDir, token) {
  const file = path.join(dataDir, "ultraplay-supporter-leases.json");
  let store;

  try {
    store = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }

  if (!store || store.version !== 1 || !store.setups || typeof store.setups !== "object") {
    return false;
  }

  const key = setupDigest(token);
  if (!Object.prototype.hasOwnProperty.call(store.setups, key)) {
    return false;
  }

  delete store.setups[key];

  const tmp = file + ".tmp-account-delete-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
  return true;
}

function registerAccountDeletionRoutes(app, deps) {
  const {
    readConfig,
    deleteAccount,
    verifyPassword,
    rateLimit,
    clearKey,
    dataDir
  } = deps;

  app.post("/api/account/delete", async (req, res) => {
    const ip =
      String(req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim() ||
      req.socket.remoteAddress ||
      "unknown";

    if (rateLimit(ip, 6, 10 * 60 * 1000)) {
      return res.status(429).json({
        ok: false,
        error: "Too many deletion attempts. Try again later."
      });
    }

    const token = String(req.body?.token || "").trim().toUpperCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const confirmation = String(req.body?.confirmation || "").trim().toUpperCase();

    if (!/^[A-Z0-9]{8}$/.test(token) || !password) {
      return res.status(400).json({
        ok: false,
        error: "Enter a valid Ultra MAX token and password."
      });
    }

    if (confirmation !== "DELETE") {
      return res.status(400).json({
        ok: false,
        error: "Type DELETE to confirm permanent account deletion."
      });
    }

    const config = await readConfig(token);
    if (!config) {
      return res.status(404).json({
        ok: false,
        error: "Ultra MAX setup not found."
      });
    }

    if (!verifyPassword(password, config.passwordHash)) {
      return res.status(401).json({
        ok: false,
        error: "Incorrect password."
      });
    }

    const deleted = await deleteAccount(token);
    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: "Ultra MAX setup not found."
      });
    }

    try { deleteEmailRegistrationsForToken(token); } catch (error) {
      console.warn("[account-delete] recovery cleanup failed:", error.message);
    }

    try { deleteTokenFingerprints(token); } catch (error) {
      console.warn("[account-delete] fingerprint cleanup failed:", error.message);
    }

    try { removeSupporterLease(dataDir, token); } catch (error) {
      console.warn("[account-delete] supporter cleanup failed:", error.message);
    }

    try { clearKey(token); } catch {}

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      ok: true,
      deleted: true,
      message: "Your Ultra MAX setup and associated active account data have been deleted."
    });
  });
}

module.exports = {
  registerAccountDeletionRoutes,
  removeSupporterLease,
  setupDigest
};
