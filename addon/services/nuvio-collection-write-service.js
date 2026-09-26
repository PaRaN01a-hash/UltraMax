"use strict";

const axios = require("axios");
const crypto = require("crypto");
const {
  canonicalHash
} = require("./collection-schema-service");
const {
  canonicalCollectionsHash,
  maskScope,
  verifiedRollbackPackageHash,
  verifyRollbackPackage
} = require("./collection-backup-package-service");
const {
  buildReviewedWriteCandidate
} = require("./collection-safe-merge-service");
const {
  createCollisionSafeWritePlan,
  verifyCollisionSafeFreshState,
  verifyCollisionSafePostWrite,
  rollbackCandidate
} = require("./collection-collision-safe-write-service");

const NUVIO_API_BASE = "https://api.nuvio.tv";
const NUVIO_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI";
const PLAN_SCHEMA_VERSION = 1;
const PLAN_TTL_MS = 10 * 60 * 1000;
const WRITE_WINDOW_MS = Number(
  process.env.NUVIO_COLLECTION_WRITE_WINDOW_MS || 60 * 60 * 1000
);
const MIN_WRITE_INTERVAL_MS = Number(
  process.env.NUVIO_COLLECTION_MIN_WRITE_INTERVAL_MS || 10 * 1000
);
const MAX_PROFILE_WRITES_PER_HOUR = Number(
  process.env.NUVIO_COLLECTION_MAX_WRITES_PER_HOUR || 12
);
const MAX_ROLLBACK_ATTEMPTS = Number(
  process.env.NUVIO_COLLECTION_MAX_ROLLBACK_ATTEMPTS || 2
);
const APPLY_CONFIRMATION = "APPLY TO NUVIO";
const ROLLBACK_CONFIRMATION = "RESTORE NUVIO BACKUP";
const EMERGENCY_ROLLBACK_CONFIRMATION = "RESTORE NUVIO BACKUP FROM UNKNOWN STATE";

class CollectionWriteError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "CollectionWriteError";
    this.code = code;
    this.details = details || null;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeError(code, fallback) {
  return new CollectionWriteError(fallback, code);
}

function requireToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw safeError("AUTHENTICATION_REQUIRED", "A current Nuvio access token is required");
  }
}

function orderFingerprint(collections) {
  return canonicalHash(collections.map(collection => collection.id));
}

function rawArrayFingerprint(collections) {
  return canonicalHash(collections);
}

function operationFingerprint(operations) {
  return canonicalHash(operations || []);
}

function sanitizedSummary(safeMerge) {
  const operations = safeMerge.operations || [];
  return {
    currentRemoteCount: safeMerge.rollbackPackage.exactRawRemoteArray.length,
    resultingCount: safeMerge.output.length,
    additions: operations.filter(operation =>
      operation.classification === "Local Addition" ||
      operation.resolution === "Duplicate as New"
    ).length,
    updates: operations.filter(operation =>
      ["Local Change Only", "Same Change", "Conflict"].includes(operation.classification) &&
      !["Keep Nuvio", "Skip"].includes(operation.resolution)
    ).length,
    deletions: operations.filter(operation => operation.resolution === "Delete").length,
    unresolvedConflicts: safeMerge.unresolvedConflictCount,
    backupVerified: Boolean(safeMerge.rollbackVerification && safeMerge.rollbackVerification.valid)
  };
}

function publicPlan(plan) {
  return {
    readOnly: true,
    planId: plan.planId,
    planSchemaVersion: plan.planSchemaVersion,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    profileScopeHash: plan.profileScopeHash,
    remoteBaseHash: plan.remoteBaseHash,
    localBaseHash: plan.localBaseHash,
    mergedOutputHash: plan.mergedOutputHash,
    expectedRemoteCount: plan.expectedRemoteCount,
    expectedMergedCount: plan.expectedMergedCount,
    unresolvedConflictCount: plan.unresolvedConflictCount,
    operationFingerprint: plan.operationFingerprint,
    rollbackPackageHash: plan.rollbackPackageHash,
    summary: clone(plan.summary),
    targetProfileLabel: plan.targetProfileLabel,
    rollbackPackage: clone(plan.rollbackPackage),
    freshRemoteVerifiedAt: plan.freshRemoteVerifiedAt,
    status: plan.status
  };
}

class FixedNuvioCollectionAdapter {
  async request(path, accessToken, body, action, isWrite = false) {
    requireToken(accessToken);
    try {
      const response = await axios({
        method: "POST",
        url: `${NUVIO_API_BASE}${path}`,
        headers: {
          apikey: NUVIO_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Client-Info": "UltraMAX-SafeCollectionSync/4B"
        },
        data: body,
        timeout: isWrite ? 15000 : 12000,
        validateStatus: () => true,
        responseType: "json"
      });
      if (response.status === 401 || response.status === 403) {
        throw safeError("AUTHENTICATION_REQUIRED", "Nuvio authentication was rejected");
      }
      if (response.status === 429) {
        throw safeError("RATE_LIMITED", "Nuvio rate-limited the request");
      }
      if (response.status < 200 || response.status >= 300) {
        const requestError = safeError(
          isWrite ? "REMOTE_WRITE_FAILED" : "REMOTE_PULL_FAILED",
          `Nuvio ${action} failed`
        );
        if (isWrite) requestError.ambiguous = true;
        throw requestError;
      }
      return response.data;
    } catch (error) {
      if (error instanceof CollectionWriteError) throw error;
      if (isWrite) {
        const ambiguous = safeError(
          "REMOTE_WRITE_FAILED",
          "The Nuvio write response was ambiguous"
        );
        ambiguous.ambiguous = true;
        throw ambiguous;
      }
      throw safeError("REMOTE_PULL_FAILED", "Could not pull current Nuvio state");
    }
  }

