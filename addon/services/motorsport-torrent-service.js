"use strict";

const { extractInfoHashFromMagnet } = require("../utils/magnets");

const DEFAULT_JACKETT_INDEXER = "all";
const DEFAULT_TIMEOUT_MS =
  Number(process.env.MOTORSPORT_TORRENT_TIMEOUT_MS) ||
  15000;

const SESSION_LABELS = {
  race: "Race",
  qualifying: "Qualifying",
  sprint: "Sprint",
  sprint_qualifying: "Sprint Qualifying",
  practice_1: "Practice 1",
  practice_2: "Practice 2",
  practice_3: "Practice 3",
  weekend_pack: "Weekend Pack",
  unknown: "Unknown"
};

const GP_ALIASES = new Map([
  ["british", ["british", "great britain", "united kingdom", "uk", "silverstone"]],
  ["spanish", ["spanish", "spain", "barcelona", "catalunya", "catalonia"]],
  ["canadian", ["canadian", "canada", "montreal", "montréal"]],
  ["monaco", ["monaco", "monte carlo"]],
  ["italian", ["italian", "italy", "monza"]],
  ["australian", ["australian", "australia", "melbourne", "albert park"]],
  ["chinese", ["chinese", "china", "shanghai"]],
  ["japanese", ["japanese", "japan", "suzuka"]],
  ["bahrain", ["bahrain", "sakhir"]],
  ["saudi arabian", ["saudi arabian", "saudi arabia", "jeddah"]],
  ["miami", ["miami"]],
  ["emilia romagna", ["emilia romagna", "imola"]],
  ["austrian", ["austrian", "austria", "spielberg"]],
  ["belgian", ["belgian", "belgium", "spa", "spa francorchamps"]],
  ["hungarian", ["hungarian", "hungary", "hungaroring"]],
  ["dutch", ["dutch", "netherlands", "zandvoort"]],
  ["azerbaijan", ["azerbaijan", "baku"]],
  ["singapore", ["singapore", "marina bay"]],
  ["united states", ["united states", "usa", "u s", "austin", "cota"]],
  ["mexico city", ["mexico city", "mexican", "mexico"]],
  ["sao paulo", ["sao paulo", "são paulo", "brazilian", "brazil", "interlagos"]],
  ["las vegas", ["las vegas", "vegas"]],
  ["qatar", ["qatar", "lusail", "losail"]],
  ["abu dhabi", ["abu dhabi", "yas marina"]]
]);

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text, phrase) {
  const haystack = ` ${normalize(text)} `;
  const needle = ` ${normalize(phrase)} `;

  return Boolean(needle.trim()) && haystack.includes(needle);
}

function hasRejectedSeries(title) {
  const text = ` ${normalize(title)} `;

  return (
    /\bformula\s*1\s*academy\b/.test(text) ||
    /\bf1\s*academy\b/.test(text) ||
    /\bformula\s*2\b/.test(text) ||
    /\bformula2\b/.test(text) ||
    /\bf2\b/.test(text) ||
    /\bformula\s*3\b/.test(text) ||
    /\bformula3\b/.test(text) ||
    /\bf3\b/.test(text)
  );
}

function hasFormula1Identity(title) {
  if (hasRejectedSeries(title)) {
    return false;
  }

  const text = ` ${normalize(title)} `;

  return (
    /\bformula\s*1\b/.test(text) ||
    /\bformula1\b/.test(text) ||
    /\bf1\b/.test(text)
  );
}

