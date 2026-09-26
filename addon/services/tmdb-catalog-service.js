const TMDB_DISCOVER_FIELDS = new Set([
  "name",
  "type",
  "handler",
  "genre",
  "genres",
  "keyword",
  "keywords",
  "provider",
  "providers",
  "watchRegion",
  "network",
  "networks",
  "company",
  "originalLanguage",
  "originCountry",
  "yearFrom",
  "yearTo",
  "releaseDateFrom",
  "releaseDateTo",
  "airDateFrom",
  "airDateTo",
  "minRating",
  "minVoteCount",
  "sortBy"
]);

const TMDB_DISCOVER_SORTS = new Set([
  "popularity.desc",
  "popularity.asc",
  "vote_average.desc",
  "vote_average.asc",
  "vote_count.desc",
  "primary_release_date.desc",
  "primary_release_date.asc",
  "first_air_date.desc",
  "first_air_date.asc"
]);

const ISO_3166_1_ALPHA_2 = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" "));

const ISO_639_1_ALPHA_2 = new Set((
  "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu"
).split(" "));

function invalidDiscoverDefinition(message) {
  return new TypeError(`Invalid tmdb_discover definition: ${message}`);
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function resolveDiscoverDate(value, field, now) {
  if (typeof value !== "string") {
    throw invalidDiscoverDefinition(`${field} must be an ISO date or rolling date token`);
  }

  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));

  if (value === "today") return formatUtcDate(today);

  const rollingMatch = /^today-(\d{1,4})d$/.exec(value);
  if (rollingMatch) {
    const days = Number(rollingMatch[1]);
    if (days < 1 || days > 3650) {
      throw invalidDiscoverDefinition(`${field} rolling offset must be between 1 and 3650 days`);
    }
    today.setUTCDate(today.getUTCDate() - days);
    return formatUtcDate(today);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalidDiscoverDefinition(`${field} must use YYYY-MM-DD format`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || formatUtcDate(parsed) !== value) {
    throw invalidDiscoverDefinition(`${field} is not a valid calendar date`);
  }

  return value;
}

function normalizeIdList(def, singular, plural) {
  const hasPlural = plural && def[plural] !== undefined;
  if (def[singular] !== undefined && hasPlural) {
    throw invalidDiscoverDefinition(`${singular} and ${plural} cannot both be set`);
  }

  const raw = hasPlural ? def[plural] : def[singular];
  if (raw === undefined) return null;

  const values = hasPlural ? raw : [raw];
  if (!Array.isArray(values) || values.length === 0 || values.length > 20) {
    throw invalidDiscoverDefinition(`${plural || singular} must contain between 1 and 20 numeric IDs`);
  }

  const ids = values.map(value => {
    const normalized = typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : value;
    if (!Number.isSafeInteger(normalized) || normalized <= 0 || normalized > 2147483647) {
      throw invalidDiscoverDefinition(`${singular}${plural ? `/${plural}` : ""} values must be positive numeric IDs`);
    }
    return normalized;
  });

  return [...new Set(ids)].sort((a, b) => a - b).join("|");
}

function validateDiscoverYear(value, field, now) {
  if (value === undefined) return null;
  const maxYear = now.getUTCFullYear() + 5;
  if (!Number.isInteger(value) || value < 1870 || value > maxYear) {
    throw invalidDiscoverDefinition(`${field} must be an integer from 1870 through ${maxYear}`);
  }
  return value;
}

