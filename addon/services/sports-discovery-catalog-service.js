const path = require("path");

let SPORTS_CATALOGS = {};

try {
  SPORTS_CATALOGS = require(
    path.join(
      __dirname,
      "..",
      "data",
      "sports",
      "discovery.json"
    )
  );
} catch (error) {
  if (error && error.code === "MODULE_NOT_FOUND") {
    console.warn(
      "[sports-discovery] discovery.json not found; discovery catalogs disabled"
    );
  } else {
    throw error;
  }
}

const CINEMETA_BASE =
  process.env.CINEMETA_BASE ||
  "https://v3-cinemeta.strem.io";

const CACHE_TTL_MS =
  6 * 60 * 60 * 1000;

const metaCache =
  new Map();

function stremioType(type) {
  return type === "series"
    ? "series"
    : "movie";
}

function fallbackMeta(seed, type) {
  const mediaType =
    stremioType(type);

  const year =
    seed.year
      ? String(seed.year)
      : undefined;

  return {
    id: seed.id,
    imdb_id: seed.id,
    type: mediaType,
    name: seed.name,
    ...(year
      ? {
          year,
          releaseInfo: year
        }
      : {}),
    poster:
      `https://images.metahub.space/poster/small/${seed.id}/img`,
    background:
      `https://images.metahub.space/background/medium/${seed.id}/img`,
    logo:
      `https://images.metahub.space/logo/medium/${seed.id}/img`,
    genres: ["Sport"],
    posterShape: "poster"
  };
}

async function fetchCinemetaMeta(
  seed,
  type
) {
  const mediaType =
    stremioType(type);

  const cacheKey =
    `${mediaType}:${seed.id}`;

  const cached =
    metaCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.cachedAt <
      CACHE_TTL_MS
  ) {
    return cached.meta;
  }

  try {
    const response =
      await fetch(
        `${CINEMETA_BASE}/meta/${mediaType}/${seed.id}.json`,
        {
          signal:
            AbortSignal.timeout(8000),

          headers: {
            "User-Agent":
              "UltraMAX-Sports/1.0"
          }
        }
      );

    if (!response.ok) {
      throw new Error(
        `Cinemeta HTTP ${response.status}`
      );
    }

    const payload =
      await response.json();

    const source =
      payload &&
      payload.meta;

    if (
      !source ||
      !source.id
    ) {
      throw new Error(
        "Cinemeta returned no meta"
      );
    }

    const fallback =
      fallbackMeta(seed, mediaType);

    const meta = {
      ...fallback,
      ...source,

      id:
        seed.id,

      imdb_id:
        seed.id,

      type:
        mediaType,

      name:
        source.name ||
        seed.name,

      ...(source.year ||
      seed.year
        ? {
            year:
              String(
                source.year ||
                seed.year
              ),

            releaseInfo:
              String(
                source.releaseInfo ||
                source.year ||
                seed.year
              )
          }
        : {})
    };

    metaCache.set(
      cacheKey,
      {
        cachedAt:
          Date.now(),
        meta
      }
    );

    return meta;

  } catch (error) {
    console.warn(
      `[sports-discovery] Cinemeta fallback ${mediaType}/${seed.id}:`,
      error?.message ||
        error
    );

    return fallbackMeta(
      seed,
      mediaType
    );
  }
}

async function getSportsDiscoveryCatalogMetas(
  catalogKey,
  type
) {
  const entries =
    SPORTS_CATALOGS[catalogKey];

  if (!Array.isArray(entries)) {
    return [];
  }

  return Promise.all(
    entries.map(seed =>
      fetchCinemetaMeta(
        seed,
        type
      )
    )
  );
}

function hasSportsDiscoveryCatalog(
  catalogKey
) {
  return Array.isArray(
    SPORTS_CATALOGS[catalogKey]
  );
}

module.exports = {
  getSportsDiscoveryCatalogMetas,
  hasSportsDiscoveryCatalog
};
