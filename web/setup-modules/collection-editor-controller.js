function updateBuilderRecommendation(){
  const box = document.getElementById('builderRecommendation');
  if(box) box.style.display = 'block';
}

function togglePresets(){
  const p = document.getElementById('presetsPanel');
  if(!p) return;
  p.style.display = (!p.style.display || p.style.display === 'none') ? 'block' : 'none';
}

function updateCounters(){
  const coll = document.getElementById('collCount');
  const fold = document.getElementById('folderCount');
  const header = document.getElementById('s3HeaderCount');
  const workspace = document.getElementById('s3WorkspaceCount');

  let folderTotal = v2Collections.reduce(function(sum,c){
    return sum + ((c.folders || []).length);
  },0);

  const collectionTotal = v2Collections.length;
  if(coll) coll.textContent = collectionTotal;
  if(fold) fold.textContent = folderTotal;
  if(header) header.textContent = collectionTotal + (collectionTotal === 1 ? ' collection' : ' collections');
  if(workspace){
    workspace.textContent =
      collectionTotal + (collectionTotal === 1 ? ' collection' : ' collections') +
      ' · ' +
      folderTotal + (folderTotal === 1 ? ' folder' : ' folders');
  }
}


function importCollectionsJSON(event){
  const file = event.target.files && event.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = JSON.parse(e.target.result);
      const collections = Array.isArray(data) ? data : (data.collections || []);
      if(!collections.length){ showBanner(umT('setup.collectionEditor.noCollectionsFoundInThatFile', 'No collections found in that file.'), 'error'); return; }
      v2Collections = normalizeImportedCollections(collections); window.v2Collections = v2Collections;
      renderCollections();
      showBanner('✅ ' + collections.length + ' collections imported! Edit them below.', 'success');
    }catch(err){
      showBanner(umT('setup.collectionEditor.invalidJson', '❌ Invalid JSON: ') + err.message, 'error');
    }finally{
      event.target.value = '';
    }
  };
  reader.readAsText(file);
}

var _renderCollTimeout = null;
var _knownMobileCollectionIds = new Set();
var _knownMobileFolderIds = new Set();
var _collectionVisualsOpen = new Set();

// English fallback for umT() — full translations for all supported locales
// live in i18n/*.json under "setup.collectionEditor.*".
var COLLECTION_EDITOR_EN_FALLBACK = {
  folders:'folders', folder:'folder', rows:'rows', row:'row',
  addFolder:'+ Folder', rename:'Rename', duplicate:'Duplicate', remove:'Remove',
  editCollection:'Edit collection', collectionActions:'Collection actions', expandCollection:'Expand collection',
  collapseCollection:'Collapse collection', expandFolder:'Expand folder',
  collapseFolder:'Collapse folder', visuals:'Visuals', coverSet:'Cover set',
  noCover:'No cover', gifOn:'GIF on', gifOff:'GIF off', coverImage:'Cover Image',
  focusGif:'Focus GIF', tileShape:'Tile Shape', landscape:'Landscape',
  portrait:'Portrait', browse:'Browse', noGif:'No GIF', noRows:'No rows added yet',
  searchRows:'Search rows to add…', selectRow:'Select a row to add…',
  addRow:'+ Add Row', removeRow:'Remove row', dragCollection:'Drag collection to reorder',
  dragFolder:'Drag folder to reorder', expandVisuals:'Expand visuals',
  collapseVisuals:'Collapse visuals', heroBackdrop:'Hero Backdrop',
  heroHelper:'Wide background image shown behind the collection header in supported Nuvio layouts.',
  noHero:'No hero backdrop set', backdropSet:'Backdrop set', clearBackdrop:'Clear backdrop'
};

function collectionEditorText(key){
  var fallback = COLLECTION_EDITOR_EN_FALLBACK[key] || key;
  return window.umT ? window.umT('setup.collectionEditor.' + key, fallback) : fallback;
}

function isCollectionMobileLayout(){
  return document.documentElement.classList.contains('um-app-mode')
    || document.body.classList.contains('um-app-mode')
    || window.matchMedia('(max-width: 700px)').matches;
}

function renderCollectionsDebounced(options){
  clearTimeout(_renderCollTimeout);
  _renderCollTimeout = setTimeout(function(){
    renderCollections(options || {});
  }, 80);
}

