(function(){
  var contentIds = {
    password: 'tile-content-password',
    mdblist: 'tile-content-mdblist'
  };

  var shellIds = {
    optional: 'optionalEnhancementsShell',
    streams: 'advancedStreamBridgeBlock'
  };

  window.s1ShowTile = function(key){
    document.getElementById('step1TileGrid').style.display = 'none';
    document.getElementById('step1TileBack').style.display = 'block';

    if (key === 'optional' || key === 'streams') {
      var shell = document.getElementById(shellIds[key]);
      if (shell) {
        shell.style.display = 'block';
        // 'optional' no longer has its own umbrella toggle — its sections
        // (each an independent <details class="opt-subsection">) are all
        // visible as soon as the shell is shown, each collapsed/expanded
        // on its own. 'streams' still has a single toggle to auto-open.
        if (key === 'streams') {
          var chevron = document.getElementById('streamsSectionChevron');
          if (chevron && chevron.textContent.trim() === '▸' && typeof toggleStreamsSection === 'function') {
            toggleStreamsSection();
          }
        }
      }
    } else {
      var el = document.getElementById(contentIds[key]);
      if (el) el.style.display = 'block';
      if (key === 'password') {
        var fpc = document.getElementById('forgotPasswordCard');
        if (fpc && fpc.dataset.wasShown === 'true') fpc.style.display = 'block';
      }
    }
  };

  window.s1ShowGrid = function(){
    Object.keys(contentIds).forEach(function(key){
      var el = document.getElementById(contentIds[key]);
      if (el) el.style.display = 'none';
    });
    Object.keys(shellIds).forEach(function(key){
      var shell = document.getElementById(shellIds[key]);
      if (shell) shell.style.display = 'none';
    });
    var fpc = document.getElementById('forgotPasswordCard');
    if (fpc) fpc.style.display = 'none';

    document.getElementById('step1TileBack').style.display = 'none';
    document.getElementById('step1TileGrid').style.display = 'block';
    s1UpdateStatuses();
  };

  window.s1UpdateStatuses = function(){
    var pwEl = document.getElementById('password');
    var pwStatus = document.getElementById('s1-status-password');
    if (pwStatus) pwStatus.textContent = (pwEl && pwEl.value) ? '✓ Set' : 'Required';

    var mdbEl = document.getElementById('mdblistKey');
    var mdbStatus = document.getElementById('s1-status-mdblist');
    if (mdbStatus) mdbStatus.textContent = discoveryProviderStatusText(getDiscoveryProviderState());
    updateDiscoveryCapabilityUi();
    if(typeof window.updateMobileSetupCardStates === 'function'){
      window.updateMobileSetupCardStates();
    }
  };

  function initTileMode(){
    var forcedNative =
      new URLSearchParams(window.location.search).get('native') === '1';

    var standalone =
      typeof umIsStandalone === 'function' && umIsStandalone();

    if (!forcedNative && !standalone) return;

    document.documentElement.classList.add('um-app-mode');
    document.body.classList.add('um-app-mode');

    var pwEl = document.getElementById('tile-content-password');
    if (pwEl) pwEl.style.display = '';
    var mdbEl = document.getElementById('tile-content-mdblist');
    if (mdbEl) mdbEl.style.display = '';

    document.getElementById('step1TileGrid').style.display = 'none';
    document.getElementById('step1TileBack').style.display = 'none';
    s1UpdateStatuses();

    var pwField = document.getElementById('password');
    if (pwField) pwField.addEventListener('input', s1UpdateStatuses);
    var tmdbField = document.getElementById('tmdbKey');
    if (tmdbField) tmdbField.addEventListener('input', s1UpdateStatuses);
    var mdbField = document.getElementById('mdblistKey');
    if (mdbField) mdbField.addEventListener('input', s1UpdateStatuses);
  }

  setTimeout(initTileMode, 700);
  function addPasswordToggle(inputId){
    var input = document.getElementById(inputId);
    if(!input || input.dataset.toggleAdded) return;
    input.dataset.toggleAdded = '1';
    var parent = input.parentElement;
    if(!parent) return;
    if(getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '👁';
    btn.style.cssText = 'position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;opacity:0.6;padding:4px;';
    btn.onclick = function(){
      if(input.type === 'password'){
        input.type = 'text';
        btn.style.opacity = '1';
      } else {
        input.type = 'password';
        btn.style.opacity = '0.6';
      }
    };
    parent.appendChild(btn);
    if(parseInt(getComputedStyle(input).paddingRight) < 36){
      input.style.paddingRight = '40px';
    }
  }
  ['password','confirmPassword','newPassword','confirmNewPassword','googleAiKey','nuvio-password','tokenModalPassword'].forEach(addPasswordToggle);
  setTimeout(function(){
    var savedTile = localStorage.getItem('um_return_tile');
    var savedScroll = localStorage.getItem('um_return_scroll');
    if (savedTile && typeof window.s1ShowTile === 'function') {
      window.s1ShowTile(savedTile);
    }
    if (savedScroll !== null) {
      setTimeout(function(){
        window.scrollTo(0, parseInt(savedScroll, 10) || 0);
      }, 150);
    }
    localStorage.removeItem('um_return_scroll');
    localStorage.removeItem('um_return_tile');
  }, 900);
  if (typeof umIsStandalone === 'function' && umIsStandalone()) {
    var _origSetStep = window.setStep;
    if (typeof _origSetStep === 'function') {
      window.setStep = function(n){
        _origSetStep(n);
        history.pushState({umStep: n}, '', location.href);
      };
      history.replaceState({umStep: (typeof currentStep !== 'undefined' ? currentStep : 1)}, '', location.href);
      window.addEventListener('popstate', function(e){
        if (e.state && e.state.umStep) {
          _origSetStep(e.state.umStep);
        }
      });
    }
    function closeOpenSetupOverlay(){
      // Popups here are plain display:flex/none panels (no shared open/show
      // class), so each needs its own known close path — falls back to
      // hiding the element directly if a dedicated closer isn't available.
      var overlays = [
        { id: 'howtoOverlay', close: function(){ if (typeof dismissHowToUse === 'function') dismissHowToUse(); } },
        { id: 'supportModal', close: function(){ if (typeof closeSupportModal === 'function') closeSupportModal(); } },
        { id: 'mergedRemoveConfirm', close: function(){ if (typeof cancelRemoveMergedCatalog === 'function') cancelRemoveMergedCatalog(); } },
        { id: 's2Modal', close: function(){ if (typeof s2CloseModal === 'function') s2CloseModal(); } },
        { id: 'welcomeModal', close: function(el){ el.style.display = 'none'; } },
        { id: 'tokenPasswordModal', close: function(){ if (typeof cancelTokenModal === 'function') cancelTokenModal(); } },
        { id: 'resultModal', close: function(){ if (typeof closeModal === 'function') closeModal(); } },
        { id: 'customCatalogModal', close: function(){ if (typeof closeCustomCatalogModal === 'function') closeCustomCatalogModal(); } },
        { id: 'assetModal', close: function(){ if (typeof closeAssetModal === 'function') closeAssetModal(); } },
        { id: 'nuvioPreviewModal', close: function(){ if (typeof closeNuvioPreview === 'function') closeNuvioPreview(); } },
        { id: 'summaryModal', close: function(){ if (typeof closeSummary === 'function') closeSummary(); } },
        { id: 'inlineShareModal', close: function(el){ el.style.display = 'none'; } },
        { id: 'presetPickerModal', close: function(){ if (typeof closePresetPicker === 'function') closePresetPicker(); } }
      ];
      for (var i = 0; i < overlays.length; i++) {
        var el = document.getElementById(overlays[i].id);
        if (el && getComputedStyle(el).display !== 'none') {
          overlays[i].close(el);
          return true;
        }
      }
      var openOverlay = document.querySelector('.modal.open, .overlay.open, [role="dialog"].open');
      if (openOverlay) { openOverlay.classList.remove('open'); return true; }
      return false;
    }

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('backButton', function(event){
        if (closeOpenSetupOverlay()) return;

        // Setup is never the home screen, so Back should always land on the
        // previous screen (an earlier wizard step via history, or wherever
        // the user came from) — never exit the app from here.
        var sameOriginReferrer = false;
        try {
          sameOriginReferrer =
            !!document.referrer &&
            new URL(document.referrer).origin === window.location.origin;
        } catch (error) {}

        if (event && event.canGoBack && sameOriginReferrer) {
          window.history.back();
        } else {
          window.location.href = '/app.html?native=1&fromBack=1';
        }
      });
      window.Capacitor.Plugins.App.addListener('appUrlOpen', function(data){
        if (data && data.url) {
          window.location.href = data.url;
        }
      });
    }
  }
})();