  async listProfiles(accessToken) {
    const profiles = await this.request(
      "/rest/v1/rpc/sync_pull_profiles",
      accessToken,
      {},
      "profile lookup"
    );
    if (!Array.isArray(profiles)) {
      throw safeError("REMOTE_PULL_FAILED", "Nuvio returned an invalid profile response");
    }
    return profiles;
  }

  async pullCollections(accessToken, profileScope) {
    const rows = await this.request(
      "/rest/v1/rpc/sync_pull_collections",
      accessToken,
      { p_profile_id: profileScope },
      "collection pull"
    );
    if (!Array.isArray(rows)) {
      throw safeError("REMOTE_PULL_FAILED", "Nuvio returned invalid collection data");
    }

    // A successful empty RPC result means the selected Nuvio profile
    // currently has no collections configured.
    if (rows.length === 0) {
      return [];
    }

    if (!rows[0] || !Array.isArray(rows[0].collections_json)) {
      throw safeError("REMOTE_PULL_FAILED", "Nuvio returned invalid collection data");
    }

    return rows[0].collections_json;
  }

  async pushCollections(accessToken, profileScope, completeCollections) {
    return this.request(
      "/rest/v1/rpc/sync_push_collections",
      accessToken,
      {
        p_profile_id: profileScope,
        p_collections_json: completeCollections
      },
      "collection write",
      true
    );
  }
}

class NuvioCollectionWriteService {
  constructor(options = {}) {
    this.adapter = options.adapter || new FixedNuvioCollectionAdapter();
    this.now = options.now || (() => Date.now());
    this.randomId = options.randomId || (() => crypto.randomUUID());
    this.plans = new Map();
    this.activeProfiles = new Set();
    this.profileAttempts = new Map();
    this.lastProfileWrite = new Map();
    this.auditRecords = [];
  }

  lookupPlan(planId) {
    const plan = this.plans.get(planId);
    if (!plan) throw safeError("PLAN_NOT_FOUND", "The write plan was not found");
    if (plan.status === "applying" || plan.status === "rolling-back") {
      throw safeError("PLAN_ALREADY_APPLYING", "The write plan is already active");
    }
    if (plan.status === "used" || plan.status === "rolled-back") {
      throw safeError("PLAN_ALREADY_USED", "The write plan was already used");
    }
    if (this.now() > plan.expiresAtMs) {
      plan.status = "expired";
      throw safeError("PLAN_EXPIRED", "The write plan expired");
    }
    return plan;
  }

  async assertProfile(accessToken, profileScope) {
    requireToken(accessToken);
    const profiles = await this.adapter.listProfiles(accessToken);
    if (!profiles.some(profile => String(profile.profile_index) === String(profileScope))) {
      throw safeError("PROFILE_SCOPE_CHANGED", "The selected Nuvio profile changed");
    }
  }

  noteAudit(plan, operationType, resultCode, beforeHash, afterHash, counts) {
    this.auditRecords.push({
      operationType,
      planIdFingerprint: canonicalHash(plan.planId),
      maskedProfileScope: plan.profileScopeHash,
      timestamp: new Date(this.now()).toISOString(),
      beforeHash,
      expectedHash: operationType === "apply" ? plan.mergedOutputHash : plan.remoteBaseHash,
      verifiedAfterHash: afterHash || null,
      counts: clone(counts || {}),
      resultCode,
      rollbackVerified: plan.rollbackVerified
    });
    if (this.auditRecords.length > 200) this.auditRecords.shift();
  }

  assertProfileBinding(plan, profileScope) {
    if (plan.profileScopeHash !== maskScope(profileScope)) {
      throw safeError("PROFILE_SCOPE_CHANGED", "The selected Nuvio profile changed");
    }
  }

  assertRateLimit(plan, rollback = false) {
    const scope = plan.profileScopeHash;
    if (this.activeProfiles.has(scope)) {
      throw safeError("PLAN_ALREADY_APPLYING", "Another collection write is active for this profile");
    }
    const now = this.now();
    const attempts = (this.profileAttempts.get(scope) || [])
      .filter(timestamp => now - timestamp < WRITE_WINDOW_MS);
    this.profileAttempts.set(scope, attempts);
    if (attempts.length >= MAX_PROFILE_WRITES_PER_HOUR) {
      throw safeError("RATE_LIMITED", "The profile write limit was reached");
    }
    const lastWrite = this.lastProfileWrite.get(scope);
    if (lastWrite !== undefined && now - lastWrite < MIN_WRITE_INTERVAL_MS) {
      throw safeError("RATE_LIMITED", "Wait before another collection write");
    }
    if (rollback && plan.rollbackAttempts >= MAX_ROLLBACK_ATTEMPTS) {
      throw safeError("RATE_LIMITED", "The rollback attempt limit was reached");
    }
  }

  markWriteAttempt(plan, rollback = false) {
    const scope = plan.profileScopeHash;
    const now = this.now();
    const attempts = this.profileAttempts.get(scope) || [];
    attempts.push(now);
    this.profileAttempts.set(scope, attempts);
    this.lastProfileWrite.set(scope, now);
    if (rollback) plan.rollbackAttempts += 1;
  }

