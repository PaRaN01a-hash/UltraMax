function goToStep2(){
  const pass = document.getElementById('password').value;
  const providers = validateDiscoveryProviders({ showError: true });
  if(!providers.hasAnyDiscoveryProvider) return false;
  const passError = document.getElementById('passError');
  passError.classList.remove('visible');
  setStep(2);
  // Init new Step 2 builder
  setTimeout(function(){ if(typeof s2Init==='function') s2Init(); }, 300);
}



// Step 3 collection state and identity helpers live in /setup-modules/collection-state-identities.js

// Step 3 collection editor/rendering lives in /setup-modules/collection-editor-controller.js

// Step 3 artwork/media maps live in /setup-modules/collection-artwork-media.js

// Step 3 collection row/folder helpers live in /setup-modules/collection-editor-controller.js

// Step 3 collection preset engine lives in /setup-modules/collection-preset-controller.js

function applyHiddenStateToPill(id){
  const pill = document.querySelector('.pill[data-id="'+id+'"]');
  if(!pill) return;

  const eye = pill.querySelector('.pill-eye');
  pill.style.fontStyle = 'italic';

  if(eye){
    eye.style.display = 'inline';
    eye.textContent = '🙈';
    eye.style.opacity = '1';
  }
}

function clearHiddenStateFromPill(id){
  const pill = document.querySelector('.pill[data-id="'+id+'"]');
  if(!pill) return;

  const eye = pill.querySelector('.pill-eye');
  pill.style.fontStyle = '';

  if(eye && selected.has(id)){
    eye.style.display = 'inline';
    eye.textContent = '👁';
    eye.style.opacity = '0.9';
  }
}

function syncHiddenFromCollections(){
  // Compatibility hook only. Collection membership no longer owns Step 2
  // selection state: selected/hidden rows must come from the user's explicit
  // catalog choices, otherwise collection presets silently inflate configs.
  s2RefreshAllHiddenWarning();
}

function goToStep3(){
  if(selected.size === 0){
    if(typeof showBanner === 'function') showBanner(umT('setup.misc.pickAtLeastOneRowBefore', '⚡ Pick at least one row before continuing — try a preset above!'), 'error');
    // Highlight the presets section
    var grid = document.getElementById('s2PresetsGrid');
    if(grid){ grid.style.animation='none'; setTimeout(function(){ grid.style.animation='s2Pulse .6s ease 3'; },10); }
    return;
  }
  setStep(3);
  updateBuilderRecommendation();
  renderCollections();
}

function goToStep4(){
  console.log('[S2-TRACE] goToStep4 ENTER', {
    selected:Array.from(selected || []),
    hasF1:selected.has('sports_f1_fixtures'),
    size:selected.size
  });

  if(selected.size === 0){
    if(typeof showBanner === 'function') showBanner(umT('setup.misc.pickAtLeastOneRowBefore2', '⚡ Pick at least one row before continuing — try a preset above!'), 'error');
    var grid = document.getElementById('s2PresetsGrid');
    if(grid){ grid.style.animation='none'; setTimeout(function(){ grid.style.animation='s2Pulse .6s ease 3'; },10); }
    return;
  }
  const collectionIds = new Set();
  v2Collections.forEach(function(coll){
    (coll.folders || []).forEach(function(folder){
      (folder.rows || []).forEach(function(row){
        var id = normalizeCatalogId(getCollectionRowId(row));
        if(id && !isRemovedMergedCatalogId(id)) collectionIds.add(id);
      });
    });
  });

  // Finalise must describe the configuration that Generate will actually
  // save. Collection rows are installed and hidden during serialization, so
  // fold them into the effective selected/hidden sets before counting. The
  // old subtraction double-counted collection rows and could report 0 Home
  // rows even when two visible rows were selected.
  const effectiveSelected = new Set(Array.from(selected || []));
  const effectiveHidden = new Set(Array.from(hidden || []));
  collectionIds.forEach(function(id){
    effectiveSelected.add(id);
    effectiveHidden.add(id);
  });
  const homeRows = Array.from(effectiveSelected).filter(function(id){
    return !effectiveHidden.has(id);
  }).length;
  const hiddenRows = Array.from(effectiveSelected).filter(function(id){
    return effectiveHidden.has(id);
  }).length;
  const collectionCount = v2Collections.length;
  const collectionRows = collectionIds.size;

  let perfText = umT('setup.step4.summary.perf.excellent', 'Excellent');
  let hintText = 'Your setup looks clean and ready to generate.';

  if(homeRows <= 15){
    perfText = umT('setup.step4.summary.perf.excellent', 'Excellent');
    hintText = umT('setup.step4.summary.hint.excellent', 'Lean Home layout. Great for mobile, TV and fast browsing.');
  } else if(homeRows <= 25){
    perfText = umT('setup.step4.summary.perf.good', 'Good');
    hintText = umT('setup.step4.summary.hint.good', 'Balanced setup. Should work well on most devices.');
  } else if(homeRows <= 40){
    perfText = umT('setup.step4.summary.perf.heavy', 'Heavy');
    hintText = umT('setup.step4.summary.hint.heavy', 'You have a lot of Home rows. Collections can help keep the layout organised.');
  } else {
    perfText = umT('setup.step4.summary.perf.veryHeavy', 'Very Heavy');
    hintText = umT('setup.step4.summary.hint.veryHeavy', 'This setup may feel busy. You will want to move more rows into Collections.');
  }

  const homeEl = document.getElementById('finalHomeRows');
  const hiddenEl = document.getElementById('finalHiddenRows');
  const collEl = document.getElementById('finalCollectionCount');
  const collRowsEl = document.getElementById('finalCollectionRows');
  const perfEl = document.getElementById('finalPerf');
  const hintEl = document.getElementById('finalHint');

  if(homeEl) homeEl.textContent = homeRows;
  if(hiddenEl) hiddenEl.textContent = hiddenRows;
  if(collEl) collEl.textContent = collectionCount;
  if(collRowsEl) collRowsEl.textContent = collectionRows;
  if(perfEl) perfEl.textContent = perfText;
  if(hintEl) hintEl.textContent = hintText;

  setStep(4);
  if (typeof refreshInstallStatusPreview === 'function') refreshInstallStatusPreview();
  setTimeout(function(){
    var adapters = window.UltraMaxWizardContextAdapters || {};
    if(
      adapters.step4Finalise &&
      typeof adapters.step4Finalise.hydrateFromSharedPrimary === 'function'
    ){
      adapters.step4Finalise.hydrateFromSharedPrimary();
    }
  }, 0);
}




