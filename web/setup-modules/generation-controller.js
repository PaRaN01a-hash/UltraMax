function getStreamAddonsFromForm(){
  const raw = (document.getElementById('streamAddons') || {}).value || '';
  const addons = raw.split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
  // Also check getStoredStreamAddons in case the hidden field wasn't populated
  if(!addons.length && typeof getStoredStreamAddons === 'function'){
    return getStoredStreamAddons();
  }
  return addons;
}

function showGenError(msg){
  const genError = document.getElementById('genError');
  if(!genError) return;
  genError.textContent = msg;
  genError.classList.add('visible');
  // The native app's bottom nav is a fixed bar that can sit over the last
  // bit of page content, so scroll with extra bottom clearance instead of
  // relying on scrollIntoView's default (which stops flush at the edge).
  genError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Every settings field the wizard tracks, minus password/catalogs-selection
// bookkeeping. Shared by generate() (saves to the base token) and the
// Device Profiles panel (snapshots the same shape into a profile's
// overrides) so the two never drift out of sync with each other.
function buildConfigPayloadFromForm(){
  console.log('[S2-TRACE] BUILD PAYLOAD', {
    selected:Array.from(selected || []),
    hasF1:selected.has('sports_f1_fixtures'),
    size:selected.size
  });

  console.log(
    '[SPORTS-STATE] buildConfigPayloadFromForm',
    {
      collections:(v2Collections || []).map(function(c){ return c && c.title; }),
      motorsportSelected:Array.from(selected || []).filter(function(id){
        return /f1|motor|motogp|formula1/i.test(String(id));
      })
    }
  );

  var providers = getDiscoveryProviderState();

  // Step 2 is authoritative. Collections must never silently install or
  // hide extra catalog rows during save; they only reference the selection.
  var payloadSelected = new Set(
    Array.from(selected || [])
      .map(function(id){ return normalizeCatalogId(id); })
      .filter(function(id){ return id && !isRemovedMergedCatalogId(id); })
  );
  var payloadHidden = new Set(
    Array.from(hidden || [])
      .map(function(id){ return normalizeCatalogId(id); })
      .filter(function(id){ return payloadSelected.has(id); })
  );

  var payloadCatalogOrder = normaliseCatalogOrder(
    payloadSelected,
    catalogOrder
  );
  ensureCollectionIdentities(v2Collections);
  return {
    collectionsSchemaVersion: COLLECTIONS_SCHEMA_VERSION,
    catalogs: Array.from(payloadSelected),
    catalogOrder: payloadCatalogOrder,
    mdblistKey: providers.mdblistKey || null,
    tmdbKey: providers.tmdbKey || null,
    tvdbKey: providers.tvdbKey || null,
    tvdbPin: providers.tvdbPin || null,
    language: (document.getElementById('language')||{}).value,
    timezone: (document.getElementById('timezone')||{}).value || getDetectedTimeZone(),
    rpdbKey: (document.getElementById('rpdbKey')||{}).value.trim() || null,
    tpKey: (document.getElementById('tpKey')||{}).value.trim() || null,
    traktUser: (document.getElementById('traktUser')||{}).value.trim() || null,
    excludeUnreleased: (document.getElementById('excludeUnreleased')||{}).checked || false,
    animePresentationMode: (document.getElementById('animePresentationMode')||{}).value === 'anisync' ? 'anisync' : 'unified',
    preserveKitsuIds: !!(document.getElementById('preserveKitsuIds')||{}).checked,
    digitalReleaseOnly: (document.getElementById('digitalReleaseOnly')||{}).checked || false,
    searchCatalogNames: getSearchCatalogNamesFromForm(),
    hideWatched: (document.getElementById('hideWatched')||{}).checked || false,
    hideUnavailableStreams: (document.getElementById('hideUnavailableStreams')||{}).checked || false,
    episodeReleaseDelayHours: Number((document.getElementById('episodeReleaseDelayHours')||{}).value) || 0,
    maxRating: (document.getElementById('maxRating')||{}).value || null,
    hiddenCatalogs: Array.from(payloadHidden),
    streamAddons: getStreamAddonsFromForm(),
    streamAddonLabels:
      (typeof getStoredStreamAddonLabels === 'function')
        ? getStoredStreamAddonLabels()
        : {},
    customCatalogs: getCustomCatalogsFromForm(),
    customMdbLists: getCustomMdbListsFromForm(),
    mergedCatalogs: JSON.parse(JSON.stringify(mergedCatalogs || [])),
    removedMergedCatalogIds: Array.from(removedMergedCatalogIds),
    catalogOverrides: getCatalogOverridesFromForm(),
    excludeLanguages: getExcludeLanguages(),
    betterPostersStyle: (document.getElementById("betterPostersStyleHidden")||{}).value || null,
    debridServices: debridProviders || [],
    debridCachedOnly: !!(document.getElementById("debridCachedOnly")||{}).checked,
    streamLanguages: (typeof getStreamLanguagesFromForm === 'function' ? getStreamLanguagesFromForm() : ['en']),
    streamLanguageMode: (typeof getStreamLanguageModeFromForm === 'function' ? getStreamLanguageModeFromForm() : 'only'),
    // Legacy compatibility for older backends/exports.
    debridEnglishOnly:
      (typeof getStreamLanguageModeFromForm === 'function' ? getStreamLanguageModeFromForm() : 'only') === 'only' &&
      (typeof getStreamLanguagesFromForm === 'function' ? getStreamLanguagesFromForm() : ['en']).length === 1 &&
      (typeof getStreamLanguagesFromForm === 'function' ? getStreamLanguagesFromForm() : ['en'])[0] === 'en',
    debridRemoveTrash: (document.getElementById("debridRemoveTrash")||{}).checked !== false,
    debridRes4k: (document.getElementById("debridRes4k")||{}).checked !== false,
    debridRes1080: (document.getElementById("debridRes1080")||{}).checked !== false,
    debridRes720: (document.getElementById("debridRes720")||{}).checked !== false,
    debridRes480: !!(document.getElementById("debridRes480")||{}).checked,
    streamMinSizeGb: Number((document.getElementById("streamMinSizeGb")||{}).value) || 0,
    debridMaxSizeGb: Number((document.getElementById("debridMaxSizeGb")||{}).value) || 0,
    streamSortMode: (document.getElementById("streamSortMode")||{}).value || "source",
    hideStreamNotices: !!(document.getElementById("hideStreamNotices")||{}).checked,
    streamFormat: (typeof getStreamFormatFromForm === 'function' ? getStreamFormatFromForm() : null),
    preserveStreamSourceBranding:
      !!(document.getElementById("preserveStreamSourceBranding")||{}).checked,
    premiumizeLibraryEnabled:
      !!(document.getElementById("premiumizeLibraryEnabled")||{}).checked && !!premiumizeLibraryConnected,
    torboxLibraryEnabled:
      !!(document.getElementById("torboxLibraryEnabled")||{}).checked && !!torboxLibraryConnected,
    fanartKey: (document.getElementById("fanartKey")||{}).value.trim() || null,
    omdbKey: (document.getElementById("omdbKey")||{}).value.trim() || null,
    googleAiKey: (document.getElementById("googleAiKey")||{}).value.trim() || null,
    enableAiRecommended: !!(document.getElementById("enableAiRecommended")||{}).checked,
    includeAdult: !!(document.getElementById("includeAdult")||{}).checked,
    ...getContentFilterFields()
  };
}

// Fire-and-forget: pings the server to pre-populate the cache for this
// user's top rows so their first real Nuvio/Stremio catalog fetch after
// install isn't a cold TMDB/MDBList round-trip. See POST /api/warm/:token
// in services/cache-warm-service.js — it responds immediately and keeps
// warming in the background, so this never blocks the UI either.
function triggerCacheWarm(token){
  if(!token) return;
  const indicator = document.getElementById('cacheWarmIndicator');
  if(indicator){
    indicator.style.display = 'flex';
    setTimeout(function(){ indicator.style.display = 'none'; }, 10000);
  }
  var profileQuery = window.activeDeviceProfileId
    ? '?profile=' + encodeURIComponent(window.activeDeviceProfileId)
    : '';
  fetch(API_BASE + '/api/warm/' + token + profileQuery, { method: 'POST' }).catch(function(){});
}

async function generate(){
  const pass = document.getElementById('password').value;
  const confirm = document.getElementById('confirmPassword').value;
  const providers = validateDiscoveryProviders({ showError: true });
  const genError = document.getElementById('genError');

  if(!pass){ showGenError('Password is required'); return false; }
  if(!editToken && pass !== confirm){ showGenError('Passwords do not match'); return false; }
  if(window.activeDeviceProfileId){
    const proceed = window.confirm(umT('setup.deviceProfiles.youLoadedThe', 'You loaded the "') + window.activeDeviceProfileName + '" profile into this form. Generating now saves these settings to your BASE token, not that profile. Use "Update Profile" below instead if you meant to edit the profile.\n\nContinue and overwrite the base setup anyway?');
    if(!proceed) return false;
  }
  if(!providers.hasAnyDiscoveryProvider) return false;
  genError.classList.remove('visible');

  if (
    typeof window.enforceKidsSetupBeforeGenerate ===
    'function'
  ) {
    window.enforceKidsSetupBeforeGenerate();
  }

  if(selected.size === 0){
    showGenError('Pick at least one row on Step 2 before generating');
    return false;
  }

  document.getElementById('loading').classList.add('visible');
  document.getElementById('resultBox').style.display = 'none';
  document.getElementById('genBtn').disabled = true;

  try{
    // Use update for a known config. If the browser is holding a stale
    // token and the backend confirms it no longer exists, safely retry once
    // as a new setup instead of leaving Finalise stuck on Config not found.
    const isPreauth = editToken && !(document.getElementById('password')||{}).value;
    let endpoint = (editToken && !isPreauth)
      ? API_BASE + '/c/' + encodeURIComponent(editToken) + '/update'
      : API_BASE + '/c/create';

    var savePayload = buildConfigPayloadFromForm();
    var premiumizeKeyEl = document.getElementById('premiumizeApiKey');
    var premiumizeKeyPatch = premiumizeKeyEl ? premiumizeKeyEl.value.trim() : '';
    if(premiumizeKeyPatch) savePayload.premiumizeApiKey = premiumizeKeyPatch;
    if(premiumizeDisconnectRequested) savePayload.premiumizeDisconnect = true;
    var torboxKeyEl = document.getElementById('torboxLibraryApiKey');
    var torboxKeyPatch = torboxKeyEl ? torboxKeyEl.value.trim() : '';
    if(torboxKeyPatch) savePayload.torboxLibraryApiKey = torboxKeyPatch;
    if(torboxDisconnectRequested) savePayload.torboxDisconnect = true;

    const requestBody = JSON.stringify(
      Object.assign(
        { password: pass },
        savePayload
      )
    );

    let res = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: requestBody
    });

    let data = await res.json();

    if(
      !res.ok &&
      res.status === 404 &&
      editToken &&
      data &&
      data.error === 'Config not found'
    ){
      console.warn(
        'Generate: stale config token detected; retrying as a new setup.'
      );

      endpoint = API_BASE + '/c/create';

      res = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: requestBody
      });

      data = await res.json();
    }

    if(!res.ok){
      document.getElementById('loading').classList.remove('visible');
      showGenError(data.error || 'Something went wrong');
      document.getElementById('genBtn').disabled = false;
      return false;
    }

    if(!data.token){
      throw new Error('Server response did not include a setup token');
    }

    // The successful backend response is authoritative. Always replace any
    // stale browser token with the returned token.
    editToken = data.token;
    window.generatedToken = data.token;
    if (typeof renderInstallStatus === 'function') renderInstallStatus(data.installStatus || null);
    var savedPremiumizeKeyEl = document.getElementById('premiumizeApiKey');
    if(premiumizeDisconnectRequested){
      premiumizeLibraryConnected = false;
      premiumizeLibraryPersisted = false;
      premiumizeDisconnectRequested = false;
    } else if(savedPremiumizeKeyEl && savedPremiumizeKeyEl.value.trim()){
      premiumizeLibraryConnected = true;
      premiumizeLibraryPersisted = true;
      savedPremiumizeKeyEl.value = '';
    } else if(premiumizeLibraryConnected){
      premiumizeLibraryPersisted = true;
    }
    premiumizeRenderState();
    var savedTorboxKeyEl = document.getElementById('torboxLibraryApiKey');
    if(torboxDisconnectRequested){
      torboxLibraryConnected = false;
      torboxLibraryPersisted = false;
      torboxDisconnectRequested = false;
    } else if(savedTorboxKeyEl && savedTorboxKeyEl.value.trim()){
      torboxLibraryConnected = true;
      torboxLibraryPersisted = true;
      savedTorboxKeyEl.value = '';
    } else if(torboxLibraryConnected){
      torboxLibraryPersisted = true;
    }
    if(typeof torboxRenderState === 'function') torboxRenderState();
    syncUltraMaxWizardContext('generate');
    sessionStorage.setItem('um_setup_token', data.token);

    const configuredPath = '/configure/' + encodeURIComponent(data.token);
    window.history.replaceState({}, '', configuredPath);

    const manifestUrl = DISPLAY_URL + '/c/' + data.token + '/manifest.json';
    window.generatedAddonUrl = manifestUrl;
    window.generatedNuvioCollections = buildCollectionsExport();
    window.generatedToken = data.token;
    triggerCacheWarm(data.token);
    var rememberControl = document.getElementById('rememberMeDevice');
    var shouldRemember = rememberControl
      ? !!rememberControl.checked
      : (
          typeof window.umShouldRememberSetup === 'function' &&
          window.umShouldRememberSetup()
        );

    if (shouldRemember) {
      var pwEl = document.getElementById('password');
      var passwordToRemember = pwEl ? pwEl.value : '';
      if (!passwordToRemember && typeof umGetSession === 'function') {
        var rememberedSetup = umGetSession();
        var sameRememberedToken = rememberedSetup &&
          String(rememberedSetup.token || '').trim().toUpperCase() ===
          String(data.token || '').trim().toUpperCase();
        if (sameRememberedToken && rememberedSetup.password) {
          passwordToRemember = rememberedSetup.password;
        }
      }
      if (typeof umSaveSession === 'function' && passwordToRemember) {
        umSaveSession(data.token, passwordToRemember);
      }
    } else if (typeof umClearSession === 'function') {
      // Unchecked — don't leave a stale remembered password behind.
      umClearSession();
    }
    var manageLinkEl = document.getElementById('manageAccountLink');
    if (manageLinkEl) manageLinkEl.href = '/account.html?token=' + data.token;
    fetch(DISPLAY_URL + '/c/' + data.token + '/collections', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ collections: window.generatedNuvioCollections, replace: true })
    }).catch(function(e){ console.log('Collections save failed:', e); });
    document.getElementById('urlDisplay').textContent = manifestUrl;
    document.getElementById('installBtn').href = 'stremio://' + manifestUrl.replace('https://','').replace('http://','');

    var rtEl = document.getElementById('tokenDisplayNew');
    if(rtEl) rtEl.textContent = data.token;
    // Keep tokenDisplay for backward compat
    var tdEl = document.getElementById('tokenDisplay');
    if(tdEl) tdEl.textContent = data.token;
    document.getElementById('editLink').innerHTML = '<a href="/configure/' + data.token + '" style="color:#aaa;">ultramax.vip/configure/' + data.token + '</a>';
    saveDraftState();
    document.getElementById('resultBox').style.display = 'block';
    document.getElementById('loading').classList.remove('visible');
    document.getElementById('genBtn').disabled = false;

    if(window.UltraMaxGlobalNuvioSetup){
      if(typeof window.UltraMaxGlobalNuvioSetup.refresh === 'function'){
        await window.UltraMaxGlobalNuvioSetup.refresh();
      }else if(typeof window.UltraMaxGlobalNuvioSetup.hydrate === 'function'){
        window.UltraMaxGlobalNuvioSetup.hydrate();
      }
    }

    if(typeof loadDeviceProfilesList === 'function') loadDeviceProfilesList(data.token);
    if(typeof clearActiveDeviceProfile === 'function') clearActiveDeviceProfile();

    if(typeof fusionRefreshStatus === 'function'){
      fusionRefreshStatus();
    }

    setTimeout(function(){
      document.getElementById('resultBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
      makeSprockets();
    }, 100);
    return true;
  }catch(e){
    document.getElementById('loading').classList.remove('visible');
    document.getElementById('genBtn').disabled = false;
    showGenError('Network error: ' + (e.message || e));
    return false;
  }
}

