"use strict";

// HTTP layer only — all Fusion transform logic lives in
// fusion-export-service.js (pure) and all share persistence lives in
// fusion-share-service.js. This file resolves requests, loads config,
// calls those two modules, and shapes responses. It never mutates
// collections, catalogues, merged-catalog behaviour or saved configs
// (aside from the share pointer records themselves).

const crypto = require("crypto");
const { resolveConfigForProfile } = require("../utils/profiles");
const { createEffectiveDiscoveryConfig } = require("./provider-capability-service");
const {
  buildFusionManifestUrl,
  buildFusionWidgetsPayload
} = require("./fusion-export-service");
const {
  isValidShareId,
  findActiveShare,
  createOrRegenerateShare,
  getShareById,
  revokeShare,
  listSharesForToken
} = require("./fusion-share-service");

// Environment-correct base origin from the live request — never a
// hardcoded domain — so dev/self-host/production each embed their own
// correct manifest/share URLs automatically.
//
// req.protocol can't be trusted here: this backend always sits behind
// nginx and is always reached over plain HTTP internally, so
// Express would report "http" even for a real https request unless an
// (easily lost/overridden) X-Forwarded-Proto reaches it intact. Every real
// deployment of this app (dev/self-host/production) is HTTPS-only, so we
// default to https and only drop to http for loopback/direct access —
// i.e. local testing, the one case where http is actually correct.
function resolveBaseUrl(req) {
  const host = req.get("host") || "";
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const proto = req.headers["x-forwarded-proto"] || (isLoopback ? "http" : "https");
  return `${proto}://${host}`;
}

function sanitizeFilenamePart(value, fallback) {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned || fallback;
}

function resolveProfileName(baseConfig, profileId) {
  if (!profileId) return null;
  const profile = baseConfig.profiles && baseConfig.profiles[profileId];
  return profile ? profile.name : null;
}

// Shared by preview/download/share-create: loads the base config, resolves
// the requested profile, and builds the Fusion payload for it. Throws an
// error with .statusCode set for the route handler to map to a response.
async function resolveFusionExport({ readConfig, token, profileId, baseUrl }) {
  const baseConfig = await readConfig(token);
  if (!baseConfig) {
    const error = new Error("Setup not found");
    error.statusCode = 404;
    throw error;
  }

  const resolvedProfileId = profileId && baseConfig.profiles && baseConfig.profiles[profileId] ? profileId : null;
  if (profileId && !resolvedProfileId) {
    const error = new Error("Profile not found");
    error.statusCode = 404;
    throw error;
  }

  const config = createEffectiveDiscoveryConfig(
    resolveConfigForProfile(baseConfig, resolvedProfileId)
  );
  const manifestUrl = buildFusionManifestUrl(baseUrl, token, resolvedProfileId);
  const { payload, summary } = buildFusionWidgetsPayload(config, { manifestUrl });

  return {
    payload,
    summary,
    manifestUrl,
    profileId: resolvedProfileId,
    profileName: resolveProfileName(baseConfig, resolvedProfileId)
  };
}

