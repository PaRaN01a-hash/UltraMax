// Server-side content filtering, applied uniformly across catalog sources
// (TMDB discover/search/collection, MDBList, Simkl, Trakt, merged rows,
// custom catalogs) so filters affect what's actually fetched/returned, not
// just what the setup UI happens to show.
//
// Different sources hand us differently-shaped items (raw TMDB discover
// results use genre_ids + original_language; MDBList items use genre +
// language + imdbrating; etc), so every getter below is deliberately
// tolerant of several possible field names rather than assuming one shape.

// TMDB genre ids that matter for detection below. Movie and TV share these
// particular ids (16 = Animation) even though the two full genre lists
// otherwise diverge slightly.
const TMDB_GENRE_ID_NAMES = {
  16: "animation",
  99: "documentary"
};

const INDIAN_LANGUAGE_CODES = new Set([
  "hi", "ta", "te", "ml", "kn", "bn", "mr", "gu", "pa"
]);

// Catalog ids whose entire row is anime by definition — "reduce" keeps
// these as-is (nothing to reduce, the whole row is the dedicated content),
// "hide" drops the row entirely rather than filtering it down to empty.
const DEDICATED_ANIME_CATALOG_IDS = new Set([
  "anime_movies", "anime_series",
  "crunchyroll_movies", "crunchyroll_series",
  "hidive_movies", "hidive_series",
  "mal_watching", "mal_plantowatch", "mal_completed",
  "anilist_watching", "anilist_plantowatch", "anilist_trending", "anilist_seasonal",
  "ai_anime_anilist"
]);

const DEDICATED_ANIME_PREFIXES = ["anilist_", "mal_", "kitsu_", "theme_anime_"];

// Same row-dedication concept as anime, but simpler: indianCinemaFilter has
// no "reduce" tier, so a dedicated row is either shown in full (allow) or
// dropped entirely (hide) — never item-filtered down to an empty row.
const DEDICATED_INDIAN_CATALOG_IDS = new Set([
  "bollywood_movies", "bollywood_series"
]);

const CERTIFICATION_ORDER = ["G", "TV-G", "PG", "TV-PG", "PG-13", "TV-14", "R", "TV-MA", "NC-17", "18"];

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function getGenreNames(item) {
  const names = new Set();

  toArray(item.genres).forEach(g => {
    const name = typeof g === "string" ? g : (g && g.name);
    if (name) names.add(String(name).trim().toLowerCase());
  });

  toArray(item.genre).forEach(g => {
    if (g) names.add(String(g).trim().toLowerCase());
  });

  toArray(item.genre_ids).forEach(id => {
    const name = TMDB_GENRE_ID_NAMES[Number(id)];
    if (name) names.add(name);
  });

  return names;
}

function getKeywords(item) {
  const words = [];
  toArray(item.keywords).forEach(k => words.push(String(typeof k === "string" ? k : (k && k.name) || "").toLowerCase()));
  toArray(item.tags).forEach(t => words.push(String(t || "").toLowerCase()));
  return words;
}

function getOriginalLanguage(item) {
  return String(item.original_language || item.language || item.originalLanguage || "").trim().toLowerCase();
}

function getOriginCountries(item) {
  const codes = new Set();

  toArray(item.origin_country).forEach(c => codes.add(String(c || "").trim().toUpperCase()));
  toArray(item.country).forEach(c => codes.add(String(c || "").trim().toUpperCase()));
  toArray(item.production_countries).forEach(c => {
    const code = typeof c === "string" ? c : (c && c.iso_3166_1);
    if (code) codes.add(String(code).trim().toUpperCase());
  });

  return Array.from(codes).filter(Boolean);
}

