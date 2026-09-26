"use strict";

const { CATALOG_DEFS, resolveCatalogId } = require("../catalogs/catalog-defs");
const { QUICK_PICK_CATALOGS } = require("../catalogs/quick-picks");
const { buildMergedManifestCatalogs } = require("./merged-catalog-service");

const BASE_VALID_IDS = new Set([
  ...Object.keys(CATALOG_DEFS).map(resolveCatalogId),
  ...QUICK_PICK_CATALOGS.map(item => item.id)
]);

function uniqueCanonicalIds(value) {
  const result = [];
  const seen = new Set();
  for (const raw of Array.isArray(value) ? value : []) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const id = resolveCatalogId(trimmed);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function getValidCatalogIds(config = {}) {
  const valid = new Set(BASE_VALID_IDS);
  for (const field of ["customCatalogs", "customMdbLists", "customTraktLists"]) {
    for (const item of Array.isArray(config[field]) ? config[field] : []) {
      if (item && typeof item.id === "string" && item.id.trim()) valid.add(resolveCatalogId(item.id.trim()));
    }
  }
  for (const item of buildMergedManifestCatalogs(config.mergedCatalogs || [])) {
    if (item && typeof item.id === "string" && item.id) valid.add(item.id);
  }
  return valid;
}

function normalizeCatalogSelection(config = {}) {
  const valid = getValidCatalogIds(config);
  const catalogs = uniqueCanonicalIds(config.catalogs).filter(id => valid.has(id));
  const selected = new Set(catalogs);
  return {
    catalogs,
    hiddenCatalogs: uniqueCanonicalIds(config.hiddenCatalogs).filter(id => selected.has(id)),
    catalogOrder: uniqueCanonicalIds(config.catalogOrder).filter(id => selected.has(id))
  };
}

function applyCatalogSelection(config) {
  if (!config || typeof config !== "object" || !Array.isArray(config.catalogs)) return config;
  Object.assign(config, normalizeCatalogSelection(config));
  return config;
}

function applyProfileCatalogSelection(account, profileId) {
  const profile = account && account.profiles && account.profiles[profileId];
  const overrides = profile && profile.overrides;
  if (!overrides || typeof overrides !== "object") return account;
  const effective = { ...account, ...overrides };
  if (!Array.isArray(effective.catalogs)) return account;
  const normalized = normalizeCatalogSelection(effective);
  if (Array.isArray(overrides.catalogs)) {
    overrides.catalogs = normalized.catalogs;
    overrides.hiddenCatalogs = normalized.hiddenCatalogs;
    overrides.catalogOrder = normalized.catalogOrder;
  } else {
    if (Array.isArray(overrides.hiddenCatalogs)) overrides.hiddenCatalogs = normalized.hiddenCatalogs;
    if (Array.isArray(overrides.catalogOrder)) overrides.catalogOrder = normalized.catalogOrder;
  }
  return account;
}

module.exports = {
  uniqueCanonicalIds,
  getValidCatalogIds,
  normalizeCatalogSelection,
  applyCatalogSelection,
  applyProfileCatalogSelection
};
