"use strict";

const MAX_MERGED_SOURCES = 8;
const MERGED_ID_RE = /^merged_[a-f0-9]{8,32}$/;
const VALID_TYPES = new Set(["movie", "series", "mixed"]);
const VALID_BLENDS = new Set(["interleave", "sequential"]);
const MERGED_PAGE_SIZE = 20;
const MAX_MERGED_WINDOW = 400;

class MergedCatalogValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "MergedCatalogValidationError";
    this.statusCode = 400;
  }
}

function customSourceDefinitions(config) {
  const definitions = new Map();
  const candidates = [
    ...(Array.isArray(config?.customCatalogs) ? config.customCatalogs : []),
    ...(Array.isArray(config?.customMdbLists) ? config.customMdbLists : [])
  ];

  for (const item of candidates) {
    if (!item || item.enabled === false || !item.id) continue;
    if (item.type !== "movie" && item.type !== "series") continue;
    definitions.set(String(item.id), { type: item.type, handler: "custom" });
  }
  return definitions;
}

function buildAuthoritativeSourceMap(config, catalogDefs, resolveCatalogId) {
  const sources = customSourceDefinitions(config);
  for (const [rawId, def] of Object.entries(catalogDefs || {})) {
    if (!def || (def.type !== "movie" && def.type !== "series")) continue;
    const id = resolveCatalogId ? resolveCatalogId(rawId) : rawId;
    sources.set(id, def);
  }
  return sources;
}

function validateMergedCatalogs(value, options = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new MergedCatalogValidationError("mergedCatalogs must be an array");
  }

  const {
    config = {},
    catalogDefs = {},
    resolveCatalogId = id => id
  } = options;
  const authoritative = buildAuthoritativeSourceMap(
    { ...config, mergedCatalogs: value },
    catalogDefs,
    resolveCatalogId
  );
  const seenIds = new Set();

  return value.map((definition, index) => {
    const label = `Merged catalog ${index + 1}`;
    if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
      throw new MergedCatalogValidationError(`${label} must be an object`);
    }

    const id = String(definition.id || "");
    if (!MERGED_ID_RE.test(id)) {
      throw new MergedCatalogValidationError(
        `${label} has an invalid id; expected merged_ followed by 8-32 lowercase hex characters`
      );
    }
    if (seenIds.has(id)) {
      throw new MergedCatalogValidationError(`Duplicate merged catalog id: ${id}`);
    }
    seenIds.add(id);

    const name = String(definition.name || "").trim();
    if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      throw new MergedCatalogValidationError(`${label} has an invalid name`);
    }

    const type = String(definition.type || "");
    if (!VALID_TYPES.has(type)) {
      throw new MergedCatalogValidationError(`${label} has an invalid type`);
    }
    const blend = String(definition.blend || "");
    if (!VALID_BLENDS.has(blend)) {
      throw new MergedCatalogValidationError(`${label} has an invalid blend`);
    }
    if (!Array.isArray(definition.sources) || definition.sources.length === 0) {
      throw new MergedCatalogValidationError(`${label} requires at least one source`);
    }
    if (definition.sources.length > MAX_MERGED_SOURCES) {
      throw new MergedCatalogValidationError(
        `${label} exceeds the ${MAX_MERGED_SOURCES}-source limit`
      );
    }

    const seenSources = new Set();
    const sources = definition.sources.map((source, sourceIndex) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new MergedCatalogValidationError(
          `${label} source ${sourceIndex + 1} is invalid`
        );
      }
      const rawCatalogId = String(source.catalogId || "");
      const catalogId = resolveCatalogId(rawCatalogId);
      if (!catalogId) {
        throw new MergedCatalogValidationError(
          `${label} source ${sourceIndex + 1} is missing a catalog id`
        );
      }
      if (catalogId === id || rawCatalogId === id) {
        throw new MergedCatalogValidationError(`${label} cannot reference itself`);
      }
      if (catalogId.startsWith("merged_")) {
        throw new MergedCatalogValidationError(
          `${label} cannot source merged catalog ${catalogId}`
        );
      }
      if (seenSources.has(catalogId)) {
        throw new MergedCatalogValidationError(
          `${label} contains duplicate source ${catalogId}`
        );
      }
      seenSources.add(catalogId);

      const sourceDef = authoritative.get(catalogId);
      if (!sourceDef) {
        throw new MergedCatalogValidationError(
          `${label} contains unresolved source ${catalogId}`
        );
      }
      if (sourceDef.handler === "merged") {
        throw new MergedCatalogValidationError(
          `${label} cannot source merged catalog ${catalogId}`
        );
      }
      const sourceType = sourceDef.type;
      if (type !== "mixed" && sourceType !== type) {
        throw new MergedCatalogValidationError(
          `${label} ${type} definition cannot source ${sourceType} catalog ${catalogId}`
        );
      }
      if (source.type !== undefined && source.type !== sourceType) {
        throw new MergedCatalogValidationError(
          `${label} source type mismatch for ${catalogId}`
        );
      }
      return { catalogId, type: sourceType };
    });

    return { id, name, type, blend, sources };
  });
}

