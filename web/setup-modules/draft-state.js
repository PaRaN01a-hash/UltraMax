function buildDraftConfigSnapshot(){
  try{
    if(typeof buildConfigPayloadFromForm !== 'function') return {};
    return JSON.parse(JSON.stringify(buildConfigPayloadFromForm() || {}));
  }catch(e){
    console.warn('buildDraftConfigSnapshot failed', e);
    return {};
  }
}

function captureDraftFormFields(){
  var fields = {};
  var rememberPassword = !!((document.getElementById('rememberMeDevice') || {}).checked);

  document
    .querySelectorAll('#step-1 input[id], #step-1 select[id], #step-1 textarea[id]')
    .forEach(function(el){
      var type = String(el.type || '').toLowerCase();
      var id = String(el.id || '');
      if(!id || ['file','button','submit','reset'].includes(type)) return;
      if(/^step1Nuvio/i.test(id) || /^nuvio/i.test(id)) return;
      if((type === 'password' || id === 'password' || id === 'confirmPassword') && !rememberPassword) return;

      if(type === 'checkbox' || type === 'radio'){
        fields[id] = { kind:'checked', value:!!el.checked };
      }else{
        fields[id] = { kind:'value', value:String(el.value || '') };
      }
    });

  return fields;
}

function restoreDraftFormFields(fields){
  if(!fields || typeof fields !== 'object') return;

  Object.keys(fields).forEach(function(id){
    var saved = fields[id];
    var el = document.getElementById(id);
    if(!el || !saved || typeof saved !== 'object') return;

    if(saved.kind === 'checked'){
      el.checked = !!saved.value;
    }else if(saved.kind === 'value' && String(el.type || '').toLowerCase() !== 'file'){
      el.value = saved.value === undefined || saved.value === null ? '' : String(saved.value);
    }
  });
}

function applyDraftConfigSnapshot(snapshot){
  if(!snapshot || typeof snapshot !== 'object') return;

  if(Array.isArray(snapshot.excludeLanguages) && typeof setExcludeLanguages === 'function'){
    setExcludeLanguages(snapshot.excludeLanguages);
  }
  if(typeof setContentFilterFields === 'function'){
    setContentFilterFields(snapshot);
  }

  if(Array.isArray(snapshot.streamAddons)){
    if(typeof setStoredStreamAddons === 'function') setStoredStreamAddons(snapshot.streamAddons);
    var streamBox = document.getElementById('streamAddons') || document.getElementById('quickStreamAddons');
    if(streamBox) streamBox.value = snapshot.streamAddons.join('\n');
    if(typeof setStoredStreamAddonLabels === 'function'){
      setStoredStreamAddonLabels(
        snapshot.streamAddonLabels && typeof snapshot.streamAddonLabels === 'object'
          ? snapshot.streamAddonLabels
          : {}
      );
    }
    if(typeof renderStreamAddonCards === 'function') renderStreamAddonCards();
  }

  if(Array.isArray(snapshot.debridServices)){
    debridProviders = JSON.parse(JSON.stringify(snapshot.debridServices));
    if(typeof renderDebridProviders === 'function') renderDebridProviders();
  }

  if(snapshot.streamFormat && typeof restoreStreamFormatUI === 'function'){
    restoreStreamFormatUI(snapshot.streamFormat);
  }

  if(Object.prototype.hasOwnProperty.call(snapshot, 'betterPostersStyle')){
    var bpHidden = document.getElementById('betterPostersStyleHidden');
    if(bpHidden) bpHidden.value = snapshot.betterPostersStyle || '';
  }
}

