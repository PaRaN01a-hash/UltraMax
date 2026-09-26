const pathParts = window.location.pathname.split('/').filter(Boolean);
if(pathParts.includes('configure') && pathParts[pathParts.length-1] !== 'configure'){
  editToken = pathParts[pathParts.length-1];
  window.um_isReturningUser = true;
  document.getElementById('editBanner').classList.add('visible');
  document.getElementById('confirmPassword').style.display = 'none';
  document.getElementById('password').placeholder = umT('setup.streams.enterYourPasswordToSaveChanges', 'Enter your password to save changes');

  // This script is parsed before um-session.js. Defer the resume until the
  // rest of the page scripts exist, then authenticate the config request with
  // the remembered password. The old flow fired an unauthenticated request
  // first and never retried it, leaving saved provider keys blank.
  setTimeout(function(){
    var remembered = (typeof umGetSession === 'function') ? umGetSession() : null;
    var rememberedToken = remembered
      ? String(remembered.token || '').trim().toUpperCase()
      : '';
    var currentToken = String(editToken || '').trim().toUpperCase();

    if (remembered && remembered.password && rememberedToken === currentToken) {
      _configPassword = remembered.password;

      var pwEl = document.getElementById('password');
      if (pwEl) pwEl.value = remembered.password;

      var confirmEl = document.getElementById('confirmPassword');
      if (confirmEl) confirmEl.value = remembered.password;

      var rememberEl = document.getElementById('rememberMeDevice');
      if (rememberEl) rememberEl.checked = true;

      loadConfigByToken(editToken).then(function(){
        if(typeof scheduleLoadedStep1CredentialUiRefresh === 'function'){
          scheduleLoadedStep1CredentialUiRefresh();
        }
      });
      return;
    }

    if(typeof showTokenPasswordModal === 'function'){
      showTokenPasswordModal(editToken);
    }
  }, 0);
}

window.addEventListener('resize', makeSprockets);
window.addEventListener('load', function(){
  try { setTimeout(makeSprockets, 300); } catch(e) { console.error('makeSprockets failed', e); }
  try { updateCategoryCounts(); } catch(e) { console.error('updateCategoryCounts failed', e); }
  // initCollapsible disabled — old pill system removed
});
setTimeout(makeSprockets, 100);

document.addEventListener('DOMContentLoaded', function(){
  showAdvancedBuilderV3();
});



// Final generate button animation wrapper
(function(){
  if(window.__ultraGenerateAnimated) return;
  window.__ultraGenerateAnimated = true;

  const originalGenerate = window.generate;

  window.generate = async function(){
    const btn = document.getElementById('genBtn');
    if(btn){
      btn.classList.remove('generated');
      btn.classList.add('generating');
      btn.innerHTML = umT('setup.guided.buildingSetup', 'Building<br>Setup...');
    }

    try{
      const result = originalGenerate ? await originalGenerate.apply(this, arguments) : undefined;

      if(result === false){
        if(btn){
          btn.classList.remove('generating');
          btn.innerHTML = umT('setup.guided.generateFinalSetup', '🚀 Generate<br>Final Setup');
        }
        return result;
      }

      if(btn){
        btn.classList.remove('generating');
        btn.classList.add('generated');
        btn.innerHTML = umT('setup.guided.readySetupBuilt', '✅ Ready<br>Setup Built');
      }

      const resultBox = document.getElementById('resultBox');
      if(resultBox){
        setTimeout(() => {
          resultBox.scrollIntoView({behavior:'smooth', block:'start'});
        }, 400);
      }

      return result;
    }catch(err){
      if(btn){
        btn.classList.remove('generating');
        btn.innerHTML = umT('setup.guided.generateFinalSetup2', '🚀 Generate<br>Final Setup');
      }
      throw err;
    }
  };
})();


