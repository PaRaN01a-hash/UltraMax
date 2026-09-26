function s2ToggleCat(id){
  var card = document.getElementById('s2cat-'+id);
  if(card) card.classList.toggle('s2-open');
}

function s2ToggleChildCategory(parentId, childId, event){
  if(event){
    event.preventDefault();
    event.stopPropagation();
  }

  var child = document.getElementById(
    's2child-' + parentId + '-' + childId
  );

  if(child){
    child.classList.toggle('s2-child-open');
  }
}
function s2FilterSearch(query){
  var q = query.trim().toLowerCase();
  var pills = document.querySelectorAll('.s2-pill');
  var cats = document.querySelectorAll('.s2-cat');
  var families = document.querySelectorAll('.s2-family');

  if(!q){
    pills.forEach(function(p){ p.style.display = ''; });
    cats.forEach(function(c){ c.style.display = ''; c.classList.remove('s2-open'); });
    families.forEach(function(family){
      family.style.display = '';
      if(family.dataset.searchOpened === '1'){
        family.open = false;
        delete family.dataset.searchOpened;
      }
    });
    return;
  }

  cats.forEach(function(cat){
    var catPills = cat.querySelectorAll('.s2-pill');
    var categoryName = String((cat.querySelector('.s2-cat-name') || {}).textContent || '').toLowerCase();
    var categorySub = String((cat.querySelector('.s2-cat-sub') || {}).textContent || '').toLowerCase();
    var categoryMatch = categoryName.includes(q) || categorySub.includes(q);
    var anyMatch = false;

    catPills.forEach(function(pill){
      var id = pill.getAttribute('data-pid');
      var def = getStep2CatalogDefinition(id);
      var name = def ? def.name.toLowerCase() : '';
      var match = categoryMatch || name.includes(q);
      pill.style.display = match ? '' : 'none';
      if(match) anyMatch = true;
    });

    cat.style.display = anyMatch ? '' : 'none';
    if(anyMatch && !categoryMatch) cat.classList.add('s2-open');
    else cat.classList.remove('s2-open');
  });

  families.forEach(function(family){
    var familyName = String((family.querySelector('.s2-family-name') || {}).textContent || '').toLowerCase();
    var familySub = String((family.querySelector('.s2-family-sub') || {}).textContent || '').toLowerCase();
    var familyMatch = familyName.includes(q) || familySub.includes(q);
    var familyCats = Array.from(family.querySelectorAll('.s2-cat'));

    if(familyMatch){
      familyCats.forEach(function(cat){
        cat.style.display = '';
        cat.querySelectorAll('.s2-pill').forEach(function(pill){ pill.style.display = ''; });
      });
    }

    var anyVisible = familyMatch || familyCats.some(function(cat){
      return cat.style.display !== 'none';
    });

    family.style.display = anyVisible ? '' : 'none';
    if(anyVisible){
      if(!family.open) family.dataset.searchOpened = '1';
      family.open = true;
    }
  });
}

function s2SelectCat(catId, e){
  e.stopPropagation();
  var cat = S2_CATEGORIES.find(function(c){ return c.id===catId; });
  if(!cat) return;
  getStep2CategoryIds(cat).forEach(function(id){ selected.add(id); });
  s2UpdateAll();
  persistStep2State();
}

function s2ClearCat(catId, e){
  e.stopPropagation();
  var cat = S2_CATEGORIES.find(function(c){ return c.id===catId; });
  if(!cat) return;
  getStep2CategoryIds(cat).forEach(function(id){ selected.delete(id); hidden.delete(id); });
  s2UpdateAll();
  persistStep2State();
}

function s2TogglePill(id){
  console.log('[S2-TRACE] toggle BEFORE', {
    id:id,
    selected:Array.from(selected || []),
    hasId:selected.has(id)
  });

  if(selected.has(id)){ selected.delete(id); hidden.delete(id); }
  else selected.add(id);

  console.log('[S2-TRACE] toggle AFTER', {
    id:id,
    selected:Array.from(selected || []),
    hasId:selected.has(id)
  });

  s2UpdateAll();
  persistStep2State();
}

