var mergedCatalogs = [];
var removedMergedCatalogIds = new Set();
var mergedEditorId = null;
var mergedEditorSources = [];
var pendingMergedRemovalId = null;
var mergedRemovalReturnFocus = null;

function mergedDerivedIds(def){
  if(!def) return [];
  if(def.type === 'mixed'){
    var types = new Set((def.sources || []).map(function(source){ return source.type; }));
    return (types.has('movie') ? [def.id + '_movies'] : [])
      .concat(types.has('series') ? [def.id + '_series'] : []);
  }
  return def.type === 'movie' || def.type === 'series' ? [def.id] : [];
}

function isLegacyUserCreatedMergedCatalog(def){
  if(!def || typeof def !== 'object') return false;
  if(!/^merged_[0-9a-f]{16}$/i.test(String(def.id || ''))) return false;
  if(!Array.isArray(def.sources)) return false;
  if(def.type !== 'movie' && def.type !== 'series' && def.type !== 'mixed') return false;
  var builtIn = S2_DEFS && S2_DEFS[def.id];
  return !(builtIn && builtIn.handler === 'merged');
}

function isUserCreatedMergedCatalog(def){
  if(!def || def.userCreated === false) return false;
  return def.userCreated === true || isLegacyUserCreatedMergedCatalog(def);
}

function normaliseMergedCatalogDefinitions(value){
  if(!Array.isArray(value)) return [];
  return JSON.parse(JSON.stringify(value)).map(function(def){
    if(def && typeof def === 'object' && typeof def.userCreated === 'undefined' && isLegacyUserCreatedMergedCatalog(def)){
      def.userCreated = true;
    }
    return def;
  });
}

function findUserCreatedMergedCatalogForRow(id){
  return (mergedCatalogs || []).find(function(def){
    return isUserCreatedMergedCatalog(def) && mergedDerivedIds(def).includes(id);
  }) || null;
}

function isRemovedMergedCatalogId(id){
  return removedMergedCatalogIds.has(id);
}

function setRemovedMergedCatalogIds(value){
  removedMergedCatalogIds = new Set(
    Array.isArray(value)
      ? value.filter(function(id){ return typeof id === 'string' && id; })
      : []
  );
  removedMergedCatalogIds.forEach(function(id){
    if(typeof selected !== 'undefined' && selected) selected.delete(id);
    if(typeof hidden !== 'undefined' && hidden) hidden.delete(id);
  });
  if(typeof catalogOrder !== 'undefined' && Array.isArray(catalogOrder)){
    catalogOrder = catalogOrder.filter(function(id){ return !removedMergedCatalogIds.has(id); });
  }
}

function rerenderStep2CategoriesPreservingUi(){
  var openIds = Array.from(document.querySelectorAll('#s2CatsGrid .s2-cat.s2-open')).map(function(card){
    return card.id;
  });

  var openChildIds = Array.from(
    document.querySelectorAll(
      '#s2CatsGrid .s2-child-category.s2-child-open'
    )
  ).map(function(child){
    return child.id;
  });

  var search = document.getElementById('s2SearchInput');
  var query = search ? search.value : '';
  s2RenderCats();
  if(query.trim()){
    s2FilterSearch(query);
    return;
  }
  openIds.forEach(function(id){
    var card = document.getElementById(id);
    if(card) card.classList.add('s2-open');
  });

  openChildIds.forEach(function(id){
    var child = document.getElementById(id);
    if(child) child.classList.add('s2-child-open');
  });
}

