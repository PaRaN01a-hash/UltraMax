function clearCurrentBuilderState(){
  selected.clear();
  hidden.clear();
  catalogOrder = [];
  s2ResetAllHiddenWarningDismissal();
  mergedCatalogs = [];
  setRemovedMergedCatalogIds([]);
  renderMergedCatalogs();
  rerenderStep2CategoriesPreservingUi();
  try{ sessionStorage.removeItem("um_hidden"); }catch(e){}
  v2Collections = []; window.v2Collections = v2Collections;

  // Scoped to the legacy catalog-pill markup (.pill[data-id="..."], see
  // applyImportedSelections below) — not the generic .pill class, which is
  // also used by the unrelated, live Step 1 Anime/Indian Cinema filter
  // buttons. Restore Draft never saves or restores those filter values
  // (see getContentFilterFields/setContentFilterFields), so their visual
  // state must be left alone too.
  document.querySelectorAll('.pill[data-id]').forEach(function(p){
    p.classList.remove('selected');
    p.style.fontStyle = '';
    const eye = p.querySelector('.pill-eye');
    if(eye){
      eye.style.display = 'none';
      eye.textContent = '👁';
      eye.style.opacity = '0.4';
    }
  });
}

function applyImportedSelections(selectedCatalogs, hiddenCatalogs){
  (selectedCatalogs || []).forEach(function(id){
    if(isRemovedMergedCatalogId(id)) return;
    selected.add(id);
    const pill = document.querySelector('.pill[data-id="' + id + '"]');
    if(pill) pill.classList.add('selected');
  });

  (hiddenCatalogs || []).forEach(function(id){
    if(isRemovedMergedCatalogId(id)) return;
    hidden.add(id);
    const p = document.querySelector('.pill[data-id="' + id + '"]');
    if(p){
      p.style.fontStyle = 'italic';
      const eye = p.querySelector('.pill-eye');
      if(eye){
        eye.style.display = 'inline';
        eye.textContent = '🙈';
        eye.style.opacity = '1';
      }
    }
  });
  saveHiddenState();
}

function normalizeImportedCollections(collections){
  var normalized = JSON.parse(JSON.stringify(collections || [])).map(function(coll){
    var normalizedCollection = Object.assign({}, coll, {
      title: coll.title || 'Collection',
      collapsed: !!coll.collapsed,
      folders: (coll.folders || []).map(function(folder){
        var allSources = (folder.sources || []);
        var nativeSources = Array.isArray(folder.nativeSources)
          ? folder.nativeSources
          : allSources.filter(function(s){
              return !(s.provider === "addon" && isUltraMaxGeneratedAddonId(s.addonId));
            });
        var addonRows = Array.isArray(folder.rows)
          ? (folder.rows || []).filter(function(id){ return !/^(tmdb|tvdb|simkl)\.discover\./.test(id); })
          : allSources.filter(function(s){ return s.provider === "addon" && isUltraMaxGeneratedAddonId(s.addonId); }).map(function(s){ return s.catalogId; })
            .concat((folder.catalogSources || []).filter(function(src){
              return src.catalogId && !/^(tmdb|tvdb|simkl)\.discover\./.test(src.catalogId) && (!src.addonId || isUltraMaxGeneratedAddonId(src.addonId));
            }).map(function(src){ return src.catalogId; }));
        addonRows = addonRows.map(normalizeCatalogId).filter(function(id, i, a){ return id && a.indexOf(id) === i; });
        return Object.assign({}, folder, {
          title: folder.title || 'Folder',
          rows: addonRows,
          nativeSources: nativeSources,
          coverImageUrl: folder.coverImageUrl || '',
          focusGifUrl: folder.focusGifUrl || '',
          heroBackdropUrl: folder.heroBackdropUrl || '',
          focusGifEnabled: !!folder.focusGifEnabled,
          tileShape: folder.tileShape || 'LANDSCAPE'
        });
      })
    });
    return normalizedCollection;
  });
  return ensureCollectionIdentities(normalized);
}

