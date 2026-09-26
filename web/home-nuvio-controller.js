(function(global){
  'use strict';

  var initialised = false;
  var unsubscribe = null;
  var detectionGeneration = 0;
  var detectedProfileId = '';
  var detectedMatches = [];

  var V2_SESSION_KEY = 'ultramax.v2.nuvioSessionId';
  var V2_PROFILE_KEY = 'ultramax.v2.nuvioProfileIndex';

  function byId(id){ return document.getElementById(id); }
  function context(){ return global.UltraMaxWizardContext || null; }

  function persistV2Session(sessionId, profileIndex){
    var id = String(sessionId || '').trim();
    if(!id) return;
    var profile = Number(profileIndex);
    try {
      sessionStorage.setItem(V2_SESSION_KEY, id);
      localStorage.setItem(V2_SESSION_KEY, id);
      if(Number.isSafeInteger(profile) && profile >= 0){
        sessionStorage.setItem(V2_PROFILE_KEY, String(profile));
        localStorage.setItem(V2_PROFILE_KEY, String(profile));
      }
    } catch (_error) {}
  }

  function persistV2Profile(profileIndex){
    var profile = Number(profileIndex);
    if(!Number.isSafeInteger(profile) || profile < 0) return;
    try {
      sessionStorage.setItem(V2_PROFILE_KEY, String(profile));
      localStorage.setItem(V2_PROFILE_KEY, String(profile));
    } catch (_error) {}
  }

  function clearV2SessionStorage(){
    try {
      sessionStorage.removeItem(V2_SESSION_KEY);
      sessionStorage.removeItem(V2_PROFILE_KEY);
      localStorage.removeItem(V2_SESSION_KEY);
      localStorage.removeItem(V2_PROFILE_KEY);
    } catch (_error) {}
  }

  function getHomeState(){
    var ctx = context();
    var connected = !!(ctx && ctx.isNuvioConnected());
    var selected = ctx && typeof ctx.getSelectedNuvioProfile === 'function'
      ? ctx.getSelectedNuvioProfile()
      : null;

    var matches =
      selected &&
      detectedProfileId === String(selected.id || '')
        ? detectedMatches.slice()
        : [];

    return {
      connected: connected,
      selectedProfileId: selected ? String(selected.id || '') : '',
      selectedProfileName: selected ? String(selected.name || '') : '',
      detectedMatches: matches.map(function(match){
        return {
          setupId: String(match.setupId || '').trim().toUpperCase(),
          environment: String(match.environment || 'live').trim().toLowerCase(),
          enabled: match.enabled !== false
        };
      })
    };
  }

  function publishHomeState(){
    var state = getHomeState();

    if(
      global.UltraMaxHomeStart &&
      typeof global.UltraMaxHomeStart.updateNuvio === 'function'
    ){
      global.UltraMaxHomeStart.updateNuvio(state);
    }

    try {
      global.dispatchEvent(
        new CustomEvent('ultramax:home-nuvio-state', { detail: state })
      );
    } catch(_error) {}
  }

  function buildModal(){
    if(byId('homeNuvioModal')) return;

    var modal = document.createElement('div');
    modal.id = 'homeNuvioModal';
    modal.className = 'home-nuvio-modal';
    modal.hidden = true;
    modal.innerHTML = [
      '<div class="home-nuvio-backdrop" data-home-nuvio-close></div>',
      '<section class="home-nuvio-dialog" role="dialog" aria-modal="true" aria-labelledby="homeNuvioTitle">',
        '<button type="button" class="home-nuvio-close" data-home-nuvio-close aria-label="Close">✕</button>',
        '<div class="home-nuvio-mark" aria-hidden="true">N</div>',
        '<div class="home-nuvio-kicker">NUVIO CONNECTION</div>',
        '<h2 id="homeNuvioTitle">Connect Nuvio once</h2>',
        '<p class="home-nuvio-intro">Use one Nuvio connection across Ultra MAX. Your selected profile follows you through setup.</p>',

        '<div id="homeNuvioStatus" class="home-nuvio-status" role="status" aria-live="polite"></div>',

        '<form id="homeNuvioLoginForm" class="home-nuvio-login" novalidate>',
          '<label for="homeNuvioEmail">Nuvio email</label>',
          '<input id="homeNuvioEmail" type="email" autocomplete="username" inputmode="email" placeholder="you@example.com">',
          '<label for="homeNuvioPassword">Nuvio Password</label>',
          '<input id="homeNuvioPassword" type="password" autocomplete="current-password" placeholder="Your Nuvio password">',
          '<button id="homeNuvioConnectBtn" type="submit" class="home-nuvio-primary">Connect Nuvio</button>',
          '<small>Use the password for your Nuvio account. This is separate from your Ultra MAX setup password.</small>',
        '</form>',

        '<div id="homeNuvioConnected" class="home-nuvio-connected" hidden>',
          '<div class="home-nuvio-connected-head">',
            '<span class="home-nuvio-dot"></span>',
            '<div><strong>Connected</strong><small id="homeNuvioConnectedCopy">Choose the profile Ultra MAX should use.</small></div>',
          '</div>',
          '<label for="homeNuvioProfileSelect">Default Nuvio profile</label>',
          '<select id="homeNuvioProfileSelect"></select>',
          '<p class="home-nuvio-profile-help">You can still choose another profile in Step 4 when installing.</p>',
          '<div id="homeNuvioDiscovery" class="home-nuvio-discovery" hidden>',
            '<div class="home-nuvio-discovery-head"><strong id="homeNuvioDiscoveryTitle">Checking for Ultra MAX…</strong><small id="homeNuvioDiscoveryCopy"></small></div>',
            '<select id="homeNuvioDetectedSelect" hidden aria-label="Detected Ultra MAX setup"></select>',
            '<button id="homeNuvioLoadDetectedBtn" type="button" class="home-nuvio-load" hidden>Load detected setup</button>',
          '</div>',
          '<a id="homeNuvioReturnBtn" class="home-nuvio-return" href="#" hidden>Back to setup →</a>',
          '<div class="home-nuvio-actions">',
            '<a href="/account.html" class="home-nuvio-secondary">Manage account</a>',
            '<button id="homeNuvioDisconnectBtn" type="button" class="home-nuvio-danger">Disconnect</button>',
          '</div>',
        '</div>',
      '</section>'
    ].join('');

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-home-nuvio-close]').forEach(function(node){
      node.addEventListener('click', closeModal);
    });

    byId('homeNuvioLoginForm').addEventListener('submit', login);
    byId('homeNuvioProfileSelect').addEventListener('change', selectProfile);
    byId('homeNuvioDisconnectBtn').addEventListener('click', disconnect);
    byId('homeNuvioLoadDetectedBtn').addEventListener('click', loadDetectedSetup);
  }

  function setStatus(message, kind){
    var node = byId('homeNuvioStatus');
    if(!node) return;
    node.textContent = message || '';
    node.dataset.kind = kind || '';
  }

  function prefillRememberedCredentials(){
    var ctx = context();
    if(!ctx || typeof ctx.getRememberedCredentials !== 'function') return;
    var saved = ctx.getRememberedCredentials();
    if(!saved) return;
    var email = byId('homeNuvioEmail');
    var password = byId('homeNuvioPassword');
    if(email && !email.value) email.value = saved.email || '';
    if(password && !password.value) password.value = saved.password || '';
  }

  async function postJson(path, payload){
    var response = await fetch(path, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload || {})
    });
    var data = null;
    try { data = await response.json(); } catch (_error) {}
    if(!response.ok || !data || data.ok === false){
      var error = new Error(
        data && data.message
          ? data.message
          : 'Ultra MAX could not inspect this Nuvio profile.'
      );
      error.code = data && data.code ? data.code : 'NUVIO_DETECT_FAILED';
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function clearDetected(){
    detectionGeneration += 1;
    detectedProfileId = '';
    detectedMatches = [];
    var box = byId('homeNuvioDiscovery');
    if(box) box.hidden = true;
  }

  function renderDiscovery(selected, result){
    var box = byId('homeNuvioDiscovery');
    var title = byId('homeNuvioDiscoveryTitle');
    var copy = byId('homeNuvioDiscoveryCopy');
    var select = byId('homeNuvioDetectedSelect');
    var load = byId('homeNuvioLoadDetectedBtn');
    if(!box || !title || !copy || !select || !load) return;

    box.hidden = false;
    select.textContent = '';
    load.hidden = true;
    select.hidden = true;

    var matches = result && Array.isArray(result.matches)
      ? result.matches
      : [];

    if(!matches.length){
      title.textContent = 'No Ultra MAX setup found';
      copy.textContent =
        'There is no Ultra MAX add-on installed for ' +
        (selected && selected.name ? selected.name : 'this profile') + '.';
      return;
    }

    title.textContent = matches.length === 1
      ? 'Ultra MAX setup found'
      : matches.length + ' Ultra MAX setups found';

    copy.textContent = result.inheritedFromPrimary
      ? 'This profile inherits add-ons from the primary Nuvio profile.'
      : 'Detected from this profile’s installed add-ons.';

    matches.forEach(function(match){
      var option = document.createElement('option');
      option.value = match.setupId + '|' + match.environment;
      option.textContent =
        match.setupId + ' · ' +
        String(match.environment || 'live').toUpperCase() +
        (match.enabled === false ? ' · disabled' : '');
      select.appendChild(option);
    });

    if(matches.length > 1){
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose the Ultra MAX setup to load';
      select.insertBefore(placeholder, select.firstChild);
      select.value = '';
      select.hidden = false;
      load.hidden = false;
      load.disabled = true;
      select.onchange = function(){
        load.disabled = !select.value;
      };
    }else{
      select.value = matches[0].setupId + '|' + matches[0].environment;
      load.hidden = false;
      load.disabled = false;
    }
  }

  async function detectInstalledForSelected(selected){
    var ctx = context();
    if(
      !ctx ||
      !selected ||
      selected.numericProfileId === null ||
      selected.numericProfileId === undefined ||
      typeof ctx.getNuvioAccessToken !== 'function'
    ){
      clearDetected();
      return;
    }

    var generation = ++detectionGeneration;
    detectedProfileId = String(selected.id || '');
    detectedMatches = [];

    var box = byId('homeNuvioDiscovery');
    var title = byId('homeNuvioDiscoveryTitle');
    var copy = byId('homeNuvioDiscoveryCopy');
    var select = byId('homeNuvioDetectedSelect');
    var load = byId('homeNuvioLoadDetectedBtn');

    if(box) box.hidden = false;
    if(title) title.textContent = 'Checking for Ultra MAX…';
    if(copy) copy.textContent = 'Looking at the add-ons used by ' + selected.name + '.';
    if(select) select.hidden = true;
    if(load) load.hidden = true;

    try{
      var accessToken = ctx.getNuvioAccessToken();
      if(!accessToken) throw new Error('Reconnect Nuvio to inspect installed add-ons.');

      var adopted = await postJson('/api/v2/nuvio/adopt', {
        accessToken: accessToken
      });
      if(generation !== detectionGeneration) return;

      persistV2Session(
        adopted && adopted.session ? adopted.session.sessionId : '',
        selected.numericProfileId
      );

      var detected = await postJson('/api/v2/nuvio/detect', {
        sessionId: adopted.session.sessionId,
        profileIndex: selected.numericProfileId
      });
      if(generation !== detectionGeneration) return;

      detectedMatches = detected.result.matches || [];
      renderDiscovery(selected, detected.result);
      render();
    }catch(error){
      if(generation !== detectionGeneration) return;
      detectedMatches = [];
      if(box) box.hidden = false;
      if(title) title.textContent = 'Could not check installed Ultra MAX';
      if(copy) copy.textContent =
        error && error.message
          ? error.message
          : 'Try reconnecting Nuvio.';
      if(select) select.hidden = true;
      if(load) load.hidden = true;
    }
  }

  function selectedDetectedSetup(){
    var select = byId('homeNuvioDetectedSelect');
    var value = select ? String(select.value || '') : '';
    if(!value && detectedMatches.length === 1){
      value = detectedMatches[0].setupId + '|' + detectedMatches[0].environment;
    }
    if(!value) return null;

    var parts = value.split('|');
    var setupId = String(parts[0] || '').trim().toUpperCase();
    var environment = String(parts[1] || 'live').trim().toLowerCase();

    if(!/^[A-Z0-9]{8}$/.test(setupId)) return null;
    if(!['live','dev'].includes(environment)) return null;

    return {
      setupId: setupId,
      environment: environment
    };
  }

  function loadDetectedSetup(){
    var detected = selectedDetectedSetup();
    if(!detected) return;

    // Do not create a second Nuvio-specific load pipeline here.
    // Hand the detected token to Ultra MAX's existing, proven
    // Load Existing flow and let that own password verification
    // and config hydration.
    var url = new URL('/setup.html', global.location.origin);
    url.searchParams.set('shortcut', 'load-token');
    url.searchParams.set('prefillToken', detected.setupId);

    var current = new URL(global.location.href);
    if(
      current.searchParams.get('native') === '1' ||
      document.documentElement.classList.contains('native-app')
    ){
      url.searchParams.set('native', '1');
    }

    global.location.href = url.pathname + url.search;
  }

  function renderProfiles(snapshot){
    var select = byId('homeNuvioProfileSelect');
    if(!select) return;

    var current = snapshot.nuvio.selectedProfileId || '';
    select.textContent = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a profile';
    select.appendChild(placeholder);

    (snapshot.nuvio.profiles || []).forEach(function(profile){
      var option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      select.appendChild(option);
    });

    select.value = current;
  }

  function render(){
    var ctx = context();
    if(!ctx) return;
    var snapshot = ctx.getSnapshot();
    var connected = ctx.isNuvioConnected();
    var selected = ctx.getSelectedNuvioProfile();

    var tile = byId('homeNuvioTile');
    var name = byId('homeNuvioName');
    var desc = byId('homeNuvioDesc');
    var chip = byId('homeNuvioChip');

    if(tile){
      tile.classList.toggle('is-connected', connected);
      tile.setAttribute('aria-label', connected
        ? 'Nuvio connected. Open connection settings.'
        : 'Connect Nuvio');
    }

    if(name){
      name.textContent = connected ? 'Nuvio' : 'Connect Nuvio';
      name.removeAttribute('data-i18n');
    }

    if(desc){
      desc.textContent = connected
        ? (
            selected
              ? 'Connected as ' + selected.name
              : 'Choose your default profile'
          )
        : 'Find your existing Ultra MAX setup automatically';
      desc.removeAttribute('data-i18n');
    }

    if(chip){
      chip.hidden = !connected;
      chip.textContent = 'CONNECTED';
    }

    var login = byId('homeNuvioLoginForm');
    var connectedPanel = byId('homeNuvioConnected');
    if(login) login.hidden = connected;
    if(connectedPanel) connectedPanel.hidden = !connected;
    if(!connected) prefillRememberedCredentials();

    var returnButton = byId('homeNuvioReturnBtn');
    if(returnButton){
      var params = new URLSearchParams(global.location.search || '');
      var returnTo = params.get('return') || '';
      var safeReturn = returnTo.charAt(0) === '/' && returnTo.indexOf('//') !== 0
        ? returnTo
        : '';
      returnButton.hidden = !(connected && selected && safeReturn);
      if(safeReturn) returnButton.href = safeReturn;
    }

    if(connected){
      renderProfiles(snapshot);
      var copy = byId('homeNuvioConnectedCopy');
      if(copy){
        copy.textContent = selected
          ? 'Ultra MAX will use ' + selected.name + ' by default.'
          : 'Choose the profile Ultra MAX should use by default.';
      }
      setStatus('');
    }

    publishHomeState();
  }

  function openModal(){
    buildModal();
    prefillRememberedCredentials();
    render();
    var modal = byId('homeNuvioModal');
    modal.hidden = false;
    requestAnimationFrame(function(){ modal.classList.add('is-open'); });

    var ctx = context();
    if(ctx && !ctx.isNuvioConnected()){
      var email = byId('homeNuvioEmail');
      if(email) setTimeout(function(){ email.focus(); }, 80);
    }
  }

  function closeModal(){
    var modal = byId('homeNuvioModal');
    if(!modal) return;
    modal.classList.remove('is-open');
    setTimeout(function(){ modal.hidden = true; }, 180);
  }

  async function login(event){
    event.preventDefault();
    var ctx = context();
    if(!ctx) return;

    var email = byId('homeNuvioEmail').value.trim();
    var passwordInput = byId('homeNuvioPassword');
    var password = passwordInput.value;
    var button = byId('homeNuvioConnectBtn');

    if(!email || !password){
      setStatus('Enter your Nuvio email and password.', 'error');
      return;
    }

    button.disabled = true;
    setStatus('Connecting and loading profiles…', 'working');

    try{
      var result = await ctx.connectWithCredentials(email, password, {remember:true});
      if(!result || result.stale) return;

      var snapshot = ctx.getSnapshot();
      if(!ctx.getSelectedNuvioProfile() && snapshot.nuvio.profiles.length === 1){
        ctx.selectNuvioProfile(snapshot.nuvio.profiles[0].id, 'homeGlobal');
      }

      setStatus('Nuvio connected.', 'success');
      passwordInput.value = '';
      render();
      var selectedAfterLogin = ctx.getSelectedNuvioProfile();
      if(selectedAfterLogin) await detectInstalledForSelected(selectedAfterLogin);
    }catch(error){
      setStatus(
        error && error.message
          ? error.message
          : 'Could not connect to Nuvio. Check your details and try again.',
        'error'
      );
    }finally{
      button.disabled = false;
      passwordInput.value = '';
    }
  }

  async function selectProfile(event){
    var ctx = context();
    if(!ctx) return;
    var id = event.target.value;

    if(!id){
      setStatus('Choose a Nuvio profile.', 'error');
      return;
    }

    var selected = ctx.selectNuvioProfile(id, 'homeGlobal');
    if(!selected){
      setStatus('That Nuvio profile is no longer available.', 'error');
      render();
      return;
    }

    persistV2Profile(selected.numericProfileId);
    clearDetected();
    setStatus(selected.name + ' is now your default Nuvio profile.', 'success');
    render();
    await detectInstalledForSelected(selected);
  }

  async function disconnect(){
    var ctx = context();
    if(!ctx) return;

    var button = byId('homeNuvioDisconnectBtn');
    button.disabled = true;
    setStatus('Disconnecting…', 'working');

    try{
      var storedV2SessionId = '';
      try {
        storedV2SessionId = String(
          localStorage.getItem(V2_SESSION_KEY) ||
          sessionStorage.getItem(V2_SESSION_KEY) ||
          ''
        ).trim();
      } catch (_error) {}

      clearDetected();
      clearV2SessionStorage();

      if(storedV2SessionId){
        await postJson('/api/v2/nuvio/disconnect', {
          sessionId: storedV2SessionId
        }).catch(function(){});
      }

      await ctx.disconnectNuvio('homeGlobalDisconnect');
      setStatus('Nuvio disconnected.', 'success');
      render();
    }finally{
      button.disabled = false;
    }
  }

  async function init(){
    if(initialised) return;
    var tile = byId('homeNuvioTile');
    var ctx = context();
    if(!tile || !ctx) return;
    initialised = true;

    buildModal();

    tile.addEventListener('click', function(event){
      event.preventDefault();
      openModal();
    });

    unsubscribe = ctx.subscribe(render);
    render();

    setStatus('Checking your saved Nuvio connection…', 'working');
    try{
      await ctx.restoreRememberedSessionOnce();
    }finally{
      render();
    }

    var restoredSelected = ctx.getSelectedNuvioProfile();
    if(restoredSelected){
      await detectInstalledForSelected(restoredSelected);
    }

    var params = new URLSearchParams(global.location.search || '');
    if(params.get('nuvio') === 'connect'){
      openModal();
    }
  }

  global.UltraMaxHomeNuvio = Object.freeze({
    init:init,
    open:openModal,
    render:render,
    getState:getHomeState,
    loadDetectedSetup:loadDetectedSetup,
    detectInstalledForSelected:detectInstalledForSelected
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
})(window);
