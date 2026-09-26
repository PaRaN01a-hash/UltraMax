const axios = require('axios');
const { getValidTraktToken } = require('./trakt-service');
const { getValidMalToken } = require('./mal-service');
const { resolveImdbTitle } = require('./scrobble-service');

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID;

// GET /rating is hit from the Step 2 hover popover, which can fire on every
// mouseover — cache short-term so repeated hovers over the same title don't
// re-run title-search resolution or refetch a service's full ratings list
// on every hover. Same in-memory-only pattern as scrobbleState.
const ratingCache = new Map();
const RATING_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function cacheKey(token, imdbId, type) {
  return `${token}:${imdbId}:${type}`;
}

function readRatingCache(key) {
  const entry = ratingCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    ratingCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeRatingCache(key, value) {
  ratingCache.set(key, { value, expiresAt: Date.now() + RATING_CACHE_TTL });
}

// ── WRITE ────────────────────────────────────────────────────────────────

async function rateTrakt(userToken, config, { type, imdbId, rating, season, episode }) {
  const activeToken = await getValidTraktToken(userToken, config) || config.traktAccessToken;
  const ids = { imdb: imdbId };

  const payload = type === 'series'
    ? (season && episode
        ? { shows: [{ ids, seasons: [{ number: Number(season), episodes: [{ number: Number(episode), rating }] }] }] }
        : { shows: [{ ids, rating }] })
    : { movies: [{ ids, rating }] };

  await axios.post('https://api.trakt.tv/sync/ratings', payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`,
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID
    },
    timeout: 10000
  });

  return { ok: true };
}

async function rateSimkl(config, { type, imdbId, rating, season, episode }) {
  const ids = { imdb: imdbId };

  const payload = type === 'series'
    ? (season && episode
        ? { shows: [{ ids, seasons: [{ number: Number(season), episodes: [{ number: Number(episode), rating }] }] }] }
        : { shows: [{ ids, rating }] })
    : { movies: [{ ids, rating }] };

  await axios.post('https://api.simkl.com/sync/ratings', payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.simklAccessToken}`,
      'simkl-api-key': SIMKL_CLIENT_ID
    },
    timeout: 10000
  });

  return { ok: true };
}

