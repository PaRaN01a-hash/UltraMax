function sortStep2PillsAZ(){
  document.querySelectorAll('#step-2 .pills').forEach(function(group){
    const pills = Array.from(group.querySelectorAll('.pill'));
    pills.sort(function(a,b){
      const ta = (a.textContent || '').replace(/👁|🙈/g,'').trim().toLowerCase();
      const tb = (b.textContent || '').replace(/👁|🙈/g,'').trim().toLowerCase();
      return ta.localeCompare(tb);
    });
    pills.forEach(function(p){ group.appendChild(p); });
  });
}

function prepareStep3BeforeReveal(){
  /*
   * Step 3 used to become visible first and rebuild 100ms later. Prepare
   * the lightweight overview while the step is still hidden so users never
   * see the stale/expanded layout flash before the current design appears.
   */
  try {
    if(
      document.body.classList.contains('um-kids-mode') &&
      (
        typeof v2Collections === 'undefined' ||
        !Array.isArray(v2Collections) ||
        v2Collections.length === 0
      ) &&
      typeof buildKidsSetupCollections === 'function'
    ){
      v2Collections = buildKidsSetupCollections();
      window.v2Collections = v2Collections;
      if(typeof window.syncKidsNickJrOption === 'function'){
        window.syncKidsNickJrOption();
      }
    }

    if(
      typeof isCollectionMobileLayout === 'function' &&
      isCollectionMobileLayout() &&
      typeof v2Collections !== 'undefined' &&
      Array.isArray(v2Collections)
    ){
      v2Collections.forEach(function(collection){
        if(!collection) return;
        collection.collapsed = true;
        (collection.folders || []).forEach(function(folder){
          if(folder) folder.collapsed = true;
        });
      });
    }

    document.body.classList.remove('s3-app-detail-mode');
    var appBackButton = document.getElementById('s3AppBackBtn');
    if(appBackButton) appBackButton.style.display = 'none';

    if(typeof renderCollections === 'function'){
      renderCollections();
      return true;
    }
  } catch(error){
    console.warn('[STEP3] pre-render failed; falling back after reveal', error);
  }
  return false;
}

function setStep(n){
  console.log('[S2-TRACE] setStep', {
    target:n,
    current:typeof currentStep !== 'undefined' ? currentStep : null,
    selected:Array.from(selected || []),
    hasF1:selected.has('sports_f1_fixtures')
  });

  if(
    n !== 2 &&
    typeof s2CancelLivePreviewWork === 'function'
  ){
    s2CancelLivePreviewWork();
  }

  // Clear 'active' from every wizard step by querying the DOM directly,
  // not just the one named by the currentStep variable — with three
  // separate wrappers layered onto window.setStep (preview button,
  // summary button, standalone-mode history sync) plus draft/OAuth
  // state restoration all calling this on page return, currentStep can
  // drift out of sync with which step element actually has the class,
  // leaving a stale step visible alongside the new one.
  document.querySelectorAll('.wizard-step.active').forEach(function(el){
    el.classList.remove('active');
  });

  var step3Prepared = n === 3 ? prepareStep3BeforeReveal() : false;
  document.getElementById('step-'+n).classList.add('active');
  currentStep = n;
  updateProgress();
  window.scrollTo({top:0, behavior:'smooth'});
  applyPendingAssetPick();
  if(n === 2) {
    updateDiscoveryCapabilityUi();
    setTimeout(sortStep2PillsAZ, 60);
    setTimeout(refreshPillEyeStates, 80);
    setTimeout(renderCustomCatalogList, 100);
    setTimeout(renderPublicMdbListList, 100);
    setTimeout(function(){
      Object.keys(window.catalogOverrides || {}).forEach(refreshCatalogOverrideBadge);
    }, 250);
    setTimeout(function(){ if(typeof s2Init==='function') s2Init(); }, 200);
  }
  if(n === 3) {
    updateDiscoveryCapabilityUi();
    window.requestAnimationFrame(function(){
      if(!step3Prepared && typeof renderCollections === 'function'){
        renderCollections();
      }
      if(typeof updateCounters === 'function'){
        updateCounters();
      }
      if(typeof s3InitStickyPresets === 'function'){
        s3InitStickyPresets();
      }
    });
  }
}

function refreshPillEyeStates(){
  document.querySelectorAll('.pill.selected').forEach(function(pill){
    const id = pill.dataset.id;
    const eye = pill.querySelector('.pill-eye');
    if(!eye) return;
    if(hidden.has(id)){
      eye.style.display = 'inline';
      eye.textContent = '🙈';
      eye.style.opacity = '1';
      pill.style.fontStyle = 'italic';
    } else {
      eye.style.display = 'inline';
      eye.textContent = '👁';
      eye.style.opacity = '0.9';
      pill.style.fontStyle = '';
    }
  });
}

function updateProgress(){
  const visibleStepOrder = [1, 2, 3, 4];
  const currentVisiblePosition = visibleStepOrder.indexOf(currentStep);
  visibleStepOrder.forEach(function(internalStep, visibleIndex){
    const visibleStep = visibleIndex + 1;
    const circle = document.getElementById('circle-'+visibleStep);
    const label = document.getElementById('label-'+visibleStep);
    if(circle){ circle.className = 'step-circle'; }
    if(label){ label.className = 'step-label'; }
    if(circle){
      if(visibleIndex < currentVisiblePosition){ circle.classList.add('done'); circle.textContent='✓'; if(label) label.classList.add('done'); }
      else if(internalStep === currentStep){ circle.classList.add('active'); circle.textContent=visibleStep; if(label) label.classList.add('active'); }
      else { circle.textContent=visibleStep; }
    }
    if(visibleStep < 4){
      const conn = document.getElementById('conn-'+visibleStep);
      if(conn) conn.className = 'step-connector' + (visibleIndex < currentVisiblePosition ? ' done' : '');
    }
    // Update sidebar nav
    const navItem = document.getElementById('nav-'+internalStep);
    const navCheck = document.getElementById('navcheck-'+internalStep);
    if(navItem){
      navItem.classList.remove('active');
      if(internalStep === currentStep) navItem.classList.add('active');
    }
    if(navCheck){
      navCheck.classList.remove('done');
      if(visibleIndex < currentVisiblePosition) navCheck.classList.add('done');
    }
  });
}
