"use strict";

const crypto = require("crypto");
const { normaliseType, extractNumericMdblistId, extractMdblistSlug } = require("./aiometadata-import-service");
const { PROVIDER_CODES } = require("./streaming-provider-service");

const SUPPORTED_VERSION_PREFIXES = ["2."];
const TRAKT_BUILTIN_CATALOGS = Object.freeze({
  "trakt.trending.movies": { id:"trakt_trending_movies", type:"movie", name:"Trakt Trending" },
  "trakt.trending.shows": { id:"trakt_trending_series", type:"series", name:"Trakt Trending" },
  "trakt.recommendations.movies": { id:"trakt_recommendations_movies", type:"movie", name:"My Trakt Recommendations", requiresAuth:true },
  "trakt.recommendations.shows": { id:"trakt_recommendations_series", type:"series", name:"My Trakt Recommendations", requiresAuth:true }
});
const DIRECT_SETTING_FIELDS = Object.freeze([
  { source: "language", target: "language", label: "Language" },
  { source: "timezone", target: "timezone", label: "Timezone" },
  { source: "includeAdult", target: "includeAdult", label: "Adult content" },
  { source: "hideUnreleasedDigital", target: "digitalReleaseOnly", label: "Digital releases only" },
  { source: "searchEnabled", target: "searchEnabled", label: "Ultra MAX search" },
  { source: "hideUnreleasedDigitalSearch", target: "hideUnreleasedDigitalSearch", label: "Hide unreleased digital titles in search" },
  { source: "ageRating", target: "maxRating", label: "Maximum age rating" }
]);
const CREDENTIAL_FIELDS = Object.freeze([
  { source: "tmdb", target: "tmdbKey", label: "TMDB" },
  { source: "mdblist", target: "mdblistKey", label: "MDBList" },
  { source: "tvdb", target: "tvdbKey", label: "TVDB" },
  { source: "rpdb", target: "rpdbKey", label: "RatingPosterDB" },
  { source: "topPoster", target: "tpKey", label: "Top Poster" },
  { source: "fanart", target: "fanartKey", label: "Fanart.tv" },
  { source: "gemini", target: "googleAiKey", label: "Gemini" }
]);
const UNSUPPORTED_CREDENTIALS = Object.freeze({
  openrouter: "Ultra MAX does not currently use OpenRouter credentials.",
  traktTokenId: "AIOmetadata Trakt token references cannot be migrated as Ultra MAX OAuth sessions.",
  simklTokenId: "AIOmetadata Simkl token references cannot be migrated as Ultra MAX sessions.",
  anilistTokenId: "AIOmetadata AniList token references cannot be migrated as Ultra MAX sessions."
});
const UNMAPPED_CONFIG = Object.freeze({
  providers: "Metadata-provider routing has no one-to-one Ultra MAX equivalent.",
  artProviders: "Artwork-provider priority rules need a dedicated adapter.",
  search: "Search engine/provider ordering needs a dedicated adapter.",
  mal: "MAL episode behaviour is not represented by current Ultra MAX settings.",
  tvdbSeasonType: "TVDB season-type behaviour has no current Ultra MAX equivalent.",
  customPosterUrlPattern: "Custom poster URL patterns are not a current Ultra MAX setting.",
});