function destroyCollectionSortables(){
  if(v2CollSortable){
    try { v2CollSortable.destroy(); } catch(_error) {}
    v2CollSortable = null;
  }

  if(Array.isArray(v2FolderSortables)){
    v2FolderSortables.forEach(function(instance){
      if(!instance || typeof instance.destroy !== 'function') return;
      try { instance.destroy(); } catch(_error) {}
    });
  }
  v2FolderSortables = [];
}

function renderCollections(options){
  var renderOptions = options || {};
  ensureCollectionIdentities(v2Collections);
  var mobileLayout = isCollectionMobileLayout();
  if(mobileLayout){
    v2Collections.forEach(function(collection){
      var collectionKey=String(collection.id || '');
      if(!_knownMobileCollectionIds.has(collectionKey)) collection.collapsed = true;
      _knownMobileCollectionIds.add(collectionKey);
      (collection.folders || []).forEach(function(folder){
        var folderKey=collectionKey+'::'+String(folder.id || '');
        if(!_knownMobileFolderIds.has(folderKey)) folder.collapsed = true;
        _knownMobileFolderIds.add(folderKey);
      });
    });
  }
  const list=document.getElementById('collections-list');
  const empty=document.getElementById('empty-state');
  if(!list||!empty) return;

  // Tear down all drag/drop controllers while their DOM nodes still exist.
  // Replacing innerHTML first leaves Sortable's document/touch listeners
  // orphaned and they accumulate across repeated Step 3 edits.
  destroyCollectionSortables();

  const query=((document.getElementById('collSearch')||{}).value||'').toLowerCase().trim();
  const filtered=v2Collections.map(function(c,i){return{c:c,i:i};}).filter(function(obj){
    if(!query) return true;
    if(obj.c.title&&obj.c.title.toLowerCase().includes(query)) return true;
    return (obj.c.folders||[]).some(function(f){return f.title&&f.title.toLowerCase().includes(query);});
  });
  if(v2Collections.length===0){
    list.innerHTML='';empty.style.display='block';
    updateCounters();updateCounter();updateCategoryCounts();return;
  }
  empty.style.display='none';
  list.innerHTML=filtered.map(function(obj){
    var c=obj.c,i=obj.i;
    var firstCover=(c.folders||[]).map(function(f){return f.coverImageUrl;}).find(function(u){return u&&u.trim();});
    var fc=(c.folders||[]).length,rc=countUltraMaxCollectionRows(c);
    var collectionBodyId='collection-body-'+i;
    var collectionStateLabel=collectionEditorText(c.collapsed?'expandCollection':'collapseCollection');
    var html='<article class="collection-card coll-card'+(c.collapsed?' coll-collapsed':' is-expanded')+'" data-idx="'+i+'">'
      +'<span class="collection-drag-handle drag-handle coll-drag" title="'+escapeHtml(collectionEditorText('dragCollection'))+'" aria-label="'+escapeHtml(collectionEditorText('dragCollection'))+'"><svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/></svg></span>'
      +'<button type="button" class="collection-summary coll-card-header" onclick="toggleCollectionCollapse('+i+')" aria-expanded="'+(!c.collapsed)+'" aria-controls="'+collectionBodyId+'" aria-label="'+escapeHtml(collectionStateLabel+': '+(c.title||''))+'">'
      +'<span class="collection-drag-spacer" aria-hidden="true"></span>'
      +(firstCover?'<img class="collection-thumbnail coll-card-thumb" src="'+escapeHtml(firstCover)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'<span class="collection-thumbnail coll-card-thumb-empty" aria-hidden="true">◇</span>')
      +'<span class="collection-summary-content"><span class="collection-title coll-card-title">'+escapeHtml(c.title)+'</span>'
      +'<span class="collection-meta coll-card-meta">'+fc+' '+collectionEditorText(fc===1?'folder':'folders')+' &middot; '+rc+' '+collectionEditorText(rc===1?'row':'rows')+'</span></span>'
      +'<span class="collection-chevron" aria-hidden="true">›</span></button>';
    if(!c.collapsed){
    html+='<div class="collection-body coll-card-body" id="'+collectionBodyId+'">'
      +'<div class="collection-action-toolbar" role="toolbar" aria-label="'+escapeHtml(collectionEditorText('collectionActions'))+'">'
      +'<button type="button" class="collection-action-button global-btn" onclick="addFolder('+i+')">'+collectionEditorText('addFolder')+'</button>'
      +'<button type="button" class="collection-action-button global-btn" onclick="renameCollection('+i+')">'+collectionEditorText('rename')+'</button>'
      +'<button type="button" class="collection-action-button global-btn" onclick="duplicateCollection('+i+')">'+collectionEditorText('duplicate')+'</button>'
      +'<button type="button" class="collection-action-button collection-action-remove global-btn" onclick="removeCollection('+i+',this)">'+collectionEditorText('remove')+'</button></div>';
      (c.folders||[]).forEach(function(f,fi){
        var avail=Array.from(selected||[]).filter(function(id){return !(f.rows||[]).includes(id);});
        var folderOpen=f.collapsed!==true;
        var folderBodyId='folder-body-'+i+'-'+fi;
        var visualsKey=String(c.id||i)+'::'+String(f.id||fi);
        var visualsOpen=_collectionVisualsOpen.has(visualsKey) || (!mobileLayout && !_collectionVisualsOpen.has('closed:'+visualsKey));
        var shape=f.tileShape==='PORTRAIT'?'PORTRAIT':'LANDSCAPE';
        var visualSummary=(f.coverImageUrl?collectionEditorText('coverSet'):collectionEditorText('noCover'))+' · '+(f.heroBackdropUrl?collectionEditorText('backdropSet'):collectionEditorText('noHero'))+' · '+collectionEditorText(shape==='PORTRAIT'?'portrait':'landscape')+' · '+collectionEditorText(f.focusGifEnabled?'gifOn':'gifOff');
        html+='<section class="folder-card folder-block'+(folderOpen?' is-expanded':'')+'" data-fidx="'+fi+'">'
          +'<button type="button" class="folder-summary folder-header" onclick="toggleFolderCollapse('+i+','+fi+')" aria-expanded="'+folderOpen+'" aria-controls="'+folderBodyId+'" aria-label="'+escapeHtml(collectionEditorText(folderOpen?'collapseFolder':'expandFolder')+': '+(f.title||''))+'">'
          +'<span class="folder-drag-handle drag-handle folder-drag" title="'+escapeHtml(collectionEditorText('dragFolder'))+'" aria-label="'+escapeHtml(collectionEditorText('dragFolder'))+'">⠿</span>'
          +(f.coverImageUrl&&f.coverImageUrl.trim()?'<img class="folder-thumbnail folder-thumb" src="'+escapeHtml(f.coverImageUrl)+'" alt="" onerror="this.style.display=\'none\'">':'<span class="folder-thumbnail folder-thumb-empty" aria-hidden="true">◇</span>')
          +'<span class="folder-summary-content"><span class="folder-title">'+escapeHtml(f.title)+'</span><span class="folder-meta">'+(f.rows||[]).length+' '+collectionEditorText((f.rows||[]).length===1?'row':'rows')+'</span></span>'
          +'<span class="folder-chevron" aria-hidden="true">›</span></button>';
        if(folderOpen){
          html+='<div class="folder-body" id="'+folderBodyId+'">'
            +'<div class="folder-action-toolbar" role="toolbar" aria-label="'+escapeHtml(collectionEditorText('collectionActions'))+'">'
            +'<button type="button" class="global-btn" onclick="renameFolder('+i+','+fi+')">'+collectionEditorText('rename')+'</button>'
            +'<button type="button" class="global-btn collection-action-remove" onclick="removeFolder('+i+','+fi+',this)">'+collectionEditorText('remove')+'</button></div>'
            +'<section class="collection-subsection collection-visuals'+(visualsOpen?' is-expanded':'')+'">'
            +'<button type="button" class="collection-subsection-header" onclick="toggleCollectionVisuals(\''+escapeHtml(visualsKey)+'\')" aria-expanded="'+visualsOpen+'" aria-controls="visuals-body-'+i+'-'+fi+'" aria-label="'+escapeHtml(collectionEditorText(visualsOpen?'collapseVisuals':'expandVisuals'))+'">'
            +'<span><strong>'+collectionEditorText('visuals')+'</strong><small class="collection-subsection-summary">'+visualSummary+'</small></span><span class="collection-subsection-chevron" aria-hidden="true">›</span></button>'
            +(visualsOpen?'<div class="collection-subsection-body" id="visuals-body-'+i+'-'+fi+'">'
            +'<div class="visual-control cover-image-control"><span class="visual-control-label">'+collectionEditorText('coverImage')+'</span>'
            +(f.coverImageUrl&&f.coverImageUrl.trim()?'<img class="visual-preview cover-image-preview" src="'+escapeHtml(f.coverImageUrl)+'" alt="" onerror="this.style.display=\'none\'">':'<div class="visual-preview visual-preview-empty">'+collectionEditorText('noCover')+'</div>')
            +'<div class="compact-file-control"><input type="text" value="'+escapeHtml(f.coverImageUrl||'')+'" placeholder="Paste URL…" oninput="updateFolderCover('+i+','+fi+',this.value)"><button type="button" class="global-btn" onclick="openAssetLibrary('+i+','+fi+',\'cover\')">'+collectionEditorText('browse')+'</button></div></div>'
            +'<div class="visual-control collection-hero-backdrop"><span class="visual-control-label">'+collectionEditorText('heroBackdrop')+'</span><small class="collection-hero-helper">'+collectionEditorText('heroHelper')+'</small>'
            +(f.heroBackdropUrl&&f.heroBackdropUrl.trim()?'<img class="visual-preview collection-hero-preview" src="'+escapeHtml(f.heroBackdropUrl)+'" alt="'+escapeHtml(collectionEditorText('heroBackdrop'))+'" loading="lazy" onerror="this.style.display=\'none\'">':'<div class="collection-hero-empty">'+collectionEditorText('noHero')+'</div>')
            +'<div class="collection-hero-controls compact-file-control"><input type="text" value="'+escapeHtml(f.heroBackdropUrl||'')+'" placeholder="Paste URL…" oninput="updateFolderHero('+i+','+fi+',this.value)"><button type="button" class="global-btn" onclick="openAssetLibrary('+i+','+fi+',\'hero\')" aria-label="'+escapeHtml(collectionEditorText('browse')+' '+collectionEditorText('heroBackdrop'))+'">'+collectionEditorText('browse')+'</button>'
            +(f.heroBackdropUrl?'<button type="button" class="global-btn collection-hero-clear" onclick="clearFolderHero('+i+','+fi+')" aria-label="'+escapeHtml(collectionEditorText('clearBackdrop'))+'">'+collectionEditorText('clearBackdrop')+'</button>':'')+'</div></div>'
            +'<div class="visual-control focus-gif-control"><label class="focus-gif-toggle"><strong>'+collectionEditorText('focusGif')+'</strong><span>'+collectionEditorText(f.focusGifEnabled?'gifOn':'gifOff')+'</span><input type="checkbox" '+(f.focusGifEnabled?'checked':'')+' onchange="toggleFolderGif('+i+','+fi+',this.checked)"></label>'
            +(f.focusGifEnabled?'<div class="focus-gif-enabled">'+(f.focusGifUrl?'<img class="visual-preview focus-gif-preview" src="'+escapeHtml(f.focusGifUrl)+'" alt="">':'<div class="visual-preview visual-preview-empty">'+collectionEditorText('noGif')+'</div>')+'<div class="compact-file-control"><input type="text" value="'+escapeHtml(f.focusGifUrl||'')+'" placeholder="Paste GIF URL…" oninput="updateFolderGif('+i+','+fi+',this.value)"><button type="button" class="global-btn" onclick="openAssetLibrary('+i+','+fi+',\'gif\')">'+collectionEditorText('browse')+'</button></div></div>':'')
            +'</div><div class="visual-control tile-shape-control"><span class="visual-control-label">'+collectionEditorText('tileShape')+'</span><div class="tile-shape-segments">'
            +'<button type="button" class="'+(shape==='LANDSCAPE'?'is-selected':'')+'" aria-pressed="'+(shape==='LANDSCAPE')+'" onclick="updateFolderShape('+i+','+fi+',\'LANDSCAPE\')">▰ <span>'+collectionEditorText('landscape')+'</span></button>'
            +'<button type="button" class="'+(shape==='PORTRAIT'?'is-selected':'')+'" aria-pressed="'+(shape==='PORTRAIT')+'" onclick="updateFolderShape('+i+','+fi+',\'PORTRAIT\')">▯ <span>'+collectionEditorText('portrait')+'</span></button>'
            +'</div></div></div>':'')+'</section>'
            +'<section class="collection-rows"><div class="collection-rows-heading"><strong>'+collectionEditorText('rows')+'</strong><span>'+(f.rows||[]).length+'</span></div><div class="collection-row-list">'
            +((f.rows||[]).length?(f.rows||[]).map(function(row,ri){
              var rowId = getCollectionRowId(row);
              var rowLabel =
                rowId
                  ? (getCatalogLabel(rowId) || rowId)
                  : 'Unknown catalog';

              return '<div class="collection-row-item folder-row-entry">'
                + '<div class="collection-row-title folder-row-label">'
                + escapeHtml(rowLabel)
                + '</div>'
                + '<button type="button" class="collection-row-remove global-btn folder-row-remove" onclick="removeRowFromFolder('+i+','+fi+','+ri+')" aria-label="'+escapeHtml(collectionEditorText('removeRow'))+'">&#x2715;</button>'
                + '</div>';
            }).join(''):'<div class="collection-rows-empty">'+collectionEditorText('noRows')+'</div>')
            +'</div><div class="collection-add-row">'
            +(function(){
              window.__rowPickerOptions = window.__rowPickerOptions || {};
              var selId = 'addRowSelect-'+i+'-'+fi;
              window.__rowPickerOptions[selId] = avail.map(function(id){ return { id: id, label: getCatalogLabel(id) }; });
              return '<input class="collection-row-search" type="search" placeholder="'+escapeHtml(collectionEditorText('searchRows'))+'" data-select="'+selId+'" oninput="filterRowPickerSelect(this)">';
            })()
            +'<select id="addRowSelect-'+i+'-'+fi+'"><option value="">'+collectionEditorText('selectRow')+'</option>'
            +avail.map(function(id){return '<option value="'+escapeHtml(id)+'">'+escapeHtml(getCatalogLabel(id))+'</option>';}).join('')
            +'</select>'
            +'<button type="button" class="global-btn" onclick="addRowToFolder('+i+','+fi+')">'+collectionEditorText('addRow')+'</button></div></section></div>';
        }else{
          html+='<div class="folder-body" id="'+folderBodyId+'" hidden></div>';
        }
        html+='</section>';
      });
      html+='</div>';
    }else{
      html+='<div class="collection-body coll-card-body" id="'+collectionBodyId+'" hidden></div>';
    }
    html+='</article>';
    return html;
  }).join('');
  updateCounters();
  if(!renderOptions.skipCatalogRefresh){
    updateCounter();
    updateCategoryCounts();
  }
  if(!renderOptions.skipAutoSave && typeof window.umScheduleAutoSave === 'function'){
    window.umScheduleAutoSave();
  }
  if(typeof Sortable!=='undefined'){
    v2CollSortable = Sortable.create(list,{
      handle:'.coll-drag',
      ghostClass:'sortable-ghost',
      animation:150,
      forceFallback:true,
      fallbackTolerance:4,
      onEnd:function(evt){
      var oldIndex=evt.oldIndex;
      var newIndex=evt.newIndex;
      if(!Number.isInteger(oldIndex)||!Number.isInteger(newIndex)) return;
      var moved=v2Collections.splice(oldIndex,1)[0];
      v2Collections.splice(newIndex,0,moved);renderCollections();
    }});
    document.querySelectorAll('.coll-card-body:not([hidden])').forEach(function(body){
      var folderSortable = Sortable.create(body,{
        draggable:'.folder-card',
        handle:'.folder-drag',
        ghostClass:'sortable-ghost',
        animation:150,
        forceFallback:true,
        fallbackOnBody:true,
        fallbackTolerance:4,
        onEnd:function(evt){
        var ci=parseInt(body.closest('.coll-card').dataset.idx);
        var coll=v2Collections[ci];if(!coll) return;
        var oldIndex=evt.oldDraggableIndex;
        var newIndex=evt.newDraggableIndex;
        if(!Number.isInteger(oldIndex)||!Number.isInteger(newIndex)) return;
        var moved=coll.folders.splice(oldIndex,1)[0];
        coll.folders.splice(newIndex,0,moved);renderCollections();
      }});
      v2FolderSortables.push(folderSortable);
    });
  }
}

