function initGuidedSetup(){
  if(document.getElementById('guidedSetup')) return;

  const container = document.getElementById('advancedBuilderContainer');
  const insertAfter = document.getElementById('setupFormStart');
  if(!container || !insertAfter) return;

  const password = document.getElementById('password');
  const confirmPassword = document.getElementById('confirmPassword');
  const key = document.getElementById('mdblistKey');
  const tmdbKey = document.getElementById('tmdbKey');
  const language = document.getElementById('language');

  const rpdb = document.getElementById('rpdbKey');
  const tp = document.getElementById('tpKey');

  const trakt = document.getElementById('traktUser');
  const unreleased = document.getElementById('excludeUnreleased');
  const maxRating = document.getElementById('maxRating');

  const streamBlock = document.getElementById('advancedStreamBridgeBlock');

  function field(id){
    const el = document.getElementById(id);
    return el ? el.closest('.field-block') : null;
  }

  const guided = document.createElement('div');
  guided.id = 'guidedSetup';
  guided.className = 'guided-setup';

  function makeSection(id, title, sub){
    const card = document.createElement('div');
    card.className = 'guided-card';
    card.id = id;

    card.innerHTML = `
      <button type="button" class="guided-head" onclick="openGuidedSection('${id}')">
        <span>
          <div class="guided-title">${title}</div>
          <div class="guided-sub">${sub}</div>
        </span>
        <span class="guided-badge">${umT('setup.guidedPages.sectionLocked','Locked')}</span>
      </button>
      <div class="guided-body"></div>
    `;

    guided.appendChild(card);
    return card.querySelector('.guided-body');
  }

  const essentials = makeSection(
    'guidedEssentials',
    '1. Essentials',
    'Create the setup password, add at least one discovery provider, and choose metadata language.'
  );

  const posters = makeSection(
    'guidedPosters',
    '2. Posters',
    'Optional poster upgrades using RPDB or TOP Posters.'
  );

  const filters = makeSection(
    'guidedFilters',
    '3. Trakt & Filters',
    'Optional Trakt rows, unreleased-title filter, and age rating controls.'
  );

  const streams = makeSection(
    'guidedStreams',
    '4. Streams',
    'Enable Stream Bridge and add configured stream addons with the Stream Wizard.'
  );

  insertAfter.insertAdjacentElement('afterend', guided);

  // Hide old wrapper text that no longer fits the guided flow
  document.querySelectorAll('.page1-section-label,.page1-section-help,.optional-shell').forEach(el => {
    el.classList.add('guided-hidden-original');
  });

  // Move existing fields into guided sections
  [field('password'), field('mdblistKey'), field('tmdbKey'), field('language')].forEach(el => {
    if(el) essentials.appendChild(el);
  });

  [field('rpdbKey'), field('tpKey')].forEach(el => {
    if(el) posters.appendChild(el);
  });

  [field('traktUser'), field('excludeUnreleased'), field('animePresentationMode'), field('preserveKitsuIds'), field('hideWatched'), field('hideUnavailableStreams'), field('episodeReleaseDelayHours'), field('maxRating')].forEach(el => {
    if(el) filters.appendChild(el);
  });

  if(streamBlock) streams.appendChild(streamBlock);

  essentials.insertAdjacentHTML('beforeend', `
    <div class="guided-actions">
      <button type="button" class="guided-next" id="guidedEssentialsNext" onclick="openGuidedSection('guidedPosters')">Continue → Posters</button>
    </div>
  `);

  posters.insertAdjacentHTML('beforeend', `
    <div class="guided-actions">
      <button type="button" class="guided-skip" onclick="openGuidedSection('guidedFilters')">Skip</button>
      <button type="button" class="guided-next" onclick="openGuidedSection('guidedFilters')">Continue → Trakt & Filters</button>
    </div>
  `);

  filters.insertAdjacentHTML('beforeend', `
    <div class="guided-actions">
      <button type="button" class="guided-skip" onclick="openGuidedSection('guidedStreams')">Skip</button>
      <button type="button" class="guided-next" onclick="openGuidedSection('guidedStreams')">Continue → Streams</button>
    </div>
  `);

  streams.insertAdjacentHTML('beforeend', `
    <div class="guided-actions">
      <button type="button" class="guided-next" onclick="scrollToCatalogNext()">Done</button>
    </div>
  `);

  ['password','confirmPassword','mdblistKey','tmdbKey','language'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('input', updateGuidedSetup);
    if(el) el.addEventListener('change', updateGuidedSetup);
  });

  openGuidedSection('guidedEssentials');
  updateGuidedSetup();
}

