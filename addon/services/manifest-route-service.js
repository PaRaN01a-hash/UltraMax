const { resolveConfigForProfile } = require("../utils/profiles");
const { MUTATION_REASONS } = require("../utils/config-store");
const { MDB_ID_ALIASES, resolveCatalogId } = require("../catalogs/catalog-defs");
const { shouldIncludeAnimeRow, shouldIncludeIndianCinemaRow } = require("./content-filter-service");
const { createEffectiveDiscoveryConfig } = require("./provider-capability-service");
const { isPremiumizeLibraryCatalogId, premiumizeLibraryConfigured } = require("./premiumize-library-service");
const { isTorboxLibraryCatalogId, torboxLibraryConfigured } = require("./torbox-library-service");
const { buildSearchCatalogs } = require("./search-catalog-name-service");
const { localizeCatalogs } = require("./catalog-localization-service");

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
// Nuvio TV understands the non-standard showInHome flag, but current
// Nuvio Mobile determines Home eligibility from required catalog extras.
// For rows explicitly hidden by Ultra MAX, mark `skip` required in the /n/
// manifest as the cross-client compatibility signal. The catalog remains in
// the manifest, so existing collection sources can still resolve it by id.
function makeNuvioHiddenCatalogHomeSafe(catalog) {
  if (!catalog || catalog.showInHome !== false) return catalog;

  const extras = Array.isArray(catalog.extra)
    ? catalog.extra.map(extra => (
        extra && String(extra.name || "").toLowerCase() === "skip"
          ? { ...extra, isRequired: true }
          : extra
      ))
    : [];

  if (!extras.some(extra => extra && String(extra.name || "").toLowerCase() === "skip")) {
    extras.push({ name: "skip", isRequired: true });
  }

  return { ...catalog, extra: extras };
}

