const axios = require("axios");
const crypto = require("crypto");
const { fetchCached } = require("./api-helpers");
const {
  resolveTmdbAnimeToKitsuId
} = require("./kitsu-id-service");
const {
  applyContentFilters,
  normalizeContentExclusions,
  matchesContentExclusion
} = require("./content-filter-service");
const TMDB_KEY = process.env.TMDB_KEY;
const imdbCache = new Map();
const certCache = new Map();
const CERT_TTL = 7 * 24 * 60 * 60 * 1000;

// ULTRA MAX DIGITAL RELEASE FILTER
const digitalReleaseCache = new Map();
const DIGITAL_RELEASE_TTL = 7 * 24 * 60 * 60 * 1000;
const imdbTmdbCache = new Map();
const FILTER_ENABLED = process.env.FILTER_MODE !== "off";
const PICTORIUM_RENDER_VERSION = process.env.PICTORIUM_RENDER_VERSION || "67dc78827a";
const MDBLIST_KEYS = (process.env.MDBLIST_KEYS || process.env.MDBLIST_KEY || "")
  .split(",")
  .map(key => key.trim())
  .filter(Boolean);

function credentialScope(value) {
  return crypto.createHash("sha256").update(String(value || "none")).digest("hex").slice(0, 24);
}

function credentialScopedCacheKey(tmdbKey, ...parts) {
  return `${credentialScope(tmdbKey)}:${parts.map(part => String(part)).join(":")}`;
}

function publicTmdbMappingKey(...parts) {
  return `public:${parts.map(part => String(part)).join(":")}`;
}

// Map language codes to btttr.cc lang params
function getBpLang(language) {
  if (!language || language.startsWith('en')) return '';
  const map = {
    'fr': 'fr', 'fr-FR': 'fr',
    'de': 'de', 'de-DE': 'de',
    'it': 'it', 'it-IT': 'it',
    'pt-BR': 'pt-BR', 'pt-PT': 'pt-PT', 'pt': 'pt-PT',
    'nl': 'nl', 'nl-NL': 'nl',
    'pl': 'pl', 'pl-PL': 'pl',
    'ru': 'ru', 'ru-RU': 'ru',
    'tr': 'tr', 'tr-TR': 'tr',
    'ar': 'ar', 'ja': 'ja', 'ko': 'ko',
    'zh': 'zh', 'zh-CN': 'zh', 'zh-TW': 'zh',
    'hi': 'hi', 'hi-IN': 'hi',
    'sv': 'sv', 'sv-SE': 'sv',
    'cs': 'cs', 'cs-CZ': 'cs',
  };
  return map[language] || map[language.split('-')[0]] || '';
}

function applyBpStyle(bpStyle, imdbId, language, context = {}) {
  if (!bpStyle) return null;

  const mediaType = context.type === "series" ? "series" : "movie";
  let url = String(bpStyle)
    .split('{imdb_id}').join(String(imdbId || ''))
    .split('{media_type}').join(mediaType)
    .split('{type}').join(mediaType)
    .split('{tmdb_id}').join(String(context.tmdbId || imdbId || ''));

  if (url.includes('/api/poster/')) {
    try {
      const parsed = new URL(url);
      const title = String(context.title || '').trim();
      const releaseDate = String(context.releaseDate || '').trim();
      const lang = String(language || 'en').split('-')[0].toLowerCase();

      const isHostedPictorium =
        (parsed.origin === 'https://ultramax.vip' || parsed.origin === 'https://ultramax.vip') &&
        parsed.pathname.includes('/pictorium/api/poster/');

      // Ultra MAX already knows the TMDB id for normal catalog/meta results.
      // Prefer it on our hosted Pictorium instance so Pictorium can skip its
      // IMDb -> TMDB resolver on a cold render. Legacy saved templates that
      // still use {imdb_id} are upgraded transparently at request time.
      if (isHostedPictorium && context.tmdbId) {
        const parts = parsed.pathname.split('/');
        const last = parts[parts.length - 1] || '';
        if (/^tt\d+$/i.test(last)) {
          parts[parts.length - 1] = String(context.tmdbId);
          parsed.pathname = parts.join('/');
        }
      }

      if (isHostedPictorium && !parsed.searchParams.has('rv')) {
        parsed.searchParams.set('rv', PICTORIUM_RENDER_VERSION);
      }
      if (isHostedPictorium && !parsed.searchParams.has('fmt')) {
        parsed.searchParams.set('fmt', 'webp');
      }
      if (title && !parsed.searchParams.has('title')) parsed.searchParams.set('title', title);
      if (imdbId && !parsed.searchParams.has('imdbId')) parsed.searchParams.set('imdbId', imdbId);
      if (lang && !parsed.searchParams.has('lang')) parsed.searchParams.set('lang', lang);
      if (releaseDate) {
        const dateParam = mediaType === 'series' ? 'fad' : 'rd';
        if (!parsed.searchParams.has(dateParam)) parsed.searchParams.set(dateParam, releaseDate);
      }

      return parsed.toString();
    } catch (_) {
      return url;
    }
  }

  if (url.includes('btttr.cc')) {
    const lang = getBpLang(language);
    if (lang) url += (url.includes('?') ? '&' : '?') + 'lang=' + lang;
  }
  return url;
}

