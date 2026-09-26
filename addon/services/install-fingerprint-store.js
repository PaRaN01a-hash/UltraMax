"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const STORE_FILE = path.join(DATA_DIR, "install-fingerprints.json");

let cache = null;
let cacheMtime = null;
let writeQueue = Promise.resolve();

function loadStore() {
  try {
    const stat = fs.statSync(STORE_FILE);

    if (cache && cacheMtime === stat.mtimeMs) {
      return cache;
    }

    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));

    cache = parsed && typeof parsed === "object" ? parsed : {};
    cacheMtime = stat.mtimeMs;

    return cache;
  } catch (error) {
    if (error.code === "ENOENT") {
      cache = {};
      cacheMtime = null;
      return cache;
    }

    console.error("[install-fingerprint-store] load failed:", error.message);
    throw error;
  }
}

function saveStore(store) {
  writeQueue = writeQueue.then(() => {
    const tmpFile = path.join(
      DATA_DIR,
      `.install-fingerprints.json.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
    );

    try {
      fs.writeFileSync(tmpFile, JSON.stringify(store));
      fs.renameSync(tmpFile, STORE_FILE);

      const stat = fs.statSync(STORE_FILE);

      cache = store;
      cacheMtime = stat.mtimeMs;
    } catch (error) {
      try {
        fs.unlinkSync(tmpFile);
      } catch (_) {}

      console.error("[install-fingerprint-store] save failed:", error.message);
      throw error;
    }
  });

  return writeQueue;
}

function getFingerprint(token, profileId = null) {
  const store = loadStore();
  const entry = store[token];

  if (!entry) return undefined;

  if (profileId) {
    return entry.profiles && entry.profiles[profileId];
  }

  return entry.base;
}

function setFingerprint(token, profileId, fingerprint) {
  if (!token || !fingerprint) return Promise.resolve();

  const store = loadStore();

  if (!store[token]) {
    store[token] = {
      base: null,
      profiles: {}
    };
  }

  if (!store[token].profiles || typeof store[token].profiles !== "object") {
    store[token].profiles = {};
  }

  if (profileId) {
    store[token].profiles[profileId] = fingerprint;
  } else {
    store[token].base = fingerprint;
  }

  return saveStore(store);
}

function deleteProfileFingerprint(token, profileId) {
  const store = loadStore();

  if (
    store[token] &&
    store[token].profiles &&
    Object.prototype.hasOwnProperty.call(store[token].profiles, profileId)
  ) {
    delete store[token].profiles[profileId];
    return saveStore(store);
  }

  return Promise.resolve();
}

function deleteTokenFingerprints(token) {
  const store = loadStore();

  if (Object.prototype.hasOwnProperty.call(store, token)) {
    delete store[token];
    return saveStore(store);
  }

  return Promise.resolve();
}

module.exports = {
  STORE_FILE,
  loadStore,
  saveStore,
  getFingerprint,
  setFingerprint,
  deleteProfileFingerprint,
  deleteTokenFingerprints
};
