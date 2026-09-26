          // Step 3 install-guide text now lives in i18n/*.json under
          // "setup.step3Local.*" (data-i18n attributes on the markup above).
          // This re-applies translations if this section is ever re-rendered
          // after the initial load.
          function applyStep3LocalCopy(){
            if(window.umApplyTranslations) window.umApplyTranslations(document);
          }
          if(window.umReady && typeof window.umReady.then === 'function'){
            window.umReady.then(applyStep3LocalCopy);
          } else {
            document.addEventListener('DOMContentLoaded', applyStep3LocalCopy);
          }

          function s4ToggleCard(key){
            var body = document.getElementById('s4body-' + key);
            var chev = document.getElementById('s4chev-' + key);
            if(!body) return;
            var open = body.style.display !== 'none';
            body.style.display = open ? 'none' : 'block';
            if(chev) chev.classList.toggle('s4-open', !open);
          }