function s2RenderRaw(){
  var container = document.getElementById('s2RawPills');
  if(!container) return;
  container.innerHTML = '';
  s2SortIds('raw', Object.keys(S2_DEFS).filter(function(id){
    return !isRemovedMergedCatalogId(id) && isCatalogAvailableForDiscovery(id);
  })).forEach(function(id){
    var def = S2_DEFS[id];
    var t = def.type === 'movie' ? '🎬' : '📺';
    var pill = document.createElement('span');
    pill.className = 's2-pill';
    pill.id = 's2rawpill-' + id;
    pill.setAttribute('data-pid', id);
    pill.innerHTML = def.name + ' <span class="s2-pill-type">'+t+'</span>'
      + '<label class="s2-pill-hidden-cb" onclick="event.stopPropagation()">'
      + '<input type="checkbox" data-hid="'+id+'" onchange="s2ToggleHidden(this)" style="accent-color:var(--coral);width:10px;height:10px;">'
      + ' hidden</label>';
    pill.addEventListener('click', function(event){
      var target = event && event.target;
      if(target && typeof target.closest === 'function' && target.closest('[data-hid]')) return;
      if(event){
        event.preventDefault();
        event.stopPropagation();
      }
      s2TogglePill(id);
    });
    container.appendChild(pill);
  });
}


function s2ToggleHidden(cb){
  var id = cb.dataset.hid;
  if(!id) return;
  if(cb.checked){
    // Hidden means installed but omitted from Home. Keep the row selected so
    // it remains available to Ultra MAX search/collections after generation.
    selected.add(id);
    hidden.add(id);
  } else {
    hidden.delete(id);
  }
  persistStep2State();
  s2UpdateAll();
}

function s2ToggleCompactCatalogVisibility(id){
  var pill = document.getElementById('s2pill-' + id);
  var input = pill ? pill.querySelector('[data-hid="'+id+'"]') : null;
  if(!input) return;
  input.checked = !hidden.has(id);
  s2ToggleHidden(input);
}

function s2UpdatePillHiddenState(id){
  var isHidden = hidden.has(id);
  [
    document.getElementById('s2pill-' + id),
    document.getElementById('s2rawpill-' + id)
  ].forEach(function(pill){
    if(!pill) return;
    pill.classList.toggle('s2-hidden', isHidden);
    var cb = pill.querySelector('[data-hid]');
    if(cb) cb.checked = isHidden;
    var state = pill.querySelector('.catalog-compact-visibility-state');
    if(state) state.textContent = s2LocalText(isHidden ? 'hidden' : 'visible');
    var action = pill.querySelector('[data-catalog-visibility-action]');
    if(action){
      var def = getStep2CatalogDefinition(id) || {name:id};
      var actionText = s2LocalText(isHidden ? 'show' : 'hide');
      action.setAttribute('aria-label', actionText + ' ' + def.name);
      if(action.closest('.merged-row-actions')){
        action.setAttribute('title', actionText);
        action.innerHTML = mergedRowActionIcon(isHidden ? 'visibility' : 'visibility-hidden');
      }
      var label = action.querySelector('span');
      if(label) label.textContent = actionText;
    }
  });
}

var s2ReorderSortable = null;
var catalogOrder = [];

function normaliseCatalogOrder(selectedIds, existingOrder){
  var selectedList = Array.from(selectedIds || []).filter(function(id){
    return !isRemovedMergedCatalogId(id);
  });
  var selectedSet = new Set(selectedList);
  var seen = new Set();
  var result = [];

  (Array.isArray(existingOrder) ? existingOrder : []).forEach(function(id){
    if(selectedSet.has(id) && !seen.has(id)){
      seen.add(id);
      result.push(id);
    }
  });

  selectedList.forEach(function(id){
    if(id && !seen.has(id)){
      seen.add(id);
      result.push(id);
    }
  });

  return result;
}

function syncCatalogOrder(){
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
  return catalogOrder;
}

var s2AllHiddenDismissedSignature = null;

