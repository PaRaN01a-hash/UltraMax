function normaliseDiscoveryCredential(value){
  return value === undefined || value === null ? '' : String(value).trim();
}

// Canonical credential/status helper. Every setup path consumes this same
// state object so whitespace, OR-validation and capability mode cannot drift.
function getDiscoveryProviderState(source){
  var values = source && typeof source === 'object' ? source : {};
  var tmdbElement = document.getElementById('tmdbKey');
  var mdbElement = document.getElementById('mdblistKey');
  var tvdbElement = document.getElementById('tvdbKey');
  var tvdbPinElement = document.getElementById('tvdbPin');
  var omdbElement = document.getElementById('omdbKey');
  var tmdbKey = normaliseDiscoveryCredential(
    Object.prototype.hasOwnProperty.call(values, 'tmdbKey')
      ? values.tmdbKey
      : (tmdbElement ? tmdbElement.value : '')
  );
  var mdblistKey = normaliseDiscoveryCredential(
    Object.prototype.hasOwnProperty.call(values, 'mdblistKey')
      ? values.mdblistKey
      : (mdbElement ? mdbElement.value : '')
  );
  var tvdbKey = normaliseDiscoveryCredential(
    Object.prototype.hasOwnProperty.call(values, 'tvdbKey')
      ? values.tvdbKey
      : (tvdbElement ? tvdbElement.value : '')
  );
  var tvdbPin = normaliseDiscoveryCredential(
    Object.prototype.hasOwnProperty.call(values, 'tvdbPin')
      ? values.tvdbPin
      : (tvdbPinElement ? tvdbPinElement.value : '')
  );
  var omdbKey = normaliseDiscoveryCredential(
    Object.prototype.hasOwnProperty.call(values, 'omdbKey')
      ? values.omdbKey
      : (omdbElement ? omdbElement.value : '')
  );
  var hasTmdb = !!tmdbKey;
  var hasMdblist = !!mdblistKey;
  var hasTvdb = !!tvdbKey;
  var hasOmdb = !!omdbKey;
  var connectedProviderCount = [hasTmdb, hasMdblist, hasTvdb, hasOmdb].filter(Boolean).length;
  return {
    tmdbKey: tmdbKey,
    mdblistKey: mdblistKey,
    tvdbKey: tvdbKey,
    tvdbPin: tvdbPin,
    omdbKey: omdbKey,
    hasTmdb: hasTmdb,
    hasMdblist: hasMdblist,
    hasTvdb: hasTvdb,
    hasOmdb: hasOmdb,
    connectedProviderCount: connectedProviderCount,
    // TVDB is supplemental for now. Core discovery still requires TMDB or MDBList.
    hasAnyDiscoveryProvider: hasTmdb || hasMdblist,
    mode: hasTmdb && hasMdblist ? 'both' : hasTmdb ? 'tmdb' : hasMdblist ? 'mdblist' : 'neither'
  };
}

function discoveryProviderStatusText(state){
  var count = Number(state && state.connectedProviderCount) || 0;
  if(state && state.hasAnyDiscoveryProvider){
    return umT('setup.discoveryProviders.statusConnectedCount', '{count} connected', { count: count });
  }
  if(count > 0){
    return umT('setup.discoveryProviders.statusSupplementalOnly', '{count} connected · add TMDB or MDBList', { count: count });
  }
  return umT('setup.discoveryProviders.statusRequired', 'TMDB or MDBList required');
}

function validateDiscoveryProviders(options){
  var settings = options || {};
  var state = getDiscoveryProviderState(settings.source);
  if(!state.hasAnyDiscoveryProvider && settings.showError !== false){
    var message = umT(
      'setup.discoveryProviders.validation',
      'Add a TMDB v3 API key or an MDBList API key in Step 1.'
    );
    if(typeof showGenError === 'function') showGenError(message);
    else if(typeof showBanner === 'function') showBanner(message, 'error');
  }
  return state;
}

