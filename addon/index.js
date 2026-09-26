require('dotenv').config();

const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { isIP } = require("node:net");
const express = require("express");
const compression = require("compression");
const { CATALOG_DEFS } = require("./catalogs/catalog-defs");
const { QUICK_PICK_CATALOGS } = require("./catalogs/quick-picks");
const { DYNAMIC_CATALOGS } = require("./catalogs/dynamic-catalogs");
const { loadConfigs, readConfig, getConfigs, hasAccount, createAccount, mutateAccount, deleteAccount, configureProfileStoreAdapter, ownershipPolicy, saveConfigs } = require("./utils/config-store");
const { createProfileStoreAdapter } = require("./utils/profile-store-adapter");
const { profileStoreErrorHandler } = require("./utils/profile-store-http");
const { hashPassword, verifyPassword, generateToken } = require("./utils/auth");
const { rateLimit } = require("./utils/rate-limit");
const { checkAndRecord, clearKey } = require("./utils/rate-limit-store");
const { fetchCached, fetchTrakt } = require("./services/api-helpers");
const { streamBridgeResponse } = require("./services/stream-bridge");
const { buildEffectiveStreamAddons } = require("./services/stream-source-config-service");
const { resolveStreamLanguageSettings } = require("./services/stream-language-service");
const {
  createStreamAvailabilityScope,
  recordStreamAvailability
} = require("./services/stream-availability-service");
const { resolveConfigForProfile } = require("./utils/profiles");
const { profilePathMiddleware } = require("./services/profile-path-service");
const { registerEmail, recoverToken } = require("./token-recovery");
const { getImdbId, getMovieCertification, filterByMaxRating, imdbToTmdbMovieId, filterMetasByMaxRating, getBestPoster, traktToMetas, resultsToMetas, mdblistToMetas } = require("./services/metadata-service");
const {
  getProviderCapabilities,
  stripProviderCredentials
} = require("./services/provider-capability-service");
const { geminiAiRecommendations, geminiAnimeAnilistRecommendations, tmdbResolveAiItems } = require("./services/ai-service");
const PORT = process.env.PORT || 7000;
function requireAbsolutePathEnv(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw || !path.isAbsolute(raw)) {
    console.error(`${name} missing or not absolute - exiting`);
    process.exit(1);
  }
  return path.resolve(raw);
}
const ULTRAMAX_WEB_ROOT = requireAbsolutePathEnv("ULTRAMAX_WEB_ROOT");
const ULTRAMAX_IMAGES_ROOT = requireAbsolutePathEnv("IMAGES_DIR");
const ULTRAMAX_ARTWORK_ROOT = requireAbsolutePathEnv("ULTRAMAX_ARTWORK_ROOT");
const GALLERY_FILE = path.join(ULTRAMAX_WEB_ROOT, "gallery.html");
const QUICK_IMAGES_DIR = path.join(ULTRAMAX_WEB_ROOT, "images", "quick");
const TMDB_KEY = process.env.TMDB_KEY;
const MDBLIST_KEYS = (process.env.MDBLIST_KEYS || process.env.MDBLIST_KEY || "")
  .split(",")
  .map(key => key.trim())
  .filter(Boolean);
const MDBLIST_KEY = MDBLIST_KEYS[0];
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const FILTER_ENABLED = process.env.FILTER_MODE !=="off";
const { handleTraktCatalog } = require("./services/trakt-service");
const { handleQuickPicks } = require("./services/quick-picks-service");
const { handleSearch } = require("./services/search-service");
const { buildTmdbCatalogUrl } = require("./services/tmdb-catalog-service");
const { registerAuthRoutes } = require("./services/auth-service");
const { registerCollectionsAddon } = require("./services/collections-addon-service");
const { handleRelatedContent } = require("./services/related-content-service");
const { handleCatalogSearch } = require("./services/catalog-search-service");
const { getStaticIds, buildManifestCatalogs, buildCatalogsFromIds } = require("./services/manifest-service");
const { handleMetaRequest } = require("./services/meta-handler-service");
const {
  isKitsuId,
  resolveKitsuStreamId
} = require("./services/kitsu-id-service");
const { checkStreamWizard } = require("./services/stream-wizard-service");
const { handleConfiguredMeta } = require("./services/meta-route-service");

const {
  getNuvioSportsStreams,
  isNuvioSportsId
} = require("./services/nuvio-live-sports-service");

const {
  isSportsFixtureId
} = require(
  "./services/sports-fixture-catalog-service"
);

const {
  resolveF1ArchiveStreams,
  parseBooleanFlag
} = require(
  "./services/f1-archive-stream-service"
);

const {
  resolveFixtureLiveStreams
} = require(
  "./services/sports-fixture-broadcast-service"
);

const {
  createSportsHlsProxyStream,
  handleSportsHlsProxy
} = require(
  "./services/sports-hls-proxy-service"
);

const {
  resolveSportsStreams
} = require(
  "./services/sports-live-stream-service"
);

const LIVE_SPORTS_ENABLED =
  /^(1|true|yes|on)$/i.test(
    String(
      process.env.ULTRAMAX_LIVE_SPORTS_ENABLED ||
      ""
    ).trim()
  );

const MOTORSPORT_TORRENTS_ENABLED =
  parseBooleanFlag(
    process.env.ULTRAMAX_MOTORSPORT_TORRENTS_ENABLED
  );
const { handleNuvioManifest, handleCinemetaClone, handleMainManifest } = require("./services/manifest-route-service");
const { handleTmdbPreview } = require("./services/tmdb-preview-service");
const { registerConfigRoutes } = require("./services/config-route-service");
const { registerUltraPlayManagerBridge } = require("./services/ultraplay-manager-bridge");
const { registerAccountDeletionRoutes } = require("./services/account-deletion-service");
const { createUltraPlayImportBackupStore } = require("./services/ultraplay-import-backup-service");
const { registerFusionRoutes } = require("./services/fusion-route-service");
const { handleCatalog: handleCatalogService } = require("./services/catalog-handler-service");
const { registerCatalogRoutes } = require("./services/catalog-route-service");
const { registerCatalogInspectorRoutes } = require("./services/catalog-inspector-service");
const { registerStatsRoutes } = require("./services/stats-route-service");
const { verifyHandler } = require("./key-verify");
const { registerScrobbleRoute } = require("./services/scrobble-service");
const { registerRatingRoutes } = require("./services/rating-service");
const { registerCacheWarmRoute, warmFirstCatalogPosters } = require("./services/cache-warm-service");
const { registerNuvioProxyRoutes } = require("./services/nuvio-proxy-service");
const {
  registerCollectionSyncRoutes
} = require("./services/collection-sync-route-service");
const { registerSupportMessageRoutes } = require("./services/support-message-route-service");
const { registerResendInboundForwardRoutes } = require("./services/resend-inbound-forward-service");
const { registerShareRoutes } = require("./services/share-route-service");
const { registerArtworkRoutes } = require("./artwork-route");
const {
  registerPremiumizeLibraryRoutes,
  isPremiumizeLibraryContentId,
  resolvePremiumizeStream
} = require("./services/premiumize-library-service");
const {
  registerTorboxLibraryRoutes,
  isTorboxLibraryContentId,
  resolveTorboxStream,
  resolveTorboxLibraryApiKey
} = require("./services/torbox-library-service");

if (!TMDB_KEY) { console.error("TMDB_KEY missing - exiting"); process.exit(1); }

const staticIds = getStaticIds( CATALOG_DEFS, FILTER_ENABLED );
const builder = new addonBuilder({

  id: FILTER_ENABLED ?"com.ultramax" :"com.ultramax.all.dev",
  version: require("./package.json").version,
  logo: "https://ultramax.vip/logo.png",
  name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All Dev",
  description:"Premium curated catalogs for Stremio and Nuvio. Fast discovery, cleaner collections, and smarter rows.",
  types: ["movie", "series", "tv"],
  resources: ["catalog","meta","stream"],
  catalogs: [
    { type:"movie",  id:"ultramax_placeholder", name:"Ultra MAX", extra: [{ name:"skip", isRequired: false }] }
  ]
});

