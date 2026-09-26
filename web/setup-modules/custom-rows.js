let customCatalogs = [];
let customMdbLists = [];

// Check for rows pre-loaded from Catalog Builder
(function(){
  try {
    const builderRows = sessionStorage.getItem('builderRows');
    if(builderRows){
      const rows = JSON.parse(builderRows);
      if(Array.isArray(rows) && rows.length){
        customCatalogs = rows;
        sessionStorage.removeItem('builderRows');
      }
    }
  } catch(e){}
})();

function getCustomCatalogsFromForm(){
  return Array.isArray(customCatalogs) ? customCatalogs : [];
}

function getCustomMdbListsFromForm(){
  return Array.isArray(customMdbLists) ? customMdbLists : [];
}

function showCustomCatalogs(){
  const el = document.getElementById('customCatalogsSection');
  if(el) el.style.display = 'block';
}

function openCustomCatalogModal(){
  const modal = document.getElementById('customCatalogModal');
  if(!modal) return;
  document.getElementById('customCatalogName').value = '';
  document.getElementById('customCatalogType').value = 'movie';
  document.getElementById('customCatalogSource').value = 'imdb';
  renderCustomSourceFields();
  modal.style.display = 'flex';
}

function closeCustomCatalogModal(){
  const modal = document.getElementById('customCatalogModal');
  if(modal) modal.style.display = 'none';
}

function createCustomCatalog(){
  openCustomCatalogModal();
}

function renderCustomSourceFields(){
  const source =
    (document.getElementById('customCatalogSource') || {}).value ||
    'imdb';

  const box = document.getElementById('customCatalogSourceFields');
  if(!box) return;

  const inputStyle =
    "width:100%;min-height:120px;padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;";

  if(source === 'imdb'){
    box.innerHTML = `
      <label style="display:grid;gap:6px;margin-bottom:12px;">
        <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.imdb.searchLabel','🔍 Search for a title')}</span>
        <input
          id="customCatalogSearchInput"
          type="text"
          placeholder="${umT('setup.customCatalogBuilder.imdb.searchPlaceholder','Type a movie or show name...')}"
          oninput="debouncedTitleSearch()"
          style="width:100%;padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
        >
      </label>

      <div
        id="customCatalogSearchResults"
        style="display:none;max-height:220px;overflow-y:auto;margin-bottom:12px;border:1px solid #333;border-radius:8px;"
      ></div>

      <label style="display:grid;gap:6px;">
        <span style="font-size:12px;color:var(--text2);">
          ${umT('setup.customCatalogBuilder.imdb.idsLabel','IMDb IDs, one per line, or click a search result above')}
        </span>
        <textarea
          id="customCatalogValue"
          placeholder="tt0111161&#10;tt0137523&#10;tt0816692"
          style="${inputStyle}"
        ></textarea>
      </label>`;

  } else if(source === 'mdblist'){
    box.innerHTML = `
      <label style="display:grid;gap:6px;">
        <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.mdblist.label','MDBList URL or list ID')}</span>
        <input
          id="customCatalogValue"
          type="text"
          placeholder="https://mdblist.com/lists/... or mdb_12345"
          style="width:100%;padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
        >
      </label>`;

  } else if(source === 'trakt'){
    box.innerHTML = `
      <label style="display:grid;gap:6px;">
        <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.trakt.label','Trakt list URL')}</span>
        <input
          id="customCatalogValue"
          type="text"
          placeholder="https://trakt.tv/users/name/lists/list-name"
          style="width:100%;padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
        >
      </label>`;

  } else if(source === 'actor'){
    // ULTRA MAX CUSTOM ACTOR AND STREAMING SOURCES
    box.innerHTML = `
      <label style="display:grid;gap:6px;">
        <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.actor.label','Actor name')}</span>
        <input
          id="customCatalogValue"
          type="text"
          placeholder="${umT('setup.customCatalogBuilder.actor.placeholder','Example: Keanu Reeves')}"
          style="width:100%;padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
        >
        <span style="font-size:11px;color:var(--faint);">
          ${umT('setup.customCatalogBuilder.actor.help','Ultra MAX will match the actor against TMDB.')}
        </span>
      </label>`;

  } else if(source === 'streaming'){
    box.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 150px;gap:10px;">
        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.streaming.providerLabel','TMDB provider ID')}</span>
          <input
            id="customCatalogValue"
            type="number"
            min="1"
            placeholder="Example: 8"
            style="width:100%;padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
          >
        </label>

        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.streaming.regionLabel','Region')}</span>
          <select
            id="customStreamingRegion"
            style="width:100%;padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
          >
            <option value="GB">${umT('setup.customCatalogBuilder.regions.gb','United Kingdom')}</option>
            <option value="US">${umT('setup.customCatalogBuilder.regions.us','United States')}</option>
            <option value="IE">${umT('setup.customCatalogBuilder.regions.ie','Ireland')}</option>
            <option value="CA">${umT('setup.customCatalogBuilder.regions.ca','Canada')}</option>
            <option value="AU">${umT('setup.customCatalogBuilder.regions.au','Australia')}</option>
          </select>
        </label>
      </div>

      <div style="font-size:11px;color:var(--faint);margin-top:8px;">
        ${umT('setup.customCatalogBuilder.streaming.help','Common IDs: Netflix 8, Prime Video 9, Disney+ 337, Apple TV+ 350 and Paramount+ 531.')}
      </div>`;

  } else if(source === 'tmdb'){
    box.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.tmdb.genreLabel','Genre ID')}</span>
          <input
            id="customTmdbGenre"
            type="text"
            placeholder="878 for Sci-Fi"
            style="padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
          >
        </label>

        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.tmdb.ratingLabel','Minimum rating')}</span>
          <input
            id="customTmdbRating"
            type="number"
            min="0"
            max="10"
            step="0.1"
            placeholder="7.0"
            style="padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
          >
        </label>

        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.tmdb.yearFromLabel','Year from')}</span>
          <input
            id="customTmdbYearFrom"
            type="number"
            placeholder="1990"
            style="padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
          >
        </label>

        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;color:var(--text2);">${umT('setup.customCatalogBuilder.tmdb.yearToLabel','Year to')}</span>
          <input
            id="customTmdbYearTo"
            type="number"
            placeholder="1999"
            style="padding:11px;background:var(--input-bg);color:var(--text);border:1px solid var(--border2);border-radius:8px;"
          >
        </label>
      </div>`;

  } else {
    box.innerHTML = `
      <label style="display:grid;gap:6px;">
        <span style="font-size:12px;color:var(--text2);">
          ${umT('setup.customCatalogBuilder.generic.rowIdsLabel','Existing row IDs, one per line')}
        </span>
        <textarea
          id="customCatalogValue"
          placeholder="trending_movies&#10;popular_movies&#10;studio_a24"
          style="${inputStyle}"
        ></textarea>
      </label>`;
  }
}

