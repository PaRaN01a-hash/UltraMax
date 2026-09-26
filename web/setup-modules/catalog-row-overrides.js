// ── PER-ROW SORT & FILTER OVERRIDES (Step 2 settings icon) ──────────
// Keyed by catalogId, applied server-side in catalog-handler-service.js
// (applyCatalogOverride) when building each row's TMDB request.
function getCatalogOverridesFromForm(){
  return (window.catalogOverrides && typeof window.catalogOverrides === 'object') ? window.catalogOverrides : {};
}

function openCatalogOverrideModal(catalogId){
  if(!window.catalogOverrides || typeof window.catalogOverrides !== 'object') {
    window.catalogOverrides = {};
  }
  catalogOverrideActiveId = catalogId;

  // Open the sheet first. Optional row-setting controls must never be able to
  // prevent the editor itself from appearing in Android WebView/app mode.
  var modal = document.getElementById('catalogOverrideModal');
  if(!modal) {
    throw new Error('catalogOverrideModal is missing');
  }
  modal.hidden = false;
  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('z-index', '1000001', 'important');
  modal.style.visibility = 'visible';
  modal.style.opacity = '1';
  modal.style.pointerEvents = 'auto';
  document.documentElement.classList.add('catalog-override-modal-open');
  document.body.classList.add('catalog-override-modal-open');

  var def = (typeof S2_DEFS !== 'undefined' && S2_DEFS[catalogId]) || {};
  var existing = window.catalogOverrides[catalogId] || {};
  var missing = [];

  function field(id){
    var el = document.getElementById(id);
    if(!el) missing.push(id);
    return el;
  }
  function setValue(id, value){
    var el = field(id);
    if(el) el.value = value;
  }
  function setChecked(id, value){
    var el = field(id);
    if(el) el.checked = !!value;
  }

  var nameEl = field('catalogOverrideRowName');
  if(nameEl) nameEl.textContent = def.name || catalogId;
  setValue('ovSortBy', existing.sortBy || '');
  setValue('ovMinRating', existing.minRating || 0);
  var minRatingVal = field('ovMinRatingVal');
  if(minRatingVal) minRatingVal.textContent = existing.minRating || 0;
  setValue('ovMinVotes', existing.minVotes || '');
  setValue('ovYearFrom', existing.yearFrom || '');
  setValue('ovYearTo', existing.yearTo || '');
  setChecked('ovExcludeAnimation', existing.excludeAnimation);
  setChecked('ovExcludeDocumentary', existing.excludeDocumentary);
  setChecked('ovExcludeTalk', existing.excludeTalk);

  var globalAdultEl = document.getElementById('includeAdult');
  var globalIncludeAdult = !!(globalAdultEl && globalAdultEl.checked);
  var adultRow = field('ovIncludeAdultRow');
  if(adultRow) adultRow.style.display = globalIncludeAdult ? 'flex' : 'none';
  setChecked('ovIncludeAdult', existing.includeAdult !== false);

  if(missing.length){
    console.warn('[Catalog Edit] Row Settings opened with missing controls:', missing.join(', '));
  }
  try {
    if(typeof s2HideRowPreview === 'function') s2HideRowPreview();
  } catch(error) {
    console.warn('[Catalog Edit] Could not hide row preview:', error);
  }
  try {
    if(typeof s2RefreshPreviewSuspension === 'function') s2RefreshPreviewSuspension();
  } catch(error) {
    console.warn('[Catalog Edit] Could not refresh preview suspension:', error);
  }
}

function closeCatalogOverrideModal(){
  const modal = document.getElementById('catalogOverrideModal');
  if(modal){
    modal.style.setProperty('display', 'none', 'important');
    modal.style.visibility = 'hidden';
    modal.style.pointerEvents = 'none';
  }
  document.documentElement.classList.remove('catalog-override-modal-open');
  document.body.classList.remove('catalog-override-modal-open');
  catalogOverrideActiveId = null;
  if(typeof s2RefreshPreviewSuspension === 'function') s2RefreshPreviewSuspension();
}

function refreshCatalogOverrideBadge(catalogId){
  const btn = document.getElementById('s2ov-btn-' + catalogId);
  if(!btn) return;
  const has = !!window.catalogOverrides[catalogId];
  btn.style.background = has ? 'rgba(123,47,255,.35)' : 'rgba(255,255,255,.08)';
  btn.style.color = has ? '#c9a8ff' : '#aaa';
}

function saveCatalogOverride(){
  if(!catalogOverrideActiveId) return;

  const override = {
    sortBy: document.getElementById('ovSortBy').value || '',
    minRating: Number(document.getElementById('ovMinRating').value) || 0,
    minVotes: Number(document.getElementById('ovMinVotes').value) || 0,
    yearFrom: document.getElementById('ovYearFrom').value.trim(),
    yearTo: document.getElementById('ovYearTo').value.trim(),
    excludeAnimation: document.getElementById('ovExcludeAnimation').checked,
    excludeDocumentary: document.getElementById('ovExcludeDocumentary').checked,
    excludeTalk: document.getElementById('ovExcludeTalk').checked,
    includeAdult: document.getElementById('ovIncludeAdult').checked
  };

  const isDefault =
    !override.sortBy && !override.minRating && !override.minVotes &&
    !override.yearFrom && !override.yearTo &&
    !override.excludeAnimation && !override.excludeDocumentary &&
    !override.excludeTalk &&
    override.includeAdult !== false;

  const id = catalogOverrideActiveId;
  if(isDefault){
    delete window.catalogOverrides[id];
  } else {
    window.catalogOverrides[id] = override;
  }

  refreshCatalogOverrideBadge(id);
  if(typeof saveDraftState === 'function') saveDraftState();
  closeCatalogOverrideModal();
}

function resetCatalogOverride(){
  if(!catalogOverrideActiveId) return;
  delete window.catalogOverrides[catalogOverrideActiveId];
  refreshCatalogOverrideBadge(catalogOverrideActiveId);
  if(typeof saveDraftState === 'function') saveDraftState();
  closeCatalogOverrideModal();
}
