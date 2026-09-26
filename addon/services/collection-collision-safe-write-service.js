"use strict";

const {
  canonicalHash,
  validateCollections
} = require("./collection-schema-service");

const {
  CollisionSafeAddError,
  buildCollisionSafeAddPlan
} = require("./collection-collision-safe-add-service");

const COLLISION_SAFE_WRITE_SCHEMA_VERSION = 1;

class CollisionSafeWriteError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "CollisionSafeWriteError";
    this.code = code || "COLLISION_SAFE_WRITE_FAILED";
    this.details = details || null;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawHash(value) {
  return canonicalHash(value);
}

function assertLocalValid(localCollections) {
  const validation = validateCollections(localCollections, {
    side: "collision-safe-write-local"
  });

  if (!validation.valid) {
    throw new CollisionSafeWriteError(
      "Ultra MAX collections failed validation",
      "LOCAL_VALIDATION_FAILED"
    );
  }
}

function createCollisionSafeWritePlan(input = {}) {
  const {
    localCollections,
    remoteCollections,
    selectedLocalIds,
    profileScope,
    targetProfileLabel
  } = input;

  if (
    profileScope === undefined ||
    profileScope === null ||
    String(profileScope).trim() === ""
  ) {
    throw new CollisionSafeWriteError(
      "A Nuvio profile scope is required",
      "MISSING_PROFILE_SCOPE"
    );
  }

  let candidate;

  try {
    candidate = buildCollisionSafeAddPlan({
      localCollections,
      remoteCollections,
      selectedLocalIds
    });
  } catch (error) {
    if (error instanceof CollisionSafeAddError) {
      throw new CollisionSafeWriteError(
        error.message,
        error.code,
        error.details
      );
    }

    throw error;
  }

  assertLocalValid(localCollections);

  const exactRemoteBefore = clone(remoteCollections);
  const exactLocalAtReview = clone(localCollections);
  const exactExpectedOutput = clone(candidate.output);

  return {
    collisionSafeWriteSchemaVersion: COLLISION_SAFE_WRITE_SCHEMA_VERSION,
    mode: "collision-safe-add",
    readOnly: true,

    profileScope: String(profileScope),

    targetProfileLabel: String(
      targetProfileLabel || "Selected Nuvio profile"
    ).slice(0, 120),

    selectedLocalIds: candidate.selectedIds.slice(),

    hashes: {
      remoteBeforeRaw: rawHash(exactRemoteBefore),
      localAtReviewRaw: rawHash(exactLocalAtReview),
      expectedOutputRaw: rawHash(exactExpectedOutput)
    },

    counts: {
      remoteBefore: exactRemoteBefore.length,
      additions: candidate.summary.additions,
      expectedOutput: exactExpectedOutput.length,
      protectedRemoteEntries: candidate.summary.protectedRemoteEntries,
      protectedRemoteIds: candidate.summary.protectedRemoteIds
    },

    exactRemoteBefore,
    exactLocalAtReview,
    exactExpectedOutput
  };
}

