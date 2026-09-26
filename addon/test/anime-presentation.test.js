"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseKitsuId,
  kitsuResourceToCatalogMeta,
  searchKitsuCatalogMetas,
  resolveAnimeItemsToKitsuMetas,
  buildEpisodeVideos
} = require("../services/kitsu-id-service");
const { anilistMediaToMetas } = require("../services/anilist-service");
const { filterWatched } = require("../services/watched-filter");
const {
  filterAnimeRecommendationsByHistory
} = require("../services/ai-service");
const {
  normalizeAnimePresentationMode
} = require("../services/config-route-service");
const {
  handleMainManifest
} = require("../services/manifest-route-service");

function kitsuResource(id, title, startDate, subtype = "TV") {
  return {
    id: String(id),
    attributes: {
      canonicalTitle: title,
      titles: { en: title },
      startDate,
      subtype,
      posterImage: { large: `https://images.test/${id}.jpg` }
    }
  };
}

function kitsuFetch(resources, failures = new Set()) {
  return async url => {
    const query = new URL(url).searchParams.get("filter[text]") || "";
    if (failures.has(query)) throw new Error("synthetic mapping failure");
    const matches = resources.filter(resource =>
      resource.attributes.canonicalTitle.toLowerCase().includes(query.toLowerCase()) ||
      query.toLowerCase().includes(resource.attributes.canonicalTitle.toLowerCase())
    );
    return {
      ok: true,
      json: async () => ({ data: matches })
    };
  };
}

const fixtures = [
  kitsuResource(101, "My Dress-Up Darling", "2022-01-09"),
  kitsuResource(102, "My Dress-Up Darling Season 2", "2025-07-06"),
  kitsuResource(201, "Clannad", "2007-10-05"),
  kitsuResource(202, "Clannad: After Story", "2008-10-03"),
  kitsuResource(301, "Synthetic Hero", "2020-01-01"),
  kitsuResource(302, "Synthetic Hero Part 2", "2020-10-01"),
  kitsuResource(401, "Synthetic Hero Special", "2021-01-01", "special"),
  kitsuResource(501, "No IMDb Anime", "2024-04-01")
];

test("1. one-season anime is one authoritative Kitsu entry", () => {
  const meta = kitsuResourceToCatalogMeta(fixtures[0]);
  assert.equal(meta.id, "kitsu:101");
  assert.equal(meta.type, "series");
});

test("2. ordinary seasons remain distinct authoritative entries", async () => {
  const metas = await searchKitsuCatalogMetas("My Dress-Up Darling", {
    fetchImpl: kitsuFetch(fixtures)
  });
  assert.deepEqual(metas.map(meta => meta.id), ["kitsu:101", "kitsu:102"]);
});

test("3. sequel with a different title is not attached to the original", async () => {
  const metas = await searchKitsuCatalogMetas("Clannad", {
    fetchImpl: kitsuFetch(fixtures)
  });
  assert.deepEqual(metas.map(meta => meta.id), ["kitsu:201", "kitsu:202"]);
});

test("4. split cour / Part 2 remains distinct", async () => {
  const metas = await searchKitsuCatalogMetas("Synthetic Hero", {
    fetchImpl: kitsuFetch(fixtures)
  });
  assert.ok(metas.some(meta => meta.name.endsWith("Part 2")));
});

test("5. specials are retained and clearly typed", () => {
  const meta = kitsuResourceToCatalogMeta(fixtures[6]);
  assert.deepEqual(meta.genres, ["Anime", "Special"]);
});

test("6. anime without IMDb mapping still has a usable Kitsu id", () => {
  assert.equal(kitsuResourceToCatalogMeta(fixtures[7]).id, "kitsu:501");
});

test("7. Kitsu, AniList and MAL ids are preserved as non-secret behavior hints", () => {
  const meta = kitsuResourceToCatalogMeta(fixtures[0], {
    anilist: 123,
    mal: 456
  });
  assert.deepEqual(meta.behaviorHints.animeIds, {
    kitsu: "101",
    anilist: "123",
    mal: "456"
  });
});

test("8. unified mode keeps season-qualified episode ids", () => {
  const videos = buildEpisodeVideos("kitsu:101", [{
    id: "1",
    attributes: { number: 1, canonicalTitle: "Episode One" }
  }], "unified");
  assert.equal(videos[0].id, "kitsu:101:1:1");
});

