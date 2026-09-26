function toggleReturning(){
  const box = document.getElementById('returningBox');
  box.classList.toggle('open');
}

function toggleCollapsible(id, el){
  const box = document.getElementById(id);
  const isOpen = box.classList.contains('open');
  box.classList.toggle('open');
  el.textContent = isOpen ? 'ⓘ How do I get a key?' : 'ⓘ Hide guide';
  setTimeout(makeSprockets, 100);
}

async function loadConfig(){
  const token = document.getElementById('tokenInput').value.trim();
  if(!token) return;
  editToken = token;
  syncUltraMaxWizardContext('loadConfig');
  window.um_isReturningUser = true;
  window.history.pushState({}, '', '/configure/' + token);
  showTokenPasswordModal(token);
}

function loadReturningConfig(){
  const input = document.getElementById('returningToken');
  const token = (input ? input.value : '').trim().toUpperCase();
  if(!token){ if(input) input.focus(); return; }
  editToken = token;
  syncUltraMaxWizardContext('loadReturningConfig');
  window.um_isReturningUser = true;
  sessionStorage.setItem('um_setup_token', token);
  window.history.pushState({}, '', '/configure/' + token);
  showTokenPasswordModal(token);
}

var _pendingToken = null;

function showLoadedSetupEditor(){
  document.body.classList.remove('um-route-choosing', 'quick-v3-mode');
  var chooser = document.getElementById('umModeChooser');
  var reopen = document.getElementById('umModeReopen');
  var toolbar = document.getElementById('step1Toolbar');
  var quick = document.getElementById('quickSetupV3');
  var advanced = document.getElementById('advancedBuilderContainer');
  var returning = document.getElementById('returningBox');
  var backBar = document.getElementById('advancedBackBar');
  if(chooser) chooser.classList.add('hidden');
  if(reopen) reopen.classList.add('visible');
  if(toolbar) toolbar.style.display = 'none';
  if(quick) quick.style.display = 'none';
  if(advanced) advanced.style.display = '';
  if(returning) returning.classList.remove('open');
  if(backBar) backBar.style.display = 'none';
  refreshLoadedStep1CredentialUi();
}