// window.generatedAddonUrl / window.generatedNuvioCollections are a
// one-shot snapshot written only inside generate(). Every direct Nuvio
// push (catalog install and Kids install) used to trust that snapshot
// with no staleness check, so catalog/collection edits made after the
// last Generate were silently dropped from the push even though the UI
// showed them correctly. This refreshes the backend-stored config (and
// the snapshot) from the CURRENT live wizard state immediately before any
// push, so push always matches what the user currently sees — without
// requiring the heavier full generate() UI flow (loading overlay, result
// box, cache warm, etc.) on every push.
async function ensureFreshGeneratedStateForPush(){
  if(!editToken){
    // Nothing has ever been generated for this setup; existing callers
    // already refuse to push without a generated manifest URL.
    return !!window.generatedAddonUrl;
  }
  const passwordEl = document.getElementById('password');
  const pass = passwordEl ? passwordEl.value : '';
  if(!pass){
    throw new Error(umT(
      'setup.nuvioPush.reenterPasswordToRefresh',
      'Enter your setup password to refresh your latest catalog and collection edits before pushing.'
    ));
  }

  const profileId = window.activeDeviceProfileId || null;
  const overrides = buildConfigPayloadFromForm();
  const endpoint = profileId
    ? API_BASE + '/c/' + encodeURIComponent(editToken) + '/profiles/' + encodeURIComponent(profileId) + '/update'
    : API_BASE + '/c/' + encodeURIComponent(editToken) + '/update';
  const requestBody = profileId
    ? JSON.stringify({ password: pass, overrides: overrides })
    : JSON.stringify(Object.assign({ password: pass }, overrides));

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: requestBody
  });
  const data = await res.json();
  if(!res.ok){
    throw new Error(data.error || umT('setup.nuvioPush.refreshFailed', 'Could not refresh your setup before pushing.'));
  }

  window.generatedToken = editToken;
  const profileQuery = profileId
    ? '?profile=' + encodeURIComponent(profileId)
    : '';
  const profileManifestPath = profileId
    ? '/c/' + editToken + '/p/' + encodeURIComponent(profileId) + '/manifest.json'
    : '/c/' + editToken + '/manifest.json';
  window.generatedAddonUrl = DISPLAY_URL + profileManifestPath;
  window.generatedNuvioCollections = buildCollectionsExport();
  syncUltraMaxWizardContext('preNuvioPushRefresh');
  await fetch(DISPLAY_URL + '/c/' + editToken + '/collections' + profileQuery, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ collections: window.generatedNuvioCollections, replace: true })
  }).catch(function(e){ console.log('Collections save failed:', e); });
  return true;
}
