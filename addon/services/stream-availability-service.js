"use strict";

const crypto = require("crypto");

const POSITIVE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 20000;
const MAX_QUEUE = 64;
const MAX_ACTIVE = 3;
const MAX_BACKGROUND_CHECKS_PER_REQUEST = 6;

const cache = new Map();
const queue = [];
const queuedKeys = new Set();
let active = 0;

function createStreamAvailabilityScope(streamAddons) {
  const addons = Array.isArray(streamAddons)
    ? streamAddons.map(value => String(value || "").trim()).filter(Boolean).sort()
    : [];

  if (!addons.length) return null;

  return crypto
    .createHash("sha256")
    .update(addons.join("\0"))
    .digest("hex");
}

function normalizeTitleId(value) {
  const id = String(value || "").trim();
  return /^tt\d{5,12}$/i.test(id) ? id.toLowerCase() : null;
}

function availabilityKey(scope, type, id) {
  const normalizedId = normalizeTitleId(id);
  if (!scope || !normalizedId || type !== "movie") return null;
  return `${scope}:${type}:${normalizedId}`;
}

function isPlayableStream(stream) {
  if (!stream || typeof stream !== "object") return false;

  if (typeof stream.url === "string" && stream.url.trim()) return true;
  if (typeof stream.infoHash === "string" && stream.infoHash.trim()) return true;
  if (typeof stream.ytId === "string" && stream.ytId.trim()) return true;

  return false;
}

function detectResolutions(streams) {
  const found = new Set();

  for (const stream of Array.isArray(streams) ? streams : []) {
    const text = [
      stream?.name,
      stream?.title,
      stream?.description,
      stream?.behaviorHints?.filename
    ].filter(Boolean).join(" ").toLowerCase();

    if (/2160p|\b4k\b|\buhd\b/.test(text)) found.add("2160p");
    if (/1080p/.test(text)) found.add("1080p");
    if (/720p/.test(text)) found.add("720p");
    if (/480p/.test(text)) found.add("480p");
  }

  return Array.from(found);
}

function pruneCache() {
  const now = Date.now();

  for (const [key, value] of cache) {
    if (!value || value.expiresAt <= now) cache.delete(key);
  }

  while (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

function recordStreamAvailability({
  scope,
  type,
  id,
  streams,
  complete = true,
  now = Date.now()
}) {
  const key = availabilityKey(scope, type, id);
  if (!key) return null;

  const list = (Array.isArray(streams) ? streams : [])
    .filter(isPlayableStream);
  const available = list.length > 0;

  if (!available && !complete) {
    const existing = cache.get(key);
    if (existing && existing.available === false) cache.delete(key);
    return null;
  }

  const value = {
    available,
    streamCount: list.length,
    resolutions: detectResolutions(list),
    checkedAt: now,
    expiresAt: now + (available ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS)
  };

  cache.set(key, value);
  pruneCache();
  return { ...value };
}

function getStreamAvailability(scope, type, id, now = Date.now()) {
  const key = availabilityKey(scope, type, id);
  if (!key) return null;

  const value = cache.get(key);
  if (!value) return null;

  if (value.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  return { ...value };
}

function metaTitleId(meta) {
  return normalizeTitleId(meta?.imdb_id || meta?.id);
}

function filterCatalogByStreamAvailability(result, { scope, type }) {
  if (!result || !Array.isArray(result.metas) || !scope || type !== "movie") {
    return { result, excludedUnavailable: 0, known: 0, unknown: 0 };
  }

  let excludedUnavailable = 0;
  let known = 0;
  let unknown = 0;

  const metas = result.metas.filter(meta => {
    const id = metaTitleId(meta);
    if (!id) {
      unknown += 1;
      return true;
    }

    const state = getStreamAvailability(scope, type, id);
    if (!state) {
      unknown += 1;
      return true;
    }

    known += 1;
    if (!state.available) {
      excludedUnavailable += 1;
      return false;
    }

    return true;
  });

  return {
    result: { ...result, metas },
    excludedUnavailable,
    known,
    unknown
  };
}

function runQueue() {
  while (active < MAX_ACTIVE && queue.length) {
    const task = queue.shift();
    active += 1;

    Promise.resolve()
      .then(() => task.probe(task.type, task.id))
      .then(outcome => {
        if (!outcome || typeof outcome !== "object") return;
        recordStreamAvailability({
          scope: task.scope,
          type: task.type,
          id: task.id,
          streams: outcome.streams,
          complete: outcome.complete !== false
        });
      })
      .catch(error => {
        console.warn("[stream-availability] probe failed open:", error?.message || error);
      })
      .finally(() => {
        active -= 1;
        queuedKeys.delete(task.key);
        runQueue();
      });
  }
}

function scheduleStreamAvailabilityChecks({
  scope,
  type,
  metas,
  probe,
  maxChecks = MAX_BACKGROUND_CHECKS_PER_REQUEST
}) {
  if (!scope || type !== "movie" || typeof probe !== "function") return 0;

  let scheduled = 0;
  const seen = new Set();

  for (const meta of Array.isArray(metas) ? metas : []) {
    if (scheduled >= maxChecks || queue.length >= MAX_QUEUE) break;

    const id = metaTitleId(meta);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    if (getStreamAvailability(scope, type, id)) continue;

    const key = availabilityKey(scope, type, id);
    if (!key || queuedKeys.has(key)) continue;

    queuedKeys.add(key);
    queue.push({ key, scope, type, id, probe });
    scheduled += 1;
  }

  runQueue();
  return scheduled;
}

module.exports = {
  POSITIVE_TTL_MS,
  NEGATIVE_TTL_MS,
  MAX_BACKGROUND_CHECKS_PER_REQUEST,
  createStreamAvailabilityScope,
  recordStreamAvailability,
  getStreamAvailability,
  filterCatalogByStreamAvailability,
  scheduleStreamAvailabilityChecks,
  _test: {
    normalizeTitleId,
    availabilityKey,
    isPlayableStream,
    detectResolutions,
    cache,
    queue,
    queuedKeys,
    pruneCache
  }
};