function refreshLoadedStep1CredentialUi(){
  if(typeof updateDiscoveryCapabilityUi === 'function'){
    updateDiscoveryCapabilityUi();
  }

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

function scheduleLoadedStep1CredentialUiRefresh(){
  refreshLoadedStep1CredentialUi();
  setTimeout(refreshLoadedStep1CredentialUi, 120);
  setTimeout(refreshLoadedStep1CredentialUi, 650);
}

// ── WELCOME MODAL ──
function showWelcomeModal(){
  var modal =
    document.getElementById('welcomeModal');

  if(!modal) return;

  var choicePanel =
    document.getElementById('welcomeChoicePanel');

  var tokenPanel =
    document.getElementById('welcomeTokenPanel');

  var savedPanel =
    document.getElementById('welcomeSavedPanel');

  var saved =
    typeof umGetSession === 'function'
      ? umGetSession()
      : null;

  if(tokenPanel) {
    tokenPanel.style.display = 'none';
  }

  if(saved && saved.token && saved.password) {
    if(choicePanel) {
      choicePanel.style.display = 'none';
    }

    if(savedPanel) {
      savedPanel.style.display = 'block';
    }

    var tokenLabel =
      document.getElementById(
        'welcomeSavedToken'
      );

    if(tokenLabel) {
      tokenLabel.textContent =
        umMaskSavedToken(saved.token);
    }
  } else {
    if(savedPanel) {
      savedPanel.style.display = 'none';
    }

    if(choicePanel) {
      choicePanel.style.display = 'block';
    }
  }

  modal.style.display = 'flex';
}

function toggleToolsMenu(){
  var menu = document.getElementById('toolsMenu');
  if(menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
// Close tools menu when clicking outside
document.addEventListener('click', function(e){
  var menu = document.getElementById('toolsMenu');
  if(menu && !e.target.closest('#toolsMenu') && !e.target.closest('[onclick*="toggleToolsMenu"]')){
    menu.style.display = 'none';
  }
});

// ULTRAMAX SAVED SETUP FUNCTIONS START

function umMaskSavedToken(token) {
  token = String(token || '').toUpperCase();

  if(token.length <= 4) {
    return '••••••••';
  }

  return (
    token.slice(0, 2) +
    '••••' +
    token.slice(-2)
  );
}

function welcomeContinueSavedSetup() {
  var saved =
    typeof umGetSession === 'function'
      ? umGetSession()
      : null;

  var status =
    document.getElementById(
      'welcomeSavedStatus'
    );

  var button =
    document.getElementById(
      'welcomeContinueSavedBtn'
    );

  if(
    !saved ||
    !saved.token ||
    !saved.password
  ) {
    if(status) {
      status.style.color = '#ff8295';
      status.textContent =
        umT('setup.landing.theSavedSetupIsIncompletePlease', 'The saved setup is incomplete. Please enter the token again.');
    }

    welcomeUseDifferentToken();
    return;
  }

  if(button) {
    button.disabled = true;
    button.textContent = umT('setup.landing.checkingSavedSetup', 'Checking saved setup...');
  }

  if(status) {
    status.style.color = 'var(--muted)';
    status.textContent =
      umT('setup.landing.verifyingTheSavedSetupSecurely', 'Verifying the saved setup securely...');
  }

  editToken =
    String(saved.token).trim().toUpperCase();
  window.um_isReturningUser = true;

  sessionStorage.setItem(
    'um_setup_token',
    editToken
  );

  var welcomeModal =
    document.getElementById(
      'welcomeModal'
    );

  if(welcomeModal) {
    welcomeModal.style.display = 'none';
  }

  showTokenPasswordModal(editToken);

  var passwordInput =
    document.getElementById(
      'tokenModalPassword'
    );

  var rememberCheckbox =
    document.getElementById(
      'rememberMeModalDevice'
    );

  if(passwordInput) {
    passwordInput.value =
      saved.password;
  }

  if(rememberCheckbox) {
    rememberCheckbox.checked = true;
  }

  setTimeout(function () {
    verifyTokenPassword()
      .finally(function () {
        if(button) {
          button.disabled = false;
          button.textContent =
            umT('setup.landing.continueSetup', 'Continue Setup →');
        }
      });
  }, 100);
}

function welcomeUseDifferentToken() {
  var savedPanel =
    document.getElementById(
      'welcomeSavedPanel'
    );

  var tokenPanel =
    document.getElementById(
      'welcomeTokenPanel'
    );

  var choicePanel =
    document.getElementById(
      'welcomeChoicePanel'
    );

  if(savedPanel) {
    savedPanel.style.display = 'none';
  }

  if(choicePanel) {
    choicePanel.style.display = 'none';
  }

  if(tokenPanel) {
    tokenPanel.style.display = 'block';
  }

  var tokenInput =
    document.getElementById(
      'welcomeTokenInput'
    );

  if(tokenInput) {
    tokenInput.value = '';

    setTimeout(function () {
      tokenInput.focus();
    }, 100);
  }

  var error =
    document.getElementById(
      'welcomeTokenError'
    );

  if(error) {
    error.textContent = '';
  }
}

function welcomeForgetSavedSetup() {
  if(typeof umClearSession === 'function') {
    umClearSession();
  }

  try {
    localStorage.removeItem('ultramax_resume_credentials_v1');
  } catch(_resumeCredentialError) {}

  sessionStorage.removeItem(
    'um_setup_token'
  );

  var savedPanel =
    document.getElementById(
      'welcomeSavedPanel'
    );

  var choicePanel =
    document.getElementById(
      'welcomeChoicePanel'
    );

  var tokenPanel =
    document.getElementById(
      'welcomeTokenPanel'
    );

  if(savedPanel) {
    savedPanel.style.display = 'none';
  }

  if(tokenPanel) {
    tokenPanel.style.display = 'none';
  }

  if(choicePanel) {
    choicePanel.style.display = 'block';
  }

  var status =
    document.getElementById(
      'welcomeSavedStatus'
    );

  if(status) {
    status.textContent = '';
  }

  if(
    typeof showToast === 'function'
  ) {
    showToast(
      umT('setup.landing.savedSetupRemovedFromThisDevice', 'Saved setup removed from this device')
    );
  }
}

// ULTRAMAX SAVED SETUP FUNCTIONS END

function welcomeNewSetup(){
  var modal = document.getElementById('welcomeModal');
  if(modal) modal.style.display = 'none';
  clearUltraMaxWizardContextForNewSetup();
  // Show help/onboarding
  if(typeof showHowToUse === 'function') setTimeout(showHowToUse, 300);
}

function welcomeLoadToken(){
  document.getElementById('welcomeChoicePanel').style.display = 'none';
  document.getElementById('welcomeTokenPanel').style.display = 'block';
  setTimeout(function(){ document.getElementById('welcomeTokenInput').focus(); }, 100);
}

function clearLauncherShortcutRoute(){
  document.documentElement.classList.remove('um-shortcut-load-token');

  try {
    var url = new URL(window.location.href);
    if(url.searchParams.has('shortcut')){
      url.searchParams.delete('shortcut');
      window.history.replaceState(
        window.history.state,
        '',
        url.pathname + url.search + url.hash
      );
    }
  } catch(e) {}
}

function welcomeBackToChoice(){
  clearLauncherShortcutRoute();
  document.getElementById('welcomeTokenPanel').style.display = 'none';
  document.getElementById('welcomeChoicePanel').style.display = 'block';
  document.getElementById('welcomeTokenInput').value = '';
  document.getElementById('welcomeTokenError').textContent = '';
}

function welcomeSubmitToken(){
  var token = document.getElementById('welcomeTokenInput').value.trim().toUpperCase();
  var errEl = document.getElementById('welcomeTokenError');
  var btn = document.getElementById('welcomeTokenBtn');
  if(token.length < 6){ errEl.textContent = umT('setup.landing.pleaseEnterYourToken', 'Please enter your token'); return; }

  // The launcher route is only needed to reach this panel. Remove it before
  // opening the password flow so a late setup initialiser cannot reopen the
  // token-entry overlay on top of the password modal.
  clearLauncherShortcutRoute();
  window.um_isReturningUser = true;
  window._tokenLoadInProgress = true;

  // Close welcome modal and show password modal
  document.getElementById('welcomeModal').style.display = 'none';
  editToken = token;
  syncUltraMaxWizardContext('welcomeSubmitToken');
  window.um_isReturningUser = true;
  sessionStorage.setItem('um_setup_token', token);
  showTokenPasswordModal(token);
}

function showTokenPasswordModal(token){
  _pendingToken = token;
  window._tokenLoadInProgress = true;
  var modal = document.getElementById('tokenPasswordModal');
  if(modal){ modal.style.display = 'flex'; }

  // Remember Me: if this token has a remembered password (regardless of
  // which flow got us here — direct ?token= link, the "Load Existing
  // Setup" box, etc.), pre-fill it and reflect the checkbox state instead
  // of making the user retype it every time.
  var remembered = (typeof umGetSession === 'function') ? umGetSession() : null;
  var pwInp = document.getElementById('tokenModalPassword');
  var rememberCb = document.getElementById('rememberMeModalDevice');
  var mainRememberCb = document.getElementById('rememberMeDevice');
  var matches = !!(remembered && remembered.password &&
    String(remembered.token || '').trim().toUpperCase() === String(token || '').trim().toUpperCase());

  var nativeRememberDefault = false;
  try {
    var nativeSurface =
      new URLSearchParams(window.location.search).get('native') === '1' ||
      document.documentElement.classList.contains('um-app-mode') ||
      (typeof umIsStandalone === 'function' && umIsStandalone());

    if(nativeSurface){
      nativeRememberDefault =
        localStorage.getItem('ultramax_native_remember_setup_pref_v1') !== '0';
    }
  } catch(_error) {}

  if(pwInp) pwInp.value = matches ? remembered.password : '';
  if(rememberCb) rememberCb.checked = nativeRememberDefault || matches;
  if(mainRememberCb) mainRememberCb.checked = nativeRememberDefault || matches;
  var errEl = document.getElementById('tokenModalError');
  if(errEl) errEl.textContent = '';

  setTimeout(function(){
    var inp = document.getElementById('tokenModalPassword');
    if(inp && !matches) inp.focus();
  }, 100);
}

function cancelTokenModal(){
  var modal = document.getElementById('tokenPasswordModal');
  if(modal) modal.style.display = 'none';
  _pendingToken = null;
  document.getElementById('tokenModalPassword').value = '';
  document.getElementById('tokenModalError').textContent = '';
}

async function verifyTokenPassword(){
  var pass = document.getElementById('tokenModalPassword').value;
  var errEl = document.getElementById('tokenModalError');
  var btn = document.getElementById('tokenModalBtn');
  if(!pass){ errEl.textContent = umT('setup.auth.pleaseEnterYourPassword', 'Please enter your password'); return; }
  btn.textContent = umT('setup.auth.checking', 'Checking...'); btn.disabled = true;
  errEl.textContent = '';

  try {
    var res = await fetch(API_BASE + '/c/' + _pendingToken + '/config', {
      headers: { 'x-config-password': pass }
    });
    if(res.status === 404){
      errEl.textContent = umT('setup.auth.tokenNotFound', 'Token not found');
      btn.textContent = umT('setup.auth.loadMySetup', 'Load My Setup →');
      btn.disabled = false;
      return;
    }
    if(res.status === 401){
      errEl.textContent = umT('setup.auth.incorrectPasswordPleaseTryAgain', 'Incorrect password — please try again');
      btn.textContent = umT('setup.auth.loadMySetup2', 'Load My Setup →');
      btn.disabled = false;
      return;
    }
    if(!res.ok){
      errEl.textContent = umT('setup.auth.errorCheckingPassword', 'Error checking password');
      btn.textContent = umT('setup.auth.loadMySetup3', 'Load My Setup →');
      btn.disabled = false;
      return;
    }

    var checkRes = await fetch(API_BASE + '/c/' + _pendingToken + '/verify-password', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password: pass })
    });

    if(!checkRes.ok){
      errEl.textContent = umT('setup.auth.incorrectPasswordPleaseTryAgain', 'Incorrect password — please try again');
      btn.textContent = umT('setup.auth.loadMySetup2', 'Load My Setup →');
      btn.disabled = false;
      return;
    }

    showLoadedSetupEditor();
    _configPassword = pass;
  
    var modal = document.getElementById('tokenPasswordModal');
    if(modal) modal.style.display = 'none';
    var pwEl = document.getElementById('password');
    if(pwEl) pwEl.value = pass;

    var rememberControl = document.getElementById('rememberMeModalDevice');
    var mainRememberControl = document.getElementById('rememberMeDevice');
    var shouldRemember = rememberControl
      ? !!rememberControl.checked
      : (
          typeof window.umShouldRememberSetup === 'function' &&
          window.umShouldRememberSetup()
        );
    if(mainRememberControl) mainRememberControl.checked = !!shouldRemember;

    if (shouldRemember) {
      if (typeof umSaveSession === 'function') umSaveSession(_pendingToken, pass);
    } else if (typeof umClearSession === 'function') {
      umClearSession();
    }

    var confirmEl = document.getElementById('confirmPassword');
    if(confirmEl) confirmEl.value = pass;
    document.getElementById('tokenModalPassword').value = '';

    var cpw = document.getElementById('confirmPasswordWrap');
    if(cpw) cpw.style.display = 'none';
    var fpc = document.getElementById('forgotPasswordCard');
    if(fpc){ fpc.style.display = 'block'; fpc.dataset.wasShown = 'true'; }

    loadConfigByToken(_pendingToken).then(function(){
      setTimeout(function(){ setStep(1); }, 800);
      setTimeout(function(){
        var rowCount = selected ? selected.size : 0;
        var collCount = v2Collections ? v2Collections.length : 0;
        var msg = '✓ Setup loaded — ' + rowCount + ' rows';
        if(collCount > 0) msg += ', ' + collCount + ' collection' + (collCount !== 1 ? 's' : '');
        if(typeof showBanner === 'function') showBanner(msg, 'success');
      }, 1200);
    });
  } catch(e) {
    if(e && e.status === 404){
      errEl.textContent = umT('setup.auth.tokenNotFound', 'Token not found');
    } else if(e && e.status === 401){
      errEl.textContent = umT('setup.auth.incorrectPasswordPleaseTryAgain', 'Incorrect password — please try again');
    } else {
      errEl.textContent = e && e.message
        ? e.message
        : umT('setup.auth.errorCheckingPassword', 'Error checking password');
    }
    btn.textContent = umT('setup.auth.loadMySetup3', 'Load My Setup →');
    btn.disabled = false;
  }
}