const catalogDeps = {
  TMDB_KEY,
  TRAKT_CLIENT_ID,
  handleSearch,
  handleQuickPicks,
  handleRelatedContent,
  handleTraktCatalog,
  handleCatalogSearch,
  buildTmdbCatalogUrl,
  geminiAiRecommendations,
  geminiAnimeAnilistRecommendations,
  tmdbResolveAiItems,
  fetchCached,
  filterByMaxRating,
  resultsToMetas,
  traktToMetas,
  mdblistToMetas
};

const catalogRouteDeps = {
  FILTER_ENABLED,
  QUICK_PICK_CATALOGS,
  DYNAMIC_CATALOGS,
  staticIds,
  CATALOG_DEFS,
  buildManifestCatalogs,
  handleCatalogService,
  catalogDeps,
  loadConfigs,
  readConfig,
  MDBLIST_KEY
};

const posterPrewarmDeps = {
  CATALOG_DEFS,
  QUICK_PICK_CATALOGS,
  handleCatalogService,
  catalogDeps,
  FILTER_ENABLED
};

function triggerManifestPosterPrewarm(token, config) {
  if (!process.env.PICTORIUM_PREWARM_ORIGIN) return;
  setImmediate(() => {
    warmFirstCatalogPosters(token, config, posterPrewarmDeps, { limit: 12, catalogCount: 3, totalLimit: 36, concurrency: 3 })
      .catch(error => console.warn('[poster-prewarm] failed open:', error.message));
  });
}



builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log("SDK HANDLER:", id, extra);
try {
  return await handleCatalogService(
    id,
    type,
    extra,
    MDBLIST_KEY,
    FILTER_ENABLED,
    "en-US",
    null,
    null,
    null,
    false,
    null,
    [],
    null,
    null,
    null,
    catalogDeps
  );
}

  catch (e) { console.log("catalog error", id, e.message); return { metas: [] }; }
});

builder.defineStreamHandler(async () => ({ streams: [] }));

builder.defineMetaHandler(async ({ type, id }) => {
  return await handleMetaRequest(
    { type, id },
    {
      TMDB_KEY,
      fetchCached
    }
  );
});

const addonInterface = builder.getInterface();
const app = express();
app.disable("x-powered-by");
app.use(profilePathMiddleware);
const profileStore = createProfileStoreAdapter();
const PROFILE_STORE_ENABLED = /^(1|true|yes|on)$/i.test(String(process.env.PROFILE_STORE_ENABLED || ""));
if (PROFILE_STORE_ENABLED) {
  configureProfileStoreAdapter(profileStore);
}

registerCatalogInspectorRoutes(app, {
  FILTER_ENABLED,
  handleCatalogService,
  catalogDeps,
  loadConfigs,
  readConfig,
  CATALOG_DEFS
});
app.use(compression());
app.use((req, res, next) => {
  const isUltraPlayBridge = req.path.startsWith("/api/ultraplay/");
  if (isUltraPlayBridge && process.env.ULTRAPLAY_BRIDGE_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", process.env.ULTRAPLAY_BRIDGE_ORIGIN);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.json({
  limit:"10mb",
  verify: (req, _res, buf) => {
    if (req.originalUrl && req.originalUrl.startsWith("/api/resend/inbound")) {
      req.rawBody = Buffer.from(buf);
    }
  }
}));
registerArtworkRoutes(app);
registerCatalogRoutes(app, catalogRouteDeps);
registerConfigRoutes(app, {
  loadConfigs,
  saveConfigs,
  hashPassword,
  verifyPassword,
  generateToken,
  rateLimit,
  checkAndRecord,
  clearKey,
  readConfig,
  hasAccount,
  createAccount,
  mutateAccount
});
registerAccountDeletionRoutes(app, {
  readConfig,
  deleteAccount,
  verifyPassword,
  rateLimit,
  clearKey,
  dataDir: process.env.DATA_DIR || path.join(__dirname, "data")
});
registerPremiumizeLibraryRoutes(app, {
  readConfig,
  verifyPassword,
  checkAndRecord,
  clearKey,
  rateLimit,
  mutateAccount,
  serverTmdbKey: TMDB_KEY
});
registerTorboxLibraryRoutes(app, {
  readConfig,
  verifyPassword,
  checkAndRecord,
  clearKey,
  rateLimit,
  mutateAccount,
  serverTmdbKey: TMDB_KEY
});
registerUltraPlayManagerBridge(app, {
  readConfig,
  mutateAccount,
  verifyPassword,
  checkAndRecord,
  clearKey,
  CATALOG_DEFS,
  handleCatalogService,
  catalogDeps,
  FILTER_ENABLED,
  dataDir: process.env.DATA_DIR || path.join(__dirname, "data"),
  importBackupStore: createUltraPlayImportBackupStore({
    dataDir: process.env.DATA_DIR || path.join(__dirname, "data")
  })
});
registerCollectionSyncRoutes(app);

// Fusion is a read-only export adapter — see services/fusion-export-service.js
// and services/fusion-share-service.js. It never touches catalogue
// generation, Nuvio collections, or merged-catalog behaviour.
registerFusionRoutes(app, {
  loadConfigs,
  readConfig,
  rateLimit
});

registerStatsRoutes(app, {
  loadConfigs,
  getConfigs,
  profileStore,
  ownershipPolicy
});

// ================================
// ULTRA MAX STREAM WIZARD - PHASE 1
// Validate external Stremio manifest URLs
// ================================

app.post(
  "/api/stream-wizard/check",
  checkStreamWizard
);


// ============ SHARES SYSTEM ============
registerShareRoutes(app, { rateLimit });
// GET /gallery — serve gallery page
app.get('/gallery', (req, res) => {
  res.sendFile(GALLERY_FILE);
});
// ============ END SHARES SYSTEM ============

app.get("/health", (req, res) => { res.status(200).json({ ok: true, service: "ultra-max", timestamp: new Date().toISOString() }); });

app.get("/admin/profile-store/status", async (req, res) => {
  if (req.headers["x-admin-secret"] !== process.env.STATS_SECRET) return res.status(401).json({ error: "Unauthorized" });
  const policy = ownershipPolicy();
  const legacyTokens = policy.legacyFallbackEnabled ? Object.keys(loadConfigs()) : [];
  res.json(await profileStore.status({ legacyTokens, migrationPolicy: policy }));
});

// Provider verification accepts credentials only in the request body.
app.post("/verify/:provider", verifyHandler);

// Admin: inspect user config by token
app.get("/admin/inspect/:token", async (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.STATS_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = req.params.token;
  const config = await readConfig(token);
  if (!config) {
    return res.status(404).json({ error: "Token not found" });
  }
  const { passwordHash, traktAccessToken, traktRefreshToken, simklAccessToken, mdblistKey, tmdbKey, tvdbKey, tvdbPin, premiumizeApiKey, ...safe } = config;
    const capabilities = getProviderCapabilities({ mdblistKey, tmdbKey, tvdbKey, tvdbPin });
    const providerSafe = stripProviderCredentials(safe);
    const rpdbKey = providerSafe.rpdbKey ? providerSafe.rpdbKey.slice(0, 4) + "****" : null;
    res.json({
      token,
      ...providerSafe,
      hasTmdb: capabilities.hasTmdb,
      hasMdblist: capabilities.hasMdblist,
      rpdbKey,
      catalogCount: (providerSafe.catalogs || []).length,
      hiddenCount: (providerSafe.hiddenCatalogs || []).length,
      trakt: {
        connected: !!traktAccessToken,
        username: providerSafe.traktUser || null,
        expired: providerSafe.traktTokenExpiry ? Date.now() > providerSafe.traktTokenExpiry : false,
        expiresAt: providerSafe.traktTokenExpiry ? new Date(providerSafe.traktTokenExpiry).toISOString() : null
      },
      simkl: {
        connected: !!simklAccessToken,
        username: providerSafe.simklUser || null
      },
      betterPosters: providerSafe.betterPostersStyle || null,
      excludeLanguages: providerSafe.excludeLanguages || [],
    });
  });


// Public token inspector: public page, but token-specific output is credential-free,
 // username-free, masked, rate-limited and non-cacheable.
