"use strict";

const PROVIDER_CODES = Object.freeze({
  nfx: "Netflix",
  atp: "Apple TV+",
  hbm: "HBO Max",
  dnp: "Disney+",
  amp: "Prime Video",
  pmp: "Paramount+",
  hlu: "Hulu",
  pcp: "Peacock",
  dpe: "Discovery+",
  cru: "Crunchyroll"
});

function normaliseProviderName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function providerMatches(code, providerName) {
  const name = normaliseProviderName(providerName);
  switch (String(code || "").toLowerCase()) {
    case "nfx": return name === "netflix";
    case "atp": return name === "apple tv";
    case "hbm": return name === "hbo max";
    case "dnp": return name === "disney plus";
    case "amp": return name === "amazon prime video";
    case "pmp": return name === "paramount plus" || (/^paramount plus (premium|essential|basic with ads)$/.test(name));
    case "hlu": return name === "hulu";
    case "pcp": return /^peacock premium(?: plus)?$/.test(name);
    case "dpe": return name === "discovery plus";
    case "cru": return name === "crunchyroll";
    default: return false;
  }
}

function providerIdsForCode(code, providers) {
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_CODES, String(code || "").toLowerCase())) return [];
  return (Array.isArray(providers) ? providers : [])
    .filter(item => item && providerMatches(code, item.provider_name))
    .sort((a, b) => Number(a.display_priority || 9999) - Number(b.display_priority || 9999))
    .map(item => Number(item.provider_id))
    .filter((id, index, all) => Number.isSafeInteger(id) && id > 0 && all.indexOf(id) === index);
}

async function resolveStreamingProviderValue(code, region, tmdbKey, fetchCached) {
  const providerCode = String(code || "").trim().toLowerCase();
  const watchRegion = String(region || "").trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_CODES, providerCode)) return null;
  if (!/^[A-Z]{2}$/.test(watchRegion) || !tmdbKey || typeof fetchCached !== "function") return null;
  const url = `https://api.themoviedb.org/3/watch/providers/movie?api_key=${encodeURIComponent(tmdbKey)}&watch_region=${watchRegion}`;
  const data = await fetchCached(url);
  const ids = providerIdsForCode(providerCode, data?.results);
  return ids.length ? ids.join("|") : null;
}

module.exports = { PROVIDER_CODES, normaliseProviderName, providerMatches, providerIdsForCode, resolveStreamingProviderValue };
