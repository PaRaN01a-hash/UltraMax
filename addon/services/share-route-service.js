"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { trustedClientIp } = require("../utils/client-ip");

const MAX_SHARES = 500;
const MAX_DATA_BYTES = 500000;
const MAX_EXTRA_FILES = 5;
const MAX_EXTRA_FILE_BYTES = 200000;
const MAX_EXTRA_TOTAL_BYTES = 500000;
const MAX_REQUIRED_ADDONS = 30;
const SHARE_ID_RE = /^[a-z0-9]{8,16}$/;

function sameOriginMutation(req) {
  if (req?.headers?.["sec-fetch-site"] === "cross-site") return false;
  const origin = req?.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function safeHttpUrl(value, maxLength = 600) {
  if (typeof value !== "string" || !value || value.length > maxLength) return "";
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function sanitizeFileName(value) {
  if (typeof value !== "string") return "";
  const base = path.basename(value.trim()).slice(0, 100);
  if (!base || !/^[A-Za-z0-9._ -]+$/.test(base)) return "";
  return base;
}

function sanitizeAddon(addon) {
  if (!addon || typeof addon !== "object" || Array.isArray(addon)) return null;
  const addonId = typeof addon.addonId === "string" ? addon.addonId.trim().slice(0, 160) : "";
  const name = typeof addon.name === "string" ? addon.name.trim().slice(0, 120) : "";
  if (!addonId && !name) return null;
  const manifestUrl = safeHttpUrl(addon.manifestUrl);
  return {
    addonId: addonId || name.toLowerCase().replace(/\s+/g, "-").slice(0, 160),
    name: name || addonId,
    manifestUrl
  };
}

function sanitizeExtraFiles(extraFiles) {
  if (!Array.isArray(extraFiles)) return [];
  const out = [];
  let totalBytes = 0;
  for (const item of extraFiles.slice(0, MAX_EXTRA_FILES)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const name = sanitizeFileName(item.name);
    if (!name) continue;
    let json;
    try { json = JSON.stringify(item.data); } catch { continue; }
    const bytes = Buffer.byteLength(json || "", "utf8");
    if (!bytes || bytes > MAX_EXTRA_FILE_BYTES || totalBytes + bytes > MAX_EXTRA_TOTAL_BYTES) continue;
    totalBytes += bytes;
    out.push({ name, type: "application/json", data: item.data });
  }
  return out;
}

function loadShares(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveShares(file, shares) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, JSON.stringify(shares, null, 2));
  fs.renameSync(temp, file);
}

function generateShareId(shares) {
  const existing = new Set(shares.map(row => row?.id).filter(Boolean));
  for (let i = 0; i < 8; i++) {
    const id = crypto.randomBytes(6).toString("hex");
    if (!existing.has(id)) return id;
  }
  throw new Error("Unable to allocate share id");
}

function baseUrl(req) {
  const host = typeof req?.headers?.host === "string" ? req.headers.host : "";
  if (!host) return "";
  const forwarded = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  const loopback = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const protocol = forwarded === "https" ? "https" : loopback ? "http" : "https";
  return `${protocol}://${host}`;
}

function registerShareRoutes(app, deps = {}) {
  const rateLimit = deps.rateLimit;
  if (typeof rateLimit !== "function") throw new TypeError("rateLimit is required");
  const sharesFile = deps.sharesFile || path.join(process.env.DATA_DIR || path.join(__dirname, ".."), "shares.json");

  function guardMutation(req, res) {
    if (!sameOriginMutation(req)) {
      res.status(403).json({ error: "Open Ultra MAX directly to continue." });
      return false;
    }
    return true;
  }

  app.post("/api/share", (req, res) => {
    try {
      if (!guardMutation(req, res)) return;
      const ip = trustedClientIp(req);
      if (rateLimit(`gallery:create:${ip}`, 3, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many submissions. Please try again later." });
      }

      const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      const { type, name, author, description, tags, requiredAddons, data, extraFiles } = body;
      if (!type || typeof name !== "string" || !name.trim() || data === undefined || data === null) {
        return res.status(400).json({ error: "Missing fields" });
      }
      if (!["collections", "setup", "full"].includes(type)) {
        return res.status(400).json({ error: "Invalid type" });
      }

      let dataStr;
      try { dataStr = JSON.stringify(data); } catch { return res.status(400).json({ error: "Invalid data" }); }
      if (Buffer.byteLength(dataStr, "utf8") > MAX_DATA_BYTES) {
        return res.status(400).json({ error: "Too large" });
      }

      const dataArr = Array.isArray(data)
        ? data
        : (data && Array.isArray(data.collections) ? data.collections : []);
      if (!dataArr.length) return res.status(400).json({ error: "Invalid collection data" });

      const allAddonIds = new Set();
      let folderCount = 0;
      let sourceCount = 0;
      const covers = [];
      for (const coll of dataArr) {
        if (!coll || typeof coll !== "object") continue;
        const folders = Array.isArray(coll.folders) ? coll.folders : [];
        folderCount += folders.length;
        for (const folder of folders) {
          if (!folder || typeof folder !== "object") continue;
          const sources = Array.isArray(folder.sources)
            ? folder.sources
            : (Array.isArray(folder.catalogSources) ? folder.catalogSources : []);
          sourceCount += sources.length;
          for (const src of sources) {
            const addonId = typeof src?.addonId === "string" ? src.addonId.trim().slice(0, 160) : "";
            if (addonId && allAddonIds.size < 100) allAddonIds.add(addonId);
          }
          if (covers.length < 6) {
            const cover = safeHttpUrl(folder.coverImageUrl);
            if (cover) covers.push(cover);
          }
        }
      }

      const mergedAddons = [];
      for (const addon of (Array.isArray(requiredAddons) ? requiredAddons : []).slice(0, MAX_REQUIRED_ADDONS)) {
        const safe = sanitizeAddon(addon);
        if (safe && !mergedAddons.some(row => row.addonId === safe.addonId)) mergedAddons.push(safe);
      }
      for (const addonId of allAddonIds) {
        if (mergedAddons.length >= MAX_REQUIRED_ADDONS) break;
        if (mergedAddons.some(row => row.addonId === addonId)) continue;
        mergedAddons.push({
          addonId,
          name: addonId === "com.ultramax" ? "Ultra MAX" : addonId,
          manifestUrl: addonId === "com.ultramax" ? `${baseUrl(req)}/setup.html` : ""
        });
      }

      const shares = loadShares(sharesFile);
      const id = generateShareId(shares);
      const share = {
        id,
        type,
        name: name.trim().slice(0, 80),
        author: (typeof author === "string" && author.trim() ? author.trim() : "Anonymous").slice(0, 40),
        description: (typeof description === "string" ? description.trim() : "").slice(0, 500),
        tags: Array.isArray(tags) ? tags.slice(0, 10).map(value => String(value).trim().slice(0, 30).toLowerCase()).filter(Boolean) : [],
        requiredAddons: mergedAddons,
        covers,
        folderCount,
        sourceCount,
        data,
        extraFiles: sanitizeExtraFiles(extraFiles),
        created: new Date().toISOString(),
        imports: 0,
        likes: 0
      };
      shares.unshift(share);
      if (shares.length > MAX_SHARES) shares.splice(MAX_SHARES);
      saveShares(sharesFile, shares);
      return res.json({ ok: true, id, url: `${baseUrl(req)}/gallery?share=${id}` });
    } catch (error) {
      console.error("[gallery] create failed", error?.message || error);
      return res.status(500).json({ error: "Unable to save this share." });
    }
  });

  app.get("/api/share/:id", (req, res) => {
    try {
      if (!SHARE_ID_RE.test(req.params.id)) return res.status(404).json({ error: "Not found" });
      const share = loadShares(sharesFile).find(row => row?.id === req.params.id);
      if (!share) return res.status(404).json({ error: "Not found" });
      return res.json(share);
    } catch {
      return res.status(500).json({ error: "Unable to load this share." });
    }
  });

  app.get("/api/shares", (req, res) => {
    try {
      const shares = loadShares(sharesFile);
      const type = typeof req.query.type === "string" ? req.query.type : "";
      const filtered = type ? shares.filter(row => row?.type === type) : shares;
      return res.json(filtered.slice(0, 100).map(row => ({
        id: row.id,
        type: row.type,
        name: row.name,
        author: row.author,
        description: row.description || "",
        tags: row.tags || [],
        requiredAddons: row.requiredAddons || [],
        covers: row.covers || [],
        folderCount: row.folderCount || 0,
        sourceCount: row.sourceCount || 0,
        extraFiles: (row.extraFiles || []).map(file => ({ name: file.name, type: file.type })),
        created: row.created,
        imports: row.imports || 0,
        likes: row.likes || 0
      })));
    } catch {
      return res.status(500).json({ error: "Unable to load gallery." });
    }
  });

  app.get("/api/share/:id/file/:filename", (req, res) => {
    try {
      if (!SHARE_ID_RE.test(req.params.id)) return res.status(404).json({ error: "Not found" });
      const filename = sanitizeFileName(req.params.filename);
      if (!filename) return res.status(404).json({ error: "File not found" });
      const share = loadShares(sharesFile).find(row => row?.id === req.params.id);
      if (!share) return res.status(404).json({ error: "Not found" });
      const file = (Array.isArray(share.extraFiles) ? share.extraFiles : []).find(row => row?.name === filename);
      if (!file) return res.status(404).json({ error: "File not found" });
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
      return res.send(JSON.stringify(file.data, null, 2));
    } catch {
      return res.status(500).json({ error: "Unable to download this file." });
    }
  });

  app.post("/api/share/:id/import", (req, res) => {
    try {
      if (!guardMutation(req, res)) return;
      if (!SHARE_ID_RE.test(req.params.id)) return res.status(404).json({ error: "Not found" });
      const ip = trustedClientIp(req);
      if (rateLimit(`gallery:import:global:${ip}`, 30, 60 * 60 * 1000) ||
          rateLimit(`gallery:import:${ip}:${req.params.id}`, 3, 24 * 60 * 60 * 1000)) {
        return res.status(429).json({ error: "Import already counted." });
      }
      const shares = loadShares(sharesFile);
      const share = shares.find(row => row?.id === req.params.id);
      if (!share) return res.status(404).json({ error: "Not found" });
      share.imports = Math.max(0, Number(share.imports) || 0) + 1;
      saveShares(sharesFile, shares);
      return res.json({ ok: true, imports: share.imports });
    } catch {
      return res.status(500).json({ error: "Unable to count this import." });
    }
  });

  app.post("/api/share/:id/like", (req, res) => {
    try {
      if (!guardMutation(req, res)) return;
      if (!SHARE_ID_RE.test(req.params.id)) return res.status(404).json({ error: "Not found" });
      const ip = trustedClientIp(req);
      if (rateLimit(`gallery:like:global:${ip}`, 30, 60 * 60 * 1000) ||
          rateLimit(`gallery:like:${ip}:${req.params.id}`, 1, 24 * 60 * 60 * 1000)) {
        return res.status(429).json({ error: "Already liked." });
      }
      const shares = loadShares(sharesFile);
      const share = shares.find(row => row?.id === req.params.id);
      if (!share) return res.status(404).json({ error: "Not found" });
      share.likes = Math.max(0, Number(share.likes) || 0) + 1;
      saveShares(sharesFile, shares);
      return res.json({ ok: true, likes: share.likes });
    } catch {
      return res.status(500).json({ error: "Unable to like this share." });
    }
  });
}

module.exports = {
  registerShareRoutes,
  trustedClientIp,
  sameOriginMutation,
  safeHttpUrl,
  sanitizeFileName,
  sanitizeExtraFiles,
  loadShares,
  saveShares
};