async function handlePublicTokenInspect(req, res) {
  const token = String((req.body && req.body.token) || (req.params && req.params.token) || "").trim().toUpperCase();
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  if (!/^[A-Z0-9]{6,8}$/.test(token)) return res.status(400).json({ error: "Invalid token format" });
  const rateKey = "token-inspect:" + (req.ip || (req.socket && req.socket.remoteAddress) || "unknown");
  if (rateLimit(rateKey, 12, 60 * 1000)) return res.status(429).json({ error: "Too many inspector requests. Try again shortly." });
  const config = await readConfig(token);
  if (!config) return res.status(404).json({ error: "Token not found" });

  const {
    passwordHash,
    traktAccessToken,
    traktRefreshToken,
    simklAccessToken,
    mdblistKey,
    tmdbKey,
    tvdbKey,
    tvdbPin,
    premiumizeApiKey,
    torboxLibraryApiKey,
    rpdbKey,
    tpKey,
    fanartKey,
    omdbKey,
    googleAiKey,
    debridApiKey,
    ...safe
  } = config;

  const capabilities = getProviderCapabilities({ mdblistKey, tmdbKey, tvdbKey, tvdbPin });
  const catalogs = Array.isArray(safe.catalogs) ? safe.catalogs.filter(Boolean) : [];
  const hiddenCatalogs = Array.isArray(safe.hiddenCatalogs) ? safe.hiddenCatalogs.filter(Boolean) : [];
  const catalogOrder = Array.isArray(safe.catalogOrder) ? safe.catalogOrder.filter(Boolean) : [];
  const selectedSet = new Set(catalogs);
  const duplicateCatalogs = catalogs.filter((id, i) => catalogs.indexOf(id) !== i);
  const hiddenNotSelected = hiddenCatalogs.filter(id => !selectedSet.has(id));
  const orderNotSelected = catalogOrder.filter(id => !selectedSet.has(id));
  const overrides = safe.catalogOverrides && typeof safe.catalogOverrides === "object" && !Array.isArray(safe.catalogOverrides)
    ? safe.catalogOverrides
    : {};
  const betterPosters = safe.betterPostersStyle || null;
  const pictorium = typeof betterPosters === "string" && /\/api\/poster\//i.test(betterPosters);
  const profiles = safe.profiles && typeof safe.profiles === "object" && !Array.isArray(safe.profiles)
    ? Object.keys(safe.profiles)
    : [];
  const debridServices = Array.isArray(safe.debridServices)
    ? safe.debridServices.map(item => item && item.service).filter(Boolean)
    : (safe.debridService ? [safe.debridService] : []);

  res.json({
    schemaVersion: 2,
    token: token.slice(0, 4) + "****",
    timestamps: {
      createdAt: safe.createdAt || null,
      updatedAt: safe.updatedAt || safe.timestamp || null
    },
    catalogs: {
      selectedCount: catalogs.length,
      hiddenCount: hiddenCatalogs.length,
      orderedCount: catalogOrder.length,
      selected: catalogs,
      hidden: hiddenCatalogs,
      order: catalogOrder,
      customCount: Array.isArray(safe.customCatalogs) ? safe.customCatalogs.length : 0,
      mdbListCount: Array.isArray(safe.customMdbLists) ? safe.customMdbLists.length : 0,
      traktListCount: Array.isArray(safe.customTraktLists) ? safe.customTraktLists.length : 0,
      mergedCount: Array.isArray(safe.mergedCatalogs) ? safe.mergedCatalogs.length : 0,
      overrideCount: Object.keys(overrides).length,
      overrideIds: Object.keys(overrides)
    },
    filters: {
      language: safe.language || "en-US",
      timezone: safe.timezone || null,
      minRating: Number(safe.minRating) || 0,
      minVotes: Number(safe.minVotes) || 0,
      minYear: safe.minYear || null,
      maxYear: safe.maxYear || null,
      maxRating: safe.maxRating || null,
      excludeLanguages: Array.isArray(safe.excludeLanguages) ? safe.excludeLanguages : [],
      excludeCountries: Array.isArray(safe.excludeCountries) ? safe.excludeCountries : [],
      excludeUnreleased: !!safe.excludeUnreleased,
      digitalReleaseOnly: !!safe.digitalReleaseOnly,
      includeAdult: !!safe.includeAdult,
      hideWatched: !!safe.hideWatched,
      hideUnavailableStreams: !!safe.hideUnavailableStreams,
      animeFilter: safe.animeFilter || null,
      indianCinemaFilter: safe.indianCinemaFilter || null,
      animePresentationMode: safe.animePresentationMode || null,
      preserveKitsuIds: !!safe.preserveKitsuIds,
      episodeReleaseDelayHours: Number(safe.episodeReleaseDelayHours) || 0
    },
    discovery: {
      hasTmdb: capabilities.hasTmdb,
      hasMdblist: capabilities.hasMdblist,
      searchEnabled: safe.searchEnabled !== false,
      hideUnreleasedDigitalSearch: !!safe.hideUnreleasedDigitalSearch,
      aiRecommended: !!safe.enableAiRecommended,
      hasGoogleAi: !!googleAiKey
    },
    artwork: {
      mode: pictorium ? "Pictorium" : (betterPosters ? "Better Posters / custom" : "Standard"),
      betterPostersEnabled: !!betterPosters && !pictorium,
      pictoriumEnabled: pictorium,
      rpdb: !!rpdbKey,
      topPosters: !!tpKey,
      fanart: !!fanartKey,
      omdb: !!omdbKey
    },
    accounts: {
      trakt: {
        connected: !!traktAccessToken,
        expired: safe.traktTokenExpiry ? Date.now() > safe.traktTokenExpiry : false,
        expiresAt: safe.traktTokenExpiry ? new Date(safe.traktTokenExpiry).toISOString() : null
      },
      simkl: {
        connected: !!simklAccessToken
      }
    },
    profiles: {
      count: profiles.length
    },
    streams: {
      debridServices,
      primaryDebrid: safe.debridService || null,
      cachedOnly: !!safe.debridCachedOnly,
      languages: resolveStreamLanguageSettings(safe).languages,
      languageMode: resolveStreamLanguageSettings(safe).mode,
      englishOnly:
        resolveStreamLanguageSettings(safe).mode === "only" &&
        resolveStreamLanguageSettings(safe).languages.length === 1 &&
        resolveStreamLanguageSettings(safe).languages[0] === "en",
      removeTrash: safe.debridRemoveTrash !== false,
      maxSizeGb: Number(safe.debridMaxSizeGb) || 0,
      qualities: {
        "4k": safe.debridRes4k !== false,
        "1080p": safe.debridRes1080 !== false,
        "720p": safe.debridRes720 !== false,
        "480p": !!safe.debridRes480
      },
      manualAddonCount: Array.isArray(safe.streamAddons) ? safe.streamAddons.length : 0,
      streamFormat: safe.streamFormat || null,
      preserveSourceBranding: !!safe.preserveStreamSourceBranding,
      premiumizeLibraryEnabled: !!safe.premiumizeLibraryEnabled && !!premiumizeApiKey,
      torboxLibraryEnabled: !!safe.torboxLibraryEnabled && !!resolveTorboxLibraryApiKey({ ...safe, torboxLibraryApiKey })
    },
    diagnostics: {
      duplicateCatalogs: [...new Set(duplicateCatalogs)],
      hiddenNotSelected,
      orderNotSelected,
      selectionHealthy: duplicateCatalogs.length === 0 && hiddenNotSelected.length === 0 && orderNotSelected.length === 0
    }
  });
}
app.post("/api/token-inspect", handlePublicTokenInspect);
app.get("/c/:token/inspect", handlePublicTokenInspect);

app.get("/trending", async (req, res) => {
  try {
    const policy = ownershipPolicy();
    if (policy.ownershipEnabled && !policy.legacyFallbackEnabled && profileStore.catalogPopularity && profileStore.accountStats) {
      const [trending, stats] = await Promise.all([profileStore.catalogPopularity(10), profileStore.accountStats()]);
      return res.json({ trending, total: stats.totalInstalls });
    }
    const configs = getConfigs();
    const counts = {};
    for (const account of Object.values(configs)) {
      for (const id of account.catalogs || []) counts[id] = (counts[id] || 0) + 1;
    }
    const trending = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,10).map(([id,count]) => ({ id, count }));
    return res.json({ trending, total: Object.keys(configs).length });
  } catch(e) {
    return res.json({ trending: [], total: 0 });
  }
});

