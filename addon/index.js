require('dotenv').config();

const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const compression = require("compression");
const { CATALOG_DEFS } = require("./catalogs/catalog-defs");
const { QUICK_PICK_CATALOGS } = require("./catalogs/quick-picks");
const { DYNAMIC_CATALOGS } = require("./catalogs/dynamic-catalogs");
const { loadConfigs, saveConfigs } = require("./utils/config-store");
const { hashPassword, verifyPassword, generateToken } = require("./utils/auth");
const { rateLimit } = require("./utils/rate-limit");
const { checkAndRecord, clearKey } = require("./utils/rate-limit-store");
const { fetchCached, fetchTrakt } = require("./services/api-helpers");
const { streamBridgeResponse } = require("./services/stream-bridge");
const { resolveConfigForProfile } = require("./utils/profiles");
const { registerEmail, recoverToken } = require("./token-recovery");
const { getImdbId, getMovieCertification, filterByMaxRating, imdbToTmdbMovieId, filterMetasByMaxRating, getBestPoster, traktToMetas, resultsToMetas, mdblistToMetas } = require("./services/metadata-service");
const { geminiAiRecommendations, tmdbResolveAiItems } = require("./services/ai-service");
const PORT = process.env.PORT || 7000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const TMDB_KEY = process.env.TMDB_KEY;
const MDBLIST_KEYS = (process.env.MDBLIST_KEYS || process.env.MDBLIST_KEY || "").split(",").map(k => k.trim()).filter(Boolean);
const MDBLIST_KEY = MDBLIST_KEYS[0];
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const FILTER_ENABLED = process.env.FILTER_MODE !=="off";
const { handleTraktCatalog } = require("./services/trakt-service");
const { handleQuickPicks } = require("./services/quick-picks-service");
const { handleSearch } = require("./services/search-service");
const { buildTmdbCatalogUrl } = require("./services/tmdb-catalog-service");
const { registerAuthRoutes } = require("./services/auth-service");
const { registerCollectionsAddon } = require("./services/collections-addon-service");
const { handleRelatedContent } = require("./services/related-content-service");
const { handleCatalogSearch } = require("./services/catalog-search-service");
const { getStaticIds, buildManifestCatalogs, buildCatalogsFromIds } = require("./services/manifest-service");
const { handleMetaRequest } = require("./services/meta-handler-service");
const {
  isKitsuId,
  resolveKitsuStreamId
} = require("./services/kitsu-id-service");
const { checkStreamWizard } = require("./services/stream-wizard-service");
const { handleConfiguredMeta } = require("./services/meta-route-service");
const { handleNuvioManifest, handleCinemetaClone, handleMainManifest } = require("./services/manifest-route-service");
const { handleTmdbPreview } = require("./services/tmdb-preview-service");
const { registerConfigRoutes } = require("./services/config-route-service");
const { handleCatalog: handleCatalogService } = require("./services/catalog-handler-service");
const { registerCatalogRoutes } = require("./services/catalog-route-service");
const { registerCatalogInspectorRoutes } = require("./services/catalog-inspector-service");
const { registerStatsRoutes } = require("./services/stats-route-service");
const { verifyHandler } = require("./key-verify");
const { registerScrobbleRoute } = require("./services/scrobble-service");
const { registerCacheWarmRoute } = require("./services/cache-warm-service");

if (!TMDB_KEY) { console.error("TMDB_KEY missing - exiting"); process.exit(1); }

const staticIds = getStaticIds( CATALOG_DEFS, FILTER_ENABLED );
const builder = new addonBuilder({

  id: FILTER_ENABLED ?"com.ultramax" :"com.ultramax",
  version: require("./package.json").version,
  logo: `${BASE_URL}/logo.svg`,
  name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All Dev",
  description:"Premium curated catalogs for Stremio and Nuvio. Fast discovery, cleaner collections, and smarter rows.",
  types: ["movie","series"],
  resources: ["catalog","meta","stream"],
  catalogs: [
    { type:"movie",  id:"ultramax_placeholder", name:"Ultra MAX", extra: [{ name:"skip", isRequired: false }] }
  ]
});

const catalogDeps = {
  TMDB_KEY,
  TRAKT_CLIENT_ID,
  handleSearch,
  handleQuickPicks,
  handleRelatedContent,
  handleTraktCatalog,
  handleCatalogSearch,
  buildTmdbCatalogUrl,
  geminiAiRecommendations,
  tmdbResolveAiItems,
  fetchCached,
  filterByMaxRating,
  resultsToMetas,
  mdblistToMetas
};

const catalogRouteDeps = {
  FILTER_ENABLED,
  QUICK_PICK_CATALOGS,
  DYNAMIC_CATALOGS,
  staticIds,
  CATALOG_DEFS,
  buildManifestCatalogs,
  handleCatalogService,
  catalogDeps,
  loadConfigs,
  MDBLIST_KEY
};



builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log("SDK HANDLER:", id, extra);
try {
  return await handleCatalogService(
    id,
    type,
    extra,
    null,
    FILTER_ENABLED,
    "en-US",
    null,
    null,
    null,
    false,
    null,
    [],
    null,
    null,
    null,
    catalogDeps
  );
}

  catch (e) { console.log("catalog error", id, e.message); return { metas: [] }; }
});

builder.defineStreamHandler(async () => ({ streams: [] }));

builder.defineMetaHandler(async ({ type, id }) => {
  return await handleMetaRequest(
    { type, id },
    {
      TMDB_KEY,
      fetchCached
    }
  );
});

const addonInterface = builder.getInterface();
const app = express();

registerCatalogInspectorRoutes(app, {
  FILTER_ENABLED,
  handleCatalogService,
  catalogDeps,
  loadConfigs,
  MDBLIST_KEY
});
app.use(compression());
app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); if (req.method === "OPTIONS") return res.sendStatus(200); next(); });
app.use(express.json({limit:"10mb"}));

// Self-host: the frontend pages (setup.html, guide.html, etc.) are mounted
// read-only from ../web (see docker-compose.yml) and served directly by
// this same process — there's no separate reverse-proxy/static site in the
// self-host stack, unlike the production deployment.
app.use(express.static(path.join(__dirname, "web")));
registerCatalogRoutes(app, catalogRouteDeps);
registerConfigRoutes(app, {
  loadConfigs,
  saveConfigs,
  hashPassword,
  verifyPassword,
  generateToken,
  rateLimit,
  checkAndRecord,
  clearKey
});