async function getImdbId(tmdbId, type, tmdbKey = TMDB_KEY) {
  const key = publicTmdbMappingKey(type, tmdbId);
  if (imdbCache.has(key)) return imdbCache.get(key);
  try {
    const t = type === "series" ? "tv" : "movie";
    const data = await fetchCached(`https://api.themoviedb.org/3/${t}/${tmdbId}/external_ids?api_key=${tmdbKey}`);
    const imdbId = data.imdb_id || null;
    if (imdbId) imdbCache.set(key, imdbId);
    return imdbId;
  } catch(e) {
    return null;
  }
}

const MOVIE_RATING_ORDER = ["G", "PG", "PG-13", "R", "NC-17"];
const TV_RATING_ORDER = ["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA"];

const MAX_MOVIE_TO_TV = {
  "G": "TV-G",
  "PG": "TV-PG",
  "PG-13": "TV-14",
  "R": "TV-MA",
  "NC-17": "TV-MA"
};

function normalizeMovieCertification(cert) {
  const value = String(cert || "").trim().toUpperCase();

  const aliases = {
    "U": "G",
    "0": "G",
    "6": "G",
    "7": "PG",
    "9": "PG",
    "10": "PG",
    "12": "PG-13",
    "12A": "PG-13",
    "13": "PG-13",
    "15": "R",
    "16": "R",
    "18": "NC-17"
  };

  return aliases[value] || value || null;
}

function normalizeSeriesCertification(cert) {
  const value = String(cert || "").trim().toUpperCase();

  const aliases = {
    "U": "TV-G",
    "0": "TV-Y",
    "6": "TV-Y7",
    "7": "TV-Y7",
    "G": "TV-G",
    "PG": "TV-PG",
    "9": "TV-PG",
    "10": "TV-PG",
    "12": "TV-14",
    "12A": "TV-14",
    "13": "TV-14",
    "15": "TV-MA",
    "16": "TV-MA",
    "18": "TV-MA"
  };

  return aliases[value] || value || null;
}

function ratingAllowed(cert, maxRating, type = "movie") {
  if (!maxRating) return true;

  // A configured age ceiling is strict. Unrated and unknown values fail closed.
  if (!cert) return false;

  if (type === "series") {
    const normalized = normalizeSeriesCertification(cert);
    const maximum = MAX_MOVIE_TO_TV[maxRating];

    const certRank = TV_RATING_ORDER.indexOf(normalized);
    const maxRank = TV_RATING_ORDER.indexOf(maximum);

    if (certRank === -1 || maxRank === -1) return false;
    return certRank <= maxRank;
  }

  const normalized = normalizeMovieCertification(cert);
  const certRank = MOVIE_RATING_ORDER.indexOf(normalized);
  const maxRank = MOVIE_RATING_ORDER.indexOf(maxRating);

  if (certRank === -1 || maxRank === -1) return false;
  return certRank <= maxRank;
}

function certificationCacheKey(tmdbId, type, tmdbKey) {
  return credentialScopedCacheKey(
    tmdbKey,
    type === "series" ? "series" : "movie",
    tmdbId
  );
}

