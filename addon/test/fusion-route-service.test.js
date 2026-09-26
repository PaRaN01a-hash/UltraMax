"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveBaseUrl } = require("../services/fusion-route-service");

function fakeReq(host, headers = {}) {
  return {
    headers: Object.assign({ host }, headers),
    get(name) { return this.headers[name.toLowerCase()]; }
  };
}

// ---- 19 (continued). Environment-correct manifest URL — base origin
// resolution from the live request, not a hardcoded domain. ----

test("loopback/direct access resolves to http (local dev testing)", () => {
  assert.equal(resolveBaseUrl(fakeReq("localhost:7099")), "http://localhost:7099");
  assert.equal(resolveBaseUrl(fakeReq("127.0.0.1:7099")), "http://127.0.0.1:7099");
});

test("a real host defaults to https even though the internal hop is plain HTTP", () => {
  assert.equal(resolveBaseUrl(fakeReq("ultramax.vip")), "https://ultramax.vip");
  assert.equal(resolveBaseUrl(fakeReq("ultramax.vip")), "https://ultramax.vip");
});

test("an explicit X-Forwarded-Proto header is honoured when present", () => {
  assert.equal(
    resolveBaseUrl(fakeReq("ultramax.vip", { "x-forwarded-proto": "https" })),
    "https://ultramax.vip"
  );
});

test("self-host domains (unknown host, non-loopback) still default to https", () => {
  assert.equal(resolveBaseUrl(fakeReq("my-selfhost.example.com")), "https://my-selfhost.example.com");
});