function toggleCollectionVisuals(key){
  if(_collectionVisualsOpen.has(key)){
    _collectionVisualsOpen.delete(key);
    _collectionVisualsOpen.add('closed:'+key);
  }else{
    _collectionVisualsOpen.add(key);
    _collectionVisualsOpen.delete('closed:'+key);
  }
  renderCollections({
    skipCatalogRefresh:true,
    skipAutoSave:true
  });
}

function toggleFolderCollapse(ci,fi){
  var coll=v2Collections[ci];
  if(!coll||!coll.folders[fi]) return;
  var opening=coll.folders[fi].collapsed===true;
  if(opening && isCollectionMobileLayout()){
    coll.folders.forEach(function(folder,index){ if(index!==fi) folder.collapsed=true; });
  }
  coll.folders[fi].collapsed=!coll.folders[fi].collapsed;
  renderCollections({
    skipCatalogRefresh:true,
    skipAutoSave:true
  });
}

function addCollection(){
  v2Collections.push({
    id: createUltraMaxCollectionId(),
    title: 'New Collection ' + (v2Collections.length + 1),
    collapsed: isCollectionMobileLayout(),
    folders: [
      applyFolderMedia({
        id: createUltraMaxFolderId(),
        title: 'New Folder',
        collapsed: isCollectionMobileLayout(),
        rows: []
      })
    ]
  });
  renderCollections();
}





