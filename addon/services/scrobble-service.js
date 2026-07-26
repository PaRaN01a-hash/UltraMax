const axios = require('axios');
const { getValidTraktToken } = require('./trakt-service');
const { getValidMalToken } = require('./mal-service');

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const SIMKL_CLIENT_ID = process.env.SIMKL_CLIENT_ID;

// In-memory only, per spec — no persistence needed. Key: token:imdbId:season:episode
const scrobbleState = new Map();
const SCROBBLE_STATE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function pruneScrobbleState() {
  const cutoff = Date.now() - SCROBBLE_STATE_TTL;
  for (const [key, entry] of scrobbleState.entries()) {
    if (entry.updatedAt < cutoff) scrobbleState.delete(key);
  }
}

async function scrobbleTrakt(userToken, config, { type, imdbId, season, episode, progress }) {
  const activeToken = await getValidTraktToken(userToken, config) || config.traktAccessToken;
  const ids = { imdb: imdbId };
  const pct = Number(progress) || 0;

  const payload = type === 'series'
    ? { show: { ids }, episode: { season: Number(season) || 1, number: Number(episode) || 1 }, progress: pct }
    : { movie: { ids }, progress: pct };

  // Trakt scrobble/start marks "now playing"; scrobble/stop finalizes a
  // watch once progress crosses the completion threshold Trakt itself uses.
  const action = pct >= 80 ? 'stop' : 'start';

  await axios.post(`https://api.trakt.tv/scrobble/${action}`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeToken}`,
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID
    },
    timeout: 10000
  });

  return { ok: true, action };
}

async function scrobbleSimkl(config, { type, imdbId, season, episode, progress }) {
  // Simkl has no "in progress" concept like Trakt — a checkin marks the item
  // watched, so only fire once a stream click clearly means "watching this".
  const pct = Number(progress) || 0;
  if (progress !== undefined && pct < 50) return { skipped: true, reason: 'progress below checkin threshold' };

  const ids = { imdb: imdbId };
  const payload = type === 'series'
    ? { show: { ids }, episode: { season: Number(season) || 1, number: Number(episode) || 1 } }
    : { movie: { ids } };

  await axios.post('https://api.simkl.com/checkins', payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.simklAccessToken}`,
      'simkl-api-key': SIMKL_CLIENT_ID
    },
    timeout: 10000
  });

  return { ok: true };
}

// MAL and AniList both key their list entries off their own internal anime
// ids, not IMDb ids — we resolve IMDb -> title (via TMDB, which we already
// have a key for) -> best-guess match on the target service, the same
// title-based approach used for the mal_*/anilist_* catalog rows.
async function resolveImdbTitle(imdbId, type, deps) {
  const { fetchCached, TMDB_KEY } = deps;
  const findData = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
  const item = type === 'movie'
    ? findData?.movie_results?.[0]
    : (findData?.tv_results?.[0] || findData?.movie_results?.[0]);
  return item ? (item.title || item.name || null) : null;
}

async function scrobbleMal(userToken, config, { type, imdbId, episode }, deps) {
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
    new URLSearchParams({ status: 'watching', num_watched_episodes: String(Number(episode) || 1) }),
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

async function scrobbleAnilist(config, { type, imdbId, episode }, deps) {
  const title = await resolveImdbTitle(imdbId, type, deps);
  if (!title) return { skipped: true, reason: 'could not resolve title from imdbId' };

  const searchQuery = `query ($search: String) { Media(search: $search, type: ANIME) { id } }`;
  const searchRes = await axios.post('https://graphql.anilist.co',
    { query: searchQuery, variables: { search: title } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );
  const mediaId = searchRes.data?.data?.Media?.id;
  if (!mediaId) return { skipped: true, reason: 'no AniList match found for "' + title + '"' };

  const mutation = `mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
    SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) { id progress status }
  }`;

  await axios.post('https://graphql.anilist.co', {
    query: mutation,
    variables: { mediaId, progress: Number(episode) || 1, status: 'CURRENT' }
  }, {
    headers: {
      'Authorization': `Bearer ${config.anilistAccessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  return { ok: true, mediaId };
}

function registerScrobbleRoute(app, deps) {
  const { loadConfigs, TMDB_KEY, fetchCached } = deps;

  app.post('/c/:token/scrobble', async (req, res) => {
    const { token } = req.params;
    const { type, imdbId, season, episode, progress } = req.body || {};

    if (!imdbId || !/^tt\d+/i.test(String(imdbId))) {
      return res.status(400).json({ error: 'Missing or invalid imdbId' });
    }

    const configs = loadConfigs();
    const config = configs[token];
    if (!config) return res.status(404).json({ error: 'Token not found' });

    const normalisedType = type === 'movie' ? 'movie' : 'series';
    const event = { type: normalisedType, imdbId, season, episode, progress };

    pruneScrobbleState();
    const stateKey = `${token}:${imdbId}:${season || ''}:${episode || ''}`;
    scrobbleState.set(stateKey, { ...event, updatedAt: Date.now() });

    const tmdbDeps = { TMDB_KEY, fetchCached };
    const services = {};

    const jobs = [];
    if (config.traktAccessToken) {
      jobs.push(scrobbleTrakt(token, config, event).then(r => { services.trakt = r; }).catch(e => { services.trakt = { error: e.response?.data?.error || e.message }; }));
    }
    if (config.simklAccessToken) {
      jobs.push(scrobbleSimkl(config, event).then(r => { services.simkl = r; }).catch(e => { services.simkl = { error: e.response?.data?.error || e.message }; }));
    }
    if (config.malAccessToken) {
      jobs.push(scrobbleMal(token, config, event, tmdbDeps).then(r => { services.mal = r; }).catch(e => { services.mal = { error: e.response?.data?.message || e.message }; }));
    }
    if (config.anilistAccessToken) {
      jobs.push(scrobbleAnilist(config, event, tmdbDeps).then(r => { services.anilist = r; }).catch(e => { services.anilist = { error: e.message }; }));
    }

    await Promise.all(jobs);

    res.json({ ok: true, services });
  });
}

module.exports = {
  registerScrobbleRoute,
  scrobbleState
};
