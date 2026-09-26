function syncUltraMaxWizardContext(reason){
  if(
    window.ULTRAMAX_SHARED_WIZARD_CONTEXT_ENABLED === false ||
    !window.UltraMaxWizardContext
  ){
    return null;
  }
  return window.UltraMaxWizardContext.setUltraMaxContext(
    window.generatedToken || editToken || null,
    window.activeDeviceProfileId || null,
    window.activeDeviceProfileName || null
  );
}

function clearUltraMaxWizardContextForNewSetup(){
  if(
    window.ULTRAMAX_SHARED_WIZARD_CONTEXT_ENABLED !== false &&
    window.UltraMaxWizardContext
  ){
    window.UltraMaxWizardContext.clearUltraMaxContext();
  }
}
