const { resolveCatalogId } = require("../catalogs/catalog-defs");

function getStaticIds(CATALOG_DEFS, FILTER_ENABLED) {
  return Object.keys(CATALOG_DEFS).filter(id => {
    if (!FILTER_ENABLED) return true;
    return !["crunchyroll","hidive","anime","bollywood"].some(x => id.includes(x));
  });
}


function buildCatalogExtra(def, skipRequired = false) {
  const extra = [];

  if (Array.isArray(def?.chronologicalIds)) {
    extra.push({
      name: "sort",
      options: ["release", "chronological"],
      isRequired: false
    });
  }

  extra.push({
    name: "skip",
    isRequired: skipRequired
  });

  return extra;
}

function buildManifestCatalogs(ids, CATALOG_DEFS) {
  return ids.map(rawId => {
    // Resolve legacy MDBList catalog ids (e.g. "mdb_88328") saved in
    // older user configs to their current human-readable slug.
    const id = resolveCatalogId(rawId);
    const def = CATALOG_DEFS[id];
    if (!def) return null;

    return {
      type: def.type,
      id,
      name: def.name,
      extra: buildCatalogExtra(def, false)
    };
  }).filter(Boolean);
}

function buildCatalogsFromIds(
  selectedIds,
  hiddenIds = [],
  QUICK_PICK_CATALOGS,
  CATALOG_DEFS
) {
  // Resolve legacy MDBList catalog ids (e.g. "mdb_88328") saved in older
  // user configs to their current human-readable slug, so both lists agree
  // on id even if only one of them has been migrated.
  const hiddenSet = new Set((hiddenIds || []).map(resolveCatalogId));

  const quickMap = new Map(
    QUICK_PICK_CATALOGS.map(c => [c.id, c])
  );

  return selectedIds.map(rawId => {
    const id = resolveCatalogId(rawId);
    const quick = quickMap.get(id);

    if (quick) {
      const isHidden = hiddenSet.has(id);
      return {
        type: quick.type,
        id: quick.id,
        name: quick.name,
        showInHome: !isHidden,
        extra: [{ name:"skip", isRequired: isHidden ? true : false }]
      };
    }

    const def = CATALOG_DEFS[id];
    if (!def) return null;

    const isHidden = hiddenSet.has(id);
    return {
      type: def.type,
      id,
      name: def.name,
      showInHome: !isHidden,
      extra: buildCatalogExtra(def, isHidden)
    };
  }).filter(Boolean);
}

module.exports = {
  buildCatalogExtra,
  getStaticIds,
  buildManifestCatalogs,
  buildCatalogsFromIds
};
