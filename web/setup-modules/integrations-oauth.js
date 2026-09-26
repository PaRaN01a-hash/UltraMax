function umProfileQuery(profileId){
  const resolvedProfileId =
    profileId !== undefined ? profileId : window.activeDeviceProfileId;
  return resolvedProfileId ? ('?profile=' + encodeURIComponent(resolvedProfileId)) : '';
}

window.umIntegrationScopes = window.umIntegrationScopes || {};

function umIntegrationProviderLabel(provider){
  return provider === 'simkl' ? 'SIMKL' : 'Trakt';
}

function updateProfileIntegrationButtonLabels(){
  const profileName = String(window.activeDeviceProfileName || '').trim();
  const activeProfile = !!window.activeDeviceProfileId;

  [
    ['trakt','Trakt'],
    ['simkl','SIMKL']
  ].forEach(function(entry){
    const provider = entry[0];
    const label = entry[1];
    const connect = document.getElementById(provider+'ConnectBtn');
    const disconnect = document.getElementById(provider+'DisconnectBtn');
    const connectLabel = connect && connect.querySelector('span');

    if(connectLabel){
      connectLabel.textContent = activeProfile
        ? ('Connect ' + label + ' for ' + (profileName || 'this profile'))
        : ('Connect with ' + label);
    }

    if(disconnect){
      disconnect.textContent = activeProfile
        ? ('Disconnect ' + label + ' from ' + (profileName || 'this profile'))
        : 'Disconnect';
    }
  });
}

function renderProfileIntegrationScope(provider, scope){
  if(provider !== 'trakt' && provider !== 'simkl') return;

  const host = document.getElementById(provider+'ConnectStatus');
  if(!host) return;

  let note = host.querySelector('.um-profile-scope-note');
  const activeProfile = !!window.activeDeviceProfileId;
  if(!activeProfile){
    if(note) note.remove();
    return;
  }

  if(!note){
    note = document.createElement('div');
    note.className = 'um-profile-scope-note';
    note.style.cssText = 'margin-top:7px;font-size:11px;line-height:1.45;';
    host.appendChild(note);
  }

  const profileName = String(window.activeDeviceProfileName || 'this profile');
  const label = umIntegrationProviderLabel(provider);

  if(scope === 'profile'){
    note.style.color = '#55e6b6';
    note.textContent = '✓ ' + label + ' is connected specifically for "' + profileName + '".';
  }else if(scope === 'base'){
    note.style.color = 'var(--violet2)';
    note.textContent = 'Using the base ' + label + ' account. Connect here to give "' + profileName + '" its own account.';
  }else{
    note.style.color = 'var(--muted)';
    note.textContent = 'No ' + label + ' account for "' + profileName + '". Connect here to link one only to this profile.';
  }
}

async function refreshAllIntegrationStatuses(token, profileId){
  if(!token) return refreshIntegrationCapabilities();
  clearIntegrationPendingState();
  const results = await Promise.allSettled([
    checkTraktStatus(token, profileId),
    checkSimklStatus(token, profileId),
    checkMalStatus(token, profileId),
    checkAnilistStatus(token, profileId)
  ]);
  updateIntegrationsSummary();
  return results;
}

const integrationProviders = ['trakt','simkl','mal','anilist'];
let integrationResumeTimer = 0;

async function refreshIntegrationCapabilities(){
  try{
    const response=await fetch('/auth/capabilities',{cache:'no-store'});
    if(!response.ok) throw new Error('HTTP '+response.status);
    const data=await response.json();
    integrationProviders.forEach(function(provider){
      const capability=data.providers&&data.providers[provider];
      renderIntegrationState(provider,capability&&capability.configured
        ? {kind:'disconnected'}
        : {kind:'unavailable'});
    });
    return data.providers||{};
  }catch(error){
    integrationProviders.forEach(function(provider){
      renderIntegrationState(provider,{kind:'error'});
    });
    return {};
  }
}

