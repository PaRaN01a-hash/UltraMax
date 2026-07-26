const axios = require("axios");

const cache = new Map();

// ── TMDB request queue ──────────────────────────────────────────
// TMDB responds with 429 when too many requests land at once (catalog
// refills + certification lookups can otherwise fan out to 40-100
// concurrent calls). Cap concurrency and retry 429s with backoff so a
// burst degrades gracefully instead of spamming errors.
const TMDB_MAX_CONCURRENT = 5;
const TMDB_MAX_RETRIES = 3;
const TMDB_BASE_BACKOFF_MS = 1000;

let tmdbActive = 0;
const tmdbQueue = [];

function isTmdbUrl(url) {
  return url.includes("api.themoviedb.org");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runNextTmdb() {
  if (tmdbActive >= TMDB_MAX_CONCURRENT || tmdbQueue.length === 0) return;

  tmdbActive++;
  const { task, resolve, reject } = tmdbQueue.shift();

  task()
    .then(resolve, reject)
    .finally(() => {
      tmdbActive--;
      runNextTmdb();
    });
}

function enqueueTmdb(task) {
  return new Promise((resolve, reject) => {
    tmdbQueue.push({ task, resolve, reject });
    runNextTmdb();
  });
}

async function tmdbGetWithRetry(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axios.get(url, { timeout: 5000 });
    } catch (error) {
      const status = error?.response?.status;
      if (status !== 429 || attempt >= TMDB_MAX_RETRIES) throw error;

      const retryAfterHeader = Number(error.response.headers?.["retry-after"]);
      const backoff = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : TMDB_BASE_BACKOFF_MS * Math.pow(2, attempt);

      await delay(backoff);
    }
  }
}
// ─────────────────────────────────────────────────────────────────

async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);

  const res = isTmdbUrl(url)
    ? await enqueueTmdb(() => tmdbGetWithRetry(url))
    : await axios.get(url, { timeout: 5000 });

  cache.set(url, res.data);

  setTimeout(() => cache.delete(url), 300000);

  return res.data;
}

async function fetchTrakt(path, traktClientId, customHeaders = null) {
  if (!traktClientId) return [];

  const url = `https://api.trakt.tv${path}`;

  if (!customHeaders && cache.has(url)) return cache.get(url);

  try {
    const headers = customHeaders || {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": traktClientId
    };
    const res = await axios.get(url, { timeout: 5000, headers });
    if (!customHeaders) {
      cache.set(url, res.data);
      setTimeout(() => cache.delete(url), 300000);
    }
    return res.data;
  } catch (e) {
    console.error("Trakt fetch error:", e.message);
    return [];
  }
}


module.exports = {
  fetchCached,
  fetchTrakt
};
