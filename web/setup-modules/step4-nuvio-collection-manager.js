(function(global){
  'use strict';

  var state = {
    preview: null,
    plan: null,
    profileIndex: null,
    localCollections: [],
    busy: false
  };

  function byId(id){ return document.getElementById(id); }

  function text(value){
    return value === null || value === undefined ? '' : String(value);
  }

  function escapeHtml(value){
    return text(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function post(path, body){
    var response = await fetch(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      cache: 'no-store',
      body: JSON.stringify(body || {})
    });

    var payload = await response.json().catch(function(){ return null; });
    if(!response.ok || !payload || payload.ok === false){
      var error = new Error(
        payload && payload.message
          ? payload.message
          : 'The Nuvio collection request could not be completed.'
      );
      error.code = payload && payload.code ? payload.code : 'REQUEST_FAILED';
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function sessionBridge(){
    return global.UltraMaxGlobalNuvioSetup || null;
  }

  function sharedContext(){
    return global.UltraMaxWizardContext || null;
  }

  function persistRecoveredV2Session(session, profileIndex){
    if(!session || !session.sessionId) return;
    try {
      sessionStorage.setItem('ultramax.v2.nuvioSessionId', String(session.sessionId));
      localStorage.setItem('ultramax.v2.nuvioSessionId', String(session.sessionId));
      if(Number.isSafeInteger(Number(profileIndex))){
        sessionStorage.setItem('ultramax.v2.nuvioProfileIndex', String(Number(profileIndex)));
        localStorage.setItem('ultramax.v2.nuvioProfileIndex', String(Number(profileIndex)));
      }
    } catch (_error) {}
  }

  async function adoptSharedSession(){
    var ctx = sharedContext();
    if(
      !ctx ||
      typeof ctx.isNuvioConnected !== 'function' ||
      !ctx.isNuvioConnected() ||
      typeof ctx.getNuvioAccessToken !== 'function'
    ){
      return null;
    }

    var accessToken = String(ctx.getNuvioAccessToken() || '').trim();
    if(!accessToken) return null;

    var payload = await post('/api/v2/nuvio/adopt', {
      accessToken: accessToken
    });
    var session = payload && payload.session ? payload.session : null;
    if(!session || !session.sessionId) return null;

    var selected = typeof ctx.getSelectedNuvioProfile === 'function'
      ? ctx.getSelectedNuvioProfile()
      : null;
    var profileIndex = selected &&
      Number.isSafeInteger(Number(selected.numericProfileId))
        ? Number(selected.numericProfileId)
        : null;

    persistRecoveredV2Session(session, profileIndex);
    return session;
  }

  async function ensureSession(){
    var bridge = sessionBridge();
    if(!bridge){
      throw new Error('The Nuvio session bridge is unavailable. Reload Ultra MAX and try again.');
    }

    if(typeof bridge.refresh === 'function'){
      await bridge.refresh();
    }

    var session = typeof bridge.getV2Session === 'function'
      ? bridge.getV2Session()
      : null;
    var sessionId = typeof bridge.getV2SessionId === 'function'
      ? bridge.getV2SessionId()
      : '';

    if(!session || !sessionId){
      session = await adoptSharedSession();
      sessionId = session && session.sessionId ? session.sessionId : '';
    }

    if(!session || !sessionId){
      throw new Error('Connect Nuvio from Home before managing collections.');
    }

    return {
      session: session,
      sessionId: sessionId
    };
  }

  function availableProfiles(session){
    return Array.isArray(session && session.profiles)
      ? session.profiles.filter(function(profile){
          return Number.isSafeInteger(Number(profile.profileIndex));
        })
      : [];
  }

  function preferredProfileIndex(session){
    try {
      var stored = Number(sessionStorage.getItem('ultramax.v2.nuvioProfileIndex'));
      if(
        Number.isSafeInteger(stored) &&
        availableProfiles(session).some(function(profile){
          return Number(profile.profileIndex) === stored;
        })
      ){
        return stored;
      }
    } catch (_error) {}

    var profiles = availableProfiles(session);
    return profiles.length ? Number(profiles[0].profileIndex) : null;
  }

  function activeLocalCollections(){
    if(Array.isArray(global.generatedNuvioCollections)){
      return JSON.parse(JSON.stringify(global.generatedNuvioCollections));
    }

    if(typeof global.buildCollectionsExport === 'function'){
      return global.buildCollectionsExport({preserveUnavailable:true});
    }

    throw new Error('Generate Ultra MAX first so the current collections are available.');
  }

  function setStatus(message, kind){
    var status = byId('s4NuvioManagerStatus');
    if(!status) return;
    status.textContent = message || '';
    status.dataset.kind = kind || 'info';
  }

  function setBusy(busy){
    state.busy = Boolean(busy);
    var root = byId('s4NuvioCollectionManager');
    if(root) root.dataset.busy = state.busy ? '1' : '0';

    [
      's4NuvioManagerCompare',
      's4NuvioManagerReview',
      's4NuvioManagerApply',
      's4NuvioManagerCancelReview',
      's4NuvioManagerUndo'
    ].forEach(function(id){
      var button = byId(id);
      if(button) button.disabled = state.busy;
    });

    if(root){
      root.querySelectorAll('[data-manager-bulk-action]').forEach(function(button){
        button.disabled = state.busy;
      });
    }
  }

  function selectedIds(action){
    return Array.prototype.map.call(
      document.querySelectorAll(
        '#s4NuvioManagerResults input[data-manager-action="' + action + '"]:checked'
      ),
      function(input){ return input.value; }
    );
  }

  function selectedActionCount(){
    return selectedIds('add').length +
      selectedIds('update').length +
      selectedIds('delete').length;
  }

  function updateReviewButton(){
    var button = byId('s4NuvioManagerReview');
    if(!button) return;
    var count = selectedActionCount();
    button.disabled = state.busy || count === 0;
    button.textContent = count
      ? 'Review ' + count + (count === 1 ? ' change' : ' changes')
      : 'Select changes to continue';
  }

  function profileOptionsHtml(session, selectedIndex){
    return availableProfiles(session).map(function(profile){
      var index = Number(profile.profileIndex);
      return '<option value="' + index + '"' +
        (index === selectedIndex ? ' selected' : '') +
        '>' + escapeHtml(profile.name || ('Profile ' + index)) + '</option>';
    }).join('');
  }

  function rowHtml(item, action, label, danger){
    var disabled = !item.manageable;
    return (
      '<label class="s4-manager-item' + (danger ? ' is-danger' : '') + '">' +
        '<span class="s4-manager-item-copy">' +
          '<strong>' + escapeHtml(item.title) + '</strong>' +
          '<small>' + item.folders + ' folders · ' + item.rows + ' rows</small>' +
        '</span>' +
        '<span class="s4-manager-item-action">' +
          '<input type="checkbox" data-manager-action="' + action + '" value="' +
            escapeHtml(item.id) + '"' + (disabled ? ' disabled' : '') + '>' +
          '<span>' + escapeHtml(label) + '</span>' +
        '</span>' +
      '</label>'
    );
  }

  function groupHtml(title, copy, items, action, label, danger, bulkLabel){
    if(!items || !items.length) return '';
    return (
      '<section class="s4-manager-group' + (danger ? ' is-danger' : '') + '">' +
        '<div class="s4-manager-group-head">' +
          '<div><strong>' + escapeHtml(title) + '</strong><small>' + escapeHtml(copy) + '</small></div>' +
          (bulkLabel
            ? '<button type="button" class="s4-manager-bulk" data-manager-bulk-action="' +
                escapeHtml(action) + '">' + escapeHtml(bulkLabel) + '</button>'
            : '') +
          '<span>' + items.length + '</span>' +
        '</div>' +
        '<div class="s4-manager-list">' +
          items.map(function(item){
            return rowHtml(item, action, label, danger);
          }).join('') +
        '</div>' +
      '</section>'
    );
  }

  function renderComparison(preview){
    var results = byId('s4NuvioManagerResults');
    if(!results) return;

    var summary = preview.summary || {};
    var groups = preview.groups || {};
    var actionable =
      Number(summary.localOnly || 0) +
      Number(summary.changed || 0) +
      Number(summary.remoteOnly || 0);

    results.hidden = false;
    results.innerHTML =
      '<div class="s4-manager-summary">' +
        '<span><strong>' + Number(summary.matching || 0) + '</strong> In sync</span>' +
        '<span><strong>' + Number(summary.localOnly || 0) + '</strong> Missing</span>' +
        '<span><strong>' + Number(summary.changed || 0) + '</strong> Changed</span>' +
        '<span><strong>' + Number(summary.remoteOnly || 0) + '</strong> Nuvio only</span>' +
      '</div>' +
      (actionable === 0
        ? '<div class="s4-manager-all-good">✓ Ultra MAX and Nuvio collections match.</div>'
        : '') +
      groupHtml(
        'Missing in Nuvio',
        'These exist in Ultra MAX but are missing from this Nuvio profile.',
        groups.localOnly || [],
        'add',
        'Add',
        false,
        'Add all'
      ) +
      groupHtml(
        'Changed',
        'These share the same collection ID but the managed content differs.',
        groups.changed || [],
        'update',
        'Update',
        false
      ) +
      groupHtml(
        'Only in Nuvio',
        'Kept by default. Delete only collections you deliberately want removed from Nuvio.',
        groups.remoteOnly || [],
        'delete',
        'Delete',
        true
      ) +
      ((groups.unmanagedRemote || []).length
        ? '<div class="s4-manager-note">Some Nuvio collections have no safe collection ID and are shown as protected. Ultra MAX will not delete them.</div>'
        : '') +
      '<button id="s4NuvioManagerReview" type="button" class="nav-btn primary s4-manager-review" disabled>Select changes to continue</button>';

    results.querySelectorAll('input[data-manager-action]').forEach(function(input){
      input.addEventListener('change', updateReviewButton);
    });
    results.querySelectorAll('[data-manager-bulk-action]').forEach(function(button){
      button.addEventListener('click', function(){
        var action = button.getAttribute('data-manager-bulk-action') || '';
        results.querySelectorAll(
          'input[data-manager-action="' + action + '"]:not(:disabled)'
        ).forEach(function(input){
          input.checked = true;
        });
        updateReviewButton();
      });
    });
    byId('s4NuvioManagerReview').addEventListener('click', prepareSelectedChanges);
  }

  async function compare(){
    if(state.busy) return;
    setBusy(true);
    setStatus('Checking Nuvio collections…');

    try {
      var connected = await ensureSession();
      var select = byId('s4NuvioManagerProfile');
      var profileIndex = Number(select && select.value);
      if(!Number.isSafeInteger(profileIndex)){
        profileIndex = preferredProfileIndex(connected.session);
      }
      if(!Number.isSafeInteger(profileIndex)){
        throw new Error('Choose a Nuvio profile first.');
      }

      state.profileIndex = profileIndex;
      state.localCollections = activeLocalCollections();

      var payload = await post('/api/v2/nuvio/collections/preview', {
        sessionId: connected.sessionId,
        profileIndex: profileIndex,
        localCollections: state.localCollections
      });

      state.preview = payload.preview;
      state.plan = null;
      renderComparison(payload.preview);
      setStatus(
        'Comparison refreshed for ' +
        (payload.preview.profile && payload.preview.profile.name
          ? payload.preview.profile.name
          : 'the selected profile') +
        '. Nothing has been changed.',
        'success'
      );
    } catch (error) {
      console.error('Nuvio collection comparison failed:', error);
      setStatus(error.message || 'Could not compare Nuvio collections.', 'error');
    } finally {
      setBusy(false);
      updateReviewButton();
    }
  }

  async function prepareSelectedChanges(){
    if(state.busy || !state.preview) return;

    var addIds = selectedIds('add');
    var updateIds = selectedIds('update');
    var deleteIds = selectedIds('delete');

    if(!addIds.length && !updateIds.length && !deleteIds.length) return;

    setBusy(true);
    setStatus('Re-checking Nuvio before preparing changes…');

    try {
      var connected = await ensureSession();
      var payload = await post('/api/v2/nuvio/collections/prepare', {
        sessionId: connected.sessionId,
        profileIndex: state.profileIndex,
        localCollections: state.localCollections,
        expectedRemoteFingerprint: state.preview.remoteFingerprint,
        addIds: addIds,
        updateIds: updateIds,
        deleteIds: deleteIds
      });

      state.plan = payload.plan;
      renderReview(payload.plan);
      setStatus('Review the selected changes. Nothing has been written yet.');
    } catch (error) {
      console.error('Nuvio collection plan failed:', error);
      if(
        error.code === 'NUVIO_COLLECTIONS_CHANGED' ||
        error.code === 'NUVIO_COLLECTION_ADD_STALE' ||
        error.code === 'NUVIO_COLLECTION_UPDATE_STALE' ||
        error.code === 'NUVIO_COLLECTION_DELETE_UNSAFE'
      ){
        setStatus(error.message + ' Refreshing comparison…', 'error');
        setBusy(false);
        await compare();
        return;
      }
      setStatus(error.message || 'Could not prepare the selected changes.', 'error');
    } finally {
      setBusy(false);
      updateReviewButton();
    }
  }

  function renderReview(plan){
    var review = byId('s4NuvioManagerReviewPanel');
    var results = byId('s4NuvioManagerResults');
    if(!review || !results) return;

    results.hidden = true;
    review.hidden = false;

    var summary = plan.summary || {};
    var deletions = Number(summary.deletions || 0);

    review.innerHTML =
      '<div class="s4-manager-review-card">' +
        '<span class="s4-manager-review-kicker">REVIEW CHANGES</span>' +
        '<h4>' + escapeHtml(plan.profile && plan.profile.name ? plan.profile.name : 'Nuvio profile') + '</h4>' +
        '<div class="s4-manager-review-counts">' +
          '<span><strong>' + Number(summary.additions || 0) + '</strong> add</span>' +
          '<span><strong>' + Number(summary.updates || 0) + '</strong> update</span>' +
          '<span class="' + (deletions ? 'is-danger' : '') + '"><strong>' + deletions + '</strong> delete</span>' +
        '</div>' +
        '<p>Nuvio will be checked again immediately before writing. The previous collection state is kept temporarily for Undo.</p>' +
        (deletions
          ? '<label class="s4-manager-delete-confirm"><input id="s4NuvioManagerDeleteConfirm" type="checkbox"> I understand the selected Nuvio-only collections will be deleted.</label>'
          : '') +
        '<div class="s4-manager-review-actions">' +
          '<button id="s4NuvioManagerCancelReview" type="button" class="nav-btn">Back</button>' +
          '<button id="s4NuvioManagerApply" type="button" class="nav-btn primary"' +
            (deletions ? ' disabled' : '') +
          '>Apply changes</button>' +
        '</div>' +
      '</div>';

    byId('s4NuvioManagerCancelReview').addEventListener('click', function(){
      review.hidden = true;
      results.hidden = false;
      state.plan = null;
      updateReviewButton();
    });

    if(deletions){
      byId('s4NuvioManagerDeleteConfirm').addEventListener('change', function(event){
        byId('s4NuvioManagerApply').disabled = !event.target.checked || state.busy;
      });
    }

    byId('s4NuvioManagerApply').addEventListener('click', applyPlan);
  }

  async function applyPlan(){
    if(state.busy || !state.plan) return;
    setBusy(true);
    setStatus('Applying verified collection changes…');

    try {
      var connected = await ensureSession();
      var payload = await post('/api/v2/nuvio/collections/apply', {
        sessionId: connected.sessionId,
        planId: state.plan.planId,
        confirmation: 'APPLY NUVIO COLLECTION CHANGES'
      });

      renderSuccess(payload.result);
      setStatus('Nuvio collections updated and verified.', 'success');
    } catch (error) {
      console.error('Nuvio collection apply failed:', error);
      setStatus(error.message || 'The collection update was stopped.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function renderSuccess(result){
    var review = byId('s4NuvioManagerReviewPanel');
    var results = byId('s4NuvioManagerResults');
    if(results) results.hidden = true;
    if(!review) return;

    var summary = result.summary || {};
    review.hidden = false;
    review.innerHTML =
      '<div class="s4-manager-success">' +
        '<span class="s4-manager-success-icon">✓</span>' +
        '<div><strong>Collection changes verified</strong>' +
        '<small>' +
          Number(summary.additions || 0) + ' added · ' +
          Number(summary.updates || 0) + ' updated · ' +
          Number(summary.deletions || 0) + ' deleted' +
        '</small></div>' +
      '</div>' +
      '<div class="s4-manager-success-actions">' +
        '<button id="s4NuvioManagerCompareAgain" type="button" class="nav-btn">Compare again</button>' +
        '<button id="s4NuvioManagerUndo" type="button" class="nav-btn s4-manager-undo">Undo last change</button>' +
      '</div>';

    byId('s4NuvioManagerCompareAgain').addEventListener('click', compare);
    byId('s4NuvioManagerUndo').addEventListener('click', undoPlan);
  }

  async function undoPlan(){
    if(state.busy || !state.plan) return;
    if(!global.confirm('Restore the Nuvio collection state from immediately before this change?')){
      return;
    }

    setBusy(true);
    setStatus('Restoring the previous Nuvio collection state…');

    try {
      var connected = await ensureSession();
      await post('/api/v2/nuvio/collections/rollback', {
        sessionId: connected.sessionId,
        planId: state.plan.planId,
        confirmation: 'RESTORE NUVIO COLLECTIONS'
      });

      state.plan = null;
      setStatus('Previous Nuvio collection state restored and verified.', 'success');
      setBusy(false);
      await compare();
    } catch (error) {
      console.error('Nuvio collection rollback failed:', error);
      setStatus(error.message || 'The collection restore was stopped.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function hydrateProfileSelector(){
    var connected = await ensureSession();
    var session = connected.session;
    var select = byId('s4NuvioManagerProfile');
    if(!session || !select) return;

    var preferred = preferredProfileIndex(session);
    select.innerHTML = profileOptionsHtml(session, preferred);
    state.profileIndex = preferred;

    if(!availableProfiles(session).length){
      setStatus('Nuvio is connected, but no selectable profiles were returned. Reconnect Nuvio from Home.', 'error');
    } else {
      setStatus(
        preferred === null
          ? 'Nuvio connected. Choose a profile to compare.'
          : 'Nuvio connected. Ready to compare collections.'
      );
    }

    if(select.dataset.managerBound !== '1'){
      select.dataset.managerBound = '1';
      select.addEventListener('change', function(){
        state.preview = null;
        state.plan = null;
        state.profileIndex = Number(select.value);
        var results = byId('s4NuvioManagerResults');
        var review = byId('s4NuvioManagerReviewPanel');
        if(results){
          results.hidden = true;
          results.innerHTML = '';
        }
        if(review){
          review.hidden = true;
          review.innerHTML = '';
        }
        setStatus('Profile changed. Compare again before making changes.');
      });
    }
  }

  function build(){
    var mount = byId('s4NuvioCollectionManagerMount');
    if(!mount || byId('s4NuvioCollectionManager')) return;

    mount.innerHTML =
      '<details id="s4NuvioCollectionManager" class="s4-nuvio-manager">' +
        '<summary>' +
          '<span class="s4-manager-icon" aria-hidden="true">↔</span>' +
          '<span class="s4-manager-copy">' +
            '<strong>Manage Nuvio collections</strong>' +
            '<small>Compare, repair or remove collections after installation</small>' +
          '</span>' +
          '<span class="s4-manager-chevron" aria-hidden="true">⌄</span>' +
        '</summary>' +
        '<div class="s4-manager-body">' +
          '<div class="s4-manager-intro">Use this only when you want to check or repair collection differences. The main Install button above remains the normal setup path.</div>' +
          '<label class="s4-manager-profile-label">Nuvio profile' +
            '<select id="s4NuvioManagerProfile"></select>' +
          '</label>' +
          '<button id="s4NuvioManagerCompare" type="button" class="nav-btn s4-manager-compare">Compare collections</button>' +
          '<div id="s4NuvioManagerStatus" class="s4-manager-status"></div>' +
          '<div id="s4NuvioManagerResults" hidden></div>' +
          '<div id="s4NuvioManagerReviewPanel" hidden></div>' +
        '</div>' +
      '</details>';

    byId('s4NuvioManagerCompare').addEventListener('click', compare);

    var details = byId('s4NuvioCollectionManager');
    details.addEventListener('toggle', function(){
      if(details.open){
        hydrateProfileSelector().catch(function(error){
          console.error('Could not hydrate Nuvio collection manager:', error);
          setStatus(error.message || 'Could not load the Nuvio profiles.', 'error');
        });
      }
    });
  }

  build();
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', build, {once:true});
  }
  global.addEventListener('load', build, {once:true});
})(window);