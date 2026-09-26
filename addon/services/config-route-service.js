const crypto = require("crypto");
const { normalizeEpisodeReleaseDelayHours } = require("./episode-release-delay-service");
const { normalizeSearchCatalogNames } = require("./search-catalog-name-service");
const { MUTATION_REASONS } = require("../utils/config-store");
const { normalizeCollectionCatalogs } = require("./collection-normalize-service");
const {
  applyCatalogSelection,
  applyProfileCatalogSelection
} = require("./catalog-selection-service");
const {
  assertDiscoveryProvider,
  applyProviderCredentialPatch,
  getProviderCapabilities,
  createEffectiveDiscoveryConfig
} = require("./provider-capability-service");
const {
  resolveStreamLanguageSettings
} = require("./stream-language-service");
const { resolveTorboxLibraryApiKey } = require("./torbox-library-service");

function normalizeAnimePresentationMode(value) {
  return value === "anisync" ? "anisync" : "unified";
}

function normalizeAnimeFilter(value) {
  return ["allow", "reduce", "hide"].includes(value) ? value : "allow";
}

function normalizeIndianCinemaFilter(value) {
  return value === "hide" ? "hide" : "allow";
}

const CONTENT_EXCLUSION_KEYS = new Set([
  "talk",
  "reality",
  "news",
  "soap"
]);

function normalizeContentExclusions(value) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(
    value
      .map(key => String(key || "").trim().toLowerCase())
      .filter(key => CONTENT_EXCLUSION_KEYS.has(key))
  ));
}

function normalizeYear(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 1888 && n < 2200 ? Math.round(n) : 0;
}

function normalizeStreamSizeGb(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 0;
}

function normalizeStreamSortMode(value) {
  return ["source", "quality", "size-desc", "size-asc"].includes(value)
    ? value
    : "source";
}

function normalizeStreamAddonList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const addons = [];
  for (const item of value) {
    const url = String(item || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    addons.push(url);
    if (addons.length >= 8) break;
  }
  return addons;
}

function normalizeStreamAddonLabels(value, streamAddons = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const allowed = new Set(
    (Array.isArray(streamAddons) ? streamAddons : [])
      .map(item => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 8)
  );

  const labels = {};
  for (const [url, rawLabel] of Object.entries(value).slice(0, 8)) {
    if (!allowed.has(url)) continue;
    const label = String(rawLabel || "").trim().slice(0, 60);
    if (label) labels[url] = label;
  }
  return labels;
}

const COLLECTIONS_SCHEMA_VERSION = 2;