registerStatsRoutes(app, {
  loadConfigs
});

// ================================
// ULTRA MAX STREAM WIZARD - PHASE 1
// Validate external Stremio manifest URLs
// ================================

app.post(
  "/api/stream-wizard/check",
  checkStreamWizard
);


// ============ SHARES SYSTEM ============
const SHARES_FILE = path.join(process.env.DATA_DIR || __dirname, "shares.json");

function loadShares(){
  try { return JSON.parse(fs.readFileSync(SHARES_FILE,'utf8')); }
  catch(e){ return []; }
}

function saveShares(shares){
  fs.writeFileSync(SHARES_FILE, JSON.stringify(shares, null, 2));
}

function genShareId(){
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for(let i=0;i<8;i++) id += chars[Math.floor(Math.random()*chars.length)];
  return id;
}

// POST /api/share — create a share
app.post('/api/share', (req, res) => {
  try {
    const { type, name, author, description, tags, requiredAddons, data, extraFiles } = req.body;
    if(!type || !name || !data) return res.status(400).json({ error: 'Missing fields' });
    if(!['collections','setup','full'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    const dataStr = JSON.stringify(data);
    if(dataStr.length > 500000) return res.status(400).json({ error: 'Too large' });

    // Auto-detect required addons from sources
    const allAddonIds = new Set();
    const dataArr = Array.isArray(data) ? data : (data.collections || []);
    dataArr.forEach(coll => {
      (coll.folders || []).forEach(folder => {
        (folder.sources || []).forEach(src => {
          if(src.addonId) allAddonIds.add(src.addonId);
        });
        (folder.catalogSources || []).forEach(src => {
          if(src.addonId) allAddonIds.add(src.addonId);
        });
      });
    });

    // Merge auto-detected with manually provided
    const ULTRAMAX_ADDON_ID = 'com.ultramax';
    const autoAddons = Array.from(allAddonIds).map(id => ({
      addonId: id,
      name: id === ULTRAMAX_ADDON_ID ? 'Ultra MAX' : id,
      manifestUrl: id === ULTRAMAX_ADDON_ID ? `${BASE_URL}/setup.html` : ''
    }));
    const manualAddons = Array.isArray(requiredAddons) ? requiredAddons : [];
    const mergedAddons = [...manualAddons];
    autoAddons.forEach(a => {
      if(!mergedAddons.find(m => m.addonId === a.addonId)) mergedAddons.push(a);
    });

    // Count folders and sources
    let folderCount = 0, sourceCount = 0;
    dataArr.forEach(coll => {
      folderCount += (coll.folders || []).length;
      (coll.folders || []).forEach(f => {
        sourceCount += (f.sources || f.catalogSources || []).length;
      });
    });

    // Get cover images
    const covers = [];
    dataArr.forEach(coll => {
      (coll.folders || []).forEach(f => {
        if(f.coverImageUrl && covers.length < 6) covers.push(f.coverImageUrl);
      });
    });

    const shares = loadShares();
    const id = genShareId();
    const share = {
      id,
      type,
      name: name.slice(0,80),
      author: (author||'Anonymous').slice(0,40),
      description: (description||'').slice(0,500),
      tags: Array.isArray(tags) ? tags.slice(0,10).map(t => String(t).slice(0,30).toLowerCase()) : [],
      requiredAddons: mergedAddons,
      covers,
      folderCount,
      sourceCount,
      data,
      extraFiles: Array.isArray(extraFiles) ? extraFiles : [],
      created: new Date().toISOString(),
      imports: 0,
      likes: 0
    };
    shares.unshift(share);
    if(shares.length > 500) shares.splice(500);
    saveShares(shares);
    res.json({ ok: true, id, url: `${BASE_URL}/gallery?share=` + id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/share/:id/like — like a share
app.post('/api/share/:id/like', (req, res) => {
  try {
    const shares = loadShares();
    const share = shares.find(s => s.id === req.params.id);
    if(!share) return res.status(404).json({ error: 'Not found' });
    share.likes = (share.likes||0) + 1;
    saveShares(shares);
    res.json({ ok: true, likes: share.likes });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/share/:id — fetch a share
app.get('/api/share/:id', (req, res) => {
  try {
    const shares = loadShares();
    const share = shares.find(s => s.id === req.params.id);
    if(!share) return res.status(404).json({ error: 'Not found' });
    // Increment import count
    share.imports = (share.imports||0) + 1;
    saveShares(shares);
    res.json(share);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shares — list recent shares
app.get('/api/shares', (req, res) => {
  try {
    const shares = loadShares();
    const type = req.query.type; // optional filter
    const filtered = type ? shares.filter(s => s.type === type) : shares;
    // Return without full data for listing
    const list = filtered.slice(0,100).map(s => ({
      id: s.id,
      type: s.type,
      name: s.name,
      author: s.author,
      description: s.description || '',
      tags: s.tags || [],
      requiredAddons: s.requiredAddons || [],
      covers: s.covers || [],
      folderCount: s.folderCount || 0,
      sourceCount: s.sourceCount || 0,
      extraFiles: (s.extraFiles || []).map(f => ({ name: f.name, type: f.type })),
      created: s.created,
      imports: s.imports||0,
      likes: s.likes||0
    }));
    res.json(list);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/share/:id/file/:filename — download an extra file
app.get('/api/share/:id/file/:filename', (req, res) => {
  try {
    const shares = loadShares();
    const share = shares.find(s => s.id === req.params.id);
    if(!share) return res.status(404).json({ error: 'Not found' });
    const file = (share.extraFiles || []).find(f => f.name === req.params.filename);
    if(!file) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="' + file.name + '"');
    res.send(JSON.stringify(file.data, null, 2));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/share/:id/like — like a share
app.post('/api/share/:id/like', (req, res) => {
  try {
    const shares = loadShares();
    const share = shares.find(s => s.id === req.params.id);
    if(!share) return res.status(404).json({ error: 'Not found' });
    share.likes = (share.likes||0) + 1;
    saveShares(shares);
    res.json({ ok: true, likes: share.likes });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /gallery — serve gallery page
app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'web', 'gallery.html'));
});
// ============ END SHARES SYSTEM ============

app.get("/health", (req, res) => { res.status(200).json({ ok: true, service: "ultra-max", timestamp: new Date().toISOString() }); });

// Key verification — frontend calls /verify/:provider?key=... -> {valid, message}
app.get("/verify/:provider", verifyHandler);

// Admin: inspect user config by token
app.get("/admin/inspect/:token", (req, res) => {
  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.STATS_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = req.params.token;
  const configs = loadConfigs();
  const config = configs[token];
  if (!config) {
    return res.status(404).json({ error: "Token not found" });
  }
  const { passwordHash, traktAccessToken, traktRefreshToken, simklAccessToken, ...safe } = config;
    const mdblistKey = safe.mdblistKey ? safe.mdblistKey.slice(0, 4) + "****" + safe.mdblistKey.slice(-4) : null;
    const rpdbKey = safe.rpdbKey ? safe.rpdbKey.slice(0, 4) + "****" : null;
    res.json({
      token,
      ...safe,
      mdblistKey,
      rpdbKey,
      catalogCount: (safe.catalogs || []).length,
      hiddenCount: (safe.hiddenCatalogs || []).length,
      trakt: {
        connected: !!traktAccessToken,
        username: safe.traktUser || null,
        expired: safe.traktTokenExpiry ? Date.now() > safe.traktTokenExpiry : false,
        expiresAt: safe.traktTokenExpiry ? new Date(safe.traktTokenExpiry).toISOString() : null
      },
      simkl: {
        connected: !!simklAccessToken,
        username: safe.simklUser || null
      },
      betterPosters: safe.betterPostersStyle || null,
      excludeLanguages: safe.excludeLanguages || [],
    });
  });


// Public: user can inspect their own token
app.get("/c/:token/inspect", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  const config = configs[token];
  if(!config) return res.status(404).json({ error: "Token not found" });
  const { passwordHash, traktAccessToken, traktRefreshToken, simklAccessToken, mdblistKey, rpdbKey, tpKey, fanartKey, omdbKey, googleAiKey, ...safe } = config;
  res.json({
    token: token.slice(0,4) + '****',
    catalogCount: (safe.catalogs || []).length,
    hiddenCount: (safe.hiddenCatalogs || []).length,
    language: safe.language || 'en-US',
    betterPosters: safe.betterPostersStyle || null,
    excludeLanguages: safe.excludeLanguages || [],
    excludeUnreleased: safe.excludeUnreleased || false,
    maxRating: safe.maxRating || null,
    keys: {
      mdblist: !!mdblistKey,
      rpdb: !!rpdbKey,
      topPosters: !!tpKey,
      fanart: !!fanartKey,
      omdb: !!omdbKey,
      googleAi: !!googleAiKey
    },
    trakt: {
      connected: !!traktAccessToken,
      username: safe.traktUser || null,
      expired: safe.traktTokenExpiry ? Date.now() > safe.traktTokenExpiry : false,
      expiresAt: safe.traktTokenExpiry ? new Date(safe.traktTokenExpiry).toISOString() : null
    },
    simkl: {
      connected: !!simklAccessToken,
      username: safe.simklUser || null
    },
    timestamp: safe.timestamp || null,
    streams: {
      debrid: safe.debridService ? {
        service: safe.debridService,
        cachedOnly: !!safe.debridCachedOnly,
        englishOnly: safe.debridEnglishOnly !== false,
        removeTrash: safe.debridRemoveTrash !== false,
        res4k: safe.debridRes4k !== false,
        res1080: safe.debridRes1080 !== false,
        res720: safe.debridRes720 !== false,
        res480: !!safe.debridRes480
      } : null,
      manualCount: (safe.streamAddons || []).length
    }
  });
});

app.get("/trending", (req, res) => {
  const fs = require("fs");
  try {
    const configs = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR || __dirname, "configs.json"), "utf8"));
    const counts = {};
    for(const token of Object.values(configs)){
      const catalogs = token.catalogs || [];
      for(const id of catalogs){
        counts[id] = (counts[id] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts)
      .sort((a,b) => b[1]-a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ id, count }));
    res.json({ trending: sorted, total: Object.keys(configs).length });
  } catch(e) {
    res.json({ trending: [], total: 0 });
  }
});

app.get("/stats", (req, res) => {
  const fs = require("fs");
  try {
    const configs = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR || __dirname, "configs.json"), "utf8"));
    res.json({ users: Object.keys(configs).length });
  } catch(e) {
    res.json({ users: 0 });
  }
});

app.get("/assets", (req, res) => {
  const fs = require("fs");

  const folders = [
    { label: "Main", dir: process.env.IMAGES_DIR || path.join(__dirname, "images"), prefix: "/images/" },
    { label: "Quick", dir: process.env.QUICK_IMAGES_DIR || path.join(__dirname, "images", "quick"), prefix: "/images/quick/" }
  ];

  let allFiles = [];
  for(const folder of folders){
    try {
      const files = fs.readdirSync(folder.dir)
        .filter(f => /\.(png|jpe?g|webp|gif|svg)$/i.test(f))
        .sort()
        .map(f => ({ name: f, label: folder.label, url: folder.prefix + encodeURIComponent(f) }));
      allFiles = allFiles.concat(files);
    } catch(e) {}
  }

  const mode = req.query.mode || 'cover';
  const ci = req.query.ci || '';
  const fi = req.query.fi || '';
  const returnTo = req.query.returnTo || '';

  const cards = allFiles.map(f => {
    const safeName = String(f.name).replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return `<div class="card" data-name="${safeName.toLowerCase()}" data-folder="${f.label.toLowerCase()}">
      <img src="${f.url}" loading="lazy">
      <div class="name">${safeName}</div>
      <div class="folder-tag">${f.label}</div>
      <button type="button" data-url="${f.url}">Use Image</button>
    </div>`;
  }).join("");

  const html = `<!doctype html>
<html>
<head>
<title>Ultra MAX Asset Library</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#080810;color:#e0e0f0;font-family:sans-serif;min-height:100vh;}
  header{background:#0f0f1e;border-bottom:1px solid #1e1e36;padding:14px 16px;position:sticky;top:0;z-index:100;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .logo{font-size:1rem;font-weight:700;color:#fff;white-space:nowrap;}
  .logo span{color:#7B2FFF;}
  .search{flex:1;min-width:180px;background:#12121f;border:1px solid #2a2a45;color:#e0e0f0;font-size:14px;padding:9px 12px;border-radius:8px;outline:none;}
  .search:focus{border-color:#7B2FFF;}
  .search::placeholder{color:#7070a0;}
  .tabs{display:flex;gap:6px;}
  .tab{background:transparent;border:1px solid #2a2a45;color:#7070a0;font-size:11px;font-weight:600;padding:6px 10px;border-radius:6px;cursor:pointer;}
  .tab.active{border-color:#7B2FFF;color:#9B5FFF;}
  .count{font-size:12px;color:#7070a0;}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;padding:16px;}
  .card{border:1px solid #1e1e36;border-radius:10px;overflow:hidden;background:#12121f;}
  .card:hover{border-color:#7B2FFF;}
  .card img{width:100%;height:100px;object-fit:cover;display:block;background:#0f0f1e;}
  .name{font-size:10px;color:#7070a0;padding:5px 8px 1px;word-break:break-all;line-height:1.3;}
  .folder-tag{font-size:9px;color:#7B2FFF;padding:0 8px 4px;font-weight:600;}
  .card button{width:100%;padding:7px;background:rgba(123,47,255,.15);color:#9B5FFF;border:0;border-top:1px solid #1e1e36;cursor:pointer;font-size:12px;font-weight:600;}
  .card button:hover{background:rgba(123,47,255,.3);}
  .card.hidden{display:none;}
  .empty{text-align:center;padding:60px;color:#7070a0;}
</style>
</head>
<body>
<header>
  <div class="logo">ULTRA <span>MAX</span> Assets</div>
  <input class="search" type="text" id="searchBox" placeholder="Search images..." oninput="filterImages()">
  <div class="tabs">
    <button class="tab active" onclick="setFilter('all',this)">All</button>
    <button class="tab" onclick="setFilter('main',this)">Main</button>
    <button class="tab" onclick="setFilter('quick',this)">Quick</button>
    <button class="tab" onclick="setFilter('.gif',this)">GIFs</button>
  </div>
  <div class="count" id="countLabel">${allFiles.length} images</div>
</header>
<div class="grid" id="grid">${cards}</div>
<div class="empty" id="emptyMsg" style="display:none;">No images found</div>
<script>
var currentFilter='all';
var returnTo='${returnTo}';
var mode='${mode}';
var ci=${ci||'null'};
var fi=${fi||'null'};

function setFilter(f,el){
  currentFilter=f;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  filterImages();
}

function filterImages(){
  var q=document.getElementById('searchBox').value.toLowerCase();
  var cards=document.querySelectorAll('.card');
  var visible=0;
  cards.forEach(function(card){
    var name=card.getAttribute('data-name')||'';
    var folder=card.getAttribute('data-folder')||'';
    var matchSearch=!q||name.includes(q);
    var matchFilter=currentFilter==='all'||folder.includes(currentFilter)||name.includes(currentFilter);
    if(matchSearch&&matchFilter){card.classList.remove('hidden');visible++;}
    else{card.classList.add('hidden');}
  });
  document.getElementById('countLabel').textContent=visible+' images';
  document.getElementById('emptyMsg').style.display=visible===0?'block':'none';
}

document.querySelectorAll('button[data-url]').forEach(function(btn){
  btn.addEventListener('click',function(){
    var full=window.location.origin+btn.getAttribute('data-url');
    if(window.parent !== window && ci!==null && fi!==null){
      window.parent.postMessage({type:'assetPick',ci:ci,fi:fi,url:full,mode:mode},'*');
    } else if(returnTo&&returnTo!=='null'&&returnTo!==''&&ci!==null&&fi!==null){
      localStorage.setItem('ultramaxAssetPick',JSON.stringify({ci:ci,fi:fi,url:full,mode:mode}));
      window.location.href=returnTo;
    } else {
      var ta=document.createElement('textarea');
      ta.value=full;
      ta.style.position='fixed';
      ta.style.opacity='0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try{ document.execCommand('copy'); }catch(e){}
      document.body.removeChild(ta);
      btn.textContent='✅ Copied!';
      btn.style.background='rgba(0,210,160,.25)';
      btn.style.color='#00d2a0';
      setTimeout(function(){
        btn.textContent='Use Image';
        btn.style.background='';
        btn.style.color='';
      },2500);
    }
  });
});
</script>
</body>
</html>`;
  res.send(html);
});
;

app.get("/configure", (req, res) => { res.setHeader("Cache-Control","public, max-age=300"); res.sendFile(path.join(__dirname,"configure.html")); });
app.get("/configure/:token", (req, res) => { res.setHeader("Cache-Control","public, max-age=300"); res.sendFile(path.join(__dirname,"configure.html")); });
app.get("/c/:token/configure", (req, res) => { res.redirect(`/configure/${req.params.token}`); });
app.get("/logo.svg", (req, res) => { res.sendFile(path.join(__dirname,"logo.svg")); });
app.get("/collections-builder", (req, res) => { res.sendFile(path.join(__dirname,"collections-builder.html")); });

// ULTRAMAX USER AVATAR UPLOAD START

const USER_AVATAR_DIR =
  path.join(process.env.DATA_DIR || __dirname, "user-avatars");

const USER_AVATAR_PUBLIC_BASE =
  `${BASE_URL}/images/user-avatars`;

const avatarUploadTimes = new Map();

fs.mkdirSync(USER_AVATAR_DIR, {
  recursive: true
});

app.post("/api/avatar-upload", async (req, res) => {
  try {
    const forwarded =
      req.headers["x-forwarded-for"];

    const clientIp =
      (
        Array.isArray(forwarded)
          ? forwarded[0]
          : String(forwarded || "")
              .split(",")[0]
              .trim()
      ) ||
      req.socket.remoteAddress ||
      "unknown";

    const now = Date.now();
    const previousUpload =
      avatarUploadTimes.get(clientIp) || 0;

    /*
      One upload every five seconds per IP.
      Enough for normal use, but slows down obvious abuse.
    */
    if (now - previousUpload < 5000) {
      return res.status(429).json({
        error:
          "Please wait a few seconds before uploading another avatar."
      });
    }

    const imageData =
      typeof req.body?.imageData === "string"
        ? req.body.imageData
        : "";

    if (!imageData) {
      return res.status(400).json({
        error: "No avatar image was supplied."
      });
    }

    const match = imageData.match(
      /^data:image\/webp;base64,([A-Za-z0-9+/=\r\n]+)$/
    );

    if (!match) {
      return res.status(400).json({
        error: "Avatar must be supplied as a WebP image."
      });
    }

    let buffer;

    try {
      buffer = Buffer.from(
        match[1].replace(/\s/g, ""),
        "base64"
      );
    } catch (error) {
      return res.status(400).json({
        error: "The uploaded avatar data is invalid."
      });
    }

    if (!buffer.length) {
      return res.status(400).json({
        error: "The uploaded avatar is empty."
      });
    }

    const MAX_AVATAR_BYTES =
      2 * 1024 * 1024;

    if (buffer.length > MAX_AVATAR_BYTES) {
      return res.status(413).json({
        error: "Avatar must be smaller than 2 MB."
      });
    }

    /*
      WebP files begin with:
      RIFF....WEBP
    */
    const isWebp =
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP";

    if (!isWebp) {
      return res.status(400).json({
        error: "The uploaded file is not a valid WebP image."
      });
    }

    const fileName =
      crypto.randomBytes(18).toString("hex") +
      ".webp";

    const finalPath =
      path.join(USER_AVATAR_DIR, fileName);

    const temporaryPath =
      finalPath + ".tmp";

    await fs.promises.writeFile(
      temporaryPath,
      buffer,
      {
        mode: 0o644,
        flag: "wx"
      }
    );

    await fs.promises.rename(
      temporaryPath,
      finalPath
    );

    avatarUploadTimes.set(
      clientIp,
      now
    );

    /*
      Prevent the in-memory rate-limit map growing forever.
    */
    if (avatarUploadTimes.size > 5000) {
      const cutoff =
        now - 60 * 60 * 1000;

      for (
        const [ip, timestamp]
        of avatarUploadTimes.entries()
      ) {
        if (timestamp < cutoff) {
          avatarUploadTimes.delete(ip);
        }
      }
    }

    return res.status(201).json({
      ok: true,
      url:
        USER_AVATAR_PUBLIC_BASE +
        "/" +
        fileName
    });
  } catch (error) {
    console.error(
      "Avatar upload failed:",
      error
    );

    return res.status(500).json({
      error: "The avatar could not be uploaded."
    });
  }
});

// ULTRAMAX USER AVATAR UPLOAD END

// ULTRAMAX USER AVATAR STATIC ROUTE START
app.use(
  "/images/user-avatars",
  express.static(
    path.join(process.env.DATA_DIR || __dirname, "user-avatars"),
    {
      maxAge: "7d",
      etag: true,
      fallthrough: true
    }
  )
);
// ULTRAMAX USER AVATAR STATIC ROUTE END

app.use(
  "/images",
  express.static(path.join(__dirname, "bundled-images"), {
    maxAge: "7d",
    etag: true
  })
);

app.use("/images", express.static(process.env.IMAGES_DIR || path.join(__dirname, "images"), { maxAge: '7d', etag: true }));
app.use("/images/quick", express.static(process.env.QUICK_IMAGES_DIR || path.join(__dirname, "images", "quick"), { maxAge: '7d', etag: true }));
app.get("/collections.json", (req, res) => { res.sendFile(path.join(__dirname,"collections.json")); });
app.get("/catalog-defs.json", (req, res) => {
  res.setHeader("Cache-Control","public, max-age=3600");
  res.json(CATALOG_DEFS);
});

app.post("/api/ai/custom-row", async (req, res) => {
  try {
    const { prompt, count = 1, googleAiKey, traktUser = null, language: rowLanguage = "en-US" } = req.body || {};
    const watchRegion = (rowLanguage.split("-")[1] || "US").toUpperCase();
    const key = googleAiKey || process.env.GOOGLE_AI_KEY || process.env.GEMINI_KEY || null;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Missing prompt" });
    }
    
    if (!key) {
      // 🔁 Fallback: simple parser (no AI key needed)
      const lower = prompt.toLowerCase();

      const isSeries = lower.includes("series") || lower.includes("shows") || lower.includes("tv");
      const type = isSeries ? "series" : "movie";
      const tmdbType = isSeries ? "tv" : "movie";

      const genreMap = {
        "romantic comedy": "10749,35", "rom com": "10749,35",
        action: "28", adventure: "12", animation: "16", comedy: "35",
        crime: "80", documentary: "99", drama: "18", family: "10751",
        fantasy: "14", history: "36", horror: "27", music: "10402",
        mystery: "9648", romance: "10749", "sci-fi": "878", scifi: "878",
        "science fiction": "878", thriller: "53", war: "10752", western: "37",
        anime: "16", superhero: "28"
      };

      const streamingMap = {
        netflix: "8", amazon: "9", "prime video": "9", "amazon prime": "9",
        "disney+": "337", disney: "337", hulu: "15", "hbo max": "1899",
        hbo: "1899", "apple tv": "2", "apple tv+": "2", "paramount+": "531",
        peacock: "386", crunchyroll: "283", "bbc iplayer": "38", bbc: "38",
        "channel 4": "103", itvx: "41", mubi: "11"
      };

      const ukProviders = ["38","103","41","11"];

      let genre = "";
      for (const g in genreMap){ if (lower.includes(g)){ genre = genreMap[g]; break; } }

      let watchProvider = "", watchRegionFinal = watchRegion;
      for (const s in streamingMap){
        if (lower.includes(s)){
          watchProvider = streamingMap[s];
          if (ukProviders.includes(watchProvider)) watchRegionFinal = "GB";
          break;
        }
      }

      let keyword = "";
      const keywordMatch = lower.match(/"([^"]+)"|about\s+(\w+)/);
      if (keywordMatch) {
        keyword = keywordMatch[1] || keywordMatch[2] || "";
      } else {
        // Detect common theme keywords
        const themeKeywords = ['time travel','zombie','vampire','werewolf','superhero','heist','survival','post-apocalyptic','post apocalyptic','dystopian','space exploration','outer space','serial killer','true crime','coming of age','road trip','martial arts','kung fu','pirates','vikings','mythology','fairy tale','haunted','ghost','alien invasion','time loop','artificial intelligence'];
        for(const kw of themeKeywords){
          if(lower.includes(kw)){ keyword = kw; break; }
        }
      }

      let rating = "";
      const ratingMatch = lower.match(/(?:above|over|rating)\s*(\d+(\.\d+)?)/);
      if (ratingMatch) rating = ratingMatch[1];

      let yearFrom = "", yearTo = "";
      const fullDecadeMatch = lower.match(/(19\d{2}|20\d{2})s/);
      const shortDecadeMatch = lower.match(/\b(70|80|90|00|10|20)s\b/);
      const afterMatch = lower.match(/after\s+(\d{4})/);
      const beforeMatch = lower.match(/before\s+(\d{4})/);

      if (fullDecadeMatch) {
        yearFrom = fullDecadeMatch[1]; yearTo = String(Number(yearFrom) + 9);
      } else if (shortDecadeMatch) {
        const d = shortDecadeMatch[1];
        const decMap = {"70":"1970","80":"1980","90":"1990","00":"2000","10":"2010","20":"2020"};
        yearFrom = decMap[d] || ""; yearTo = yearFrom ? String(Number(yearFrom) + 9) : "";
      } else if (afterMatch) {
        yearFrom = afterMatch[1];
      } else if (beforeMatch) {
        yearTo = beforeMatch[1];
      }
      let personName = "";
      const personMatch = lower.match(/(?:starring|directed by|by|from|with)\s+([a-z]+ [a-z]+)/i);
      if (personMatch) {
        personName = personMatch[1];
      } else {
        // If prompt looks like just a person name (2-3 words, no genre/streaming/decade detected)
        const words = lower.trim().split(/\s+/);
        const strippedLower = lower.replace(/\b(movies?|films?|series|shows?|tv|television)\b/g,'').trim();
        const hasCategory = genre || watchProvider || yearFrom;
        const looksLikeName2 = strippedLower.length > 0 && /^[a-z]+ [a-z]+/.test(strippedLower) && strippedLower.split(/\s+/).length <= 3;
        const notAName = ['time travel','outer space','world war','cold war','true crime','based on','coming of age','post apocalyptic','super hero','martial arts','road trip','real life','new york','los angeles','high school','middle earth','fairy tale','science fiction','serial killer','zombie apocalypse','video game','comic book','buddy cop'];
        const isNotAName = notAName.some(n => strippedLower.includes(n));
        const looksLikeName = looksLikeName2 && !hasCategory && !isNotAName;
        if(looksLikeName) personName = strippedLower.trim();
      }


      return res.json({
        rows: [{
          name: prompt,
          type,
          source: "tmdb_discover",
          tmdbType,
          withGenres: genre,
          withWatchProviders: watchProvider,
          watchRegion: watchRegionFinal,
          voteAverageGte: rating,
          yearFrom,
          yearTo,
          personName,
          keyword,
          language: rowLanguage
        }]
      });
    }
    const wanted = Math.max(1, Math.min(Number(count) || 1, 5));

    const aiPrompt = `
You are helping build custom Stremio/Nuvio homepage catalog rows.

Return ONLY valid JSON. No markdown.

Create ${wanted} custom catalog row objects for this idea:
"${prompt}"

Trakt username, optional context: ${traktUser || "none"}

Each object must use this exact shape:
{
  "name": "Short row title",
  "type": "movie" or "series",
  "source": "tmdb_discover",
  "tmdbType": "movie" or "tv",
  "sortBy": "popularity.desc",
  "withGenres": "",
  "withoutGenres": "",
  "yearFrom": "",
  "yearTo": "",
  "voteAverageGte": "",
  "withCast": "",
  "withCrew": "",
  "withCompanies": "",
  "withNetworks": "",
  "withWatchProviders": "",
  "watchRegion": "${watchRegion}",
  "language": "${rowLanguage}"
}

Rules:
- Use source "tmdb_discover".
- For movies use type "movie" and tmdbType "movie".
- For series use type "series" and tmdbType "tv".
- Prefer GB watch region.
- Use TMDB genre IDs where obvious.
- If the prompt asks for an actor, put their TMDB person ID in withCast if you know it, otherwise leave blank.
- If unsure, keep fields blank rather than inventing bad IDs.
- Return an array only.
`;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: aiPrompt }] }]
      })
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(r.status).json({ error: "Gemini request failed", details: raw.slice(0, 500) });
    }

    const data = JSON.parse(raw);
    let text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || "";
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    const rows = JSON.parse(text);

    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: "AI did not return an array", raw: text.slice(0, 500) });
    }

    res.json({ rows: rows.slice(0, wanted) });
  } catch (err) {
    console.error("AI custom row route failed:", err);
    res.status(500).json({ error: err.message || "AI custom row route failed" });
  }
});