function buildDraftState(){
  var providers = getDiscoveryProviderState();
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
  ensureCollectionIdentities(v2Collections);
  return {
    collectionsSchemaVersion: COLLECTIONS_SCHEMA_VERSION,
    editToken: (typeof editToken !== 'undefined' && editToken) ? String(editToken) : '',
    configSnapshot: buildDraftConfigSnapshot(),
    formFields: captureDraftFormFields(),
    setup: {
      language: (document.getElementById('language') || {}).value || '',
      timezone: (document.getElementById('timezone') || {}).value || getDetectedTimeZone(),
      password: !!((document.getElementById('rememberMeDevice') || {}).checked)
        ? ((document.getElementById('password') || {}).value || '')
        : '',
      rememberMe: !!((document.getElementById('rememberMeDevice') || {}).checked),
      mdblistKey: providers.mdblistKey,
      tmdbKey: providers.tmdbKey,
      tvdbKey: providers.tvdbKey,
      tvdbPin: providers.tvdbPin,
      googleAiKey: (document.getElementById('googleAiKey') || {}).value || '',
      enableAiRecommended: !!((document.getElementById('enableAiRecommended') || {}).checked),
      rpdbKey: (document.getElementById('rpdbKey') || {}).value || '',
      tpKey: (document.getElementById('tpKey') || {}).value || '',
      fanartKey: (document.getElementById('fanartKey') || {}).value || '',
      omdbKey: (document.getElementById('omdbKey') || {}).value || '',
      traktUser: (document.getElementById('traktUser') || {}).value || '',
      excludeUnreleased: !!((document.getElementById('excludeUnreleased') || {}).checked),
      animePresentationMode: (document.getElementById('animePresentationMode') || {}).value === 'anisync' ? 'anisync' : 'unified',
      preserveKitsuIds: !!((document.getElementById('preserveKitsuIds') || {}).checked),
      digitalReleaseOnly: !!((document.getElementById('digitalReleaseOnly') || {}).checked),
      searchCatalogNames: getSearchCatalogNamesFromForm(),
      hideWatched: !!((document.getElementById('hideWatched') || {}).checked),
      hideUnavailableStreams: !!((document.getElementById('hideUnavailableStreams') || {}).checked),
      episodeReleaseDelayHours: Number((document.getElementById('episodeReleaseDelayHours') || {}).value) || 0,
      maxRating: (document.getElementById('maxRating') || {}).value || '',
      includeAdult: !!((document.getElementById('includeAdult') || {}).checked)
    },
    selectedCatalogs: Array.from(selected || []),
    hiddenCatalogs: Array.from(hidden || []),
    catalogOrder: Array.isArray(catalogOrder) ? catalogOrder.slice() : [],
    collections: JSON.parse(JSON.stringify(v2Collections || [])),
    customCatalogs: JSON.parse(JSON.stringify(getCustomCatalogsFromForm())),
    customMdbLists: JSON.parse(JSON.stringify(getCustomMdbListsFromForm())),
    mergedCatalogs: JSON.parse(JSON.stringify(mergedCatalogs || [])),
    removedMergedCatalogIds: Array.from(removedMergedCatalogIds),
    catalogOverrides: JSON.parse(JSON.stringify(getCatalogOverridesFromForm())),
    currentStep: Number(currentStep) || 1,
    savedAt: new Date().toISOString()
  };
}

function saveDraftState(){
  try{
    const data = buildDraftState();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  }catch(e){
    console.error('saveDraftState failed', e);
  }
}

function hasRecoverableDraftState(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(!data || typeof data !== 'object') return false;
    const setup = data.setup || {};
    const credentialFields = ['password','mdblistKey','tmdbKey','tvdbKey','tvdbPin','googleAiKey','rpdbKey','tpKey','fanartKey','omdbKey'];
    const hasCredential = credentialFields.some(function(key){
      return String(setup[key] || '').trim().length > 0;
    });
    const hasSelections = Array.isArray(data.selectedCatalogs) && data.selectedCatalogs.length > 0;
    const hasCollections = Array.isArray(data.collections) && data.collections.length > 0;
    const hasCustom =
      (Array.isArray(data.customCatalogs) && data.customCatalogs.length > 0) ||
      (Array.isArray(data.customMdbLists) && data.customMdbLists.length > 0) ||
      (Array.isArray(data.mergedCatalogs) && data.mergedCatalogs.length > 0);
    const progressed = Number(data.currentStep) > 1;
    return hasCredential || hasSelections || hasCollections || hasCustom || progressed;
  }catch(e){
    return false;
  }
}
window.hasRecoverableDraftState = hasRecoverableDraftState;

