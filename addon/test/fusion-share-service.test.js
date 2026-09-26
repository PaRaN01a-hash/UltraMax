"use strict";

// Uses a temporary DATA_DIR fixture — never touches the real dev
// data/fusion-shares.json — cleaned up unconditionally after the run.

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fusion-share-test-"));
process.env.DATA_DIR = tmpDir;
// eslint-disable-next-line global-require
const svc = require("../services/fusion-share-service");

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("createOrRegenerateShare issues a cryptographically random, non-token-derived id", () => {
  const record = svc.createOrRegenerateShare({ token: "AAAA1111", profileId: null });
  assert.match(record.shareId, svc.SHARE_ID_RE);
  assert.equal(record.shareId.includes("AAAA1111"), false);
  assert.equal(record.enabled, true);
  assert.equal(record.profileId, null);
});

test("getShareById returns the record for a valid active share", () => {
  const record = svc.createOrRegenerateShare({ token: "BBBB2222", profileId: null });
  const found = svc.getShareById(record.shareId);
  assert.equal(found.token, "BBBB2222");
  assert.equal(found.enabled, true);
});

// ---- 16. Invalid share ID ----
test("malformed share ids are rejected before any lookup (undefined, not null)", () => {
  assert.equal(svc.getShareById("not-a-real-id"), undefined);
  assert.equal(svc.getShareById(""), undefined);
  assert.equal(svc.getShareById(null), undefined);
  assert.equal(svc.isValidShareId("short"), false);
});

test("well-formed but unknown share ids return null, distinct from malformed", () => {
  assert.equal(svc.getShareById("A".repeat(32)), null);
});

// ---- 15. Revoked share link ----
test("revoked shares are still found by id but report enabled:false", () => {
  const record = svc.createOrRegenerateShare({ token: "CCCC3333", profileId: null });
  const revoked = svc.revokeShare({ shareId: record.shareId, token: "CCCC3333" });
  assert.equal(revoked.enabled, false);

  const refetched = svc.getShareById(record.shareId);
  assert.equal(refetched.enabled, false);
  assert.equal(svc.findActiveShare("CCCC3333", null), null);
});

test("revoke is scoped to the owning token — a mismatched token cannot revoke", () => {
  const record = svc.createOrRegenerateShare({ token: "DDDD4444", profileId: null });
  const result = svc.revokeShare({ shareId: record.shareId, token: "WRONG_TOKEN" });
  assert.equal(result, null);
  assert.equal(svc.getShareById(record.shareId).enabled, true);
});

test("regenerating a share replaces the previous one for the same token/profile", () => {
  const first = svc.createOrRegenerateShare({ token: "EEEE5555", profileId: "profX" });
  const second = svc.createOrRegenerateShare({ token: "EEEE5555", profileId: "profX" });
  assert.notEqual(first.shareId, second.shareId);
  assert.equal(svc.getShareById(first.shareId).enabled, false);
  assert.equal(svc.findActiveShare("EEEE5555", "profX").shareId, second.shareId);
});

test("base config and a named profile get independent active shares", () => {
  const base = svc.createOrRegenerateShare({ token: "FFFF6666", profileId: null });
  const profiled = svc.createOrRegenerateShare({ token: "FFFF6666", profileId: "profY" });
  assert.notEqual(base.shareId, profiled.shareId);
  assert.equal(svc.findActiveShare("FFFF6666", null).shareId, base.shareId);
  assert.equal(svc.findActiveShare("FFFF6666", "profY").shareId, profiled.shareId);
});

test("listSharesForToken only returns enabled shares for that token", () => {
  const a = svc.createOrRegenerateShare({ token: "GGGG7777", profileId: null });
  const b = svc.createOrRegenerateShare({ token: "GGGG7777", profileId: "profZ" });
  svc.revokeShare({ shareId: a.shareId, token: "GGGG7777" });
  const list = svc.listSharesForToken("GGGG7777");
  assert.equal(list.length, 1);
  assert.equal(list[0].shareId, b.shareId);
});

test("share records never contain anything beyond the documented fields", () => {
  const record = svc.createOrRegenerateShare({ token: "HHHH8888", profileId: "profQ" });
  assert.deepEqual(
    Object.keys(record).sort(),
    ["createdAt", "enabled", "profileId", "shareId", "token", "updatedAt"]
  );
});
