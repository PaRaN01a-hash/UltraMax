"use strict";

const crypto = require("crypto");
const {
  canonicalHash,
  validateCollections
} = require("./collection-schema-service");
const {
  THREE_WAY_SCHEMA_VERSION,
  applyPaths,
  compareThreeWay
} = require("./collection-three-way-diff-service");
const {
  BACKUP_SCHEMA_VERSION,
  MERGE_BASE_SCHEMA_VERSION,
  BackupPackageError,
  canonicalCollectionsHash,
  createMergeBasePackage,
  createRollbackPackage,
  validateMergeBasePackage,
  verifyRollbackPackage
} = require("./collection-backup-package-service");

const SAFE_MERGE_SCHEMA_VERSION = 1;
const ALLOWED_RESOLUTIONS = Object.freeze([
  "Keep Nuvio",
  "Use Ultra MAX",
  "Merge Fields",
  "Duplicate as New",
  "Skip",
  "Delete"
]);

class SafeMergeError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "SafeMergeError";
    this.code = code || "INVALID_COLLECTION_DATA";
    this.details = details || null;
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function collectionAt(collections, index) {
  return index >= 0 ? collections[index] : undefined;
}

function freshId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function duplicateAsNew(collection) {
  const result = clone(collection);
  result.id = freshId("collection");
  result.folders = (result.folders || []).map(folder => ({
    ...folder,
    id: freshId("folder")
  }));
  return result;
}

function sanitizeOperation(item, resolution) {
  return {
    collectionFingerprint: canonicalHash(item.id),
    classification: item.classification,
    resolution,
    changedPaths: clone(item.changedPaths),
    managed: item.managed
  };
}

function applyManagedOrder(output, localCollections, managedIds) {
  const localOrder = localCollections
    .map(collection => collection.id)
    .filter(id => managedIds.has(id));
  const rank = new Map(localOrder.map((id, index) => [id, index]));
  const positions = [];
  const records = [];
  output.forEach((collection, index) => {
    if (managedIds.has(collection.id) && rank.has(collection.id)) {
      positions.push(index);
      records.push(collection);
    }
  });
  records.sort((left, right) => rank.get(left.id) - rank.get(right.id));
  positions.forEach((position, index) => {
    output[position] = records[index];
  });
}

function reportFor(result) {
  return {
    safeMergeSchemaVersion: SAFE_MERGE_SCHEMA_VERSION,
    mode: "safe-merge",
    generatedAt: result.generatedAt,
    readOnly: true,
    summary: clone(result.summary),
    hashes: clone(result.hashes),
    unresolvedConflictCount: result.unresolvedConflictCount,
    blockedCount: result.blockedCount,
    operations: clone(result.operations)
  };
}

function assertFresh(input, remoteHash, localHash) {
  if (
    input.expectedProfileScope !== undefined &&
    String(input.expectedProfileScope) !== String(input.profileScope)
  ) {
    throw new SafeMergeError("The selected profile changed", "PROFILE_SCOPE_CHANGED");
  }
  if (input.expectedRemoteHash && input.expectedRemoteHash !== remoteHash) {
    throw new SafeMergeError("The remote collection base is stale", "STALE_REMOTE_HASH");
  }
  if (input.expectedLocalHash && input.expectedLocalHash !== localHash) {
    throw new SafeMergeError("The local collection base is stale", "STALE_LOCAL_HASH");
  }
}

