const { resolveConfigForProfile } = require("../utils/profiles");
const { MDB_ID_ALIASES } = require("../catalogs/catalog-defs");
const { shouldIncludeAnimeRow, shouldIncludeIndianCinemaRow } = require("./content-filter-service");

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;

// Some older Nuvio layouts stored streaming-service series rows as movie
// catalogues. Advertise both types for those legacy IDs so the saved rows
// continue matching without creating visible duplicate home rows.
const LEGACY_STREAMING_SERIES_IDS = new Set([
  "mdb_86751", // Netflix
  "mdb_86753", // Amazon
  "mdb_88319", // Apple TV+
  "mdb_86758", // Disney+
  "mdb_89649", // HBO
  "mdb_86761", // Paramount+
  "mdb_88327"  // Hulu
]);

// Build hidden compatibility entries for catalogue IDs used by older
// Ultra MAX manifests. This lets Nuvio resolve previously saved home-layout
// rows without exposing duplicate rows in new default layouts.
function buildLegacyCatalogAliases(catalogs) {
  const safeCatalogs = Array.isArray(catalogs) ? catalogs : [];
  const canonicalById = new Map(
    safeCatalogs.map(catalog => [catalog.id, catalog])
  );

  const aliases = Object.entries(MDB_ID_ALIASES)
    .flatMap(([legacyId, canonicalId]) => {
      const canonical = canonicalById.get(canonicalId);
      if (!canonical) return [];

      const baseAlias = {
        type: canonical.type,
        id: legacyId,
        name: canonical.name,
        showInHome: false,
        extra: [{
          name: "skip",
          isRequired: true
        }]
      };

      const results = [baseAlias];

      if (
        canonical.type === "series" &&
        LEGACY_STREAMING_SERIES_IDS.has(legacyId)
      ) {
        results.push({
          ...baseAlias,
          type: "movie"
        });
      }

      return results;
    });

  const seen = new Set(
    safeCatalogs.map(catalog => `${catalog.type}:${catalog.id}`)
  );

  return aliases.filter(alias => {
    const key = `${alias.type}:${alias.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ULTRA MAX HIDE UPCOMING MANIFEST ROWS
function filterUpcomingCatalogIds(ids, excludeUnreleased) {
  const safeIds = Array.isArray(ids) ? ids : [];

  if (!excludeUnreleased) {
    return safeIds;
  }

  return safeIds.filter(
    id => !String(id || "").toLowerCase().includes("upcoming")
  );
}

function updateLastAccess(configs, token) {
  const config = configs[token];

  if (
    !config.lastAccessed ||
    Date.now() - new Date(config.lastAccessed).getTime() >
      24 * 60 * 60 * 1000
  ) {
    configs[token].lastAccessed = new Date().toISOString();
    return true;
  }

  return false;
}

function handleNuvioManifest(req, res, deps) {
  const {
  loadConfigs,
  saveConfigs,
  buildCatalogsFromIds,
  QUICK_PICK_CATALOGS,
  CATALOG_DEFS
    } = deps;

  const { token } = req.params;
  const configs = loadConfigs();
  const baseConfig = configs[token];

  if (!baseConfig) {
    return res.status(404).json({ error: "Config not found" });
  }

  if (updateLastAccess(configs, token)) {
    saveConfigs(configs);
  }

  // A device profile install (?profile=<id>) resolves to a full alternate
  // config — its own catalogs, collections, everything — layered on the
  // base config. See utils/profiles.js.
  const config = resolveConfigForProfile(baseConfig, req.query.profile);

  // Apply user-defined catalog order if set
  const catalogIdsWithEnableAi = config.enableAiRecommended
    ? [...(config.catalogs || []), "ai_recommended_movies", "ai_recommended_series"]
    : (config.catalogs || []);
  const rawCatalogIds = Array.from(new Set(
    config.anilistAccessToken
      ? [...catalogIdsWithEnableAi, "ai_anime_anilist"]
      : catalogIdsWithEnableAi
  ));

  const orderedCatalogIds = (config.catalogOrder && config.catalogOrder.length)
    ? [
        ...config.catalogOrder.filter(id => rawCatalogIds.includes(id)),
        ...rawCatalogIds.filter(id => !config.catalogOrder.includes(id))
      ]
    : rawCatalogIds;

  const visibleCatalogIds = filterUpcomingCatalogIds(
    orderedCatalogIds,
    config.excludeUnreleased
  ).filter(id => shouldIncludeAnimeRow(id, config) && shouldIncludeIndianCinemaRow(id, config));

  const catalogs = buildCatalogsFromIds(
    visibleCatalogIds,
    config.hiddenCatalogs || [],
    QUICK_PICK_CATALOGS,
    CATALOG_DEFS,
    config.mergedCatalogs || []
  ).map(c => ({
    type: c.type,
    id: c.id,
    name: c.name,
    showInHome: c.showInHome !== false,
    extra: Array.isArray(c.extra)
      ? c.extra
      : [{
          name: "skip",
          isRequired: c.showInHome === false
        }]
  }));

  catalogs.push(...buildLegacyCatalogAliases(catalogs));

  // A device profile install (?profile=<id>) gets its own manifest id/name
  // suffix so Stremio/Nuvio treat it as a distinct addon if a user installs
  // more than one profile on the same device.
  const profileId = req.query.profile;
  const profile = profileId && config.profiles && config.profiles[profileId];
  const idSuffix = profile ? "." + String(profileId).toLowerCase() : "";
  const nameSuffix = profile ? " — " + profile.name : "";

  return res.json({
    id: "com.ultramax.nuvio." + token.toLowerCase() + idSuffix,
    version: require("../package.json").version,
    name: "Ultra MAX" + nameSuffix,
    description: "Ultra MAX Nuvio compatible manifest",
    logo: `${BASE_URL}/logo.svg`,
    types: ["movie", "series"],
    idPrefixes: (
      config.preserveKitsuIds ||
      config.animePresentationMode === "anisync"
    ) ? ["tt", "tmdb", "kitsu"] : ["tt", "tmdb"],
    resources: (() => {
      const hasStream = (config.streamAddons && config.streamAddons.length > 0) ||
        (Array.isArray(config.debridServices) && config.debridServices.length > 0) ||
        (config.debridService && config.debridApiKey);
      return hasStream ? ["catalog", "meta", "stream"] : ["catalog", "meta"];
    })(),
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
      newEpisodeNotifications: true
    },
    catalogs
  });
}

function handleCinemetaClone(req, res) {
  console.log(
    "CINEMETA CLONE HIT",
    new Date().toISOString(),
    req.headers["user-agent"]
  );

  return res.json({
    id: "com.ultramax.cinemeta.clone",
    version: "1.0.0",
    description: "Cinemeta style test manifest",
    name: "Ultra MAX Cinemeta Clone",
    resources: ["catalog", "meta", "addon_catalog"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [
      {
        type: "movie",
        id: "top",
        name: "Popular",
        genres: ["Action", "Comedy", "Drama"],
        extra: [
          { name: "genre", options: ["Action", "Comedy", "Drama"] },
          { name: "search" },
          { name: "skip" }
        ],
        extraSupported: ["search", "genre", "skip"]
      }
    ],
    behaviorHints: {
      newEpisodeNotifications: true
    }
  });
}

// Pure builder for the main Stremio/Nuvio-install manifest object — no
// req/res, no config-store I/O. `config` must already be resolved for the
// target profile (see resolveConfigForProfile in utils/profiles.js).
// Extracted out of handleMainManifest so the installation-status fingerprint
// system (services/manifest-fingerprint-service.js) can derive its
// comparisons from the exact same manifest-generation code that serves real
// clients, instead of a second, drift-prone copy of this logic.
function buildMainManifestObject(config, token, profileId, deps) {
  const { buildCatalogsFromIds, QUICK_PICK_CATALOGS, CATALOG_DEFS } = deps;

  const mainCatalogIdsWithEnableAi = config.enableAiRecommended
    ? [...(config.catalogs || []), "ai_recommended_movies", "ai_recommended_series"]
    : (config.catalogs || []);

  const rawMainCatalogIds = Array.from(new Set(
    config.anilistAccessToken
      ? [...mainCatalogIdsWithEnableAi, "ai_anime_anilist"]
      : mainCatalogIdsWithEnableAi
  ));
  const orderedMainCatalogIds =
    Array.isArray(config.catalogOrder) && config.catalogOrder.length
      ? [
          ...config.catalogOrder.filter(id => rawMainCatalogIds.includes(id)),
          ...rawMainCatalogIds.filter(id => !config.catalogOrder.includes(id))
        ]
      : rawMainCatalogIds;
  const mainCatalogIds = filterUpcomingCatalogIds(
    orderedMainCatalogIds,
    config.excludeUnreleased
  ).filter(id => shouldIncludeAnimeRow(id, config) && shouldIncludeIndianCinemaRow(id, config));

  const profile = profileId && config.profiles && config.profiles[profileId];
  const idSuffix = profile ? "." + String(profileId).toLowerCase() : "";
  const nameSuffix = profile ? " — " + profile.name : "";

  return {
    id: "com.ultramax" + idSuffix,
    version: require("../package.json").version,
    name: "Ultra MAX" + nameSuffix,
    description: `Ultra MAX setup with ${(config.catalogs || []).length} curated rows. Built for cleaner discovery and smoother browsing.`,
    logo: `${BASE_URL}/logo.svg`,
    types: ["movie", "series"],
    idPrefixes: (
      config.preserveKitsuIds ||
      config.animePresentationMode === "anisync"
    ) ? ["tt", "tmdb", "kitsu"] : ["tt", "tmdb"],
    resources: (() => {
      const hasStream = (config.streamAddons && config.streamAddons.length > 0) ||
        (Array.isArray(config.debridServices) && config.debridServices.length > 0) ||
        (config.debridService && config.debridApiKey);
      return hasStream ? ["catalog", "meta", "stream"] : ["catalog", "meta"];
    })(),
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
      newEpisodeNotifications: true
    },
    catalogs: (() => {
      const primaryCatalogs = buildCatalogsFromIds(
        mainCatalogIds,
        config.hiddenCatalogs || [],
        QUICK_PICK_CATALOGS,
        CATALOG_DEFS,
        config.mergedCatalogs || []
      )
      .map(c => ({
        type: c.type,
        id: c.id,
        name: c.name,
        showInHome: c.showInHome !== false,
        extra: [{ name: "skip", isRequired: c.showInHome === false ? true : false }]
      }))
      .concat([
        {
          type: "movie",
          id: "search_movies",
          name: "Ultra MAX Search",
          extra: [{ name: "search", isRequired: true }],
        },
        {
          type: "series",
          id: "search_series",
          name: "Ultra MAX Search",
          extra: [{ name: "search", isRequired: true }]
        }
      ])
      .concat(
        (config.customCatalogs || [])
          .filter(c =>
            !config.excludeUnreleased ||
            !String(c.id || "").toLowerCase().includes("upcoming")
          )
          .map(c => ({
            type: c.type || 'movie',
            id: c.id,
            name: c.name,
            showInHome: true,
            extra: [{ name: 'skip', isRequired: false }]
          }))
      )
      .concat(
        (config.customMdbLists || [])
          .filter(c => c.enabled !== false)
          .map(c => ({
            type: c.type || 'movie',
            id: c.id,
            name: c.name,
            showInHome: true,
            extra: [{ name: 'skip', isRequired: false }]
          }))
      );

      return primaryCatalogs.concat(
        buildLegacyCatalogAliases(primaryCatalogs)
      );
    })()
  };
}

function handleMainManifest(req, res, deps) {
const {
  loadConfigs,
  saveConfigs,
  buildCatalogsFromIds,
  QUICK_PICK_CATALOGS,
  CATALOG_DEFS
} = deps;

  const { token } = req.params;
  const configs = loadConfigs();
  const baseConfig = configs[token];

  if (!baseConfig) {
    return res.status(404).json({ error: "Config not found" });
  }

  if (updateLastAccess(configs, token)) {
    saveConfigs(configs);
  }

  const config = resolveConfigForProfile(baseConfig, req.query.profile);
  const profileId = req.query.profile;

  const manifest = buildMainManifestObject(config, token, profileId, {
    buildCatalogsFromIds,
    QUICK_PICK_CATALOGS,
    CATALOG_DEFS
  });

  return res.json(manifest);
}

module.exports = {
  handleNuvioManifest,
  handleCinemetaClone,
  handleMainManifest,
  buildMainManifestObject
};
