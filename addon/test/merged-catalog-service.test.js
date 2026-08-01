"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validateMergedCatalogs,
  derivedCatalogIds,
  buildMergedManifestCatalogs,
  resolveMergedCatalogRoute
} = require("../services/merged-catalog-service");

const catalogDefs = {
  movies_a: { type: "movie", handler: "tmdb" },
  movies_b: { type: "movie", handler: "mdb" },
  series_a: { type: "series", handler: "tmdb" },
  merged_fixed: { type: "movie", handler: "merged" }
};
const base = {
  id: "merged_a7f3c9d2",
  name: "Anime",
  type: "mixed",
  blend: "interleave",
  sources: [
    { catalogId: "movies_a", type: "movie" },
    { catalogId: "series_a", type: "series" }
  ]
};

test("normalises and validates authoritative source types", () => {
  assert.deepEqual(validateMergedCatalogs([base], { catalogDefs }), [base]);
});

test("mixed definitions derive standards-compatible typed ids", () => {
  assert.deepEqual(derivedCatalogIds(base), [
    "merged_a7f3c9d2_movies",
    "merged_a7f3c9d2_series"
  ]);
});

test("single-type definitions expose their immutable base id", () => {
  assert.deepEqual(derivedCatalogIds({
    ...base,
    type: "movie",
    sources: [{ catalogId: "movies_a", type: "movie" }]
  }), ["merged_a7f3c9d2"]);
});

test("manifest generation never emits a mixed type", () => {
  const rows = buildMergedManifestCatalogs([base]);
  assert.deepEqual(rows.map(row => [row.id, row.type, row.name]), [
    ["merged_a7f3c9d2_movies", "movie", "Anime"],
    ["merged_a7f3c9d2_series", "series", "Anime"]
  ]);
  assert.equal(rows.some(row => row.type === "mixed"), false);
});

test("dynamic routes distinguish base and mixed derived ids", () => {
  assert.equal(
    resolveMergedCatalogRoute("merged_a7f3c9d2_movies", "movie", [base])?.type,
    "movie"
  );
  assert.equal(
    resolveMergedCatalogRoute("merged_a7f3c9d2_movies", "series", [base]),
    null
  );
  const movieOnly = {
    ...base,
    type: "movie",
    sources: [{ catalogId: "movies_a", type: "movie" }]
  };
  assert.equal(
    resolveMergedCatalogRoute("merged_a7f3c9d2", "movie", [movieOnly])?.definition,
    movieOnly
  );
});

for (const [name, mutate, pattern] of [
  ["malformed id", value => { value.id = "merged_by_name"; }, /invalid id/],
  ["duplicate ids", value => [value, { ...value }], /Duplicate/],
  ["empty sources", value => { value.sources = []; }, /at least one/],
  ["too many sources", value => {
    value.sources = Array.from({ length: 9 }, (_, i) => ({
      catalogId: i % 2 ? "movies_a" : "movies_b",
      type: "movie"
    }));
  }, /8-source/],
  ["duplicate sources", value => {
    value.sources = [
      { catalogId: "movies_a", type: "movie" },
      { catalogId: "movies_a", type: "movie" }
    ];
  }, /duplicate source/],
  ["unresolved source", value => {
    value.sources = [{ catalogId: "missing", type: "movie" }];
  }, /unresolved source/],
  ["source type mismatch", value => {
    value.sources = [{ catalogId: "movies_a", type: "series" }];
  }, /source type mismatch/],
  ["fixed merged source", value => {
    value.sources = [{ catalogId: "merged_fixed", type: "movie" }];
  }, /cannot source merged/],
  ["custom merged source", value => {
    value.sources = [{ catalogId: "merged_deadbeef", type: "movie" }];
  }, /cannot source merged/]
]) {
  test(`rejects ${name}`, () => {
    const value = structuredClone(base);
    const input = mutate(value) || value;
    assert.throws(
      () => validateMergedCatalogs(Array.isArray(input) ? input : [input], { catalogDefs }),
      pattern
    );
  });
}

test("rejects a movie definition containing a series source", () => {
  assert.throws(() => validateMergedCatalogs([{
    ...base,
    type: "movie"
  }], { catalogDefs }), /movie definition cannot source series/);
});