function buildSafeMergePlan(input = {}) {
  const {
    mergeBasePackage,
    localCollections,
    remoteCollections,
    profileScope,
    resolutions = {},
    finalExport = false,
    applicationVersion,
    generatedAt
  } = input;
  if (!Array.isArray(localCollections) || !Array.isArray(remoteCollections)) {
    throw new SafeMergeError("Current local and remote arrays are required", "INVALID_COLLECTION_DATA");
  }
  let base;
  try {
    base = validateMergeBasePackage(mergeBasePackage, profileScope);
  } catch (error) {
    if (error instanceof BackupPackageError) {
      throw new SafeMergeError(error.message, error.code);
    }
    throw error;
  }
  const localValidation = validateCollections(localCollections, { side: "local" });
  const remoteValidation = validateCollections(remoteCollections, { side: "remote" });
  if (!localValidation.valid || !remoteValidation.valid) {
    const collision = [...localValidation.entries, ...remoteValidation.entries]
      .some(entry => entry.collision);
    throw new SafeMergeError(
      "Invalid or colliding collection data blocks Safe Merge",
      collision ? "IDENTITY_COLLISION" : "INVALID_COLLECTION_DATA"
    );
  }
  const localHash = canonicalHash(localValidation.entries.map(entry => entry.canonical));
  const remoteHash = canonicalHash(remoteValidation.entries.map(entry => entry.canonical));
  assertFresh(input, remoteHash, localHash);

  const comparison = compareThreeWay({
    baseLocalCollections: base.exactLocalExportArray,
    baseRemoteCollections: base.exactRemoteBackupArray,
    localCollections,
    remoteCollections
  });
  const output = clone(remoteCollections);
  const operations = [];
  let unresolvedConflictCount = 0;
  let blockedCount = 0;
  let reviewedOrderResolution = null;

  for (const item of comparison.items) {
    if (item.blocked) {
      blockedCount += 1;
      continue;
    }
    const explicit = resolutions[item.id];
    if (explicit && !ALLOWED_RESOLUTIONS.includes(explicit)) {
      throw new SafeMergeError("A conflict resolution is invalid", "UNRESOLVED_CONFLICTS");
    }
    if (explicit === "Delete" && !["Local Deletion", "Remote Deletion"].includes(item.classification)) {
      throw new SafeMergeError("Delete is limited to explicit deletion conflicts", "UNRESOLVED_CONFLICTS");
    }
    const resolution = explicit || item.defaultResolution;
    if (item.classification === "Conflict" && !explicit) {
      unresolvedConflictCount += 1;
      continue;
    }
    if (!resolution) continue;
    if (item.id === "__collectionOrder") {
      if (resolution === "Merge Fields" && item.classification === "Conflict") {
        throw new SafeMergeError(
          "Competing collection moves require Keep Nuvio, Use Ultra MAX, or Skip",
          "UNRESOLVED_CONFLICTS"
        );
      }
      reviewedOrderResolution = resolution;
      operations.push(sanitizeOperation(item, resolution));
      continue;
    }
    const local = collectionAt(localCollections, item.indexes.local);
    const remote = collectionAt(remoteCollections, item.indexes.remote);
    const foundRemoteIndex = output.findIndex(collection => collection.id === item.id);
    const remoteIndex = foundRemoteIndex >= 0 ? foundRemoteIndex : undefined;
    let result;

    if (resolution === "Keep Nuvio" || resolution === "Skip") {
      result = remote;
    } else if (resolution === "Use Ultra MAX") {
      result = local;
    } else if (resolution === "Merge Fields") {
      if (item.changedPaths.conflicts.length) {
        throw new SafeMergeError(
          "Merge Fields cannot resolve overlapping conflicting values",
          "UNRESOLVED_CONFLICTS"
        );
      }
      result = applyPaths(remote || {}, local || {}, item.changedPaths.local);
    } else if (resolution === "Duplicate as New") {
      result = duplicateAsNew(local || remote);
      output.push(result);
      operations.push(sanitizeOperation(item, resolution));
      continue;
    } else if (resolution === "Delete") {
      result = undefined;
    }

    if (remoteIndex !== undefined) {
      if (result === undefined) output.splice(remoteIndex, 1);
      else output[remoteIndex] = clone(result);
    } else if (result !== undefined && item.classification === "Local Addition") {
      output.push(clone(result));
    }
    operations.push(sanitizeOperation(item, resolution));
  }

  if (reviewedOrderResolution === "Use Ultra MAX" || reviewedOrderResolution === "Merge Fields") {
    const managedIds = new Set([
      ...base.exactLocalExportArray.map(collection => collection.id),
      ...base.exactRemoteBackupArray.map(collection => collection.id)
    ]);
    applyManagedOrder(output, localCollections, managedIds);
  }

  if (blockedCount) {
    const collision = comparison.items.some(item => item.classification === "Identity Collision");
    throw new SafeMergeError(
      "Invalid or colliding collection data blocks Safe Merge",
      collision ? "IDENTITY_COLLISION" : "INVALID_COLLECTION_DATA"
    );
  }
  if (finalExport && unresolvedConflictCount) {
    throw new SafeMergeError(
      "Resolve every conflict before exporting",
      "UNRESOLVED_CONFLICTS",
      { count: unresolvedConflictCount }
    );
  }
  const outputValidation = validateCollections(output, { side: "safe-merge-output" });
  if (!outputValidation.valid) {
    throw new SafeMergeError("Safe Merge output is invalid", "INVALID_COLLECTION_DATA");
  }
  const outputHash = canonicalCollectionsHash(output, "safe-merge-output");
  const result = {
    safeMergeSchemaVersion: SAFE_MERGE_SCHEMA_VERSION,
    readOnly: true,
    mode: "safe-merge",
    generatedAt: generatedAt || new Date().toISOString(),
    mergeBasePackage: base,
    comparison,
    summary: comparison.summary,
    hashes: { remote: remoteHash, local: localHash, output: outputHash },
    unresolvedConflictCount,
    blockedCount,
    operations,
    output
  };
  result.report = reportFor(result);
  result.rollbackPackage = createRollbackPackage({
    profileScope,
    remoteCollections,
    localCollections,
    mergedOutput: output,
    resolvedOperationPlan: operations,
    conflictResolutions: resolutions,
    applicationVersion,
    generatedAt: result.generatedAt,
    schemaVersions: {
      mergeBase: MERGE_BASE_SCHEMA_VERSION,
      threeWay: THREE_WAY_SCHEMA_VERSION,
      safeMerge: SAFE_MERGE_SCHEMA_VERSION,
      backup: BACKUP_SCHEMA_VERSION
    }
  });
  result.rollbackVerification = verifyRollbackPackage(result.rollbackPackage);
  return result;
}

function buildReviewedWriteCandidate(input = {}) {
  const result = buildSafeMergePlan({ ...input, finalExport: true });
  if (result.unresolvedConflictCount !== 0) {
    throw new SafeMergeError(
      "Resolve every conflict before preparing a write candidate",
      "UNRESOLVED_CONFLICTS"
    );
  }
  return result;
}

module.exports = {
  ALLOWED_RESOLUTIONS,
  SAFE_MERGE_SCHEMA_VERSION,
  SafeMergeError,
  buildSafeMergePlan,
  buildReviewedWriteCandidate,
  createMergeBasePackage,
  duplicateAsNew
};
