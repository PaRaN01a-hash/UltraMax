"use strict";

const {
  canonicalHash,
  validateCollections
} = require("./collection-schema-service");

class CollisionSafeAddError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "CollisionSafeAddError";
    this.code = code || "COLLISION_SAFE_ADD_FAILED";
    this.details = details || null;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function idCounts(collections) {
  const counts = new Map();

  collections.forEach(collection => {
    const id =
      collection &&
      typeof collection === "object" &&
      typeof collection.id === "string"
        ? collection.id
        : "";

    counts.set(id, (counts.get(id) || 0) + 1);
  });

  return counts;
}

function assertUnique(values, code, message) {
  const seen = new Set();

  values.forEach(value => {
    if (seen.has(value)) {
      throw new CollisionSafeAddError(message, code, {
        idFingerprint: canonicalHash(value).slice(0, 12)
      });
    }

    seen.add(value);
  });
}

function validateRemoteForOpaquePreservation(remoteCollections) {
  const validation = validateCollections(remoteCollections, {
    side: "collision-safe-remote"
  });

  const counts = idCounts(remoteCollections);

  // This escape hatch is deliberately limited to duplicate COLLECTION IDs.
  // Folder-ID collisions remain unsafe because they make the contents of an
  // individual collection ambiguous.
  const folderCollisionIndexes = new Set();

  remoteCollections.forEach((collection, collectionIndex) => {
    const folders =
      collection && Array.isArray(collection.folders)
        ? collection.folders
        : [];

    const seenFolderIds = new Set();

    folders.forEach(folder => {
      const folderId =
        folder &&
        typeof folder === "object" &&
        typeof folder.id === "string"
          ? folder.id
          : "";

      if (folderId && seenFolderIds.has(folderId)) {
        folderCollisionIndexes.add(collectionIndex);
      }

      if (folderId) seenFolderIds.add(folderId);
    });
  });

  if (folderCollisionIndexes.size) {
    throw new CollisionSafeAddError(
      "Nuvio contains duplicate folder IDs that cannot be safely isolated",
      "UNSUPPORTED_REMOTE_COLLISION",
      {
        collectionCount: folderCollisionIndexes.size
      }
    );
  }

  const ordinaryErrors = validation.entries.flatMap(entry =>
    entry.errors.map(error => ({
      index: entry.index,
      code: error.code
    }))
  );

  if (ordinaryErrors.length) {
    throw new CollisionSafeAddError(
      "Nuvio contains invalid collection data that cannot be safely preserved",
      "REMOTE_INVALID_DATA",
      {
        errorCodes: ordinaryErrors.map(item => item.code)
      }
    );
  }

  const unsupportedCollisions = validation.entries.filter(entry => {
    if (!entry.collision) return false;

    // Only duplicate COLLECTION IDs may use the opaque-preservation path.
    // Any other validator collision must stay blocked.
    return !entry.id || (counts.get(entry.id) || 0) < 2;
  });

  if (unsupportedCollisions.length) {
    throw new CollisionSafeAddError(
      "Nuvio contains a collision that cannot be safely isolated",
      "UNSUPPORTED_REMOTE_COLLISION"
    );
  }

  const duplicateIds = new Set(
    Array.from(counts.entries())
      .filter(([id, count]) => id && count > 1)
      .map(([id]) => id)
  );

  return {
    validation,
    duplicateIds
  };
}

function buildCollisionSafeAddPlan(input = {}) {
  const {
    localCollections,
    remoteCollections,
    selectedLocalIds
  } = input;

  if (!Array.isArray(localCollections) || !Array.isArray(remoteCollections)) {
    throw new CollisionSafeAddError(
      "Local and remote collections must be arrays",
      "MALFORMED_ARRAYS"
    );
  }

  if (selectedLocalIds !== undefined && !Array.isArray(selectedLocalIds)) {
    throw new CollisionSafeAddError(
      "Selected collection IDs must be an array",
      "MALFORMED_SELECTION"
    );
  }

  const localValidation = validateCollections(localCollections, {
    side: "collision-safe-local"
  });

  if (!localValidation.valid) {
    throw new CollisionSafeAddError(
      "Ultra MAX collections failed validation",
      "LOCAL_VALIDATION_FAILED"
    );
  }

  const {
    duplicateIds
  } = validateRemoteForOpaquePreservation(remoteCollections);

  const remoteCounts = idCounts(remoteCollections);

  const selections =
    selectedLocalIds === undefined
      ? localCollections
          .filter(collection => (remoteCounts.get(collection.id) || 0) === 0)
          .map(collection => collection.id)
      : selectedLocalIds.map(id => String(id));

  assertUnique(
    selections,
    "DUPLICATE_SELECTED_IDS",
    "The selected collection list contains duplicate IDs"
  );

  const localById = new Map(
    localCollections.map(collection => [collection.id, collection])
  );

  selections.forEach(id => {
    const remoteCount = remoteCounts.get(id) || 0;

    if (remoteCount > 1) {
      throw new CollisionSafeAddError(
        "A selected collection ID is ambiguous in Nuvio and cannot be changed",
        "SELECTED_ID_COLLIDES_REMOTE",
        {
          idFingerprint: canonicalHash(id).slice(0, 12),
          copies: remoteCount
        }
      );
    }

    if (remoteCount === 1) {
      throw new CollisionSafeAddError(
        "A selected collection ID already exists in Nuvio",
        "SELECTED_ID_ALREADY_REMOTE",
        {
          idFingerprint: canonicalHash(id).slice(0, 12)
        }
      );
    }

    if (!localById.has(id)) {
      throw new CollisionSafeAddError(
        "A selected collection is no longer present in Ultra MAX",
        "SELECTED_LOCAL_REMOVED",
        {
          idFingerprint: canonicalHash(id).slice(0, 12)
        }
      );
    }
  });

  const preservedRemote = clone(remoteCollections);
  const additions = selections.map(id => clone(localById.get(id)));
  const output = preservedRemote.concat(additions);

  // The entire original remote prefix must survive byte-for-byte-equivalent
  // JSON canonicalisation. No existing Nuvio object may be rewritten.
  const preservedPrefix = output.slice(0, remoteCollections.length);

  if (canonicalHash(preservedPrefix) !== canonicalHash(remoteCollections)) {
    throw new CollisionSafeAddError(
      "Existing Nuvio collections were not preserved exactly",
      "REMOTE_PRESERVATION_FAILED"
    );
  }

  if (output.length !== remoteCollections.length + additions.length) {
    throw new CollisionSafeAddError(
      "Collision-safe output count is inconsistent",
      "OUTPUT_COUNT_MISMATCH"
    );
  }

  return {
    readOnly: true,
    mode: "collision-safe-add",
    hashes: {
      remoteRaw: canonicalHash(remoteCollections),
      outputRaw: canonicalHash(output)
    },
    summary: {
      existingRemote: remoteCollections.length,
      protectedRemoteEntries: remoteCollections.filter(collection =>
        duplicateIds.has(collection.id)
      ).length,
      protectedRemoteIds: duplicateIds.size,
      additions: additions.length,
      final: output.length
    },
    selectedIds: selections.slice(),
    output
  };
}

module.exports = {
  CollisionSafeAddError,
  buildCollisionSafeAddPlan,
  validateRemoteForOpaquePreservation
};