function toggleModalForgotPassword(){
  const box = document.getElementById('modalForgotBox');
  if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

async function resetPasswordFromModal(){
  const token = _pendingToken;
  const msg = document.getElementById('modalResetMsg');
  if(!token){
    if(msg){ msg.style.color='#f87171'; msg.textContent = umT('setup.landing.pleaseLoadYourConfigFirst', 'Please load your config first'); }
    return;
  }
  const newPass = (document.getElementById('modalNewPassword')||{}).value || '';
  const confirmPass = (document.getElementById('modalConfirmPassword')||{}).value || '';
  if(!newPass || newPass.length < 4){ msg.style.color='#f87171'; msg.textContent = umT('setup.landing.passwordMustBeAtLeast4', 'Password must be at least 4 characters'); return; }
  if(newPass !== confirmPass){ msg.style.color='#f87171'; msg.textContent = umT('setup.landing.passwordsDoNotMatch', 'Passwords do not match'); return; }
  try {
    const r = await fetch(API_BASE + '/c/' + token + '/reset-password', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ newPassword: newPass })
    });
    const d = await r.json();
    if(d.ok){
      msg.style.color = '#4ade80'; msg.textContent = umT('setup.landing.passwordResetSuccessfully', 'Password reset successfully!');
      const pwInp = document.getElementById('tokenModalPassword');
      if(pwInp) pwInp.value = newPass;
      const newPassEl = document.getElementById('modalNewPassword'); if(newPassEl) newPassEl.value = '';
      const confirmPassEl = document.getElementById('modalConfirmPassword'); if(confirmPassEl) confirmPassEl.value = '';
      setTimeout(function(){ const box = document.getElementById('modalForgotBox'); if(box) box.style.display = 'none'; }, 1200);
    } else {
      msg.style.color = '#f87171'; msg.textContent = d.error || 'Reset failed';
    }
  } catch(e) {
    msg.style.color = '#f87171'; msg.textContent = umT('setup.landing.somethingWentWrong', 'Something went wrong');
  }
}


