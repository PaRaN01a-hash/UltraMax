function toggleParentCategory(groupId, e){
  if(e && (e.target.classList.contains('select-all') || e.target.classList.contains('sub-cat-chevron') || e.target.classList.contains('sub-select-all'))) return;
  const wrap = document.getElementById('wrap-'+groupId);
  const chev = document.getElementById('chev-'+groupId);
  if(!wrap) return;
  wrap.classList.toggle('open');
  if(chev) chev.classList.toggle('open');
  setTimeout(makeSprockets, 200);
}

// Select All for parent categories — selects every pill inside including all sub-sections
function selectAllParent(groupId, e){
  if(e) e.stopPropagation();
  const wrap = document.getElementById('wrap-'+groupId);
  if(!wrap) return;
  const pills = wrap.querySelectorAll('.pill:not(.hidden)');
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
  const btn = document.querySelector('[onclick="selectAllParent(\''+groupId+'\', event)"]');
  if(btn) btn.textContent = allSelected ? 'Select All' : 'Clear All';
  updateCounter(); updateCategoryCounts();
  persistStep2State();
}

// Toggle individual sub-sections (Crime, Horror, UK, USA, etc.)
function toggleSubSection(pillsId, headerEl){
  const pills = document.getElementById(pillsId);
  if(!pills) return;
  const chevron = headerEl.querySelector('.sub-cat-chevron');
  const isHidden = pills.style.display === 'none' || pills.style.display === '';
  pills.style.display = isHidden ? 'flex' : 'none';
  if(chevron) chevron.classList.toggle('open', isHidden);
  setTimeout(makeSprockets, 200);
}

// Collapsible categories
function initCollapsible(){
  // Disabled — old pill system replaced by new category builder
  return;
  const groups = ["quickpicks","trending","providers","genres","studios","collections","tvcollections","directors","actors","decades","kids"];
  groups.forEach(function(g){
    const header = document.querySelector(`[onclick="selectAll('${g}')"]`).closest(".cat-header");
    const pills = document.getElementById(g);
    if(!header || !pills) return;
    // Wrap pills
    const wrap = document.createElement("div");
    wrap.className = "pills-wrap";
    wrap.id = "wrap-"+g;
    pills.parentNode.insertBefore(wrap, pills);
    wrap.appendChild(pills);
    // Add chevron
    const chevron = document.createElement("span");
    chevron.className = "cat-chevron";
    chevron.innerHTML = "&#9660;";
    chevron.id = "chev-"+g;
    header.appendChild(chevron);
    // Add click handler
    header.style.cursor = "pointer";
    header.addEventListener("click", function(e){
      if(e.target.classList.contains("select-all")) return;
      const w = document.getElementById("wrap-"+g);
      const c = document.getElementById("chev-"+g);
      w.classList.toggle("open");
      c.classList.toggle("open");
      setTimeout(makeSprockets, 200);
    });
  });

/*
// Open themed and regional wraps by default
["themed","regional"].forEach(function(g){
  const wrap = document.getElementById("wrap-"+g);
  const chev = document.getElementById("chev-"+g);
  if(wrap) wrap.classList.add("open");
  if(chev) chev.classList.add("open");
});
*/
}


function getExcludeLanguages(){
  return Array.from(document.querySelectorAll('.lang-exclude-cb:checked')).map(cb => cb.value);
}

function setExcludeLanguages(langs){
  document.querySelectorAll('.lang-exclude-cb').forEach(cb => {
    cb.checked = (langs || []).includes(cb.value);
  });
}


function downloadCsv(){
  const catTitles = {};
  document.querySelectorAll('.category').forEach(function(cat){
    const titleEl = cat.querySelector('.cat-title');
    if(!titleEl) return;
    const title = (titleEl.textContent||'').replace(/\s+\d+$/,'').trim();
    cat.querySelectorAll('.pill').forEach(function(pill){ catTitles[pill.dataset.id] = title; });
  });
  const rows = [['Name','Type','Category','ID','Hidden from Home']];
  document.querySelectorAll('.pill.selected').forEach(function(pill){
    const id = pill.dataset.id;
    const name = pill.textContent.replace('👁','').trim();
    const cat = catTitles[id] || '';
    const type = id.includes('series') || id.includes('network_') || id.includes('starz_series') ? 'Series' : 'Movie';
    const isHidden = typeof hidden !== 'undefined' && hidden.has(id) ? 'Yes' : 'No'; rows.push([name, type, cat, id, isHidden]);
  });
  const csv = rows.map(function(r){
    return r.map(function(v){ return '"'+String(v).replace(/"/g,'""')+'"'; }).join(',');
  }).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ultra-max-catalogs.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