class AioMetadataImportError extends Error {
  constructor(message, status = 400, code = "INVALID_AIOMETADATA_IMPORT") {
    super(message); this.name = "AioMetadataImportError"; this.status = status; this.code = code;
  }
}
const fail = (message, status = 400, code) => { throw new AioMetadataImportError(message, status, code); };
const safeText = (value, max = 4096) => typeof value === "string" ? value.trim().slice(0, max) : "";
const cleanName = (value, fallback) => (safeText(value, 120).replace(/[\u0000-\u001f\u007f]/g, "") || fallback).slice(0, 120);
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const out = {}; for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]); return out;
}
const stableStringify = value => JSON.stringify(stableValue(value));
const same = (a, b) => stableStringify(a) === stableStringify(b);
function credentialValue(value) {
  const text = safeText(value, 4096);
  return text && !/^(null|undefined)$/i.test(text) ? text : null;
}
function importCatalogId(listId, type) { return `aio_mdb_${listId}_${type}`; }
function importSlugCatalogId(author, slug, type) {
  const digest = crypto.createHash("sha256").update(`${author}/${slug}`).digest("hex").slice(0, 16);
  return `aio_mdbs_${digest}_${type}`;
}
function safeMdblistPath(slug) {
  const author = safeText(slug?.author, 80), name = safeText(slug?.slug, 160);
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(author) || !/^[A-Za-z0-9._-]{1,160}$/.test(name)) return null;
  return { author, slug: name, path: `${author}/${name}` };
}
function mdbRow(catalog, listId, type, suffix = "") {
  const fallback = `Imported MDBList ${listId}`;
  const name = cleanName(catalog?.name, fallback) + suffix;
  return {
    storage:"mdb", id: importCatalogId(listId, type), name, listId: Number(listId), type,
    enabled: catalog?.enabled !== false,
    importedFrom: "aiometadata",
    importedOriginalId: safeText(catalog?.id, 180) || null,
    showInHome: catalog?.showInHome === true
  };
}
function mdbSlugRow(catalog, slug, type, suffix = "") {
  const safe = safeMdblistPath(slug);
  if (!safe) return null;
  const fallback = `Imported MDBList ${safe.slug}`;
  const name = cleanName(catalog?.name, fallback) + suffix;
  return {
    storage:"mdb", id: importSlugCatalogId(safe.author, safe.slug, type), name, listPath: safe.path, type,
    enabled: catalog?.enabled !== false,
    importedFrom: "aiometadata",
    importedOriginalId: safeText(catalog?.id, 180) || null,
    showInHome: catalog?.showInHome === true
  };
}