  rebuild(plan, localCollections, remoteCollections) {
    const rebuilt = buildReviewedWriteCandidate({
      mergeBasePackage: plan.safeMergeInput.mergeBasePackage,
      localCollections,
      remoteCollections,
      profileScope: plan.profileScope,
      expectedProfileScope: plan.profileScope,
      expectedRemoteHash: plan.remoteBaseHash,
      expectedLocalHash: plan.localBaseHash,
      resolutions: plan.safeMergeInput.resolutions,
      applicationVersion: plan.safeMergeInput.applicationVersion
    });
    if (rebuilt.unresolvedConflictCount !== 0) {
      throw safeError("UNRESOLVED_CONFLICTS", "The write plan has unresolved conflicts");
    }
    if (rebuilt.hashes.output !== plan.mergedOutputHash) {
      throw safeError("OUTPUT_HASH_MISMATCH", "The reviewed output hash changed");
    }
    return rebuilt;
  }

  publicCollisionSafePlan(plan) {
    return {
      readOnly: true,
      mode: "collision-safe-add",
      planId: plan.planId,
      planSchemaVersion: plan.planSchemaVersion,
      createdAt: plan.createdAt,
      expiresAt: plan.expiresAt,
      profileScopeHash: plan.profileScopeHash,
      hashes: {
        remoteBeforeRaw: plan.hashes.remoteBeforeRaw,
        localAtReviewRaw: plan.hashes.localAtReviewRaw,
        expectedOutputRaw: plan.hashes.expectedOutputRaw
      },
      counts: clone(plan.counts),
      selectedLocalIds: plan.selectedLocalIds.slice(),
      summary: {
        currentRemoteCount: plan.counts.remoteBefore,
        additions: plan.counts.additions,
        resultingCount: plan.counts.expectedOutput,
        unresolvedConflicts: 0,
        backupVerified: true
      },
      targetProfileLabel: plan.targetProfileLabel,
      freshRemoteVerifiedAt: plan.freshRemoteVerifiedAt,
      status: plan.status
    };
  }

  async prepareCollisionSafeWritePlan(input = {}) {
    const {
      accessToken,
      profileScope,
      currentLocalCollections,
      selectedLocalIds,
      expectedReviewHashes,
      targetProfileLabel
    } = input;

    requireToken(accessToken);

    if (!Array.isArray(currentLocalCollections)) {
      throw safeError(
        "LOCAL_VALIDATION_FAILED",
        "Current Ultra MAX collections are required"
      );
    }

    if (!Array.isArray(selectedLocalIds)) {
      throw safeError(
        "MALFORMED_SELECTION",
        "Selected collection IDs are required"
      );
    }

    if (!expectedReviewHashes || typeof expectedReviewHashes !== "object") {
      throw safeError(
        "INVALID_WRITE_PLAN",
        "The reviewed collision-safe hashes are required"
      );
    }

    await this.assertProfile(accessToken, profileScope);

    const freshRemote = await this.adapter.pullCollections(
      accessToken,
      profileScope
    );

    let reviewed;

    try {
      reviewed = createCollisionSafeWritePlan({
        profileScope,
        targetProfileLabel,
        localCollections: currentLocalCollections,
        remoteCollections: freshRemote,
        selectedLocalIds
      });
    } catch (error) {
      throw safeError(
        error.code || "COLLISION_SAFE_WRITE_FAILED",
        error.message || "Could not prepare the collision-safe write plan"
      );
    }

    if (
      reviewed.hashes.remoteBeforeRaw !== expectedReviewHashes.remoteBeforeRaw
    ) {
      throw safeError(
        "STALE_REMOTE_HASH",
        "Nuvio collections changed after review"
      );
    }

    if (
      reviewed.hashes.localAtReviewRaw !== expectedReviewHashes.localAtReviewRaw
    ) {
      throw safeError(
        "STALE_LOCAL_HASH",
        "Ultra MAX collections changed after review"
      );
    }

    if (
      reviewed.hashes.expectedOutputRaw !== expectedReviewHashes.expectedOutputRaw
    ) {
      throw safeError(
        "OUTPUT_HASH_MISMATCH",
        "The reviewed collision-safe output changed"
      );
    }

    const now = this.now();
    const planId = this.randomId();

    const plan = {
      ...reviewed,
      planId,
      planSchemaVersion: PLAN_SCHEMA_VERSION,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PLAN_TTL_MS).toISOString(),
      expiresAtMs: now + PLAN_TTL_MS,

      profileScope: String(profileScope),
      profileScopeHash: maskScope(profileScope),

      // Compatibility aliases for the common guarded-plan lifecycle.
      remoteBaseHash: reviewed.hashes.remoteBeforeRaw,
      localBaseHash: reviewed.hashes.localAtReviewRaw,
      mergedOutputHash: reviewed.hashes.expectedOutputRaw,
      expectedRemoteCount: reviewed.counts.remoteBefore,
      expectedMergedCount: reviewed.counts.expectedOutput,

      rollbackVerified: true,
      rollbackAttempts: 0,
      freshRemoteVerifiedAt: new Date(now).toISOString(),
      status: "ready",
      collisionSafe: true
    };

    this.plans.set(planId, plan);