// English fallback for umT() — full translations for all supported locales
// live in i18n/*.json under "setup.step2Local.*". This table only feeds the
// umT(key, fallback) call below so text never goes blank before the
// dictionary loads.
var S2_LOCAL_EN_FALLBACK = {
  manageSelected:'Manage selected catalogs',
  showAllSelected:'Show all selected',
  showAllSelectedCopy:'Make every selected catalog visible on the home screen.',
  showAllSelectedTooltip:'Make every selected catalog visible on the home screen',
  hideAllSelected:'Hide all selected',
  hideAllSelectedCopy:'Keep catalogs selected for search, but hide their rows from home.',
  hideAllSelectedTooltip:'Keep selected catalogs for search, but hide their rows from home',
  clearAllSelected:'Clear all selected',
  clearAllSelectedCopy:'Remove every selected catalog from this setup.',
  clearAllSelectedTooltip:'Remove every selected catalog from this setup',
  allHiddenTitle:'All selected catalogues are hidden from the home screen.',
  allHiddenCopy:'They will remain available for search, but no Ultra MAX rows will appear.',
  keepHidden:'Keep Hidden',
  deleteMergedRow:'Delete merged row',
  removeMergedTitle:'Remove merged row?',
  removeMergedCopy:'This will remove “{name}” from this setup. The original catalogues used to create it will not be deleted.',
  removeRow:'Remove Row',
  restoreRemovedRows:'Restore removed rows',
  restoreMergedTitle:'Restore removed merged rows?',
  restoreMergedCopy:'This will restore the predefined merged rows previously removed from this setup. Deleted custom merged rows cannot be restored.',
  restoreRows:'Restore Rows',
  cancel:'Cancel',
  noMerged:'No merged catalogs yet.',
  edit:'Edit',
  show:'Show',
  hide:'Hide',
  visible:'Visible',
  hidden:'Hidden',
  movie:'Movie',
  series:'Series',
  mixed:'Mixed',
  delete:'Delete',
  preview:'Preview'
};

function s2LocalText(key, params){
  var fallback = S2_LOCAL_EN_FALLBACK[key] || key;
  var text = window.umT ? window.umT('setup.step2Local.' + key, fallback) : fallback;
  Object.keys(params || {}).forEach(function(name){
    text = text.split('{'+name+'}').join(String(params[name]));
  });
  return text;
}

function s2ApplyLocalCopy(root){
  if(window.umApplyTranslations) window.umApplyTranslations(root || document);
}

function s2AllSelectedHidden(){
  if(!selected || selected.size === 0) return false;
  return Array.from(selected).every(function(id){
    return hidden.has(id);
  });
}

function s2AllHiddenStateSignature(){
  return Array.from(selected || []).slice().sort().join('\u001f');
}

function s2ResetAllHiddenWarningDismissal(){
  s2AllHiddenDismissedSignature = null;
}

function s2RefreshAllHiddenWarning(){
  var warning = document.getElementById('s2AllHiddenWarning');
  if(!warning) return false;

  var allHidden = s2AllSelectedHidden();
  if(!allHidden){
    s2AllHiddenDismissedSignature = null;
    warning.style.display = 'none';
    return false;
  }

  var dismissed = s2AllHiddenDismissedSignature === s2AllHiddenStateSignature();
  warning.style.display = dismissed ? 'none' : 'flex';
  return !dismissed;
}

function s2ShowAllSelectedCatalogs(){
  Array.from(selected || []).forEach(function(id){
    hidden.delete(id);
    s2UpdatePillHiddenState(id);
    if(typeof clearHiddenStateFromPill === 'function'){
      clearHiddenStateFromPill(id);
    }
  });

  s2ResetAllHiddenWarningDismissal();
  s2UpdateAll();
  if(typeof updateCategoryCounts === 'function') updateCategoryCounts();
}

function s2DismissAllHiddenWarning(){
  if(!s2AllSelectedHidden()) return;
  s2AllHiddenDismissedSignature = s2AllHiddenStateSignature();
  s2RefreshAllHiddenWarning();
}

