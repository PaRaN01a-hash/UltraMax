function pushAlphaCollections(baseTitle, folders){
  const buckets = {
    'A-H': [],
    'I-P': [],
    'Q-Z': []
  };

  folders.forEach(function(folder){
    let first = (folder.title || '').replace(/^The\s+/i, '').trim().charAt(0).toUpperCase();

    if(first >= 'A' && first <= 'H'){
      buckets['A-H'].push(folder);
    } else if(first >= 'I' && first <= 'P'){
      buckets['I-P'].push(folder);
    } else {
      buckets['Q-Z'].push(folder);
    }
  });

  ['A-H','I-P','Q-Z'].forEach(function(range){
    if(buckets[range].length){
      v2Collections.push({
        title: baseTitle + ' ' + range,
        folders: buckets[range]
      });
    }
  });
}

function afterPresetAdded(key){
  syncCatalogOrder();
  const btn = document.querySelector('.coll-action-btn[data-preset="' + key + '"]');
  if(btn){
    btn.classList.remove('just-added');
    void btn.offsetWidth;
    btn.classList.add('just-added');
  }
  setTimeout(function(){
    const cards = document.querySelectorAll('#collections-list .result-section, #collections-list .coll-card');
    const last = cards[cards.length - 1];
    if(last){
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      last.classList.remove('coll-card-flash');
      void last.offsetWidth;
      last.classList.add('coll-card-flash');
    }
  }, 150);
}

function s3ToggleStickyPresets(){
  var el = document.getElementById('s3StickyPresets');
  if(el) el.classList.toggle('s3-open');
  var label = el ? el.querySelector('.s3-sticky-label span') : null;
  if(label) label.textContent = el.classList.contains('s3-open') ? 'tap to collapse' : 'tap to expand';
}

// Populate sticky preset grid (clone of main grid)
function s3InitStickyPresets(){
  var mainGrid = document.getElementById('s3PresetsGrid');
  var stickyGrid = document.getElementById('s3StickyGrid');
  if(!mainGrid || !stickyGrid) return;
  stickyGrid.innerHTML = mainGrid.innerHTML;
  // Fix onclick handlers — they reference the card element
  stickyGrid.querySelectorAll('.s3-preset-card').forEach(function(card){
    var preset = card.dataset.preset;
    card.onclick = function(){ s3PresetClick(card, preset); };
  });
  updateDiscoveryCapabilityUi();
}

// Init sticky presets when step 3 becomes active
var _s3StickyInit = false;
var _origSetStep = typeof setStep === 'function' ? setStep : null;

// s3PresetClick moved to inline script below

function s3SetViewMode(mode){
  // Update hidden select
  var sel = document.getElementById('nuvioViewMode');
  if(sel) sel.value = mode;
  // Update visual cards
  document.querySelectorAll('.s3-viewmode-card').forEach(function(c){
    c.classList.toggle('active', c.dataset.mode === mode);
  });
  if(typeof saveDraftState === 'function') saveDraftState();
}

// Sync view mode cards when loading config
function s3SyncViewMode(){
  var sel = document.getElementById('nuvioViewMode');
  if(!sel) return;
  var mode = sel.value || 'TABBED_GRID';
  document.querySelectorAll('.s3-viewmode-card').forEach(function(c){
    c.classList.toggle('active', c.dataset.mode === mode);
  });
}