async function rateMal(userToken, config, { type, imdbId, rating }, deps) {
  const title = await resolveImdbTitle(imdbId, type, deps);
  if (!title) return { skipped: true, reason: 'could not resolve title from imdbId' };

  const activeToken = await getValidMalToken(userToken, config) || config.malAccessToken;

  const searchRes = await axios.get(`https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(title)}&limit=1`, {
    headers: { 'Authorization': `Bearer ${activeToken}` },
    timeout: 10000
  });
  const malId = searchRes.data?.data?.[0]?.node?.id;
  if (!malId) return { skipped: true, reason: 'no MAL match found for "' + title + '"' };

  await axios.patch(
    `https://api.myanimelist.net/v2/anime/${malId}/my_list_status`,
    new URLSearchParams({ score: String(rating) }),
    {
      headers: {
        'Authorization': `Bearer ${activeToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    }
  );

  return { ok: true, malId };
}

async function rateAnilist(config, { type, imdbId, rating }, deps) {
  const title = await resolveImdbTitle(imdbId, type, deps);
  if (!title) return { skipped: true, reason: 'could not resolve title from imdbId' };

  const searchQuery = `query ($search: String) { Media(search: $search, type: ANIME) { id } }`;
  const searchRes = await axios.post('https://graphql.anilist.co',
    { query: searchQuery, variables: { search: title } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  const mediaId = searchRes.data?.data?.Media?.id;
  if (!mediaId) return { skipped: true, reason: 'no AniList match found for "' + title + '"' };

  // AniList scores are 1-100 on the default (POINT_100) scoring format.
  const mutation = `mutation ($mediaId: Int, $score: Float) {
    SaveMediaListEntry(mediaId: $mediaId, score: $score) { id score }
  }`;

  await axios.post('https://graphql.anilist.co', {
    query: mutation,
    variables: { mediaId, score: Number(rating) * 10 }
  }, {
    headers: {
      'Authorization': `Bearer ${config.anilistAccessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  return { ok: true, mediaId };
}

// ── READ ─────────────────────────────────────────────────────────────────

async function getTraktRating(userToken, config, { type, imdbId, season, episode }) {
  const activeToken = await getValidTraktToken(userToken, config) || config.traktAccessToken;
  const kind = type === 'movie' ? 'movies' : (season && episode ? 'episodes' : 'shows');

  const res = await axios.get(`https://api.trakt.tv/sync/ratings/${kind}`, {
    headers: {
      'Authorization': `Bearer ${activeToken}`,
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID
    },
    timeout: 10000
  });

  const list = Array.isArray(res.data) ? res.data : [];

  if (kind === 'episodes') {
    const match = list.find(e =>
      e.show?.ids?.imdb === imdbId &&
      e.episode?.season === Number(season) &&
      e.episode?.number === Number(episode)
    );
    return match ? match.rating : null;
  }

  const key = kind === 'movies' ? 'movie' : 'show';
  const match = list.find(e => e[key]?.ids?.imdb === imdbId);
  return match ? match.rating : null;
}

async function getSimklRating(config, { type, imdbId, season, episode }) {
  const kind = type === 'movie' ? 'movies' : 'shows';

  const res = await axios.get(`https://api.simkl.com/sync/ratings/${kind}`, {
    headers: {
      'Authorization': `Bearer ${config.simklAccessToken}`,
      'simkl-api-key': SIMKL_CLIENT_ID
    },
    timeout: 10000
  });

  const list = Array.isArray(res.data) ? res.data : [];
  const key = kind === 'movies' ? 'movie' : 'show';
  const match = list.find(e => e[key]?.ids?.imdb === imdbId);
  if (!match) return null;

  if (season && episode && Array.isArray(match.seasons)) {
    const s = match.seasons.find(x => x.number === Number(season));
    const e = s?.episodes?.find(x => x.number === Number(episode));
    return e ? e.rating : null;
  }

  return typeof match.rating === 'number' ? match.rating : null;
}

async function getMalRating(userToken, config, { type, imdbId }, deps) {
  const title = await resolveImdbTitle(imdbId, type, deps);
  if (!title) return null;

  const activeToken = await getValidMalToken(userToken, config) || config.malAccessToken;

  const searchRes = await axios.get(`https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(title)}&limit=1`, {
    headers: { 'Authorization': `Bearer ${activeToken}` },
    timeout: 10000
  });
  const malId = searchRes.data?.data?.[0]?.node?.id;
  if (!malId) return null;

  const detailRes = await axios.get(`https://api.myanimelist.net/v2/anime/${malId}?fields=my_list_status`, {
    headers: { 'Authorization': `Bearer ${activeToken}` },
    timeout: 10000
  });

  const score = detailRes.data?.my_list_status?.score;
  return score ? score : null;
}

async function getAnilistRating(config, { type, imdbId }, deps) {
  const title = await resolveImdbTitle(imdbId, type, deps);
  if (!title) return null;

  const searchQuery = `query ($search: String) { Media(search: $search, type: ANIME) { id } }`;
  const searchRes = await axios.post('https://graphql.anilist.co',
    { query: searchQuery, variables: { search: title } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  const mediaId = searchRes.data?.data?.Media?.id;
  if (!mediaId) return null;

  const query = `query ($id: Int) { Media(id: $id) { mediaListEntry { score } } }`;
  const res = await axios.post('https://graphql.anilist.co',
    { query, variables: { id: mediaId } },
    {
      headers: {
        'Authorization': `Bearer ${config.anilistAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }
  );

  const score = res.data?.data?.Media?.mediaListEntry?.score;
  return score ? score / 10 : null;
}

// ── ROUTES ───────────────────────────────────────────────────────────────

function registerRatingRoutes(app, deps) {
  const { loadConfigs, readConfig = async token => loadConfigs()[token], TMDB_KEY, fetchCached } = deps;
  const tmdbDeps = { TMDB_KEY, fetchCached };

  app.post('/c/:token/rate', async (req, res) => {
    const { token } = req.params;
    const { type, imdbId, rating, season, episode } = req.body || {};

    if (!imdbId || !/^tt\d+/i.test(String(imdbId))) {
      return res.status(400).json({ error: 'Missing or invalid imdbId' });
    }

    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 10) {
      return res.status(400).json({ error: 'rating must be an integer between 1 and 10' });
    }

    const config = await readConfig(token);
    if (!config) return res.status(404).json({ error: 'Token not found' });

    const normalisedType = type === 'movie' ? 'movie' : 'series';
    const event = { type: normalisedType, imdbId, rating: numericRating, season, episode };

    const services = {};
    const jobs = [];

    if (config.traktAccessToken) {
      jobs.push(rateTrakt(token, config, event).then(r => { services.trakt = r; }).catch(e => { services.trakt = { error: e.response?.data?.error || e.message }; }));
    }
    if (config.simklAccessToken) {
      jobs.push(rateSimkl(config, event).then(r => { services.simkl = r; }).catch(e => { services.simkl = { error: e.response?.data?.error || e.message }; }));
    }
    if (config.malAccessToken) {
      jobs.push(rateMal(token, config, event, tmdbDeps).then(r => { services.mal = r; }).catch(e => { services.mal = { error: e.response?.data?.message || e.message }; }));
    }
    if (config.anilistAccessToken) {
      jobs.push(rateAnilist(config, event, tmdbDeps).then(r => { services.anilist = r; }).catch(e => { services.anilist = { error: e.message }; }));
    }

    await Promise.all(jobs);

    ratingCache.delete(cacheKey(token, imdbId, normalisedType));

    res.json({ ok: true, services });
  });

  app.get('/c/:token/rating', async (req, res) => {
    const { token } = req.params;
    const { imdbId, type, season, episode } = req.query || {};

    if (!imdbId || !/^tt\d+/i.test(String(imdbId))) {
      return res.status(400).json({ error: 'Missing or invalid imdbId' });
    }

    const config = await readConfig(token);
    if (!config) return res.status(404).json({ error: 'Token not found' });

    const normalisedType = type === 'movie' ? 'movie' : 'series';
    const key = cacheKey(token, imdbId, normalisedType);
    const cached = readRatingCache(key);
    if (cached) return res.json(cached);

    const event = { type: normalisedType, imdbId, season, episode };
    const ratings = {};
    const jobs = [];

    if (config.traktAccessToken) {
      jobs.push(getTraktRating(token, config, event).then(r => { ratings.trakt = r; }).catch(() => { ratings.trakt = null; }));
    }
    if (config.simklAccessToken) {
      jobs.push(getSimklRating(config, event).then(r => { ratings.simkl = r; }).catch(() => { ratings.simkl = null; }));
    }
    if (config.malAccessToken) {
      jobs.push(getMalRating(token, config, event, tmdbDeps).then(r => { ratings.mal = r; }).catch(() => { ratings.mal = null; }));
    }
    if (config.anilistAccessToken) {
      jobs.push(getAnilistRating(config, event, tmdbDeps).then(r => { ratings.anilist = r; }).catch(() => { ratings.anilist = null; }));
    }

    await Promise.all(jobs);

    writeRatingCache(key, ratings);
    res.json(ratings);
  });
}

module.exports = {
  registerRatingRoutes
};