function applyPreset(name, evt){
  clearAllGlobal(true);
  document.querySelectorAll('.preset-btn').forEach(function(b){ b.classList.remove('active'); });
  let ids = name === 'everything' ? Array.from(document.querySelectorAll('.pill')).map(function(p){ return p.dataset.id; }) : (PRESETS[name] || []);
  ids.forEach(function(id){
    selected.add(id);
    const pill = document.querySelector('.pill[data-id="'+id+'"]');
    if(pill){
      pill.classList.add('selected');

      const eye = pill.querySelector('.pill-eye');
      if(eye){
        eye.style.display = 'inline';
        eye.textContent = hidden.has(id) ? '🙈' : '👁';
        eye.style.opacity = hidden.has(id) ? '1' : '0.9';
      }

      if(!hidden.has(id)){
        pill.style.fontStyle = '';
      }
    }
  });
  if(evt && evt.currentTarget) evt.currentTarget.classList.add('active');
  syncCatalogOrder();
  updateCounter();
  updateCategoryCounts();
}

function selectAllGlobal(){
  document.querySelectorAll('.pill').forEach(function(p){
    p.classList.add('selected');
    selected.add(p.dataset.id);

    const eye = p.querySelector('.pill-eye');
    if(eye){
      eye.style.display = 'inline';
      eye.textContent = hidden.has(p.dataset.id) ? '🙈' : '👁';
      eye.style.opacity = hidden.has(p.dataset.id) ? '1' : '0.9';
    }

    if(!hidden.has(p.dataset.id)){
      p.style.fontStyle = '';
    }
  });
  document.querySelectorAll('.preset-btn').forEach(function(b){ b.classList.remove('active'); });
  updateCounter(); updateCategoryCounts();
  persistStep2State();
}

function clearAllGlobal(silent){
  document.querySelectorAll('.pill').forEach(function(p){
    p.classList.remove('selected');

    const eye = p.querySelector('.pill-eye');
    if(eye) eye.style.display = 'none';

    p.style.fontStyle = '';
  });
  selected.clear();
  if(!silent) document.querySelectorAll('.preset-btn').forEach(function(b){ b.classList.remove('active'); });
  updateCounter(); updateCategoryCounts();
  persistStep2State();
}

function refreshHomeRowUi(){
  syncCatalogOrder();
  if(typeof saveHiddenState === 'function') saveHiddenState();
  if(typeof updateCounters === 'function') updateCounters();
  if(typeof updateCategoryCounts === 'function') updateCategoryCounts();
  if(typeof updateCounter === 'function') updateCounter();
  if(typeof saveDraftState === 'function') saveDraftState();
}

function showAllRows(){
  hidden.clear();

  document.querySelectorAll('.pill.selected').forEach(function(pill){
    const eye = pill.querySelector('.pill-eye');
    if(eye){
      eye.style.display = 'inline';
      eye.textContent = '👁';
      eye.style.opacity = '0.9';
    }
    pill.style.fontStyle = '';
  });

  refreshHomeRowUi();
}

function hideAllRows(){
  selected.forEach(function(id){ hidden.add(id); });
  saveHiddenState();

  document.querySelectorAll('.pill.selected').forEach(function(pill){
    const eye = pill.querySelector('.pill-eye');
    if(eye){
      eye.style.display = 'inline';
      eye.textContent = '🙈';
      eye.style.opacity = '1';
    }
    pill.style.fontStyle = 'italic';
  });

  refreshHomeRowUi();
}
function removeAllRows(){
  if(!confirm(umT('setup.landing.removeAllSelectedRowsFromThis', 'Remove all selected rows from this setup?'))) return;
  selected.clear();
  hidden.clear();
  refreshHomeRowUi();
}

