const path = require("path");

const WWE_CATALOGS = require(
  path.join(__dirname, "..", "resources", "sports", "wwe.json")
);
const MOTORSPORT_CATALOGS = require(
  path.join(__dirname, "..", "resources", "sports", "motorsport.json")
);

const SPORTS_CATALOGS = {
  ...WWE_CATALOGS,
  ...MOTORSPORT_CATALOGS
};

const CINEMETA_BASE =
  process.env.CINEMETA_BASE ||
  "https://v3-cinemeta.strem.io";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const metaCache = new Map();

function fallbackMeta(seed) {
  return {
    id: seed.id,
    imdb_id: seed.id,
    type: "movie",
    name: seed.name,
    year: String(seed.year),
    releaseInfo: String(seed.year),
    poster: `https://images.metahub.space/poster/small/${seed.id}/img`,
    background: `https://images.metahub.space/background/medium/${seed.id}/img`,
    logo: `https://images.metahub.space/logo/medium/${seed.id}/img`,
    genres: ["Sport", "Wrestling"],
    posterShape: "poster"
  };
}

async function fetchCinemetaMeta(seed) {
  const cached = metaCache.get(seed.id);

  if (
    cached &&
    Date.now() - cached.cachedAt < CACHE_TTL_MS
  ) {
    return cached.meta;
  }

  try {
    const response = await fetch(
      `${CINEMETA_BASE}/meta/movie/${seed.id}.json`,
      {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "UltraMAX-Sports/0.1"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Cinemeta HTTP ${response.status}`);
    }

    const payload = await response.json();
    const source = payload && payload.meta;

    if (!source || !source.id) {
      throw new Error("Cinemeta returned no meta");
    }

    const meta = {
      ...fallbackMeta(seed),
      ...source,

      // Preserve the canonical identifiers required by
      // Stremio/Nuvio and installed stream add-ons.
      id: seed.id,
      imdb_id: seed.id,
      type: "movie",

      name: source.name || seed.name,
      year: String(source.year || seed.year),
      releaseInfo: String(
        source.releaseInfo ||
        source.year ||
        seed.year
      )
    };

    metaCache.set(seed.id, {
      cachedAt: Date.now(),
      meta
    });

    return meta;
  } catch (error) {
    console.warn(
      `[sports-catalog] Cinemeta fallback ${seed.id}:`,
      error?.message || error
    );

    return fallbackMeta(seed);
  }
}

async function getSportsCatalogMetas(catalogKey) {
  const entries = SPORTS_CATALOGS[catalogKey];

  if (!Array.isArray(entries)) {
    return [];
  }

  return Promise.all(
    entries.map(fetchCinemetaMeta)
  );
}

function hasSportsCatalog(catalogKey) {
  return Array.isArray(SPORTS_CATALOGS[catalogKey]);
}

module.exports = {
  getSportsCatalogMetas,
  hasSportsCatalog
};