function s2ToggleReorder(){
  var body = document.getElementById('s2ReorderBody');
  var chev = document.getElementById('s2ReorderChev');
  if(!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(chev) chev.style.transform = open ? '' : 'rotate(180deg)';
  if(!open) s2BuildReorderList();
}

function s2ToggleCustomRows(){
  var body = document.getElementById('s2CustomRowsBody');
  var chev = document.getElementById('s2CustomRowsChev');
  if(!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(chev) chev.style.transform = open ? '' : 'rotate(180deg)';
  if(!open && typeof renderCustomCatalogList === 'function') renderCustomCatalogList();
  if(!open && typeof renderPublicMdbListList === 'function') renderPublicMdbListList();
}

function s2BuildReorderList(){
  var list = document.getElementById('s2ReorderList');
  if(!list) return;
  catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
  var ids = catalogOrder.slice();
  list.innerHTML = ids.map(function(id){
    var name = getCatalogLabel(id) || id;
    return '<div class="s2-reorder-item" data-id="'+id+'" style="display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border2);border-radius:8px;padding:8px 12px;cursor:grab;">'
      + '<span style="color:var(--muted);font-size:14px;flex-shrink:0;">≡</span>'
      + '<span class="s2-reorder-label" style="font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(name)+'</span>'
      + '</div>';
  }).join('');
  if(s2ReorderSortable) s2ReorderSortable.destroy();
  if(typeof Sortable !== 'undefined'){
    s2ReorderSortable = Sortable.create(list, {
      animation: 150,
      ghostClass: 's2-reorder-ghost',
      onEnd: function(){
        catalogOrder = Array.from(list.querySelectorAll('.s2-reorder-item')).map(function(el){ return el.dataset.id; });
        catalogOrder = normaliseCatalogOrder(selected, catalogOrder);
        persistStep2State();
      }
    });
  }
  // Names for raw numeric mdb_<id> catalogs not covered by S2_DEFS or the
  // legacy alias table are looked up async (mdblist.com) and patched in.
  ids.forEach(function(id){
    if(!/^mdb_\d+$/.test(id)) return;
    if(mdbNameCache[id]) return;
    s2ResolveMdbListNameAsync(id, function(resolved){
      var label = list.querySelector('.s2-reorder-item[data-id="'+id+'"] .s2-reorder-label');
      if(!label) return;
      var typeLabel = resolved.mediatype === 'movie' ? ' · Movies' : resolved.mediatype === 'series' ? ' · Series' : '';
      label.textContent = resolved.name + typeLabel;
    });
  });
}

function s2HideAll(){
  selected.forEach(function(id){
    hidden.add(id);
  });

  if(typeof saveHiddenState === 'function') saveHiddenState();
  s2UpdateAll();

  if(typeof saveDraftState === 'function') saveDraftState();
}

function s2UnhideAll(){
  hidden.clear();

  if(typeof saveHiddenState === 'function') saveHiddenState();
  s2UpdateAll();

  if(typeof saveDraftState === 'function') saveDraftState();
}

function s2ClearAll(){
  selected.clear();
  hidden.clear();
  document.querySelectorAll('.s2-preset').forEach(function(c){ c.classList.remove('s2-active'); });
  s2UpdateAll();
  persistStep2State();
}

function s2ToggleRaw(){
  s2RawVisible = !s2RawVisible;
  var sec = document.getElementById('s2Raw');
  var txt = document.getElementById('s2ShowAllText');
  var ico = document.getElementById('s2ShowAllIcon');
  if(sec) sec.style.display = s2RawVisible ? 'block' : 'none';
  if(txt) txt.textContent = s2RawVisible ? 'Hide catalogue browser' : 'Browse all catalogues';
  if(ico) ico.textContent = s2RawVisible ? '✕' : '⚙️';
}

function s2UpdateAll(){
  syncCatalogOrder();
  s2UpdatePills();
  s2UpdateCatBadges();
  s2UpdateCounter();
  s2UpdatePreview();
  s2RefreshAllHiddenWarning();
  // Reorder Rows is a live view of `selected`. If it is already open, keep
  // its DOM in sync immediately when a catalogue is unticked or cleared.
  var reorderBody = document.getElementById('s2ReorderBody');
  if(reorderBody && reorderBody.style.display !== 'none') s2BuildReorderList();
  // Also update the legacy counter elements if they exist
  try{ updateCounter(); }catch(e){}
  try{ updateCategoryCounts(); }catch(e){}
}

function s2UpdatePills(){
  document.querySelectorAll('.s2-pill').forEach(function(pill){
    var id = pill.id.replace('s2pill-','').replace('s2rawpill-','');
    if(selected.has(id)) pill.classList.add('s2-sel');
    else pill.classList.remove('s2-sel');
    if(pill.hasAttribute('aria-pressed')) pill.setAttribute('aria-pressed', selected.has(id) ? 'true' : 'false');
    var isHidden = hidden.has(id);
    pill.classList.toggle('s2-hidden', isHidden);
    var cb = pill.querySelector('[data-hid]');
    if(cb) cb.checked = isHidden;
    var state = pill.querySelector('.catalog-compact-visibility-state');
    if(state) state.textContent = s2LocalText(isHidden ? 'hidden' : 'visible');
    var action = pill.querySelector('[data-catalog-visibility-action]');
    if(action){
      var def = getStep2CatalogDefinition(id) || {name:id};
      action.setAttribute('aria-label', s2LocalText(isHidden ? 'show' : 'hide') + ' ' + def.name);
      var label = action.querySelector('span');
      if(label) label.textContent = s2LocalText(isHidden ? 'show' : 'hide');
    }
  });
}

function s2UpdateCatBadges(){
  S2_CATEGORIES.forEach(function(cat){
    var ids = getStep2CategoryIds(cat);
    var sel = ids.filter(function(id){ return selected.has(id); }).length;
    var badge = document.getElementById('s2catsel-'+cat.id);
    if(badge) badge.textContent = sel;
    var prog = document.getElementById('s2prog-'+cat.id);
    if(prog) prog.style.width = ids.length ? (sel/ids.length*100)+'%' : '0%';
  });

  s2UpdateChildCategoryBadges();
}

function s2UpdateChildCategoryBadges(){
  S2_CATEGORIES.forEach(function(cat){
    if(!Array.isArray(cat.children)) return;

    var parentIds = getStep2CategoryIds(cat);

    cat.children.forEach(function(child){
      var childIds = parentIds.filter(function(id){
        try{
          return child.filter(id);
        }catch(e){
          return false;
        }
      });

      var childWrap = document.getElementById(
        's2child-' + cat.id + '-' + child.id
      );

      if(childWrap){
        var childSelectedEl = childWrap.querySelector(
          ':scope > .s2-child-head .s2-child-selected'
        );

        if(childSelectedEl){
          childSelectedEl.textContent = childIds.filter(function(id){
            return selected.has(id);
          }).length;
        }
      }

      if(!Array.isArray(child.children)) return;

      child.children.forEach(function(grandchild){
        var grandchildIds = childIds.filter(function(id){
          try{
            return grandchild.filter(id);
          }catch(e){
            return false;
          }
        });

        var nestedWrap = document.getElementById(
          's2child-' + cat.id + '-' + child.id + '-' + grandchild.id
        );

        if(!nestedWrap) return;

        var nestedSelectedEl = nestedWrap.querySelector(
          ':scope > .s2-child-head .s2-child-selected'
        );

        if(nestedSelectedEl){
          nestedSelectedEl.textContent = grandchildIds.filter(function(id){
            return selected.has(id);
          }).length;
        }
      });
    });
  });
}

function s2UpdateCounter(){
  var count = selected.size;
  var el = document.getElementById('s2NavCount');
  if(el) el.textContent = count;
  var headerCount = document.getElementById('s2HeaderCount');
  if(headerCount) headerCount.textContent = count + (count === 1 ? ' row selected' : ' rows selected');
  var drawerCount = document.getElementById('s2SelectedDrawerCount');
  if(drawerCount) drawerCount.textContent = count + ' selected';
  var fab = document.getElementById('s2FabCount');
  if(fab) fab.textContent = count;
}

var S2_POSTER_IDS = {
  quickpicks:   ['tt0816692','tt1375666','tt0468569','tt15398776','tt6710474','tt2582802'],
  streaming:    ['tt15398776','tt5180504','tt7366338','tt2442560','tt3581920','tt2707408'],
  genres:       ['tt0110912','tt0137523','tt0245429','tt3783958','tt0099685','tt0407887'],
  'anime-discovery':['tt0245429','tt2560140','tt2098220','tt0877057'],
  themed:       ['tt0816692','tt1375666','tt0468569','tt1160419','tt15398776','tt5180504'],
  decades:      ['tt0111161','tt0068646','tt0071562','tt0050083','tt0108052','tt0137523'],
  collections:  ['tt0816692','tt4633694','tt1745960','tt6710474','tt0172495','tt2582802'],
  tvcollections:['tt0903747','tt0944947','tt3032476','tt2306299','tt1475582','tt0108778'],
  studios:      ['tt0816692','tt4633694','tt1745960','tt6710474','tt0172495','tt2582802'],
  networks:     ['tt0903747','tt0944947','tt3032476','tt2306299','tt1475582','tt0108778'],
  directors:    ['tt0816692','tt1375666','tt0468569','tt1160419','tt15398776','tt0137523'],
  actors:       ['tt0816692','tt1375666','tt0468569','tt1160419','tt15398776','tt0137523'],
  sports:       ['tt0248614','tt0306215','tt0353015','tt0439335'],
  trakt:        ['tt0111161','tt0068646','tt0071562','tt0468569','tt0050083','tt0108052'],
};
