const axios = require('axios');
const fs = require('fs');
const pathModule = require('path');

const SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID;
const SIMKL_BASE = 'https://api.simkl.com';
const CONFIGS_PATH = pathModule.join(process.env.DATA_DIR || pathModule.join(__dirname, ".."), "configs.json");

async function fetchSimkl(path, accessToken, userToken = null) {
  try {
    const res = await axios.get(`${SIMKL_BASE}${path}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'simkl-api-key': SIMKL_CLIENT_ID
      },
      timeout: 10000
    });
    return res.data;
  } catch(e) {
    if(e.response && e.response.status === 401 && userToken) {
      // Token invalid — clear it so user knows to reconnect
      console.log('[Simkl] Token invalid for:', userToken.slice(0,8), '— clearing');
      try {
        const configs = JSON.parse(fs.readFileSync(CONFIGS_PATH, 'utf8'));
        if(configs[userToken]) {
          delete configs[userToken].simklAccessToken;
          delete configs[userToken].simklUser;
          fs.writeFileSync(CONFIGS_PATH, JSON.stringify(configs, null, 2));
        }
      } catch(err) {}
    }
    throw e;
  }
}

async function simklToMetas(items, type, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey, deps) {
  const { resultsToMetas, fetchCached, TMDB_KEY } = deps;
  if(!items || !items.length) return [];

  const key = type === 'series' ? 'show' : 'movie';
  const metas = [];

  for(const item of items) {
    const media = item[key];
    if(!media) continue;
    const imdb = media.ids?.imdb;
    const tmdbId = media.ids?.tmdb;
    if(!imdb && !tmdbId) continue;

    try {
      const tmdbType = type === 'series' ? 'tv' : 'movie';
      const id = tmdbId || imdb;
      const data = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${id}?api_key=${TMDB_KEY}`);
      if(!data || !data.id) continue;

      const posterPath = data.poster_path;
      if(!posterPath) continue;

      let poster = rpdbKey
        ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdb}.jpg`
        : `https://image.tmdb.org/t/p/w500${posterPath}`;

      metas.push({
        id: imdb || `tmdb:${tmdbId}`,
        type,
        name: data.title || data.name,
        poster,
        background: data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : null
      });
    } catch(e) {}
  }
  return metas;
}

async function handleSimklCatalog(handler, type, simklAccessToken, rpdbKey, tpKey, excludeUnreleased, deps, userToken = null) {
  if(!simklAccessToken) return { metas: [] };

  const key = type === 'series' ? 'shows' : 'movies';
  const itemKey = type === 'series' ? 'show' : 'movie';

  try {
    switch(handler) {
      case 'simkl_watchlist': {
        const data = await fetchSimkl(`/sync/all-items/${key}?extended=full`, simklAccessToken, userToken);
        const items = (data[key] || []).filter(i => i.status === 'plantowatch');
        return { metas: await simklToMetas(items, type, rpdbKey, tpKey, excludeUnreleased, null, null, deps) };
      }
      case 'simkl_watching': {
        const data = await fetchSimkl(`/sync/all-items/${key}?extended=full`, simklAccessToken, userToken);
        const items = (data[key] || []).filter(i => i.status === 'watching');
        return { metas: await simklToMetas(items, type, rpdbKey, tpKey, excludeUnreleased, null, null, deps) };
      }
      case 'simkl_completed': {
        const data = await fetchSimkl(`/sync/all-items/${key}?extended=full`, simklAccessToken, userToken);
        const items = (data[key] || [])
          .filter(i => i.status === 'completed')
          .sort((a,b) => (b.last_watched_at||'').localeCompare(a.last_watched_at||''));
        return { metas: await simklToMetas(items, type, rpdbKey, tpKey, excludeUnreleased, null, null, deps) };
      }
      case 'simkl_rated': {
        const data = await fetchSimkl(`/sync/all-items/${key}?extended=full`, simklAccessToken, userToken);
        const items = (data[key] || [])
          .filter(i => i.user_rating)
          .sort((a,b) => (b.user_rating||0) - (a.user_rating||0));
        return { metas: await simklToMetas(items, type, rpdbKey, tpKey, excludeUnreleased, null, null, deps) };
      }
      default:
        return { metas: [] };
    }
  } catch(e) {
    console.error('[Simkl]', handler, e.message);
    return { metas: [] };
  }
}

module.exports = { handleSimklCatalog };
