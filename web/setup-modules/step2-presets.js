var S2_PRESETS = [
  { id:'recommended', tier:'primary', icon:'✨', name:'Recommended', desc:'A balanced Ultra MAX home with current hits, trusted favourites and the biggest streaming services.', tag:'Best starting point', ids:['rightnow_movies','rightnow_series','trending_movies','trending_series','popular_movies','popular_series','top_movies','top_series','now_playing_movies','airing_series','netflix_movies','netflix_series','amazon_movies','amazon_series','disney_movies','disney_series','new_movies'], posters:['tt15398776','tt1160419','tt3581920','tt7660850'] },
  { id:'streaming_fan', tier:'primary', icon:'📡', name:'Streaming Fan', desc:'The major streaming services plus trending and popular rows for an always-fresh home screen.', tag:'Movies + TV', ids:['netflix_movies','netflix_series','amazon_movies','amazon_series','disney_movies','disney_series','tubi_movies','tubi_series','pluto_movies','pluto_series','hbo_movies','hbo_series','apple_movies','apple_series','peacock_movies','peacock_series','hulu_movies','hulu_series','paramount_movies','paramount_series','trending_movies','trending_series','popular_movies','popular_series'], posters:['tt15398776','tt5180504','tt7366338','tt2442560'] },
  { id:'cinema_lover', tier:'primary', icon:'🎬', name:'Cinema Lover', desc:'Directors, prestige studios, top films and heavyweight movie collections for film-first browsing.', tag:'Film focused', ids:['director_nolan','director_kubrick','director_tarantino','director_scorsese','director_spielberg','studio_a24','mubi_movies','top_movies','drama_movies','thriller_movies','crime_movies','hp_collection','godfather_collection'], posters:['tt0816692','tt1375666','tt0468569','tt0111161'] },
  { id:'tv_binger', tier:'primary', icon:'📺', name:'TV Binger', desc:'Trending series, premium networks and addictive long-form TV worlds built for the next episode.', tag:'Series focused', ids:['trending_series','popular_series','top_series','crime_series','drama_series','thriller_series','network_hbo','network_amc','network_fx','network_showtime','airing_series','ontheair_series','got_tv_collection','breakingbad_tv_collection'], posters:['tt0903747','tt0944947','tt3032476','tt2306299'] },
  { id:'genre_explorer', tier:'primary', icon:'🎭', name:'Genre Explorer', desc:'A broad mix of genres, decades and themes for people who like browsing by mood instead of service.', tag:'Variety', ids:['action_movies','action_series','comedy_movies','horror_movies','scifi_movies','thriller_movies','crime_movies','drama_movies','romance_movies','fantasy_movies','mystery_movies','animation_movies','decade_2020s','decade_2010s','decade_2000s','decade_1990s','decade_1980s','theme_superhero','theme_heist','theme_zombie'], posters:['tt0110912','tt0137523','tt0245429','tt3783958'] },
  { id:'family_hub', tier:'primary', icon:'🏠', name:'Family Hub', desc:'Family films, animation, Disney and trusted kids networks in one friendly starting point.', tag:'Family friendly', ids:['animation_movies','animation_series','family_movies','family_series','disney_movies','disney_series','network_nickelodeon','network_cartoon','studio_disney','studio_ghibli'], posters:['tt0499549','tt4520988','tt0892769','tt4116284'] },
  { id:'anime_fan', tier:'specialist', icon:'🍥', name:'Anime', desc:'Top-rated anime, themes, sports and studio spotlights.', tag:'Specialist', categoryId:'anime-discovery', posters:['tt0245429','tt2560140','tt9335498','tt5311514'] },
  { id:'world_cinema', tier:'specialist', icon:'🌍', name:'World Cinema', desc:'Korean, Japanese, Chinese, European and Latin American movies and series.', tag:'International', categoryId:'international', posters:['tt6751668','tt0211915','tt0457430','tt0317248'] },
  { id:'documentary_fan', tier:'specialist', icon:'🎥', name:'Documentaries', desc:'True crime, nature, science, history, music and sports documentaries.', tag:'Factual', categoryId:'documentary-discovery', posters:['tt5491994','tt7775622','tt5895028','tt8420184'] },
  { id:'sports_fan', tier:'specialist', icon:'🏆', name:'Sports', desc:'Live and upcoming sport, football, wrestling, motorsport, combat sports and more.', tag:'Live + library', categoryId:'sports', posters:['tt1979320','tt1950186','tt3076658','tt1424432'] },
  { id:'universe_explorer', tier:'specialist', icon:'🌌', name:'Universes', desc:'Connected worlds spanning franchises, films and long-running series.', tag:'Franchises', categoryId:'universes', posters:['tt0076759','tt0848228','tt0796366','tt1520211'] },
  { id:'star_chaser', tier:'specialist', icon:'⭐', name:'Star Chaser', desc:'Browse favourite actors and major directors without hunting through individual filmographies.', tag:'People', ids:['actor_pitt','actor_dicaprio','actor_hanks','actor_wayne','actor_streep','actor_depp','actor_lawrence','actor_johnson','actor_chalamet','director_nolan','director_spielberg','director_scorsese','director_tarantino'], posters:['tt0816692','tt4633694','tt1745960','tt6710474'] },
  { id:'everything', tier:'advanced', icon:'⚡', name:'Everything', desc:'Select every currently available Ultra MAX row. Huge, noisy and intentionally not recommended for normal setups.', tag:'Advanced', ids:'__all__', posters:['tt0816692','tt1375666','tt0903747','tt0944947'] },
];

