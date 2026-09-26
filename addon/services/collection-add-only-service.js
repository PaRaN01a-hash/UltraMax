"use strict";

const {
  COLLECTION_LIMITS,
  CollectionSchemaError,
  canonicalHash,
  validateCollections
} = require("./collection-schema-service");
const { compareCollections } = require("./collection-diff-service");

const REPORT_SCHEMA_VERSION = 1;
const ELIGIBLE_CLASSIFICATION = "Local Only";
const EXCLUSION_REASONS = Object.freeze({
  "Exact Match": {
    code: "EXACT_MATCH",
    message: "Already present in Nuvio with matching content."
  },
  Changed: {
    code: "CHANGED",
    message: "The same stable ID exists in Nuvio with different content."
  },
  "Remote Only": {
    code: "NUVIO_ONLY",
    message: "Exists only in Nuvio and is never changed by Add Only."
  },
  "Possible Duplicate": {
    code: "POSSIBLE_DUPLICATE",
    message: "A structurally similar Nuvio collection has a different ID; review it outside Add Only."
  },
  "ID Collision": {
    code: "ID_COLLISION",
    message: "A collection or folder ID is duplicated."
  },
  Invalid: {
    code: "INVALID",
    message: "The collection does not pass schema validation."
  }
});

class AddOnlyPlanError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = "AddOnlyPlanError";
    this.code = code || "ADD_ONLY_PLAN_INVALID";
    this.details = details || null;
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeLabel(value, fallback) {
  return String(value || fallback).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 120);
}

function maskedScope(scope) {
  return `scope-${canonicalHash(String(scope)).slice(0, 12)}`;
}

function assertUniqueIds(ids, code, message) {
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) throw new AddOnlyPlanError(message, code, { idFingerprint: canonicalHash(id) });
    seen.add(id);
  }
}

function assertValid(validation, side) {
  if (validation.valid) return;
  const errorCodes = validation.entries.flatMap(entry => [
    ...entry.errors.map(error => error.code),
    ...(entry.collision ? ["ID_COLLISION"] : [])
  ]);
  throw new AddOnlyPlanError(
    `${side} collections failed validation`,
    side === "remote"
      ? "REMOTE_VALIDATION_FAILED"
      : side === "output"
        ? "OUTPUT_VALIDATION_FAILED"
        : "LOCAL_VALIDATION_FAILED",
    { errorCodes }
  );
}

function counts(collection) {
  const folders = Array.isArray(collection.folders) ? collection.folders : [];
  return {
    folderCount: folders.length,
    sourceCount: folders.reduce(
      (total, folder) =>
        total +
        (Array.isArray(folder.sources) ? folder.sources.length : 0) +
        (Array.isArray(folder.catalogSources) ? folder.catalogSources.length : 0),
      0
    )
  };
}

function determineEligibility(comparison) {
  const eligible = [];
  const excluded = [];
  for (const item of comparison.items || []) {
    if (item.classification === ELIGIBLE_CLASSIFICATION) {
      const collection = comparison.localCollections[item.localIndex];
      eligible.push({
        id: item.id,
        title: item.title,
        localIndex: item.localIndex,
        fingerprint: item.localHash,
        validationStatus: "Valid",
        ...counts(collection)
      });
      continue;
    }
    const reason = EXCLUSION_REASONS[item.classification] || EXCLUSION_REASONS.Invalid;
    excluded.push({
      classification: item.classification === "Remote Only" ? "Nuvio Only" : item.classification,
      title: item.title || "Invalid collection",
      fingerprint: item.localHash || item.remoteHash || null,
      reasonCode: reason.code,
      reason: reason.message
    });
  }
  return { eligible, excluded };
}

function validateRequestSize(input) {
  let bytes;
  try {
    bytes = Buffer.byteLength(JSON.stringify(input), "utf8");
  } catch {
    throw new AddOnlyPlanError("Add Only input is not valid JSON", "MALFORMED_INPUT");
  }
  if (bytes > COLLECTION_LIMITS.maxBytes) {
    throw new AddOnlyPlanError("Add Only input exceeds 2 MiB", "OVERSIZED_INPUT");
  }
}

