if(typeof window.ULTRAMAX_STEP1_NUVIO_PANEL_ENABLED === 'undefined'){
  window.ULTRAMAX_STEP1_NUVIO_PANEL_ENABLED = true;
}
if(typeof window.ULTRAMAX_GLOBAL_NUVIO_HOME_ONLY === 'undefined'){
  window.ULTRAMAX_GLOBAL_NUVIO_HOME_ONLY = true;
}

(function initialiseStep1NuvioPanel(global){
  var initialized = false;
  var submitting = false;

  function byId(id){ return document.getElementById(id); }
  function context(){ return global.UltraMaxWizardContext || null; }
  function setStatus(message, kind){
    var element = byId('step1NuvioStatus');
    if(!element) return;
    element.textContent = message || '';
    element.dataset.kind = kind || '';
    if(typeof global.updateMobileSetupCardStates === 'function'){
      global.setTimeout(global.updateMobileSetupCardStates, 0);
    }
  }
  function setDisabled(disabled){
    [
      'step1NuvioConnectButton','step1NuvioLoginButton',
      'step1NuvioLoginCancel','step1NuvioProfile',
      'step1NuvioChangeProfile','step1NuvioChangeAccount',
      'step1NuvioDisconnect'
    ].forEach(function(id){
      var element = byId(id);
      if(element) element.disabled = disabled;
    });
  }
  function renderProfiles(snapshot){
    var select = byId('step1NuvioProfile');
    if(!select) return;
    var current = snapshot.nuvio.selectedProfileId || '';
    select.textContent = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = umT('setup.nuvioPushWidget.chooseAProfile', 'Choose a profile');
    select.appendChild(placeholder);
    snapshot.nuvio.profiles.forEach(function(profile){
      var option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      select.appendChild(option);
    });
    select.value = current;
  }
  function render(event){
    var controller = context();
    if(!controller) return;
    var snapshot = controller.getSnapshot();
    var status = snapshot.nuvio.status;
    var connected = controller.isNuvioConnected();
    var selected = controller.getSelectedNuvioProfile();
    var bound = controller.isBoundToCurrentUltraMaxContext();
    var disconnected = byId('step1NuvioDisconnected');
    var login = byId('step1NuvioLoginForm');
    var profiles = byId('step1NuvioProfiles');
    var badge = byId('step1NuvioBadge');
    var cancel = byId('step1NuvioLoginCancel');
    var loginRequested = login.dataset.open === 'true';
    var changingAccount = connected &&
      loginRequested &&
      login.dataset.mode === 'changeAccount';

    // Connection visibility is derived only from the controller. The form's
    // data attributes describe the reversible account-change UI mode.
    disconnected.hidden = true;
    login.hidden = connected && !changingAccount;
    profiles.hidden = !connected || changingAccount;
    cancel.hidden = !changingAccount && !loginRequested;
    renderProfiles(snapshot);
    setDisabled(status === 'connecting' || submitting);

    if(status === 'connecting'){
      badge.textContent = umT('setup.nuvioPushWidget.connecting', 'Connecting');
      setStatus('Connecting to Nuvio…');
      return;
    }
    if(status === 'expired'){
      badge.textContent = umT('setup.nuvioPushWidget.expired', 'Expired');
      setStatus('Your Nuvio connection expired. Reconnect to continue using Nuvio features.', 'error');
      byId('step1NuvioConnectButton').textContent = umT('setup.nuvioPushWidget.reconnect', 'Reconnect');
      return;
    }
    if(status === 'error'){
      badge.textContent = umT('setup.nuvioPushWidget.connectionError', 'Connection error');
      setStatus('Could not connect to Nuvio. Check your details and try again.', 'error');
      byId('step1NuvioConnectButton').textContent = umT('setup.nuvioPushWidget.retry', 'Retry');
      return;
    }
    if(!connected){
      badge.textContent = umT('setup.nuvioPushWidget.notConnected', 'Not connected');
      byId('step1NuvioConnectButton').textContent = umT('setup.nuvioPushWidget.connectNuvio', 'Connect Nuvio');
      if(!submitting) setStatus('');
      return;
    }

    badge.textContent = umT('setup.nuvioPushWidget.connected', 'Connected');
    if(bound && selected){
      setStatus(
        'Connected. Later Nuvio actions will use ' + selected.name + '.',
        'success'
      );
    }else if(snapshot.nuvio.bindingState === 'pending' && selected){
      setStatus(
        selected.name + ' is selected and will be linked when this new setup receives its token.'
      );
    }else if(
      snapshot.nuvio.bindingState === 'cleared' ||
      (event && event.type === 'nuvioBindingCleared' && event.reason === 'ultraMaxContextChanged')
    ){
      setStatus('Your Ultra MAX setup changed. Choose the Nuvio profile to use with this setup.');
    }else{
      setStatus('Connected. Choose the Nuvio profile to use in later setup steps.');
    }
  }
  function openLogin(mode){
    var form = byId('step1NuvioLoginForm');
    form.dataset.open = 'true';
    form.dataset.mode = mode === 'changeAccount' ? 'changeAccount' : 'connect';
    form.hidden = false;
    byId('step1NuvioDisconnected').hidden = true;
    if(form.dataset.mode === 'changeAccount'){
      byId('step1NuvioProfiles').hidden = true;
    }
    byId('step1NuvioEmail').focus();
  }
  function closeLogin(){
    var form = byId('step1NuvioLoginForm');
    form.dataset.open = 'false';
    form.dataset.mode = '';
    form.hidden = true;
    byId('step1NuvioPassword').value = '';
    render();
  }
  async function login(event){
    event.preventDefault();
    if(submitting) return;
    var email = byId('step1NuvioEmail').value.trim();
    var passwordInput = byId('step1NuvioPassword');
    var password = passwordInput.value;
    if(!email || !password){
      setStatus('Enter your Nuvio email and password.', 'error');
      return;
    }
    submitting = true;
    setDisabled(true);
    try{
      var result = await context().connectWithCredentials(email, password, {
        remember: byId('step1NuvioRemember').checked
      });
      if(!result || result.stale) return;
      byId('step1NuvioLoginForm').dataset.open = 'false';
      byId('step1NuvioLoginForm').dataset.mode = '';
      render();
      byId('step1NuvioProfile').focus();
    }catch(_error){
      render();
    }finally{
      passwordInput.value = '';
      submitting = false;
      setDisabled(false);
    }
  }
  function selectProfile(event){
    var controller = context();
    var id = event.target.value;
    if(!id){
      controller.clearNuvioProfileSelection('step1ProfileCleared');
      render();
      return;
    }
    var selected = controller.selectNuvioProfile(id, 'step1AccountPanel');
    if(!selected){
      setStatus('Choose a valid Nuvio profile.', 'error');
      render();
      return;
    }
    controller.bindNuvioToCurrentUltraMaxContext();
    render();
  }
  async function disconnect(){
    setDisabled(true);
    await context().disconnectNuvio('step1ExplicitDisconnect');
    byId('step1NuvioEmail').value = '';
    byId('step1NuvioPassword').value = '';
    byId('step1NuvioRemember').checked = false;
    render();
  }
  async function initialize(){
    if(initialized || global.ULTRAMAX_STEP1_NUVIO_PANEL_ENABLED === false) return;
    var panel = byId('step1NuvioPanel');
    var controller = context();
    if(!panel || !controller) return;
    initialized = true;

    if(global.ULTRAMAX_GLOBAL_NUVIO_HOME_ONLY === true){
      panel.hidden = true;
      setStatus('Checking for an existing Nuvio session…');
      try{
        await controller.restoreRememberedSessionOnce();
      }finally{
        // Step 1 no longer owns Nuvio authentication. The shared context is
        // restored silently so later profile selectors are ready to use.
        panel.hidden = true;
      }
      return;
    }

    panel.hidden = false;
    byId('step1NuvioConnectButton').addEventListener('click', function(){
      openLogin('connect');
    });
    byId('step1NuvioLoginCancel').addEventListener('click', closeLogin);
    byId('step1NuvioLoginForm').addEventListener('submit', login);
    byId('step1NuvioProfile').addEventListener('change', selectProfile);
    byId('step1NuvioChangeProfile').addEventListener('click', function(){
      byId('step1NuvioProfile').focus();
    });
    byId('step1NuvioChangeAccount').addEventListener('click', function(){
      // Keep the current connection available while this reversible form is
      // open; deliberately do not call disconnectNuvio('step1ChangeAccount').
      byId('step1NuvioEmail').value = '';
      byId('step1NuvioPassword').value = '';
      openLogin('changeAccount');
    });
    byId('step1NuvioDisconnect').addEventListener('click', disconnect);
    controller.subscribe(render);
    render();
    setStatus('Checking for an existing Nuvio session…');
    try{
      await controller.restoreRememberedSessionOnce();
    }finally{
      render();
    }
  }

  global.UltraMaxStep1NuvioPanel = Object.freeze({
    initialize: initialize,
    render: render
  });
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initialize);
  }else{
    initialize();
  }
})(window);
