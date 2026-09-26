"use strict";

const {
  getSportsFixtureMeta,
  isSportsFixtureId
} = require(
  "./sports-fixture-catalog-service"
);

const {
  findCandidateChannels,
  resolveSportsStreams
} = require(
  "./sports-live-stream-service"
);

const {
  getProgrammesForChannels
} = require(
  "./sports-epg-provider-service"
);

const {
  fetchRuntimeProgrammes
} = require(
  "./sports-epg-runtime-service"
);

const {
  confirmCandidateChannel
} = require(
  "./sports-fixture-programme-service"
);

const LEAGUE_PROFILES = {
  epl: {
    sport: "football",
    aliases: [
      "epl",
      "premier league",
      "football"
    ],
    broadcasterTerms: [
      "football",
      "premier",
      "sky sports",
      "tnt sports",
      "bein"
    ]
  },

  nba: {
    sport: "basketball",
    aliases: [
      "nba",
      "basketball"
    ],
    broadcasterTerms: [
      "nba",
      "basketball"
    ]
  },

  nbl: {
    sport: "basketball",
    aliases: [
      "nbl",
      "australian nbl",
      "basketball"
    ],
    broadcasterTerms: [
      "nbl",
      "basketball",
      "espn"
    ]
  },

  f1: {
    sport: "motorsport",

    aliases: [
      "f1",
      "formula 1",
      "formula one",
      "grand prix"
    ],

    broadcasterTerms: [
      "f1",
      "formula 1",
      "formula one",
      "sky sports f1",
      "sky sport f1"
    ]
  }
};

const F1_PRESTART_WINDOW_MS =
  Number(
    process.env.SPORTS_F1_PRESTART_WINDOW_MS
  ) ||
  90 * 60 * 1000;

const F1_POSTSTART_WINDOW_MS =
  Number(
    process.env.SPORTS_F1_POSTSTART_WINDOW_MS
  ) ||
  4 * 60 * 60 * 1000;

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

function containsPhrase(
  candidate,
  phrase
) {
  const haystack =
    ` ${normalize(candidate)} `;

  const needle =
    ` ${normalize(phrase)} `;

  return (
    Boolean(needle.trim()) &&
    haystack.includes(needle)
  );
}

