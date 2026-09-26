"use strict";

const TEAM_STOP_WORDS = new Set([
  "fc",
  "afc",
  "cf",
  "sc",
  "club",
  "the",
  "united",
  "city"
]);

const TEAM_ALIASES = new Map([
  [
    "tottenham hotspur",
    [
      "tottenham",
      "spurs"
    ]
  ],
  [
    "manchester united",
    [
      "man utd",
      "man united"
    ]
  ]
]);

const DEFAULT_KICKOFF_WINDOW_MS =
  Number(process.env.SPORTS_EPG_KICKOFF_WINDOW_MS) ||
  4 * 60 * 60 * 1000;

function clean(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bu\.?s\.?a\b/g, " usa ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value) {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .filter(token => token.length >= 3)
    .filter(token => !TEAM_STOP_WORDS.has(token));
}

function parseEpoch(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return value < 100000000000
      ? value * 1000
      : value;
  }

  const raw = clean(value);

  if (!raw) {
    return null;
  }

  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);

    if (!Number.isFinite(numeric)) {
      return null;
    }

    return numeric < 100000000000
      ? numeric * 1000
      : numeric;
  }

  const parsed = Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function parseXmltvTime(value) {
  const raw = clean(value);

  if (!raw) {
    return null;
  }

  const match = raw.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s+([+-])(\d{2})(\d{2}))?$/
  );

  if (!match) {
    return parseEpoch(raw);
  }

  const [
    ,
    year,
    month,
    day,
    hour,
    minute,
    second,
    sign,
    offsetHour,
    offsetMinute
  ] = match;

  let utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  if (sign && offsetHour && offsetMinute) {
    const offset =
      (
        Number(offsetHour) * 60 +
        Number(offsetMinute)
      ) * 60 * 1000;

    utc += sign === "+"
      ? -offset
      : offset;
  }

  return utc;
}

function containsTeam(programmeText, teamName) {
  const text = normalize(programmeText);
  const fullTeam = normalize(teamName);

  if (!text || !fullTeam) {
    return false;
  }

  if (text.includes(fullTeam)) {
    return true;
  }

  const aliases =
    TEAM_ALIASES.get(fullTeam) || [];

  for (const alias of aliases) {
    const normalizedAlias =
      normalize(alias);

    if (!normalizedAlias) {
      continue;
    }

    const expression =
      new RegExp(
        `(?:^|\\s)${escapeRegExp(normalizedAlias)}(?:$|\\s)`
      );

    if (expression.test(text)) {
      return true;
    }
  }

  const tokens = meaningfulTokens(teamName);

  if (!tokens.length) {
    return false;
  }

  /*
   * Require every meaningful team token.
   * Example:
   * "Memphis Grizzlies" -> memphis + grizzlies
   * "Coventry City" -> coventry
   */
  return tokens.every(token => {
    const expression =
      new RegExp(
        `(?:^|\\s)${escapeRegExp(token)}(?:$|\\s)`
      );

    return expression.test(text);
  });
}