test("9. AniSync-compatible mode uses absolute episode ids and season 1", () => {
  const videos = buildEpisodeVideos("kitsu:101", [{
    id: "12",
    attributes: { number: 12, canonicalTitle: "Finale" }
  }], "anisync");
  assert.equal(videos[0].id, "kitsu:101:12");
  assert.equal(videos[0].season, 1);
  assert.equal(videos[0].behaviorHints.absoluteEpisode, 12);
  assert.deepEqual(parseKitsuId(videos[0].id), {
    animeId: "101",
    season: null,
    episode: 12,
    absoluteEpisode: 12
  });
});

test("10. search consistency uses distinct Kitsu presentation", async () => {
  const metas = await searchKitsuCatalogMetas("Clannad", {
    fetchImpl: kitsuFetch(fixtures)
  });
  assert.equal(new Set(metas.map(meta => meta.id)).size, metas.length);
});

test("11. personalised AniList rows use the same Kitsu presentation", async () => {
  const metas = await anilistMediaToMetas([{
    id: 21234,
    idMal: 2167,
    format: "TV",
    title: { english: "Clannad" },
    seasonYear: 2007
  }], { fetchImpl: kitsuFetch(fixtures) }, "anisync");
  assert.equal(metas[0].id, "kitsu:201");
  assert.equal(metas[0].behaviorHints.animeIds.anilist, "21234");
});

test("12. Anime For You watched exclusion removes watched ids", () => {
  const result = filterWatched({
    metas: [{ id: "kitsu:101" }, { id: "kitsu:201" }]
  }, new Set(["kitsu:101"]));
  assert.deepEqual(result.metas.map(meta => meta.id), ["kitsu:201"]);
  const titleFiltered = filterAnimeRecommendationsByHistory(
    [{ title: "Clannad" }, { title: "My Dress-Up Darling" }],
    [{ title: "Clannad" }]
  );
  assert.deepEqual(titleFiltered.items, [{ title: "My Dress-Up Darling" }]);
  assert.equal(titleFiltered.excludedWatched, 1);
});

test("13. multiple recommendation mappings produce multiple titles", async () => {
  const result = await resolveAnimeItemsToKitsuMetas([
    { title: "Clannad", year: 2007 },
    { title: "My Dress-Up Darling", year: 2022 }
  ], { fetchImpl: kitsuFetch(fixtures) });
  assert.equal(result.metas.length, 2);
});

test("14. one failed recommendation mapping does not collapse the row", async () => {
  const result = await resolveAnimeItemsToKitsuMetas([
    { title: "Broken mapping" },
    { title: "Clannad", year: 2007 }
  ], { fetchImpl: kitsuFetch(fixtures, new Set(["Broken mapping"])) });
  assert.equal(result.metas.length, 1);
  assert.equal(result.diagnostics.mappingFailures, 1);
});

test("15. existing configs missing the field load as unified", () => {
  assert.equal(normalizeAnimePresentationMode(undefined), "unified");
});

test("16. new config saves and loads both supported modes", () => {
  assert.equal(normalizeAnimePresentationMode("unified"), "unified");
  assert.equal(normalizeAnimePresentationMode("anisync"), "anisync");
});

test("17. non-anime metadata identifiers remain untouched", () => {
  assert.equal(parseKitsuId("tt0903747"), null);
  assert.equal(parseKitsuId("tmdb:1396"), null);
});

test("18. configured catalogue order is preserved in the generated manifest", async () => {
  const config = {
    catalogs: ["netflix_series", "popular_series", "trending_series"],
    catalogOrder: ["trending_series", "popular_series", "netflix_series"]
  };
  let manifest;
  await handleMainManifest({
    params: { token: "ORDER" },
    query: {}
  }, {
    status() { return this; },
    json(value) { manifest = value; return value; }
  }, {
    loadConfigs: () => ({ ORDER: config }),
    saveConfigs: () => {},
    buildCatalogsFromIds: ids => ids.map(id => ({
      id,
      type: "series",
      name: id
    })),
    QUICK_PICK_CATALOGS: [],
    CATALOG_DEFS: {}
  });
  assert.deepEqual(
    manifest.catalogs
      .filter(c => config.catalogOrder.includes(c.id))
      .map(c => c.id),
    config.catalogOrder
  );
});