app.get("/stats", async (req, res) => {
  try {
    const policy = ownershipPolicy();
    if (policy.ownershipEnabled && !policy.legacyFallbackEnabled && profileStore.accountStats) {
      const stats = await profileStore.accountStats();
      return res.json({ users: stats.totalInstalls });
    }
    return res.json({ users: Object.keys(getConfigs()).length });
  } catch(e) {
    return res.json({ users: 0 });
  }
});


const PUBLIC_ARTWORK_DIRS = Object.freeze({
  collections: path.join(ULTRAMAX_ARTWORK_ROOT, "collections"),
  movies: path.join(ULTRAMAX_ARTWORK_ROOT, "movies"),
  series: path.join(ULTRAMAX_ARTWORK_ROOT, "series"),
  misc: path.join(ULTRAMAX_ARTWORK_ROOT, "misc")
});

app.get("/assets/artwork/:category/:filename", (req, res) => {
  const category = String(req.params.category || "").toLowerCase();
  const filename = String(req.params.filename || "");
  const dir = PUBLIC_ARTWORK_DIRS[category];

  if (!dir) {
    return res.status(404).send("Unknown artwork category");
  }

  if (
    !filename ||
    filename !== path.basename(filename) ||
    !/\.(png|jpe?g|webp|gif)$/i.test(filename)
  ) {
    return res.status(404).send("Artwork not found");
  }

  const filePath = path.join(dir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Artwork not found");
  }

  res.setHeader("Cache-Control", "public, max-age=604800");
  return res.sendFile(filePath);
});

app.get("/assets", (req, res) => {
  const fs = require("fs");

  const folders = [
    { label: "Main", dir: ULTRAMAX_IMAGES_ROOT, prefix: "/images/" },
    { label: "Scott Defaults", dir: path.join(ULTRAMAX_IMAGES_ROOT, "scott-defaults"), prefix: "/images/scott-defaults/" },
    { label: "Scott Collections", dir: path.join(ULTRAMAX_ARTWORK_ROOT, "collections"), prefix: "/assets/artwork/collections/" },
    { label: "Scott Movies", dir: path.join(ULTRAMAX_ARTWORK_ROOT, "movies"), prefix: "/assets/artwork/movies/" },
    { label: "Scott Series", dir: path.join(ULTRAMAX_ARTWORK_ROOT, "series"), prefix: "/assets/artwork/series/" },
    { label: "Scott Misc", dir: path.join(ULTRAMAX_ARTWORK_ROOT, "misc"), prefix: "/assets/artwork/misc/" },
    { label: "Quick", dir: QUICK_IMAGES_DIR, prefix: "/images/quick/" }
  ];

  let allFiles = [];
  for(const folder of folders){
    try {
      const files = fs.readdirSync(folder.dir)
        .filter(f => /\.(png|jpe?g|webp|gif|svg)$/i.test(f))
        .sort()
        .map(f => ({ name: f, label: folder.label, url: folder.prefix + encodeURIComponent(f) }));
      allFiles = allFiles.concat(files);
    } catch(e) {}
  }

  const mode = req.query.mode || 'cover';
  const ci = req.query.ci || '';
  const fi = req.query.fi || '';
  const returnTo = req.query.returnTo || '';

  const cards = allFiles.map(f => {
    const safeName = String(f.name).replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return `<div class="card" data-name="${safeName.toLowerCase()}" data-folder="${f.label.toLowerCase()}">
      <img src="${f.url}" loading="lazy">
      <div class="name">${safeName}</div>
      <div class="folder-tag">${f.label}</div>
      <button type="button" data-url="${f.url}">Use Image</button>
    </div>`;
  }).join("");

  const html = `<!doctype html>
<html>
<head>
<title>Ultra MAX Asset Library</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#080810;color:#e0e0f0;font-family:sans-serif;min-height:100vh;}
  header{background:#0f0f1e;border-bottom:1px solid #1e1e36;padding:14px 16px;position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .logo{font-size:1rem;font-weight:700;color:#fff;white-space:nowrap;}
  .logo span{color:#7B2FFF;}
  .search{flex:1;min-width:180px;background:#12121f;border:1px solid #2a2a45;color:#e0e0f0;font-size:14px;padding:9px 12px;border-radius:8px;outline:none;}
  .search:focus{border-color:#7B2FFF;}
  .search::placeholder{color:#7070a0;}
  .tabs{display:flex;gap:6px;}
  .tab{background:transparent;border:1px solid #2a2a45;color:#7070a0;font-size:11px;font-weight:600;padding:6px 10px;border-radius:6px;cursor:pointer;}
  .tab.active{border-color:#7B2FFF;color:#9B5FFF;}
  .count{font-size:12px;color:#7070a0;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;padding:16px;}
  .card{border:1px solid #1e1e36;border-radius:10px;overflow:hidden;background:#12121f;}
  .card:hover{border-color:#7B2FFF;}
  .card img{width:100%;height:100px;object-fit:cover;display:block;background:#0f0f1e;}
  .name{font-size:10px;color:#7070a0;padding:5px 8px 1px;word-break:break-all;line-height:1.3;}
  .folder-tag{font-size:9px;color:#7B2FFF;padding:0 8px 4px;font-weight:600;}
  .card button{width:100%;padding:7px;background:rgba(123,47,255,.15);color:#9B5FFF;border:0;border-top:1px solid #1e1e36;cursor:pointer;font-size:12px;font-weight:600;}
  .card button:hover{background:rgba(123,47,255,.3);}
  .card.hidden{display:none;}
  .empty{text-align:center;padding:60px;color:#7070a0;}
</style>
</head>
<body>
<header>
  <div class="logo">ULTRA <span>MAX</span> Assets</div>
  <input class="search" type="text" id="searchBox" placeholder="Search images..." oninput="filterImages()">
  <div class="tabs">
    <button class="tab active" onclick="setFilter('all',this)">All</button>
    <button class="tab" onclick="setFilter('main',this)">Main</button>
    <button class="tab" onclick="setFilter('quick',this)">Quick</button>
    <button class="tab" onclick="setFilter('.gif',this)">GIFs</button>
  </div>
  <div class="count" id="countLabel">${allFiles.length} images</div>
</header>
<div class="grid" id="grid">${cards}</div>
<div class="empty" id="emptyMsg" style="display:none;">No images found</div>
<script>
var currentFilter='all';
var returnTo='${returnTo}';
var mode='${mode}';
var ci=${ci||'null'};
var fi=${fi||'null'};

function setFilter(f,el){
  currentFilter=f;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  filterImages();
}

function filterImages(){
  var q=document.getElementById('searchBox').value.toLowerCase();
  var cards=document.querySelectorAll('.card');
  var visible=0;
  cards.forEach(function(card){
    var name=card.getAttribute('data-name')||'';
    var folder=card.getAttribute('data-folder')||'';
    var matchSearch=!q||name.includes(q);
    var matchFilter=currentFilter==='all'||folder.includes(currentFilter)||name.includes(currentFilter);
    if(matchSearch&&matchFilter){card.classList.remove('hidden');visible++;}
    else{card.classList.add('hidden');}
  });
  document.getElementById('countLabel').textContent=visible+' images';
  document.getElementById('emptyMsg').style.display=visible===0?'block':'none';
}

document.querySelectorAll('button[data-url]').forEach(function(btn){
  btn.addEventListener('click',function(){
    var full=window.location.origin+btn.getAttribute('data-url');
    if(window.parent !== window && ci!==null && fi!==null){
      window.parent.postMessage({type:'assetPick',ci:ci,fi:fi,url:full,mode:mode},'*');
    } else if(returnTo&&returnTo!=='null'&&returnTo!==''&&ci!==null&&fi!==null){
      localStorage.setItem('ultramaxAssetPick',JSON.stringify({ci:ci,fi:fi,url:full,mode:mode}));
      window.location.href=returnTo;
    } else {
      var ta=document.createElement('textarea');
      ta.value=full;
      ta.style.position='fixed';
      ta.style.opacity='0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try{ document.execCommand('copy'); }catch(e){}
      document.body.removeChild(ta);
      btn.textContent='✅ Copied!';
      btn.style.background='rgba(0,210,160,.25)';
      btn.style.color='#00d2a0';
      setTimeout(function(){
        btn.textContent='Use Image';
        btn.style.background='';
        btn.style.color='';
      },2500);
    }
  });
});
</script>
</body>
</html>`;
  res.send(html);
});
;

