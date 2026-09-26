(function(){

  window.openSummary = function(){
    window.v2Collections = (typeof v2Collections !== 'undefined' ? v2Collections : window.v2Collections) || [];
    var modal = document.getElementById('summaryModal');
    modal.style.display = 'flex';
    buildSummary();
  };

  window.closeSummary = function(){
    document.getElementById('summaryModal').style.display = 'none';
  };

  function row(label, value){
    return '<div class="sum-row"><div class="sum-row-label">'+label+'</div><div class="sum-row-value">'+value+'</div></div>';
  }

  var _sc = {};
  window.toggleSumSection = function(id){
    _sc[id] = !_sc[id];
    buildSummary();
  };
  function secWrap(id, title, inner){
    var c = _sc[id];
    return '<div class="sum-section">'
      +'<div class="sum-section-title" onclick="toggleSumSection(\''+id+'\')" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;">'
      +'<span>'+title+'</span><span>'+(c?'▶':'▼')+'</span></div>'
      +(c?'':inner)
      +'</div>';
  }
  function buildSummary(){
    var el = document.getElementById('summaryContent');
    var html = '';

    // --- SETTINGS ---
    var _sHtml = '';
    var lang = (document.getElementById('language')||{}).value || '—';
    var providers = getDiscoveryProviderState();
    var rpdb = (document.getElementById('rpdbKey')||{}).value || '';
    var trakt = (document.getElementById('traktUser')||{}).value || '';
    _sHtml += row('Language', lang);
    _sHtml += row('Discovery providers', discoveryProviderStatusText(providers));
    _sHtml += row('RPDB Key', rpdb ? '✅ Set' : '❌ Not set');
    _sHtml += row('Trakt User', trakt ? '✅ '+trakt : '❌ Not connected');
    html += secWrap('settings', '⚙️ Settings', _sHtml);

    // --- HOME ROWS ---
    var _hHtml = '';
    var sel = (typeof selected !== 'undefined') ? Array.from(selected) : [];
    if(sel.length === 0){
      _hHtml += '<div class="sum-empty">No catalogs selected</div>';
    } else {
      _hHtml += '<div style="margin-bottom:4px;font-size:11px;color:#555;">'+sel.length+' catalog'+(sel.length!==1?'s':'')+' selected — in order:</div>';
      _hHtml += '<div style="margin-top:6px;">';
      sel.forEach(function(id, idx){
        var label = (window.getCatalogLabel ? getCatalogLabel(id) : id) || id;
        _hHtml += '<div class="sum-row"><div class="sum-row-label" style="color:#444;">'+(idx+1)+'.</div><div class="sum-row-value" style="text-align:left;">'+label+'</div></div>';
      });
      html += '</div>';
    }
    _hHtml += '</div>';
    html += secWrap('homerows', '🏠 Home Rows ('+sel.length+')', _hHtml);

    // --- COLLECTIONS ---
    var colls = window.v2Collections || [];
    var _cHtml = '';
    if(!colls.length){
      _cHtml += '<div class="sum-empty">No collections configured</div>';
    } else {
      colls.forEach(function(coll, ci){
        var folders = coll.folders||[];
        var totalRows = folders.reduce(function(s,f){return s+(f.rows||[]).length;},0);
        _cHtml += '<div style="margin-bottom:16px;">';
        _cHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
        _cHtml += '<div style="font-size:14px;font-weight:700;color:#fff;">'+((coll.name||('Collection '+(ci+1))))+'</div>';
        _cHtml += '<div style="font-size:10px;color:#555;background:#111;padding:2px 8px;border-radius:10px;">'+folders.length+' folder'+(folders.length!==1?'s':'')+' · '+totalRows+' row'+(totalRows!==1?'s':'')+'</div>';
        _cHtml += '</div>';
        folders.forEach(function(f, fi){
          var rows = f.rows||[];
          _cHtml += '<div class="sum-folder">';
          _cHtml += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:'+(rows.length?'8px':'0')+';">';
          if(f.coverImageUrl&&f.coverImageUrl.trim()){
            _cHtml += '<img src="'+f.coverImageUrl+'" style="width:36px;height:20px;object-fit:cover;border-radius:4px;flex-shrink:0;">';
          }
          _cHtml += '<div class="sum-folder-name">'+(f.name||('Folder '+(fi+1)))+'</div>';
          _cHtml += '<div style="font-size:10px;color:#444;margin-left:auto;">'+rows.length+' row'+(rows.length!==1?'s':'')+'</div>';
          _cHtml += '</div>';
          if(rows.length){
            rows.forEach(function(rowId, ri){
              var label = (window.getCatalogLabel?getCatalogLabel(rowId):rowId)||rowId;
              _cHtml += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #181818;">';
              _cHtml += '<div style="font-size:10px;color:#444;width:16px;flex-shrink:0;">'+(ri+1)+'.</div>';
              _cHtml += '<div style="font-size:11px;color:#a0a0c0;">'+label+'</div>';
              _cHtml += '</div>';
            });
          }
          _cHtml += '</div>';
        });
        _cHtml += '</div>';
      });
    }
    _cHtml += '</div>';
    html += secWrap('collections', '📁 Collections ('+colls.length+')', _cHtml);

    // --- FOOTER ---
    var totalCatalogs = (typeof selected !== 'undefined') ? selected.size : 0;
    var totalCollections = colls.length;
    var totalFolders = colls.reduce(function(s,c){return s+(c.folders||[]).length;},0);
    html += '<div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:14px;margin-top:8px;">';
    html += '<div style="font-size:11px;color:#444;margin-bottom:8px;text-transform:uppercase;letter-spacing:.08em;">Totals</div>';
    html += row('Home Rows', totalCatalogs+' catalogs');
    html += row('Collections', totalCollections);
    html += row('Folders', totalFolders);
    html += '</div>';

    el.innerHTML = html;
  }

  // Hook setStep
  var _origSum = null;
  function hookSumStep(){
    if(window.setStep && !_origSum){
      _origSum = window.setStep;
      window.setStep = function(n){
        _origSum(n);
        var btn = document.getElementById('summaryBtn');
        if(btn) btn.style.display = (n>=2)?'block':'none';
        var sbtn = document.getElementById('shareGalleryBtn');
           if(sbtn) sbtn.style.display = 'none';
      };
    }
  }
  hookSumStep();
  document.addEventListener('DOMContentLoaded', hookSumStep);
  setTimeout(hookSumStep, 600);
})();