app.get("/api/search-title", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "Missing query" });
    const r = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}`);
    const data = await r.json();
    const results = (data.results || [])
      .filter(item => item.media_type === "movie" || item.media_type === "tv")
      .slice(0, 8)
      .map(item => ({
        tmdbId: item.id,
        mediaType: item.media_type,
        title: item.title || item.name || "",
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : null
      }));
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message || "Search failed" });
  }
});

app.get("/api/title-imdb-id", async (req, res) => {
  try {
    const tmdbId = req.query.tmdbId;
    const mediaType = req.query.mediaType === "tv" ? "tv" : "movie";
    if (!tmdbId) return res.status(400).json({ error: "Missing tmdbId" });
    const r = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`);
    const data = await r.json();
    if (!data.imdb_id) return res.status(404).json({ error: "No IMDb ID found" });
    res.json({ imdbId: data.imdb_id });
  } catch (err) {
    res.status(500).json({ error: err.message || "Lookup failed" });
  }
});
// Search public MDBLists by name — proxied server-side since the MDBList
// API has no CORS headers for direct browser calls from setup.html.
app.get("/api/mdblist-search", async (req, res) => {
  try {
    const apikey = (req.query.apikey || "").trim();
    const query = (req.query.query || "").trim();
    if (!apikey) return res.status(400).json({ error: "Missing MDBList API key" });
    if (!query) return res.json({ results: [] });

    const r = await fetch(`https://mdblist.com/api/lists/user/?apikey=${encodeURIComponent(apikey)}&search=${encodeURIComponent(query)}`);
    const data = await r.json();

    if (!Array.isArray(data)) {
      return res.json({ results: [], error: data?.error || null });
    }

    const results = data.slice(0, 25).map(l => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      user: l.user_name || l.user || null,
      mediatype: l.mediatype || null,
      items: l.items || 0,
      likes: l.likes || 0,
      description: l.description || ""
    }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message || "MDBList search failed" });
  }
});