function getDetectedTimeZone(){
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch(e) {
    return 'UTC';
  }
}

function populateTimeZoneSelect(selectedValue){
  const el = document.getElementById('timezone');
  if(!el) return;

  let zones = [];
  try {
    if(typeof Intl.supportedValuesOf === 'function'){
      zones = Intl.supportedValuesOf('timeZone') || [];
    }
  } catch(e) {}

  const detected = getDetectedTimeZone();
  const wanted = selectedValue || detected || 'UTC';

  const fallbackZones = [
    'UTC',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Rome',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'America/Vancouver',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Pacific/Auckland'
  ];

  if(!zones.length) zones = fallbackZones.slice();

  ['UTC', detected, wanted].forEach(function(zone){
    if(zone && !zones.includes(zone)) zones.push(zone);
  });

  zones = Array.from(new Set(zones.filter(Boolean))).sort();

  el.innerHTML = '';
  zones.forEach(function(zone){
    const option = document.createElement('option');
    option.value = zone;
    option.textContent = zone === detected
      ? zone + ' (Detected)'
      : zone;
    el.appendChild(option);
  });

  el.value = zones.includes(wanted) ? wanted : 'UTC';
}


document.addEventListener('DOMContentLoaded', function(){
  populateTimeZoneSelect(getDetectedTimeZone());
});

