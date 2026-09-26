(function(global){
  'use strict';

  function getCapturedToken(){
    var token = String(global.__UM_NUVIO_PREFILL_TOKEN || '')
      .trim()
      .toUpperCase();

    if(!/^[A-Z0-9]{8}$/.test(token)){
      try {
        token = String(
          new URLSearchParams(global.location.search)
            .get('prefillToken') || ''
        ).trim().toUpperCase();
      } catch(_error) {}
    }

    return /^[A-Z0-9]{8}$/.test(token)
      ? token
      : '';
  }

  function cleanPrefillUrl(){
    try {
      var url = new URL(global.location.href);
      url.searchParams.delete('prefillToken');
      global.history.replaceState(
        global.history.state,
        '',
        url.pathname + url.search + url.hash
      );
    } catch(_error) {}
  }

  function applyPrefill(){
    var token = getCapturedToken();
    if(!token) return false;

    var input = document.getElementById('welcomeTokenInput');
    if(!input) return false;

    input.value = token;

    try {
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new Event('change', {bubbles:true}));
    } catch(_error) {}

    document.documentElement.setAttribute(
      'data-nuvio-prefill-applied',
      '1'
    );

    cleanPrefillUrl();
    global.__UM_NUVIO_PREFILL_TOKEN = '';

    if(typeof global.welcomeSubmitToken === 'function'){
      global.welcomeSubmitToken();
      return true;
    }

    if(typeof welcomeSubmitToken === 'function'){
      welcomeSubmitToken();
      return true;
    }

    return false;
  }

  function run(){
    if(applyPrefill()) return;

    var attempts = 0;
    var timer = setInterval(function(){
      attempts += 1;
      if(applyPrefill() || attempts >= 10){
        clearInterval(timer);
      }
    }, 50);
  }

  // The token input and normal loader functions already exist when this
  // script executes. Run immediately so later Setup initialisers cannot
  // clear or replace the prefill state before we use it.
  run();

  global.UltraMaxNuvioTokenPrefill = Object.freeze({
    apply: applyPrefill
  });
})(window);