function toggleCollectionCollapse(i){
  const item = v2Collections[i];
  if(!item) return;
  var opening=item.collapsed===true;
  if(opening && isCollectionMobileLayout()){
    v2Collections.forEach(function(collection,index){
      if(index!==i) collection.collapsed=true;
    });
  }
  item.collapsed = !item.collapsed;
  renderCollectionsDebounced({
    skipCatalogRefresh:true,
    skipAutoSave:true
  });
}

function duplicateCollection(i){
  const item = v2Collections[i];
  if(!item) return;

  const clone = cloneCollectionWithNewIdentities(item);
  clone.title = (clone.title || 'Collection') + ' Copy';

  v2Collections.splice(i + 1, 0, clone);
  renderCollections();
}

function renameCollection(i){
  const item = v2Collections[i];
  if(!item) return;

  const next = prompt('Rename collection', item.title || '');
  if(next === null) return;

  const name = next.trim();
  if(!name) return;

  item.title = name;
  renderCollections();
}

function moveCollectionUp(i){
  if(i <= 0) return;
  const tmp = v2Collections[i - 1];
  v2Collections[i - 1] = v2Collections[i];
  v2Collections[i] = tmp;
  renderCollections();
}

function moveCollectionDown(i){
  if(i >= v2Collections.length - 1) return;
  const tmp = v2Collections[i + 1];
  v2Collections[i + 1] = v2Collections[i];
  v2Collections[i] = tmp;
  renderCollections();
}




