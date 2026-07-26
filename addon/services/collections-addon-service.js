const { CATALOG_DEFS } = require('../catalogs/catalog-defs');
const { handleCatalog } = require('./catalog-handler-service');

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;

// Exclude per-user catalogs and search/related/quick picks
const EXCLUDED_HANDLERS = new Set(['trakt_user_favorites','trakt_user_watchlist','trakt_user_collection','trakt_user_history']);
const EXCLUDED_PREFIXES = ['search_','similar_','recommended_','collection_','quick_','rightnow_','ai_'];
const EXCLUDED_IDS = new Set(['search_movie','search_movies','search_series']);

const COLLECTION_CATALOG_IDS = Object.entries(CATALOG_DEFS)
  .filter(([id, def]) => {
    if (EXCLUDED_IDS.has(id)) return false;
    if (EXCLUDED_PREFIXES.some(p => id.startsWith(p))) return false;
    if (EXCLUDED_HANDLERS.has(def.handler)) return false;
    return true;
  })
  .map(([id]) => id);

const COLLECTIONS_MANIFEST = {
  id: 'com.ultramax.collections',
  version: '1.0.0-dev',
  name: 'Ultra MAX Collections',
  description: '180+ film and TV franchise collections. No setup required.',
  logo: `${BASE_URL}/logo.svg`,
  resources: ['catalog'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'tmdb'],
  catalogs: COLLECTION_CATALOG_IDS.map(id => {
    const def = CATALOG_DEFS[id];
    return {
      type: def.type,
      id: 'uc_' + id,
      name: def.name,
      extra: [
        ...(Array.isArray(def.chronologicalIds)
          ? [{
              name: 'sort',
              options: ['release', 'chronological'],
              isRequired: false
            }]
          : []),
        {
          name: 'skip',
          isRequired: false
        }
      ]
    };
  }),
  behaviorHints: { configurable: false, configurationRequired: false }
};

function registerCollectionsAddon(app, deps) {
  app.get('/collections/manifest.json', (req, res) => {
    res.json(COLLECTIONS_MANIFEST);
  });

  app.get([
    '/collections/catalog/:type/:catalogId.json',
    '/collections/catalog/:type/:catalogId/:extra.json'
  ], async (req, res) => {
    try {
      const { type, catalogId } = req.params;
      const id = catalogId.replace(/^uc_/, '');

      const extra = {};

      if (req.params.extra) {
        const pathExtra = new URLSearchParams(
          String(req.params.extra).replace(/,/g, '&')
        );

        for (const [key, value] of pathExtra.entries()) {
          extra[key] = value;
        }
      }

      for (const [key, value] of Object.entries(req.query || {})) {
        extra[key] = value;
      }

      if (extra.skip !== undefined) {
        const parsedSkip = parseInt(extra.skip, 10);
        extra.skip = Number.isFinite(parsedSkip)
          ? parsedSkip
          : 0;
      }

      console.log(
        '[Collections] type:',
        type,
        'catalogId:',
        catalogId,
        'id:',
        id,
        'extra:',
        extra
      );

      const result = await handleCatalog(
        id, type, extra,
        null, true, 'en-US',
        null, null, null, false, null, false, [],
        null, null, null,
        { ...deps, TRAKT_CLIENT_ID: process.env.TRAKT_CLIENT_ID }
      );

      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json(result);
    } catch(e) {
      console.error('[Collections]', e.message);
      res.json({ metas: [] });
    }
  });
}

module.exports = { registerCollectionsAddon, COLLECTIONS_MANIFEST };