function registerFusionRoutes(app, deps) {
  const { loadConfigs, readConfig = async token => loadConfigs()[token], rateLimit } = deps;

  // ---- Authenticated setup routes (token-scoped, no password — matching
  // the existing /c/:token/collections convention: the token itself is
  // the credential, same trust boundary as the manifest/collections
  // endpoints this feature reads from). ----

  app.get("/c/:token/fusion/preview", async (req, res) => {
    try {
      const { token } = req.params;
      const baseUrl = resolveBaseUrl(req);
      const result = await resolveFusionExport({ readConfig, token, profileId: req.query.profile, baseUrl });
      res.set("Content-Type", "application/json; charset=utf-8");
      res.json({
        summary: result.summary,
        manifestUrl: result.manifestUrl,
        profileId: result.profileId,
        profileName: result.profileName,
        payload: result.payload
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error("[fusion-route] preview error:", error.message);
      res.status(statusCode).json({ error: statusCode === 404 ? error.message : "Could not build Fusion preview" });
    }
  });

  app.get("/c/:token/fusion/download.json", async (req, res) => {
    try {
      const { token } = req.params;
      const baseUrl = resolveBaseUrl(req);
      const result = await resolveFusionExport({ readConfig, token, profileId: req.query.profile, baseUrl });

      const profilePart = result.profileName ? `-${sanitizeFilenamePart(result.profileName, "")}` : "";
      const filename = `fusion-widgets${profilePart || ""}.json`;

      res.set("Content-Type", "application/json; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(result.payload, null, 2));
    } catch (error) {
      const statusCode = error.statusCode || 500;
      if (statusCode >= 500) console.error("[fusion-route] download error:", error.message);
      res.status(statusCode).json({ error: statusCode === 404 ? error.message : "Could not build Fusion export" });
    }
  });

  app.post("/c/:token/fusion/share", async (req, res) => {
    try {
      const { token } = req.params;
      const baseConfig = await readConfig(token);
      if (!baseConfig) return res.status(404).json({ error: "Setup not found" });

      const rawProfileId = (req.body && req.body.profile) || req.query.profile || null;
      const profileId = rawProfileId && baseConfig.profiles && baseConfig.profiles[rawProfileId] ? rawProfileId : null;
      if (rawProfileId && !profileId) return res.status(404).json({ error: "Profile not found" });

      const record = createOrRegenerateShare({ token, profileId });
      const baseUrl = resolveBaseUrl(req);
      res.json({
        shareId: record.shareId,
        url: `${baseUrl}/fusion/${record.shareId}/widgets.json`,
        profileId: record.profileId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      });
    } catch (error) {
      console.error("[fusion-route] share create error:", error.message);
      res.status(500).json({ error: "Could not create Fusion share link" });
    }
  });

  app.get("/c/:token/fusion/share", async (req, res) => {
    try {
      const { token } = req.params;
      if (!await readConfig(token)) return res.status(404).json({ error: "Setup not found" });

      const baseUrl = resolveBaseUrl(req);
      const toPublic = record => ({
        shareId: record.shareId,
        url: `${baseUrl}/fusion/${record.shareId}/widgets.json`,
        profileId: record.profileId,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      });

      if (req.query.profile !== undefined) {
        const share = findActiveShare(token, req.query.profile || null);
        return res.json({ share: share ? toPublic(share) : null });
      }

      res.json({ shares: listSharesForToken(token).map(toPublic) });
    } catch (error) {
      console.error("[fusion-route] share status error:", error.message);
      res.status(500).json({ error: "Could not load Fusion share status" });
    }
  });

  app.post("/c/:token/fusion/share/revoke", async (req, res) => {
    try {
      const { token } = req.params;
      if (!await readConfig(token)) return res.status(404).json({ error: "Setup not found" });

      const shareId = req.body && req.body.shareId;
      if (!shareId || typeof shareId !== "string") {
        return res.status(400).json({ error: "shareId required" });
      }

      const record = revokeShare({ shareId, token });
      if (!record) return res.status(404).json({ error: "Share not found" });

      res.json({ ok: true, shareId: record.shareId, enabled: record.enabled });
    } catch (error) {
      console.error("[fusion-route] share revoke error:", error.message);
      res.status(500).json({ error: "Could not revoke Fusion share link" });
    }
  });

  // ---- Public, read-only, unauthenticated route. No token in the path or
  // response — only the opaque shareId. ----

  app.get("/fusion/:shareId/widgets.json", async (req, res) => {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    if (rateLimit(ip, 30, 60000)) {
      return res.status(429).json({ error: "Too many requests." });
    }

    const { shareId } = req.params;
    if (!isValidShareId(shareId)) {
      return res.status(400).json({ error: "Invalid share id" });
    }

    let record;
    try {
      record = getShareById(shareId);
    } catch (error) {
      console.error("[fusion-route] public lookup error:", error.message);
      return res.status(500).json({ error: "Could not load Fusion widgets" });
    }

    if (!record) return res.status(404).json({ error: "Not found" });
    if (record.enabled === false) return res.status(410).json({ error: "This Fusion link has been revoked" });

    try {
      const baseConfig = await readConfig(record.token);
      // Orphaned share (setup deleted after the link was created) — behave
      // exactly like "not found", never reveal that a token once existed.
      if (!baseConfig) return res.status(404).json({ error: "Not found" });

      const resolvedProfileId = record.profileId && baseConfig.profiles && baseConfig.profiles[record.profileId]
        ? record.profileId
        : null;

      const config = createEffectiveDiscoveryConfig(
        resolveConfigForProfile(baseConfig, resolvedProfileId)
      );
      const baseUrl = resolveBaseUrl(req);
      const manifestUrl = buildFusionManifestUrl(baseUrl, record.token, resolvedProfileId);
      const { payload } = buildFusionWidgetsPayload(config, { manifestUrl });

      const body = JSON.stringify(payload);
      const etag = `"${crypto.createHash("sha1").update(body).digest("hex")}"`;

      res.set("Content-Type", "application/json; charset=utf-8");
      res.set("Cache-Control", "public, max-age=60, must-revalidate");
      res.set("ETag", etag);
      res.set("Last-Modified", new Date(record.updatedAt || record.createdAt).toUTCString());

      if (req.headers["if-none-match"] === etag) {
        return res.status(304).end();
      }

      res.status(200).send(body);
    } catch (error) {
      console.error("[fusion-route] public export error:", error.message);
      res.status(500).json({ error: "Could not load Fusion widgets" });
    }
  });
}

module.exports = {
  registerFusionRoutes,
  resolveBaseUrl
};
