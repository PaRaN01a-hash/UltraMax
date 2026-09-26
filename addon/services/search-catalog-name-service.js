"use strict";

const DEFAULT_SEARCH_CATALOG_NAMES = Object.freeze({
  movie: "Ultra MAX Search",
  series: "Ultra MAX Search"
});

const MAX_SEARCH_CATALOG_NAME_LENGTH = 80;

function normalizeSearchCatalogName(value, fallback) {
  const raw = typeof value === "string" ? value : "";
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || fallback).slice(0, MAX_SEARCH_CATALOG_NAME_LENGTH);
}

function normalizeSearchCatalogNames(value) {
  const names =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  return {
    movie: normalizeSearchCatalogName(
      names.movie,
      DEFAULT_SEARCH_CATALOG_NAMES.movie
    ),
    series: normalizeSearchCatalogName(
      names.series,
      DEFAULT_SEARCH_CATALOG_NAMES.series
    )
  };
}

function buildSearchCatalogs(config = {}) {
  if (config.searchEnabled === false) return [];

  const names = normalizeSearchCatalogNames(config.searchCatalogNames);

  return [
    {
      type: "movie",
      id: "search_movies",
      name: names.movie,
      extra: [{ name: "search", isRequired: true }]
    },
    {
      type: "series",
      id: "search_series",
      name: names.series,
      extra: [{ name: "search", isRequired: true }]
    }
  ];
}

module.exports = {
  DEFAULT_SEARCH_CATALOG_NAMES,
  MAX_SEARCH_CATALOG_NAME_LENGTH,
  normalizeSearchCatalogName,
  normalizeSearchCatalogNames,
  buildSearchCatalogs
};