app.get("/configure", (req, res) => res.redirect(302, "/setup.html"));
app.get("/configure/:token", (req, res) => res.redirect(302, `/setup.html?token=${encodeURIComponent(req.params.token)}`));
app.get("/c/:token/configure", (req, res) => { res.redirect(`/configure/${req.params.token}`); });
app.get("/logo.svg", (req, res) => { res.sendFile(path.join(__dirname,"logo.svg")); });
app.get("/collections-builder", (req, res) => { res.sendFile(path.join(__dirname,"collections-builder.html")); });

// ULTRAMAX USER AVATAR UPLOAD START

const USER_AVATAR_DIR =
  path.join(process.env.DATA_DIR || __dirname, "user-avatars");

const USER_AVATAR_PUBLIC_BASE =
  "https://ultramax.vip/images/user-avatars";

const avatarUploadTimes = new Map();

fs.mkdirSync(USER_AVATAR_DIR, {
  recursive: true
});

app.post("/api/avatar-upload", async (req, res) => {
  try {
    const forwarded =
      req.headers["x-forwarded-for"];

    const clientIp =
      (
        Array.isArray(forwarded)
          ? forwarded[0]
          : String(forwarded || "")
              .split(",")[0]
              .trim()
      ) ||
      req.socket.remoteAddress ||
      "unknown";

    const now = Date.now();
    const previousUpload =
      avatarUploadTimes.get(clientIp) || 0;

    /*
      One upload every five seconds per IP.
      Enough for normal use, but slows down obvious abuse.
    */
    if (now - previousUpload < 5000) {
      return res.status(429).json({
        error:
          "Please wait a few seconds before uploading another avatar."
      });
    }

    const imageData =
      typeof req.body?.imageData === "string"
        ? req.body.imageData
        : "";

    if (!imageData) {
      return res.status(400).json({
        error: "No avatar image was supplied."
      });
    }

    const match = imageData.match(
      /^data:image\/webp;base64,([A-Za-z0-9+/=\r\n]+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Avatar must be supplied as a WebP image."
      });
    }

    let buffer;

    try {
      buffer = Buffer.from(
        match[1].replace(/\s/g, ""),
        "base64"
      );
    } catch (error) {
      return res.status(400).json({
        error: "The uploaded avatar data is invalid."
      });
    }

    if (!buffer.length) {
      return res.status(400).json({
        error: "The uploaded avatar is empty."
      });
    }

    const MAX_AVATAR_BYTES =
      2 * 1024 * 1024;

    if (buffer.length > MAX_AVATAR_BYTES) {
      return res.status(413).json({
        error: "Avatar must be smaller than 2 MB."
      });
    }

    /*
      WebP files begin with:
      RIFF....WEBP
    */
    const isWebp =
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP";

    if (!isWebp) {
      return res.status(400).json({
        error: "The uploaded file is not a valid WebP image."
      });
    }

    const fileName =
      crypto.randomBytes(18).toString("hex") +
      ".webp";

    const finalPath =
      path.join(USER_AVATAR_DIR, fileName);

    const temporaryPath =
      finalPath + ".tmp";

    await fs.promises.writeFile(
      temporaryPath,
      buffer,
      {
        mode: 0o644,
        flag: "wx"
      }
    );

    await fs.promises.rename(
      temporaryPath,
      finalPath
    );

    avatarUploadTimes.set(
      clientIp,
      now
    );

    /*
      Prevent the in-memory rate-limit map growing forever.
    */
    if (avatarUploadTimes.size > 5000) {
      const cutoff =
        now - 60 * 60 * 1000;

      for (
        const [ip, timestamp]
        of avatarUploadTimes.entries()
      ) {
        if (timestamp < cutoff) {
          avatarUploadTimes.delete(ip);
        }
      }
    }

    return res.status(201).json({
      ok: true,
      url:
        USER_AVATAR_PUBLIC_BASE +
        "/" +
        fileName
    });
  } catch (error) {
    console.error(
      "Avatar upload failed:",
      error
    );

    return res.status(500).json({
      error: "The avatar could not be uploaded."
    });
  }
});

// ULTRAMAX USER AVATAR UPLOAD END

// ULTRAMAX USER AVATAR STATIC ROUTE START
app.use(
  "/images/user-avatars",
  express.static(
    path.join(process.env.DATA_DIR || __dirname, "user-avatars"),
    {
      maxAge: "7d",
      etag: true,
      fallthrough: true
    }
  )
);
// ULTRAMAX USER AVATAR STATIC ROUTE END

app.use(
  "/images",
  express.static(path.join(__dirname, "bundled-images"), {
    maxAge: "7d",
    etag: true
  })
);

app.use("/images", express.static(path.join(__dirname,"images"), { maxAge: '7d', etag: true }));
app.use("/images", express.static(ULTRAMAX_IMAGES_ROOT, { maxAge: '7d', etag: true }));
app.use("/images/quick", express.static(QUICK_IMAGES_DIR, { maxAge: '7d', etag: true }));
app.get("/collections.json", (req, res) => { res.sendFile(path.join(__dirname,"collections.json")); });
app.get("/catalog-defs.json", (req, res) => {
  res.setHeader("Cache-Control","public, max-age=3600");
  res.json(CATALOG_DEFS);
});