// Resolve a raw MDBList numeric list id to its display name — used by
// setup.html to label legacy catalog ids (e.g. "mdb_88307") that predate
// CATALOG_DEFS' human-readable slugs and aren't covered by MDB_ID_ALIASES.
// Cached in memory since list names essentially never change.
const mdbListNameCache = new Map();
app.get("/api/mdblist-name/:id", async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: "Invalid list id" });

  if (mdbListNameCache.has(id)) return res.json(mdbListNameCache.get(id));

  try {
    const r = await fetch(`https://mdblist.com/api/lists/${id}/?apikey=${MDBLIST_KEY}`);
    const data = await r.json();
    const list = Array.isArray(data) ? data[0] : data;
    if (!list || !list.name) return res.status(404).json({ error: "List not found" });

    const result = { name: list.name, mediatype: list.mediatype || null };
    mdbListNameCache.set(id, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || "MDBList lookup failed" });
  }
});

app.post("/api/verify-debrid-key", async (req, res) => {
  const { service, apiKey } = req.body || {};
  if (!service || !apiKey) return res.status(400).json({ valid: false, error: "Missing service or apiKey" });
  try {
    let checkUrl, headers = {};
    if (service === "torbox") {
      checkUrl = "https://api.torbox.app/v1/api/user/me";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (service === "realdebrid") {
      checkUrl = "https://api.real-debrid.com/rest/1.0/user";
      headers = { Authorization: `Bearer ${apiKey}` };
    } else if (service === "alldebrid") {
      checkUrl = `https://api.alldebrid.com/v4/user?agent=ultramax&apikey=${encodeURIComponent(apiKey)}`;
    } else if (service === "premiumize") {
      checkUrl = `https://www.premiumize.me/api/account/info?apikey=${encodeURIComponent(apiKey)}`;
    } else {
      return res.json({ valid: null, note: "Verification not available for this provider" });
    }
    const r = await fetch(checkUrl, { headers });
    const data = await r.json().catch(() => ({}));
    let valid = r.ok;
    if (service === "alldebrid" && data.status !== "success") valid = false;
    if (service === "premiumize" && data.status !== "success") valid = false;
    res.json({ valid });
  } catch (err) {
    res.json({ valid: null, error: err.message || "Verification failed" });
  }
});


app.get("/n/:token/manifest.json", (req, res) =>
  handleNuvioManifest(req, res, {
    loadConfigs,
    saveConfigs,
    buildCatalogsFromIds,
    QUICK_PICK_CATALOGS,
  CATALOG_DEFS
  })
);

app.get(
  "/cinemeta-clone/manifest.json",
  handleCinemetaClone
);


app.get("/public-manifest.json", (req, res) => {
  const catalogs = buildCatalogsFromIds(
    Object.keys(CATALOG_DEFS),
    [],
    QUICK_PICK_CATALOGS,
    CATALOG_DEFS
  ).map(c => ({
    type: c.type,
    id: c.id,
    name: c.name,
    extra: [{ name: "skip", isRequired: false }]
  }));
  res.json({
    id: "com.ultramax",
    version: require("./package.json").version,
    name: "Ultra MAX",
    description: "Ultra MAX — curated discovery catalogs for Nuvio and Stremio.",
    logo: `${BASE_URL}/logo.svg`,
    types: ["movie", "series"],
    idPrefixes: ["tt", "tmdb"],
    resources: ["catalog", "meta", "stream"],
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    },
    catalogs
  });
});

