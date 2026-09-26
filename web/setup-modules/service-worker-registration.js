if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').then(function(reg){
    console.log('SW registered:', reg.scope);
  }).catch(function(e){
    console.log('SW failed:', e);
  });
}