function derivedCatalogIds(definition) {
  if (!definition || !MERGED_ID_RE.test(String(definition.id || ""))) return [];
  if (definition.type === "mixed") {
    const types = new Set((definition.sources || []).map(source => source.type));
    return [
      ...(types.has("movie") ? [`${definition.id}_movies`] : []),
      ...(types.has("series") ? [`${definition.id}_series`] : [])
    ];
  }
  return definition.type === "movie" || definition.type === "series"
    ? [definition.id]
    : [];
}

function buildMergedManifestCatalogs(definitions) {
  const catalogs = [];
  const seen = new Set();
  for (const definition of Array.isArray(definitions) ? definitions : []) {
    for (const id of derivedCatalogIds(definition)) {
      const type = id.endsWith("_movies")
        ? "movie"
        : id.endsWith("_series")
          ? "series"
          : definition.type;
      const key = `${type}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      catalogs.push({
        id,
        type,
        name: definition.name,
        extra: [{ name: "skip", isRequired: false }]
      });
    }
  }
  return catalogs;
}

function resolveMergedCatalogRoute(catalogId, type, definitions) {
  for (const definition of Array.isArray(definitions) ? definitions : []) {
    if (definition.type === "mixed") {
      if (catalogId === `${definition.id}_movies` && type === "movie") {
        return { definition, type: "movie" };
      }
      if (catalogId === `${definition.id}_series` && type === "series") {
        return { definition, type: "series" };
      }
      continue;
    }
    if (catalogId === definition.id && type === definition.type) {
      return { definition, type: definition.type };
    }
  }
  return null;
}

function metaDeduplicationKey(meta, type) {
  if (!meta || typeof meta !== "object") return null;
  const mediaType = type || meta.type || "unknown";
  const ids = [
    meta.imdb_id,
    meta.imdbId,
    /^tt\d+$/i.test(String(meta.id || "")) ? meta.id : null
  ].filter(Boolean);
  if (ids.length) return `imdb:${String(ids[0]).toLowerCase()}:${mediaType}`;

  const tmdbId =
    meta.tmdb_id ||
    meta.tmdbId ||
    (/^tmdb:\d+$/i.test(String(meta.id || ""))
      ? String(meta.id).split(":")[1]
      : null);
  if (tmdbId) return `tmdb:${tmdbId}:${mediaType}`;
  if (meta.id !== undefined && meta.id !== null && String(meta.id)) {
    return `meta:${String(meta.id)}:${mediaType}`;
  }
  return null;
}

function blendSourceLists(sourceLists, blend) {
  if (blend === "sequential") return sourceLists.flat();
  const output = [];
  const longest = sourceLists.reduce(
    (maximum, list) => Math.max(maximum, list.length),
    0
  );
  for (let index = 0; index < longest; index += 1) {
    for (const list of sourceLists) {
      if (index < list.length) output.push(list[index]);
    }
  }
  return output;
}

function deduplicateMetas(metas, type) {
  const seen = new Set();
  return metas.filter(meta => {
    const key = metaDeduplicationKey(meta, type);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function executeMergedCatalog(options) {
  const {
    definition,
    type,
    skip = 0,
    pageSize = MERGED_PAGE_SIZE,
    maxWindow = MAX_MERGED_WINDOW,
    fetchSource
  } = options;
  const safeSkip = Math.max(0, Number.parseInt(skip, 10) || 0);
  const target = Math.min(safeSkip + pageSize, maxWindow);
  const sources = (definition.sources || []).filter(source => source.type === type);
  if (!sources.length || safeSkip >= maxWindow) {
    return { metas: [], behaviorHints: { mergedWindowExhausted: safeSkip >= maxWindow } };
  }

  const settled = await Promise.allSettled(sources.map(async source => {
    const metas = [];
    for (let offset = 0; offset < target && metas.length < target; offset += pageSize) {
      let result;
      try {
        result = await fetchSource(source, offset, pageSize);
      } catch (error) {
        if (offset === 0) throw error;
        break;
      }
      const batch = Array.isArray(result?.metas) ? result.metas : [];
      if (!batch.length) break;
      metas.push(...batch);
      if (batch.length < pageSize) break;
    }
    return metas.slice(0, target);
  }));

  const lists = settled.map(result => (
    result.status === "fulfilled" ? result.value : []
  ));
  const blended = blendSourceLists(lists, definition.blend);
  const unique = deduplicateMetas(blended, type);
  return {
    metas: unique.slice(safeSkip, safeSkip + pageSize),
    behaviorHints: {
      mergedWindowExhausted: safeSkip + pageSize > maxWindow,
      failedSources: settled.filter(result => result.status === "rejected").length
    }
  };
}

module.exports = {
  MAX_MERGED_SOURCES,
  MERGED_PAGE_SIZE,
  MAX_MERGED_WINDOW,
  MERGED_ID_RE,
  MergedCatalogValidationError,
  buildAuthoritativeSourceMap,
  validateMergedCatalogs,
  derivedCatalogIds,
  buildMergedManifestCatalogs,
  resolveMergedCatalogRoute,
  metaDeduplicationKey,
  blendSourceLists,
  deduplicateMetas,
  executeMergedCatalog
};