function buildAddOnlyPlan(input = {}) {
  validateRequestSize(input);
  const {
    localCollections,
    remoteCollections,
    selectedLocalIds,
    generatedAt,
    ultraMaxProfileLabel,
    nuvioProfileLabel,
    profileScope,
    expectedProfileScope,
    expectedRemoteHash,
    localBaseHash
  } = input;

  if (!Array.isArray(localCollections) || !Array.isArray(remoteCollections)) {
    throw new AddOnlyPlanError("Local and remote collections must be arrays", "MALFORMED_ARRAYS");
  }
  if (selectedLocalIds !== undefined && !Array.isArray(selectedLocalIds)) {
    throw new AddOnlyPlanError("Selected collection IDs must be an array", "MALFORMED_SELECTION");
  }
  if (profileScope === undefined || profileScope === null || String(profileScope).trim() === "") {
    throw new AddOnlyPlanError("A selected Nuvio profile scope is required", "MISSING_PROFILE_SCOPE");
  }
  if (
    expectedProfileScope !== undefined &&
    String(expectedProfileScope) !== String(profileScope)
  ) {
    throw new AddOnlyPlanError("The selected Nuvio profile changed", "PROFILE_SCOPE_CHANGED");
  }

  const localValidation = validateCollections(localCollections, { side: "local" });
  const remoteValidation = validateCollections(remoteCollections, { side: "remote" });

  if (!remoteValidation.valid) {
    const duplicateGroups = new Map();

    remoteCollections.forEach((collection, index) => {
      if (!collection || typeof collection.id !== "string" || !collection.id) return;
      if (!duplicateGroups.has(collection.id)) duplicateGroups.set(collection.id, []);
      duplicateGroups.get(collection.id).push({
        index,
        fingerprint: canonicalHash(collection)
      });
    });

    const duplicateDiagnostics = Array.from(duplicateGroups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([id, items]) => ({
        idFingerprint: canonicalHash(id).slice(0, 12),
        copies: items.length,
        identical: new Set(items.map(item => item.fingerprint)).size === 1
      }));

    if (duplicateDiagnostics.length) {
      console.error("[collection-add-only] duplicate remote collection ids:", duplicateDiagnostics);
    }
  }
  assertValid(localValidation, "local");
  assertValid(remoteValidation, "remote");

  const remoteIds = remoteCollections.map(collection => collection.id);
  assertUniqueIds(remoteIds, "DUPLICATE_REMOTE_IDS", "Nuvio contains duplicate collection IDs");

  const currentRemoteHash = canonicalHash(remoteValidation.entries.map(entry => entry.canonical));
  const currentLocalHash = canonicalHash(localValidation.entries.map(entry => entry.canonical));
  if (expectedRemoteHash && expectedRemoteHash !== currentRemoteHash) {
    throw new AddOnlyPlanError(
      "Nuvio collections changed after this plan was created. Refresh the comparison.",
      "STALE_REMOTE_HASH",
      { expectedRemoteHash, currentRemoteHash }
    );
  }

  const comparison = compareCollections(localCollections, remoteCollections, {
    generatedAt,
    ultraMaxProfileLabel,
    nuvioProfileLabel
  });
  comparison.localCollections = localCollections;
  const eligibility = determineEligibility(comparison);
  const eligibleIds = new Set(eligibility.eligible.map(item => item.id));
  const selections =
    selectedLocalIds === undefined
      ? eligibility.eligible.map(item => item.id)
      : selectedLocalIds.map(id => String(id));

  assertUniqueIds(
    selections,
    "DUPLICATE_SELECTED_IDS",
    "The selected collection list contains duplicate IDs"
  );
  const remoteIdSet = new Set(remoteIds);
  for (const id of selections) {
    if (remoteIdSet.has(id)) {
      throw new AddOnlyPlanError(
        "A selected collection ID already exists in Nuvio",
        "SELECTED_ID_ALREADY_REMOTE",
        { idFingerprint: canonicalHash(id) }
      );
    }
    if (!localCollections.some(collection => collection.id === id)) {
      throw new AddOnlyPlanError(
        "A selected collection disappeared from the current Ultra MAX setup",
        "SELECTED_LOCAL_REMOVED",
        { idFingerprint: canonicalHash(id) }
      );
    }
    if (!eligibleIds.has(id)) {
      throw new AddOnlyPlanError(
        "A selected collection is no longer Local Only",
        "SELECTED_NOT_LOCAL_ONLY",
        { idFingerprint: canonicalHash(id) }
      );
    }
  }

  const selectionSet = new Set(selections);
  const additions = localCollections.filter(collection => selectionSet.has(collection.id));
  if (additions.length !== selections.length) {
    throw new AddOnlyPlanError("Selected collections could not be resolved uniquely", "SELECTION_MISMATCH");
  }

  const output = cloneJson(remoteCollections).concat(cloneJson(additions));
  const outputValidation = validateCollections(output, { side: "output" });
  assertValid(outputValidation, "output");
  const outputHash = canonicalHash(output);
  const timestamp = generatedAt || new Date().toISOString();
  const report = {
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    mode: "add-only",
    generatedAt: timestamp,
    ultraMaxProfileLabel: safeLabel(ultraMaxProfileLabel, "Base setup"),
    nuvioProfileLabel: safeLabel(nuvioProfileLabel, maskedScope(profileScope)),
    nuvioProfileScope: maskedScope(profileScope),
    remoteBaseHash: expectedRemoteHash || currentRemoteHash,
    localBaseHash: localBaseHash || currentLocalHash,
    outputHash,
    remoteCollectionCount: remoteCollections.length,
    eligibleCount: eligibility.eligible.length,
    selectedCount: additions.length,
    excludedCount: eligibility.excluded.length,
    selectedItemFingerprints: additions.map(collection => canonicalHash(collection)),
    exclusionReasonCodes: eligibility.excluded.map(item => item.reasonCode),
    validationResults: {
      local: { valid: true, ...localValidation.counts, canonicalHash: currentLocalHash },
      remote: { valid: true, ...remoteValidation.counts, canonicalHash: currentRemoteHash },
      output: { valid: true, ...outputValidation.counts, canonicalHash: outputHash }
    }
  };

  if (Buffer.byteLength(JSON.stringify(output), "utf8") > COLLECTION_LIMITS.maxBytes) {
    throw new AddOnlyPlanError("Add Only output exceeds 2 MiB", "OVERSIZED_OUTPUT");
  }

  return {
    readOnly: true,
    mode: "add-only",
    generatedAt: timestamp,
    hashes: { remote: currentRemoteHash, local: currentLocalHash, output: outputHash },
    summary: {
      existingRemote: remoteCollections.length,
      eligible: eligibility.eligible.length,
      selected: additions.length,
      excluded: eligibility.excluded.length,
      final: output.length
    },
    eligible: eligibility.eligible,
    excluded: eligibility.excluded,
    output,
    report
  };
}

module.exports = {
  AddOnlyPlanError,
  ELIGIBLE_CLASSIFICATION,
  EXCLUSION_REASONS,
  REPORT_SCHEMA_VERSION,
  buildAddOnlyPlan,
  determineEligibility
};
