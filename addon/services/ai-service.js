const crypto = require("crypto");
const { fetchCached } = require("./api-helpers");
const { resultsToMetas } = require("./metadata-service");
const { buildDailyAiFallback } = require("./ai-daily-fallback-service");

const TMDB_KEY = process.env.TMDB_KEY;
const FILTER_ENABLED = process.env.FILTER_MODE !== "off";
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

const AI_TARGET_COUNT = 40;
const AI_VISIBLE_COUNT = 24;
const SUCCESS_CACHE_MS = 6 * 60 * 60 * 1000;
const FAILURE_CACHE_MS = 15 * 60 * 1000;

const aiRecommendationCache = new Map();

const MOVIE_FALLBACK = [
  { title: "The Matrix", year: 1999 },
  { title: "Inception", year: 2010 },
  { title: "Interstellar", year: 2014 },
  { title: "The Dark Knight", year: 2008 },
  { title: "Mad Max: Fury Road", year: 2015 },
  { title: "Dune", year: 2021 },
  { title: "The Shawshank Redemption", year: 1994 },
  { title: "Pulp Fiction", year: 1994 },
  { title: "The Lord of the Rings: The Fellowship of the Ring", year: 2001 },
  { title: "The Lord of the Rings: The Two Towers", year: 2002 },
  { title: "The Lord of the Rings: The Return of the King", year: 2003 },
  { title: "The Prestige", year: 2006 },
  { title: "Gladiator", year: 2000 },
  { title: "Blade Runner 2049", year: 2017 },
  { title: "The Departed", year: 2006 },
  { title: "Parasite", year: 2019 },
  { title: "Whiplash", year: 2014 },
  { title: "The Green Mile", year: 1999 },
  { title: "Arrival", year: 2016 },
  { title: "The Truman Show", year: 1998 },
  { title: "The Silence of the Lambs", year: 1991 },
  { title: "Good Will Hunting", year: 1997 },
  { title: "The Grand Budapest Hotel", year: 2014 },
  { title: "Everything Everywhere All at Once", year: 2022 }
];

const SERIES_FALLBACK = [
  { title: "Breaking Bad", year: 2008 },
  { title: "Game of Thrones", year: 2011 },
  { title: "The Sopranos", year: 1999 },
  { title: "The Wire", year: 2002 },
  { title: "Stranger Things", year: 2016 },
  { title: "The Last of Us", year: 2023 },
  { title: "Better Call Saul", year: 2015 },
  { title: "Succession", year: 2018 },
  { title: "Chernobyl", year: 2019 },
  { title: "True Detective", year: 2014 },
  { title: "Fargo", year: 2014 },
  { title: "The Bear", year: 2022 },
  { title: "Severance", year: 2022 },
  { title: "Dark", year: 2017 },
  { title: "Black Mirror", year: 2011 },
  { title: "Mindhunter", year: 2017 },
  { title: "The Boys", year: 2019 },
  { title: "Peaky Blinders", year: 2013 },
  { title: "Sherlock", year: 2010 },
  { title: "Mr. Robot", year: 2015 },
  { title: "The Mandalorian", year: 2019 },
  { title: "House of the Dragon", year: 2022 },
  { title: "The Queen's Gambit", year: 2020 },
  { title: "Narcos", year: 2015 }
];

function getFallback(type) {
  return type === "series"
    ? SERIES_FALLBACK.map(item => ({ ...item }))
    : MOVIE_FALLBACK.map(item => ({ ...item }));
}

async function getSmartFallback({
  type,
  language,
  userToken,
  traktUser
}) {
  try {
    const dailyItems = await buildDailyAiFallback({
      type,
      language,
      userToken,
      traktUser
    });

    if (dailyItems.length >= AI_VISIBLE_COUNT) {
      return dailyItems;
    }

    console.error(
      `[AI fallback] Daily pool too small: type=${type}, ` +
      `count=${dailyItems.length}, using static fallback`
    );
  } catch (error) {
    console.error(
      `[AI fallback] Daily pool failed: type=${type}, ` +
      `error=${error.message}, using static fallback`
    );
  }

  return getFallback(type);
}

