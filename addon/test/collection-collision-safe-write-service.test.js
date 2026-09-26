"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CollisionSafeWriteError,
  createCollisionSafeWritePlan,
  verifyCollisionSafeFreshState,
  verifyCollisionSafePostWrite,
  rollbackCandidate
} = require("../services/collection-collision-safe-write-service");

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
  const remote = [
    collection("remote-a", "Remote A", [
      folder("folder-a", "A")
    ]),
    collection("duplicate-id", "Duplicate one", [
      folder("dup-folder-a", "One")
    ]),
    collection("duplicate-id", "Duplicate two", [
      folder("dup-folder-b", "Two")
    ]),
    collection("remote-b", "Remote B", [
      folder("folder-b", "B")
    ])
  ];

  const local = [
    collection("remote-a", "Remote A", [
      folder("folder-a", "A")
    ]),
    collection("new-ultramax", "New Ultra MAX", [
      folder("folder-new", "New")
    ])
  ];

  return { remote, local };
}

test("creates a guarded write plan while preserving exact remote state", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    targetProfileLabel: "Test profile",
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  assert.equal(plan.mode, "collision-safe-add");
  assert.equal(plan.profileScope, "5");
  assert.equal(plan.counts.remoteBefore, 4);
  assert.equal(plan.counts.additions, 1);
  assert.equal(plan.counts.expectedOutput, 5);
  assert.equal(plan.counts.protectedRemoteEntries, 2);

  assert.deepEqual(plan.exactRemoteBefore, remote);
  assert.deepEqual(plan.exactExpectedOutput.slice(0, 4), remote);
  assert.deepEqual(plan.exactExpectedOutput[4], local[1]);
});

test("fresh-state verification rebuilds exactly the reviewed output", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  const verified = verifyCollisionSafeFreshState({
    plan,
    profileScope: 5,
    currentLocalCollections: local,
    freshRemoteCollections: remote
  });

  assert.equal(verified.verified, true);
  assert.deepEqual(verified.output, plan.exactExpectedOutput);
  assert.equal(
    verified.outputRawHash,
    plan.hashes.expectedOutputRaw
  );
});

test("remote changes after review are blocked", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  const changedRemote = structuredClone(remote);
  changedRemote[3].title = "Changed manually in Nuvio";

  assert.throws(
    () =>
      verifyCollisionSafeFreshState({
        plan,
        profileScope: 5,
        currentLocalCollections: local,
        freshRemoteCollections: changedRemote
      }),
    error =>
      error instanceof CollisionSafeWriteError &&
      error.code === "STALE_REMOTE_HASH"
  );
});

test("local changes after review are blocked", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  const changedLocal = structuredClone(local);
  changedLocal[1].title = "Changed after review";

  assert.throws(
    () =>
      verifyCollisionSafeFreshState({
        plan,
        profileScope: 5,
        currentLocalCollections: changedLocal,
        freshRemoteCollections: remote
      }),
    error =>
      error instanceof CollisionSafeWriteError &&
      error.code === "STALE_LOCAL_HASH"
  );
});

test("profile changes after review are blocked", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  assert.throws(
    () =>
      verifyCollisionSafeFreshState({
        plan,
        profileScope: 6,
        currentLocalCollections: local,
        freshRemoteCollections: remote
      }),
    error =>
      error instanceof CollisionSafeWriteError &&
      error.code === "PROFILE_SCOPE_CHANGED"
  );
});

test("post-write verification accepts only the exact reviewed output", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  const result = verifyCollisionSafePostWrite(
    plan,
    plan.exactExpectedOutput
  );

  assert.equal(result.verified, true);
  assert.equal(result.count, 5);
});

test("post-write verification rejects modified output", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  const badOutput = structuredClone(plan.exactExpectedOutput);
  badOutput[1].title = "Duplicate was accidentally changed";

  assert.throws(
    () => verifyCollisionSafePostWrite(plan, badOutput),
    error =>
      error instanceof CollisionSafeWriteError &&
      error.code === "POST_WRITE_VERIFICATION_FAILED"
  );
});

test("rollback candidate restores exact original remote array", () => {
  const { remote, local } = fixture();

  const plan = createCollisionSafeWritePlan({
    profileScope: 5,
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  const rollback = rollbackCandidate(plan);

  assert.deepEqual(rollback, remote);
  assert.notStrictEqual(rollback, plan.exactRemoteBefore);
});

test("collision-safe write path still rejects duplicate folder IDs", () => {
  const { remote, local } = fixture();

  remote[0].folders = [
    folder("same-folder", "One"),
    folder("same-folder", "Two")
  ];

  assert.throws(
    () =>
      createCollisionSafeWritePlan({
        profileScope: 5,
        localCollections: local,
        remoteCollections: remote,
        selectedLocalIds: ["new-ultramax"]
      }),
    error =>
      error instanceof CollisionSafeWriteError &&
      error.code === "UNSUPPORTED_REMOTE_COLLISION"
  );
});