function renderIntegrationState(provider, state){
  const status = document.getElementById(provider+'StatusText');
  const connect = document.getElementById(provider+'ConnectBtn');
  const disconnect = document.getElementById(provider+'DisconnectBtn');
  if(!status) return;
  if(connect) connect.disabled = state.kind === 'loading';
  if(state.kind === 'connected'){
    status.innerHTML = umT('setup.nuvioPushWidget.connectedAsPrefix', '✅ Connected as <strong>')+(state.username||'')+'</strong>' +
      (state.expired ? umT('setup.nuvioPushWidget.tokenExpiredSuffix', ' — token expired') : '');
    if(connect) connect.style.display='none';
    if(disconnect) disconnect.style.display='inline-block';
  }else if(state.kind === 'unavailable'){
    status.textContent=umT('setup.streams.notAvailableOnThisServerYet', 'Not available on this server yet');
    if(connect) connect.style.display='none';
    if(disconnect) disconnect.style.display='none';
  }else if(state.kind === 'loading'){
    status.textContent=umT('setup.streams.checkingAvailability', 'Checking availability…');
    if(connect) connect.style.display='inline-flex';
    if(disconnect) disconnect.style.display='none';
  }else{
    status.textContent=state.kind === 'error'
      ? 'Connection was not completed. Check the provider configuration and try again.'
      : 'Not connected';
    if(connect) connect.style.display='inline-flex';
    if(disconnect) disconnect.style.display='none';
  }

  if(state && Object.prototype.hasOwnProperty.call(state,'scope')){
    window.umIntegrationScopes[provider] = state.scope || 'none';
  }

  if(provider === 'trakt' || provider === 'simkl'){
    renderProfileIntegrationScope(
      provider,
      window.umIntegrationScopes[provider] || 'none'
    );
    updateProfileIntegrationButtonLabels();
  }

  updateIntegrationsSummary();
}

function clearIntegrationPendingState(){
  integrationProviders.forEach(function(provider){
    const button=document.getElementById(provider+'ConnectBtn');
    if(button) button.disabled=false;
  });
}

async function ensureIntegrationAvailable(provider, token, profileId){
  renderIntegrationState(provider,{kind:'loading'});
  try{
    const response=await fetch('/auth/'+provider+'/status/'+token+umProfileQuery(profileId),{cache:'no-store'});
    const data=await response.json();
    if(!response.ok) throw new Error('HTTP '+response.status);
    if(data.configured===false){
      renderIntegrationState(provider,{kind:'unavailable'});
      return false;
    }
    renderIntegrationState(provider,data.connected
      ? {kind:'connected',username:data.username,expired:data.expired,scope:data.scope}
      : {kind:'disconnected',scope:data.scope});
    return true;
  }catch(error){
    renderIntegrationState(provider,{kind:'error'});
    return false;
  }
}

function scheduleIntegrationResumeRefresh(){
  window.clearTimeout(integrationResumeTimer);
  integrationResumeTimer=window.setTimeout(function(){
    clearIntegrationPendingState();
    const token=editToken||sessionStorage.getItem('um_setup_token')||'';
    if(token) refreshAllIntegrationStatuses(token,window.activeDeviceProfileId);
    else refreshIntegrationCapabilities();
  },180);
}

async function connectTrakt(){
  let token = editToken || (document.getElementById('loadTokenInput')||{}).value || '';
  
  if(!token){
    // No token yet — save a draft config first to get a token
    const btn = document.getElementById('traktConnectBtn');
    const origText = btn.innerHTML;
    btn.innerHTML = '<img src="https://walter.trakt.tv/hotlink-ok/public/favicon.ico" style="width:16px;height:16px;">Saving draft...';
    btn.disabled = true;
    
    try {
      catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
      const pass = (document.getElementById('password')||{}).value || '';
      const mdbKey = (document.getElementById('mdblistKey')||{}).value || '';
      const tmdbKey = (document.getElementById('tmdbKey')||{}).value || '';
      const body = {
        password: pass,
        catalogs: Array.from(selected),
        catalogOrder: catalogOrder.slice(),
        mdblistKey: mdbKey || null,
        tmdbKey: tmdbKey || null,
        language: (document.getElementById('language')||{}).value || 'en',
        timezone: (document.getElementById('timezone')||{}).value || getDetectedTimeZone(),
        rpdbKey: (document.getElementById('rpdbKey')||{}).value || null,
        tpKey: (document.getElementById('tpKey')||{}).value || null,
        traktUser: null,
        excludeUnreleased: (document.getElementById('excludeUnreleased')||{}).checked || false, animePresentationMode: (document.getElementById('animePresentationMode')||{}).value === 'anisync' ? 'anisync' : 'unified', preserveKitsuIds: !!(document.getElementById('preserveKitsuIds')||{}).checked, digitalReleaseOnly: (document.getElementById('digitalReleaseOnly')||{}).checked || false,
      hideWatched: (document.getElementById('hideWatched')||{}).checked || false,
        maxRating: (document.getElementById('maxRating')||{}).value || null,
        hiddenCatalogs: Array.from(hidden),
        streamAddons: getStreamAddonsFromForm(),
        customCatalogs: getCustomCatalogsFromForm(),
        customMdbLists: getCustomMdbListsFromForm(),
        excludeLanguages: getExcludeLanguages(),
        betterPostersStyle: (document.getElementById('betterPostersStyleHidden')||{}).value || (document.getElementById('betterPostersStyle')||{}).value || null
      };
      const res = await fetch('/auth/preauth', { method:'POST', headers:{'Content-Type':'application/json'} });
      const data = await res.json();
      if(data.token){
        token = data.token;
        editToken = token;
        // Store token so user can continue setup after OAuth
        sessionStorage.setItem('um_setup_token', token);
      } else {
        throw new Error('No token returned');
      }
    } catch(e) {
      btn.innerHTML = origText;
      btn.disabled = false;
      alert(umT('setup.streams.couldNotSaveConfig', 'Could not save config: ') + e.message);
      return;
    }
  }
  if(!await ensureIntegrationAvailable('trakt',token)) return;
  localStorage.setItem('um_return_scroll', window.scrollY);
  localStorage.setItem('um_return_tile', 'optional');
  saveFormState();
  window.location.href = '/auth/trakt/connect/' + token + umProfileQuery();
}

