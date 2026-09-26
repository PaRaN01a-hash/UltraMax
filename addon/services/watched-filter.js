"use strict";

const crypto = require("crypto");

const watchedCache = new Map();
const watchedRefreshes = new Map();
const WATCHED_TTL = 15 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 7000;

function watchedCacheKey(token, traktToken, simklToken) {
  return crypto.createHash("sha256")
    .update(`${token || ""}\0${traktToken || ""}\0${simklToken || ""}`)
    .digest("hex");
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPagedArray(url, options, pageSize, maxPages = 20) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = url.includes("?") ? "&" : "?";
    const batch = await fetchJson(`${url}${separator}page=${page}&limit=${pageSize}`, options);
    if (!Array.isArray(batch)) throw new Error("Unexpected paginated response");
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

function countWatchedEpisodes(seasons) {
  return (Array.isArray(seasons) ? seasons : []).reduce((total, season) => {
    if (Number(season?.number) === 0) return total;
    return total + (Array.isArray(season?.episodes) ? season.episodes : [])
      .filter(episode => Number(episode?.plays || 0) > 0).length;
  }, 0);
}
async function refreshWatchedIds(cacheKey, traktToken, simklToken, traktClientId, simklClientId) {
  const ids = new Set();
  let successfulSources = 0;

  if (traktToken) {
    const headers = {
      Authorization: `Bearer ${traktToken}`,
      "trakt-api-version": "2",
      "trakt-api-key": traktClientId
    };
    const [moviesResult, showsResult] = await Promise.allSettled([
      fetchPagedArray("https://api.trakt.tv/sync/watched/movies", { headers }, 250),
      fetchPagedArray("https://api.trakt.tv/sync/watched/shows?extended=progress", { headers }, 100)
    ]);

    if (moviesResult.status === "fulfilled") {
      successfulSources += 1;
      (moviesResult.value || []).forEach(item => {
        const imdb = item?.movie?.ids?.imdb;
        if (imdb) ids.add(imdb);
      });
    }

    if (showsResult.status === "fulfilled") {
      successfulSources += 1;
      (showsResult.value || []).forEach(item => {
        const aired = Number(item?.show?.aired_episodes || 0);
        const watched = countWatchedEpisodes(item?.seasons);
        if (aired > 0 && watched >= aired && item?.show?.ids?.imdb) {
          ids.add(item.show.ids.imdb);
        }
      });
    }
  }
  if (simklToken) {
    try {
      const data = await fetchJson("https://api.simkl.com/sync/all-items/", {
        headers: {
          Authorization: `Bearer ${simklToken}`,
          "simkl-api-key": simklClientId
        }
      });
      successfulSources += 1;
      (data.movies || []).forEach(item => {
        const imdb = item?.movie?.ids?.imdb;
        if (imdb) ids.add(imdb);
      });
      (data.shows || []).forEach(item => {
        if (item?.status === "completed" && item?.show?.ids?.imdb) {
          ids.add(item.show.ids.imdb);
        }
      });
    } catch (error) {
      console.warn("[watched-filter] Simkl refresh failed open:", error.message);
    }
  }

  if (successfulSources > 0 || (!traktToken && !simklToken)) {
    watchedCache.set(cacheKey, { ids, ts: Date.now() });
    return ids;
  }

  return watchedCache.get(cacheKey)?.ids || new Set();
}

function startRefresh(cacheKey, traktToken, simklToken, traktClientId, simklClientId) {
  if (watchedRefreshes.has(cacheKey)) return watchedRefreshes.get(cacheKey);

  const refresh = refreshWatchedIds(
    cacheKey,
    traktToken,
    simklToken,
    traktClientId,
    simklClientId
  ).catch(error => {
    console.warn("[watched-filter] refresh failed open:", error.message);
    return watchedCache.get(cacheKey)?.ids || new Set();
  }).finally(() => {
    watchedRefreshes.delete(cacheKey);
  });

  watchedRefreshes.set(cacheKey, refresh);
  return refresh;
}

async function getWatchedIds(token, traktToken, simklToken, traktClientId, simklClientId) {
  const cacheKey = watchedCacheKey(token, traktToken, simklToken);
  const cached = watchedCache.get(cacheKey);

  if (cached && (Date.now() - cached.ts) < WATCHED_TTL) {
    return cached.ids;
  }

  startRefresh(cacheKey, traktToken, simklToken, traktClientId, simklClientId);
  return cached?.ids || new Set();
}

function filterWatched(result, watchedIds) {
  if (!watchedIds || watchedIds.size === 0 || !result?.metas) return result;
  const before = result.metas.length;
  result.metas = result.metas.filter(meta => !watchedIds.has(meta.imdb_id || meta.id));
  console.log("[watched-filter] exclusion " + JSON.stringify({
    excludedWatched: before - result.metas.length,
    finalResults: result.metas.length
  }));
  return result;
}

module.exports = {
  getWatchedIds,
  filterWatched,
  _test: { countWatchedEpisodes, watchedCacheKey }
};