async function getMovieCertification(tmdbId, tmdbKey = TMDB_KEY) {
  if (!tmdbId) return null;

  const cacheKey = certificationCacheKey(tmdbId, "movie", tmdbKey);
  const cached = certCache.get(cacheKey);

  if (cached && Date.now() - cached.time < CERT_TTL) {
    return cached.cert;
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${tmdbKey}`
    );

    const regions = data.results || [];
    const preferred =
      regions.find(region => region.iso_3166_1 === "GB") ||
      regions.find(region => region.iso_3166_1 === "US");

    const releases = preferred ? preferred.release_dates || [] : [];
    const cert =
      releases
        .map(release => String(release.certification || "").trim())
        .find(Boolean) || null;

    certCache.set(cacheKey, { cert, time: Date.now() });
    return cert;
  } catch (error) {
    console.warn(
      "Movie certification lookup failed:",
      tmdbId,
      error?.message || error
    );

    return null;
  }
}

async function getSeriesCertification(tmdbId, tmdbKey = TMDB_KEY) {
  if (!tmdbId) return null;

  const cacheKey = certificationCacheKey(tmdbId, "series", tmdbKey);
  const cached = certCache.get(cacheKey);

  if (cached && Date.now() - cached.time < CERT_TTL) {
    return cached.cert;
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/tv/${tmdbId}/content_ratings?api_key=${tmdbKey}`
    );

    const ratings = data.results || [];
    const preferred =
      ratings.find(region => region.iso_3166_1 === "GB") ||
      ratings.find(region => region.iso_3166_1 === "US");

    const cert =
      preferred && String(preferred.rating || "").trim()
        ? String(preferred.rating).trim()
        : null;

    certCache.set(cacheKey, { cert, time: Date.now() });
    return cert;
  } catch (error) {
    console.warn(
      "Series certification lookup failed:",
      tmdbId,
      error?.message || error
    );

    return null;
  }
}

async function getCertification(tmdbId, type = "movie", tmdbKey = TMDB_KEY) {
  return type === "series"
    ? getSeriesCertification(tmdbId, tmdbKey)
    : getMovieCertification(tmdbId, tmdbKey);
}

async function filterByMaxRating(results, maxRating, type = "movie", tmdbKey = TMDB_KEY) {
  if (!maxRating || !Array.isArray(results)) return results;

  const limited = results.slice(0, 40);

  const checked = await Promise.all(
    limited.map(async item => {
      const cert = await getCertification(item.id, type, tmdbKey);
      return ratingAllowed(cert, maxRating, type) ? item : null;
    })
  );

  return checked.filter(Boolean);
}

async function hasDigitalRelease(tmdbId, tmdbKey = TMDB_KEY) {
  if (!tmdbId) return false;

  const cacheKey = credentialScopedCacheKey(tmdbKey, "digital-release", tmdbId);
  const cached = digitalReleaseCache.get(cacheKey);
  if (cached && Date.now() - cached.time < DIGITAL_RELEASE_TTL) {
    return cached.available;
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${tmdbKey}`
    );

    const today = new Date().toISOString().slice(0, 10);

    const available = (data.results || []).some(region =>
      (region.release_dates || []).some(release => {
        const releaseDate = String(release.release_date || "").slice(0, 10);

        return Number(release.type) === 4 &&
          Boolean(releaseDate) &&
          releaseDate <= today;
      })
    );

    digitalReleaseCache.set(cacheKey, {
      available,
      time: Date.now()
    });

    return available;
  } catch (error) {
    console.warn(
      "Digital release lookup failed:",
      tmdbId,
      error?.message || error
    );

    // Fail open during a temporary TMDB/API problem.
    return null;
  }
}

async function filterByDigitalRelease(results, tmdbKey = TMDB_KEY) {
  if (!Array.isArray(results)) return [];

  const candidates = results.slice(0, 40);

  const checked = await Promise.all(
    candidates.map(async item => {
      const available = await hasDigitalRelease(item.id, tmdbKey);

      // null means the lookup failed, so preserve the item for stability.
      return available === false ? null : item;
    })
  );

  return checked.filter(Boolean);
}

async function imdbToTmdbMovieId(imdbId, tmdbKey = TMDB_KEY) {
  if (!imdbId) return null;
  const cacheKey = publicTmdbMappingKey("movie", imdbId);
  if (imdbTmdbCache.has(cacheKey)) return imdbTmdbCache.get(cacheKey);

  try {
    const data = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`);
    const id = data.movie_results && data.movie_results[0] ? data.movie_results[0].id : null;
    imdbTmdbCache.set(cacheKey, id);
    return id;
  } catch (e) {
    return null;
  }
}

