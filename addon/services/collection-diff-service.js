"use strict";

const {
  ARTWORK_FIELDS,
  canonicalHash,
  stableStringify,
  validateCollections
} = require("./collection-schema-service");

const REPORT_SCHEMA_VERSION = 1;

function normalizedTitle(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function withoutIds(collection) {
  return {
    ...collection,
    id: "",
    folders: collection.folders.map(folder => ({ ...folder, id: "" }))
  };
}

function structureFingerprint(collection) {
  return canonicalHash({
    folders: collection.folders.map(folder => ({
      sources: folder.sources,
      catalogSources: folder.catalogSources
    }))
  });
}

function sourceKey(source) {
  return stableStringify(source);
}

function multiset(values) {
  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return counts;
}

function sameMultiset(left, right) {
  if (left.length !== right.length) return false;
  const counts = multiset(left);
  for (const value of right) {
    const count = counts.get(value) || 0;
    if (!count) return false;
    if (count === 1) counts.delete(value);
    else counts.set(value, count - 1);
  }
  return counts.size === 0;
}

function sourceDifferences(path, localSources, remoteSources) {
  const localKeys = localSources.map(sourceKey);
  const remoteKeys = remoteSources.map(sourceKey);
  const localCounts = multiset(localKeys);
  const remoteCounts = multiset(remoteKeys);
  const added = [];
  const removed = [];

  localSources.forEach((source, index) => {
    const key = localKeys[index];
    if ((remoteCounts.get(key) || 0) > 0) remoteCounts.set(key, remoteCounts.get(key) - 1);
    else added.push(source);
  });
  remoteSources.forEach((source, index) => {
    const key = remoteKeys[index];
    if ((localCounts.get(key) || 0) > 0) localCounts.set(key, localCounts.get(key) - 1);
    else removed.push(source);
  });

  const differences = [];
  if (added.length) {
    differences.push({
      path: `${path}.added`,
      kind: "sources-added",
      count: added.length,
      sources: added
    });
  }
  if (removed.length) {
    differences.push({
      path: `${path}.removed`,
      kind: "sources-removed",
      count: removed.length,
      sources: removed
    });
  }
  if (!added.length && !removed.length && !localKeys.every((key, index) => key === remoteKeys[index])) {
    differences.push({
      path: `${path}.order`,
      kind: "source-order-changed",
      localOrder: localSources.map(source => source.catalogId || sourceKey(source)),
      remoteOrder: remoteSources.map(source => source.catalogId || sourceKey(source))
    });
  }
  return differences;
}

function folderDifferences(localCollection, remoteCollection) {
  const differences = [];
  const localById = new Map(localCollection.folders.map((folder, index) => [folder.id, { folder, index }]));
  const remoteById = new Map(remoteCollection.folders.map((folder, index) => [folder.id, { folder, index }]));

  localById.forEach(({ folder, index }, id) => {
    const remote = remoteById.get(id);
    if (!remote) {
      differences.push({
        path: `folders.${id}`,
        kind: "folder-added-locally",
        local: { id: folder.id, title: folder.title, index }
      });
      return;
    }
    const remoteFolder = remote.folder;
    if (folder.title !== remoteFolder.title) {
      differences.push({ path: `folders.${id}.title`, kind: "folder-renamed", local: folder.title, remote: remoteFolder.title });
    }
    if (index !== remote.index) {
      differences.push({ path: `folders.${id}.order`, kind: "folder-reordered", local: index, remote: remote.index });
    }
    for (const field of ARTWORK_FIELDS) {
      if (folder[field] !== remoteFolder[field]) {
        differences.push({
          path: `folders.${id}.${field}`,
          kind: "artwork-changed",
          field,
          local: folder[field],
          remote: remoteFolder[field]
        });
      }
    }
    if (folder.tileShape !== remoteFolder.tileShape) {
      differences.push({ path: `folders.${id}.tileShape`, kind: "tile-shape-changed", local: folder.tileShape, remote: remoteFolder.tileShape });
    }
    if (folder.hideTitle !== remoteFolder.hideTitle) {
      differences.push({ path: `folders.${id}.hideTitle`, kind: "flag-changed", local: folder.hideTitle, remote: remoteFolder.hideTitle });
    }
    differences.push(...sourceDifferences(`folders.${id}.sources`, folder.sources, remoteFolder.sources));
    differences.push(...sourceDifferences(`folders.${id}.catalogSources`, folder.catalogSources, remoteFolder.catalogSources));
  });

  remoteById.forEach(({ folder, index }, id) => {
    if (!localById.has(id)) {
      differences.push({
        path: `folders.${id}`,
        kind: "folder-only-in-nuvio",
        remote: { id: folder.id, title: folder.title, index }
      });
    }
  });
  return differences;
}

function changedCollection(local, remote, localIndex, remoteIndex) {
  const differences = [];
  if (local.title !== remote.title) {
    differences.push({ path: "title", kind: "collection-title-changed", local: local.title, remote: remote.title });
  }
  if (localIndex !== remoteIndex) {
    differences.push({ path: "collectionOrder", kind: "collection-reordered", local: localIndex, remote: remoteIndex });
  }
  for (const field of ["pinToTop", "viewMode", "showAllTab", "focusGlowEnabled"]) {
    if (local[field] !== remote[field]) {
      differences.push({ path: field, kind: "flag-changed", local: local[field], remote: remote[field] });
    }
  }
  differences.push(...folderDifferences(local, remote));
  return differences;
}

function duplicateReason(local, remote) {
  if (stableStringify(withoutIds(local)) === stableStringify(withoutIds(remote))) {
    return "Exact content match excluding collection and folder IDs.";
  }
  const sameStructure = structureFingerprint(local) === structureFingerprint(remote);
  const localSourceCount = local.folders.reduce(
    (total, folder) => total + folder.sources.length + folder.catalogSources.length,
    0
  );
  const remoteSourceCount = remote.folders.reduce(
    (total, folder) => total + folder.sources.length + folder.catalogSources.length,
    0
  );
  if (normalizedTitle(local.title) && normalizedTitle(local.title) === normalizedTitle(remote.title) && sameStructure) {
    return "Same normalized title and matching folder/source structure, but different IDs.";
  }
  if (sameStructure && localSourceCount > 0 && remoteSourceCount > 0) {
    return "Matching catalogue-source fingerprint, but different IDs.";
  }
  return "";
}

function invalidItem(side, rawCollection, entry) {
  return {
    classification: entry.collision ? "ID Collision" : "Invalid",
    side,
    id: entry.id || null,
    title:
      rawCollection && typeof rawCollection === "object" && typeof rawCollection.title === "string"
        ? rawCollection.title
        : "Invalid collection",
    localIndex: side === "local" ? entry.index : null,
    remoteIndex: side === "remote" ? entry.index : null,
    errors: entry.collision
      ? [{ path: `$[${entry.index}].id`, code: "ID_COLLISION", message: "Collection or folder ID is duplicated" }]
      : entry.errors
  };
}

function summarize(items) {
  const summary = {
    exactMatches: 0,
    localOnly: 0,
    nuvioOnly: 0,
    changed: 0,
    possibleDuplicates: 0,
    invalid: 0
  };
  items.forEach(item => {
    if (item.classification === "Exact Match") summary.exactMatches += 1;
    else if (item.classification === "Local Only") summary.localOnly += 1;
    else if (item.classification === "Remote Only") summary.nuvioOnly += 1;
    else if (item.classification === "Changed") summary.changed += 1;
    else if (item.classification === "Possible Duplicate") summary.possibleDuplicates += 1;
    else summary.invalid += 1;
  });
  return summary;
}

function compareCollections(localCollections, remoteCollections, options = {}) {
  const localValidation = validateCollections(localCollections, { side: "local" });
  const remoteValidation = validateCollections(remoteCollections, { side: "remote" });
  const items = [];
  const localValid = [];
  const remoteValid = [];

  localValidation.entries.forEach(entry => {
    if (entry.errors.length || entry.collision) items.push(invalidItem("local", localCollections[entry.index], entry));
    else localValid.push({ entry, collection: entry.canonical, index: entry.index });
  });
  remoteValidation.entries.forEach(entry => {
    if (entry.errors.length || entry.collision) items.push(invalidItem("remote", remoteCollections[entry.index], entry));
    else remoteValid.push({ entry, collection: entry.canonical, index: entry.index });
  });

  const remoteById = new Map(remoteValid.map(item => [item.collection.id, item]));
  const matchedRemote = new Set();
  const unmatchedLocal = [];
  const unmatchedRemote = [];

  localValid.forEach(localItem => {
    const remoteItem = remoteById.get(localItem.collection.id);
    if (!remoteItem) {
      unmatchedLocal.push(localItem);
      return;
    }
    matchedRemote.add(remoteItem.collection.id);
    const differences = changedCollection(
      localItem.collection,
      remoteItem.collection,
      localItem.index,
      remoteItem.index
    );
    items.push({
      classification: differences.length ? "Changed" : "Exact Match",
      id: localItem.collection.id,
      title: localItem.collection.title,
      localIndex: localItem.index,
      remoteIndex: remoteItem.index,
      localHash: canonicalHash(localItem.collection),
      remoteHash: canonicalHash(remoteItem.collection),
      differences,
      local: localItem.collection,
      remote: remoteItem.collection
    });
  });
  remoteValid.forEach(remoteItem => {
    if (!matchedRemote.has(remoteItem.collection.id)) unmatchedRemote.push(remoteItem);
  });

  const usedRemote = new Set();
  unmatchedLocal.forEach(localItem => {
    let match = null;
    let reason = "";
    for (const remoteItem of unmatchedRemote) {
      if (usedRemote.has(remoteItem.index)) continue;
      const candidateReason = duplicateReason(localItem.collection, remoteItem.collection);
      if (candidateReason) {
        match = remoteItem;
        reason = candidateReason;
        break;
      }
    }
    if (match) {
      usedRemote.add(match.index);
      items.push({
        classification: "Possible Duplicate",
        id: localItem.collection.id,
        remoteId: match.collection.id,
        title: localItem.collection.title,
        remoteTitle: match.collection.title,
        localIndex: localItem.index,
        remoteIndex: match.index,
        reason,
        localHash: canonicalHash(localItem.collection),
        remoteHash: canonicalHash(match.collection),
        differences: []
      });
    } else {
      items.push({
        classification: "Local Only",
        id: localItem.collection.id,
        title: localItem.collection.title,
        localIndex: localItem.index,
        remoteIndex: null,
        localHash: canonicalHash(localItem.collection),
        differences: []
      });
    }
  });
  unmatchedRemote.forEach(remoteItem => {
    if (usedRemote.has(remoteItem.index)) return;
    items.push({
      classification: "Remote Only",
      id: remoteItem.collection.id,
      title: remoteItem.collection.title,
      localIndex: null,
      remoteIndex: remoteItem.index,
      remoteHash: canonicalHash(remoteItem.collection),
      differences: []
    });
  });

  items.sort((left, right) => {
    const leftIndex = left.localIndex === null || left.localIndex === undefined ? Number.MAX_SAFE_INTEGER : left.localIndex;
    const rightIndex = right.localIndex === null || right.localIndex === undefined ? Number.MAX_SAFE_INTEGER : right.localIndex;
    return leftIndex - rightIndex || (left.remoteIndex || 0) - (right.remoteIndex || 0);
  });

  const generatedAt = options.generatedAt || new Date().toISOString();
  const reportItems = items.map(item => ({
    classification: item.classification,
    side: item.side || null,
    localHash: item.localHash || null,
    remoteHash: item.remoteHash || null,
    changedFieldPaths: (item.differences || []).map(difference => difference.path),
    possibleDuplicateReason: item.reason || null,
    errorCodes: (item.errors || []).map(error => error.code)
  }));

  return {
    readOnly: true,
    generatedAt,
    profile: {
      ultraMax: String(options.ultraMaxProfileLabel || "Base setup").slice(0, 120),
      nuvio: String(options.nuvioProfileLabel || options.nuvioProfileId || "Selected profile").slice(0, 120),
      nuvioProfileId:
        typeof options.nuvioProfileId === "number" || typeof options.nuvioProfileId === "string"
          ? String(options.nuvioProfileId).slice(0, 128)
          : null
    },
    summary: summarize(items),
    hashes: {
      local: canonicalHash(localValidation.entries.map(entry => entry.canonical)),
      remote: canonicalHash(remoteValidation.entries.map(entry => entry.canonical))
    },
    items,
    report: {
      reportSchemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt,
      ultraMaxProfileLabel: String(options.ultraMaxProfileLabel || "Base setup").slice(0, 120),
      nuvioProfileLabel: String(options.nuvioProfileLabel || "Selected profile").slice(0, 120),
      nuvioProfileId:
        typeof options.nuvioProfileId === "number" || typeof options.nuvioProfileId === "string"
          ? String(options.nuvioProfileId).slice(0, 128)
          : null,
      summary: summarize(items),
      canonicalHashes: {
        local: canonicalHash(localValidation.entries.map(entry => entry.canonical)),
        remote: canonicalHash(remoteValidation.entries.map(entry => entry.canonical))
      },
      classifications: reportItems
    }
  };
}

module.exports = {
  REPORT_SCHEMA_VERSION,
  compareCollections,
  duplicateReason,
  normalizedTitle,
  sourceDifferences
};
