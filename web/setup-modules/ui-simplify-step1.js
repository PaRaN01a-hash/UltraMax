(function(){
  function normaliseLabel(value){
    return String(value || '')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/optional/gi, '')
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase();
  }

  function simplifyStep1(){
    var shell = document.getElementById('optionalEnhancementsShell');
    if(!shell || shell.dataset.simpleUiReady === '1') return;

    shell.classList.add('s1-optional-shell-clean');

    if(!shell.querySelector(':scope > .s1-optional-heading')){
      var heading = document.createElement('div');
      heading.className = 's1-optional-heading';
      heading.innerHTML =
        '<div><span class="s1-optional-kicker">OPTIONAL</span>' +
        '<h2>Enhancements</h2>' +
        '<p>Only open the extras you actually want. Everything here can be skipped.</p></div>';
      shell.insertBefore(heading, shell.firstChild);
    }

    var details = Array.from(
      shell.querySelectorAll(':scope > details.opt-subsection')
    );

    details.forEach(function(section){
      section.classList.add('s1-optional-card');

      var summary = section.querySelector(':scope > summary');
      if(summary){
        summary.classList.add('s1-optional-card-summary');
      }

      var summaryText = normaliseLabel(summary && summary.textContent);
      var firstLabel = section.querySelector('.field-label');
      var labelText = normaliseLabel(firstLabel && firstLabel.textContent);

      if(
        firstLabel &&
        summaryText &&
        labelText &&
        (
          summaryText === labelText ||
          summaryText.indexOf(labelText) === 0 ||
          labelText.indexOf(summaryText) === 0
        )
      ){
        firstLabel.classList.add('s1-redundant-label');
      }
    });

    // Streams already have their own collapse behaviour. Give that shell the
    // same visual language instead of introducing a second interaction model.
    var streams = document.getElementById('advancedStreamBridgeBlock');
    if(streams){
      streams.classList.add('s1-streams-clean');
      var streamsShell = streams.querySelector('.optional-shell');
      if(streamsShell) streamsShell.classList.add('s1-streams-card');
    }

    shell.dataset.simpleUiReady = '1';
  }

  simplifyStep1();
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', simplifyStep1, {once:true});
  }
  window.addEventListener('load', simplifyStep1, {once:true});
})();