    return this.publicCollisionSafePlan(plan);
  }

  async verifyCollisionSafeWritePlan(input = {}) {
    const {
      accessToken,
      profileScope,
      planId,
      currentLocalCollections
    } = input;

    requireToken(accessToken);

    const plan = this.lookupPlan(planId);

    if (!plan.collisionSafe || plan.mode !== "collision-safe-add") {
      throw safeError(
        "INVALID_WRITE_PLAN",
        "The write plan is not a collision-safe plan"
      );
    }

    this.assertProfileBinding(plan, profileScope);
    await this.assertProfile(accessToken, profileScope);

    const freshRemote = await this.adapter.pullCollections(
      accessToken,
      profileScope
    );

    try {
      verifyCollisionSafeFreshState({
        plan,
        profileScope,
        currentLocalCollections,
        freshRemoteCollections: freshRemote
      });
    } catch (error) {
      throw safeError(
        error.code || "COLLISION_SAFE_WRITE_FAILED",
        error.message || "Collision-safe fresh-state verification failed"
      );
    }

    plan.freshRemoteVerifiedAt = new Date(this.now()).toISOString();

    return {
      verified: true,
      readOnly: true,
      plan: this.publicCollisionSafePlan(plan)
    };
  }

  async applyCollisionSafeWritePlan(input = {}) {
    const {
      accessToken,
      profileScope,
      planId,
      currentLocalCollections,
      confirmation
    } = input;

    requireToken(accessToken);

    const plan = this.lookupPlan(planId);

    if (!plan.collisionSafe || plan.mode !== "collision-safe-add") {
      throw safeError(
        "INVALID_WRITE_PLAN",
        "The write plan is not a collision-safe plan"
      );
    }

    this.assertProfileBinding(plan, profileScope);

    if (confirmation !== APPLY_CONFIRMATION) {
      throw safeError(
        "AUTHENTICATION_REQUIRED",
        "Type the exact apply confirmation phrase"
      );
    }

    this.assertRateLimit(plan);
    await this.assertProfile(accessToken, profileScope);

    const remote = await this.adapter.pullCollections(
      accessToken,
      profileScope
    );

    let verified;

    try {
      verified = verifyCollisionSafeFreshState({
        plan,
        profileScope,
        currentLocalCollections,
        freshRemoteCollections: remote
      });
    } catch (error) {
      throw safeError(
        error.code || "COLLISION_SAFE_WRITE_FAILED",
        error.message || "Collision-safe fresh-state verification failed"
      );
    }

    const beforeHash = rawArrayFingerprint(remote);

    plan.status = "applying";
    this.activeProfiles.add(plan.profileScopeHash);

    let ambiguous = false;

    try {
      await this.adapter.pushCollections(
        accessToken,
        profileScope,
        verified.output
      );
      this.markWriteAttempt(plan);
    } catch (error) {
      if (!error || !error.ambiguous) {
        plan.status = "ready";

        this.noteAudit(
          plan,
          "apply",
          error && error.code ? error.code : "REMOTE_WRITE_FAILED",
          beforeHash,
          null,
          {
            before: remote.length,
            expected: plan.expectedMergedCount
          }
        );

        throw safeError(
          "REMOTE_WRITE_FAILED",
          "The Nuvio collection write failed"
        );
      }

      // The transport could have accepted this write even though the response
      // was lost. Count ambiguous attempts, then classify by read-back.
      this.markWriteAttempt(plan);
      ambiguous = true;
    } finally {
      this.activeProfiles.delete(plan.profileScopeHash);
    }

    if (ambiguous) {
      let afterAmbiguous;

      try {
        afterAmbiguous = await this.adapter.pullCollections(
          accessToken,
          profileScope
        );
      } catch {
        plan.status = "unknown";

        this.noteAudit(
          plan,
          "apply",
          "UNKNOWN_REMOTE_STATE",
          beforeHash,
          null,
          {
            before: remote.length,
            after: null
          }
        );

        throw safeError(
          "ROLLBACK_REQUIRED",
          "The remote collection state is unknown"
        );
      }

      try {
        const verifiedAfter = verifyCollisionSafePostWrite(
          plan,
          afterAmbiguous
        );

        plan.status = "used";
        plan.appliedAt = new Date(this.now()).toISOString();

        this.noteAudit(
          plan,
          "apply",
          "WRITE_SUCCEEDED_RESPONSE_LOST",
          beforeHash,
          verifiedAfter.rawHash,
          {
            before: remote.length,
            after: afterAmbiguous.length
          }
        );

        return {
          success: true,
          resultCode: "WRITE_SUCCEEDED_RESPONSE_LOST",
          verifiedRemoteCount: afterAmbiguous.length,
          verifiedRemoteHash: verifiedAfter.rawHash,
          verifiedAt: plan.appliedAt
        };
      } catch {
        const ambiguousHash = rawArrayFingerprint(afterAmbiguous);

        if (ambiguousHash === plan.remoteBaseHash) {
          plan.status = "ready";

          this.noteAudit(
            plan,
            "apply",
            "WRITE_NOT_APPLIED",
            beforeHash,
            ambiguousHash,
            {
              before: remote.length,
              after: afterAmbiguous.length
            }
          );

          throw safeError(
            "REMOTE_WRITE_FAILED",
            "The write was not applied"
          );
        }

        plan.status = "unknown";

        this.noteAudit(
          plan,
          "apply",
          "UNKNOWN_REMOTE_STATE",
          beforeHash,
          ambiguousHash,
          {
            before: remote.length,
            after: afterAmbiguous.length
          }
        );

        throw safeError(
          "ROLLBACK_REQUIRED",
          "The remote collection state is unknown"
        );
      }
    }

    let after;

    try {
      after = await this.adapter.pullCollections(
        accessToken,
        profileScope
      );

      const verifiedAfter = verifyCollisionSafePostWrite(plan, after);

      plan.status = "used";
      plan.appliedAt = new Date(this.now()).toISOString();

      this.noteAudit(
        plan,
        "apply",
        "APPLY_SUCCEEDED",
        beforeHash,
        verifiedAfter.rawHash,
        {
          before: remote.length,
          after: after.length
        }
      );

      return {
        success: true,
        resultCode: "APPLY_SUCCEEDED",
        verifiedRemoteCount: after.length,
        verifiedRemoteHash: verifiedAfter.rawHash,
        verifiedAt: plan.appliedAt
      };
    } catch {
      plan.status = "unknown";

      this.noteAudit(
        plan,
        "apply",
        "POST_WRITE_VERIFICATION_FAILED",
        beforeHash,
        after ? rawArrayFingerprint(after) : null,
        {
          before: remote.length,
          after: after ? after.length : null
        }
      );

      throw safeError(
        "ROLLBACK_REQUIRED",
        "Post-write verification failed; reviewed rollback may be required"
      );
    }
  }

  async rollbackCollisionSafeWritePlan(input = {}) {
    const {
      accessToken,
      profileScope,
      planId,
      confirmation
    } = input;

    requireToken(accessToken);

    const plan = this.plans.get(planId);

    if (!plan) {
      throw safeError(
        "PLAN_NOT_FOUND",
        "The write plan was not found"
      );
    }

    if (!plan.collisionSafe || plan.mode !== "collision-safe-add") {
      throw safeError(
        "INVALID_WRITE_PLAN",
        "The write plan is not a collision-safe plan"
      );
    }

    if (plan.status === "applying" || plan.status === "rolling-back") {
      throw safeError(
        "PLAN_ALREADY_APPLYING",
        "The write plan is already active"
      );
    }

    if (plan.status === "rolled-back") {
      throw safeError(
        "PLAN_ALREADY_USED",
        "The rollback was already used"
      );
    }

    if (plan.status === "ready") {
      throw safeError(
        "PLAN_NOT_APPLIED",
        "There is no applied collision-safe write to roll back"
      );
    }

    this.assertProfileBinding(plan, profileScope);

    const emergency =
      confirmation === EMERGENCY_ROLLBACK_CONFIRMATION;

    if (
      confirmation !== ROLLBACK_CONFIRMATION &&
      !emergency
    ) {
      throw safeError(
        "AUTHENTICATION_REQUIRED",
        "Type the exact rollback confirmation phrase"
      );
    }

    this.assertRateLimit(plan, true);
    await this.assertProfile(accessToken, profileScope);

    let exactRemote;

    try {
      exactRemote = rollbackCandidate(plan);
    } catch (error) {
      throw safeError(
        error.code || "INVALID_ROLLBACK_PACKAGE",
        error.message || "Collision-safe rollback verification failed"
      );
    }

    const current = await this.adapter.pullCollections(
      accessToken,
      profileScope
    );

    const currentHash = rawArrayFingerprint(current);

    if (!emergency && currentHash !== plan.mergedOutputHash) {
      throw safeError(
        "ROLLBACK_REQUIRED",
        "Current Nuvio state does not match the reviewed post-apply state"
      );
    }

    plan.status = "rolling-back";
    this.activeProfiles.add(plan.profileScopeHash);
    this.markWriteAttempt(plan, true);

    let ambiguous = false;

    try {
      await this.adapter.pushCollections(
        accessToken,
        profileScope,
        exactRemote
      );
    } catch (error) {
      if (!error || !error.ambiguous) {
        plan.status = "unknown";

        this.noteAudit(
          plan,
          "rollback",
          "ROLLBACK_FAILED",
          currentHash,
          null,
          {
            before: current.length,
            expected: exactRemote.length
          }
        );

        throw safeError(
          "ROLLBACK_FAILED",
          "The collision-safe rollback failed"
        );
      }

      ambiguous = true;
    } finally {
      this.activeProfiles.delete(plan.profileScopeHash);
    }

    if (ambiguous) {
      let afterAmbiguous;

      try {
        afterAmbiguous = await this.adapter.pullCollections(
          accessToken,
          profileScope
        );
      } catch {
        plan.status = "unknown";

        throw safeError(
          "ROLLBACK_FAILED",
          "The rollback response was ambiguous and restoration was not verified"
        );
      }

      const restoredHash = rawArrayFingerprint(afterAmbiguous);

      if (
        restoredHash === plan.remoteBaseHash &&
        afterAmbiguous.length === plan.expectedRemoteCount
      ) {
        plan.status = "rolled-back";

        const verifiedAt = new Date(this.now()).toISOString();

        this.noteAudit(
          plan,
          "rollback",
          "ROLLBACK_SUCCEEDED_RESPONSE_LOST",
          currentHash,
          restoredHash,
          {
            before: current.length,
            after: afterAmbiguous.length
          }
        );

        return {
          success: true,
          resultCode: "ROLLBACK_SUCCEEDED_RESPONSE_LOST",
          verifiedRemoteCount: afterAmbiguous.length,
          verifiedRemoteHash: restoredHash,
          verifiedAt
        };
      }

      plan.status = "unknown";

      throw safeError(
        "ROLLBACK_FAILED",
        "The rollback response was ambiguous and restoration was not verified"
      );
    }

    const restored = await this.adapter.pullCollections(
      accessToken,
      profileScope
    );

    const restoredHash = rawArrayFingerprint(restored);

    if (
      restoredHash !== plan.remoteBaseHash ||
      restored.length !== plan.expectedRemoteCount
    ) {
      plan.status = "unknown";

      this.noteAudit(
        plan,
        "rollback",
        "ROLLBACK_FAILED",
        currentHash,
        restoredHash,
        {
          before: current.length,
          after: restored.length
        }
      );

      throw safeError(
        "ROLLBACK_FAILED",
        "Collision-safe rollback verification failed"
      );
    }

    plan.status = "rolled-back";

    const verifiedAt = new Date(this.now()).toISOString();

    this.noteAudit(
      plan,
      "rollback",
      "ROLLBACK_SUCCEEDED",
      currentHash,
      restoredHash,
      {
        before: current.length,
        after: restored.length
      }
    );

    return {
      success: true,
      resultCode: "ROLLBACK_SUCCEEDED",
      verifiedRemoteCount: restored.length,
      verifiedRemoteHash: restoredHash,
      verifiedAt
    };
  }

  async prepareWritePlan(input = {}) {
    const {
      accessToken,
      profileScope,
      safeMergeInput,
      targetProfileLabel
    } = input;
    requireToken(accessToken);
    if (!safeMergeInput || !Array.isArray(safeMergeInput.localCollections)) {
      throw safeError("OUTPUT_HASH_MISMATCH", "A completed Safe Merge plan is required");
    }
    await this.assertProfile(accessToken, profileScope);
    const freshRemote = await this.adapter.pullCollections(accessToken, profileScope);
    let safeMerge;
    try {
      safeMerge = buildReviewedWriteCandidate({
        ...safeMergeInput,
        remoteCollections: freshRemote,
        profileScope,
        expectedProfileScope: profileScope,
      });
    } catch (error) {
      throw error instanceof CollectionWriteError
        ? error
        : safeError(error.code || "OUTPUT_HASH_MISMATCH", error.message || "Safe Merge validation failed");
    }
    if (safeMerge.unresolvedConflictCount !== 0) {
      throw safeError("UNRESOLVED_CONFLICTS", "Resolve every conflict before preparing a write");
    }
    let rollbackVerification;
    try {
      rollbackVerification = verifyRollbackPackage(safeMerge.rollbackPackage);
    } catch {
      throw safeError("INVALID_ROLLBACK_PACKAGE", "Rollback package verification failed");
    }
    if (!rollbackVerification.valid) {
      throw safeError("INVALID_ROLLBACK_PACKAGE", "Rollback package verification failed");
    }
    const now = this.now();
    const planId = this.randomId();
    const plan = {
      planId,
      planSchemaVersion: PLAN_SCHEMA_VERSION,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PLAN_TTL_MS).toISOString(),
      expiresAtMs: now + PLAN_TTL_MS,
      profileScope: String(profileScope),
      profileScopeHash: maskScope(profileScope),
      remoteBaseHash: safeMerge.hashes.remote,
      localBaseHash: safeMerge.hashes.local,
      mergedOutputHash: safeMerge.hashes.output,
      expectedRemoteCount: freshRemote.length,
      expectedMergedCount: safeMerge.output.length,
      unresolvedConflictCount: safeMerge.unresolvedConflictCount,
      operationFingerprint: operationFingerprint(safeMerge.operations),
      rollbackPackageHash: verifiedRollbackPackageHash(safeMerge.rollbackPackage),
      rollbackPackage: clone(safeMerge.rollbackPackage),
      rollbackVerified: true,
      rollbackAttempts: 0,
      safeMergeInput: {
        mergeBasePackage: clone(safeMergeInput.mergeBasePackage),
        resolutions: clone(safeMergeInput.resolutions || {}),
        applicationVersion: safeMergeInput.applicationVersion || "dev"
      },
      reviewedOutput: clone(safeMerge.output),
      targetProfileLabel: String(targetProfileLabel || "Selected Nuvio profile").slice(0, 120),
      freshRemoteVerifiedAt: new Date(now).toISOString(),
      summary: sanitizedSummary(safeMerge),
      status: "ready"
    };
    this.plans.set(planId, plan);
    return publicPlan(plan);
  }

  async verifyFreshState(input = {}) {
    const { accessToken, profileScope, planId, currentLocalCollections } = input;
    requireToken(accessToken);
    const plan = this.lookupPlan(planId);
    this.assertProfileBinding(plan, profileScope);
    await this.assertProfile(accessToken, profileScope);
    const remote = await this.adapter.pullCollections(accessToken, profileScope);
    const remoteHash = canonicalCollectionsHash(remote, "write-fresh-remote");
    if (remoteHash !== plan.remoteBaseHash) {
      throw safeError("STALE_REMOTE_HASH", "Nuvio collections changed after review");
    }
    const localHash = canonicalCollectionsHash(currentLocalCollections, "write-fresh-local");
    if (localHash !== plan.localBaseHash) {
      throw safeError("STALE_LOCAL_HASH", "Ultra MAX collections changed after review");
    }
    this.rebuild(plan, currentLocalCollections, remote);
    plan.freshRemoteVerifiedAt = new Date(this.now()).toISOString();
    return { verified: true, readOnly: true, plan: publicPlan(plan) };
  }

  verifyPostWrite(plan, collections, expectedHash, expectedCount, expectedOrder) {
    const hash = canonicalCollectionsHash(collections, "post-write");
    if (hash !== expectedHash) {
      throw safeError("POST_WRITE_VERIFICATION_FAILED", "Post-write hash verification failed");
    }
    if (collections.length !== expectedCount) {
      throw safeError("POST_WRITE_VERIFICATION_FAILED", "Post-write count verification failed");
    }
    if (orderFingerprint(collections) !== expectedOrder) {
      throw safeError("POST_WRITE_VERIFICATION_FAILED", "Post-write order verification failed");
    }
    return hash;
  }

  async classifyAmbiguousApply(plan, accessToken) {
    let remote;
    try {
      remote = await this.adapter.pullCollections(accessToken, plan.profileScope);
    } catch {
      return { resultCode: "UNKNOWN_REMOTE_STATE", remote: null };
    }
    const hash = canonicalCollectionsHash(remote, "ambiguous-write");
    if (hash === plan.mergedOutputHash) {
      return { resultCode: "WRITE_SUCCEEDED_RESPONSE_LOST", remote, hash };
    }
    if (hash === plan.remoteBaseHash) {
      return { resultCode: "WRITE_NOT_APPLIED", remote, hash };
    }
    return { resultCode: "UNKNOWN_REMOTE_STATE", remote, hash };
  }

  async apply(input = {}) {
    const {
      accessToken,
      profileScope,
      planId,
      currentLocalCollections,
      confirmation
    } = input;
    requireToken(accessToken);
    const plan = this.lookupPlan(planId);
    this.assertProfileBinding(plan, profileScope);
    if (confirmation !== APPLY_CONFIRMATION) {
      throw safeError("AUTHENTICATION_REQUIRED", "Type the exact apply confirmation phrase");
    }
    this.assertRateLimit(plan);
    await this.assertProfile(accessToken, profileScope);
    const remote = await this.adapter.pullCollections(accessToken, profileScope);
    const currentRemoteHash = canonicalCollectionsHash(remote, "apply-remote");
    if (currentRemoteHash !== plan.remoteBaseHash) {
      throw safeError("STALE_REMOTE_HASH", "Nuvio collections changed after review");
    }
    const localHash = canonicalCollectionsHash(currentLocalCollections, "apply-local");
    if (localHash !== plan.localBaseHash) {
      throw safeError("STALE_LOCAL_HASH", "Ultra MAX collections changed after review");
    }
    const rebuilt = this.rebuild(plan, currentLocalCollections, remote);
    try {
      verifiedRollbackPackageHash(plan.rollbackPackage);
    } catch {
      throw safeError("INVALID_ROLLBACK_PACKAGE", "Rollback package verification failed");
    }
    plan.status = "applying";
    this.activeProfiles.add(plan.profileScopeHash);
    let ambiguous = false;
    try {
      await this.adapter.pushCollections(accessToken, profileScope, rebuilt.output);
      this.markWriteAttempt(plan);
    } catch (error) {
      if (!error.ambiguous) {
        plan.status = "ready";
        this.noteAudit(plan, "apply", error.code || "REMOTE_WRITE_FAILED", currentRemoteHash, null, {
          before: remote.length,
          expected: rebuilt.output.length
        });
        throw safeError("REMOTE_WRITE_FAILED", "The Nuvio collection write failed");
      }
      // A lost response may still mean Nuvio accepted the write.
      this.markWriteAttempt(plan);
      ambiguous = true;
    } finally {
      this.activeProfiles.delete(plan.profileScopeHash);
    }

    if (ambiguous) {
      const classified = await this.classifyAmbiguousApply(plan, accessToken);
      if (classified.resultCode === "WRITE_SUCCEEDED_RESPONSE_LOST") {
        plan.status = "used";
        plan.appliedAt = new Date(this.now()).toISOString();
        this.noteAudit(plan, "apply", classified.resultCode, currentRemoteHash, classified.hash, {
          before: remote.length,
          after: classified.remote.length
        });
        return {
          success: true,
          resultCode: classified.resultCode,
          verifiedRemoteCount: classified.remote.length,
          verifiedRemoteHash: classified.hash,
          verifiedAt: plan.appliedAt
        };
      }
      plan.status = classified.resultCode === "WRITE_NOT_APPLIED" ? "ready" : "unknown";
      this.noteAudit(plan, "apply", classified.resultCode, currentRemoteHash, classified.hash, {
        before: remote.length,
        after: classified.remote ? classified.remote.length : null
      });
      throw new CollectionWriteError(
        classified.resultCode === "WRITE_NOT_APPLIED"
          ? "The write was not applied"
          : "The remote collection state is unknown",
        classified.resultCode === "WRITE_NOT_APPLIED" ? "REMOTE_WRITE_FAILED" : "ROLLBACK_REQUIRED",
        {
          writeResultCode: classified.resultCode,
          rollbackAvailable: classified.resultCode === "UNKNOWN_REMOTE_STATE" &&
            Boolean(classified.remote)
        }
      );
    }

    let after;
    try {
      after = await this.adapter.pullCollections(accessToken, profileScope);
      const afterHash = this.verifyPostWrite(
        plan,
        after,
        plan.mergedOutputHash,
        plan.expectedMergedCount,
        orderFingerprint(rebuilt.output)
      );
      if (rawArrayFingerprint(after) !== rawArrayFingerprint(rebuilt.output)) {
        throw safeError("POST_WRITE_VERIFICATION_FAILED", "Post-write content verification failed");
      }
      plan.status = "used";
      plan.appliedAt = new Date(this.now()).toISOString();
      this.noteAudit(plan, "apply", "APPLY_SUCCEEDED", currentRemoteHash, afterHash, {
        before: remote.length,
        after: after.length
      });
      return {
        success: true,
        resultCode: "APPLY_SUCCEEDED",
        verifiedRemoteCount: after.length,
        verifiedRemoteHash: afterHash,
        verifiedAt: plan.appliedAt
      };
    } catch (error) {
      plan.status = "unknown";
      this.noteAudit(plan, "apply", "POST_WRITE_VERIFICATION_FAILED", currentRemoteHash, null, {
        before: remote.length,
        after: after ? after.length : null
      });
      throw safeError("ROLLBACK_REQUIRED", "Post-write verification failed; reviewed rollback may be required");
    }
  }

  async rollback(input = {}) {
    const { accessToken, profileScope, planId, confirmation } = input;
    requireToken(accessToken);
    const plan = this.plans.get(planId);
    if (!plan) throw safeError("PLAN_NOT_FOUND", "The write plan was not found");
    if (plan.status === "rolling-back" || plan.status === "applying") {
      throw safeError("PLAN_ALREADY_APPLYING", "The write plan is already active");
    }
    if (plan.status === "rolled-back") {
      throw safeError("PLAN_ALREADY_USED", "The rollback was already used");
    }
    this.assertProfileBinding(plan, profileScope);
    const emergency = confirmation === EMERGENCY_ROLLBACK_CONFIRMATION;
    if (confirmation !== ROLLBACK_CONFIRMATION && !emergency) {
      throw safeError("AUTHENTICATION_REQUIRED", "Type the exact rollback confirmation phrase");
    }
    this.assertRateLimit(plan, true);
    await this.assertProfile(accessToken, profileScope);
    let rollbackVerification;
    try {
      rollbackVerification = verifyRollbackPackage(plan.rollbackPackage);
    } catch {
      throw safeError("INVALID_ROLLBACK_PACKAGE", "Rollback package verification failed");
    }
    if (
      canonicalHash(plan.rollbackPackage) !== plan.rollbackPackageHash ||
      !rollbackVerification.valid
    ) {
      throw safeError("INVALID_ROLLBACK_PACKAGE", "Rollback package verification failed");
    }
    const current = await this.adapter.pullCollections(accessToken, profileScope);
    const currentHash = canonicalCollectionsHash(current, "rollback-current");
    if (!emergency && currentHash !== plan.mergedOutputHash) {
      throw safeError("ROLLBACK_REQUIRED", "Current Nuvio state does not match the reviewed post-apply state");
    }
    const exactRemote = plan.rollbackPackage.exactRawRemoteArray;
    plan.status = "rolling-back";
    this.activeProfiles.add(plan.profileScopeHash);
    this.markWriteAttempt(plan, true);
    try {
      await this.adapter.pushCollections(accessToken, profileScope, exactRemote);
    } catch {
      plan.status = "unknown";
      this.activeProfiles.delete(plan.profileScopeHash);
      let afterFailure;
      try {
        afterFailure = await this.adapter.pullCollections(accessToken, profileScope);
        if (
          canonicalCollectionsHash(afterFailure, "rollback-ambiguous") === plan.remoteBaseHash &&
          rawArrayFingerprint(afterFailure) === rawArrayFingerprint(exactRemote)
        ) {
          plan.status = "rolled-back";
          this.noteAudit(plan, "rollback", "ROLLBACK_SUCCEEDED_RESPONSE_LOST", currentHash, plan.remoteBaseHash, {
            before: current.length,
            after: afterFailure.length
          });
          return {
            success: true,
            resultCode: "ROLLBACK_SUCCEEDED_RESPONSE_LOST",
            verifiedRemoteCount: afterFailure.length,
            verifiedRemoteHash: plan.remoteBaseHash,
            verifiedAt: new Date(this.now()).toISOString()
          };
        }
      } catch {}
      throw safeError("ROLLBACK_FAILED", "The rollback response was ambiguous and restoration was not verified");
    } finally {
      this.activeProfiles.delete(plan.profileScopeHash);
    }
    const restored = await this.adapter.pullCollections(accessToken, profileScope);
    const restoredHash = canonicalCollectionsHash(restored, "rollback-restored");
    if (
      restoredHash !== plan.remoteBaseHash ||
      restored.length !== plan.expectedRemoteCount ||
      orderFingerprint(restored) !== orderFingerprint(exactRemote) ||
      rawArrayFingerprint(restored) !== rawArrayFingerprint(exactRemote)
    ) {
      plan.status = "unknown";
      this.noteAudit(plan, "rollback", "ROLLBACK_FAILED", currentHash, restoredHash, {
        before: current.length,
        after: restored.length
      });
      throw safeError("ROLLBACK_FAILED", "Rollback verification failed");
    }
    plan.status = "rolled-back";
    const verifiedAt = new Date(this.now()).toISOString();
    this.noteAudit(plan, "rollback", "ROLLBACK_SUCCEEDED", currentHash, restoredHash, {
      before: current.length,
      after: restored.length
    });
    return {
      success: true,
      resultCode: "ROLLBACK_SUCCEEDED",
      verifiedRemoteCount: restored.length,
      verifiedRemoteHash: restoredHash,
      verifiedAt
    };
  }

  // Test-only inspection returns already-sanitized records and is never routed.
  getAuditRecordsForTests() {
    return clone(this.auditRecords);
  }
}

module.exports = {
  APPLY_CONFIRMATION,
  CollectionWriteError,
  EMERGENCY_ROLLBACK_CONFIRMATION,
  FixedNuvioCollectionAdapter,
  MAX_PROFILE_WRITES_PER_HOUR,
  MAX_ROLLBACK_ATTEMPTS,
  MIN_WRITE_INTERVAL_MS,
  NuvioCollectionWriteService,
  PLAN_SCHEMA_VERSION,
  PLAN_TTL_MS,
  ROLLBACK_CONFIRMATION
};
