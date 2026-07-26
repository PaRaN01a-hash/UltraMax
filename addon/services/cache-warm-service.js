// Warms fetchCached's in-memory cache (services/api-helpers.js) for a
// user's own top catalog rows right after they generate their setup, so the
// first real request their Stremio/Nuvio client makes after install lands
// on a warm cache instead of a cold TMDB/MDBList round-trip.

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
  const { handleCatalogService, catalogDeps, FILTER_ENABLED, MDBLIST_KEY } = deps;
  const type = resolveCatalogType(id, config, deps);

  const hasAnime = (config.catalogs || []).some(c =>
    c.includes('anime') || c.includes('bollywood') || c.includes('crunchyroll') || c.includes('hidive')
  );

  try {
    await handleCatalogService(
      id,
      type,
      {},
      config.mdblistKey || MDBLIST_KEY,
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
    );
  } catch (e) {
    console.warn('[cache-warm]', token.slice(0, 8), id, e.message);
  }
}

function registerCacheWarmRoute(app, deps) {
  const { loadConfigs } = deps;

  app.post('/api/warm/:token', (req, res) => {
    const { token } = req.params;
    const configs = loadConfigs();
    const config = configs[token];

    if (!config) return res.status(404).json({ error: 'Token not found' });

    // Respond immediately — warming continues after the response is sent.
    res.json({ ok: true, warming: true });

    const topIds = pickTopCatalogIds(config);
    console.log('[cache-warm]', token.slice(0, 8), 'warming', topIds.length, 'catalogs');

    Promise.all(topIds.map(id => warmCatalog(token, config, id, deps)))
      .then(() => console.log('[cache-warm]', token.slice(0, 8), 'done'))
      .catch(() => {});
  });
}

module.exports = {
  registerCacheWarmRoute,
  pickTopCatalogIds
};
