function saveFormState(){
  try {
    var providers = getDiscoveryProviderState();
    catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
    const state = {
      password: (document.getElementById('password')||{}).value || '',
      confirmPassword: (document.getElementById('confirmPassword')||{}).value || '',
      mdblistKey: providers.mdblistKey,
      tmdbKey: providers.tmdbKey,
      rpdbKey: (document.getElementById('rpdbKey')||{}).value || '',
      tpKey: (document.getElementById('tpKey')||{}).value || '',
      fanartKey: (document.getElementById('fanartKey')||{}).value || '',
      omdbKey: (document.getElementById('omdbKey')||{}).value || '',
      googleAiKey: (document.getElementById('googleAiKey')||{}).value || '',
      language: (document.getElementById('language')||{}).value || '',
      timezone: (document.getElementById('timezone')||{}).value || getDetectedTimeZone(),
      maxRating: (document.getElementById('maxRating')||{}).value || '',
      excludeUnreleased: (document.getElementById('excludeUnreleased')||{}).checked || false, animePresentationMode: (document.getElementById('animePresentationMode')||{}).value === 'anisync' ? 'anisync' : 'unified', preserveKitsuIds: !!(document.getElementById('preserveKitsuIds')||{}).checked, digitalReleaseOnly: (document.getElementById('digitalReleaseOnly')||{}).checked || false,
      searchCatalogNames: getSearchCatalogNamesFromForm(),
      hideWatched: (document.getElementById('hideWatched')||{}).checked || false,
      hideUnavailableStreams: (document.getElementById('hideUnavailableStreams')||{}).checked || false,
      episodeReleaseDelayHours: Number((document.getElementById('episodeReleaseDelayHours')||{}).value) || 0,
      includeAdult: (document.getElementById('includeAdult')||{}).checked || false,
      betterPostersStyle: (document.getElementById('betterPostersStyleHidden')||{}).value || (document.getElementById('betterPostersStyle')||{}).value || '',
      excludeLanguages: getExcludeLanguages(),
      selectedCatalogs: Array.from(selected),
      hidden: Array.from(hidden),
      catalogOrder: Array.isArray(catalogOrder) ? catalogOrder.slice() : [],
      mergedCatalogs: JSON.parse(JSON.stringify(mergedCatalogs || [])),
      removedMergedCatalogIds: Array.from(removedMergedCatalogIds),
      ...getContentFilterFields()
    };
    const serialized = JSON.stringify(state);
    sessionStorage.setItem('um_form_state', serialized);

    // Android may destroy the WebView session while Trakt or Simkl is open.
    // Keep a temporary durable OAuth recovery copy as well.
    localStorage.setItem('um_oauth_form_state', serialized);
  } catch(e) {
    console.warn('saveFormState failed', e);
  }
}

function restoreFormState(){
  try {
    const raw =
      sessionStorage.getItem('um_form_state') ||
      localStorage.getItem('um_oauth_form_state');

    if(!raw) return false;

    const state = JSON.parse(raw);
    const setVal = (id, val) => { const el = document.getElementById(id); if(el && val !== undefined) el.value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if(el) el.checked = !!val; };
    setVal('password', state.password);
    setVal('confirmPassword', state.confirmPassword);
    setVal('mdblistKey', state.mdblistKey);
    setVal('tmdbKey', state.tmdbKey);
    setVal('rpdbKey', state.rpdbKey);
    setVal('tpKey', state.tpKey);
    setVal('fanartKey', state.fanartKey);
    setVal('omdbKey', state.omdbKey);
    setVal('googleAiKey', state.googleAiKey);
    setVal('language', state.language);
    populateTimeZoneSelect(state.timezone || getDetectedTimeZone());
    setVal('maxRating', state.maxRating);
    setVal('betterPostersStyle', state.betterPostersStyle);
    setCheck('excludeUnreleased', state.excludeUnreleased);
    setCheck('hideUnavailableStreams', state.hideUnavailableStreams);
    setVal('episodeReleaseDelayHours', String(Number(state.episodeReleaseDelayHours) || 0));
    setVal('animePresentationMode', state.animePresentationMode === 'anisync' ? 'anisync' : 'unified');
    setCheck('preserveKitsuIds', state.preserveKitsuIds);
    setCheck('digitalReleaseOnly', state.digitalReleaseOnly);
    if(typeof setSearchCatalogNamesOnForm === 'function') setSearchCatalogNamesOnForm(state.searchCatalogNames);
    setCheck('includeAdult', state.includeAdult);
    if(state.excludeLanguages) setExcludeLanguages(state.excludeLanguages);
    if(typeof setContentFilterFields === 'function') setContentFilterFields(state);
    if(Array.isArray(state.selectedCatalogs)) {
      selected.clear();
      state.selectedCatalogs.forEach(function(id){
        if(!isRemovedMergedCatalogId(id)) selected.add(id);
      });
    }
    catalogOrder = normaliseCatalogOrder(
      selected,
      Array.isArray(state.catalogOrder) ? state.catalogOrder : catalogOrder
    );
    mergedCatalogs = normaliseMergedCatalogDefinitions(state.mergedCatalogs);
    setRemovedMergedCatalogIds(state.removedMergedCatalogIds);
    renderMergedCatalogs();
    rerenderStep2CategoriesPreservingUi();

    if(state.hidden) {
      hidden.clear();
      state.hidden.forEach(function(id){
        if(!isRemovedMergedCatalogId(id)) hidden.add(id);
      });
      saveHiddenState();
    }

    if(typeof updateCounter === 'function') updateCounter();
    if(typeof updateCategoryCounts === 'function') updateCategoryCounts();
    if(typeof s2UpdateAll === 'function') s2UpdateAll();
    if(typeof renderCollections === 'function') renderCollections();
    if(typeof setStep === 'function'){
      setTimeout(function(){
        // OAuth restores account/form state without restoring the old screen.
        setStep(1);
      }, 100);
    }

    // This OAuth recovery copy mirrors a value the user already had saved —
    // restore the verified/green mdblistKey state the same way a token load does.
    if(typeof restoreMdblistVerifiedState === 'function') restoreMdblistVerifiedState();
    updateDiscoveryCapabilityUi();
    // password/mdblistKey above were set programmatically — refresh the
    // Step 1 status cards explicitly instead of waiting on a stray event.
    if(typeof window.s1UpdateStatuses === 'function') window.s1UpdateStatuses();

    // The durable copy is only an OAuth safety net.
    localStorage.removeItem('um_oauth_form_state');

    return true;
  } catch(e) {
    console.warn('restoreFormState failed', e);
    return false;
  }
}