function s2ResolvePresetIds(preset){
  if(!preset) return [];

  if(preset.ids === '__all__'){
    return Object.keys(S2_DEFS).filter(function(id){
      return !isRemovedMergedCatalogId(id) && isCatalogAvailableForDiscovery(id);
    });
  }

  if(preset.categoryId){
    var category = S2_CATEGORIES.find(function(cat){
      return cat.id === preset.categoryId;
    });

    return category
      ? getStep2CategoryIds(category).filter(function(id){
          return !isRemovedMergedCatalogId(id);
        })
      : [];
  }

  return Array.isArray(preset.ids)
    ? preset.ids.filter(function(id){
        return !isRemovedMergedCatalogId(id) && isCatalogAvailableForDiscovery(id);
      })
    : [];
}

var s2PresetArtworkCache = Object.create(null);
var s2PresetArtworkHydrationPromise = null;

var S2_PRESET_ART_SESSION_KEY = 'um_s2_preset_art_v2';

function s2LoadPresetArtworkSessionCache(){
  try{
    var raw = sessionStorage.getItem(
      S2_PRESET_ART_SESSION_KEY
    );

    if(!raw) return;

    var parsed = JSON.parse(raw);

    if(!parsed || typeof parsed !== 'object'){
      return;
    }

    Object.keys(parsed).forEach(function(id){
      if(Array.isArray(parsed[id]) && parsed[id].length){
        s2PresetArtworkCache[id] = parsed[id];
      }
    });
  }catch(error){
    console.warn(
      'Preset artwork session cache load failed',
      error
    );
  }
}

function s2SavePresetArtworkSessionCache(){
  try{
    sessionStorage.setItem(
      S2_PRESET_ART_SESSION_KEY,
      JSON.stringify(s2PresetArtworkCache)
    );
  }catch(error){
    console.warn(
      'Preset artwork session cache save failed',
      error
    );
  }
}

s2LoadPresetArtworkSessionCache();

function s2PresetArtworkHtml(preset, items){
  var list = Array.isArray(items) ? items.slice(0, 4) : [];
  var fallbackIcon = s2EscapeHtml((preset && preset.icon) || '🎬');
  var cells = [];

  for(var i = 0; i < 4; i++){
    var item = list[i] || null;
    var poster = item && item.poster ? String(item.poster) : '';

    cells.push(
      '<span class="s2-preset-art-cell" data-fallback-icon="'+fallbackIcon+'">'
        +(poster
          ? '<img src="'+s2EscapeHtml(poster)+'" loading="lazy" alt="">'
          : '')
      +'</span>'
    );
  }

  return cells.join('');
}

function s2BindPresetArtworkGuards(strip){
  if(!strip) return;

  strip.querySelectorAll('.s2-preset-art-cell img').forEach(function(img){
    img.addEventListener('error', function(){
      var cell = img.closest('.s2-preset-art-cell');
      if(cell) cell.classList.add('is-failed');
      img.style.display = 'none';
    }, { once:true });
  });
}

