function normalizeAnimePresentationMode(value) {
  return value === "anisync" ? "anisync" : "unified";
}

function normalizeAnimeFilter(value) {
  return ["allow", "reduce", "hide"].includes(value) ? value : "allow";
}

function normalizeIndianCinemaFilter(value) {
  return value === "hide" ? "hide" : "allow";
}

function normalizeYear(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1888 && n < 2200 ? Math.round(n) : 0;
}

const COLLECTIONS_SCHEMA_VERSION = 2;

function registerConfigRoutes(app, deps) {
const { getWatchedIds, filterWatched } = require("./watched-filter");
  const { sanitizeStreamFormat } = require("./stream-formatter");
  const { sanitiseProfileOverrides, resolveConfigForProfile, ProfileOverridesTooLargeError } = require("../utils/profiles");
  const { CATALOG_DEFS, resolveCatalogId } = require("../catalogs/catalog-defs");
  const {
    validateMergedCatalogs,
    MergedCatalogValidationError
  } = require("./merged-catalog-service");
  const { buildMainManifestObject } = require("./manifest-route-service");
  const { buildCatalogsFromIds } = require("./manifest-service");
  const { QUICK_PICK_CATALOGS } = require("../catalogs/quick-picks");
  const {
    normalizeManifestContract,
    classifyInstallationStatus,
    summarizeInstallationReasons
  } = require("./manifest-fingerprint-service");
  const {
    loadConfigs,
    saveConfigs,
    hashPassword,
    verifyPassword,
    generateToken,
    rateLimit,
    checkAndRecord,
    clearKey
  } = deps;

  const MAX_PROFILES_PER_TOKEN = 8;
  const manifestBuildDeps = { buildCatalogsFromIds, QUICK_PICK_CATALOGS, CATALOG_DEFS };

  // Fields that actually influence buildMainManifestObject's output. Used
  // both to build a "candidate" config for the read-only preview endpoint
  // (see /install-status/preview below) and as a mental checklist of
  // everything the fingerprint is sensitive to — anything not in this list
  // (API keys, filters, poster style, etc.) provably can't affect
  // installation status, because it never reaches the manifest builder.
  const MANIFEST_RELEVANT_FIELDS = [
    "catalogs", "catalogOrder", "hiddenCatalogs", "mergedCatalogs",
    "customCatalogs", "customMdbLists", "excludeUnreleased",
    "enableAiRecommended", "anilistAccessToken", "preserveKitsuIds",
    "animePresentationMode", "streamAddons", "debridServices",
    "debridService", "debridApiKey", "animeFilter", "indianCinemaFilter"
  ];

  // Computes the manifest-contract fingerprint for an already
  // profile-resolved config and classifies the transition away from
  // `previousFingerprint`. Never throws: a fingerprint bug must never block
  // a real save, so on failure this logs and returns nulls — callers must
  // treat a null fingerprint as "leave the stored fingerprint untouched".
  function computeInstallStatus(resolvedConfig, token, profileId, previousFingerprint) {
    try {
      const manifest = buildMainManifestObject(resolvedConfig, token, profileId, manifestBuildDeps);
      const nextFingerprint = normalizeManifestContract(manifest);
      const classification = classifyInstallationStatus(previousFingerprint, nextFingerprint);
      const reasonSummary = classification.reason === "schema-version-mismatch"
        ? { reasons: [{ code: "schemaVersionMismatch" }], remainingCount: 0, totalCount: 1 }
        : summarizeInstallationReasons(classification.diff, { limit: 20 });

      return {
        fingerprint: nextFingerprint,
        installStatus: {
          status: classification.status,
          reasons: reasonSummary.reasons,
          remainingCount: reasonSummary.remainingCount,
          totalCount: reasonSummary.totalCount
        }
      };
    } catch (error) {
      console.error("[install-status] fingerprint computation failed:", error.message);
      return { fingerprint: null, installStatus: null };
    }
  }

  // Builds a hypothetical config for fingerprinting purposes only — the
  // stored config with just the manifest-relevant fields patched in from
  // `patch`. Deliberately narrower than the full merge-patch semantics of
  // POST /c/:token/update (which handles ~50 fields); only the fields that
  // can actually change buildMainManifestObject's output are considered.
  function buildFingerprintCandidateConfig(baseConfig, patch) {
    const candidate = { ...baseConfig };
    MANIFEST_RELEVANT_FIELDS.forEach(field => {
      if (patch && patch[field] !== undefined) {
        candidate[field] = patch[field];
      }
    });
    return candidate;
  }

  function normalizeCollectionCatalogs(collections) {
    if (!Array.isArray(collections)) return [];

    const normalizeSource = source => {
      if (!source || typeof source !== "object" || !source.catalogId) return source;
      const catalogId = resolveCatalogId(String(source.catalogId));
      const def = CATALOG_DEFS[catalogId];
      return {
        ...source,
        catalogId,
        ...(def && (def.type === "movie" || def.type === "series")
          ? { type: def.type }
          : {})
      };
    };

    return collections.map(collection => ({
      ...collection,
      folders: Array.isArray(collection?.folders)
        ? collection.folders.map(folder => ({
            ...folder,
            rows: Array.isArray(folder?.rows)
              ? [...new Set(folder.rows.map(id => resolveCatalogId(String(id))))]
              : folder?.rows,
            sources: Array.isArray(folder?.sources)
              ? folder.sources.map(normalizeSource)
              : folder?.sources,
            catalogSources: Array.isArray(folder?.catalogSources)
              ? folder.catalogSources.map(normalizeSource)
              : folder?.catalogSources
          }))
        : collection?.folders
    }));
  }

  // Verifies `provided` against configs[token]'s stored hash. On success
  // against a legacy SHA-256 hash, transparently rehashes with bcrypt so
  // the config migrates off the weaker scheme on next successful auth.
  function verifyStoredPassword(configs, token, provided) {
    const config = configs[token];
    if (!config || !verifyPassword(provided, config.passwordHash)) return false;

    if (config.passwordHash.startsWith("$2") === false) {
      config.passwordHash = hashPassword(provided);
      saveConfigs(configs);
    }

    return true;
  }

  // Password-attempt rate limiting, keyed per token (not per IP — a shared
  // token can be attempted from many IPs). Returns a 429 and short-circuits
  // the route if the key is currently limited.
  function passwordRateLimited(req, res, token) {
    if (!checkAndRecord(token)) {
      res.status(429).json({ error: "Too many password attempts. Try again later." });
      return true;
    }
    return false;
  }

  app.post("/c/create", (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (rateLimit(ip, 5, 60000)) {
      return res.status(429).json({ error: "Too many requests." });
    }

    const {
      password,
      catalogs,
      mdblistKey,
      language,
      rpdbKey,
      tpKey,
      fanartKey,
      omdbKey,
      traktUser,
      excludeUnreleased,
      digitalReleaseOnly,
      preserveKitsuIds,
      animePresentationMode,
      maxRating,
      excludeLanguages,
      betterPostersStyle,
      streamAddons,
      customCatalogs,
      customMdbLists,
      mergedCatalogs,
      catalogOverrides,
      googleAiKey,
      enableAiRecommended,
      includeAdult,
      hiddenCatalogs,
      catalogOrder,
      hideWatched,
      animeFilter,
      indianCinemaFilter,
      minRating,
      minVotes,
      minYear,
      maxYear,
      excludeCountries,
      debridServices,
      debridService,
      debridApiKey,
      debridCachedOnly,
      debridEnglishOnly,
      debridRemoveTrash,
      debridRes4k,
      debridRes1080,
      debridRes720,
      debridRes480,
      debridMaxSizeGb,
      streamFormat,
      tmdbKey,
      collectionsSchemaVersion
    } = req.body;

    if (!password || !catalogs || !catalogs.length) {
      return res.status(400).json({
        error: "Password and catalogs required"
      });
    }

    const configs = loadConfigs();

    let token = generateToken();
    while (configs[token]) token = generateToken();

    const pendingConfig = {
      passwordHash: hashPassword(password),
      catalogs,
      mdblistKey: mdblistKey || null,
      language: language || "en-US",
      rpdbKey: rpdbKey || null,
      tpKey: tpKey || null,
      fanartKey: fanartKey || null,
      omdbKey: omdbKey || null,
      traktUser: traktUser || null,
      excludeUnreleased: !!excludeUnreleased,
      digitalReleaseOnly: !!digitalReleaseOnly,
      preserveKitsuIds: !!preserveKitsuIds,
      // Existing/missing configs remain unified. The setup UI recommends
      // AniSync-compatible for a deliberate new selection, never silently.
      animePresentationMode: normalizeAnimePresentationMode(animePresentationMode),
      maxRating: maxRating || null,
      excludeLanguages: excludeLanguages || [],
      betterPostersStyle: betterPostersStyle || null,
      streamAddons: Array.isArray(streamAddons)
        ? streamAddons.filter(Boolean)
        : [],
      customCatalogs: Array.isArray(customCatalogs)
        ? customCatalogs.filter(Boolean)
        : [],
      customMdbLists: Array.isArray(customMdbLists)
        ? customMdbLists.filter(Boolean)
        : [],
      catalogOverrides: (catalogOverrides && typeof catalogOverrides === "object" && !Array.isArray(catalogOverrides))
        ? catalogOverrides
        : {},
      googleAiKey: googleAiKey || null,
      enableAiRecommended: !!enableAiRecommended,
      includeAdult: !!includeAdult,
      debridServices: Array.isArray(debridServices) && debridServices.length ? debridServices : (debridService ? [{service: debridService, apiKey: debridApiKey}] : []),
      debridService: debridService || null,
      debridApiKey: debridApiKey || null,
      debridCachedOnly: !!debridCachedOnly,
      debridEnglishOnly: debridEnglishOnly !== false,
      debridRemoveTrash: debridRemoveTrash !== false,
      debridRes4k: debridRes4k !== false,
      debridRes1080: debridRes1080 !== false,
      debridRes720: debridRes720 !== false,
      debridRes480: !!debridRes480,
      // ULTRA MAX MAX STREAM SIZE
      debridMaxSizeGb:
        Number.isFinite(Number(debridMaxSizeGb)) &&
        Number(debridMaxSizeGb) > 0
          ? Math.min(Number(debridMaxSizeGb), 500)
          : 0,
      hiddenCatalogs: Array.isArray(hiddenCatalogs)
        ? hiddenCatalogs
        : [],
      catalogOrder: Array.isArray(catalogOrder) ? catalogOrder.filter(Boolean) : [],
      hideWatched: !!hideWatched,
      animeFilter: normalizeAnimeFilter(animeFilter),
      indianCinemaFilter: normalizeIndianCinemaFilter(indianCinemaFilter),
      minRating: Number.isFinite(Number(minRating)) ? Math.min(Math.max(Number(minRating), 0), 10) : 0,
      minVotes: Number.isFinite(Number(minVotes)) && Number(minVotes) > 0 ? Math.round(Number(minVotes)) : 0,
      minYear: normalizeYear(minYear),
      maxYear: normalizeYear(maxYear),
      excludeCountries: Array.isArray(excludeCountries)
        ? excludeCountries.map(c => String(c || "").trim().toUpperCase()).filter(Boolean)
        : [],
      collectionsSchemaVersion:
        collectionsSchemaVersion === COLLECTIONS_SCHEMA_VERSION
          ? COLLECTIONS_SCHEMA_VERSION
          : 1,
      streamFormat: sanitizeStreamFormat(streamFormat),
      tmdbKey: tmdbKey || null,
      createdAt: new Date().toISOString()
    };
    try {
      pendingConfig.mergedCatalogs = validateMergedCatalogs(mergedCatalogs, {
        config: pendingConfig,
        catalogDefs: CATALOG_DEFS,
        resolveCatalogId
      });
    } catch (error) {
      if (error instanceof MergedCatalogValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
    // First-time setup for this token always has no prior fingerprint, so
    // this trivially classifies as first-install — computed here (rather
    // than hardcoded) so the response shape and reason-summarization logic
    // stay identical to every other generate path.
    const installResult = computeInstallStatus(pendingConfig, token, null, undefined);
    if (installResult.fingerprint) {
      pendingConfig.installFingerprint = installResult.fingerprint;
    }

    configs[token] = pendingConfig;

    saveConfigs(configs);

    res.json({ token, installStatus: installResult.installStatus });
  });

  app.post("/c/:token/update", (req, res) => {
    const { token } = req.params;

    const {
      password,
      catalogs,
      mdblistKey,
      language,
      rpdbKey,
      tpKey,
      fanartKey,
      omdbKey,
      traktUser,
      excludeUnreleased,
      digitalReleaseOnly,
      preserveKitsuIds,
      animePresentationMode,
      maxRating,
      streamAddons,
      customCatalogs,
      customMdbLists,
      mergedCatalogs,
      catalogOverrides,
      googleAiKey,
      enableAiRecommended,
      includeAdult,
      hiddenCatalogs,
      catalogOrder,
      excludeLanguages,
      betterPostersStyle,
      hideWatched,
      animeFilter,
      indianCinemaFilter,
      minRating,
      minVotes,
      minYear,
      maxYear,
      excludeCountries,
      debridServices,
      debridService,
      debridApiKey,
      debridCachedOnly,
      debridEnglishOnly,
      debridRemoveTrash,
      debridRes4k,
      debridRes1080,
      debridRes720,
      debridRes480,
      debridMaxSizeGb,
      streamFormat,
      tmdbKey,
      collectionsSchemaVersion
    } = req.body;

    const configs = loadConfigs();

    if (!configs[token]) {
      return res.status(404).json({
        error: "Config not found"
      });
    }

    // For preauth configs (OAuth before setup), allow setting password
    const isPreauth = configs[token].preauth === true;
    if (!isPreauth) {
      if (passwordRateLimited(req, res, token)) return;
      if (!verifyStoredPassword(configs, token, password)) {
        return res.status(401).json({
          error: "Incorrect password"
        });
      }
      clearKey(token);
    }
    if(isPreauth) {
      configs[token].preauth = false;
      configs[token].passwordHash = hashPassword(password);
    }

    let validatedMergedCatalogs;
    try {
      const pendingConfig = {
        ...configs[token],
        customCatalogs: Array.isArray(customCatalogs)
          ? customCatalogs.filter(Boolean)
          : (configs[token].customCatalogs || []),
        customMdbLists: Array.isArray(customMdbLists)
          ? customMdbLists.filter(Boolean)
          : (configs[token].customMdbLists || [])
      };
      validatedMergedCatalogs = mergedCatalogs !== undefined
        ? validateMergedCatalogs(mergedCatalogs, {
            config: pendingConfig,
            catalogDefs: CATALOG_DEFS,
            resolveCatalogId
          })
        : (configs[token].mergedCatalogs || []);
    } catch (error) {
      if (error instanceof MergedCatalogValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    configs[token].catalogs = catalogs;
    configs[token].language = language || configs[token].language || "en-US";
    configs[token].rpdbKey = rpdbKey || configs[token].rpdbKey || null;
    configs[token].tpKey = tpKey || configs[token].tpKey || null;
    configs[token].fanartKey = fanartKey || configs[token].fanartKey || null;
    configs[token].omdbKey = omdbKey || configs[token].omdbKey || null;
    configs[token].mdblistKey = mdblistKey || configs[token].mdblistKey || null;
    configs[token].tmdbKey = tmdbKey || configs[token].tmdbKey || null;
    configs[token].traktUser =
      traktUser !== undefined
        ? traktUser
        : configs[token].traktUser;

    configs[token].excludeUnreleased =
      excludeUnreleased !== undefined
        ? !!excludeUnreleased
        : (configs[token].excludeUnreleased || false);

    configs[token].digitalReleaseOnly =
      digitalReleaseOnly !== undefined
        ? !!digitalReleaseOnly
        : (configs[token].digitalReleaseOnly || false);

    configs[token].preserveKitsuIds =
      preserveKitsuIds !== undefined
        ? !!preserveKitsuIds
        : (configs[token].preserveKitsuIds || false);

    configs[token].animePresentationMode =
      animePresentationMode !== undefined
        ? normalizeAnimePresentationMode(animePresentationMode)
        : normalizeAnimePresentationMode(configs[token].animePresentationMode);

    configs[token].maxRating =
      maxRating !== undefined
        ? maxRating
        : (configs[token].maxRating || null);
    configs[token].excludeLanguages =
      excludeLanguages !== undefined
        ? excludeLanguages
        : (configs[token].excludeLanguages || []);
    configs[token].betterPostersStyle =
      betterPostersStyle !== undefined
        ? betterPostersStyle
        : (configs[token].betterPostersStyle || null);

    configs[token].streamAddons = Array.isArray(streamAddons)
      ? streamAddons.filter(Boolean)
      : (configs[token].streamAddons || []);

    if(debridServices !== undefined) configs[token].debridServices = Array.isArray(debridServices) ? debridServices : [];
    configs[token].debridService = debridService !== undefined ? debridService : (configs[token].debridService || null);
    configs[token].debridApiKey = debridApiKey !== undefined ? debridApiKey : (configs[token].debridApiKey || null);
    configs[token].debridCachedOnly =
      debridCachedOnly !== undefined
        ? !!debridCachedOnly
        : (configs[token].debridCachedOnly || false);
    configs[token].debridEnglishOnly =
      debridEnglishOnly !== undefined
        ? !!debridEnglishOnly
        : (configs[token].debridEnglishOnly !== false);
    configs[token].debridRemoveTrash =
      debridRemoveTrash !== undefined
        ? !!debridRemoveTrash
        : (configs[token].debridRemoveTrash !== false);
    configs[token].debridRes4k = debridRes4k !== undefined ? debridRes4k !== false : (configs[token].debridRes4k !== false);
    configs[token].debridRes1080 = debridRes1080 !== undefined ? debridRes1080 !== false : (configs[token].debridRes1080 !== false);
    configs[token].debridRes720 = debridRes720 !== undefined ? debridRes720 !== false : (configs[token].debridRes720 !== false);
    configs[token].debridRes480 = debridRes480 !== undefined ? !!debridRes480 : (!!configs[token].debridRes480);

    configs[token].debridMaxSizeGb =
      debridMaxSizeGb !== undefined
        ? (
            Number.isFinite(Number(debridMaxSizeGb)) &&
            Number(debridMaxSizeGb) > 0
              ? Math.min(Number(debridMaxSizeGb), 500)
              : 0
          )
        : (Number(configs[token].debridMaxSizeGb) || 0);

    configs[token].customCatalogs = Array.isArray(customCatalogs)
      ? customCatalogs.filter(Boolean)
      : (configs[token].customCatalogs || []);

    configs[token].customMdbLists = Array.isArray(customMdbLists)
      ? customMdbLists.filter(Boolean)
      : (configs[token].customMdbLists || []);
    configs[token].mergedCatalogs = validatedMergedCatalogs;

    configs[token].catalogOverrides =
      (catalogOverrides && typeof catalogOverrides === "object" && !Array.isArray(catalogOverrides))
        ? catalogOverrides
        : (configs[token].catalogOverrides || {});

    configs[token].googleAiKey =
      googleAiKey || configs[token].googleAiKey || null;

    configs[token].enableAiRecommended =
      enableAiRecommended !== undefined
        ? !!enableAiRecommended
        : !!configs[token].enableAiRecommended;
    configs[token].includeAdult =
      includeAdult !== undefined
        ? !!includeAdult
        : !!configs[token].includeAdult;

    configs[token].catalogOrder = Array.isArray(catalogOrder) ? catalogOrder.filter(Boolean) : (configs[token].catalogOrder || []);
    if (collectionsSchemaVersion === COLLECTIONS_SCHEMA_VERSION) {
      configs[token].collectionsSchemaVersion = COLLECTIONS_SCHEMA_VERSION;
    }
    configs[token].hiddenCatalogs = Array.isArray(hiddenCatalogs)
      ? hiddenCatalogs
      : (configs[token].hiddenCatalogs || []);

    configs[token].hideWatched =
      hideWatched !== undefined
        ? !!hideWatched
        : (configs[token].hideWatched || false);

    configs[token].animeFilter =
      animeFilter !== undefined
        ? normalizeAnimeFilter(animeFilter)
        : normalizeAnimeFilter(configs[token].animeFilter);

    configs[token].indianCinemaFilter =
      indianCinemaFilter !== undefined
        ? normalizeIndianCinemaFilter(indianCinemaFilter)
        : normalizeIndianCinemaFilter(configs[token].indianCinemaFilter);

    configs[token].minRating =
      minRating !== undefined
        ? (Number.isFinite(Number(minRating)) ? Math.min(Math.max(Number(minRating), 0), 10) : 0)
        : (Number(configs[token].minRating) || 0);

    configs[token].minVotes =
      minVotes !== undefined
        ? (Number.isFinite(Number(minVotes)) && Number(minVotes) > 0 ? Math.round(Number(minVotes)) : 0)
        : (Number(configs[token].minVotes) || 0);

    configs[token].minYear =
      minYear !== undefined ? normalizeYear(minYear) : normalizeYear(configs[token].minYear);

    configs[token].maxYear =
      maxYear !== undefined ? normalizeYear(maxYear) : normalizeYear(configs[token].maxYear);

    configs[token].excludeCountries = Array.isArray(excludeCountries)
      ? excludeCountries.map(c => String(c || "").trim().toUpperCase()).filter(Boolean)
      : (configs[token].excludeCountries || []);

    if (streamFormat !== undefined) {
      configs[token].streamFormat = sanitizeStreamFormat(streamFormat);
    }

    configs[token].updatedAt = new Date().toISOString();

    // The base config's own previous fingerprint (never a device profile's
    // — updating the base token always compares against the base token's
    // own install history, per the "don't compare one device profile
    // against another" rule).
    const previousFingerprint = configs[token].installFingerprint;
    const installResult = computeInstallStatus(configs[token], token, null, previousFingerprint);
    if (installResult.fingerprint) {
      configs[token].installFingerprint = installResult.fingerprint;
    }

    saveConfigs(configs);

    if (configs[token].hideWatched && (configs[token].traktAccessToken || configs[token].simklAccessToken)) {
      getWatchedIds(
        token,
        configs[token].traktAccessToken || null,
        configs[token].simklAccessToken || null,
        process.env.TRAKT_CLIENT_ID,
        process.env.SIMKL_CLIENT_ID
      ).catch(e => console.error('[watched-filter] prewarm failed:', e.message));
    }

    res.json({ token, installStatus: installResult.installStatus });
  });

  app.get("/c/:token/config", (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const baseConfig = configs[token];

    if (!baseConfig) {
      return res.status(404).json({
        error: "Not found"
      });
    }

    // Require password — this endpoint returns sensitive data including
    // API keys, debrid credentials and stream addon URLs.
    // Only x-config-password header accepted (not query string — avoids logs/history).
    if (baseConfig.passwordHash) {
      const provided = req.headers["x-config-password"] || "";
      if (!provided) {
        return res.status(401).json({ error: "Password required" });
      }
      if (passwordRateLimited(req, res, token)) return;
      if (!verifyStoredPassword(configs, token, provided)) {
        return res.status(401).json({ error: "Incorrect password" });
      }
      clearKey(token);
    }

    // ?profile=<id> returns this token's base settings with that profile's
    // overrides layered on top — lets the setup wizard "switch profile" by
    // loading a profile's full settings back into the form.
    const config = resolveConfigForProfile(baseConfig, req.query.profile);

    res.json({
      catalogs: config.catalogs,
      catalogOrder: config.catalogOrder || [],
      collections: normalizeCollectionCatalogs(config.collections),
      collectionsSchemaVersion: config.collectionsSchemaVersion || 1,
      mdblistKey: config.mdblistKey,
      tmdbKey: config.tmdbKey || null,
      language: config.language,
      rpdbKey: config.rpdbKey,
      tpKey: config.tpKey,
      fanartKey: config.fanartKey || null,
      omdbKey: config.omdbKey || null,
      traktUser: config.traktUser,
      excludeUnreleased: config.excludeUnreleased || false,
      digitalReleaseOnly: config.digitalReleaseOnly || false,
      preserveKitsuIds: config.preserveKitsuIds || false,
      animeFilter: normalizeAnimeFilter(config.animeFilter),
      indianCinemaFilter: normalizeIndianCinemaFilter(config.indianCinemaFilter),
      minRating: Number(config.minRating) || 0,
      minVotes: Number(config.minVotes) || 0,
      minYear: normalizeYear(config.minYear),
      maxYear: normalizeYear(config.maxYear),
      excludeCountries: config.excludeCountries || [],
      animePresentationMode: normalizeAnimePresentationMode(config.animePresentationMode),
      maxRating: config.maxRating || null,
      excludeLanguages: config.excludeLanguages || [],
      betterPostersStyle: config.betterPostersStyle || null,
      streamAddons: config.streamAddons || [],
      customCatalogs: config.customCatalogs || [],
      customMdbLists: config.customMdbLists || [],
      mergedCatalogs: config.mergedCatalogs || [],
      catalogOverrides: config.catalogOverrides || {},
      googleAiKey: config.googleAiKey || null,
      enableAiRecommended: !!config.enableAiRecommended,
      includeAdult: !!config.includeAdult,
      hiddenCatalogs: config.hiddenCatalogs || [],
      hideWatched: !!config.hideWatched,
      debridServices: config.debridServices || [],
      debridCachedOnly: !!config.debridCachedOnly,
      debridEnglishOnly: config.debridEnglishOnly !== false,
      debridRemoveTrash: config.debridRemoveTrash !== false,
      debridRes4k: config.debridRes4k !== false,
      debridRes1080: config.debridRes1080 !== false,
      debridRes720: config.debridRes720 !== false,
      debridRes480: !!config.debridRes480,
      debridMaxSizeGb: Number(config.debridMaxSizeGb) || 0,
      streamFormat: config.streamFormat || null,
      // Profile listing always reflects the base config, never a resolved one.
      profiles: Object.entries(baseConfig.profiles || {}).map(([id, p]) => ({
        id,
        name: p.name,
        overrides: p.overrides || {},
        createdAt: p.createdAt || null
      }))
    });
  });

  // ── INSTALLATION STATUS ──
  // Read-only: predicts what generating right now would do to an already
  // -installed add-on, without saving anything. Compares a hypothetical
  // manifest built from the current in-editor form state (patched onto the
  // stored config — see buildFingerprintCandidateConfig) against the last
  // *successfully persisted* fingerprint for this token/profile. The
  // authoritative result — what actually happened — is only ever produced
  // by the real save routes above (/c/create, /update, /profiles...),
  // which derive their own fingerprint the same way rather than trusting
  // whatever this preview last returned.
  //
  // No password required: like GET /c/:token/profiles, this is read-only
  // and never returns secrets — only catalog identities/names and reason
  // codes, all of which are already implicitly public via the manifest
  // itself.
  const MAX_PREVIEW_BODY_BYTES = 200 * 1024;

  app.post("/c/:token/install-status/preview", (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const baseConfig = configs[token];

    if (!baseConfig) return res.status(404).json({ error: "Not found" });

    if (Buffer.byteLength(JSON.stringify(req.body || {})) > MAX_PREVIEW_BODY_BYTES) {
      return res.status(413).json({ error: "Payload too large" });
    }

    const profileId = req.query.profile || req.body.profile || null;
    const storedProfile = profileId && baseConfig.profiles && baseConfig.profiles[profileId];
    const previousFingerprint = profileId
      ? (storedProfile ? storedProfile.installFingerprint : undefined)
      : baseConfig.installFingerprint;

    const candidateConfig = buildFingerprintCandidateConfig(baseConfig, req.body);
    // A profile being previewed for the first time (not yet created) still
    // needs to resolve against *some* base — falls back to the base config
    // itself, matching what creating that profile with these overrides
    // would actually produce.
    const resolvedCandidate = profileId
      ? resolveConfigForProfile({ ...candidateConfig, profiles: baseConfig.profiles }, profileId)
      : candidateConfig;

    const manifest = buildMainManifestObject(resolvedCandidate, token, profileId, manifestBuildDeps);
    const nextFingerprint = normalizeManifestContract(manifest);
    const classification = classifyInstallationStatus(previousFingerprint, nextFingerprint);
    const reasonSummary = classification.reason === "schema-version-mismatch"
      ? { reasons: [{ code: "schemaVersionMismatch" }], remainingCount: 0, totalCount: 1 }
      : summarizeInstallationReasons(classification.diff, { limit: 20 });

    res.json({
      readOnly: true,
      status: classification.status,
      reasons: reasonSummary.reasons,
      remainingCount: reasonSummary.remainingCount,
      totalCount: reasonSummary.totalCount
    });
  });

  // ── DEVICE PROFILES ──
  // Each profile is a near-complete alternate config — catalogs,
  // collections, streamAddons, debrid settings, streamFormat, everything
  // except account bookkeeping (see utils/profiles.js) — layered on top of
  // the base token config. The base config is untouched, so an existing
  // manifest URL with no ?profile= query param keeps behaving exactly as
  // it always has.

  app.post("/c/:token/profiles", (req, res) => {
    const { token } = req.params;
    const { password, name, overrides } = req.body;

    const configs = loadConfigs();
    const config = configs[token];

    if (!config) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (!verifyStoredPassword(configs, token, password)) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    clearKey(token);

    const cleanName = String(name || "").trim().slice(0, 40);
    if (!cleanName) {
      return res.status(400).json({ error: "Profile name required" });
    }

    if (!config.profiles) config.profiles = {};

    if (Object.keys(config.profiles).length >= MAX_PROFILES_PER_TOKEN) {
      return res.status(400).json({ error: `Profile limit reached (${MAX_PROFILES_PER_TOKEN} max)` });
    }

    let profileId = generateToken();
    while (config.profiles[profileId]) profileId = generateToken();

    try {
      const safeOverrides = sanitiseProfileOverrides(overrides);
      if (safeOverrides.mergedCatalogs !== undefined) {
        safeOverrides.mergedCatalogs = validateMergedCatalogs(safeOverrides.mergedCatalogs, {
          config: { ...config, ...safeOverrides },
          catalogDefs: CATALOG_DEFS,
          resolveCatalogId
        });
      }
      config.profiles[profileId] = {
        name: cleanName,
        overrides: safeOverrides,
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      if (e instanceof ProfileOverridesTooLargeError) return res.status(400).json({ error: e.message });
      if (e instanceof MergedCatalogValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }

    // A newly-created profile has no prior fingerprint of its own — always
    // first-install, and always compared against this profile's own
    // history, never the base config's or another profile's.
    const resolvedProfileConfig = resolveConfigForProfile(config, profileId);
    const installResult = computeInstallStatus(resolvedProfileConfig, token, profileId, undefined);
    if (installResult.fingerprint) {
      config.profiles[profileId].installFingerprint = installResult.fingerprint;
    }

    saveConfigs(configs);

    res.json({
      id: profileId,
      name: config.profiles[profileId].name,
      overrides: config.profiles[profileId].overrides,
      installStatus: installResult.installStatus
    });
  });

  app.get("/c/:token/profiles", (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const config = configs[token];

    if (!config) return res.status(404).json({ error: "Not found" });

    const profiles = Object.entries(config.profiles || {}).map(([id, p]) => ({
      id,
      name: p.name,
      overrides: p.overrides || {},
      createdAt: p.createdAt || null
    }));

    res.json({ profiles });
  });

  app.post("/c/:token/profiles/:profileId/update", (req, res) => {
    const { token, profileId } = req.params;
    const { password, name, overrides } = req.body;

    const configs = loadConfigs();
    const config = configs[token];

    if (!config) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (!verifyStoredPassword(configs, token, password)) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    clearKey(token);
    if (!config.profiles || !config.profiles[profileId]) {
      return res.status(404).json({ error: "Profile not found" });
    }

    if (name !== undefined) {
      const cleanName = String(name || "").trim().slice(0, 40);
      if (!cleanName) return res.status(400).json({ error: "Profile name required" });
      config.profiles[profileId].name = cleanName;
    }

    if (overrides !== undefined) {
      try {
        const safeOverrides = sanitiseProfileOverrides(overrides);
        if (safeOverrides.mergedCatalogs !== undefined) {
          safeOverrides.mergedCatalogs = validateMergedCatalogs(safeOverrides.mergedCatalogs, {
            config: { ...config, ...safeOverrides },
            catalogDefs: CATALOG_DEFS,
            resolveCatalogId
          });
        }
        config.profiles[profileId].overrides = safeOverrides;
      } catch (e) {
        if (e instanceof ProfileOverridesTooLargeError) return res.status(400).json({ error: e.message });
        if (e instanceof MergedCatalogValidationError) return res.status(400).json({ error: e.message });
        throw e;
      }
    }

    config.profiles[profileId].updatedAt = new Date().toISOString();

    const previousFingerprint = config.profiles[profileId].installFingerprint;
    const resolvedProfileConfig = resolveConfigForProfile(config, profileId);
    const installResult = computeInstallStatus(resolvedProfileConfig, token, profileId, previousFingerprint);
    if (installResult.fingerprint) {
      config.profiles[profileId].installFingerprint = installResult.fingerprint;
    }

    saveConfigs(configs);

    res.json({
      id: profileId,
      name: config.profiles[profileId].name,
      overrides: config.profiles[profileId].overrides,
      installStatus: installResult.installStatus
    });
  });

  app.post("/c/:token/profiles/:profileId/delete", (req, res) => {
    const { token, profileId } = req.params;
    const { password } = req.body;

    const configs = loadConfigs();
    const config = configs[token];

    if (!config) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (!verifyStoredPassword(configs, token, password)) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    clearKey(token);
    if (!config.profiles || !config.profiles[profileId]) {
      return res.status(404).json({ error: "Profile not found" });
    }

    delete config.profiles[profileId];
    saveConfigs(configs);

    res.json({ ok: true });
  });

  app.get("/debug/config/:token", (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const config = configs[token];

    if (!config) {
      return res.status(404).json({
        ok: false,
        error: "Config not found",
        token
      });
    }

    const redact = value => {
      if (!value) return null;

      const text = String(value);

      if (text.length <= 6) return "***";

      return `${text.slice(0,3)}...${text.slice(-3)}`;
    };

    const catalogs = Array.isArray(config.catalogs) ? config.catalogs : [];
    const streamAddons = Array.isArray(config.streamAddons) ? config.streamAddons : [];
    const customCatalogs = Array.isArray(config.customCatalogs) ? config.customCatalogs : [];
    const collections = Array.isArray(config.collections) ? config.collections : [];
    const hiddenCatalogs = Array.isArray(config.hiddenCatalogs) ? config.hiddenCatalogs : [];

    res.json({
      ok: true,
      token,
      createdAt: config.createdAt || null,
      updatedAt: config.updatedAt || null,

      counts: {
        catalogs: catalogs.length,
        hiddenCatalogs: hiddenCatalogs.length,
        streamAddons: streamAddons.length,
        customCatalogs: customCatalogs.length,
        collections: collections.length
      },

      settings: {
        language: config.language || "en-US",
        excludeUnreleased: !!config.excludeUnreleased,
        digitalReleaseOnly: !!config.digitalReleaseOnly,
        preserveKitsuIds: !!config.preserveKitsuIds,
        animePresentationMode:
          config.animePresentationMode === "anisync" ? "anisync" : "unified",
        maxRating: config.maxRating || null,
        excludeLanguages: config.excludeLanguages || [],
        betterPostersStyle: config.betterPostersStyle || null,
        enableAiRecommended: !!config.enableAiRecommended,
        traktUser: config.traktUser || null
      },

      keys: {
        mdblistKey: redact(config.mdblistKey),
        rpdbKey: redact(config.rpdbKey),
        tpKey: redact(config.tpKey),
        fanartKey: redact(config.fanartKey),
        omdbKey: redact(config.omdbKey),
        googleAiKey: redact(config.googleAiKey)
      }
    });
  });

  // Reset password — token proves ownership, no old password needed
  app.post("/c/:token/reset-password", (req, res) => {
    const { token } = req.params;
    const { newPassword } = req.body;
    if(!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    const configs = loadConfigs();
    if(!configs[token]) return res.status(404).json({ error: "Token not found" });
    configs[token].passwordHash = hashPassword(newPassword);
    saveConfigs(configs);
    res.json({ ok: true });
  });

  app.post("/c/:token/collections", (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const config = configs[token];

    if (!config) {
      return res.status(404).json({
        error: "Not found"
      });
    }

    const { collections, replace } = req.body;

    if (!Array.isArray(collections)) {
      return res.status(400).json({
        error: "Invalid collections"
      });
    }

    // ?profile=<id> stores this token's collections for that profile
    // instead of the base config, so each profile can have its own set.
    const profileId = req.query.profile;
    const profile = profileId && config.profiles && config.profiles[profileId];
    const target = profile ? (profile.overrides || (profile.overrides = {})) : config;

    const normalizedCollections = normalizeCollectionCatalogs(collections);
    const existing = normalizeCollectionCatalogs(target.collections);

    if (replace === true) {
      target.collections = normalizedCollections;
    } else {
      const keyOf = c =>
        String(
          c.id || c.slug || c.title || c.name || ""
        )
          .trim()
          .toLowerCase();

      const merged = [...existing];
      const seen = new Map();

      merged.forEach((c, i) => {
        const k = keyOf(c);
        if (k) seen.set(k, i);
      });

      for (const incoming of normalizedCollections) {
        const k = keyOf(incoming);

        if (k && seen.has(k)) {
          merged[seen.get(k)] = {
            ...merged[seen.get(k)],
            ...incoming
          };
        } else {
          if (k) seen.set(k, merged.length);
          merged.push(incoming);
        }
      }

      target.collections = merged;
    }
    target.collectionsSchemaVersion = COLLECTIONS_SCHEMA_VERSION;

    saveConfigs(configs);

    res.json({
      ok: true,
      mode: replace === true ? "replace" : "merge",
      before: existing.length,
      incoming: normalizedCollections.length,
      after: target.collections.length
    });
  });

  app.post("/c/:token/verify-password", (req, res) => {
    const { token } = req.params;
    const { password } = req.body;
    const configs = loadConfigs();
    if (!configs[token]) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (verifyStoredPassword(configs, token, password)) {
      clearKey(token);
      return res.json({ ok: true });
    }
    return res.status(401).json({ error: "Incorrect password" });
  });

  app.get("/c/:token/collections.json", (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();

    if (!configs[token]) {
      return res.status(404).json([]);
    }

    const config = resolveConfigForProfile(configs[token], req.query.profile);
    res.json(normalizeCollectionCatalogs(config.collections));
  });
}

module.exports = {
  registerConfigRoutes,
  normalizeAnimePresentationMode
};
