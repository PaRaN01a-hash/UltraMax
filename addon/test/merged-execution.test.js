"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  blendSourceLists,
  deduplicateMetas,
  executeMergedCatalog
} = require("../services/merged-catalog-service");

test("interleave is round-robin and skips exhausted sources", () => {
  assert.deepEqual(
    blendSourceLists([["A1", "A2"], ["B1"], ["C1", "C2", "C3"]], "interleave"),
    ["A1", "B1", "C1", "A2", "C2", "C3"]
  );
});

test("sequential preserves source and result order", () => {
  assert.deepEqual(
    blendSourceLists([["A1", "A2"], ["B1", "B2"]], "sequential"),
    ["A1", "A2", "B1", "B2"]
  );
});

test("typed strong keys deduplicate while preserving first occurrence", () => {
  const metas = [
    { id: "tt1", name: "first" },
    { id: "tt1", name: "duplicate" },
    { id: "tmdb:1", name: "provider" }
  ];
  assert.deepEqual(
    deduplicateMetas(metas, "movie").map(meta => meta.name),
    ["first", "provider"]
  );
  assert.equal(
    deduplicateMetas([{ id: "tmdb:1" }], "movie").length +
      deduplicateMetas([{ id: "tmdb:1" }], "series").length,
    2
  );
});

test("pagination is stable, non-overlapping, and fetches enough source windows", async () => {
  const definition = {
    blend: "interleave",
    sources: [
      { catalogId: "a", type: "movie" },
      { catalogId: "b", type: "movie" }
    ]
  };
  const fetchSource = async (source, offset, size) => ({
    metas: Array.from({ length: size }, (_, index) => ({
      id: `tt${source.catalogId}${offset + index}`
    }))
  });
  const first = await executeMergedCatalog({ definition, type: "movie", fetchSource });
  const second = await executeMergedCatalog({
    definition, type: "movie", skip: 20, fetchSource
  });
  assert.equal(first.metas.length, 20);
  assert.equal(second.metas.length, 20);
  assert.equal(first.metas.some(a => second.metas.some(b => a.id === b.id)), false);
  assert.deepEqual(
    second,
    await executeMergedCatalog({ definition, type: "movie", skip: 20, fetchSource })
  );
});

test("one failed source and empty sources return safely", async () => {
  const definition = {
    blend: "sequential",
    sources: [
      { catalogId: "bad", type: "series" },
      { catalogId: "good", type: "series" }
    ]
  };
  const result = await executeMergedCatalog({
    definition,
    type: "series",
    fetchSource: async source => {
      if (source.catalogId === "bad") throw new Error("expected");
      return { metas: [{ id: "ttgood" }] };
    }
  });
  assert.deepEqual(result.metas, [{ id: "ttgood" }]);
  assert.equal(result.behaviorHints.failedSources, 1);
  assert.deepEqual(
    (await executeMergedCatalog({
      definition: { ...definition, sources: [] },
      type: "series",
      fetchSource: async () => ({ metas: [] })
    })).metas,
    []
  );
});