async function imdbToTmdbSeriesId(imdbId, tmdbKey = TMDB_KEY) {
  if (!imdbId) return null;

  const cacheKey = publicTmdbMappingKey("series", imdbId);
  if (imdbTmdbCache.has(cacheKey)) {
    return imdbTmdbCache.get(cacheKey);
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`
    );

    const id =
      data.tv_results && data.tv_results[0]
        ? data.tv_results[0].id
        : null;

    imdbTmdbCache.set(cacheKey, id);
    return id;
  } catch (error) {
    return null;
  }
}


async function filterMetasByMaxRating(
  metas,
  maxRating,
  type = "movie",
  tmdbKey = TMDB_KEY
) {
  if (!maxRating || !Array.isArray(metas)) return metas;

  const limited = metas.slice(0, 100);

  const checked = await Promise.all(
    limited.map(async meta => {
      const imdbId = meta.id;

      const tmdbId =
        type === "series"
          ? await imdbToTmdbSeriesId(imdbId, tmdbKey)
          : await imdbToTmdbMovieId(imdbId, tmdbKey);

      if (!tmdbId) return null;

      const cert = await getCertification(tmdbId, type, tmdbKey);

      return ratingAllowed(cert, maxRating, type)
        ? meta
        : null;
    })
  );

  return checked.filter(Boolean);
}

async function getBestPoster({ type, tmdbId, imdbId, tmdbPosterPath, fanartKey = null, omdbKey = null }) {
  const tmdbPoster = tmdbPosterPath ? `https://image.tmdb.org/t/p/w500${tmdbPosterPath}` : null;

  if (fanartKey && tmdbId) {                                                                                                                                  try {
      const media = type === "series" ? "tv" : "movies";
      const url = type === "series"
        ? `https://webservice.fanart.tv/v3/tv/${tmdbId}?api_key=${fanartKey}`
        : `https://webservice.fanart.tv/v3/movies/${tmdbId}?api_key=${fanartKey}`;

      const data = await fetchCached(url);
      const posters = type === "series" ? (data.tvposter || []) : (data.movieposter || []);
      const best = posters.find(p => p.url) || posters[0];
      if (best && best.url) return best.url;
    } catch(e) {
      console.log("Fanart poster fallback:", e.message);
    }
  }

  if (omdbKey && imdbId) {
    try {
      const data = await fetchCached(`https://www.omdbapi.com/?i=${imdbId}&apikey=${omdbKey}`);
      if (data && data.Poster && data.Poster !== "N/A") return data.Poster;
    } catch(e) {
      console.log("OMDb poster fallback:", e.message);
    }
  }

  return tmdbPoster;
}

async function traktToMetas(arr, type, language, rpdbKey, tpKey, excludeUnreleased = false, bpStyle = null, filterConfig = null, tmdbKey = TMDB_KEY, resultsMapper = resultsToMetas) {
  const tmdbType = type === "series" ? "tv" : "movie";
  const tmdbResults = (await Promise.all(
    (arr || []).map(async item => {
      const entity = item.movie || item.show || item;
      const tmdbId = entity?.ids?.tmdb;
      if (!tmdbId) return null;
      try {
        return await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${tmdbKey}&language=${language}`);
      } catch(e) { return null; }
    })
  )).filter(Boolean);
  return await resultsMapper(tmdbResults, type, FILTER_ENABLED, language, rpdbKey, tpKey, excludeUnreleased, null, null, bpStyle, false, false, filterConfig);
}



// BetterPosters style compatibility — converts old format (e.g. "imdb") to new format
function normBpStyle(s) {
  if (!s) return null;
  // Already new format (contains '/' or is a flag string like 'tqgra')
  if (s.includes('/')) return s;
  if (s.match(/^[qgan]+(\?|$)/)) return `${s}/imdb/poster-default/{imdb_id}.jpg`;
  // Old format mapping: rating source name → new format
  const map = {
    'imdb':       'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=IM',
    'tmdb':       'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=TM',
    'rt':         'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=RT',
    'metacritic': 'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=MC',
    'trakt':      'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=TR',
    'letterboxd': 'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=LB',
    'rogerebert': 'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=RE',
    'average':    'r/imdb/poster-default/{imdb_id}.jpg?tag=none&rs=AV',
    'none':       'n/imdb/poster-default/{imdb_id}.jpg?tag=none',
  };
  return map[s.toLowerCase()] || null;
}

async function resultsToMetas(arr, type, filterLang = FILTER_ENABLED, language = "en-US", rpdbKey = null, tpKey = null, excludeUnreleased = false, fanartKey = null, omdbKey = null, bpStyle = null, digitalReleaseOnly = false, preserveKitsuIds = false, filterConfig = null, filterOpts = {}, tmdbKey = TMDB_KEY) {
  const today = new Date().toISOString().slice(0,10);
  const effectiveFilterOpts = {
    ...filterOpts,
    mediaType: filterOpts.mediaType || type
  };
  const sourceArr = filterConfig
    ? applyContentFilters(arr, filterConfig, effectiveFilterOpts)
    : arr;
  let candidates = sourceArr.filter(i => {
      if (!i.poster_path) return false;

      const title = i.title || i.name || i.original_title || i.original_name || "";
      if (!title.trim()) return false;

      /*
       * Ultra MAX filtered mode keeps Japanese/anime and Hindi/Bollywood
       * titles out of general discovery rows. Dedicated catalogs bypass
       * this by passing filterLang=false.
       */
      if (filterLang) {
        const originalLanguage = String(
          i.original_language || ""
        ).toLowerCase();

        if (
          originalLanguage === "ja" ||
          originalLanguage === "hi"
        ) {
          return false;
        }
      }

      const d = i.release_date || i.first_air_date || "";

      // Keep thin/ghost TMDB entries out of public rows.
      // These often show as clickable posters but fail metadata in Nuvio.
      if (!d) return false;

      if (excludeUnreleased && d > today) return false;

      // Even when unreleased filtering is off, block far-future placeholders.
      const futureLimit = new Date();
      futureLimit.setDate(futureLimit.getDate() + 120);
      const futureLimitStr = futureLimit.toISOString().slice(0,10);
      if (d > futureLimitStr) return false;

      // Very low signal entries are often placeholders/sparse records.
      if ((i.vote_count || 0) < 1 && !i.overview) return false;

      return true;
    });

  if (digitalReleaseOnly && type === "movie") {
    candidates = await filterByDigitalRelease(candidates, tmdbKey);
  }

  return (await Promise.all(
    candidates.map(async i => {
      try {
        const imdb = i.imdb_id || i.external_ids?.imdb_id || await getImdbId(i.id, type, tmdbKey);
        const tmdbPublishedId = i.id ? `tmdb:${i.id}` : null;
        if (!imdb && !tmdbPublishedId) return null;

        let publishedId = imdb || tmdbPublishedId;

        if (preserveKitsuIds) {
          const kitsuId = await resolveTmdbAnimeToKitsuId(i, type);

          if (kitsuId) {
            publishedId = kitsuId;
          }
        }

        const title = i.title || i.name || i.original_title || i.original_name;
        const releaseDate = i.release_date || i.first_air_date || null;
        const poster = imdb && bpStyle
          ? applyBpStyle(bpStyle, imdb, language, { type, tmdbId: i.id, title, releaseDate })
          : imdb && tpKey
            ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdb}.jpg`
            : imdb && rpdbKey
              ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdb}.jpg`
              : await getBestPoster({
                  type,
                  tmdbId: i.id,
                  imdbId: imdb,
                  tmdbPosterPath: i.poster_path,
                  fanartKey,
                  omdbKey
                });

        const meta = {
          id: publishedId,
          type,
          name: title,
          poster,
          background: i.backdrop_path ? `https://image.tmdb.org/t/p/original${i.backdrop_path}` : null
        };
        if (language && language !== "en-US" && i.overview) meta.description = i.overview;
        return meta;
      } catch (error) {
        console.warn(
          `[Metadata] Skipped one ${type} mapping: tmdb=${i?.id || "unknown"}, error=${error.message}`
        );
        return null;
      }
    })
  )).filter(Boolean);
}

