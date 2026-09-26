"use strict";

const zlib =
  require("zlib");

const {
  baseChannelId,
  normalizeProgrammeMap
} = require(
  "./sports-epg-provider-service"
);

const DEFAULT_TIMEOUT_MS =
  Number(
    process.env.SPORTS_XMLTV_FETCH_TIMEOUT_MS
  ) ||
  15000;

const MAX_GUIDE_BYTES =
  Number(
    process.env.SPORTS_XMLTV_MAX_BYTES
  ) ||
  25 * 1024 * 1024;

function clean(value) {
  return String(value || "")
    .trim();
}

function decodeXmlEntities(value) {
  return clean(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripTags(value) {
  return decodeXmlEntities(
    String(value || "")
      .replace(
        /<[^>]+>/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
  );
}

function getAttribute(
  source,
  name
) {
  const pattern =
    new RegExp(
      `${name}\\s*=\\s*["']([^"']+)["']`,
      "i"
    );

  const match =
    String(source || "")
      .match(pattern);

  return match
    ? decodeXmlEntities(
        match[1]
      )
    : "";
}

function extractElementText(
  block,
  tag
) {
  const pattern =
    new RegExp(
      `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    String(block || "")
      .match(pattern);

  return match
    ? stripTags(
        match[1]
      )
    : "";
}

function parseXmltvProgrammes(
  xml,
  requestedChannelIds = []
) {
  const requested =
    new Set(
      (
        Array.isArray(
          requestedChannelIds
        )
          ? requestedChannelIds
          : []
      )
        .map(
          baseChannelId
        )
        .filter(Boolean)
    );

  const result = {};

  for (
    const id
    of requested
  ) {
    result[id] = [];
  }

  const source =
    String(xml || "");

  if (!source.trim()) {
    return result;
  }

  const programmePattern =
    /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;

  let match;

  while (
    (
      match =
        programmePattern.exec(
          source
        )
    )
  ) {
    const attributes =
      match[1] || "";

    const body =
      match[2] || "";

    const rawChannel =
      getAttribute(
        attributes,
        "channel"
      );

    const channelId =
      baseChannelId(
        rawChannel
      );

    if (!channelId) {
      continue;
    }

    if (
      requested.size &&
      !requested.has(channelId)
    ) {
      continue;
    }

    const title =
      extractElementText(
        body,
        "title"
      );

    const subtitle =
      extractElementText(
        body,
        "sub-title"
      ) ||
      extractElementText(
        body,
        "subtitle"
      );

    const desc =
      extractElementText(
        body,
        "desc"
      );

    const start =
      getAttribute(
        attributes,
        "start"
      );

    const stop =
      getAttribute(
        attributes,
        "stop"
      );

    if (
      !title ||
      !start
    ) {
      continue;
    }

    if (!result[channelId]) {
      result[channelId] = [];
    }

    result[channelId]
      .push({
        start,

        ...(stop
          ? { stop }
          : {}),

        title,

        ...(subtitle
          ? { subtitle }
          : {}),

        ...(desc
          ? { desc }
          : {})
      });
  }

  for (
    const programmes
    of Object.values(result)
  ) {
    programmes.sort(
      (a, b) =>
        String(a.start)
          .localeCompare(
            String(b.start)
          )
    );
  }

  return normalizeProgrammeMap(
    result
  );
}

async function readResponseLimited(
  response,
  limit =
    MAX_GUIDE_BYTES
) {
  const reader =
    response.body?.getReader();

  if (!reader) {
    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    if (
      buffer.length >
      limit
    ) {
      throw new Error(
        "XMLTV guide exceeds size limit"
      );
    }

    return buffer;
  }

  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const {
        done,
        value
      } =
        await reader.read();

      if (done) {
        break;
      }

      if (!value?.length) {
        continue;
      }

      total +=
        value.length;

      if (
        total >
        limit
      ) {
        throw new Error(
          "XMLTV guide exceeds size limit"
        );
      }

      chunks.push(
        Buffer.from(value)
      );
    }
  } finally {
    try {
      await reader.cancel();
    } catch (_) {
      // Best effort.
    }
  }

  return Buffer.concat(
    chunks
  );
}

function maybeDecompress(
  buffer,
  {
    contentEncoding = "",
    url = ""
  } = {}
) {
  const encoding =
    clean(
      contentEncoding
    )
      .toLowerCase();

  const looksGzip =
    encoding.includes("gzip") ||
    /\.gz(?:$|\?)/i
      .test(
        clean(url)
      ) ||
    (
      buffer?.length >= 2 &&
      buffer[0] === 0x1f &&
      buffer[1] === 0x8b
    );

  if (!looksGzip) {
    return buffer;
  }

  return zlib.gunzipSync(
    buffer
  );
}

async function fetchXmltvGuide(
  url,
  {
    signal,
    timeoutMs =
      DEFAULT_TIMEOUT_MS,
    headers = {}
  } = {}
) {
  const target =
    clean(url);

  if (!target) {
    throw new Error(
      "missing XMLTV URL"
    );
  }

  const controller =
    new AbortController();

  let externalAbort = null;

  if (signal) {
    externalAbort =
      () =>
        controller.abort();

    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        externalAbort,
        {
          once: true
        }
      );
    }
  }

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs
    );

  try {
    const response =
      await fetch(
        target,
        {
          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "UltraMAX-Sports/8.1.3",

            "Accept":
              "application/xml,text/xml,*/*",

            ...headers
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `XMLTV HTTP ${response.status}`
      );
    }

    const raw =
      await readResponseLimited(
        response
      );

    const buffer =
      maybeDecompress(
        raw,
        {
          contentEncoding:
            response.headers.get(
              "content-encoding"
            ) || "",

          url:
            response.url ||
            target
        }
      );

    const xml =
      buffer.toString(
        "utf8"
      );

    if (
      !/<tv\b/i.test(xml)
    ) {
      throw new Error(
        "response is not XMLTV"
      );
    }

    return {
      url:
        response.url ||
        target,

      bytes:
        buffer.length,

      xml
    };
  } finally {
    clearTimeout(timer);

    if (
      signal &&
      externalAbort
    ) {
      signal.removeEventListener(
        "abort",
        externalAbort
      );
    }
  }
}

function createXmltvFetcher({
  url
}) {
  const sourceUrl =
    clean(url);

  if (!sourceUrl) {
    throw new Error(
      "missing XMLTV source URL"
    );
  }

  return async function xmltvFetcher(
    channelIds,
    {
      signal
    } = {}
  ) {
    const guide =
      await fetchXmltvGuide(
        sourceUrl,
        {
          signal
        }
      );

    return parseXmltvProgrammes(
      guide.xml,
      channelIds
    );
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MAX_GUIDE_BYTES,
  decodeXmlEntities,
  stripTags,
  getAttribute,
  extractElementText,
  parseXmltvProgrammes,
  maybeDecompress,
  fetchXmltvGuide,
  createXmltvFetcher
};
