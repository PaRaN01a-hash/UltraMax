const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
const CONFIGS_FILE = path.join(DATA_DIR, "configs.json");

let CONFIG_CACHE = null;
let CONFIG_CACHE_MTIME = 0;

function loadConfigs() {
  let stat;
  try {
    stat = fs.statSync(CONFIGS_FILE);
  } catch (e) {
    // No configs file yet — treat as empty store.
    return {};
  }

  const mtime = stat.mtimeMs;
  if (CONFIG_CACHE && CONFIG_CACHE_MTIME === mtime) {
    return CONFIG_CACHE;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(CONFIGS_FILE, "utf8"));
  } catch (e) {
    // Malformed JSON is a data-corruption bug, not an empty store — fail
    // loudly instead of silently wiping out every config on next save.
    console.error("[config-store] configs.json is malformed JSON:", e.message);
    throw new Error(`configs.json contains invalid JSON: ${e.message}`);
  }

  CONFIG_CACHE = parsed;
  CONFIG_CACHE_MTIME = mtime;
  return CONFIG_CACHE;
}

let configWriteQueue = Promise.resolve();

function saveConfigs(c) {
  configWriteQueue = configWriteQueue.then(() => {
    try {
      const tmpFile = path.join(
        DATA_DIR,
        `.configs.json.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
      );
      fs.writeFileSync(tmpFile, JSON.stringify(c, null, 2));
      fs.renameSync(tmpFile, CONFIGS_FILE);
      const stat = fs.statSync(CONFIGS_FILE);
      CONFIG_CACHE = c;
      CONFIG_CACHE_MTIME = stat.mtimeMs;
    } catch(e) {
      console.error("saveConfigs error:", e.message);
    }
  });
  return configWriteQueue;
}

module.exports = {
  loadConfigs,
  saveConfigs
};
