"use strict";

const IPTV_CHANNELS_URL =
  "https://iptv-org.github.io/api/channels.json";

const IPTV_STREAMS_URL =
  "https://iptv-org.github.io/api/streams.json";

const INDEX_CACHE_TTL_MS =
  Number(process.env.SPORTS_LIVE_INDEX_CACHE_MS) ||
  30 * 60 * 1000;

const HEALTH_CACHE_TTL_MS =
  Number(process.env.SPORTS_LIVE_HEALTH_CACHE_MS) ||
  5 * 60 * 1000;

const FETCH_TIMEOUT_MS =
  Number(process.env.SPORTS_LIVE_FETCH_TIMEOUT_MS) ||
  8000;

const VALIDATION_BYTES = 128 * 1024;

let indexCache = {
  fetchedAt: 0,
  channels: [],
  streams: []
};

const healthCache = new Map();

function clean(value) {
  return String(value || "")
    .trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(" ")
    .filter(token => token.length >= 2);
}

function isSportsChannel(channel) {
  return (
    channel &&
    !channel.closed &&
    Array.isArray(channel.categories) &&
    channel.categories.includes("sports")
  );
}

function isUsableStreamRecord(stream) {
  if (!stream || !stream.url) {
    return false;
  }

  if (
    stream.status === "error" ||
    stream.status === "timeout"
  ) {
    return false;
  }

  return true;
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = FETCH_TIMEOUT_MS
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal: controller.signal,
        headers: {
          "User-Agent":
            "UltraMAX-Sports/8.1.3",
          "Accept":
            "*/*",
          ...(options.headers || {})
        }
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  const response =
    await fetchWithTimeout(
      url,
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} fetching ${url}`
    );
  }

  return response.json();
}

async function loadIndexes({
  force = false
} = {}) {
  const now = Date.now();

  if (
    !force &&
    indexCache.channels.length &&
    indexCache.streams.length &&
    now - indexCache.fetchedAt <
      INDEX_CACHE_TTL_MS
  ) {
    return indexCache;
  }

  const [
    channels,
    streams
  ] = await Promise.all([
    fetchJson(IPTV_CHANNELS_URL),
    fetchJson(IPTV_STREAMS_URL)
  ]);

  if (
    !Array.isArray(channels) ||
    !Array.isArray(streams)
  ) {
    throw new Error(
      "IPTV-org returned invalid indexes"
    );
  }

  indexCache = {
    fetchedAt: now,
    channels,
    streams
  };

  return indexCache;
}

function buildSportsInventory(
  channels,
  streams
) {
  const sportsChannels =
    channels.filter(
      isSportsChannel
    );

  const channelMap =
    new Map(
      sportsChannels.map(channel => [
        channel.id,
        channel
      ])
    );

  const streamsByChannel =
    new Map();

  for (const stream of streams) {
    if (
      !isUsableStreamRecord(stream) ||
      !stream.channel ||
      !channelMap.has(stream.channel)
    ) {
      continue;
    }

    if (
      !streamsByChannel.has(
        stream.channel
      )
    ) {
      streamsByChannel.set(
        stream.channel,
        []
      );
    }

    streamsByChannel
      .get(stream.channel)
      .push(stream);
  }

  return sportsChannels
    .filter(channel =>
      streamsByChannel.has(
        channel.id
      )
    )
    .map(channel => ({
      channel,
      streams:
        streamsByChannel.get(
          channel.id
        )
    }));
}

const SPORTS_QUERY_ALIASES = {
  football: [
    "football",
    "soccer",
    "premier league",
    "epl"
  ],

  epl: [
    "premier league",
    "epl",
    "football",
    "soccer"
  ],

  basketball: [
    "basketball",
    "nba",
    "nbl"
  ],

  nba: [
    "nba",
    "basketball"
  ],

  nbl: [
    "nbl",
    "basketball",
    "australia",
    "australian"
  ]
};

function expandSportsQuery(query) {
  const normalized =
    normalize(query);

  const aliases =
    SPORTS_QUERY_ALIASES[normalized] ||
    [];

  return Array.from(
    new Set([
      normalized,
      ...aliases.map(normalize)
    ])
  ).filter(Boolean);
}

function containsNormalizedTerm(
  candidate,
  term
) {
  const haystack =
    ` ${normalize(candidate)} `;

  const needle =
    ` ${normalize(term)} `;

  return (
    needle.trim() &&
    haystack.includes(needle)
  );
}

function calculateTextRelevance(
  query,
  candidate
) {
  const terms =
    expandSportsQuery(query);

  const normalizedQuery =
    normalize(query);

  let relevance = 0;

  for (const term of terms) {
    if (
      !containsNormalizedTerm(
        candidate,
        term
      )
    ) {
      continue;
    }

    relevance +=
      term === normalizedQuery
        ? 100
        : 60;
  }

  return relevance;
}

function scoreTextMatch(
  query,
  candidate
) {
  const queryTokens =
    tokenize(query);

  if (!queryTokens.length) {
    return 0;
  }

  const candidateText =
    normalize(candidate);

  let score = 0;

  for (const token of queryTokens) {
    if (
      candidateText.includes(
        token
      )
    ) {
      score += 20;
    }
  }

  const normalizedQuery =
    normalize(query);

  if (
    normalizedQuery &&
    candidateText.includes(
      normalizedQuery
    )
  ) {
    score += 60;
  }

  return score;
}

function scoreChannel({
  channel,
  streams
}, query) {
  let score = 0;

  const text = [
    channel.name,
    channel.id,
    channel.country,
    ...(channel.languages || [])
  ].join(" ");

  const normalizedQuery =
    normalize(query);

  const relevance =
    normalizedQuery === "sports"
      ? 1
      : calculateTextRelevance(
          query,
          text
        );

  /*
   * Hard relevance gate.
   *
   * Generic "sports" discovery may consider every
   * sports channel. Specific sport/league searches
   * must actually match the channel identity before
   * country, quality or stream-count bonuses apply.
   */
  if (
    normalizedQuery !== "sports" &&
    relevance <= 0
  ) {
    return 0;
  }

  score +=
    normalizedQuery === "sports"
      ? scoreTextMatch(
          query,
          [
            text,
            ...(channel.categories || [])
          ].join(" ")
        )
      : relevance;

  score +=
    Math.min(
      streams.length * 3,
      15
    );

  const country =
    clean(channel.country)
      .toUpperCase();

  if (
    country === "UK" ||
    country === "GB"
  ) {
    score += 8;
  }

  if (
    country === "US" ||
    country === "AU"
  ) {
    score += 5;
  }

  return score;
}

function qualityScore(value) {
  const quality =
    normalize(value);

  if (
    quality.includes("2160") ||
    quality.includes("4k")
  ) {
    return 25;
  }

  if (
    quality.includes("1080")
  ) {
    return 20;
  }

  if (
    quality.includes("720")
  ) {
    return 12;
  }

  if (
    quality.includes("480")
  ) {
    return 5;
  }

  return 0;
}

function getStreamHeaders(stream) {
  const headers = {};

  if (stream.user_agent) {
    headers["User-Agent"] =
      stream.user_agent;
  }

  if (stream.referrer) {
    headers["Referer"] =
      stream.referrer;
  }

  return headers;
}

function absoluteUrl(
  base,
  child
) {
  return new URL(
    child,
    base
  ).href;
}

function getPlaylistUris(text) {
  return clean(text)
    .split("\n")
    .map(line => line.trim())
    .filter(line =>
      line &&
      !line.startsWith("#")
    );
}

async function fetchLimited(
  url,
  headers = {},
  limit = VALIDATION_BYTES
) {
  const response =
    await fetchWithTimeout(
      url,
      {
        headers
      }
    );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  const reader =
    response.body?.getReader();

  if (!reader) {
    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    return {
      response,
      buffer:
        buffer.subarray(
          0,
          limit
        )
    };
  }

  const chunks = [];
  let total = 0;

  try {
    while (
      total < limit
    ) {
      const {
        done,
        value
      } = await reader.read();

      if (done) {
        break;
      }

      if (!value?.length) {
        continue;
      }

      const remaining =
        limit - total;

      const chunk =
        value.length > remaining
          ? value.subarray(
              0,
              remaining
            )
          : value;

      chunks.push(
        Buffer.from(chunk)
      );

      total +=
        chunk.length;
    }
  } finally {
    try {
      await reader.cancel();
    } catch (_) {
      // Best effort.
    }
  }

  return {
    response,
    buffer:
      Buffer.concat(chunks)
  };
}

async function validateHlsStream(
  stream,
  {
    force = false
  } = {}
) {
  const url =
    clean(stream?.url);

  if (!url) {
    return {
      ok: false,
      stage: "input",
      error: "missing URL"
    };
  }

  const cached =
    healthCache.get(url);

  if (
    !force &&
    cached &&
    Date.now() - cached.checkedAt <
      HEALTH_CACHE_TTL_MS
  ) {
    return cached;
  }

  const headers =
    getStreamHeaders(stream);

  const result = {
    ok: false,
    checkedAt: Date.now(),
    playlistUrl: url,
    mediaUrl: null,
    playlistStatus: null,
    variantStatus: null,
    mediaStatus: null,
    mediaBytes: 0,
    error: null,
    stage: null
  };

  try {
    result.stage =
      "playlist";

    const first =
      await fetchLimited(
        url,
        headers
      );

    result.playlistStatus =
      first.response.status;

    const text =
      first.buffer.toString(
        "utf8"
      );

    if (
      !text.includes(
        "#EXTM3U"
      )
    ) {
      throw new Error(
        "not an HLS playlist"
      );
    }

    let mediaPlaylistUrl =
      first.response.url || url;

    let mediaPlaylistText =
      text;

    if (
      text.includes(
        "#EXT-X-STREAM-INF"
      )
    ) {
      const entries =
        getPlaylistUris(text);

      if (!entries.length) {
        throw new Error(
          "master playlist has no variants"
        );
      }

      mediaPlaylistUrl =
        absoluteUrl(
          first.response.url || url,
          entries[0]
        );

      result.stage =
        "variant";

      const variant =
        await fetchLimited(
          mediaPlaylistUrl,
          headers
        );

      result.variantStatus =
        variant.response.status;

      mediaPlaylistUrl =
        variant.response.url ||
        mediaPlaylistUrl;

      mediaPlaylistText =
        variant.buffer.toString(
          "utf8"
        );

      if (
        !mediaPlaylistText.includes(
          "#EXTM3U"
        )
      ) {
        throw new Error(
          "variant is not HLS"
        );
      }
    }

    const mediaEntries =
      getPlaylistUris(
        mediaPlaylistText
      );

    if (!mediaEntries.length) {
      throw new Error(
        "media playlist has no segments"
      );
    }

    result.mediaUrl =
      absoluteUrl(
        mediaPlaylistUrl,
        mediaEntries[0]
      );

    result.stage =
      "media";

    const media =
      await fetchLimited(
        result.mediaUrl,
        headers,
        64 * 1024
      );

    result.mediaStatus =
      media.response.status;

    result.mediaBytes =
      media.buffer.length;

    result.ok =
      (
        result.mediaStatus === 200 ||
        result.mediaStatus === 206
      ) &&
      result.mediaBytes > 0;

    if (!result.ok) {
      throw new Error(
        "media unavailable"
      );
    }

    result.stage =
      "complete";
  } catch (error) {
    result.ok = false;

    result.error =
      error?.message ||
      String(error);
  }

  healthCache.set(
    url,
    result
  );

  return result;
}

async function findCandidateChannels(
  query,
  {
    limit = 20
  } = {}
) {
  const {
    channels,
    streams
  } = await loadIndexes();

  return buildSportsInventory(
    channels,
    streams
  )
    .map(item => ({
      ...item,
      score:
        scoreChannel(
          item,
          query
        )
    }))
    .filter(item =>
      item.score > 0
    )
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(
      0,
      Math.max(
        1,
        Math.min(
          Number(limit) || 20,
          100
        )
      )
    );
}

async function resolveSportsStreams(
  query,
  {
    channelLimit = 8,
    streamLimit = 12,
    validate = true
  } = {}
) {
  const candidates =
    await findCandidateChannels(
      query,
      {
        limit: channelLimit
      }
    );

  const flattened = [];

  for (
    const candidate
    of candidates
  ) {
    for (
      const stream
      of candidate.streams
    ) {
      flattened.push({
        channelId:
          candidate.channel.id,
        channelName:
          candidate.channel.name,
        country:
          candidate.channel.country ||
          null,
        languages:
          candidate.channel.languages ||
          [],
        url:
          stream.url,
        quality:
          stream.quality ||
          null,
        userAgent:
          stream.user_agent ||
          null,
        referrer:
          stream.referrer ||
          null,
        score:
          candidate.score +
          qualityScore(
            stream.quality
          ),
        source:
          "iptv-org",
        _record:
          stream
      });
    }
  }

  flattened.sort(
    (a, b) =>
      b.score - a.score
  );

  const limited =
    flattened.slice(
      0,
      Math.max(
        streamLimit * 3,
        streamLimit
      )
    );

  const results = [];

  for (
    const candidate
    of limited
  ) {
    if (
      results.length >=
      streamLimit
    ) {
      break;
    }

    let health = {
      ok: true,
      stage: "not-validated"
    };

    if (validate) {
      health =
        await validateHlsStream(
          candidate._record
        );
    }

    if (!health.ok) {
      continue;
    }

    results.push({
      channelId:
        candidate.channelId,
      channelName:
        candidate.channelName,
      country:
        candidate.country,
      languages:
        candidate.languages,
      url:
        candidate.url,
      quality:
        candidate.quality,
      userAgent:
        candidate.userAgent,
      referrer:
        candidate.referrer,
      score:
        candidate.score,
      source:
        candidate.source,
      health
    });
  }

  return results;
}

function clearSportsLiveCaches() {
  indexCache = {
    fetchedAt: 0,
    channels: [],
    streams: []
  };

  healthCache.clear();
}

module.exports = {
  IPTV_CHANNELS_URL,
  IPTV_STREAMS_URL,
  SPORTS_QUERY_ALIASES,
  expandSportsQuery,
  containsNormalizedTerm,
  calculateTextRelevance,
  loadIndexes,
  buildSportsInventory,
  findCandidateChannels,
  validateHlsStream,
  resolveSportsStreams,
  clearSportsLiveCaches
};