function parseFixtureId(id) {
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

function splitTeams(name) {
  const value =
    clean(name);

  const match =
    /^(.+?)\s+vs\.?\s+(.+)$/i
      .exec(value);

  if (!match) {
    return [];
  }

  return [
    clean(match[1]),
    clean(match[2])
  ].filter(Boolean);
}

function getFixtureContext(meta) {
  const parsed =
    parseFixtureId(
      meta?.id
    );

  if (!parsed) {
    return null;
  }

  const profile =
    LEAGUE_PROFILES[
      parsed.leagueKey
    ];

  if (!profile) {
    return null;
  }

  return {
    id: meta.id,
    leagueKey:
      parsed.leagueKey,
    sport:
      profile.sport,
    aliases:
      [...profile.aliases],
    broadcasterTerms:
      [...profile.broadcasterTerms],
    title:
      clean(meta.name),
    teams:
      splitTeams(meta.name),

    /*
     * Preserve both public date information and the
     * precise fixture timestamp.
     *
     * Programme confirmation requires the precise
     * kickoff time to enforce its schedule window.
     */
    releaseInfo:
      clean(meta.releaseInfo),

    released:
      meta.released || null,

    description:
      clean(meta.description)
  };
}

function scoreBroadcastCandidate(
  fixture,
  candidate
) {
  const channel =
    candidate?.channel || {};

  const channelText = [
    channel.name,
    channel.id,
    channel.country,
    ...(channel.languages || [])
  ].join(" ");

  let score = 0;
  const reasons = [];

  for (
    const term
    of fixture.broadcasterTerms
  ) {
    if (
      containsPhrase(
        channelText,
        term
      )
    ) {
      score += 35;

      reasons.push(
        `broadcaster:${term}`
      );
    }
  }

  for (
    const alias
    of fixture.aliases
  ) {
    if (
      containsPhrase(
        channelText,
        alias
      )
    ) {
      score += 20;

      reasons.push(
        `league:${alias}`
      );
    }
  }

  if (
    fixture.leagueKey === "nba" &&
    containsPhrase(
      channelText,
      "nba"
    )
  ) {
    score += 80;
    reasons.push(
      "league-specific:nba"
    );
  }

  if (
    fixture.leagueKey === "nbl" &&
    containsPhrase(
      channelText,
      "nbl"
    )
  ) {
    score += 80;
    reasons.push(
      "league-specific:nbl"
    );
  }

  if (
    fixture.leagueKey === "epl" &&
    (
      containsPhrase(
        channelText,
        "premier league"
      ) ||
      containsPhrase(
        channelText,
        "epl"
      )
    )
  ) {
    score += 80;
    reasons.push(
      "league-specific:epl"
    );
  }

  /*
   * Sky Sports Main Event is a rotating live-event
   * channel rather than a league-branded channel.
   *
   * For EPL fixtures it is legitimate to investigate
   * as a broadcaster candidate, but programme
   * confirmation remains mandatory before playback.
   *
   * This only raises Main Event into the candidate
   * pool. It does not confirm the fixture by itself.
   */
  if (
    fixture.leagueKey === "epl" &&
    containsPhrase(
      channelText,
      "sky sports main event"
    )
  ) {
    score += 80;
    reasons.push(
      "epl-candidate:sky-sports-main-event"
    );
  }

  if (
    fixture.leagueKey === "f1" &&
    containsPhrase(
      channelText,
      "f1"
    )
  ) {
    score += 80;

    reasons.push(
      "league-specific:f1"
    );
  }

  /*
   * Generic sport channels may be useful fallbacks,
   * but should never be treated as a confirmed
   * fixture broadcaster solely because they show
   * the same sport.
   */
  if (
    containsPhrase(
      channelText,
      fixture.sport
    )
  ) {
    score += 10;
    reasons.push(
      `sport:${fixture.sport}`
    );
  }

  /*
   * Preserve the live-source service's own
   * relevance score, but keep its influence small.
   */
  score += Math.min(
    Number(candidate?.score) || 0,
    25
  );

  return {
    score,
    reasons
  };
}

function isFixtureWithinF1LiveWindow(
  fixture,
  nowMs = Date.now()
) {
  if (
    fixture?.leagueKey !== "f1"
  ) {
    return false;
  }

  const kickoff =
    Date.parse(
      fixture?.released || ""
    );

  if (
    !Number.isFinite(kickoff)
  ) {
    return false;
  }

  return (
    nowMs >=
      kickoff -
        F1_PRESTART_WINDOW_MS &&
    nowMs <=
      kickoff +
        F1_POSTSTART_WINDOW_MS
  );
}

async function findFixtureBroadcastCandidates(
  fixtureId,
  {
    limit = 10
  } = {}
) {
  if (
    !isSportsFixtureId(
      fixtureId
    )
  ) {
    return {
      fixture: null,
      candidates: [],
      status:
        "INVALID_FIXTURE_ID"
    };
  }

  const meta =
    await getSportsFixtureMeta(
      fixtureId,
      "movie"
    );

  if (
    !meta ||
    !meta.name
  ) {
    return {
      fixture: null,
      candidates: [],
      status:
        "FIXTURE_META_NOT_FOUND"
    };
  }

  const fixture =
    getFixtureContext(meta);

  if (!fixture) {
    return {
      fixture: null,
      candidates: [],
      status:
        "UNSUPPORTED_LEAGUE"
    };
  }

  /*
   * Start with the league where possible.
   * This makes NBA far more precise than
   * querying generic basketball.
   */
  const primaryQuery =
    fixture.leagueKey;

  let sourceCandidates =
    await findCandidateChannels(
      primaryQuery,
      {
        limit: 50
      }
    );

  /*
   * EPL/NBL indexes may not contain the league
   * acronym at all. Fall back to the sport, but
   * still apply our much stricter matcher below.
   */
  if (
    sourceCandidates.length === 0
  ) {
    sourceCandidates =
      await findCandidateChannels(
        fixture.sport,
        {
          limit: 50
        }
      );
  }

  /*
   * EPL broadcasts may appear on rotating Sky Sports
   * channels such as Main Event.
   *
   * The primary "epl" query does not currently return
   * those channels, so supplement EPL discovery with
   * a narrow "sky sports" query.
   *
   * This only expands the investigation pool.
   * scoreBroadcastCandidate() and programme confirmation
   * remain responsible for deciding whether a channel
   * can actually serve the fixture.
   */
  if (
    fixture.leagueKey === "epl"
  ) {
    const skyCandidates =
      await findCandidateChannels(
        "sky sports",
        {
          limit: 50
        }
      );

    const merged =
      new Map();

    for (
      const candidate
      of [
        ...sourceCandidates,
        ...skyCandidates
      ]
    ) {
      const channelId =
        candidate?.channel?.id ||
        candidate?.channelId;

      if (!channelId) {
        continue;
      }

      const existing =
        merged.get(channelId);

      if (
        !existing ||
        (
          Number(candidate?.score) || 0
        ) >
        (
          Number(existing?.score) || 0
        )
      ) {
        merged.set(
          channelId,
          candidate
        );
      }
    }

    sourceCandidates =
      [...merged.values()];
  }

  const ranked =
    sourceCandidates
      .map(candidate => {
        const scored =
          scoreBroadcastCandidate(
            fixture,
            candidate
          );

        return {
          ...candidate,
          broadcastScore:
            scored.score,
          broadcastReasons:
            scored.reasons
        };
      })
      .filter(candidate =>
        candidate.broadcastScore > 0
      )
      .sort(
        (a, b) =>
          b.broadcastScore -
          a.broadcastScore
      )
      .slice(
        0,
        Math.max(
          1,
          Math.min(
            Number(limit) || 10,
            50
          )
        )
      );

  /*
   * Confidence policy:
   *
   * >= 100:
   *   League/channel identity is strong enough
   *   to investigate as a likely broadcaster.
   *
   * < 100:
   *   Merely a sport-compatible channel.
   *
   * This deliberately errs toward "none".
   */
  const confident =
    ranked.filter(candidate =>
      candidate.broadcastScore >= 100
    );

  return {
    fixture,
    candidates: ranked,
    confident,
    status:
      confident.length
        ? "CANDIDATES_FOUND"
        : "NO_CONFIDENT_BROADCAST_MATCH"
  };
}

function normalizeProgrammeMap(
  programmesByChannel
) {
  if (!programmesByChannel) {
    return new Map();
  }

  if (programmesByChannel instanceof Map) {
    return programmesByChannel;
  }

  if (
    typeof programmesByChannel === "object" &&
    !Array.isArray(programmesByChannel)
  ) {
    return new Map(
      Object.entries(programmesByChannel)
    );
  }

  return new Map();
}

function getCandidateChannelIds(candidate) {
  return [
    candidate?.channel?.id,
    candidate?.channelId
  ]
    .filter(Boolean)
    .map(String);
}

function getCandidateProgrammes(
  candidate,
  programmeMap
) {
  for (
    const id
    of getCandidateChannelIds(candidate)
  ) {
    const programmes =
      programmeMap.get(id);

    if (Array.isArray(programmes)) {
      return programmes;
    }
  }

  return [];
}

function confirmBroadcastCandidates({
  fixture,
  candidates,
  programmesByChannel
}) {
  const programmeMap =
    normalizeProgrammeMap(
      programmesByChannel
    );

  const safeCandidates =
    Array.isArray(candidates)
      ? candidates
      : [];

  return safeCandidates.map(candidate => {
    const programmes =
      getCandidateProgrammes(
        candidate,
        programmeMap
      );

    const result =
      confirmCandidateChannel({
        fixture,
        teams:
          fixture?.teams || [],
        candidate,
        programmes
      });

    return {
      ...candidate,
      programmeConfirmed:
        result.confirmed,
      programmeMatches:
        result.matches || []
    };
  });
}

async function resolveFixtureLiveStreams(
  fixtureId,
  {
    streamLimit = 5,
    programmesByChannel = null,
    requireProgrammeConfirmation = false,
    programmeFetcher = null
  } = {}
) {
  const match =
    await findFixtureBroadcastCandidates(
      fixtureId,
      {
        limit: 10
      }
    );

  if (
    match.status !==
    "CANDIDATES_FOUND"
  ) {
    return {
      ...match,
      streams: []
    };
  }

  /*
   * Formula 1 uses event/session identity rather than
   * home/away teams.
   *
   * Do not weaken the existing team + EPG confirmation
   * policy for EPL/NBA/NBL.
   *
   * F1 streams are exposed only during a narrow window
   * around the scheduled fixture and only from channels
   * already ranked as confident F1 broadcaster candidates.
   */
  if (
    match.fixture?.leagueKey === "f1"
  ) {
    if (
      !isFixtureWithinF1LiveWindow(
        match.fixture
      )
    ) {
      return {
        ...match,
        streams: [],
        status:
          "FIXTURE_OUTSIDE_LIVE_WINDOW"
      };
    }

    const allowedChannels =
      new Set(
        match.confident
          .map(candidate =>
            candidate?.channel?.id
          )
          .filter(Boolean)
      );

    let streams =
      await resolveSportsStreams(
        "f1",
        {
          channelLimit: 20,

          streamLimit:
            Math.max(
              Number(streamLimit) * 4,
              12
            ),

          validate: true
        }
      );

    streams =
      streams
        .filter(stream =>
          allowedChannels.has(
            stream.channelId
          )
        )
        .slice(
          0,
          Math.max(
            1,
            Number(streamLimit) || 5
          )
        );

    return {
      ...match,
      streams,

      status:
        streams.length
          ? "VALIDATED_F1_STREAMS_FOUND"
          : "NO_VALIDATED_F1_STREAMS"
    };
  }

  /*
   * Stage E2 proof only:
   * resolve using the strongest league query,
   * then retain streams belonging to confident
   * candidate channel IDs.
   *
   * We are NOT wiring this into Ultra MAX yet.
   */
  let confirmedCandidates =
    match.confident;

  let programmeMap =
    programmesByChannel;

  if (
    requireProgrammeConfirmation &&
    !programmeMap
  ) {
    const channelIds =
      match.confident
        .map(candidate =>
          candidate.channel?.id
        )
        .filter(Boolean);

    programmeMap =
      await getProgrammesForChannels(
        channelIds,
        {
          fetcher:
            programmeFetcher ||
            fetchRuntimeProgrammes
        }
      );
  }

  if (requireProgrammeConfirmation) {
    confirmedCandidates =
      confirmBroadcastCandidates({
        fixture: match.fixture,
        candidates: match.confident,
        programmesByChannel:
          programmeMap
      })
        .filter(candidate =>
          candidate.programmeConfirmed
        );
  }

  if (
    requireProgrammeConfirmation &&
    confirmedCandidates.length === 0
  ) {
    return {
      ...match,
      programmeConfirmed: [],
      streams: [],
      status:
        "NO_PROGRAMME_CONFIRMED_BROADCAST"
    };
  }

  const allowedChannels =
    new Set(
      confirmedCandidates
        .map(candidate =>
          candidate.channel?.id
        )
        .filter(Boolean)
    );

  let streams = [];

  if (requireProgrammeConfirmation) {
    /*
     * Once EPG confirmation has identified the
     * broadcaster, resolve that broadcaster directly.
     *
     * League/sport searches can legitimately omit
     * rotating channels such as Sky Sports Main Event.
     *
     * Each result is still constrained to the exact
     * programme-confirmed channel ID and must pass the
     * existing HLS validation.
     */
    for (
      const candidate
      of confirmedCandidates
    ) {
      const channelId =
        candidate.channel?.id;

      const channelName =
        candidate.channel?.name;

      if (
        !channelId ||
        !channelName
      ) {
        continue;
      }

      const candidateStreams =
        await resolveSportsStreams(
          channelName,
          {
            channelLimit: 30,
            streamLimit:
              Math.max(
                streamLimit * 4,
                12
              ),
            validate: true
          }
        );

      streams.push(
        ...candidateStreams.filter(stream =>
          stream.channelId ===
            channelId
        )
      );
    }
  } else {
    const query =
      match.fixture.leagueKey;

    streams =
      await resolveSportsStreams(
        query,
        {
          channelLimit: 30,
          streamLimit:
            Math.max(
              streamLimit * 4,
              12
            ),
          validate: true
        }
      );

    if (
      streams.length === 0
    ) {
      streams =
        await resolveSportsStreams(
          match.fixture.sport,
          {
            channelLimit: 30,
            streamLimit:
              Math.max(
                streamLimit * 4,
                12
              ),
            validate: true
          }
        );
    }

    streams =
      streams.filter(stream =>
        allowedChannels.has(
          stream.channelId
        )
      );
  }

  streams =
    streams
      .filter(stream =>
        allowedChannels.has(
          stream.channelId
        )
      )
      .slice(
        0,
        Math.max(
          1,
          Number(streamLimit) || 5
        )
      );

  return {
    ...match,
    ...(requireProgrammeConfirmation
      ? {
          programmeConfirmed:
            confirmedCandidates
        }
      : {}),
    streams,
    status:
      streams.length
        ? "VALIDATED_STREAMS_FOUND"
        : "NO_VALIDATED_STREAMS"
  };
}

module.exports = {
  LEAGUE_PROFILES,
  parseFixtureId,
  splitTeams,
  getFixtureContext,
  scoreBroadcastCandidate,
  isFixtureWithinF1LiveWindow,
  findFixtureBroadcastCandidates,
  confirmBroadcastCandidates,
  resolveFixtureLiveStreams
};
