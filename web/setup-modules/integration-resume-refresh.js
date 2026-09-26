window.addEventListener('pageshow', function(event){
  if(event.persisted || document.visibilityState === 'visible'){
    if(typeof scheduleIntegrationResumeRefresh === 'function') scheduleIntegrationResumeRefresh();
  }
});
window.addEventListener('focus', function(){
  if(typeof scheduleIntegrationResumeRefresh === 'function') scheduleIntegrationResumeRefresh();
});
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && typeof scheduleIntegrationResumeRefresh === 'function'){
    scheduleIntegrationResumeRefresh();
  }
});
