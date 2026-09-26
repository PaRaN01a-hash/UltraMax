"use strict";

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function quotedTitleCandidate(query) {
  const match = String(query || "").match(/["“”']([^"“”']{1,160})["“”']/);
  return match ? normalizeSearchText(match[1]) : "";
}

function compactTitleCandidate(query) {
  let value = normalizeSearchText(query);
  value = value
    .replace(/\b(?:movie|movies|film|films|series|show|shows|tv)\b/g, " ")
    .replace(/\b(?:released|release)\s+(?:in|from)\b/g, " ")
    .replace(/\b(?:from|in)\s+(?:19|20)\d{2}\b/g, " ")
    .replace(/\b(?:19|20)\d{2}\b$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value;
}

function titleValues(candidate) {
  return [
    candidate?.title,
    candidate?.name,
    candidate?.original_title,
    candidate?.original_name
  ].map(normalizeSearchText).filter(Boolean);
}

function exactMatchStrength(candidate, query) {
  const values = titleValues(candidate);
  if (!values.length) return 0;

  const raw = normalizeSearchText(query);
  const quoted = quotedTitleCandidate(query);
  const compact = compactTitleCandidate(query);
  const needles = [...new Set([quoted, raw, compact].filter(Boolean))];

  let best = 0;
  for (const value of values) {
    for (const needle of needles) {
      if (value === needle) best = Math.max(best, quoted && needle === quoted ? 1 : 0.99);
      else if (needle.length >= 4 && value.startsWith(needle)) best = Math.max(best, 0.84);
      else if (value.length >= 4 && needle.startsWith(value)) best = Math.max(best, 0.78);
    }
  }
  return best;
}

function buildUltraSearchPlan(query, type, intent = {}) {
  const q = normalizeSearchText(query);
  const words = q ? q.split(/\s+/).filter(Boolean) : [];
  const hasTime = intent.yearMin != null || intent.yearMax != null;
  const hasIntent =
    (intent.requiredGenres || []).length > 0 ||
    intent.country != null ||
    intent.femaleLead === true ||
    intent.minRating != null ||
    intent.quality != null ||
    (intent.concepts || []).length > 0;

  const richLanguage = words.length >= 3 || (words.length >= 2 && hasTime);
  // Keep the existing broad 3+ word eligibility. The semantic service owns
  // the stricter intent/natural-language gate; if it declines, the exact
  // branch already running beside it becomes the safe fallback.
  const semanticEligible = (type === "movie" || type === "series") && richLanguage;

  const rawQuery = String(query || "").trim();
  const quotedTitle = quotedTitleCandidate(query);
  const compactTitle = compactTitleCandidate(query);
  const decoratedTitle =
    compactTitle &&
    compactTitle !== q &&
    compactTitle.split(/\s+/).length <= 4 &&
    /\b(?:movie|movies|film|films|series|show|shows|tv|(?:19|20)\d{2})\b/i.test(rawQuery);

  return {
    query: rawQuery,
    type,
    mode: semanticEligible ? "hybrid" : "exact",
    semanticEligible,
    runExactRescue: semanticEligible,
    exactQuery: quotedTitle || (decoratedTitle ? compactTitle : rawQuery),
    quotedTitle: quotedTitle || null,
    compactTitle: compactTitle || null
  };
}

function candidateKey(candidate) {
  const id = candidate?.id ?? candidate?.tmdbId;
  return id != null ? `tmdb:${id}` : `title:${normalizeSearchText(candidate?.title || candidate?.name)}`;
}

function mergeHybridSearchResults({ semantic = [], exact = [], query, limit = 20 }) {
  const semanticByKey = new Map();
  for (const item of semantic || []) {
    semanticByKey.set(candidateKey(item), item);
  }

  const exactRanked = (exact || [])
    .map((item, index) => ({ item, index, strength: exactMatchStrength(item, query) }))
    .sort((a, b) => b.strength - a.strength || a.index - b.index);

  const output = [];
  const seen = new Set();
  const push = (item, source) => {
    const key = candidateKey(item);
    if (!key || seen.has(key) || output.length >= limit) return;
    seen.add(key);
    output.push({ ...item, _ultraSearchSource: source });
  };

  // Exact-title rescue is deliberately narrow. It can rescue a title that
  // falls outside the semantic quality pool, but a merely similar title is
  // not allowed to jump a descriptive search.
  for (const row of exactRanked.filter(row => row.strength >= 0.95)) {
    const key = candidateKey(row.item);
    push(semanticByKey.get(key) || row.item, "exact-rescue");
  }

  for (const item of semantic || []) push(item, "semantic");

  // If semantic retrieval produced nothing, conventional search remains the
  // safety net. If it did work, append only reasonably title-like exact
  // results rather than polluting a natural-language result set.
  const semanticWorked = (semantic || []).length > 0;
  for (const row of exactRanked) {
    if (semanticWorked && row.strength < 0.55) continue;
    push(row.item, semanticWorked ? "exact-support" : "exact-fallback");
  }

  return output.slice(0, limit);
}

module.exports = {
  normalizeSearchText,
  quotedTitleCandidate,
  compactTitleCandidate,
  exactMatchStrength,
  buildUltraSearchPlan,
  mergeHybridSearchResults
};