function buildTmdbDiscoverUrl({
  def,
  type,
  tmdbType,
  page,
  ratingParam = "",
  languageParam = "",
  TMDB_KEY,
  includeAdult = false,
  now = new Date()
}) {
  const unknownFields = Object.keys(def).filter(field => !TMDB_DISCOVER_FIELDS.has(field));
  if (unknownFields.length) {
    throw invalidDiscoverDefinition(`unknown field(s): ${unknownFields.sort().join(", ")}`);
  }
  if (def.handler !== "tmdb_discover") {
    throw invalidDiscoverDefinition("handler must be tmdb_discover");
  }
  if (def.type !== "movie" && def.type !== "series") {
    throw invalidDiscoverDefinition("type must be movie or series");
  }
  if (type !== def.type) {
    throw invalidDiscoverDefinition(`requested type ${type} does not match definition type ${def.type}`);
  }

  const expectedTmdbType = type === "series" ? "tv" : "movie";
  if (tmdbType !== expectedTmdbType) {
    throw invalidDiscoverDefinition(`TMDB media type must be ${expectedTmdbType}`);
  }
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    throw invalidDiscoverDefinition("page must be an integer from 1 through 500");
  }
  if (!TMDB_DISCOVER_SORTS.has(def.sortBy)) {
    throw invalidDiscoverDefinition("sortBy is missing or unsupported");
  }
  if (type === "movie" && def.sortBy.startsWith("first_air_date.")) {
    throw invalidDiscoverDefinition("first_air_date sorting is only valid for series");
  }
  if (type === "series" && def.sortBy.startsWith("primary_release_date.")) {
    throw invalidDiscoverDefinition("primary_release_date sorting is only valid for movies");
  }
  if (type === "movie" && (def.airDateFrom !== undefined || def.airDateTo !== undefined)) {
    throw invalidDiscoverDefinition("air date filters are only valid for series");
  }
  if (type === "series" && (def.releaseDateFrom !== undefined || def.releaseDateTo !== undefined)) {
    throw invalidDiscoverDefinition("release date filters are only valid for movies");
  }

  const genres = normalizeIdList(def, "genre", "genres");
  const keywords = normalizeIdList(def, "keyword", "keywords");
  const providers = normalizeIdList(def, "provider", "providers");
  const networks = normalizeIdList(def, "network", "networks");
  const companies = normalizeIdList(def, "company", null);

  if (type === "movie" && networks) {
    throw invalidDiscoverDefinition("network filters are only valid for series");
  }

  if (providers && def.watchRegion === undefined) {
    throw invalidDiscoverDefinition("watchRegion is required with provider filters");
  }
  if (def.watchRegion !== undefined && !ISO_3166_1_ALPHA_2.has(def.watchRegion)) {
    throw invalidDiscoverDefinition("watchRegion must be a valid 2-letter uppercase ISO 3166-1 country code");
  }
  if (def.originalLanguage !== undefined && !ISO_639_1_ALPHA_2.has(def.originalLanguage)) {
    throw invalidDiscoverDefinition("originalLanguage must be a valid 2-letter lowercase ISO 639-1 language code");
  }
  if (def.originCountry !== undefined && !ISO_3166_1_ALPHA_2.has(def.originCountry)) {
    throw invalidDiscoverDefinition("originCountry must be a valid 2-letter uppercase ISO 3166-1 country code");
  }
  if (def.minRating !== undefined && (
    typeof def.minRating !== "number" ||
    !Number.isFinite(def.minRating) ||
    def.minRating < 0 ||
    def.minRating > 10
  )) {
    throw invalidDiscoverDefinition("minRating must be a number from 0 through 10");
  }
  if (def.minVoteCount !== undefined && (
    !Number.isInteger(def.minVoteCount) ||
    def.minVoteCount < 0 ||
    def.minVoteCount > 1000000
  )) {
    throw invalidDiscoverDefinition("minVoteCount must be an integer from 0 through 1000000");
  }

  const yearFrom = validateDiscoverYear(def.yearFrom, "yearFrom", now);
  const yearTo = validateDiscoverYear(def.yearTo, "yearTo", now);
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
    throw invalidDiscoverDefinition("yearFrom cannot be later than yearTo");
  }

  const explicitDateFrom = type === "series" ? def.airDateFrom : def.releaseDateFrom;
  const explicitDateTo = type === "series" ? def.airDateTo : def.releaseDateTo;
  if ((yearFrom !== null || yearTo !== null) && (
    explicitDateFrom !== undefined || explicitDateTo !== undefined
  )) {
    throw invalidDiscoverDefinition("year and explicit date filters cannot be combined");
  }

  let dateFrom = explicitDateFrom === undefined
    ? null
    : resolveDiscoverDate(explicitDateFrom, type === "series" ? "airDateFrom" : "releaseDateFrom", now);
  let dateTo = explicitDateTo === undefined
    ? null
    : resolveDiscoverDate(explicitDateTo, type === "series" ? "airDateTo" : "releaseDateTo", now);
  if (yearFrom !== null) dateFrom = `${yearFrom}-01-01`;
  if (yearTo !== null) dateTo = `${yearTo}-12-31`;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw invalidDiscoverDefinition("lower date boundary cannot be later than upper date boundary");
  }

  const params = new URLSearchParams();
  params.set("api_key", TMDB_KEY);
  params.set("include_adult", includeAdult ? "true" : "false");
  if (genres) params.set("with_genres", genres);
  if (keywords) params.set("with_keywords", keywords);
  if (providers) params.set("with_watch_providers", providers);
  if (def.watchRegion !== undefined) params.set("watch_region", def.watchRegion);
  if (networks) params.set("with_networks", networks);
  if (companies) params.set("with_companies", companies);
  if (def.originalLanguage !== undefined) {
    params.set("with_original_language", def.originalLanguage);
  }
  if (def.originCountry !== undefined) {
    params.set("with_origin_country", def.originCountry);
  }

  const dateField = type === "series" ? "first_air_date" : "primary_release_date";
  if (dateFrom) params.set(`${dateField}.gte`, dateFrom);
  if (dateTo) params.set(`${dateField}.lte`, dateTo);
  if (def.minRating !== undefined) params.set("vote_average.gte", String(def.minRating));
  if (def.minVoteCount !== undefined) params.set("vote_count.gte", String(def.minVoteCount));
  params.set("sort_by", def.sortBy);
  params.set("page", String(page));

  return `https://api.themoviedb.org/3/discover/${tmdbType}?${params.toString()}${ratingParam}${languageParam}`;
}

