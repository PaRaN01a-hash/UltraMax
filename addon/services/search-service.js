const { fetchCached } = require("./api-helpers");
const {
  semanticSearch
} = require("./semantic-search-service");
const {
  parseSearchIntent
} = require("./search-intent-service");
const {
  buildUltraSearchPlan,
  mergeHybridSearchResults
} = require("./ultra-search-planner-service");

async function handleSearch(params) {
  const {
    catalogId,
    type,
    extra,
    mdbKey,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    traktUser,
    excludeUnreleased,
    maxRating,
    includeAdult,
    customCatalogs,
    googleAiKey,
    fanartKey,
    omdbKey,
    digitalReleaseOnly = false,
    TMDB_KEY,
    resultsToMetas,
    handleCatalog,
    deps
  } = params;

  const q = String(extra.search).replace(/\.json$/, "").trim();
  const tmdbType = type === "series" ? "tv" : "movie";

console.log("FORCED SEARCH NO CACHE:", catalogId, type, q);

const genreCatalogs = {
  action: "action_movies",
  comedy: "comedy_movies",
  horror: "horror_movies",
  thriller: "thriller_movies",
  crime: "crime_movies",
  scifi: "scifi_movies",
  documentary: "documentary_movies",
  animation: "animation_movies",
  fantasy: "fantasy_movies",
  drama: "drama_movies",
  mystery: "mystery_movies",
  zombie: "theme_zombie",
  superhero: "theme_superhero"
};

const genreKey = q.toLowerCase().trim();

// Semantic routing is now driven by the shared intent parser.
//
// Exact titles, actor names and simple one-word genres continue through
// the existing Ultra MAX search paths. Rich descriptive constraints,
// concepts, origin, date and quality hints use semantic discovery.
const parsedSemanticIntent = parseSearchIntent(q);

const semanticWordCount =
  q.split(/\s+/).filter(Boolean).length;

const hasSemanticIntent =
  parsedSemanticIntent.requiredGenres.length > 0 ||
  parsedSemanticIntent.country !== null ||
  parsedSemanticIntent.yearMin !== null ||
  parsedSemanticIntent.femaleLead === true ||
  parsedSemanticIntent.minRating !== null ||
  parsedSemanticIntent.quality !== null ||
  parsedSemanticIntent.concepts.length > 0;

const hasExplicitTimeConstraint =
  parsedSemanticIntent.yearMin !== null ||
  parsedSemanticIntent.yearMax !== null;

const ultraSearchPlan = buildUltraSearchPlan(
  q,
  type,
  parsedSemanticIntent
);

const shouldUseSemanticSearch =
  ultraSearchPlan.semanticEligible;

if (shouldUseSemanticSearch) {
  console.log("ULTRA SEARCH HYBRID INTENT:", q);

  try {
    /*
     * Phase 4: semantic discovery no longer owns the whole request.
     * Run the broad TMDB title search beside the quality-pool semantic
     * search. A genuinely exact title can therefore be rescued even when it
     * is absent from the 10k semantic corpus, while descriptive searches keep
     * their semantic ordering.
     */
    const [semanticOutcome, exactOutcome] = await Promise.allSettled([
      semanticSearch(q, type),
      fetch(
        `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(ultraSearchPlan.exactQuery)}&page=1&include_adult=false&language=${language}`,
        { signal: AbortSignal.timeout(3000) }
      ).then(async response => {
        if (!response.ok) throw new Error(`TMDB exact rescue HTTP ${response.status}`);
        const body = await response.json();
        return Array.isArray(body?.results) ? body.results : [];
      })
    ]);

    const semanticHits =
      semanticOutcome.status === "fulfilled" &&
      Array.isArray(semanticOutcome.value)
        ? semanticOutcome.value
        : [];

    const exactResults =
      exactOutcome.status === "fulfilled" &&
      Array.isArray(exactOutcome.value)
        ? exactOutcome.value
        : [];

    const hydratedSemanticResults = await Promise.all(
      semanticHits.map(async hit => {
        try {
          const tmdb = await fetchCached(
            `https://api.themoviedb.org/3/${tmdbType}/${hit.tmdbId}?api_key=${TMDB_KEY}&language=${language}`
          );

          if (!tmdb?.id || !tmdb?.poster_path) {
            console.warn(
              "ULTRA SEARCH SEMANTIC HYDRATE SKIP:",
              hit.tmdbId,
              hit.title
            );
            return null;
          }

          return {
            ...tmdb,
            _ultraSemanticHit: true,
            _ultraSemanticScore: hit._ultraSemanticScore,
            _ultraReasons: hit._ultraReasons
          };
        } catch (error) {
          console.warn(
            "ULTRA SEARCH SEMANTIC HYDRATE FAILED:",
            hit.tmdbId,
            error.message
          );
          return null;
        }
      })
    );

    const semanticResults =
      hydratedSemanticResults.filter(Boolean);

    const mergedResults = mergeHybridSearchResults({
      semantic: semanticResults,
      exact: exactResults,
      query: q,
      limit: 20
    });

    console.log(
      "ULTRA SEARCH HYBRID RESULTS:",
      q,
      `semantic=${semanticResults.length}`,
      `exact=${exactResults.length}`,
      `merged=${mergedResults.length}`,
      `top=${mergedResults[0]?.title || mergedResults[0]?.name || "?"}`
    );

    if (mergedResults.length) {
      return {
        metas: await resultsToMetas(
          mergedResults,
          type,
          false,
          language,
          rpdbKey,
          tpKey,
          excludeUnreleased,
          fanartKey,
          omdbKey,
          null,
          digitalReleaseOnly
        )
      };
    }
  } catch (error) {
    console.warn(
      "ULTRA SEARCH HYBRID FALLBACK:",
      q,
      error.message
    );
  }
}

/*
 * Actor lookup belongs after semantic routing.
 *
 * Rich natural-language searches should not spend a TMDB request asking
 * whether the whole phrase is a person's name. Exact actor names such as
 * "Brad Pitt" still reach this path because they do not produce semantic
 * search intent.
 */
// ACTOR SEARCH

if (q.includes(" ")) {
  try {
const personData = await fetchCached(
  `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}`
);
    const person = personData?.results?.[0];
console.log(
  "PERSON SEARCH:",
  q,
  person?.name,
  person?.known_for_department,
  person?.popularity
);
    const normalizePersonName = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const personNameMatchesQuery =
      person &&
      normalizePersonName(person.name) === normalizePersonName(q);

    if (
      person &&
      person.known_for_department === "Acting" &&
      personNameMatchesQuery
    ) {
      console.log("ACTOR SEARCH:", person.name, person.id, "type:", type);

      // discover/tv silently ignores with_people (TMDB doesn't support that
      // filter there), so use the person credits endpoints instead - they
      // work correctly for both movie and tv credit lists.
      const creditsField = type === "series" ? "tv_credits" : "movie_credits";
      const creditsData = await fetchCached(
        `https://api.themoviedb.org/3/person/${person.id}/${creditsField}?api_key=${TMDB_KEY}`
      );
      const seenIds = new Set();

      const actorCreditScore = credit => {
        const order = Number.isFinite(Number(credit.order))
          ? Number(credit.order)
          : 99;

        const popularity =
          Math.max(0, Number(credit.popularity || 0));

        const voteCount =
          Math.max(0, Number(credit.vote_count || 0));

        const voteAverage =
          Math.max(0, Number(credit.vote_average || 0));

        const character =
          String(credit.character || "")
            .toLowerCase();

        const releaseDate =
          String(credit.release_date || "");

        const releaseYear =
          Number(releaseDate.slice(0, 4)) || 0;

        const currentYear =
          new Date().getUTCFullYear();

        /*
         * Billing order is the strongest indication that this is
         * actually one of the actor's important films.
         *
         * TMDB popularity remains useful, but must not allow a current
         * archive-footage documentary to outrank major starring roles.
         */
        let score =
          Math.max(0, 40 - Math.min(order, 40)) * 12;

        /*
         * Large vote totals are a useful long-term signal of how
         * established a movie is, while log scaling prevents enormous
         * blockbusters from completely dominating the list.
         */
        score +=
          Math.log10(voteCount + 1) * 65;

        score +=
          voteAverage * 8;

        score +=
          Math.min(popularity, 50) * 2;

        /*
         * Penalise incidental appearances which commonly pollute actor
         * searches when a new documentary or compilation becomes popular.
         */
        if (
          character.includes("archive footage") ||
          character.includes("uncredited")
        ) {
          score -= 500;
        }

        if (
          character === "self" ||
          character.startsWith("self (") ||
          character.startsWith("himself") ||
          character.startsWith("herself")
        ) {
          score -= 180;
        }

        /*
         * Keep announced future projects discoverable, but don't let
         * unreleased titles outrank an established filmography.
         */
        if (
          releaseYear > currentYear ||
          !releaseDate
        ) {
          score -= 120;
        }

        return score;
      };

      const actorResults = (creditsData?.cast || [])
        .filter(c => {
          if (!c?.id) return false;

          if (seenIds.has(c.id)) return false;

          seenIds.add(c.id);
          return true;
        })
        .sort((a, b) => {
          const scoreDiff =
            actorCreditScore(b) -
            actorCreditScore(a);

          if (scoreDiff !== 0) {
            return scoreDiff;
          }

          return (
            Number(b.popularity || 0) -
            Number(a.popularity || 0)
          );
        });

      if (actorResults.length) {
        return {
          metas: await resultsToMetas(
            actorResults,
            type === "series" ? "series" : "movie",
            false,
            language,
            rpdbKey,
            tpKey,
            excludeUnreleased,
            fanartKey,
            omdbKey,
            null,
            digitalReleaseOnly
          )
        };
      }

      console.log(
        "ACTOR SEARCH EMPTY, FALLING THROUGH TO TITLE SEARCH:",
        person.name,
        person.id,
        "type:",
        type
      );
    }
  } catch (e) {
    console.log("ACTOR SEARCH FAILED:", e.message);
  }
}


if (genreCatalogs[genreKey]) {
  console.log("GENRE SEARCH:", genreKey);

  return await handleCatalog(
    genreCatalogs[genreKey],
    type,
    {},
    mdbKey,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    traktUser,
    excludeUnreleased,
    maxRating,
    includeAdult,
    customCatalogs,
    googleAiKey,
    fanartKey,
    omdbKey,
    deps
  );
}

if (q) {
const cinemetaType = type === "series" ? "series" : "movie";
const [tmdbResp, cinemetaResp] = await Promise.allSettled([
  fetch(
    `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1&language=${language}`,
    { signal: AbortSignal.timeout(3000) }
  ),
  fetch(
    `https://v3-cinemeta.strem.io/catalog/${cinemetaType}/top/search=${encodeURIComponent(q)}.json`,
    { signal: AbortSignal.timeout(1500) }
  )
]);
const data = tmdbResp.status === 'fulfilled' ? await tmdbResp.value.json() : {};
let results = data.results || [];
if (cinemetaResp.status === 'fulfilled') {
  try {
    const cinemetaData = await cinemetaResp.value.json();
    const cinemetaMetas = cinemetaData.metas || [];
    for (const meta of cinemetaMetas) {
      const alreadyFound = results.some(r => (r.title || r.name || '').toLowerCase() === (meta.name || '').toLowerCase());
      if (!alreadyFound) {
        results.push({ id: meta.id, title: meta.name, name: meta.name, _imdb_id: meta.id, popularity: 1, vote_count: 1, overview: meta.description || 'x', release_date: meta.releaseInfo || '2000-01-01', first_air_date: meta.releaseInfo || '2000-01-01' });
      }
    }
  } catch(e) {}
}

        results.sort((a, b) => {
          const at = String(a.title || a.name || "").toLowerCase();
          const bt = String(b.title || b.name || "").toLowerCase();
          const ql = q.toLowerCase();

          let ascore = Number(a.popularity || 0);
          let bscore = Number(b.popularity || 0);

          if (at === ql) ascore += 100000;
          if (bt === ql) bscore += 100000;

          if (at.startsWith(ql)) ascore += 50000;
          if (bt.startsWith(ql)) bscore += 50000;

          if (at.includes(ql)) ascore += 10000;
          if (bt.includes(ql)) bscore += 10000;

          return bscore - ascore;
        });

        console.log(
          results.slice(0,5).map(x => x.title || x.name)
        );

        console.log(
          "FORCED SEARCH RESULTS:",
          catalogId,
          "count=",
          results.length
        );

        return {
          metas: await resultsToMetas(
            results,
            type,
            false,
            language,
            rpdbKey,
            tpKey,
            excludeUnreleased,
            fanartKey,
            omdbKey,
            null,
            digitalReleaseOnly
          )
        };
  }
}

module.exports = {
  handleSearch
};
