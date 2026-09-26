"use strict";

const JOLPICA_BASE =
  process.env.JOLPICA_BASE ||
  "https://api.jolpi.ca/ergast/f1";

const F1_HISTORY_CACHE_TTL_MS =
  Number(
    process.env.F1_HISTORY_CACHE_TTL_MS
  ) ||
  7 * 24 * 60 * 60 * 1000;

const REQUEST_TIMEOUT_MS =
  Number(
    process.env.F1_HISTORY_TIMEOUT_MS
  ) ||
  10000;

const seasonCache =
  new Map();

const seasonInFlight =
  new Map();

function clean(value) {
  return String(
    value == null
      ? ""
      : value
  ).trim();
}

function parseF1HistoryId(id) {
  const match =
    /^sports:f1archive:(\d{4}):([1-9]\d*)$/
      .exec(
        clean(id)
      );

  if (!match) {
    return null;
  }

  return {
    year: Number(match[1]),
    round: Number(match[2])
  };
}

function isF1HistoryId(id) {
  return Boolean(
    parseF1HistoryId(id)
  );
}

function buildF1HistoryId(
  year,
  round
) {
  return `sports:f1archive:${year}:${round}`;
}

function buildReleased(
  race
) {
  const date =
    clean(race?.date);

  if (!date) {
    return undefined;
  }

  const time =
    clean(race?.time);

  const timestamp =
    time
      ? `${date}T${time}`
      : `${date}T00:00:00Z`;

  const parsed =
    new Date(timestamp);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return undefined;
  }

  return parsed.toISOString();
}

function buildDescription(
  race
) {
  const circuit =
    clean(
      race?.Circuit?.circuitName
    );

  const locality =
    clean(
      race?.Circuit?.Location?.locality
    );

  const country =
    clean(
      race?.Circuit?.Location?.country
    );

  const location =
    [
      locality,
      country
    ]
      .filter(Boolean)
      .join(", ");

  const parts = [
    `Formula 1 ${clean(race?.season)}`,
    `Round ${clean(race?.round)}`,
    circuit,
    location,
    clean(race?.date)
  ].filter(Boolean);

  return parts.join(" • ");
}

function raceToMeta(race) {
  const year =
    Number(
      clean(race?.season)
    );

  const round =
    Number(
      clean(race?.round)
    );

  const name =
    clean(race?.raceName);

  if (
    !year ||
    !round ||
    !name
  ) {
    return null;
  }

  const circuit =
    clean(
      race?.Circuit?.circuitName
    );

  const locality =
    clean(
      race?.Circuit?.Location?.locality
    );

  const country =
    clean(
      race?.Circuit?.Location?.country
    );

  const released =
    buildReleased(race);

  const id =
    buildF1HistoryId(
      year,
      round
    );

  return {
    id,
    type: "movie",
    name,
    year: String(year),
    releaseInfo: String(year),

    ...(released
      ? { released }
      : {}),

    description:
      buildDescription(race),

    genres: [
      "Sport",
      "Motorsport",
      "Formula 1"
    ],

    posterShape: "poster",

    behaviorHints: {
      defaultVideoId: id
    },

    round,
    raceDate:
      clean(race?.date) ||
      undefined,
    raceTime:
      clean(race?.time) ||
      undefined,
    circuit:
      circuit ||
      undefined,
    locality:
      locality ||
      undefined,
    country:
      country ||
      undefined
  };
}

async function fetchSeasonRaces(
  year,
  options = {}
) {
  const fetchImpl =
    options.fetchImpl || fetch;

  const url =
    `${JOLPICA_BASE.replace(/\/+$/, "")}` +
    `/${encodeURIComponent(year)}` +
    "/races.json";

  const response =
    await fetchImpl(
      url,
      {
        signal:
          AbortSignal.timeout(
            Number(options.timeoutMs) ||
            REQUEST_TIMEOUT_MS
          )
      }
    );

  if (!response.ok) {
    throw new Error(
      `Jolpica HTTP ${response.status}`
    );
  }

  const payload =
    await response.json();

  const races =
    payload?.MRData?.RaceTable?.Races;

  return Array.isArray(races)
    ? races
    : [];
}

async function getSeasonMetas(
  year,
  options = {}
) {
  const normalizedYear =
    Number(year);

  if (
    !Number.isInteger(normalizedYear) ||
    normalizedYear < 1950
  ) {
    return [];
  }

  const now =
    Date.now();

  const cached =
    seasonCache.get(
      normalizedYear
    );

  if (
    cached &&
    now - cached.cachedAt <
      F1_HISTORY_CACHE_TTL_MS
  ) {
    return cached.metas;
  }

  const inFlight =
    seasonInFlight.get(
      normalizedYear
    );

  if (inFlight) {
    return inFlight;
  }

  const request =
    (async () => {
      try {
        const races =
          await fetchSeasonRaces(
            normalizedYear,
            options
          );

        const metas =
          races
            .map(raceToMeta)
            .filter(Boolean)
            .sort(
              (a, b) =>
                a.round - b.round
            );

        seasonCache.set(
          normalizedYear,
          {
            cachedAt: now,
            metas
          }
        );

        return metas;
      } catch (error) {
        if (cached) {
          console.warn(
            "[f1-history] serving stale season",
            normalizedYear,
            error?.message ||
            error
          );

          return cached.metas;
        }

        throw error;
      }
    })();

  seasonInFlight.set(
    normalizedYear,
    request
  );

  try {
    return await request;
  } finally {
    if (
      seasonInFlight.get(
        normalizedYear
      ) === request
    ) {
      seasonInFlight.delete(
        normalizedYear
      );
    }
  }
}

async function getF1HistoryCatalogMetas(
  year,
  options
) {
  return getSeasonMetas(
    year,
    options
  );
}

async function getF1HistoryMeta(
  id,
  type = "movie",
  options
) {
  const parsed =
    parseF1HistoryId(id);

  if (!parsed) {
    return null;
  }

  const metas =
    await getSeasonMetas(
      parsed.year,
      options
    );

  const meta =
    metas.find(item =>
      item.id === id
    ) || null;

  if (!meta) {
    return null;
  }

  return {
    ...meta,
    type
  };
}

function clearF1HistoryCache() {
  seasonCache.clear();
  seasonInFlight.clear();
}

module.exports = {
  buildF1HistoryId,
  clearF1HistoryCache,
  getF1HistoryCatalogMetas,
  getF1HistoryMeta,
  isF1HistoryId,
  parseF1HistoryId,
  raceToMeta
};