function loadPreset(key, options){
  var previewOnly = !!(options && options.previewOnly);

  if(key === 'streaming'){
    const selectedIds = Array.from(selected);

    const map = [
      {
        title:'Netflix',
        rows:[
          'netflix_movies',
          'netflix_series',
          'mdb_88328',
          'mdb_86751'
        ]
      },
      {
        title:'Disney+',
        rows:[
          'disney_movies',
          'disney_series',
          'mdb_86759',
          'mdb_86758'
        ]
      },
      {
        title:'Prime Video',
        rows:[
          'amazon_movies',
          'amazon_series',
          'mdb_86755',
          'mdb_86753'
        ]
      },
      {
        title:'HBO / Max',
        rows:[
          'hbo_movies',
          'hbo_series',
          'mdb_89647',
          'mdb_89649'
        ]
      },
      {
        title:'Apple TV+',
        rows:[
          'apple_movies',
          'apple_series',
          'mdb_88317',
          'mdb_88319'
        ]
      },
      {
        title:'Paramount+',
        rows:[
          'paramount_movies',
          'paramount_series',
          'mdb_86762',
          'mdb_86761'
        ]
      },
      {
        title:'Hulu',
        rows:[
          'hulu_movies',
          'hulu_series',
          'mdb_88326',
          'mdb_88327'
        ]
      },
      {
        title:'Peacock',
        rows:[
          'peacock_movies',
          'peacock_series'
        ]
      },
      {
        title:'Tubi',
        rows:[
          'tubi_movies',
          'tubi_series'
        ]
      },
      {
        title:'Pluto TV',
        rows:[
          'pluto_movies',
          'pluto_series'
        ]
      },
      {
        title:'Shudder',
        rows:[
          'shudder_movies',
          'shudder_series'
        ]
      },
      {
        title:'BritBox',
        rows:[
          'britbox_movies',
          'britbox_series'
        ]
      },
      {
        title:'Acorn',
        rows:[
          'acorn_movies',
          'acorn_series'
        ]
      },
      {
        title:'ITVX',
        rows:[
          'itvx_movies',
          'itvx_series'
        ]
      },
      {
        title:'Channel 4',
        rows:[
          'channel4_movies',
          'channel4_series'
        ]
      },
      {
        title:'Crunchyroll',
        rows:[
          'crunchyroll_movies',
          'crunchyroll_series'
        ]
      },
      {
        title:'MGM+',
        rows:[
          'mgm_movies',
          'mgm_series'
        ]
      },
      {
        title:'Starz',
        rows:[
          'starz_movies'
        ]
      },
      {
        title:'MUBI',
        rows:[
          'mubi_movies'
        ]
      },
      {
        title:'Discovery+',
        rows:[
          'discovery_movies',
          'discovery_series'
        ]
      },
      {
        title:'National Geographic',
        rows:[
          'natgeo_movies',
          'natgeo_series'
        ]
      },
      {
        title:'A&E',
        rows:[
          'ae_series'
        ]
      },
      {
        title:'Animal Planet',
        rows:[
          'animalplanet_series'
        ]
      }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;

      if(!hits.length){
        return null;
      }

      return applyFolderMedia({
        title:group.title,
        rows:hits
      });
    }).filter(Boolean);

    if(folders.length !== 23){
      console.error(
        'Streaming Services collection preset validation failed',
        {
          expectedFolders:23,
          actualFolders:folders.length
        }
      );

      if(typeof showBanner === 'function'){
        showBanner(
          'Streaming Services expected 23 folders but found ' +
            folders.length +
            '.',
          'error'
        );
      }

      return;
    }

    v2Collections.push({
      title:'Streaming Services',
      folders:folders
    });

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'latest'){
    const selectedIds = Array.from(selected);

    const map = [
      { title:'Fresh Releases', rows:['mdb_86934','mdb_960','mdb_2202','mdb_1176'] },
      { title:'Airing Now', rows:['mdb_86710'] },
      { title:'Netflix Latest', rows:['mdb_88328','mdb_86751'] },
      { title:'Prime Latest', rows:['mdb_86755','mdb_86753'] },
      { title:'Disney+ Latest', rows:['mdb_86758','mdb_86759'] },
      { title:'Apple TV+ Latest', rows:['mdb_88317','mdb_88319'] },
      { title:'HBO Latest', rows:['mdb_89647','mdb_89649'] },
      { title:'Paramount+ Latest', rows:['mdb_86762','mdb_86761'] },
      { title:'Hulu Latest', rows:['mdb_88326','mdb_88327'] }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;
      return applyFolderMedia({ title: group.title, rows: hits });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'New & Latest',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'anime'){
    const map = [
      {
        title:'Discover Anime',
        rows:[
          'anime_movies',
          'anilist_trending',
          'theme_anime_top_movies',
          'theme_anime_top_series',
          'anilist_seasonal'
        ]
      },
      {
        title:'Shonen & Action Anime',
        rows:[
          'theme_anime_shounen_series',
          'theme_anime_mecha_cyberpunk_series'
        ]
      },
      {
        title:'Isekai & Fantasy Sagas',
        rows:['theme_anime_isekai_series']
      },
      {
        title:'Slice of Life & Romance',
        rows:['theme_anime_slice_of_life_series']
      },
      {
        title:'Sports & Competition Anime',
        rows:['theme_anime_sports_series']
      },
      {
        title:'Studio Spotlight',
        rows:[
          'studio_ghibli',
          'theme_anime_studio_mappa_series',
          'theme_anime_studio_kyoto_animation_series',
          'theme_anime_studio_madhouse_series'
        ]
      }
    ];

    const rows = map.reduce(function(ids, folder){
      return ids.concat(folder.rows);
    }, []);

    if(map.length !== 6 || rows.length !== 14 || new Set(rows).size !== 14){
      console.error('Anime collection preset validation failed', {
        expectedFolders:6,
        actualFolders:map.length,
        expectedRows:14,
        actualRows:rows.length,
        uniqueRows:new Set(rows).size
      });
      return;
    }

    v2Collections.push({
      title:'Anime',
      folders:map.map(function(group){
        return applyFolderMedia({ title:group.title, rows:group.rows });
      })
    });

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'international'){
    const map = [
      { title:'Korean Cinema', rows:['korean_cinema_movies','korean_cinema_series'] },
      { title:'Japanese Cinema', rows:['japanese_cinema_movies','japanese_cinema_series'] },
      { title:'Chinese Cinema', rows:['chinese_cinema_movies','chinese_cinema_series'] },
      { title:'French Cinema', rows:['french_cinema_movies','french_cinema_series'] },
      { title:'Spanish Cinema', rows:['spanish_cinema_movies','spanish_cinema_series'] },
      { title:'Latin American Cinema', rows:[
        'mexican_cinema_movies','mexican_cinema_series',
        'argentine_cinema_movies','argentine_cinema_series',
        'brazilian_cinema_movies','brazilian_cinema_series'
      ] },
      { title:'Italian Cinema', rows:['italian_cinema_movies','italian_cinema_series'] },
      { title:'German Cinema', rows:['german_cinema_movies','german_cinema_series'] }
    ];

    const rows = map.reduce(function(ids, folder){ return ids.concat(folder.rows); }, []);
    if(map.length !== 8 || rows.length !== 20 || new Set(rows).size !== 20){
      console.error('International Cinema collection preset validation failed', {
        expectedFolders:8, actualFolders:map.length,
        expectedRows:20, actualRows:rows.length,
        uniqueRows:new Set(rows).size
      });
      return;
    }

    v2Collections.push({
      title:'International Cinema',
      folders:map.map(function(group){
        return applyFolderMedia({ title:group.title, rows:group.rows });
      })
    });

    if(!previewOnly){ renderCollections(); afterPresetAdded(key); }
    return;
  }

  if(key === 'documentaries'){
    const map = [
      {
        title:'Discover Documentaries',
        rows:[
          'new_documentary_movies',
          'new_documentary_series',
          'mdb_top_documentaries_movies',
          'theme_documentary_top_series'
        ]
      },
      {
        title:'True Crime & Serial Killers',
        rows:[
          'mdb_true_crime_movies',
          'theme_documentary_true_crime_series'
        ]
      },
      {
        title:'Nature, Wildlife & Earth',
        rows:[
          'theme_documentary_nature_movies',
          'mdb_nature_series'
        ]
      },
      {
        title:'Science, Tech & Cosmos',
        rows:[
          'theme_documentary_space_movies',
          'theme_documentary_science_space_series'
        ]
      },
      {
        title:'History, War & Civilizations',
        rows:[
          'theme_documentary_history_movies',
          'theme_documentary_history_series'
        ]
      },
      {
        title:'Music & Concert Documentaries',
        rows:['theme_documentary_music_movies']
      },
      {
        title:'Sports & Athletic Stories',
        rows:['theme_documentary_sports_series']
      }
    ];

    const rows = map.reduce(function(ids, folder){
      return ids.concat(folder.rows);
    }, []);

    if(map.length !== 7 || rows.length !== 14 || new Set(rows).size !== 14){
      console.error('Documentaries collection preset validation failed', {
        expectedFolders:7,
        actualFolders:map.length,
        expectedRows:14,
        actualRows:rows.length,
        uniqueRows:new Set(rows).size
      });
      return;
    }

    v2Collections.push({
      title:'Documentaries',
      folders:map.map(function(group){
        return applyFolderMedia({ title:group.title, rows:group.rows });
      })
    });

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

if(key === 'bollywood'){
  const map = [
    {
      title:'Discover Bollywood',
      rows:[
        'theme_bollywood_popular_movies',
        'theme_bollywood_top_movies',
        'theme_bollywood_new_movies'
      ]
    },
    {
      title:'Action, Thriller & Crime',
      rows:[
        'theme_bollywood_action_movies',
        'theme_bollywood_thriller_movies',
        'theme_bollywood_crime_movies'
      ]
    },
    {
      title:'Comedy & Romance',
      rows:[
        'theme_bollywood_comedy_movies',
        'theme_bollywood_romance_movies'
      ]
    },
    {
      title:'Bollywood Drama',
      rows:['theme_bollywood_drama_movies']
    }
  ];

  const rows = map.reduce(function(ids, folder){
    return ids.concat(folder.rows);
  }, []);

  if(map.length !== 4 || rows.length !== 9 || new Set(rows).size !== 9){
    console.error('Bollywood collection preset validation failed', {
      expectedFolders:4,
      actualFolders:map.length,
      expectedRows:9,
      actualRows:rows.length,
      uniqueRows:new Set(rows).size
    });
    return;
  }

  v2Collections.push({
    title:'Bollywood',
    folders:map.map(function(group){
      return applyFolderMedia({ title:group.title, rows:group.rows });
    })
  });

  if(!previewOnly){
    renderCollections();
    afterPresetAdded(key);
  }

  return;
}

if(key === 'genres'){
    const selectedIds = Array.from(selected);

    const map = [
      { title:'Action', rows:['action_movies','action_series'] },
      { title:'Comedy', rows:['comedy_movies','comedy_series','mdb_83497'] },
      { title:'Horror', rows:[
        'horror_movies',
        'horror_series',
        'mdb_102554',
        'mdb_2410',
        'theme_zombie',
        'theme_serialkiller'
      ] },
      { title:'Sci-Fi', rows:['scifi_movies','scifi_series'] },
      { title:'Thriller', rows:['thriller_movies','thriller_series'] },
      { title:'Crime', rows:['crime_movies','crime_series'] },
      { title:'Drama', rows:['drama_movies','drama_series'] },
      { title:'Romance', rows:['romance_movies','romance_series'] },
      { title:'Mystery', rows:['mystery_movies','mystery_series'] },
      { title:'Fantasy', rows:['fantasy_movies','fantasy_series'] },
      { title:'Family', rows:['family_movies','family_series'] },
      { title:'Animation', rows:['animation_movies','animation_series'] },
      { title:'Documentary', rows:['documentary_movies','documentary_series','mdb_84677','mdb_84403'] },
      { title:'History & War', rows:['mdb_8043','history_movies','history_series','war_movies','war_series'] },
      { title:'Nature', rows:['mdb_84487'] },
      { title:'Reality TV', rows:['mdb_84401','reality_series'] },
      { title:'Anime', rows:['anime_movies','anime_series'] },
      { title:'Bollywood', rows:['bollywood_movies','bollywood_series'] },
      { title:'Adventure', rows:['adventure_movies','adventure_series'] },
      { title:'Western', rows:['western_movies'] },
      { title:'Rom-Com', rows:['romcom_movies'] },
      { title:'Stand-Up', rows:['standup_movies'] },
      { title:'New Releases', rows:['new_movies'] }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;
      return applyFolderMedia({ title: group.title, rows: hits });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Genres',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }


  if(key === 'studios'){
    const selectedIds = Array.from(selected);

    const map = [
      { title:'Marvel', rows:['studio_marvel'] },
      { title:'DC', rows:['studio_dc'] },
      { title:'A24', rows:['studio_a24'] },
      { title:'Blumhouse', rows:['studio_blumhouse'] },
      { title:'Studio Ghibli', rows:['studio_ghibli'] },
      { title:'Pixar', rows:['mdb_3918'] },
      { title:'DreamWorks', rows:['mdb_3928'] },
      { title:'Warner Bros', rows:['studio_wb'] },
      { title:'Universal', rows:['studio_universal'] },
      { title:'Sony Pictures', rows:['studio_sony'] },
      { title:'Paramount', rows:['studio_paramount'] },
      { title:'20th Century', rows:['studio_20thcentury'] },
      { title:'Lionsgate', rows:['studio_lionsgate'] },
      { title:'New Line', rows:['studio_newline'] },
      { title:'Canal+', rows:['studio_canalplus'] },
      { title:'Walt Disney Pictures', rows:['studio_disney'] },
      { title:'Lucasfilm', rows:['studio_lucasfilm'] },
      { title:'MGM', rows:['studio_mgm'] }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;
      return applyFolderMedia({ title: group.title, rows: hits });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Studios',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }









  if(key === 'actors'){
    // Auto-select all actor catalogs
    const actorIds = ['actor_sandler','actor_jolie','actor_pitt','actor_bale','actor_eastwood','actor_denzel','actor_carrey','actor_depp','actor_dicaprio','actor_robbie','actor_damon','actor_freeman','actor_deniro','actor_rdj','actor_gosling','actor_reynolds','actor_rogen','actor_cruise','actor_hanks','actor_ferrell','actor_smith'];
    actorIds.forEach(function(id){ selected.add(id); });
    const selectedIds = Array.from(selected);

    const map = [
      { title:'Adam Sandler', rows:['actor_sandler'] },
      { title:'Angelina Jolie', rows:['actor_jolie'] },
      { title:'Brad Pitt', rows:['actor_pitt'] },
      { title:'Christian Bale', rows:['actor_bale'] },
      { title:'Clint Eastwood', rows:['actor_eastwood'] },
      { title:'Denzel Washington', rows:['actor_denzel'] },
      { title:'Jim Carrey', rows:['actor_carrey'] },
      { title:'Johnny Depp', rows:['actor_depp'] },
      { title:'Leonardo DiCaprio', rows:['actor_dicaprio'] },
      { title:'Margot Robbie', rows:['actor_robbie'] },
      { title:'Matt Damon', rows:['actor_damon'] },
      { title:'Morgan Freeman', rows:['actor_freeman'] },
      { title:'Robert De Niro', rows:['actor_deniro'] },
      { title:'Robert Downey Jr', rows:['actor_rdj'] },
      { title:'Ryan Gosling', rows:['actor_gosling'] },
      { title:'Ryan Reynolds', rows:['actor_reynolds'] },
      { title:'Seth Rogen', rows:['actor_rogen'] },
      { title:'Tom Cruise', rows:['actor_cruise'] },
      { title:'Tom Hanks', rows:['actor_hanks'] },
      { title:'Will Ferrell', rows:['actor_ferrell'] },
      { title:'Will Smith', rows:['actor_smith'] },
      { title:'Timothee Chalamet', rows:['actor_chalamet'] },
      { title:'Zendaya', rows:['actor_zendaya'] },
      { title:'Florence Pugh', rows:['actor_pugh'] },
      { title:'Tom Holland', rows:['actor_holland'] },
      { title:'Sydney Sweeney', rows:['actor_sweeney'] },
      { title:'Jenna Ortega', rows:['actor_ortega'] },
      { title:'Dwayne Johnson', rows:['actor_johnson'] },
      { title:'Nicole Kidman', rows:['actor_kidman'] },
      { title:'Jake Gyllenhaal', rows:['actor_gyllenhaal'] },
      { title:'Matthew McConaughey', rows:['actor_mcconaughey'] },
      { title:'Scarlett Johansson', rows:['actor_johansson'] },
      { title:'Cate Blanchett', rows:['actor_blanchett'] },
      { title:'Harrison Ford', rows:['actor_ford'] },
      { title:'Cillian Murphy', rows:['actor_murphy'] },
      { title:'Anthony Hopkins', rows:['actor_hopkins'] },
      { title:'Jack Nicholson', rows:['actor_nicholson'] },
      { title:'Robin Williams', rows:['actor_williams'] },
      { title:'Natalie Portman', rows:['actor_portman'] },
      { title:'Keanu Reeves', rows:['actor_reeves'] },
      { title:'Liam Neeson', rows:['actor_neeson'] },
      { title:'Daniel Craig', rows:['actor_craig'] },
      { title:'Ben Stiller', rows:['actor_stiller'] },
      { title:'Daniel Day-Lewis', rows:['actor_ddl'] }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;

      return applyFolderMedia({
        title: group.title,
        rows: hits
      });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Actors',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'directors'){
    // Auto-select all director catalogs
    const directorIds = ['director_nolan','director_scorsese','director_spielberg','director_villeneuve','director_fincher','director_kubrick','director_hitchcock','director_tarantino','director_anderson','director_burton','director_hughes'];
    directorIds.forEach(function(id){ selected.add(id); });
    const selectedIds = Array.from(selected);

    const map = [
      { title:'Christopher Nolan', rows:['director_nolan'] },
      { title:'Martin Scorsese', rows:['director_scorsese'] },
      { title:'Steven Spielberg', rows:['director_spielberg'] },
      { title:'Denis Villeneuve', rows:['director_villeneuve'] },
      { title:'David Fincher', rows:['director_fincher'] },
      { title:'Stanley Kubrick', rows:['director_kubrick'] },
      { title:'Alfred Hitchcock', rows:['director_hitchcock'] },
      { title:'Wes Anderson', rows:['director_anderson'] },
      { title:'Tim Burton', rows:['director_burton'] },
      { title:'Quentin Tarantino', rows:['director_tarantino'] },
      { title:'John Hughes', rows:['director_hughes'] },
      { title:'James Cameron', rows:['director_cameron'] },
      { title:'Ridley Scott', rows:['director_scott'] },
      { title:'Guillermo del Toro', rows:['director_deltoro'] },
      { title:'Paul Thomas Anderson', rows:['director_pta'] },
      { title:'Greta Gerwig', rows:['director_gerwig'] },
      { title:'Spike Lee', rows:['director_lee'] },
      { title:'David Lynch', rows:['director_lynch'] },
      { title:'John Carpenter', rows:['director_carpenter'] },
      { title:'Francis Ford Coppola', rows:['director_coppola'] },
      { title:'Brian De Palma', rows:['director_depalma'] },
      { title:'Peter Jackson', rows:['director_jackson'] }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;

      return applyFolderMedia({
        title: group.title,
        rows: hits
      });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Directors',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'themed'){
    const selectedIds = Array.from(selected);

    const map = [
      { title:'Mind-Benders', rows:['mdb_3892','mdb_3923'] },
      { title:'Outer Space', rows:['mdb_3920'] },
      { title:'Time Travel', rows:['mdb_2909'] },
      { title:'Modern Horror', rows:['mdb_102554'] },
      { title:'Horror Classics', rows:['mdb_2410'] },
      { title:'Perfect Scores', rows:['mdb_3885'] },
      { title:'Parody', rows:['mdb_4081'] },
      { title:'True Crime', rows:['mdb_4390'] },
      { title:'Thrillers', rows:['mdb_2858'] },
      { title:'Seasonal', rows:['mdb_136620'] },
      { title:'Superhero', rows:['theme_superhero'] },
      { title:'Heist', rows:['theme_heist'] },
      { title:'Spy & Espionage', rows:['spy_espionage_movies','spy_espionage_series'] },
      { title:'Serial Killer', rows:['theme_serialkiller'] },
      { title:'Time Loop', rows:['theme_timeloop'] },
      { title:'Zombie', rows:['theme_zombie'] },
      { title:'Slasher', rows:['theme_slasher'] },
{ title:'Paranormal', rows:['theme_paranormal'] },
{ title:'Possession', rows:['theme_possession'] },
{ title:'Found Footage', rows:['theme_foundfootage'] },
{ title:'Home Invasion', rows:['theme_homeinvasion'] },
{ title:'Creature Feature', rows:['theme_creaturefeature'] },
{ title:'Psychological Horror', rows:['theme_psychological'] },
{ title:'Horror Comedy', rows:['theme_horrorcomedy'] },
{ title:'Folk Horror', rows:['theme_folkhorror'] },
{ title:'Gothic Horror', rows:['theme_gothichorror'] },
{ title:'Body Horror', rows:['theme_bodyhorror'] },
{ title:'Cosmic Horror', rows:['theme_cosmichorror'] },
{ title:'Lovecraftian Horror', rows:['theme_lovecraftian'] },
{ title:'Animal Attack', rows:['theme_animalattack'] },
{ title:'Werewolf', rows:['theme_werewolf'] },
{ title:'Vampire', rows:['theme_vampire'] },
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;

      return applyFolderMedia({
        title: group.title,
        rows: hits
      });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Themed & Curated',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'trending'){
    const selectedIds = Array.from(selected);

    const map = [
      {
        title:'Core Trending',
        rows:[
          'trending_movies',
          'trending_series'
        ]
      },
      {
        title:'Popular Now',
        rows:[
          'popular_movies',
          'popular_series',
          'top_movies',
          'top_series',
          'mdb_2236',
          'mdb_1198',
          'mdb_69'
        ]
      },
      {
        title:'In Theatres & Airing',
        rows:[
          'now_movies',
          'airing_series',
          'ontheair_series'
        ]
      },
      {
        title:'Trakt Trending',
        rows:[
          'mdb_87667',
          'mdb_88434',
          'trakt_trending_movies',
          'trakt_trending_series'
        ]
      },
      {
        title:'Trakt Popular',
        rows:[
          'trakt_popular_movies',
          'trakt_popular_series'
        ]
      },
      {
        title:'Anticipated',
        rows:[
          'trakt_anticipated_movies',
          'trakt_anticipated_series'
        ]
      },
      {
        title:'My Trakt Picks',
        rows:[
          'trakt_fav_movies',
          'trakt_fav_series',
          'trakt_watchlist_movies',
          'trakt_watchlist_series',
          'trakt_collection_movies',
          'trakt_collection_series'
        ]
      }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;

      return applyFolderMedia({
        title: group.title,
        rows: hits
      });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Trending & Popular',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'uk'){
    const map = [
      { title:'BBC One', rows:['network_bbc'] },
      { title:'BBC Two', rows:['network_bbc_two'] },
      { title:'BBC Three', rows:['network_bbc_three'] },
      { title:'BBC Four', rows:['network_bbc_four'] },
      { title:'ITV', rows:['network_itv','itvx_movies','itvx_series'] },
      { title:'ITV2', rows:['network_itv2'] },
      { title:'Channel 4', rows:['network_ch4','channel4_movies','channel4_series'] },
      { title:'Channel 5', rows:['network_channel5'] },
      { title:'Dave', rows:['network_dave'] },
      { title:'E4', rows:['network_e4'] },
      { title:'Sky Atlantic', rows:['network_sky_atlantic'] },
      { title:'Sky Max', rows:['network_sky_max'] },
      { title:'UK Shows', rows:['mdb_3091'] },
      { title:'BritBox', rows:['britbox_movies','britbox_series'] }
    ];
    const rows = map.reduce(function(ids, folder){ return ids.concat(folder.rows); }, []);
    if(map.length !== 14 || new Set(rows).size !== rows.length){
      console.error('UK collection preset validation failed', { folders:map.length, rows:rows.length, uniqueRows:new Set(rows).size });
      return;
    }
    v2Collections.push({
      title:'UK',
      folders:map.map(function(group){ return applyFolderMedia({ title:group.title, rows:group.rows }); })
    });
    if(!previewOnly){ renderCollections(); afterPresetAdded(key); }
    return;
  }

  if(key === 'universes'){
    const universeIds = [
      'breakingbad_tv_collection',
      'breakingbad_movie_collection',
      'stephenking_movie_collection',
      'stephenking_tv_collection',
      'yellowstone_tv_collection',
      'walkingdead_tv_collection',
      'got_tv_collection',
      'theboys_tv_collection',
      'dexter_tv_collection',
      'power_tv_collection',
      'startrek_coll',
      'startrek_tv_collection',
      'starwars_movie_collection',
      'starwars_tv_collection',
      'mcu_movie_collection',
      'mcu_tv_collection',
      'alien_predator_movie_collection',
      'alien_predator_tv_collection',
      'csi_tv_collection',
      'ncis_tv_collection',
      'chicago_tv_collection',
      'laworder_tv_collection',
      'doctorwho_tv_collection',
      'vampirediaries_tv_collection',
      'soa_mayans_tv_collection',
      'vikings_tv_collection',
      'karatekid_coll',
      'cobra_kai_tv_collection',
      'stargate_movie_collection',
      'stargate_tv_collection',
      'battlestar_movie_collection',
      'battlestar_tv_collection',
      'bosch_tv_collection',
      'jackryan_movie_collection',
      'jackryan_tv_collection',
      'reacher_tv_collection',
      'rookie_tv_collection',
      'nineoneone_tv_collection'
    ];

    universeIds.forEach(function(id){
      selected.add(id);
    });

    const map = [
      {
        title:'Stephen King Universe',
        rows:[
          'stephenking_movie_collection',
          'stephenking_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/stephen_king.png'
      },
      {
        title:'Breaking Bad Universe',
        rows:[
          'breakingbad_movie_collection',
          'breakingbad_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/breaking_bad.png'
      },
      {
        title:'Yellowstone Universe',
        rows:[
          'yellowstone_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/yellowstone.png'
      },
      {
        title:'The Walking Dead Universe',
        rows:[
          'walkingdead_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/walking_dead.png'
      },
      {
        title:'Game of Thrones Universe',
        rows:[
          'got_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/game_of_thrones.png'
      },
      {
        title:'The Boys Universe',
        rows:[
          'theboys_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/the_boys.png'
      },
      {
        title:'Dexter Universe',
        rows:[
          'dexter_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/dexter.png'
      },
      {
        title:'Power Universe',
        rows:[
          'power_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/power.png'
      },
      {
        title:'Star Trek Universe',
        rows:[
          'startrek_coll',
          'startrek_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/startrek-universe.png'
      },
      {
        title:'Star Wars Universe',
        rows:[
          'starwars_movie_collection',
          'starwars_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/starwars-universe.png'
      },
      {
        title:'Marvel Cinematic Universe',
        rows:[
          'mcu_movie_collection',
          'mcu_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/mcu-universe.png'
      },
      {
        title:'Alien / Predator Universe',
        rows:[
          'alien_predator_movie_collection',
          'alien_predator_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/avp-universe.png'
      },
      {
        title:'CSI Universe',
        rows:[
          'csi_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/csi-universe.png'
      },
      {
        title:'NCIS Universe',
        rows:[
          'ncis_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/ncis-universe.png'
      },
      {
        title:'Chicago Universe',
        rows:[
          'chicago_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/chicago-universe.png'
      },
      {
        title:'Law & Order Universe',
        rows:[
          'laworder_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/law-universe.png'
      },
      {
        title:'Doctor Who Universe',
        rows:[
          'doctorwho_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/drwho-universe.png'
      },
      {
        title:'The Vampire Diaries Universe',
        rows:[
          'vampirediaries_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/vampire-universe.png'
      },
      {
        title:'Sons of Anarchy / Mayans Universe',
        rows:[
          'soa_mayans_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/soa-universe.png'
      },
      {
        title:'Vikings Universe',
        rows:[
          'vikings_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/vikings-universe.png'
      },
      {
        title:'Karate Kid / Cobra Kai Universe',
        rows:[
          'karatekid_coll',
          'cobra_kai_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/karatekid-universe.png'
      },
      {
        title:'Stargate Universe',
        rows:[
          'stargate_movie_collection',
          'stargate_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/stargate-universe.png'
      },
      {
        title:'Battlestar Galactica Universe',
        rows:[
          'battlestar_movie_collection',
          'battlestar_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/battlestar-universe.png'
      },
      {
        title:'Bosch Universe',
        rows:[
          'bosch_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/bosch-universe.png'
      },
      {
        title:'Jack Ryan Universe',
        rows:[
          'jackryan_movie_collection',
          'jackryan_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/jackryan-universe.png'
      },
      {
        title:'Reacher Universe',
        rows:[
          'reacher_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/reacher-universe.png'
      },
      {
        title:'The Rookie Universe',
        rows:[
          'rookie_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/rookie-universe.png'
      },
      {
        title:'9-1-1 Universe',
        rows:[
          'nineoneone_tv_collection'
        ],
        cover:IMAGE_BASE + 'universe/911-universe.png'
      }
    ];

    const folders = map.map(function(group){
      /*
       * Let the normal collection helper establish the folder
       * defaults first, then deliberately override the cover
       * with the existing Universe artwork or fallback art.
       */
      const folder = applyFolderMedia({
        title:group.title,
        rows:group.rows.slice()
      });

      folder.coverImageUrl = group.cover;
      folder.tileShape = 'LANDSCAPE';

      return folder;
    });

    const expectedUniverseFolderCount = map.length;
    const expectedUniverseRowCount = map.reduce(function(total, group){
      return total + group.rows.length;
    }, 0);

    if(
      folders.length !== expectedUniverseFolderCount ||
      universeIds.length !== expectedUniverseRowCount
    ){
      console.error(
        'Universes preset validation failed',
        {
          folders:folders.length,
          expectedFolders:expectedUniverseFolderCount,
          rows:universeIds.length,
          expectedRows:expectedUniverseRowCount
        }
      );

      if(typeof showBanner === 'function'){
        showBanner(
          'Universes failed its folder / row validation.',
          'error'
        );
      }

      return;
    }

    v2Collections.push({
      title:'Universes',
      folders:folders
    });

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);

      if(typeof updateCounter === 'function'){
        updateCounter();
      }

      if(typeof updateCategoryCounts === 'function'){
        updateCategoryCounts();
      }

      if(typeof persistStep2State === 'function'){
        persistStep2State();
      }
    }

    return;
  }

  if(key === 'sports'){
    /*
     * Keep the collection preset aligned with the canonical
     * Step 2 Sports order instead of maintaining a second
     * hand-written Sports ID list.
     */
    const sportsIds = Array.isArray(S2_ORDER.sports)
      ? S2_ORDER.sports.slice()
      : [];

    if(sportsIds.length === 0){
      console.error(
        'Sports preset validation failed before grouping',
        {
          actualRows:sportsIds.length
        }
      );

      if(typeof showBanner === 'function'){
        showBanner(
          'Sports preset has no available rows.',
          'error'
        );
      }

      return;
    }

    /*
     * Previewing the Sports folder picker must not alter Step 2 state.
     * Selection is committed only by the explicit preset selection path;
     * collection membership itself never changes Step 2 state.
     */
    if(!previewOnly){
      sportsIds.forEach(function(id){
        selected.add(id);
      });
    }

    function sportsPresetIsLive(id){
      return id === 'nuvio_sports_live'
        || id === 'nuvio_sports_upcoming'
        || id === 'nuvio_sports_networks';
    }

    function sportsPresetIsFootball(id){
      return id === 'nuvio_sports_football'
        || id === 'nuvio_sports_american_football'
        || id === 'nuvio_sports_college';
    }

    function sportsPresetIsBasketball(id){
      return id === 'nuvio_sports_basketball';
    }

    function sportsPresetIsWrestling(id){
      return id.startsWith('wwe_')
        || id.startsWith('wwf_')
        || id.startsWith('ecw_')
        || id.startsWith('sports_wrestling_')
        || id.startsWith('sports_wwe_')
        || id.startsWith('sports_aew_')
        || id.startsWith('sports_njpw_')
        || id.startsWith('sports_tna_')
        || id.startsWith('sports_roh_');
    }

    function sportsPresetIsMotorsport(id){
      return id === 'nuvio_sports_motorsport'
        || id.startsWith('f1_')
        || id.startsWith('motogp_')
        || id.startsWith('motorsport_')
        || id.startsWith('sports_motorsport')
        || id.startsWith('sports_formula1_')
        || id.startsWith('sports_f1_');
    }

    function sportsPresetIsBoxing(id){
      return id.startsWith('boxing_');
    }

    function sportsPresetIsMma(id){
      return id === 'nuvio_sports_mma'
        || id.startsWith('ufc_')
        || id.startsWith('mma_')
        || id.startsWith('pride_')
        || id.startsWith('sports_ufc_');
    }

    function sportsPresetIsOther(id){
      return id === 'nuvio_sports_cricket'
        || id === 'nuvio_sports_hockey'
        || id === 'nuvio_sports_baseball'
        || id === 'nuvio_sports_golf'
        || id === 'nuvio_sports_tennis'
        || id === 'nuvio_sports_rugby'
        || id === 'nuvio_sports_darts'
        || id === 'nuvio_sports_other';
    }

    const groups = [
      {
        title:'Live & Upcoming',
        matches:sportsPresetIsLive
      },
      {
        title:'Football',
        matches:sportsPresetIsFootball
      },
      {
        title:'Basketball',
        matches:sportsPresetIsBasketball
      },
      {
        title:'Wrestling',
        matches:sportsPresetIsWrestling
      },
      {
        title:'Motorsport',
        matches:sportsPresetIsMotorsport
      },
      {
        title:'Boxing',
        matches:sportsPresetIsBoxing
      },
      {
        title:'MMA',
        matches:sportsPresetIsMma
      },
      {
        title:'Other Sports',
        matches:sportsPresetIsOther
      }
    ];

    const folders = groups
      .map(function(group){
        const rows = sportsIds.filter(group.matches);

        if(!rows.length){
          return null;
        }

        return applyFolderMedia({
          title:group.title,
          rows:rows
        });
      })
      .filter(Boolean);

    /*
     * Every canonical Sports row must belong to exactly one
     * folder. A set also catches accidental duplicate grouping.
     */
    const groupedIds = [];

    folders.forEach(function(folder){
      (folder.rows || []).forEach(function(id){
        groupedIds.push(id);
      });
    });

    const uniqueGroupedIds = Array.from(
      new Set(groupedIds)
    );

    const missingIds = sportsIds.filter(function(id){
      return !uniqueGroupedIds.includes(id);
    });

    const duplicateCount =
      groupedIds.length - uniqueGroupedIds.length;

    if(
      uniqueGroupedIds.length !== sportsIds.length ||
      missingIds.length ||
      duplicateCount !== 0
    ){
      console.error(
        'Sports preset grouping validation failed',
        {
          canonicalRows:sportsIds.length,
          groupedRows:uniqueGroupedIds.length,
          missingIds:missingIds,
          duplicateCount:duplicateCount
        }
      );

      if(typeof showBanner === 'function'){
        showBanner(
          'Sports collection grouping failed validation.',
          'error'
        );
      }

      return;
    }

    console.log(
      'Sports collection preset ready',
      folders.map(function(folder){
        return {
          title:folder.title,
          rows:(folder.rows || []).length
        };
      })
    );

    v2Collections.push({
      title:'Sports',
      folders:folders
    });

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);

      if(typeof updateCounter === 'function'){
        updateCounter();
      }

      if(typeof updateCategoryCounts === 'function'){
        updateCategoryCounts();
      }

      if(typeof persistStep2State === 'function'){
        persistStep2State();
      }
    }

    return;
  }

  if(key === 'kids'){
    const map = [
      {
        title:'Discover Kids & Family',
        rows:[
          'mdb_trending_kids_movies',
          'mdb_trending_kids_series',
          'theme_kids_top_family_movies',
          'theme_kids_top_series'
        ]
      },
      {
        title:'New for Kids',
        rows:[
          'new_family_movies',
          'theme_kids_new_series'
        ]
      },
      {
        title:'Preschool & Learning',
        rows:[
          'network_nickjr',
          'theme_kids_disney_junior_series',
          'theme_kids_pbs_series'
        ]
      },
      {
        title:'Animated Studio Spotlight',
        rows:[
          'mdb_pixar_movies',
          'mdb_dreamworks_movies',
          'theme_kids_illumination_movies'
        ]
      },
      {
        title:'Family Movie Night',
        rows:[
          'theme_kids_family_musical_movies',
          'theme_kids_animal_adventure_movies'
        ]
      },
      {
        title:'Kids Superheroes',
        rows:['theme_kids_superhero_series']
      }
    ];

    const rows = map.reduce(function(ids, folder){
      return ids.concat(folder.rows);
    }, []);

    if(map.length !== 6 || rows.length !== 15 || new Set(rows).size !== 15){
      console.error('Kids & Family collection preset validation failed', {
        expectedFolders:6,
        actualFolders:map.length,
        expectedRows:15,
        actualRows:rows.length,
        uniqueRows:new Set(rows).size
      });
      return;
    }

    v2Collections.push({
      title:'Kids & Family',
      folders:map.map(function(group){
        return applyFolderMedia({ title:group.title, rows:group.rows });
      })
    });

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'decades'){
    const selectedIds = Array.from(selected);

    const map = [
      { title:'2026', rows:['best_movies_2026'] },
      { title:'2020s', rows:['mdb_91304'] },
      { title:'2010s', rows:['mdb_91303'] },
      { title:'2000s', rows:['mdb_91302'] },
      { title:'1990s', rows:['mdb_91300'] },
      { title:'1980s', rows:['mdb_91301'] },
      { title:'1970s', rows:['decade_1970s'] },
      { title:'1960s', rows:['decade_1960s'] },
      { title:'1950s', rows:['decade_1950s'] }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;
      return applyFolderMedia({
        title: group.title,
        rows: hits
      });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'By Decade',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'trakt'){
    const selectedIds = Array.from(selected);

    const map = [
      {
        title:'Trending',
        rows:[
          'mdb_87667',
          'mdb_88434',
          'trakt_trending_movies',
          'trakt_trending_series'
        ]
      },
      {
        title:'Popular',
        rows:[
          'trakt_popular_movies',
          'trakt_popular_series'
        ]
      },
      {
        title:'Anticipated',
        rows:[
          'trakt_anticipated_movies',
          'trakt_anticipated_series'
        ]
      },
      {
        title:'My Favourites',
        rows:[
          'trakt_fav_movies',
          'trakt_fav_series'
        ]
      },
      {
        title:'My Watchlist',
        rows:[
          'trakt_watchlist_movies',
          'trakt_watchlist_series'
        ]
      },
      {
        title:'My Collection',
        rows:[
          'trakt_collection_movies',
          'trakt_collection_series'
        ]
      }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;
      return applyFolderMedia({
        title: group.title,
        rows: hits
      });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Trakt',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  if(key === 'collections'){
    const selectedIds = Array.from(selected);

    const map = [
      { title:'Harry Potter', rows:['hp_collection'] },
      { title:'Star Trek', rows:['startrek_coll'] },
      { title:'Lord of the Rings', rows:['lotr_collection'] },
      { title:'Star Wars', rows:['starwars_collection'] },
      { title:'The Hobbit', rows:['hobbit_collection'] },
      { title:'James Bond', rows:['bond_collection'] },
      { title:'Mission Impossible', rows:['mi_collection'] },
      { title:'Indiana Jones', rows:['indiana_collection'] },
      { title:'Jurassic Park', rows:['jurassic_coll'] },
      { title:'Fast & Furious', rows:['fastfurious_coll'] },
      { title:'John Wick', rows:['johnwick_coll'] },
      { title:'The Matrix', rows:['matrix_collection'] },
      { title:'Die Hard', rows:['diehard_collection'] },
      { title:'Taken', rows:['taken_collection'] },
      { title:'The Bourne', rows:['bourne_collection'] },
      { title:'Ocean\'s', rows:['oceans_collection'] },
      { title:'Mad Max', rows:['madmax_collection'] },
      { title:'Rambo', rows:['rambo_collection'] },
      { title:'The Expendables', rows:['expendables_coll'] },
      { title:'Kingsman', rows:['kingsman_coll'] },
      { title:'The Avengers', rows:['avengers_coll'] },
      { title:'Captain America', rows:['captainamerica_coll'] },
      { title:'Iron Man', rows:['ironman_collection'] },
      { title:'Thor', rows:['thor_collection'] },
      { title:'Guardians of the Galaxy', rows:['gotg_collection'] },
      { title:'Doctor Strange', rows:['doctorstrange_coll'] },
      { title:'Black Panther', rows:['blackpanther_coll'] },
      { title:'Ant-Man', rows:['antman_collection'] },
      { title:'Deadpool', rows:['deadpool_coll'] },
      { title:'X-Men', rows:['xmen_collection'] },
      { title:'Wonder Woman', rows:['wonderwoman_coll'] },
      { title:'Aquaman', rows:['aquaman_collection'] },
      { title:'Alien', rows:['alien_collection'] },
      { title:'Terminator', rows:['terminator_coll'] },
      { title:'Predator', rows:['predator_coll'] },
      { title:'Halloween', rows:['halloween_coll'] },
      { title:'Nightmare on Elm Street', rows:['nightmare_coll'] },
      { title:'Saw', rows:['saw_collection'] },
      { title:'Scream', rows:['scream_collection'] },
      { title:'The Conjuring', rows:['conjuring_coll'] },
      { title:'Planet of the Apes', rows:['planetapes_coll'] },
      { title:'Transformers', rows:['transformers_coll'] },
      { title:'Hunger Games', rows:['hungergames_coll'] },
      { title:'Pirates of the Caribbean', rows:['pirates_collection'] },
      { title:'Shrek', rows:['shrek_collection'] },
      { title:'Ice Age', rows:['iceage_collection'] },
      { title:'How To Train Your Dragon', rows:['httyd_collection'] },
      { title:'Despicable Me', rows:['despicableme_coll'] },
      { title:'Kung Fu Panda', rows:['kungfupanda_coll'] },
      { title:'The Incredibles', rows:['incredibles_coll'] },
      { title:'Toy Story', rows:['toystory_coll'] },
      { title:'Finding Nemo', rows:['findingnemo_coll'] },
      { title:'Minions', rows:['shrek2_collection'] },
      { title:'Dune', rows:['dune_collection'] },
      { title:'The Godfather', rows:['godfather_collection'] },
      { title:'Spider-Man', rows:['spiderman_collection'] },
      { title:'Avatar', rows:['avatar_collection'] },
      { title:'Scary Movie', rows:['scarymovie_coll'] },
      { title:'Knives Out', rows:['knivesout_coll'] },
      { title:'Maze Runner', rows:['mazerunner_coll'] },
      { title:'Superman', rows:['superman_collection'] },
      { title:'Batman', rows:['batman_collection'] },
      { title:'Back to the Future', rows:['backtofuture_coll'] },
      { title:'Sherlock Holmes', rows:['sherlock_coll'] }
    ];

    const folders = map.map(function(group){
      const hits = group.rows;
      if(!hits.length) return null;
      return applyFolderMedia({ title: group.title, rows: hits });
    }).filter(Boolean);

    if(folders.length){
      v2Collections.push({
        title:'Film Collections',
        folders: folders
      });
    }

    if(!previewOnly){
      renderCollections();
      afterPresetAdded(key);
    }

    return;
  }

  const names = {
    trending:'Trending & Popular',
    latest:'New & Latest',
    genres:'Genres',
    themed:'Themed & Curated',
    studios:'Studios',
    directors:'Directors',
    actors:'Actors',
    trakt:'Trakt',
    collections:'Film Collections',
    decades:'By Decade',
    kids:'Kids & Family',
    sports:'Sports',
    uk:'UK'
  };

  v2Collections.push({
    title: names[key] || 'Collection',
    folders: [{title:'Folder',rows:[]}]
  });

  if(!previewOnly) renderCollections();

  const p = document.getElementById('presetsPanel');
}


