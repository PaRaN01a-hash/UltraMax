"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PREMIUMIZE_API_BASE = "https://www.premiumize.me/api";
const PREMIUMIZE_CATALOG_IDS = Object.freeze({
  movies: "premiumize_movies",
  series: "premiumize_series"
});
const PREMIUMIZE_CATALOG_ID_SET = new Set(Object.values(PREMIUMIZE_CATALOG_IDS));
const CACHE_TTL_MS = 15 * 60 * 1000;
const VIDEO_EXTENSIONS = new Set([
  ".mkv", ".mp4", ".m4v", ".avi", ".mov", ".wmv", ".webm", ".ts", ".m2ts", ".mpg", ".mpeg"
]);

class PremiumizeLibraryError extends Error {
  constructor(message, code = "PREMIUMIZE_LIBRARY_ERROR", statusCode = 502) {
    super(message);
    this.name = "PremiumizeLibraryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function cleanApiKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  return key.length && key.length <= 512 ? key : "";
}

function isPremiumizeLibraryCatalogId(id) {
  return PREMIUMIZE_CATALOG_ID_SET.has(String(id || ""));
}

function isPremiumizeLibraryContentId(id) {
  return /^pml_(?:movie|series|episode)_[A-Za-z0-9_-]+$/.test(String(id || ""));
}

function premiumizeLibraryConfigured(config) {
  return Boolean(config?.premiumizeLibraryEnabled && cleanApiKey(config?.premiumizeApiKey));
}

function stableId(prefix, value) {
  return `pml_${prefix}_${crypto.createHash("sha256").update(String(value)).digest("base64url").slice(0, 22)}`;
}

function cachePathForToken(token, dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data")) {
  const dir = path.join(dataDir, "premiumize-library");
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
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  return message && message.length <= 180 ? message : fallback;
}

async function premiumizeRequest(endpoint, apiKey, {
  params = null,
  fetchImpl = global.fetch,
  timeoutMs = 12000
} = {}) {
  const key = cleanApiKey(apiKey);
  if (!key) throw new PremiumizeLibraryError("Premiumize API key is required.", "PREMIUMIZE_KEY_REQUIRED", 400);
  if (typeof fetchImpl !== "function") throw new PremiumizeLibraryError("HTTP client unavailable.");

  const url = new URL(PREMIUMIZE_API_BASE + endpoint);
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
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`
      },
      signal: controller.signal
    });
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok || data?.status !== "success") {
      const code = typeof data?.code === "string" ? data.code : "PREMIUMIZE_REQUEST_FAILED";
      throw new PremiumizeLibraryError(safeErrorMessage(data, "Premiumize request failed."), code, response.ok ? 502 : response.status);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new PremiumizeLibraryError("Premiumize took too long to respond.", "PREMIUMIZE_TIMEOUT", 504);
    }
    if (error instanceof PremiumizeLibraryError) throw error;
    throw new PremiumizeLibraryError("Could not reach Premiumize.", "PREMIUMIZE_UNAVAILABLE", 502);
  } finally {
    clearTimeout(timer);
  }
}

async function testPremiumizeConnection(apiKey, options = {}) {
  const data = await premiumizeRequest("/account/info", apiKey, options);
  return {
    ok: true,
    premiumUntil: Number.isFinite(Number(data.premium_until)) ? Number(data.premium_until) : null,
    limitUsed: Number.isFinite(Number(data.limit_used)) ? Number(data.limit_used) : null
  };
}

async function listPremiumizeFiles(apiKey, options = {}) {
  const data = await premiumizeRequest("/item/listall", apiKey, options);
  return Array.isArray(data.files) ? data.files : [];
}

async function getPremiumizeItemDetails(apiKey, fileId, options = {}) {
  if (!fileId) throw new PremiumizeLibraryError("Premiumize file id is required.", "PREMIUMIZE_FILE_REQUIRED", 400);
  return premiumizeRequest("/item/details", apiKey, { ...options, params: { id: fileId } });
}

function isVideoFile(file) {
  const mime = String(file?.mime_type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.has(path.extname(String(file?.name || file?.path || "")).toLowerCase());
}

function stripReleaseNoise(value) {
  return String(value || "")
    .replace(/[\[\](){}]/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\b(?:2160p|1080p|720p|576p|480p|4k|uhd|hdr10\+?|hdr|dv|dolby\s*vision|web[- ]?dl|webrip|bluray|blu[- ]?ray|brrip|dvdrip|hdtv|remux|x26[45]|h\.?26[45]|hevc|avc|av1|10bit|8bit|ddp?\s*\d(?:\.\d)?|eac3|ac3|aac\s*\d(?:\.\d)?|dts(?:[- ]?hd)?|truehd|atmos|proper|repack|extended|unrated|limited|internal|multi|dual audio)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMediaFilename(fileName) {
  const base = String(fileName || "").replace(/\.[A-Za-z0-9]{2,5}$/, "");
  const episodeMatch = /\bS(\d{1,2})E(\d{1,3})\b/i.exec(base) || /\b(\d{1,2})x(\d{1,3})\b/i.exec(base);
  const yearMatches = [...base.matchAll(/\b(19\d{2}|20\d{2})\b/g)];
  const year = yearMatches.length ? Number(yearMatches[0][1]) : null;

  if (episodeMatch) {
    let titlePart = base.slice(0, episodeMatch.index);
    titlePart = titlePart.replace(/\b(19\d{2}|20\d{2})\b/g, " ");
    const title = stripReleaseNoise(titlePart);
    return {
      mediaType: "series",
      title,
      year,
      season: Number(episodeMatch[1]),
      episode: Number(episodeMatch[2])
    };
  }

  let titlePart = base;
  if (yearMatches.length) titlePart = base.slice(0, yearMatches[0].index);
  const title = stripReleaseNoise(titlePart);
  return { mediaType: "movie", title, year, season: null, episode: null };
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenDice(a, b) {
  const aa = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const bb = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  aa.forEach(token => { if (bb.has(token)) intersection += 1; });
  return (2 * intersection) / (aa.size + bb.size);
}

function scoreTmdbCandidate(parsed, candidate) {
  const candidateTitle = candidate.title || candidate.name || candidate.original_title || candidate.original_name || "";
  const a = normalizeTitle(parsed.title);
  const b = normalizeTitle(candidateTitle);
  if (!a || !b) return 0;
  const exact = a === b ? 1 : 0;
  const contains = a.includes(b) || b.includes(a) ? 1 : 0;
  const dice = tokenDice(a, b);
  let score = Math.max(exact ? 0.88 : 0, contains ? 0.72 : 0, dice * 0.78);
  const candidateYear = Number(String(candidate.release_date || candidate.first_air_date || "").slice(0, 4)) || null;
  if (parsed.year && candidateYear) {
    const diff = Math.abs(parsed.year - candidateYear);
    if (diff === 0) score += 0.12;
    else if (diff === 1) score += 0.05;
    else if (diff > 2) score -= 0.12;
  }
  return Math.max(0, Math.min(1, score));
}

async function tmdbSearch(parsed, tmdbKey, { fetchImpl = global.fetch, timeoutMs = 10000 } = {}) {
  if (!parsed?.title || !tmdbKey) return null;
  const tmdbType = parsed.mediaType === "series" ? "tv" : "movie";
  const attempts = [
    { query: parsed.title, useYearFilter: Boolean(parsed.year), scoreParsed: parsed }
  ];

  // A four-digit token in a series filename is ambiguous. It may be the
  // release year, but it may also be part of the actual title (for example
  // "The Wallabies: Inside Rugby World Cup 2023", released in 2024).
  // If the strict year-filtered lookup fails, retry without the year filter,
  // then once more treating that token as part of the title.
  if (parsed.year) {
    attempts.push({ query: parsed.title, useYearFilter: false, scoreParsed: parsed });
    if (parsed.mediaType === "series" && !normalizeTitle(parsed.title).includes(String(parsed.year))) {
      attempts.push({
        query: `${parsed.title} ${parsed.year}`,
        useYearFilter: false,
        scoreParsed: { ...parsed, title: `${parsed.title} ${parsed.year}`, year: null }
      });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (const attempt of attempts) {
      const url = new URL(`https://api.themoviedb.org/3/search/${tmdbType}`);
      url.searchParams.set("api_key", tmdbKey);
      url.searchParams.set("query", attempt.query);
      url.searchParams.set("include_adult", "false");
      if (attempt.useYearFilter && parsed.year) {
        url.searchParams.set(tmdbType === "tv" ? "first_air_date_year" : "year", String(parsed.year));
      }

      let response;
      try {
        response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      } catch {
        if (controller.signal.aborted) break;
        continue;
      }
      if (!response.ok) continue;

      const data = await response.json();
      const candidates = Array.isArray(data.results) ? data.results.slice(0, 12) : [];
      const ranked = candidates
        .map(candidate => ({ candidate, score: scoreTmdbCandidate(attempt.scoreParsed, candidate) }))
        .sort((a, b) => b.score - a.score);
      if (!ranked.length || ranked[0].score < 0.66) continue;

      const item = ranked[0].candidate;
      return {
        tmdbId: Number(item.id),
        mediaType: parsed.mediaType,
        title: item.title || item.name || parsed.title,
        year: Number(String(item.release_date || item.first_air_date || "").slice(0, 4)) || parsed.year || null,
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
        background: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
        overview: item.overview || "",
        rating: Number.isFinite(Number(item.vote_average)) ? Number(item.vote_average) : null,
        confidence: Number(ranked[0].score.toFixed(3))
      };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker));
  return results;
}

