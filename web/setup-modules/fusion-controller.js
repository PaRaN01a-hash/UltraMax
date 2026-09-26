        window.fusionState = { shareUrl: null, shareId: null, lastPayload: null, previewRequest: 0, previousFocus: null };

        function fusionToggleCard(){
          s4ToggleCard('fusion');
          var body = document.getElementById('s4body-fusion');
          if(body && body.style.display !== 'none') fusionRefreshStatus();
        }

        function fusionActiveProfileId(){
          if(window.activeDeviceProfileId){
            return window.activeDeviceProfileId;
          }

          var profiles = Array.isArray(window.deviceProfiles)
            ? window.deviceProfiles
            : [];

          if(profiles.length === 1 && profiles[0] && profiles[0].id){
            return String(profiles[0].id);
          }

          return null;
        }

        function fusionSetupToken(){
          return String(
            window.generatedToken ||
            editToken ||
            sessionStorage.getItem('um_setup_token') ||
            ''
          ).trim();
        }

        function fusionSetMsg(text, kind){
          var el = document.getElementById('fusionMsg');
          if(!el) return;
          el.textContent = text || '';
          el.style.color = kind === 'error' ? '#ff6b6b' : (kind === 'ok' ? '#00d2a0' : 'var(--muted)');
        }

        function fusionSetButtonsEnabled(enabled){
          ['fusionPreviewBtn','fusionCopyJsonBtn','fusionDownloadBtn','fusionGenerateBtn'].forEach(function(id){
            var btn = document.getElementById(id);
            if(btn) btn.disabled = !enabled;
          });
        }

        function fusionQuery(){
          var profileId = fusionActiveProfileId();
          return profileId ? ('?profile=' + encodeURIComponent(profileId)) : '';
        }

        async function fusionFetchPreview(){
          var token = fusionSetupToken();
          if(!token) throw new Error('Generate your Final Setup first.');

          var res = await fetch(
            '/c/' + encodeURIComponent(token) + '/fusion/preview' + fusionQuery(),
            { cache: 'no-store' }
          );

          var data = await res.json().catch(function(){ return {}; });

          if(res.status === 404){
            throw new Error('Generate your Final Setup first.');
          }

          if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
          return data;
        }

        async function fusionFetchShareStatus(){
          var token = fusionSetupToken();
          if(!token) return null;

          var res = await fetch(
            '/c/' + encodeURIComponent(token) + '/fusion/share' + fusionQuery()
          );

          var data = await res.json().catch(function(){ return {}; });

          if(res.status === 404) return null;
          if(!res.ok) return null;

          return data.share || null;
        }

        function fusionUpdateShareUi(share){
          var stat = document.getElementById('fusionStatShare');
          var urlRow = document.getElementById('fusionUrlRow');
          var urlField = document.getElementById('fusionUrlField');
          var copyBtn = document.getElementById('fusionCopyUrlBtn');
          var revokeBtn = document.getElementById('fusionRevokeBtn');

          window.fusionState.shareUrl = share ? share.url : null;
          window.fusionState.shareId = share ? share.shareId : null;

          if(share){
            if(stat) stat.textContent = umT('setup.fusion.active', 'Active');
            if(urlRow) urlRow.style.display = 'block';
            if(urlField) urlField.value = share.url;
            if(copyBtn) copyBtn.disabled = false;
            if(revokeBtn) revokeBtn.disabled = false;
          } else {
            if(stat) stat.textContent = umT('setup.fusion.none', 'None');
            if(urlRow) urlRow.style.display = 'none';
            if(urlField) urlField.value = '';
            if(copyBtn) copyBtn.disabled = true;
            if(revokeBtn) revokeBtn.disabled = true;
          }
        }

        async function fusionRefreshStatus(){
          var noColl = document.getElementById('fusionNoCollections');
          var statusBlock = document.getElementById('fusionStatusBlock');

          var token = fusionSetupToken();

          if(!token){
            if(noColl) noColl.style.display = 'block';
            if(statusBlock) statusBlock.style.display = 'none';
            fusionSetButtonsEnabled(false);
            fusionSetMsg('Generate your Final Setup first.');
            return;
          }

          if(!(v2Collections && v2Collections.length)){
            if(noColl) noColl.style.display = 'block';
            if(statusBlock) statusBlock.style.display = 'none';
            fusionSetButtonsEnabled(false);
            fusionSetMsg('Create at least one collection in Step 3 first.');
            return;
          }
          if(noColl) noColl.style.display = 'none';
          if(statusBlock) statusBlock.style.display = 'block';

          fusionSetMsg('Loading…');
          try {
            var preview = await fusionFetchPreview();
            window.fusionState.lastPayload = preview.payload;

            var profileEl = document.getElementById('fusionStatProfile');
            if(profileEl) profileEl.textContent = preview.profileName || 'Default';
            var wEl = document.getElementById('fusionStatWidgets'); if(wEl) wEl.textContent = preview.summary.widgets;
            var tEl = document.getElementById('fusionStatTiles'); if(tEl) tEl.textContent = preview.summary.tiles;
            var sEl = document.getElementById('fusionStatSources'); if(sEl) sEl.textContent = preview.summary.dataSources;

            var hasWidgets = preview.summary.widgets > 0;
            fusionSetButtonsEnabled(hasWidgets);
            document.getElementById('fusionGenerateBtn').disabled = !hasWidgets;

            if(!hasWidgets){
              fusionSetMsg('No exportable widgets yet — every folder needs at least one resolvable movie or series source.', 'error');
            } else if(preview.summary.skippedSources > 0){
              fusionSetMsg(preview.summary.skippedSources + ' source(s) skipped — see Preview for details.', '');
            } else {
              fusionSetMsg('');
            }

            var share = await fusionFetchShareStatus();
            fusionUpdateShareUi(share);
          } catch(e) {
            fusionSetButtonsEnabled(false);
            fusionSetMsg('Could not load Fusion status: ' + e.message, 'error');
          }
        }

        function fusionEscapeHtml(s){
          return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
            return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
          });
        }

        function fusionSafeImageUrl(url){
          try {
            var parsed = new URL(String(url || ''), window.location.href);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
          } catch(e) {
            return '';
          }
        }

        function fusionPreviewEmpty(message){
          return '<div style="color:var(--faint);padding:24px 4px;text-align:center;">' + fusionEscapeHtml(message) + '</div>';
        }

        function fusionPreviewSkeleton(){
          return '<div class="fusion-skeleton" aria-hidden="true"></div><div class="fusion-skeleton" style="height:110px;width:72%;" aria-hidden="true"></div><span class="sr-only">Loading Fusion preview</span>';
        }

        function fusionTileKinds(tile){
          var seen = {};
          (tile.dataSources || []).forEach(function(source){
            var type = source && source.payload && source.payload.type;
            if(type === 'movie' || type === 'series') seen[type] = true;
          });
          return Object.keys(seen).join(' · ');
        }

        function fusionRenderVisual(preview){
          var target = document.getElementById('fusionPreviewVisual');
          if(!target) return;
          var payload = preview && preview.payload ? preview.payload : {};
          var widgets = Array.isArray(payload.widgets) ? payload.widgets : [];
          var warningHtml = '';
          if(preview.summary && preview.summary.skippedSources > 0){
            warningHtml = '<div class="fusion-preview-warning" role="status">' +
              fusionEscapeHtml(preview.summary.skippedSources + ' source' + (preview.summary.skippedSources === 1 ? '' : 's') + ' skipped. Open Structure & JSON for details.') +
              '</div>';
          }
          if(!widgets.length){
            target.innerHTML = warningHtml + fusionPreviewEmpty('No Fusion-compatible widgets could be generated.');
            return;
          }
          target.innerHTML = warningHtml + widgets.map(function(widget, widgetIndex){
            var items = widget && widget.dataSource && widget.dataSource.payload && Array.isArray(widget.dataSource.payload.items)
              ? widget.dataSource.payload.items : [];
            var tiles = items.map(function(tile, tileIndex){
              var aspect = ['wide','poster','square'].indexOf(tile.imageAspect) >= 0 ? tile.imageAspect : 'wide';
              var imageUrl = fusionSafeImageUrl(tile.imageURL);
              var sourceCount = Array.isArray(tile.dataSources) ? tile.dataSources.length : 0;
              var kinds = fusionTileKinds(tile);
              var image = imageUrl
                ? '<img src="' + fusionEscapeHtml(imageUrl) + '" alt="' + fusionEscapeHtml(tile.title || 'Fusion tile artwork') + '" loading="lazy" decoding="async">'
                : '';
              return '<article class="fusion-tile" data-aspect="' + aspect + '" tabindex="0" aria-label="' +
                fusionEscapeHtml((tile.title || 'Untitled tile') + ', ' + sourceCount + ' source' + (sourceCount === 1 ? '' : 's')) + '">' +
                '<div class="fusion-tile-art">' +
                '<div class="fusion-tile-fallback" aria-hidden="true">ULTRA MAX</div>' + image +
                '<span class="fusion-source-badge">' + sourceCount + ' source' + (sourceCount === 1 ? '' : 's') + '</span></div>' +
                '<div class="fusion-tile-title" title="' + fusionEscapeHtml(tile.title || 'Untitled') + '">' + fusionEscapeHtml(tile.title || 'Untitled') + '</div>' +
                (kinds ? '<div class="fusion-tile-kind">' + fusionEscapeHtml(kinds) + '</div>' : '') +
                '</article>';
            }).join('');
            return '<section class="fusion-widget" aria-labelledby="fusion-widget-' + widgetIndex + '">' +
              '<div class="fusion-widget-title" id="fusion-widget-' + widgetIndex + '">' + fusionEscapeHtml(widget.title || 'Untitled widget') + '</div>' +
              '<div class="fusion-widget-meta">' + items.length + ' tile' + (items.length === 1 ? '' : 's') + ' · Fusion collection row</div>' +
              '<div class="fusion-tile-rail" tabindex="0" aria-label="' + fusionEscapeHtml((widget.title || 'Widget') + ' tiles') + '">' + tiles + '</div></section>';
          }).join('');
          target.querySelectorAll('.fusion-tile-art img').forEach(function(img){
            function hideFallback(){
              var art = img.closest('.fusion-tile-art');
              var fallback = art
                ? art.querySelector('.fusion-tile-fallback')
                : null;

              if(fallback){
                fallback.style.display = 'none';
              }
            }

            img.addEventListener('load', hideFallback, { once: true });

            img.addEventListener('error', function(){
              img.remove();
            }, { once: true });

            // Cached images may already be complete before listeners attach.
            if(img.complete && img.naturalWidth > 0){
              hideFallback();
            }
          });
          target.querySelectorAll('.fusion-tile-rail').forEach(function(rail){
            rail.addEventListener('wheel', function(event){
              if(Math.abs(event.deltaY) > Math.abs(event.deltaX) && rail.scrollWidth > rail.clientWidth){
                event.preventDefault();
                rail.scrollBy({ left: event.deltaY, behavior: 'smooth' });
              }
            }, { passive: false });
            rail.addEventListener('keydown', function(event){
              var amount = Math.max(140, Math.round(rail.clientWidth * .7));
              if(event.key === 'ArrowRight'){ event.preventDefault(); rail.scrollBy({left:amount,behavior:'smooth'}); }
              if(event.key === 'ArrowLeft'){ event.preventDefault(); rail.scrollBy({left:-amount,behavior:'smooth'}); }
              if(event.key === 'Home'){ event.preventDefault(); rail.scrollTo({left:0,behavior:'smooth'}); }
              if(event.key === 'End'){ event.preventDefault(); rail.scrollTo({left:rail.scrollWidth,behavior:'smooth'}); }
            });
          });
        }

        function fusionRenderStructure(preview){
          var body = document.getElementById('fusionPreviewBody');
          if(!body) return;
          var widgets = preview.payload.widgets || [];
          body.innerHTML = widgets.length ? widgets.map(function(w){
            var items = (w.dataSource && w.dataSource.payload && w.dataSource.payload.items) || [];
            return '<div class="fusion-structure-widget">' +
              '<div style="font-weight:700;color:#fff;font-size:12px;margin-bottom:2px;">' + fusionEscapeHtml(w.title) + '</div>' +
              '<div style="font-size:10px;color:var(--faint);margin-bottom:4px;">' + items.length + ' tile(s)</div>' +
              items.map(function(item){
                var count = Array.isArray(item.dataSources) ? item.dataSources.length : 0;
                return '<div class="fusion-structure-row"><span style="color:var(--text);">' + fusionEscapeHtml(item.title) + '</span>' +
                  '<span style="color:var(--faint);flex-shrink:0;">' + count + ' source' + (count === 1 ? '' : 's') + '</span></div>';
              }).join('') + '</div>';
          }).join('') : fusionPreviewEmpty('No Fusion-compatible widgets could be generated.');
          if(preview.summary.warnings && preview.summary.warnings.length){
            body.innerHTML += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:10px;color:#ffb454;">' +
              preview.summary.warnings.map(fusionEscapeHtml).join('<br>') + '</div>';
          }
        }

        function fusionSelectPreviewTab(tab){
          var visual = tab === 'visual';
          var visualTab = document.getElementById('fusionVisualTab');
          var structureTab = document.getElementById('fusionStructureTab');
          var visualPanel = document.getElementById('fusionVisualPanel');
          var structurePanel = document.getElementById('fusionStructurePanel');
          visualTab.setAttribute('aria-selected', visual ? 'true' : 'false');
          structureTab.setAttribute('aria-selected', visual ? 'false' : 'true');
          visualPanel.hidden = !visual;
          structurePanel.hidden = visual;
          (visual ? visualTab : structureTab).focus();
        }

        async function fusionPreviewWidgets(){
          var modal = document.getElementById('fusionPreviewModal');
          var visual = document.getElementById('fusionPreviewVisual');
          var body = document.getElementById('fusionPreviewBody');
          var raw = document.getElementById('fusionRawJsonBody');
          window.fusionState.previousFocus = document.activeElement;
          window.fusionState.lastPayload = null;
          window.fusionState.previewRequest += 1;
          var requestId = window.fusionState.previewRequest;
          if(modal) modal.style.display = 'flex';
          fusionSelectPreviewTab('visual');
          if(visual) visual.innerHTML = fusionPreviewSkeleton();
          if(body) body.innerHTML = fusionPreviewSkeleton();
          if(raw){ raw.textContent = ''; raw.style.display = 'none'; }
          if(!fusionSetupToken()){
            if(visual) visual.innerHTML = fusionPreviewEmpty('Generate your Final Setup first.');
            if(body) body.innerHTML = fusionPreviewEmpty('Generate your Final Setup first.');
            return;
          }
          if(!(window.v2Collections && window.v2Collections.length)){
            if(visual) visual.innerHTML = fusionPreviewEmpty('Create at least one collection in Step 3.');
            if(body) body.innerHTML = fusionPreviewEmpty('Create at least one collection in Step 3.');
            return;
          }
          fusionSetMsg('Building preview…');
          try {
            var preview = await fusionFetchPreview();
            if(requestId !== window.fusionState.previewRequest) return;
            window.fusionState.lastPayload = preview.payload;
            fusionRenderVisual(preview);
            fusionRenderStructure(preview);
            if(raw) raw.textContent = JSON.stringify(preview.payload, null, 2);
            fusionSetMsg('');
          } catch(e) {
            if(requestId !== window.fusionState.previewRequest) return;
            window.fusionState.lastPayload = null;
            if(raw) raw.textContent = '';
            if(visual) visual.innerHTML = fusionPreviewEmpty(e.message);
            if(body) body.innerHTML = fusionPreviewEmpty(e.message);
            fusionSetMsg('Could not build preview: ' + e.message, 'error');
          }
        }

        function fusionCloseModal(){
          var modal = document.getElementById('fusionPreviewModal');
          if(modal) modal.style.display = 'none';
          window.fusionState.previewRequest += 1;
          if(window.fusionState.previousFocus && typeof window.fusionState.previousFocus.focus === 'function') window.fusionState.previousFocus.focus();
        }

        function fusionModalBackdrop(event){
          if(event.target === document.getElementById('fusionPreviewModal')) fusionCloseModal();
        }

        function fusionToggleRawJson(){
          var body = document.getElementById('fusionRawJsonBody');
          var chev = document.getElementById('fusionRawJsonChev');
          if(!body) return;
          var open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          if(chev) chev.classList.toggle('s4-open', !open);
        }

        document.addEventListener('keydown', function(event){
          var modal = document.getElementById('fusionPreviewModal');
          if(!modal || modal.style.display === 'none') return;
          if(event.key === 'Escape'){ event.preventDefault(); fusionCloseModal(); }
          if(event.key === 'Tab'){
            var focusable = Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]),[tabindex="0"]')).filter(function(el){ return !el.hidden && el.offsetParent !== null; });
            if(!focusable.length) return;
            var first = focusable[0], last = focusable[focusable.length - 1];
            if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
            else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
          }
        });

        async function fusionCopyToClipboard(text){
          try {
            await navigator.clipboard.writeText(text);
            return true;
          } catch(e) {
            try {
              var ta = document.createElement('textarea');
              ta.value = text;
              ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
              document.body.appendChild(ta);
              ta.focus(); ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              return true;
            } catch(e2) {
              return false;
            }
          }
        }

        async function fusionCopyJson(){
          if(!fusionSetupToken()){
            fusionSetMsg('Generate your Final Setup first.', 'error');
            return;
          }
          fusionSetMsg('Copying…');
          try {
            var preview = await fusionFetchPreview();
            var ok = await fusionCopyToClipboard(JSON.stringify(preview.payload, null, 2));
            fusionSetMsg(ok ? 'Fusion JSON copied to clipboard.' : 'Copy failed — try Download instead.', ok ? 'ok' : 'error');
            if(ok && typeof showToast === 'function') showToast(umT('setup.fusion.fusionJsonCopied', 'Fusion JSON copied'));
          } catch(e) {
            fusionSetMsg('Could not copy: ' + e.message, 'error');
          }
        }

        function fusionDownloadFile(){
          var token = fusionSetupToken();

          if(!token){
            fusionSetMsg('Generate your Final Setup first.', 'error');
            return;
          }

          var url =
            '/c/' +
            encodeURIComponent(token) +
            '/fusion/download.json' +
            fusionQuery();
          var a = document.createElement('a');
          a.href = url;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }

        async function fusionGenerateImportUrl(){
          var token = fusionSetupToken();

          if(!token){
            fusionSetMsg('Generate your Final Setup first.', 'error');
            return;
          }
          if(window.fusionState.shareUrl){
            if(!confirm(umT('setup.fusion.replaceYourCurrentFusionImportUrl', 'Replace your current Fusion import URL? The old link will stop working immediately.'))) return;
          }
          fusionSetMsg('Generating import URL…');
          try {
            var res = await fetch(
              '/c/' + encodeURIComponent(token) + '/fusion/share',
              {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profile: fusionActiveProfileId() })
              }
            );
            var data = await res.json();
            if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
            fusionUpdateShareUi(data);
            fusionSetMsg('Import URL ready.', 'ok');
            if(typeof showToast === 'function') showToast(umT('setup.fusion.fusionImportUrlGenerated', 'Fusion import URL generated'));
          } catch(e) {
            fusionSetMsg('Could not generate import URL: ' + e.message, 'error');
          }
        }

        async function fusionCopyImportUrl(){
          if(!window.fusionState.shareUrl) return;
          var ok = await fusionCopyToClipboard(window.fusionState.shareUrl);
          fusionSetMsg(ok ? 'Import URL copied to clipboard.' : 'Copy failed — select the URL field manually.', ok ? 'ok' : 'error');
          if(ok && typeof showToast === 'function') showToast(umT('setup.fusion.importUrlCopied', 'Import URL copied'));
        }

        async function fusionRevokeUrl(){
          var token = fusionSetupToken();

          if(!token || !window.fusionState.shareId) return;
          if(!confirm(umT('setup.fusion.revokeThisFusionImportUrlAnything', 'Revoke this Fusion import URL? Anything using it (including Fusion itself) will stop updating immediately.'))) return;
          fusionSetMsg('Revoking…');
          try {
            var res = await fetch(
              '/c/' + encodeURIComponent(token) + '/fusion/share/revoke',
              {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ shareId: window.fusionState.shareId })
              }
            );
            var data = await res.json();
            if(!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
            fusionUpdateShareUi(null);
            fusionSetMsg('Import URL revoked.', 'ok');
            if(typeof showToast === 'function') showToast(umT('setup.fusion.fusionImportUrlRevoked', 'Fusion import URL revoked'));
          } catch(e) {
            fusionSetMsg('Could not revoke: ' + e.message, 'error');
          }
        }