function openGuidedSection(id){
  document.querySelectorAll('.guided-card').forEach(card => card.classList.remove('open'));
  const card = document.getElementById(id);
  if(card){
    card.classList.add('open');
    card.scrollIntoView({behavior:'smooth', block:'start'});
  }
}

function updateGuidedSetup(){
  const pass = (document.getElementById('password')?.value || '').trim();
  const confirm = (document.getElementById('confirmPassword')?.value || '').trim();
  const providers = getDiscoveryProviderState();

  const essentialsDone = pass && confirm && pass === confirm && providers.hasAnyDiscoveryProvider;

  const btn = document.getElementById('guidedEssentialsNext');
  if(btn) btn.disabled = false;

  setGuidedStatus('guidedEssentials', essentialsDone ? 'Complete' : 'Required', essentialsDone);
  setGuidedStatus('guidedPosters', 'Optional', false);
  setGuidedStatus('guidedFilters', 'Optional', false);
  setGuidedStatus('guidedStreams', 'Optional', false);
}

function setGuidedStatus(id, label, complete){
  const card = document.getElementById(id);
  if(!card) return;

  const badge = card.querySelector('.guided-badge');
  if(badge) badge.textContent = label;

  card.classList.toggle('complete', !!complete);
}

document.addEventListener('DOMContentLoaded', function(){
  setTimeout(initGuidedSetup, 80);
});


function scrollToCatalogNext(){
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => (b.textContent || '').includes('Next') && (b.textContent || '').includes('Catalogs'));

  if(btn){
    btn.scrollIntoView({behavior:'smooth', block:'center'});
  }
}


// --- Ultra MAX safety patch: restore missing liteAutoApplied ---
if (typeof liteAutoApplied === "undefined") {
  var liteAutoApplied = false;
}


// --- After import: sync guided UI ---
function refreshGuidedAfterImport(){
  try{
    updateGuidedSetup();

    const hasStreams = (getStoredStreamAddons() || []).length > 0;

    if(hasStreams){
      setGuidedStatus('guidedStreams', 'Ready', true);
      renderStreamAddonCards();
      openGuidedSection('guidedStreams');
    } else {
      openGuidedSection('guidedFilters');
    }

  }catch(e){
    console.warn("Guided refresh failed", e);
  }
}


