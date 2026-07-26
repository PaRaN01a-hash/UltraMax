// Proxies Nuvio API calls through ultramax.vip so the Capacitor WebView
// (which can't reach api.nuvio.tv directly due to CORS/network restrictions)
// only ever talks to our own origin. See nuvio-push.js for the client side.

const axios = require("axios");

const NUVIO_API_BASE = "https://api.nuvio.tv";
const FORWARD_HEADERS = ["authorization", "apikey", "content-type", "x-client-info"];

function buildUpstreamHeaders(req) {
  const headers = {};
  for (const h of FORWARD_HEADERS) {
    if (req.headers[h] !== undefined) headers[h] = req.headers[h];
  }
  return headers;
}

async function forward(req, res, method, upstreamPath, rawQuery) {
  const url = `${NUVIO_API_BASE}${upstreamPath}${rawQuery || ""}`;
  const startedAt = Date.now();
  try {
    const response = await axios({
      method,
      url,
      headers: buildUpstreamHeaders(req),
      data: method === "GET" ? undefined : req.body,
      validateStatus: () => true,
      responseType: "text",
      timeout: 15000
    });
    console.log(`[nuvio-proxy] ${method} ${req.path} -> ${response.status} (${Date.now() - startedAt}ms)`);
    res.status(response.status)
      .set("Content-Type", response.headers["content-type"] || "application/json")
      .send(response.data);
  } catch (err) {
    console.log(`[nuvio-proxy] ${method} ${req.path} -> ERROR (${Date.now() - startedAt}ms): ${err.message || err}`);
    res.status(502).json({ error: "Failed to reach Nuvio API", details: err.message || String(err) });
  }
}

function registerNuvioProxyRoutes(app) {
  app.post("/api/nuvio/auth/login", (req, res) =>
    forward(req, res, "POST", "/auth/v1/token?grant_type=password"));

  app.post("/api/nuvio/auth/refresh", (req, res) =>
    forward(req, res, "POST", "/auth/v1/token?grant_type=refresh_token"));

  app.post("/api/nuvio/rpc/sync_pull_profiles", (req, res) =>
    forward(req, res, "POST", "/rest/v1/rpc/sync_pull_profiles"));

  app.get("/api/nuvio/addons", (req, res) => {
    const qIndex = req.originalUrl.indexOf("?");
    const rawQuery = qIndex >= 0 ? req.originalUrl.slice(qIndex) : "";
    forward(req, res, "GET", "/rest/v1/addons", rawQuery);
  });

  app.post("/api/nuvio/rpc/sync_pull_collections", (req, res) =>
    forward(req, res, "POST", "/rest/v1/rpc/sync_pull_collections"));

  app.post("/api/nuvio/rpc/sync_push_addons", (req, res) =>
    forward(req, res, "POST", "/rest/v1/rpc/sync_push_addons"));

  app.post("/api/nuvio/rpc/sync_push_collections", (req, res) =>
    forward(req, res, "POST", "/rest/v1/rpc/sync_push_collections"));

  app.post("/api/nuvio/rpc/sync_push_profiles", (req, res) =>
    forward(req, res, "POST", "/rest/v1/rpc/sync_push_profiles"));
}

module.exports = { registerNuvioProxyRoutes };
