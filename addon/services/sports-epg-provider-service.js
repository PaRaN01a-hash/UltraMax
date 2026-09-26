"use strict";

const DEFAULT_CACHE_TTL_MS =
  Number(
    process.env.SPORTS_EPG_CACHE_TTL_MS
  ) ||
  30 * 60 * 1000;

const DEFAULT_FETCH_TIMEOUT_MS =
  Number(
    process.env.SPORTS_EPG_FETCH_TIMEOUT_MS
  ) ||
  10000;

const cache =
  new Map();

function clean(value) {
  return String(value || "")
    .trim();
}

function baseChannelId(value) {
  return clean(value)
    .split("@", 1)[0];
}

function normalizeProgramme(
  programme
) {
  if (
    !programme ||
    typeof programme !== "object"
  ) {
    return null;
  }

  const title =
    clean(
      programme.title
    );

  const subtitle =
    clean(
      programme.subtitle
    );

  const description =
    clean(
      programme.desc ||
      programme.description
    );

  const start =
    clean(
      programme.start
    );

  const stop =
    clean(
      programme.stop
    );

  if (
    !title ||
    !start
  ) {
    return null;
  }

  return {
    start,

    ...(stop
      ? { stop }
      : {}),

    title,

    ...(subtitle
      ? { subtitle }
      : {}),

    ...(description
      ? {
          desc:
            description
        }
      : {})
  };
}

function normalizeProgrammeList(
  programmes
) {
  if (
    !Array.isArray(
      programmes
    )
  ) {
    return [];
  }

  return programmes
    .map(
      normalizeProgramme
    )
    .filter(Boolean);
}

function normalizeProgrammeMap(
  value
) {
  const result = {};

  if (!value) {
    return result;
  }

  const entries =
    value instanceof Map
      ? [
          ...value.entries()
        ]
      : (
          typeof value === "object" &&
          !Array.isArray(value)
        )
          ? Object.entries(value)
          : [];

  for (
    const [
      channelId,
      programmes
    ]
    of entries
  ) {
    const id =
      baseChannelId(
        channelId
      );

    if (!id) {
      continue;
    }

    result[id] =
      normalizeProgrammeList(
        programmes
      );
  }

  return result;
}

function getCached(
  key
) {
  const cached =
    cache.get(key);

  if (!cached) {
    return null;
  }

  if (
    Date.now() -
      cached.fetchedAt >
    DEFAULT_CACHE_TTL_MS
  ) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(
  key,
  value
) {
  cache.set(
    key,
    {
      fetchedAt:
        Date.now(),
      value
    }
  );

  return value;
}

function clearSportsEpgCache() {
  cache.clear();
}

/*
 * Provider boundary.
 *
 * Stage C1 deliberately does not know
 * HOW EPG data is acquired.
 *
 * A fetcher receives normalized channel
 * IDs and must return:
 *
 * {
 *   "SkySportsFootball.ie": [...],
 *   "NBATV.us": [...]
 * }
 *
 * This keeps the fixture/broadcast logic
 * isolated from XMLTV transport,
 * scraping tools and storage.
 */
async function getProgrammesForChannels(
  channelIds,
  {
    fetcher,
    force = false
  } = {}
) {
  const ids =
    [
      ...new Set(
        (
          Array.isArray(channelIds)
            ? channelIds
            : []
        )
          .map(
            baseChannelId
          )
          .filter(Boolean)
      )
    ];

  const result = {};
  const missing = [];

  for (
    const id
    of ids
  ) {
    if (!force) {
      const cached =
        getCached(id);

      if (cached) {
        result[id] =
          cached;

        continue;
      }
    }

    missing.push(id);
  }

  if (!missing.length) {
    return result;
  }

  if (
    typeof fetcher !==
    "function"
  ) {
    for (
      const id
      of missing
    ) {
      result[id] = [];
    }

    return result;
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      DEFAULT_FETCH_TIMEOUT_MS
    );

  let fetched;

  try {
    fetched =
      await fetcher(
        missing,
        {
          signal:
            controller.signal
        }
      );
  } finally {
    clearTimeout(timer);
  }

  const normalized =
    normalizeProgrammeMap(
      fetched
    );

  for (
    const id
    of missing
  ) {
    const programmes =
      normalized[id] ||
      [];

    result[id] =
      setCached(
        id,
        programmes
      );
  }

  return result;
}

module.exports = {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_FETCH_TIMEOUT_MS,
  baseChannelId,
  normalizeProgramme,
  normalizeProgrammeList,
  normalizeProgrammeMap,
  getProgrammesForChannels,
  clearSportsEpgCache
};