function s2PresetFallbackItems(preset){
  return (Array.isArray(preset && preset.posters) ? preset.posters : [])
    .map(function(imdb){
      return {
        id: imdb,
        poster:
          'https://api.ratingposterdb.com/t0-free-rpdb/imdb/poster-default/' +
          imdb +
          '.jpg'
      };
    });
}

function s2PresetPosterKey(item){
  if(!item) return '';

  if(item.id){
    return 'id:' + String(item.id);
  }

  return item.poster
    ? 'poster:' + String(item.poster)
    : '';
}

function s2PresetCandidateCatalogIds(preset){
  var ids = s2ResolvePresetIds(preset).filter(function(id){
    return !!S2_DEFS[id];
  });

  if(!ids.length) return [];

  var picks = [];

  function add(id){
    if(id && !picks.includes(id)){
      picks.push(id);
    }
  }

  /*
   * Category-backed presets such as Sports and Universes can
   * deliberately sample different child sections first.
   *
   * Sports therefore has a chance to represent Wrestling,
   * Motorsport, MMA, etc. rather than
   * four posters from whichever wrestling row happens to come
   * first.
   *
   * Universes likewise samples different worlds.
   */
  if(preset.categoryId){
    var category = S2_CATEGORIES.find(function(cat){
      return cat.id === preset.categoryId;
    });

    if(category && Array.isArray(category.children)){
      category.children.forEach(function(child){
        var match = ids.find(function(id){
          try{
            return child.filter(id);
          }catch(e){
            return false;
          }
        });

        add(match);
      });
    }
  }

  /*
   * For normal explicit presets, and as a fill-in for category
   * presets, spread picks across the complete preset instead of
   * blindly taking its first few rows.
   */
  if(ids.length <= 8){
    ids.forEach(add);
  }else{
    [0, 0.17, 0.34, 0.51, 0.68, 0.85, 1].forEach(function(point){
      add(ids[Math.round((ids.length - 1) * point)]);
    });
  }

  ids.forEach(function(id){
    if(picks.length < 8) add(id);
  });

  return picks.slice(0, 4);
}

function s2SetPresetPosterStrip(presetId, items){
  var strip = document.querySelector(
    '#s2pre-' + presetId + ' .s2-preset-strip'
  );
  var preset = S2_PRESETS.find(function(candidate){
    return candidate.id === presetId;
  });

  if(!strip || !preset) return;

  strip.innerHTML = s2PresetArtworkHtml(preset, items);
  s2BindPresetArtworkGuards(strip);
}

async function s2PresetMapLimit(items, limit, worker){
  var results = new Array(items.length);
  var nextIndex = 0;

  async function runWorker(){
    while(true){
      var index = nextIndex++;

      if(index >= items.length){
        return;
      }

      results[index] = await worker(
        items[index],
        index
      );
    }
  }

  var workers = [];

  for(
    var i = 0;
    i < Math.min(limit, items.length);
    i++
  ){
    workers.push(runWorker());
  }

  await Promise.all(workers);

  return results;
}

function s2PresetFetchWithTimeout(token, catalogId){
  return Promise.race([
    s2FetchLivePreviewRow(token, catalogId),

    new Promise(function(resolve){
      setTimeout(function(){
        console.warn(
          'Preset artwork catalog timeout:',
          catalogId
        );

        resolve([]);
      }, 3000);
    })
  ]);
}

