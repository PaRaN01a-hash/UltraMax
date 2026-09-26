"use strict";

const { rateLimit } = require("../utils/rate-limit");
const { trustedClientIp } = require("../utils/client-ip");

const SUBJECT_MAX = 150;
const MESSAGE_MAX = 5000;
const EMAIL_MAX = 254;
const CONTEXT_VALUE_MAX = 200;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RESEND_TIMEOUT_MS = 8000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONTEXT_ALLOWED_KEYS = ["version", "step", "locale", "mode", "userAgent", "timestamp"];

const GENERIC_SUCCESS = { ok: true, message: "Message sent. Thanks for reaching out." };
const GENERIC_FAILURE = { ok: false, error: "Failed to send your message. Please try again later." };
const GENERIC_RATE_LIMITED = { ok: false, error: "Too many requests. Please try again later." };

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeDiagnostics(context) {
  const out = {};
  if (!context || typeof context !== "object") return out;
  for (const key of CONTEXT_ALLOWED_KEYS) {
    const raw = context[key];
    if (raw === undefined || raw === null) continue;
    const str = String(raw).slice(0, CONTEXT_VALUE_MAX);
    if (str) out[key] = str;
  }
  return out;
}

function validateSupportPayload(body) {
  const errors = [];
  const src = body && typeof body === "object" ? body : {};

  const subject = typeof src.subject === "string" ? src.subject.trim() : "";
  const message = typeof src.message === "string" ? src.message.trim() : "";
  const replyEmailRaw = typeof src.replyEmail === "string" ? src.replyEmail.trim() : "";
  const company = typeof src.company === "string" ? src.company.trim() : "";

  if (!subject) errors.push("Subject is required.");
  else if (subject.length > SUBJECT_MAX) errors.push("Subject is too long.");

  if (!message) errors.push("Message is required.");
  else if (message.length > MESSAGE_MAX) errors.push("Message is too long.");

  let replyEmail = "";
  if (replyEmailRaw) {
    if (replyEmailRaw.length > EMAIL_MAX || !EMAIL_RE.test(replyEmailRaw)) {
      errors.push("Reply email is invalid.");
    } else {
      replyEmail = replyEmailRaw;
    }
  }

  const diagnostics = sanitizeDiagnostics(src.context);

  return {
    valid: errors.length === 0,
    errors,
    isHoneypot: !!company,
    data: { subject, message, replyEmail, diagnostics }
  };
}

function composeEmailContent({ subject, message, replyEmail, diagnostics }) {
  const serverTimestamp = new Date().toISOString();

  const diagLines = Object.keys(diagnostics).map((key) => `${key}: ${diagnostics[key]}`);

  const textParts = [
    `Subject: ${subject}`,
    "",
    message,
    ""
  ];
  if (replyEmail) textParts.push(`Reply email: ${replyEmail}`, "");
  textParts.push(`Server timestamp: ${serverTimestamp}`);
  if (diagLines.length) textParts.push("", "Diagnostics:", ...diagLines);
  const text = textParts.join("\n");

  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const safeReplyEmail = replyEmail ? escapeHtml(replyEmail) : "";
  const safeDiagRows = Object.keys(diagnostics)
    .map((key) => `<tr><td style="color:#8888aa;padding:2px 8px 2px 0;">${escapeHtml(key)}</td><td style="color:#bcbcbc;">${escapeHtml(diagnostics[key])}</td></tr>`)
    .join("");

  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#080810;color:#e8e8f0;padding:32px;border-radius:12px;">
    <h2 style="color:#9B5FFF;margin:0 0 20px;">ULTRA MAX SUPPORT MESSAGE</h2>
    <p style="color:#8888aa;font-size:12px;margin:0 0 4px;">Subject</p>
    <p style="margin:0 0 16px;font-weight:600;">${safeSubject}</p>
    <p style="color:#8888aa;font-size:12px;margin:0 0 4px;">Message</p>
    <p style="margin:0 0 16px;line-height:1.6;">${safeMessage}</p>
    ${safeReplyEmail ? `<p style="color:#8888aa;font-size:12px;margin:0 0 4px;">Reply email</p><p style="margin:0 0 16px;">${safeReplyEmail}</p>` : ""}
    <p style="font-size:11px;color:#44445a;margin:20px 0 0;border-top:1px solid #1e1e36;padding-top:12px;">Server timestamp: ${escapeHtml(serverTimestamp)}</p>
    ${safeDiagRows ? `<table style="font-size:11px;margin-top:8px;">${safeDiagRows}</table>` : ""}
  </div>`;

  return { text, html, serverTimestamp };
}

async function sendSupportEmail({ subject, text, html, replyEmail }, deps = {}) {
  const apiKey = deps.apiKey !== undefined ? deps.apiKey : (process.env.RESEND_SUPPORT_API_KEY || process.env.RESEND_API_KEY);
  const to = deps.to !== undefined ? deps.to : process.env.SUPPORT_EMAIL_TO;
  const from = deps.from !== undefined ? deps.from : process.env.SUPPORT_EMAIL_FROM;
  const fetchImpl = deps.fetchImpl || fetch;

  if (!apiKey || !to || !from) {
    throw new Error("support_email_not_configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  try {
    const body = {
      from,
      to: [to],
      subject: `[Ultra MAX Support] ${subject}`,
      text,
      html
    };
    if (replyEmail) body.reply_to = replyEmail;

    const r = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!r.ok) throw new Error("resend_send_failed");
    return true;
  } finally {
    clearTimeout(timer);
  }
}

function registerSupportMessageRoutes(app, deps = {}) {
  const rateLimitFn = deps.rateLimit || rateLimit;
  const sendEmailFn = deps.sendSupportEmail || sendSupportEmail;
  const emailDeps = deps.emailDeps || {};

  app.post("/api/support-message", async (req, res) => {
    try {
      const ip = trustedClientIp(req);

      if (rateLimitFn(`support:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
        return res.status(429).json(GENERIC_RATE_LIMITED);
      }

      const result = validateSupportPayload(req.body);

      if (result.isHoneypot) {
        return res.status(200).json(GENERIC_SUCCESS);
      }

      if (!result.valid) {
        return res.status(400).json({ ok: false, error: result.errors[0] || "Invalid request." });
      }

      const { subject, message, replyEmail, diagnostics } = result.data;
      const { text, html } = composeEmailContent({ subject, message, replyEmail, diagnostics });

      await sendEmailFn({ subject, text, html, replyEmail }, emailDeps);

      return res.status(200).json(GENERIC_SUCCESS);
    } catch (err) {
      console.error("[support-message] send failed");
      return res.status(502).json(GENERIC_FAILURE);
    }
  });
}

module.exports = {
  registerSupportMessageRoutes,
  validateSupportPayload,
  sanitizeDiagnostics,
  composeEmailContent,
  escapeHtml,
  trustedClientIp,
  sendSupportEmail
};