function extractTraktListId(catalog) {
  const id = safeText(catalog?.id, 180);
  let match = id.match(/^trakt\.list\.(\d+)$/i);
  if (match) return Number(match[1]);
  const url = safeText(catalog?.metadata?.url, 500);
  match = url.match(/trakt\.tv\/lists\/(\d+)(?:[/?#]|$)/i);
  return match ? Number(match[1]) : null;
}
function traktRow(catalog, listId, type, suffix = "") {
  const id = Number(listId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const sortBy = safeText(catalog?.sort, 30).toLowerCase() || "rank";
  const sortHow = (safeText(catalog?.order || catalog?.sortDirection, 10).toLowerCase() === "desc") ? "desc" : "asc";
  return {
    storage:"trakt", id:`aio_trakt_${id}_${type}`, name:cleanName(catalog?.name,`Imported Trakt ${id}`)+suffix,
    listId:id, type, sortBy, sortHow, enabled:catalog?.enabled !== false,
    importedFrom:"aiometadata", importedOriginalId:safeText(catalog?.id,180)||null,
    showInHome:catalog?.showInHome === true
  };
}
function traktBuiltinRow(catalog, builtin) {
  return {
    storage:"builtin", id:builtin.id, name:builtin.name, type:builtin.type,
    enabled:catalog?.enabled !== false, showInHome:catalog?.showInHome === true,
    importedFrom:"aiometadata", importedOriginalId:safeText(catalog?.id,180)||null,
    requiresAuth:!!builtin.requiresAuth
  };
}

function streamingRow(catalog) {
  const rawId = safeText(catalog?.id, 180);
  const match = rawId.match(/^streaming\.([a-z0-9_-]+)$/i);
  const code = match ? match[1].toLowerCase() : "";
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_CODES, code)) return null;
  const type = normaliseType(catalog?.type, catalog?.displayType);
  if (type !== "movie" && type !== "series") return null;
  return {
    storage:"streaming", id:`aio_stream_${code}_${type}`, name:cleanName(catalog?.name,PROVIDER_CODES[code]),
    type, source:"streaming", sourceValue:code, enabled:catalog?.enabled !== false,
    importedFrom:"aiometadata", importedOriginalId:rawId || null, showInHome:catalog?.showInHome === true,
    requiresRegion:true
  };
}

function classifyCatalogs(catalogs) {
  const rows = [], adapters = [], invalid = [], duplicateIds = [], seen = new Set();
  let direct = 0, translated = 0;
  const addRows = next => {
    for (const row of next.filter(Boolean)) {
      if (seen.has(row.id)) { duplicateIds.push(row.id); continue; }
      seen.add(row.id); rows.push(row);
    }
  };
  for (let index = 0; index < catalogs.length; index++) {
    const catalog = catalogs[index];
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) { invalid.push({index, reason:"Catalog entry is not an object."}); continue; }
    const source = safeText(catalog.source, 40).toLowerCase();
    if (source === "mdblist") {
      const listId = extractNumericMdblistId(catalog);
      const slug = listId ? null : safeMdblistPath(extractMdblistSlug(catalog));
      if (!listId && !slug) { adapters.push({index,source:"mdblist",originalId:safeText(catalog.id,180)||null,reason:"MDBList list ID or public owner/slug path could not be resolved."}); continue; }
      const type = normaliseType(catalog.type, catalog.displayType);
      const make = (mediaType, suffix="") => listId ? mdbRow(catalog,listId,mediaType,suffix) : mdbSlugRow(catalog,slug,mediaType,suffix);
      if (type === "movie" || type === "series") { addRows([make(type)]); direct++; }
      else if (type === "all") { addRows([make("movie"," · Movies"),make("series"," · Series")]); translated++; }
      else invalid.push({index,source:"mdblist",originalId:safeText(catalog.id,180)||null,reason:"MDBList media type is unsupported."});
      continue;
    }
    if (source === "trakt") {
      const originalId = safeText(catalog.id,180);
      const builtin = TRAKT_BUILTIN_CATALOGS[originalId];
      if (builtin) { addRows([traktBuiltinRow(catalog,builtin)]); direct++; continue; }
      const listId = extractTraktListId(catalog);
      if (!listId) { adapters.push({index,source:"trakt",originalId:originalId||null,reason:"Trakt catalog is not a supported native row or public numeric list."}); continue; }
      const type = normaliseType(catalog.type, catalog.displayType);
      if (type === "movie" || type === "series") { addRows([traktRow(catalog,listId,type)]); direct++; }
      else if (type === "all") { addRows([traktRow(catalog,listId,"movie"," · Movies"),traktRow(catalog,listId,"series"," · Series")]); translated++; }
      else invalid.push({index,source:"trakt",originalId:originalId||null,reason:"Trakt media type is unsupported."});
      continue;
    }
    if (source === "streaming") {
      const row = streamingRow(catalog);
      if (row) { addRows([row]); direct++; continue; }
      adapters.push({index,source:"streaming",originalId:safeText(catalog.id,180)||null,reason:"Streaming provider code or media type is not supported."});
      continue;
    }
    const reason = source === "letterboxd"
      ? "Letterboxd public lists do not expose reliable TMDB/IMDb identities through an API Ultra MAX can use; title-matching would not be an exact import."
      : source === "flixpatrol"
        ? "Exact FlixPatrol charts require a separate FlixPatrol API subscription/key that AIOmetadata exports do not contain."
        : `Source adapter not implemented: ${source || "unknown"}.`;
    adapters.push({index, source: source || "unknown", originalId:safeText(catalog.id,180)||null, reason});
  }
  const bySource = {}; for (const c of catalogs) { const source=safeText(c?.source,40).toLowerCase()||"unknown"; bySource[source]=(bySource[source]||0)+1; }
  return {rows,adapters,invalid,duplicateIds:[...new Set(duplicateIds)],direct,translated,bySource};
}
function settingPlan(config, current, deps) {
  const patch = {}, preview = [], unsupported = [];
  for (const item of DIRECT_SETTING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(config,item.source)) continue;
    let value = config[item.source];
    if (item.target === "language") {
      value = safeText(value,20);
      if (!deps.safeLanguages?.has(value)) { unsupported.push({field:item.source,reason:`Unsupported Ultra MAX language: ${value || "blank"}.`}); continue; }
    } else if (item.target === "timezone") {
      value = safeText(value,80);
      if (!deps.isValidTimeZone?.(value)) { unsupported.push({field:item.source,reason:"Timezone is not supported by Ultra MAX."}); continue; }
      value = deps.normalizeTimeZone(value);
    } else if (item.target === "maxRating") {
      const raw = safeText(value,20).toUpperCase();
      const ratings = new Set(["G","TV-G","PG","TV-PG","PG-13","TV-14","R","TV-MA","NC-17","18"]);
      value = !raw || raw === "NONE" ? null : raw;
      if (value && !ratings.has(value)) { unsupported.push({field:item.source,reason:`Unsupported Ultra MAX age rating: ${raw}.`}); continue; }
    } else if (typeof value !== "boolean") { unsupported.push({field:item.source,reason:"Expected a boolean value."}); continue; }
    patch[item.target] = value;
    preview.push({label:item.label,sourceField:item.source,targetField:item.target,action:same(current?.[item.target],value)?"unchanged":"change",value});
  }
  return {patch,preview,unsupported};
}
function credentialPlan(config, current) {
  const api = config?.apiKeys && typeof config.apiKeys === "object" && !Array.isArray(config.apiKeys) ? config.apiKeys : {};
  const patch = {}, preview = [], unsupported = [];
  for (const item of CREDENTIAL_FIELDS) {
    const value = credentialValue(api[item.source]); if (!value) continue;
    patch[item.target] = value;
    const existing = credentialValue(current?.[item.target]);
    preview.push({label:item.label,sourceField:`apiKeys.${item.source}`,targetField:item.target,action:existing ? (existing===value?"unchanged":"replace") : "add",present:true});
  }
  for (const [field,reason] of Object.entries(UNSUPPORTED_CREDENTIALS)) if (credentialValue(api[field])) unsupported.push({field:`apiKeys.${field}`,reason});
  return {patch,preview,unsupported};
}
function buildAioMetadataImportPlan(input, currentConfig = {}, deps = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("JSON root must be an object.");
  const config = input.config; if (!config || typeof config !== "object" || Array.isArray(config)) fail("Missing config object.");
  if (!Array.isArray(config.catalogs)) fail("Missing config.catalogs array.");
  if (config.catalogs.length > 2000) fail("AIOmetadata export contains too many catalogs.",413,"AIOMETADATA_TOO_LARGE");
  const version=safeText(input.version,30)||"unknown", recognisedVersion=version==="unknown"||SUPPORTED_VERSION_PREFIXES.some(p=>version.startsWith(p));
  const settings=settingPlan(config,currentConfig,deps), credentials=credentialPlan(config,currentConfig), catalogPlan=classifyCatalogs(config.catalogs);
  const unmapped=[]; for(const [field,reason] of Object.entries(UNMAPPED_CONFIG)) if(Object.prototype.hasOwnProperty.call(config,field))unmapped.push({field,reason});
  const importableEnabled=catalogPlan.rows.filter(r=>r.enabled).length;
  const willHaveMdb=!!(credentials.patch.mdblistKey || credentialValue(currentConfig.mdblistKey));
  const warnings=[];
  if(catalogPlan.rows.some(r=>r.storage==="mdb")&&!willHaveMdb)warnings.push("Imported MDBList catalogs need an MDBList API key before they can return results.");
  if(catalogPlan.rows.some(r=>r.requiresAuth)&&!credentialValue(currentConfig.traktAccessToken))warnings.push("Personal Trakt recommendation rows require connecting Trakt inside Ultra MAX after import.");
  const streamingRows=catalogPlan.rows.filter(r=>r.storage==="streaming");
  if(streamingRows.length)warnings.push(`${streamingRows.length} streaming rows require choosing a streaming region before import.`);
  if(!recognisedVersion)warnings.push(`AIOmetadata ${version} is outside the tested 2.x export format.`);
  const planId=crypto.randomBytes(18).toString("base64url");
  const privatePlan={id:planId,version,recognisedVersion,settingsPatch:settings.patch,credentialPatch:credentials.patch,catalogRows:catalogPlan.rows,importedCatalogIds:catalogPlan.rows.map(r=>r.id)};
  const preview={
    id:planId,valid:true,version,recognisedVersion,exportedAt:safeText(input.exportedAt,80)||null,
    settings:{items:settings.preview,unsupported:settings.unsupported},
    credentials:{items:credentials.preview,unsupported:credentials.unsupported},
    catalogs:{found:config.catalogs.length,importableRows:catalogPlan.rows.length,enabledRows:importableEnabled,direct:catalogPlan.direct,translated:catalogPlan.translated,streamingRegionRequired:streamingRows.length,streamingProviderCodes:[...new Set(streamingRows.map(r=>r.sourceValue))],adapterRequired:catalogPlan.adapters.length,invalid:catalogPlan.invalid.length,duplicateIds:catalogPlan.duplicateIds.length,bySource:catalogPlan.bySource,adapterSamples:catalogPlan.adapters.slice(0,20),invalidSamples:catalogPlan.invalid.slice(0,20)},
    unmapped,warnings,
    defaults:{settings:true,credentials:true,catalogs:catalogPlan.rows.length>0}
  };
  return {preview,privatePlan};
}
function applyAioMetadataImportPlan(currentConfig, privatePlan, selection = {}) {
  if(!privatePlan||typeof privatePlan!=="object")fail("Import preview expired. Preview the file again.",410,"IMPORT_PREVIEW_EXPIRED");
  const useSettings=selection.settings!==false,useCredentials=selection.credentials!==false,useCatalogs=selection.catalogs!==false;
  const patch={};
  if(useSettings)Object.assign(patch,privatePlan.settingsPatch||{});
  if(useCredentials)Object.assign(patch,privatePlan.credentialPatch||{});
  if(useCatalogs){
    const rows=Array.isArray(privatePlan.catalogRows)?privatePlan.catalogRows:[], ids=new Set(rows.map(r=>r.id));
    const mdbRows=rows.filter(r=>r.storage==="mdb"), traktRows=rows.filter(r=>r.storage==="trakt"), streamingRows=rows.filter(r=>r.storage==="streaming");
    const streamingRegion=String(selection.streamingRegion||"").trim().toUpperCase();
    if(streamingRows.length&&!/^[A-Z]{2}$/.test(streamingRegion))fail("Choose a two-letter streaming region before importing streaming catalogs.",400,"STREAMING_REGION_REQUIRED");
    const currentMdb=Array.isArray(currentConfig.customMdbLists)?currentConfig.customMdbLists:[];
    const currentTrakt=Array.isArray(currentConfig.customTraktLists)?currentConfig.customTraktLists:[];
    const currentCustom=Array.isArray(currentConfig.customCatalogs)?currentConfig.customCatalogs:[];
    patch.customMdbLists=[...currentMdb.filter(r=>!ids.has(r?.id)),...mdbRows.map(r=>{const {showInHome,storage,requiresAuth,requiresRegion,...stored}=r;return stored;})];
    patch.customTraktLists=[...currentTrakt.filter(r=>!ids.has(r?.id)),...traktRows.map(r=>{const {showInHome,storage,requiresAuth,requiresRegion,...stored}=r;return stored;})];
    patch.customCatalogs=[...currentCustom.filter(r=>!ids.has(r?.id)),...streamingRows.map(r=>{const {showInHome,storage,requiresAuth,requiresRegion,...stored}=r;return {...stored,region:streamingRegion};})];
    const existingCatalogs=(Array.isArray(currentConfig.catalogs)?currentConfig.catalogs:[]).filter(id=>!ids.has(id));
    const enabled=rows.filter(r=>r.enabled).map(r=>r.id); patch.catalogs=[...new Set([...existingCatalogs,...enabled])];
    const hidden=(Array.isArray(currentConfig.hiddenCatalogs)?currentConfig.hiddenCatalogs:[]).filter(id=>!ids.has(id));
    patch.hiddenCatalogs=[...new Set([...hidden,...rows.filter(r=>r.enabled&&!r.showInHome).map(r=>r.id)])];
    const order=(Array.isArray(currentConfig.catalogOrder)?currentConfig.catalogOrder:[]).filter(id=>!ids.has(id));
    patch.catalogOrder=[...order,...enabled];
  }
  const changedKeys=Object.keys(patch).filter(key=>!same(currentConfig?.[key],patch[key]));
  return {patch,changedKeys,selection:{settings:useSettings,credentials:useCredentials,catalogs:useCatalogs,streamingRegion:String(selection.streamingRegion||"").trim().toUpperCase()||null}};
}

module.exports={buildAioMetadataImportPlan,applyAioMetadataImportPlan,AioMetadataImportError,DIRECT_SETTING_FIELDS,CREDENTIAL_FIELDS,TRAKT_BUILTIN_CATALOGS};
