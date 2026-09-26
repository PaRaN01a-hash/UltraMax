(function(global){
  'use strict';

  var DRAFT_KEY = 'ultramaxDraftV1';
  var SESSION_KEY = 'ultramax_remembered_setup';
  var RESUME_KEY = 'ultramax_resume_credentials_v1';
  var nuvioState = {
    connected:false,
    selectedProfileId:'',
    selectedProfileName:'',
    detectedMatches:[]
  };

  function byId(id){
    return document.getElementById(id);
  }

  function rememberedSetup(){
    try {
      var saved = typeof global.umGetSession === 'function'
        ? global.umGetSession()
        : JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');

      if(!saved || !saved.token || !saved.password){
        saved = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null');
      }

      if(
        !saved ||
        !saved.token ||
        !saved.password
      ){
        return null;
      }

      var token = String(saved.token || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .toUpperCase();

      if(token.length < 4) return null;

      return {
        token: token,
        savedAt: Number(saved.savedAt || 0)
      };
    } catch(_error) {
      return null;
    }
  }

  function recoverableDraft(){
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if(!raw) return null;

      var data = JSON.parse(raw);
      if(!data || typeof data !== 'object') return null;

      var setup = data.setup || {};
      var credentialFields = [
        'password',
        'mdblistKey',
        'tmdbKey',
        'googleAiKey',
        'rpdbKey',
        'tpKey',
        'fanartKey',
        'omdbKey'
      ];

      var hasCredential = credentialFields.some(function(key){
        return String(setup[key] || '').trim().length > 0;
      });

      var hasSelections =
        Array.isArray(data.selectedCatalogs) &&
        data.selectedCatalogs.length > 0;

      var hasCollections =
        Array.isArray(data.collections) &&
        data.collections.length > 0;

      var hasCustom =
        (Array.isArray(data.customCatalogs) && data.customCatalogs.length > 0) ||
        (Array.isArray(data.customMdbLists) && data.customMdbLists.length > 0) ||
        (Array.isArray(data.mergedCatalogs) && data.mergedCatalogs.length > 0);

      var progressed = Number(data.currentStep) > 1;

      if(
        !hasCredential &&
        !hasSelections &&
        !hasCollections &&
        !hasCustom &&
        !progressed
      ){
        return null;
      }

      var editToken = String(data.editToken || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .toUpperCase();

      return {
        currentStep:Number(data.currentStep) || 1,
        savedAt:String(data.savedAt || ''),
        editToken: editToken.length >= 4 ? editToken : ''
      };
    } catch(_error) {
      return null;
    }
  }

  function renderPrimary(){
    var card = byId('continueCard');
    var eyebrow = byId('continueEyebrow');
    var title = byId('continueTitle');
    var subtitle = byId('continueSubtitle');
    var action = byId('continueAction');

    if(!card || !eyebrow || !title || !subtitle || !action) return;

    var remembered = rememberedSetup();
    var draft = recoverableDraft();
    if(draft){
      var resumeToken = remembered
        ? remembered.token
        : draft.editToken;

      card.hidden = false;
      card.dataset.homeAction = 'resume-working';
      card.dataset.rememberedToken = resumeToken || '';
      eyebrow.textContent = 'SAVED PROGRESS';
      title.textContent = 'Continue Your Ultra MAX Setup';
      subtitle.textContent = remembered
        ? 'Resume your latest changes with your remembered setup'
        : resumeToken
          ? 'Resume your saved setup and latest changes'
          : 'Your latest changes are saved on this device';
      action.textContent = 'Continue →';
      card.setAttribute(
        'aria-label',
        'Continue your saved Ultra MAX setup progress'
      );
      return;
    }
    if(remembered){
      card.hidden = false;
      card.dataset.homeAction = 'open-remembered';
      card.dataset.rememberedToken = remembered.token;
      eyebrow.textContent = 'SAVED SETUP';
      title.textContent = 'Continue Your Ultra MAX Setup';
      subtitle.textContent = 'Remembered on this device';
      action.textContent = 'Continue →';
      card.setAttribute(
        'aria-label',
        'Continue your remembered Ultra MAX setup'
      );
      return;
    }

    var matches = Array.isArray(nuvioState.detectedMatches)
      ? nuvioState.detectedMatches
      : [];

    var profileName = String(nuvioState.selectedProfileName || '').trim();

    if(!nuvioState.connected || !profileName || !matches.length){
      card.hidden = true;
      card.dataset.homeAction = '';
      card.dataset.rememberedToken = '';
      return;
    }

    card.hidden = false;
    card.dataset.rememberedToken = '';

    if(matches.length === 1){
      card.dataset.homeAction = 'open-detected';
      eyebrow.textContent = 'SETUP FOUND';
      title.textContent = 'Open Your Ultra MAX Setup';
      subtitle.textContent = 'Found automatically on ' + profileName;
      action.textContent = 'Continue →';
      card.setAttribute(
        'aria-label',
        'Open the Ultra MAX setup found on ' + profileName
      );
      return;
    }

    card.dataset.homeAction = 'choose-detected';
    eyebrow.textContent = matches.length + ' SETUPS FOUND';
    title.textContent = 'Choose Your Ultra MAX Setup';
    subtitle.textContent =
      matches.length + ' installed setups found on ' + profileName;
    action.textContent = 'Choose →';
    card.setAttribute(
      'aria-label',
      'Choose which Ultra MAX setup to open on ' + profileName
    );
  }

  function render(){
    renderPrimary();
  }

  function updateNuvio(next){
    nuvioState = Object.assign(
      {
        connected:false,
        selectedProfileId:'',
        selectedProfileName:'',
        detectedMatches:[]
      },
      next || {}
    );
    render();
  }

  function handlePrimaryClick(event){
    var card = byId('continueCard');
    if(!card || card.hidden) return;

    event.preventDefault();

    if(
      card.dataset.homeAction === 'resume-working' ||
      card.dataset.homeAction === 'open-remembered'
    ){
      var resumeToken = String(card.dataset.rememberedToken || '').trim();

      // Continue deliberately reuses the exact same Load Existing pipeline as
      // the working Nuvio handoff. If the local draft/session has lost its
      // token but Nuvio currently sees exactly one Ultra MAX setup, use that
      // detected token rather than opening an anonymous blank Step 1.
      if(
        !resumeToken &&
        nuvioState.connected &&
        Array.isArray(nuvioState.detectedMatches) &&
        nuvioState.detectedMatches.length === 1
      ){
        resumeToken = String(
          nuvioState.detectedMatches[0].setupId || ''
        ).trim().toUpperCase();
      }

      var resumeUrl = new URL('/setup.html', global.location.origin);
      resumeUrl.searchParams.set('native', '1');
      resumeUrl.searchParams.set('shortcut', 'load-token');

      if(resumeToken){
        resumeUrl.searchParams.set('prefillToken', resumeToken);
      }

      global.location.href = resumeUrl.pathname + resumeUrl.search;
      return;
    }

    var nuvio = global.UltraMaxHomeNuvio;
    if(!nuvio) return;

    if(card.dataset.homeAction === 'open-detected'){
      if(typeof nuvio.loadDetectedSetup === 'function'){
        nuvio.loadDetectedSetup();
      }
      return;
    }

    if(card.dataset.homeAction === 'choose-detected'){
      if(typeof nuvio.open === 'function'){
        nuvio.open();
      }
    }
  }

  function init(){
    var card = byId('continueCard');
    if(card){
      card.addEventListener('click', handlePrimaryClick);
    }

    global.addEventListener(
      'ultramax:home-nuvio-state',
      function(event){
        updateNuvio(event && event.detail ? event.detail : {});
      }
    );

    global.addEventListener('pageshow', render);
    global.addEventListener('storage', function(event){
      if(
        !event ||
        event.key === DRAFT_KEY ||
        event.key === SESSION_KEY
      ) renderPrimary();
    });

    if(
      global.UltraMaxHomeNuvio &&
      typeof global.UltraMaxHomeNuvio.getState === 'function'
    ){
      updateNuvio(global.UltraMaxHomeNuvio.getState());
    }else{
      render();
    }
  }

  global.UltraMaxHomeStart = Object.freeze({
    init:init,
    render:render,
    updateNuvio:updateNuvio,
    recoverableDraft:recoverableDraft,
    rememberedSetup:rememberedSetup
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init, {once:true});
  }else{
    init();
  }
})(window);
