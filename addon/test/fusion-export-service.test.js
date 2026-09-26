"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  mapFusionImageAspect,
  selectFusionImage,
  buildFusionManifestUrl,
  resolveFusionDataSources,
  buildFusionWidgetsPayload
} = require("../services/fusion-export-service");
const { resolveConfigForProfile } = require("../utils/profiles");

const MANIFEST_URL = "https://ultramax.vip/c/TESTTOKEN/manifest.json";

function collection(overrides) {
  return Object.assign({
    id: "collection-a",
    title: "Collection A",
    folders: []
  }, overrides);
}

function folder(overrides) {
  return Object.assign({
    id: "folder-a",
    title: "Folder A",
    tileShape: "LANDSCAPE",
    catalogSources: []
  }, overrides);
}

// ---- 1. One collection with one movie source ----
test("one collection with one movie source", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        catalogSources: [{ addonId: "ignored", catalogId: "netflix_movies", type: "movie" }]
      })]
    })]
  };
  const { payload, summary } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  assert.equal(summary.widgets, 1);
  assert.equal(summary.tiles, 1);
  assert.equal(summary.dataSources, 1);
  const ds = payload.widgets[0].dataSource.payload.items[0].dataSources[0];
  assert.equal(ds.payload.catalogId, "movie::netflix_movies");
  assert.equal(ds.payload.type, "movie");
});

// ---- 2. One collection with one series source ----
test("one collection with one series source", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        catalogSources: [{ addonId: "ignored", catalogId: "netflix_series", type: "series" }]
      })]
    })]
  };
  const { payload, summary } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  assert.equal(summary.dataSources, 1);
  const ds = payload.widgets[0].dataSource.payload.items[0].dataSources[0];
  assert.equal(ds.payload.catalogId, "series::netflix_series");
  assert.equal(ds.payload.type, "series");
});

// ---- 3. One tile with multiple sources ----
test("one tile with multiple sources", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        catalogSources: [
          { catalogId: "netflix_movies", type: "movie" },
          { catalogId: "trending_movies", type: "movie" },
          { catalogId: "top_movies", type: "movie" }
        ]
      })]
    })]
  };
  const { summary, payload } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  assert.equal(summary.dataSources, 3);
  assert.equal(payload.widgets[0].dataSource.payload.items[0].dataSources.length, 3);
});

// ---- 4. Mixed movie and series sources in one tile ----
test("mixed movie and series sources in one tile", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        catalogSources: [
          { catalogId: "netflix_movies", type: "movie" },
          { catalogId: "netflix_series", type: "series" }
        ]
      })]
    })]
  };
  const { payload } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  const types = payload.widgets[0].dataSource.payload.items[0].dataSources.map(d => d.payload.type).sort();
  assert.deepEqual(types, ["movie", "series"]);
});

// ---- 5. Movie-only merged catalogue ----
test("movie-only merged catalogue exports its live id and type", () => {
  const config = {
    mergedCatalogs: [{
      id: "merged_deadbeef",
      name: "My Movie Mix",
      type: "movie",
      blend: "interleave",
      sources: [{ catalogId: "netflix_movies", type: "movie" }, { catalogId: "top_movies", type: "movie" }]
    }],
    collections: [collection({
      folders: [folder({ catalogSources: [{ catalogId: "merged_deadbeef", type: "movie" }] })]
    })]
  };
  const { payload, summary } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  assert.equal(summary.dataSources, 1);
  const ds = payload.widgets[0].dataSource.payload.items[0].dataSources[0];
  assert.equal(ds.payload.catalogId, "movie::merged_deadbeef");
  assert.equal(ds.payload.type, "movie");
});

// ---- 6. Series-only merged catalogue ----
test("series-only merged catalogue exports its live id and type", () => {
  const config = {
    mergedCatalogs: [{
      id: "merged_c0ffee00",
      name: "My Series Mix",
      type: "series",
      blend: "sequential",
      sources: [{ catalogId: "netflix_series", type: "series" }]
    }],
    collections: [collection({
      folders: [folder({ catalogSources: [{ catalogId: "merged_c0ffee00", type: "series" }] })]
    })]
  };
  const { payload } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  const ds = payload.widgets[0].dataSource.payload.items[0].dataSources[0];
  assert.equal(ds.payload.catalogId, "series::merged_c0ffee00");
  assert.equal(ds.payload.type, "series");
});

