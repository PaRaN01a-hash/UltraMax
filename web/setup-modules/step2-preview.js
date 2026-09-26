function s2EscapeHtml(value){
  return String(value == null ? '' : value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

function s2FindCategoryForCatalog(id){
  return S2_CATEGORIES.find(function(cat){
    try{
      return cat.filter(id);
    }catch(e){
      return false;
    }
  }) || null;
}

function s2GetPreviewPosters(id, index){
  var cat = s2FindCategoryForCatalog(id);

  if(cat && Array.isArray(cat.posters) && cat.posters.length){
    return cat.posters;
  }

  var categoryKey = cat && cat.id ? cat.id : null;

  if(categoryKey && S2_POSTER_IDS[categoryKey]){
    return S2_POSTER_IDS[categoryKey];
  }

  var pools = Object.keys(S2_POSTER_IDS)
    .map(function(key){ return S2_POSTER_IDS[key]; })
    .filter(function(pool){
      return Array.isArray(pool) && pool.length;
    });

  return pools.length
    ? pools[index % pools.length]
    : S2_POSTER_IDS.quickpicks;
}

function s2PreviewTitleForImdb(imdbId, fallbackIndex){
  var titles = {
    tt0816692:'Interstellar',
    tt1375666:'Inception',
    tt0468569:'The Dark Knight',
    tt15398776:'Oppenheimer',
    tt6710474:'Everything Everywhere All at Once',
    tt2582802:'Whiplash',
    tt5180504:'The Witcher',
    tt7366338:'Chernobyl',
    tt2442560:'Peaky Blinders',
    tt3581920:'The Last of Us',
    tt2707408:'Narcos',
    tt0110912:'Pulp Fiction',
    tt0137523:'Fight Club',
    tt0245429:'Spirited Away',
    tt3783958:'La La Land',
    tt0099685:'Goodfellas',
    tt0407887:'The Departed',
    tt1160419:'Dune',
    tt0111161:'The Shawshank Redemption',
    tt0068646:'The Godfather',
    tt0071562:'The Godfather Part II',
    tt0050083:'12 Angry Men',
    tt0108052:"Schindler's List",
    tt4633694:'Spider-Man: Into the Spider-Verse',
    tt1745960:'Top Gun: Maverick',
    tt0172495:'Gladiator',
    tt0903747:'Breaking Bad',
    tt0944947:'Game of Thrones',
    tt3032476:'Better Call Saul',
    tt2306299:'Vikings',
    tt1475582:'Sherlock',
    tt0108778:'Friends',
    tt0499549:'Avatar',
    tt4520988:'Frozen II',
    tt0892769:'How to Train Your Dragon',
    tt4116284:'The Lego Batman Movie'
  };

  return titles[imdbId] || ('Featured title ' + (fallbackIndex + 1));
}

function s2PreviewYearForImdb(imdbId){
  var years = {
    tt0816692:'2014',
    tt1375666:'2010',
    tt0468569:'2008',
    tt15398776:'2023',
    tt6710474:'2022',
    tt2582802:'2014',
    tt5180504:'2019',
    tt7366338:'2019',
    tt2442560:'2013',
    tt3581920:'2023',
    tt2707408:'2015',
    tt0110912:'1994',
    tt0137523:'1999',
    tt0245429:'2001',
    tt3783958:'2016',
    tt0099685:'1990',
    tt0407887:'2006',
    tt1160419:'2021',
    tt0111161:'1994',
    tt0068646:'1972',
    tt0071562:'1974',
    tt0050083:'1957',
    tt0108052:'1993',
    tt4633694:'2018',
    tt1745960:'2022',
    tt0172495:'2000',
    tt0903747:'2008',
    tt0944947:'2011',
    tt3032476:'2015',
    tt2306299:'2013',
    tt1475582:'2010',
    tt0108778:'1994',
    tt0499549:'2009',
    tt4520988:'2019',
    tt0892769:'2010',
    tt4116284:'2017'
  };

  return years[imdbId] || '';
}

function s2PreviewCleanLabel(label){
  return String(label || '')
    .replace(/^[^\w]+/,'')
    .replace(/\s*[·•]\s*(Movies|Series)$/i,'')
    .replace(/\s*\((Movies|Series)\)$/i,'')
    .trim();
}

var s2LivePreviewCache = Object.create(null);
var s2LivePreviewPending = Object.create(null);
var s2LivePreviewControllers = Object.create(null);
var s2LivePreviewGeneration = 0;

function s2PreviewContextActive(){
  var step = document.getElementById('step-2');
  var modal = document.getElementById('s2Modal');

  var stepActive = !!(
    step &&
    step.classList.contains('active')
  );

  var modalOpen = !!(
    modal &&
    !modal.hidden &&
    window.getComputedStyle(modal).display !== 'none'
  );

  return stepActive || modalOpen;
}

function s2CancelLivePreviewWork(){
  s2LivePreviewGeneration += 1;

  Object.keys(s2LivePreviewControllers).forEach(function(key){
    var controller = s2LivePreviewControllers[key];
    if(controller && typeof controller.abort === 'function'){
      try { controller.abort(); } catch(_error) {}
    }
    delete s2LivePreviewControllers[key];
  });

  Object.keys(s2LivePreviewPending).forEach(function(key){
    delete s2LivePreviewPending[key];
  });

  if(typeof s2HideRowPreview === 'function'){
    s2HideRowPreview();
  }
}

function s2GetPreviewToken(){
  if(typeof editToken !== 'undefined' && editToken){
    return String(editToken).trim();
  }

  if(window.generatedToken){
    return String(window.generatedToken).trim();
  }

  try{
    var stored = sessionStorage.getItem('um_setup_token');
    if(stored) return String(stored).trim();
  }catch(error){}

  var params = new URLSearchParams(window.location.search);
  return String(params.get('token') || '').trim();
}

function s2GetCatalogType(id){
  var def = S2_DEFS && S2_DEFS[id];

  if(def && (def.type === 'movie' || def.type === 'series')){
    return def.type;
  }

  if(
    /series|_tv_|network_|airing|ontheair|show|watchlist_series/i.test(id)
  ){
    return 'series';
  }

  return 'movie';
}

function s2PreviewMetaYear(meta){
  if(!meta) return '';

  var value =
    meta.releaseInfo ||
    meta.year ||
    meta.released ||
    '';

  var match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
}

function s2PreviewNormaliseMeta(meta){
  meta = meta || {};

  return {
    id: String(meta.id || ''),
    type: meta.type === 'series' ? 'series' : 'movie',
    name: String(meta.name || meta.title || 'Featured title'),
    poster: String(meta.poster || ''),
    background: String(
      meta.background ||
      meta.backdrop ||
      meta.poster ||
      ''
    ),
    year: s2PreviewMetaYear(meta)
  };
}

function s2RenderPreviewTargets(){
  var html = s2BuildNuvioPreviewHtml();
  var rows = document.getElementById('s2NuvioRows');
  var rowsMob = document.getElementById('s2NuvioRowsMobile');
  var rowsInline = document.getElementById('s2NuvioRowsInline');

  if(rows) rows.innerHTML = html;
  if(rowsMob) rowsMob.innerHTML = html;
  if(rowsInline) rowsInline.innerHTML = html;
}

function s2ToggleInlinePreview(){
  var shell = document.getElementById('catalogPreviewShell');
  var toggle = document.getElementById('catalogPreviewToggle');
  if(!shell || shell.classList.contains('is-suspended')) return;
  var willOpen = shell.classList.contains('is-collapsed');
  shell.classList.toggle('is-collapsed', !willOpen);
  if(toggle) toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  if(willOpen && typeof s2UpdatePreview === 'function') s2UpdatePreview();
}

function s2RefreshPreviewSuspension(){
  var shell = document.getElementById('catalogPreviewShell');
  if(!shell) return;
  var overlayOpen = [
    document.getElementById('mergedRemoveConfirm'),
    document.getElementById('catalogOverrideModal'),
    document.getElementById('s2Modal')
  ].some(function(modal){
    if(!modal || modal.hidden) return false;
    return window.getComputedStyle(modal).display !== 'none';
  });
  shell.classList.toggle('is-suspended', overlayOpen);
}

document.addEventListener('DOMContentLoaded', function(){
  var shell = document.getElementById('catalogPreviewShell');
  var toggle = document.getElementById('catalogPreviewToggle');
  if(shell) shell.classList.add('is-collapsed');
  if(toggle) toggle.setAttribute('aria-expanded', 'false');
  var observer = new MutationObserver(function(){ window.requestAnimationFrame(s2RefreshPreviewSuspension); });
  ['mergedRemoveConfirm','catalogOverrideModal','s2Modal'].forEach(function(id){
    var modal = document.getElementById(id);
    if(modal) observer.observe(modal, {attributes:true, attributeFilter:['class','hidden','style']});
  });
  s2RefreshPreviewSuspension();
});

async function s2FetchLivePreviewRow(token, id){
  var type = s2GetCatalogType(id);
  var key = token + '|' + type + '|' + id;

  if(Array.isArray(s2LivePreviewCache[key])){
    return s2LivePreviewCache[key];
  }

  if(s2LivePreviewPending[key]){
    return s2LivePreviewPending[key];
  }

  var url =
    API_BASE +
    '/c/' +
    encodeURIComponent(token) +
    '/catalog/' +
    encodeURIComponent(type) +
    '/' +
    encodeURIComponent(id) +
    '.json';

  var controller =
    typeof AbortController === 'function'
      ? new AbortController()
      : null;
  var requestGeneration = s2LivePreviewGeneration;

  var request = fetch(url, {
    cache: 'no-store',
    signal: controller ? controller.signal : undefined
  })
    .then(function(response){
      if(!response.ok){
        throw new Error(
          'Preview catalogue request failed: ' +
          response.status
        );
      }

      return response.json();
    })
    .then(function(payload){
      if(requestGeneration !== s2LivePreviewGeneration){
        return [];
      }

      var metas = Array.isArray(payload && payload.metas)
        ? payload.metas
        : [];

      var normalised = metas
        .slice(0, 12)
        .map(s2PreviewNormaliseMeta)
        .filter(function(meta){
          return meta.name && meta.poster;
        });

      s2LivePreviewCache[key] = normalised;
      return normalised;
    })
    .catch(function(error){
      if(error && error.name === 'AbortError'){
        return [];
      }

      console.warn(
        'Live preview fallback used for',
        id,
        error
      );

      s2LivePreviewCache[key] = [];
      return [];
    })
    .finally(function(){
      if(s2LivePreviewPending[key] === request){
        delete s2LivePreviewPending[key];
      }
      if(s2LivePreviewControllers[key] === controller){
        delete s2LivePreviewControllers[key];
      }
    });

  s2LivePreviewPending[key] = request;
  if(controller){
    s2LivePreviewControllers[key] = controller;
  }

  return request;
}

// New users reach Step 2 before any setup token exists (that's only minted
// on Generate, in Step 4), so the live catalog endpoint has nothing to hit
// yet and every row falls back to the same handful of category-grouped
// placeholder posters — which reads as "every row looks identical". Mint a
// lightweight draft token the same way the Trakt/Simkl/MAL/AniList connect
// flows already do, so hover previews can upgrade to each row's real
// content instead of staying on the placeholder for the whole session.
var s2PreviewTokenPromise = null;
function s2EnsurePreviewToken(){
  var existing = s2GetPreviewToken();
  if(existing) return Promise.resolve(existing);

  if(!s2PreviewTokenPromise){
    s2PreviewTokenPromise = fetch('/auth/preauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
      .then(function(r){ return r.json(); })
      .then(function(data){
        if(data && data.token){
          editToken = data.token;
          try{ sessionStorage.setItem('um_setup_token', data.token); }catch(e){}
          return data.token;
        }
        return '';
      })
      .catch(function(){ return ''; })
      .finally(function(){ s2PreviewTokenPromise = null; });
  }

  return s2PreviewTokenPromise;
}

function s2GetCachedPreviewRow(token, id){
  var type = s2GetCatalogType(id);
  var key = token + '|' + type + '|' + id;

  return Array.isArray(s2LivePreviewCache[key])
    ? s2LivePreviewCache[key]
    : null;
}

function s2LoadLivePreviewRows(){
  if(!s2PreviewContextActive()){
    return Promise.resolve();
  }

  var token = s2GetPreviewToken();

  if(!token){
    return Promise.resolve();
  }

  var ids = Array.from(selected)
    .filter(function(id){
      return !hidden.has(id);
    })
    .slice(0, 5);

  if(!ids.length){
    return Promise.resolve();
  }

  var generation = s2LivePreviewGeneration;

  return Promise.all(
    ids.map(function(id){
      return s2FetchLivePreviewRow(token, id)
        .then(function(){
          if(
            generation !== s2LivePreviewGeneration ||
            !s2PreviewContextActive()
          ){
            return;
          }
          s2RenderPreviewTargets();
        });
    })
  );
}

// ── PER-ROW HOVER/SELECT LIVE PREVIEW ───────────────────────────────
// Reuses s2FetchLivePreviewRow / s2LivePreviewCache above (already fetches
// via the user's own configured catalog + keys and caches per session) —
// this just adds the small popover UI that targets whichever single pill
// the user is hovering or has selected, instead of the full Nuvio mockup.
var s2RowPreviewTimer = null;
var s2RowPreviewSeq = 0;

function s2PositionRowPreview(anchorEl){
  var pop = document.getElementById('s2RowPreviewPopover');
  if(!pop || !anchorEl) return;

  var rect = anchorEl.getBoundingClientRect();
  var popWidth = 280;
  var left = Math.min(rect.left, window.innerWidth - popWidth - 12);
  left = Math.max(8, left);

  var top = rect.bottom + 8;
  if(top + 150 > window.innerHeight) top = Math.max(8, rect.top - 150 - 8);

  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}

function s2RenderRowPreviewSkeleton(){
  var grid = document.getElementById('s2RowPreviewGrid');
  if(!grid) return;
  var cell = '<div style="aspect-ratio:2/3;border-radius:5px;background:linear-gradient(90deg,#1c1c2c 25%,#26263a 37%,#1c1c2c 63%);background-size:400% 100%;animation:s2SkelShimmer 1.2s ease-in-out infinite;"></div>';
  grid.innerHTML = cell.repeat(6);
}

function s2RenderRowPreviewPosters(items){
  var grid = document.getElementById('s2RowPreviewGrid');
  if(!grid) return;

  if(!items || !items.length){
    grid.innerHTML = umT('setup.step2.catalogTools.noPreviewAvailableYet', '<div style="grid-column:1/-1;font-size:11px;color:#888;text-align:center;padding:14px 0;">No preview available yet</div>');
    return;
  }

  grid.innerHTML = items.slice(0, 6).map(function(m){
    return '<div style="aspect-ratio:2/3;border-radius:5px;overflow:hidden;background:#0b0b0b;"><img src="'+s2EscapeHtml(m.poster)+'" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;"></div>';
  }).join('');
}

function s2StaticPreviewFallback(id){
  var ids = s2GetPreviewPosters(id, 0) || [];
  return ids.slice(0, 6).map(function(imdb){
    return { poster: 'https://api.ratingposterdb.com/t0-free-rpdb/imdb/poster-default/' + imdb + '.jpg' };
  });
}

function s2ShowRowPreview(id, anchorEl){
  var pop = document.getElementById('s2RowPreviewPopover');
  if(!pop || !id) return;

  var def = typeof S2_DEFS !== 'undefined' && S2_DEFS[id];
  var titleEl = document.getElementById('s2RowPreviewTitle');
  if(titleEl) titleEl.textContent = (def && def.name) || id;

  pop.style.display = 'block';
  s2PositionRowPreview(anchorEl);

  var seq = ++s2RowPreviewSeq;
  var token = s2GetPreviewToken();

  var cached = token ? s2GetCachedPreviewRow(token, id) : null;
  if(cached){
    s2RenderRowPreviewPosters(cached.length ? cached : s2StaticPreviewFallback(id));
    return;
  }

  s2RenderRowPreviewSkeleton();

  if(token){
    s2FetchLivePreviewRow(token, id).then(function(items){
      if(seq !== s2RowPreviewSeq) return; // superseded by a newer hover/select
      s2RenderRowPreviewPosters(items.length ? items : s2StaticPreviewFallback(id));
    });
    return;
  }

  // No setup token yet — show this row's category-matched placeholder
  // immediately, then mint a draft token in the background and upgrade to
  // the row's real content once it lands (still guarded by `seq`, so a
  // slow response from an earlier hover never overwrites a later one).
  s2RenderRowPreviewPosters(s2StaticPreviewFallback(id));
  s2EnsurePreviewToken().then(function(liveToken){
    if(!liveToken || seq !== s2RowPreviewSeq) return;
    return s2FetchLivePreviewRow(liveToken, id).then(function(items){
      if(seq !== s2RowPreviewSeq) return;
      if(items.length) s2RenderRowPreviewPosters(items);
    });
  });
}

function s2HideRowPreview(){
  clearTimeout(s2RowPreviewTimer);
  s2RowPreviewSeq++; // invalidates any in-flight fetch's render
  var pop = document.getElementById('s2RowPreviewPopover');
  if(pop) pop.style.display = 'none';
}

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') s2HideRowPreview();
});
// ─────────────────────────────────────────────────────────────────

function s2BuildNuvioPreviewHtml(){
  var visibleSelected = Array.from(selected).filter(function(id){
    return !hidden.has(id);
  });

  if(!visibleSelected.length){
    return ''
      + '<div class="s2nm-shell">'
      +   '<div class="s2nm-empty">'
      +     '<div>'
      +       '<div class="s2nm-empty-icon">📺</div>'
      +       '<div class="s2nm-empty-title">Build your Nuvio home</div>'
      +       '<div class="s2nm-empty-copy">'
      +         'Choose catalogues and they will appear here instantly.'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  var token = s2GetPreviewToken();
  var previewIds = visibleSelected.slice(0,5);
  var heroId = previewIds[0];

  var rawHeroLabel = (
    window.getCatalogLabel
      ? getCatalogLabel(heroId)
      : (S2_DEFS[heroId] || heroId)
  ) || heroId;

  var heroLabel = s2PreviewCleanLabel(rawHeroLabel);
  var heroType = s2GetCatalogType(heroId);
  var heroLive = token
    ? s2GetCachedPreviewRow(token, heroId)
    : null;

  var heroMeta =
    heroLive && heroLive.length
      ? heroLive[0]
      : null;

  var fallbackHeroPosters = s2GetPreviewPosters(heroId,0);
  var fallbackHeroId = fallbackHeroPosters[0];

  var heroUrl = heroMeta && heroMeta.background
    ? heroMeta.background
    : (
        'https://api.ratingposterdb.com/' +
        't0-free-rpdb/imdb/poster-default/' +
        fallbackHeroId +
        '.jpg'
      );

  var heroTitle = heroMeta
    ? heroMeta.name
    : heroLabel;

  var heroYear = heroMeta
    ? heroMeta.year
    : s2PreviewYearForImdb(fallbackHeroId);

  var shelvesHtml = previewIds.map(function(id,index){
    var rawLabel = (
      window.getCatalogLabel
        ? getCatalogLabel(id)
        : (S2_DEFS[id] || id)
    ) || id;

    var label = s2PreviewCleanLabel(rawLabel);
    var liveMetas = token
      ? s2GetCachedPreviewRow(token, id)
      : null;

    var cards;

    if(liveMetas && liveMetas.length){
      cards = liveMetas.slice(0,8).map(function(meta){
        return ''
          + '<article class="s2nm-card">'
          +   '<div class="s2nm-poster">'
          +     '<img src="'
          +       s2EscapeHtml(meta.poster)
          +     '" loading="lazy" alt="'
          +       s2EscapeHtml(meta.name)
          +     '">'
          +   '</div>'
          +   '<div class="s2nm-card-title">'
          +     s2EscapeHtml(meta.name)
          +   '</div>'
          +   (
                meta.year
                  ? '<div class="s2nm-card-detail">'
                    + s2EscapeHtml(meta.year)
                    + '</div>'
                  : ''
              )
          + '</article>';
      }).join('');
    }else{
      var posters = s2GetPreviewPosters(id,index);

      cards = posters.slice(0,6).map(function(imdbId,posterIndex){
        var posterUrl =
          'https://api.ratingposterdb.com/' +
          't0-free-rpdb/imdb/poster-default/' +
          imdbId +
          '.jpg';

        var title =
          s2PreviewTitleForImdb(imdbId,posterIndex);

        var year =
          s2PreviewYearForImdb(imdbId);

        return ''
          + '<article class="s2nm-card">'
          +   '<div class="s2nm-poster">'
          +     '<img src="'
          +       posterUrl
          +     '" loading="lazy" alt="'
          +       s2EscapeHtml(title)
          +     '">'
          +   '</div>'
          +   '<div class="s2nm-card-title">'
          +     s2EscapeHtml(title)
          +   '</div>'
          +   (
                year
                  ? '<div class="s2nm-card-detail">'
                    + year
                    + '</div>'
                  : ''
              )
          + '</article>';
      }).join('');
    }

    return ''
      + '<section class="s2nm-shelf">'
      +   '<div class="s2nm-shelf-header">'
      +     '<div class="s2nm-shelf-title-wrap">'
      +       '<div class="s2nm-shelf-title">'
      +         s2EscapeHtml(label)
      +       '</div>'
      +       '<div class="s2nm-accent"></div>'
      +     '</div>'
      +     '<div class="s2nm-view-all">›</div>'
      +   '</div>'
      +   '<div class="s2nm-rail">'
      +     cards
      +   '</div>'
      + '</section>';
  }).join('');

  var remaining =
    visibleSelected.length - previewIds.length;

  return ''
    + '<div class="s2nm-shell">'
    +   '<section class="s2nm-hero">'
    +     '<div class="s2nm-hero-image" style="background-image:url('
    +       "'"
    +       s2EscapeHtml(heroUrl)
    +       "'"
    +     ');"></div>'
    +     '<div class="s2nm-hero-shade"></div>'
    +     '<div class="s2nm-hero-fade"></div>'
    +     '<div class="s2nm-hero-content">'
    +       '<div class="s2nm-title">'
    +         s2EscapeHtml(heroTitle)
    +       '</div>'
    +       '<div class="s2nm-meta">'
    +         '<span>'
    +           (heroType === 'series' ? 'Series' : 'Movie')
    +         '</span>'
    +         '<span class="s2nm-dot"></span>'
    +         '<span>Featured</span>'
    +         (
                heroYear
                  ? '<span class="s2nm-dot"></span>'
                    + '<span>'
                    + s2EscapeHtml(heroYear)
                    + '</span>'
                  : ''
              )
    +       '</div>'
    +       '<div class="s2nm-details">View details</div>'
    +       '<div class="s2nm-indicators">'
    +         '<span class="s2nm-indicator active"></span>'
    +         '<span class="s2nm-indicator"></span>'
    +         '<span class="s2nm-indicator"></span>'
    +       '</div>'
    +     '</div>'
    +   '</section>'
    +   '<div class="s2nm-shelves">'
    +     shelvesHtml
    +     (
            remaining > 0
              ? '<div class="s2nm-more">+'
                + remaining
                + ' more rows in your home</div>'
              : ''
          )
    +   '</div>'
    + '</div>';
}

function s2UpdatePreview(){
  var count = selected.size;

  var perf =
    count === 0
      ? '—'
      : count <= 20
        ? '<span class="s2-perf s2-perf-ex">Excellent</span>'
        : count <= 50
          ? '<span class="s2-perf s2-perf-gd">Good</span>'
          : '<span class="s2-perf s2-perf-hv">Heavy</span>';

  var statRows = document.getElementById('s2StatRows');
  var statPerf = document.getElementById('s2StatPerf');

  if(statRows) statRows.textContent = count;
  if(statPerf) statPerf.innerHTML = perf;

  if(!s2PreviewContextActive()){
    s2CancelLivePreviewWork();
    return;
  }

  s2RenderPreviewTargets();
  s2LoadLivePreviewRows();
}


var s2PreviewMode = '';

function s2SetPreviewMode(mode){
  var modal = document.getElementById('s2Modal');
  var mobileBtn = document.getElementById('s2PreviewMobileBtn');
  var desktopBtn = document.getElementById('s2PreviewDesktopBtn');

  mode = mode === 'desktop' ? 'desktop' : 'mobile';
  s2PreviewMode = mode;

  if(modal){
    modal.classList.toggle(
      's2-preview-mode-mobile',
      mode === 'mobile'
    );

    modal.classList.toggle(
      's2-preview-mode-desktop',
      mode === 'desktop'
    );
  }

  if(mobileBtn){
    mobileBtn.classList.toggle(
      'active',
      mode === 'mobile'
    );

    mobileBtn.setAttribute(
      'aria-pressed',
      mode === 'mobile' ? 'true' : 'false'
    );
  }

  if(desktopBtn){
    desktopBtn.classList.toggle(
      'active',
      mode === 'desktop'
    );

    desktopBtn.setAttribute(
      'aria-pressed',
      mode === 'desktop' ? 'true' : 'false'
    );
  }

  try {
    sessionStorage.setItem(
      'ultramax-preview-mode',
      mode
    );
  } catch(error) {}
}

function s2GetDefaultPreviewMode(){
  try {
    var saved =
      sessionStorage.getItem('ultramax-preview-mode');

    if(saved === 'mobile' || saved === 'desktop'){
      return saved;
    }
  } catch(error) {}

  return window.innerWidth >= 900
    ? 'desktop'
    : 'mobile';
}

function s2OpenModal(){
  var m=document.getElementById('s2Modal');
  if(!m) return;

  if(typeof s2UpdatePreview === 'function'){
    s2UpdatePreview();
  }

  s2SetPreviewMode(
    s2PreviewMode || s2GetDefaultPreviewMode()
  );

  m.style.display='block';
  document.body.classList.add('s2-preview-open');
  s2HideRowPreview();
  s2RefreshPreviewSuspension();
  m.scrollTop=0;

  var sheet=m.querySelector('.s2-modal-sheet');
  if(sheet) sheet.scrollTop=0;
}
function s2CloseModal(){
  var m=document.getElementById('s2Modal');
  if(m) m.style.display='none';
  document.body.classList.remove('s2-preview-open');
  s2RefreshPreviewSuspension();
}

// Hook into goToStep2 to init the new UI
// Restore selected pills from saved config into the new UI
