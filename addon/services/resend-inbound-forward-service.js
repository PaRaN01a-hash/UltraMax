"use strict";

const { Resend } = require("resend");

const SUPPORT_ADDRESS = "support@ultramax.vip";
const DEFAULT_FORWARD_TO = "maxstreamsdev@gmail.com";
const DEFAULT_FORWARD_FROM = "Ultra MAX Support <support@ultramax.vip>";

function normaliseAddress(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

function eventTargetsSupport(event) {
  const data = event && event.data ? event.data : {};
  const candidates = []
    .concat(Array.isArray(data.to) ? data.to : [])
    .concat(Array.isArray(data.received_for) ? data.received_for : []);
  return candidates.some((value) => normaliseAddress(value) === SUPPORT_ADDRESS);
}

async function downloadAttachment(attachment, fetchImpl = fetch) {
  const response = await fetchImpl(attachment.download_url);
  if (!response.ok) {
    throw new Error(`attachment_download_failed_${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    filename: attachment.filename || "attachment",
    content: bytes.toString("base64"),
    content_type: attachment.content_type,
    content_id: attachment.content_id || undefined
  };
}

async function forwardReceivedEmail(emailId, deps = {}) {
  const inboundApiKey = deps.inboundApiKey || process.env.RESEND_INBOUND_API_KEY;
  const sendApiKey = deps.sendApiKey || process.env.RESEND_API_KEY;
  const to = deps.to || process.env.RESEND_INBOUND_FORWARD_TO || DEFAULT_FORWARD_TO;
  const from = deps.from || process.env.RESEND_INBOUND_FORWARD_FROM || DEFAULT_FORWARD_FROM;

  if (!inboundApiKey || !sendApiKey || !to || !from) {
    throw new Error("resend_inbound_not_configured");
  }

  const inbound = deps.inboundClient || new Resend(inboundApiKey);
  const sender = deps.sendClient || new Resend(sendApiKey);
  const fetchImpl = deps.fetchImpl || fetch;

  const received = await inbound.emails.receiving.get(emailId, { html_format: "cid" });
  if (received.error || !received.data) {
    throw new Error(received.error?.message || "received_email_lookup_failed");
  }

  const email = received.data;
  let attachments = [];

  if (Array.isArray(email.attachments) && email.attachments.length) {
    const listed = await inbound.emails.receiving.attachments.list({ emailId });
    if (listed.error) {
      throw new Error(listed.error.message || "attachment_list_failed");
    }
    attachments = await Promise.all(
      (listed.data?.data || []).map((item) => downloadAttachment(item, fetchImpl))
    );
  }

  const payload = {
    from,
    to: [to],
    subject: email.subject || "(no subject)",
    replyTo: email.from,
    text: email.text || undefined,
    html: email.html || undefined,
    attachments: attachments.length ? attachments : undefined,
    headers: {
      "X-UltraMax-Inbound-Email-Id": emailId
    }
  };

  const sent = await sender.emails.send(payload, {
    idempotencyKey: `ultramax-support-forward/${emailId}`
  });
  if (sent.error) {
    throw new Error(sent.error.message || "support_forward_failed");
  }

  return sent.data;
}

function registerResendInboundForwardRoutes(app, deps = {}) {
  app.post("/api/resend/inbound", async (req, res) => {
    try {
      const webhookSecret = deps.webhookSecret || process.env.RESEND_WEBHOOK_SECRET;
      const verifyApiKey =
        deps.verifyApiKey ||
        process.env.RESEND_INBOUND_API_KEY ||
        process.env.RESEND_API_KEY;

      if (!webhookSecret || !verifyApiKey) {
        return res.status(503).json({ ok: false, error: "not_configured" });
      }

      const rawBody = Buffer.isBuffer(req.rawBody)
        ? req.rawBody.toString("utf8")
        : JSON.stringify(req.body || {});

      const verifier = deps.verifierClient || new Resend(verifyApiKey);
      const event = verifier.webhooks.verify({
        payload: rawBody,
        headers: {
          id: req.get("svix-id"),
          timestamp: req.get("svix-timestamp"),
          signature: req.get("svix-signature")
        },
        webhookSecret
      });

      if (!event || event.type !== "email.received") {
        return res.status(200).json({ ok: true, ignored: true });
      }

      if (!eventTargetsSupport(event)) {
        return res.status(200).json({ ok: true, ignored: true });
      }

      const emailId = event.data && event.data.email_id;
      if (!emailId) {
        return res.status(400).json({ ok: false, error: "missing_email_id" });
      }

      await (deps.forwardReceivedEmail || forwardReceivedEmail)(emailId, deps.forwardDeps || {});
      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[resend-inbound] webhook failed:", error.message);
      return res.status(400).json({ ok: false, error: "invalid_or_failed_webhook" });
    }
  });
}

module.exports = {
  registerResendInboundForwardRoutes,
  forwardReceivedEmail,
  eventTargetsSupport,
  normaliseAddress,
  downloadAttachment
};
