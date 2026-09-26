"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  registerCollectionSyncRoutes
} = require("../services/collection-sync-route-service");

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

function captureRoute(path) {
  let handler = null;

  const app = {
    get() {},
    post(routePath, routeHandler) {
      if (routePath === path) handler = routeHandler;
    }
  };

  registerCollectionSyncRoutes(app);

  assert.equal(typeof handler, "function");
  return handler;
}

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(value) {
      this.body = value;
      return this;
    },

    type() {
      return this;
    },

    send(value) {
      this.body = value;
      return this;
    }
  };
}

test("collision-safe route returns only public review metadata", () => {
  const { remote, local } = fixture();

  const handler = captureRoute(
    "/api/collection-sync/collision-safe-plan"
  );

  const req = {
    headers: {},
    body: {
      profileScope: 5,
      targetProfileLabel: "Test profile",
      localCollections: local,
      remoteCollections: remote,
      selectedLocalIds: ["new-ultramax"]
    }
  };

  const res = fakeResponse();

  handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.readOnly, true);
  assert.equal(res.body.mode, "collision-safe-add");
  assert.equal(res.body.profileScope, "5");
  assert.equal(res.body.counts.existingRemote, undefined);
  assert.equal(res.body.counts.remoteBefore, 4);
  assert.equal(res.body.counts.additions, 1);
  assert.equal(res.body.counts.expectedOutput, 5);
  assert.equal(res.body.counts.protectedRemoteEntries, 2);

  assert.equal(
    typeof res.body.hashes.remoteBeforeRaw,
    "string"
  );

  // Raw payloads must never leave this planning route.
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      res.body,
      "exactRemoteBefore"
    ),
    false
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      res.body,
      "exactLocalAtReview"
    ),
    false
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      res.body,
      "exactExpectedOutput"
    ),
    false
  );
});

test("collision-safe route keeps duplicate folder IDs blocked", () => {
  const { remote, local } = fixture();

  remote[0].folders = [
    folder("same-folder", "One"),
    folder("same-folder", "Two")
  ];

  const handler = captureRoute(
    "/api/collection-sync/collision-safe-plan"
  );

  const req = {
    headers: {},
    body: {
      profileScope: 5,
      localCollections: local,
      remoteCollections: remote,
      selectedLocalIds: ["new-ultramax"]
    }
  };

  const res = fakeResponse();

  handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(
    res.body.code,
    "UNSUPPORTED_REMOTE_COLLISION"
  );
  assert.equal(res.body.readOnly, true);
});

test("collision-safe route rejects oversized requests", () => {
  const handler = captureRoute(
    "/api/collection-sync/collision-safe-plan"
  );

  const req = {
    headers: {
      "content-length": String(3 * 1024 * 1024)
    },
    body: {}
  };

  const res = fakeResponse();

  handler(req, res);

  assert.equal(res.statusCode, 413);
  assert.equal(res.body.code, "OVERSIZED_INPUT");
  assert.equal(res.body.readOnly, true);
});

test("collision-safe apply route delegates only to collision-safe apply service", async () => {
  const {
    NuvioCollectionWriteService
  } = require("../services/nuvio-collection-write-service");

  const original =
    NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan;

  let received = null;

  NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan =
    async function (input) {
      received = structuredClone(input);

      return {
        success: true,
        resultCode: "APPLY_SUCCEEDED",
        verifiedRemoteCount: 5,
        verifiedRemoteHash: "verified-hash",
        verifiedAt: "2026-08-14T08:00:00.000Z"
      };
    };

  try {
    const handler = captureRoute(
      "/api/collection-sync/collision-safe-apply"
    );

    const req = {
      headers: {},
      body: {
        accessToken: "test-token",
        profileScope: "5",
        planId: "collision-plan-test",
        currentLocalCollections: [],
        confirmation: "APPLY TO NUVIO"
      }
    };

    const res = fakeResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.resultCode, "APPLY_SUCCEEDED");
    assert.equal(res.body.verifiedRemoteCount, 5);

    assert.deepEqual(received, req.body);
  } finally {
    NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan =
      original;
  }
});

test("collision-safe rollback route delegates only to collision-safe rollback service", async () => {
  const {
    NuvioCollectionWriteService
  } = require("../services/nuvio-collection-write-service");

  const original =
    NuvioCollectionWriteService.prototype.rollbackCollisionSafeWritePlan;

  let received = null;

  NuvioCollectionWriteService.prototype.rollbackCollisionSafeWritePlan =
    async function (input) {
      received = structuredClone(input);

      return {
        success: true,
        resultCode: "ROLLBACK_SUCCEEDED",
        verifiedRemoteCount: 4,
        verifiedRemoteHash: "restored-hash",
        verifiedAt: "2026-08-14T08:05:00.000Z"
      };
    };

  try {
    const handler = captureRoute(
      "/api/collection-sync/collision-safe-rollback"
    );

    const req = {
      headers: {},
      body: {
        accessToken: "test-token",
        profileScope: "5",
        planId: "collision-plan-test",
        confirmation: "RESTORE NUVIO BACKUP"
      }
    };

    const res = fakeResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.resultCode, "ROLLBACK_SUCCEEDED");
    assert.equal(res.body.verifiedRemoteCount, 4);

    assert.deepEqual(received, req.body);
  } finally {
    NuvioCollectionWriteService.prototype.rollbackCollisionSafeWritePlan =
      original;
  }
});

test("collision-safe apply route preserves backend safety failures", async () => {
  const {
    NuvioCollectionWriteService
  } = require("../services/nuvio-collection-write-service");

  const original =
    NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan;

  NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan =
    async function () {
      const error = new Error(
        "Nuvio collections changed after review"
      );

      error.code = "STALE_REMOTE_HASH";

      throw error;
    };

  try {
    const handler = captureRoute(
      "/api/collection-sync/collision-safe-apply"
    );

    const req = {
      headers: {},
      body: {
        accessToken: "test-token",
        profileScope: "5",
        planId: "collision-plan-test",
        currentLocalCollections: [],
        confirmation: "APPLY TO NUVIO"
      }
    };

    const res = fakeResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "STALE_REMOTE_HASH");
    assert.equal(
      res.body.error,
      "Nuvio collections changed after review"
    );
  } finally {
    NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan =
      original;
  }
});

test("collision-safe apply route rejects oversized input before service execution", async () => {
  const {
    NuvioCollectionWriteService
  } = require("../services/nuvio-collection-write-service");

  const original =
    NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan;

  let called = false;

  NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan =
    async function () {
      called = true;
      throw new Error("should not run");
    };

  try {
    const handler = captureRoute(
      "/api/collection-sync/collision-safe-apply"
    );

    const req = {
      headers: {
        "content-length": String(3 * 1024 * 1024)
      },
      body: {}
    };

    const res = fakeResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, "OVERSIZED_INPUT");
    assert.equal(called, false);
  } finally {
    NuvioCollectionWriteService.prototype.applyCollisionSafeWritePlan =
      original;
  }
});
