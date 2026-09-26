"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CollisionSafeAddError,
  buildCollisionSafeAddPlan
} = require("../services/collection-collision-safe-add-service");

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
    collection("duplicate-id", "Duplicate version one", [
      folder("dup-folder-a", "First copy")
    ]),
    collection("duplicate-id", "Duplicate version two", [
      folder("dup-folder-b", "Second copy")
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

test("duplicate remote collection IDs are preserved and unrelated additions are appended", () => {
  const { remote, local } = fixture();

  const result = buildCollisionSafeAddPlan({
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  assert.equal(result.mode, "collision-safe-add");
  assert.equal(result.summary.existingRemote, 4);
  assert.equal(result.summary.protectedRemoteEntries, 2);
  assert.equal(result.summary.protectedRemoteIds, 1);
  assert.equal(result.summary.additions, 1);
  assert.equal(result.summary.final, 5);

  assert.deepEqual(result.output.slice(0, remote.length), remote);
  assert.deepEqual(result.output[4], local[1]);
});

test("remote order is preserved exactly", () => {
  const { remote, local } = fixture();

  const result = buildCollisionSafeAddPlan({
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  assert.deepEqual(
    result.output.slice(0, remote.length).map(item => item.title),
    remote.map(item => item.title)
  );
});

test("both different duplicate copies survive unchanged", () => {
  const { remote, local } = fixture();

  const result = buildCollisionSafeAddPlan({
    localCollections: local,
    remoteCollections: remote,
    selectedLocalIds: ["new-ultramax"]
  });

  assert.deepEqual(result.output[1], remote[1]);
  assert.deepEqual(result.output[2], remote[2]);

  assert.notDeepEqual(remote[1], remote[2]);
});

test("selecting an ambiguous remote ID is blocked", () => {
  const { remote, local } = fixture();

  const localWithCollisionTarget = local.concat([
    collection("duplicate-id", "Ultra MAX duplicate target", [
      folder("local-dup-folder", "Local duplicate")
    ])
  ]);

  assert.throws(
    () =>
      buildCollisionSafeAddPlan({
        localCollections: localWithCollisionTarget,
        remoteCollections: remote,
        selectedLocalIds: ["duplicate-id"]
      }),
    error =>
      error instanceof CollisionSafeAddError &&
      error.code === "SELECTED_ID_COLLIDES_REMOTE"
  );
});

test("selecting an existing non-colliding remote ID is blocked", () => {
  const { remote, local } = fixture();

  assert.throws(
    () =>
      buildCollisionSafeAddPlan({
        localCollections: local,
        remoteCollections: remote,
        selectedLocalIds: ["remote-a"]
      }),
    error =>
      error instanceof CollisionSafeAddError &&
      error.code === "SELECTED_ID_ALREADY_REMOTE"
  );
});

test("ordinary malformed remote data stays blocked", () => {
  const { remote, local } = fixture();

  remote[0].folders[0].coverImageUrl = "javascript:alert(1)";

  assert.throws(
    () =>
      buildCollisionSafeAddPlan({
        localCollections: local,
        remoteCollections: remote,
        selectedLocalIds: ["new-ultramax"]
      }),
    error =>
      error instanceof CollisionSafeAddError &&
      error.code === "REMOTE_INVALID_DATA"
  );
});

test("invalid local data stays blocked", () => {
  const { remote, local } = fixture();

  local[1].folders[0].coverImageUrl = "javascript:alert(1)";

  assert.throws(
    () =>
      buildCollisionSafeAddPlan({
        localCollections: local,
        remoteCollections: remote,
        selectedLocalIds: ["new-ultramax"]
      }),
    error =>
      error instanceof CollisionSafeAddError &&
      error.code === "LOCAL_VALIDATION_FAILED"
  );
});

test("duplicate selected IDs are rejected", () => {
  const { remote, local } = fixture();

  assert.throws(
    () =>
      buildCollisionSafeAddPlan({
        localCollections: local,
        remoteCollections: remote,
        selectedLocalIds: ["new-ultramax", "new-ultramax"]
      }),
    error =>
      error instanceof CollisionSafeAddError &&
      error.code === "DUPLICATE_SELECTED_IDS"
  );
});

test("duplicate folder IDs remain blocked even when collection IDs are otherwise valid", () => {
  const { remote, local } = fixture();

  remote[0].folders = [
    folder("same-folder-id", "First folder"),
    folder("same-folder-id", "Second folder")
  ];

  assert.throws(
    () =>
      buildCollisionSafeAddPlan({
        localCollections: local,
        remoteCollections: remote,
        selectedLocalIds: ["new-ultramax"]
      }),
    error =>
      error instanceof CollisionSafeAddError &&
      error.code === "UNSUPPORTED_REMOTE_COLLISION"
  );
});
