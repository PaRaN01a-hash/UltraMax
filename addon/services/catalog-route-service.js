const { getWatchedIds, filterWatched } = require("./watched-filter");
const { resolveConfigForProfile } = require("../utils/profiles");

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;

function registerCatalogRoutes(app, deps) {
console.log("CATALOG ROUTE SERVICE ACTIVE");
  const {
    FILTER_ENABLED,
    QUICK_PICK_CATALOGS,
    DYNAMIC_CATALOGS,
    staticIds,
    CATALOG_DEFS,
    buildManifestCatalogs,
    handleCatalogService,
    catalogDeps,
    loadConfigs,
    MDBLIST_KEY
  } = deps;

app.use((req, res, next) => {
  const url = req.url;
  if (url.includes("/manifest.json") && !url.startsWith("/c/") && !url.startsWith("/n/") && !url.startsWith("/collections/") && !url.startsWith("/auth/")) {
    const fullManifest = {
      id: FILTER_ENABLED ?"com.ultramax" :"com.ultramax",
      version: require("../package.json").version,
  logo: `${BASE_URL}/logo.svg`,
      name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All Dev",
      description: FILTER_ENABLED ?"Curated discovery with filtered rows and cleaner collections." :"Full Ultra MAX discovery with all available rows.",
      types: ["movie","series"],
      resources: ["catalog","meta","stream"],
      catalogs: [
        ...QUICK_PICK_CATALOGS,
        ...buildManifestCatalogs(
  staticIds,
  CATALOG_DEFS
),
        ...DYNAMIC_CATALOGS.map(c => ({ type: c.type, id: c.id, name: c.name, extra: [{ name:"tmdbId", isRequired: true }] })),
        { type:"movie", id:"search_movies", name:"Ultra MAX Search", extra:[{ name:"search", isRequired:true }], extraSupported:["search"] },
        { type:"series", id:"search_series", name:"Ultra MAX Search", extra:[{ name:"search", isRequired:true }], extraSupported:["search"] }
      ]
    };
    fullManifest.catalogs = (fullManifest.catalogs || [])
  .filter(c => c && c.id) // keep valid ones only
  .map(c => ({
    ...c,
    name: (c.name || "").trim()
  }));

    return res.json(fullManifest);
  }
  if (url.match(/\/catalog\//) && !url.startsWith("/c/") && !url.startsWith("/collections/")) {
    const match = url.match(/\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      const [, type, id, extraStr] = match;
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split("&").forEach(p => { const [k,v] = p.split("="); if(k && v) extra[k]=decodeURIComponent(v); }); } }
        handleCatalogService(
  id,
  type,
  extra,
  null,           // mdbKey
  FILTER_ENABLED, // filterLang
  "en-US",        // language
  null,           // rpdbKey
  null,           // tpKey
  null,           // traktUser
  false,          // excludeUnreleased
  null,           // maxRating
  false,          // includeAdult
  [],             // customCatalogs
  null,           // googleAiKey
  null,           // fanartKey
  null,           // omdbKey
  catalogDeps     // deps
)
        .then(result => { res.setHeader("Cache-Control","public, max-age=300"); res.json(result); })
        .catch(() => res.json({ metas: [] }));
      return;
    }
  }
if (url.includes("/catalog/") && url.includes("/c/")) {
    const match = url.match(/\/c\/([^/]+)\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      let [, token, type, id, extraStr] = match;
console.log(
  "CUSTOM CATALOG:",
  token,
  id,
  "extraStr:",
  extraStr,
  "query:",
  req.query
);

      if (id === "search_movie") id = "search_movies";
      const configs = loadConfigs();
      if (!configs[token]) return res.json({ metas: [] });
      const config = resolveConfigForProfile(configs[token], req.query.profile);
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split('&').forEach(p => { const [k,v] = p.split('='); if(k && v) extra[k]=decodeURIComponent(v); }); } }
      if (req.query.skip) extra.skip = parseInt(req.query.skip);
      if (req.query.search) extra.search = req.query.search;
      const hasAnime = config.catalogs.some(c => c.includes("anime") || c.includes("bollywood") || c.includes("crunchyroll") || c.includes("hidive"));
       handleCatalogService(
        id,
        type,
        extra,
        config.mdblistKey || MDBLIST_KEY,
        hasAnime ? false : FILTER_ENABLED,
        config.language || "en-US",
        config.rpdbKey || null,
        config.tpKey || null,
        config.traktUser || null,
        config.excludeUnreleased || false,
        config.maxRating || null,
        config.includeAdult || false,
        config.customCatalogs || [],
        config.googleAiKey || null,
        config.fanartKey || null,
        config.omdbKey || null,
        catalogDeps,
        config.excludeLanguages || [],
        config.betterPostersStyle || null,
        config.traktAccessToken || null,
        config.simklAccessToken || null,
        token,
        config,
        config.digitalReleaseOnly || false,
        config.customMdbLists || [],
        config.malAccessToken || null,
        config.anilistAccessToken || null,
        config.anilistUserId || null,
        config.catalogOverrides || {}
      )
        .then(async result => {
            const isAiCatalog =
              id === "ai_recommended_movies" ||
              id === "ai_recommended_series";

            /*
             * AI recommendations automatically avoid watched titles when
             * Trakt or Simkl is connected. Other catalogs continue to obey
             * the user's global Hide Watched setting.
             */
            const shouldFilterWatched =
              (isAiCatalog || config.hideWatched) &&
              (config.traktAccessToken || config.simklAccessToken);

            if (shouldFilterWatched) {
              const watchedIds = await getWatchedIds(
                token,
                config.traktAccessToken || null,
                config.simklAccessToken || null,
                process.env.TRAKT_CLIENT_ID,
                process.env.SIMKL_CLIENT_ID
              );

              result = filterWatched(result, watchedIds);
            }

            /*
             * Surplus candidates are produced so watched removals do not
             * leave a half-empty recommendation row.
             */
            if (isAiCatalog && Array.isArray(result?.metas)) {
              result.metas = result.metas.slice(0, 24);
            }

            res.setHeader("Cache-Control","public, max-age=300");
            res.json(result);
          })
        .catch(() => res.json({ metas: [] }));
      return;
    }
  }
  next();
});

}

module.exports = {
  registerCatalogRoutes
};