function verifyCollisionSafeFreshState(input = {}) {
  const {
    plan,
    profileScope,
    currentLocalCollections,
    freshRemoteCollections
  } = input;

  if (
    !plan ||
    plan.collisionSafeWriteSchemaVersion !==
      COLLISION_SAFE_WRITE_SCHEMA_VERSION ||
    plan.mode !== "collision-safe-add"
  ) {
    throw new CollisionSafeWriteError(
      "The collision-safe write plan is invalid",
      "INVALID_WRITE_PLAN"
    );
  }

  if (String(profileScope) !== String(plan.profileScope)) {
    throw new CollisionSafeWriteError(
      "The selected Nuvio profile changed",
      "PROFILE_SCOPE_CHANGED"
    );
  }

  assertLocalValid(currentLocalCollections);

  const freshRemoteHash = rawHash(freshRemoteCollections);

  if (freshRemoteHash !== plan.hashes.remoteBeforeRaw) {
    throw new CollisionSafeWriteError(
      "Nuvio collections changed after review",
      "STALE_REMOTE_HASH"
    );
  }

  const freshLocalHash = rawHash(currentLocalCollections);

  if (freshLocalHash !== plan.hashes.localAtReviewRaw) {
    throw new CollisionSafeWriteError(
      "Ultra MAX collections changed after review",
      "STALE_LOCAL_HASH"
    );
  }

  let rebuilt;

  try {
    rebuilt = buildCollisionSafeAddPlan({
      localCollections: currentLocalCollections,
      remoteCollections: freshRemoteCollections,
      selectedLocalIds: plan.selectedLocalIds
    });
  } catch (error) {
    if (error instanceof CollisionSafeAddError) {
      throw new CollisionSafeWriteError(
        error.message,
        error.code,
        error.details
      );
    }

    throw error;
  }

  const rebuiltHash = rawHash(rebuilt.output);

  if (rebuiltHash !== plan.hashes.expectedOutputRaw) {
    throw new CollisionSafeWriteError(
      "The reviewed collision-safe output changed",
      "OUTPUT_HASH_MISMATCH"
    );
  }

  if (
    rawHash(rebuilt.output.slice(0, freshRemoteCollections.length)) !==
    freshRemoteHash
  ) {
    throw new CollisionSafeWriteError(
      "Existing Nuvio collections were not preserved",
      "REMOTE_PRESERVATION_FAILED"
    );
  }

  return {
    verified: true,
    readOnly: true,
    mode: "collision-safe-add",
    output: clone(rebuilt.output),
    outputRawHash: rebuiltHash
  };
}

function verifyCollisionSafePostWrite(plan, actualRemoteCollections) {
  if (
    !plan ||
    plan.collisionSafeWriteSchemaVersion !==
      COLLISION_SAFE_WRITE_SCHEMA_VERSION
  ) {
    throw new CollisionSafeWriteError(
      "The collision-safe write plan is invalid",
      "INVALID_WRITE_PLAN"
    );
  }

  if (!Array.isArray(actualRemoteCollections)) {
    throw new CollisionSafeWriteError(
      "Nuvio returned invalid post-write collection data",
      "POST_WRITE_VERIFICATION_FAILED"
    );
  }

  if (actualRemoteCollections.length !== plan.counts.expectedOutput) {
    throw new CollisionSafeWriteError(
      "Post-write collection count did not match",
      "POST_WRITE_VERIFICATION_FAILED"
    );
  }

  const actualHash = rawHash(actualRemoteCollections);

  if (actualHash !== plan.hashes.expectedOutputRaw) {
    throw new CollisionSafeWriteError(
      "Post-write collection content did not match",
      "POST_WRITE_VERIFICATION_FAILED"
    );
  }

  return {
    verified: true,
    rawHash: actualHash,
    count: actualRemoteCollections.length
  };
}

function rollbackCandidate(plan) {
  if (
    !plan ||
    plan.collisionSafeWriteSchemaVersion !==
      COLLISION_SAFE_WRITE_SCHEMA_VERSION ||
    !Array.isArray(plan.exactRemoteBefore)
  ) {
    throw new CollisionSafeWriteError(
      "The collision-safe rollback data is invalid",
      "INVALID_ROLLBACK_PACKAGE"
    );
  }

  const restored = clone(plan.exactRemoteBefore);

  if (rawHash(restored) !== plan.hashes.remoteBeforeRaw) {
    throw new CollisionSafeWriteError(
      "The collision-safe rollback data was changed",
      "INVALID_ROLLBACK_PACKAGE"
    );
  }

  return restored;
}

module.exports = {
  COLLISION_SAFE_WRITE_SCHEMA_VERSION,
  CollisionSafeWriteError,
  createCollisionSafeWritePlan,
  verifyCollisionSafeFreshState,
  verifyCollisionSafePostWrite,
  rollbackCandidate
};
