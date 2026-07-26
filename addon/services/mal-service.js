const axios = require('axios');
const { loadConfigs, saveConfigs } = require("../utils/config-store");
const { getImdbId } = require("./metadata-service");

const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID;
const MAL_CLIENT_SECRET = process.env.MAL_CLIENT_SECRET;

// In-memory blacklist for permanently failed refresh tokens, same pattern
// as trakt-service.js's _traktRefreshBlacklist.
const _malRefreshBlacklist = new Map();
const BLACKLIST_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function refreshMalToken(userToken, config) {
  if (!config.malRefreshToken || !MAL_CLIENT_ID) return null;

  const blacklistedAt = _malRefreshBlacklist.get(userToken);
  if (blacklistedAt && Date.now() - blacklistedAt < BLACKLIST_TTL) return null;

  try {
    const res = await axios.post('https://myanimelist.net/v1/oauth2/token', new URLSearchParams({
      client_id: MAL_CLIENT_ID,
      client_secret: MAL_CLIENT_SECRET || '',
      refresh_token: config.malRefreshToken,
      grant_type: 'refresh_token'
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const data = res.data;
    if (!data.access_token) return null;

    const configs = loadConfigs();
    if (!configs[userToken]) return data.access_token;
    configs[userToken].malAccessToken = data.access_token;
    configs[userToken].malRefreshToken = data.refresh_token || config.malRefreshToken;
    configs[userToken].malTokenExpiry = Date.now() + (data.expires_in * 1000);
    saveConfigs(configs);
    console.log('[MAL] Token refreshed for:', userToken.slice(0, 8));
    return data.access_token;
  } catch (e) {
    const status = e.response && e.response.status;
    if (status === 400 || status === 401) {
      _malRefreshBlacklist.set(userToken, Date.now());
      console.error('[MAL] Refresh permanently failed for', userToken.slice(0, 8), '— blacklisted 24h:', e.message);
    } else {
      console.error('[MAL] Refresh failed:', e.message);
    }
    return null;
  }
}

async function getValidMalToken(userToken, config) {
  if (!config.malAccessToken) return null;
  if (config.malTokenExpiry && Date.now() > config.malTokenExpiry - 300000) {
    const newToken = await refreshMalToken(userToken, config);
    return newToken || config.malAccessToken;
  }
  return config.malAccessToken;
}

// MAL's anime list API returns MAL-specific ids, titles and pictures — no
// TMDB/IMDb ids. We resolve each entry to a TMDB match by title search (the
// same approach the "actor"/"person" custom catalog sources already use in
// catalog-handler-service.js) and pull the IMDb id from there so metas come
// out in the same tt-id shape Stremio/Nuvio expect everywhere else.
async function malAnimeListToMetas(entries, type, deps) {
  const { fetchCached, TMDB_KEY } = deps;
  if (!entries || !entries.length) return [];

  const tmdbType = type === 'movie' ? 'movie' : 'tv';
  const metas = [];

  for (const entry of entries) {
    const node = entry.node;
    const title = node?.title || node?.alternative_titles?.en;
    if (!title) continue;

    try {
      const searchData = await fetchCached(
        `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}`
      );
      const match = (searchData.results || [])[0];
      if (!match) continue;

      const imdb = await getImdbId(match.id, type);
      if (!imdb) continue;

      metas.push({
        id: imdb,
        type,
        name: match.title || match.name || title,
        poster: match.poster_path
          ? `https://image.tmdb.org/t/p/w500${match.poster_path}`
          : (node.main_picture?.large || node.main_picture?.medium || null),
        background: match.backdrop_path ? `https://image.tmdb.org/t/p/original${match.backdrop_path}` : null
      });
    } catch (e) {
      // Skip titles that fail to resolve rather than failing the whole row.
    }
  }

  return metas;
}

async function fetchMalList(status, accessToken, sort) {
  const params = new URLSearchParams({
    status,
    limit: '100',
    fields: 'list_status,alternative_titles,main_picture',
    nsfw: 'true'
  });
  if (sort) params.set('sort', sort);

  const res = await axios.get(`https://api.myanimelist.net/v2/users/@me/animelist?${params}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    timeout: 10000
  });

  return res.data?.data || [];
}

async function handleMalCatalog(handler, type, malAccessToken, deps, userToken = null, userConfig = null) {
  if (!malAccessToken) return { metas: [] };

  let activeToken = malAccessToken;
  if (userToken && userConfig) {
    activeToken = await getValidMalToken(userToken, userConfig) || malAccessToken;
  }

  try {
    switch (handler) {
      case 'mal_watching': {
        const entries = await fetchMalList('watching', activeToken);
        return { metas: await malAnimeListToMetas(entries, type, deps) };
      }
      case 'mal_plantowatch': {
        const entries = await fetchMalList('plan_to_watch', activeToken);
        return { metas: await malAnimeListToMetas(entries, type, deps) };
      }
      case 'mal_completed': {
        const entries = await fetchMalList('completed', activeToken, 'list_updated_at');
        return { metas: await malAnimeListToMetas(entries, type, deps) };
      }
      default:
        return { metas: [] };
    }
  } catch (e) {
    console.error('[MAL]', handler, e.response?.data || e.message);
    return { metas: [] };
  }
}

module.exports = {
  handleMalCatalog,
  getValidMalToken,
  MAL_CLIENT_ID,
  MAL_CLIENT_SECRET
};