function restoreDraftState(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw){ if(typeof showBanner === 'function') showBanner(umT('setup.auth.noDraftFoundInThisBrowser', 'No saved setup progress found on this device.'), 'error'); return false; }

    const data = JSON.parse(raw);
    if(!data || typeof data !== 'object') return false;

    clearCurrentBuilderState();
    mergedCatalogs = normaliseMergedCatalogDefinitions(data.mergedCatalogs);
    setRemovedMergedCatalogIds(data.removedMergedCatalogIds);
    renderMergedCatalogs();
    rerenderStep2CategoriesPreservingUi();

    const setup = data.setup || {};
    var draftToken = String(data.editToken || '').trim().toUpperCase();
    if(draftToken){
      editToken = draftToken;
      window.um_isReturningUser = true;
      try { sessionStorage.setItem('um_setup_token', draftToken); } catch(_error) {}
      if(setup.password){
        try { _configPassword = setup.password; } catch(_error) {}
      }
    }

    const setValue = function(id, value){
      const el = document.getElementById(id);
      if(el && typeof value !== 'undefined' && value !== null) el.value = value;
    };

    var continuingRememberedSetup = false;
    try {
      continuingRememberedSetup =
        new URLSearchParams(window.location.search).get('shortcut') === 'continue-setup';
    } catch(_error) {}

    // Continue Setup first loads the authoritative saved config from the
    // server. Preserve those credentials when an older local progress record
    // contains blanks, while still allowing newer non-empty local values to
    // win.
    var serverMdblistKey = continuingRememberedSetup
      ? String((document.getElementById('mdblistKey') || {}).value || '')
      : '';
    var serverTmdbKey = continuingRememberedSetup
      ? String((document.getElementById('tmdbKey') || {}).value || '')
      : '';
    var serverTvdbKey = continuingRememberedSetup
      ? String((document.getElementById('tvdbKey') || {}).value || '')
      : '';
    var serverTvdbPin = continuingRememberedSetup
      ? String((document.getElementById('tvdbPin') || {}).value || '')
      : '';

    var rememberedSession =
      continuingRememberedSetup && typeof umGetSession === 'function'
        ? umGetSession()
        : null;
    var effectiveToken = String(draftToken || editToken || '').trim().toUpperCase();
    var rememberedMatches = !!(
      rememberedSession &&
      rememberedSession.password &&
      String(rememberedSession.token || '').trim().toUpperCase() === effectiveToken
    );
    var effectivePassword = String(
      setup.password || (rememberedMatches ? rememberedSession.password : '') || ''
    );
    var effectiveMdblistKey = String(setup.mdblistKey || serverMdblistKey || '');
    var effectiveTmdbKey = String(setup.tmdbKey || serverTmdbKey || '');
    var effectiveTvdbKey = String(setup.tvdbKey || serverTvdbKey || '');
    var effectiveTvdbPin = String(setup.tvdbPin || serverTvdbPin || '');

    setValue('language', setup.language || 'en');
  populateTimeZoneSelect(setup.timezone || getDetectedTimeZone());
    var restoreRemember = !!effectivePassword && (
      setup.rememberMe !== false || rememberedMatches
    );
    var rememberEl = document.getElementById('rememberMeDevice');
    if(rememberEl) rememberEl.checked = restoreRemember;
    if(restoreRemember){
      setValue('password', effectivePassword);
      setValue('confirmPassword', effectivePassword);
    }
    setValue('mdblistKey', effectiveMdblistKey);
    setValue('tmdbKey', effectiveTmdbKey);
    setValue('tvdbKey', effectiveTvdbKey);
    setValue('tvdbPin', effectiveTvdbPin);
    setValue('googleAiKey', setup.googleAiKey || '');
    setValue('rpdbKey', setup.rpdbKey || '');
    setValue('tpKey', setup.tpKey || '');
    setValue('fanartKey', setup.fanartKey || '');
    setValue('omdbKey', setup.omdbKey || '');
    setValue('traktUser', setup.traktUser || '');
    setValue('maxRating', setup.maxRating || '');

    const aiRecommended = document.getElementById('enableAiRecommended');
    if(aiRecommended) aiRecommended.checked = !!setup.enableAiRecommended;
    const excl = document.getElementById('excludeUnreleased');
    if(excl) excl.checked = !!setup.excludeUnreleased;
    setValue('animePresentationMode', setup.animePresentationMode === 'anisync' ? 'anisync' : 'unified');
    const preserveKitsu = document.getElementById('preserveKitsuIds');
    if(preserveKitsu) preserveKitsu.checked = !!setup.preserveKitsuIds;
    const digitalOnly = document.getElementById('digitalReleaseOnly');
    if(digitalOnly) digitalOnly.checked = !!setup.digitalReleaseOnly;
    if(typeof setSearchCatalogNamesOnForm === 'function') setSearchCatalogNamesOnForm(setup.searchCatalogNames);
    const hw = document.getElementById('hideWatched');
    if(hw) hw.checked = !!setup.hideWatched;
    const hus = document.getElementById('hideUnavailableStreams');
    if(hus) hus.checked = !!setup.hideUnavailableStreams;
    setValue('episodeReleaseDelayHours', String(Number(setup.episodeReleaseDelayHours) || 0));
  const adult = document.getElementById('includeAdult');
  if(adult) adult.checked = !!setup.includeAdult;

    restoreDraftFormFields(data.formFields);

    // A stale local progress snapshot may contain empty credential fields from
    // the old Continue bug. Do not let those blanks overwrite the authenticated
    // server values we just loaded.
    if(continuingRememberedSetup){
      if(restoreRemember){
        setValue('password', effectivePassword);
        setValue('confirmPassword', effectivePassword);
      }
      setValue('mdblistKey', effectiveMdblistKey);
      setValue('tmdbKey', effectiveTmdbKey);
      setValue('tvdbKey', effectiveTvdbKey);
      setValue('tvdbPin', effectiveTvdbPin);
      if(rememberEl) rememberEl.checked = restoreRemember;
    }

    applyDraftConfigSnapshot(data.configSnapshot);

    applyImportedSelections(data.selectedCatalogs || [], data.hiddenCatalogs || []);
    catalogOrder = normaliseCatalogOrder(
      selected,
      Array.isArray(data.catalogOrder) ? data.catalogOrder : catalogOrder
    );
    v2Collections = normalizeImportedCollections(data.collections || []); window.v2Collections = v2Collections;

    updateCounter();
    updateCategoryCounts();
    renderCollections();

    // A restored draft's mdblistKey was previously saved in this browser —
    // treat it the same as a saved token and restore the verified/green
    // state instead of leaving it looking unverified.
    if(typeof restoreMdblistVerifiedState === 'function') restoreMdblistVerifiedState();
    // Fields above were set programmatically, so no input/change event fired.
    // Refresh the current Step 1 readiness + compact card UI explicitly.
    if(typeof scheduleLoadedStep1CredentialUiRefresh === 'function'){
      scheduleLoadedStep1CredentialUiRefresh();
    }else{
      if(
        window.UltraMaxStep1PlayReady &&
        typeof window.UltraMaxStep1PlayReady.update === 'function'
      ){
        window.UltraMaxStep1PlayReady.update();
      }
      if(typeof window.updateMobileSetupCardStates === 'function'){
        window.updateMobileSetupCardStates();
      }
    }

    // In the native/standalone app, resume the step the user was actually on.
    // The normal website keeps the existing Step 1 entry behaviour.
    var restoreStep = 1;
    try {
      var nativeMode = new URLSearchParams(window.location.search).get('native') === '1';
      var standaloneMode = typeof umIsStandalone === 'function' && umIsStandalone();
      if(nativeMode || standaloneMode){
        var savedStep = Number(data.currentStep) || 1;
        restoreStep = [1,2,3,4].includes(savedStep) ? savedStep : 1;
      }
    } catch(e) {}
    setStep(restoreStep);

    if(typeof showBanner === 'function'){
      showBanner(umT('setup.auth.draftRestoredFromThisBrowser', '✓ Setup progress restored from this device.'), 'success');
    }
    return true;
  }catch(e){
    console.error('restoreDraftState failed', e);
    return false;
  }
}