var _titleSearchTimer = null;
function debouncedTitleSearch(){
  clearTimeout(_titleSearchTimer);
  _titleSearchTimer = setTimeout(runTitleSearch, 400);
}

async function runTitleSearch(){
  const input = document.getElementById('customCatalogSearchInput');
  const resultsBox = document.getElementById('customCatalogSearchResults');
  if(!input || !resultsBox) return;
  const q = input.value.trim();
  if(!q){ resultsBox.style.display = 'none'; resultsBox.innerHTML = ''; return; }
  resultsBox.style.display = 'block';
  resultsBox.innerHTML = umT('setup.customCatalog.searching', '<div style="padding:10px;color:#888;font-size:12px;">Searching...</div>');
  try {
    const res = await fetch('/api/search-title?q=' + encodeURIComponent(q));
    const data = await res.json();
    const results = data.results || [];
    if(!results.length){
      resultsBox.innerHTML = umT('setup.customCatalog.noMatchesFound', '<div style="padding:10px;color:#888;font-size:12px;">No matches found.</div>');
      return;
    }
    resultsBox.innerHTML = results.map(function(r, idx){
      const posterImg = r.poster ? '<img src="' + r.poster + '" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;">' : '<div style="width:32px;height:48px;background:#222;border-radius:4px;flex-shrink:0;"></div>';
      return '<div class="um-kbd-toggle" onclick="pickSearchResult(' + idx + ')" style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-bottom:1px solid #222;" onmouseover="this.style.background=&#39;#161616&#39;" onmouseout="this.style.background=&#39;&#39;">' +
        posterImg +
        '<div><div style="font-size:13px;color:#fff;">' + (r.title || 'Unknown') + (r.year ? ' (' + r.year + ')' : '') + '</div><div style="font-size:11px;color:#888;text-transform:uppercase;">' + (r.mediaType === 'tv' ? 'Series' : 'Movie') + '</div></div>' +
      '</div>';
    }).join('');
    window._lastTitleSearchResults = results;
  } catch(e){
    resultsBox.innerHTML = umT('setup.customCatalog.searchFailedTryAgain', '<div style="padding:10px;color:#f87171;font-size:12px;">Search failed. Try again.</div>');
  }
}

