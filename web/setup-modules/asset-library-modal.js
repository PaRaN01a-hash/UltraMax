function openAssetModal(ci, fi, mode){
  var modal = document.getElementById('assetModal');
  var frame = document.getElementById('assetFrame');
  var returnTo = window.location.href;
  frame.src = '/assets?ci='+ci+'&fi='+fi+'&mode='+(mode||'cover')+'&returnTo='+encodeURIComponent(returnTo);
  frame.onload = applyAssetLibraryLightMode;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeAssetModal(){
  var modal = document.getElementById('assetModal');
  modal.style.display = 'none';
  document.body.style.overflow = '';
  document.getElementById('assetFrame').src = '';
}

// The Asset Library iframe (/assets) is a separate same-origin document
// rendered by the backend, so it has no access to this page's --card/--text
// custom properties. Mirror the light-mode palette into it directly instead.
function applyAssetLibraryLightMode(){
  try{
    var frame = document.getElementById('assetFrame');
    var doc = frame && frame.contentDocument;
    if(!doc || !doc.head) return;
    var existing = doc.getElementById('um-asset-light-mode');
    if(existing) existing.remove();
    if(!document.body.classList.contains('light-mode')) return;
    var style = doc.createElement('style');
    style.id = 'um-asset-light-mode';
    style.textContent =
      'body{background:#f6f4fd !important;color:#1d1b2e !important;}' +
      'header{background:#ffffff !important;border-bottom-color:#e3ddf5 !important;}' +
      '.logo{color:#1d1b2e !important;}' +
      '.logo span{color:#5B1FBF !important;}' +
      '.search{background:#f8f6ff !important;border-color:#c9bdec !important;color:#1d1b2e !important;}' +
      '.search::placeholder{color:#5c5675 !important;}' +
      '.search:focus{border-color:#9B5FFF !important;}' +
      '.tab{background:#ffffff !important;border-color:#c9bdec !important;color:#4a4560 !important;}' +
      '.tab.active{background:#7B2FFF !important;border-color:#7B2FFF !important;color:#ffffff !important;}' +
      '.count{color:#5c5675 !important;}' +
      '.card{background:#ffffff !important;border-color:#e3ddf5 !important;}' +
      '.card:hover{border-color:#7B2FFF !important;}' +
      '.card img{background:#f8f5ff !important;}' +
      '.name{color:#4a4560 !important;}' +
      '.folder-tag{color:#5B1FBF !important;}' +
      '.card button{background:rgba(123,47,255,.12) !important;color:#5B1FBF !important;border-top-color:#e3ddf5 !important;}' +
      '.card button:hover{background:rgba(123,47,255,.22) !important;}' +
      '.empty{color:#5c5675 !important;}';
    doc.head.appendChild(style);
  }catch(e){ /* cross-origin or not-yet-loaded: outer wrapper still themes correctly on its own */ }
}

// Listen for asset pick message from iframe
window.addEventListener('message', function(e){
  console.log('Message received:', e.data);
  if(e.data && e.data.type === 'assetPick'){
    var pick = e.data;
    var coll = v2Collections[pick.ci];
    if(!coll || !coll.folders[pick.fi]) return;
    var folder = coll.folders[pick.fi];
    if(pick.mode === 'gif'){
      folder.focusGifUrl = pick.url;
      folder.focusGifEnabled = true;
    } else if(pick.mode === 'hero'){
      folder.heroBackdropUrl = pick.url;
    } else {
      folder.coverImageUrl = pick.url;
    }
    closeAssetModal();
    renderCollections();
    showBanner(umT('setup.assetLibrary.imageApplied', '✅ Image applied!'), 'success');
  }
});