// ---- 7. Mixed merged catalogue expands to _movies and _series ----
test("mixed merged catalogue expands into two derived sources", () => {
  const config = {
    mergedCatalogs: [{
      id: "merged_a1b2c3d4",
      name: "Anime Mix",
      type: "mixed",
      blend: "interleave",
      sources: [
        { catalogId: "anime_movies", type: "movie" },
        { catalogId: "anime_series", type: "series" }
      ]
    }],
    collections: [collection({
      folders: [folder({ catalogSources: [{ catalogId: "merged_a1b2c3d4", type: "mixed" }] })]
    })]
  };
  const { payload, summary } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  assert.equal(summary.dataSources, 2);
  const ids = payload.widgets[0].dataSource.payload.items[0].dataSources.map(d => d.payload.catalogId).sort();
  assert.deepEqual(ids, ["movie::merged_a1b2c3d4_movies", "series::merged_a1b2c3d4_series"]);
  // Ultra MAX remains responsible for blending — the merged definition
  // itself (with its blend mode) must never appear in the export.
  assert.equal(JSON.stringify(payload).includes("interleave"), false);
  assert.equal(JSON.stringify(payload).includes("blend"), false);
});

// ---- 8. Duplicate source removal ----
test("duplicate sources within one tile are removed", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        catalogSources: [
          { catalogId: "netflix_movies", type: "movie" },
          { catalogId: "netflix_movies", type: "movie" },
          { catalogId: "mdb_88328", type: "movie" } // legacy alias of netflix latest movies
        ]
      })]
    })]
  };
  const { summary, payload } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  // netflix_movies appears twice verbatim -> deduped to 1; mdb_88328 canonicalises
  // to a different catalog (mdb_netflix_latest_movies) so it survives as a 2nd entry.
  assert.equal(payload.widgets[0].dataSource.payload.items[0].dataSources.length, 2);
  assert.equal(summary.dataSources, 2);
});

// ---- 9. Invalid source skipped with warning ----
test("invalid/unresolvable source is skipped with a warning, not a crash", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        catalogSources: [
          { catalogId: "netflix_movies", type: "movie" },
          { catalogId: "totally_unknown_catalog_id", type: "movie" }
        ]
      })]
    })]
  };
  const { payload, summary } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  assert.equal(summary.dataSources, 1);
  assert.equal(summary.skippedSources, 1);
  assert.ok(summary.warnings.some(w => w.includes("totally_unknown_catalog_id")));
  assert.equal(payload.widgets[0].dataSource.payload.items[0].dataSources.length, 1);
});

// ---- 10. Image priority selection ----
test("image priority: coverImageUrl > focusGifUrl > heroBackdropUrl", () => {
  assert.equal(selectFusionImage({ coverImageUrl: "cover.jpg", focusGifUrl: "focus.gif", heroBackdropUrl: "hero.jpg" }), "cover.jpg");
  assert.equal(selectFusionImage({ focusGifUrl: "focus.gif", heroBackdropUrl: "hero.jpg" }), "focus.gif");
  assert.equal(selectFusionImage({ heroBackdropUrl: "hero.jpg" }), "hero.jpg");
  assert.equal(selectFusionImage({ coverImageUrl: "", focusGifUrl: "", heroBackdropUrl: "" }), "");
  assert.equal(selectFusionImage({}), "");
});

// ---- 11. Every aspect mapping ----
test("every tileShape maps to the correct Fusion aspect", () => {
  assert.equal(mapFusionImageAspect("LANDSCAPE"), "wide");
  assert.equal(mapFusionImageAspect("PORTRAIT"), "poster");
  assert.equal(mapFusionImageAspect("POSTER"), "poster");
  assert.equal(mapFusionImageAspect("SQUARE"), "square");
  assert.equal(mapFusionImageAspect("landscape"), "wide"); // case-insensitive
  assert.equal(mapFusionImageAspect("something-unknown"), "wide");
  assert.equal(mapFusionImageAspect(undefined), "wide");
});

// ---- 12. Empty collections ----
test("empty collections produce an empty, valid payload", () => {
  const { payload, summary } = buildFusionWidgetsPayload({ collections: [] }, { manifestUrl: MANIFEST_URL });
  assert.deepEqual(payload.widgets, []);
  assert.deepEqual(payload.requiredAddons, []);
  assert.equal(payload.exportType, "fusionWidgets");
  assert.equal(payload.exportVersion, 1);
  assert.equal(summary.widgets, 0);

  const { summary: summaryNoCollections } = buildFusionWidgetsPayload({}, { manifestUrl: MANIFEST_URL });
  assert.equal(summaryNoCollections.widgets, 0);
});

// ---- 13. Missing optional artwork ----
test("missing optional artwork omits imageURL rather than emitting an empty string", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        coverImageUrl: undefined,
        focusGifUrl: undefined,
        heroBackdropUrl: undefined,
        catalogSources: [{ catalogId: "netflix_movies", type: "movie" }]
      })]
    })]
  };
  const { payload } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  const tile = payload.widgets[0].dataSource.payload.items[0];
  assert.equal("imageURL" in tile, false);
});

