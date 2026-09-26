"use strict";

const crypto = require("crypto");
const {
  createSportsTranscoderSession
} = require(
  "./sports-transcoder-client-service"
);

const { Readable } = require("stream");

const TOKEN_TTL_MS =
  Number(
    process.env.SPORTS_HLS_PROXY_TOKEN_TTL_MS
  ) ||
  6 * 60 * 60 * 1000;

const FETCH_TIMEOUT_MS =
  Number(
    process.env.SPORTS_HLS_PROXY_FETCH_TIMEOUT_MS
  ) ||
  15000;

const sessions =
  new Map();

function clean(value) {
  return String(value || "")
    .trim();
}

function cleanupExpiredSessions() {
  const now =
    Date.now();

  for (
    const [token, session]
    of sessions.entries()
  ) {
    if (
      !session ||
      session.expiresAt <= now
    ) {
      sessions.delete(token);
    }
  }
}

function resolveBaseUrl(req) {
  const host =
    req.get("host") || "";

  const isLoopback =
    /^127\.0\.0\.1(?::\d+)?$/i
      .test(host) ||
    /^localhost(?::\d+)?$/i
      .test(host);

  const forwardedProto =
    clean(
      req.headers[
        "x-forwarded-proto"
      ]
    )
      .split(",")[0]
      .trim();

  /*
   * Public Ultra MAX deployments are HTTPS.
   *
   * Reverse proxies may connect to the Node
   * container over HTTP and can therefore supply
   * X-Forwarded-Proto=http even though the client
   * reached Ultra MAX over HTTPS.
   *
   * Never emit an insecure public sports playback
   * URL because that can trigger mixed-content
   * blocking in clients.
   *
   * Preserve normal HTTP behaviour for loopback
   * development and direct local diagnostics.
   */
  const proto =
    isLoopback
      ? (
          forwardedProto ||
          "http"
        )
      : "https";

  return `${proto}://${host}`;
}

function getExtension(url) {
  try {
    const pathname =
      new URL(url).pathname;

    const match =
      pathname.match(
        /(\.[a-z0-9]{1,8})$/i
      );

    return match
      ? match[1]
      : "";
  } catch (_) {
    return "";
  }
}

function makeResourceId(url) {
  const digest =
    crypto
      .createHash("sha256")
      .update(url)
      .digest("hex")
      .slice(0, 24);

  return (
    digest +
    getExtension(url)
  );
}

function registerResource(
  session,
  url
) {
  const absolute =
    clean(url);

  if (!absolute) {
    return null;
  }

  if (
    session.resourceIdsByUrl
      .has(absolute)
  ) {
    return (
      session.resourceIdsByUrl
        .get(absolute)
    );
  }

  let resourceId =
    makeResourceId(
      absolute
    );

  let suffix = 0;

  while (
    session.resources.has(
      resourceId
    ) &&
    session.resources.get(
      resourceId
    ) !== absolute
  ) {
    suffix += 1;

    resourceId =
      makeResourceId(
        `${absolute}#${suffix}`
      );
  }

  session.resources.set(
    resourceId,
    absolute
  );

  session.resourceIdsByUrl.set(
    absolute,
    resourceId
  );

  return resourceId;
}

function buildProxyUrl(
  baseUrl,
  token,
  resourceId
) {
  return (
    `${baseUrl}` +
    `/sports-hls/` +
    `${encodeURIComponent(token)}/` +
    `${encodeURIComponent(resourceId)}`
  );
}

async function createSportsHlsProxyStream(
  req,
  stream
) {
  const url =
    clean(stream?.url);

  if (!url) {
    return stream;
  }

  cleanupExpiredSessions();

  const transcodedUrl =
    await createSportsTranscoderSession(
      stream
    );

  const effectiveStream =
    transcodedUrl
      ? {
          ...stream,
          url:
            transcodedUrl,
          userAgent:
            undefined,
          referrer:
            undefined
        }
      : stream;

  const effectiveUrl =
    clean(
      effectiveStream?.url
    );

  if (!effectiveUrl) {
    return stream;
  }

  const token =
    crypto
      .randomBytes(24)
      .toString("base64url");

  const headers = {};

  if (effectiveStream.userAgent) {
    headers["User-Agent"] =
      effectiveStream.userAgent;
  }

  if (effectiveStream.referrer) {
    headers["Referer"] =
      effectiveStream.referrer;
  }

  const session = {
    expiresAt:
      Date.now() +
      TOKEN_TTL_MS,

    headers,

    resources:
      new Map(),

    resourceIdsByUrl:
      new Map()
  };

  const resourceId =
    registerResource(
      session,
      effectiveUrl
    );

  sessions.set(
    token,
    session
  );

  const baseUrl =
    resolveBaseUrl(req);

  return {
    ...stream,

    url:
      buildProxyUrl(
        baseUrl,
        token,
        resourceId
      ),

    sourceUrl:
      undefined,

    userAgent:
      undefined,

    referrer:
      undefined
  };
}

