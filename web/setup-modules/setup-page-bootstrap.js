document.addEventListener('DOMContentLoaded', async function(){
  // Restore the authoritative token/profile before refreshing OAuth UI.
  const _tp = new URLSearchParams(window.location.search);
  const _oauthProvider = ['trakt','simkl','mal','anilist'].find(function(provider){
    return _tp.has(provider);
  }) || '';
  const _isOAuthReturn = !!_oauthProvider;
  const _oauthProfileId = _tp.get('profile') || '';
  const _resumeWorking = _tp.get('shortcut') === 'continue-setup';

  if(_isOAuthReturn){
    const _oauthToken = _tp.get('token') || '';
    if(_oauthToken){
      editToken = _oauthToken;
      sessionStorage.setItem('um_setup_token', _oauthToken);
      if(_oauthProfileId) window.activeDeviceProfileId = _oauthProfileId;
    }
  }

  const _st = sessionStorage.getItem('um_setup_token');
  if(_st && !editToken) editToken = _st;
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  const incomingToken = urlToken;

  // Restore the temporary form state after OAuth.
  // A normal token URL still loads the saved setup without applying a stale draft.
  const _hasOAuthFormState =
    !!sessionStorage.getItem('um_form_state') ||
    !!localStorage.getItem('um_oauth_form_state');

  if(_hasOAuthFormState && (!incomingToken || _isOAuthReturn)){
    if(typeof restoreFormState === 'function') restoreFormState();
  }

  if(_isOAuthReturn && editToken){
    if(typeof setStep === 'function') setStep(1);
    if(!_hasOAuthFormState){
      // No local form snapshot survived the OAuth round trip (new tab, cleared
      // session storage, app relaunch) — fall back to an authoritative reload
      // from the backend so catalogs/keys/filters don't silently stay empty
      // while the Connected badge (checked independently below) still shows correctly.
      const _remembered = (typeof umGetSession === 'function') ? umGetSession() : null;
      if(_remembered && _remembered.password && String(_remembered.token||'').trim().toUpperCase() === String(editToken||'').trim().toUpperCase()){
        _configPassword = _remembered.password;
        if(typeof loadConfigByToken === 'function') await loadConfigByToken(editToken, _oauthProfileId);
      } else if(typeof showTokenPasswordModal === 'function'){
        showTokenPasswordModal(editToken);
      }
    }
    if(typeof refreshAllIntegrationStatuses === 'function'){
      await refreshAllIntegrationStatuses(editToken, _oauthProfileId);
    }
    if(_tp.get(_oauthProvider)==='error' && typeof renderIntegrationState === 'function'){
      renderIntegrationState(_oauthProvider,{kind:'error'});
    }
    ['trakt','simkl','mal','anilist'].forEach(function(provider){ _tp.delete(provider); });
    const cleanedQuery=_tp.toString();
    history.replaceState(history.state,'',window.location.pathname+(cleanedQuery?'?'+cleanedQuery:'')+window.location.hash);
  } else if(!incomingToken && editToken && typeof refreshAllIntegrationStatuses === 'function'){
    await refreshAllIntegrationStatuses(editToken);
  }
  if(!editToken && typeof refreshIntegrationCapabilities === 'function'){
    await refreshIntegrationCapabilities();
  }

  // OAuth callbacks also contain a token, but must not enter the normal
  // returning-user password/load flow.
  if(incomingToken && !_isOAuthReturn){
    editToken = incomingToken;
    window.um_isReturningUser = true;
    sessionStorage.setItem('um_setup_token', incomingToken);
    // Normal token loads ignore stale local progress. Continue Setup is the
    // deliberate exception: authenticate/load the server config first, then
    // overlay the saved working progress below.
    if(!_resumeWorking){
      try{ localStorage.removeItem('ultramaxDraftV1'); }catch(e){}
    }
    const tokenInput = document.getElementById('returningToken') || document.getElementById('loadTokenInput') || document.getElementById('tokenInput');
    if(tokenInput) tokenInput.value = incomingToken;
    // Show password modal instead of loading directly
    setTimeout(function(){
      var remembered = (typeof umGetSession === 'function') ? umGetSession() : null;
      var incomingTokenUpper = String(incomingToken || '').trim().toUpperCase();

      if(
        !remembered ||
        !remembered.password ||
        String(remembered.token || '').trim().toUpperCase() !== incomingTokenUpper
      ){
        try {
          var resumeCredentials = JSON.parse(
            localStorage.getItem('ultramax_resume_credentials_v1') || 'null'
          );

          if(
            resumeCredentials &&
            resumeCredentials.password &&
            String(resumeCredentials.token || '').trim().toUpperCase() === incomingTokenUpper
          ){
            remembered = resumeCredentials;
          }
        } catch(_resumeCredentialReadError) {}
      }

      var rememberedMatches = !!(
        remembered &&
        remembered.password &&
        String(remembered.token || '').trim().toUpperCase() === incomingTokenUpper
      );

      // Continue has a second source of truth on this device: the saved working
      // draft. If the dedicated remembered-session key is missing but the draft
      // belongs to this token and Remember Me was enabled, recover the password
      // from that draft and repair the normal remembered session.
      if(!rememberedMatches && _resumeWorking){
        try {
          var rawDraft = localStorage.getItem('ultramaxDraftV1');
          var savedDraft = rawDraft ? JSON.parse(rawDraft) : null;
          var savedDraftToken = String(
            savedDraft && savedDraft.editToken || ''
          ).trim().toUpperCase();
          var savedDraftSetup =
            savedDraft && savedDraft.setup && typeof savedDraft.setup === 'object'
              ? savedDraft.setup
              : {};

          if(
            savedDraftToken === incomingTokenUpper &&
            savedDraftSetup.rememberMe !== false &&
            String(savedDraftSetup.password || '').length > 0
          ){
            remembered = {
              token: incomingTokenUpper,
              password: String(savedDraftSetup.password),
              savedAt: Date.now()
            };
            rememberedMatches = true;

            if(typeof umSaveSession === 'function'){
              umSaveSession(incomingTokenUpper, remembered.password);
            }
          }
        } catch(_draftResumeError) {}
      }

      if (rememberedMatches) {
        _configPassword = remembered.password;
        var pwEl = document.getElementById('password');
        if (pwEl) pwEl.value = remembered.password;
        var confirmEl = document.getElementById('confirmPassword');
        if (confirmEl) confirmEl.value = remembered.password;
        var rememberMain = document.getElementById('rememberMeDevice');
        if (rememberMain) rememberMain.checked = true;
        var rememberModal = document.getElementById('rememberMeModalDevice');
        if (rememberModal) rememberModal.checked = true;
        loadConfigByToken(incomingToken).then(function(loaded){
          if(!loaded){
            if (typeof showTokenPasswordModal === 'function') {
              showTokenPasswordModal(incomingToken);
            }
            return;
          }

          setTimeout(function(){
            var rowCount = selected ? selected.size : 0;
            var collCount = v2Collections ? v2Collections.length : 0;
            var msg = _resumeWorking
              ? '✓ Saved progress restored — ' + rowCount + ' rows'
              : 'Welcome back — ' + rowCount + ' rows loaded';
            if (collCount > 0) msg += ', ' + collCount + ' collection' + (collCount !== 1 ? 's' : '');
            if (typeof showBanner === 'function') showBanner(msg, 'success');
          }, 1200);
        });
      } else {
        if (typeof showTokenPasswordModal === 'function') showTokenPasswordModal(incomingToken);
      }
    }, 400);
    const cpw = document.getElementById('confirmPasswordWrap'); if(cpw) cpw.style.display = 'none';
    const fpc = document.getElementById('forgotPasswordCard'); if(fpc) fpc.style.display = 'block';
  }
  var fi = document.getElementById('projectFileInput');
  if(fi) fi.addEventListener('change', function(e){ if(typeof _importProjectFile==='function') _importProjectFile(e); else alert(umT('setup.misc.importNotReadyYetPleaseTry', 'Import not ready yet - please try again')); });

  // Old setup welcome modal disabled.
  // The new route chooser now handles new and returning users.
  var _urlToken = new URLSearchParams(window.location.search).get('token');
  syncUltraMaxWizardContext('initialPageContext');
});