app.post("/api/ai/custom-row", async (req, res) => {
  try {
    const { prompt, count = 1, googleAiKey, traktUser = null, language: rowLanguage = "en-US" } = req.body || {};
    const watchRegion = (rowLanguage.split("-")[1] || "US").toUpperCase();
    const key = googleAiKey || process.env.GOOGLE_AI_KEY || process.env.GEMINI_KEY || null;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Missing prompt" });
    }
    
    if (!key) {
      // 🔁 Fallback: simple parser (no AI key needed)
      const lower = prompt.toLowerCase();

      const isSeries = lower.includes("series") || lower.includes("shows") || lower.includes("tv");
      const type = isSeries ? "series" : "movie";
      const tmdbType = isSeries ? "tv" : "movie";

      const genreMap = {
        "romantic comedy": "10749,35", "rom com": "10749,35",
        action: "28", adventure: "12", animation: "16", comedy: "35",
        crime: "80", documentary: "99", drama: "18", family: "10751",
        fantasy: "14", history: "36", horror: "27", music: "10402",
        mystery: "9648", romance: "10749", "sci-fi": "878", scifi: "878",
        "science fiction": "878", thriller: "53", war: "10752", western: "37",
        anime: "16", superhero: "28"
      };

      const streamingMap = {
        netflix: "8", amazon: "9", "prime video": "9", "amazon prime": "9",
        "disney+": "337", disney: "337", hulu: "15", "hbo max": "1899",
        hbo: "1899", "apple tv": "2", "apple tv+": "2", "paramount+": "531",
        peacock: "386", crunchyroll: "283", "bbc iplayer": "38", bbc: "38",
        "channel 4": "103", itvx: "41", mubi: "11"
      };

      const ukProviders = ["38","103","41","11"];

      let genre = "";
      for (const g in genreMap){ if (lower.includes(g)){ genre = genreMap[g]; break; } }

      let watchProvider = "", watchRegionFinal = watchRegion;
      for (const s in streamingMap){
        if (lower.includes(s)){
          watchProvider = streamingMap[s];
          if (ukProviders.includes(watchProvider)) watchRegionFinal = "GB";
          break;
        }
      }

      let keyword = "";
      const keywordMatch = lower.match(/"([^"]+)"|about\s+(\w+)/);
      if (keywordMatch) {
        keyword = keywordMatch[1] || keywordMatch[2] || "";
      } else {
        // Detect common theme keywords
        const themeKeywords = ['time travel','zombie','vampire','werewolf','superhero','heist','survival','post-apocalyptic','post apocalyptic','dystopian','space exploration','outer space','serial killer','true crime','coming of age','road trip','martial arts','kung fu','pirates','vikings','mythology','fairy tale','haunted','ghost','alien invasion','time loop','artificial intelligence'];
        for(const kw of themeKeywords){
          if(lower.includes(kw)){ keyword = kw; break; }
        }
      }

      let rating = "";
      const ratingMatch = lower.match(/(?:above|over|rating)\s*(\d+(\.\d+)?)/);
      if (ratingMatch) rating = ratingMatch[1];

      let yearFrom = "", yearTo = "";
      const fullDecadeMatch = lower.match(/(19\d{2}|20\d{2})s/);
      const shortDecadeMatch = lower.match(/\b(70|80|90|00|10|20)s\b/);
      const afterMatch = lower.match(/after\s+(\d{4})/);
      const beforeMatch = lower.match(/before\s+(\d{4})/);

      if (fullDecadeMatch) {
        yearFrom = fullDecadeMatch[1]; yearTo = String(Number(yearFrom) + 9);
      } else if (shortDecadeMatch) {
        const d = shortDecadeMatch[1];
        const decMap = {"70":"1970","80":"1980","90":"1990","00":"2000","10":"2010","20":"2020"};
        yearFrom = decMap[d] || ""; yearTo = yearFrom ? String(Number(yearFrom) + 9) : "";
      } else if (afterMatch) {
        yearFrom = afterMatch[1];
      } else if (beforeMatch) {
        yearTo = beforeMatch[1];
      }
      let personName = "";
      const personMatch = lower.match(/(?:starring|directed by|by|from|with)\s+([a-z]+ [a-z]+)/i);
      if (personMatch) {
        personName = personMatch[1];
      } else {
        // If prompt looks like just a person name (2-3 words, no genre/streaming/decade detected)
        const words = lower.trim().split(/\s+/);
        const strippedLower = lower.replace(/\b(movies?|films?|series|shows?|tv|television)\b/g,'').trim();
        const hasCategory = genre || watchProvider || yearFrom;
        const looksLikeName2 = strippedLower.length > 0 && /^[a-z]+ [a-z]+/.test(strippedLower) && strippedLower.split(/\s+/).length <= 3;
        const notAName = ['time travel','outer space','world war','cold war','true crime','based on','coming of age','post apocalyptic','super hero','martial arts','road trip','real life','new york','los angeles','high school','middle earth','fairy tale','science fiction','serial killer','zombie apocalypse','video game','comic book','buddy cop'];
        const isNotAName = notAName.some(n => strippedLower.includes(n));
        const looksLikeName = looksLikeName2 && !hasCategory && !isNotAName;
        if(looksLikeName) personName = strippedLower.trim();
      }


      return res.json({
        rows: [{
          name: prompt,
          type,
          source: "tmdb_discover",
          tmdbType,
          withGenres: genre,
          withWatchProviders: watchProvider,
          watchRegion: watchRegionFinal,
          voteAverageGte: rating,
          yearFrom,
          yearTo,
          personName,
          keyword,
          language: rowLanguage
        }]
      });
    }
    const wanted = Math.max(1, Math.min(Number(count) || 1, 5));

    const aiPrompt = `
You are helping build custom Stremio/Nuvio homepage catalog rows.

Return ONLY valid JSON. No markdown.

Create ${wanted} custom catalog row objects for this idea:
"${prompt}"

Trakt username, optional context: ${traktUser || "none"}

Each object must use this exact shape:
{
  "name": "Short row title",
  "type": "movie" or "series",
  "source": "tmdb_discover",
  "tmdbType": "movie" or "tv",
  "sortBy": "popularity.desc",
  "withGenres": "",
  "withoutGenres": "",
  "yearFrom": "",
  "yearTo": "",
  "voteAverageGte": "",
  "withCast": "",
  "withCrew": "",
  "withCompanies": "",
  "withNetworks": "",
  "withWatchProviders": "",
  "watchRegion": "${watchRegion}",
  "language": "${rowLanguage}"
}

Rules:
- Use source "tmdb_discover".
- For movies use type "movie" and tmdbType "movie".
- For series use type "series" and tmdbType "tv".
- Prefer GB watch region.
- Use TMDB genre IDs where obvious.
- If the prompt asks for an actor, put their TMDB person ID in withCast if you know it, otherwise leave blank.
- If unsure, keep fields blank rather than inventing bad IDs.
- Return an array only.
`;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: aiPrompt }] }]
      })
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(r.status).json({ error: "Gemini request failed", details: raw.slice(0, 500) });
    }

    const data = JSON.parse(raw);
    let text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || "";
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    const rows = JSON.parse(text);

    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: "AI did not return an array", raw: text.slice(0, 500) });
    }

    res.json({ rows: rows.slice(0, wanted) });
  } catch (err) {
    console.error("AI custom row route failed:", err);
    res.status(500).json({ error: err.message || "AI custom row route failed" });
  }
});

app.get("/api/search-title", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing query" });
    const r = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}`);
    const data = await r.json();
    const results = (data.results || [])
      .filter(item => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 8)
      .map(item => ({
        tmdbId: item.id,
        mediaType: item.media_type,
        title: item.title || item.name || "",
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null
      }));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message || "Search failed" });
  }
});

app.get("/api/title-imdb-id", async (req, res) => {
  try {
    const tmdbId = req.query.tmdbId;
    const mediaType = req.query.mediaType === "tv" ? "tv" : "movie";
    if (!tmdbId) return res.status(400).json({ error: "Missing tmdbId" });
    const r = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`);
    const data = await r.json();
    if (!data.imdb_id) return res.status(404).json({ error: "No IMDb ID found" });
    res.json({ imdbId: data.imdb_id });
  } catch (err) {
    res.status(500).json({ error: err.message || "Lookup failed" });
  }
});
// Search public MDBLists by name — proxied server-side since the MDBList
// API has no CORS headers for direct browser calls from setup.html.
app.post("/api/mdblist-search", async (req, res) => {
  try {
    const apikey = String(req.body?.apikey || "").trim();
    const query = String(req.body?.query || "").trim();
    if (!apikey) return res.status(400).json({ error: "Missing MDBList API key" });
    if (!query) return res.json({ results: [] });

    const r = await fetch(`https://api.mdblist.com/lists/search?apikey=${encodeURIComponent(apikey)}&query=${encodeURIComponent(query)}&limit=25`);
    const data = await r.json();

    if (!Array.isArray(data)) {
      return res.json({ results: [], error: data?.error || null });
    }

    const results = data.slice(0, 25).map(l => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      user: l.user_name || l.user || null,
      mediatype: l.mediatype || null,
      items: l.items || 0,
      likes: l.likes || 0,
      description: l.description || ""
    }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message || "MDBList search failed" });
  }
});

// Resolve a raw MDBList numeric list id to its display name — used by
// setup.html to label legacy catalog ids (e.g. "mdb_88307") that predate
// CATALOG_DEFS' human-readable slugs and aren't covered by MDB_ID_ALIASES.
// Cached in memory since list names essentially never change.
const mdbListNameCache = new Map();
app.get("/api/mdblist-name/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "Invalid list id" });

  if (mdbListNameCache.has(id)) return res.json(mdbListNameCache.get(id));

  try {
    const r = await fetch(`https://mdblist.com/api/lists/${id}/?apikey=${MDBLIST_KEY}`);
    const data = await r.json();
    const list = Array.isArray(data) ? data[0] : data;
    if (!list || !list.name) return res.status(404).json({ error: "List not found" });

    const result = { name: list.name, mediatype: list.mediatype || null };
    mdbListNameCache.set(id, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "MDBList lookup failed" });
  }
});

