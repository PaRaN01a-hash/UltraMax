const KITSU_API_BASE = "https://kitsu.io/api/edge";
const KITSU_TIMEOUT_MS = 8000;

function parseKitsuId(id) {
  const match = /^kitsu:(\d+)(?::(\d+):(\d+))?$/i.exec(String(id || "").trim());

  if (!match) return null;

  return {
    animeId: match[1],
    season: match[2] ? Number(match[2]) : null,
    episode: match[3] ? Number(match[3]) : null
  };
}

function isKitsuId(id) {
  return Boolean(parseKitsuId(id));
}

function absoluteImageUrl(image) {
  if (!image) return null;

  return (
    image.original ||
    image.large ||
    image.medium ||
    image.small ||
    image.tiny ||
    null
  );
}

function cleanDescription(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KITSU_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.api+json",
        "User-Agent": "Ultra-MAX/7"
      }
    });

    if (!response.ok) {
      throw new Error(`Kitsu returned HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchKitsuAnime(animeId) {
  const payload = await fetchJson(
    `${KITSU_API_BASE}/anime/${encodeURIComponent(animeId)}`
  );

  return payload?.data || null;
}

async function fetchKitsuEpisodes(animeId) {
  const episodes = [];
  let url =
    `${KITSU_API_BASE}/anime/${encodeURIComponent(animeId)}` +
    `/episodes?page[limit]=20&page[offset]=0&sort=number`;

  // Safety limit prevents a broken or circular pagination response.
  for (let page = 0; url && page < 30; page += 1) {
    const payload = await fetchJson(url);

    for (const item of payload?.data || []) {
      episodes.push(item);
    }

    url = payload?.links?.next || null;
  }

  return episodes;
}

function animeTitle(attributes) {
  const titles = attributes?.titles || {};

  return (
    attributes?.canonicalTitle ||
    titles.en ||
    titles.en_us ||
    titles.en_jp ||
    titles.ja_jp ||
    Object.values(titles).find(Boolean) ||
    "Anime"
  );
}

function buildEpisodeVideos(originalId, episodeResources) {
  return episodeResources
    .map(resource => {
      const attributes = resource?.attributes || {};
      const episodeNumber = Number(
        attributes.number ||
        attributes.relativeNumber ||
        resource?.id
      );

      if (!Number.isFinite(episodeNumber) || episodeNumber < 1) {
        return null;
      }

      const thumbnail = absoluteImageUrl(attributes.thumbnail);

      return {
        id: `${originalId}:1:${episodeNumber}`,
        title:
          attributes.canonicalTitle ||
          `Episode ${episodeNumber}`,
        season: 1,
        episode: episodeNumber,
        overview: cleanDescription(
          attributes.synopsis || attributes.description
        ),
        thumbnail,
        released: attributes.airdate
          ? new Date(attributes.airdate).toISOString()
          : null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.episode - b.episode);
}

async function buildKitsuMeta({ id, type }) {
  const parsed = parseKitsuId(id);

  if (!parsed) return null;

  const anime = await fetchKitsuAnime(parsed.animeId);

  if (!anime) {
    return { meta: { id, type } };
  }

  const attributes = anime.attributes || {};
  const poster = absoluteImageUrl(attributes.posterImage);
  const background = absoluteImageUrl(attributes.coverImage);

  const meta = {
    id,
    type: "series",
    name: animeTitle(attributes),
    description: cleanDescription(
      attributes.synopsis || attributes.description
    ),
    poster,
    background: background || poster,
    releaseInfo:
      attributes.startDate
        ? String(attributes.startDate).slice(0, 4)
        : null,
    imdbRating:
      attributes.averageRating
        ? (Number(attributes.averageRating) / 10).toFixed(1)
        : null,
    genres: ["Anime"],
    runtime: attributes.episodeLength
      ? `${attributes.episodeLength} min`
      : null
  };

  try {
    const episodes = await fetchKitsuEpisodes(parsed.animeId);
    const videos = buildEpisodeVideos(id, episodes);

    if (videos.length) {
      meta.videos = videos;
    }
  } catch (error) {
    console.warn(
      "Kitsu episode lookup failed:",
      id,
      error?.message || error
    );
  }

  return { meta };
}


const tmdbAnimeKitsuCache = new Map();

function isJapaneseAnimatedSeries(item, type) {
  if (type !== "series") return false;

  if (
    String(item?.original_language || "").toLowerCase() !== "ja"
  ) {
    return false;
  }

  const genreIds = Array.isArray(item?.genre_ids)
    ? item.genre_ids.map(Number)
    : [];

  const genreNames = Array.isArray(item?.genres)
    ? item.genres.map(genre =>
        normaliseTitle(genre?.name)
      )
    : [];

  return (
    genreIds.includes(16) ||
    genreNames.includes("animation")
  );
}

function getKitsuCandidateTitles(attributes) {
  const titles = attributes?.titles || {};

  return [
    attributes?.canonicalTitle,
    titles.en,
    titles.en_us,
    titles.en_jp,
    titles.ja_jp,
    ...Object.values(titles)
  ]
    .map(normaliseTitle)
    .filter(Boolean);
}

async function resolveTmdbAnimeToKitsuId(item, type) {
  if (!isJapaneseAnimatedSeries(item, type)) {
    return null;
  }

  const tmdbId = String(item?.id || "").trim();

  if (!tmdbId) {
    return null;
  }

  const cacheKey = `${type}:${tmdbId}`;

  if (tmdbAnimeKitsuCache.has(cacheKey)) {
    return tmdbAnimeKitsuCache.get(cacheKey);
  }

  const title =
    item?.name ||
    item?.title ||
    item?.original_name ||
    item?.original_title ||
    "";

  const wantedTitles = [
    title,
    item?.name,
    item?.title,
    item?.original_name,
    item?.original_title
  ]
    .map(normaliseTitle)
    .filter(Boolean);

  const releaseYear = String(
    item?.first_air_date ||
    item?.release_date ||
    ""
  ).slice(0, 4);

  if (!wantedTitles.length || !releaseYear) {
    tmdbAnimeKitsuCache.set(cacheKey, null);
    return null;
  }

  try {
    const params = new URLSearchParams({
      "filter[text]": title,
      "page[limit]": "10"
    });

    const payload = await fetchJson(
      `${KITSU_API_BASE}/anime?${params.toString()}`
    );

    const matches = (payload?.data || [])
      .filter(resource => {
        const attributes = resource?.attributes || {};
        const candidateTitles =
          getKitsuCandidateTitles(attributes);

        const candidateYear = String(
          attributes.startDate || ""
        ).slice(0, 4);

        const subtype = String(
          attributes.subtype || ""
        ).toLowerCase();

        const titleMatches = wantedTitles.some(
          wanted => candidateTitles.includes(wanted)
        );

        const yearMatches =
          candidateYear === releaseYear;

        const subtypeMatches =
          subtype === "tv" ||
          subtype === "ona";

        return (
          resource?.id &&
          titleMatches &&
          yearMatches &&
          subtypeMatches
        );
      });

    if (matches.length !== 1) {
      console.warn(
        "TMDB to Kitsu match not unique:",
        tmdbId,
        title,
        releaseYear,
        "matches:",
        matches.length
      );

      tmdbAnimeKitsuCache.set(cacheKey, null);
      return null;
    }

    const kitsuId = `kitsu:${matches[0].id}`;

    tmdbAnimeKitsuCache.set(cacheKey, kitsuId);

    console.log(
      "TMDB ANIME RESOLVED:",
      tmdbId,
      "->",
      kitsuId,
      title,
      releaseYear
    );

    return kitsuId;
  } catch (error) {
    console.warn(
      "TMDB to Kitsu resolution failed:",
      tmdbId,
      title,
      error?.message || error
    );

    return null;
  }
}

const streamIdCache = new Map();

function normaliseTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function candidateScore(candidate, titles, releaseYear) {
  const candidateName = normaliseTitle(candidate?.name);
  const originalName = normaliseTitle(candidate?.original_name);
  const wantedTitles = titles.map(normaliseTitle).filter(Boolean);

  let score = 0;

  if (wantedTitles.includes(candidateName)) score += 100;
  if (wantedTitles.includes(originalName)) score += 100;

  if (
    wantedTitles.some(title =>
      candidateName.includes(title) ||
      title.includes(candidateName)
    )
  ) {
    score += 30;
  }

  const candidateYear = String(candidate?.first_air_date || "").slice(0, 4);

  if (releaseYear && candidateYear === releaseYear) {
    score += 50;
  }

  if (candidate?.original_language === "ja") {
    score += 10;
  }

  return score;
}

async function resolveKitsuStreamId(id, deps) {
  const parsed = parseKitsuId(id);

  if (!parsed) return id;

  const cacheKey = String(id);

  if (streamIdCache.has(cacheKey)) {
    return streamIdCache.get(cacheKey);
  }

  const {
    TMDB_KEY,
    fetchCached
  } = deps || {};

  if (!TMDB_KEY || typeof fetchCached !== "function") {
    return null;
  }

  try {
    const anime = await fetchKitsuAnime(parsed.animeId);

    if (!anime) return null;

    const attributes = anime.attributes || {};
    const titles = [
      animeTitle(attributes),
      attributes.canonicalTitle,
      attributes.titles?.en,
      attributes.titles?.en_us,
      attributes.titles?.en_jp,
      attributes.titles?.ja_jp
    ].filter(Boolean);

    const releaseYear = attributes.startDate
      ? String(attributes.startDate).slice(0, 4)
      : "";

    const query = titles[0];

    if (!query) return null;

    const searchParams = new URLSearchParams({
      api_key: TMDB_KEY,
      query
    });

    if (releaseYear) {
      searchParams.set("first_air_date_year", releaseYear);
    }

    let searchData = await fetchCached(
      `https://api.themoviedb.org/3/search/tv?${searchParams.toString()}`
    );

    let candidates = Array.isArray(searchData?.results)
      ? searchData.results
      : [];

    // Retry without the year if TMDB has an unusual or regional air date.
    if (!candidates.length && releaseYear) {
      const fallbackParams = new URLSearchParams({
        api_key: TMDB_KEY,
        query
      });

      searchData = await fetchCached(
        `https://api.themoviedb.org/3/search/tv?${fallbackParams.toString()}`
      );

      candidates = Array.isArray(searchData?.results)
        ? searchData.results
        : [];
    }

    const best = candidates
      .map(candidate => ({
        candidate,
        score: candidateScore(candidate, titles, releaseYear)
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best || best.score < 50 || !best.candidate?.id) {
      console.warn(
        "Kitsu TMDB match not confident:",
        id,
        query,
        releaseYear
      );

      return null;
    }

    const externalIds = await fetchCached(
      `https://api.themoviedb.org/3/tv/${best.candidate.id}/external_ids?api_key=${TMDB_KEY}`
    );

    const imdbId = String(externalIds?.imdb_id || "").trim();

    if (!/^tt\d+$/i.test(imdbId)) {
      console.warn(
        "Kitsu TMDB match has no IMDb ID:",
        id,
        best.candidate.id
      );

      return null;
    }

    const resolvedId =
      parsed.season && parsed.episode
        ? `${imdbId}:${parsed.season}:${parsed.episode}`
        : imdbId;

    streamIdCache.set(cacheKey, resolvedId);

    console.log(
      "KITSU STREAM RESOLVED:",
      id,
      "->",
      resolvedId,
      "TMDB:",
      best.candidate.id
    );

    return resolvedId;
  } catch (error) {
    console.warn(
      "Kitsu stream resolution failed:",
      id,
      error?.message || error
    );

    return null;
  }
}

module.exports = {
  parseKitsuId,
  isKitsuId,
  buildKitsuMeta,
  resolveKitsuStreamId,
  resolveTmdbAnimeToKitsuId
};
