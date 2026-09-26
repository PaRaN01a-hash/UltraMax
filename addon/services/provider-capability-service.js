"use strict";

const {
  CATALOG_DEFS,
  resolveCatalogId
} = require("../catalogs/catalog-defs");

const UNSUPPORTED_CUSTOM_SOURCES = new Set([
  "mdblist",
  "imdb"
]);

class DiscoveryProviderValidationError extends Error {
  constructor(message = "At least one discovery provider key is required") {
    super(message);
    this.name = "DiscoveryProviderValidationError";
    this.code = "DISCOVERY_PROVIDER_REQUIRED";
    this.statusCode = 400;
  }
}

function normalizeCredential(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function getProviderCapabilities(config = {}, options = {}) {
  const tmdbKey = normalizeCredential(config.tmdbKey);
  const mdblistKey = normalizeCredential(config.mdblistKey);
  const tvdbKey = normalizeCredential(config.tvdbKey);
  const tvdbPin = normalizeCredential(config.tvdbPin);
  const serverTmdbKey = normalizeCredential(options.serverTmdbKey);
  const hasTmdb = Boolean(tmdbKey);
  const hasMdblist = Boolean(mdblistKey);
  const hasTvdb = Boolean(tvdbKey);

  return Object.freeze({
    hasTmdb,
    hasMdblist,
    hasTvdb,
    hasAnyDiscoveryProvider: hasTmdb || hasMdblist,
    configuredTmdbKey: tmdbKey,
    configuredMdbKey: mdblistKey,
    configuredTvdbKey: tvdbKey,
    configuredTvdbPin: tvdbPin,
    effectiveTmdbKey: tmdbKey || (hasMdblist ? serverTmdbKey : null),
    effectiveMdbKey: hasMdblist ? mdblistKey : null
  });
}

function assertDiscoveryProvider(config) {
  const capabilities = getProviderCapabilities(config);
  if (!capabilities.hasAnyDiscoveryProvider) {
    throw new DiscoveryProviderValidationError();
  }
  return capabilities;
}

// undefined means "preserve" on update; null/empty/whitespace explicitly
// clears the field. Create callers pass an empty base object.
function applyProviderCredentialPatch(baseConfig = {}, patch = {}) {
  const next = { ...baseConfig };
  for (const field of ["tmdbKey", "mdblistKey", "tvdbKey", "tvdbPin"]) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      next[field] = normalizeCredential(patch[field]);
    } else {
      next[field] = normalizeCredential(baseConfig[field]);
    }
  }
  return next;
}

function stripProviderCredentials(value) {
  if (Array.isArray(value)) return value.map(stripProviderCredentials);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["tmdbkey", "mdblistkey", "tvdbkey", "tvdbpin"].includes(String(key).toLowerCase()))
      .map(([key, child]) => [key, stripProviderCredentials(child)])
  );
}

function isMdbCatalogId(rawId, catalogDefs = CATALOG_DEFS) {
  const id = resolveCatalogId(String(rawId || ""));
  return Boolean(catalogDefs[id] && catalogDefs[id].handler === "mdb");
}

function isUnsupportedCustomCatalog(customCatalog) {
  const source = String(customCatalog?.source || "").trim().toLowerCase();
  return UNSUPPORTED_CUSTOM_SOURCES.has(source);
}

function buildCustomMaps(config = {}) {
  const customCatalogs = new Map(
    (Array.isArray(config.customCatalogs) ? config.customCatalogs : [])
      .filter(item => item && item.id)
      .map(item => [String(item.id), item])
  );
  const customMdbLists = new Map(
    (Array.isArray(config.customMdbLists) ? config.customMdbLists : [])
      .filter(item => item && item.id && item.enabled !== false)
      .map(item => [String(item.id), item])
  );
  const customTraktLists = new Map(
    (Array.isArray(config.customTraktLists) ? config.customTraktLists : [])
      .filter(item => item && item.id && item.enabled !== false)
      .map(item => [String(item.id), item])
  );
  return { customCatalogs, customMdbLists, customTraktLists };
}

function sourceIsAvailable(sourceId, config, capabilities, catalogDefs, customMaps) {
  const id = resolveCatalogId(String(sourceId || ""));
  if (!id) return false;
  if (customMaps.customMdbLists.has(id)) return capabilities.hasMdblist;
  if (customMaps.customTraktLists.has(id)) return true;
  if (customMaps.customCatalogs.has(id)) {
    return !isUnsupportedCustomCatalog(customMaps.customCatalogs.get(id));
  }
  return !isMdbCatalogId(id, catalogDefs) || capabilities.hasMdblist;
}

function filterMergedCatalogs(mergedCatalogs, config, options = {}) {
  const catalogDefs = options.catalogDefs || CATALOG_DEFS;
  const capabilities = options.capabilities || getProviderCapabilities(config);
  const customMaps = buildCustomMaps(config);

  return (Array.isArray(mergedCatalogs) ? mergedCatalogs : [])
    .map(definition => {
      if (!definition || typeof definition !== "object") return null;
      const sources = (Array.isArray(definition.sources) ? definition.sources : [])
        .filter(source => source && sourceIsAvailable(
          source.catalogId,
          config,
          capabilities,
          catalogDefs,
          customMaps
        ));
      return sources.length ? { ...definition, sources } : null;
    })
    .filter(Boolean);
}

