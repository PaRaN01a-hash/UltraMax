"use strict";
const fs = require("fs");
const path = require("path");
const { CATALOG_DEFS, resolveCatalogId } = require("../catalogs/catalog-defs");

const ARTWORK_ROOT = path.resolve(process.env.ULTRAMAX_ARTWORK_ROOT || "/home/ubuntu/images");
const ULTRAMAX_ARTWORK_HOSTS = new Set(["ultramax.vip", "ultramax.vip"]);
const DEFAULT_ARTWORK_MIGRATIONS = new Map([
  ["/images/documentaries/true-crime-cover.jpg", "/images/documentaries/true-crime.png"],
  ["/images/documentaries/true-crime-focus.jpg", "/images/documentaries/true-crime.png"],
  ["/images/documentaries/true-crime-hero.jpg", "/images/documentaries/true-crime.png"]
]);

function versionUltraMaxArtworkUrl(value) {
  if (typeof value !== "string" || !value.trim()) return value;
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!ULTRAMAX_ARTWORK_HOSTS.has(url.hostname)) return value;

  let pathname = DEFAULT_ARTWORK_MIGRATIONS.get(url.pathname) || url.pathname;
  if (!pathname.startsWith("/images/")) return value;

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname.slice("/images/".length));
  } catch {
    return value;
  }
  const fullPath = path.resolve(ARTWORK_ROOT, relativePath);
  if (fullPath !== ARTWORK_ROOT && !fullPath.startsWith(ARTWORK_ROOT + path.sep)) return value;

  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return value;
    url.pathname = pathname;
    url.searchParams.set("umv", String(Math.trunc(stat.mtimeMs)));
    return url.toString();
  } catch {
    return value;
  }
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
      ...(def && (def.type === "movie" || def.type === "series" || def.type === "tv") ? { type: def.type } : {})
    };
  };
  return collections.map(collection => ({
    ...collection,
    folders: Array.isArray(collection?.folders)
      ? collection.folders.map(folder => ({
          ...folder,
          ...(folder?.coverImageUrl !== undefined ? { coverImageUrl: versionUltraMaxArtworkUrl(folder.coverImageUrl) } : {}),
          ...(folder?.focusGifUrl !== undefined ? { focusGifUrl: versionUltraMaxArtworkUrl(folder.focusGifUrl) } : {}),
          ...(folder?.heroBackdropUrl !== undefined ? { heroBackdropUrl: versionUltraMaxArtworkUrl(folder.heroBackdropUrl) } : {}),
          rows: Array.isArray(folder?.rows)
            ? [...new Set(folder.rows.map(id => resolveCatalogId(String(id))))]
            : folder?.rows,
          sources: Array.isArray(folder?.sources) ? folder.sources.map(normalizeSource) : folder?.sources,
          catalogSources: Array.isArray(folder?.catalogSources) ? folder.catalogSources.map(normalizeSource) : folder?.catalogSources
        }))
      : collection?.folders
  }));
}
module.exports = { normalizeCollectionCatalogs, versionUltraMaxArtworkUrl };