function wrapGuidedPages23(){
  if(document.getElementById('guidedPage2Intro')) return;

  // PAGE 2 intro
  const step2 = document.getElementById('step-2');
  if(step2){
    const firstTitle = step2.querySelector('.section-title');
    if(firstTitle){
      const intro = document.createElement('div');
      intro.id = 'guidedPage2Intro';
      intro.className = 'guided-page-card';
      intro.innerHTML = `
        <div class="guided-page-step">${umT('setup.guidedPages.page2Intro.step','Step 2 · Catalog Builder')}</div>
        <div class="guided-page-title">${umT('setup.guidedPages.page2Intro.title','Choose what appears on the home screen')}</div>
        <div class="guided-page-help">
          ${umT('setup.guidedPages.page2Intro.help','Start with a preset, then fine tune the rows below. Keep it lean for speed, or go full beast mode if you want everything.')}
        </div>
      `;
      firstTitle.parentNode.insertBefore(intro, firstTitle);
    }

    const presetGrid = step2.querySelector('.step2-preset-grid');
    if(presetGrid && !presetGrid.closest('.guided-page-card')){
      const card = document.createElement('div');
      card.className = 'guided-page-card';
      card.innerHTML = `
        <div class="guided-page-step">${umT('setup.guidedPages.page2Preset.step','1 · Starting point')}</div>
        <div class="guided-page-title">${umT('setup.guidedPages.page2Preset.title','Pick a preset')}</div>
        <div class="guided-page-help">${umT('setup.guidedPages.page2Preset.help','This gives users a clean default before they start choosing individual rows.')}</div>
      `;
      presetGrid.parentNode.insertBefore(card, presetGrid.previousElementSibling || presetGrid);
      card.appendChild(presetGrid.previousElementSibling);
      card.appendChild(presetGrid);
    }

    const controls = step2.querySelector('.catalog-controls');
    if(controls && !controls.closest('.guided-page-card')){
      const card = document.createElement('div');
      card.className = 'guided-page-card';
      card.innerHTML = `
        <div class="guided-page-step">${umT('setup.guidedPages.page2Controls.step','2 · Fine tune')}</div>
        <div class="guided-page-title">${umT('setup.guidedPages.page2Controls.title','Search and edit rows')}</div>
        <div class="guided-page-help">${umT('setup.guidedPages.page2Controls.help','Search catalogs, select rows, or hide rows from the home screen while keeping them available inside Ultra MAX.')}</div>
      `;
      controls.parentNode.insertBefore(card, controls.previousElementSibling || controls);
      if(controls.previousElementSibling) card.appendChild(controls.previousElementSibling);
      card.appendChild(controls);
    }

    const nextBtn = step2.querySelector('#nextBtn, [data-next="step3"], .s2-nav-card-next');
    if(nextBtn && !nextBtn.closest('.guided-page-card')){
      const card = document.createElement('div');
      card.className = 'guided-page-card';
      card.innerHTML = `
        <div class="guided-page-step">${umT('setup.guidedPages.page2Next.step','3 · Continue')}</div>
        <div class="guided-page-title">${umT('setup.guidedPages.page2Next.title','Ready for collections?')}</div>
        <div class="guided-page-help">${umT('setup.guidedPages.page2Next.help','Once the home rows look right, continue and group them into Nuvio-style collections.')}</div>
      `;
      nextBtn.parentNode.insertBefore(card, nextBtn);
      card.appendChild(nextBtn);
    }
  }

  // PAGE 3 intro
  const step3 = document.getElementById('step-3');
  if(step3 && !document.getElementById('guidedPage3Intro')){
    const header = step3.querySelector('.builder-header');
    if(header){
      const intro = document.createElement('div');
      intro.id = 'guidedPage3Intro';
      intro.className = 'guided-page-card';
      intro.innerHTML = `
        <div class="guided-page-step">${umT('setup.guidedPages.page3Intro.step','Step 3 · Collections')}</div>
        <div class="guided-page-title">${umT('setup.guidedPages.page3Intro.title','Build the Nuvio collection layout')}</div>
        <div class="guided-page-help">
          ${umT('setup.guidedPages.page3Intro.help','Choose a display style, load preset collections, then edit folders, covers and GIFs before finalising.')}
        </div>
      `;
      header.parentNode.insertBefore(intro, header);
    }

    const viewMode = document.getElementById('nuvioViewMode');
    const viewBox = viewMode ? viewMode.closest('.result-section') : null;
    if(viewBox && !viewBox.closest('.guided-page-card')){
      const card = document.createElement('div');
      card.className = 'guided-page-card';
      card.innerHTML = `
        <div class="guided-page-step">${umT('setup.guidedPages.page3ViewMode.step','1 · Display style')}</div>
        <div class="guided-page-title">${umT('setup.guidedPages.page3ViewMode.title','Choose how collections appear')}</div>
        <div class="guided-page-help">${umT('setup.guidedPages.page3ViewMode.help','Tabbed Grid is the polished default. Grid and Rows are there if users prefer simpler layouts.')}</div>
      `;
      viewBox.parentNode.insertBefore(card, viewBox);
      card.appendChild(viewBox);
    }

    // GUIDED_DISABLED:     const presets = document.getElementById('presetsPanel');
    // GUIDED_DISABLED:     if(presets && !presets.closest('.guided-page-card')){
    // GUIDED_DISABLED:       const card = document.createElement('div');
    // GUIDED_DISABLED:       card.className = 'guided-page-card';
    // GUIDED_DISABLED:       card.innerHTML = `
    // GUIDED_DISABLED:         <div class="guided-page-step">2 · Presets</div>
    // GUIDED_DISABLED:         <div class="guided-page-title">Load collection packs</div>
    // GUIDED_DISABLED:         <div class="guided-page-help">Use preset packs like Streaming Services, Genres, Studios or Trakt to build fast.</div>
    // GUIDED_DISABLED:       `;
    // GUIDED_DISABLED:       presets.parentNode.insertBefore(card, presets);
    // GUIDED_DISABLED:       card.appendChild(presets);
    // GUIDED_DISABLED:     }
    // GUIDED_DISABLED: 
    // GUIDED_DISABLED:     const list = document.getElementById('collections-list');
    // GUIDED_DISABLED:     if(list && !list.closest('.guided-page-card')){
    // GUIDED_DISABLED:       const card = document.createElement('div');
    // GUIDED_DISABLED:       card.className = 'guided-page-card';
    // GUIDED_DISABLED:       card.innerHTML = `
    // GUIDED_DISABLED:         <div class="guided-page-step">3 · Edit</div>
    // GUIDED_DISABLED:         <div class="guided-page-title">Organise folders, covers and GIFs</div>
    // GUIDED_DISABLED:         <div class="guided-page-help">Fine tune collection names, folders, row contents and visuals before export.</div>
    // GUIDED_DISABLED:       `;
    // GUIDED_DISABLED:       list.parentNode.insertBefore(card, list);
    // GUIDED_DISABLED:       card.appendChild(list);
    // GUIDED_DISABLED:     }
  }
}
    // GUIDED_DISABLED: 
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(wrapGuidedPages23, 150);
});


