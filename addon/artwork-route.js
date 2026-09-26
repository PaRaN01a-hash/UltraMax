"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const COOKIE_NAME = "um_artwork_session";

const CATEGORIES = Object.freeze({
  collections: {
    label: "Collections",
    description: "Collection posters and artwork",
  },
  movies: {
    label: "Movies",
    description: "Movie posters and artwork",
  },
  series: {
    label: "Series",
    description: "TV artwork",
  },
  misc: {
    label: "Logos & Misc",
    description: "Logos, icons and miscellaneous assets",
  },
});

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const eq = part.indexOf("=");
      if (eq === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
      return cookies;
    }, {});
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function timingSafeStringEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = crypto.createHash("sha256").update(left).digest();
  const b = crypto.createHash("sha256").update(right).digest();
  return crypto.timingSafeEqual(a, b);
}

function makeSession(secret) {
  const payload = base64url(JSON.stringify({
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
    nonce: crypto.randomBytes(16).toString("hex"),
  }));
  return `${payload}.${sign(payload, secret)}`;
}

function verifySession(token, secret) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !timingSafeStringEqual(signature, sign(payload, secret))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(decoded.exp) && decoded.exp > Date.now();
  } catch (_) {
    return false;
  }
}

function cookieOptions(req) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function clearCookieOptions(req) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return [
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
    secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

function categoryConfig(category) {
  return CATEGORIES[category] || null;
}

function categoryDir(root, category) {
  return path.resolve(root, category);
}

function ensureStorage(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o750 });
  for (const category of Object.keys(CATEGORIES)) {
    fs.mkdirSync(categoryDir(root, category), { recursive: true, mode: 0o750 });
  }
}

function extensionFor(file) {
  const originalExt = path.extname(file.originalname || "").toLowerCase();
  return ALLOWED_EXTENSIONS.has(originalExt) ? originalExt : "";
}

function hasAllowedMagic(buffer, ext) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (ext === ".png") return buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (ext === ".jpg" || ext === ".jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (ext === ".webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function sanitizeFilename(originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  const base = path.basename(originalName || "artwork", ext)
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 90)
    .replace(/[.-]+$/, "");
  const safeBase = base || "artwork";
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const nonce = crypto.randomBytes(4).toString("hex");
  return `${safeBase}-${stamp}-${nonce}${ext}`;
}

function resolveStoredFile(root, category, filename) {
  if (!categoryConfig(category)) return null;
  if (typeof filename !== "string" || filename !== path.basename(filename)) return null;
  if (!ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase())) return null;
  const dir = categoryDir(root, category);
  const filePath = path.resolve(dir, filename);
  if (!filePath.startsWith(dir + path.sep)) return null;
  return filePath;
}

function formatFile(root, category, entry) {
  const filePath = path.join(categoryDir(root, category), entry.name);
  const stat = fs.statSync(filePath);
  return {
    name: entry.name,
    size: stat.size,
    uploadedAt: stat.mtime.toISOString(),
    url: `/api/artwork/files/${encodeURIComponent(category)}/${encodeURIComponent(entry.name)}`,
  };
}

function listFiles(root, category) {
  const dir = categoryDir(root, category);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => formatFile(root, category, entry))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

function registerArtworkRoutes(app) {
  const storageRootRaw = String(process.env.ARTWORK_UPLOAD_ROOT || process.env.ULTRAMAX_ARTWORK_ROOT || "").trim();
  if (!storageRootRaw || !path.isAbsolute(storageRootRaw)) {
    throw new Error("ARTWORK_UPLOAD_ROOT/ULTRAMAX_ARTWORK_ROOT missing or not absolute");
  }
  const storageRoot = path.resolve(storageRootRaw);
  const password = process.env.ARTWORK_PORTAL_PASSWORD || "";
  const sessionSecret = process.env.ARTWORK_PORTAL_SESSION_SECRET || crypto.createHash("sha256").update(`${password}:artwork-session`).digest("hex");
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: 30 },
  });

  ensureStorage(storageRoot);

  function artworkAuth(req, res, next) {
    if (!password) return res.status(503).json({ ok: false, error: "Artwork portal password is not configured" });
    const cookies = parseCookies(req.headers.cookie);
    if (!verifySession(cookies[COOKIE_NAME], sessionSecret)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    next();
  }

  app.get("/artwork", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "public", "artwork.html"));
  });

  app.get("/api/artwork/session", artworkAuth, (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/artwork/login", (req, res) => {
    if (!password) return res.status(503).json({ ok: false, error: "Artwork portal password is not configured" });
    const supplied = req.body && typeof req.body.password === "string" ? req.body.password : "";
    if (!timingSafeStringEqual(supplied, password)) {
      res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${clearCookieOptions(req)}`);
      return res.status(401).json({ ok: false, error: "Incorrect password" });
    }
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(makeSession(sessionSecret))}; ${cookieOptions(req)}`);
    res.json({ ok: true });
  });

  app.post("/api/artwork/logout", (_req, res) => {
    res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });

  app.get("/api/artwork/categories", artworkAuth, (_req, res) => {
    const categories = Object.entries(CATEGORIES).map(([id, config]) => {
      const files = listFiles(storageRoot, id);
      return { id, ...config, count: files.length, files };
    });
    res.json({ ok: true, categories });
  });

  app.post("/api/artwork/upload/:category", artworkAuth, (req, res) => {
    const category = req.params.category;
    if (!categoryConfig(category)) return res.status(404).json({ ok: false, error: "Unknown artwork category" });
    upload.array("files", 30)(req, res, (err) => {
      if (err) {
        const message = err.code === "LIMIT_FILE_SIZE" ? "Each file must be 10MB or smaller" : "Upload failed";
        return res.status(400).json({ ok: false, error: message });
      }

      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return res.status(400).json({ ok: false, error: "No files uploaded" });

      const saved = [];
      for (const file of files) {
        const ext = extensionFor(file);
        if (!ext || !ALLOWED_MIME_TYPES.has(file.mimetype) || !hasAllowedMagic(file.buffer, ext)) {
          return res.status(400).json({ ok: false, error: `${file.originalname || "File"} is not a supported image` });
        }
        const name = sanitizeFilename(file.originalname);
        const target = resolveStoredFile(storageRoot, category, name);
        if (!target) return res.status(400).json({ ok: false, error: "Invalid filename" });
        fs.writeFileSync(target, file.buffer, { flag: "wx", mode: 0o640 });
        saved.push(formatFile(storageRoot, category, { name }));
      }

      res.json({ ok: true, files: saved });
    });
  });

  app.get("/api/artwork/files/:category/:filename", artworkAuth, (req, res) => {
    const filePath = resolveStoredFile(storageRoot, req.params.category, req.params.filename);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).end();
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(filePath).replace(/"/g, "")}"`);
    res.sendFile(filePath);
  });

  app.delete("/api/artwork/files/:category/:filename", artworkAuth, (req, res) => {
    const filePath = resolveStoredFile(storageRoot, req.params.category, req.params.filename);
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: "File not found" });
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  });
}

module.exports = { registerArtworkRoutes, CATEGORIES };