function registerConfigRoutes(app, deps) {
const { getWatchedIds, filterWatched } = require("./watched-filter");
  const { sanitizeStreamFormat } = require("./stream-formatter");
  const { normalizeTimeZone } = require("./timezone-service");
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
    clearKey,
    readConfig = async (token) => loadConfigs()[token],
    hasAccount,
    createAccount,
    mutateAccount
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
    "catalogs", "catalogOrder", "hiddenCatalogs", "mergedCatalogs", "language",
    "customCatalogs", "customMdbLists", "customTraktLists", "excludeUnreleased", "searchEnabled", "searchCatalogNames",
    "enableAiRecommended", "anilistAccessToken", "preserveKitsuIds",
    "animePresentationMode", "streamAddons", "debridServices",
    "debridService", "debridApiKey", "animeFilter", "indianCinemaFilter",
    "mdblistKey", "tmdbKey", "premiumizeLibraryEnabled", "premiumizeApiKey",
    "torboxLibraryEnabled", "torboxLibraryApiKey"
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
    const providerCredentials = applyProviderCredentialPatch(baseConfig, patch || {});
    candidate.tmdbKey = providerCredentials.tmdbKey;
    candidate.mdblistKey = providerCredentials.mdblistKey;
    return candidate;
  }


  // Verifies `provided` against configs[token]'s stored hash. On success
  // against a legacy SHA-256 hash, transparently rehashes with bcrypt so
  // the config migrates off the weaker scheme on next successful auth.
  async function verifyStoredPassword(token, provided, authoritativeAccount) {
    const config = authoritativeAccount;
    if (!config || !verifyPassword(provided, config.passwordHash)) return false;

    if (config.passwordHash.startsWith("$2") === false) {
      const replacement = hashPassword(provided);
      await mutateAccount(token, current => {
        if (current.passwordHash === config.passwordHash) current.passwordHash = replacement;
      }, { reason: MUTATION_REASONS.PASSWORD_AUTH });
      config.passwordHash = replacement;
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

  app.post("/c/create", async (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (rateLimit(ip, 5, 60000)) {
      return res.status(429).json({ error: "Too many requests." });
    }

    const {
      password,
      catalogs,
      mdblistKey,
      tvdbKey,
      tvdbPin,
      language,
        timezone,
      rpdbKey,
      tpKey,
      fanartKey,
      omdbKey,
      traktUser,
      excludeUnreleased,
      episodeReleaseDelayHours,
      digitalReleaseOnly,
      searchEnabled,
      searchCatalogNames,
      hideUnreleasedDigitalSearch,
      preserveKitsuIds,
      animePresentationMode,
      maxRating,
      excludeLanguages,
      betterPostersStyle,
      streamAddons,
      streamAddonLabels,
      streamMinSizeGb,
      streamSortMode,
      hideStreamNotices,
      customCatalogs,
      customMdbLists,
      customTraktLists,
      mergedCatalogs,
      catalogOverrides,
      googleAiKey,
      enableAiRecommended,
      includeAdult,
      hiddenCatalogs,
      catalogOrder,
      hideWatched,
      hideUnavailableStreams,
      animeFilter,
      indianCinemaFilter,
      contentExclusions,
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
      streamLanguages,
      streamLanguageMode,
      debridRemoveTrash,
      debridRes4k,
      debridRes1080,
      debridRes720,
      debridRes480,
      debridMaxSizeGb,
      streamFormat,
      preserveStreamSourceBranding,
      tmdbKey,
      premiumizeApiKey,
      premiumizeLibraryEnabled,
      torboxLibraryApiKey,
      torboxLibraryEnabled,
      collectionsSchemaVersion
    } = req.body;

    if (!password || !catalogs || !catalogs.length) {
      return res.status(400).json({
        error: "Password and catalogs required"
      });
    }

    const providerCredentials = applyProviderCredentialPatch({}, {
      mdblistKey,
      tmdbKey,
      tvdbKey,
      tvdbPin
    });
    try {
      assertDiscoveryProvider(providerCredentials);
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        error: error.message,
        code: error.code
      });
    }

    let token = generateToken();
    while (await hasAccount(token)) token = generateToken();

    const normalizedStreamAddons = normalizeStreamAddonList(streamAddons);
    const streamLanguageSettings = resolveStreamLanguageSettings({
      streamLanguages,
      streamLanguageMode,
      debridEnglishOnly
    });

    const pendingConfig = {
      passwordHash: hashPassword(password),
      catalogs,
      mdblistKey: providerCredentials.mdblistKey,
      tvdbKey: providerCredentials.tvdbKey,
      tvdbPin: providerCredentials.tvdbPin,
      language: language || "en-US",
        timezone: normalizeTimeZone(timezone),
      rpdbKey: rpdbKey || null,
      tpKey: tpKey || null,
      fanartKey: fanartKey || null,
      omdbKey: omdbKey || null,
      traktUser: traktUser || null,
      excludeUnreleased: !!excludeUnreleased,
      episodeReleaseDelayHours: normalizeEpisodeReleaseDelayHours(episodeReleaseDelayHours),
      digitalReleaseOnly: !!digitalReleaseOnly,
      searchEnabled: searchEnabled !== false,
      searchCatalogNames: normalizeSearchCatalogNames(searchCatalogNames),
      hideUnreleasedDigitalSearch: !!hideUnreleasedDigitalSearch,
      preserveKitsuIds: !!preserveKitsuIds,
      // Existing/missing configs remain unified. The setup UI recommends
      // AniSync-compatible for a deliberate new selection, never silently.
      animePresentationMode: normalizeAnimePresentationMode(animePresentationMode),
      maxRating: maxRating || null,
      excludeLanguages: excludeLanguages || [],
      betterPostersStyle: betterPostersStyle || null,
      streamAddons: normalizedStreamAddons,
      streamAddonLabels: normalizeStreamAddonLabels(
        streamAddonLabels,
        normalizedStreamAddons
      ),
      streamMinSizeGb: normalizeStreamSizeGb(streamMinSizeGb),
      streamSortMode: normalizeStreamSortMode(streamSortMode),
      hideStreamNotices: hideStreamNotices === true,
      customCatalogs: Array.isArray(customCatalogs)
        ? customCatalogs.filter(Boolean)
        : [],
      customMdbLists: Array.isArray(customMdbLists)
        ? customMdbLists.filter(Boolean)
        : [],
      customTraktLists: Array.isArray(customTraktLists)
        ? customTraktLists.filter(Boolean)
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
      streamLanguages: streamLanguageSettings.languages,
      streamLanguageMode: streamLanguageSettings.mode,
      debridEnglishOnly:
        streamLanguageSettings.mode === "only" &&
        streamLanguageSettings.languages.length === 1 &&
        streamLanguageSettings.languages[0] === "en",
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
      hideUnavailableStreams: !!hideUnavailableStreams,
      animeFilter: normalizeAnimeFilter(animeFilter),
      indianCinemaFilter: normalizeIndianCinemaFilter(indianCinemaFilter),
      contentExclusions: normalizeContentExclusions(contentExclusions),
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
      preserveStreamSourceBranding: !!preserveStreamSourceBranding,
      tmdbKey: providerCredentials.tmdbKey,
      tvdbKey: providerCredentials.tvdbKey,
      tvdbPin: providerCredentials.tvdbPin,
      premiumizeApiKey: typeof premiumizeApiKey === "string" && premiumizeApiKey.trim() ? premiumizeApiKey.trim() : null,
      premiumizeLibraryEnabled: !!premiumizeLibraryEnabled && !!(typeof premiumizeApiKey === "string" && premiumizeApiKey.trim()),
      torboxLibraryApiKey: typeof torboxLibraryApiKey === "string" && torboxLibraryApiKey.trim() ? torboxLibraryApiKey.trim() : null,
      torboxLibraryEnabled: false,
      createdAt: new Date().toISOString()
    };
    pendingConfig.torboxLibraryEnabled = !!torboxLibraryEnabled && !!resolveTorboxLibraryApiKey(pendingConfig);
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
    applyCatalogSelection(pendingConfig);
    // First-time setup for this token always has no prior fingerprint, so
    // this trivially classifies as first-install — computed here (rather
    // than hardcoded) so the response shape and reason-summarization logic
    // stay identical to every other generate path.
    const installResult = computeInstallStatus(pendingConfig, token, null, undefined);
    if (installResult.fingerprint) {
      pendingConfig.installFingerprint = installResult.fingerprint;
    }

    await createAccount(token, pendingConfig);

    res.json({ token, installStatus: installResult.installStatus });
  });

  app.post("/c/:token/update", async (req, res) => {
    const { token } = req.params;

    const {
      password,
      catalogs,
      mdblistKey,
      tvdbKey,
      tvdbPin,
      language,
        timezone,
      rpdbKey,
      tpKey,
      fanartKey,
      omdbKey,
      traktUser,
      excludeUnreleased,
      episodeReleaseDelayHours,
      digitalReleaseOnly,
      searchEnabled,
      searchCatalogNames,
      hideUnreleasedDigitalSearch,
      preserveKitsuIds,
      animePresentationMode,
      maxRating,
      streamAddons,
      streamAddonLabels,
      streamMinSizeGb,
      streamSortMode,
      hideStreamNotices,
      customCatalogs,
      customMdbLists,
      customTraktLists,
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
      hideUnavailableStreams,
      animeFilter,
      indianCinemaFilter,
      contentExclusions,
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
      streamLanguages,
      streamLanguageMode,
      debridRemoveTrash,
      debridRes4k,
      debridRes1080,
      debridRes720,
      debridRes480,
      debridMaxSizeGb,
      streamFormat,
      preserveStreamSourceBranding,
      tmdbKey,
      premiumizeApiKey,
      premiumizeLibraryEnabled,
      premiumizeDisconnect,
      torboxLibraryApiKey,
      torboxLibraryEnabled,
      torboxDisconnect,
      collectionsSchemaVersion
    } = req.body;

    const authoritativeConfig = await readConfig(token);
    if (!authoritativeConfig) {
      return res.status(404).json({
        error: "Config not found"
      });
    }
    const configs = { [token]: authoritativeConfig };

    const providerCredentials = applyProviderCredentialPatch(
      configs[token],
      req.body || {}
    );
    try {
      assertDiscoveryProvider(providerCredentials);
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        error: error.message,
        code: error.code
      });
    }

    // For preauth configs (OAuth before setup), allow setting password
    const isPreauth = configs[token].preauth === true;
    if (!isPreauth) {
      if (passwordRateLimited(req, res, token)) return;
      if (!await verifyStoredPassword(token, password, authoritativeConfig)) {
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
          : (configs[token].customMdbLists || []),
        customTraktLists: Array.isArray(customTraktLists)
          ? customTraktLists.filter(Boolean)
          : (configs[token].customTraktLists || [])
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

    configs[token].catalogs = Array.isArray(catalogs)
      ? catalogs
      : (configs[token].catalogs || []);
    configs[token].language = language || configs[token].language || "en-US";
      configs[token].timezone =
        timezone !== undefined
          ? normalizeTimeZone(timezone)
          : normalizeTimeZone(configs[token].timezone);
    // Optional poster/metadata credentials use patch semantics: an omitted
    // field preserves the stored value, while an explicit null/blank clears it.
    // Using `incoming || stored` here made a deleted RPDB key resurrect on the
    // next token load because the setup page intentionally sends null for an
    // empty field.
    for (const field of ["rpdbKey", "tpKey", "fanartKey", "omdbKey"]) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        const incoming = req.body[field];
        configs[token][field] =
          typeof incoming === "string" && incoming.trim()
            ? incoming.trim()
            : null;
      }
    }
    // Preserve historical object shape for old tokens while allowing each
    // optional provider credential to be added, updated or explicitly cleared.
    for (const field of ["mdblistKey", "tmdbKey", "tvdbKey", "tvdbPin"]) {
      if (
        Object.prototype.hasOwnProperty.call(configs[token], field) ||
        Object.prototype.hasOwnProperty.call(req.body || {}, field)
      ) {
        configs[token][field] = providerCredentials[field];
      }
    }
    if (premiumizeDisconnect === true) {
      configs[token].premiumizeApiKey = null;
      configs[token].premiumizeLibraryEnabled = false;
      const premiumizeIds = new Set(["premiumize_movies", "premiumize_series"]);
      configs[token].catalogs = (configs[token].catalogs || []).filter(id => !premiumizeIds.has(id));
      configs[token].catalogOrder = (configs[token].catalogOrder || []).filter(id => !premiumizeIds.has(id));
      configs[token].hiddenCatalogs = (configs[token].hiddenCatalogs || []).filter(id => !premiumizeIds.has(id));
    } else {
      if (typeof premiumizeApiKey === "string" && premiumizeApiKey.trim()) {
        configs[token].premiumizeApiKey = premiumizeApiKey.trim();
      }
      if (premiumizeLibraryEnabled !== undefined) {
        if (premiumizeLibraryEnabled && !configs[token].premiumizeApiKey) {
          return res.status(400).json({ error: "Connect Premiumize before enabling Cloud Library." });
        }
        configs[token].premiumizeLibraryEnabled = !!premiumizeLibraryEnabled;
      }
    }

    configs[token].traktUser =
      traktUser !== undefined
        ? traktUser
        : configs[token].traktUser;

    configs[token].excludeUnreleased =
      excludeUnreleased !== undefined
        ? !!excludeUnreleased
        : (configs[token].excludeUnreleased || false);

    configs[token].episodeReleaseDelayHours =
      episodeReleaseDelayHours !== undefined
        ? normalizeEpisodeReleaseDelayHours(episodeReleaseDelayHours)
        : normalizeEpisodeReleaseDelayHours(configs[token].episodeReleaseDelayHours);

    configs[token].digitalReleaseOnly =
      digitalReleaseOnly !== undefined
        ? !!digitalReleaseOnly
        : (configs[token].digitalReleaseOnly || false);

    configs[token].searchEnabled =
      searchEnabled !== undefined
        ? searchEnabled !== false
        : (configs[token].searchEnabled !== false);

    configs[token].searchCatalogNames =
      searchCatalogNames !== undefined
        ? normalizeSearchCatalogNames(searchCatalogNames)
        : normalizeSearchCatalogNames(configs[token].searchCatalogNames);

    configs[token].hideUnreleasedDigitalSearch =
      hideUnreleasedDigitalSearch !== undefined
        ? !!hideUnreleasedDigitalSearch
        : !!configs[token].hideUnreleasedDigitalSearch;

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
      ? normalizeStreamAddonList(streamAddons)
      : normalizeStreamAddonList(configs[token].streamAddons || []);

    configs[token].streamAddonLabels =
      streamAddonLabels !== undefined
        ? normalizeStreamAddonLabels(streamAddonLabels, configs[token].streamAddons)
        : normalizeStreamAddonLabels(
            configs[token].streamAddonLabels,
            configs[token].streamAddons
          );
    configs[token].streamMinSizeGb =
      streamMinSizeGb !== undefined
        ? normalizeStreamSizeGb(streamMinSizeGb)
        : normalizeStreamSizeGb(configs[token].streamMinSizeGb);
    configs[token].streamSortMode =
      streamSortMode !== undefined
        ? normalizeStreamSortMode(streamSortMode)
        : normalizeStreamSortMode(configs[token].streamSortMode);
    configs[token].hideStreamNotices =
      hideStreamNotices !== undefined
        ? !!hideStreamNotices
        : !!configs[token].hideStreamNotices;

    if(debridServices !== undefined) configs[token].debridServices = Array.isArray(debridServices) ? debridServices : [];
    configs[token].debridService = debridService !== undefined ? debridService : (configs[token].debridService || null);
    configs[token].debridApiKey = debridApiKey !== undefined ? debridApiKey : (configs[token].debridApiKey || null);

    if (torboxDisconnect === true) {
      configs[token].torboxLibraryApiKey = null;
      configs[token].torboxLibraryEnabled = false;
      const torboxIds = new Set(["torbox_movies", "torbox_series"]);
      configs[token].catalogs = (configs[token].catalogs || []).filter(id => !torboxIds.has(id));
      configs[token].catalogOrder = (configs[token].catalogOrder || []).filter(id => !torboxIds.has(id));
      configs[token].hiddenCatalogs = (configs[token].hiddenCatalogs || []).filter(id => !torboxIds.has(id));
    } else {
      if (typeof torboxLibraryApiKey === "string" && torboxLibraryApiKey.trim()) {
        configs[token].torboxLibraryApiKey = torboxLibraryApiKey.trim();
      }
      if (torboxLibraryEnabled !== undefined) {
        if (torboxLibraryEnabled && !resolveTorboxLibraryApiKey(configs[token])) {
          return res.status(400).json({ error: "Add a TorBox API key or connect TorBox under Streams before enabling Cloud Library." });
        }
        configs[token].torboxLibraryEnabled = !!torboxLibraryEnabled;
      }
    }

    configs[token].debridCachedOnly =
      debridCachedOnly !== undefined
        ? !!debridCachedOnly
        : (configs[token].debridCachedOnly || false);
    {
      let nextLanguageSettings;
      if (streamLanguages !== undefined || streamLanguageMode !== undefined) {
        const currentLanguageSettings = resolveStreamLanguageSettings(configs[token]);
        nextLanguageSettings = resolveStreamLanguageSettings({
          streamLanguages:
            streamLanguages !== undefined
              ? streamLanguages
              : currentLanguageSettings.languages,
          streamLanguageMode:
            streamLanguageMode !== undefined
              ? streamLanguageMode
              : currentLanguageSettings.mode,
          debridEnglishOnly: configs[token].debridEnglishOnly
        });
      } else if (debridEnglishOnly !== undefined) {
        nextLanguageSettings = resolveStreamLanguageSettings({
          debridEnglishOnly: !!debridEnglishOnly
        });
      } else {
        nextLanguageSettings = resolveStreamLanguageSettings(configs[token]);
      }

      configs[token].streamLanguages = nextLanguageSettings.languages;
      configs[token].streamLanguageMode = nextLanguageSettings.mode;
      configs[token].debridEnglishOnly =
        nextLanguageSettings.mode === "only" &&
        nextLanguageSettings.languages.length === 1 &&
        nextLanguageSettings.languages[0] === "en";
    }
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
    configs[token].customTraktLists = Array.isArray(customTraktLists)
      ? customTraktLists.filter(Boolean)
      : (configs[token].customTraktLists || []);
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

    configs[token].hideUnavailableStreams =
      hideUnavailableStreams !== undefined
        ? !!hideUnavailableStreams
        : !!configs[token].hideUnavailableStreams;

    configs[token].animeFilter =
      animeFilter !== undefined
        ? normalizeAnimeFilter(animeFilter)
        : normalizeAnimeFilter(configs[token].animeFilter);

    configs[token].indianCinemaFilter =
      indianCinemaFilter !== undefined
        ? normalizeIndianCinemaFilter(indianCinemaFilter)
        : normalizeIndianCinemaFilter(configs[token].indianCinemaFilter);

    configs[token].contentExclusions =
      contentExclusions !== undefined
        ? normalizeContentExclusions(contentExclusions)
        : normalizeContentExclusions(configs[token].contentExclusions);

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

    if (preserveStreamSourceBranding !== undefined) {
      configs[token].preserveStreamSourceBranding =
        !!preserveStreamSourceBranding;
    }

    applyCatalogSelection(configs[token]);
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

    const committedConfig = await mutateAccount(token, current => {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, configs[token]);
    }, { reason: MUTATION_REASONS.EXPLICIT_CONFIG });

    if (committedConfig.hideWatched && (committedConfig.traktAccessToken || committedConfig.simklAccessToken)) {
      getWatchedIds(
        token,
        committedConfig.traktAccessToken || null,
        committedConfig.simklAccessToken || null,
        process.env.TRAKT_CLIENT_ID,
        process.env.SIMKL_CLIENT_ID
      ).catch(e => console.error('[watched-filter] prewarm failed:', e.message));
    }

    res.json({ token, installStatus: installResult.installStatus });
  });

  app.get("/c/:token/config", async (req, res) => {
    const { token } = req.params;
    const baseConfig = await readConfig(token, req.query.profile);

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
      if (!await verifyStoredPassword(token, provided, baseConfig)) {
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
      tvdbKey: config.tvdbKey || null,
      tvdbPin: config.tvdbPin || null,
      premiumizeConnected: !!config.premiumizeApiKey,
      premiumizeLibraryEnabled: !!config.premiumizeLibraryEnabled,
      torboxLibraryConnected: !!resolveTorboxLibraryApiKey(config),
      torboxLibraryEnabled: !!config.torboxLibraryEnabled,
      language: config.language,
        timezone: normalizeTimeZone(config.timezone),
      rpdbKey: config.rpdbKey,
      tpKey: config.tpKey,
      fanartKey: config.fanartKey || null,
      omdbKey: config.omdbKey || null,
      traktUser: config.traktUser,
      excludeUnreleased: config.excludeUnreleased || false,
      episodeReleaseDelayHours: normalizeEpisodeReleaseDelayHours(config.episodeReleaseDelayHours),
      digitalReleaseOnly: config.digitalReleaseOnly || false,
      searchEnabled: config.searchEnabled !== false,
      searchCatalogNames: normalizeSearchCatalogNames(config.searchCatalogNames),
      hideUnreleasedDigitalSearch: !!config.hideUnreleasedDigitalSearch,
      preserveKitsuIds: config.preserveKitsuIds || false,
      animeFilter: normalizeAnimeFilter(config.animeFilter),
      indianCinemaFilter: normalizeIndianCinemaFilter(config.indianCinemaFilter),
      contentExclusions: normalizeContentExclusions(config.contentExclusions),
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
      streamAddonLabels: normalizeStreamAddonLabels(
        config.streamAddonLabels,
        config.streamAddons || []
      ),
      streamMinSizeGb: normalizeStreamSizeGb(config.streamMinSizeGb),
      streamSortMode: normalizeStreamSortMode(config.streamSortMode),
      hideStreamNotices: !!config.hideStreamNotices,
      customCatalogs: config.customCatalogs || [],
      customMdbLists: config.customMdbLists || [],
      customTraktLists: config.customTraktLists || [],
      mergedCatalogs: config.mergedCatalogs || [],
      catalogOverrides: config.catalogOverrides || {},
      googleAiKey: config.googleAiKey || null,
      enableAiRecommended: !!config.enableAiRecommended,
      includeAdult: !!config.includeAdult,
      hiddenCatalogs: config.hiddenCatalogs || [],
      hideWatched: !!config.hideWatched,
      hideUnavailableStreams: !!config.hideUnavailableStreams,
      debridServices: config.debridServices || [],
      debridCachedOnly: !!config.debridCachedOnly,
      streamLanguages: resolveStreamLanguageSettings(config).languages,
      streamLanguageMode: resolveStreamLanguageSettings(config).mode,
      debridEnglishOnly:
        resolveStreamLanguageSettings(config).mode === "only" &&
        resolveStreamLanguageSettings(config).languages.length === 1 &&
        resolveStreamLanguageSettings(config).languages[0] === "en",
      debridRemoveTrash: config.debridRemoveTrash !== false,
      debridRes4k: config.debridRes4k !== false,
      debridRes1080: config.debridRes1080 !== false,
      debridRes720: config.debridRes720 !== false,
      debridRes480: !!config.debridRes480,
      debridMaxSizeGb: Number(config.debridMaxSizeGb) || 0,
      streamFormat: config.streamFormat || null,
      preserveStreamSourceBranding:
        !!config.preserveStreamSourceBranding,
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

  app.post("/c/:token/install-status/preview", async (req, res) => {
    const { token } = req.params;
    const baseConfig = await readConfig(token, req.body.profile || null);

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

  function publicProfileOverrides(overrides) {
    const publicOverrides = { ...(overrides || {}) };
    for (const field of [
      "profileTraktToken",
      "profileTraktRefreshToken",
      "profileTraktTokenExpiry",
      "profileSimklToken"
    ]) {
      delete publicOverrides[field];
    }
    return publicOverrides;
  }

  app.post("/c/:token/profiles", async (req, res) => {
    const { token } = req.params;
    const { password, name, overrides } = req.body;

    const config = await readConfig(token);

    if (!config) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (!await verifyStoredPassword(token, password, config)) {
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
      const resolvedProviderCredentials = applyProviderCredentialPatch(config, safeOverrides);
      for (const field of ["tmdbKey", "mdblistKey", "tvdbKey", "tvdbPin"]) {
        if (Object.prototype.hasOwnProperty.call(safeOverrides, field)) {
          safeOverrides[field] = resolvedProviderCredentials[field];
        }
      }
      assertDiscoveryProvider(resolvedProviderCredentials);
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
      if (e instanceof ProfileOverridesTooLargeError || e.code === "DISCOVERY_PROVIDER_REQUIRED") return res.status(400).json({ error: e.message, code: e.code });
      if (e instanceof MergedCatalogValidationError) return res.status(400).json({ error: e.message });
      throw e;
    }

    applyProfileCatalogSelection(config, profileId);

    // A newly-created profile has no prior fingerprint of its own — always
    // first-install, and always compared against this profile's own
    // history, never the base config's or another profile's.
    const resolvedProfileConfig = resolveConfigForProfile(config, profileId);
    const installResult = computeInstallStatus(resolvedProfileConfig, token, profileId, undefined);
    if (installResult.fingerprint) {
      config.profiles[profileId].installFingerprint = installResult.fingerprint;
    }

    const committed = await mutateAccount(token, current => {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, config);
    }, { reason: MUTATION_REASONS.PROFILE_COLLECTION });

    res.json({
      id: profileId,
      name: committed.profiles[profileId].name,
      overrides: publicProfileOverrides(committed.profiles[profileId].overrides),
      installStatus: installResult.installStatus
    });
  });

  app.get("/c/:token/profiles", async (req, res) => {
    const { token } = req.params;
    const config = await readConfig(token);

    if (!config) return res.status(404).json({ error: "Not found" });

    const profiles = Object.entries(config.profiles || {}).map(([id, p]) => {
      const storedOverrides = p.overrides || {};
      const publicOverrides = { ...storedOverrides };

      // OAuth tokens are server-owned secrets. The profile manager only needs
      // public account identity/status, never the raw access/refresh tokens.
      for (const field of [
        "profileTraktToken",
        "profileTraktRefreshToken",
        "profileTraktTokenExpiry",
        "profileSimklToken"
      ]) {
        delete publicOverrides[field];
      }

      return {
        id,
        name: p.name,
        overrides: publicOverrides,
        accounts: {
          trakt: storedOverrides.profileTraktToken
            ? {
                connected: true,
                scope: "profile",
                username: storedOverrides.profileTraktUser || null
              }
            : config.traktAccessToken
              ? {
                  connected: true,
                  scope: "base",
                  username: config.traktUser || null
                }
              : {
                  connected: false,
                  scope: "none",
                  username: null
                },
          simkl: storedOverrides.profileSimklToken
            ? {
                connected: true,
                scope: "profile",
                username: storedOverrides.profileSimklUser || null
              }
            : config.simklAccessToken
              ? {
                  connected: true,
                  scope: "base",
                  username: config.simklUser || null
                }
              : {
                  connected: false,
                  scope: "none",
                  username: null
                }
        },
        createdAt: p.createdAt || null
      };
    });

    res.json({ profiles });
  });

  app.post("/c/:token/profiles/:profileId/update", async (req, res) => {
    const { token, profileId } = req.params;
    const { password, name, overrides } = req.body;

    const config = await readConfig(token);

    if (!config) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (!await verifyStoredPassword(token, password, config)) {
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
        const resolvedProviderCredentials = applyProviderCredentialPatch(
          config,
          safeOverrides
        );
        for (const field of ["tmdbKey", "mdblistKey", "tvdbKey", "tvdbPin"]) {
          if (Object.prototype.hasOwnProperty.call(safeOverrides, field)) {
            safeOverrides[field] = resolvedProviderCredentials[field];
          }
        }
        assertDiscoveryProvider(resolvedProviderCredentials);
        if (safeOverrides.mergedCatalogs !== undefined) {
          safeOverrides.mergedCatalogs = validateMergedCatalogs(safeOverrides.mergedCatalogs, {
            config: { ...config, ...safeOverrides },
            catalogDefs: CATALOG_DEFS,
            resolveCatalogId
          });
        }

        // Normal profile edits replace the configurable override snapshot, but
        // OAuth credentials are managed by their own connect/disconnect routes.
        // Preserve those provider-owned fields unless an OAuth route has already
        // removed them from the stored profile.
        const previousOverrides = config.profiles[profileId].overrides || {};
        for (const field of [
          "profileTraktToken",
          "profileTraktRefreshToken",
          "profileTraktTokenExpiry",
          "profileTraktUser",
          "profileSimklToken",
          "profileSimklUser"
        ]) {
          if (
            !Object.prototype.hasOwnProperty.call(safeOverrides, field) &&
            Object.prototype.hasOwnProperty.call(previousOverrides, field)
          ) {
            safeOverrides[field] = previousOverrides[field];
          }
        }

        config.profiles[profileId].overrides = safeOverrides;
      } catch (e) {
        if (e instanceof ProfileOverridesTooLargeError || e.code === "DISCOVERY_PROVIDER_REQUIRED") return res.status(400).json({ error: e.message, code: e.code });
        if (e instanceof MergedCatalogValidationError) return res.status(400).json({ error: e.message });
        throw e;
      }
    }

    applyProfileCatalogSelection(config, profileId);
    config.profiles[profileId].updatedAt = new Date().toISOString();

    const previousFingerprint = config.profiles[profileId].installFingerprint;
    const resolvedProfileConfig = resolveConfigForProfile(config, profileId);
    const installResult = computeInstallStatus(resolvedProfileConfig, token, profileId, previousFingerprint);
    if (installResult.fingerprint) {
      config.profiles[profileId].installFingerprint = installResult.fingerprint;
    }

    const committed = await mutateAccount(token, current => {
      for (const key of Object.keys(current)) delete current[key];
      Object.assign(current, config);
    }, { reason: MUTATION_REASONS.PROFILE_COLLECTION });

    res.json({
      id: profileId,
      name: committed.profiles[profileId].name,
      overrides: publicProfileOverrides(committed.profiles[profileId].overrides),
      installStatus: installResult.installStatus
    });
  });

  app.post("/c/:token/profiles/:profileId/delete", async (req, res) => {
    const { token, profileId } = req.params;
    const { password } = req.body;

    const config = await readConfig(token);

    if (!config) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (!await verifyStoredPassword(token, password, config)) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    clearKey(token);
    if (!config.profiles || !config.profiles[profileId]) {
      return res.status(404).json({ error: "Profile not found" });
    }

    delete config.profiles[profileId];
    await mutateAccount(token, current => {
      if (current.profiles) delete current.profiles[profileId];
    }, { reason: MUTATION_REASONS.PROFILE_COLLECTION });

    res.json({ ok: true });
  });

  app.get("/debug/config/:token", async (req, res) => {
    const { token } = req.params;
    const config = await readConfig(token);

    if (!config) {
      return res.status(404).json({
        ok: false,
        error: "Config not found",
        token
      });
    }

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
        episodeReleaseDelayHours: normalizeEpisodeReleaseDelayHours(config.episodeReleaseDelayHours),
        digitalReleaseOnly: !!config.digitalReleaseOnly,
        searchEnabled: config.searchEnabled !== false,
        searchCatalogNames: normalizeSearchCatalogNames(config.searchCatalogNames),
        hideUnreleasedDigitalSearch: !!config.hideUnreleasedDigitalSearch,
        preserveKitsuIds: !!config.preserveKitsuIds,
        animePresentationMode:
          config.animePresentationMode === "anisync" ? "anisync" : "unified",
        maxRating: config.maxRating || null,
        excludeLanguages: config.excludeLanguages || [],
        betterPostersStyle: config.betterPostersStyle || null,
        enableAiRecommended: !!config.enableAiRecommended,
        traktUser: config.traktUser || null
      },

      keys: (() => {
        const capabilities = getProviderCapabilities(config);
        return {
          hasTmdb: capabilities.hasTmdb,
          hasMdblist: capabilities.hasMdblist,
          hasRpdb: !!config.rpdbKey,
          hasTopPosters: !!config.tpKey,
          hasFanart: !!config.fanartKey,
          hasOmdb: !!config.omdbKey,
          hasGoogleAi: !!config.googleAiKey
        };
      })()
    });
  });

  // Reset password — token proves ownership, no old password needed
  app.post("/c/:token/reset-password", async (req, res) => {
    const { token } = req.params;
    const { newPassword } = req.body;
    if(!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    const committed = await mutateAccount(token, config => {
      config.passwordHash = hashPassword(newPassword);
    }, { reason: MUTATION_REASONS.PASSWORD_AUTH });
    if (!committed) return res.status(404).json({ error: "Token not found" });
    res.json({ ok: true });
  });

  app.post("/c/:token/collections", async (req, res) => {
    const { token } = req.params;
    const config = await readConfig(token);

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

    console.log(
      "[COLLECTION-WRITE]",
      {
        tokenFingerprint: crypto.createHash("sha256").update(token).digest("hex").slice(0, 12),
        profileId: profileId || null,
        replace: replace === true,
        incomingCount: normalizedCollections.length,
        incomingTitles: normalizedCollections.map(collection =>
          collection && (collection.title || collection.name || "")
        ),
        sports: normalizedCollections
          .filter(collection =>
            collection &&
            (collection.title || collection.name || "") === "Sports"
          )
          .map(collection => ({
            title: collection.title || collection.name,
            folders: Array.isArray(collection.folders)
              ? collection.folders.map(folder => ({
                  title: folder && folder.title,
                  rows: Array.isArray(folder && folder.rows)
                    ? folder.rows.length
                    : 0,
                  sources: Array.isArray(folder && folder.sources)
                    ? folder.sources.length
                    : 0,
                  catalogSources: Array.isArray(folder && folder.catalogSources)
                    ? folder.catalogSources.length
                    : 0
                }))
              : []
          }))
      }
    );

    let nextCollections;

    if (replace === true) {
      nextCollections = normalizedCollections;
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

      nextCollections = merged;
    }

    /*
     * Collection pushes can be repeated by setup/Nuvio clients even when
     * nothing has changed. With a large config store, rewriting every config
     * for an identical payload is extremely expensive.
     *
     * Only persist when this config actually changed.
     */
    const collectionsChanged =
      JSON.stringify(existing) !==
      JSON.stringify(nextCollections);

    const schemaChanged =
      target.collectionsSchemaVersion !==
      COLLECTIONS_SCHEMA_VERSION;

    if (collectionsChanged) {
      target.collections = nextCollections;
    }

    if (schemaChanged) {
      target.collectionsSchemaVersion =
        COLLECTIONS_SCHEMA_VERSION;
    }

    if (collectionsChanged || schemaChanged) {
      await mutateAccount(token, current => {
        const currentProfile = profileId && current.profiles && current.profiles[profileId];
        const currentTarget = currentProfile
          ? (currentProfile.overrides || (currentProfile.overrides = {}))
          : current;
        currentTarget.collections = nextCollections;
        currentTarget.collectionsSchemaVersion = COLLECTIONS_SCHEMA_VERSION;
      }, { reason: MUTATION_REASONS.PROFILE_COLLECTION });
    }

    res.json({
      ok: true,
      mode: replace === true ? "replace" : "merge",
      before: existing.length,
      incoming: normalizedCollections.length,
      after: nextCollections.length,
      unchanged: !collectionsChanged && !schemaChanged
    });
  });

  app.post("/c/:token/verify-password", async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;
    const config = await readConfig(token);
    if (!config) return res.status(404).json({ error: "Not found" });
    if (passwordRateLimited(req, res, token)) return;
    if (await verifyStoredPassword(token, password, config)) {
      clearKey(token);
      return res.json({ ok: true });
    }
    return res.status(401).json({ error: "Incorrect password" });
  });

  app.get("/c/:token/collections.json", async (req, res) => {
    const { token } = req.params;
    const baseConfig = await readConfig(token, req.query.profile);
    if (!baseConfig) {
      return res.status(404).json([]);
    }

    const resolvedConfig = resolveConfigForProfile(baseConfig, req.query.profile);
    const effectiveConfig = createEffectiveDiscoveryConfig(resolvedConfig);
    res.setHeader("Cache-Control", "no-store");
    res.json(normalizeCollectionCatalogs(effectiveConfig.collections));
  });
}

module.exports = {
  registerConfigRoutes,
  normalizeAnimePresentationMode
};