function addFolder(ci){
  const coll = v2Collections[ci];
  if(!coll) return;

  if(!Array.isArray(coll.folders)){
    coll.folders = [];
  }

  coll.folders.push(applyFolderMedia({
    id: createUltraMaxFolderId(),
    title: 'New Folder',
    collapsed: isCollectionMobileLayout(),
    rows: []
  }));

  renderCollections();
}

function moveFolderUp(ci, fi){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || fi <= 0) return;

  const tmp = coll.folders[fi - 1];
  coll.folders[fi - 1] = coll.folders[fi];
  coll.folders[fi] = tmp;

  renderCollections();
}

function moveFolderDown(ci, fi){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || fi >= coll.folders.length - 1) return;

  const tmp = coll.folders[fi + 1];
  coll.folders[fi + 1] = coll.folders[fi];
  coll.folders[fi] = tmp;

  renderCollections();
}




function getCollectionRowId(row){
  if(typeof row === 'string' || typeof row === 'number'){
    return String(row);
  }

  if(!row || typeof row !== 'object'){
    return '';
  }

  return String(
    row.id ||
    row.catalogId ||
    row.catalog_id ||
    row.rowId ||
    row.row_id ||
    row.sourceId ||
    row.source_id ||
    ''
  );
}

function getCollectionSourceIdentity(source){
  if(!source || typeof source !== 'object' || Array.isArray(source)){
    return '';
  }
  var type = String(source.type || '');
  var addonId = String(source.addonId || source.addon_id || '');
  var catalogId = String(source.catalogId || source.catalog_id || '');
  if(catalogId){
    return ['catalog', type, addonId, catalogId].join('\u0000');
  }
  var genre = String(source.genre || '');
  var provider = String(source.provider || '');
  if(type || addonId || genre || provider){
    return ['source', type, addonId, genre, provider].join('\u0000');
  }
  return '';
}