async function s2ResolveDynamicPresetPosters(
  token,
  preset,
  usedPosterKeys
){
  var catalogIds = s2PresetCandidateCatalogIds(preset);
  var chosen = [];

  /*
   * Fast path:
   * Fetch representative catalogs for this preset together.
   */
  var fetchedRows = await Promise.all(
    catalogIds.map(function(catalogId){
      return s2PresetFetchWithTimeout(
        token,
        catalogId
      ).catch(function(){
        return [];
      });
    })
  );

  /*
   * First pass:
   * Prefer one poster from each representative catalog.
   */
  fetchedRows.forEach(function(items){
    if(chosen.length >= 4) return;

    if(!Array.isArray(items) || !items.length){
      return;
    }

    var representative = items.find(function(item){
      var key = s2PresetPosterKey(item);

      return !!item.poster &&
        !!key &&
        !usedPosterKeys.has(key);
    });

    if(representative){
      chosen.push(representative);
      usedPosterKeys.add(
        s2PresetPosterKey(representative)
      );
    }
  });

  /*
   * Second pass:
   * Fill gaps from metadata already fetched.
   */
  fetchedRows.forEach(function(items){
    if(chosen.length >= 4) return;
    if(!Array.isArray(items)) return;

    items.forEach(function(item){
      if(chosen.length >= 4) return;

      var key = s2PresetPosterKey(item);

      if(
        item &&
        item.poster &&
        key &&
        !usedPosterKeys.has(key)
      ){
        chosen.push(item);
        usedPosterKeys.add(key);
      }
    });
  });

  /*
   * Final fallback only.
   */
  if(chosen.length < 4){
    s2PresetFallbackItems(preset).forEach(function(item){
      if(chosen.length >= 4) return;

      var key = s2PresetPosterKey(item);

      if(
        item.poster &&
        key &&
        !usedPosterKeys.has(key)
      ){
        chosen.push(item);
        usedPosterKeys.add(key);
      }
    });
  }

  return chosen.slice(0, 4);
}
async function s2HydratePresetPosters(){
  /*
   * If another Step 2 rerender happens while hydration is
   * already running, reuse that run instead of cancelling it.
   */
  if(s2PresetArtworkHydrationPromise){
    return s2PresetArtworkHydrationPromise;
  }

  s2PresetArtworkHydrationPromise = (async function(){
    var token = await s2EnsurePreviewToken();

    if(!token){
      return;
    }

    /*
     * Artwork already resolved in this browser session can be
     * painted immediately after any Step 2 rerender.
     */
    S2_PRESETS.forEach(function(preset){
      var cached = s2PresetArtworkCache[preset.id];

      if(Array.isArray(cached) && cached.length){
        s2SetPresetPosterStrip(
          preset.id,
          cached
        );
      }
    });

    /*
     * Three presets hydrate concurrently.
     *
     * This stops Streaming Fan from blocking the entire grid
     * while still keeping request pressure controlled.
     */
    var resolvedByPreset = await s2PresetMapLimit(
      S2_PRESETS,
      3,
      async function(preset){
        var cached =
          s2PresetArtworkCache[preset.id];

        if(Array.isArray(cached) && cached.length){
          return cached;
        }

        try{
          /*
           * Local dedupe first. Global grid dedupe happens in
           * display order afterward.
           */
          return await s2ResolveDynamicPresetPosters(
            token,
            preset,
            new Set()
          );
        }catch(error){
          console.warn(
            'Dynamic preset artwork fallback used for',
            preset.id,
            error
          );

          return s2PresetFallbackItems(preset);
        }
      }
    );

    /*
     * Final pass in visible card order.
     *
     * Prefer real metadata artwork and prevent the same title
     * appearing over and over across adjacent presets.
     */
    var usedPosterKeys = new Set();

    S2_PRESETS.forEach(function(preset, index){
      var candidates = Array.isArray(
        resolvedByPreset[index]
      )
        ? resolvedByPreset[index]
        : [];

      if(!candidates.length){
        candidates = s2PresetFallbackItems(preset);
      }

      var finalItems = [];

      candidates.forEach(function(item){
        if(finalItems.length >= 4) return;

        var key = s2PresetPosterKey(item);

        if(
          item &&
          item.poster &&
          key &&
          !usedPosterKeys.has(key)
        ){
          finalItems.push(item);
          usedPosterKeys.add(key);
        }
      });

      /*
       * Static IMDb artwork remains only as a final safety net.
       */
      if(finalItems.length < 4){
        s2PresetFallbackItems(preset)
          .forEach(function(item){
            if(finalItems.length >= 4) return;

            var key = s2PresetPosterKey(item);

            if(
              item.poster &&
              key &&
              !usedPosterKeys.has(key)
            ){
              finalItems.push(item);
              usedPosterKeys.add(key);
            }
          });
      }

      if(finalItems.length){
        s2PresetArtworkCache[preset.id] =
          finalItems;

        s2SetPresetPosterStrip(
          preset.id,
          finalItems
        );
      }

      s2SavePresetArtworkSessionCache();
    });
  })();

  try{
    await s2PresetArtworkHydrationPromise;
  }finally{
    s2PresetArtworkHydrationPromise = null;
  }
}
function s2PresetCardHtml(preset, variant){
  var count = s2ResolvePresetIds(preset).length;
  var fallbackItems = s2PresetFallbackItems(preset);
  var classes = 's2-preset s2-preset-' + (variant || 'primary');

  return '<button type="button" class="'+classes+'" id="s2pre-'+preset.id+'" onclick="s2ApplyPreset(\''+preset.id+'\')">'
    +'<span class="s2-preset-tick">✓ Selected</span>'
    +'<span class="s2-preset-strip">'+s2PresetArtworkHtml(preset, fallbackItems)+'</span>'
    +'<span class="s2-preset-body">'
      +'<span class="s2-preset-heading"><span class="s2-preset-icon">'+preset.icon+'</span><span class="s2-preset-name">'+s2EscapeHtml(preset.name)+'</span></span>'
      +'<span class="s2-preset-desc">'+s2EscapeHtml(preset.desc || '')+'</span>'
      +'<span class="s2-preset-meta"><span class="s2-preset-tag">'+s2EscapeHtml(preset.tag || '')+'</span><span class="s2-preset-count">'+count+' rows</span></span>'
    +'</span>'
  +'</button>';
}