function isUltraMaxCollectionAddonId(addonId, token, profileId) {
  const id = String(addonId || "").trim();
  if (!id) return false;

  if (id === "com.ultramax" || id === "com.ultramax") return true;

  const suffix = profileId ? `.${String(profileId).toLowerCase()}` : "";
  const expectedNuvioId = `com.ultramax.nuvio.${String(token || "").toLowerCase()}${suffix}`;
  if (id.toLowerCase() === expectedNuvioId) return true;

  try {
    const url = new URL(id);
    if (url.hostname !== "ultramax.vip") return false;
    const match = url.pathname.match(/^\/(?:c|n)\/([^/]+)(?:\/p\/([^/]+))?\/manifest\.json$/i);
    if (!match) return false;
    if (String(match[1] || "").toLowerCase() !== String(token || "").toLowerCase()) return false;

    const sourceProfile = match[2]
      ? decodeURIComponent(match[2])
      : (url.searchParams.get("profile") || "");
    if (sourceProfile && String(sourceProfile).toLowerCase() !== String(profileId || "").toLowerCase()) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function collectNuvioCollectionDependencyIds(collections, token, profileId) {
  const dependencyIds = new Set();
  const addId = value => {
    if (value === undefined || value === null || value === "") return;
    dependencyIds.add(resolveCatalogId(String(value)));
  };

  for (const collection of Array.isArray(collections) ? collections : []) {
    for (const folder of Array.isArray(collection?.folders) ? collection.folders : []) {
      // `rows` is the legacy Ultra MAX-only collection shape.
      for (const id of Array.isArray(folder?.rows) ? folder.rows : []) addId(id);

      for (const key of ["sources", "catalogSources"]) {
        for (const source of Array.isArray(folder?.[key]) ? folder[key] : []) {
          if (!source || !source.catalogId) continue;
          if (!isUltraMaxCollectionAddonId(source.addonId, token, profileId)) continue;
          addId(source.catalogId);
        }
      }
    }
  }

  return [...dependencyIds];
}

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

  return safeIds.filter(id => {
      const cleanId = String(id || "").toLowerCase();

      /*
       * Sports upcoming is a schedule catalogue, not unreleased
       * movie/series content.
       */
      if (cleanId.startsWith("nuvio_sports_")) {
        return true;
      }

      return !cleanId.includes("upcoming");
    });
}

function getManifestIdPrefixes(config) {
  const prefixes =
    (
      config.preserveKitsuIds ||
      config.animePresentationMode === "anisync"
    )
      ? ["tt", "tmdb", "kitsu"]
      : ["tt", "tmdb"];

  const catalogs =
    Array.isArray(config.catalogs)
      ? config.catalogs
      : [];

  const hasSportsFixtures =
    catalogs.some(id =>
      id === "sports_epl_fixtures" ||
      id === "sports_nba_fixtures" ||
      id === "sports_nbl_fixtures" ||
      id === "sports_f1_fixtures" ||
      id === "f1_2025"
    );

  if (hasSportsFixtures) {
    prefixes.push("sports:");
  }

  const hasNuvioSports =
    catalogs.some(id =>
      String(id || "").startsWith(
        "nuvio_sports_"
      )
    );

  if (hasNuvioSports) {
    prefixes.push("nuvio_sport_");
  }

  if (premiumizeLibraryConfigured(config)) {
    prefixes.push("pml_");
  }

  if (torboxLibraryConfigured(config)) {
    prefixes.push("tbl_");
  }

  return prefixes;
}

const NATIVE_SPORTS_STREAM_CATALOG_IDS = new Set([
  "sports_epl_fixtures",
  "sports_nba_fixtures",
  "sports_nbl_fixtures",
  "sports_f1_fixtures"
]);

function isNativeSportsStreamCatalogId(id) {
  const cleanId =
    String(id || "");

  return (
    NATIVE_SPORTS_STREAM_CATALOG_IDS.has(cleanId) ||
    cleanId.startsWith("nuvio_sports_")
  );
}

function hasNativeSportsStreamCatalog(config) {
  const catalogs =
    Array.isArray(config?.catalogs)
      ? config.catalogs
      : [];

  return catalogs.some(id =>
    isNativeSportsStreamCatalogId(id)
  );
}

function hasExternalStreamResource(config) {
  return Boolean(
    (config?.streamAddons && config.streamAddons.length > 0) ||
    (Array.isArray(config?.debridServices) && config.debridServices.length > 0) ||    (config?.debridService && config.debridApiKey) ||
    premiumizeLibraryConfigured(config) ||
    torboxLibraryConfigured(config)
  );
}

function getStreamResourceTypes(config) {
  const types = [];
  if (hasExternalStreamResource(config)) types.push("movie", "series");
  if (hasNativeSportsStreamCatalog(config)) types.push("tv");
  return types;
}

function buildManifestResources(config) {
  const streamTypes = getStreamResourceTypes(config);
  return streamTypes.length > 0
    ? ["catalog", "meta", { name: "stream", types: streamTypes }]
    : ["catalog", "meta"];
}

function shouldAdvertiseStreamResource(config) {
  return getStreamResourceTypes(config).length > 0;
}

function shouldUpdateLastAccess(config) {
  if (
    !config.lastAccessed ||
    Date.now() - new Date(config.lastAccessed).getTime() >
      24 * 60 * 60 * 1000
  ) {
    return true;
  }

  return false;
}

async function handleNuvioManifest(req, res, deps) {
  const {
  loadConfigs,
  readConfig = async (token) => loadConfigs()[token],
  saveConfigs,
  mutateAccount = async (token, mutator) => { const configs = loadConfigs(); if (!configs[token]) return undefined; await mutator(configs[token]); await saveConfigs(configs); return configs[token]; },
  buildCatalogsFromIds,
  QUICK_PICK_CATALOGS,
  CATALOG_DEFS,
  onManifestServed = null
    } = deps;

  const { token } = req.params;
  const baseConfig = await readConfig(token, req.query.profile);
  if (!baseConfig) {
    return res.status(404).json({ error: "Config not found" });
  }

  if (shouldUpdateLastAccess(baseConfig)) {
    await mutateAccount(token, config => {
      if (shouldUpdateLastAccess(config)) config.lastAccessed = new Date().toISOString();
    }, { reason: MUTATION_REASONS.HOUSEKEEPING_LAST_ACCESSED });
  }

  // A device profile install (?profile=<id>) resolves to a full alternate
  // config — its own catalogs, collections, everything — layered on the
  // base config. See utils/profiles.js.
  const resolvedConfig = resolveConfigForProfile(baseConfig, req.query.profile);
  const config = createEffectiveDiscoveryConfig(resolvedConfig, {
    catalogDefs: CATALOG_DEFS
  });

  // Step 2 remains the authoritative Home selection. Step 3 collections may
  // reference additional Ultra MAX catalogs; advertise those dependencies in
  // the Nuvio manifest, but always hide them from Home unless the user also
  // explicitly selected the same catalog in Step 2.
  const profileId = req.query.profile;
  const explicitCatalogIds = Array.isArray(config.catalogs) ? config.catalogs : [];
  const explicitlySelected = new Set(explicitCatalogIds.map(id => resolveCatalogId(String(id))));
  const collectionDependencyIds = collectNuvioCollectionDependencyIds(
    config.collections,
    token,
    profileId
  ).filter(id => !explicitlySelected.has(id));
  const effectiveHiddenCatalogIds = Array.from(new Set([
    ...(config.hiddenCatalogs || []).map(id => resolveCatalogId(String(id))),
    ...collectionDependencyIds
  ]));

  // Apply user-defined catalog order if set. Collection dependencies are
  // appended after explicit selections so they never disturb the user's Home
  // ordering even though Nuvio can resolve them inside collections.
  const catalogIdsWithEnableAi = config.enableAiRecommended
    ? [...explicitCatalogIds, "ai_recommended_movies", "ai_recommended_series"]
    : explicitCatalogIds;
  const homeAndAutomaticIds = config.anilistAccessToken
    ? [...catalogIdsWithEnableAi, "ai_anime_anilist"]
    : catalogIdsWithEnableAi;
  const rawCatalogIds = Array.from(new Set([
    ...homeAndAutomaticIds,
    ...collectionDependencyIds
  ]));

  const orderedCatalogIds = (config.catalogOrder && config.catalogOrder.length)
    ? [
        ...config.catalogOrder.filter(id => rawCatalogIds.includes(id)),
        ...rawCatalogIds.filter(id => !config.catalogOrder.includes(id))
      ]
    : rawCatalogIds;

  const visibleCatalogIds = filterUpcomingCatalogIds(
    orderedCatalogIds,
    config.excludeUnreleased
  ).filter(id => shouldIncludeAnimeRow(id, config) && shouldIncludeIndianCinemaRow(id, config))
  .filter(id => !isPremiumizeLibraryCatalogId(id) || premiumizeLibraryConfigured(config))
  .filter(id => !isTorboxLibraryCatalogId(id) || torboxLibraryConfigured(config));

  const catalogs = localizeCatalogs(
    buildCatalogsFromIds(
      visibleCatalogIds,
      effectiveHiddenCatalogIds,
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
    })),
    config.language,
    {
      protectedIds: new Set(
        (config.mergedCatalogs || [])
          .map(c => String(c?.id || ""))
          .filter(Boolean)
      )
    }
  );

  const primaryCatalogs = catalogs
    .concat(buildSearchCatalogs(config))
    .concat(
      (config.customCatalogs || [])
        .filter(c => visibleCatalogIds.includes(c.id))
        .filter(c =>
          !config.excludeUnreleased ||
          !String(c.id || "").toLowerCase().includes("upcoming")
        )
        .map(c => ({
          type: c.type || "movie",
          id: c.id,
          name: c.name,
          showInHome: !effectiveHiddenCatalogIds.includes(c.id),
          // Nuvio handles skip internally as pagination. Marking it required
          // makes Nuvio's collection picker treat the catalog as needing
          // user input and therefore hides it from collection selection.
          extra: [{ name: "skip", isRequired: false }]
        }))
    )
    .concat(
      (config.customMdbLists || [])
        .filter(c => visibleCatalogIds.includes(c.id))
        .filter(c => c.enabled !== false)
        .map(c => ({
          type: c.type || "movie",
          id: c.id,
          name: c.name,
          showInHome: !effectiveHiddenCatalogIds.includes(c.id),
          extra: [{ name: "skip", isRequired: false }]
        }))
    )
    .concat(
      (config.customTraktLists || [])
        .filter(c => visibleCatalogIds.includes(c.id))
        .filter(c => c.enabled !== false)
        .map(c => ({
          type: c.type || "movie",
          id: c.id,
          name: c.name,
          showInHome: !effectiveHiddenCatalogIds.includes(c.id),
          extra: [{ name: "skip", isRequired: false }]
        }))
    );

  const manifestCatalogs = primaryCatalogs
    .concat(buildLegacyCatalogAliases(primaryCatalogs))
    .map(makeNuvioHiddenCatalogHomeSafe);

  // A device profile install (?profile=<id>) gets its own manifest id/name
  // suffix so Stremio/Nuvio treat it as a distinct addon if a user installs
  // more than one profile on the same device.
  const profile = profileId && config.profiles && config.profiles[profileId];
  const idSuffix = profile ? "." + String(profileId).toLowerCase() : "";
  const nameSuffix = profile ? " — " + profile.name : "";

  const manifest = {
    id: "com.ultramax.nuvio." + token.toLowerCase() + idSuffix,
    version: require("../package.json").version,
    name: "Ultra MAX" + nameSuffix,
    description: "Ultra MAX Nuvio compatible manifest",
    logo: "https://ultramax.vip/logo.png",
    types: ["movie", "series", "tv"],
    idPrefixes: getManifestIdPrefixes(config),
    resources: buildManifestResources(config),
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
      newEpisodeNotifications: true
    },
    catalogs: manifestCatalogs
  };
  res.json(manifest);
  if (typeof onManifestServed === "function") {
    try { onManifestServed(token, config, profileId); } catch (_) {}
  }
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
  config = createEffectiveDiscoveryConfig(config, { catalogDefs: CATALOG_DEFS });

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
  ).filter(id => shouldIncludeAnimeRow(id, config) && shouldIncludeIndianCinemaRow(id, config))
  .filter(id => !isPremiumizeLibraryCatalogId(id) || premiumizeLibraryConfigured(config))
  .filter(id => !isTorboxLibraryCatalogId(id) || torboxLibraryConfigured(config));

  const profile = profileId && config.profiles && config.profiles[profileId];
  const idSuffix = profile ? "." + String(profileId).toLowerCase() : "";
  const nameSuffix = profile ? " — " + profile.name : "";

  const primaryCatalogs = localizeCatalogs(
    buildCatalogsFromIds(
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
      extra: [{ name: "skip", isRequired: c.showInHome === false }]
    })),
    config.language,
    {
      protectedIds: new Set(
        (config.mergedCatalogs || [])
          .map(c => String(c?.id || ""))
          .filter(Boolean)
      )
    }
  )
  .concat(buildSearchCatalogs(config))
  .concat(
    (config.customCatalogs || [])
      .filter(c => mainCatalogIds.includes(c.id))
      .filter(c =>
        !config.excludeUnreleased ||
        !String(c.id || "").toLowerCase().includes("upcoming")
      )
      .map(c => ({
        type: c.type || 'movie',
        id: c.id,
        name: c.name,
        showInHome: !(config.hiddenCatalogs || []).includes(c.id),
        extra: [{ name: 'skip', isRequired: (config.hiddenCatalogs || []).includes(c.id) }]
      }))
  )
  .concat(
    (config.customMdbLists || [])
      .filter(c => mainCatalogIds.includes(c.id))
      .filter(c => c.enabled !== false)
      .map(c => ({
        type: c.type || 'movie',
        id: c.id,
        name: c.name,
        showInHome: !(config.hiddenCatalogs || []).includes(c.id),
        extra: [{ name: 'skip', isRequired: (config.hiddenCatalogs || []).includes(c.id) }]
      }))
  )
  .concat(
    (config.customTraktLists || [])
      .filter(c => mainCatalogIds.includes(c.id))
      .filter(c => c.enabled !== false)
      .map(c => ({
        type: c.type || 'movie',
        id: c.id,
        name: c.name,
        showInHome: !(config.hiddenCatalogs || []).includes(c.id),
        extra: [{ name: 'skip', isRequired: (config.hiddenCatalogs || []).includes(c.id) }]
      }))
  );
  const manifestCatalogs = primaryCatalogs.concat(
    buildLegacyCatalogAliases(primaryCatalogs)
  );

  return {
    id: "com.ultramax" + idSuffix,
    version: require("../package.json").version,
    name: "Ultra MAX" + nameSuffix,
    description: `Ultra MAX setup with ${manifestCatalogs.length} curated rows. Built for cleaner discovery and smoother browsing.`,
    logo: "https://ultramax.vip/logo.png",
    types: ["movie", "series", "tv"],
    idPrefixes: getManifestIdPrefixes(config),
    resources: buildManifestResources(config),
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
      newEpisodeNotifications: true
    },
    catalogs: manifestCatalogs
  };
}

