"use strict";

const { isIP } = require("node:net");

function trustedClientIp(req) {
  const raw = typeof req?.headers?.["x-real-ip"] === "string"
    ? req.headers["x-real-ip"].trim()
    : "";
  if (isIP(raw)) return raw;
  return req?.ip || req?.socket?.remoteAddress || "unknown";
}

module.exports = { trustedClientIp };
