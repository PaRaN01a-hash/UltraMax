function toggleStreamsSection(){
  const body = document.getElementById('streamsSectionBody');
  const chev = document.getElementById('streamsSectionChevron');
  if(!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(chev) chev.textContent = open ? '▸' : '▾';
}

function toggleManualStreams(){
  const body = document.getElementById('manualStreamsBody');
  const chev = document.getElementById('manualStreamsChevron');
  if(!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if(chev) chev.textContent = open ? '▶' : '▼';
}

function saveHiddenState(){
  try{ sessionStorage.setItem('um_hidden', JSON.stringify(Array.from(hidden))); }catch(e){}
}
function persistStep2State(){
  syncCatalogOrder();
  s2RefreshAllHiddenWarning();
  saveHiddenState();
  if(typeof saveDraftState === 'function') saveDraftState();
}
function restoreHiddenState(){
  try{
    const saved = sessionStorage.getItem('um_hidden');
    if(saved){
      const ids = JSON.parse(saved);
      hidden.clear();
      if(Array.isArray(ids)){
        ids.forEach(function(id){ hidden.add(id); });
      }
    }
  }catch(e){}
}