function countUltraMaxCollectionRows(collection){
  var folders = collection && Array.isArray(collection.folders)
    ? collection.folders.filter(function(folder){
        return folder && typeof folder === 'object' && !Array.isArray(folder);
      })
    : [];
  return folders.reduce(function(total, folder){
    if(Array.isArray(folder.rows)){
      var rowIds = new Set();
      folder.rows.forEach(function(row){
        var id = getCollectionRowId(row);
        if(id) rowIds.add(normalizeCatalogId(id));
      });
      return total + rowIds.size;
    }

    var sources = Array.isArray(folder.sources) ? folder.sources : [];
    var catalogSources = Array.isArray(folder.catalogSources) ? folder.catalogSources : [];
    var containers = catalogSources === sources ? [sources] : [sources, catalogSources];
    var identities = new Set();
    var unidentified = 0;
    containers.forEach(function(container){
      container.forEach(function(source){
        if(!source || typeof source !== 'object' || Array.isArray(source)) return;
        var identity = getCollectionSourceIdentity(source);
        if(identity) identities.add(identity);
        else unidentified += 1;
      });
    });
    return total + identities.size + unidentified;
  }, 0);
}

function getCatalogLabel(id){
  id = getCollectionRowId(id);

  if(!id){
    return '';
  }

  var resolvedId = (typeof MDB_LEGACY_ALIASES !== 'undefined' && MDB_LEGACY_ALIASES[id]) || id;
  var mergedDef = (mergedCatalogs || []).find(function(item){
    return mergedDerivedIds(item).includes(resolvedId);
  });
  if(mergedDef){
    var mergedType = resolvedId.endsWith('_movies') ? 'movie'
      : resolvedId.endsWith('_series') ? 'series' : mergedDef.type;
    return mergedDef.name + (mergedType === 'movie' ? ' · Movies' : ' · Series');
  }

  if(typeof S2_DEFS !== 'undefined' && S2_DEFS[resolvedId]){
    var def = S2_DEFS[resolvedId];
    var typeLabel = def.type === 'movie' ? ' · Movies' : def.type === 'series' ? ' · Series' : '';
    return (def.name || id) + typeLabel;
  }
  const pill = document.querySelector('.pill[data-id="'+id+'"],.s2-pill[id="s2pill-'+id+'"]');
  if(pill) return (pill.textContent||'').replace('👁','').replace('🙈','').replace('🎬','').replace('📺','').trim()||id;
  if(typeof mdbNameCache !== 'undefined' && mdbNameCache[id]){
    var cached = mdbNameCache[id];
    var cachedType = cached.mediatype === 'movie' ? ' · Movies' : cached.mediatype === 'series' ? ' · Series' : '';
    return cached.name + cachedType;
  }
  return id;
}

