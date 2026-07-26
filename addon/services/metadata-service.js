const axios = require("axios");
const { fetchCached } = require("./api-helpers");
const {
  resolveTmdbAnimeToKitsuId
} = require("./kitsu-id-service");
const TMDB_KEY = process.env.TMDB_KEY;
const imdbCache = new Map();
const certCache = new Map();
const CERT_TTL = 7 * 24 * 60 * 60 * 1000;

// ULTRA MAX DIGITAL RELEASE FILTER
const digitalReleaseCache = new Map();
const DIGITAL_RELEASE_TTL = 7 * 24 * 60 * 60 * 1000;
const imdbTmdbCache = new Map();
const FILTER_ENABLED = process.env.FILTER_MODE !== "off";
const MDBLIST_KEYS = ( process.env.MDBLIST_KEYS || process.env.MDBLIST_KEY || "" ).split(",").map(k => k.trim()).filter(Boolean);

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

function applyBpStyle(bpStyle, imdbId, language) {
  if (!bpStyle) return null;
  let url = bpStyle.replace('{imdb_id}', imdbId);
  if (url.includes('btttr.cc')) {
    const lang = getBpLang(language);
    if (lang) url += (url.includes('?') ? '&' : '?') + 'lang=' + lang;
  }
  return url;
}

