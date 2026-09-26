"use strict";

const {
  canonicalCollection,
  canonicalHash,
  validateCollections
} = require("./collection-schema-service");

const THREE_WAY_SCHEMA_VERSION = 1;
const CLASSIFICATIONS = Object.freeze([
  "Unchanged",
  "Local Change Only",
  "Remote Change Only",
  "Same Change",
  "Conflict",
  "Local Addition",
  "Remote Addition",
  "Local Deletion",
  "Remote Deletion",
  "Deleted Both",
  "Identity Collision",
  "Invalid"
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function equal(left, right) {
  const safeLeft = left === undefined ? { __phase4Missing: true } : left;
  const safeRight = right === undefined ? { __phase4Missing: true } : right;
  return canonicalHash(safeLeft) === canonicalHash(safeRight);
}

function mapById(collections) {
  const map = new Map();
  const collisions = new Set();
  collections.forEach((collection, index) => {
    const id = collection && typeof collection.id === "string" ? collection.id : "";
    if (!id || map.has(id)) collisions.add(id || `invalid-${index}`);
    else map.set(id, { collection, index });
  });
  return { map, collisions };
}

function joinPath(path, key, array) {
  return array ? `${path}[${key}]` : path ? `${path}.${key}` : String(key);
}

// Arrays are deliberately positional. Folder/source order is user-visible data,
// and competing moves must be reviewed rather than silently normalized.
function changedPaths(base, current, path = "") {
  if (equal(base, current)) return [];
  if (
    base === null ||
    current === null ||
    typeof base !== "object" ||
    typeof current !== "object" ||
    Array.isArray(base) !== Array.isArray(current)
  ) {
    return [path || "$"];
  }
  const array = Array.isArray(base);
  const keys = array
    ? Array.from({ length: Math.max(base.length, current.length) }, (_, index) => index)
    : Array.from(new Set([...Object.keys(base), ...Object.keys(current)])).sort();
  return keys.flatMap(key => {
    const hasBase = Object.prototype.hasOwnProperty.call(base, key);
    const hasCurrent = Object.prototype.hasOwnProperty.call(current, key);
    const childPath = joinPath(path, key, array);
    if (!hasBase || !hasCurrent) return [childPath];
    return changedPaths(base[key], current[key], childPath);
  });
}

function pathsOverlap(left, right) {
  return (
    left === right ||
    left.startsWith(`${right}.`) ||
    right.startsWith(`${left}.`) ||
    left.startsWith(`${right}[`) ||
    right.startsWith(`${left}[`)
  );
}

function conflictPaths(localPaths, remotePaths, local, remote) {
  const conflicts = [];
  for (const localPath of localPaths) {
    for (const remotePath of remotePaths) {
      if (pathsOverlap(localPath, remotePath)) {
        conflicts.push(localPath.length >= remotePath.length ? localPath : remotePath);
      }
    }
  }
  return Array.from(new Set(conflicts)).filter(path => {
    const localValue = valueAtPath(local, path);
    const remoteValue = valueAtPath(remote, path);
    return !equal(localValue, remoteValue);
  });
}

function pathParts(path) {
  if (!path || path === "$") return [];
  return path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
}

function valueAtPath(value, path) {
  return pathParts(path).reduce(
    (current, part) => (current == null ? undefined : current[part]),
    value
  );
}

function setAtPath(target, path, value) {
  const parts = pathParts(path);
  if (!parts.length) return clone(value);
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const nextKey = parts[index + 1];
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    current = current[key];
  }
  const key = parts[parts.length - 1];
  if (value === undefined) {
    if (Array.isArray(current)) current.splice(Number(key), 1);
    else delete current[key];
  } else {
    current[key] = clone(value);
  }
  return target;
}

function applyPaths(target, source, paths) {
  let result = clone(target);
  // Deletions in arrays are applied from the highest index to avoid shifting.
  const ordered = paths.slice().sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
  for (const path of ordered) result = setAtPath(result, path, valueAtPath(source, path));
  return result;
}

function validateSide(collections, side) {
  const validation = validateCollections(collections, { side });
  return {
    validation,
    invalid: new Set(
      validation.entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.errors.length || entry.collision)
        .map(({ entry, index }) => entry.id || `invalid-${index}`)
    )
  };
}