// Filters the <option> list of a "catalog picker" <select> as the user
// types in the search box rendered just above it — see window.__rowPickerOptions
// populated at render time (renderCollections' addRowSelect-ci-fi picker).
function filterRowPickerSelect(inputEl){
  const selId = inputEl.dataset.select;
  const select = document.getElementById(selId);
  if(!select) return;

  const options = (window.__rowPickerOptions && window.__rowPickerOptions[selId]) || [];
  const query = inputEl.value.trim().toLowerCase();
  const filtered = query ? options.filter(function(o){ return o.label.toLowerCase().includes(query); }) : options;

  const placeholder = select.querySelector('option[value=""]');
  const placeholderHtml = placeholder ? ('<option value="">' + escapeHtml(placeholder.textContent) + '</option>') : '';
  const previousValue = select.value;

  select.innerHTML = placeholderHtml + filtered.map(function(o){
    return '<option value="' + escapeHtml(o.id) + '">' + escapeHtml(o.label) + '</option>';
  }).join('');

  // Keep the current selection if it still matches the filter.
  if(filtered.some(function(o){ return o.id === previousValue; })) select.value = previousValue;
}

// Pre-load catalog defs on page load so getCatalogLabel works everywhere
(function(){
  if(typeof S2_DEFS !== 'undefined' && Object.keys(S2_DEFS).length > 0) return;
  fetch('/catalog-defs.json').then(function(r){ return r.json(); }).then(function(d){
    if(typeof S2_DEFS !== 'undefined') Object.assign(S2_DEFS, d);
    // Re-render collections now that labels are available
    if(typeof renderCollections === 'function') renderCollectionsDebounced();
  }).catch(function(){});
})();


