"use strict";

const { normalizeCollectionCatalogs } = require("./collection-normalize-service");
const { validateCollections, canonicalHash, CollectionSchemaError, COLLECTION_LIMITS, isPlainObject } = require("./collection-schema-service");

class UltraPlayCollectionSyncError extends Error {
  constructor(message,status=400,code="INVALID_COLLECTION_SYNC"){super(message);this.name="UltraPlayCollectionSyncError";this.status=status;this.code=code;}
}
const fail=(message,status=400,code)=>{throw new UltraPlayCollectionSyncError(message,status,code)};
const allowed=(value,keys,label)=>{if(!isPlainObject(value))fail(`${label} must be an object.`);for(const key of Object.keys(value))if(!keys.has(key))fail(`${label} contains an unsupported field: ${key}.`);};
function str(value,max,label,{required=false,pattern=null}={}){if(value===undefined||value===null||value===''){if(required)fail(`${label} is required.`);return '';}if(typeof value!=='string'||value.length>max)fail(`${label} is invalid.`);const out=value.trim();if(required&&!out)fail(`${label} is required.`);if(pattern&&out&&!pattern.test(out))fail(`${label} is invalid.`);return out;}
function bool(value,fallback,label){if(value===undefined)return fallback;if(typeof value!=='boolean')fail(`${label} must be on or off.`);return value;}
function httpsUrl(value,label){if(value===undefined||value===null||value==='')return null;const text=str(value,2048,label);try{const u=new URL(text);if(u.protocol!=='https:'||u.username||u.password)fail(`${label} must be a safe HTTPS URL.`);return u.toString();}catch(error){if(error instanceof UltraPlayCollectionSyncError)throw error;fail(`${label} must be a safe HTTPS URL.`)}}
function number(value,min,max,label,{integer=false,optional=false}={}){if((value===undefined||value===null||value==='')&&optional)return null;const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))fail(`${label} is invalid.`);return n;}

const TMDB_TYPES=new Set(['DISCOVER','COMPANY','NETWORK','COLLECTION','PERSON','DIRECTOR','LIST']);
const TMDB_SORTS=new Set(['popularity.desc','popularity.asc','vote_average.desc','vote_average.asc','primary_release_date.desc','primary_release_date.asc','first_air_date.desc','first_air_date.asc','original']);
const TRAKT_SORTS=new Set(['rank','added','title','released','runtime','popularity','percentage','votes']);
const TRAKT_HOW=new Set(['asc','desc']);
const FILTER_KEYS=new Set(['withGenres','releaseDateGte','releaseDateLte','voteAverageGte','voteCountGte','year','withOriginalLanguage','withOriginCountry','withWatchProviders','watchRegion']);

function tmdbFilters(raw){
 if(raw===undefined||raw===null)return {};
 allowed(raw,FILTER_KEYS,'TMDB filters');const out={};
 const textRules=[['withGenres',/^\d+(?:[|,]\d+)*$/,120],['releaseDateGte',/^\d{4}-\d{2}-\d{2}$/,10],['releaseDateLte',/^\d{4}-\d{2}-\d{2}$/,10],['withOriginalLanguage',/^[A-Za-z]{2,3}$/,3],['withOriginCountry',/^[A-Za-z]{2}$/,2],['withWatchProviders',/^\d+(?:[|,]\d+)*$/,120],['watchRegion',/^[A-Za-z]{2}$/,2]];
 for(const [key,re,max] of textRules)if(raw[key]!==undefined&&raw[key]!==null&&raw[key]!==''){let v=str(raw[key],max,`TMDB ${key}`,{pattern:re});if(key==='withOriginalLanguage')v=v.toLowerCase();if(key==='withOriginCountry'||key==='watchRegion')v=v.toUpperCase();out[key]=v;}
 if(raw.voteAverageGte!==undefined&&raw.voteAverageGte!==null&&raw.voteAverageGte!=='')out.voteAverageGte=Math.round(number(raw.voteAverageGte,0,10,'TMDB minimum rating')*10)/10;
 if(raw.voteCountGte!==undefined&&raw.voteCountGte!==null&&raw.voteCountGte!=='')out.voteCountGte=number(raw.voteCountGte,0,100000000,'TMDB minimum votes',{integer:true});
 if(raw.year!==undefined&&raw.year!==null&&raw.year!=='')out.year=number(raw.year,1870,2100,'TMDB year',{integer:true});
 return out;
}

