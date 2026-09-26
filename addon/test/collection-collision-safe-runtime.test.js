"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  APPLY_CONFIRMATION,
  ROLLBACK_CONFIRMATION,
  NuvioCollectionWriteService
} = require("../services/nuvio-collection-write-service");

function collection(id, title, folders = []) {
  return {
    id,
    title,
    folders,
    pinToTop: false,
    showAllTab: true,
    viewMode: "FOLLOW_LAYOUT",
    focusGlowEnabled: true
  };
}

function folder(id, title) {
  return {
    id,
    title,
    tileShape: "LANDSCAPE",
    hideTitle: false,
    focusGifEnabled: false,
    coverImageUrl: "",
    focusGifUrl: "",
    heroBackdropUrl: "",
    catalogSources: []
  };
}

function fixture() {
  return {
    remote: [
      collection("remote-a", "Remote A", [
        folder("folder-a", "A")
      ]),
      collection("duplicate-id", "Duplicate one", [
        folder("dup-a", "One")
      ]),
      collection("duplicate-id", "Duplicate two", [
        folder("dup-b", "Two")
      ]),
      collection("remote-b", "Remote B", [
        folder("folder-b", "B")
      ])
    ],
    local: [
      collection("remote-a", "Remote A", [
        folder("folder-a", "A")
      ]),
      collection("new-ultramax", "New Ultra MAX", [
        folder("folder-new", "New")
      ])
    ]
  };
}

function fakeAdapter(remote) {
  return {
    async listProfiles() {
      return [{ profile_index: 5, name: "Test profile" }];
    },

    async pullCollections() {
      return structuredClone(remote);
    },

    async pushCollections() {
      throw new Error("pushCollections must not be called by these tests");
    }
  };
}

async function reviewedHashes(remote, local) {
  const {
    createCollisionSafeWritePlan
  } = require("../services/collection-collision-safe-write-service");

  return createCollisionSafeWritePlan({
    profileScope: 5,
    targetProfileLabel: "Test profile",
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  }).hashes;
}

test("collision-safe runtime prepares a private expiring plan without exposing raw arrays", async () => {
  const { remote, local } = fixture();

  const service = new NuvioCollectionWriteService({
    adapter: fakeAdapter(remote),
    now: () => 1_000_000,
    randomId: () => "collision-plan-1"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local),
    targetProfileLabel: "Test profile"
  });

  assert.equal(plan.readOnly, true);
  assert.equal(plan.mode, "collision-safe-add");
  assert.equal(plan.planId, "collision-plan-1");
  assert.equal(plan.summary.currentRemoteCount, 4);
  assert.equal(plan.summary.additions, 1);
  assert.equal(plan.summary.resultingCount, 5);
  assert.equal(plan.summary.backupVerified, true);
  assert.equal(plan.summary.unresolvedConflicts, 0);

  assert.equal(
    Object.prototype.hasOwnProperty.call(plan, "exactRemoteBefore"),
    false
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(plan, "exactExpectedOutput"),
    false
  );
});

test("collision-safe runtime fresh-state verification succeeds without writing", async () => {
  const { remote, local } = fixture();

  const service = new NuvioCollectionWriteService({
    adapter: fakeAdapter(remote),
    now: () => 1_000_000,
    randomId: () => "collision-plan-2"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  const result = await service.verifyCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    planId: plan.planId,
    currentLocalCollections: local
  });

  assert.equal(result.verified, true);
  assert.equal(result.readOnly, true);
  assert.equal(result.plan.planId, plan.planId);
});

test("collision-safe runtime rejects a changed remote state", async () => {
  const { remote, local } = fixture();

  const mutableRemote = structuredClone(remote);

  const adapter = {
    async listProfiles() {
      return [{ profile_index: 5 }];
    },

    async pullCollections() {
      return structuredClone(mutableRemote);
    }
  };

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => 1_000_000,
    randomId: () => "collision-plan-3"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  mutableRemote[3].title = "Changed after review";

  await assert.rejects(
    () =>
      service.verifyCollisionSafeWritePlan({
        accessToken: "test-token",
        profileScope: 5,
        planId: plan.planId,
        currentLocalCollections: local
      }),
    error => error.code === "STALE_REMOTE_HASH"
  );
});

