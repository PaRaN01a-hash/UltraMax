const THESPORTSDB_BASE =
  process.env.THESPORTSDB_BASE ||
  "https://www.thesportsdb.com/api/v1/json/123";

const JOLPICA_BASE =
  process.env.JOLPICA_BASE ||
  "https://api.jolpi.ca/ergast/f1";

const FIXTURE_CACHE_TTL_MS =
  Number(
    process.env.SPORTS_FIXTURE_CACHE_TTL_MS
  ) ||
  15 * 60 * 1000;

const REQUEST_TIMEOUT_MS =
  Number(
    process.env.SPORTS_FIXTURE_TIMEOUT_MS
  ) ||
  10000;

const RATE_LIMIT_COOLDOWN_MS =
  Number(
    process.env.SPORTS_FIXTURE_RATE_LIMIT_COOLDOWN_MS
  ) ||
  5 * 60 * 1000;

const LEAGUES = Object.freeze({
  sports_epl_fixtures: {
    key: "epl",
    leagueId: "4328",
    league: "English Premier League",
    sourceSport: "Soccer",
    displaySport: "Football",
    seasonStyle: "split"
  },

  sports_nba_fixtures: {
    key: "nba",
    leagueId: "4387",
    league: "NBA",
    sourceSport: "Basketball",
    displaySport: "Basketball",
    seasonStyle: "split"
  },

  sports_nbl_fixtures: {
    key: "nbl",
    leagueId: "4434",
    league: "Australian NBL",
    sourceSport: "Basketball",
    displaySport: "Basketball",
    seasonStyle: "split"
  },

  sports_f1_fixtures: {
    key: "f1",
    leagueId: "4370",
    league: "Formula 1",
    sourceSport: "Motorsport",
    displaySport: "Motorsport",
    seasonStyle: "year"
  }
});

const fixtureCache =
  new Map();

/*
 * One upstream request per catalog/season at a time.
 * Concurrent callers share the same Promise.
 */
const fixtureInFlight =
  new Map();

const rateLimitCooldowns =
  new Map();

function clean(value) {
  return String(
    value == null
      ? ""
      : value
  ).trim();
}

function getCurrentSplitSeason(now = new Date()) {
  const year =
    now.getUTCFullYear();

  /*
   * EPL / NBA / NBL all use a split-year season.
   *
   * July onward:
   *   2026 -> 2026-2027
   *
   * January-June:
   *   2027 -> 2026-2027
   */
  if (now.getUTCMonth() >= 6) {
    return `${year}-${year + 1}`;
  }

  return `${year - 1}-${year}`;
}

function getSeason(config, now = new Date()) {
  if (
    config.seasonStyle === "split"
  ) {
    return getCurrentSplitSeason(now);
  }

  return String(
    now.getUTCFullYear()
  );
}

function formatUtcDate(date) {
  return date
    .toISOString()
    .slice(0, 10);
}

function addUtcDays(date, days) {
  const next =
    new Date(
      date.getTime()
    );

  next.setUTCDate(
    next.getUTCDate() + days
  );

  return next;
}

function getF1RollingDates(now = new Date()) {
  const start =
    addUtcDays(
      now,
      -7
    );

  const dates = [];

  for (
    let offset = 0;
    offset <= 28;
    offset += 1
  ) {
    dates.push(
      formatUtcDate(
        addUtcDays(
          start,
          offset
        )
      )
    );
  }

  return dates;
}