function filterCatalogs(query){
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.category').forEach(function(cat){
    let anyVisible = false;
    cat.querySelectorAll('.pill').forEach(function(pill){
      const match = !q || pill.textContent.toLowerCase().includes(q);
      pill.classList.toggle('hidden', !match);
      if(match) anyVisible = true;
    });
    cat.classList.toggle('hidden', !anyVisible);
  });
  setTimeout(makeSprockets, 100);
}

function selectAll(groupId){
  const group = document.getElementById(groupId);
  const pills = group.querySelectorAll('.pill:not(.hidden)');
  const allSelected = Array.from(pills).every(function(p){ return p.classList.contains('selected'); });
  pills.forEach(function(p){
    const eye = p.querySelector('.pill-eye');
    if(allSelected){
      p.classList.remove('selected');
      selected.delete(p.dataset.id);
      p.style.fontStyle = '';
      if(eye) eye.style.display = 'none';
    } else {
      p.classList.add('selected');
      selected.add(p.dataset.id);
      if(eye){
        eye.style.display = 'inline';
        eye.textContent = hidden.has(p.dataset.id) ? '🙈' : '👁';
        eye.style.opacity = hidden.has(p.dataset.id) ? '1' : '0.9';
      }
      p.style.fontStyle = hidden.has(p.dataset.id) ? 'italic' : '';
    }
  });
  const btn = document.querySelector('[onclick="selectAll(\''+groupId+'\')"]');
  if(btn) btn.textContent = allSelected ? 'Select All' : 'Clear All';
  updateCounter(); updateCategoryCounts();
  persistStep2State();
}

function updateCategoryCounts(){
  // Standard groups
  const groups = ['quickpicks','trending','providers','genres','studios','collections','tvcollections','directors','actors','decades','kids','sports'];
  groups.forEach(function(g){
    const el = document.getElementById('count-'+g);
    const group = document.getElementById(g);
    if(!el || !group) return;
    const total = group.querySelectorAll('.pill').length;
    const sel = group.querySelectorAll('.pill.selected').length;
    const visible = group.querySelectorAll('.pill:not(.hidden)').length;
    const visibleSel = group.querySelectorAll('.pill.selected:not(.hidden)').length;
    el.textContent = sel > 0 ? sel+'/'+total : total;
    const btn = document.querySelector('[onclick="selectAll(\''+g+'\')"]');
    if(btn) btn.textContent = (visible > 0 && visibleSel === visible) ? 'Clear All' : 'Select All';
  });

  // Parent groups with sub-categories (count all pills inside the wrap)
  ['themed','regional'].forEach(function(g){
    const el = document.getElementById('count-'+g);
    const wrap = document.getElementById('wrap-'+g);
    if(!el || !wrap) return;
    const total = wrap.querySelectorAll('.pill').length;
    const sel = wrap.querySelectorAll('.pill.selected').length;
    el.textContent = sel > 0 ? sel+'/'+total : total;
  });

  // Sub-category groups
  const subGroups = ['themed-crime','themed-horror','regional-uk','regional-usa','regional-australia'];
  subGroups.forEach(function(g){
    const el = document.getElementById('count-'+g);
    const group = document.getElementById(g);
    if(!el || !group) return;
    const total = group.querySelectorAll('.pill').length;
    const sel = group.querySelectorAll('.pill.selected').length;
    const visible = group.querySelectorAll('.pill:not(.hidden)').length;
    const visibleSel = group.querySelectorAll('.pill.selected:not(.hidden)').length;
    el.textContent = sel > 0 ? sel+'/'+total : total;
    const btn = document.querySelector('[onclick="selectAll(\''+g+'\')"]');
    if(btn) btn.textContent = (visible > 0 && visibleSel === visible) ? 'Clear All' : 'Select All';
  });
}

function updateCounter(){
  syncCatalogOrder();
  s2RefreshAllHiddenWarning();
  const count = selected.size;
  const perf = document.getElementById('perfLabel');

  const countNumEl = document.getElementById('countNum');
  if(countNumEl) countNumEl.textContent = count;
  const nextBtnEl = document.getElementById('nextBtn');
  if(nextBtnEl) nextBtnEl.disabled = count === 0;

  if(!perf) return;

  if(count <= 15){
    perf.textContent = umT('setup.landing.excellentForAllDevices', 'Excellent for all devices');
  } else if(count <= 25){
    perf.textContent = umT('setup.landing.goodForTvMayFeelBusy', 'Good for TV, may feel busy on mobile');
  } else if(count <= 40){
    perf.textContent = umT('setup.landing.heavySetupCollectionsRecommended', 'Heavy setup - Collections recommended');
  } else {
    perf.textContent = umT('setup.landing.veryHeavySetupMoveRowsInto', 'Very heavy setup - move rows into Collections');
  }
}

// Returning setup, token/password modal, timezone, and config loading live in /setup-modules/setup-load-controller.js

// Nuvio collection identity, export, save, share, and download live in /setup-modules/nuvio-collections.js