async function disconnectTrakt(){
  const token = editToken || (document.getElementById('loadTokenInput')||{}).value || '';
  if(!token) return;
  const r = await fetch('/auth/trakt/disconnect/' + token + umProfileQuery(), {method:'POST'});
  const d = await r.json();
  if(d.ok){
    document.getElementById('traktUser').value = '';
    await checkTraktStatus(token, window.activeDeviceProfileId);
  }
}

async function checkTraktStatus(token, profileId){
  if(!token) return;
  try {
    const r = await fetch('/auth/trakt/status/' + token + umProfileQuery(profileId), {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if(d.connected){ document.getElementById('traktUser').value = d.username||''; updateTraktUI(true, d.username, d.expired, d.configured !== false, d.scope); }
    else { updateTraktUI(false, null, false, d.configured !== false, d.scope); }
    return !!d.connected;
  } catch(e) {
    renderIntegrationState('trakt',{kind:'error'});
    console.warn('[OAuth status] Trakt refresh failed:', e.message || String(e));
    throw e;
  }
}

// "At a glance" connected-count shown in the Integrations section header —
// re-derived from the 4 disconnect buttons' visibility, which each of the
// updateXUI functions below already keeps in sync with connection state.
function updateIntegrationsSummary(){
  const el = document.getElementById('integrationsSummary');
  if(!el) return;
  const ids = ['traktDisconnectBtn','simklDisconnectBtn','malDisconnectBtn','anilistDisconnectBtn'];
  const connected = ids.filter(function(id){
    const btn = document.getElementById(id);
    return btn && btn.style.display === 'inline-block';
  }).length;
  el.textContent = connected > 0 ? (connected + ' of 4 connected') : 'None connected';
}

function updateTraktUI(connected, username, expired, configured, scope){
  renderIntegrationState('trakt',configured===false
    ? {kind:'unavailable',scope:scope}
    : connected
      ? {kind:'connected',username:username,expired:expired,scope:scope}
      : {kind:'disconnected',scope:scope});
}


// ─── Simkl OAuth ───
async function connectSimkl(){
  let token = editToken || (document.getElementById('loadTokenInput')||{}).value || '';
  if(!token){
    const btn = document.getElementById('simklConnectBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = umT('setup.streams.savingDraft', 'Saving draft...'); btn.disabled = true;
    try {
      const res = await fetch('/auth/preauth', {method:'POST', headers:{'Content-Type':'application/json'}});
      const data = await res.json();
      if(data.token){ token = data.token; editToken = token; sessionStorage.setItem('um_setup_token', token); }
      else throw new Error('No token');
    } catch(e) { btn.innerHTML = orig; btn.disabled = false; alert(umT('setup.streams.couldNotSave', 'Could not save: ')+e.message); return; }
  }
  if(!await ensureIntegrationAvailable('simkl',token)) return;
  saveFormState();
  localStorage.setItem('um_return_scroll', window.scrollY);
  localStorage.setItem('um_return_tile', 'optional');
  window.location.href = '/auth/simkl/connect/' + token + umProfileQuery();
}

async function disconnectSimkl(){
  const token = editToken || '';
  if(!token) return;
  const r = await fetch('/auth/simkl/disconnect/'+token + umProfileQuery(), {method:'POST'});
  const d = await r.json();
  if(d.ok){
    document.getElementById('simklUser').value='';
    await checkSimklStatus(token, window.activeDeviceProfileId);
  }
}

async function checkSimklStatus(token, profileId){
  if(!token) return;
  try {
    const r = await fetch('/auth/simkl/status/'+token + umProfileQuery(profileId), {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if(d.connected){ document.getElementById('simklUser').value=d.username||''; updateSimklUI(true,d.username,d.configured !== false,d.scope); }
    else updateSimklUI(false,null,d.configured !== false,d.scope);
    return !!d.connected;
  } catch(e){
    renderIntegrationState('simkl',{kind:'error'});
    console.warn('[OAuth status] Simkl refresh failed:', e.message || String(e));
    throw e;
  }
}

function updateSimklUI(connected, username, configured, scope){
  renderIntegrationState('simkl',configured===false
    ? {kind:'unavailable',scope:scope}
    : connected ? {kind:'connected',username:username,scope:scope} : {kind:'disconnected',scope:scope});
}

// ─── MyAnimeList OAuth ───
async function connectMal(){
  let token = editToken || (document.getElementById('loadTokenInput')||{}).value || '';
  if(!token){
    const btn = document.getElementById('malConnectBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = umT('setup.streams.savingDraft2', 'Saving draft...'); btn.disabled = true;
    try {
      const res = await fetch('/auth/preauth', {method:'POST', headers:{'Content-Type':'application/json'}});
      const data = await res.json();
      if(data.token){ token = data.token; editToken = token; sessionStorage.setItem('um_setup_token', token); }
      else throw new Error('No token');
    } catch(e) { btn.innerHTML = orig; btn.disabled = false; alert(umT('setup.streams.couldNotSave2', 'Could not save: ')+e.message); return; }
  }
  if(!await ensureIntegrationAvailable('mal',token)) return;
  saveFormState();
  localStorage.setItem('um_return_scroll', window.scrollY);
  localStorage.setItem('um_return_tile', 'optional');
  window.location.href = '/auth/mal/connect/' + token;
}

async function disconnectMal(){
  const token = editToken || '';
  if(!token) return;
  const r = await fetch('/auth/mal/disconnect/'+token, {method:'POST'});
  const d = await r.json();
  if(d.ok){ document.getElementById('malUser').value=''; updateMalUI(false,null); }
}

async function checkMalStatus(token, profileId){
  if(!token) return;
  try {
    const r = await fetch('/auth/mal/status/'+token + umProfileQuery(profileId), {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if(d.connected){ document.getElementById('malUser').value=d.username||''; updateMalUI(true,d.username); }
    else updateMalUI(false,null, d.configured !== false);
    return !!d.connected;
  } catch(e){
    renderIntegrationState('mal',{kind:'error'});
    console.warn('[OAuth status] MyAnimeList refresh failed:', e.message || String(e));
    throw e;
  }
}

function updateMalUI(connected, username, configured){
  renderIntegrationState('mal',configured===false
    ? {kind:'unavailable'}
    : connected ? {kind:'connected',username:username} : {kind:'disconnected'});
}

// ─── AniList OAuth ───
async function connectAnilist(){
  let token = editToken || (document.getElementById('loadTokenInput')||{}).value || '';
  if(!token){
    const btn = document.getElementById('anilistConnectBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = umT('setup.streams.savingDraft3', 'Saving draft...'); btn.disabled = true;
    try {
      const res = await fetch('/auth/preauth', {method:'POST', headers:{'Content-Type':'application/json'}});
      const data = await res.json();
      if(data.token){ token = data.token; editToken = token; sessionStorage.setItem('um_setup_token', token); }
      else throw new Error('No token');
    } catch(e) { btn.innerHTML = orig; btn.disabled = false; alert(umT('setup.streams.couldNotSave3', 'Could not save: ')+e.message); return; }
  }
  if(!await ensureIntegrationAvailable('anilist',token)) return;
  saveFormState();
  localStorage.setItem('um_return_scroll', window.scrollY);
  localStorage.setItem('um_return_tile', 'optional');
  window.location.href = '/auth/anilist/connect/' + token;
}

async function disconnectAnilist(){
  const token = editToken || '';
  if(!token) return;
  const r = await fetch('/auth/anilist/disconnect/'+token, {method:'POST'});
  const d = await r.json();
  if(d.ok){ document.getElementById('anilistUser').value=''; updateAnilistUI(false,null); }
}

async function checkAnilistStatus(token, profileId){
  if(!token) return;
  try {
    const r = await fetch('/auth/anilist/status/'+token + umProfileQuery(profileId), {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if(d.connected){ document.getElementById('anilistUser').value=d.username||''; updateAnilistUI(true,d.username); }
    else updateAnilistUI(false,null, d.configured !== false);
    return !!d.connected;
  } catch(e){
    renderIntegrationState('anilist',{kind:'error'});
    console.warn('[OAuth status] AniList refresh failed:', e.message || String(e));
    throw e;
  }
}

function updateAnilistUI(connected, username, configured){
  renderIntegrationState('anilist',configured===false
    ? {kind:'unavailable'}
    : connected ? {kind:'connected',username:username} : {kind:'disconnected'});
}