function clearDraftState(){
  try{
    localStorage.removeItem(DRAFT_KEY);
    if(typeof showBanner === 'function'){
      showBanner(umT('setup.deviceProfiles.draftCleared', '🗑️ Draft cleared.'), 'success');
    }
  }catch(e){
    console.error('clearDraftState failed', e);
  }
}


function timeAgo(iso){
  try{
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if(diff < 60) return diff + ' sec ago';
    if(diff < 3600) return Math.floor(diff/60) + ' min ago';
    if(diff < 86400) return Math.floor(diff/3600) + ' hrs ago';
    return Math.floor(diff/86400) + ' days ago';
  }catch(e){
    return 'recently';
  }
}

function showDraftPrompt(){
  try{
    const raw = localStorage.getItem(DRAFT_KEY);
    if(!raw) return;

    const data = JSON.parse(raw);
    if(!data) return;

    if(document.getElementById('draftPrompt')) return;

    const saved = data.savedAt ? timeAgo(data.savedAt) : umT('setup.draftPrompt.recently','recently');

    const box = document.createElement('div');
    box.id = 'draftPrompt';
    box.style.cssText =
      'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'background:#0d0d0d;border:1px solid #222;padding:14px 16px;border-radius:10px;' +
      'box-shadow:0 12px 30px rgba(0,0,0,.45);max-width:92%;min-width:280px;color:#fff;';

    box.innerHTML =
      '<div style="font-size:13px;font-weight:700;margin-bottom:6px;">' + umT('setup.draftPrompt.title','💾 Draft found') + '</div>' +
      '<div style="font-size:12px;color:#aaa;line-height:1.5;margin-bottom:12px;">' + umT('setup.draftPrompt.savedPrefix','Saved {when}',{when:saved}) + '</div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="restorePromptBtn" class="nav-btn primary" style="flex:1;">' + umT('setup.draftPrompt.restore','Restore') + '</button>' +
      '<button id="discardPromptBtn" class="nav-btn" style="flex:1;">' + umT('setup.draftPrompt.discard','Discard') + '</button>' +
      '</div>';

    document.body.appendChild(box);

    document.getElementById('restorePromptBtn').onclick = function(){
      restoreDraftState();
      box.remove();
    };

    document.getElementById('discardPromptBtn').onclick = function(){
      clearDraftState();
      box.remove();
    };

  }catch(e){
    console.error(e);
  }
}

function bindDraftAutoSave(){
  const ids = [
    'password','confirmPassword','rememberMeDevice','language','mdblistKey','tmdbKey','tvdbKey','tvdbPin','googleAiKey','enableAiRecommended','rpdbKey','tpKey','fanartKey','omdbKey','traktUser','excludeUnreleased','animePresentationMode','preserveKitsuIds','digitalReleaseOnly','searchMovieName','searchSeriesName','hideWatched','hideUnavailableStreams','episodeReleaseDelayHours','maxRating'
  ];

  ids.forEach(function(id){
    const el = document.getElementById(id);
    if(!el) return;
    const evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
    el.addEventListener(evt, saveDraftState);
  });

  document.addEventListener('click', function(e){
    const target = e.target;
    if(!target) return;

    if(
      target.classList.contains('pill') ||
      target.classList.contains('global-btn') ||
      target.classList.contains('nav-btn') ||
      target.classList.contains('load-btn') ||
      target.classList.contains('rbtn') ||
      target.classList.contains('preset-btn') ||
      target.classList.contains('step2-preset-card')
    ){
      setTimeout(saveDraftState, 80);
    }
  });

  window.addEventListener('beforeunload', saveDraftState);
}

