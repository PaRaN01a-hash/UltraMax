const fs   = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || __dirname;
const EMAILS_FILE = path.join(DATA_DIR, "token-emails.json");
const RATE_FILE   = path.join(DATA_DIR, "recovery-rate.json");
const RESEND_KEY  = process.env.RESEND_API_KEY;
const FROM        = process.env.RESEND_FROM || "Ultra MAX <noreply@example.com>";
const BASE_URL    = process.env.BASE_URL || `http://localhost:${process.env.PORT || 7000}`;

function loadEmails() {
  try { return JSON.parse(fs.readFileSync(EMAILS_FILE, "utf8")); }
  catch { return {}; }
}
function saveEmails(data) { fs.writeFileSync(EMAILS_FILE, JSON.stringify(data, null, 2)); }
function loadRate() {
  try { return JSON.parse(fs.readFileSync(RATE_FILE, "utf8")); }
  catch { return {}; }
}
function saveRate(data) { fs.writeFileSync(RATE_FILE, JSON.stringify(data)); }
function isRateLimited(email) {
  const rate = loadRate(); const now = Date.now(); const key = email.toLowerCase();
  const hits = (rate[key] || []).filter(t => now - t < 3600000);
  if (hits.length >= 3) return true;
  rate[key] = [...hits, now]; saveRate(rate); return false;
}
function normaliseEmail(email) { return (email || "").toLowerCase().trim(); }
async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY not set");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM, to: [to], subject, html })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || "Resend error");
  return data;
}
function tokenBox(token) {
  return `<div style="background:#12121f;border:1px solid #1e1e36;border-radius:8px;padding:14px;font-family:monospace;font-size:20px;letter-spacing:.15em;color:#9B5FFF;text-align:center;margin:12px 0;">${token}</div>`;
}
function wrap(content) {
  return `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#080810;color:#e8e8f0;padding:32px;border-radius:12px;"><h2 style="color:#9B5FFF;margin:0 0 20px;">ULTRA MAX</h2>${content}<p style="font-size:11px;color:#44445a;margin:20px 0 0;border-top:1px solid #1e1e36;padding-top:12px;">Automated message from Ultra MAX.</p></div>`;
}

function registerEmail(loadConfigs) {
  return async (req, res) => {
    try {
      const { token, email, confirm = false } = req.body || {};
      if (!token || !email) return res.status(400).json({ error: "Token and email required" });
      const normEmail = normaliseEmail(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) return res.status(400).json({ error: "Invalid email address" });
      const configs = loadConfigs();
      if (!configs[token]) return res.status(404).json({ error: "Token not found" });
      const emails = loadEmails();
      const existing = emails[normEmail];
      if (existing && existing !== token && !confirm) {
        return res.json({ exists: true, message: "This email is already registered to a token. Registering will replace it." });
      }
      const isUpdate = existing && existing !== token;
      const oldToken = isUpdate ? existing : null;
      emails[normEmail] = token;
      saveEmails(emails);
      if (isUpdate) {
        await sendEmail(normEmail, "Ultra MAX — Token registration updated", wrap(`<p>Your token registration has been updated.</p><p style="color:#8888aa;font-size:13px;">New token:</p>${tokenBox(token)}<p style="color:#f87171;font-size:12px;">Previous token (${oldToken}) is no longer linked. If this wasn't you, create a new setup at ${BASE_URL}/setup.html</p>`));
        return res.json({ ok: true, message: "Registration updated. Check your inbox." });
      }
      await sendEmail(normEmail, "Ultra MAX — Email registered", wrap(`<p>Your email has been registered against your Ultra MAX token.</p><p style="color:#8888aa;font-size:13px;">Your token:</p>${tokenBox(token)}<p style="color:#8888aa;font-size:13px;">To recover: <a href="${BASE_URL}/recover" style="color:#9B5FFF;">${BASE_URL.replace(/^https?:\/\//, '')}/recover</a></p>`));
      res.json({ ok: true, message: "Email registered. Check your inbox for confirmation." });
    } catch (err) {
      console.error("[token-recovery] register error:", err.message);
      res.status(500).json({ error: "Failed to register email" });
    }
  };
}

function recoverToken() {
  return async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: "Email required" });
      const normEmail = normaliseEmail(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail)) return res.status(400).json({ error: "Invalid email address" });
      if (isRateLimited(normEmail)) return res.status(429).json({ error: "Too many requests. Try again in an hour." });
      const emails = loadEmails();
      const token = emails[normEmail];
      if (!token) return res.json({ ok: true, message: "If that email is registered, you'll receive your token shortly." });
      const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "unknown";
      await sendEmail(normEmail, "Ultra MAX — Your token", wrap(`<p>Here is your Ultra MAX install token:</p>${tokenBox(token)}<p style="color:#8888aa;font-size:13px;">To reinstall: go to <a href="${BASE_URL}/setup.html" style="color:#9B5FFF;">${BASE_URL.replace(/^https?:\/\//, '')}/setup.html</a> → Load Token → paste above.</p><p style="font-size:11px;color:#44445a;">Requested from IP: ${ip}</p>`));
      res.json({ ok: true, message: "If that email is registered, you'll receive your token shortly." });
    } catch (err) {
      console.error("[token-recovery] recover error:", err.message);
      res.status(500).json({ error: "Failed to send recovery email" });
    }
  };
}

module.exports = { registerEmail, recoverToken };