async function pickSearchResult(idx){
  const results = window._lastTitleSearchResults || [];
  const picked = results[idx];
  if(!picked) return;
  const textarea = document.getElementById('customCatalogValue');
  const resultsBox = document.getElementById('customCatalogSearchResults');
  const searchInput = document.getElementById('customCatalogSearchInput');
  if(!textarea) return;
  try {
    const res = await fetch('/api/title-imdb-id?tmdbId=' + picked.tmdbId + '&mediaType=' + picked.mediaType);
    const data = await res.json();
    if(!data.imdbId) return;
    const existing = textarea.value.trim();
    textarea.value = existing ? existing + '\n' + data.imdbId : data.imdbId;
    if(resultsBox){ resultsBox.style.display = 'none'; resultsBox.innerHTML = ''; }
    if(searchInput) searchInput.value = '';
  } catch(e){}
}

function slugifyCustomCatalogName(name){
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50) || ('custom_' + Date.now());
}

function saveCustomCatalogDraft(){
  const err = document.getElementById('customCatalogError');

  if(err){
    err.style.display = 'none';
    err.textContent = '';
  }

  const name =
    (document.getElementById('customCatalogName') || {}).value.trim();

  const type =
    (document.getElementById('customCatalogType') || {}).value ||
    'movie';

  const source =
    (document.getElementById('customCatalogSource') || {}).value ||
    'imdb';

  if(!name){
    if(err){
      err.textContent = umT('setup.customCatalog.catalogNameIsRequired', 'Catalog name is required.');
      err.style.display = 'block';
    }
    return;
  }

  let config = {};

  if(source === 'tmdb'){
    config = {
      genre:
        (document.getElementById('customTmdbGenre') || {}).value.trim(),
      minRating:
        (document.getElementById('customTmdbRating') || {}).value.trim(),
      yearFrom:
        (document.getElementById('customTmdbYearFrom') || {}).value.trim(),
      yearTo:
        (document.getElementById('customTmdbYearTo') || {}).value.trim()
    };

  } else {
    const raw =
      (document.getElementById('customCatalogValue') || {}).value.trim();

    if(!raw){
      if(err){
        err.textContent =
          source === 'actor'
            ? 'Actor name is required.'
            : 'Source value is required.';

        err.style.display = 'block';
      }
      return;
    }

    if(source === 'streaming' && !/^\d+$/.test(raw)){
      if(err){
        err.textContent = umT('setup.customCatalog.streamingProviderIdMustBeA', 'Streaming provider ID must be a number.');
        err.style.display = 'block';
      }
      return;
    }

    config = { value: raw };
  }

  const item = {
    id: 'custom_' + slugifyCustomCatalogName(name),
    name,
    type,
    source,
    config,
    createdAt: new Date().toISOString()
  };

  if(source === 'streaming'){
    item.region =
      (document.getElementById('customStreamingRegion') || {}).value ||
      'GB';
  }

  customCatalogs.push(item);
  renderCustomCatalogList();
  closeCustomCatalogModal();

  if(typeof saveDraftState === 'function'){
    saveDraftState();
  }
}

