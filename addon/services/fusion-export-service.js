"use strict";

// Fusion is a read-only export ADAPTER. This module never mutates Ultra MAX
// collections/catalogues — it only translates an already-resolved config's
// `collections` into the Fusion "fusionWidgets" wire format confirmed by the
// Ultra MAX x Fusion audit (real user export + the open-source Fusion Widget
// Manager serializer). Nothing here invents schema fields: exportType,
// exportVersion, widgets[], collection.row, dataSource.kind "addonCatalog",
// payload.{addonId,catalogId,type}, imageAspect, imageURL are all fields
// observed directly in that audit.
//
// Ultra MAX collection -> Fusion widget (type "collection.row")
// Ultra MAX folder     -> Fusion tile (CollectionItem)
// folder.catalogSources -> tile.dataSources[] (kind "addonCatalog")

const { resolveCatalogId, CATALOG_DEFS } = require("../catalogs/catalog-defs");
const { derivedCatalogIds, buildMergedManifestCatalogs } = require("./merged-catalog-service");

const FUSION_EXPORT_TYPE = "fusionWidgets";
const FUSION_EXPORT_VERSION = 1;

// Isolated on purpose (per the approved architecture) so the remap can
// change later without touching resolution/serialization logic.
const TILE_SHAPE_TO_FUSION_ASPECT = {
  LANDSCAPE: "wide",
  PORTRAIT: "poster",
  POSTER: "poster",
  SQUARE: "square"
};
const DEFAULT_FUSION_ASPECT = "wide";

function mapFusionImageAspect(tileShape) {
  const key = String(tileShape || "").trim().toUpperCase();
  return TILE_SHAPE_TO_FUSION_ASPECT[key] || DEFAULT_FUSION_ASPECT;
}

