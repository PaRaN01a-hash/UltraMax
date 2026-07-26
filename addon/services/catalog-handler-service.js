const { CATALOG_DEFS, resolveCatalogId } = require("../catalogs/catalog-defs");
const { handleSimklCatalog } = require("./simkl-service");
const { handleMalCatalog } = require("./mal-service");
const { handleAnilistCatalog } = require("./anilist-service");

/**
 * Convert a string into a stable unsigned 32-bit seed.
 */
function createShuffleSeed(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/**
 * Small deterministic pseudo-random number generator.
 */
function createSeededRandom(seed) {
  let state = seed >>> 0;

  return function seededRandom() {
    state += 0x6D2B79F5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle without mutating the original array.
 */
function seededShuffle(items, seedValue) {
  const shuffled = items.slice();
  const random = createSeededRandom(createShuffleSeed(seedValue));

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Preserve deliberately ranked and time-sensitive catalog ordering.
 */
function shouldShuffleCatalog(catalogId, extra) {
  if (extra?.search) {
    return false;
  }

  const protectedTerms = [
    "search",
    "latest",
    "trending",
    "top",
    "ranked",
    "upcoming",
    "now_playing",
    "airing",
    "recent"
  ];

  const normalizedId = String(catalogId || "").toLowerCase();

  return !protectedTerms.some(term => normalizedId.includes(term));
}

/**
 * UTC date makes the daily order independent of server locale.
 */
function getDailyShuffleKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Applies a Step 2 per-row override (config.catalogOverrides[catalogId]) to
 * raw TMDB results before they're converted to metas — filters first, then
 * sorts, so a sort choice always applies to the already-filtered set.
 *
 * Shape: { sortBy, minRating, minVotes, yearFrom, yearTo, excludeAnimation,
 *          excludeDocumentary, includeAdult }
 */
function applyCatalogOverride(results, override) {
  let out = results.slice();

  if (override.minRating) {
    const minRating = Number(override.minRating);
    out = out.filter(item => (item.vote_average || 0) >= minRating);
  }

  if (override.minVotes) {
    const minVotes = Number(override.minVotes);
    out = out.filter(item => (item.vote_count || 0) >= minVotes);
  }

  if (override.yearFrom || override.yearTo) {
    const yearFrom = override.yearFrom ? Number(override.yearFrom) : null;
    const yearTo = override.yearTo ? Number(override.yearTo) : null;

    out = out.filter(item => {
      const year = Number(String(item.release_date || item.first_air_date || "").slice(0, 4));
      if (!year) return false;
      if (yearFrom && year < yearFrom) return false;
      if (yearTo && year > yearTo) return false;
      return true;
    });
  }

  if (override.excludeAnimation) {
    out = out.filter(item => !(item.genre_ids || []).includes(16));
  }

  if (override.excludeDocumentary) {
    out = out.filter(item => !(item.genre_ids || []).includes(99));
  }

  // Row-level adult toggle only ever tightens the global Step 1 setting —
  // it can hide adult content further, never reveal it if Step 1 blocks it
  // (that's still enforced upstream via include_adult on the TMDB request).
  if (override.includeAdult === false) {
    out = out.filter(item => !item.adult);
  }

  switch (override.sortBy) {
    case "rating":
      out.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      break;
    case "release_date":
      out.sort((a, b) =>
        String(b.release_date || b.first_air_date || "").localeCompare(
          String(a.release_date || a.first_air_date || "")
        )
      );
      break;
    case "title":
      out.sort((a, b) =>
        String(a.title || a.name || "").localeCompare(String(b.title || b.name || ""))
      );
      break;
    case "popularity":
      out.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      break;
    default:
      break;
  }

  return out;
}

async function handleCatalog(
  catalogId,
  type,
  extra,
  mdbKey,
  filterLang,
  language,
  rpdbKey,
  tpKey,
  traktUser,
  excludeUnreleased,
  maxRating,
  includeAdult,
  customCatalogs,
  googleAiKey,
  fanartKey,
  omdbKey,
  deps,
  excludeLanguages = [],
  bpStyle = null,
  traktAccessToken = null,
  simklAccessToken = null,
  userToken = null,
  userConfig = null,
  digitalReleaseOnly = false,
  customMdbLists = [],
  malAccessToken = null,
  anilistAccessToken = null,
  anilistUserId = null,
  catalogOverrides = {}
) {
  // Resolve legacy MDBList catalog ids (e.g. "mdb_88328") saved in older
  // user configs, or still requested by a client with a stale cached
  // manifest, to their current human-readable slug.
  catalogId = resolveCatalogId(catalogId);

  const {
    TMDB_KEY,
    TRAKT_CLIENT_ID,
    handleSearch,
    handleQuickPicks,
    handleRelatedContent,
    handleTraktCatalog,
    handleCatalogSearch,
    buildTmdbCatalogUrl,
    geminiAiRecommendations,
    tmdbResolveAiItems,
    fetchCached,
    filterByMaxRating,
    resultsToMetas: baseResultsToMetas,
    mdblistToMetas
  } = deps;

  const kitsuCatalogIds = new Set([
    "anime_movies",
    "anime_series",
    "crunchyroll_movies",
    "crunchyroll_series",
    "hidive_movies",
    "hidive_series"
  ]);

  const preserveKitsuIds =
    !!userConfig?.preserveKitsuIds &&
    kitsuCatalogIds.has(catalogId);

  const resultsToMetas = (...args) =>
    baseResultsToMetas(
      ...args,
      preserveKitsuIds
    );

console.log(
  "HANDLECATALOG:",
  catalogId,
  "extra=",
  JSON.stringify(extra),
   "maxRating=",
  maxRating
);
if (extra && extra.search) {

const searchableCatalogs = new Set([
  "search_movies",
  "search_series",
  "popular_movies",
  "popular_series"
]);
  if (!searchableCatalogs.has(catalogId)) {
    return { metas: [] };
  }
}
  if (false && extra && extra.search && catalogId !== "search_movie" && catalogId !== "search_movies" && catalogId !== "search_series") {
    return { metas: [] };
  }
if (extra && extra.search) {
  return await handleSearch({
    catalogId,
    type,
    extra,
    mdbKey,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    traktUser,
    excludeUnreleased,
    maxRating,
    customCatalogs,
    googleAiKey,
    fanartKey,
    omdbKey,
    digitalReleaseOnly,
    TMDB_KEY,
    resultsToMetas,
    handleCatalog
  });
}

  const skip = extra?.skip || 0;
  const page = Math.floor(skip / 20) + 1;
  const tmdbType = type ==="series" ?"tv" :"movie";
  const tmdbId = extra?.tmdbId;
  // 🔥 QUICK PICKS ENGINE
  if (catalogId === "ai_recommended_movies" || catalogId === "ai_recommended_series") {

  const items = await geminiAiRecommendations({
    type,
    googleAiKey,
    traktUser,
    language,
    userToken
  });
  const metas = await tmdbResolveAiItems(
    items,
    type,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased,
    fanartKey,
    omdbKey,
    digitalReleaseOnly
  );

    return { metas };
  }
  if (catalogId.startsWith("quick_")) {
    return await handleQuickPicks({
    catalogId,
    type,
    page,
    maxRating,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased,
    fanartKey,
    omdbKey,
    TMDB_KEY,
    fetchCached,
    filterByMaxRating,
    resultsToMetas,
    bpStyle,
    digitalReleaseOnly
  });
}

  const RATING_ORDER = ["G","PG","PG-13","R","NC-17"];
  const allowedRatings = maxRating ? RATING_ORDER.slice(0, RATING_ORDER.indexOf(maxRating) + 1) : [];
  const TV_RATING_MAP = { "G": "TV-G", "PG": "TV-PG", "PG-13": "TV-14", "R": "TV-MA", "NC-17": "TV-MA" };
const ratingParam = maxRating
  ? (type === "series"
      ? `&certification_country=US&certification.lte=${encodeURIComponent(TV_RATING_MAP[maxRating] || "TV-MA")}`
      : `&certification_country=US&certification.lte=${encodeURIComponent(maxRating)}`)
  : "";
  const languageParam = (excludeLanguages && excludeLanguages.length > 0)
    ? `&without_original_language=${excludeLanguages.join("|")}`
    : "";
  const sortBy = extra?.sort === "chronological"
  ? "primary_release_date.asc"
  : (extra?.sort === "release_date_desc"
      ? "primary_release_date.desc"
      : (extra?.sort === "top_rated"
          ? "vote_average.desc&vote_count.gte=200"
          : "popularity.desc"));
  const relatedResult = await handleRelatedContent({
  catalogId,
  tmdbId,
  tmdbType,
  page,
  type,
  filterLang,
  language,
  rpdbKey,
  tpKey,
  excludeUnreleased,
  fanartKey,
  omdbKey,
  TMDB_KEY,
  fetchCached,
  resultsToMetas,
  bpStyle,
  digitalReleaseOnly
});
if (relatedResult) {
  return relatedResult;
}

if (catalogId === "rightnow_movies" || catalogId === "rightnow_series") {

  const hour = new Date().getHours();

let targetCatalog;

if (hour >= 6 && hour < 12) {
  targetCatalog =
    type === "movie"
      ? "popular_movies"
      : "popular_series";
} else if (hour >= 12 && hour < 18) {
  targetCatalog =
    type === "movie"
      ? "trending_movies"
      : "trending_series";
} else if (hour >= 18 && hour < 23) {
  targetCatalog =
    type === "movie"
      ? "top_movies"
      : "top_series";
} else {
  targetCatalog =
    type === "movie"
      ? "trending_movies"
      : "trending_series";
}

  return await handleCatalog(
    targetCatalog,
    type,
    extra,
    mdbKey,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    traktUser,
    excludeUnreleased,
    maxRating,
    includeAdult,
    customCatalogs,
    googleAiKey,
    fanartKey,
    omdbKey,
    deps,
    excludeLanguages,
    bpStyle,
    traktAccessToken,
    simklAccessToken,
    userToken,
    userConfig
  );
}

  // ── Custom catalog handler ──────────────────────────────────────
  const customCat = Array.isArray(customCatalogs)
    ? customCatalogs.find(c => c.id === catalogId)
    : null;

  if (customCat) {
    const tmdbType = (customCat.type || type) === 'series' ? 'tv' : 'movie';
    const page = extra && extra.skip ? Math.floor(parseInt(extra.skip) / 20) + 1 : 1;
    const params = new URLSearchParams({
      api_key: TMDB_KEY,
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page: String(page)
    });

    // Support both old format (config.genre) and new builder format (source/sourceValue)
    const src = customCat.source;
    const val =
      customCat.sourceValue ||
      (customCat.config && customCat.config.value) ||
      (customCat.config && customCat.config.genre) ||
      '';
    const minR = customCat.minRating || (customCat.config && customCat.config.minRating) || '';
    const yFrom = customCat.yearFrom || (customCat.config && customCat.config.yearFrom) || '';
    const yTo = customCat.yearTo || (customCat.config && customCat.config.yearTo) || '';

    if (minR) params.append('vote_average.gte', minR);
    if (yFrom) params.append(tmdbType === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte', yFrom + '-01-01');
    if (yTo) params.append(tmdbType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte', yTo + '-12-31');

    let url;
    if (src === 'genre' && val) {
      params.append('with_genres', val);
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params}`;
    } else if (src === 'streaming' && val) {
      params.append('with_watch_providers', val);
      const ukProviders = ['38','103','41','11'];
      params.append('watch_region', customCat.region || (ukProviders.includes(String(val)) ? 'GB' : 'US'));
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params}`;
    } else if (src === 'decade' && val) {
      const from = val; const to = String(parseInt(val) + 9);
      params.append(tmdbType === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte', from + '-01-01');
      params.append(tmdbType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte', to + '-12-31');
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params}`;
    } else if (src === 'actor' && val) {
      // ULTRA MAX CUSTOM ACTOR SOURCE
      const pParams = new URLSearchParams({
        api_key: TMDB_KEY,
        query: val,
        page: '1'
      });

      const pr = await fetchCached(
        `https://api.themoviedb.org/3/search/person?${pParams}`
      );

      const person = (pr.results || [])[0];

      if (!person) {
        return { metas: [] };
      }

      params.append('with_cast', String(person.id));
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params}`;
    } else if (src === 'person' && val) {
      // Existing director/crew behaviour
      const pParams = new URLSearchParams({
        api_key: TMDB_KEY,
        query: val,
        page: '1'
      });

      const pr = await fetchCached(
        `https://api.themoviedb.org/3/search/person?${pParams}`
      );

      const person = (pr.results || [])[0];

      if (person) {
        params.append('with_crew', String(person.id));
      }

      url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params}`;
    } else if ((src === 'keyword' || src === 'collection') && val) {
      const sParams = new URLSearchParams({ api_key: TMDB_KEY, query: val, page: '1' });
      url = `https://api.themoviedb.org/3/search/${tmdbType}?${sParams}`;
    } else if (val) {
      params.append('with_genres', val);
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params}`;
    } else {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params}`;
    }

    try {
      const data = await fetchCached(url);
      const results = data.results || [];
      const metas = await resultsToMetas(
        results,
        customCat.type || type,
        filterLang,
        language,
        rpdbKey,
        tpKey,
        excludeUnreleased,
        fanartKey,
        omdbKey,
        bpStyle,
        digitalReleaseOnly
      );
      return { metas };
    } catch(e) {
      console.error('Custom catalog error:', e.message);
      return { metas: [] };
    }
  }
  // ────────────────────────────────────────────────────────────────

  // ── User-added public MDBList rows (from Step 2 "Search MDBList") ──
  // Reuses the same mdblistToMetas call as CATALOG_DEFS' built-in "mdb"
  // handler below, just keyed off a per-user list instead of a static def.
  const customMdbList = Array.isArray(customMdbLists)
    ? customMdbLists.find(l => l.id === catalogId && l.enabled !== false)
    : null;

  if (customMdbList) {
    return {
      metas: await mdblistToMetas(
        customMdbList.listId,
        customMdbList.type || type,
        mdbKey,
        rpdbKey,
        tpKey,
        maxRating,
        fanartKey,
        omdbKey,
        bpStyle,
        language,
        digitalReleaseOnly
      )
    };
  }
  // ────────────────────────────────────────────────────────────────

  const def = CATALOG_DEFS[catalogId];
  if (!def) return { metas: [] };

  if (def.handler === "merged") {
    const sourceIds = Array.isArray(def.sources) ? def.sources : [];

    const fetchedLists = await Promise.all(sourceIds.map(async (sourceId) => {
      const sourceDef = CATALOG_DEFS[sourceId];
      if (!sourceDef) return [];

      let sourceUrl;
      if (sourceDef.handler === "tmdb_anime") {
        sourceUrl = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=1`;
      } else if (sourceDef.handler === "tmdb_bollywood") {
        sourceUrl = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_original_language=hi&sort_by=popularity.desc&page=1`;
      } else if (sourceDef.handler === "tmdb_paramount") {
        sourceUrl = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=2616%7C2303&watch_region=US&sort_by=popularity.desc&page=1`;
      } else {
        sourceUrl = buildTmdbCatalogUrl({
          def: sourceDef,
          type,
          tmdbType,
          page: 1,
          sortBy: "popularity.desc",
          ratingParam: "",
          languageParam: "",
          TMDB_KEY,
          includeAdult
        });
      }

      if (!sourceUrl) return [];

      try {
        const data = await fetchCached(sourceUrl);
        return data?.results || [];
      } catch (e) {
        console.log("merged catalog source fetch error", catalogId, sourceId, e.message);
        return [];
      }
    }));

    let combined = fetchedLists.flat();

    // Dedupe by TMDB id, keeping the first (highest-priority source) copy.
    const seenTmdbIds = new Set();
    combined = combined.filter(item => {
      if (!item || !item.id) return false;
      const key = String(item.id);
      if (seenTmdbIds.has(key)) return false;
      seenTmdbIds.add(key);
      return true;
    });

    if (def.minVoteAverage) combined = combined.filter(item => (item.vote_average || 0) >= def.minVoteAverage);
    if (def.minVoteCount) combined = combined.filter(item => (item.vote_count || 0) >= def.minVoteCount);
    if (def.maxVoteCount) combined = combined.filter(item => (item.vote_count || 0) <= def.maxVoteCount);

    const sortField = def.sortField || "popularity";
    combined.sort((a, b) => {
      if (sortField === "release_date") {
        const dateA = a.release_date || a.first_air_date || "";
        const dateB = b.release_date || b.first_air_date || "";
        return dateB.localeCompare(dateA);
      }
      if (sortField === "vote_average") {
        return (b.vote_average || 0) - (a.vote_average || 0);
      }
      return (b.popularity || 0) - (a.popularity || 0);
    });

    combined = combined.slice(0, def.limit || 100);

    return {
      metas: await resultsToMetas(
        combined,
        type,
        filterLang,
        language,
        rpdbKey,
        tpKey,
        excludeUnreleased,
        fanartKey,
        omdbKey,
        bpStyle,
        digitalReleaseOnly
      )
    };
  }

  if (def.handler ==="mdb") {
    const listId = def.listId || catalogId.replace("mdb_","");
    const effectiveType = def.type || type;

    return {
      metas: await mdblistToMetas(
        listId,
        effectiveType,
        mdbKey,
        rpdbKey,
        tpKey,
        maxRating,
        fanartKey,
        omdbKey,
        bpStyle,
        language,
        digitalReleaseOnly
      )
    };
  }
  let url = buildTmdbCatalogUrl({
  def,
  type,
  tmdbType,
  page,
  sortBy,
  ratingParam,
  languageParam,
  TMDB_KEY,
  includeAdult
});
switch(def.handler) {
    case"tmdb_collection": {
      let parts = (await fetchCached(`https://api.themoviedb.org/3/collection/${def.collectionId}?api_key=${TMDB_KEY}`)).parts || [];
      if(extra?.sort === "release_date_desc") parts = parts.slice().sort((a,b) => (b.release_date||"").localeCompare(a.release_date||""));
      else parts = parts.slice().sort((a,b) => (a.release_date||"").localeCompare(b.release_date||""));
      return { metas: await resultsToMetas(parts, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey, bpStyle) };
    }
    case"tmdb_multi_collection": {
      let allParts = [];
      for(const cid of def.collectionIds) {
        try {
          const d = await fetchCached(`https://api.themoviedb.org/3/collection/${cid}?api_key=${TMDB_KEY}`);
          if(d.parts) allParts.push(...d.parts);
        } catch(e) {}
      }
      if(extra?.sort === "release_date_desc") allParts = allParts.sort((a,b) => (b.release_date||"").localeCompare(a.release_date||""));
      else allParts = allParts.sort((a,b) => (a.release_date||"").localeCompare(b.release_date||""));
      return { metas: await resultsToMetas(allParts, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey, bpStyle) };
    }
    case "simkl_watchlist":
    case "simkl_completed":
    case "simkl_watching":
    case "simkl_rated":
      return await handleSimklCatalog(
        def.handler, type, simklAccessToken,
        rpdbKey, tpKey, excludeUnreleased,
        { resultsToMetas, fetchCached, TMDB_KEY },
        userToken
      );
    case "mal_watching":
    case "mal_plantowatch":
    case "mal_completed":
      return await handleMalCatalog(
        def.handler, type, malAccessToken,
        { fetchCached, TMDB_KEY },
        userToken, userConfig
      );
    case "anilist_watching":
    case "anilist_plantowatch":
    case "anilist_trending":
    case "anilist_seasonal":
      return await handleAnilistCatalog(
        def.handler, anilistAccessToken, anilistUserId,
        { fetchCached, TMDB_KEY }
      );
    case "trakt_trending":
    case "trakt_popular":
    case "trakt_anticipated":
    case "trakt_user_favorites":
    case "trakt_user_watchlist":
    case "trakt_user_collection":
       return await handleTraktCatalog(
         def.handler,
         type,
         traktUser,
         language,
         rpdbKey,
         tpKey,
         excludeUnreleased,
         TRAKT_CLIENT_ID,
         traktAccessToken,
         userToken,
         userConfig,
         bpStyle
  );
    case"tmdb_anime":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&include_adult=${includeAdult?"true":"false"}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}${ratingParam}`;
      break;
    case"tmdb_bollywood":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&include_adult=${includeAdult?"true":"false"}&with_original_language=hi&sort_by=popularity.desc&page=${page}${ratingParam}`;
      break;
    case"tmdb_paramount":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=2616%7C2303&watch_region=US&sort_by=popularity.desc&page=${page}${ratingParam}`;
      break;
    case "tmdb_ids": {
      const useChronological = extra?.sort === "chronological" && Array.isArray(def.chronologicalIds);
      const ids = useChronological ? def.chronologicalIds : (Array.isArray(def.ids) ? def.ids : []);
      const results = [];

      for (const tmdbId of ids) {
        try {

       const item = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&language=${language}`);
          if(item && item.id) results.push(item);
        } catch(e) {
          console.log("tmdb_ids error", catalogId, tmdbId, e.message);
        }
      }
      return {
        metas: await resultsToMetas(
          results,
          type,
          false,
          language,
          rpdbKey,
          tpKey,
          excludeUnreleased,
          null,
          null,
          bpStyle,
          digitalReleaseOnly
        )
      };
    }
    case "tmdb_search": {

      const q = def.query || def.name;
      const data = await fetchCached(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1&language=${language}`);
      return {
        metas: await resultsToMetas(
          data.results || [],
          type,
          false,
          language,
          rpdbKey,
          tpKey,
          excludeUnreleased,
          null,
          null,
          bpStyle,
          digitalReleaseOnly
        )
      };
    }
   case "search":
  return await handleCatalogSearch({
    catalogId,                                                                                                                                                extra,
    tmdbType,
    type,
    language,
    rpdbKey,
    tpKey,
    TMDB_KEY,
    fetchCached,
    resultsToMetas,
    excludeUnreleased,
    digitalReleaseOnly
  });

default:
    if (!url) return { metas: [] };
    break;
}
  if (language && language !== "en-US") url += `&language=${language}`;
  const batchSize = 100; // 5 pages x 20 results per TMDB page
  const startPage = Math.floor((extra?.skip || 0) / batchSize) * 5 + 1;
  const pages = await Promise.all(
    Array.from({length: 5}, (_, i) =>
      fetchCached(url.replace(`page=${page}`, `page=${startPage + i}`))
        .catch(() => ({ results: [] }))
    )
  );
  let allResults = pages.flatMap(d => d.results || []);

  // TMDB popularity results can shift while adjacent pages are fetched.
  // Preserve first-seen ordering and remove repeated TMDB IDs.
  const seenTmdbIds = new Set();

  const appendUniqueTmdbResults = (items) => {
    for (const item of items || []) {
      const id = item?.id;

      if (!id) {
        allResults.push(item);
        continue;
      }

      const key = String(id);

      if (seenTmdbIds.has(key)) {
        continue;
      }

      seenTmdbIds.add(key);
      allResults.push(item);
    }
  };

  const initialResults = allResults;
  allResults = [];
  appendUniqueTmdbResults(initialResults);

  // Refill a deduplicated batch from the next TMDB page.
  // This keeps standard catalog rows at up to 100 unique results.
  if (allResults.length < batchSize) {
    const refillPage = startPage + 5;

    try {
      const refillData = await fetchCached(
        url.replace(`page=${page}`, `page=${refillPage}`)
      );

      appendUniqueTmdbResults(refillData?.results || []);
    } catch (error) {
      console.warn(
        "TMDB catalog refill failed:",
        catalogId,
        refillPage,
        error?.message || error
      );
    }
  }

  allResults = allResults.slice(0, batchSize);

  if (maxRating) {
    allResults = await filterByMaxRating(
      allResults,
      maxRating,
      type
    );
  }

  const rowOverride = (catalogOverrides && catalogOverrides[catalogId]) || null;
  if (rowOverride) {
    allResults = applyCatalogOverride(allResults, rowOverride);
  }

  // An explicit sort override is a deliberate user choice — the daily
  // shuffle would just scramble it right back out again.
  if (!rowOverride?.sortBy && shouldShuffleCatalog(catalogId, extra)) {
    const shuffleSeed = [
      catalogId,
      type,
      startPage,
      getDailyShuffleKey()
    ].join(":");

    allResults = seededShuffle(allResults, shuffleSeed);
  }

  return {
    metas: await resultsToMetas(
      allResults,
      type,
      filterLang,
      language,
      rpdbKey,
      tpKey,
      excludeUnreleased,
      fanartKey,
      omdbKey,
      bpStyle,
      digitalReleaseOnly
    )
  };
}


module.exports = {
  handleCatalog
};