function renderCustomCatalogList(){
  const box = document.getElementById('customCatalogList');
  if(!box) return;
  if(!Array.isArray(customCatalogs) || !customCatalogs.length){
    box.innerHTML = `
      <div style="padding:20px;border:1px dashed #333;border-radius:8px;text-align:center;color:#aaa;">
        ${umT('setup.customCatalogBuilder.empty.noRows','No custom rows yet.')}<br>
        <a href="/builder.html" target="_blank" style="display:inline-block;margin-top:10px;padding:8px 16px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;">${umT('setup.customCatalogBuilder.empty.catalogBuilder','✨ Catalog Builder →')}</a>
        <div style="font-size:11px;color:#999;margin-top:8px;">${umT('setup.customCatalogBuilder.empty.aiPowered','AI powered — describe what you want, no key needed')}</div>
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid #333;">
          <button type="button" onclick="createCustomCatalog()" style="padding:8px 14px;background:#1f1f1f;color:#fff;border:1px solid #333;border-radius:6px;cursor:pointer;">${umT('setup.customCatalogBuilder.empty.createCustom','+ Create Custom Catalog')}</button>
        <div style="font-size:11px;color:#999;margin-top:8px;">${umT('setup.customCatalogBuilder.empty.manualHelp','Manual — build from supported TMDB filters')}</div>
        </div>
      </div>`;

    return;
  }

  box.innerHTML = customCatalogs.map(function(c, idx){
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border:1px solid #3a3a55;border-radius:8px;margin-bottom:8px;background:#0d0d0d;">
        <div>
          <div style="font-weight:700;color:#fff;">${c.name}</div>
          <div style="font-size:12px;color:#aaa;">${c.type} · ${c.source}</div>
        </div>
        <button type="button" onclick="deleteCustomCatalog(${idx})" style="padding:7px 10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:7px;cursor:pointer;">Delete</button>
      </div>`;
  }).join('') + `
    <button type="button" onclick="createCustomCatalog()" style="margin-top:10px;padding:8px 14px;background:#1f1f1f;color:#fff;border:1px solid #333;border-radius:6px;cursor:pointer;">
      + Create Custom Catalog
    </button>`;
}

function deleteCustomCatalog(idx){
  customCatalogs.splice(idx, 1);
  renderCustomCatalogList();
  if(typeof saveDraftState === 'function') saveDraftState();
}

// ── PUBLIC MDBLIST SEARCH (Step 2 Custom Rows) ──────────────────────
let mdbSearchTimer = null;
let mdbSearchSeq = 0;

function debouncedMdbListSearch(){
  clearTimeout(mdbSearchTimer);
  mdbSearchTimer = setTimeout(runMdbListSearch, 400);
}

async function runMdbListSearch(){
  const input = document.getElementById('mdbSearchInput');
  const box = document.getElementById('mdbSearchResults');
  if(!input || !box) return;

  const query = input.value.trim();
  if(!query){
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  const mdbKey = (document.getElementById('mdblistKey') || {}).value.trim();
  if(!mdbKey){
    box.style.display = 'block';
    box.innerHTML = umT('setup.customCatalog.addYourMdblistApiKeyIn', '<div style="padding:14px;color:#f87171;font-size:12px;">Add your MDBList API key in Step 1 first.</div>');
    return;
  }

  const seq = ++mdbSearchSeq;
  box.style.display = 'block';
  box.innerHTML = umT('setup.customCatalog.searching2', '<div style="padding:14px;color:#999;font-size:12px;">Searching…</div>');

  try {
    const res = await fetch('/api/mdblist-search', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ apikey: mdbKey, query: query })
    });
    const data = await res.json();
    if(seq !== mdbSearchSeq) return; // a newer search superseded this one
    if(!res.ok){
      throw new Error(data && data.error ? data.error : 'MDBList search failed');
    }

    const results = Array.isArray(data.results) ? data.results : [];
    if(!results.length){
      box.innerHTML = '<div style="padding:14px;color:#999;font-size:12px;">' + umT('setup.customCatalogBuilder.mdblistSearch.noResults','No public lists found for "{query}".',{query:query.replace(/</g,'&lt;')}) + '</div>';
      return;
    }

    box.innerHTML = results.map(function(r, idx){
      const safeName = String(r.name || umT('setup.customCatalogBuilder.mdblistSearch.untitledList','Untitled list')).replace(/</g,'&lt;');
      const by = r.user ? umT('setup.customCatalogBuilder.mdblistSearch.byUser','by {user}',{user:String(r.user).replace(/</g,'&lt;')}) : '';
      const meta = [by, umT('setup.customCatalogBuilder.mdblistSearch.itemsSuffix','{count} items',{count:r.items || 0}), r.mediatype ? r.mediatype : null].filter(Boolean).join(' · ');
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:1px solid #2a2a45;border-radius:8px;margin-bottom:6px;background:#0d0d0d;">
          <div style="min-width:0;">
            <div style="font-weight:700;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${safeName}</div>
            <div style="font-size:11px;color:#999;">${meta}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
            <select id="mdbSearchType${idx}" style="padding:6px 8px;background:#151515;color:#fff;border:1px solid #333;border-radius:6px;font-size:11px;">
              <option value="movie">${umT('setup.rowSettingsAndCustomCatalog.movies','Movies')}</option>
              <option value="series">${umT('setup.rowSettingsAndCustomCatalog.series','Series')}</option>
            </select>
            <button type="button" onclick='addPublicMdbList(${JSON.stringify(r).replace(/'/g,"&#39;")}, ${idx})' style="padding:7px 12px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;border:0;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap;">+ Add</button>
          </div>
        </div>`;
    }).join('');
  } catch(e){
    if(seq !== mdbSearchSeq) return;
    box.innerHTML = umT('setup.customCatalog.searchFailedTryAgain2', '<div style="padding:14px;color:#f87171;font-size:12px;">Search failed — try again.</div>');
  }
}

