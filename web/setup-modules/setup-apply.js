// Handle gallery import on page load
(function(){
  var params = new URLSearchParams(window.location.search);
  if(params.get('import') === 'gallery'){
    var type = sessionStorage.getItem('um_import_type');

    function applyCollections(colls){
      if(typeof normalizeImportedCollections === 'function'){
        v2Collections = normalizeImportedCollections(colls);
        window.v2Collections = v2Collections;
        if(typeof renderCollections === 'function') renderCollections();
      }
    }

    function applySetup(setup){
      if(setup.catalogs && typeof selected !== 'undefined'){
        selected = new Set(setup.catalogs);
        if(typeof renderCatalogs === 'function') renderCatalogs();
        if(typeof updateCounter === 'function') updateCounter();
      }
      if(setup.collections) applyCollections(setup.collections);
      if(setup.language){
        var langEl = document.getElementById('language');
        if(langEl) langEl.value = setup.language;
      }
      if(setup.displayStyle){
        var dsEl = document.getElementById('displayStyle');
        if(dsEl) dsEl.value = setup.displayStyle;
      }
    }

    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(function(){
        try{
          if(type === 'collections' || type === 'both'){
            var raw = sessionStorage.getItem('um_import_collections');
            if(raw) applyCollections(JSON.parse(raw));
          }
          if(type === 'setup' || type === 'both'){
            var raw = sessionStorage.getItem('um_import_setup');
            if(raw) applySetup(JSON.parse(raw));
          }
          // Import the saved data without skipping the setup entry screen.
          if(typeof setStep === 'function') setStep(1);
        }catch(e){ console.error('Import error:', e); }
        sessionStorage.removeItem('um_import_collections');
        sessionStorage.removeItem('um_import_setup');
        sessionStorage.removeItem('um_import_type');
      }, 800);
    });
  }
})();
