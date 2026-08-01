"use strict";

// Installation-status system — see setup.html's "Installation status" card.
//
// This module never looks at raw user config. It only ever normalizes and
// compares the *actual generated manifest object* (the same one served at
// /c/:token/manifest.json), so a change here can never drift from what a
// Stremio/Nuvio client would actually see. Secrets (API keys, tokens,
// passwords) never reach this module because they never appear in a
// manifest object in the first place.

const FINGERPRINT_SCHEMA_VERSION = 1;

function catalogKey(catalog) {
  return catalog.type + "::" + catalog.id;
}

function normalizeResourceName(resource) {
  if (typeof resource === "string") return resource;
  if (resource && typeof resource === "object" && typeof resource.name === "string") {
    return resource.name;
  }
  return null;
}

function normalizeResources(resources) {
  const names = (Array.isArray(resources) ? resources : [])
    .map(normalizeResourceName)
    .filter(Boolean);
  return Array.from(new Set(names)).sort();
}

function normalizeExtra(extra) {
  return (Array.isArray(extra) ? extra : [])
    .map(entry => ({
      name: String((entry && entry.name) || ""),
      isRequired: !!(entry && entry.isRequired)
    }))
    .filter(entry => entry.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function sameExtra(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].isRequired !== b[i].isRequired) return false;
  }
  return true;
}

// The "skip" extra's isRequired is just the Stremio SDK's mechanism for
// "hide this row from Home" — it's always the inverse of showInHome in this
// codebase's manifest builder, never an independent discovery contract.
// Comparing it as a structural field would double-count a plain
// show/hide-in-Home toggle (already tracked as a presentation change via
// showInHome) as a structural "search/extra contract changed" — wrongly
// escalating a refresh-recommended change to reinstall-required.
function structuralExtra(extra) {
  return extra.filter(entry => entry.name !== "skip");
}

// Produces the small, storable "manifest contract fingerprint" described in
// the installation-status design: only fields relevant to whether an
// installed client stays compatible. Posters, filters, API keys, secrets
// and tokens are never part of a manifest object, so they're never part of
// this fingerprint either — nothing to explicitly strip.
function normalizeManifestContract(manifest) {
  const catalogsSource = Array.isArray(manifest && manifest.catalogs) ? manifest.catalogs : [];

  const catalogs = catalogsSource.map((catalog, index) => ({
    type: String((catalog && catalog.type) || ""),
    id: String((catalog && catalog.id) || ""),
    name: String((catalog && catalog.name) || ""),
    showInHome: catalog ? catalog.showInHome !== false : true,
    order: index,
    extra: normalizeExtra(catalog && catalog.extra)
  }));

  return {
    schemaVersion: FINGERPRINT_SCHEMA_VERSION,
    manifestId: String((manifest && manifest.id) || ""),
    resources: normalizeResources(manifest && manifest.resources),
    catalogs
  };
}

function groupTypesById(catalogs) {
  const map = new Map();
  catalogs.forEach(catalog => {
    if (!map.has(catalog.id)) map.set(catalog.id, new Set());
    map.get(catalog.id).add(catalog.type);
  });
  return map;
}

// Structural + presentation diff between two normalized fingerprints.
// Uses Maps/Sets throughout (never nested array scans) so this stays cheap
// even for very large catalog lists.
function compareManifestContracts(previous, next) {
  const prevByKey = new Map(previous.catalogs.map(c => [catalogKey(c), c]));
  const nextByKey = new Map(next.catalogs.map(c => [catalogKey(c), c]));
  const prevTypesById = groupTypesById(previous.catalogs);
  const nextTypesById = groupTypesById(next.catalogs);

  const allIds = new Set([...prevTypesById.keys(), ...nextTypesById.keys()]);

  const catalogsAdded = [];
  const catalogsRemoved = [];
  const catalogsTypeChanged = [];

  allIds.forEach(id => {
    const prevTypes = prevTypesById.get(id);
    const nextTypes = nextTypesById.get(id);

    if (!prevTypes) {
      nextTypes.forEach(type => catalogsAdded.push({ type, id }));
      return;
    }
    if (!nextTypes) {
      prevTypes.forEach(type => catalogsRemoved.push({ type, id }));
      return;
    }

    const sameTypeSet =
      prevTypes.size === nextTypes.size &&
      [...prevTypes].every(type => nextTypes.has(type));

    if (!sameTypeSet) {
      catalogsTypeChanged.push({
        id,
        from: Array.from(prevTypes).sort(),
        to: Array.from(nextTypes).sort()
      });
    }
  });

  // Presentation + extra-contract diffs only apply to catalogs whose
  // type+id identity is unchanged — an added/removed/type-changed catalog
  // is already reported above and shouldn't also show up as "renamed".
  const namesChanged = [];
  const showInHomeChanged = [];
  const catalogsExtraChanged = [];
  const matchedKeys = [];

  nextByKey.forEach((nextCatalog, key) => {
    const prevCatalog = prevByKey.get(key);
    if (!prevCatalog) return;

    matchedKeys.push(key);

    if (prevCatalog.name !== nextCatalog.name) {
      namesChanged.push({ type: nextCatalog.type, id: nextCatalog.id });
    }
    if (prevCatalog.showInHome !== nextCatalog.showInHome) {
      showInHomeChanged.push({ type: nextCatalog.type, id: nextCatalog.id });
    }
    if (!sameExtra(structuralExtra(prevCatalog.extra), structuralExtra(nextCatalog.extra))) {
      catalogsExtraChanged.push({ type: nextCatalog.type, id: nextCatalog.id });
    }
  });

  const matchedKeySet = new Set(matchedKeys);
  const prevOrder = previous.catalogs.map(catalogKey).filter(key => matchedKeySet.has(key));
  const nextOrder = next.catalogs.map(catalogKey).filter(key => matchedKeySet.has(key));
  const orderChanged = prevOrder.join("|") !== nextOrder.join("|");

  const resourcesAdded = next.resources.filter(r => !previous.resources.includes(r));
  const resourcesRemoved = previous.resources.filter(r => !next.resources.includes(r));

  return {
    manifestIdChanged: previous.manifestId !== next.manifestId,
    resourcesAdded,
    resourcesRemoved,
    catalogsAdded,
    catalogsRemoved,
    catalogsTypeChanged,
    catalogsExtraChanged,
    presentation: {
      orderChanged,
      namesChanged,
      showInHomeChanged
    }
  };
}

