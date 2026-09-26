"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  parseMediaFilename,
  tmdbSearch,
  normalizeTitle,
  mapWithConcurrency
} = require("./premiumize-library-service");

const TORBOX_API_BASE = "https://api.torbox.app/v1/api";
const TORBOX_CATALOG_IDS = Object.freeze({
  movies: "torbox_movies",
  series: "torbox_series"
});
const TORBOX_CATALOG_ID_SET = new Set(Object.values(TORBOX_CATALOG_IDS));
const CACHE_TTL_MS = 15 * 60 * 1000;
const VIDEO_EXTENSIONS = new Set([
  ".mkv", ".mp4", ".m4v", ".avi", ".mov", ".wmv", ".webm", ".ts", ".m2ts", ".mpg", ".mpeg"
]);
const SOURCE_ENDPOINTS = Object.freeze({
  torrent: { list: "/torrents/mylist", download: "/torrents/requestdl", itemParam: "torrent_id" },
  webdl: { list: "/webdl/mylist", download: "/webdl/requestdl", itemParam: "web_id" },
  usenet: { list: "/usenet/mylist", download: "/usenet/requestdl", itemParam: "usenet_id" }
});

class TorboxLibraryError extends Error {
  constructor(message, code = "TORBOX_LIBRARY_ERROR", statusCode = 502) {
    super(message);
    this.name = "TorboxLibraryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cleanApiKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  return key.length && key.length <= 512 ? key : "";
}

function resolveTorboxLibraryApiKey(config) {
  const explicit = cleanApiKey(config?.torboxLibraryApiKey);
  if (explicit) return explicit;

  const services = Array.isArray(config?.debridServices) ? config.debridServices : [];
  const torbox = services.find(item => String(item?.service || "").toLowerCase() === "torbox" && cleanApiKey(item?.apiKey));
  if (torbox) return cleanApiKey(torbox.apiKey);

  if (String(config?.debridService || "").toLowerCase() === "torbox") {
    return cleanApiKey(config?.debridApiKey);
  }
  return "";
}

function isTorboxLibraryCatalogId(id) {
  return TORBOX_CATALOG_ID_SET.has(String(id || ""));
}

function isTorboxLibraryContentId(id) {
  return /^tbl_(?:movie|series|episode)_[A-Za-z0-9_-]+$/.test(String(id || ""));
}

function torboxLibraryConfigured(config) {
  return Boolean(config?.torboxLibraryEnabled && resolveTorboxLibraryApiKey(config));
}

function stableId(prefix, value) {
  return `tbl_${prefix}_${crypto.createHash("sha256").update(String(value)).digest("base64url").slice(0, 22)}`;
}

function cachePathForToken(token, dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data")) {
  const dir = path.join(dataDir, "torbox-library");
  const name = crypto.createHash("sha256").update(String(token)).digest("hex");
  return { dir, file: path.join(dir, `${name}.json`) };
}

function readCache(token, dataDir) {
  try {
    const { file } = cachePathForToken(token, dataDir);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(token, cache, dataDir) {
  const { dir, file } = cachePathForToken(token, dataDir);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cache), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

function safeErrorMessage(data, fallback) {
  const candidates = [data?.detail, data?.error, data?.message];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() && candidate.trim().length <= 180) return candidate.trim();
  }
  return fallback;
}

async function torboxRequest(endpoint, apiKey, {
  params = null,
  fetchImpl = global.fetch,
  timeoutMs = 12000
} = {}) {
  const key = cleanApiKey(apiKey);
  if (!key) throw new TorboxLibraryError("TorBox API key is required.", "TORBOX_KEY_REQUIRED", 400);
  if (typeof fetchImpl !== "function") throw new TorboxLibraryError("HTTP client unavailable.");

  const url = new URL(TORBOX_API_BASE + endpoint);
  if (params) {
    Object.entries(params).forEach(([name, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(name, String(value));
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
      signal: controller.signal
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok || data?.success === false) {
      throw new TorboxLibraryError(
        safeErrorMessage(data, "TorBox request failed."),
        "TORBOX_REQUEST_FAILED",
        response.ok ? 502 : response.status
      );
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") throw new TorboxLibraryError("TorBox took too long to respond.", "TORBOX_TIMEOUT", 504);
    if (error instanceof TorboxLibraryError) throw error;
    throw new TorboxLibraryError("Could not reach TorBox.", "TORBOX_UNAVAILABLE", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function testTorboxConnection(apiKey, options = {}) {
  await torboxRequest("/user/me", apiKey, options);
  return { ok: true };
}

function timestampSeconds(value) {
  if (Number.isFinite(Number(value)) && Number(value) > 0) {
    const n = Number(value);
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  }
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

function itemComplete(item) {
  if (item?.downloadFinished === true || item?.downloadPresent === true) return true;
  if (Number(item?.progress) >= 1) return true;
  const state = String(item?.downloadState || item?.state || item?.status || "").toLowerCase();
  return ["completed", "complete", "finished", "downloaded", "cached"].includes(state);
}

function isVideoFile(file) {
  const mime = String(file?.mimetype || file?.mime_type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.has(path.extname(String(file?.name || file?.shortName || "")).toLowerCase());
}

function normalizeTorboxItemFiles(source, item) {
  if (!item || !itemComplete(item)) return [];
  const itemId = String(item.id ?? "");
  if (!itemId) return [];
  const createdAt = timestampSeconds(item.createdAt || item.created_at || item.updatedAt || item.updated_at);
  const files = Array.isArray(item.files) ? item.files : [];
  const normalized = files
    .filter(isVideoFile)
    .map((file, index) => ({
      source,
      itemId,
      fileId: String(file.id ?? index),
      name: String(file.name || file.shortName || item.name || ""),
      size: Number(file.size) || 0,
      createdAt,
      mimeType: String(file.mimetype || file.mime_type || "")
    }));

  if (normalized.length) return normalized;
  const fallback = { name: String(item.name || ""), mimetype: String(item.mimetype || "") };
  if (!isVideoFile(fallback)) return [];
  return [{ source, itemId, fileId: "0", name: fallback.name, size: Number(item.size) || 0, createdAt, mimeType: fallback.mimetype }];
}

async function listTorboxSource(source, apiKey, options = {}) {
  const spec = SOURCE_ENDPOINTS[source];
  if (!spec) throw new TorboxLibraryError("Unknown TorBox source.", "TORBOX_SOURCE_INVALID", 400);
  const data = await torboxRequest(spec.list, apiKey, { ...options, params: { limit: 1000, offset: 0 } });
  const items = Array.isArray(data?.data) ? data.data : [];
  return items.flatMap(item => normalizeTorboxItemFiles(source, item));
}

async function listTorboxFiles(apiKey, options = {}) {
  const sources = Object.keys(SOURCE_ENDPOINTS);
  const results = await Promise.allSettled(sources.map(source => listTorboxSource(source, apiKey, options)));
  const files = [];
  let successCount = 0;
  results.forEach(result => {
    if (result.status === "fulfilled") {
      successCount += 1;
      files.push(...result.value);
    }
  });
  if (!successCount) throw new TorboxLibraryError("Could not read the TorBox cloud library.", "TORBOX_LIBRARY_UNAVAILABLE", 502);

  const seen = new Set();
  return files.filter(file => {
    const key = `${file.source}:${file.itemId}:${file.fileId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compactFileRecord(file, parsed, match) {
  const identity = `${file.source}:${file.itemId}:${file.fileId}`;
  if (!match) {
    return { ...file, parsed, match: null, identity };
  }
  const movieId = parsed.mediaType === "movie" ? stableId("movie", identity) : null;
  const seriesId = parsed.mediaType === "series" ? `tbl_series_${match.tmdbId}` : null;
  const episodeId = parsed.mediaType === "series" ? stableId("episode", identity) : null;
  return {
    ...file,
    parsed,
    match,
    identity,
    contentId: movieId || seriesId,
    streamId: movieId || episodeId
  };
}

function buildSummary(records) {
  const matched = records.filter(record => record.match);
  const movies = matched.filter(record => record.parsed?.mediaType === "movie");
  const episodes = matched.filter(record => record.parsed?.mediaType === "series");
  const series = new Set(episodes.map(record => record.match.tmdbId));
  return {
    files: records.length,
    matched: matched.length,
    unmatched: records.length - matched.length,
    movies: movies.length,
    series: series.size,
    episodes: episodes.length
  };
}

async function scanTorboxLibrary({ token, config, tmdbKey, force = false, fetchImpl = global.fetch, dataDir }) {
  if (!token) throw new TorboxLibraryError("Ultra MAX token is required.", "ULTRAMAX_TOKEN_REQUIRED", 400);
  const apiKey = resolveTorboxLibraryApiKey(config);
  if (!apiKey) throw new TorboxLibraryError("TorBox is not connected.", "TORBOX_NOT_CONNECTED", 409);
  if (!tmdbKey) throw new TorboxLibraryError("TMDB matching is unavailable.", "TMDB_UNAVAILABLE", 409);

  const cached = readCache(token, dataDir);
  if (!force && cached?.scannedAt && Date.now() - new Date(cached.scannedAt).getTime() < CACHE_TTL_MS) return cached;

  const remoteFiles = await listTorboxFiles(apiKey, { fetchImpl });
  const previousById = new Map((cached?.records || []).map(record => [record.identity, record]));
  const matchMemo = new Map();

  const records = await mapWithConcurrency(remoteFiles, 4, async file => {
    const identity = `${file.source}:${file.itemId}:${file.fileId}`;
    const old = previousById.get(identity);
    if (old && old.match && old.name === file.name && Number(old.createdAt || 0) === Number(file.createdAt || 0) && old.parsed) return old;

    const parsed = parseMediaFilename(file.name);
    if (!parsed.title || parsed.title.length < 2) return compactFileRecord(file, parsed, null);
    const memoKey = `${parsed.mediaType}|${normalizeTitle(parsed.title)}|${parsed.year || ""}`;
    let matchPromise = matchMemo.get(memoKey);
    if (!matchPromise) {
      matchPromise = tmdbSearch(parsed, tmdbKey, { fetchImpl });
      matchMemo.set(memoKey, matchPromise);
    }
    const match = await matchPromise;
    return compactFileRecord(file, parsed, match);
  });

  const cache = { version: 1, scannedAt: new Date().toISOString(), records, summary: buildSummary(records) };
  writeCache(token, cache, dataDir);
  return cache;
}

async function ensureLibraryCache(args) {
  return scanTorboxLibrary({ ...args, force: false });
}

function metaFromRecord(record, type) {
  const match = record.match;
  return {
    id: record.contentId,
    type,
    name: match.title,
    poster: match.poster,
    background: match.background,
    description: match.overview || "",
    releaseInfo: match.year ? String(match.year) : null,
    imdbRating: match.rating != null ? Number(match.rating).toFixed(1) : null,
    behaviorHints: { defaultVideoId: type === "movie" ? record.streamId : undefined }
  };
}

async function getTorboxCatalogMetas({ catalogId, type, extra = {}, token, config, tmdbKey, fetchImpl, dataDir }) {
  if (!isTorboxLibraryCatalogId(catalogId) || !torboxLibraryConfigured(config)) return { metas: [] };
  const cache = await ensureLibraryCache({ token, config, tmdbKey, fetchImpl, dataDir });
  const skip = Math.max(0, Number(extra?.skip) || 0);
  const pageSize = 100;

  if (catalogId === TORBOX_CATALOG_IDS.movies && type === "movie") {
    const records = cache.records.filter(record => record.match && record.parsed?.mediaType === "movie").sort((a, b) => b.createdAt - a.createdAt);
    return { metas: records.slice(skip, skip + pageSize).map(record => metaFromRecord(record, "movie")) };
  }
  if (catalogId === TORBOX_CATALOG_IDS.series && type === "series") {
    const newestBySeries = new Map();
    cache.records
      .filter(record => record.match && record.parsed?.mediaType === "series")
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach(record => {
        const key = String(record.match.tmdbId);
        if (!newestBySeries.has(key)) newestBySeries.set(key, record);
      });
    return { metas: Array.from(newestBySeries.values()).slice(skip, skip + pageSize).map(record => metaFromRecord(record, "series")) };
  }
  return { metas: [] };
}

async function fetchTmdbDetails(tmdbId, mediaType, tmdbKey, fetchImpl = global.fetch) {
  const tmdbType = mediaType === "series" ? "tv" : "movie";
  const url = `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${encodeURIComponent(tmdbKey)}&append_to_response=credits,external_ids`;
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return await response.json();
  } catch { return null; }
}

async function getTorboxMeta({ id, type, token, config, tmdbKey, fetchImpl = global.fetch, dataDir }) {
  if (!isTorboxLibraryContentId(id) || !torboxLibraryConfigured(config)) return null;
  const cache = await ensureLibraryCache({ token, config, tmdbKey, fetchImpl, dataDir });
  const record = cache.records.find(item => item.contentId === id || item.streamId === id);
  if (!record?.match) return null;
  const details = await fetchTmdbDetails(record.match.tmdbId, record.parsed.mediaType, tmdbKey, fetchImpl);
  const base = {
    id: record.contentId,
    type: record.parsed.mediaType === "series" ? "series" : "movie",
    name: details?.title || details?.name || record.match.title,
    description: details?.overview || record.match.overview || "",
    poster: details?.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : record.match.poster,
    background: details?.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : record.match.background,
    releaseInfo: String(details?.release_date || details?.first_air_date || "").slice(0, 4) || (record.match.year ? String(record.match.year) : null),
    imdbRating: details?.vote_average != null ? Number(details.vote_average).toFixed(1) : (record.match.rating != null ? Number(record.match.rating).toFixed(1) : null),
    genres: Array.isArray(details?.genres) ? details.genres.map(genre => genre.name) : [],
    cast: Array.isArray(details?.credits?.cast) ? details.credits.cast.slice(0, 10).map(person => person.name) : []
  };
  if (base.type === "movie") return base;

  const group = cache.records
    .filter(item => item.match?.tmdbId === record.match.tmdbId && item.parsed?.mediaType === "series")
    .sort((a, b) => (a.parsed.season - b.parsed.season) || (a.parsed.episode - b.parsed.episode));
  base.videos = group.map(item => ({
    id: item.streamId,
    title: `S${String(item.parsed.season).padStart(2, "0")}E${String(item.parsed.episode).padStart(2, "0")}`,
    season: item.parsed.season,
    episode: item.parsed.episode,
    released: item.createdAt ? new Date(item.createdAt * 1000).toISOString() : null
  }));
  return base;
}

function sanitizePublicOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return "https://ultramax.vip";
    return url.origin;
  } catch { return "https://ultramax.vip"; }
}

async function resolveTorboxStream({ id, token, config, tmdbKey, publicOrigin, fetchImpl = global.fetch, dataDir }) {
  if (!isTorboxLibraryContentId(id)) return { handled: false, streams: [] };
  if (!torboxLibraryConfigured(config)) return { handled: true, streams: [] };
  const cache = await ensureLibraryCache({ token, config, tmdbKey, fetchImpl, dataDir });
  const record = cache.records.find(item => item.streamId === id || (item.parsed?.mediaType === "movie" && item.contentId === id));
  if (!record) return { handled: true, streams: [] };
  const origin = sanitizePublicOrigin(publicOrigin);
  return {
    handled: true,
    streams: [{
      name: "TorBox Cloud",
      title: record.name || record.match?.title || "TorBox Cloud",
      url: `${origin}/c/${encodeURIComponent(token)}/torbox/play/${encodeURIComponent(record.streamId)}`
    }]
  };
}

async function requestTorboxDownloadUrl({ source, itemId, fileId, apiKey, fetchImpl = global.fetch, timeoutMs = 12000 }) {
  const spec = SOURCE_ENDPOINTS[source];
  if (!spec) throw new TorboxLibraryError("Unknown TorBox source.", "TORBOX_SOURCE_INVALID", 400);
  const key = cleanApiKey(apiKey);
  if (!key) throw new TorboxLibraryError("TorBox API key is required.", "TORBOX_KEY_REQUIRED", 400);

  const url = new URL(TORBOX_API_BASE + spec.download);
  url.searchParams.set("token", key);
  url.searchParams.set(spec.itemParam, String(itemId));
  url.searchParams.set("file_id", String(fileId));
  url.searchParams.set("redirect", "false");
  url.searchParams.set("append_name", "true");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: controller.signal, redirect: "manual" });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok || data?.success === false || typeof data?.data !== "string") {
      throw new TorboxLibraryError(safeErrorMessage(data, "TorBox could not create a playback link."), "TORBOX_DOWNLOAD_LINK_FAILED", response.ok ? 502 : response.status);
    }
    const target = new URL(data.data);
    if (target.protocol !== "https:") throw new TorboxLibraryError("TorBox returned an invalid playback link.", "TORBOX_DOWNLOAD_LINK_INVALID", 502);
    return target.toString();
  } catch (error) {
    if (error?.name === "AbortError") throw new TorboxLibraryError("TorBox took too long to create a playback link.", "TORBOX_TIMEOUT", 504);
    if (error instanceof TorboxLibraryError) throw error;
    throw new TorboxLibraryError("Could not create a TorBox playback link.", "TORBOX_DOWNLOAD_LINK_FAILED", 502);
  } finally {
    clearTimeout(timer);
  }
}

function publicSummary(cache) {
  return cache?.summary || { files: 0, matched: 0, unmatched: 0, movies: 0, series: 0, episodes: 0 };
}

function registerTorboxLibraryRoutes(app, deps) {
  const { readConfig, verifyPassword, checkAndRecord, clearKey, rateLimit, serverTmdbKey, mutateAccount } = deps;

  app.post("/api/torbox-cloud/test", async (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    if (rateLimit && rateLimit(ip, 8, 60000)) return res.status(429).json({ error: "Too many requests." });
    try {
      const result = await testTorboxConnection(req.body?.apiKey);
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message, code: error.code || "TORBOX_TEST_FAILED" });
    }
  });

  async function authenticatedConfig(req, res) {
    const token = req.params.token;
    const config = await readConfig(token);
    if (!config) { res.status(404).json({ error: "Config not found" }); return null; }
    const password = String(req.headers["x-config-password"] || "");
    if (!password) { res.status(401).json({ error: "Password required" }); return null; }
    if (checkAndRecord && !checkAndRecord(token)) { res.status(429).json({ error: "Too many password attempts. Try again later." }); return null; }
    if (!verifyPassword(password, config.passwordHash)) { res.status(401).json({ error: "Incorrect password" }); return null; }
    if (clearKey) clearKey(token);
    return config;
  }

  app.post("/c/:token/torbox/connect", async (req, res) => {
    const config = await authenticatedConfig(req, res);
    if (!config) return;
    const incomingKey = cleanApiKey(req.body?.apiKey);
    const apiKey = incomingKey || resolveTorboxLibraryApiKey(config);
    if (!apiKey) return res.status(400).json({ error: "Add a TorBox API key or connect TorBox under Streams first.", code: "TORBOX_KEY_REQUIRED" });
    try {
      await testTorboxConnection(apiKey);
      if (typeof mutateAccount !== "function") return res.status(503).json({ error: "TorBox connection storage is unavailable.", code: "TORBOX_STORE_UNAVAILABLE" });
      const committed = await mutateAccount(req.params.token, current => {
        if (incomingKey) current.torboxLibraryApiKey = incomingKey;
        current.torboxLibraryEnabled = true;
      }, { reason: "torbox-cloud-connection" });
      if (!committed) return res.status(404).json({ error: "Config not found" });
      return res.json({ ok: true, connected: true, enabled: true, reusedDebridKey: !incomingKey });
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message, code: error.code || "TORBOX_CONNECT_FAILED" });
    }
  });

  app.post("/c/:token/torbox/scan", async (req, res) => {
    const config = await authenticatedConfig(req, res);
    if (!config) return;
    try {
      const tmdbKey = cleanApiKey(config.tmdbKey) || serverTmdbKey;
      const cache = await scanTorboxLibrary({ token: req.params.token, config, tmdbKey, force: true });
      return res.json({ ok: true, scannedAt: cache.scannedAt, summary: publicSummary(cache) });
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message, code: error.code || "TORBOX_SCAN_FAILED" });
    }
  });

  app.get("/c/:token/torbox/status", async (req, res) => {
    const config = await authenticatedConfig(req, res);
    if (!config) return;
    const cache = readCache(req.params.token);
    return res.json({
      connected: Boolean(resolveTorboxLibraryApiKey(config)),
      enabled: Boolean(config.torboxLibraryEnabled),
      usingDebridKey: !cleanApiKey(config.torboxLibraryApiKey) && Boolean(resolveTorboxLibraryApiKey(config)),
      scannedAt: cache?.scannedAt || null,
      summary: publicSummary(cache)
    });
  });

  app.get("/c/:token/torbox/play/:contentId", async (req, res) => {
    const config = await readConfig(req.params.token);
    if (!config || !torboxLibraryConfigured(config)) return res.sendStatus(404);
    const cache = readCache(req.params.token);
    const record = cache?.records?.find(item => item.streamId === req.params.contentId || item.contentId === req.params.contentId);
    if (!record) return res.sendStatus(404);
    try {
      const url = await requestTorboxDownloadUrl({
        source: record.source,
        itemId: record.itemId,
        fileId: record.fileId,
        apiKey: resolveTorboxLibraryApiKey(config)
      });
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      return res.redirect(302, url);
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: "TorBox playback link unavailable.", code: error.code || "TORBOX_PLAYBACK_FAILED" });
    }
  });
}

module.exports = {
  TORBOX_CATALOG_IDS,
  TorboxLibraryError,
  cleanApiKey,
  resolveTorboxLibraryApiKey,
  isTorboxLibraryCatalogId,
  isTorboxLibraryContentId,
  torboxLibraryConfigured,
  torboxRequest,
  testTorboxConnection,
  listTorboxSource,
  listTorboxFiles,
  normalizeTorboxItemFiles,
  scanTorboxLibrary,
  getTorboxCatalogMetas,
  getTorboxMeta,
  resolveTorboxStream,
  requestTorboxDownloadUrl,
  readCache,
  registerTorboxLibraryRoutes
};
