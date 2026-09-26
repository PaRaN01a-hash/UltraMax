const axios = require('axios');
const { getImdbId } = require("./metadata-service");
const {
  resolveAnimeItemsToKitsuMetas
} = require("./kitsu-id-service");

const ANILIST_GRAPHQL = 'https://graphql.anilist.co';

async function anilistGraphQL(query, variables, accessToken) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await axios.post(ANILIST_GRAPHQL, { query, variables }, { headers, timeout: 10000 });
  return res.data?.data;
}

function currentAnilistSeason() {
  const month = new Date().getUTCMonth() + 1; // 1-12
  const year = new Date().getUTCFullYear();
  let season;
  if (month <= 3) season = 'WINTER';
  else if (month <= 6) season = 'SPRING';
  else if (month <= 9) season = 'SUMMER';
  else season = 'FALL';
  return { season, year };
}

// AniList doesn't expose TMDB/IMDb ids directly. We resolve each title to a
// TMDB match by title+year search — the same practical approach the Kitsu
// ID service (kitsu-id-service.js) uses internally for its own TMDB<->Kitsu
// matching, applied here since there's no first-class AniList<->TMDB dataset
// wired into this codebase yet.
async function resolveAnilistTitleToImdb(title, year, deps) {
  const { fetchCached, TMDB_KEY } = deps;
  if (!title) return null;

  try {
    const params = new URLSearchParams({ api_key: TMDB_KEY, query: title });
    if (year) params.set('first_air_date_year', String(year));

    const searchData = await fetchCached(`https://api.themoviedb.org/3/search/tv?${params}`);
    const match = (searchData.results || [])[0];
    if (!match) return null;

    return await getImdbId(match.id, 'series');
  } catch (e) {
    return null;
  }
}

async function anilistMediaToMetas(mediaList, deps, animePresentationMode = "unified") {
  if (animePresentationMode === "anisync") {
    const items = (mediaList || [])
      .filter(media => media && media.format !== "MOVIE")
      .map(media => ({
        title: media.title?.english || media.title?.romaji,
        year: media.seasonYear || media.startDate?.year,
        anilistId: media.id,
        malId: media.idMal
      }))
      .filter(item => item.title);
    const result = await resolveAnimeItemsToKitsuMetas(items, {
      fetchImpl: deps.fetchImpl
    });
    console.log(
      `[Anime presentation] AniList mapping: mode=anisync, ` +
      `candidates=${items.length}, mappingFailures=${result.diagnostics.mappingFailures}, ` +
      `duplicatesRemoved=${result.diagnostics.duplicatesRemoved}, finalResults=${result.metas.length}`
    );
    return result.metas;
  }

  const metas = [];

  for (const media of mediaList || []) {
    // Anime movies are excluded so this stays a clean "series" row —
    // consistent with how the rest of Ultra MAX splits movie/series catalogs.
    if (!media || media.format === 'MOVIE') continue;

    const title = media.title?.english || media.title?.romaji;
    if (!title) continue;

    const year = media.seasonYear || media.startDate?.year;
    const imdb = await resolveAnilistTitleToImdb(title, year, deps);
    if (!imdb) continue;

    metas.push({
      id: imdb,
      type: 'series',
      name: title,
      poster: media.coverImage?.extraLarge || media.coverImage?.large || null,
      background: media.bannerImage || null
    });
  }

  return metas;
}

const MEDIA_FIELDS = `
  id idMal format
  title { romaji english }
  startDate { year }
  seasonYear
  coverImage { extraLarge large }
  bannerImage
`;

// Superset of MEDIA_FIELDS used only for the AI-recommendation history pull —
// adds genres/tags/score/studio data the regular catalog rows don't need,
// so the plain browsing queries above stay as light as before.
const AI_HISTORY_MEDIA_FIELDS = `
  title { romaji english }
  seasonYear
  startDate { year }
  format
  genres
  tags { name }
  averageScore
  studios(isMain: true) { nodes { name } }
`;

const AI_HISTORY_QUERY = `
query ($userId: Int) {
  completed: MediaListCollection(userId: $userId, type: ANIME, status: COMPLETED) {
    lists { entries { score media { ${AI_HISTORY_MEDIA_FIELDS} } } }
  }
  current: MediaListCollection(userId: $userId, type: ANIME, status: CURRENT) {
    lists { entries { score media { ${AI_HISTORY_MEDIA_FIELDS} } } }
  }
}`;