function normalizeMdblistListRef(value) {
  if (Number.isSafeInteger(Number(value)) && String(value).trim() && /^\d+$/.test(String(value).trim())) {
    return { kind: "id", value: String(Number(value)) };
  }
  const text = String(value || "").trim();
  const match = text.match(/^([A-Za-z0-9._-]{1,80})\/([A-Za-z0-9._-]{1,160})$/);
  if (!match) return null;
  return { kind: "path", author: match[1], slug: match[2], value: `${match[1]}/${match[2]}` };
}

function buildMdblistItemsUrl(listRef, type, key) {
  const ref = normalizeMdblistListRef(listRef);
  if (!ref) return null;
  const media = type === "series" ? "show" : "movie";
  if (ref.kind === "id") {
    return `https://api.mdblist.com/lists/${ref.value}/items?apikey=${encodeURIComponent(key)}&limit=100&type=${media}`;
  }
  const author = encodeURIComponent(ref.author);
  const slug = encodeURIComponent(ref.slug);
  return `https://api.mdblist.com/lists/${author}/${slug}/items/${media}?apikey=${encodeURIComponent(key)}&limit=100`;
}

async function mdblistToMetas(
  listId,
  type,
  mdbKey,
  rpdbKey = null,
  tpKey = null,
  maxRating = null,
  fanartKey = null,
  omdbKey = null,
  bpStyle = null,
  language = "en-US",
  digitalReleaseOnly = false,
  filterConfig = null,
  tmdbKey = TMDB_KEY,
  serverMdbListKeys = MDBLIST_KEYS
) {
  const tryKeys = mdbKey ? [mdbKey] : serverMdbListKeys;
  let data = null;
  for (const key of tryKeys) {
    const url = buildMdblistItemsUrl(listId, type, key);
    if (!url) return [];
    try {
      const resp = await fetchCached(url);
      if (resp && !resp.error) { data = resp; break; }
    } catch(e) {}
  }
  if (!data) return [];
  try {
    const rawItems = Array.isArray(data)
      ? data
      : type === "series"
        ? (Array.isArray(data.shows) ? data.shows : data.items || [])
        : (Array.isArray(data.movies) ? data.movies : data.items || []);
    const items = filterConfig
      ? applyContentFilters(rawItems, filterConfig, { mediaType: type })
      : rawItems;

    // Digital checks require one TMDB release-date lookup per candidate.
    // Keep the candidate pool bounded while still allowing rejected films
    // to be replaced by later entries in the MDBList row.
    const candidates =
      digitalReleaseOnly && type === "movie"
        ? items.slice(0, 40)
        : items;

    let metas = (await Promise.all(
      candidates.map(async item => {
        const imdbId = item.imdb_id || item.imdbid;
        if (!imdbId) return null;
        const tmdbType = type ==="series" ?"tv" :"movie";
        try {
          const find = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`);
          const result = find[`${tmdbType}_results`]?.[0];

          if (!result) {
            return digitalReleaseOnly && type === "movie"
              ? null
              : { id: imdbId, type, name: item.title };
          }

          const contentExclusions = normalizeContentExclusions(
            filterConfig?.contentExclusions
          );
          if (
            contentExclusions.some(key =>
              matchesContentExclusion(result, key, { mediaType: type })
            )
          ) {
            return null;
          }

          if (digitalReleaseOnly && type === "movie") {
            const available = await hasDigitalRelease(result.id, tmdbKey);

            // false is a confirmed non-digital result.
            // null means the lookup failed, so preserve it for stability.
            if (available === false) return null;
          }

          return {
            id: imdbId, type,
            name: item.title || result.title || result.name,
            poster: bpStyle ? applyBpStyle(bpStyle, imdbId, language, { type, tmdbId: result.id, title: item.title || result.title || result.name, releaseDate: result.release_date || result.first_air_date || null }) : tpKey ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdbId}.jpg` : rpdbKey ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdbId}.jpg` : await getBestPoster({ type, tmdbId: result.id, imdbId: imdbId, tmdbPosterPath: result.poster_path, fanartKey, omdbKey }),
            background: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null
          };
        } catch {
          // Preserve current fail-open behaviour during a temporary API error.
          return { id: imdbId, type, name: item.title };
        }
      })
    )).filter(Boolean);

      if (maxRating) {
      metas = await filterMetasByMaxRating(
        metas,
        maxRating,
        type,
        tmdbKey
      );
    }

      return metas;
  } catch (e) { console.log("mdblist error", listId, e.message); return []; }
}

function createMetadataService(options = {}) {
  const tmdbKey = String(options.tmdbKey || "").trim() || TMDB_KEY;
  const serverMdbListKeys = options.allowServerMdbListFallback === true
    ? MDBLIST_KEYS
    : [];

  const service = {
    getImdbId: (tmdbId, type) => getImdbId(tmdbId, type, tmdbKey),
    getMovieCertification: tmdbId => getMovieCertification(tmdbId, tmdbKey),
    getSeriesCertification: tmdbId => getSeriesCertification(tmdbId, tmdbKey),
    getCertification: (tmdbId, type = "movie") => getCertification(tmdbId, type, tmdbKey),
    filterByMaxRating: (results, maxRating, type = "movie") => filterByMaxRating(results, maxRating, type, tmdbKey),
    hasDigitalRelease: tmdbId => hasDigitalRelease(tmdbId, tmdbKey),
    filterByDigitalRelease: results => filterByDigitalRelease(results, tmdbKey),
    imdbToTmdbMovieId: imdbId => imdbToTmdbMovieId(imdbId, tmdbKey),
    imdbToTmdbSeriesId: imdbId => imdbToTmdbSeriesId(imdbId, tmdbKey),
    filterMetasByMaxRating: (metas, maxRating, type = "movie") => filterMetasByMaxRating(metas, maxRating, type, tmdbKey),
    getBestPoster,
    resultsToMetas: (
      arr,
      type,
      filterLang = FILTER_ENABLED,
      language = "en-US",
      rpdbKey = null,
      tpKey = null,
      excludeUnreleased = false,
      fanartKey = null,
      omdbKey = null,
      bpStyle = null,
      digitalReleaseOnly = false,
      preserveKitsuIds = false,
      filterConfig = null,
      filterOpts = {}
    ) => resultsToMetas(
      arr,
      type,
      filterLang,
      language,
      rpdbKey,
      tpKey,
      excludeUnreleased,
      fanartKey,
      omdbKey,
      bpStyle,
      digitalReleaseOnly,
      preserveKitsuIds,
      filterConfig,
      filterOpts,
      tmdbKey
    ),
    mdblistToMetas: (
      listId,
      type,
      mdbKey,
      rpdbKey = null,
      tpKey = null,
      maxRating = null,
      fanartKey = null,
      omdbKey = null,
      bpStyle = null,
      language = "en-US",
      digitalReleaseOnly = false,
      filterConfig = null
    ) => mdblistToMetas(
      listId,
      type,
      mdbKey,
      rpdbKey,
      tpKey,
      maxRating,
      fanartKey,
      omdbKey,
      bpStyle,
      language,
      digitalReleaseOnly,
      filterConfig,
      tmdbKey,
      serverMdbListKeys
    )
  };

  service.traktToMetas = (
    arr,
    type,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased = false,
    bpStyle = null,
    filterConfig = null
  ) => traktToMetas(
    arr,
    type,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased,
    bpStyle,
    filterConfig,
    tmdbKey,
    service.resultsToMetas
  );

  return service;
}

module.exports = {
  getImdbId,
  getMovieCertification,
  getSeriesCertification,
  getCertification,
  filterByMaxRating,
  hasDigitalRelease,
  filterByDigitalRelease,
  imdbToTmdbMovieId,
  filterMetasByMaxRating,
  getBestPoster,
  traktToMetas,
  resultsToMetas,
  mdblistToMetas,
  createMetadataService,
  credentialScopedCacheKey,
  normalizeMdblistListRef,
  buildMdblistItemsUrl,
  applyBpStyle
};