function importProjectData(data){
  if(!data || typeof data !== 'object'){
    throw new Error('Invalid project file');
  }

  clearCurrentBuilderState();
  mergedCatalogs = normaliseMergedCatalogDefinitions(data.mergedCatalogs);
  setRemovedMergedCatalogIds(data.removedMergedCatalogIds);
  catalogOrder = Array.isArray(data.catalogOrder) ? data.catalogOrder.slice() : [];
  renderMergedCatalogs();
  rerenderStep2CategoriesPreservingUi();

  const setup = data.setup || {};
  const setValue = function(id, value){
    const el = document.getElementById(id);
    if(el && typeof value !== 'undefined' && value !== null) el.value = value;
  };

  setValue('language', setup.language || 'en');
  populateTimeZoneSelect(setup.timezone || getDetectedTimeZone());
  setValue('mdblistKey', setup.mdblistKey || '');
  setValue('tmdbKey', setup.tmdbKey || '');
  setValue('tvdbKey', setup.tvdbKey || '');
  setValue('tvdbPin', setup.tvdbPin || '');
  setValue('rpdbKey', setup.rpdbKey || '');
  setValue('tpKey', setup.tpKey || '');
  setValue('traktUser', setup.traktUser || '');
  setValue('maxRating', setup.maxRating || '');

  const excl = document.getElementById('excludeUnreleased');
  if(excl) excl.checked = !!setup.excludeUnreleased;
  setValue('animePresentationMode', setup.animePresentationMode === 'anisync' ? 'anisync' : 'unified');
  const preserveKitsu = document.getElementById('preserveKitsuIds');
  if(preserveKitsu) preserveKitsu.checked = !!setup.preserveKitsuIds;
  const digital = document.getElementById('digitalReleaseOnly');
  if(digital) digital.checked = !!setup.digitalReleaseOnly;
  if(typeof setSearchCatalogNamesOnForm === 'function') setSearchCatalogNamesOnForm(setup.searchCatalogNames);
  const hw = document.getElementById('hideWatched');
  if(hw) hw.checked = !!setup.hideWatched;
  const hus = document.getElementById('hideUnavailableStreams');
  if(hus) hus.checked = !!setup.hideUnavailableStreams;
  setValue('episodeReleaseDelayHours', String(Number(setup.episodeReleaseDelayHours) || 0));

  // Restore debrid settings
  if(Array.isArray(setup.debridServices) && setup.debridServices.length) {
    debridProviders = setup.debridServices;
  } else if(setup.debridService && setup.debridApiKey) {
    // backwards compat with old single-provider format
    debridProviders = [{ service: setup.debridService, apiKey: setup.debridApiKey }];
  }
  renderDebridProviders();
  const co = document.getElementById('debridCachedOnly');
  const rt = document.getElementById('debridRemoveTrash');
  if(co) co.checked = !!setup.debridCachedOnly;
  if(typeof restoreStreamLanguageUI === 'function') {
    restoreStreamLanguageUI(setup.streamLanguages, setup.streamLanguageMode, setup.debridEnglishOnly);
  }
  if(rt) rt.checked = setup.debridRemoveTrash !== false;
  const r4k = document.getElementById('debridRes4k');
  const r1080 = document.getElementById('debridRes1080');
  const r720 = document.getElementById('debridRes720');
  const r480 = document.getElementById('debridRes480');
  if(r4k) r4k.checked = setup.debridRes4k !== false;
  if(r1080) r1080.checked = setup.debridRes1080 !== false;
  if(r720) r720.checked = setup.debridRes720 !== false;
  if(r480) r480.checked = !!setup.debridRes480;

  const maxSizeEl = document.getElementById('debridMaxSizeGb');
  if(maxSizeEl) {
    maxSizeEl.value = String(Number(setup.debridMaxSizeGb) || 0);
  }

  const sourceBranding =
    document.getElementById('preserveStreamSourceBranding');

  if(sourceBranding) {
    sourceBranding.checked =
      !!setup.preserveStreamSourceBranding;
  }

  const adult = document.getElementById('includeAdult');
  if(adult) adult.checked = !!setup.includeAdult;

  applyImportedSelections(data.selectedCatalogs || [], data.hiddenCatalogs || []);
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
  v2Collections = normalizeImportedCollections(data.collections || []); window.v2Collections = v2Collections;
  const viewModeEl = document.getElementById('nuvioViewMode');
  if(viewModeEl && data.nuvioViewMode) viewModeEl.value = data.nuvioViewMode;

  updateCounter();
  updateCategoryCounts();
  renderCollections();
  if(typeof restoreMdblistVerifiedState === 'function') restoreMdblistVerifiedState();
  updateDiscoveryCapabilityUi();

  setStep(1);
}


// Shared banner helper lives in /setup-modules/banner.js


function _importProjectFile(event){
  const file = event.target.files && event.target.files[0];
  if(!file){ showBanner(umT('setup.auth.noFileSelected', 'No file selected'), 'error'); return; }

  showBanner(umT('setup.auth.readingFile', '📂 Reading file: ') + file.name, 'success');

  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const raw = e.target.result;
      showBanner(umT('setup.auth.parsingJson', '📋 Parsing JSON...'), 'success');
      const data = JSON.parse(raw);
      showBanner(umT('setup.auth.importingData', '🔧 Importing data...'), 'success');
      importProjectData(data);
      saveDraftState();
      showBanner(umT('setup.auth.projectImportedSuccessfully', '✅ Project imported successfully!'), 'success');
    }catch(err){
      console.error('Import error:', err);
      showBanner(umT('setup.auth.importFailed', '❌ Import failed: ') + err.message, 'error');
    }finally{
      event.target.value = '';
    }
  };
  reader.onerror = function(e){
    showBanner(umT('setup.auth.couldNotReadFile', '❌ Could not read file: ') + (e.target.error || 'unknown error'), 'error');
  };
  reader.readAsText(file);
}