app.get("/c/:token/manifest.json", (req, res) =>
  handleMainManifest(req, res, {
    loadConfigs,
    saveConfigs,
    buildCatalogsFromIds,
    QUICK_PICK_CATALOGS,
  CATALOG_DEFS
  })
);

app.get("/c/:token/meta/:type/:id.json", (req, res) =>
  handleConfiguredMeta(req, res, {
    loadConfigs,
    fetchCached,
    TMDB_KEY
  })
);

app.get("/meta/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  try {
    const tmdbType = type ==="series" ?"tv" :"movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    if (!result) return res.json({ meta: { id, type } });
    const tmdbId = result.id;
    const d = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`);
    if (!d) return res.json({ meta: { id, type } });
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);
    const meta = { id, type, name: d.title || d.name, description: d.overview, poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null, background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null, releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null, imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null, genres: (d.genres || []).map(g => g.name), cast };
    res.json({ meta });
  } catch (e) { res.json({ meta: { id, type } }); }
});

app.get("/stream/:type/:id.json", async (req, res) => {
  // Dev fallback: no token config, no stream addons.
  res.json({ streams: [] });
});

app.get("/c/:token/stream/:type/:id.json", async (req, res) => {
  const { token, type, id } = req.params;
  const configs = loadConfigs();
  const baseConfig = configs[token];

  if (!baseConfig) return res.json({ streams: [] });

  // A device profile (?profile=<id>) layers its overrides (quality/size
  // caps, display formatting) on top of the base config — see utils/profiles.js.
  const config = resolveConfigForProfile(baseConfig, req.query.profile);

  // Auto-generate Comet URL from debrid config if set
  let streamAddons = config.streamAddons || [];
  // Support both new array format and legacy single provider
  const activeDebridServices = Array.isArray(config.debridServices) && config.debridServices.length
    ? config.debridServices
    : (config.debridService && config.debridApiKey ? [{ service: config.debridService, apiKey: config.debridApiKey }] : []);
  if(activeDebridServices.length) {
    const cometConfig = {
      maxResultsPerResolution: 3,
      // ULTRA MAX MAX STREAM SIZE
      maxSize:
          Number.isFinite(Number(config.debridMaxSizeGb)) &&
          Number(config.debridMaxSizeGb) > 0
            ? Math.min(Number(config.debridMaxSizeGb), 500) *
              1024 * 1024 * 1024
            : 0,
      cachedOnly: config.debridCachedOnly || false,
      sortCachedUncachedTogether: false,
      removeTrash: config.debridRemoveTrash !== false,
      resultFormat: ['title','video_info','quality_info','size'],
      debridServices: activeDebridServices,
      enableTorrent: false,
      deduplicateStreams: true,
      scrapeDebridAccountTorrents: false,
      debridStreamProxyPassword: '',
      languages: config.debridEnglishOnly !== false
        ? { required: [], allowed: ['en'], exclude: [], preferred: ['en'] }
        : { required: [], allowed: [], exclude: [], preferred: [] },
      resolutions: {
        "2160p": config.debridRes4k !== false,
        "1080p": config.debridRes1080 !== false,
        "720p": config.debridRes720 !== false,
        "480p": !!config.debridRes480
      },
      options: { remove_ranks_under: -10000000000, allow_english_in_languages: true, remove_unknown_languages: false }
    };
    const blob = Buffer.from(JSON.stringify(cometConfig)).toString('base64');
    const cometUrl = 'https://comet.feels.legal/' + blob + '/manifest.json';
    streamAddons = [cometUrl, ...streamAddons.filter(u => !u.includes('comet.feels.legal') && !u.includes('comet.maxbase'))];
  }
  let streamId = id;

  if (isKitsuId(id)) {
    streamId = await resolveKitsuStreamId(id, {
      TMDB_KEY,
      fetchCached
    });

    if (!streamId) {
      console.warn("No safe stream mapping for Kitsu ID:", id);
      return res.json({ streams: [] });
    }
  }

  const result = await streamBridgeResponse(
    streamAddons,
    type,
    streamId,
    config.streamFormat
  );

  res.json(result);
});

app.get("/preview/tmdb", handleTmdbPreview);

// Resolve TMDB IDs for builder (person, collection, keyword)
app.get("/resolve/tmdb", async (req, res) => {
  const { type, query } = req.query;
  if(!type || !query) return res.json({ error: 'Missing type or query' });
  try {
    if(type === 'person') {
      const r = await fetch(`https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`);
      const d = await r.json();
      const p = (d.results || [])[0];
      if(!p) return res.json({ error: 'Not found' });
      return res.json({ id: p.id, name: p.name, photo: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null });
    }
    if(type === 'collection') {
      const r = await fetch(`https://api.themoviedb.org/3/search/collection?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`);
      const d = await r.json();
      const q = query.toLowerCase().trim();
      const results = d.results || [];
      // Score by how closely the name matches the query
      const scored = results.map(x => {
        const name = x.name.toLowerCase().replace(' collection','').replace('the ','').trim();
        const qClean = q.replace('the ','').trim();
        let score = 0;
        if(name === qClean) score = 100;
        else if(name.startsWith(qClean)) score = 80;
        else if(qClean.startsWith(name)) score = 70;
        else if(name.includes(qClean)) score = 50;
        return { ...x, score };
      }).sort((a,b) => b.score - a.score);
      const c = scored[0];
      if(!c) return res.json({ error: 'Not found' });
      return res.json({ id: c.id, name: c.name, poster: c.poster_path ? `https://image.tmdb.org/t/p/w342${c.poster_path}` : null });
    }
    if(type === 'keyword') {
      const r = await fetch(`https://api.themoviedb.org/3/search/keyword?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}&page=1`);
      const d = await r.json();
      const k = (d.results || []).find(x => x.name.toLowerCase() === query.toLowerCase()) || (d.results || [])[0];
      if(!k) return res.json({ error: 'Not found' });
      return res.json({ id: k.id, name: k.name });
    }
    return res.json({ error: 'Unknown type' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
});

