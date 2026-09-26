// Auto-save progress as user types
document.addEventListener("DOMContentLoaded", function(){
  var saveTimer;
  function autoSave(){
    if(typeof window.umScheduleAutoSave === 'function'){
      window.umScheduleAutoSave();
      return;
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      if(typeof saveDraftState === "function"){
        saveDraftState();
        showAutoSaveIndicator();
      }
    }, 1000);
  }

  function flushAutoSave(){
    clearTimeout(saveTimer);
    if(typeof saveDraftState === "function"){
      try { saveDraftState(); } catch(e) {}
    }
  }
  
  function showAutoSaveIndicator(){
    var el = document.getElementById("autoSaveIndicator");
    if(!el){
      el = document.createElement("div");
      el.id = "autoSaveIndicator";
      el.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,210,160,0.15);border:1px solid rgba(0,210,160,0.3);color:#00d2a0;font-size:12px;padding:6px 14px;border-radius:100px;font-family:Inter,sans-serif;font-weight:600;z-index:9999;transition:opacity .3s;pointer-events:none;";
      document.body.appendChild(el);
    }
    el.textContent = umT('setup.assetLibrary.draftSaved', "✓ Progress saved");
    el.style.opacity = "1";
    clearTimeout(el._timer);
    el._timer = setTimeout(function(){ el.style.opacity = "0"; }, 2000);
  }
  document.addEventListener("input", autoSave);
  document.addEventListener("change", autoSave);

  // Android may suspend or kill the WebView as soon as the user switches out
  // to fetch an API key. Flush synchronously when the page is backgrounded so
  // the latest field never depends on the 1-second debounce completing.
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState === "hidden") flushAutoSave();
  });
  window.addEventListener("pagehide", flushAutoSave);
  window.addEventListener("beforeunload", flushAutoSave);

  // Auto-restore on load — skip if token loading in progress
  setTimeout(function(){
    var hasUrlToken = new URLSearchParams(window.location.search).get('token');
    if(
      !hasUrlToken &&
      !window._tokenLoadInProgress &&
      !window._skipDraftAutoRestore &&
      typeof restoreDraftState === "function"
    ){
      try{ restoreDraftState(); }catch(e){}
    }
  }, 500);
});