function parseYearFromMeta(meta) {
  const values = [
    meta?.released,
    meta?.releaseInfo,
    meta?.year,
    meta?.name,
    meta?.description
  ];

  for (const value of values) {
    const match =
      clean(value).match(/\b(20\d{2}|19\d{2})\b/);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function classifySession(value) {
  const text = ` ${normalize(value)} `;

  if (/\b(weekend|complete|pack|collection|all sessions|full weekend)\b/.test(text)) {
    return "weekend_pack";
  }

  if (/\b(sprint qualifying|sprint quali|sprint qualy|sq)\b/.test(text)) {
    return "sprint_qualifying";
  }

  if (/\b(fp1|free practice 1|free practice one|practice 1|practice one)\b/.test(text)) {
    return "practice_1";
  }

  if (/\b(fp2|free practice 2|free practice two|practice 2|practice two)\b/.test(text)) {
    return "practice_2";
  }

  if (/\b(fp3|free practice 3|free practice three|practice 3|practice three)\b/.test(text)) {
    return "practice_3";
  }

  if (/\b(qualifying|quali|qualy)\b/.test(text)) {
    return "qualifying";
  }

  if (/\bsprint\b/.test(text)) {
    return "sprint";
  }

  if (/\bgrand prix\b/.test(text) || /\bgp\b/.test(text)) {
    return "race";
  }

  return "unknown";
}

function extractGrandPrixLocation(name) {
  let text = normalize(name);

  text = text
    .replace(/\b(formula\s*1|formula1|f1)\b/g, " ")
    .replace(/\b(19\d{2}|20\d{2})\b/g, " ")
    .replace(/\b(sprint qualifying|sprint quali|sprint qualy|qualifying|quali|qualy|sprint|fp1|fp2|fp3|free practice|practice|one|two|three|1|2|3|race)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = text.match(/\b(.+?)\s+grand\s+prix\b/);

  if (!match) {
    return null;
  }

  return normalize(match[1]);
}

function getGrandPrixAliases(location) {
  const key = normalize(location);
  const aliases =
    GP_ALIASES.get(key) ||
    [key];

  return aliases
    .map(normalize)
    .filter(Boolean);
}

function titleMatchesGrandPrix(title, location) {
  const text = normalize(title);
  const aliases = getGrandPrixAliases(location);
  const hasGrandPrix =
    containsPhrase(text, "grand prix") ||
    /\bgp\b/.test(` ${text} `);

  return (
    hasGrandPrix &&
    aliases.some(alias =>
      containsPhrase(text, `${alias} grand prix`) ||
      containsPhrase(text, `${alias} gp`) ||
      containsPhrase(text, alias)
    )
  );
}

function extractF1Identity(meta) {
  const name = clean(meta?.name);
  const year = parseYearFromMeta(meta);
  const location = extractGrandPrixLocation(name);
  const session = classifySession(name);

  if (!name || !year || !location) {
    return null;
  }

  return {
    championship: "Formula 1",
    year,
    location,
    session,
    fixtureId: clean(meta?.id),
    fixtureName: name
  };
}

function buildSearchQueries(identity) {
  if (!identity) {
    return [];
  }

  const location = identity.location;
  const sessionTerms = {
    race: [""],
    qualifying: ["Qualifying", "Qualy"],
    sprint: ["Sprint"],
    sprint_qualifying: ["Sprint Qualifying"],
    practice_1: ["Practice 1", "FP1"],
    practice_2: ["Practice 2", "FP2"],
    practice_3: ["Practice 3", "FP3"],
    weekend_pack: ["Weekend"],
    unknown: [""]
  }[identity.session] || [""];

  const prefixes = [
    "Formula 1",
    "Formula1",
    "F1"
  ];

  const queries = [];

  for (const prefix of prefixes) {
    for (const sessionTerm of sessionTerms) {
      queries.push(
        [
          prefix,
          identity.year,
          location,
          "Grand Prix",
          sessionTerm
        ]
          .filter(Boolean)
          .join(" ")
      );
    }
  }

  return [...new Set(queries)];
}

function parseResolution(title) {
  const text = normalize(title);
  const match = text.match(/\b(2160p|1080p|720p|576p|480p)\b/);

  return match ? match[1] : null;
}

function scoreQuality(result) {
  const text = normalize(result.title);
  let score = 0;

  if (containsPhrase(text, "2160p")) score += 35;
  else if (containsPhrase(text, "1080p")) score += 25;
  else if (containsPhrase(text, "720p")) score += 15;

  if (/\b(web|webrip|web dl|hdtv)\b/.test(text)) score += 8;
  if (/\b(h265|x265|hevc)\b/.test(text)) score += 5;
  if (/\b(h264|x264|avc)\b/.test(text)) score += 3;

  return score;
}

function normalizeTorrentResult(raw) {
  const title =
    clean(
      raw?.title ||
      raw?.Title ||
      raw?.name
    );

  const magnet =
    clean(
      raw?.magnet ||
      raw?.MagnetUri ||
      raw?.magnetUri
    );

  const downloadUrl =
    clean(
      raw?.downloadUrl ||
      raw?.DownloadUrl ||
      raw?.link ||
      raw?.Link ||
      raw?.Guid
    );

  const infoHash =
    clean(
      raw?.infoHash ||
      raw?.InfoHash ||
      extractInfoHashFromMagnet(magnet)
    ).toLowerCase() || null;

  return {
    title,
    infoHash,
    magnet: magnet || null,
    downloadUrl: downloadUrl || null,
    seeders: Number(raw?.seeders ?? raw?.Seeders ?? raw?.Grabs ?? 0) || 0,
    peers: Number(raw?.peers ?? raw?.Peers ?? raw?.PeersConnected ?? 0) || 0,
    size: Number(raw?.size ?? raw?.Size ?? 0) || 0,
    source: clean(raw?.source || raw?.Tracker || raw?.Indexer) || null
  };
}

function validateTorrentForIdentity(raw, identity) {
  const result = normalizeTorrentResult(raw);
  const title = result.title;

  if (!title || !identity) {
    return {
      valid: false,
      reason: "missing-title-or-identity"
    };
  }

  if (!hasFormula1Identity(title)) {
    return {
      valid: false,
      reason: "not-formula-1"
    };
  }

  if (!containsPhrase(title, String(identity.year))) {
    return {
      valid: false,
      reason: "wrong-year"
    };
  }

  if (!titleMatchesGrandPrix(title, identity.location)) {
    return {
      valid: false,
      reason: "wrong-grand-prix"
    };
  }

  const session = classifySession(title);

  if (
    identity.session !== "unknown" &&
    session !== identity.session
  ) {
    return {
      valid: false,
      reason: "wrong-session",
      session
    };
  }

  const score =
    1000 +
    scoreQuality(result) +
    Math.min(result.seeders, 500);

  return {
    valid: true,
    result: {
      ...result,
      resolution: parseResolution(title),
      session,
      sessionLabel: SESSION_LABELS[session],
      score
    }
  };
}

function dedupeTorrentResults(results) {
  const seen = new Set();
  const deduped = [];

  for (const result of results) {
    const key = result.infoHash
      ? `hash:${result.infoHash}`
      : `fallback:${normalize(result.title)}:${result.size || 0}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(result);
  }

  return deduped;
}

function rankTorrentResults(results) {
  return [...results].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (b.seeders !== a.seeders) {
      return b.seeders - a.seeders;
    }

    return String(a.title).localeCompare(String(b.title));
  });
}

function resolveF1TorrentResults(meta, rawResults) {
  const identity = extractF1Identity(meta);

  if (!identity) {
    return {
      identity: null,
      queries: [],
      results: []
    };
  }

  const validResults = [];

  for (const raw of rawResults || []) {
    const validation =
      validateTorrentForIdentity(
        raw,
        identity
      );

    if (validation.valid) {
      validResults.push(
        validation.result
      );
    }
  }

  return {
    identity,
    queries: buildSearchQueries(identity),
    results: rankTorrentResults(
      dedupeTorrentResults(validResults)
    )
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function tagValue(xml, tag) {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i")
  );

  return match ? escapeXml(match[1].trim()) : "";
}

function torznabAttr(xml, name) {
  const expression =
    new RegExp(`<torznab:attr[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`, "i");

  const match = xml.match(expression);

  return match ? escapeXml(match[1]) : "";
}

function parseTorznabXml(xml) {
  const items =
    String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return items.map(item => ({
    title: tagValue(item, "title"),
    link: tagValue(item, "link"),
    Guid: tagValue(item, "guid"),
    MagnetUri: tagValue(item, "magnetUri") || torznabAttr(item, "magneturl"),
    Size: Number(tagValue(item, "size") || torznabAttr(item, "size") || 0),
    Seeders: Number(torznabAttr(item, "seeders") || 0),
    Peers: Number(torznabAttr(item, "peers") || 0),
    InfoHash: torznabAttr(item, "infohash"),
    Tracker: torznabAttr(item, "category") || torznabAttr(item, "tracker")
  }));
}

async function queryJackettTorznab(query, options = {}) {
  const baseUrl =
    clean(options.jackettUrl || process.env.JACKETT_URL);
  const apiKey =
    clean(options.jackettApiKey || process.env.JACKETT_API_KEY);
  const indexer =
    clean(options.indexer || process.env.JACKETT_INDEXER) ||
    DEFAULT_JACKETT_INDEXER;
  const fetchImpl =
    options.fetchImpl || fetch;

  if (!baseUrl || !apiKey) {
    return [];
  }

  const url =
    new URL(
      `${baseUrl.replace(/\/+$/, "")}` +
      `/api/v2.0/indexers/${encodeURIComponent(indexer)}` +
      "/results/torznab/api"
    );

  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("t", "search");
  url.searchParams.set("q", query);

  const response =
    await fetchImpl(
      url,
      {
        signal:
          AbortSignal.timeout(
            Number(options.timeoutMs) ||
            DEFAULT_TIMEOUT_MS
          )
      }
    );

  if (!response.ok) {
    throw new Error(`Jackett HTTP ${response.status}`);
  }

  const body = await response.text();

  return parseTorznabXml(body);
}

async function resolveF1ArchivedTorrents(meta, options = {}) {
  const identity = extractF1Identity(meta);

  if (!identity) {
    return {
      identity: null,
      queries: [],
      results: []
    };
  }

  const queries =
    options.queries ||
    buildSearchQueries(identity);

  const rawResults = [];

  const settled =
    await Promise.allSettled(
      queries.map(query =>
        queryJackettTorznab(
          query,
          options
        )
      )
    );

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      rawResults.push(
        ...(Array.isArray(result.value)
          ? result.value
          : [])
      );
      return;
    }

    console.warn(
      "[motorsport-torrent] Jackett query failed",
      queries[index],
      result.reason?.message ||
      result.reason
    );
  });

  if (!rawResults.length) {
    return {
      identity,
      queries,
      results: []
    };
  }

  return resolveF1TorrentResults(
    meta,
    rawResults
  );
}

module.exports = {
  SESSION_LABELS,
  buildSearchQueries,
  classifySession,
  dedupeTorrentResults,
  extractF1Identity,
  hasFormula1Identity,
  parseTorznabXml,
  queryJackettTorznab,
  rankTorrentResults,
  resolveF1ArchivedTorrents,
  resolveF1TorrentResults,
  titleMatchesGrandPrix,
  validateTorrentForIdentity
};