async function getImdbId(tmdbId, type) {
  const key = `${type}-${tmdbId}`;
  if (imdbCache.has(key)) return imdbCache.get(key);
  try {
    const t = type === "series" ? "tv" : "movie";
    const data = await fetchCached(`https://api.themoviedb.org/3/${t}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`);
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

function certificationCacheKey(tmdbId, type) {
  return `${type === "series" ? "series" : "movie"}:${tmdbId}`;
}

async function getMovieCertification(tmdbId) {
  if (!tmdbId) return null;

  const cacheKey = certificationCacheKey(tmdbId, "movie");
  const cached = certCache.get(cacheKey);

  if (cached && Date.now() - cached.time < CERT_TTL) {
    return cached.cert;
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${TMDB_KEY}`
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

async function getSeriesCertification(tmdbId) {
  if (!tmdbId) return null;

  const cacheKey = certificationCacheKey(tmdbId, "series");
  const cached = certCache.get(cacheKey);

  if (cached && Date.now() - cached.time < CERT_TTL) {
    return cached.cert;
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/tv/${tmdbId}/content_ratings?api_key=${TMDB_KEY}`
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

async function getCertification(tmdbId, type = "movie") {
  return type === "series"
    ? getSeriesCertification(tmdbId)
    : getMovieCertification(tmdbId);
}

async function filterByMaxRating(results, maxRating, type = "movie") {
  if (!maxRating || !Array.isArray(results)) return results;

  const limited = results.slice(0, 40);

  const checked = await Promise.all(
    limited.map(async item => {
      const cert = await getCertification(item.id, type);
      return ratingAllowed(cert, maxRating, type) ? item : null;
    })
  );

  return checked.filter(Boolean);
}

async function hasDigitalRelease(tmdbId) {
  if (!tmdbId) return false;

  const cached = digitalReleaseCache.get(tmdbId);
  if (cached && Date.now() - cached.time < DIGITAL_RELEASE_TTL) {
    return cached.available;
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${TMDB_KEY}`
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

    digitalReleaseCache.set(tmdbId, {
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

async function filterByDigitalRelease(results) {
  if (!Array.isArray(results)) return [];

  const candidates = results.slice(0, 40);

  const checked = await Promise.all(
    candidates.map(async item => {
      const available = await hasDigitalRelease(item.id);

      // null means the lookup failed, so preserve the item for stability.
      return available === false ? null : item;
    })
  );

  return checked.filter(Boolean);
}

async function imdbToTmdbMovieId(imdbId) {
  if (!imdbId) return null;
  if (imdbTmdbCache.has(imdbId)) return imdbTmdbCache.get(imdbId);

  try {
    const data = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const id = data.movie_results && data.movie_results[0] ? data.movie_results[0].id : null;
    imdbTmdbCache.set(imdbId, id);
    return id;
  } catch (e) {
    return null;
  }
}

async function imdbToTmdbSeriesId(imdbId) {
  if (!imdbId) return null;

  const cacheKey = `series:${imdbId}`;
  if (imdbTmdbCache.has(cacheKey)) {
    return imdbTmdbCache.get(cacheKey);
  }

  try {
    const data = await fetchCached(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`
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
  type = "movie"
) {
  if (!maxRating || !Array.isArray(metas)) return metas;

  const limited = metas.slice(0, 100);

  const checked = await Promise.all(
    limited.map(async meta => {
      const imdbId = meta.id;

      const tmdbId =
        type === "series"
          ? await imdbToTmdbSeriesId(imdbId)
          : await imdbToTmdbMovieId(imdbId);

      if (!tmdbId) return null;

      const cert = await getCertification(tmdbId, type);

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

async function traktToMetas(arr, type, language, rpdbKey, tpKey, excludeUnreleased = false, bpStyle = null) {
  const tmdbType = type === "series" ? "tv" : "movie";
  const tmdbResults = (await Promise.all(
    (arr || []).map(async item => {
      const entity = item.movie || item.show || item;
      const tmdbId = entity?.ids?.tmdb;
      if (!tmdbId) return null;
      try {
        return await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&language=${language}`);
      } catch(e) { return null; }
    })
  )).filter(Boolean);
  return await resultsToMetas(tmdbResults, type, FILTER_ENABLED, language, rpdbKey, tpKey, excludeUnreleased, null, null, bpStyle);
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

async function resultsToMetas(arr, type, filterLang = FILTER_ENABLED, language = "en-US", rpdbKey = null, tpKey = null, excludeUnreleased = false, fanartKey = null, omdbKey = null, bpStyle = null, digitalReleaseOnly = false, preserveKitsuIds = false) {
  const today = new Date().toISOString().slice(0,10);
  let candidates = arr.filter(i => {
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
    candidates = await filterByDigitalRelease(candidates);
  }

  return (await Promise.all(
    candidates.map(async i => {
      const imdb = await getImdbId(i.id, type);
      if (!imdb) return null;

      let publishedId = imdb;

      if (preserveKitsuIds) {
        const kitsuId = await resolveTmdbAnimeToKitsuId(i, type);

        if (kitsuId) {
          publishedId = kitsuId;
        }
      }

      const meta = {
        id: publishedId, type,
        name: i.title || i.name || i.original_title,
        poster: bpStyle ? applyBpStyle(bpStyle, imdb, language) : tpKey ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdb}.jpg` : rpdbKey ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdb}.jpg` : await getBestPoster({ type, tmdbId: i.id, imdbId: imdb, tmdbPosterPath: i.poster_path, fanartKey, omdbKey }),
        background: i.backdrop_path ? `https://image.tmdb.org/t/p/original${i.backdrop_path}` : null
      };
      if (language && language !== "en-US" && i.overview) meta.description = i.overview;
      return meta;
    })
  )).filter(Boolean);
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
  digitalReleaseOnly = false
) {
  const tryKeys = mdbKey ? [mdbKey] : MDBLIST_KEYS;
  let data = null;
  for (const key of tryKeys) {
    const url = `https://mdblist.com/api/lists/${listId}/items/?apikey=${key}&limit=100&type=${type ==="series" ?"show" :"movie"}`;
    try {
      const resp = await fetchCached(url);
      if (resp && !resp.error) { data = resp; break; }
    } catch(e) {}
  }
  if (!data) return [];
  try {
    const items = Array.isArray(data)
      ? data
      : (data.movies || data.shows || data.items || []);

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
          const find = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
          const result = find[`${tmdbType}_results`]?.[0];

          if (!result) {
            return digitalReleaseOnly && type === "movie"
              ? null
              : { id: imdbId, type, name: item.title };
          }

          if (digitalReleaseOnly && type === "movie") {
            const available = await hasDigitalRelease(result.id);

            // false is a confirmed non-digital result.
            // null means the lookup failed, so preserve it for stability.
            if (available === false) return null;
          }

          return {
            id: imdbId, type,
            name: item.title || result.title || result.name,
            poster: bpStyle ? applyBpStyle(bpStyle, imdbId, language) : tpKey ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdbId}.jpg` : rpdbKey ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdbId}.jpg` : await getBestPoster({ type, tmdbId: result.id, imdbId: imdbId, tmdbPosterPath: result.poster_path, fanartKey, omdbKey }),
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
        type
      );
    }

      return metas;
  } catch (e) { console.log("mdblist error", listId, e.message); return []; }
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
  mdblistToMetas
};
