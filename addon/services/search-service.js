const { fetchCached } = require("./api-helpers");

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
    customCatalogs,
    googleAiKey,
    fanartKey,
    omdbKey,
    digitalReleaseOnly = false,
    TMDB_KEY,
    resultsToMetas,
    handleCatalog
  } = params;

  const q = String(extra.search).replace(/\.json$/, "").trim();
  const tmdbType = type === "series" ? "tv" : "movie";

console.log("FORCED SEARCH NO CACHE:", catalogId, type, q);

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
    if (
      person &&
      person.known_for_department === "Acting"
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
      const actorResults = (creditsData?.cast || [])
        .filter(c => {
          if (seenIds.has(c.id)) return false;
          seenIds.add(c.id);
          return true;
        })
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

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
  } catch (e) {
    console.log("ACTOR SEARCH FAILED:", e.message);
  }
}


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

if (genreCatalogs[genreKey]) {
  console.log("GENRE SEARCH:", genreKey);

  return await handleCatalog(
    genreCatalogs[genreKey],
    "movie",
    {},
    mdbKey,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    traktUser,
    excludeUnreleased,
    maxRating,
    customCatalogs,
    googleAiKey,
    fanartKey,
    omdbKey
  );
}

if (q) {
const cinemetaType = type === "series" ? "series" : "movie";
const [tmdbResp, cinemetaResp] = await Promise.allSettled([
  fetch(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1&language=${language}`),
  fetch(`https://v3-cinemeta.strem.io/catalog/${cinemetaType}/top/search=${encodeURIComponent(q)}.json`)
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