function generateMergedCatalogId(){
  var bytes = new Uint8Array(8);
  if(window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
  else for(var i=0;i<bytes.length;i++) bytes[i] = Math.floor(Math.random()*256);
  var suffix = Array.from(bytes).map(function(value){ return value.toString(16).padStart(2,'0'); }).join('');
  var id = 'merged_' + suffix;
  return mergedCatalogs.some(function(def){ return def.id === id; }) ? generateMergedCatalogId() : id;
}

function getMergedSourceDefinitions(){
  var defsById = new Map();
  function addDefinition(rawId, def){
    if(!def) return;
    var sourceType = def.type === 'tv' ? 'series' : def.type;
    if(sourceType !== 'movie' && sourceType !== 'series') return;
    var id = normalizeCatalogId(rawId);
    if(!id || id.indexOf('merged_') === 0 || def.handler === 'merged') return;
    if(!defsById.has(id)){
      defsById.set(id, { id:id, name:def.name || id, type:sourceType });
    }
  }
  Object.keys(S2_DEFS || {}).forEach(function(id){
    addDefinition(id, S2_DEFS[id]);
  });
  (getCustomCatalogsFromForm() || []).concat(getCustomMdbListsFromForm() || []).forEach(function(def){
    if(!def || !def.id || def.enabled === false) return;
    addDefinition(def.id, def);
  });
  return Array.from(defsById.values()).sort(function(a,b){ return a.name.localeCompare(b.name); });
}

function mergedTypeLabel(type){
  return s2LocalText(type === 'movie' ? 'movie' : type === 'series' ? 'series' : 'mixed');
}

function toggleMergedCatalogs(){
  var body = document.getElementById('mergedCatalogsBody');
  var chev = document.getElementById('mergedCatalogsChev');
  if(!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(chev) chev.style.transform = open ? '' : 'rotate(180deg)';
  if(!open) renderMergedCatalogs();
}

function renderMergedCatalogs(){
  var list = document.getElementById('mergedCatalogList');
  if(!list) return;
  if(!mergedCatalogs.length){
    list.innerHTML = '<div class="s2-tool-panel-note">'+escapeHtml(s2LocalText('noMerged'))+'</div>';
    return;
  }
  list.innerHTML = mergedCatalogs.map(function(def){
    var removable = def.userCreated === true;
    var removableIds = mergedDerivedIds(def);
    var visible = removableIds.some(function(id){ return !hidden.has(id); });
    var removeLabel = s2LocalText('deleteMergedRow') + ' ' + def.name;
    return '<div class="merged-row">'
      + '<div class="merged-row-copy"><div class="merged-row-title">'+escapeHtml(def.name)+'</div>'
      + '<div class="merged-row-meta">'+mergedTypeLabel(def.type)+' · '+escapeHtml(def.blend)+' · '+def.sources.length+' source'+(def.sources.length===1?'':'s')+'</div></div>'
      + '<div class="merged-actions merged-row-actions-panel'+(removable ? '' : ' merged-row-actions-protected')+'"><button type="button" class="merged-btn" onclick="openMergedCatalogEditor(\''+def.id+'\')">'+mergedRowActionIcon('edit')+'<span>'+escapeHtml(s2LocalText('edit'))+'</span></button>'
      + '<button type="button" class="merged-btn" onclick="toggleMergedCatalogVisibility(\''+def.id+'\')">'+mergedRowActionIcon('visibility')+'<span>'+escapeHtml(s2LocalText(visible ? 'hide' : 'show'))+'</span></button>'
      + (removable
        ? '<button type="button" class="merged-btn danger" aria-label="'+escapeHtml(removeLabel)+'" onclick="requestRemoveMergedCatalog(\''+def.id+'\',this)">'+mergedRowActionIcon('delete')+'<span>'+escapeHtml(s2LocalText('delete'))+'</span></button>'
        : '')
      + '</div></div>';
  }).join('');
}

function toggleMergedCatalogVisibility(id){
  var def = (mergedCatalogs || []).find(function(item){ return item.id === id; });
  if(!def) return;
  var ids = mergedDerivedIds(def);
  var shouldHide = ids.some(function(rowId){ return !hidden.has(rowId); });
  ids.forEach(function(rowId){
    if(shouldHide) hidden.add(rowId);
    else hidden.delete(rowId);
  });
  renderMergedCatalogs();
  s2UpdateAll();
  persistStep2State();
}

function openMergedCatalogEditor(id){
  var editor = document.getElementById('mergedCatalogEditor');
  var error = document.getElementById('mergedEditorError');
  if(!editor) return;
  editor.style.display = 'block';
  if(error) error.textContent = '';
  try{
    var definitions = Array.isArray(mergedCatalogs) ? mergedCatalogs : [];
    var def = id ? definitions.find(function(item){ return item.id === id; }) : null;
    mergedEditorId = def ? def.id : null;
    mergedEditorSources = def ? JSON.parse(JSON.stringify(def.sources || [])) : [];
    var nameInput = document.getElementById('mergedName');
    var typeInput = document.getElementById('mergedType');
    var blendInput = document.getElementById('mergedBlend');
    var searchInput = document.getElementById('mergedSourceSearch');
    if(nameInput) nameInput.value = def ? def.name : '';
    if(typeInput) typeInput.value = def ? def.type : 'mixed';
    if(blendInput) blendInput.value = def ? def.blend : 'interleave';
    if(searchInput) searchInput.value = '';
    renderMergedEditorSources();
    renderMergedSourcePicker('');
  }catch(e){
    console.error('Could not open merged catalog editor', e);
    if(error) error.textContent = 'Could not load the catalog list. Refresh the page and try again.';
  }
  setTimeout(function(){
    try{ editor.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){}
    var input = document.getElementById('mergedName');
    if(input) input.focus({preventScroll:true});
  }, 0);
}

function cancelMergedCatalogEditor(){
  mergedEditorId = null;
  mergedEditorSources = [];
  var editor = document.getElementById('mergedCatalogEditor');
  if(editor) editor.style.display = 'none';
}

function mergedTypeChanged(){
  var type = document.getElementById('mergedType').value;
  if(type !== 'mixed'){
    mergedEditorSources = mergedEditorSources.filter(function(source){ return source.type === type; });
  }
  renderMergedEditorSources();
  renderMergedSourcePicker((document.getElementById('mergedSourceSearch')||{}).value || '');
}

function renderMergedEditorSources(){
  var list = document.getElementById('mergedSourceList');
  if(!list) return;
  if(!mergedEditorSources.length){
    list.innerHTML = umT('setup.step2.catalogTools.addAtLeastOneSourceOrder', '<div class="s2-tool-panel-note">Add at least one source. Order controls blend priority.</div>');
    return;
  }
  var sourceDefs = getMergedSourceDefinitions();
  list.innerHTML = mergedEditorSources.map(function(source,index){
    var def = sourceDefs.find(function(item){ return item.id === source.catalogId; });
    var name = def ? def.name : source.catalogId;
    return '<div class="merged-source"><span aria-hidden="true">≡</span>'
      + '<span class="merged-source-name">'+escapeHtml(name)+' <small>· '+mergedTypeLabel(source.type)+'</small></span>'
      + '<button type="button" class="merged-btn" aria-label="Move '+escapeHtml(name)+' up" onclick="moveMergedSource('+index+',-1)" '+(index===0?'disabled':'')+'>↑</button>'
      + '<button type="button" class="merged-btn" aria-label="Move '+escapeHtml(name)+' down" onclick="moveMergedSource('+index+',1)" '+(index===mergedEditorSources.length-1?'disabled':'')+'>↓</button>'
      + '<button type="button" class="merged-btn danger" aria-label="Remove '+escapeHtml(name)+'" onclick="removeMergedSource('+index+')">✕</button></div>';
  }).join('');
}

function renderMergedSourcePicker(query){
  var picker = document.getElementById('mergedSourcePicker');
  if(!picker) return;
  var count = document.getElementById('mergedSourceResultCount');
  var type = (document.getElementById('mergedType')||{}).value || 'movie';
  var normalized = String(query || '').trim().toLowerCase();
  var available = getMergedSourceDefinitions().filter(function(def){
    if(type !== 'mixed' && def.type !== type) return false;
    if(mergedEditorSources.some(function(source){ return source.catalogId === def.id; })) return false;
    return !normalized || def.name.toLowerCase().includes(normalized) || def.id.toLowerCase().includes(normalized);
  });
  if(count) count.textContent = available.length + (normalized ? ' result' : ' catalogue') + (available.length === 1 ? '' : 's');
  picker.innerHTML = available.map(function(def){
    return '<button type="button" role="option" class="merged-btn merged-picker-option" onclick="addMergedSource(\''+def.id+'\')">'
      + '<span>'+escapeHtml(def.name)+'</span><small>'+mergedTypeLabel(def.type)+'</small></button>';
  }).join('') || '<div class="s2-tool-panel-note">No compatible catalogs found.</div>';
}

function addMergedSource(id){
  if(mergedEditorSources.length >= 8){
    document.getElementById('mergedEditorError').textContent = umT('setup.misc.aMergedCatalogCanContainAt', 'A merged catalog can contain at most eight sources.');
    return;
  }
  var def = getMergedSourceDefinitions().find(function(item){ return item.id === id; });
  if(!def || id.indexOf('merged_') === 0) {
    document.getElementById('mergedEditorError').textContent = umT('setup.misc.thatSourceIsUnsupportedOrNo', 'That source is unsupported or no longer available.');
    return;
  }
  if(mergedEditorSources.some(function(source){ return source.catalogId === id; })) return;
  mergedEditorSources.push({ catalogId:def.id, type:def.type });
  document.getElementById('mergedEditorError').textContent = '';
  renderMergedEditorSources();
  renderMergedSourcePicker((document.getElementById('mergedSourceSearch')||{}).value || '');
}

function removeMergedSource(index){
  mergedEditorSources.splice(index,1);
  renderMergedEditorSources();
  renderMergedSourcePicker((document.getElementById('mergedSourceSearch')||{}).value || '');
}

function moveMergedSource(index,direction){
  var target = index + direction;
  if(target < 0 || target >= mergedEditorSources.length) return;
  var item = mergedEditorSources.splice(index,1)[0];
  mergedEditorSources.splice(target,0,item);
  renderMergedEditorSources();
}

function removeMergedReferences(def){
  var ids = [def.id, def.id+'_movies', def.id+'_series'];
  ids.forEach(function(id){ selected.delete(id); hidden.delete(id); });
  catalogOrder = (catalogOrder || []).filter(function(id){ return !ids.includes(id); });
}

function saveMergedCatalog(){
  var error = document.getElementById('mergedEditorError');
  var saveButton = document.getElementById('saveMergedCatalogButton');
  function fail(message, exception){
    if(error) error.textContent = message;
    if(saveButton){ saveButton.disabled = false; saveButton.textContent = 'Save'; }
    if(exception) console.error('Merged catalog save failed', exception);
    return false;
  }
  try{
    var nameInput = document.getElementById('mergedName');
    var typeInput = document.getElementById('mergedType');
    var blendInput = document.getElementById('mergedBlend');
    if(!nameInput || !typeInput || !blendInput) return fail('The merged catalog editor is not ready. Refresh and try again.');
    var name = String(nameInput.value || '').trim();
    var type = typeInput.value;
    var blend = blendInput.value;
    if(!name) return fail(umT('setup.misc.enterAName', 'Enter a name.'));
    if(!Array.isArray(mergedEditorSources) || !mergedEditorSources.length) return fail(umT('setup.misc.addAtLeastOneSource', 'Add at least one source.'));
    if(mergedEditorSources.length > 8) return fail(umT('setup.misc.aMergedCatalogCanContainAt2', 'A merged catalog can contain at most eight sources.'));
    if(type !== 'mixed' && mergedEditorSources.some(function(source){ return source.type !== type; })) return fail(umT('setup.misc.allSourcesMustMatchTheSelected', 'All sources must match the selected type.'));
    if(saveButton){ saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
    if(error) error.textContent = '';

    var existingIndex = mergedCatalogs.findIndex(function(def){ return def.id === mergedEditorId; });
    var old = existingIndex >= 0 ? mergedCatalogs[existingIndex] : null;
    var definition = {
      id: old ? old.id : generateMergedCatalogId(),
      name: name,
      type: type,
      blend: blend,
      sources: JSON.parse(JSON.stringify(mergedEditorSources)),
      userCreated: old ? isUserCreatedMergedCatalog(old) : true
    };

    if(old) removeMergedReferences(old);
    if(existingIndex >= 0) mergedCatalogs.splice(existingIndex, 1, definition);
    else mergedCatalogs.push(definition);

    mergedDerivedIds(definition).forEach(function(id){
      selected.add(id);
      hidden.delete(id);
      if(!catalogOrder.includes(id)) catalogOrder.push(id);
    });

    // Commit the draft while the editor still exists. A later repaint must not
    // be able to make the Save click look like a no-op.
    persistStep2State();
    if(typeof saveDraftState === 'function') saveDraftState();

    var mergedBody = document.getElementById('mergedCatalogsBody');
    if(mergedBody) mergedBody.style.display = 'block';
    renderMergedCatalogs();
    cancelMergedCatalogEditor();

    try{
      rerenderStep2CategoriesPreservingUi();
      s2UpdateAll();
    }catch(repaintError){
      console.error('Merged catalog saved but Step 2 could not repaint', repaintError);
    }
    renderMergedCatalogs();
    if(typeof showBanner === 'function') showBanner('Merged catalog saved: ' + name, 'success');
    return true;
  }catch(e){
    return fail('Could not save this merged catalog. Please try again.', e);
  }finally{
    if(saveButton && saveButton.isConnected){ saveButton.disabled = false; saveButton.textContent = 'Save'; }
  }
}

function requestRemoveMergedCatalog(id, trigger){
  var custom = (mergedCatalogs || []).find(function(def){
    return def.id === id || mergedDerivedIds(def).includes(id);
  }) || null;
  var staticMerged = !!(S2_DEFS[id] && S2_CATEGORIES.some(function(category){
    return category.id === 'merged' && category.filter(id);
  }));
  if(!custom && !staticMerged) return;
  var modal = document.getElementById('mergedRemoveConfirm');
  if(!modal) return;
  pendingMergedRemovalId = id;
  mergedRemovalReturnFocus = trigger || document.activeElement;
  document.getElementById('mergedRemoveConfirmTitle').textContent = s2LocalText('removeMergedTitle');
  document.getElementById('mergedRemoveConfirmCopy').textContent = s2LocalText('removeMergedCopy', {
    name:custom ? custom.name : S2_DEFS[id].name
  });
  document.getElementById('mergedRemoveConfirmButton').textContent = s2LocalText('removeRow');
  modal.hidden = false;
  s2HideRowPreview();
  s2RefreshPreviewSuspension();
  if(typeof umTrapFocus === 'function') umTrapFocus(modal);
  document.getElementById('mergedRemoveCancel').focus();
}

function requestRestoreRemovedMergedRows(trigger){
  if(!removedMergedCatalogIds.size) return;
  var modal = document.getElementById('mergedRemoveConfirm');
  if(!modal) return;
  pendingMergedRemovalId = '__restore_removed_merged_rows__';
  mergedRemovalReturnFocus = trigger || document.activeElement;
  document.getElementById('mergedRemoveConfirmTitle').textContent = s2LocalText('restoreMergedTitle');
  document.getElementById('mergedRemoveConfirmCopy').textContent = s2LocalText('restoreMergedCopy');
  document.getElementById('mergedRemoveConfirmButton').textContent = s2LocalText('restoreRows');
  modal.hidden = false;
  s2HideRowPreview();
  s2RefreshPreviewSuspension();
  if(typeof umTrapFocus === 'function') umTrapFocus(modal);
  document.getElementById('mergedRemoveCancel').focus();
}

function cancelRemoveMergedCatalog(){
  var modal = document.getElementById('mergedRemoveConfirm');
  if(modal) modal.hidden = true;
  s2RefreshPreviewSuspension();
  pendingMergedRemovalId = null;
  var target = mergedRemovalReturnFocus;
  mergedRemovalReturnFocus = null;
  if(target && target.isConnected) target.focus();
}

function confirmRemoveMergedCatalog(){
  if(pendingMergedRemovalId === '__restore_removed_merged_rows__'){
    setRemovedMergedCatalogIds([]);
    pendingMergedRemovalId = null;
    mergedRemovalReturnFocus = null;
    document.getElementById('mergedRemoveConfirm').hidden = true;
    s2RefreshPreviewSuspension();
    rerenderStep2CategoriesPreservingUi();
    s2RenderRaw();
    s2UpdateAll();
    persistStep2State();
    var mergedCard = document.getElementById('s2cat-merged');
    if(mergedCard) mergedCard.focus();
    return;
  }
  var rowId = pendingMergedRemovalId;
  var index = mergedCatalogs.findIndex(function(def){
    return def.id === rowId || mergedDerivedIds(def).includes(rowId);
  });
  var custom = index >= 0 ? mergedCatalogs[index] : null;
  var staticMerged = !!(S2_DEFS[rowId] && S2_CATEGORIES.some(function(category){
    return category.id === 'merged' && category.filter(rowId);
  }));
  if(!custom && !staticMerged){
    cancelRemoveMergedCatalog();
    return;
  }
  var ids = custom ? mergedDerivedIds(custom) : [rowId];
  if(custom) removeMergedReferences(custom);
  else {
    removedMergedCatalogIds.add(rowId);
    selected.delete(rowId);
    hidden.delete(rowId);
    catalogOrder = (catalogOrder || []).filter(function(id){ return id !== rowId; });
  }
  ids.forEach(function(id){
    if(window.catalogOverrides) delete window.catalogOverrides[id];
    Object.keys(s2LivePreviewCache || {}).forEach(function(key){
      if(key.endsWith('|'+id)) delete s2LivePreviewCache[key];
    });
    Object.keys(s2LivePreviewPending || {}).forEach(function(key){
      if(key.endsWith('|'+id)) delete s2LivePreviewPending[key];
    });
  });
  s2HideRowPreview();
  if(custom && mergedEditorId === custom.id) cancelMergedCatalogEditor();
  if(typeof catalogOverrideActiveId !== 'undefined' && ids.includes(catalogOverrideActiveId)
    && typeof closeCatalogOverrideModal === 'function') closeCatalogOverrideModal();
  if(custom) mergedCatalogs.splice(index,1);
  pendingMergedRemovalId = null;
  mergedRemovalReturnFocus = null;
  document.getElementById('mergedRemoveConfirm').hidden = true;
  s2RefreshPreviewSuspension();
  renderMergedCatalogs();
  rerenderStep2CategoriesPreservingUi();
  s2RenderRaw();
  s2UpdateAll();
  persistStep2State();
  if(typeof updateCategoryCounts === 'function') updateCategoryCounts();
  if(typeof s2BuildReorderList === 'function') s2BuildReorderList();
  var focusTarget = document.getElementById('addMergedCatalogButton');
  if(focusTarget) focusTarget.focus();
}

function deleteMergedCatalog(id){
  requestRemoveMergedCatalog(id, document.activeElement);
}

document.addEventListener('DOMContentLoaded', function(){
  var addButton = document.getElementById('addMergedCatalogButton');
  if(addButton && !addButton.dataset.mergedBound){
    addButton.dataset.mergedBound = '1';
    addButton.addEventListener('click', function(event){
      if(typeof window.openMergedCatalogEditor === 'function' && !document.getElementById('mergedCatalogEditor')?.offsetParent){
        event.preventDefault();
        window.openMergedCatalogEditor();
      }
    });
  }
});

document.addEventListener('keydown', function(event){
  var modal = document.getElementById('mergedRemoveConfirm');
  if(event.key === 'Escape' && modal && !modal.hidden){
    event.preventDefault();
    cancelRemoveMergedCatalog();
  }
});
