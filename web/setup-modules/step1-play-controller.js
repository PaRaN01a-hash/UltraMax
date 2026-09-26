(function initialiseStep1PlayReady(global){
  'use strict';

  var initialised = false;
  var observer = null;

  function byId(id){
    return document.getElementById(id);
  }

  function passwordReady(){
    var password = byId('password');
    var confirm = byId('confirmPassword');
    if(!password || !String(password.value || '').trim()) return false;

    var confirmVisible = !!(
      confirm &&
      global.getComputedStyle &&
      global.getComputedStyle(confirm).display !== 'none'
    );

    return !confirmVisible || (
      confirm &&
      String(confirm.value || '') === String(password.value || '')
    );
  }

  function providerState(){
    if(typeof global.getDiscoveryProviderState === 'function'){
      return global.getDiscoveryProviderState();
    }

    var tmdb = byId('tmdbKey');
    var mdblist = byId('mdblistKey');
    var hasTmdb = !!(tmdb && String(tmdb.value || '').trim());
    var hasMdblist = !!(mdblist && String(mdblist.value || '').trim());

    return {
      hasTmdb:hasTmdb,
      hasMdblist:hasMdblist,
      hasAnyDiscoveryProvider:hasTmdb || hasMdblist,
      mode:hasTmdb && hasMdblist
        ? 'both'
        : hasTmdb
          ? 'tmdb'
          : hasMdblist
            ? 'mdblist'
            : 'neither'
    };
  }

  function selectedText(id){
    var select = byId(id);
    if(!select) return '';
    var option = select.options && select.selectedIndex >= 0
      ? select.options[select.selectedIndex]
      : null;
    return String(
      option && (option.textContent || option.label) ||
      select.value ||
      ''
    ).trim();
  }

  function setGroupSummary(id, value){
    var group = byId(id);
    if(!group) return;
    var sub = group.querySelector('.step1-option-group-sub');
    if(sub && value && sub.textContent !== value) sub.textContent = value;
  }

  function connectionSummary(){
    var connected = [];

    var trakt = byId('traktConnectStatus');
    if(trakt && /connected/i.test(trakt.textContent || '') &&
       !/not connected/i.test(trakt.textContent || '')){
      connected.push('Trakt');
    }

    var simkl = byId('simklStatusText');
    if(simkl && /connected/i.test(simkl.textContent || '') &&
       !/not connected/i.test(simkl.textContent || '')){
      connected.push('Simkl');
    }

    var cloud = byId('cloudLibrarySummary');
    if(cloud && /connected/i.test(cloud.textContent || '') &&
       !/none connected/i.test(cloud.textContent || '')){
      connected.push('Cloud Library');
    }

    return connected.length
      ? connected.join(' · ') + ' connected'
      : 'No optional accounts connected';
  }

  function contentRulesSummary(){
    var custom = false;
    [
      'excludeUnreleased',
      'excludeAdult',
      'excludeAnime',
      'digitalOnly'
    ].forEach(function(id){
      var field = byId(id);
      if(field && field.checked) custom = true;
    });

    var animeMode = byId('animePresentationMode');
    if(animeMode && animeMode.value &&
       animeMode.value !== 'default' &&
       animeMode.value !== 'standard'){
      custom = true;
    }

    var rating = byId('cfMinRating');
    var votes = byId('cfMinVotes');
    var fromYear = byId('cfMinYear');
    var toYear = byId('cfMaxYear');
    var countries = byId('cfExcludeCountries');

    if(rating && Number(rating.value || 0) > 0) custom = true;
    if(votes && Number(votes.value || 0) > 0) custom = true;
    if(fromYear && String(fromYear.value || '').trim()) custom = true;
    if(toYear && String(toYear.value || '').trim()) custom = true;
    if(countries && String(countries.value || '').trim()) custom = true;

    return custom ? 'Custom rules applied' : 'Default content rules';
  }

  function advancedSummary(){
    var streamAddons = byId('streamAddons');
    var providerList = byId('debridProviderList');
    var hasStreamAddon = !!(
      streamAddons &&
      String(streamAddons.value || '').trim()
    );
    var hasProvider = !!(
      providerList &&
      String(providerList.textContent || '').trim() &&
      !/no .*provider|none/i.test(providerList.textContent || '')
    );

    if(hasProvider && hasStreamAddon) return 'Debrid + stream links configured';
    if(hasProvider) return 'Debrid provider configured';
    if(hasStreamAddon) return 'Custom stream links configured';
    return 'Streams and specialist options';
  }

  function updateOptionalSummaries(){
    var language = selectedText('language') || 'Default language';
    var timezone = selectedText('timezone');
    setGroupSummary(
      'step1LanguageGroup',
      timezone ? language + ' · ' + timezone : language
    );

    var ai = byId('googleAiKey');
    setGroupSummary(
      'step1RecommendationsGroup',
      ai && String(ai.value || '').trim()
        ? 'AI recommendations configured'
        : 'Off'
    );

    var artwork = [];
    var bp = byId('bpEnabled');
    var pictorium = byId('pictoriumEnabled');
    if(bp && bp.checked) artwork.push('Better Posters');
    if(pictorium && pictorium.checked) artwork.push('Pictorium');
    setGroupSummary(
      'step1ArtworkGroup',
      artwork.length ? artwork.join(' · ') : 'Standard posters'
    );

    setGroupSummary('step1ConnectionsGroup', connectionSummary());
    setGroupSummary('step1ContentRulesGroup', contentRulesSummary());
    setGroupSummary('step1AdvancedGroup', advancedSummary());
  }

  function essentialState(){
    var password = passwordReady();
    var provider = providerState().hasAnyDiscoveryProvider;
    return {
      password:password,
      provider:provider,
      count:(password ? 1 : 0) + (provider ? 1 : 0)
    };
  }

  function updateEssentials(){
    var state = essentialState();
    var progress = byId('step1EssentialsProgress');
    var bar = byId('step1EssentialsBar');
    var note = byId('step1ContinueHint');
    var button = byId('step1ContinueButton');
    var shell = byId('step1EssentialsIntro');

    if(progress){
      var progressText = state.count + ' of 2 complete';
      if(progress.textContent !== progressText) progress.textContent = progressText;
    }
    if(bar){
      var width = (state.count * 50) + '%';
      if(bar.style.width !== width) bar.style.width = width;
    }
    if(shell){
      shell.classList.toggle('is-ready', state.count === 2);
    }

    if(note){
      var noteText = state.count === 2
        ? 'Essentials complete. You can continue to Catalogs.'
        : !state.password && !state.provider
          ? 'Complete Password and Discovery Provider to continue.'
          : !state.password
            ? 'Set your Password to continue.'
            : 'Add a Discovery Provider to continue.';
      if(note.textContent !== noteText) note.textContent = noteText;
    }

    if(button){
      var shouldDisable = state.count !== 2;
      if(button.disabled !== shouldDisable){
        button.disabled = shouldDisable;
      }
      var ariaDisabled = state.count === 2 ? 'false' : 'true';
      if(button.getAttribute('aria-disabled') !== ariaDisabled){
        button.setAttribute('aria-disabled', ariaDisabled);
      }
      button.classList.toggle('is-ready', state.count === 2);
    }

    if(typeof global.updateMobileSetupCardStates === 'function'){
      global.updateMobileSetupCardStates();
    }
  }

  function ensureEssentialsHeader(){
    var grid = document.querySelector(
      '#step-1 .step1-required-grid'
    );
    if(!grid || byId('step1EssentialsIntro')) return;

    var block = document.createElement('section');
    block.id = 'step1EssentialsIntro';
    block.className = 'step1-play-section step1-essentials-intro';
    block.innerHTML =
      '<div class="step1-play-heading">' +
        '<div>' +
          '<span class="step1-play-kicker">SETUP ESSENTIALS</span>' +
          '<h2>Two things before you continue</h2>' +
          '<p>Set your password and connect TMDB or MDBList for catalog discovery.</p>' +
        '</div>' +
        '<div class="step1-essentials-count" id="step1EssentialsProgress">0 of 2 complete</div>' +
      '</div>' +
      '<div class="step1-progress-track" aria-hidden="true">' +
        '<span id="step1EssentialsBar"></span>' +
      '</div>';

    grid.parentNode.insertBefore(block, grid);
  }

  function ensurePersonaliseHeader(){
    var shell = byId('optionalEnhancementsShell');
    if(!shell || byId('step1PersonaliseIntro')) return;

    var block = document.createElement('section');
    block.id = 'step1PersonaliseIntro';
    block.className = 'step1-play-section step1-personalise-intro';
    block.innerHTML =
      '<div class="step1-play-heading">' +
        '<div>' +
          '<span class="step1-play-kicker is-optional">PERSONALISE</span>' +
          '<h2>Make it yours</h2>' +
          '<p>Optional. Open only the areas you want to change.</p>' +
        '</div>' +
      '</div>';

    shell.parentNode.insertBefore(block, shell);
  }

  function decorateFinalNav(){
    var nav = document.querySelector('#step-1 .s1-final-nav');
    if(!nav) return;

    nav.id = 'step1PlayContinue';
    nav.classList.add('step1-play-continue');

    var button = nav.querySelector('.nav-btn.primary');
    if(button){
      button.id = 'step1ContinueButton';
      var continueText = typeof global.umT === 'function'
        ? global.umT('setup.nav.nextStep2', 'Continue to Catalogs →')
        : 'Continue to Catalogs →';
      if(button.textContent !== continueText){
        button.textContent = continueText;
      }
    }

    if(!byId('step1ContinueHint')){
      var hint = document.createElement('div');
      hint.id = 'step1ContinueHint';
      hint.className = 'step1-continue-hint';
      nav.insertBefore(hint, nav.firstChild);
    }
  }

  function ensureStructure(){
    var legacy = byId('step1RequiredLegacyMarker');
    if(legacy) legacy.classList.add('step1-legacy-required-marker');

    ensureEssentialsHeader();
    ensurePersonaliseHeader();
    decorateFinalNav();
  }

  function updateAll(){
    ensureStructure();
    updateEssentials();
    updateOptionalSummaries();
  }

  function startObserver(){
    if(observer || typeof MutationObserver !== 'function') return;

    var step = byId('step-1');
    if(!step) return;

    observer = new MutationObserver(function(){
      updateEssentials();
      updateOptionalSummaries();
    });

    observer.observe(step, {
      childList:true,
      characterData:true,
      subtree:true
    });
  }

  function initialise(){
    if(initialised) {
      updateAll();
      return;
    }

    var step = byId('step-1');
    if(!step) return;

    initialised = true;
    document.documentElement.classList.add('um-step1-play-ready');

    ensureStructure();
    updateAll();

    document.addEventListener('input', updateAll, true);
    document.addEventListener('change', updateAll, true);
    global.addEventListener('pageshow', updateAll);
    startObserver();

    setTimeout(updateAll, 250);
    setTimeout(updateAll, 900);
  }

  global.UltraMaxStep1PlayReady = Object.freeze({
    initialise:initialise,
    update:updateAll,
    essentialState:essentialState
  });

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initialise, {once:true});
  }else{
    initialise();
  }
})(window);
