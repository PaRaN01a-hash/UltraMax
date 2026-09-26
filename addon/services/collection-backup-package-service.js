"use strict";

const {
  canonicalHash,
  validateCollections
} = require("./collection-schema-service");

const BACKUP_SCHEMA_VERSION = 1;
const MERGE_BASE_SCHEMA_VERSION = 1;

class BackupPackageError extends Error {
  constructor(message, code = "INVALID_ROLLBACK_PACKAGE") {
    super(message);
    this.name = "BackupPackageError";
    this.code = code;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function maskScope(scope) {
  return `scope-${canonicalHash(String(scope)).slice(0, 12)}`;
}

function canonicalCollectionsHash(collections, side) {
  const validation = validateCollections(collections, { side });
  if (!validation.valid) {
    throw new BackupPackageError(
      `${side} collections are invalid`,
      "INVALID_COLLECTION_DATA"
    );
  }
  return canonicalHash(validation.entries.map(entry => entry.canonical));
}

function fingerprints(collections) {
  return collections.map(collection => canonicalHash(collection));
}

function createMergeBasePackage(input = {}) {
  const {
    localCollections,
    remoteCollections,
    ultraMaxProfileScope,
    nuvioProfileScope,
    createdAt
  } = input;
  if (!Array.isArray(localCollections) || !Array.isArray(remoteCollections)) {
    throw new BackupPackageError("Merge base arrays are required", "INVALID_BASE_PACKAGE");
  }
  if (
    nuvioProfileScope === undefined ||
    nuvioProfileScope === null ||
    String(nuvioProfileScope).trim() === ""
  ) {
    throw new BackupPackageError("Merge base profile scope is required", "INVALID_BASE_PACKAGE");
  }
  return {
    mergeBaseSchemaVersion: MERGE_BASE_SCHEMA_VERSION,
    createdAt: createdAt || new Date().toISOString(),
    ultraMaxProfileScope: String(ultraMaxProfileScope || "Base setup").slice(0, 120),
    nuvioProfileScope: maskScope(nuvioProfileScope),
    canonicalRemoteHash: canonicalCollectionsHash(remoteCollections, "base-remote"),
    canonicalLocalHash: canonicalCollectionsHash(localCollections, "base-local"),
    remoteCollectionFingerprints: fingerprints(remoteCollections),
    localCollectionFingerprints: fingerprints(localCollections),
    exactRemoteBackupArray: clone(remoteCollections),
    exactLocalExportArray: clone(localCollections)
  };
}

function validateMergeBasePackage(packageValue, expectedProfileScope) {
  if (
    !packageValue ||
    packageValue.mergeBaseSchemaVersion !== MERGE_BASE_SCHEMA_VERSION ||
    !Array.isArray(packageValue.exactRemoteBackupArray) ||
    !Array.isArray(packageValue.exactLocalExportArray)
  ) {
    throw new BackupPackageError("The merge base package is invalid", "INVALID_BASE_PACKAGE");
  }
  if (
    expectedProfileScope !== undefined &&
    packageValue.nuvioProfileScope !== maskScope(expectedProfileScope)
  ) {
    throw new BackupPackageError("The merge base profile scope changed", "PROFILE_SCOPE_CHANGED");
  }
  const remoteHash = canonicalCollectionsHash(
    packageValue.exactRemoteBackupArray,
    "base-remote"
  );
  const localHash = canonicalCollectionsHash(
    packageValue.exactLocalExportArray,
    "base-local"
  );
  if (
    remoteHash !== packageValue.canonicalRemoteHash ||
    localHash !== packageValue.canonicalLocalHash ||
    canonicalHash(packageValue.remoteCollectionFingerprints) !==
      canonicalHash(fingerprints(packageValue.exactRemoteBackupArray)) ||
    canonicalHash(packageValue.localCollectionFingerprints) !==
      canonicalHash(fingerprints(packageValue.exactLocalExportArray))
  ) {
    throw new BackupPackageError("The merge base package was changed", "INVALID_BASE_PACKAGE");
  }
  return clone(packageValue);
}

function createRollbackPackage(input = {}) {
  const {
    profileScope,
    remoteCollections,
    localCollections,
    mergedOutput,
    resolvedOperationPlan,
    conflictResolutions,
    applicationVersion,
    schemaVersions,
    generatedAt
  } = input;
  if (
    !Array.isArray(remoteCollections) ||
    !Array.isArray(localCollections) ||
    !Array.isArray(mergedOutput)
  ) {
    throw new BackupPackageError("Rollback arrays are required");
  }
  const sanitizedResolutions = Object.entries(conflictResolutions || {}).map(
    ([id, resolution]) => ({
      collectionFingerprint: canonicalHash(id),
      resolution
    })
  );
  return {
    backupSchemaVersion: BACKUP_SCHEMA_VERSION,
    generatedAt: generatedAt || new Date().toISOString(),
    maskedProfileScope: maskScope(profileScope),
    remoteCanonicalHash: canonicalCollectionsHash(remoteCollections, "rollback-remote"),
    localCanonicalHash: canonicalCollectionsHash(localCollections, "rollback-local"),
    mergedOutputHash: canonicalCollectionsHash(mergedOutput, "rollback-output"),
    exactRemoteArrayHash: canonicalHash(remoteCollections),
    exactLocalArrayHash: canonicalHash(localCollections),
    exactMergedArrayHash: canonicalHash(mergedOutput),
    exactRawRemoteArray: clone(remoteCollections),
    exactLocalExportArray: clone(localCollections),
    exactMergedOutputArray: clone(mergedOutput),
    resolvedOperationPlan: clone(resolvedOperationPlan || []),
    conflictResolutions: sanitizedResolutions,
    applicationVersion: String(applicationVersion || "unknown").slice(0, 80),
    schemaVersions: clone(schemaVersions || {})
  };
}

function verifyRollbackPackage(packageValue) {
  if (
    !packageValue ||
    packageValue.backupSchemaVersion !== BACKUP_SCHEMA_VERSION ||
    !Array.isArray(packageValue.exactRawRemoteArray) ||
    !Array.isArray(packageValue.exactLocalExportArray) ||
    !Array.isArray(packageValue.exactMergedOutputArray)
  ) {
    throw new BackupPackageError("The rollback package is invalid");
  }
  const remoteHash = canonicalCollectionsHash(
    packageValue.exactRawRemoteArray,
    "rollback-remote"
  );
  const localHash = canonicalCollectionsHash(
    packageValue.exactLocalExportArray,
    "rollback-local"
  );
  const outputHash = canonicalCollectionsHash(
    packageValue.exactMergedOutputArray,
    "rollback-output"
  );
  if (
    remoteHash !== packageValue.remoteCanonicalHash ||
    localHash !== packageValue.localCanonicalHash ||
    outputHash !== packageValue.mergedOutputHash ||
    canonicalHash(packageValue.exactRawRemoteArray) !== packageValue.exactRemoteArrayHash ||
    canonicalHash(packageValue.exactLocalExportArray) !== packageValue.exactLocalArrayHash ||
    canonicalHash(packageValue.exactMergedOutputArray) !== packageValue.exactMergedArrayHash
  ) {
    throw new BackupPackageError("Rollback package hashes are inconsistent");
  }
  const restored = clone(packageValue.exactRawRemoteArray);
  if (
    canonicalHash(restored) !== canonicalHash(packageValue.exactRawRemoteArray) ||
    restored.length !== packageValue.exactRawRemoteArray.length
  ) {
    throw new BackupPackageError("Rollback order or content is inconsistent");
  }
  return {
    valid: true,
    readOnly: true,
    restoredCanonicalHash: remoteHash,
    originalCount: restored.length,
    orderPreserved: true,
    hashesConsistent: true
  };
}

function verifiedRollbackPackageHash(packageValue) {
  verifyRollbackPackage(packageValue);
  return canonicalHash(packageValue);
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  MERGE_BASE_SCHEMA_VERSION,
  BackupPackageError,
  canonicalCollectionsHash,
  createMergeBasePackage,
  createRollbackPackage,
  maskScope,
  validateMergeBasePackage,
  verifiedRollbackPackageHash,
  verifyRollbackPackage
};
