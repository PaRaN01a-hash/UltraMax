"use strict";

const { CollectionSchemaError, COLLECTION_LIMITS } = require("./collection-schema-service");
const { compareCollections } = require("./collection-diff-service");
const {
  AddOnlyPlanError,
  buildAddOnlyPlan
} = require("./collection-add-only-service");
const {
  BackupPackageError,
  createMergeBasePackage,
  validateMergeBasePackage,
  verifyRollbackPackage
} = require("./collection-backup-package-service");
const {
  SafeMergeError,
  buildSafeMergePlan
} = require("./collection-safe-merge-service");
const {
  compareThreeWay
} = require("./collection-three-way-diff-service");
const {
  CollectionWriteError,
  NuvioCollectionWriteService
} = require("./nuvio-collection-write-service");
const {
  CollisionSafeWriteError,
  createCollisionSafeWritePlan
} = require("./collection-collision-safe-write-service");

const collectionWriteService = new NuvioCollectionWriteService();

const PHASE_2_ALLOWED_OPERATIONS = Object.freeze([
  "authenticate",
  "list-profiles",
  "pull-collections",
  "preview",
  "add-only-plan",
  "collision-safe-plan",
  "collision-safe-prepare-write-plan",
  "collision-safe-verify-write-plan",
  "collision-safe-apply",
  "collision-safe-rollback",
  "three-way-preview",
  "safe-merge-plan",
  "verify-rollback-package",
  "prepare-write-plan",
  "verify-fresh-write-plan",
  "apply-reviewed-plan",
  "rollback-reviewed-write",
  "export-json",
  "export-report",
  "export-merge-base",
  "export-rollback-package"
]);

function requestBytes(req) {
  try {
    return Buffer.byteLength(JSON.stringify(req.body || {}), "utf8");
  } catch {
    return COLLECTION_LIMITS.maxBytes + 1;
  }
}