function source(raw){
 allowed(raw,new Set(['provider','addonId','type','catalogId','genre','tmdbSourceType','title','tmdbId','mediaType','sortBy','filters','traktListId','sortHow']),'Collection source');
 const provider=str(raw.provider,20,'Source provider',{required:true}).toLowerCase();
 if(provider==='addon'){
  const type=str(raw.type,30,'Add-on media type',{required:true});if(!['movie','series','tv'].includes(type))fail('Add-on media type is unsupported.');
  const genre=str(raw.genre,80,'Add-on genre');return {provider:'addon',addonId:str(raw.addonId,100,'Add-on ID',{required:true}),type,catalogId:str(raw.catalogId,100,'Catalog ID',{required:true}),...(genre?{genre}:{})};
 }
 if(provider==='tmdb'){
  const tmdbSourceType=str(raw.tmdbSourceType,30,'TMDB source type',{required:true}).toUpperCase();if(!TMDB_TYPES.has(tmdbSourceType))fail('TMDB source type is unsupported.');
  const mediaType=str(raw.mediaType,10,'TMDB media type',{required:true}).toUpperCase();if(!['MOVIE','TV'].includes(mediaType))fail('TMDB media type is unsupported.');
  let sortBy=str(raw.sortBy,40,'TMDB sort',{required:true}).toLowerCase();if(!TMDB_SORTS.has(sortBy))fail('TMDB sort is unsupported.');
  const tmdbId=number(raw.tmdbId,1,9999999999,'TMDB source ID',{integer:true,optional:true});if(tmdbSourceType!=='DISCOVER'&&!tmdbId)fail('TMDB source ID is required.');if(tmdbSourceType==='DISCOVER'&&tmdbId)fail('TMDB Discover cannot have a source ID.');
  return {provider:'tmdb',tmdbSourceType,title:str(raw.title,120,'TMDB source title',{required:true}),...(tmdbId?{tmdbId}:{}),mediaType,sortBy,filters:tmdbFilters(raw.filters)};
 }
 if(provider==='trakt'){
  const mediaType=str(raw.mediaType,10,'Trakt media type',{required:true}).toUpperCase();if(!['MOVIE','TV'].includes(mediaType))fail('Trakt media type is unsupported.');let sortBy=str(raw.sortBy,30,'Trakt sort',{required:true}).toLowerCase(),sortHow=str(raw.sortHow,10,'Trakt sort direction',{required:true}).toLowerCase();if(!TRAKT_SORTS.has(sortBy)||!TRAKT_HOW.has(sortHow))fail('Trakt sorting is unsupported.');
  return {provider:'trakt',title:str(raw.title,120,'Trakt title',{required:true}),traktListId:number(raw.traktListId,1,Number.MAX_SAFE_INTEGER,'Trakt list ID',{integer:true}),mediaType,sortBy,sortHow};
 }
 fail(`Collection provider is not supported for Ultra MAX sync: ${provider}.`,422,'UNSUPPORTED_PROVIDER');
}