app.post("/api/verify-debrid-key", async (req, res) => {
  const { service, apiKey } = req.body || {};
  if (!service || !apiKey) return res.status(400).json({ valid: false, error: "Missing service or apiKey" });
  try {
    let checkUrl, headers = {};
    if (service === "torbox") {
      checkUrl = "https://api.torbox.app/v1/api/user/me";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (service === "realdebrid") {
      checkUrl = "https://api.real-debrid.com/rest/1.0/user";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (service === "alldebrid") {
      checkUrl = `https://api.alldebrid.com/v4/user?agent=ultramax&apikey=${encodeURIComponent(apiKey)}`;
    } else if (service === "premiumize") {
      checkUrl = `https://www.premiumize.me/api/account/info?apikey=${encodeURIComponent(apiKey)}`;
    } else {
      return res.json({ valid: null, note: "Verification not available for this provider" });
    }
    const r = await fetch(checkUrl, { headers });
    const data = await r.json().catch(() => ({}));
    let valid = r.ok;
    if (service === "alldebrid" && data.status !== "success") valid = false;
    if (service === "premiumize" && data.status !== "success") valid = false;
    res.json({ valid });
  } catch (err) {
    res.json({ valid: null, error: err.message || "Verification failed" });
  }
});


app.get("/n/:token/manifest.json", async (req, res) =>
  await handleNuvioManifest(req, res, {
  loadConfigs,
  readConfig,
    saveConfigs,
    mutateAccount,
    buildCatalogsFromIds,
    QUICK_PICK_CATALOGS,
  CATALOG_DEFS,
  onManifestServed: triggerManifestPosterPrewarm
  })
);

app.get(
  "/cinemeta-clone/manifest.json",
  handleCinemetaClone
);


app.get("/public-manifest.json", (req, res) => {
  const catalogs = buildCatalogsFromIds(
    Object.keys(CATALOG_DEFS),
    [],
    QUICK_PICK_CATALOGS,
    CATALOG_DEFS
  ).map(c => ({
    type: c.type,
    id: c.id,
    name: c.name,
    extra: [{ name: "skip", isRequired: false }]
  }));
  res.json({
    id: "com.ultramax",
    version: require("./package.json").version,
    name: "Ultra MAX",
    description: "Ultra MAX — curated discovery catalogs for Nuvio and Stremio.",
    logo: "https://ultramax.vip/logo.png",
    types: ["movie", "series", "tv"],
    idPrefixes: ["tt", "tmdb"],
    resources: ["catalog", "meta", "stream"],
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    },
    catalogs
  });
});

app.get("/c/:token/manifest.json", async (req, res) =>
  await handleMainManifest(req, res, {
  loadConfigs,
  readConfig,
    saveConfigs,
    mutateAccount,
    buildCatalogsFromIds,
    QUICK_PICK_CATALOGS,
  CATALOG_DEFS,
  onManifestServed: triggerManifestPosterPrewarm
  })
);

app.get(["/c/:token/meta/:type/:id.json", "/n/:token/meta/:type/:id.json"], (req, res) =>
  handleConfiguredMeta(req, res, {
    loadConfigs,
    readConfig,
    fetchCached,
    TMDB_KEY
  })
);

app.get(
  "/meta/:type/:id.json",
  async (req, res) => {
    const { type, id } =
      req.params;

    try {
      const result =
        await handleMetaRequest(
          { type, id },
          {
            TMDB_KEY,
            fetchCached
          }
        );

      return res.json(
        result ||
        {
          meta: {
            id,
            type
          }
        }
      );
    } catch (error) {
      console.warn(
        "[meta] public handler failed",
        id,
        error?.message || error
      );

      return res.json({
        meta: {
          id,
          type
        }
      });
    }
  }
);

/*
 * DEV-ONLY sports playback proof.
 *
 * This deliberately bypasses fixture programme confirmation
 * for ONE known fixture so the complete client playback path
 * can be tested independently of current broadcast schedules.
 *
 * Remove after Nuvio/Stremio playback has been proven.
 */




app.get(
  "/sports-hls/:token/:resourceId",
  (req, res, next) => {
    if (!LIVE_SPORTS_ENABLED) {
      return res.status(404).json({
        error: "Live sports temporarily unavailable"
      });
    }

    return handleSportsHlsProxy(
      req,
      res,
      next
    );
  }
);


app.get("/stream/:type/:id.json", async (req, res) => {
  const {
    type,
    id
  } = req.params;

  /*
   * Nuvio Live Sports IDs are owned by the
   * Nuvio Live Sports integration.
   *
   * Resolve them before the legacy Ultra MAX
   * fixture/F1 stream paths.
   */
  if (
    type === "tv" &&
    isNuvioSportsId(id)
  ) {
    try {
      const streams =
        await getNuvioSportsStreams(
          id,
          type
        );

      return res.json({
        streams
      });
    } catch (error) {
      console.warn(
        "[nuvio-live-sports] public stream failed",
        id,
        error?.message || error
      );

      return res.json({
        streams: []
      });
    }
  }

  /*
   * Temporary DEV playback proof.
   *
   * One exact fixture only. All other sports IDs continue
   * through normal EPG-confirmed resolution below.
   */

  try {
    const archiveResult =
      await resolveF1ArchiveStreams({
        type,
        id,
        enabled:
          MOTORSPORT_TORRENTS_ENABLED
      });

    if (archiveResult.handled) {
      return res.json({
        streams:
          archiveResult.streams
      });
    }
  } catch (error) {
    console.warn(
      "[f1-archive-stream] public resolver failed",
      id,
      error?.message || error
    );

    return res.json({
      streams: []
    });
  }


  /*
   * Ultra MAX Sports fixtures have their own
   * live-stream resolver.
   *
   * They must never fall through to ordinary
   * movie/series stream addons.
   */
  if (
    LIVE_SPORTS_ENABLED &&
    (
      type === "movie" ||
      type === "tv"
    ) &&
    isSportsFixtureId(id)
  ) {
    try {
      let result =
        await resolveFixtureLiveStreams(
          id,
          {
            streamLimit: 5,
            requireProgrammeConfirmation:
              true
          }
        );


      const sportsStreams = [];

      if (Array.isArray(result.streams)) {
        for (const stream of result.streams) {
          sportsStreams.push(
            await createSportsHlsProxyStream(
              req,
              stream
            )
          );
        }
      }

      return res.json({
        streams:
          sportsStreams
      });
    } catch (error) {
      console.warn(
        "[sports-stream] public resolver failed",
        id,
        error?.message || error
      );

      return res.json({
        streams: []
      });
    }
  }

  // Dev fallback: no token config, no stream addons.
  return res.json({
    streams: []
  });
});

app.get(["/c/:token/stream/:type/:id.json", "/n/:token/stream/:type/:id.json"], async (req, res) => {
  const {
    token,
    type,
    id
  } = req.params;

  /*
   * Temporary DEV playback proof.
   *
   * Mirror the public-route proof for configured installs,
   * because Nuvio may use /c/:token/stream/... URLs.
   */

  try {
    const archiveResult =
      await resolveF1ArchiveStreams({
        type,
        id,
        enabled:
          MOTORSPORT_TORRENTS_ENABLED
      });

    if (archiveResult.handled) {
      return res.json({
        streams:
          archiveResult.streams
      });
    }
  } catch (error) {
    console.warn(
      "[f1-archive-stream] token resolver failed",
      id,
      error?.message || error
    );

    return res.json({
      streams: []
    });
  }


  /*
   * Sports fixture IDs are owned by Ultra MAX.
   * Resolve them before consulting external
   * movie/series stream addons.
   */
  if (
    LIVE_SPORTS_ENABLED &&
    (
      type === "movie" ||
      type === "tv"
    ) &&
    isSportsFixtureId(id)
  ) {
    try {
      let result =
        await resolveFixtureLiveStreams(
          id,
          {
            streamLimit: 5,
            requireProgrammeConfirmation:
              true
          }
        );


      const sportsStreams = [];

      if (Array.isArray(result.streams)) {
        for (const stream of result.streams) {
          sportsStreams.push(
            await createSportsHlsProxyStream(
              req,
              stream
            )
          );
        }
      }

      return res.json({
        streams:
          sportsStreams
      });
    } catch (error) {
      console.warn(
        "[sports-stream] token resolver failed",
        id,
        error?.message || error
      );

      return res.json({
        streams: []
      });
    }
  }

  const baseConfig = await readConfig(token, req.query.profile);

  if (!baseConfig) return res.json({ streams: [] });

  /*
   * Preserve normal Ultra MAX token validation,
   * then resolve Nuvio Live Sports IDs directly.
   */
  if (
    type === "tv" &&
    isNuvioSportsId(id)
  ) {
    try {
      const streams =
        await getNuvioSportsStreams(
          id,
          type
        );

      return res.json({
        streams
      });
    } catch (error) {
      console.warn(
        "[nuvio-live-sports] configured stream failed",
        id,
        error?.message || error
      );

      return res.json({
        streams: []
      });
    }
  }

  // A device profile (?profile=<id>) layers its overrides (quality/size
  // caps, display formatting) on top of the base config — see utils/profiles.js.
  const config = resolveConfigForProfile(baseConfig, req.query.profile);
  const capabilities = getProviderCapabilities(config, { serverTmdbKey: TMDB_KEY });

  if (isPremiumizeLibraryContentId(id)) {
    try {
      const result = await resolvePremiumizeStream({
        id, token, config, tmdbKey: capabilities.effectiveTmdbKey || TMDB_KEY
      });
      if (result.handled) return res.json({ streams: result.streams });
    } catch (error) {
      console.warn("[premiumize-library] stream resolution failed", error?.code || "error");
      return res.json({ streams: [] });
    }
  }

  if (isTorboxLibraryContentId(id)) {
    try {
      const publicOrigin = req.get("host") ? `https://${req.get("host")}` : "https://ultramax.vip";
      const result = await resolveTorboxStream({
        id, token, config, tmdbKey: capabilities.effectiveTmdbKey || TMDB_KEY, publicOrigin
      });
      if (result.handled) return res.json({ streams: result.streams });
    } catch (error) {
      console.warn("[torbox-library] stream resolution failed", error?.code || "error");
      return res.json({ streams: [] });
    }
  }

  const streamAddons = buildEffectiveStreamAddons(config);
  let streamId = id;

  if (isKitsuId(id)) {
    streamId = await resolveKitsuStreamId(id, {
      TMDB_KEY: capabilities.effectiveTmdbKey,
      fetchCached
    });

    if (!streamId) {
      console.warn("No safe stream mapping for Kitsu ID:", id);
      return res.json({ streams: [] });
    }
  }

  const result = await streamBridgeResponse(
    streamAddons,
    type,
    streamId,
    config.streamFormat,
    !!config.preserveStreamSourceBranding,
    config
  );

  const availabilityScope = createStreamAvailabilityScope(streamAddons);
  if (availabilityScope) {
    recordStreamAvailability({
      scope: availabilityScope,
      type,
      id: streamId,
      streams: result.streams,
      complete: false
    });
  }

  res.json(result);
});

app.get("/preview/tmdb", handleTmdbPreview);

// Resolve TMDB IDs for builder (person, collection, keyword)
app.get("/resolve/tmdb", async (req, res) => {
  const { type, query } = req.query;
  if(!type || !query) return res.json({ error: 'Missing type or query' });
  try {
    if(type === 'person') {
      const r = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`);
      const d = await r.json();
      const p = (d.results || [])[0];
      if(!p) return res.json({ error: 'Not found' });
      return res.json({ id: p.id, name: p.name, photo: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null });
    }
    if(type === 'collection') {
      const r = await fetch(`https://api.themoviedb.org/3/search/collection?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`);
      const d = await r.json();
      const q = query.toLowerCase().trim();
      const results = d.results || [];
      // Score by how closely the name matches the query
      const scored = results.map(x => {
        const name = x.name.toLowerCase().replace(' collection','').replace('the ','').trim();
        const qClean = q.replace('the ','').trim();
        let score = 0;
        if(name === qClean) score = 100;
        else if(name.startsWith(qClean)) score = 80;
        else if(qClean.startsWith(name)) score = 70;
        else if(name.includes(qClean)) score = 50;
        return { ...x, score };
      }).sort((a,b) => b.score - a.score);
      const c = scored[0];
      if(!c) return res.json({ error: 'Not found' });
      return res.json({ id: c.id, name: c.name, poster: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : null });
    }
    if(type === 'keyword') {
      const r = await fetch(`https://api.themoviedb.org/3/search/keyword?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`);
      const d = await r.json();
      const k = (d.results || []).find(x => x.name.toLowerCase() === query.toLowerCase()) || (d.results || [])[0];
      if(!k) return res.json({ error: 'Not found' });
      return res.json({ id: k.id, name: k.name });
    }
    return res.json({ error: 'Unknown type' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// On startup: remove configs not accessed in 180 days
 (async function cleanupStaleConfigs() {
  try {
    if (ownershipPolicy().ownershipEnabled) {
      console.log("Startup config cleanup skipped: PostgreSQL ownership active");
      return;
    }
    const configs = loadConfigs();
    const now = Date.now();
    const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
    let removed = 0;
    for (const [token, config] of Object.entries(configs)) {
      const lastSeen = config.lastAccessed || config.updatedAt || config.createdAt;
      if (!lastSeen) continue;
      if (now - new Date(lastSeen).getTime() > EXPIRY_MS) {
        delete configs[token];
        removed++;
      }
    }
    if (removed > 0) {
      await saveConfigs(configs);
      console.log(`Startup cleanup: removed ${removed} stale config(s) (180+ days inactive)`);
    }
  } catch(e) {
    console.error("Startup config cleanup failed:", e.message);
  }
})();

const PREWARM_LISTS = ['92337','91304','91303','91302','91300','91301','86710','88307','88309','3087','3091'];
setTimeout(async () => {
  if (!MDBLIST_KEY) return;
  console.log('Pre-warming MDBList cache...');
  for (const id of PREWARM_LISTS) {
    try {
      await fetchCached(`https://mdblist.com/api/lists/${id}/items/?apikey=${MDBLIST_KEY}&limit=20&type=movie`);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {}
  }
  console.log('Cache pre-warm complete');
}, 5000);

registerScrobbleRoute(app, { loadConfigs, readConfig, TMDB_KEY, fetchCached });
registerRatingRoutes(app, { loadConfigs, readConfig, TMDB_KEY, fetchCached });
registerCacheWarmRoute(app, {
  loadConfigs,
  readConfig,
  CATALOG_DEFS,
  QUICK_PICK_CATALOGS,
  handleCatalogService,
  catalogDeps,
  FILTER_ENABLED
});
registerAuthRoutes(app, { loadConfigs, readConfig, hasAccount, createAccount, mutateAccount, saveConfigs });
registerNuvioProxyRoutes(app);
registerCollectionsAddon(app, { TMDB_KEY, fetchCached, resultsToMetas, filterByMaxRating, buildTmdbCatalogUrl, geminiAiRecommendations, tmdbResolveAiItems, handleSearch, handleQuickPicks, handleRelatedContent, handleTraktCatalog, handleCatalogSearch, mdblistToMetas });

// Token recovery routes
app.post("/api/register-email", registerEmail(readConfig));
app.post("/api/recover-token", recoverToken());

// Support message route
registerSupportMessageRoutes(app);

// Resend inbound support forwarding route
registerResendInboundForwardRoutes(app);

// Self-host: serve the bundled web UI from the same Node process.
// Keep this after API/addon routes so static files cannot shadow dynamic manifests.
app.use(express.static(ULTRAMAX_WEB_ROOT));

// Strict dual-write mode is request-level failure signalling only. JSON has
// already committed when this error is raised; reconciliation repairs the PG
// mirror. Keep this response generic and credential-free.
app.use(profileStoreErrorHandler);

app.listen(PORT,"0.0.0.0", () => {
  console.log(`Ultra MAX v${require("./package.json").version} running on port ${PORT}`);
  console.log(`Total catalog defs: ${Object.keys(CATALOG_DEFS).length}`);
  console.log(`Static catalogs: ${staticIds.length}`);
});

async function closeProfileStore() {
  await profileStore.close().catch(error => console.warn("[profile-store] shutdown failed", error.message));
}
process.once("SIGTERM", closeProfileStore);
process.once("SIGINT", closeProfileStore);
