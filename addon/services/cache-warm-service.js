// Warms fetchCached's in-memory cache (services/api-helpers.js) for a
// user's own top catalog rows right after they generate their setup, so the
// first real request their Stremio/Nuvio client makes after install lands
// on a warm cache instead of a cold TMDB/MDBList round-trip.
const {
  getProviderCapabilities,
  createEffectiveDiscoveryConfig
} = require("./provider-capability-service");
const { createMetadataService } = require("./metadata-service");

function resolveCatalogType(id, config, deps) {
  const { CATALOG_DEFS, QUICK_PICK_CATALOGS } = deps;

  const def = CATALOG_DEFS[id];
  if (def) return def.type;

  const quick = (QUICK_PICK_CATALOGS || []).find(c => c.id === id);
  if (quick) return quick.type;

  const custom = (config.customCatalogs || []).find(c => c.id === id);
  if (custom) return custom.type || 'movie';

  const customMdb = (config.customMdbLists || []).find(c => c.id === id);
  if (customMdb) return customMdb.type || 'movie';

  const customTrakt = (config.customTraktLists || []).find(c => c.id === id);
  if (customTrakt) return customTrakt.type || 'movie';

  return 'movie';
}

// "Top 20" = the first 20 rows the user will actually see, in the order
// they'll see them: visible (showInHome) rows in their configured order
// first, hidden rows filling any remaining slots.
function pickTopCatalogIds(config, limit = 20) {
  const catalogs = Array.isArray(config.catalogs) ? config.catalogs : [];
  const hiddenSet = new Set(config.hiddenCatalogs || []);

  const orderedIds = (config.catalogOrder && config.catalogOrder.length)
    ? [
        ...config.catalogOrder.filter(id => catalogs.includes(id)),
        ...catalogs.filter(id => !config.catalogOrder.includes(id))
      ]
    : catalogs;

  const visible = orderedIds.filter(id => !hiddenSet.has(id));
  const hidden = orderedIds.filter(id => hiddenSet.has(id));

  return [...visible, ...hidden].slice(0, limit);
}

async function warmCatalog(token, config, id, deps) {
  const { handleCatalogService, catalogDeps, FILTER_ENABLED } = deps;
  const capabilities = getProviderCapabilities(config, {
    serverTmdbKey: catalogDeps.TMDB_KEY
  });
  if (!capabilities.hasAnyDiscoveryProvider || !capabilities.effectiveTmdbKey) return;
  config = createEffectiveDiscoveryConfig(config, {
    catalogDefs: deps.CATALOG_DEFS,
    capabilities
  });
  if (!(config.catalogs || []).includes(id)) return;
  const requestCatalogDeps = {
    ...catalogDeps,
    TMDB_KEY: capabilities.effectiveTmdbKey,
    ...createMetadataService({ tmdbKey: capabilities.effectiveTmdbKey })
  };
  const type = resolveCatalogType(id, config, deps);

  const hasAnime = (config.catalogs || []).some(c =>
    c.includes('anime') || c.includes('bollywood') || c.includes('crunchyroll') || c.includes('hidive')
  );

  try {
    return await handleCatalogService(
      id,
      type,
      {},
      capabilities.effectiveMdbKey,
      hasAnime ? false : FILTER_ENABLED,
      config.language || 'en-US',
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
    );
  } catch (e) {
    console.warn('[cache-warm]', token.slice(0, 8), id, e.message);
    return null;
  }
}

const ULTRAMAX_PICTORIUM_HOSTS = new Set([
  'https://ultramax.vip',
  'https://dev.ultramax.vip'
]);

function hostedPictoriumWarmUrl(posterUrl, origin) {
  if (!posterUrl || !origin) return null;
  try {
    const parsed = new URL(String(posterUrl));
    const hosted =
      ULTRAMAX_PICTORIUM_HOSTS.has(parsed.origin) &&
      parsed.pathname.startsWith('/pictorium/api/poster/');
    if (!hosted) return null;
    const base = String(origin).replace(/\/$/, '');
    return base + parsed.pathname.replace(/^\/pictorium/, '') + parsed.search;
  } catch (_) {
    return null;
  }
}