function folder(raw){
 allowed(raw,new Set(['id','title','hideTitle','tileShape','coverImageUrl','coverEmoji','focusGifUrl','focusGifEnabled','heroBackdropUrl','heroVideoUrl','titleLogoUrl','sources']),'Collection folder');
 const tileShape=str(raw.tileShape,30,'Folder tile shape',{required:true}).toUpperCase();if(!['POSTER','LANDSCAPE','SQUARE'].includes(tileShape))fail('Folder tile shape is unsupported.');if(!Array.isArray(raw.sources))fail('Folder sources must be an array.');
 const coverImageUrl=httpsUrl(raw.coverImageUrl,'Folder cover image'),coverEmoji=str(raw.coverEmoji,40,'Folder cover emoji');if(coverImageUrl&&coverEmoji)fail('Folder cover image and emoji cannot both be set.');
 return {id:str(raw.id,128,'Folder ID',{required:true}),title:str(raw.title,120,'Folder title',{required:true}),hideTitle:bool(raw.hideTitle,false,'Hide folder title'),tileShape,...(coverImageUrl?{coverImageUrl}:{}),...(coverEmoji?{coverEmoji}:{}),...(httpsUrl(raw.focusGifUrl,'Focus GIF')?{focusGifUrl:httpsUrl(raw.focusGifUrl,'Focus GIF')}:{}),focusGifEnabled:bool(raw.focusGifEnabled,true,'Focus GIF'),...(httpsUrl(raw.heroBackdropUrl,'Hero backdrop')?{heroBackdropUrl:httpsUrl(raw.heroBackdropUrl,'Hero backdrop')}:{}),...(httpsUrl(raw.heroVideoUrl,'Hero video')?{heroVideoUrl:httpsUrl(raw.heroVideoUrl,'Hero video')}:{}),...(httpsUrl(raw.titleLogoUrl,'Title logo')?{titleLogoUrl:httpsUrl(raw.titleLogoUrl,'Title logo')}:{}),sources:raw.sources.map(source)};
}
function collection(raw){
 allowed(raw,new Set(['id','title','folders','pinToTop','viewMode','showAllTab','focusGlowEnabled','backdropImageUrl']),'Collection');if(!Array.isArray(raw.folders))fail('Collection folders must be an array.');const viewMode=str(raw.viewMode,40,'Collection view',{required:true}).toUpperCase();if(!['TABBED_GRID','GRID','LIST','CAROUSEL'].includes(viewMode))fail('Collection view is unsupported.');const backdrop=httpsUrl(raw.backdropImageUrl,'Collection backdrop');return {id:str(raw.id,128,'Collection ID',{required:true}),title:str(raw.title,120,'Collection title',{required:true}),folders:raw.folders.map(folder),pinToTop:bool(raw.pinToTop,false,'Pin collection'),viewMode,showAllTab:bool(raw.showAllTab,true,'Show All tab'),focusGlowEnabled:bool(raw.focusGlowEnabled,true,'Focus glow'),...(backdrop?{backdropImageUrl:backdrop}:{})};
}

function normalizeUltraPlayCollections(value){
 if(!Array.isArray(value))fail('Collections must be an array.');let cleaned;try{cleaned=value.map(collection);}catch(error){if(error instanceof UltraPlayCollectionSyncError)throw error;throw error;}
 try{const check=validateCollections(cleaned,{side:'ultraplay-sync'});if(!check.valid){const first=check.entries.flatMap(entry=>entry.errors).at(0);fail(first?.message||'Collection data is invalid.',400,first?.code||'INVALID_COLLECTIONS');}}
 catch(error){if(error instanceof UltraPlayCollectionSyncError)throw error;if(error instanceof CollectionSchemaError)fail(error.message,error.code==='OVERSIZED_INPUT'?413:400,error.code);throw error;}
 const normalized=normalizeCollectionCatalogs(cleaned);return normalized;
}
function summary(collections){const normalized=normalizeUltraPlayCollections(collections);let folders=0,sources=0;for(const c of normalized){folders+=c.folders.length;for(const f of c.folders)sources+=f.sources.length;}return {collections:normalized.length,folders,sources,fingerprint:canonicalHash(normalized),bytes:Buffer.byteLength(JSON.stringify(normalized),'utf8'),normalized};}

module.exports={normalizeUltraPlayCollections,summarizeUltraPlayCollections:summary,UltraPlayCollectionSyncError,COLLECTION_LIMITS};