// Flattens a user's AniList completed + currently-watching anime into the
// shape geminiAnimeAnilistRecommendations needs to build its prompt.
async function getAnilistAiHistory(accessToken, userId) {
  if (!accessToken || !userId) return [];

  try {
    const data = await anilistGraphQL(AI_HISTORY_QUERY, { userId }, accessToken);
    const entries = [
      ...(data?.completed?.lists || []),
      ...(data?.current?.lists || [])
    ].flatMap(l => l.entries || []);

    return entries
      .filter(e => e?.media && e.media.format !== 'MOVIE')
      .map(e => ({
        title: e.media.title?.english || e.media.title?.romaji || null,
        year: e.media.seasonYear || e.media.startDate?.year || null,
        genres: e.media.genres || [],
        tags: (e.media.tags || []).map(t => t.name),
        studios: (e.media.studios?.nodes || []).map(s => s.name),
        score: e.score || null
      }))
      .filter(item => item.title);
  } catch (e) {
    console.error('[AniList] getAnilistAiHistory', e.response?.data || e.message);
    return [];
  }
}

const MEDIA_LIST_QUERY = `
query ($userId: Int, $status: MediaListStatus) {
  MediaListCollection(userId: $userId, type: ANIME, status: $status) {
    lists {
      entries {
        media { ${MEDIA_FIELDS} }
      }
    }
  }
}`;

const TRENDING_QUERY = `
query {
  Page(page: 1, perPage: 50) {
    media(sort: TRENDING_DESC, type: ANIME) { ${MEDIA_FIELDS} }
  }
}`;

const SEASONAL_QUERY = `
query ($season: MediaSeason, $seasonYear: Int) {
  Page(page: 1, perPage: 50) {
    media(season: $season, seasonYear: $seasonYear, type: ANIME, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
  }
}`;

const VIEWER_QUERY = `query { Viewer { id name } }`;

async function getAnilistViewer(accessToken) {
  const data = await anilistGraphQL(VIEWER_QUERY, {}, accessToken);
  return data?.Viewer || null;
}

async function handleAnilistCatalog(handler, anilistAccessToken, anilistUserId, deps, animePresentationMode = "unified") {
  try {
    switch (handler) {
      case 'anilist_watching': {
        if (!anilistAccessToken || !anilistUserId) return { metas: [] };
        const data = await anilistGraphQL(MEDIA_LIST_QUERY, { userId: anilistUserId, status: 'CURRENT' }, anilistAccessToken);
        const entries = (data?.MediaListCollection?.lists || []).flatMap(l => l.entries || []);
        return { metas: await anilistMediaToMetas(entries.map(e => e.media), deps, animePresentationMode) };
      }
      case 'anilist_plantowatch': {
        if (!anilistAccessToken || !anilistUserId) return { metas: [] };
        const data = await anilistGraphQL(MEDIA_LIST_QUERY, { userId: anilistUserId, status: 'PLANNING' }, anilistAccessToken);
        const entries = (data?.MediaListCollection?.lists || []).flatMap(l => l.entries || []);
        return { metas: await anilistMediaToMetas(entries.map(e => e.media), deps, animePresentationMode) };
      }
      case 'anilist_trending': {
        const data = await anilistGraphQL(TRENDING_QUERY, {}, null);
        return { metas: await anilistMediaToMetas(data?.Page?.media || [], deps, animePresentationMode) };
      }
      case 'anilist_seasonal': {
        const { season, year } = currentAnilistSeason();
        const data = await anilistGraphQL(SEASONAL_QUERY, { season, seasonYear: year }, null);
        return { metas: await anilistMediaToMetas(data?.Page?.media || [], deps, animePresentationMode) };
      }
      default:
        return { metas: [] };
    }
  } catch (e) {
    console.error('[AniList]', handler, e.response?.data || e.message);
    return { metas: [] };
  }
}

module.exports = {
  handleAnilistCatalog,
  getAnilistViewer,
  getAnilistAiHistory,
  anilistMediaToMetas
};