// ---- 14. Profile-specific export ----
test("profile-specific export uses the profile's overridden collections", () => {
  const baseConfig = {
    collections: [collection({ id: "base-coll", title: "Base", folders: [folder({ catalogSources: [{ catalogId: "netflix_movies", type: "movie" }] })] })],
    profiles: {
      profileA: {
        name: "4K TV",
        overrides: {
          collections: [collection({ id: "profile-coll", title: "Profile Only", folders: [folder({ catalogSources: [{ catalogId: "netflix_series", type: "series" }] })] })]
        }
      }
    }
  };

  const baseResolved = resolveConfigForProfile(baseConfig, null);
  const { payload: basePayload } = buildFusionWidgetsPayload(baseResolved, { manifestUrl: MANIFEST_URL });
  assert.equal(basePayload.widgets[0].title, "Base");

  const profileResolved = resolveConfigForProfile(baseConfig, "profileA");
  const { payload: profilePayload } = buildFusionWidgetsPayload(profileResolved, { manifestUrl: MANIFEST_URL });
  assert.equal(profilePayload.widgets[0].title, "Profile Only");
});

// ---- 17. No secrets in payload ----
test("secrets present on the config never appear in the exported payload", () => {
  const config = {
    mdblistKey: "SECRET_MDBLIST",
    rpdbKey: "SECRET_RPDB",
    tpKey: "SECRET_TP",
    fanartKey: "SECRET_FANART",
    omdbKey: "SECRET_OMDB",
    googleAiKey: "SECRET_GOOGLE",
    passwordHash: "SECRET_HASH",
    debridApiKey: "SECRET_DEBRID",
    traktUser: "someone",
    collections: [collection({
      folders: [folder({ catalogSources: [{ catalogId: "netflix_movies", type: "movie" }] })]
    })]
  };
  const { payload } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  const text = JSON.stringify(payload);
  ["SECRET_MDBLIST", "SECRET_RPDB", "SECRET_TP", "SECRET_FANART", "SECRET_OMDB", "SECRET_GOOGLE", "SECRET_HASH", "SECRET_DEBRID"].forEach(secret => {
    assert.equal(text.includes(secret), false, `leaked ${secret}`);
  });
});

// ---- 18. Stable deterministic output ----
test("output is deterministic across repeated calls with identical input", () => {
  const config = {
    collections: [collection({
      folders: [
        folder({ id: "f1", catalogSources: [{ catalogId: "netflix_movies", type: "movie" }] }),
        folder({ id: "f2", catalogSources: [{ catalogId: "netflix_series", type: "series" }] })
      ]
    })]
  };
  const first = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  const second = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  assert.deepEqual(first.payload, second.payload);
  assert.equal(JSON.stringify(first.payload), JSON.stringify(second.payload));
});

// ---- 19. Environment-correct manifest URL ----
test("manifest URL reflects the supplied base origin, with and without a profile", () => {
  assert.equal(
    buildFusionManifestUrl("https://ultramax.vip", "TOK123", null),
    "https://ultramax.vip/c/TOK123/manifest.json"
  );
  assert.equal(
    buildFusionManifestUrl("https://ultramax.vip", "TOK123", "profileA"),
    "https://ultramax.vip/c/TOK123/manifest.json?profile=profileA"
  );
  assert.equal(
    buildFusionManifestUrl("http://localhost:7099/", "TOK123", null),
    "http://localhost:7099/c/TOK123/manifest.json"
  );
});

// ---- 20. Legacy addonId does not leak into output ----
test("stored addonId values are never copied into the export", () => {
  const config = {
    collections: [collection({
      folders: [folder({
        catalogSources: [
          { addonId: "com.ultramax", catalogId: "netflix_movies", type: "movie" },
          { addonId: "com.ultramax", catalogId: "netflix_series", type: "series" }
        ]
      })]
    })]
  };
  const { payload } = buildFusionWidgetsPayload(config, { manifestUrl: MANIFEST_URL });
  const text = JSON.stringify(payload);
  assert.equal(text.includes("com.ultramax"), false);
  assert.equal(text.includes("com.ultramax"), false);
  payload.widgets[0].dataSource.payload.items.forEach(tile => {
    tile.dataSources.forEach(ds => {
      assert.equal(ds.payload.addonId, MANIFEST_URL);
    });
  });
});

// ---- extra: resolveFusionDataSources helper in isolation ----
test("resolveFusionDataSources is directly testable in isolation", () => {
  const context = {
    mergedById: new Map(),
    mergedDerivedTypeById: new Map(),
    customTypeById: new Map([["custom_keanu", "movie"]])
  };
  const { dataSources, warnings, skippedSources } = resolveFusionDataSources(
    folder({ catalogSources: [{ catalogId: "custom_keanu", type: "movie" }, {}] }),
    context,
    MANIFEST_URL
  );
  assert.equal(dataSources.length, 1);
  assert.equal(dataSources[0].payload.catalogId, "movie::custom_keanu");
  assert.equal(skippedSources, 1);
  assert.equal(warnings.length, 1);
});