function escapeRegExp(value) {
  return String(value)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function programmeContainsBothTeams(
  programme,
  teams
) {
  const safeTeams =
    Array.isArray(teams)
      ? teams.filter(Boolean)
      : [];

  if (safeTeams.length < 2) {
    return false;
  }

  /*
   * Safety rule:
   *
   * Both teams must be present in the programme's
   * primary identifying text.
   *
   * Description text is deliberately excluded here.
   * A description can mention unrelated teams,
   * highlights, previews or other fixtures and must
   * never turn those into a confirmed live match.
   */
  const primaryText = [
    programme?.title,
    programme?.subtitle
  ]
    .filter(Boolean)
    .join(" ");

  return (
    containsTeam(
      primaryText,
      safeTeams[0]
    ) &&
    containsTeam(
      primaryText,
      safeTeams[1]
    )
  );
}

function getProgrammeStart(programme) {
  return (
    parseXmltvTime(programme?.start) ??
    parseEpoch(programme?.startMs) ??
    parseEpoch(programme?.startTime) ??
    null
  );
}

function getProgrammeStop(programme) {
  return (
    parseXmltvTime(programme?.stop) ??
    parseEpoch(programme?.stopMs) ??
    parseEpoch(programme?.endTime) ??
    null
  );
}

function getFixtureKickoff(fixture) {
  return (
    parseEpoch(fixture?.kickoff) ??
    parseEpoch(fixture?.released) ??
    parseEpoch(fixture?.date) ??
    parseEpoch(fixture?.timestamp) ??
    parseEpoch(fixture?.start) ??
    null
  );
}

function programmeNearKickoff(
  programme,
  fixture,
  {
    windowMs = DEFAULT_KICKOFF_WINDOW_MS
  } = {}
) {
  const kickoff =
    getFixtureKickoff(fixture);

  const programmeStart =
    getProgrammeStart(programme);

  const programmeStop =
    getProgrammeStop(programme);

  /*
   * If either side genuinely has no time information,
   * we cannot verify schedule proximity.
   */
  if (
    kickoff === null ||
    programmeStart === null
  ) {
    return false;
  }

  if (
    programmeStop !== null &&
    kickoff >= programmeStart - windowMs &&
    kickoff <= programmeStop + windowMs
  ) {
    return true;
  }

  return (
    Math.abs(
      programmeStart - kickoff
    ) <= windowMs
  );
}

function scoreProgrammeMatch(
  programme,
  fixture,
  teams,
  options = {}
) {
  if (
    !programmeContainsBothTeams(
      programme,
      teams
    )
  ) {
    return {
      confirmed: false,
      score: 0,
      reasons: [
        "both-teams-not-present"
      ]
    };
  }

  if (
    !programmeNearKickoff(
      programme,
      fixture,
      options
    )
  ) {
    return {
      confirmed: false,
      score: 0,
      reasons: [
        "programme-outside-kickoff-window"
      ]
    };
  }

  const title =
    normalize(programme?.title);

  const text = normalize([
    programme?.title,
    programme?.subtitle,
    programme?.desc,
    programme?.description
  ].filter(Boolean).join(" "));

  let score = 100;
  const reasons = [
    "both-teams",
    "kickoff-window"
  ];

  if (
    teams.every(team =>
      containsTeam(title, team)
    )
  ) {
    score += 40;
    reasons.push(
      "both-teams-in-title"
    );
  }

  const leagueTerms = [
    fixture?.league,
    fixture?.leagueName,
    fixture?.competition,
    fixture?.competitionName
  ]
    .map(normalize)
    .filter(Boolean);

  for (const term of leagueTerms) {
    if (text.includes(term)) {
      score += 15;
      reasons.push(
        `league:${term}`
      );
      break;
    }
  }

  return {
    confirmed: true,
    score,
    reasons
  };
}

function findConfirmedProgrammes({
  fixture,
  teams,
  programmes,
  windowMs =
    DEFAULT_KICKOFF_WINDOW_MS
}) {
  const safeProgrammes =
    Array.isArray(programmes)
      ? programmes
      : [];

  return safeProgrammes
    .map(programme => {
      const result =
        scoreProgrammeMatch(
          programme,
          fixture,
          teams,
          {
            windowMs
          }
        );

      return {
        programme,
        ...result
      };
    })
    .filter(row =>
      row.confirmed
    )
    .sort(
      (a, b) =>
        b.score - a.score
    );
}

function confirmCandidateChannel({
  fixture,
  teams,
  candidate,
  programmes,
  windowMs =
    DEFAULT_KICKOFF_WINDOW_MS
}) {
  const matches =
    findConfirmedProgrammes({
      fixture,
      teams,
      programmes,
      windowMs
    });

  return {
    confirmed:
      matches.length > 0,
    channelId:
      candidate?.channel?.id ||
      candidate?.channelId ||
      null,
    channelName:
      candidate?.channel?.name ||
      candidate?.channelName ||
      null,
    matches
  };
}

module.exports = {
  DEFAULT_KICKOFF_WINDOW_MS,
  normalize,
  meaningfulTokens,
  parseEpoch,
  parseXmltvTime,
  containsTeam,
  programmeContainsBothTeams,
  programmeNearKickoff,
  scoreProgrammeMatch,
  findConfirmedProgrammes,
  confirmCandidateChannel
};
