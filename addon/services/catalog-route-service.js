const { getWatchedIds, filterWatched } = require("./watched-filter");
const { resolveConfigForProfile } = require("../utils/profiles");
const {
  getProviderCapabilities,
  createEffectiveDiscoveryConfig
} = require("./provider-capability-service");
const { createMetadataService } = require("./metadata-service");
const { resolveRuntimeTmdbKey } = require("./tmdb-key-health-service");
const { buildEffectiveStreamAddons } = require("./stream-source-config-service");
const { probeStreamBridgeAvailability } = require("./stream-bridge");
const {
  createStreamAvailabilityScope,
  filterCatalogByStreamAvailability,
  scheduleStreamAvailabilityChecks
} = require("./stream-availability-service");

function buildRequestCatalogDeps(catalogDeps, tmdbKey) {
  return {
    ...catalogDeps,
    TMDB_KEY: tmdbKey,
    ...createMetadataService({ tmdbKey })
  };
}

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
    readConfig = async (token) => loadConfigs()[token],
    MDBLIST_KEY
  } = deps;

app.use(async (req, res, next) => {
  const url = req.url;
  if (url.includes("/manifest.json") && !url.startsWith("/c/") && !url.startsWith("/n/") && !url.startsWith("/collections/") && !url.startsWith("/auth/")) {
    const fullManifest = {
      id: FILTER_ENABLED ?"com.ultramax" :"com.ultramax.all.dev",
      version: require("../package.json").version,
  logo: "https://ultramax.vip/logo.png",
      name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All Dev",
      description: FILTER_ENABLED ?"Curated discovery with filtered rows and cleaner collections." :"Full Ultra MAX discovery with all available rows.",
      types: ["movie","series","tv"],
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
  if (url.match(/\/catalog\//) && !url.startsWith("/c/") && !url.startsWith("/n/") && !url.startsWith("/collections/")) {
    const match = url.match(/\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      const [, type, id, extraStr] = match;
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split("&").forEach(p => { const [k,v] = p.split("="); if(k && v) extra[k]=decodeURIComponent(v); }); } }
        handleCatalogService(
  id,
  type,
  extra,
  MDBLIST_KEY,    // server-owned public MDBList key
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
if (url.includes("/catalog/") && (url.includes("/c/") || url.includes("/n/"))) {
    const match = url.match(/\/(?:c|n)\/([^/]+)\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      let [, token, type, id, extraStr] = match;
      if (id === "search_movie") id = "search_movies";
      const baseConfig = await readConfig(token, req.query.profile);
      if (!baseConfig) return res.json({ metas: [] });
      const resolvedConfig = resolveConfigForProfile(baseConfig, req.query.profile);
      const capabilities = getProviderCapabilities(resolvedConfig, {
        serverTmdbKey: catalogDeps.TMDB_KEY
      });
      const runtimeTmdb = await resolveRuntimeTmdbKey(capabilities, {
        serverTmdbKey: catalogDeps.TMDB_KEY
      });
      if (!capabilities.hasAnyDiscoveryProvider || !runtimeTmdb.tmdbKey) {
        return res.json({ metas: [] });
      }
      const config = createEffectiveDiscoveryConfig(resolvedConfig, {
        catalogDefs: CATALOG_DEFS,
        capabilities
      });
      const requestCatalogDeps = buildRequestCatalogDeps(
        catalogDeps,
        runtimeTmdb.tmdbKey
      );
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split('&').forEach(p => { const [k,v] = p.split('='); if(k && v) extra[k]=decodeURIComponent(v); }); } }
      if (req.query.skip) extra.skip = parseInt(req.query.skip);
      if (req.query.search) extra.search = req.query.search;
      const hasAnime = config.catalogs.some(c => c.includes("anime") || c.includes("bollywood") || c.includes("crunchyroll") || c.includes("hidive"));
       handleCatalogService(
        id,
        type,
        extra,
        capabilities.effectiveMdbKey,
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
        requestCatalogDeps,
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
              id === "ai_recommended_series" ||
              id === "ai_anime_anilist";

            /*
             * AI recommendations automatically avoid watched titles when
             * Trakt or Simkl is connected. Other catalogs continue to obey
             * the user's global Hide Watched setting.
             */
            const shouldFilterWatched =
              (isAiCatalog || config.hideWatched) &&
              (config.traktAccessToken || config.simklAccessToken);

            if (shouldFilterWatched) {
              try {
                const watchedIds = await getWatchedIds(
                  token,
                  config.traktAccessToken || null,
                  config.simklAccessToken || null,
                  process.env.TRAKT_CLIENT_ID,
                  process.env.SIMKL_CLIENT_ID
                );

                result = filterWatched(result, watchedIds);
              } catch (error) {
                console.warn(
                  "[watched-filter] post-processing failed open:",
                  error.message
                );
              }
            }

            if (config.hideUnavailableStreams && type === "movie") {
              try {
                const availabilityAddons = buildEffectiveStreamAddons(config);
                const availabilityScope =
                  createStreamAvailabilityScope(availabilityAddons);

                if (availabilityScope) {
                  const filtered = filterCatalogByStreamAvailability(
                    result,
                    {
                      scope: availabilityScope,
                      type
                    }
                  );

                  result = filtered.result;

                  const scheduled = scheduleStreamAvailabilityChecks({
                    scope: availabilityScope,
                    type,
                    metas: result.metas,
                    probe: (probeType, probeId) =>
                      probeStreamBridgeAvailability(
                        availabilityAddons,
                        probeType,
                        probeId
                      )
                  });

                  if (filtered.excludedUnavailable || scheduled) {
                    console.log(
                      "[stream-availability] catalog " +
                      JSON.stringify({
                        id,
                        type,
                        excludedUnavailable:
                          filtered.excludedUnavailable,
                        known: filtered.known,
                        unknown: filtered.unknown,
                        scheduled
                      })
                    );
                  }
                }
              } catch (error) {
                console.warn(
                  "[stream-availability] catalog filter failed open:",
                  error?.message || error
                );
              }
            }

            /*
             * Surplus candidates are produced so watched removals do not
             * leave a half-empty recommendation row.
             */
            if (isAiCatalog && Array.isArray(result?.metas)) {
              result.metas = result.metas.slice(0, 24);
            }

            const hasImmediateCatalogFilters = Boolean(
              (Array.isArray(config.contentExclusions) && config.contentExclusions.length) ||
              (config.catalogOverrides && config.catalogOverrides[id])
            );

            res.setHeader(
              "Cache-Control",
              hasImmediateCatalogFilters
                ? "private, no-store, max-age=0"
                : (config.hideUnavailableStreams
                    ? "public, max-age=60"
                    : "public, max-age=300")
            );
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
  registerCatalogRoutes,
  buildRequestCatalogDeps
};
