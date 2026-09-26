(function(){
  function closestCardFromBody(id){
    var body = document.getElementById(id);
    return body ? body.parentElement : null;
  }

  function simplifyManualInstall(addonCard){
    if(!addonCard) return;
    addonCard.classList.add('s4-manual-install-card');

    var children = Array.from(addonCard.children || []);
    if(children[0]){
      children[0].textContent = 'MANUAL INSTALL';
      children[0].removeAttribute('data-i18n');
    }
    if(children[1]){
      children[1].textContent = 'Addon URL';
      children[1].removeAttribute('data-i18n');
    }
    if(children[2]){
      children[2].textContent = 'Use this if you want to add Ultra MAX to Nuvio manually by URL.';
      children[2].removeAttribute('data-i18n');
    }

    var stremioInstall = document.getElementById('installBtn');
    if(stremioInstall) stremioInstall.hidden = true;

    var legacyHelp = children[5];
    if(legacyHelp) legacyHelp.hidden = true;
  }

  function simplifyStep4(){
    var step = document.getElementById('step-4');
    var stack = document.getElementById('s4Stack');
    if(!step || !stack || stack.dataset.simpleUiReady === '1') return;

    var topNav = step.querySelector('.step3-top-nav');
    if(topNav){
      var backButtons = Array.from(topNav.querySelectorAll('button'));
      if(backButtons.length > 1){
        backButtons.slice(1).forEach(function(button){
          button.classList.add('s4-secondary-back');
          button.hidden = true;
        });
      }
    }

    var summary = step.querySelector('.step3-summary');
    if(summary){
      summary.classList.add('s4-clean-summary');
      var metricWrap = summary.querySelector(':scope > div:nth-of-type(2)');
      if(metricWrap) metricWrap.classList.add('s4-summary-metrics');
      var hint = document.getElementById('finalHint');
      if(hint) hint.classList.add('s4-summary-hint');
    }

    var addonCard = document.getElementById('urlDisplay');
    addonCard = addonCard ? addonCard.closest('#s4Stack > div') : null;
    var nuvioCard = document.getElementById('pushToNuvioCard');
    var token = document.getElementById('tokenDisplayNew');
    var tokenCard = token ? token.parentElement && token.parentElement.parentElement : null;

    simplifyManualInstall(addonCard);

    if(nuvioCard){
      nuvioCard.style.order = '1';
      nuvioCard.classList.add('s4-primary-result');
    }
    if(tokenCard){
      tokenCard.style.order = '3';
      tokenCard.classList.add('s4-token-primary');
    }

    var optionalCards = [
      addonCard,
      closestCardFromBody('s4body-profiles'),
      closestCardFromBody('s4body-email'),
      closestCardFromBody('s4body-nuviojson'),
      closestCardFromBody('s4body-fusion'),
      stack.querySelector('.step3-export-section')
    ].filter(Boolean);

    if(optionalCards.length){
      var details = document.createElement('details');
      details.id = 's4MoreOptions';
      details.className = 's4-more-options';
      details.style.order = '4';

      var summaryEl = document.createElement('summary');
      summaryEl.innerHTML =
        '<span class="s4-more-icon" aria-hidden="true">＋</span>' +
        '<span class="s4-more-copy"><strong>More options</strong>' +
        '<small>Manual install, device profiles, recovery, exports and specialist tools</small></span>' +
        '<span class="s4-more-chev" aria-hidden="true">⌄</span>';

      var body = document.createElement('div');
      body.className = 's4-more-options-body';

      details.appendChild(summaryEl);
      details.appendChild(body);
      stack.appendChild(details);

      optionalCards.forEach(function(card){
        card.style.order = '';
        body.appendChild(card);
      });
    }

    var instructionsLabel = step.querySelector('.step3-instructions .result-label');
    if(instructionsLabel){
      instructionsLabel.textContent = 'HOW FINISH WORKS';
      instructionsLabel.removeAttribute('data-i18n');
    }

    stack.dataset.simpleUiReady = '1';
  }

  simplifyStep4();
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', simplifyStep4, {once:true});
  }
  window.addEventListener('load', simplifyStep4, {once:true});
})();