(function(){
  var _activeTab = 0;

  function appendCollectionHero(container, folder, title){
    if(!container || !folder || !folder.heroBackdropUrl || !folder.heroBackdropUrl.trim()) return;
    var hero=document.createElement('div');
    hero.className='nuvio-collection-hero-preview';
    hero.style.backgroundImage='linear-gradient(90deg,rgba(5,5,14,.88),rgba(5,5,14,.24)),url("'+String(folder.heroBackdropUrl).replace(/["\\\n\r]/g,'')+'")';
    var heading=document.createElement('strong');
    heading.textContent=title || folder.title || folder.name || 'Collection';
    hero.appendChild(heading);
    container.appendChild(hero);
  }

  window.openNuvioPreview = function(){
    window.v2Collections = (typeof v2Collections !== 'undefined' ? v2Collections : window.v2Collections) || [];
    var modal = document.getElementById('nuvioPreviewModal');
    modal.style.display = 'flex';
    _activeTab = 0;
    populatePreviewPicker();
    renderNuvioPreview();
  };

  window.closeNuvioPreview = function(){
    document.getElementById('nuvioPreviewModal').style.display = 'none';
  };

  function populatePreviewPicker(){
    var picker = document.getElementById('previewCollPicker');
    picker.innerHTML = '';
    var all = document.createElement('option');
    all.value = 'all';
    all.textContent = umT('setup.summaryModal.allCollections', '— All Collections —');
    picker.appendChild(all);
    (window.v2Collections||[]).forEach(function(c,i){
      var o = document.createElement('option');
      o.value = i;
      o.textContent = c.name || ('Collection '+(i+1));
      picker.appendChild(o);
    });
  }

  window.renderNuvioPreview = function(){
    var pickerVal = document.getElementById('previewCollPicker').value;
    if(pickerVal === 'all'){
      document.getElementById('previewTabs').innerHTML = '';
      document.getElementById('previewTabs').style.display = 'none';
      var contentEl = document.getElementById('previewContent');
      contentEl.innerHTML = '';
      (window.v2Collections||[]).forEach(function(coll){
        // Collection name header
        var sec = document.createElement('div');
        sec.style.cssText = 'margin-top:24px;margin-bottom:12px;';
        appendCollectionHero(sec,(coll.folders||[]).find(function(folder){return folder.heroBackdropUrl&&folder.heroBackdropUrl.trim();}),coll.title||coll.name||'Collection');
        var sn = document.createElement('div');
        sn.style.cssText = 'font-size:18px;font-weight:800;color:#fff;letter-spacing:-.02em;margin-bottom:4px;';
        sn.textContent = coll.title||coll.name||'Collection';
        var su = document.createElement('div');
        su.style.cssText = 'width:32px;height:3px;background:#7B2FFF;border-radius:2px;';
        sec.appendChild(sn); sec.appendChild(su);
        contentEl.appendChild(sec);
        // Folder cover images in a horizontal strip
        var strip = document.createElement('div');
        strip.style.cssText = 'display:flex;gap:10px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none;';
        (coll.folders||[]).forEach(function(folder){
          var card = document.createElement('div');
          card.style.cssText = 'flex-shrink:0;width:140px;height:80px;border-radius:10px;overflow:hidden;background:#111;position:relative;user-select:none;-webkit-user-select:none;touch-action:none;';
          if(folder.coverImageUrl&&folder.coverImageUrl.trim()){
            var img = document.createElement('img');
            img.src = folder.coverImageUrl;
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            if(folder.focusGifEnabled&&folder.focusGifUrl&&folder.focusGifUrl.trim()){
              var gif = document.createElement('img');
              gif.src = folder.focusGifUrl;
              gif.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .15s;';
              card.appendChild(gif);
              card.addEventListener('touchstart',function(e){e.preventDefault();gif.style.opacity='1';},{passive:false});
              card.addEventListener('touchend',function(){gif.style.opacity='0';});
              card.addEventListener('touchcancel',function(){gif.style.opacity='0';});
              card.addEventListener('mousedown',function(){gif.style.opacity='1';});
              card.addEventListener('mouseup',function(){gif.style.opacity='0';});
              card.addEventListener('mouseleave',function(){gif.style.opacity='0';});
            }
            card.appendChild(img);
          } else {
            card.style.background = '#1a1a2e';
          }
          var lbl = document.createElement('div');
          lbl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:4px 6px;background:linear-gradient(to top,rgba(0,0,0,0.8),transparent);font-size:10px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
          lbl.textContent = folder.name||'';
          card.appendChild(lbl);
          strip.appendChild(card);
        });
        contentEl.appendChild(strip);
      });
      return;
    }
    document.getElementById('previewTabs').style.display = 'flex';
    var ci = parseInt(document.getElementById('previewCollPicker').value)||0;
    var coll = (window.v2Collections||[])[ci];
    if(!coll) return;
    var folders = coll.folders||[];
    if(_activeTab >= folders.length) _activeTab = 0;

    // Render tabs — Nuvio style: landscape image tile + name below + blue underline
    var tabsEl = document.getElementById('previewTabs');
    tabsEl.innerHTML = '';
    folders.forEach(function(f,fi){
      var isActive = fi === _activeTab;
      var wrap = document.createElement('div');
      wrap.style.cssText = 'flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;padding-bottom:8px;border-bottom:2px solid '+(isActive?'#7B2FFF':'transparent')+';transition:border-color .2s;';

      var imgWrap = document.createElement('div');
      imgWrap.style.cssText = 'width:100px;height:56px;border-radius:8px;overflow:hidden;background:#111;position:relative;flex-shrink:0;user-select:none;-webkit-user-select:none;touch-action:none;';

      var gif = null;
      if(f.coverImageUrl&&f.coverImageUrl.trim()){
        var bg = document.createElement('img');
        bg.src = f.coverImageUrl;
        bg.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;';
        imgWrap.appendChild(bg);
        if(f.focusGifEnabled&&f.focusGifUrl&&f.focusGifUrl.trim()){
          gif = document.createElement('img');
          gif.src = f.focusGifUrl;
          gif.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;opacity:0;transition:opacity .15s;';
          imgWrap.appendChild(gif);
        }
      }

      var lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:10px;font-weight:600;color:'+(isActive?'#fff':'rgba(255,255,255,0.45)')+';text-align:center;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.01em;';
      lbl.textContent = f.name||('Folder '+(fi+1));

      wrap.appendChild(imgWrap);
      wrap.appendChild(lbl);

      // GIF: hold to show
      if(gif){
        imgWrap.addEventListener('touchstart',function(e){e.preventDefault();gif.style.opacity='1';},{passive:false});
        imgWrap.addEventListener('touchend',function(){gif.style.opacity='0';});
        imgWrap.addEventListener('touchcancel',function(){gif.style.opacity='0';});
        imgWrap.addEventListener('mousedown',function(){gif.style.opacity='1';});
        document.addEventListener('mouseup',function(){gif.style.opacity='0';});
      }

      wrap.addEventListener('click',function(){_activeTab=fi;renderNuvioPreview();});
      tabsEl.appendChild(wrap);
    });

    // Render rows
    var contentEl = document.getElementById('previewContent');
    contentEl.innerHTML = '';
    var folder = folders[_activeTab];
    if(!folder){contentEl.innerHTML=umT('setup.summaryModal.noFolders', '<div style="color:#333;text-align:center;padding:40px;">No folders</div>');return;}
    appendCollectionHero(contentEl,folder,coll.title||coll.name||folder.title||folder.name);

    var rows = folder.rows||[];
    var isPortrait = folder.tileShape === 'PORTRAIT';

    if(!rows.length){
      contentEl.innerHTML='<div style="color:#333;text-align:center;padding:50px 20px;font-size:13px;">' + umT('setup.collectionPreview.noRowsInFolder','No rows in this folder yet.') + '<br><span style="font-size:11px;color:#222;">' + umT('setup.collectionPreview.addRowsHint','Add rows in the editor and refresh preview.') + '</span></div>';
      return;
    }

    rows.forEach(function(rowId){
      var label = (window.getCatalogLabel?getCatalogLabel(rowId):rowId)||rowId;

      // Row header: label + blue underline (Nuvio style)
      var hdr = document.createElement('div');
      hdr.style.cssText = 'margin-top:24px;margin-bottom:12px;';
      var hl = document.createElement('div');
      hl.style.cssText = 'font-size:16px;font-weight:700;color:#fff;margin-bottom:5px;letter-spacing:-.01em;';
      hl.textContent = label;
      var hu = document.createElement('div');
      hu.style.cssText = 'width:32px;height:2.5px;background:#7B2FFF;border-radius:2px;';
      hdr.appendChild(hl);
      hdr.appendChild(hu);
      contentEl.appendChild(hdr);

      // Tile strip
      var strip = document.createElement('div');
      contentEl.appendChild(hdr);
    });
  };

  // Hook setStep
  var _orig = null;
  function hookSetStep(){
    if(window.setStep&&!_orig){
      _orig=window.setStep;
      window.setStep=function(n){
        _orig(n);
        var btn=document.getElementById('nuvioPreviewBtn');
        if(btn) btn.style.display=(n===3)?'block':'none';
      };
    }
  }
  hookSetStep();
  document.addEventListener('DOMContentLoaded',hookSetStep);
  setTimeout(hookSetStep,500);
})();
