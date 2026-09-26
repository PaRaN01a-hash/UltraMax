function openAssetLibrary(ci, fi, mode){
  openAssetModal(ci, fi, mode);
}

function applyPendingAssetPick(){
  try{
    const raw = localStorage.getItem('ultramaxAssetPick');
    if(!raw) return;

    const pick = JSON.parse(raw);
    if(!pick || typeof pick.ci === 'undefined' || typeof pick.fi === 'undefined' || !pick.url){
      localStorage.removeItem('ultramaxAssetPick');
      return;
    }

    const coll = v2Collections[pick.ci];
    if(!coll || !coll.folders || !coll.folders[pick.fi]){
      localStorage.removeItem('ultramaxAssetPick');
      return;
    }

    const folder = coll.folders[pick.fi];

    if(pick.mode === 'gif'){
      folder.focusGifUrl = pick.url;
      folder.focusGifEnabled = true;
    } else if(pick.mode === 'hero'){
      folder.heroBackdropUrl = pick.url;
    } else {
      folder.coverImageUrl = pick.url;
    }

    localStorage.removeItem('ultramaxAssetPick');
    renderCollections();
  }catch(e){
    console.error('applyPendingAssetPick failed', e);
  }
}