function buildTmdbCatalogUrl({
  def,
  type,
  tmdbType,
  page,
  sortBy,
  ratingParam,
  languageParam = '',
  TMDB_KEY,
  includeAdult = false
}) {
  if (def.handler === "tmdb_discover") {
    return buildTmdbDiscoverUrl({
      def,
      type,
      tmdbType,
      page,
      ratingParam,
      languageParam,
      TMDB_KEY,
      includeAdult
    });
  }

  let url = null;

  switch (def.handler) {
    case "tmdb_trending":
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&page=${page}${ratingParam}${languageParam}`;
      break;

    case "tmdb_source":
      url = `https://api.themoviedb.org/3/${tmdbType}/${def.source}?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&page=${page}${ratingParam}${languageParam}`;
      break;

    case "tmdb_provider":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_watch_providers=${def.provider}&watch_region=US&sort_by=popularity.desc&page=${page}${ratingParam}${languageParam}`;
      break;

    case "tmdb_genre": {
      let genre = def.genre;

      if (type === "series") {
        if (genre === 28) genre = 10759;
        if ([878, 27, 14].includes(genre)) genre = 10765;
        if (genre === 53) genre = 9648;
      }

      const genreParam = genre !== undefined ? `&with_genres=${genre}` : "";
      const dateFrom = def.yearFrom ? `&${tmdbType === "tv" ? "first_air_date" : "primary_release_date"}.gte=${def.yearFrom}-01-01` : "";
      const dateTo = def.yearTo ? `&${tmdbType === "tv" ? "first_air_date" : "primary_release_date"}.lte=${def.yearTo}-12-31` : "";

      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}${genreParam}&sort_by=popularity.desc&page=${page}${ratingParam}${languageParam}${dateFrom}${dateTo}`;
      break;
    }

    case "tmdb_keyword":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_keywords=${def.keyword}&sort_by=popularity.desc&page=${page}${ratingParam}${languageParam}`;
      if (def.lang) url += `&with_original_language=${def.lang}`;
      break;

    case "tmdb_company":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_companies=${encodeURIComponent(def.company)}&sort_by=${sortBy}&page=${page}${ratingParam}${languageParam}${def.excludeAnimation ? "&without_genres=16" : ""}`;
      break;

    case "tmdb_network":
      url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_networks=${def.networkId}&sort_by=${sortBy}&page=${page}${ratingParam}${languageParam}`;
      break;

    case "tmdb_actor":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_cast=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}${languageParam}`;
      break;

    case "tmdb_director":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&include_adult=${includeAdult ? "true" : "false"}&with_crew=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}${languageParam}`;
      break;
  }

  return url;
}

module.exports = {
  buildTmdbCatalogUrl,
  buildTmdbDiscoverUrl,
  resolveDiscoverDate
};