function getDiscoveryCatalogDefinition(rawId){
  var id = typeof normalizeCatalogId === 'function'
    ? normalizeCatalogId(rawId)
    : String(rawId || '');
  if(typeof S2_DEFS !== 'undefined' && S2_DEFS[id]) return S2_DEFS[id];
  var custom = (typeof customCatalogs !== 'undefined' && Array.isArray(customCatalogs))
    ? customCatalogs.find(function(item){ return item && item.id === id; })
    : null;
  return custom || null;
}

function isCatalogAvailableForDiscovery(rawId, visited){
  var state = getDiscoveryProviderState();
  if(state.hasMdblist) return true;
  var id = typeof normalizeCatalogId === 'function'
    ? normalizeCatalogId(rawId)
    : String(rawId || '');
  if(!id) return false;
  if(typeof customMdbLists !== 'undefined' && Array.isArray(customMdbLists) && customMdbLists.some(function(item){ return item && item.id === id; })) return false;
  var def = getDiscoveryCatalogDefinition(id);
  if(def && def.handler === 'mdb') return false;
  if(def && (def.source === 'mdblist' || def.source === 'imdb')) return false;
  var merged = (typeof mergedCatalogs !== 'undefined' && Array.isArray(mergedCatalogs))
    ? mergedCatalogs.find(function(item){
        return item && (item.id === id || (typeof mergedDerivedIds === 'function' && mergedDerivedIds(item).includes(id)));
      })
    : null;
  if(!merged) return true;
  var seen = visited || new Set();
  if(seen.has(merged.id)) return false;
  seen.add(merged.id);
  return (merged.sources || []).some(function(source){
    return source && isCatalogAvailableForDiscovery(source.catalogId, seen);
  });
}

function getEffectiveDiscoveryIds(ids){
  return (Array.isArray(ids) ? ids : []).filter(function(row){
    var id = row && typeof row === 'object' && typeof getCollectionRowId === 'function'
      ? getCollectionRowId(row)
      : row;
    return isCatalogAvailableForDiscovery(id);
  });
}

function getEffectiveCollectionFolders(folders){
  return (Array.isArray(folders) ? folders : []).map(function(folder){
    var rows = getEffectiveDiscoveryIds((folder && folder.rows) || []);
    var nativeSources = Array.isArray(folder && folder.nativeSources)
      ? folder.nativeSources.slice()
      : [];
    return Object.assign({}, folder, { rows: rows, nativeSources: nativeSources });
  }).filter(function(folder){
    return folder.rows.length > 0 || folder.nativeSources.length > 0;
  });
}

function updateDiscoveryCapabilityUi(){
  var state = getDiscoveryProviderState();
  var text = discoveryProviderStatusText(state);
  var status = document.getElementById('s1-status-mdblist');
  if(status) status.textContent = text;
  var tools = document.getElementById('mdbListTools');
  if(tools){
    tools.hidden = !state.hasMdblist;
    tools.setAttribute('aria-disabled', state.hasMdblist ? 'false' : 'true');
  }
  document.querySelectorAll('.s3-preset-card[data-preset="latest"],.s3-preset-card[data-preset="decades"]').forEach(function(card){
    var unavailable = !state.hasMdblist;
    card.classList.toggle('provider-unavailable', unavailable);
    card.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    card.title = unavailable
      ? umT('setup.discoveryProviders.mdblistPresetUnavailable', 'Requires an MDBList API key.')
      : '';
  });
  var step2 = document.getElementById('step-2');
  if(step2 && step2.classList.contains('active') && typeof S2_DEFS !== 'undefined' && Object.keys(S2_DEFS).length){
    if(typeof s2RenderPresets === 'function') s2RenderPresets();
    if(typeof s2RenderCats === 'function') s2RenderCats();
    if(typeof s2RenderRaw === 'function') s2RenderRaw();
    if(typeof s2UpdateAll === 'function') s2UpdateAll();
  }
  if(typeof window.updateMobileSetupCardStates === 'function') window.updateMobileSetupCardStates();
  return state;
}

document.addEventListener('DOMContentLoaded', function(){
  ['tmdbKey','mdblistKey','tvdbKey','tvdbPin','omdbKey'].forEach(function(id){
    var input = document.getElementById(id);
    if(input) input.addEventListener('input', updateDiscoveryCapabilityUi);
  });
  updateDiscoveryCapabilityUi();
});