test("collision-safe runtime rejects a changed local state", async () => {
  const { remote, local } = fixture();

  const service = new NuvioCollectionWriteService({
    adapter: fakeAdapter(remote),
    now: () => 1_000_000,
    randomId: () => "collision-plan-4"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  const changedLocal = structuredClone(local);
  changedLocal[1].title = "Changed after review";

  await assert.rejects(
    () =>
      service.verifyCollisionSafeWritePlan({
        accessToken: "test-token",
        profileScope: 5,
        planId: plan.planId,
        currentLocalCollections: changedLocal
      }),
    error => error.code === "STALE_LOCAL_HASH"
  );
});


function statefulAdapter(initialRemote, options = {}) {
  let remote = structuredClone(initialRemote);
  const pushes = [];
  let pushMode = options.pushMode || "success";

  return {
    pushes,

    async listProfiles() {
      return [{ profile_index: 5, name: "Test profile" }];
    },

    async pullCollections() {
      return structuredClone(remote);
    },

    async pushCollections(_accessToken, _profileScope, collections) {
      pushes.push(structuredClone(collections));

      if (pushMode === "ambiguous-success") {
        remote = structuredClone(collections);
        const error = new Error("Synthetic lost response");
        error.ambiguous = true;
        throw error;
      }

      if (pushMode === "ambiguous-not-applied") {
        const error = new Error("Synthetic lost response");
        error.ambiguous = true;
        throw error;
      }

      if (pushMode === "hard-failure") {
        const error = new Error("Synthetic write failure");
        error.code = "REMOTE_WRITE_FAILED";
        throw error;
      }

      remote = structuredClone(collections);
    },

    setRemote(value) {
      remote = structuredClone(value);
    },

    setPushMode(value) {
      pushMode = value;
    },

    getRemote() {
      return structuredClone(remote);
    }
  };
}

test("collision-safe runtime applies the exact reviewed output", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote);

  let now = 1_000_000;

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => now,
    randomId: () => "collision-apply-1"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local),
    targetProfileLabel: "Test profile"
  });

  const result = await service.applyCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    planId: plan.planId,
    currentLocalCollections: local,
    confirmation: APPLY_CONFIRMATION
  });

  assert.equal(result.success, true);
  assert.equal(result.resultCode, "APPLY_SUCCEEDED");
  assert.equal(result.verifiedRemoteCount, 5);

  assert.equal(adapter.pushes.length, 1);

  // Every existing Nuvio entry, including both different duplicate-ID
  // copies, must remain byte-for-byte-equivalent JSON in the same order.
  assert.deepEqual(
    adapter.pushes[0].slice(0, remote.length),
    remote
  );

  assert.deepEqual(
    adapter.pushes[0][remote.length],
    local[1]
  );

  assert.deepEqual(
    adapter.getRemote(),
    adapter.pushes[0]
  );
});

test("collision-safe runtime refuses stale remote state before any push", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote);

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => 1_000_000,
    randomId: () => "collision-apply-stale"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  const changedRemote = structuredClone(remote);
  changedRemote[3].title = "Changed in Nuvio after review";
  adapter.setRemote(changedRemote);

  await assert.rejects(
    () =>
      service.applyCollisionSafeWritePlan({
        accessToken: "test-token",
        profileScope: 5,
        planId: plan.planId,
        currentLocalCollections: local,
        confirmation: APPLY_CONFIRMATION
      }),
    error => error.code === "STALE_REMOTE_HASH"
  );

  assert.equal(adapter.pushes.length, 0);
});

test("collision-safe runtime refuses stale local state before any push", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote);

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => 1_000_000,
    randomId: () => "collision-apply-local-stale"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  const changedLocal = structuredClone(local);
  changedLocal[1].title = "Changed locally after review";

  await assert.rejects(
    () =>
      service.applyCollisionSafeWritePlan({
        accessToken: "test-token",
        profileScope: 5,
        planId: plan.planId,
        currentLocalCollections: changedLocal,
        confirmation: APPLY_CONFIRMATION
      }),
    error => error.code === "STALE_LOCAL_HASH"
  );

  assert.equal(adapter.pushes.length, 0);
});

