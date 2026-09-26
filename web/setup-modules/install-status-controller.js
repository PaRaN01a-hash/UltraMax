// ── Installation status card (Step 4) ──
// Predicts (pre-generate) or confirms (post-generate) whether the last
// generated Ultra MAX add-on needs a first install, no action, an app
// refresh, or a reinstall. The actual classification always comes from the
// backend (services/manifest-fingerprint-service.js, derived from the same
// manifest-generation code that serves real clients) — this controller only
// ever renders whatever the backend returns, or a static first-install
// state locally when there's no token yet to compare against.
(function(){
  var STATUS_META = {
    'first-install': {
      icon: '🆕',
      titleKey: 'setup.step4.installStatus.states.firstInstall.title',
      titleFallback: 'First installation required',
      descKey: 'setup.step4.installStatus.states.firstInstall.description',
      descFallback: 'Generate your setup, then install the Ultra MAX add-on in Nuvio or Stremio.',
      actionKey: 'setup.step4.installStatus.states.firstInstall.action',
      actionFallback: 'Install after generating'
    },
    'no-reinstall': {
      icon: '✅',
      titleKey: 'setup.step4.installStatus.states.noReinstall.title',
      titleFallback: 'No reinstall needed',
      descKey: 'setup.step4.installStatus.states.noReinstall.description',
      descFallback: 'Your installed Ultra MAX add-on remains compatible. Restart the app if you want to refresh cached content.',
      actionKey: 'setup.step4.installStatus.states.noReinstall.action',
      actionFallback: 'No action required'
    },
    'refresh-recommended': {
      icon: '🔄',
      titleKey: 'setup.step4.installStatus.states.refreshRecommended.title',
      titleFallback: 'App refresh recommended',
      descKey: 'setup.step4.installStatus.states.refreshRecommended.description',
      descFallback: 'Restart Nuvio or Stremio after generating. Reinstall only if the changes do not appear.',
      actionKey: 'setup.step4.installStatus.states.refreshRecommended.action',
      actionFallback: 'Restart after generating'
    },
    'reinstall-required': {
      icon: '⚠️',
      titleKey: 'setup.step4.installStatus.states.reinstallRequired.title',
      titleFallback: 'Reinstall required',
      descKey: 'setup.step4.installStatus.states.reinstallRequired.description',
      descFallback: 'Your add-on structure changed. Generate the setup, then install the updated add-on URL.',
      actionKey: 'setup.step4.installStatus.states.reinstallRequired.action',
      actionFallback: 'Install the updated URL after generating'
    }
  };

  // Reason codes with no count (booleans) vs. codes that always carry a
  // {count} and need singular/other branching — mirrors the project's
  // existing manual-plural convention (see e.g. the "N source(s)" spots in
  // this file) but wired through umT so other locales aren't stuck with
  // hardcoded English.
  var BOOLEAN_REASON_FALLBACKS = {
    manifestIdChanged: 'Add-on identifier changed',
    streamsEnabled: 'Streams were enabled',
    streamsDisabled: 'Streams were disabled',
    homeOrderChanged: 'Home row order changed',
    schemaVersionMismatch: 'Installation history format was upgraded'
  };
  var COUNTED_REASON_FALLBACKS = {
    resourcesChanged: ['1 add-on resource changed', '{count} add-on resources changed'],
    catalogsAdded: ['1 catalogue row was added', '{count} catalogue rows were added'],
    catalogsRemoved: ['1 catalogue row was removed', '{count} catalogue rows were removed'],
    catalogTypesChanged: ['1 catalogue type changed', '{count} catalogue types changed'],
    searchContractChanged: ['Search requirements changed for 1 catalogue', 'Search requirements changed for {count} catalogues'],
    homeVisibilityChanged: ['Home visibility changed for 1 catalogue', 'Home visibility changed for {count} catalogues'],
    catalogNamesChanged: ['1 catalogue name changed', '{count} catalogue names changed']
  };
  var REASON_VISIBLE_LIMIT = 3;

  function reasonText(reason){
    var base = 'setup.step4.installStatus.reasons.' + reason.code;
    if(reason.count === undefined){
      return umT(base, BOOLEAN_REASON_FALLBACKS[reason.code] || reason.code);
    }
    var pair = COUNTED_REASON_FALLBACKS[reason.code] || ['1 change', '{count} changes'];
    if(reason.count === 1){
      return umT(base + '.one', pair[0]);
    }
    return umT(base + '.other', pair[1], { count: reason.count });
  }

  window.toggleInstallStatusDetails = function(){
    var card = document.getElementById('installStatusCard');
    var toggle = document.getElementById('installStatusToggle');
    if(!card) return;
    var expanded = card.getAttribute('data-reasons-expanded') === 'true';
    card.setAttribute('data-reasons-expanded', expanded ? 'false' : 'true');
    document.querySelectorAll('#installStatusReasons .install-status-reason-hidden').forEach(function(li){
      li.style.display = expanded ? 'none' : '';
    });
    if(toggle){
      var span = toggle.querySelector('span');
      var label = expanded
        ? umT('setup.step4.installStatus.viewChanges', 'View changes')
        : umT('setup.step4.installStatus.hideChanges', 'Hide changes');
      if(span) span.textContent = label; else toggle.textContent = label;
    }
  };

  // result: { status, reasons:[{code,count?}], remainingCount, totalCount } | null
  window.renderInstallStatus = function(result){
    var card = document.getElementById('installStatusCard');
    if(!card) return;

    if(!result || !STATUS_META[result.status]){
      result = { status: 'first-install', reasons: [], remainingCount: 0, totalCount: 0 };
    }

    var meta = STATUS_META[result.status];
    card.setAttribute('data-status', result.status);
    card.setAttribute('data-reasons-expanded', 'false');
    card.style.display = '';

    var iconEl = document.getElementById('installStatusIcon');
    var titleEl = document.getElementById('installStatusTitle');
    var descEl = document.getElementById('installStatusDesc');
    var actionEl = document.getElementById('installStatusAction');
    var reasonsEl = document.getElementById('installStatusReasons');
    var toggleEl = document.getElementById('installStatusToggle');

    if(iconEl) iconEl.textContent = meta.icon;
    if(titleEl){ titleEl.textContent = umT(meta.titleKey, meta.titleFallback); titleEl.setAttribute('data-i18n', meta.titleKey); }
    if(descEl){ descEl.textContent = umT(meta.descKey, meta.descFallback); descEl.setAttribute('data-i18n', meta.descKey); }
    if(actionEl){ actionEl.textContent = umT(meta.actionKey, meta.actionFallback); actionEl.setAttribute('data-i18n', meta.actionKey); }

    if(reasonsEl){
      while(reasonsEl.firstChild) reasonsEl.removeChild(reasonsEl.firstChild);
      (result.reasons || []).forEach(function(reason, index){
        var li = document.createElement('li');
        li.textContent = reasonText(reason);
        if(index >= REASON_VISIBLE_LIMIT){
          li.classList.add('install-status-reason-hidden');
          li.style.display = 'none';
        }
        reasonsEl.appendChild(li);
      });
    }

    var hasHiddenReasons = (result.reasons || []).length > REASON_VISIBLE_LIMIT;
    if(toggleEl){
      toggleEl.style.display = hasHiddenReasons ? '' : 'none';
      var span = toggleEl.querySelector('span');
      var label = umT('setup.step4.installStatus.viewChanges', 'View changes');
      if(span) span.textContent = label; else toggleEl.textContent = label;
    }
  };

  // Read-only prediction shown before Generate is clicked. No token yet ->
  // always first-install, no network call needed (nothing to compare
  // against). Editing an existing token -> ask the backend, which derives
  // the prediction from the real manifest-generation code rather than
  // trusting anything computed client-side.
  window.refreshInstallStatusPreview = function(){
    var token = (typeof editToken !== 'undefined' && editToken) ? editToken : null;
    if(!token){
      renderInstallStatus({ status: 'first-install', reasons: [], remainingCount: 0, totalCount: 0 });
      return;
    }

    var payload = {};
    try{
      if(typeof buildConfigPayloadFromForm === 'function') payload = buildConfigPayloadFromForm() || {};
    }catch(e){
      console.warn('Install status preview: could not read form state', e);
    }

    fetch(API_BASE + '/c/' + encodeURIComponent(token) + '/install-status/preview', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    })
      .then(function(res){ return res.ok ? res.json() : null; })
      .then(function(data){
        if(data) renderInstallStatus(data);
      })
      .catch(function(e){
        console.warn('Install status preview failed', e);
      });
  };
})();


