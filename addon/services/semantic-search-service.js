const MEILI_URL =
  process.env.MEILI_URL ||
  "http://ultramax-meilisearch-dev:7700";

const MEILI_MOVIE_INDEX =
  process.env.MEILI_MOVIE_INDEX ||
  "movies_10000_semantic_v2_dev";

const MEILI_SERIES_INDEX =
  process.env.MEILI_SERIES_INDEX ||
  "series_5000_semantic_v1_dev";

function semanticIndexForType(type) {
  return type === "series"
    ? MEILI_SERIES_INDEX
    : MEILI_MOVIE_INDEX;
}

const SEMANTIC_TIMEOUT_MS = 1500;

const {
  normalizeSearchIntentValue: normalize,
  parseSearchIntent: parseIntent
} = require("./search-intent-service");

function searchableText(hit) {
  return normalize([
    hit.title,
    hit.originalTitle,
    hit.overview,
    ...(hit.genres || []),
    ...(hit.keywords || []),
    ...(hit.productionCountries || []),
    ...(hit.productionCompanies || []),
    ...(hit.cast || []),
    ...(hit.directors || [])
  ].join(" "));
}

function evaluate(hit, intent) {
  const genres = new Set(hit.genres || []);
  const countries = new Set(
    hit.productionCountries || []
  );

  let misses = 0;
  let bonus = 0;
  let conceptMatches = 0;
  let conceptEvidence = 0;

  const reasons = [];

  for (const genre of intent.requiredGenres) {
    if (genres.has(genre)) {
      bonus += 20;
      reasons.push(`genre:${genre}`);
    } else {
      misses++;
    }
  }

  if (intent.country) {
    if (countries.has(intent.country)) {
      bonus += 25;
      reasons.push(`country:${intent.country}`);
    } else {
      misses++;
    }
  }

  if (
    intent.yearMin != null &&
    intent.yearMax != null
  ) {
    const year = Number(hit.year);

    if (
      Number.isFinite(year) &&
      year >= intent.yearMin &&
      year <= intent.yearMax
    ) {
      bonus += 25;
      reasons.push(
        `year:${intent.yearMin}-${intent.yearMax}`
      );
    } else {
      misses++;
    }
  }

  if (intent.femaleLead) {
    if (hit.femaleLed === true) {
      bonus += 30;
      reasons.push("femaleLead");
    } else {
      misses++;
    }
  }

  const haystack = searchableText(hit);

  const conceptGroups =
    Array.isArray(
      intent.semanticConceptGroups
    ) &&
    intent.semanticConceptGroups.length
      ? intent.semanticConceptGroups
      : intent.concepts.map(
          aliases => ({
            semanticConcept: null,
            aliases
          })
        );

  for (const group of conceptGroups) {
    const aliases =
      Array.isArray(group.aliases)
        ? group.aliases
        : [];

    const semanticConcept =
      group.semanticConcept || null;

    /*
     * Prefer curated corpus concept IDs when available.
     *
     * The new semantic corpus contains stable tags such as:
     *
     *   psychological
     *   revenge
     *   surreal
     *   space-exploration
     *
     * These are stronger evidence than broad text matching.
     *
     * Text aliases remain as a fallback so the current index
     * and any older corpus continue to behave correctly.
     */
    const documentConcepts =
      Array.isArray(hit.semanticConcepts)
        ? hit.semanticConcepts
        : [];

    const semanticTagMatched =
      semanticConcept &&
      documentConcepts.includes(
        semanticConcept
      );

    const matchedAliases =
      aliases.filter(alias =>
        haystack.includes(
          normalize(alias)
        )
      );

    if (
      semanticTagMatched ||
      matchedAliases.length
    ) {
      conceptMatches++;

      /*
       * Curated concept evidence receives a stronger base
       * signal than incidental text matches.
       */
      if (semanticTagMatched) {
        const storedEvidence =
          Number(
            hit.semanticConceptEvidence?.[
              semanticConcept
            ] || 0
          );

        conceptEvidence +=
          Math.max(
            storedEvidence,
            3
          );

        bonus += 25;

        reasons.push(
          `semanticConcept:${semanticConcept}`
        );
      } else {
        conceptEvidence +=
          matchedAliases.length;

        bonus += 15;

        reasons.push(
          `concept:${aliases[0]}`
        );
      }
    }
  }

  if (
    conceptGroups.length > 1 &&
    conceptMatches === conceptGroups.length
  ) {
    bonus += 15;
    reasons.push("allConcepts");
  }

  return {
    ...hit,
    _ultraConstraintMisses: misses,
    _ultraConceptMatches: conceptMatches,
    _ultraConceptEvidence: conceptEvidence,
    _ultraSemanticScore:
      Number(hit._rankingScore || 0),
    _ultraHasSemanticIntent:
      conceptGroups.length > 0,
    _ultraQualityIntent: intent.quality || null,
    _ultraBonus: bonus,
    _ultraReasons: reasons
  };
}


function escapeMeiliFilterValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

function buildMeiliIntentFilter(intent) {
  const filters = [];

  for (const genre of intent.requiredGenres || []) {
    filters.push(
      `genres = "${escapeMeiliFilterValue(genre)}"`
    );
  }

  if (intent.country) {
    filters.push(
      `productionCountries = "${escapeMeiliFilterValue(
        intent.country
      )}"`
    );
  }

  if (intent.yearMin != null) {
    filters.push(
      `year >= ${Number(intent.yearMin)}`
    );
  }

  if (intent.yearMax != null) {
    filters.push(
      `year <= ${Number(intent.yearMax)}`
    );
  }

  if (intent.femaleLead === true) {
    filters.push(
      "femaleLed = true"
    );
  }

  if (intent.minRating != null) {
    filters.push(
      `voteAverage >= ${Number(intent.minRating)}`
    );
  }

  return filters.length
    ? filters.join(" AND ")
    : null;
}

function satisfiesHardConstraints(hit, intent) {
  const genres = new Set(hit.genres || []);
  const countries = new Set(
    hit.productionCountries || []
  );

  if (
    intent.requiredGenres.length &&
    !intent.requiredGenres.every(
      genre => genres.has(genre)
    )
  ) {
    return false;
  }

  if (
    intent.country &&
    !countries.has(intent.country)
  ) {
    return false;
  }

  if (
    intent.yearMin != null &&
    intent.yearMax != null
  ) {
    const year = Number(hit.year);

    if (
      !Number.isFinite(year) ||
      year < intent.yearMin ||
      year > intent.yearMax
    ) {
      return false;
    }
  }

  if (
    intent.femaleLead === true &&
    hit.femaleLed !== true
  ) {
    return false;
  }

  if (
    intent.minRating != null &&
    Number(hit.voteAverage || 0) <
      intent.minRating
  ) {
    return false;
  }

  return true;
}

function compare(a, b) {
  /*
   * Hard constraints remain absolute.
   *
   * A title that misses an explicit genre, country, year,
   * rating or lead constraint must never outrank one that
   * satisfies it.
   */
  if (
    a._ultraConstraintMisses !==
    b._ultraConstraintMisses
  ) {
    return (
      a._ultraConstraintMisses -
      b._ultraConstraintMisses
    );
  }

  /*
   * Matching more requested concepts remains the strongest
   * relevance signal after hard constraints.
   */
  if (
    a._ultraConceptMatches !==
    b._ultraConceptMatches
  ) {
    return (
      b._ultraConceptMatches -
      a._ultraConceptMatches
    );
  }

  /*
   * Within equally-valid candidates, blend semantic relevance,
   * concept evidence and audience confidence.
   *
   * Previously concept evidence was an absolute sorting tier.
   * That allowed an obscure title with evidence=6 to always
   * beat a much stronger title with evidence=4.
   *
   * Evidence now helps the score rather than owning the score.
   */
  const semanticA =
    Number(a._ultraSemanticScore || 0);

  const semanticB =
    Number(b._ultraSemanticScore || 0);

  const evidenceA =
    Math.min(
      Number(a._ultraConceptEvidence || 0),
      12
    );

  const evidenceB =
    Math.min(
      Number(b._ultraConceptEvidence || 0),
      12
    );

  const ratingA =
    Number(a.voteAverage || 0);

  const ratingB =
    Number(b.voteAverage || 0);

  const votesA =
    Number(a.voteCount || 0);

  const votesB =
    Number(b.voteCount || 0);

  const popularityA =
    Number(a.popularity || 0);

  const popularityB =
    Number(b.popularity || 0);

  /*
   * log10 prevents blockbuster vote counts/popularity from
   * drowning semantic relevance while still providing useful
   * confidence that a result is established.
   */
  const confidenceA =
    Math.log10(votesA + 1);

  const confidenceB =
    Math.log10(votesB + 1);

  const popularitySignalA =
    Math.log10(popularityA + 1);

  const popularitySignalB =
    Math.log10(popularityB + 1);

  const qualityIntent =
    a._ultraQualityIntent ||
    b._ultraQualityIntent ||
    null;

  let ratingWeight = 2;
  let confidenceWeight = 3;
  let popularityWeight = 1;

  /*
   * Explicit user preferences should influence ranking without
   * overriding semantic relevance or hard constraints.
   *
   * "high rated" / "best":
   *   favour rating and established audience confidence.
   *
   * "popular":
   *   favour audience size and current popularity.
   *
   * Searches without a quality modifier preserve the existing
   * ranking behaviour exactly.
   */
  if (qualityIntent === "high") {
    ratingWeight = 5;
    confidenceWeight = 5;
    popularityWeight = 1;
  } else if (qualityIntent === "good") {
    ratingWeight = 3.5;
    confidenceWeight = 4;
    popularityWeight = 1;
  } else if (qualityIntent === "popular") {
    ratingWeight = 1.5;
    confidenceWeight = 5;
    popularityWeight = 5;
  }

  const scoreA =
    semanticA * 100 +
    evidenceA * 1.5 +
    ratingA * ratingWeight +
    confidenceA * confidenceWeight +
    popularitySignalA * popularityWeight;

  const scoreB =
    semanticB * 100 +
    evidenceB * 1.5 +
    ratingB * ratingWeight +
    confidenceB * confidenceWeight +
    popularitySignalB * popularityWeight;

  if (scoreA !== scoreB) {
    return scoreB - scoreA;
  }

  if (
    a._ultraBonus !==
    b._ultraBonus
  ) {
    return (
      b._ultraBonus -
      a._ultraBonus
    );
  }

  if (ratingA !== ratingB) {
    return ratingB - ratingA;
  }

  return votesB - votesA;
}

