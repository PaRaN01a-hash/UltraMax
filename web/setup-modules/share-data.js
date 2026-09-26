// Prepare share data whenever called
window.prepareShareData = function(){
  // Collections share data
  var colls = (typeof v2Collections !== 'undefined' ? v2Collections : window.v2Collections) || [];
  localStorage.setItem('um_share_collections', JSON.stringify(colls));

  // Full setup share data (no password, no API keys)
  var setupData = {
    catalogs: Array.from(typeof selected !== 'undefined' ? selected : []),
    collections: colls,
    language: (document.getElementById('language')||{}).value || '',
    displayStyle: (document.getElementById('displayStyle')||{}).value || ''
  };
  localStorage.setItem('um_share_setup', JSON.stringify(setupData));
  // Always store both for full package sharing
  sessionStorage.setItem('um_share_collections', JSON.stringify(colls));
  localStorage.setItem('um_share_full', JSON.stringify({setup: setupData, collections: colls}));
};

window.openShareGallery = function(type){
  window.prepareShareData();
  var modal = document.getElementById('inlineShareModal');
  modal.style.display='flex';
  document.getElementById('inlineShareResult').style.display='none';
  document.getElementById('inlineShareLinkRow').style.display='none';
  document.getElementById('inlineShareBtn').textContent=umT('setup.shareModal.share', '🚀 Share');
  document.getElementById('inlineShareBtn').disabled=false;
  requestAnimationFrame(function(){
    document.getElementById('inlineShareName').focus();
    umTrapFocus(modal);
  });
};
