"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildCatalogsFromIds } = require("../services/manifest-service");

const definition = {
  id: "merged_a7f3c9d2",
  name: "Renamed Anime",
  type: "mixed",
  blend: "interleave",
  sources: [
    { catalogId: "movie_source", type: "movie" },
    { catalogId: "series_source", type: "series" }
  ]
};

test("selected dynamic rows preserve order and hidden state", () => {
  const rows = buildCatalogsFromIds(
    ["normal", "merged_a7f3c9d2_series", "merged_a7f3c9d2_movies"],
    ["merged_a7f3c9d2_series"],
    [],
    { normal: { name: "Normal", type: "movie" } },
    [definition]
  );
  assert.deepEqual(rows.map(row => [row.id, row.type, row.showInHome]), [
    ["normal", "movie", true],
    ["merged_a7f3c9d2_series", "series", false],
    ["merged_a7f3c9d2_movies", "movie", true]
  ]);
});

test("fixed merged ids remain unchanged", () => {
  const rows = buildCatalogsFromIds(
    ["merged_streaming_movies"],
    [],
    [],
    {
      merged_streaming_movies: {
        name: "All Streaming Movies",
        type: "movie",
        handler: "merged"
      }
    },
    [definition]
  );
  assert.equal(rows[0].id, "merged_streaming_movies");
});