function buildMergedDerivedIds(mergedCatalogs) {
  const ids = new Set();
  for (const definition of mergedCatalogs) {
    if (!definition?.id) continue;
    if (definition.type === "mixed") {
      const types = new Set((definition.sources || []).map(source => source.type));
      if (types.has("movie")) ids.add(`${definition.id}_movies`);
      if (types.has("series")) ids.add(`${definition.id}_series`);
    } else {
      ids.add(definition.id);
    }
  }
  return ids;
}

function filterCollectionsByCapabilities(collections, config, options = {}) {
  const catalogDefs = options.catalogDefs || CATALOG_DEFS;
  const capabilities = options.capabilities || getProviderCapabilities(config);
  const customMaps = buildCustomMaps(config);
  const effectiveMerged = options.effectiveMergedCatalogs || filterMergedCatalogs(
    config.mergedCatalogs,
    config,
    { catalogDefs, capabilities }
  );
  const mergedIds = buildMergedDerivedIds(effectiveMerged);
  for (const definition of effectiveMerged) mergedIds.add(definition.id);

  const available = rawId => {
    const id = resolveCatalogId(String(rawId || ""));
    if (id.startsWith("merged_")) return mergedIds.has(id);
    return sourceIsAvailable(id, config, capabilities, catalogDefs, customMaps);
  };

  return (Array.isArray(collections) ? collections : []).map(collection => ({
    ...collection,
    folders: (Array.isArray(collection?.folders) ? collection.folders : [])
      .map(folder => {
        const rows = Array.isArray(folder?.rows)
          ? folder.rows.filter(row => available(
              typeof row === "object" ? (row.catalogId || row.id) : row
            ))
          : folder?.rows;
        const sources = Array.isArray(folder?.sources)
          ? folder.sources.filter(source => !source?.catalogId || available(source.catalogId))
          : folder?.sources;
        const catalogSources = Array.isArray(folder?.catalogSources)
          ? folder.catalogSources.filter(source => !source?.catalogId || available(source.catalogId))
          : folder?.catalogSources;
        return { ...folder, rows, sources, catalogSources };
      })
      .filter(folder => {
        const hasRows = Array.isArray(folder.rows) && folder.rows.length > 0;
        const hasSources = Array.isArray(folder.sources) && folder.sources.length > 0;
        const hasCatalogSources = Array.isArray(folder.catalogSources) && folder.catalogSources.length > 0;
        return hasRows || hasSources || hasCatalogSources;
      })
  }));
}

function createEffectiveDiscoveryConfig(config = {}, options = {}) {
  const catalogDefs = options.catalogDefs || CATALOG_DEFS;
  const capabilities = options.capabilities || getProviderCapabilities(config, options);
  const customMaps = buildCustomMaps(config);
  const effectiveMergedCatalogs = filterMergedCatalogs(
    config.mergedCatalogs,
    config,
    { catalogDefs, capabilities }
  );
  const mergedIds = buildMergedDerivedIds(effectiveMergedCatalogs);
  for (const definition of effectiveMergedCatalogs) mergedIds.add(definition.id);

  const available = rawId => {
    const id = resolveCatalogId(String(rawId || ""));
    if (id.startsWith("merged_")) return mergedIds.has(id);
    return sourceIsAvailable(id, config, capabilities, catalogDefs, customMaps);
  };
  const catalogs = (Array.isArray(config.catalogs) ? config.catalogs : [])
    .filter(available);
  const availableIds = new Set(catalogs.map(id => resolveCatalogId(String(id))));
  const customCatalogs = (Array.isArray(config.customCatalogs) ? config.customCatalogs : [])
    .filter(item => item && !isUnsupportedCustomCatalog(item));
  const customMdbLists = capabilities.hasMdblist
    ? (Array.isArray(config.customMdbLists) ? config.customMdbLists : [])
    : [];

  const effective = {
    ...config,
    tmdbKey: capabilities.configuredTmdbKey,
    mdblistKey: capabilities.configuredMdbKey,
    tvdbKey: capabilities.configuredTvdbKey,
    tvdbPin: capabilities.configuredTvdbPin,
    catalogs,
    catalogOrder: (Array.isArray(config.catalogOrder) ? config.catalogOrder : [])
      .filter(id => availableIds.has(resolveCatalogId(String(id)))),
    hiddenCatalogs: (Array.isArray(config.hiddenCatalogs) ? config.hiddenCatalogs : [])
      .filter(id => availableIds.has(resolveCatalogId(String(id)))),
    customCatalogs,
    customMdbLists,
    customTraktLists: (Array.isArray(config.customTraktLists) ? config.customTraktLists : []).filter(item => item && item.enabled !== false),
    mergedCatalogs: effectiveMergedCatalogs
  };

  effective.collections = filterCollectionsByCapabilities(
    config.collections,
    config,
    {
      catalogDefs,
      capabilities,
      effectiveMergedCatalogs
    }
  );

  return effective;
}

module.exports = {
  DiscoveryProviderValidationError,
  normalizeCredential,
  getProviderCapabilities,
  assertDiscoveryProvider,
  applyProviderCredentialPatch,
  stripProviderCredentials,
  isMdbCatalogId,
  isUnsupportedCustomCatalog,
  filterMergedCatalogs,
  filterCollectionsByCapabilities,
  createEffectiveDiscoveryConfig
};