function buildTimestamp(event) {
  const sourceTimestamp =
    clean(
      event.strTimestamp
    );

  if (sourceTimestamp) {
    const parsed =
      new Date(sourceTimestamp);

    if (
      !Number.isNaN(
        parsed.getTime()
      )
    ) {
      return parsed.toISOString();
    }
  }

  const date =
    clean(
      event.dateEvent
    );

  if (!date) {
    return null;
  }

  const time =
    clean(
      event.strTime
    ) ||
    "00:00:00";

  const parsed =
    new Date(
      `${date}T${time}Z`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return parsed.toISOString();
}

function choosePoster(event) {
  return (
    clean(event.strPoster) ||
    clean(event.strThumb) ||
    clean(event.strLeagueBadge) ||
    clean(event.strHomeTeamBadge) ||
    clean(event.strAwayTeamBadge) ||
    null
  );
}

function chooseBackground(event) {
  return (
    clean(event.strThumb) ||
    clean(event.strPoster) ||
    clean(event.strLeagueBadge) ||
    clean(event.strHomeTeamBadge) ||
    clean(event.strAwayTeamBadge) ||
    null
  );
}

function chooseLogo(event) {
  return (
    clean(event.strLeagueBadge) ||
    clean(event.strHomeTeamBadge) ||
    clean(event.strAwayTeamBadge) ||
    null
  );
}

function buildDescription(
  event,
  config
) {
  const parts = [];

  const league =
    clean(event.strLeague) ||
    config.league;

  if (league) {
    parts.push(league);
  }

  const season =
    clean(event.strSeason);

  if (season) {
    parts.push(
      `Season ${season}`
    );
  }

  const venue =
    clean(event.strVenue);

  if (venue) {
    parts.push(venue);
  }

  const country =
    clean(event.strCountry);

  if (country) {
    parts.push(country);
  }

  const date =
    clean(event.dateEvent);

  const time =
    clean(event.strTime);

  if (date) {
    parts.push(
      time
        ? `${date} ${time}`
        : date
    );
  }

  return parts.join(" • ");
}

function buildMeta(
  event,
  config
) {
  const eventId =
    clean(event.idEvent);

  if (
    !/^\d+$/.test(eventId)
  ) {
    return null;
  }

  const sourceLeague =
    clean(event.strLeague);

  if (
    sourceLeague &&
    sourceLeague !== config.league
  ) {
    console.warn(
      "[sports-fixture] rejecting wrong league",
      config.key,
      eventId,
      sourceLeague
    );

    return null;
  }

  const sourceSport =
    clean(event.strSport);

  if (
    sourceSport &&
    sourceSport !== config.sourceSport
  ) {
    console.warn(
      "[sports-fixture] rejecting wrong sport",
      config.key,
      eventId,
      sourceSport
    );

    return null;
  }

  const home =
    clean(event.strHomeTeam);

  const away =
    clean(event.strAwayTeam);

  const name =
    clean(event.strEvent) ||
    (
      home &&
      away
        ? `${home} vs ${away}`
        : ""
    );

  if (!name) {
    return null;
  }

  const id =
    `sports:${config.key}:${eventId}`;

  const poster =
    choosePoster(event);

  const background =
    chooseBackground(event);

  const logo =
    chooseLogo(event);

  const releaseInfo =
    clean(event.dateEvent) ||
    undefined;

  const released =
    buildTimestamp(event) ||
    undefined;

  return {
    id,
    type: "movie",
    name,

    ...(poster
      ? { poster }
      : {}),

    ...(background
      ? { background }
      : {}),

    ...(logo
      ? { logo }
      : {}),

    posterShape: "poster",

    genres: [
      "Sport",
      config.displaySport,
      config.league
    ],

    description:
      buildDescription(
        event,
        config
      ),

    ...(releaseInfo
      ? { releaseInfo }
      : {}),

    ...(released
      ? { released }
      : {}),

    behaviorHints: {
      defaultVideoId: id
    }
  };
}

function parseRetryAfterMs(value) {
  const raw =
    clean(value);

  if (!raw) {
    return null;
  }

  const seconds =
    Number(raw);

  if (
    Number.isFinite(seconds) &&
    seconds >= 0
  ) {
    return Math.ceil(
      seconds * 1000
    );
  }

  const retryAt =
    Date.parse(raw);

  if (
    Number.isFinite(retryAt)
  ) {
    return Math.max(
      0,
      retryAt - Date.now()
    );
  }

  return null;
}

async function fetchLeagueEvents(
  config,
  season
) {
  const url =
    `${THESPORTSDB_BASE}` +
    `/eventsseason.php` +
    `?id=${encodeURIComponent(config.leagueId)}` +
    `&s=${encodeURIComponent(season)}`;

  const response =
    await fetch(
      url,
      {
        signal:
          AbortSignal.timeout(
            REQUEST_TIMEOUT_MS
          ),

        headers: {
          "User-Agent":
            "UltraMAX-Sports/1.0"
        }
      }
    );

  if (!response.ok) {
    const error =
      new Error(
        `TheSportsDB HTTP ${response.status}`
      );

    error.status =
      response.status;

    error.retryAfterMs =
      parseRetryAfterMs(
        response.headers.get(
          "retry-after"
        )
      );

    throw error;
  }

  const payload =
    await response.json();

  const events =
    Array.isArray(payload?.events)
      ? payload.events
      : [];

  return events;
}

async function fetchDailyLeagueEvents(
  config,
  date
) {
  const url =
    `${THESPORTSDB_BASE}` +
    `/eventsday.php` +
    `?d=${encodeURIComponent(date)}` +
    `&l=${encodeURIComponent(config.leagueId)}`;

  const response =
    await fetch(
      url,
      {
        signal:
          AbortSignal.timeout(
            REQUEST_TIMEOUT_MS
          ),

        headers: {
          "User-Agent":
            "UltraMAX-Sports/1.0"
        }
      }
    );

  if (!response.ok) {
    const error =
      new Error(
        `TheSportsDB HTTP ${response.status}`
      );

    error.status =
      response.status;

    error.retryAfterMs =
      parseRetryAfterMs(
        response.headers.get(
          "retry-after"
        )
      );

    throw error;
  }

  const payload =
    await response.json();

  return Array.isArray(payload?.events)
    ? payload.events
    : [];
}

function jolpicaRaceToSportsEvent(race) {
  const season = clean(race?.season);
  const round = clean(race?.round);
  const raceName = clean(race?.raceName);
  const date = clean(race?.date);
  const time = clean(race?.time) || "00:00:00Z";
  const circuit = clean(race?.Circuit?.circuitName);
  const locality = clean(race?.Circuit?.Location?.locality);
  const country = clean(race?.Circuit?.Location?.country);

  if (
    !/^\d{4}$/.test(season) ||
    !/^\d+$/.test(round) ||
    !raceName ||
    !date
  ) {
    return null;
  }

  /*
   * Keep the existing numeric sports:f1:<eventId> contract.
   *
   * Encode season + round into a deterministic numeric ID:
   *   2026 round 13 -> 202613
   */
  const idEvent =
    `${season}${String(Number(round)).padStart(2, "0")}`;

  return {
    idEvent,
    strEvent: raceName,
    strLeague: "Formula 1",
    strSeason: season,
    strSport: "Motorsport",
    strVenue: circuit,
    strCountry: country,
    strDescriptionEN: [
      raceName,
      circuit,
      [locality, country].filter(Boolean).join(", ")
    ].filter(Boolean).join(" • "),
    dateEvent: date,
    strTime: time.replace(/Z$/, ""),
    strTimestamp: `${date}T${time}`,
    strHomeTeam: "",
    strAwayTeam: ""
  };
}

async function fetchF1RollingEvents(
  config,
  now = new Date()
) {
  const year = now.getUTCFullYear();

  const url =
    `${JOLPICA_BASE.replace(/\/+$/, "")}` +
    `/${encodeURIComponent(year)}.json`;

  const response =
    await fetch(
      url,
      {
        signal:
          AbortSignal.timeout(
            REQUEST_TIMEOUT_MS
          ),
        headers: {
          "User-Agent":
            "UltraMAX-Sports/1.0"
        }
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

  const safeRaces =
    Array.isArray(races)
      ? races
      : [];

  const windowStart =
    addUtcDays(now, -7);

  const windowEnd =
    addUtcDays(now, 21);

  return safeRaces
    .map(jolpicaRaceToSportsEvent)
    .filter(Boolean)
    .filter(event => {
      const timestamp =
        buildTimestamp(event);

      if (!timestamp) {
        return false;
      }

      const eventTime =
        new Date(timestamp).getTime();

      return (
        eventTime >= windowStart.getTime() &&
        eventTime <= windowEnd.getTime()
      );
    });
}


function normaliseMetas(
  events,
  config
) {
  const seen =
    new Set();

  const metas = [];

  for (const event of events) {
    const meta =
      buildMeta(
        event,
        config
      );

    if (
      !meta ||
      seen.has(meta.id)
    ) {
      continue;
    }

    seen.add(meta.id);

    metas.push(meta);
  }

  metas.sort(
    (a, b) => {
      const aTime =
        Date.parse(
          a.released ||
          `${a.releaseInfo || ""}T00:00:00Z`
        );

      const bTime =
        Date.parse(
          b.released ||
          `${b.releaseInfo || ""}T00:00:00Z`
        );

      if (
        Number.isFinite(aTime) &&
        Number.isFinite(bTime) &&
        aTime !== bTime
      ) {
        return aTime - bTime;
      }

      return String(a.name)
        .localeCompare(
          String(b.name)
        );
    }
  );

  return metas;
}

async function getSportsFixtureCatalogMetas(
  catalogKey
) {
  const config =
    LEAGUES[catalogKey];

  if (!config) {
    return [];
  }

  const now =
    Date.now();

  const nowDate =
    new Date(now);

  const season =
    getSeason(
      config,
      nowDate
    );

  const cacheKey =
    `${catalogKey}:${season}`;

  const cached =
    fixtureCache.get(
      cacheKey
    );

  if (
    cached &&
    now - cached.cachedAt <
      FIXTURE_CACHE_TTL_MS
  ) {
    return cached.metas;
  }

  const cooldownUntil =
    rateLimitCooldowns.get(
      cacheKey
    ) || 0;

  if (
    cooldownUntil > now
  ) {
    console.warn(
      "[sports-fixture] cooldown active",
      catalogKey,
      "remainingMs=" +
        (cooldownUntil - now),
      "stale=" +
        Boolean(cached)
    );

    return cached
      ? cached.metas
      : [];
  }

  if (cooldownUntil) {
    rateLimitCooldowns.delete(
      cacheKey
    );
  }

  const existingRequest =
    fixtureInFlight.get(
      cacheKey
    );

  if (existingRequest) {
    console.log(
      "[sports-fixture] joining in-flight request",
      catalogKey,
      "season=" + season
    );

    return existingRequest;
  }

  const requestPromise =
    (async () => {
    try {
      const events =
        config.key === "f1"
          ? await fetchF1RollingEvents(
              config,
              nowDate
            )
          : await fetchLeagueEvents(
              config,
              season
            );
  
      const metas =
        normaliseMetas(
          events,
          config
        );
  
      rateLimitCooldowns.delete(
        cacheKey
      );
  
      fixtureCache.set(
        cacheKey,
        {
          cachedAt: now,
          metas
        }
      );
  
      console.log(
        "[sports-fixture]",
        catalogKey,
        "season=" + season,
        "events=" + events.length,
        "metas=" + metas.length
      );
  
      return metas;
    } catch (error) {
      console.warn(
        "[sports-fixture] fetch failed",
        catalogKey,
        error?.message ||
        error
      );
  
      if (
        error?.status === 429
      ) {
        const cooldownMs =
          Math.max(
            Number(
              error.retryAfterMs
            ) || 0,
            RATE_LIMIT_COOLDOWN_MS
          );
  
        rateLimitCooldowns.set(
          cacheKey,
          now + cooldownMs
        );
  
        console.warn(
          "[sports-fixture] rate limited",
          catalogKey,
          "cooldownMs=" +
            cooldownMs,
          "stale=" +
            Boolean(cached)
        );
      }
  
      /*
       * Stale-if-error:
       * if TheSportsDB has a wobble,
       * preserve the last good catalog.
       */
      if (cached) {
        console.warn(
          "[sports-fixture] serving stale cache",
          catalogKey,
          "metas=" + cached.metas.length
        );
  
        return cached.metas;
      }
  
      return [];
    }
    })();

  fixtureInFlight.set(
    cacheKey,
    requestPromise
  );

  try {
    return await requestPromise;
  } finally {
    /*
     * Delete only our own Promise. This avoids a completed
     * request accidentally deleting a newer in-flight entry.
     */
    if (
      fixtureInFlight.get(cacheKey)
      === requestPromise
    ) {
      fixtureInFlight.delete(
        cacheKey
      );
    }
  }
}

function hasSportsFixtureCatalog(
  catalogKey
) {
  return Boolean(
    LEAGUES[catalogKey]
  );
}

function parseSportsFixtureId(id) {
  const match =
    /^sports:(epl|nba|nbl|f1):(\d+)$/
      .exec(
        clean(id)
      );

  if (!match) {
    return null;
  }

  return {
    leagueKey: match[1],
    eventId: match[2]
  };
}

function getCatalogKeyForLeagueKey(
  leagueKey
) {
  for (
    const [catalogKey, config]
    of Object.entries(LEAGUES)
  ) {
    if (
      config.key === leagueKey
    ) {
      return catalogKey;
    }
  }

  return null;
}

function isSportsFixtureId(id) {
  return Boolean(
    parseSportsFixtureId(id)
  );
}

async function getSportsFixtureMeta(
  id,
  type = "movie"
) {
  if (
    type !== "movie" &&
    type !== "tv"
  ) {
    return null;
  }

  const parsed =
    parseSportsFixtureId(id);

  if (!parsed) {
    return null;
  }

  const catalogKey =
    getCatalogKeyForLeagueKey(
      parsed.leagueKey
    );

  if (!catalogKey) {
    return null;
  }

  const metas =
    await getSportsFixtureCatalogMetas(
      catalogKey
    );

  const meta =
    metas.find(meta =>
      meta.id === id
    )
    || null;

  if (!meta) {
    return null;
  }

  return {
    ...meta,
    type
  };
}

module.exports = {
  getSportsFixtureCatalogMetas,
  getSportsFixtureMeta,
  hasSportsFixtureCatalog,
  isSportsFixtureId
};
