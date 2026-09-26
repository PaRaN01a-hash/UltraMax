(function(){
  var _autoSaveTimer = null;
  var _autoSaveIdle = null;

  function runAutoSave(){
    _autoSaveIdle = null;
    if (typeof saveDraftState === 'function') {
      try {
        saveDraftState();
      } catch(e) {
        console.warn('Auto-save failed', e);
      }
    }
  }

  function cancelIdleSave(){
    if (_autoSaveIdle === null) return;
    if (typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(_autoSaveIdle);
    } else {
      clearTimeout(_autoSaveIdle);
    }
    _autoSaveIdle = null;
  }

  function scheduleAutoSave(){
    if (_autoSaveTimer) {
      clearTimeout(_autoSaveTimer);
      _autoSaveTimer = null;
    }
    cancelIdleSave();

    _autoSaveTimer = setTimeout(function(){
      _autoSaveTimer = null;

      if (typeof window.requestIdleCallback === 'function') {
        _autoSaveIdle = window.requestIdleCallback(runAutoSave, {
          timeout: 2500
        });
        return;
      }

      _autoSaveIdle = setTimeout(runAutoSave, 0);
    }, 1500);
  }

  // setup-autosave.js owns the input/change listeners. Collection/folder
  // edits call this scheduler directly from renderCollections(). Keeping one
  // scheduler avoids duplicate full draft serialisations.
  window.umScheduleAutoSave = scheduleAutoSave;
})();
