const crypto = require("crypto");
const { fetchCached } = require("./api-helpers");

const TMDB_KEY = process.env.TMDB_KEY;

const DAILY_CANDIDATE_COUNT = 60;
const MIN_VOTE_COUNT = 20;

function getUtcDay() {
  return new Date().toISOString().slice(0, 10);
}

function createSeed(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest()
    .readUInt32LE(0);
}

function createSeededRandom(seed) {
  let state = seed >>> 0;

  return function seededRandom() {
    state += 0x6d2b79f5;

    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seedValue) {
  const shuffled = items.slice();
  const random = createSeededRandom(createSeed(seedValue));

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const replacementIndex = Math.floor(random() * (index + 1));

    [shuffled[index], shuffled[replacementIndex]] = [
      shuffled[replacementIndex],
      shuffled[index]
    ];
  }

  return shuffled;
}

function getTitle(item, type) {
  return type === "series"
    ? item?.name || item?.original_name
    : item?.title || item?.original_title;
}

function getYear(item, type) {
  const date =
    type === "series"
      ? item?.first_air_date
      : item?.release_date;

  const year = Number.parseInt(String(date || "").slice(0, 4), 10);

  return Number.isInteger(year) ? year : null;
}

function isUsableCandidate(item, type) {
  if (!item?.id || !item?.poster_path) return false;
  if (!getTitle(item, type)) return false;
  if (!getYear(item, type)) return false;
  if ((item.vote_count || 0) < MIN_VOTE_COUNT) return false;

  return true;
}

function candidateScore(item) {
  const voteAverage = Number(item?.vote_average || 0);
  const voteCount = Number(item?.vote_count || 0);
  const popularity = Number(item?.popularity || 0);

  return (
    voteAverage * 12 +
    Math.log10(Math.max(voteCount, 1)) * 16 +
    Math.log10(Math.max(popularity, 1)) * 8
  );
}

function dedupeCandidates(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = String(item?.id || "");

    if (!key || seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

async function fetchCandidatePage(tmdbType, source, page, language) {
  const url =
    `https://api.themoviedb.org/3/${tmdbType}/${source}` +
    `?api_key=${TMDB_KEY}` +
    `&language=${encodeURIComponent(language || "en-US")}` +
    `&page=${page}`;

  const data = await fetchCached(url);

  return Array.isArray(data?.results) ? data.results : [];
}

async function fetchTrendingPage(tmdbType, page, language) {
  const url =
    `https://api.themoviedb.org/3/trending/${tmdbType}/week` +
    `?api_key=${TMDB_KEY}` +
    `&language=${encodeURIComponent(language || "en-US")}` +
    `&page=${page}`;

  const data = await fetchCached(url);

  return Array.isArray(data?.results) ? data.results : [];
}

async function buildDailyAiFallback({
  type,
  language = "en-US",
  userToken = null,
  traktUser = null
}) {
  if (!TMDB_KEY) {
    throw new Error("TMDB_KEY is not configured");
  }

  const tmdbType = type === "series" ? "tv" : "movie";

  const requests = [
    fetchTrendingPage(tmdbType, 1, language),
    fetchTrendingPage(tmdbType, 2, language),
    fetchCandidatePage(tmdbType, "popular", 1, language),
    fetchCandidatePage(tmdbType, "popular", 2, language),
    fetchCandidatePage(tmdbType, "top_rated", 1, language),
    fetchCandidatePage(tmdbType, "top_rated", 2, language)
  ];

  const responses = await Promise.allSettled(requests);

  const rawCandidates = responses.flatMap(response =>
    response.status === "fulfilled" ? response.value : []
  );

  const usableCandidates = dedupeCandidates(
    rawCandidates.filter(item => isUsableCandidate(item, type))
  );

  usableCandidates.sort(
    (left, right) => candidateScore(right) - candidateScore(left)
  );

  /*
   * Keep strong results near the top, but shuffle a wide pool so the row
   * changes daily without becoming a random pile of low-quality titles.
   */
  const qualityPool = usableCandidates.slice(0, 100);

  const seedIdentity =
    userToken ||
    traktUser ||
    "general";

  const dailySeed = [
    "ultramax-ai-fallback",
    seedIdentity,
    type,
    language,
    getUtcDay()
  ].join("|");

  const selected = seededShuffle(qualityPool, dailySeed)
    .slice(0, DAILY_CANDIDATE_COUNT)
    .map(item => ({
      title: getTitle(item, type),
      year: getYear(item, type),
      tmdbResult: item
    }));

  console.log(
    `[AI fallback] Daily pool: type=${type}, ` +
    `raw=${rawCandidates.length}, usable=${usableCandidates.length}, ` +
    `selected=${selected.length}, day=${getUtcDay()}`
  );

  return selected;
}

module.exports = {
  buildDailyAiFallback
};