function rewritePlaylist(
  text,
  playlistUrl,
  session,
  baseUrl,
  token
) {
  function rewriteUrl(value) {
    let absolute;

    try {
      absolute =
        new URL(
          value,
          playlistUrl
        ).href;
    } catch (_) {
      return value;
    }

    const resourceId =
      registerResource(
        session,
        absolute
      );

    return buildProxyUrl(
      baseUrl,
      token,
      resourceId
    );
  }

  return String(text || "")
    .split("\n")
    .map(line => {
      const trimmed =
        line.trim();

      if (!trimmed) {
        return line;
      }

      if (
        !trimmed.startsWith("#")
      ) {
        return rewriteUrl(
          trimmed
        );
      }

      return line.replace(
        /URI="([^"]+)"/g,
        (_, uri) =>
          `URI="${rewriteUrl(uri)}"`
      );
    })
    .join("\n");
}

async function fetchWithTimeout(
  url,
  options = {}
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      FETCH_TIMEOUT_MS
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

function isPlaylist(
  url,
  contentType
) {
  return (
    /\.m3u8(?:$|\?)/i
      .test(url) ||
    /mpegurl|m3u8/i
      .test(
        contentType || ""
      )
  );
}

async function handleSportsHlsProxy(
  req,
  res
) {
  cleanupExpiredSessions();

  const token =
    clean(
      req.params.token
    );

  const resourceId =
    clean(
      req.params.resourceId
    );

  const session =
    sessions.get(token);

  if (
    !session ||
    session.expiresAt <=
      Date.now()
  ) {
    sessions.delete(token);

    return res
      .status(404)
      .send(
        "Sports stream session expired"
      );
  }

  const upstreamUrl =
    session.resources.get(
      resourceId
    );

  if (!upstreamUrl) {
    return res
      .status(404)
      .send(
        "Sports stream resource not found"
      );
  }

  const headers = {
    ...session.headers
  };

  if (
    req.headers.range
  ) {
    headers.Range =
      req.headers.range;
  }

  let upstream;

  try {
    upstream =
      await fetchWithTimeout(
        upstreamUrl,
        {
          headers,
          redirect:
            "follow"
        }
      );
  } catch (error) {
    console.warn(
      "[sports-hls] upstream fetch failed",
      error?.message ||
        error
    );

    return res
      .status(502)
      .send(
        "Sports stream upstream unavailable"
      );
  }

  if (!upstream.ok) {
    console.warn(
      "[sports-hls] upstream status",
      upstream.status,
      upstreamUrl
    );

    return res
      .status(
        upstream.status
      )
      .send(
        "Sports stream upstream error"
      );
  }

  const finalUrl =
    upstream.url ||
    upstreamUrl;

  const contentType =
    upstream.headers.get(
      "content-type"
    ) || "";

  res.set(
    "Access-Control-Allow-Origin",
    "*"
  );

  if (
    isPlaylist(
      finalUrl,
      contentType
    )
  ) {
    const text =
      await upstream.text();

    if (
      !text.includes(
        "#EXTM3U"
      )
    ) {
      return res
        .status(502)
        .send(
          "Invalid HLS playlist"
        );
    }

    const rewritten =
      rewritePlaylist(
        text,
        finalUrl,
        session,
        resolveBaseUrl(req),
        token
      );

    res.set(
      "Content-Type",
      "application/vnd.apple.mpegurl"
    );

    res.set(
      "Cache-Control",
      "no-store"
    );

    return res.send(
      rewritten
    );
  }

  if (contentType) {
    res.set(
      "Content-Type",
      contentType
    );
  }

  const contentLength =
    upstream.headers.get(
      "content-length"
    );

  if (contentLength) {
    res.set(
      "Content-Length",
      contentLength
    );
  }

  const contentRange =
    upstream.headers.get(
      "content-range"
    );

  if (contentRange) {
    res.set(
      "Content-Range",
      contentRange
    );
  }

  const acceptRanges =
    upstream.headers.get(
      "accept-ranges"
    );

  if (acceptRanges) {
    res.set(
      "Accept-Ranges",
      acceptRanges
    );
  }

  res.status(
    upstream.status
  );

  if (!upstream.body) {
    return res.end();
  }

  const body =
    Readable.fromWeb(
      upstream.body
    );

  body.on(
    "error",
    error => {
      console.warn(
        "[sports-hls] downstream pipe failed",
        error?.message ||
          error
      );

      if (!res.headersSent) {
        res.status(502);
      }

      res.end();
    }
  );

  body.pipe(res);
}

function getSportsHlsProxyStats() {
  cleanupExpiredSessions();

  let resources = 0;

  for (
    const session
    of sessions.values()
  ) {
    resources +=
      session.resources.size;
  }

  return {
    sessions:
      sessions.size,
    resources
  };
}

module.exports = {
  createSportsHlsProxyStream,
  handleSportsHlsProxy,
  getSportsHlsProxyStats
};