function getVoteAverage(item) {
  const v = item.vote_average ?? item.imdbrating ?? item.imdb_rating ?? item.rating;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getVoteCount(item) {
  const v = item.vote_count ?? item.imdbvotes ?? item.imdb_votes;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getReleaseYear(item) {
  const raw = item.release_date || item.first_air_date || item.released || item.year || "";
  const match = String(raw).match(/\d{4}/);
  return match ? Number(match[0]) : 0;
}

function getCertification(item) {
  const cert = item.certification || item.contentRating || item.content_rating || null;
  return cert ? String(cert).trim().toUpperCase() : null;
}

/**
 * An item counts as anime if any of the documented signals match. Every
 * signal is best-effort — most raw catalog result shapes only carry a
 * subset of these fields, so absence of a field just means that signal
 * can't fire, not that detection fails outright.
 */
function isAnimeItem(item) {
  if (!item) return false;

  const lang = getOriginalLanguage(item);
  const genres = getGenreNames(item);
  const countries = getOriginCountries(item);
  const keywords = getKeywords(item);

  return (
    (lang === "ja" && genres.has("animation")) ||
    genres.has("anime") ||
    (countries.includes("JP") && genres.has("animation")) ||
    keywords.some(k => k.includes("anime"))
  );
}

function isIndianCinemaItem(item) {
  if (!item) return false;

  const lang = getOriginalLanguage(item);
  if (INDIAN_LANGUAGE_CODES.has(lang)) return true;

  const countries = getOriginCountries(item);
  return countries.includes("IN") && lang !== "en";
}

/**
 * True for any catalog whose entire row is anime by definition (AniList,
 * MAL, Kitsu-backed TMDB-anime/Crunchyroll/Hidive rows, the AniList AI
 * row). Used to decide row-level inclusion/exclusion and to avoid
 * item-filtering a row down to nothing under "reduce".
 */
function isAnimeCatalog(catalogId) {
  const id = String(catalogId || "");
  if (DEDICATED_ANIME_CATALOG_IDS.has(id)) return true;
  return DEDICATED_ANIME_PREFIXES.some(prefix => id.startsWith(prefix));
}

/**
 * Row-level gate for the manifest and for the catalog handler's defense-in-depth
 * short-circuit. Only dedicated anime catalogs are ever excluded here —
 * general rows always stay in the manifest and get item-level filtering
 * instead (see applyContentFilters).
 */
function shouldIncludeAnimeRow(catalogId, config) {
  const animeFilter = (config && config.animeFilter) || "allow";
  if (animeFilter === "allow") return true;
  if (!isAnimeCatalog(catalogId)) return true;
  return animeFilter !== "hide";
}

function isIndianCinemaCatalog(catalogId) {
  return DEDICATED_INDIAN_CATALOG_IDS.has(String(catalogId || ""));
}

/**
 * Row-level gate for Bollywood-dedicated rows, mirroring shouldIncludeAnimeRow.
 * indianCinemaFilter has no "reduce" tier, so this is a plain allow/hide.
 */
function shouldIncludeIndianCinemaRow(catalogId, config) {
  const indianCinemaFilter = (config && config.indianCinemaFilter) || "allow";
  if (indianCinemaFilter === "allow") return true;
  return !isIndianCinemaCatalog(catalogId);
}

/**
 * Filters a raw results/metas array per the user's content-filter config.
 * `opts.skipAnimeFilter` lets a caller keep a dedicated anime row's items
 * intact under animeFilter:"reduce" (the row is 100% anime by definition —
 * item-filtering it would just empty it out, which "reduce" explicitly
 * doesn't want; "hide" drops the whole row upstream via
 * shouldIncludeAnimeRow instead of reaching this function at all).
 */
function applyContentFilters(items, config, opts = {}) {
  if (!Array.isArray(items) || !items.length) return items || [];

  const cfg = config || {};
  let out = items;

  const animeFilter = cfg.animeFilter || "allow";
  if (animeFilter !== "allow" && !opts.skipAnimeFilter) {
    out = out.filter(item => !isAnimeItem(item));
  }

  const indianCinemaFilter = cfg.indianCinemaFilter || "allow";
  if (indianCinemaFilter === "hide") {
    out = out.filter(item => !isIndianCinemaItem(item));
  }

  const minRating = Number(cfg.minRating) || 0;
  if (minRating > 0) {
    out = out.filter(item => getVoteAverage(item) >= minRating);
  }

  const minVotes = Number(cfg.minVotes) || 0;
  if (minVotes > 0) {
    out = out.filter(item => getVoteCount(item) >= minVotes);
  }

  const minYear = Number(cfg.minYear) || 0;
  const maxYear = Number(cfg.maxYear) || 0;
  if (minYear > 0 || maxYear > 0) {
    out = out.filter(item => {
      const year = getReleaseYear(item);
      if (!year) return false;
      if (minYear > 0 && year < minYear) return false;
      if (maxYear > 0 && year > maxYear) return false;
      return true;
    });
  }

  const excludeCountries = Array.isArray(cfg.excludeCountries)
    ? cfg.excludeCountries.map(c => String(c || "").trim().toUpperCase()).filter(Boolean)
    : [];
  if (excludeCountries.length) {
    const excludeSet = new Set(excludeCountries);
    out = out.filter(item => !getOriginCountries(item).some(c => excludeSet.has(c)));
  }

  // Reuses the single existing "Max Age Rating" field (config.maxRating —
  // already wired into TMDB's certification_country query param elsewhere
  // in catalog-handler-service.js) rather than a second, differently-named
  // certification field. Best-effort only: most raw catalog results (TMDB
  // discover/search, MDBList, etc.) don't carry a per-item certification
  // without an extra API call per title, so this only has an effect on
  // items where a caller already attached one — it's a supplementary check
  // for sources the query-param approach can't reach, not the primary
  // enforcement mechanism.
  const maxRating = cfg.maxRating ? String(cfg.maxRating).trim().toUpperCase() : "";
  if (maxRating && CERTIFICATION_ORDER.includes(maxRating)) {
    const maxIndex = CERTIFICATION_ORDER.indexOf(maxRating);
    out = out.filter(item => {
      const cert = getCertification(item);
      if (!cert) return true;
      const certIndex = CERTIFICATION_ORDER.indexOf(cert);
      return certIndex === -1 ? true : certIndex <= maxIndex;
    });
  }

  return out;
}

module.exports = {
  applyContentFilters,
  shouldIncludeAnimeRow,
  isAnimeCatalog,
  isAnimeItem,
  isIndianCinemaItem,
  shouldIncludeIndianCinemaRow,
  isIndianCinemaCatalog
};