function makeCacheKey({
  type,
  googleAiKey,
  traktUser,
  language,
  userToken
}) {
  const keyHash = crypto
    .createHash("sha256")
    .update(String(googleAiKey || ""))
    .digest("hex")
    .slice(0, 12);

  return [
    type || "movie",
    language || "en-US",
    userToken || traktUser || "general",
    keyHash
  ].join("|");
}

function readCache(cacheKey) {
  const cached = aiRecommendationCache.get(cacheKey);

  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    aiRecommendationCache.delete(cacheKey);
    return null;
  }

  return cached.items.map(item => ({ ...item }));
}

function writeCache(cacheKey, items, ttl) {
  aiRecommendationCache.set(cacheKey, {
    expiresAt: Date.now() + ttl,
    items: items.map(item => ({ ...item }))
  });
}

function cleanAiItems(items) {
  const cleaned = [];
  const seen = new Set();

  for (const item of items || []) {
    const title = String(item?.title || "").trim();
    const parsedYear = Number.parseInt(item?.year, 10);
    const year = Number.isInteger(parsedYear) ? parsedYear : null;

    if (!title) continue;

    const duplicateKey = `${title.toLowerCase()}|${year || ""}`;
    if (seen.has(duplicateKey)) continue;

    seen.add(duplicateKey);
    cleaned.push({ title, year });

    if (cleaned.length >= AI_TARGET_COUNT) break;
  }

  return cleaned;
}

async function geminiAiRecommendations({
  type,
  googleAiKey,
  traktUser = null,
  language = "en-US",
  userToken = null
}) {
  if (!googleAiKey) {
    return await getSmartFallback({
      type,
      language,
      userToken,
      traktUser
    });
  }

  const cacheKey = makeCacheKey({
    type,
    googleAiKey,
    traktUser,
    language,
    userToken
  });

  const cached = readCache(cacheKey);

  if (cached) {
    console.log(
      `[AI rows] Cache hit: type=${type}, candidates=${cached.length}`
    );
    return cached;
  }

  const mediaLabel = type === "series" ? "TV series" : "movies";

  const prompt = `
Return ONLY valid JSON.
Recommend ${AI_TARGET_COUNT} ${mediaLabel} for a streaming catalog.
Provide a varied selection of acclaimed, popular and discoverable titles.
Avoid duplicate titles and return the original release year.
${traktUser
    ? `If useful, personalise the choices for Trakt user "${traktUser}".`
    : "Use broadly popular, high-quality choices."}

JSON shape:
{"items":[{"title":"The Matrix","year":1999},{"title":"Breaking Bad","year":2008}]}
No markdown. No explanation.
`;

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    `${GEMINI_MODEL}:generateContent`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": googleAiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.8
        }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");

      console.error(
        `[AI rows] Gemini failed: status=${response.status}, ` +
        `type=${type}, fallback=${getFallback(type).length}`,
        errorBody.slice(0, 500)
      );

      const fallback = await getSmartFallback({
        type,
        language,
        userToken,
        traktUser
      });
      writeCache(cacheKey, fallback, FAILURE_CACHE_MS);
      return fallback;
    }

    const data = await response.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("\n") || "";

    try {
      const cleanedText = text.replace(/```json|```/gi, "").trim();
      const parsed = JSON.parse(cleanedText);
      const items = cleanAiItems(parsed.items);

      if (!items.length) {
        const fallback = await getSmartFallback({
        type,
        language,
        userToken,
        traktUser
      });

        console.error(
          `[AI rows] Gemini returned no usable items: ` +
          `type=${type}, fallback=${fallback.length}`
        );

        writeCache(cacheKey, fallback, FAILURE_CACHE_MS);
        return fallback;
      }

      console.log(
        `[AI rows] Gemini candidates: type=${type}, count=${items.length}`
      );

      writeCache(cacheKey, items, SUCCESS_CACHE_MS);
      return items;
    } catch (error) {
      const fallback = await getSmartFallback({
        type,
        language,
        userToken,
        traktUser
      });

      console.error(
        `[AI rows] Gemini JSON parse failed: type=${type}, ` +
        `fallback=${fallback.length}, response=${text.slice(0, 300)}`
      );

      writeCache(cacheKey, fallback, FAILURE_CACHE_MS);
      return fallback;
    }
  } catch (error) {
    const fallback = await getSmartFallback({
        type,
        language,
        userToken,
        traktUser
      });

    console.error(
      `[AI rows] Gemini request error: type=${type}, ` +
      `fallback=${fallback.length}, error=${error.message}`
    );

    writeCache(cacheKey, fallback, FAILURE_CACHE_MS);
    return fallback;
  }
}

function normaliseTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resultYear(result, type) {
  const date =
    type === "series"
      ? result?.first_air_date
      : result?.release_date;

  const year = Number.parseInt(String(date || "").slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

function chooseBestTmdbResult(results, item, type) {
  if (!Array.isArray(results) || !results.length) return null;

  const requestedTitle = normaliseTitle(item.title);
  const requestedYear = Number.parseInt(item.year, 10);

  const scored = results.map((result, index) => {
    const primaryTitle = normaliseTitle(
      type === "series" ? result.name : result.title
    );

    const originalTitle = normaliseTitle(
      type === "series"
        ? result.original_name
        : result.original_title
    );

    const year = resultYear(result, type);

    let score = 0;

    if (primaryTitle === requestedTitle) score += 100;
    if (originalTitle === requestedTitle) score += 90;

    if (
      requestedTitle &&
      primaryTitle &&
      (
        primaryTitle.includes(requestedTitle) ||
        requestedTitle.includes(primaryTitle)
      )
    ) {
      score += 35;
    }

    if (
      Number.isInteger(requestedYear) &&
      Number.isInteger(year)
    ) {
      const difference = Math.abs(requestedYear - year);

      if (difference === 0) score += 60;
      else if (difference === 1) score += 20;
      else score -= Math.min(difference * 5, 40);
    }

    score += Math.max(0, 10 - index);

    return { result, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.result || null;
}

async function tmdbResolveAiItems(
  items,
  type,
  language,
  rpdbKey,
  tpKey,
  excludeUnreleased,
  fanartKey = null,
  omdbKey = null,
  digitalReleaseOnly = false
) {
  const tmdbType = type === "series" ? "tv" : "movie";
  const found = [];
  const seenIds = new Set();

  for (const item of items || []) {
    const rawTitle = String(item?.title || "").trim();
    if (!rawTitle) continue;

    try {
      if (item?.tmdbResult?.id) {
        const directResult = item.tmdbResult;

        if (!seenIds.has(directResult.id)) {
          seenIds.add(directResult.id);
          found.push(directResult);
        }

        continue;
      }

      const query = encodeURIComponent(rawTitle);
      const searchLanguage = encodeURIComponent(language || "en-US");

      const data = await fetchCached(
        `https://api.themoviedb.org/3/search/${tmdbType}` +
        `?api_key=${TMDB_KEY}` +
        `&query=${query}` +
        `&include_adult=false` +
        `&language=${searchLanguage}` +
        `&page=1`
      );

      const result = chooseBestTmdbResult(
        data.results || [],
        item,
        type
      );

      if (!result?.id || seenIds.has(result.id)) continue;

      seenIds.add(result.id);
      found.push(result);
    } catch (error) {
      console.error(
        `[AI rows] TMDB resolution failed: ` +
        `type=${type}, title=${rawTitle}, error=${error.message}`
      );
    }
  }

  const metas = await resultsToMetas(
    found,
    type,
    FILTER_ENABLED,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased,
    fanartKey,
    omdbKey,
    null,
    digitalReleaseOnly
  );

  console.log(
    `[AI rows] Resolution summary: type=${type}, ` +
    `candidates=${(items || []).length}, ` +
    `tmdb=${found.length}, metas=${metas.length}`
  );

  return metas;
}

module.exports = {
  geminiAiRecommendations,
  tmdbResolveAiItems
};
