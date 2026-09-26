"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function response(body, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return body;
    }
  };
}

test("exact title search falls through when TMDB person search finds a namesake with no credits", async (t) => {
  const apiHelpersPath = require.resolve("../services/api-helpers");
  const searchServicePath = require.resolve("../services/search-service");
  const originalApiHelpers = require(apiHelpersPath);
  const originalFetch = global.fetch;

  require.cache[apiHelpersPath].exports = {
    ...originalApiHelpers,
    fetchCached: async url => {
      const value = String(url);
      if (value.includes("/search/person")) {
        return {
          results: [{
            id: 935433,
            name: "Big Brother",
            known_for_department: "Acting",
            popularity: 0.26
          }]
        };
      }
      if (value.includes("/person/935433/tv_credits")) {
        return { cast: [] };
      }
      throw new Error(`Unexpected fetchCached URL in test: ${value}`);
    }
  };

  delete require.cache[searchServicePath];
  const { handleSearch } = require(searchServicePath);

  global.fetch = async url => {
    const value = String(url);
    if (value.includes("api.themoviedb.org/3/search/tv")) {
      return response({
        results: [{
          id: 237243,
          name: "Big Brother",
          poster_path: "/poster.jpg",
          first_air_date: "2023-10-08",
          vote_count: 10,
          overview: "UK reboot"
        }]
      });
    }
    if (value.includes("v3-cinemeta.strem.io")) {
      return response({ metas: [] });
    }
    throw new Error(`Unexpected fetch URL in test: ${value}`);
  };

  t.after(() => {
    global.fetch = originalFetch;
    require.cache[apiHelpersPath].exports = originalApiHelpers;
    delete require.cache[searchServicePath];
  });

  const result = await handleSearch({
    catalogId: "search_series",
    type: "series",
    extra: { search: "big brother" },
    mdbKey: null,
    filterLang: true,
    language: "en-US",
    rpdbKey: null,
    tpKey: null,
    traktUser: null,
    excludeUnreleased: false,
    maxRating: null,
    includeAdult: false,
    customCatalogs: [],
    googleAiKey: null,
    fanartKey: null,
    omdbKey: null,
    digitalReleaseOnly: false,
    TMDB_KEY: "test-key",
    resultsToMetas: async rows => rows.map(row => ({
      id: `tmdb:${row.id}`,
      type: "series",
      name: row.name
    })),
    handleCatalog: async () => ({ metas: [] }),
    deps: {}
  });

  assert.deepEqual(result.metas, [{
    id: "tmdb:237243",
    type: "series",
    name: "Big Brother"
  }]);
});

test("TMDB results without IMDb ids remain publishable as tmdb ids", async (t) => {
  const apiHelpersPath = require.resolve("../services/api-helpers");
  const metadataServicePath = require.resolve("../services/metadata-service");
  const originalApiHelpers = require(apiHelpersPath);

  require.cache[apiHelpersPath].exports = {
    ...originalApiHelpers,
    fetchCached: async url => {
      const value = String(url);
      if (value.includes("/tv/237243/external_ids")) {
        return { imdb_id: null, tvdb_id: 440642 };
      }
      throw new Error(`Unexpected fetchCached URL in test: ${value}`);
    }
  };

  delete require.cache[metadataServicePath];
  const { resultsToMetas } = require(metadataServicePath);

  t.after(() => {
    require.cache[apiHelpersPath].exports = originalApiHelpers;
    delete require.cache[metadataServicePath];
  });

  const metas = await resultsToMetas([{
    id: 237243,
    name: "Big Brother",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    first_air_date: "2023-10-08",
    vote_count: 10,
    overview: "UK reboot",
    original_language: "en"
  }], "series", false, "en-US", null, null, false, null, null, null, false, false, null, {}, "test-key");

  assert.equal(metas.length, 1);
  assert.equal(metas[0].id, "tmdb:237243");
  assert.equal(metas[0].name, "Big Brother");
  assert.equal(metas[0].poster, "https://image.tmdb.org/t/p/w500/poster.jpg");
});

test("base metadata handler hydrates direct tmdb ids without an IMDb lookup", async () => {
  const { handleMetaRequest } = require("../services/meta-handler-service");
  const calls = [];

  const result = await handleMetaRequest(
    { type: "series", id: "tmdb:237243" },
    {
      TMDB_KEY: "test-key",
      fetchCached: async url => {
        const value = String(url);
        calls.push(value);
        assert.equal(value.includes("/find/"), false);
        if (value.includes("/tv/237243?")) {
          return {
            id: 237243,
            name: "Big Brother",
            overview: "UK reboot",
            poster_path: "/poster.jpg",
            backdrop_path: "/backdrop.jpg",
            first_air_date: "2023-10-08",
            vote_average: 7.2,
            genres: [],
            seasons: [],
            credits: { cast: [] }
          };
        }
        throw new Error(`Unexpected metadata URL in test: ${value}`);
      }
    }
  );

  assert.equal(result.meta.id, "tmdb:237243");
  assert.equal(result.meta.name, "Big Brother");
  assert.equal(result.meta.releaseInfo, "2023");
  assert.equal(calls.some(url => url.includes("/find/")), false);
});
