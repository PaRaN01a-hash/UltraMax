(function(global){
  'use strict';

  var initialised = false;
  var profileChooserExpanded = false;
  var v2Session = null;

  var V2_SESSION_KEY = 'ultramax.v2.nuvioSessionId';
  var V2_PROFILE_KEY = 'ultramax.v2.nuvioProfileIndex';

  function byId(id){ return document.getElementById(id); }
  function context(){ return global.UltraMaxWizardContext || null; }

  function homeConnectUrl(){
    var returnTo = global.location.pathname + global.location.search;
    return '/app.html?nuvio=connect&return=' + encodeURIComponent(returnTo);
  }

  function readStoredV2SessionId(){
    try {
      return String(
        sessionStorage.getItem(V2_SESSION_KEY) ||
        localStorage.getItem(V2_SESSION_KEY) ||
        ''
      ).trim();
    } catch (_error) {
      return '';
    }
  }

  function readStoredV2ProfileIndex(){
    try {
      var raw =
        sessionStorage.getItem(V2_PROFILE_KEY) ||
        localStorage.getItem(V2_PROFILE_KEY);
      if(raw === null || raw === undefined || raw === '') return null;
      var parsed = Number(raw);
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function persistV2Session(session, profileIndex){
    if(!session || !session.sessionId) return;
    var profile = Number(profileIndex);
    try {
      sessionStorage.setItem(V2_SESSION_KEY, String(session.sessionId));
      localStorage.setItem(V2_SESSION_KEY, String(session.sessionId));
      if(Number.isSafeInteger(profile) && profile >= 0){
        sessionStorage.setItem(V2_PROFILE_KEY, String(profile));
        localStorage.setItem(V2_PROFILE_KEY, String(profile));
      }
    } catch (_error) {}
  }

  function clearStoredV2Session(){
    try {
      sessionStorage.removeItem(V2_SESSION_KEY);
      sessionStorage.removeItem(V2_PROFILE_KEY);
      localStorage.removeItem(V2_SESSION_KEY);
      localStorage.removeItem(V2_PROFILE_KEY);
    } catch (_error) {}
  }

  async function verifyStoredV2Session(){
    var sessionId = readStoredV2SessionId();
    if(!sessionId) return null;

    try {
      var response = await fetch('/api/v2/nuvio/session', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({ sessionId: sessionId })
      });

      var payload = await response.json().catch(function(){ return null; });
      if(!response.ok || !payload || payload.ok === false || !payload.session){
        clearStoredV2Session();
        return null;
      }

      persistV2Session(payload.session, readStoredV2ProfileIndex());
      return payload.session;
    } catch (_error) {
      return null;
    }
  }

  async function adoptRememberedContextSession(){
    var ctx = context();
    if(
      !ctx ||
      !ctx.isNuvioConnected() ||
      typeof ctx.getNuvioAccessToken !== 'function'
    ){
      return null;
    }

    var accessToken = String(ctx.getNuvioAccessToken() || '').trim();
    if(!accessToken) return null;

    try {
      var response = await fetch('/api/v2/nuvio/adopt', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json'
        },
        cache: 'no-store',
        body: JSON.stringify({ accessToken: accessToken })
      });

      var payload = await response.json().catch(function(){ return null; });
      if(!response.ok || !payload || payload.ok === false || !payload.session){
        return null;
      }

      var selected = typeof ctx.getSelectedNuvioProfile === 'function'
        ? ctx.getSelectedNuvioProfile()
        : null;
      var profileIndex = selected && Number.isSafeInteger(Number(selected.numericProfileId))
        ? Number(selected.numericProfileId)
        : readStoredV2ProfileIndex();

      persistV2Session(payload.session, profileIndex);
      return payload.session;
    } catch (_error) {
      return null;
    }
  }

  function hideCredentialUi(){
    document.body.classList.add('um-global-nuvio-home-only');

    var step1 = byId('step1NuvioPanel');
    if(step1) step1.hidden = true;

    var step4Login = byId('nuvio-login-stage');
    if(step4Login) step4Login.style.display = 'none';

  }

  function setConnectionState(kind, text){
    var shell = byId('s4NuvioConnectionState');
    var copy = byId('s4NuvioConnectionText');
    if(shell) shell.dataset.state = kind;
    if(copy) copy.textContent = text;
  }

  function setConnectAction(visible){
    var action = byId('s4NuvioConnectAction');
    if(!action) return;
    action.href = homeConnectUrl();
    action.style.display = visible ? 'inline-flex' : 'none';
  }

  function getConnectedView(){
    if(v2Session && Array.isArray(v2Session.profiles)){
      var preferredIndex = readStoredV2ProfileIndex();
      var selected = v2Session.profiles.find(function(profile){
        return Number(profile.profileIndex) === Number(preferredIndex);
      }) || null;

      if(!selected && v2Session.profiles.length === 1){
        selected = v2Session.profiles[0];
      }

      return {
        kind: 'v2',
        selected: selected
          ? {
              name: selected.name,
              numericProfileId: Number(selected.profileIndex)
            }
          : null,
        profileCount: v2Session.profiles.length
      };
    }

    var ctx = context();
    if(ctx && ctx.isNuvioConnected()){
      var snapshot = ctx.getSnapshot();
      return {
        kind: 'legacy',
        selected: ctx.getSelectedNuvioProfile(),
        profileCount:
          snapshot &&
          snapshot.nuvio &&
          Array.isArray(snapshot.nuvio.profiles)
            ? snapshot.nuvio.profiles.length
            : 0
      };
    }

    return null;
  }

  function renderDisconnected(){
    hideCredentialUi();
    profileChooserExpanded = false;

    setConnectionState('disconnected', 'Nuvio is not connected');
    setConnectAction(true);

    var profileStage = byId('nuvio-profile-stage');
    var profileSummary = byId('s4NuvioProfileSummary');
    var profileToggle = byId('s4NuvioProfileToggle');
    var profileList = byId('nuvio-profile-list');
    if(profileStage) profileStage.style.display = 'none';
    if(profileSummary) profileSummary.style.display = 'none';
    if(profileToggle) profileToggle.style.display = 'none';
    if(profileList) profileList.style.display = 'none';

    var status = byId('nuvio-status');
    if(status){
      status.textContent = 'Connect Nuvio once from Home, then return here to install.';
      status.style.color = 'var(--muted)';
    }

  }

  function renderConnectedState(){
    hideCredentialUi();

    var view = getConnectedView();
    if(!view){
      renderDisconnected();
      return;
    }

    var selected = view.selected;
    var profileStage = byId('nuvio-profile-stage');
    var profileSummary = byId('s4NuvioProfileSummary');
    var profileToggle = byId('s4NuvioProfileToggle');
    var profileList = byId('nuvio-profile-list');
    var status = byId('nuvio-status');

    setConnectionState('connected', 'Nuvio connected');
    setConnectAction(false);

    if(profileStage) profileStage.style.display = 'block';

    if(profileSummary){
      profileSummary.style.display = 'block';
      profileSummary.textContent = selected
        ? 'Ready to install to ' + selected.name + '.'
        : 'Choose a Nuvio profile for this install.';
    }

    if(profileToggle){
      var canCollapse = !!selected && view.profileCount > 1;
      profileToggle.style.display = canCollapse ? 'inline-flex' : 'none';
      profileToggle.textContent = profileChooserExpanded ? 'Hide profiles' : 'Change profiles';
      profileToggle.setAttribute('aria-expanded', profileChooserExpanded ? 'true' : 'false');
    }

    if(profileList){
      profileList.style.display =
        selected && !profileChooserExpanded
          ? 'none'
          : 'block';
    }

    if(status){
      status.textContent = selected
        ? ''
        : 'Select the profile where Ultra MAX should be installed.';
      status.style.color = 'var(--muted)';
    }
  }

  function hydrateConsumers(){
    hideCredentialUi();

    var adapters = global.UltraMaxWizardContextAdapters || {};

    if(
      v2Session &&
      adapters.step4Finalise &&
      typeof adapters.step4Finalise.hydrateFromV2Session === 'function'
    ){
      adapters.step4Finalise.hydrateFromV2Session(
        v2Session,
        readStoredV2ProfileIndex()
      );
      renderConnectedState();
      return;
    }

    var ctx = context();
    if(!ctx || !ctx.isNuvioConnected()){
      renderDisconnected();
      return;
    }

    if(
      adapters.step4Finalise &&
      typeof adapters.step4Finalise.hydrateFromSharedPrimary === 'function'
    ){
      adapters.step4Finalise.hydrateFromSharedPrimary();
    }

    renderConnectedState();
  }

  function bindProfileToggle(){
    var toggle = byId('s4NuvioProfileToggle');
    if(!toggle || toggle.dataset.bound === '1') return;

    toggle.dataset.bound = '1';
    toggle.addEventListener('click', function(){
      profileChooserExpanded = !profileChooserExpanded;
      renderConnectedState();
    });
  }

  async function refresh(){
    hideCredentialUi();

    v2Session = await verifyStoredV2Session();
    if(v2Session){
      hydrateConsumers();
      return true;
    }

    var ctx = context();
    if(ctx){
      try {
        if(!ctx.isNuvioConnected()){
          await ctx.restoreRememberedSessionOnce();
        }
      } catch (_error) {}

      if(ctx.isNuvioConnected()){
        v2Session = await adoptRememberedContextSession();
      }
    }

    hydrateConsumers();
    return !!getConnectedView();
  }

  async function init(){
    if(initialised) return;
    var ctx = context();
    if(!ctx) return;
    initialised = true;

    hideCredentialUi();
    bindProfileToggle();
    ctx.subscribe(function(){
      if(!v2Session) hydrateConsumers();
    });

    await refresh();
  }

  global.UltraMaxGlobalNuvioSetup = Object.freeze({
    init:init,
    hydrate:hydrateConsumers,
    refresh:refresh,
    connectUrl:homeConnectUrl,
    getV2Session:function(){ return v2Session; },
    getV2SessionId:function(){ return v2Session && v2Session.sessionId ? v2Session.sessionId : ''; }
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
})(window);