function hasStructuralChanges(diff) {
  return (
    diff.manifestIdChanged ||
    diff.resourcesAdded.length > 0 ||
    diff.resourcesRemoved.length > 0 ||
    diff.catalogsAdded.length > 0 ||
    diff.catalogsRemoved.length > 0 ||
    diff.catalogsTypeChanged.length > 0 ||
    diff.catalogsExtraChanged.length > 0
  );
}

function hasPresentationChanges(diff) {
  return (
    diff.presentation.orderChanged ||
    diff.presentation.namesChanged.length > 0 ||
    diff.presentation.showInHomeChanged.length > 0
  );
}

// The four installation-status classification levels. `previousFingerprint`
// is the last successfully-persisted fingerprint for this token/profile (or
// undefined/null if none exists yet — legacy configs and never-generated
// setups both fall here, and both correctly resolve to "first-install").
function classifyInstallationStatus(previousFingerprint, nextFingerprint) {
  if (!previousFingerprint) {
    return { status: "first-install", diff: null, reason: "no-previous-fingerprint" };
  }

  // A schema-version mismatch means we can't safely prove the two
  // fingerprints are comparable. Rather than silently assume compatibility
  // (no-reinstall) or discard install history (first-install), we treat
  // this as reinstall-required — the safe default when compatibility can't
  // be verified.
  if (
    previousFingerprint.schemaVersion !== FINGERPRINT_SCHEMA_VERSION ||
    !nextFingerprint ||
    nextFingerprint.schemaVersion !== FINGERPRINT_SCHEMA_VERSION
  ) {
    return { status: "reinstall-required", diff: null, reason: "schema-version-mismatch" };
  }

  const diff = compareManifestContracts(previousFingerprint, nextFingerprint);

  if (hasStructuralChanges(diff)) {
    return { status: "reinstall-required", diff, reason: "structural-change" };
  }
  if (hasPresentationChanges(diff)) {
    return { status: "refresh-recommended", diff, reason: "presentation-change" };
  }
  return { status: "no-reinstall", diff, reason: "unchanged" };
}

const DEFAULT_REASON_LIMIT = 3;

// Turns a diff into a short, ordered, user-friendly reason list (codes +
// counts only — the frontend maps codes to translated copy via umT so this
// module never needs to know about locales). Reasons are capped to `limit`
// (default 3); anything beyond that is folded into `remainingCount` so the
// UI can show "and N more changes" instead of a wall of text.
function summarizeInstallationReasons(diff, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : DEFAULT_REASON_LIMIT;

  if (!diff) {
    return { reasons: [], remainingCount: 0, totalCount: 0 };
  }

  const reasons = [];

  if (diff.manifestIdChanged) reasons.push({ code: "manifestIdChanged" });

  if (diff.resourcesAdded.includes("stream")) reasons.push({ code: "streamsEnabled" });
  if (diff.resourcesRemoved.includes("stream")) reasons.push({ code: "streamsDisabled" });

  const otherResourceChanges =
    diff.resourcesAdded.filter(r => r !== "stream").length +
    diff.resourcesRemoved.filter(r => r !== "stream").length;
  if (otherResourceChanges > 0) {
    reasons.push({ code: "resourcesChanged", count: otherResourceChanges });
  }

  if (diff.catalogsAdded.length) {
    reasons.push({ code: "catalogsAdded", count: diff.catalogsAdded.length });
  }
  if (diff.catalogsRemoved.length) {
    reasons.push({ code: "catalogsRemoved", count: diff.catalogsRemoved.length });
  }
  if (diff.catalogsTypeChanged.length) {
    reasons.push({ code: "catalogTypesChanged", count: diff.catalogsTypeChanged.length });
  }
  if (diff.catalogsExtraChanged.length) {
    reasons.push({ code: "searchContractChanged", count: diff.catalogsExtraChanged.length });
  }

  if (diff.presentation.orderChanged) reasons.push({ code: "homeOrderChanged" });
  if (diff.presentation.showInHomeChanged.length) {
    reasons.push({ code: "homeVisibilityChanged", count: diff.presentation.showInHomeChanged.length });
  }
  if (diff.presentation.namesChanged.length) {
    reasons.push({ code: "catalogNamesChanged", count: diff.presentation.namesChanged.length });
  }

  const totalCount = reasons.length;
  const visibleReasons = reasons.slice(0, limit);
  const remainingCount = Math.max(0, totalCount - visibleReasons.length);

  return { reasons: visibleReasons, remainingCount, totalCount };
}

module.exports = {
  FINGERPRINT_SCHEMA_VERSION,
  normalizeManifestContract,
  compareManifestContracts,
  classifyInstallationStatus,
  summarizeInstallationReasons
};