function classifyPresence(baseLocal, baseRemote, local, remote) {
  const inBase = Boolean(baseLocal || baseRemote);
  if (!inBase) {
    if (local && remote) return equal(canonicalCollection(local), canonicalCollection(remote))
      ? "Same Change"
      : "Conflict";
    return local ? "Local Addition" : "Remote Addition";
  }
  if (!local && !remote) return "Deleted Both";
  if (!local && remote) return "Local Deletion";
  if (local && !remote) return "Remote Deletion";
  return null;
}

function compareThreeWay(input = {}) {
  const {
    baseLocalCollections,
    baseRemoteCollections,
    localCollections,
    remoteCollections
  } = input;
  for (const value of [
    baseLocalCollections,
    baseRemoteCollections,
    localCollections,
    remoteCollections
  ]) {
    if (!Array.isArray(value)) {
      const error = new Error("Base, local, and remote collections must be arrays");
      error.code = "INVALID_COLLECTION_DATA";
      throw error;
    }
  }

  const sides = {
    baseLocal: validateSide(baseLocalCollections, "base-local"),
    baseRemote: validateSide(baseRemoteCollections, "base-remote"),
    local: validateSide(localCollections, "local"),
    remote: validateSide(remoteCollections, "remote")
  };
  const maps = {
    baseLocal: mapById(baseLocalCollections),
    baseRemote: mapById(baseRemoteCollections),
    local: mapById(localCollections),
    remote: mapById(remoteCollections)
  };
  const ids = Array.from(
    new Set(
      Object.values(maps).flatMap(side => Array.from(side.map.keys()))
    )
  );
  const items = ids.map(id => {
    const baseLocalEntry = maps.baseLocal.map.get(id);
    const baseRemoteEntry = maps.baseRemote.map.get(id);
    const localEntry = maps.local.map.get(id);
    const remoteEntry = maps.remote.map.get(id);
    const baseLocal = baseLocalEntry && baseLocalEntry.collection;
    const baseRemote = baseRemoteEntry && baseRemoteEntry.collection;
    const local = localEntry && localEntry.collection;
    const remote = remoteEntry && remoteEntry.collection;
    const managed = Boolean(baseLocal || baseRemote);
    const collision = Object.values(maps).some(side => side.collisions.has(id));
    const invalid = Object.values(sides).some(side => side.invalid.has(id));
    let classification = collision
      ? "Identity Collision"
      : invalid
        ? "Invalid"
        : classifyPresence(baseLocal, baseRemote, local, remote);
    const localBase = baseLocal;
    const remoteBase = baseRemote;
    const localPaths = local && localBase ? changedPaths(localBase, local) : [];
    const remotePaths = remote && remoteBase ? changedPaths(remoteBase, remote) : [];
    const conflicts =
      local && remote ? conflictPaths(localPaths, remotePaths, local, remote) : [];

    if (!classification && local && remote) {
      const localChanged = localPaths.length > 0;
      const remoteChanged = remotePaths.length > 0;
      if (!localChanged && !remoteChanged) classification = "Unchanged";
      else if (localChanged && !remoteChanged) classification = "Local Change Only";
      else if (!localChanged && remoteChanged) classification = "Remote Change Only";
      else if (equal(canonicalCollection(local), canonicalCollection(remote))) {
        classification = "Same Change";
      } else if (conflicts.length) classification = "Conflict";
      else classification = "Same Change";
    }

    let automaticResult = remote ? clone(remote) : undefined;
    if (classification === "Local Change Only") {
      automaticResult = applyPaths(remote, local, localPaths);
    } else if (classification === "Same Change" && local && remote) {
      automaticResult = applyPaths(remote, local, localPaths);
    } else if (classification === "Local Addition") {
      automaticResult = clone(local);
    } else if (classification === "Remote Deletion" || classification === "Deleted Both") {
      automaticResult = undefined;
    }

    return {
      id,
      managed,
      classification,
      title: (remote && remote.title) || (local && local.title) || "Untitled collection",
      indexes: {
        baseLocal: baseLocalEntry ? baseLocalEntry.index : -1,
        baseRemote: baseRemoteEntry ? baseRemoteEntry.index : -1,
        local: localEntry ? localEntry.index : -1,
        remote: remoteEntry ? remoteEntry.index : -1
      },
      changedPaths: {
        local: localPaths,
        remote: remotePaths,
        conflicts
      },
      defaultResolution:
        classification === "Unchanged" || classification === "Remote Change Only" ||
        classification === "Remote Addition" || classification === "Local Deletion"
          ? "Keep Nuvio"
          : classification === "Local Change Only" || classification === "Local Addition"
            ? "Use Ultra MAX"
            : classification === "Same Change"
              ? "Merge Fields"
              : classification === "Remote Deletion" || classification === "Deleted Both"
                ? "Skip"
                : null,
      blocked: classification === "Invalid" || classification === "Identity Collision",
      automaticResult
    };
  });

  // An unmanaged same-ID pair is a legacy candidate, never a managed conflict.
  for (const item of items) {
    if (!item.managed && item.classification === "Conflict") {
      item.classification = "Remote Addition";
      item.defaultResolution = "Keep Nuvio";
      item.changedPaths.conflicts = [];
      item.automaticResult =
        item.indexes.remote >= 0 ? clone(remoteCollections[item.indexes.remote]) : undefined;
    }
  }

  const managedIds = new Set(
    [...maps.baseLocal.map.keys(), ...maps.baseRemote.map.keys()]
  );
  const orderFor = collections =>
    collections.map(collection => collection && collection.id).filter(id => managedIds.has(id));
  const baseLocalOrder = orderFor(baseLocalCollections);
  const baseRemoteOrder = orderFor(baseRemoteCollections);
  const localOrder = orderFor(localCollections);
  const remoteOrder = orderFor(remoteCollections);
  const localOrderChanged = !equal(baseLocalOrder, localOrder);
  const remoteOrderChanged = !equal(baseRemoteOrder, remoteOrder);
  let orderClassification = "Unchanged";
  if (localOrderChanged && !remoteOrderChanged) orderClassification = "Local Change Only";
  else if (!localOrderChanged && remoteOrderChanged) orderClassification = "Remote Change Only";
  else if (localOrderChanged && remoteOrderChanged) {
    orderClassification = equal(localOrder, remoteOrder) ? "Same Change" : "Conflict";
  }
  if (orderClassification !== "Unchanged") {
    items.push({
      id: "__collectionOrder",
      managed: true,
      classification: orderClassification,
      title: "Managed collection order",
      indexes: { baseLocal: -1, baseRemote: -1, local: -1, remote: -1 },
      changedPaths: {
        local: localOrderChanged ? ["collectionOrder"] : [],
        remote: remoteOrderChanged ? ["collectionOrder"] : [],
        conflicts: orderClassification === "Conflict" ? ["collectionOrder"] : []
      },
      defaultResolution:
        orderClassification === "Local Change Only"
          ? "Use Ultra MAX"
          : orderClassification === "Remote Change Only"
            ? "Keep Nuvio"
            : orderClassification === "Same Change"
              ? "Merge Fields"
              : null,
      blocked: false,
      automaticResult: null,
      order: { baseLocalOrder, baseRemoteOrder, localOrder, remoteOrder }
    });
  }

  const summary = Object.fromEntries(CLASSIFICATIONS.map(name => [name, 0]));
  items.forEach(item => {
    summary[item.classification] += 1;
  });
  return {
    threeWaySchemaVersion: THREE_WAY_SCHEMA_VERSION,
    readOnly: true,
    items,
    summary,
    validations: {
      baseLocal: sides.baseLocal.validation,
      baseRemote: sides.baseRemote.validation,
      local: sides.local.validation,
      remote: sides.remote.validation
    },
    order: {
      classification: orderClassification,
      localChanged: localOrderChanged,
      remoteChanged: remoteOrderChanged
    }
  };
}

module.exports = {
  CLASSIFICATIONS,
  THREE_WAY_SCHEMA_VERSION,
  applyPaths,
  changedPaths,
  compareThreeWay,
  conflictPaths,
  valueAtPath
};
