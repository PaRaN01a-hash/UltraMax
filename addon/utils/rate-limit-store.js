const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const STORE_FILE = path.join(DATA_DIR, "rate-limits.json");

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function load() {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch (e) {
    return {};
  }
}

function save(data) {
  const tmpFile = path.join(
    DATA_DIR,
    `.rate-limits.json.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  fs.writeFileSync(tmpFile, JSON.stringify(data));
  fs.renameSync(tmpFile, STORE_FILE);
}

// Returns false (and records the attempt) if under the limit, true if the
// key has exceeded MAX_ATTEMPTS within the last WINDOW_MS.
function checkAndRecord(key) {
  const now = Date.now();
  const data = load();
  const hits = (data[key] || []).filter(t => now - t < WINDOW_MS);

  if (hits.length >= MAX_ATTEMPTS) {
    data[key] = hits;
    save(data);
    return false;
  }

  hits.push(now);
  data[key] = hits;
  save(data);
  return true;
}

function clearKey(key) {
  const data = load();
  if (key in data) {
    delete data[key];
    save(data);
  }
}

module.exports = {
  checkAndRecord,
  clearKey
};