function addPublicMdbList(result, idx){
  const typeSel = document.getElementById('mdbSearchType' + idx);
  const type = (typeSel && typeSel.value) || 'movie';
  const listId = String(result.id);
  const rowId = 'mdb_pub_' + listId + '_' + type;

  if(!Array.isArray(window.customMdbLists)) window.customMdbLists = customMdbLists = [];

  if(customMdbLists.some(l => l.id === rowId)){
    if(typeof showBanner === 'function') showBanner(umT('setup.customCatalog.thatListIsAlreadyAdded', 'That list is already added.'), 'error');
    return;
  }

  customMdbLists.push({
    id: rowId,
    listId,
    name: result.name || 'MDBList',
    type,
    enabled: true,
    createdAt: new Date().toISOString()
  });

  // A newly-added MDBList row is enabled by default, so register it with
  // Step 2 immediately. Reorder Rows is derived from `selected`, not from
  // customMdbLists itself.
  selected.add(rowId);
  if(!catalogOrder.includes(rowId)) catalogOrder.push(rowId);
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);

  renderPublicMdbListList();
  s2UpdateAll();
  if(typeof s2BuildReorderList === 'function') s2BuildReorderList();
  persistStep2State();
  if(typeof saveDraftState === 'function') saveDraftState();
  if(typeof showBanner === 'function') showBanner(umT('setup.customCatalog.added', 'Added "') + (result.name || 'list') + '" ✓', 'success');
}

function togglePublicMdbList(idx){
  const row = customMdbLists[idx];
  if(!row) return;

  row.enabled = row.enabled === false ? true : false;

  if(row.enabled !== false){
    selected.add(row.id);
    if(!catalogOrder.includes(row.id)) catalogOrder.push(row.id);
  } else {
    selected.delete(row.id);
    hidden.delete(row.id);
    catalogOrder = (catalogOrder || []).filter(function(id){ return id !== row.id; });
  }

  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);

  renderPublicMdbListList();
  s2UpdateAll();
  if(typeof s2BuildReorderList === 'function') s2BuildReorderList();
  persistStep2State();
  if(typeof saveDraftState === 'function') saveDraftState();
}

function deletePublicMdbList(idx){
  const row = customMdbLists[idx];
  if(!row) return;

  selected.delete(row.id);
  hidden.delete(row.id);
  catalogOrder = (catalogOrder || []).filter(function(id){ return id !== row.id; });

  customMdbLists.splice(idx, 1);
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);

  renderPublicMdbListList();
  s2UpdateAll();
  if(typeof s2BuildReorderList === 'function') s2BuildReorderList();
  persistStep2State();
  if(typeof saveDraftState === 'function') saveDraftState();
}

function renderPublicMdbListList(){
  const box = document.getElementById('publicMdbListList');
  if(!box) return;

  if(!Array.isArray(customMdbLists) || !customMdbLists.length){
    box.innerHTML = '';
    return;
  }

  box.innerHTML = '<div style="font-size:11px;color:#999;margin-bottom:8px;">' + umT('setup.customCatalogBuilder.mdblistList.addedHeader','Added public MDBLists') + '</div>' +
    customMdbLists.map(function(c, idx){
      const on = c.enabled !== false;
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border:1px solid #3a3a55;border-radius:8px;margin-bottom:6px;background:#0d0d0d;opacity:${on ? '1' : '.5'};">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0;">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="togglePublicMdbList(${idx})">
            <div style="min-width:0;">
              <div style="font-weight:700;color:#fff;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${String(c.name).replace(/</g,'&lt;')}</div>
              <div style="font-size:11px;color:#aaa;">${c.type} · MDBList #${c.listId}</div>
            </div>
          </label>
          <button type="button" onclick="deletePublicMdbList(${idx})" style="padding:7px 10px;background:#1a1a1a;color:#ddd;border:1px solid #333;border-radius:7px;cursor:pointer;flex-shrink:0;">Delete</button>
        </div>`;
    }).join('');
}
// ─────────────────────────────────────────────────────────────────