function registerCollectionSyncRoutes(app) {
  app.get("/api/collection-sync/capabilities", (_req, res) => {
    res.json({
      phase: "4B",
      readOnly: false,
      allowedOperations: PHASE_2_ALLOWED_OPERATIONS,
      writeOperations: [
        "apply-reviewed-plan",
        "rollback-reviewed-write",
        "collision-safe-apply",
        "collision-safe-rollback"
      ]
    });
  });

  app.post("/api/collection-sync/preview", (req, res) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    const actualRequestBytes = requestBytes(req);
    if (
      contentLength > COLLECTION_LIMITS.maxBytes ||
      actualRequestBytes > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Comparison input exceeds 2 MiB",
        code: "OVERSIZED_INPUT",
        readOnly: true
      });
    }

    const {
      localCollections,
      remoteCollections,
      ultraMaxProfileLabel,
      nuvioProfileLabel,
      nuvioProfileId
    } = req.body || {};

    try {
      const comparison = compareCollections(localCollections, remoteCollections, {
        ultraMaxProfileLabel,
        nuvioProfileLabel,
        nuvioProfileId
      });
      const encodedComparison = JSON.stringify(comparison);
      if (Buffer.byteLength(encodedComparison, "utf8") > COLLECTION_LIMITS.maxBytes) {
        return res.status(413).json({
          error: "Comparison result exceeds 2 MiB",
          code: "OVERSIZED_OUTPUT",
          readOnly: true
        });
      }
      return res.type("application/json").send(encodedComparison);
    } catch (error) {
      if (error instanceof CollectionSchemaError) {
        return res.status(error.code === "OVERSIZED_INPUT" ? 413 : 400).json({
          error: error.message,
          code: error.code,
          details: error.details,
          readOnly: true
        });
      }
      console.error("[collection-compare] preview failed:", error.message);
      return res.status(500).json({
        error: "Could not generate collection comparison",
        code: "PREVIEW_FAILED",
        readOnly: true
      });
    }
  });

  app.post("/api/collection-sync/add-only-plan", (req, res) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (
      contentLength > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Add Only input exceeds 2 MiB",
        code: "OVERSIZED_INPUT",
        readOnly: true
      });
    }

    try {
      const plan = buildAddOnlyPlan(req.body || {});
      return res.type("application/json").send(JSON.stringify(plan));
    } catch (error) {
      if (error instanceof CollectionSchemaError || error instanceof AddOnlyPlanError) {
        console.error("[collection-add-only] validation failed:", {
          code: error.code,
          details: error.details || null
        });
        const oversized =
          error.code === "OVERSIZED_INPUT" || error.code === "OVERSIZED_OUTPUT";
        return res.status(oversized ? 413 : 409).json({
          error: error.message,
          code: error.code,
          details: error.details,
          readOnly: true
        });
      }
      console.error("[collection-add-only] plan failed:", error.message);
      return res.status(500).json({
        error: "Could not generate Add Only plan",
        code: "ADD_ONLY_PLAN_FAILED",
        readOnly: true
      });
    }
  });

  app.post("/api/collection-sync/collision-safe-plan", (req, res) => {
    const contentLength = Number(req.headers["content-length"] || 0);

    if (
      contentLength > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Collision-safe plan input exceeds 2 MiB",
        code: "OVERSIZED_INPUT",
        readOnly: true
      });
    }

    try {
      const plan = createCollisionSafeWritePlan(req.body || {});

      // Deliberately return only review-safe metadata. The exact remote,
      // local and expected-output arrays remain server-side data and are
      // never exposed through this planning endpoint.
      return res.json({
        readOnly: true,
        mode: plan.mode,
        collisionSafeWriteSchemaVersion:
          plan.collisionSafeWriteSchemaVersion,
        profileScope: plan.profileScope,
        targetProfileLabel: plan.targetProfileLabel,
        selectedLocalIds: plan.selectedLocalIds,
        hashes: plan.hashes,
        counts: plan.counts
      });
    } catch (error) {
      if (
        error instanceof CollisionSafeWriteError ||
        error.code
      ) {
        console.error(
          "[collection-collision-safe-plan] failed:",
          error.code || error.message
        );

        return res.status(409).json({
          error:
            error.message ||
            "Could not prepare collision-safe collection plan",
          code:
            error.code ||
            "COLLISION_SAFE_WRITE_FAILED",
          details: error.details || null,
          readOnly: true
        });
      }

      console.error(
        "[collection-collision-safe-plan] failed:",
        error.message
      );

      return res.status(500).json({
        error: "Could not prepare collision-safe collection plan",
        code: "COLLISION_SAFE_WRITE_FAILED",
        readOnly: true
      });
    }
  });

  app.post("/api/collection-sync/three-way-preview", (req, res) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (
      contentLength > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Three-way comparison input exceeds 2 MiB",
        code: "OVERSIZED_INPUT",
        readOnly: true
      });
    }
    try {
      const {
        mergeBasePackage,
        localCollections,
        remoteCollections,
        profileScope
      } = req.body || {};
      const base = mergeBasePackage
        ? validateMergeBasePackage(mergeBasePackage, profileScope)
        : createMergeBasePackage({
            localCollections,
            remoteCollections,
            ultraMaxProfileScope: req.body && req.body.ultraMaxProfileScope,
            nuvioProfileScope: profileScope
          });
      const comparison = compareThreeWay({
        baseLocalCollections: base.exactLocalExportArray,
        baseRemoteCollections: base.exactRemoteBackupArray,
        localCollections,
        remoteCollections
      });
      return res.json({
        readOnly: true,
        mode: "three-way-preview",
        mergeBasePackage: base,
        comparison
      });
    } catch (error) {
      const code = error.code || "INVALID_COLLECTION_DATA";
      return res.status(409).json({
        error: error.message || "Could not generate three-way comparison",
        code,
        readOnly: true
      });
    }
  });

  app.post("/api/collection-sync/safe-merge-plan", (req, res) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (
      contentLength > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Safe Merge input exceeds 2 MiB",
        code: "OVERSIZED_INPUT",
        readOnly: true
      });
    }
    try {
      return res.json(buildSafeMergePlan(req.body || {}));
    } catch (error) {
      if (error instanceof SafeMergeError || error instanceof BackupPackageError) {
        return res.status(409).json({
          error: error.message,
          code: error.code,
          details: error.details,
          readOnly: true
        });
      }
      console.error("[collection-safe-merge] plan failed:", error.message);
      return res.status(500).json({
        error: "Could not generate Safe Merge plan",
        code: "SAFE_MERGE_PLAN_FAILED",
        readOnly: true
      });
    }
  });

  app.post("/api/collection-sync/verify-rollback-package", (req, res) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (
      contentLength > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Rollback package exceeds 2 MiB",
        code: "OVERSIZED_INPUT",
        readOnly: true
      });
    }
    try {
      return res.json(verifyRollbackPackage((req.body || {}).rollbackPackage));
    } catch (error) {
      return res.status(409).json({
        error: error.message || "Rollback package is invalid",
        code: "INVALID_ROLLBACK_PACKAGE",
        readOnly: true
      });
    }
  });

  function writeErrorResponse(res, error) {
    const status =
      error.code === "AUTHENTICATION_REQUIRED" ? 401 :
      error.code === "RATE_LIMITED" ? 429 :
      error.code === "PLAN_NOT_FOUND" ? 404 :
      409;
    return res.status(status).json({
      error: error.message || "The guarded collection operation failed",
      code: error.code || "REMOTE_WRITE_FAILED"
    });
  }

  // DEV trace for the write pipeline: which endpoint, which numeric
  // profile, how many collections, and the outcome. Deliberately safe —
  // never the access token, never collection titles/folder content (see
  // nuvio-collection-write-service.js's own no-console-logging policy and
  // its "token and raw payload are absent from errors and audit records"
  // test; this route-layer trace holds itself to the same standard).
  function logWritePipeline(label, req, extra) {
    const body = req.body || {};
    console.log(
      `[collection-sync:${label}] profileScope=${body.profileScope} planId=${body.planId || "n/a"} ` +
      `collectionCount=${Array.isArray(body.currentLocalCollections) ? body.currentLocalCollections.length : "n/a"}` +
      (extra ? ` ${extra}` : "")
    );
  }

  app.post("/api/collection-sync/collision-safe-prepare-write-plan", async (req, res) => {
    if (
      Number(req.headers["content-length"] || 0) > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Collision-safe write plan input exceeds 2 MiB",
        code: "OVERSIZED_INPUT",
        readOnly: true
      });
    }

    try {
      const plan = await collectionWriteService.prepareCollisionSafeWritePlan(
        req.body || {}
      );

      console.log(
        `[collection-sync:collision-safe-prepare] planId=${plan.planId} additions=${plan.summary.additions} resultingCount=${plan.summary.resultingCount}`
      );

      return res.json(plan);
    } catch (error) {
      console.error(
        `[collection-sync:collision-safe-prepare] PIPELINE STOPPED — ${error.code || "unknown"}: ${error.message}`
      );

      return writeErrorResponse(res, error);
    }
  });

  app.post("/api/collection-sync/collision-safe-verify-write-plan", async (req, res) => {
    try {
      const result =
        await collectionWriteService.verifyCollisionSafeWritePlan(
          req.body || {}
        );

      console.log(
        "[collection-sync:collision-safe-verify] verified=true"
      );

      return res.json(result);
    } catch (error) {
      console.error(
        `[collection-sync:collision-safe-verify] PIPELINE STOPPED — ${error.code || "unknown"}: ${error.message}`
      );

      return writeErrorResponse(res, error);
    }
  });

  app.post("/api/collection-sync/collision-safe-apply", async (req, res) => {
    if (
      Number(req.headers["content-length"] || 0) > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Collision-safe apply input exceeds 2 MiB",
        code: "OVERSIZED_INPUT"
      });
    }

    logWritePipeline("collision-safe-apply", req);

    try {
      const result =
        await collectionWriteService.applyCollisionSafeWritePlan(
          req.body || {}
        );

      console.log(
        `[collection-sync:collision-safe-apply] SUCCEEDED resultCode=${result.resultCode} verifiedRemoteCount=${result.verifiedRemoteCount}`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        `[collection-sync:collision-safe-apply] PIPELINE STOPPED — ${error.code || "unknown"}: ${error.message}`
      );

      return writeErrorResponse(res, error);
    }
  });

  app.post("/api/collection-sync/collision-safe-rollback", async (req, res) => {
    if (
      Number(req.headers["content-length"] || 0) > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({
        error: "Collision-safe rollback input exceeds 2 MiB",
        code: "OVERSIZED_INPUT"
      });
    }

    logWritePipeline("collision-safe-rollback", req);

    try {
      const result =
        await collectionWriteService.rollbackCollisionSafeWritePlan(
          req.body || {}
        );

      console.log(
        `[collection-sync:collision-safe-rollback] SUCCEEDED resultCode=${result.resultCode} verifiedRemoteCount=${result.verifiedRemoteCount}`
      );

      return res.json(result);
    } catch (error) {
      console.error(
        `[collection-sync:collision-safe-rollback] PIPELINE STOPPED — ${error.code || "unknown"}: ${error.message}`
      );

      return writeErrorResponse(res, error);
    }
  });

  app.post("/api/collection-sync/prepare-write-plan", async (req, res) => {
    if (
      Number(req.headers["content-length"] || 0) > COLLECTION_LIMITS.maxBytes ||
      requestBytes(req) > COLLECTION_LIMITS.maxBytes
    ) {
      return res.status(413).json({ error: "Write plan input exceeds 2 MiB", code: "OVERSIZED_INPUT" });
    }
    try {
      const plan = await collectionWriteService.prepareWritePlan(req.body || {});
      console.log(`[collection-sync:prepare-write-plan] planId=${plan.planId} additions=${plan.summary.additions} resultingCount=${plan.summary.resultingCount}`);
      return res.json(plan);
    } catch (error) {
      console.error("[collection-sync:prepare-write-plan] failed:", error.code || error.message);
      if (error instanceof CollectionWriteError || error.code) {
        return writeErrorResponse(res, error);
      }
      return writeErrorResponse(
        res,
        new CollectionWriteError("Could not prepare the guarded write plan", "OUTPUT_HASH_MISMATCH")
      );
    }
  });

  app.post("/api/collection-sync/verify-write-plan", async (req, res) => {
    logWritePipeline("verify-write-plan", req);
    try {
      const result = await collectionWriteService.verifyFreshState(req.body || {});
      console.log("[collection-sync:verify-write-plan] verified=true");
      return res.json(result);
    } catch (error) {
      console.error(`[collection-sync:verify-write-plan] PIPELINE STOPPED — ${error.code || "unknown"}: ${error.message}`);
      return writeErrorResponse(res, error);
    }
  });

  app.post("/api/collection-sync/apply", async (req, res) => {
    logWritePipeline("apply", req);
    try {
      const result = await collectionWriteService.apply(req.body || {});
      console.log(
        `[collection-sync:apply] SUCCEEDED resultCode=${result.resultCode} verifiedRemoteCount=${result.verifiedRemoteCount}`
      );
      return res.json(result);
    } catch (error) {
      console.error(`[collection-sync:apply] PIPELINE STOPPED — ${error.code || "unknown"}: ${error.message}`);
      return writeErrorResponse(res, error);
    }
  });

  app.post("/api/collection-sync/rollback", async (req, res) => {
    try {
      return res.json(await collectionWriteService.rollback(req.body || {}));
    } catch (error) {
      return writeErrorResponse(res, error);
    }
  });
}

module.exports = {
  PHASE_2_ALLOWED_OPERATIONS,
  registerCollectionSyncRoutes
};