function compactFileRecord(file, parsed, match) {
  const createdAt = Number(file.created_at) || 0;
  if (!match) {
    return {
      fileId: String(file.id), name: String(file.name || ""), createdAt,
      parsed, match: null
    };
  }
  const movieId = parsed.mediaType === "movie" ? stableId("movie", file.id) : null;
  const seriesId = parsed.mediaType === "series" ? `pml_series_${match.tmdbId}` : null;
  const episodeId = parsed.mediaType === "series" ? stableId("episode", file.id) : null;
  return {
    fileId: String(file.id),
    name: String(file.name || ""),
    path: String(file.path || ""),
    size: Number(file.size) || 0,
    createdAt,
    mimeType: String(file.mime_type || ""),
    parsed,
    match,
    contentId: movieId || seriesId,
    streamId: movieId || episodeId
  };
}

function buildSummary(records) {
  const matched = records.filter(record => record.match);
  const movies = matched.filter(record => record.parsed.mediaType === "movie");
  const seriesEpisodes = matched.filter(record => record.parsed.mediaType === "series");
  const series = new Set(seriesEpisodes.map(record => record.match.tmdbId));
  return {
    files: records.length,
    matched: matched.length,
    unmatched: records.length - matched.length,
    movies: movies.length,
    series: series.size,
    episodes: seriesEpisodes.length
  };
}