async function warmFirstCatalogPosters(token, config, deps, options = {}) {
  const perCatalogLimit = Math.max(1, Math.min(Number(options.limit || 12), 20));
  const catalogCount = Math.max(1, Math.min(Number(options.catalogCount || 1), 5));
  const totalLimit = Math.max(
    1,
    Math.min(Number(options.totalLimit || (perCatalogLimit * catalogCount)), 60)
  );
  const concurrency = Math.max(1, Math.min(Number(options.concurrency || 3), 4));
  const origin = options.origin || process.env.PICTORIUM_PREWARM_ORIGIN || null;
  if (!origin || !config?.betterPostersStyle) return { attempted: 0, warmed: 0 };

  const catalogIds = pickTopCatalogIds(config, catalogCount);
  if (!catalogIds.length) return { attempted: 0, warmed: 0 };

  const collected = [];
  for (const catalogId of catalogIds) {
    const result = await warmCatalog(token, config, catalogId, deps);
    const urls = Array.from(new Set(
      (result?.metas || [])
        .map(meta => hostedPictoriumWarmUrl(meta?.poster, origin))
        .filter(Boolean)
    )).slice(0, perCatalogLimit);
    collected.push(...urls);
  }

  const urls = Array.from(new Set(collected)).slice(0, totalLimit);
  if (!urls.length) return { attempted: 0, warmed: 0, catalogIds };

  let cursor = 0;
  let warmed = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (response.ok) warmed++;
      } catch (_) {}
    }
  });
  await Promise.all(workers);
  console.log('[poster-prewarm]', token.slice(0, 8), catalogIds.join(','), `${warmed}/${urls.length}`);
  return { attempted: urls.length, warmed, catalogIds };
}

function registerCacheWarmRoute(app, deps) {
  const { loadConfigs, readConfig = async token => loadConfigs()[token] } = deps;

  app.post('/api/warm/:token', async (req, res) => {
    const { token } = req.params;
    const profileId = req.query.profile || req.body?.profile || null;
    const baseConfig = await readConfig(token, profileId);

    if (!baseConfig) return res.status(404).json({ error: 'Token not found' });
    const config = require("../utils/profiles").resolveConfigForProfile(baseConfig, profileId);

    // Respond immediately — warming continues after the response is sent.
    res.json({ ok: true, warming: true });

    const capabilities = getProviderCapabilities(config, {
      serverTmdbKey: deps.catalogDeps.TMDB_KEY
    });
    const effectiveConfig = createEffectiveDiscoveryConfig(config, {
      catalogDefs: deps.CATALOG_DEFS,
      capabilities
    });
    const topIds = pickTopCatalogIds(effectiveConfig);
    console.log('[cache-warm]', token.slice(0, 8), 'warming', topIds.length, 'catalogs');

    Promise.all(topIds.map(id => warmCatalog(token, config, id, deps)))
      .then(async () => {
        console.log('[cache-warm]', token.slice(0, 8), 'done');
        if (!process.env.PICTORIUM_PREWARM_ORIGIN || !config?.betterPostersStyle) return;
        try {
          const posterWarm = await warmFirstCatalogPosters(token, config, deps, {
            limit: 12,
            catalogCount: 3,
            totalLimit: 36,
            concurrency: 3
          });
          console.log(
            '[poster-prewarm]',
            token.slice(0, 8),
            'setup-warm',
            `${posterWarm.warmed || 0}/${posterWarm.attempted || 0}`
          );
        } catch (error) {
          console.warn('[poster-prewarm] setup-warm failed open:', error.message);
        }
      })
      .catch(() => {});
  });
}

module.exports = {
  registerCacheWarmRoute,
  pickTopCatalogIds,
  warmFirstCatalogPosters,
  hostedPictoriumWarmUrl
};