// Image priority per the approved spec: coverImageUrl > focusGifUrl >
// heroBackdropUrl > omitted (Fusion's imageURL is optional).
function selectFusionImage(folder) {
  if (!folder || typeof folder !== "object") return "";
  const candidates = [folder.coverImageUrl, folder.focusGifUrl, folder.heroBackdropUrl];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

// Builds environment-correct manifest URLs from a caller-supplied base
// origin (derived from the live request, never a hardcoded domain) so dev,
// self-host and production each embed their own correct manifest URL.
function buildFusionManifestUrl(baseUrl, token, profileId) {
  const origin = String(baseUrl || "").replace(/\/+$/, "");
  const tokenPath = encodeURIComponent(token);
  return profileId
    ? `${origin}/c/${tokenPath}/p/${encodeURIComponent(profileId)}/manifest.json`
    : `${origin}/c/${tokenPath}/manifest.json`;
}

// Lookup tables built once per export so every folder/source resolves
// against the same authoritative snapshot of this config's catalogue
// universe (built-in defs, custom catalogs/lists, merged catalogs).
function buildResolutionContext(config) {
  const mergedCatalogs = Array.isArray(config?.mergedCatalogs) ? config.mergedCatalogs : [];
  const mergedById = new Map(mergedCatalogs.filter(def => def && def.id).map(def => [def.id, def]));
  const mergedDerivedTypeById = new Map(
    buildMergedManifestCatalogs(mergedCatalogs).map(entry => [entry.id, entry.type])
  );

  const customTypeById = new Map();
  const customCatalogs = Array.isArray(config?.customCatalogs) ? config.customCatalogs : [];
  for (const item of customCatalogs) {
    if (item && item.id && (item.type === "movie" || item.type === "series")) {
      customTypeById.set(String(item.id), item.type);
    }
  }
  const customMdbLists = Array.isArray(config?.customMdbLists) ? config.customMdbLists : [];
  for (const item of customMdbLists) {
    if (item && item.id && item.enabled !== false && (item.type === "movie" || item.type === "series")) {
      customTypeById.set(String(item.id), item.type);
    }
  }
  const customTraktLists = Array.isArray(config?.customTraktLists) ? config.customTraktLists : [];
  for (const item of customTraktLists) {
    if (item && item.id && item.enabled !== false && (item.type === "movie" || item.type === "series")) {
      customTypeById.set(String(item.id), item.type);
    }
  }

  return { mergedById, mergedDerivedTypeById, customTypeById };
}

// Canonicalises one stored catalogId into 0-2 authoritative
// { catalogId, type } references:
//  - normal built-in/custom/mdb catalogue -> exactly one reference
//  - merged catalogue (movie- or series-only) -> its own live id, one reference
//  - merged catalogue (mixed) -> both derived ids (<id>_movies, <id>_series)
//  - already-derived merged id (<id>_movies/_series) -> passthrough, not re-expanded
//  - unresolved -> empty array (caller records a warning and skips)
function resolveCatalogReferences(rawCatalogId, context) {
  const canonicalId = resolveCatalogId(String(rawCatalogId || "").trim());
  if (!canonicalId) return [];

  const mergedDef = context.mergedById.get(canonicalId);
  if (mergedDef) {
    // Ultra MAX remains responsible for interleaving/dedup/pagination —
    // Fusion never receives the merged definition itself, only the real,
    // independently-fetchable derived catalogue id(s) it resolves to.
    return derivedCatalogIds(mergedDef).map(id => ({
      catalogId: id,
      type: id.endsWith("_movies") ? "movie" : id.endsWith("_series") ? "series" : mergedDef.type
    }));
  }

  if (context.mergedDerivedTypeById.has(canonicalId)) {
    return [{ catalogId: canonicalId, type: context.mergedDerivedTypeById.get(canonicalId) }];
  }

  if (context.customTypeById.has(canonicalId)) {
    return [{ catalogId: canonicalId, type: context.customTypeById.get(canonicalId) }];
  }

  const def = CATALOG_DEFS[canonicalId];
  if (def && (def.type === "movie" || def.type === "series")) {
    return [{ catalogId: canonicalId, type: def.type }];
  }

  return [];
}

// Resolves one folder's catalogue sources into Fusion dataSources.
// Accepts either the current `catalogSources` shape or falls back to the
// legacy `sources` array — never both, matching how the fields are used
// interchangeably elsewhere in Ultra MAX. Never copies a stored addonId.
function resolveFusionDataSources(folder, context, manifestUrl) {
  const warnings = [];
  const folderLabel = String(folder?.title || folder?.id || "Untitled folder");
  const rawSources = Array.isArray(folder?.catalogSources) && folder.catalogSources.length
    ? folder.catalogSources
    : (Array.isArray(folder?.sources) ? folder.sources : []);

  const dataSources = [];
  const seen = new Set();
  let skippedSources = 0;

  rawSources.forEach((source, index) => {
    const rawCatalogId = source && typeof source === "object" ? source.catalogId : null;
    if (!rawCatalogId) {
      warnings.push(`Skipped source ${index + 1} in "${folderLabel}": missing catalogId.`);
      skippedSources += 1;
      return;
    }

    const resolved = resolveCatalogReferences(rawCatalogId, context);
    if (!resolved.length) {
      warnings.push(`Skipped source "${rawCatalogId}" in "${folderLabel}": could not resolve a valid movie/series catalogue.`);
      skippedSources += 1;
      return;
    }

    for (const entry of resolved) {
      const key = `${entry.type}::${entry.catalogId}`;
      if (seen.has(key)) continue; // duplicate removal within this tile — silent, not an error
      seen.add(key);
      dataSources.push({
        kind: "addonCatalog",
        payload: {
          addonId: manifestUrl,
          catalogId: `${entry.type}::${entry.catalogId}`,
          type: entry.type
        }
      });
    }
  });

  return { dataSources, warnings, skippedSources };
}

function buildFusionTile(folder, folderIndex, context, manifestUrl) {
  const { dataSources, warnings, skippedSources } = resolveFusionDataSources(folder, context, manifestUrl);

  const tile = {
    id: String(folder?.id || `folder-${folderIndex}`),
    title: String(folder?.title || "Untitled"),
    hideTitle: !!folder?.hideTitle,
    imageAspect: mapFusionImageAspect(folder?.tileShape),
    dataSources
  };
  const image = selectFusionImage(folder);
  if (image) tile.imageURL = image;

  return { tile, warnings, skippedSources };
}

// Ultra MAX collection -> one Fusion "collection.row" widget.
// Empty tiles (zero resolvable sources) and empty widgets (zero resolvable
// tiles) are dropped with a warning rather than exported broken — mirrors
// the reference Fusion tooling's default "skip invalid" export behaviour.
function buildFusionWidget(collection, collectionIndex, context, manifestUrl) {
  const collectionLabel = String(collection?.title || collection?.id || `Collection ${collectionIndex + 1}`);
  const folders = Array.isArray(collection?.folders) ? collection.folders : [];

  const warnings = [];
  let skippedSources = 0;
  const items = [];

  folders.forEach((folder, folderIndex) => {
    const { tile, warnings: tileWarnings, skippedSources: tileSkipped } =
      buildFusionTile(folder, folderIndex, context, manifestUrl);
    warnings.push(...tileWarnings);
    skippedSources += tileSkipped;

    if (!tile.dataSources.length) {
      warnings.push(`Skipped tile "${tile.title}" in "${collectionLabel}": no resolvable catalogue sources.`);
      return;
    }
    items.push(tile);
  });

  const widget = {
    id: `collection.${String(collection?.id || `collection-${collectionIndex}`)}`,
    title: collectionLabel,
    type: "collection.row",
    dataSource: {
      kind: "collection",
      payload: { items }
    }
  };

  if (!items.length) {
    warnings.push(`Skipped widget "${collectionLabel}": no resolvable tiles.`);
  }

  return { widget, warnings, skippedSources, tileCount: items.length };
}

// Main entry point. `config` must already be the profile-resolved config
// (see utils/profiles.js resolveConfigForProfile) — this module has no
// knowledge of tokens, profiles or the on-disk config store by design.
function buildFusionWidgetsPayload(config, options = {}) {
  const { manifestUrl } = options;
  if (!manifestUrl) throw new Error("buildFusionWidgetsPayload requires options.manifestUrl");

  const context = buildResolutionContext(config || {});
  const collections = Array.isArray(config?.collections) ? config.collections : [];

  const warnings = [];
  const widgets = [];
  let tileCount = 0;
  let dataSourceCount = 0;
  let skippedSources = 0;

  collections.forEach((collection, index) => {
    const { widget, warnings: widgetWarnings, skippedSources: widgetSkipped, tileCount: widgetTileCount } =
      buildFusionWidget(collection, index, context, manifestUrl);
    warnings.push(...widgetWarnings);
    skippedSources += widgetSkipped;

    if (!widgetTileCount) return; // widget already logged as skipped above

    tileCount += widgetTileCount;
    widget.dataSource.payload.items.forEach(tile => { dataSourceCount += tile.dataSources.length; });
    widgets.push(widget);
  });

  const payload = {
    exportType: FUSION_EXPORT_TYPE,
    exportVersion: FUSION_EXPORT_VERSION,
    requiredAddons: widgets.length ? [manifestUrl] : [],
    widgets
  };

  const summary = {
    widgets: widgets.length,
    tiles: tileCount,
    dataSources: dataSourceCount,
    skippedSources,
    warnings
  };

  return { payload, summary };
}

module.exports = {
  FUSION_EXPORT_TYPE,
  FUSION_EXPORT_VERSION,
  mapFusionImageAspect,
  selectFusionImage,
  buildFusionManifestUrl,
  resolveFusionDataSources,
  buildFusionWidgetsPayload
};
