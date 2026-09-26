const BASE_URL =
  process.env.NUVIO_LIVE_SPORTS_BASE_URL ||
  "http://nuvio-live-sports-selfhost:7000";

const DEFAULT_CONFIG =
  process.env.NUVIO_LIVE_SPORTS_CONFIG ||
  "eyJ0aW1lem9uZSI6IkV1cm9wZS9Mb25kb24ifQ";

const REQUEST_TIMEOUT_MS =
  Number(
    process.env.NUVIO_LIVE_SPORTS_TIMEOUT_MS
  ) || 15000;

const CACHE_TTL_MS =
  Number(
    process.env.NUVIO_LIVE_SPORTS_CACHE_TTL_MS
  ) || 60 * 1000;

const catalogCache =
  new Map();

function clean(value) {
  return String(
    value == null
      ? ""
      : value
  ).trim();
}

async function fetchJson(url) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            "User-Agent":
              "UltraMAX/8.1.3 Nuvio-Live-Sports-Proxy",
            Accept:
              "application/json"
          },
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        `Nuvio Live Sports HTTP ${response.status}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(
  resource,
  type,
  id
) {
  return (
    `${BASE_URL}/` +
    `${encodeURIComponent(DEFAULT_CONFIG)}/` +
    `${resource}/` +
    `${encodeURIComponent(type)}/` +
    `${encodeURIComponent(id)}.json`
  );
}

async function getNuvioSportsCatalogMetas(
  catalogId,
  type = "tv"
) {
  const key =
    `${type}:${catalogId}`;

  const cached =
    catalogCache.get(key);

  if (
    cached &&
    Date.now() - cached.at <
      CACHE_TTL_MS
  ) {
    return cached.metas;
  }

  const payload =
    await fetchJson(
      buildUrl(
        "catalog",
        type,
        catalogId
      )
    );

  const metas =
    Array.isArray(payload?.metas)
      ? payload.metas
      : [];

  catalogCache.set(
    key,
    {
      at: Date.now(),
      metas
    }
  );

  return metas;
}

async function getNuvioSportsMeta(
  id,
  type = "tv"
) {
  const payload =
    await fetchJson(
      buildUrl(
        "meta",
        type,
        id
      )
    );

  return payload?.meta || null;
}

async function getNuvioSportsStreams(
  id,
  type = "tv"
) {
  const payload =
    await fetchJson(
      buildUrl(
        "stream",
        type,
        id
      )
    );

  const streams =
    Array.isArray(payload?.streams)
      ? payload.streams
      : [];

  /*
   * The self-hosted sports service is reached internally over Docker DNS,
   * but clients must never receive that private hostname.
   *
   * Rewrite only URLs belonging to the sports backend itself.
   * Direct HLS/CDN URLs remain untouched.
   */
  const publicBaseUrl =
    process.env.NUVIO_LIVE_SPORTS_PUBLIC_URL ||
    "https://sports-ultramax.vip";

  return streams.map(stream => {
    if (!stream || typeof stream !== "object") {
      return stream;
    }

    const rewritten = {
      ...stream
    };

    for (const field of ["url", "externalUrl"]) {
      if (typeof rewritten[field] !== "string") {
        continue;
      }

      if (
        rewritten[field].startsWith(
          "http://nuvio-live-sports-selfhost:7000"
        )
      ) {
        rewritten[field] =
          publicBaseUrl +
          rewritten[field].slice(
            "http://nuvio-live-sports-selfhost:7000".length
          );
      }

      if (
        rewritten[field].startsWith(
          "http://127.0.0.1:7120"
        )
      ) {
        rewritten[field] =
          publicBaseUrl +
          rewritten[field].slice(
            "http://127.0.0.1:7120".length
          );
      }
    }

    return rewritten;
  });
}

function isNuvioSportsId(id) {
  return clean(id)
    .startsWith("nuvio_sport_");
}

module.exports = {
  BASE_URL,
  DEFAULT_CONFIG,
  getNuvioSportsCatalogMetas,
  getNuvioSportsMeta,
  getNuvioSportsStreams,
  isNuvioSportsId
};
