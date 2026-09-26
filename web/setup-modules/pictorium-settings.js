            (function(){
              const PICTORIUM_RENDER_VERSION = '67dc78827a';
              function picChecked(id){ const el=document.getElementById(id); return !!(el && el.checked); }
              function picNumber(id, fallback, min, max){ const el=document.getElementById(id); const n=Number(el && el.value); return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback; }
              const pictoriumSliderMeta={
                pictoriumGradHeight:'pictoriumGradHeightNumber', pictoriumBlur:'pictoriumBlurNumber', pictoriumBlurFade:'pictoriumBlurFadeNumber', pictoriumBlurDarkness:'pictoriumBlurDarknessNumber',
                pictoriumTopScale:'pictoriumTopScaleNumber', pictoriumGenreScale:'pictoriumGenreScaleNumber', pictoriumQualityScale:'pictoriumQualityScaleNumber', pictoriumNetworkScale:'pictoriumNetworkScaleNumber',
                pictoriumTopOffsetX:'pictoriumTopOffsetXNumber', pictoriumTopOffsetY:'pictoriumTopOffsetYNumber',
                pictoriumLogoScale:'pictoriumLogoScaleNumber', pictoriumLogoOffsetX:'pictoriumLogoOffsetXNumber', pictoriumLogoOffsetY:'pictoriumLogoOffsetYNumber'
              };
              function syncPictoriumSlider(rangeId,copyToNumber){
                const el=document.getElementById(rangeId); if(!el) return;
                const min=Number(el.min||0), max=Number(el.max||100), value=Number(el.value||0);
                const fill=max>min?Math.max(0,Math.min(100,((value-min)/(max-min))*100)):0;
                el.style.setProperty('--fill',fill+'%');
                if(copyToNumber!==false){ const out=document.getElementById(pictoriumSliderMeta[rangeId]); if(out) out.value=String(value); }
              }
              function syncAllPictoriumSliders(){ Object.keys(pictoriumSliderMeta).forEach(function(id){ syncPictoriumSlider(id,true); }); }
              window.pictoriumSliderChanged=function(rangeId,advanced){ syncPictoriumSlider(rangeId,true); if(advanced) pictoriumAdvancedSizeChanged(); else updatePictoriumStyle(); };
              window.pictoriumNumberChanged=function(rangeId,numberId,advanced){
                const range=document.getElementById(rangeId), input=document.getElementById(numberId); if(!range||!input||String(input.value).trim()==='') return;
                let value=Number(input.value); if(!Number.isFinite(value)) return;
                const min=Number(input.min||range.min||0), max=Number(input.max||range.max||100); value=Math.max(min,Math.min(max,value));
                input.value=String(value); range.value=String(value); syncPictoriumSlider(rangeId,false);
                if(advanced) pictoriumAdvancedSizeChanged(); else updatePictoriumStyle();
              };
              window.syncPictoriumSlider=syncPictoriumSlider;
              window.syncAllPictoriumSliders=syncAllPictoriumSliders;
              function pictoriumIsTemplate(value){
                const raw=String(value||'');
                return raw.includes('/api/poster/') && (raw.includes('{imdb_id}') || raw.includes('{tmdb_id}')) && (raw.includes('{type}') || raw.includes('{media_type}'));
              }
              function pictoriumCustomValue(){
                return String((document.getElementById('pictoriumCustomUrl')||{}).value||'').trim();
              }
              function pictoriumInstanceBase(){
                const mode=(document.getElementById('pictoriumInstanceMode')||{}).value||'hosted';
                const customBox=document.getElementById('pictoriumCustomInstance');
                if(customBox) customBox.style.display=mode==='custom'?'block':'none';
                if(mode!=='custom') return window.location.origin+'/pictorium';
                const raw=pictoriumCustomValue();
                if(!raw) return '';
                try {
                  const probe=raw.replace('{type}','movie').replace('{media_type}','movie').replace('{imdb_id}','tt0111161');
                  const url=new URL(probe);
                  if(url.protocol!=='https:' && url.protocol!=='http:') return '';
                  const marker='/api/poster';
                  const markerAt=url.pathname.indexOf(marker);
                  let path=markerAt>=0?url.pathname.slice(0,markerAt):url.pathname;
                  path=path.replace(/\/+$/,'');
                  return url.origin+path;
                } catch(e) { return ''; }
              }
              function buildPictoriumStyle(){
                const enabled=document.getElementById('pictoriumEnabled');
                if(!enabled || !enabled.checked) return '';
                const mode=(document.getElementById('pictoriumInstanceMode')||{}).value||'hosted';
                const customValue=mode==='custom'?pictoriumCustomValue():'';
                if(mode==='custom' && pictoriumIsTemplate(customValue)) return customValue;
                const base=pictoriumInstanceBase();
                if(!base) return '';
                const params=new URLSearchParams();
                if(mode==='hosted') params.set('rv',PICTORIUM_RENDER_VERSION);
                params.set('badges',picChecked('pictoriumBadges')?'1':'0');
                params.set('ranking',picChecked('pictoriumRanking')?'1':'0');
                params.set('bg',picChecked('pictoriumGenre')?'1':'0');
                params.set('by',picChecked('pictoriumYear')?'1':'0');
                params.set('br',picChecked('pictoriumRating')?'1':'0');
                params.set('bq',picChecked('pictoriumQuality')?'1':'0');
                params.set('bs',(document.getElementById('pictoriumBadgeStyle')||{}).value||'shadow');
                params.set('rs',(document.getElementById('pictoriumRankingStyle')||{}).value||'default');
                params.set('side',(document.getElementById('pictoriumSide')||{}).value||'left');
                params.set('region',((document.getElementById('pictoriumRegion')||{}).value||'GB').toUpperCase());
                params.set('netLogo',picChecked('pictoriumNetworkLogo')?'1':'0');
                params.set('be',picChecked('pictoriumBlurEnabled')?'1':'0');
                params.set('gradHeight',String(picNumber('pictoriumGradHeight',30,5,100)));
                params.set('blur',String(picNumber('pictoriumBlur',5,0,100)));
                params.set('bf',String(picNumber('pictoriumBlurFade',60,0,100)));
                params.set('bd',String(picNumber('pictoriumBlurDarkness',40,0,100)));
                params.set('tscale',String(picNumber('pictoriumTopScale',100,10,200)));
                params.set('tox',String(picNumber('pictoriumTopOffsetX',0,-2000,2000)));
                params.set('toy',String(picNumber('pictoriumTopOffsetY',0,-2000,2000)));
                params.set('gscale',String(picNumber('pictoriumGenreScale',100,10,200)));
                params.set('qscale',String(picNumber('pictoriumQualityScale',100,10,200)));
                params.set('netscale',String(picNumber('pictoriumNetworkScale',100,10,200)));
                if(picChecked('pictoriumLogoOverride')){
                  params.set('scale',String(picNumber('pictoriumLogoScale',75,10,200)));
                  params.set('ox',String(picNumber('pictoriumLogoOffsetX',0,-2000,2000)));
                  params.set('oy',String(picNumber('pictoriumLogoOffsetY',0,-2000,2000)));
                }
                if(picChecked('pictoriumPreRelease')) params.set('pre','1');
                const sources=Array.from(document.querySelectorAll('.pictorium-rating-source:checked')).map(el=>el.value);
                if(sources.length) params.set('rsrc',sources.join(','));
                return base+'/api/poster/{media_type}/{tmdb_id}?'+params.toString();
              }
              function pictoriumSetSizeValues(scale){
                ['pictoriumTopScale','pictoriumGenreScale','pictoriumQualityScale','pictoriumNetworkScale'].forEach(function(id){ const el=document.getElementById(id); if(el) el.value=String(scale); });
                const ox=document.getElementById('pictoriumTopOffsetX'); if(ox) ox.value='0';
                const oy=document.getElementById('pictoriumTopOffsetY'); if(oy) oy.value='0';
              }
              function pictoriumSyncReadabilityPreset(){
                const select=document.getElementById('pictoriumReadability');
                if(!select) return;
                const values=['pictoriumTopScale','pictoriumGenreScale','pictoriumQualityScale','pictoriumNetworkScale'].map(function(id){ return picNumber(id,100,10,200); });
                const offsets=[picNumber('pictoriumTopOffsetX',0,-2000,2000),picNumber('pictoriumTopOffsetY',0,-2000,2000)];
                if(offsets[0]!==0 || offsets[1]!==0 || !values.every(function(v){ return v===values[0]; })) select.value='custom';
                else if(values[0]===100) select.value='standard';
                else if(values[0]===125) select.value='large';
                else if(values[0]===150) select.value='xlarge';
                else select.value='custom';
              }
              window.applyPictoriumReadabilityPreset=function(value){
                if(value==='standard') pictoriumSetSizeValues(100);
                else if(value==='large') pictoriumSetSizeValues(125);
                else if(value==='xlarge') pictoriumSetSizeValues(150);
                else return;
                updatePictoriumStyle();
              };
              window.pictoriumAdvancedSizeChanged=function(){
                pictoriumSyncReadabilityPreset();
                updatePictoriumStyle();
              };
              window.pictoriumSyncReadabilityPreset=pictoriumSyncReadabilityPreset;
              function syncPictoriumLogoOverrideUi(){ const box=document.getElementById('pictoriumLogoTransformControls'); if(box) box.style.display=picChecked('pictoriumLogoOverride')?'block':'none'; }
              window.pictoriumLogoOverrideChanged=function(){ syncPictoriumLogoOverrideUi(); updatePictoriumStyle(); };
              window.updatePictoriumStyle=function(){
                syncAllPictoriumSliders();
                syncPictoriumLogoOverrideUi();
                const enabled=picChecked('pictoriumEnabled');
                const opts=document.getElementById('pictoriumOptions');
                const track=document.getElementById('pictoriumToggleTrack');
                const thumb=document.getElementById('pictoriumToggleThumb');
                if(opts) opts.style.display=enabled?'block':'none';
                if(track) track.style.background=enabled?'var(--accent,#7B2FFF)':'#2a2a45';
                if(thumb) thumb.style.transform=enabled?'translateX(20px)':'translateX(0)';
                if(enabled){
                  const bp=document.getElementById('bpEnabled');
                  if(bp && bp.checked){ bp.checked=false; if(typeof window.updateBPStyle==='function') window.updateBPStyle(); }
                }
                const style=buildPictoriumStyle();
                const hidden=document.getElementById('betterPostersStyleHidden');
                if(hidden && (enabled || pictoriumIsTemplate(hidden.value))) hidden.value=style;
                const preview=document.getElementById('pictoriumUrlPreview');
                const mode=(document.getElementById('pictoriumInstanceMode')||{}).value||'hosted';
                const customBox=document.getElementById('pictoriumCustomInstance');
                if(customBox) customBox.style.display=mode==='custom'?'block':'none';
                const privateLink=document.getElementById('pictoriumOpenPrivateLink');
                const privateBase=mode==='custom'?pictoriumInstanceBase():'';
                if(privateLink){
                  if(privateBase){
                    privateLink.href=privateBase;
                    privateLink.setAttribute('aria-disabled','false');
                    privateLink.textContent='Open private Pictorium ↗';
                    privateLink.style.color='var(--accent)';
                    privateLink.style.cursor='pointer';
                    privateLink.style.opacity='1';
                    privateLink.style.pointerEvents='auto';
                  } else {
                    privateLink.href='#';
                    privateLink.setAttribute('aria-disabled','true');
                    privateLink.textContent='Enter a private URL first';
                    privateLink.style.color='var(--text2)';
                    privateLink.style.cursor='not-allowed';
                    privateLink.style.opacity='.6';
                    privateLink.style.pointerEvents='none';
                  }
                }
                if(preview) preview.textContent=style||(enabled && mode==='custom'?'Enter a valid custom Pictorium URL':'— disabled');
                if(pictoriumPreviewActive) schedulePictoriumPreview();
              };
              let pictoriumPreviewActive=false;
              let pictoriumPreviewTimer=null;
              let pictoriumPreviewSequence=0;
              function buildPictoriumPreviewUrl(){
                const style=buildPictoriumStyle();
                if(!style) return '';
                const languageValue=String((document.getElementById('language')||{}).value||'en-US');
                const previewLanguage=(languageValue.split('-')[0]||'en').toLowerCase();
                let testUrl=style
                  .replace('{type}','movie')
                  .replace('{media_type}','movie')
                  .replace('{tmdb_id}','278')
                  .replace('{imdb_id}','tt0111161');
                try {
                  const parsed=new URL(testUrl);
                  if(!parsed.searchParams.has('title')) parsed.searchParams.set('title','The Shawshank Redemption');
                  if(!parsed.searchParams.has('rd')) parsed.searchParams.set('rd','1994-09-23');
                  if(!parsed.searchParams.has('lang')) parsed.searchParams.set('lang',previewLanguage);
                  parsed.searchParams.set('_um_preview',String(Date.now()));
                  return parsed.toString();
                } catch(e) { return ''; }
              }
              function renderPictoriumPreview(){
                if(!pictoriumPreviewActive) return;
                const result=document.getElementById('pictoriumTestResult');
                const img=document.getElementById('pictoriumTestImg');
                const status=document.getElementById('pictoriumTestStatus');
                if(!result || !img || !status) return;
                const testUrl=buildPictoriumPreviewUrl();
                result.style.display='block';
                if(!testUrl){
                  img.style.display='none';
                  status.textContent='Enter a valid Pictorium URL to preview.';
                  status.style.color='var(--text2)';
                  return;
                }
                const sequence=++pictoriumPreviewSequence;
                img.style.opacity='.45';
                status.textContent='Rendering current Pictorium settings…';
                status.style.color='var(--text2)';
                img.onload=function(){
                  if(sequence!==pictoriumPreviewSequence) return;
                  img.style.display='block';
                  img.style.opacity='1';
                  status.textContent='✅ Live Pictorium preview';
                  status.style.color='#22c55e';
                };
                img.onerror=function(){
                  if(sequence!==pictoriumPreviewSequence) return;
                  img.style.display='none';
                  img.style.opacity='1';
                  status.textContent='❌ Pictorium poster failed to load.';
                  status.style.color='#ef4444';
                };
                img.src=testUrl;
              }
              function schedulePictoriumPreview(){
                clearTimeout(pictoriumPreviewTimer);
                pictoriumPreviewTimer=setTimeout(renderPictoriumPreview,450);
              }
              window.testPictoriumUrl=function(){
                pictoriumPreviewActive=true;
                clearTimeout(pictoriumPreviewTimer);
                renderPictoriumPreview();
              };
              document.addEventListener('DOMContentLoaded',function(){ updatePictoriumStyle(); });
            })();