function wrapCatalogSections(){
  const step2 = document.getElementById('step-2');
  if(!step2 || document.getElementById('guidedCatalogWrap')) return;

  // Find where categories start (Builder Mode is a good anchor)
  const builder = Array.from(step2.querySelectorAll('*'))
    .find(el => el.textContent && el.textContent.includes('Builder Mode'));

  if(!builder) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'guidedCatalogWrap';
  wrapper.className = 'guided-page-card';
  wrapper.innerHTML = `
    <div class="guided-page-step">${umT('setup.guidedPages.catalogWrap.step','3 · Choose content')}</div>
    <div class="guided-page-title">${umT('setup.guidedPages.catalogWrap.title','Pick what users can browse')}</div>
    <div class="guided-page-help">
      ${umT('setup.guidedPages.catalogWrap.help','Use Quick Picks for speed, or expand sections below for full control. More rows = more power, but also more load time.')}
    </div>
  `;

  // Move everything from builder onwards into this wrapper
  let current = builder.closest('.category') || builder.parentNode;
  const parent = current.parentNode;

  parent.insertBefore(wrapper, current);

  while(current && !current.classList?.contains('nav-btns') && !current.classList?.contains('wizard-step')){
    const next = current.nextElementSibling;
    wrapper.appendChild(current);
    current = next;
  }
}

document.addEventListener('DOMContentLoaded', function(){
  setTimeout(wrapCatalogSections, 200);
  // Post-wrap rescue: runs after wrapCatalogSections to move any trapped wizard-steps back out of step-2
  setTimeout(function(){
    var step2 = document.getElementById('step-2');
    if(!step2 || !step2.parentNode) return;
    var trapped = Array.from(step2.querySelectorAll('.wizard-step'));
    if(!trapped.length) return;
    var ref = step2.nextSibling;
    for(var i=0; i<trapped.length; i++){
      step2.parentNode.insertBefore(trapped[i], ref);
      ref = trapped[i].nextSibling;
    }
    console.log('Post-wrap rescue: moved', trapped.length, 'wizard-step(s) out of step-2');
  }, 300);
});


function makeStep2Accordion(){
  // Accordion bypassed — step 2 renders directly
  // Just open all category sections by default
  const step2 = document.getElementById('step-2');
  if(!step2) return;

  // Make sure all categories start closed (user opens what they want)
  // Categories are toggled by toggleCategory() on click — no changes needed
}

function openStep2Accordion(id){
  // No-op — accordion removed
}
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(makeStep2Accordion, 250);
});


function initStep3Safe(){
  const step3 = document.getElementById('step-3');
  if(!step3) return;

  const sections = step3.querySelectorAll('.section');

  sections.forEach((sec, i) => {
    if(sec.classList.contains('wrapped')) return;

    const title = sec.querySelector('.section-title')?.innerText || umT('setup.step3Safe.section','Section');

    const wrapper = document.createElement('div');
    wrapper.className = 'step3-safe';

    const head = document.createElement('div');
    head.className = 'step3-safe-head';
    head.innerHTML = `<span>${i+1}. ${title}</span><span>${umT('setup.step3Safe.open','Open')}</span>`;

    const body = document.createElement('div');
    body.className = 'step3-safe-body';

    sec.parentNode.insertBefore(wrapper, sec);
    body.appendChild(sec);

    wrapper.appendChild(head);
    wrapper.appendChild(body);

    sec.classList.add('wrapped');

    head.onclick = () => {
      wrapper.classList.toggle('open');
    };
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initStep3Safe, 300);
});