function s2RenderPresets(){
  var grid = document.getElementById('s2PresetsGrid');
  if(!grid) return;

  var primary = S2_PRESETS.filter(function(p){ return p.tier === 'primary'; });
  var specialist = S2_PRESETS.filter(function(p){ return p.tier === 'specialist'; });
  var advanced = S2_PRESETS.filter(function(p){ return p.tier === 'advanced'; });

  grid.classList.add('s2-presets-experience');
  grid.innerHTML =
    '<div class="s2-preset-primary-grid">'
      +primary.map(function(p){ return s2PresetCardHtml(p, 'primary'); }).join('')
    +'</div>'
    +'<details class="s2-preset-drawer">'
      +'<summary><span class="s2-preset-drawer-icon">✦</span><span class="s2-preset-drawer-copy"><strong>More starting points</strong><small>Anime, world cinema, documentaries, sports, universes and people</small></span><span class="s2-preset-drawer-count">'+specialist.length+'</span><span class="s2-preset-drawer-chev">⌄</span></summary>'
      +'<div class="s2-preset-specialist-grid">'
        +specialist.map(function(p){ return s2PresetCardHtml(p, 'specialist'); }).join('')
      +'</div>'
    +'</details>'
    +'<details class="s2-preset-drawer s2-preset-advanced-drawer">'
      +'<summary><span class="s2-preset-drawer-icon">⚙️</span><span class="s2-preset-drawer-copy"><strong>Advanced</strong><small>Large or specialist starting options</small></span><span class="s2-preset-drawer-chev">⌄</span></summary>'
      +'<div class="s2-preset-advanced-grid">'
        +advanced.map(function(p){ return s2PresetCardHtml(p, 'advanced'); }).join('')
      +'</div>'
    +'</details>';

  grid.querySelectorAll('.s2-preset-strip').forEach(function(strip){
    s2BindPresetArtworkGuards(strip);
  });

  /* Restore resolved dynamic artwork immediately after any rerender. */
  S2_PRESETS.forEach(function(preset){
    var cached = s2PresetArtworkCache[preset.id];

    if(Array.isArray(cached) && cached.length){
      s2SetPresetPosterStrip(preset.id, cached);
    }
  });

  /* Upgrade fallback artwork from real catalog metadata without blocking Step 2. */
  Promise.resolve()
    .then(function(){
      return s2HydratePresetPosters();
    })
    .catch(function(error){
      console.warn('Dynamic preset artwork hydration failed', error);
    });
}

function s2ApplyPreset(id){
  var preset = S2_PRESETS.find(function(p){ return p.id===id; });
  if(!preset) return;
  var card = document.getElementById('s2pre-'+id);
  var presetIds = s2ResolvePresetIds(preset);

  // Toggle off
  if(card && card.classList.contains('s2-active')){
    card.classList.remove('s2-active');
    presetIds.forEach(function(i){
      selected.delete(i);
    });
    s2UpdateAll();
    persistStep2State();
    return;
  }

  // Deactivate others, apply this
  document.querySelectorAll('.s2-preset').forEach(function(c){
    c.classList.remove('s2-active');
  });

  if(card) card.classList.add('s2-active');

  presetIds.forEach(function(i){
    if(S2_DEFS[i] && !isRemovedMergedCatalogId(i)){
      selected.add(i);
    }
  });

  s2UpdateAll();
  persistStep2State();
}