function looksNaturalLanguage(query) {
  const q = normalize(query);

  if (!q) return false;

  const words = q.split(/\s+/);

  /*
   * Three-word descriptive searches are common:
   *
   *   mind bending films
   *   old war films
   *   funny horror movies
   *
   * Keep one/two-word searches out of the semantic route so
   * title, actor and simple genre searches retain their
   * existing behaviour.
   */
  if (words.length < 3) return false;

  return (
    /\bwith\b/.test(q) ||
    /\babout\b/.test(q) ||
    /\bwhere\b/.test(q) ||
    /\bfrom\b/.test(q) ||
    /\bmovies?\b/.test(q) ||
    /\bfilms?\b/.test(q) ||
    /\bseries\b/.test(q) ||
    /\bleads?\b/.test(q) ||
    /\bpsychological\b/.test(q) ||
    /\bsurreal\b/.test(q) ||
    /\brevenge\b/.test(q) ||
    /\bexploration\b/.test(q)
  );
}

async function semanticSearch(query, type = "movie") {
  if (
    String(process.env.SEMANTIC_SEARCH_ENABLED)
      .toLowerCase() !== "true"
  ) {
    return null;
  }

  /*
   * Search Intent V2 is now the primary semantic eligibility gate.
   *
   * Keep the older natural-language detector as a fallback for descriptive
   * queries that do not contain an explicit structured constraint.
   */
  const intent = parseIntent(query);

  const hasStructuredIntent =
    intent.requiredGenres.length > 0 ||
    intent.preferredGenres.length > 0 ||
    intent.country !== null ||
    intent.yearMin !== null ||
    intent.yearMax !== null ||
    intent.femaleLead === true ||
    intent.minRating !== null ||
    intent.quality !== null ||
    intent.concepts.length > 0;

  if (
    !hasStructuredIntent &&
    !looksNaturalLanguage(query)
  ) {
    return null;
  }

  const key = process.env.MEILI_MASTER_KEY;

  if (!key) {
    console.warn(
      "[semantic-search] disabled: MEILI_MASTER_KEY missing"
    );
    return null;
  }

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    SEMANTIC_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      `${MEILI_URL}/indexes/${semanticIndexForType(type)}/search`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          q: query,
          limit: 60,
          showRankingScore: true,
          ...(buildMeiliIntentFilter(intent)
            ? {
                filter:
                  buildMeiliIntentFilter(intent)
              }
            : {}),
          hybrid: {
            semanticRatio: 0.85,
            embedder: "ultramax_semantic"
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Meilisearch HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const evaluated = (data.hits || [])
      .map(hit => evaluate(hit, intent));

    const constrained = evaluated.filter(
      hit => satisfiesHardConstraints(
        hit,
        intent
      )
    );

    /*
     * Concepts are semantic preferences, but when a query explicitly
     * contains one we prefer candidates matching at least one concept.
     * If that would empty the row completely, fall back to the valid
     * hard-constrained candidate pool.
     */
    const conceptMatched =
      intent.concepts.length > 0
        ? constrained.filter(
            hit =>
              hit._ultraConceptMatches > 0
          )
        : constrained;

    const candidatePool =
      conceptMatched.length
        ? conceptMatched
        : constrained;

    const ranked = candidatePool
      .sort(compare)
      .slice(0, 20);

    if (!ranked.length) {
      return null;
    }

    console.log(
      `[semantic-search] query="${query}" ` +
      `hits=${ranked.length} ` +
      `top="${ranked[0]?.title || "?"}"`
    );

    return ranked;
  } catch (error) {
    console.warn(
      `[semantic-search] fallback query="${query}" ` +
      `error=${error.message}`
    );

    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function semanticMovieSearch(query) {
  return semanticSearch(query, "movie");
}

async function semanticSeriesSearch(query) {
  return semanticSearch(query, "series");
}

module.exports = {
  semanticSearch,
  semanticMovieSearch,
  semanticSeriesSearch,
  semanticIndexForType,
  looksNaturalLanguage,
  parseIntent
};