async function handleMainManifest(req, res, deps) {
const {
  loadConfigs,
  readConfig = async (token) => loadConfigs()[token],
  saveConfigs,
  mutateAccount = async (token, mutator) => { const configs = loadConfigs(); if (!configs[token]) return undefined; await mutator(configs[token]); await saveConfigs(configs); return configs[token]; },
  buildCatalogsFromIds,
  QUICK_PICK_CATALOGS,
  CATALOG_DEFS,
  onManifestServed = null
} = deps;

  const { token } = req.params;
  const baseConfig = await readConfig(token, req.query.profile);
  if (!baseConfig) {
    return res.status(404).json({ error: "Config not found" });
  }

  if (shouldUpdateLastAccess(baseConfig)) {
    await mutateAccount(token, config => {
      if (shouldUpdateLastAccess(config)) config.lastAccessed = new Date().toISOString();
    }, { reason: MUTATION_REASONS.HOUSEKEEPING_LAST_ACCESSED });
  }

  const config = resolveConfigForProfile(baseConfig, req.query.profile);
  const profileId = req.query.profile;

  const manifest = buildMainManifestObject(config, token, profileId, {
    buildCatalogsFromIds,
    QUICK_PICK_CATALOGS,
    CATALOG_DEFS
  });

  res.json(manifest);
  if (typeof onManifestServed === "function") {
    try { onManifestServed(token, config, profileId); } catch (_) {}
  }
}

module.exports = {
  handleNuvioManifest,
  handleCinemetaClone,
  handleMainManifest,
  buildMainManifestObject,
  hasNativeSportsStreamCatalog,
  hasExternalStreamResource,
  getStreamResourceTypes,
  buildManifestResources,
  shouldAdvertiseStreamResource
};
