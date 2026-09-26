(function(){
  if (typeof umIsStandalone !== 'function' || !umIsStandalone()) return;

  var _origToggle = window.toggleCollectionCollapse;
  window.toggleCollectionCollapse = function(i){
    if (typeof v2Collections === 'undefined' || !v2Collections) {
      if (_origToggle) return _origToggle(i);
      return;
    }
    v2Collections.forEach(function(c, idx){
      c.collapsed = (idx !== i);
    });
    document.body.classList.add('s3-app-detail-mode');
    var backBtn = document.getElementById('s3AppBackBtn');
    if (backBtn) backBtn.style.display = 'block';
    if (typeof renderCollections === 'function') renderCollections();
  };

  var _origAddCollection = window.addCollection;
  window.addCollection = function(){
    if (_origAddCollection) _origAddCollection();
    if (typeof v2Collections !== 'undefined' && v2Collections && v2Collections.length) {
      var newIdx = v2Collections.length - 1;
      v2Collections.forEach(function(c, idx){ c.collapsed = (idx !== newIdx); });
      document.body.classList.add('s3-app-detail-mode');
      var backBtn = document.getElementById('s3AppBackBtn');
      if (backBtn) backBtn.style.display = 'block';
      if (typeof renderCollections === 'function') renderCollections();
    }
  };

  window.s3AppBackToCollections = function(){
    if (typeof v2Collections !== 'undefined' && v2Collections) {
      v2Collections.forEach(function(c){ c.collapsed = true; });
    }
    document.body.classList.remove('s3-app-detail-mode');
    var backBtn = document.getElementById('s3AppBackBtn');
    if (backBtn) backBtn.style.display = 'none';
    if (typeof renderCollections === 'function') renderCollections();
  };

  var _collList = document.getElementById('collections-list');
  if (_collList) {
    var _fixupRowLabels = function(){
      _collList.querySelectorAll('.folder-body button.global-btn').forEach(function(btn){
        var onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.indexOf('removeRowFromFolder') === -1) return;
        var label = btn.previousElementSibling;
        if (!label) return;
        label.style.setProperty('color', '#e8e8f0', 'important');
        label.style.setProperty('font-size', '13px', 'important');
        label.style.setProperty('opacity', '1', 'important');
        label.style.setProperty('overflow', 'hidden', 'important');
        label.style.setProperty('white-space', 'nowrap', 'important');
        label.style.setProperty('text-overflow', 'ellipsis', 'important');
        label.style.setProperty('flex', '1 1 auto', 'important');
        label.style.setProperty('min-width', '0', 'important');
        btn.style.setProperty('padding', '0', 'important'); btn.style.setProperty('width', '32px', 'important'); btn.style.setProperty('height', '32px', 'important');
        btn.style.setProperty('min-width', 'auto', 'important');
        btn.style.setProperty('flex-shrink', '0', 'important');
      });
    };
    _fixupRowLabels();
    var _rowObserver = new MutationObserver(function(){ _fixupRowLabels(); });
    _rowObserver.observe(_collList, { childList: true, subtree: true });
  }
})();