test("collision-safe runtime identifies ambiguous response when write actually succeeded", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote, {
    pushMode: "ambiguous-success"
  });

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => 1_000_000,
    randomId: () => "collision-ambiguous-success"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  const result = await service.applyCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    planId: plan.planId,
    currentLocalCollections: local,
    confirmation: APPLY_CONFIRMATION
  });

  assert.equal(result.success, true);
  assert.equal(
    result.resultCode,
    "WRITE_SUCCEEDED_RESPONSE_LOST"
  );

  assert.equal(adapter.pushes.length, 1);
  assert.equal(adapter.getRemote().length, 5);
});

test("collision-safe runtime identifies ambiguous response when write was not applied", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote, {
    pushMode: "ambiguous-not-applied"
  });

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => 1_000_000,
    randomId: () => "collision-ambiguous-no-write"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  await assert.rejects(
    () =>
      service.applyCollisionSafeWritePlan({
        accessToken: "test-token",
        profileScope: 5,
        planId: plan.planId,
        currentLocalCollections: local,
        confirmation: APPLY_CONFIRMATION
      }),
    error => error.code === "REMOTE_WRITE_FAILED"
  );

  assert.equal(adapter.pushes.length, 1);
  assert.deepEqual(adapter.getRemote(), remote);
});

test("collision-safe runtime rollback restores the exact original Nuvio array", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote);

  let now = 1_000_000;

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => now,
    randomId: () => "collision-rollback-1"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  const applied = await service.applyCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    planId: plan.planId,
    currentLocalCollections: local,
    confirmation: APPLY_CONFIRMATION
  });

  assert.equal(applied.success, true);
  assert.equal(adapter.pushes.length, 1);

  // Move beyond the production minimum write interval.
  now += 11_000;

  const rolledBack =
    await service.rollbackCollisionSafeWritePlan({
      accessToken: "test-token",
      profileScope: 5,
      planId: plan.planId,
      confirmation: ROLLBACK_CONFIRMATION
    });

  assert.equal(rolledBack.success, true);
  assert.equal(
    rolledBack.resultCode,
    "ROLLBACK_SUCCEEDED"
  );

  assert.equal(adapter.pushes.length, 2);

  // The rollback payload itself must be exactly the raw pre-write array.
  assert.deepEqual(adapter.pushes[1], remote);
  assert.deepEqual(adapter.getRemote(), remote);
});

test("collision-safe rollback refuses an unexpected current Nuvio state", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote);

  let now = 1_000_000;

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => now,
    randomId: () => "collision-rollback-drift"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  await service.applyCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    planId: plan.planId,
    currentLocalCollections: local,
    confirmation: APPLY_CONFIRMATION
  });

  const drifted = adapter.getRemote();
  drifted[0].title = "Changed after Ultra MAX write";
  adapter.setRemote(drifted);

  now += 11_000;

  await assert.rejects(
    () =>
      service.rollbackCollisionSafeWritePlan({
        accessToken: "test-token",
        profileScope: 5,
        planId: plan.planId,
        confirmation: ROLLBACK_CONFIRMATION
      }),
    error => error.code === "ROLLBACK_REQUIRED"
  );

  // Only the original apply may have written.
  assert.equal(adapter.pushes.length, 1);
});

test("collision-safe rollback preserves both different duplicate-ID entries exactly", async () => {
  const { remote, local } = fixture();
  const adapter = statefulAdapter(remote);

  let now = 1_000_000;

  const service = new NuvioCollectionWriteService({
    adapter,
    now: () => now,
    randomId: () => "collision-rollback-duplicates"
  });

  const plan = await service.prepareCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    currentLocalCollections: local,
    selectedLocalIds: ["new-ultramax"],
    expectedReviewHashes: await reviewedHashes(remote, local)
  });

  await service.applyCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    planId: plan.planId,
    currentLocalCollections: local,
    confirmation: APPLY_CONFIRMATION
  });

  now += 11_000;

  await service.rollbackCollisionSafeWritePlan({
    accessToken: "test-token",
    profileScope: 5,
    planId: plan.planId,
    confirmation: ROLLBACK_CONFIRMATION
  });

  const restored = adapter.getRemote();

  assert.deepEqual(restored[1], remote[1]);
  assert.deepEqual(restored[2], remote[2]);
  assert.notDeepEqual(restored[1], restored[2]);
});
