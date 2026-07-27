function registerConfigRoutes(app, deps) {
const { getWatchedIds, filterWatched } = require("./watched-filter");
  const { sanitizeStreamFormat } = require("./stream-formatter");
  const { sanitiseProfileOverrides, resolveConfigForProfile, ProfileOverridesTooLargeError } = require("../utils/profiles");
  const { CATALOG_DEFS, resolveCatalogId } = require("../catalogs/catalog-defs");
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
      maxRating,
      excludeLanguages,
      betterPostersStyle,
      streamAddons,
      customCatalogs,
      customMdbLists,
      catalogOverrides,
      googleAiKey,
      enableAiRecommended,
      includeAdult,
      hiddenCatalogs,
      catalogOrder,
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
      tmdbKey
    } = req.body;

    if (!password || !catalogs || !catalogs.length) {
      return res.status(400).json({
        error: "Password and catalogs required"
      });
    }

    const configs = loadConfigs();

    let token = generateToken();
    while (configs[token]) token = generateToken();

    configs[token] = {
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
      streamFormat: sanitizeStreamFormat(streamFormat),
      tmdbKey: tmdbKey || null,
      createdAt: new Date().toISOString()
    };

    saveConfigs(configs);

    res.json({ token });
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
      maxRating,
      streamAddons,
      customCatalogs,
      customMdbLists,
      catalogOverrides,
      googleAiKey,
      enableAiRecommended,
      includeAdult,
      hiddenCatalogs,
      catalogOrder,
      excludeLanguages,
      betterPostersStyle,
      hideWatched,
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
      tmdbKey
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
    configs[token].hiddenCatalogs = Array.isArray(hiddenCatalogs)
      ? hiddenCatalogs
      : (configs[token].hiddenCatalogs || []);

    configs[token].hideWatched =
      hideWatched !== undefined
        ? !!hideWatched
        : (configs[token].hideWatched || false);

    if (streamFormat !== undefined) {
      configs[token].streamFormat = sanitizeStreamFormat(streamFormat);
    }

    configs[token].updatedAt = new Date().toISOString();

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

    res.json({ token });
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
      maxRating: config.maxRating || null,
      excludeLanguages: config.excludeLanguages || [],
      betterPostersStyle: config.betterPostersStyle || null,
      streamAddons: config.streamAddons || [],
      customCatalogs: config.customCatalogs || [],
      customMdbLists: config.customMdbLists || [],
      catalogOverrides: config.catalogOverrides || {},
      googleAiKey: config.googleAiKey || null,
      enableAiRecommended: !!config.enableAiRecommended,
      includeAdult: !!config.includeAdult,
      hiddenCatalogs: config.hiddenCatalogs || [],
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
      config.profiles[profileId] = {
        name: cleanName,
        overrides: sanitiseProfileOverrides(overrides),
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      if (e instanceof ProfileOverridesTooLargeError) return res.status(400).json({ error: e.message });
      throw e;
    }

    saveConfigs(configs);

    res.json({
      id: profileId,
      name: config.profiles[profileId].name,
      overrides: config.profiles[profileId].overrides
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
        config.profiles[profileId].overrides = sanitiseProfileOverrides(overrides);
      } catch (e) {
        if (e instanceof ProfileOverridesTooLargeError) return res.status(400).json({ error: e.message });
        throw e;
      }
    }

    config.profiles[profileId].updatedAt = new Date().toISOString();
    saveConfigs(configs);

    res.json({
      id: profileId,
      name: config.profiles[profileId].name,
      overrides: config.profiles[profileId].overrides
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
  registerConfigRoutes
};