async function loadConfigByToken(token, profileId){
  try{
    // Loading a specific token means we don't want a stale local draft to clobber it later
    try{ sessionStorage.removeItem('um_form_state'); }catch(e){}
    let data = {};
    const profileQS = profileId ? ('?profile=' + encodeURIComponent(profileId)) : '';
    const res = await fetch(API_BASE+'/c/'+token+'/config'+profileQS, {
      headers: { 'x-config-password': _configPassword || '' }
    });
    if(!res.ok) return false;
    const raw = await res.text();
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch(parseErr) {
      throw new Error('Bad response from /c/' + token + '/config: ' + raw.slice(0, 180));
    }

      /*
       * A loaded token must define its own Kids-mode state.
       *
       * Without this reset, a browser that previously entered Kids Setup
       * can leave um-kids-mode on <body>. generate() then calls
       * enforceKidsSetupBeforeGenerate(), which replaces the loaded
       * catalogue/collection state with the dedicated Kids configuration.
       *
       * Treat the config as a dedicated Kids setup only when its saved
       * collection structure is unmistakably the canonical Kids setup.
       */
      var loadedCollections =
        Array.isArray(data.collections)
          ? data.collections
          : [];

      var loadedAsDedicatedKidsSetup =
        loadedCollections.length === 1 &&
        loadedCollections[0] &&
        loadedCollections[0].id ===
          'collection-ultramax-kids';

      document.body.classList.toggle(
        'um-kids-mode',
        loadedAsDedicatedKidsSetup
      );

      var loadedAdultField =
        document.getElementById('includeAdult');

      if(
        loadedAdultField &&
        !loadedAsDedicatedKidsSetup
      ){
        loadedAdultField.disabled = false;
      }

      console.log(
        '[KIDS-MODE] loaded config',
        {
          token: token,
          dedicatedKidsSetup: loadedAsDedicatedKidsSetup,
          collectionCount: loadedCollections.length
        }
      );

    if(
      window.ULTRAMAX_SHARED_WIZARD_CONTEXT_ENABLED !== false &&
      window.UltraMaxWizardContext
    ){
      window.UltraMaxWizardContext.setUltraMaxContext(
        token,
        profileId || null,
        profileId && window.activeDeviceProfileId === profileId
          ? window.activeDeviceProfileName
          : null
      );
    }
    /*
      Reset all catalogue state before restoring the requested setup.
      Without clearing hidden, a previous "Hide all" action can make
      every restored row disappear from Preview.
    */
    selected.clear();
    hidden.clear();
    s2ResetAllHiddenWarningDismissal();

    catalogOrder =
      Array.isArray(data.catalogOrder) && data.catalogOrder.length
        ? data.catalogOrder.map(function(id){ return normalizeCatalogId(id); })
        : [];

    document
      .querySelectorAll('.pill, .s2-pill')
      .forEach(function(p){
        p.classList.remove(
          'selected',
          's2-sel',
          's2-hidden'
        );

        p.style.fontStyle = '';

        var eye = p.querySelector('.pill-eye');
        if(eye){
          eye.style.display = '';
          eye.textContent = '';
          eye.style.opacity = '';
        }

        var hiddenBox =
          p.querySelector('[data-hid]');

        if(hiddenBox){
          hiddenBox.checked = false;
        }
      });

    var restoredCatalogs =
      Array.isArray(data.catalogs)
        ? data.catalogs.map(function(id){ return normalizeCatalogId(id); })
        : [];

    restoredCatalogs.forEach(function(id){
      selected.add(id);

      var legacyPill =
        document.querySelector(
          '.pill[data-id="' + id + '"]'
        );

      if(legacyPill){
        legacyPill.classList.add('selected');
      }
    });
    catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
    document.getElementById('mdblistKey').value = data.mdblistKey || '';
    document.getElementById('tmdbKey').value = data.tmdbKey || '';
    { var tvdbKeyEl = document.getElementById('tvdbKey'); if(tvdbKeyEl) tvdbKeyEl.value = data.tvdbKey || ''; }
    { var tvdbPinEl = document.getElementById('tvdbPin'); if(tvdbPinEl) tvdbPinEl.value = data.tvdbPin || ''; }

    // An authenticated config load already proved _configPassword is valid.
    // Keep the real editable Step 1 password fields in sync with that auth
    // state instead of relying on whichever launcher happened to call us.
    if(_configPassword){
      var loadedPasswordEl = document.getElementById('password');
      var loadedConfirmPasswordEl = document.getElementById('confirmPassword');
      if(loadedPasswordEl) loadedPasswordEl.value = _configPassword;
      if(loadedConfirmPasswordEl) loadedConfirmPasswordEl.value = _configPassword;

      var loadedShouldRemember =
        typeof window.umShouldRememberSetup === 'function'
          ? window.umShouldRememberSetup()
          : !!((document.getElementById('rememberMeDevice') || {}).checked);

      var loadedRememberEl = document.getElementById('rememberMeDevice');
      var loadedModalRememberEl = document.getElementById('rememberMeModalDevice');
      if(loadedRememberEl) loadedRememberEl.checked = !!loadedShouldRemember;
      if(loadedModalRememberEl) loadedModalRememberEl.checked = !!loadedShouldRemember;

      if(loadedShouldRemember && typeof umSaveSession === 'function'){
        umSaveSession(token, _configPassword);
      }

      try {
        var resumeCredentialKey = 'ultramax_resume_credentials_v1';
        if(loadedShouldRemember){
          localStorage.setItem(
            resumeCredentialKey,
            JSON.stringify({
              token: String(token || '').trim().toUpperCase(),
              password: String(_configPassword || ''),
              tmdbKey: String(data.tmdbKey || ''),
              mdblistKey: String(data.mdblistKey || ''),
              tvdbKey: String(data.tvdbKey || ''),
              tvdbPin: String(data.tvdbPin || ''),
              savedAt: Date.now()
            })
          );
        }else{
          localStorage.removeItem(resumeCredentialKey);
        }
      } catch(_resumeCredentialError) {}
    }

    premiumizeLibraryConnected = !!data.premiumizeConnected;
    premiumizeLibraryPersisted = !!data.premiumizeConnected;
    premiumizeDisconnectRequested = false;
    {
      var premiumizeEnabledEl = document.getElementById('premiumizeLibraryEnabled');
      if(premiumizeEnabledEl) premiumizeEnabledEl.checked = !!data.premiumizeLibraryEnabled;
      var premiumizeKeyEl = document.getElementById('premiumizeApiKey');
      if(premiumizeKeyEl) premiumizeKeyEl.value = '';
      premiumizeRenderState();
    }
    torboxLibraryConnected = !!data.torboxLibraryConnected;
    torboxLibraryPersisted = !!data.torboxLibraryConnected;
    torboxDisconnectRequested = false;
    {
      var torboxEnabledEl = document.getElementById('torboxLibraryEnabled');
      if(torboxEnabledEl) torboxEnabledEl.checked = !!data.torboxLibraryEnabled;
      var torboxKeyEl = document.getElementById('torboxLibraryApiKey');
      if(torboxKeyEl) torboxKeyEl.value = '';
      if(typeof torboxRenderState === 'function') torboxRenderState();
    }
    if(data.language) document.getElementById('language').value = data.language;
    populateTimeZoneSelect(data.timezone || getDetectedTimeZone());
    { const el=document.getElementById('rpdbKey'); if(el) el.value = data.rpdbKey || ''; }
    { const el=document.getElementById('tpKey'); if(el) el.value = data.tpKey || ''; }
    if(data.traktUser) document.getElementById('traktUser').value = data.traktUser;
    if(data.excludeUnreleased){ const el=document.getElementById('excludeUnreleased'); if(el) el.checked = true; }
    { const el=document.getElementById('animePresentationMode'); if(el) el.value = data.animePresentationMode === 'anisync' ? 'anisync' : 'unified'; }
    { const el=document.getElementById('preserveKitsuIds'); if(el) el.checked = !!data.preserveKitsuIds; }
    if(data.digitalReleaseOnly){ const el=document.getElementById('digitalReleaseOnly'); if(el) el.checked = true; }
    if(typeof setSearchCatalogNamesOnForm === 'function') setSearchCatalogNamesOnForm(data.searchCatalogNames);
    if(data.hideWatched){ const el2=document.getElementById('hideWatched'); if(el2) el2.checked = true; }
    { const el=document.getElementById('hideUnavailableStreams'); if(el) el.checked = !!data.hideUnavailableStreams; }
    { const el=document.getElementById('episodeReleaseDelayHours'); if(el) el.value = String(Number(data.episodeReleaseDelayHours) || 0); }
    { const el=document.getElementById('maxRating'); if(el) el.value = data.maxRating || ''; }
    if(data.excludeLanguages && typeof setExcludeLanguages === 'function') setExcludeLanguages(data.excludeLanguages);
    if(typeof setContentFilterFields === 'function') setContentFilterFields(data);
    if(data.betterPostersStyle !== undefined){
      const el=document.getElementById('betterPostersStyle');
      if(el){
        const rsMatch = (data.betterPostersStyle || '').match(/[?&]rs=([A-Z]+)/);
        if(rsMatch){
          const inverseRatingMap = {IM:'imdb',TM:'tmdb',RT:'rt',MC:'metacritic',TR:'trakt',LB:'letterboxd',RE:'rogerebert'};
          el.value = inverseRatingMap[rsMatch[1]] || '';
        } else {
          el.value = '';
        }
      }
    }
    customCatalogs = Array.isArray(data.customCatalogs) ? data.customCatalogs : [];
    mergedCatalogs = normaliseMergedCatalogDefinitions(data.mergedCatalogs);
    setRemovedMergedCatalogIds(data.removedMergedCatalogIds);
    renderMergedCatalogs();
    rerenderStep2CategoriesPreservingUi();
    customMdbLists = Array.isArray(data.customMdbLists) ? data.customMdbLists : [];
    window.catalogOverrides = (data.catalogOverrides && typeof data.catalogOverrides === 'object') ? data.catalogOverrides : {};
    v2Collections = normalizeImportedCollections(data.collections || []);
    window.v2Collections = v2Collections;

      // ULTRA_STREAM_RELOAD_PATCH
      const savedStreamAddons = Array.isArray(data.streamAddons) ? data.streamAddons : [];

      if (typeof setStoredStreamAddons === "function") {
        setStoredStreamAddons(savedStreamAddons);
        if (typeof setStoredStreamAddonLabels === "function") {
          setStoredStreamAddonLabels(
            data.streamAddonLabels && typeof data.streamAddonLabels === "object"
              ? data.streamAddonLabels
              : {}
          );
        }
      } else {
        const streamBox = document.getElementById("streamAddons") || document.getElementById("quickStreamAddons");
        if (streamBox) streamBox.value = savedStreamAddons.join("\n");
      }

      // Some builder panels render later, so repaint the stream cards a few times.
      if (typeof renderStreamAddonCards === "function") {
        renderStreamAddonCards();
        setTimeout(renderStreamAddonCards, 250);
        setTimeout(renderStreamAddonCards, 1000);
      }

    if(data.googleAiKey && document.getElementById('googleAiKey')) document.getElementById('googleAiKey').value = data.googleAiKey;
    if(document.getElementById('enableAiRecommended')) document.getElementById('enableAiRecommended').checked = !!data.enableAiRecommended;

    // ── MISSING FIELDS RESTORE ──
    { const el=document.getElementById('fanartKey'); if(el) el.value = data.fanartKey || ''; }
    { const el=document.getElementById('omdbKey'); if(el) el.value = data.omdbKey || ''; }
    { const el=document.getElementById('includeAdult'); if(el) el.checked = !!data.includeAdult; }
    { const el=document.getElementById('debridCachedOnly'); if(el) el.checked = !!data.debridCachedOnly; }
    if(typeof restoreStreamLanguageUI === 'function') {
      restoreStreamLanguageUI(data.streamLanguages, data.streamLanguageMode, data.debridEnglishOnly);
    }
    { const el=document.getElementById('debridRemoveTrash'); if(el) el.checked = data.debridRemoveTrash !== false; }
    { const el=document.getElementById('debridRes4k'); if(el) el.checked = data.debridRes4k !== false; }
    { const el=document.getElementById('debridRes1080'); if(el) el.checked = data.debridRes1080 !== false; }
    { const el=document.getElementById('debridRes720'); if(el) el.checked = data.debridRes720 !== false; }
    { const el=document.getElementById('debridRes480'); if(el) el.checked = !!data.debridRes480; }
    {
      const el = document.getElementById('streamMinSizeGb');
      if(el) el.value = String(Number(data.streamMinSizeGb) || 0);
    }
    {
      const el = document.getElementById('debridMaxSizeGb');
      if(el) el.value = String(Number(data.debridMaxSizeGb) || 0);
    }
    {
      const el = document.getElementById('streamSortMode');
      if(el) el.value = ['source','quality','size-desc','size-asc'].includes(data.streamSortMode)
        ? data.streamSortMode
        : 'source';
    }
    {
      const el = document.getElementById('hideStreamNotices');
      if(el) el.checked = data.hideStreamNotices === true;
    }
    if(Array.isArray(data.debridServices) && data.debridServices.length) {
      debridProviders = data.debridServices;
      if(typeof renderDebridProviders === 'function') renderDebridProviders();
    } else if(data.debridService && data.debridApiKey) {
      debridProviders = [{ service: data.debridService, apiKey: data.debridApiKey }];
      if(typeof renderDebridProviders === 'function') renderDebridProviders();
    }
    if(typeof restoreStreamFormatUI === 'function') restoreStreamFormatUI(data.streamFormat);

    {
      const el = document.getElementById('preserveStreamSourceBranding');
      if(el) el.checked = !!data.preserveStreamSourceBranding;
    }

    if(data.betterPostersStyle){
      const savedBpStyle = String(data.betterPostersStyle || '');
      const isPictoriumStyle = savedBpStyle.includes('/api/poster/') && (savedBpStyle.includes('{imdb_id}') || savedBpStyle.includes('{tmdb_id}')) && (savedBpStyle.includes('{type}') || savedBpStyle.includes('{media_type}'));
      const bpHidden = document.getElementById('betterPostersStyleHidden');
      const bpEnabledEl = document.getElementById('bpEnabled');
      const manualEl = document.getElementById('bpManualUrl');

      if(bpEnabledEl) bpEnabledEl.checked = !isPictoriumStyle;

      // Auto-generated Better Posters URLs encode overlay state in the
      // poster flags and query string. Restore those controls before
      // updateBPStyle() rebuilds the URL, otherwise defaults such as
      // bpQuality=false silently remove previously selected options.
      const autoMatch = savedBpStyle.match(
        /^https:\/\/btttr\.cc\/poster-([a-z]+)\/imdb\/poster-default\/\{imdb_id\}\.jpg(?:\?(.*))?$/i
      );

      if(autoMatch){
        const flags = String(autoMatch[1] || '').toLowerCase();
        const query = new URLSearchParams(autoMatch[2] || '');

        const qualityEl = document.getElementById('bpQuality');
        const ageEl = document.getElementById('bpAge');
        const trendEl = document.getElementById('bpTrend');
        const genreEl = document.getElementById('bpGenre');

        if(qualityEl) qualityEl.checked = flags.includes('q');
        if(ageEl) ageEl.checked = flags.includes('a');
        if(trendEl) trendEl.checked = query.get('tag') !== 'none';

        // "g" is explicitly encoded when Genre is the primary poster flag.
        // Existing rating-based URLs do not separately encode Genre, so
        // preserve the UI's existing/default Genre state in that case.
        if(genreEl && flags.startsWith('g')) genreEl.checked = true;

        if(manualEl) manualEl.value = '';

        if(typeof updateBPStyle === 'function') updateBPStyle();
      } else if(!isPictoriumStyle) {
        // A genuinely custom Better Posters URL should remain a manual
        // override and must not be regenerated from the automatic controls.
        if(manualEl) manualEl.value = savedBpStyle;
        if(bpHidden) bpHidden.value = savedBpStyle;

        if(typeof updateBPStyle === 'function') updateBPStyle();

        if(bpHidden) bpHidden.value = savedBpStyle;
      }

      const bpPreview = document.getElementById('bpUrlPreview');
      if(bpPreview && !isPictoriumStyle) bpPreview.textContent = savedBpStyle;

      if(isPictoriumStyle){
        const picToggle=document.getElementById('pictoriumEnabled');
        if(bpEnabledEl) bpEnabledEl.checked=false;
        if(manualEl) manualEl.value='';
        if(picToggle) picToggle.checked=true;
        try {
          const parsed=new URL(savedBpStyle.replace('{type}','movie').replace('{media_type}','movie').replace('{imdb_id}','tt0111161').replace('{tmdb_id}','278'));
          const markerAt=parsed.pathname.indexOf('/api/poster/');
          const basePath=(markerAt>=0?parsed.pathname.slice(0,markerAt):'').replace(/\/+$/,'');
          const instanceBase=parsed.origin+basePath;
          const hostedBase=window.location.origin+'/pictorium';
          const modeEl=document.getElementById('pictoriumInstanceMode');
          const customUrlEl=document.getElementById('pictoriumCustomUrl');
          const isHosted=instanceBase===hostedBase;
          if(modeEl) modeEl.value=isHosted?'hosted':'custom';
          if(customUrlEl) {
            if(isHosted) customUrlEl.value='';
            else customUrlEl.value=isPictoriumStyle?savedBpStyle:instanceBase;
          }
          const boolMap={pictoriumBadges:'badges',pictoriumRanking:'ranking',pictoriumGenre:'bg',pictoriumYear:'by',pictoriumRating:'br',pictoriumQuality:'bq',pictoriumNetworkLogo:'netLogo',pictoriumBlurEnabled:'be'};
          Object.keys(boolMap).forEach(function(id){ const el=document.getElementById(id); const v=parsed.searchParams.get(boolMap[id]); if(el && v!==null) el.checked=v!=='0'; });
          const pre=document.getElementById('pictoriumPreRelease'); if(pre) pre.checked=parsed.searchParams.get('pre')==='1';
          const valueMap={pictoriumBadgeStyle:'bs',pictoriumRankingStyle:'rs',pictoriumSide:'side',pictoriumRegion:'region',pictoriumGradHeight:'gradHeight',pictoriumBlur:'blur',pictoriumBlurFade:'bf',pictoriumBlurDarkness:'bd',pictoriumTopScale:'tscale',pictoriumTopOffsetX:'tox',pictoriumTopOffsetY:'toy',pictoriumGenreScale:'gscale',pictoriumQualityScale:'qscale',pictoriumNetworkScale:'netscale',pictoriumLogoScale:'scale',pictoriumLogoOffsetX:'ox',pictoriumLogoOffsetY:'oy'};
          Object.keys(valueMap).forEach(function(id){ const el=document.getElementById(id); const v=parsed.searchParams.get(valueMap[id]); if(el && v!==null) el.value=v; });
          const logoOverride=document.getElementById('pictoriumLogoOverride'); if(logoOverride) logoOverride.checked=parsed.searchParams.has('scale')||parsed.searchParams.has('ox')||parsed.searchParams.has('oy');
          const selected=new Set(String(parsed.searchParams.get('rsrc')||'imdb,tmdb').split(',').map(function(v){return v.trim().toLowerCase();}).filter(Boolean));
          document.querySelectorAll('.pictorium-rating-source').forEach(function(el){ el.checked=selected.has(String(el.value||'').toLowerCase()); });
          if(typeof window.pictoriumSyncReadabilityPreset==='function') window.pictoriumSyncReadabilityPreset();
        } catch(e) { console.warn('Pictorium settings restore failed',e); }
        if(typeof window.updatePictoriumStyle==='function') window.updatePictoriumStyle();
      }
    }

    var restoredHidden =
      Array.isArray(data.hiddenCatalogs)
        ? data.hiddenCatalogs.map(function(id){ return normalizeCatalogId(id); })
        : [];

    restoredHidden.forEach(function(id){
      /*
        Ignore stale hidden IDs that are not part of this setup.
      */
      if(!selected.has(id) || isRemovedMergedCatalogId(id)) return;

      hidden.add(id);

      var legacyPill =
        document.querySelector(
          '.pill[data-id="' + id + '"]'
        );

      if(legacyPill){
        legacyPill.style.fontStyle = 'italic';

        var eye =
          legacyPill.querySelector('.pill-eye');

        if(eye){
          eye.style.display = 'inline';
          eye.textContent = '🙈';
          eye.style.opacity = '1';
        }
      }
    });
    saveHiddenState();

    updateCounter();
    updateCategoryCounts();

    setTimeout(makeSprockets, 200);

    /*
      Finish rebuilding Step 2 before refreshing Preview.
      This removes the previous timeout race.
    */
    setTimeout(async function(){
      if(typeof s2Init === 'function'){
        await s2Init();
      }

      if(typeof s2RestoreFromSelected === 'function'){
        s2RestoreFromSelected();
      }

      /*
        Reapply hidden state after the dynamic pills exist.
      */
      restoredHidden.forEach(function(id){
        if(!selected.has(id)) return;

        var pill =
          document.getElementById('s2pill-' + id);

        if(pill){
          pill.classList.add('s2-sel', 's2-hidden');

          var hiddenBox =
            pill.querySelector('[data-hid]');

          if(hiddenBox){
            hiddenBox.checked = true;
          }
        }
      });

      if(typeof s2UpdatePreview === 'function'){
        s2UpdatePreview();
      }

      if(typeof updateStepPreviewCount === 'function'){
        updateStepPreviewCount();
      }

      updateCounter();
      updateCategoryCounts();
    }, 300);
    await refreshAllIntegrationStatuses(token, profileId);
    // Saved provider keys were already accepted/stored server-side.
    if(typeof restoreMdblistVerifiedState === 'function') restoreMdblistVerifiedState();

    // Password/provider values above were set programmatically. Refresh every
    // Step 1 presentation layer, including the Play-ready essentials summary
    // and compact mobile cards, after the loaded config has settled.
    scheduleLoadedStep1CredentialUiRefresh();
    showLoadedSetupEditor();

    var loadedViaContinue = false;
    try {
      loadedViaContinue =
        new URLSearchParams(window.location.search).get('shortcut') === 'continue-setup';
    } catch(_error) {}

    // Continue always means: authoritative saved config first, then the latest
    // local working progress. Keeping this here makes remembered-password and
    // password-prompt resumes behave identically.
    if(loadedViaContinue && typeof restoreDraftState === 'function'){
      restoreDraftState();
      scheduleLoadedStep1CredentialUiRefresh();
    }else{
      setStep(1);
    }

    // Programmatic field restoration does not fire input events. Persist the
    // fully populated form immediately so Home -> Continue never falls back to
    // an older blank credential snapshot.
    if(typeof saveDraftState === 'function'){
      saveDraftState();
    }

    return true;

  }catch(e){
    console.error('loadConfigByToken error:', e);
    showToast(umT('setup.auth.failedToLoadConfig', 'Failed to load config: ') + e.message);
  }
}