async function scanPremiumizeLibrary({
  token,
  config,
  tmdbKey,
  force = false,
  fetchImpl = global.fetch,
  dataDir
}) {
  if (!token) throw new PremiumizeLibraryError("Ultra MAX token is required.", "ULTRAMAX_TOKEN_REQUIRED", 400);
  const apiKey = cleanApiKey(config?.premiumizeApiKey);
  if (!apiKey) throw new PremiumizeLibraryError("Premiumize is not connected.", "PREMIUMIZE_NOT_CONNECTED", 409);
  if (!tmdbKey) throw new PremiumizeLibraryError("TMDB matching is unavailable.", "TMDB_UNAVAILABLE", 409);

  const cached = readCache(token, dataDir);
  if (!force && cached?.scannedAt && Date.now() - new Date(cached.scannedAt).getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const remoteFiles = (await listPremiumizeFiles(apiKey, { fetchImpl })).filter(isVideoFile);
  const previousById = new Map((cached?.records || []).map(record => [record.fileId, record]));
  const matchMemo = new Map();

  const records = await mapWithConcurrency(remoteFiles, 4, async file => {
    const old = previousById.get(String(file.id));
    if (old && old.match && old.name === String(file.name || "") && Number(old.createdAt || 0) === Number(file.created_at || 0) && old.parsed) {
      return old;
    }
    const parsed = parseMediaFilename(file.name || file.path || "");
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

  const cache = {
    version: 1,
    scannedAt: new Date().toISOString(),
    records,
    summary: buildSummary(records)
  };
  writeCache(token, cache, dataDir);
  return cache;
}

async function ensureLibraryCache(args) {
  return scanPremiumizeLibrary({ ...args, force: false });
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

async function getPremiumizeCatalogMetas({ catalogId, type, extra = {}, token, config, tmdbKey, fetchImpl, dataDir }) {
  if (!isPremiumizeLibraryCatalogId(catalogId) || !premiumizeLibraryConfigured(config)) return { metas: [] };
  const cache = await ensureLibraryCache({ token, config, tmdbKey, fetchImpl, dataDir });
  const skip = Math.max(0, Number(extra?.skip) || 0);
  const pageSize = 100;

  if (catalogId === PREMIUMIZE_CATALOG_IDS.movies && type === "movie") {
    const records = cache.records
      .filter(record => record.match && record.parsed?.mediaType === "movie")
      .sort((a, b) => b.createdAt - a.createdAt);
    return { metas: records.slice(skip, skip + pageSize).map(record => metaFromRecord(record, "movie")) };
  }

  if (catalogId === PREMIUMIZE_CATALOG_IDS.series && type === "series") {
    const newestBySeries = new Map();
    cache.records
      .filter(record => record.match && record.parsed?.mediaType === "series")
      .sort((a, b) => b.createdAt - a.createdAt)
      .forEach(record => {
        const key = String(record.match.tmdbId);
        if (!newestBySeries.has(key)) newestBySeries.set(key, record);
      });
    const records = Array.from(newestBySeries.values());
    return { metas: records.slice(skip, skip + pageSize).map(record => metaFromRecord(record, "series")) };
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

async function getPremiumizeMeta({ id, type, token, config, tmdbKey, fetchImpl = global.fetch, dataDir }) {
  if (!isPremiumizeLibraryContentId(id) || !premiumizeLibraryConfigured(config)) return null;
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

async function resolvePremiumizeStream({ id, token, config, tmdbKey, fetchImpl = global.fetch, dataDir }) {
  if (!isPremiumizeLibraryContentId(id)) return { handled: false, streams: [] };
  if (!premiumizeLibraryConfigured(config)) return { handled: true, streams: [] };
  const cache = await ensureLibraryCache({ token, config, tmdbKey, fetchImpl, dataDir });
  const record = cache.records.find(item => item.streamId === id || (item.parsed?.mediaType === "movie" && item.contentId === id));
  if (!record?.fileId) return { handled: true, streams: [] };
  const details = await getPremiumizeItemDetails(config.premiumizeApiKey, record.fileId, { fetchImpl });
  if (!details?.link) return { handled: true, streams: [] };
  return {
    handled: true,
    streams: [{
      name: "☁️ Premiumize",
      title: record.name || record.match?.title || "Premiumize Cloud",
      url: details.link
    }]
  };
}

function publicSummary(cache) {
  return cache?.summary || { files: 0, matched: 0, unmatched: 0, movies: 0, series: 0, episodes: 0 };
}

function registerPremiumizeLibraryRoutes(app, deps) {
  const { readConfig, verifyPassword, checkAndRecord, clearKey, rateLimit, serverTmdbKey, mutateAccount } = deps;

  app.post("/api/premiumize/test", async (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    if (rateLimit && rateLimit(ip, 8, 60000)) return res.status(429).json({ error: "Too many requests." });
    try {
      const result = await testPremiumizeConnection(req.body?.apiKey);
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message, code: error.code || "PREMIUMIZE_TEST_FAILED" });
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

  app.post("/c/:token/premiumize/connect", async (req, res) => {
    const config = await authenticatedConfig(req, res);
    if (!config) return;
    const apiKey = cleanApiKey(req.body?.apiKey);
    if (!apiKey) return res.status(400).json({ error: "Premiumize API key is required.", code: "PREMIUMIZE_KEY_REQUIRED" });
    try {
      const connection = await testPremiumizeConnection(apiKey);
      if (typeof mutateAccount !== "function") {
        return res.status(503).json({ error: "Premiumize connection storage is unavailable.", code: "PREMIUMIZE_STORE_UNAVAILABLE" });
      }
      const committed = await mutateAccount(req.params.token, current => {
        current.premiumizeApiKey = apiKey;
        // Test & Connect is an explicit opt-in to Cloud Library. Persist the
        // enabled flag with the private key so a navigation/reload cannot
        // silently reset the checkbox before Generate is reached. Catalog
        // IDs are still added only by the normal Generate/save flow.
        current.premiumizeLibraryEnabled = true;
      }, { reason: "premiumize-cloud-connection" });
      if (!committed) return res.status(404).json({ error: "Config not found" });
      return res.json({ ok: true, connected: true, enabled: true, premiumUntil: connection.premiumUntil, limitUsed: connection.limitUsed });
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message, code: error.code || "PREMIUMIZE_CONNECT_FAILED" });
    }
  });

  app.post("/c/:token/premiumize/scan", async (req, res) => {
    const config = await authenticatedConfig(req, res);
    if (!config) return;
    try {
      const tmdbKey = cleanApiKey(config.tmdbKey) || serverTmdbKey;
      const cache = await scanPremiumizeLibrary({ token: req.params.token, config, tmdbKey, force: true });
      return res.json({ ok: true, scannedAt: cache.scannedAt, summary: publicSummary(cache) });
    } catch (error) {
      return res.status(error.statusCode || 502).json({ error: error.message, code: error.code || "PREMIUMIZE_SCAN_FAILED" });
    }
  });

  app.get("/c/:token/premiumize/status", async (req, res) => {
    const config = await authenticatedConfig(req, res);
    if (!config) return;
    const cache = readCache(req.params.token);
    return res.json({
      connected: Boolean(cleanApiKey(config.premiumizeApiKey)),
      enabled: Boolean(config.premiumizeLibraryEnabled),
      scannedAt: cache?.scannedAt || null,
      summary: publicSummary(cache)
    });
  });
}

module.exports = {
  PREMIUMIZE_CATALOG_IDS,
  PremiumizeLibraryError,
  cleanApiKey,
  isPremiumizeLibraryCatalogId,
  isPremiumizeLibraryContentId,
  premiumizeLibraryConfigured,
  parseMediaFilename,
  normalizeTitle,
  tmdbSearch,
  mapWithConcurrency,
  scoreTmdbCandidate,
  isVideoFile,
  premiumizeRequest,
  testPremiumizeConnection,
  listPremiumizeFiles,
  getPremiumizeItemDetails,
  scanPremiumizeLibrary,
  getPremiumizeCatalogMetas,
  getPremiumizeMeta,
  resolvePremiumizeStream,
  readCache,
  registerPremiumizeLibraryRoutes
};