// On startup: remove configs not accessed in 180 days
(function cleanupStaleConfigs() {
  try {
    const configs = loadConfigs();
    const now = Date.now();
    const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
    let removed = 0;
    for (const [token, config] of Object.entries(configs)) {
      const lastSeen = config.lastAccessed || config.updatedAt || config.createdAt;
      if (!lastSeen) continue;
      if (now - new Date(lastSeen).getTime() > EXPIRY_MS) {
        delete configs[token];
        removed++;
      }
    }
    if (removed > 0) {
      saveConfigs(configs);
      console.log(`Startup cleanup: removed ${removed} stale config(s) (180+ days inactive)`);
    }
  } catch(e) {
    console.error("Startup config cleanup failed:", e.message);
  }
})();

const PREWARM_LISTS = ['92337','91304','91303','91302','91300','91301','86710','88307','88309','3087','3091'];
setTimeout(async () => {
  console.log('Pre-warming MDBList cache...');
  for (const id of PREWARM_LISTS) {
    try {
      await fetchCached(`https://mdblist.com/api/lists/${id}/items/?apikey=${MDBLIST_KEY}&limit=20&type=movie`);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {}
  }
  console.log('Cache pre-warm complete');
}, 5000);

registerScrobbleRoute(app, { loadConfigs, TMDB_KEY, fetchCached });
registerCacheWarmRoute(app, {
  loadConfigs,
  CATALOG_DEFS,
  QUICK_PICK_CATALOGS,
  handleCatalogService,
  catalogDeps,
  FILTER_ENABLED,
  MDBLIST_KEY
});
registerAuthRoutes(app, { loadConfigs, saveConfigs });
registerCollectionsAddon(app, { TMDB_KEY, fetchCached, resultsToMetas, filterByMaxRating, buildTmdbCatalogUrl, geminiAiRecommendations, tmdbResolveAiItems, handleSearch, handleQuickPicks, handleRelatedContent, handleTraktCatalog, handleCatalogSearch, mdblistToMetas });

// Token recovery routes
app.post("/api/register-email", registerEmail(loadConfigs));
app.post("/api/recover-token", recoverToken());

app.listen(PORT,"0.0.0.0", () => {
  console.log(`Ultra MAX v7.0.0-beta running on port ${PORT}`);
  console.log(`Total catalog defs: ${Object.keys(CATALOG_DEFS).length}`);
  console.log(`Static catalogs: ${staticIds.length}`);
});