function updateFolderCover(ci, fi, value){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;
  coll.folders[fi].coverImageUrl = value.trim();
}

function updateFolderGif(ci, fi, value){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;
  coll.folders[fi].focusGifUrl = value.trim();
  coll.folders[fi].focusGifEnabled = !!value.trim();
}

function updateFolderHero(ci, fi, value){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders[fi]) return;
  coll.folders[fi].heroBackdropUrl = value.trim();
}

function clearFolderHero(ci, fi){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;
  coll.folders[fi].heroBackdropUrl = '';
  renderCollections();
}

function updateFolderShape(ci, fi, value){
  if(!v2Collections[ci]||!v2Collections[ci].folders[fi]) return;
  v2Collections[ci].folders[fi].tileShape = value;
  renderCollections();
}

function toggleFolderGif(ci, fi, checked){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;
  coll.folders[fi].focusGifEnabled = !!checked;
  renderCollections();
}

function addRowToFolder(ci, fi){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;

  const folder = coll.folders[fi];
  const sel = document.getElementById('addRowSelect-' + ci + '-' + fi);
  if(!sel || !sel.value) return;

  const id = sel.value;

  if(!Array.isArray(folder.rows)){
    folder.rows = [];
  }

  if(!folder.rows.includes(id)){
    folder.rows.push(id);
  
  // Auto-hide rows once they are moved into a collection.
  try{
    const addedRowId = id;
    if(addedRowId){
      hidden.add(addedRowId);
      applyHiddenStateToPill(addedRowId);
      if(typeof updateCounter === 'function') updateCounter();
      if(typeof updateCategoryCounts === 'function') updateCategoryCounts();
      if(typeof saveDraftState === 'function') saveDraftState();
    }
  }catch(e){
    console.warn('Auto-hide collection row failed', e);
  }
}

  renderCollections();
}

function removeRowFromFolder(ci, fi, ri){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;

  const folder = coll.folders[fi];
  if(!Array.isArray(folder.rows) || typeof folder.rows[ri] === 'undefined') return;

  folder.rows.splice(ri, 1);

  renderCollections();
}

function renameFolder(ci, fi){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;

  const folder = coll.folders[fi];
  const next = prompt('Rename folder', folder.title || '');
  if(next === null) return;

  const name = next.trim();
  if(!name) return;

  folder.title = name;
  renderCollections();
}

var _collectionRemovalRenderTimer = null;

function renderCollectionsAfterRemoval(){
  updateCounters();

  if(typeof window.umScheduleAutoSave === 'function'){
    window.umScheduleAutoSave();
  }

  if(_collectionRemovalRenderTimer){
    clearTimeout(_collectionRemovalRenderTimer);
    _collectionRemovalRenderTimer = null;
  }

  var queueRender = function(){
    _collectionRemovalRenderTimer = setTimeout(function(){
      _collectionRemovalRenderTimer = null;
      renderCollections({
        skipCatalogRefresh:true,
        skipAutoSave:true
      });
    }, 0);
  };

  if(typeof window.requestAnimationFrame === 'function'){
    window.requestAnimationFrame(queueRender);
  }else{
    queueRender();
  }
}

function removeFolder(ci, fi, trigger){
  const coll = v2Collections[ci];
  if(!coll || !coll.folders || !coll.folders[fi]) return;

  coll.folders.splice(fi, 1);

  if(coll.folders.length === 0){
    v2Collections.splice(ci, 1);
    var collectionCard = trigger && trigger.closest
      ? trigger.closest('.collection-card')
      : null;
    if(collectionCard) collectionCard.remove();
  }else{
    var folderCard = trigger && trigger.closest
      ? trigger.closest('.folder-card')
      : null;
    if(folderCard) folderCard.remove();
  }

  renderCollectionsAfterRemoval();
}

function removeCollection(i, trigger){
  if(!Number.isInteger(i) || i < 0 || i >= v2Collections.length) return;

  v2Collections.splice(i,1);

  var card = trigger && trigger.closest
    ? trigger.closest('.collection-card')
    : null;
  if(card) card.remove();

  renderCollectionsAfterRemoval();
}


