          (function initialiseMobileStep1Cards(global){
            var initialized = false;
            var wasCompact = null;

            function cards(){
              return Array.prototype.slice.call(
                document.querySelectorAll('[data-mobile-setup-card]')
              );
            }
            function isCompact(){
              var narrow = global.matchMedia('(max-width: 899px)').matches;
              var touchLike = global.matchMedia('(pointer: coarse)').matches || global.matchMedia('(hover: none)').matches;
              return document.documentElement.classList.contains('um-app-mode') || (narrow && touchLike);
            }
            function directHeader(card){
              return Array.prototype.find.call(card.children, function(child){
                return child.classList.contains('mobile-setup-card-header');
              }) || null;
            }
            function setOpen(card, open){
              card.classList.toggle('is-open', !!open);
              var header = directHeader(card);
              if(header) header.setAttribute('aria-expanded', open ? 'true' : 'false');
            }
            function closeAll(except){
              cards().forEach(function(card){
                if(card !== except) setOpen(card, false);
              });
            }
            function toggleCard(card){
              if(!isCompact()) return;
              var shouldOpen = !card.classList.contains('is-open');
              closeAll(shouldOpen ? card : null);
              setOpen(card, shouldOpen);
            }
            function setCardState(card, text, className){
              if(!card) return;

              var managedClasses = ['is-complete', 'is-connected', 'is-error'];
              var currentClass = managedClasses.find(function(name){
                return card.classList.contains(name);
              }) || '';
              var nextClass = className || '';

              if(currentClass !== nextClass){
                managedClasses.forEach(function(name){
                  card.classList.toggle(name, name === nextClass);
                });
              }

              var state = card.querySelector('[data-mobile-card-state]');
              if(state && state.textContent !== text){
                state.textContent = text;
              }
            }
            function updateStates(){
              var passwordCard = document.querySelector('[data-mobile-setup-card="password"]');
              var password = document.getElementById('password');
              var confirm = document.getElementById('confirmPassword');
              var confirmVisible = confirm && confirm.style.display !== 'none';
              var passwordSet = !!(
                password &&
                password.value &&
                (!confirmVisible || (confirm && confirm.value === password.value))
              );
              setCardState(
                passwordCard,
                passwordSet ? 'Set' : 'Not set',
                passwordSet ? 'is-complete' : ''
              );

              var mdbCard = document.querySelector('[data-mobile-setup-card="mdblist"]');
              var mdbResult = document.getElementById('result-mdblist');
              var mdbButton = document.getElementById('verify-mdblist');
              var tmdbResult = document.getElementById('result-tmdb');
              var tmdbButton = document.getElementById('verify-tmdb');
              var providerState = typeof getDiscoveryProviderState === 'function'
                ? getDiscoveryProviderState()
                : { hasAnyDiscoveryProvider: false, hasMdblist: false, hasTmdb: false };
              var mdbState = typeof discoveryProviderStatusText === 'function'
                ? discoveryProviderStatusText(providerState)
                : 'Not set';
              var mdbClass = providerState.hasAnyDiscoveryProvider ? 'is-complete' : '';
              if((mdbButton && mdbButton.disabled && /checking/i.test(mdbButton.textContent || '')) ||
                 (tmdbButton && tmdbButton.disabled && /checking/i.test(tmdbButton.textContent || ''))){
                mdbState = 'Checking';
              }else if((providerState.hasMdblist && mdbResult && mdbResult.classList.contains('fail')) ||
                       (providerState.hasTmdb && tmdbResult && tmdbResult.classList.contains('fail'))){
                mdbState = 'Invalid';
                mdbClass = 'is-error';
              }
              setCardState(mdbCard, mdbState, mdbClass);

              var nuvioCard = document.querySelector('[data-mobile-setup-card="nuvio"]');
              var context = global.UltraMaxWizardContext;
              var connected = !!(
                context &&
                typeof context.isNuvioConnected === 'function' &&
                context.isNuvioConnected()
              );
              var selected = connected &&
                typeof context.getSelectedNuvioProfile === 'function'
                  ? context.getSelectedNuvioProfile()
                  : null;
              setCardState(
                nuvioCard,
                connected ? 'Connected' : 'Not connected',
                connected ? 'is-connected' : ''
              );
              var nuvioSummary = nuvioCard &&
                nuvioCard.querySelector('[data-mobile-nuvio-summary]');
              if(nuvioSummary){
                var nuvioSummaryText = selected && selected.name
                  ? 'Profile: ' + selected.name
                  : connected
                    ? 'Connected — choose a profile.'
                    : 'Optional account connection.';
                if(nuvioSummary.textContent !== nuvioSummaryText){
                  nuvioSummary.textContent = nuvioSummaryText;
                }
              }
            }
            function handleResize(){
              var compact = isCompact();
              if(compact && wasCompact !== true) closeAll(null);
              wasCompact = compact;
            }
            function initialize(){
              if(initialized) return;
              initialized = true;
              cards().forEach(function(card){
                setOpen(card, false);
                var header = directHeader(card);
                if(header){
                  header.addEventListener('click', function(){
                    toggleCard(card);
                  });
                }
              });
              document.addEventListener('input', updateStates, true);
              document.addEventListener('change', updateStates, true);
              var mdbResult = document.getElementById('result-mdblist');
              var mdbButton = document.getElementById('verify-mdblist');
              if(typeof MutationObserver === 'function'){
                [mdbResult, mdbButton].forEach(function(element){
                  if(!element) return;
                  new MutationObserver(updateStates).observe(element, {
                    attributes: true,
                    childList: true,
                    characterData: true,
                    subtree: true
                  });
                });
              }
              global.addEventListener('resize', handleResize);
              handleResize();
              updateStates();
            }

            global.updateMobileSetupCardStates = updateStates;
            global.UltraMaxMobileStep1Cards = Object.freeze({
              initialize: initialize,
              closeAll: function(){ closeAll(null); },
              updateStates: updateStates
            });
            initialize();
            if(document.readyState === 'loading'){
              document.addEventListener('DOMContentLoaded', updateStates);
            }
          })(window);
