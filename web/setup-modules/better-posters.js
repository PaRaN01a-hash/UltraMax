            (function(){
              function buildBPStyle() {
                if (!document.getElementById('bpEnabled').checked) return '';
                const rating  = document.getElementById('betterPostersStyle').value;
                const trend   = document.getElementById('bpTrend').checked;
                const quality = document.getElementById('bpQuality').checked;
                const genre   = document.getElementById('bpGenre').checked;
                const age     = document.getElementById('bpAge').checked;
                const hasRating = rating && rating !== 'none';
                let flags = hasRating ? 'r' : genre ? 'g' : 'n';
                if (quality) flags += 'q';
                if (age) flags += 'a';
                const ratingMap = {imdb:'IM',tmdb:'TM',rt:'RT',metacritic:'MC',trakt:'TR',letterboxd:'LB',rogerebert:'RE'};
                let params = [];
                if (!trend) params.push('tag=none');
                if (hasRating && ratingMap[rating]) params.push('rs=' + ratingMap[rating]);
                const query = params.length ? '?' + params.join('&') : '';
                return 'https://btttr.cc/poster-' + flags + '/imdb/poster-default/{imdb_id}.jpg' + query;
              }
              window.updateBPStyle = function() {
                const enabled = document.getElementById('bpEnabled').checked;
                if (enabled) {
                  const pictoriumToggle = document.getElementById('pictoriumEnabled');
                  const pictoriumOptions = document.getElementById('pictoriumOptions');
                  if (pictoriumToggle) pictoriumToggle.checked = false;
                  if (pictoriumOptions) pictoriumOptions.style.display = 'none';
                }
                const opts = document.getElementById('bpOptions');
                const track = document.getElementById('bpToggleTrack');
                const thumb = document.getElementById('bpToggleThumb');
                opts.style.display = enabled ? 'block' : 'none';
                track.style.background = enabled ? 'var(--accent,#7B2FFF)' : '#2a2a45';
                thumb.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)';
                const style = buildBPStyle();
                document.getElementById('betterPostersStyleHidden').value = style;
                const preview = document.getElementById('bpUrlPreview');
                if (style) {
                  preview.textContent = style;
                } else {
                  preview.textContent = umT('setup.optional.betterPosters.disabledPreview', '— disabled');
                }
              };
              window.onBpManualInput = function(){
                var manual = document.getElementById('bpManualUrl').value.trim();
                if(manual){
                  const pic=document.getElementById('pictoriumEnabled');
                  const picOpts=document.getElementById('pictoriumOptions');
                  if(pic) pic.checked=false;
                  if(picOpts) picOpts.style.display='none';
                  document.getElementById('betterPostersStyleHidden').value = manual;
                  document.getElementById('bpUrlPreview').textContent = manual;
                } else {
                  // Fall back to auto-generated
                  updateBPStyle();
                }
              };
              window.testBpUrl = function(){
                var url = document.getElementById('bpUrlPreview').textContent;
                if(!url || url === '—' || url === '— disabled') return;
                var testUrl = url.replace('{imdb_id}', 'tt0111161');
                var img = document.getElementById('bpTestImg');
                var status = document.getElementById('bpTestStatus');
                var result = document.getElementById('bpTestResult');
                result.style.display = 'block';
                status.textContent = umT('setup.optional.betterPosters.testing', 'Testing...');
                status.style.color = 'var(--text2)';
                img.style.display = 'none';
                img.onload = function(){ img.style.display='block'; status.textContent = umT('setup.optional.betterPosters.testOk', '✅ Working! Poster loaded successfully.'); status.style.color = '#22c55e'; };
                img.onerror = function(){ img.style.display='none'; status.textContent = umT('setup.optional.betterPosters.testFailed', '❌ Failed to load — check your URL or try btttr.cc manually.'); status.style.color = '#ef4444'; };
                img.src = testUrl;
              };
              // Init on load
              

document.addEventListener('DOMContentLoaded', function() {
                updateBPStyle();
              });
            })();
