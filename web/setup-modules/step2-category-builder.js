// ══════════════════════════════════════════
// STEP 2 — NEW CATEGORY BUILDER
// ══════════════════════════════════════════
var S2_DEFS = {};
var s2RawVisible = false;

var S2_UNIVERSE_FALLBACK_DEFS = {
  csi_tv_collection: {
    name:'CSI Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  ncis_tv_collection: {
    name:'NCIS Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  chicago_tv_collection: {
    name:'Chicago Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  laworder_tv_collection: {
    name:'Law & Order Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  doctorwho_tv_collection: {
    name:'Doctor Who Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  vampirediaries_tv_collection: {
    name:'The Vampire Diaries Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  soa_mayans_tv_collection: {
    name:'Sons of Anarchy / Mayans Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  vikings_tv_collection: {
    name:'Vikings Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  startrek_tv_collection: {
    name:'Star Trek Universe · Series',
    type:'series',
    handler:'tmdb_ids'
  },
  alien_predator_movie_collection: {
    name:'Alien / Predator Universe · Movies',
    type:'movie',
    handler:'tmdb_ids'
  },
  alien_predator_tv_collection: {
    name:'Alien / Predator Universe · Series',
    type:'series',
    handler:'tmdb_ids'
  },
  stargate_movie_collection: {
    name:'Stargate Universe · Movies',
    type:'movie',
    handler:'tmdb_ids'
  },
  stargate_tv_collection: {
    name:'Stargate Universe · Series',
    type:'series',
    handler:'tmdb_ids'
  },
  battlestar_movie_collection: {
    name:'Battlestar Galactica Universe · Movies',
    type:'movie',
    handler:'tmdb_ids'
  },
  battlestar_tv_collection: {
    name:'Battlestar Galactica Universe · Series',
    type:'series',
    handler:'tmdb_ids'
  },
  bosch_tv_collection: {
    name:'Bosch Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  jackryan_movie_collection: {
    name:'Jack Ryan Universe · Movies',
    type:'movie',
    handler:'tmdb_ids'
  },
  jackryan_tv_collection: {
    name:'Jack Ryan Universe · Series',
    type:'series',
    handler:'tmdb_ids'
  },
  reacher_tv_collection: {
    name:'Reacher Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  rookie_tv_collection: {
    name:'The Rookie Universe',
    type:'series',
    handler:'tmdb_ids'
  },
  nineoneone_tv_collection: {
    name:'9-1-1 Universe',
    type:'series',
    handler:'tmdb_ids'
  }
};

// Legacy catalog ids — before these MDBList-backed rows had readable slugs,
// their id was just "mdb_" + the raw MDBList numeric list id (e.g.
// "mdb_88307"). Older saved setups (catalogOrder/hidden/collections) still
// reference these old ids, so S2_DEFS[id] misses and the raw id leaks into
// the UI (Step 2 reorder list, collection folder rows). This mirrors the
// server-side MDB_ID_ALIASES map (catalogs/catalog-defs.js) so those ids
// keep resolving to the same human-readable name client-side.
var MDB_LEGACY_ALIASES = {
  mdb_87667: "mdb_trakt_trending_movies",
  mdb_88434: "mdb_trakt_trending_series",
  mdb_2236: "mdb_top_movies_week",
  mdb_1198: "mdb_most_popular_movies",
  mdb_69: "mdb_imdb_moviemeter_top100",
  mdb_86934: "mdb_latest_digital_release",
  mdb_960: "mdb_latest_releases",
  mdb_2202: "mdb_latest_bluray_releases",
  mdb_1176: "mdb_latest_certified_fresh",
  mdb_86710: "mdb_latest_airing_shows",
  mdb_88307: "mdb_trending_kids_movies",
  mdb_88309: "mdb_trending_kids_series",
  mdb_13: "mdb_top_kids_movies_week",
  mdb_88328: "mdb_netflix_latest_movies",
  mdb_86751: "mdb_netflix_latest_series",
  mdb_86755: "mdb_amazon_latest_movies",
  mdb_86753: "mdb_amazon_latest_series",
  mdb_88317: "mdb_appletv_latest_movies",
  mdb_88319: "mdb_appletv_latest_series",
  mdb_86759: "mdb_disney_latest_movies",
  mdb_86758: "mdb_disney_latest_series",
  mdb_89647: "mdb_hbo_latest_movies",
  mdb_89649: "mdb_hbo_latest_series",
  mdb_86762: "mdb_paramount_latest_movies",
  mdb_86761: "mdb_paramount_latest_series",
  mdb_88326: "mdb_hulu_latest_movies",
  mdb_88327: "mdb_hulu_latest_series",
  mdb_84677: "mdb_top_documentaries_movies",
  mdb_84403: "mdb_documentary_series",
  mdb_8043: "mdb_history_war_movies",
  mdb_84487: "mdb_nature_series",
  mdb_84401: "mdb_reality_tv_series",
  mdb_83497: "mdb_standup_comedy_movies",
  mdb_3892: "mdb_mindfuck_movies",
  mdb_3923: "mdb_plot_twists_movies",
  mdb_3920: "mdb_outer_space_movies",
  mdb_2909: "mdb_time_travel_movies",
  mdb_102554: "mdb_modern_horror_movies",
  mdb_2410: "mdb_horror_classics_movies",
  mdb_3885: "mdb_rotten_tomatoes_100_movies",
  mdb_4081: "mdb_parody_movies",
  mdb_4390: "mdb_true_crime_movies",
  mdb_2858: "mdb_thrilling_movies",
  mdb_136620: "mdb_seasonal_movies",
  mdb_3918: "mdb_pixar_movies",
  mdb_3928: "mdb_dreamworks_movies",
  mdb_3087: "mdb_bbc_shows_series",
  mdb_3091: "mdb_uk_shows_series",
  mdb_92337: "mdb_best_of_2025",
  mdb_91304: "mdb_best_of_2020s",
  mdb_91303: "mdb_best_of_2010s",
  mdb_91302: "mdb_best_of_2000s",
  mdb_91300: "mdb_best_of_1990s",
  mdb_91301: "mdb_best_of_1980s"
};

function normalizeCatalogId(id){
  var value = getCollectionRowId(id);
  return MDB_LEGACY_ALIASES[value] || value;
}

// In-memory cache of names resolved via /api/mdblist-name/:id, for raw
// "mdb_<numericId>" catalog ids that aren't covered by MDB_LEGACY_ALIASES
// (e.g. custom rows added directly by numeric list id, not through the
// public-list search flow which already stores its own name).
var mdbNameCache = {};
var mdbNamePending = {};

function s2ResolveMdbListNameAsync(id, onResolved){
  var m = /^mdb_(\d+)$/.exec(id);
  if(!m) return;
  if(mdbNameCache[id]){ onResolved(mdbNameCache[id]); return; }
  if(!mdbNamePending[id]){
    mdbNamePending[id] = fetch('/api/mdblist-name/' + m[1])
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){
        if(data && data.name){
          mdbNameCache[id] = { name: data.name, mediatype: data.mediatype || null };
        }
        return mdbNameCache[id] || null;
      })
      .catch(function(){ return null; });
  }
  mdbNamePending[id].then(function(resolved){ if(resolved) onResolved(resolved); });
}

var S2_STREAMING_GROUPS = [
  {
    id:'mainstream-streaming',
    icon:'📺',
    name:'Mainstream Streaming',
    sub:'Netflix, Prime Video, Disney+, Max, Apple TV+, Paramount+, Hulu, Peacock, Tubi and Pluto TV',
    rows:[
      'netflix_movies',
      'netflix_series',
      'mdb_88328',
      'mdb_86751',

      'amazon_movies',
      'amazon_series',
      'mdb_86755',
      'mdb_86753',

      'disney_movies',
      'disney_series',
      'mdb_86759',
      'mdb_86758',

      'hbo_movies',
      'hbo_series',
      'mdb_89647',
      'mdb_89649',

      'apple_movies',
      'apple_series',
      'mdb_88317',
      'mdb_88319',

      'paramount_movies',
      'paramount_series',
      'mdb_86762',
      'mdb_86761',

      'hulu_movies',
      'hulu_series',
      'mdb_88326',
      'mdb_88327',

      'peacock_movies',
      'peacock_series',

      'shudder_movies',
      'shudder_series',

      'tubi_movies',
      'tubi_series',
      'pluto_movies',
      'pluto_series'
    ]
  },
  {
    id:'uk-british-tv',
    icon:'🇬🇧',
    name:'UK & British TV',
    sub:'BritBox, Acorn, ITVX and Channel 4',
    rows:[
      'britbox_movies',
      'britbox_series',
      'acorn_movies',
      'acorn_series',
      'itvx_movies',
      'itvx_series',
      'channel4_movies',
      'channel4_series'
    ]
  },
  {
    id:'anime-specialist',
    icon:'🎌',
    name:'Anime & Arthouse',
    sub:'Crunchyroll, HiDive and MUBI',
    rows:[
      'crunchyroll_movies',
      'crunchyroll_series',
      'hidive_movies',
      'hidive_series',
      'mubi_movies'
    ]
  },
  {
    id:'premium-networks',
    icon:'⭐',
    name:'Premium Networks',
    sub:'MGM+ and Starz',
    rows:[
      'mgm_movies',
      'mgm_series',
      'starz_movies',
      'starz_series'
    ]
  },
  {
    id:'factual-discovery',
    icon:'🌍',
    name:'Factual & Discovery',
    sub:'Discovery+, National Geographic, A&E and Animal Planet',
    rows:[
      'discovery_movies',
      'discovery_series',
      'natgeo_movies',
      'natgeo_series',
      'ae_series',
      'animalplanet_series'
    ]
  }
];

var S2_STREAMING_IDS = S2_STREAMING_GROUPS.reduce(
  function(ids, group){
    return ids.concat(group.rows);
  },
  []
);

var S2_CATEGORIES = [
  { id:'quickpicks', icon:'⚡', name:'Quick Picks', sub:'AI, Right Now, Trending, Popular, New Releases',
    filter: function(id){
      var qpMdb = ['mdb_2236','mdb_1198','mdb_69','mdb_87667','mdb_88434','mdb_960','mdb_86934','mdb_2202','mdb_1176','mdb_86710'];
      return id.startsWith('ai_')||id.startsWith('rightnow')||id.startsWith('trending')||id.startsWith('popular')||(id === 'top_movies' || id === 'top_series')||id.startsWith('now_')||id.startsWith('airing')||id.startsWith('ontheair')||qpMdb.includes(id);
    },
    posters:['tt0816692','tt1375666','tt0468569','tt1160419','tt15398776','tt0137523'] },

    { id:'cloud-library', icon:'☁️', name:'Cloud Library', sub:'Your Premiumize cloud with posters, metadata and playback',
      filter:function(id){ return id === 'premiumize_movies' || id === 'premiumize_series'; },
      posters:['tt0816692','tt1375666','tt0468569','tt15398776'] },

    {
      id:'fresh-discovery',
      icon:'🆕',
      name:'Fresh Discovery',
      sub:'Recently released movies and series by genre',
      filter:function(id){
        return [
          'new_action_movies',
          'new_comedy_movies',
          'new_crime_movies',
          'new_horror_movies',
          'new_scifi_movies',
          'new_drama_movies',
          'new_documentary_movies',
          'new_family_movies',
          'new_action_adventure_series',
          'new_comedy_series',
          'new_crime_series',
          'new_drama_series',
          'new_scifi_fantasy_series',
          'new_documentary_series'
        ].includes(id);
      },
      children:[
        {
          id:'new-by-genre',
          icon:'🆕',
          name:'New by Genre',
          sub:'Fresh movies and series grouped by genre',
          filter:function(id){
            return [
              'new_action_movies',
              'new_comedy_movies',
              'new_crime_movies',
              'new_horror_movies',
              'new_scifi_movies',
              'new_drama_movies',
              'new_documentary_movies',
              'new_family_movies',
              'new_action_adventure_series',
              'new_comedy_series',
              'new_crime_series',
              'new_drama_series',
              'new_scifi_fantasy_series',
              'new_documentary_series'
            ].includes(id);
          }
        }
      ],
      posters:['tt0816692','tt1375666','tt1160419','tt15398776']
    },

  { id:'streaming', icon:'📡', name:'Streaming Services', sub:'59 rows grouped by service type',
    filter:function(id){
      return S2_STREAMING_IDS.includes(id);
    },
    children:S2_STREAMING_GROUPS.map(function(group){
      return {
        id:group.id,
        icon:group.icon,
        name:group.name,
        sub:group.sub,
        filter:function(id){
          return group.rows.includes(id);
        }
      };
    }),
    posters:['tt15398776','tt5180504','tt7366338','tt2442560'] },
  { id:'genres', icon:'🎭', name:'Genres', sub:'Action, Horror, Comedy, Sci-Fi and more',
    filter: function(id){
      var s=[
        'action',
        'comedy',
        'horror',
        'scifi',
        'thriller',
        'crime',
        'drama',
        'romance',
        'mystery',
        'fantasy',
        'animation',
        'family',
        'documentary',
        'anime',
        'bollywood',
        'adventure',
        'history',
        'romcom',
        'reality',
        'war',
        'western',
        'curiosity',
        'standup',
        'new_movies'
      ];

      var gMdb=[
        'mdb_8043',
        'mdb_84487',
        'mdb_84401',
        'mdb_83497',
        'mdb_84403',
        'mdb_2410',
        'mdb_102554',
        'mdb_84677',
        'mdb_4390',
        'mdb_2858'
      ];

      var topRatedGenreIds=[
                'top_horror_movies',
                'top_scifi_movies',
                'top_crime_movies',
                'top_drama_movies',
                'top_scifi_fantasy_series',
                'top_crime_series',
                'top_drama_series'
              ];
      
              return s.some(function(p){
                return id.startsWith(p);
              }) || gMdb.includes(id) || topRatedGenreIds.includes(id);
    },
    children:[
      {
        id:'action-adventure',
        icon:'💥',
        name:'Action & Adventure',
        sub:'Action, adventure and high-energy stories',
        filter:function(id){
          return id.startsWith('action_')
            || id.startsWith('adventure_');
        }
      },
      {
        id:'comedy-romance',
        icon:'😄',
        name:'Comedy & Romance',
        sub:'Comedy, romance, rom-com and stand-up',
        filter:function(id){
          return id.startsWith('comedy_')
            || id.startsWith('romance_')
            || id.startsWith('romcom_')
            || id.startsWith('standup_')
            || id === 'mdb_83497';
        }
      },
      {
        id:'crime-thriller',
        icon:'🕵️',
        name:'Crime & Thriller',
        sub:'Crime, thrillers and true-crime picks',
        filter:function(id){
          return id.startsWith('crime_')
            || id.startsWith('thriller_')
            || id === 'mdb_4390'
            || id === 'mdb_2858';
        }
      },
      {
        id:'drama-mystery',
        icon:'🎭',
        name:'Drama & Mystery',
        sub:'Drama and mystery',
        filter:function(id){
          return id.startsWith('drama_')
            || id.startsWith('mystery_');
        }
      },
      {
        id:'horror',
        icon:'👻',
        name:'Horror',
        sub:'Horror, modern horror and classics',
        filter:function(id){
          return id.startsWith('horror_')
            || id === 'mdb_2410'
            || id === 'mdb_102554';
        }
      },
      {
        id:'scifi-fantasy',
        icon:'🚀',
        name:'Sci-Fi & Fantasy',
        sub:'Science fiction and fantasy',
        filter:function(id){
          return id.startsWith('scifi_')
            || id.startsWith('fantasy_');
        }
      },
      {
        id:'family-animation',
        icon:'🧸',
        name:'Family & Animation',
        sub:'Family viewing and animation',
        filter:function(id){
          return id.startsWith('family_')
            || id.startsWith('animation_');
        }
      },
      {
        id:'documentary-reality',
        icon:'🎥',
        name:'Documentary & Reality',
        sub:'Documentaries, nature, reality and curiosity',
        filter:function(id){
          return id.startsWith('documentary_')
            || id.startsWith('reality_')
            || id.startsWith('curiosity_')
            || id === 'mdb_84487'
            || id === 'mdb_84401'
            || id === 'mdb_84403'
            || id === 'mdb_84677';
        }
      },
      {
        id:'history-war-western',
        icon:'🏛️',
        name:'History, War & Western',
        sub:'History, war stories and westerns',
        filter:function(id){
          return id.startsWith('history_')
            || id.startsWith('war_')
            || id.startsWith('western_')
            || id === 'mdb_8043';
        }
      },
      {
        id:'anime-world',
        icon:'🌏',
        name:'Anime & World Cinema',
        sub:'Anime and Bollywood',
        filter:function(id){
          return id.startsWith('anime_')
            || id.startsWith('bollywood_');
        }
      },
      {
        id:'top-rated-by-genre',
          icon:'⭐',
          name:'Top Rated by Genre',
          sub:'Highly rated movies and series by genre',
          filter:function(id){
            return [
              'top_horror_movies',
              'top_scifi_movies',
              'top_crime_movies',
              'top_drama_movies',
              'top_scifi_fantasy_series',
              'top_crime_series',
              'top_drama_series'
            ].includes(id);
          }
      },
      {
        id:'new-releases',
        icon:'🆕',
        name:'New Releases',
        sub:'Genre-based new release rows',
        filter:function(id){
          return id === 'new_movies';
        }
      }
    ],
    posters:['tt0110912','tt0137523','tt0245429','tt3783958'] },
  {
    id:'anime-discovery',
    icon:'🍥',
    name:'Anime Discovery',
    sub:'Top rated, themes, sports and studio spotlights',
    filter:function(id){
      return id.startsWith('theme_anime_');
    },
    children:[
      {
        id:'anime-top-rated',
        icon:'⭐',
        name:'Top Rated Anime',
        sub:'Top rated Japanese anime films and series',
        filter:function(id){
          return id === 'theme_anime_top_movies'
            || id === 'theme_anime_top_series';
        }
      },
      {
        id:'anime-themes',
        icon:'⚔️',
        name:'Anime Themes',
        sub:'Shounen, mecha, isekai and slice of life',
        filter:function(id){
          return [
            'theme_anime_shounen_series',
            'theme_anime_mecha_cyberpunk_series',
            'theme_anime_isekai_series',
            'theme_anime_slice_of_life_series'
          ].includes(id);
        }
      },
      {
        id:'anime-sports',
        icon:'🏆',
        name:'Sports Anime',
        sub:'Sports and competition series',
        filter:function(id){
          return id === 'theme_anime_sports_series';
        }
      },
      {
        id:'anime-studios',
        icon:'🎬',
        name:'Anime Studios',
        sub:'MAPPA, Kyoto Animation and Madhouse',
        filter:function(id){
          return [
            'theme_anime_studio_mappa_series',
            'theme_anime_studio_kyoto_animation_series',
            'theme_anime_studio_madhouse_series'
          ].includes(id);
        }
      }
    ],
    posters:['tt0245429','tt2560140','tt2098220','tt0877057']
  },
  {
    id:'documentary-discovery',
    icon:'🎥',
    name:'Documentary Discovery',
    sub:'Top rated, true crime, nature, science, history, music and sports',
    filter:function(id){
      return id.startsWith('theme_documentary_');
    },
    children:[
      {
        id:'documentary-best-true-crime',
        icon:'⭐',
        name:'Best & True Crime',
        sub:'Top rated documentary series and true-crime docuseries',
        filter:function(id){
          return id === 'theme_documentary_top_series'
            || id === 'theme_documentary_true_crime_series';
        }
      },
      {
        id:'documentary-nature-science',
        icon:'🌍',
        name:'Nature & Science',
        sub:'Nature, space and science documentaries',
        filter:function(id){
          return [
            'theme_documentary_nature_movies',
            'theme_documentary_space_movies',
            'theme_documentary_science_space_series'
          ].includes(id);
        }
      },
      {
        id:'documentary-history-society',
        icon:'🏛️',
        name:'History & Society',
        sub:'History and war documentary films and series',
        filter:function(id){
          return id === 'theme_documentary_history_movies'
            || id === 'theme_documentary_history_series';
        }
      },
      {
        id:'documentary-music-sports',
        icon:'🏆',
        name:'Music & Sports',
        sub:'Music documentaries and sports docuseries',
        filter:function(id){
          return id === 'theme_documentary_music_movies'
            || id === 'theme_documentary_sports_series';
        }
      }
    ],
    posters:['tt5491994','tt8420184','tt8760684','tt11459366']
  },
  {
    id:'kids-family-discovery',
    icon:'🧒',
    name:'Kids & Family Discovery',
    sub:'Top rated, new, learning, family themes and animation studios',
    filter:function(id){
      return id.startsWith('theme_kids_');
    },
    children:[
      {
        id:'kids-discover-new',
        icon:'🆕',
        name:'Discover & New',
        sub:'Top rated family movies and top or new Kids series',
        filter:function(id){
          return [
            'theme_kids_top_family_movies',
            'theme_kids_top_series',
            'theme_kids_new_series'
          ].includes(id);
        }
      },
      {
        id:'kids-preschool-learning',
        icon:'🎓',
        name:'Preschool & Learning',
        sub:'Disney Junior and PBS Kids',
        filter:function(id){
          return id === 'theme_kids_disney_junior_series'
            || id === 'theme_kids_pbs_series';
        }
      },
      {
        id:'kids-family-themes',
        icon:'✨',
        name:'Family Themes',
        sub:'Musicals, animal adventures and Kids superheroes',
        filter:function(id){
          return [
            'theme_kids_family_musical_movies',
            'theme_kids_animal_adventure_movies',
            'theme_kids_superhero_series'
          ].includes(id);
        }
      },
      {
        id:'kids-animation-studios',
        icon:'🎬',
        name:'Animation Studios',
        sub:'Illumination family animation',
        filter:function(id){
          return id === 'theme_kids_illumination_movies';
        }
      }
    ],
    posters:['tt29623480','tt7678620','tt13706018','tt2294629']
  },
  {
    id:'bollywood-discovery',
    icon:'🇮🇳',
    name:'Bollywood',
    sub:'Popular, top rated, new releases and Hindi movie genres',
    filter:function(id){
      return id.startsWith('theme_bollywood_');
    },
    children:[
      {
        id:'bollywood-discovery-main',
        icon:'🔥',
        name:'Discover Bollywood',
        sub:'Popular, top rated and new Hindi films',
        filter:function(id){
          return [
            'theme_bollywood_popular_movies',
            'theme_bollywood_top_movies',
            'theme_bollywood_new_movies'
          ].includes(id);
        }
      },
      {
        id:'bollywood-action-crime',
        icon:'💥',
        name:'Action & Crime',
        sub:'Bollywood action, thriller and crime films',
        filter:function(id){
          return [
            'theme_bollywood_action_movies',
            'theme_bollywood_thriller_movies',
            'theme_bollywood_crime_movies'
          ].includes(id);
        }
      },
      {
        id:'bollywood-comedy-romance',
        icon:'❤️',
        name:'Comedy & Romance',
        sub:'Bollywood comedy and romance films',
        filter:function(id){
          return [
            'theme_bollywood_comedy_movies',
            'theme_bollywood_romance_movies'
          ].includes(id);
        }
      },
      {
        id:'bollywood-drama',
        icon:'🎭',
        name:'Drama',
        sub:'Bollywood drama films',
        filter:function(id){
          return id === 'theme_bollywood_drama_movies';
        }
      }
    ],
    posters:['tt1187043','tt0112870','tt5074352','tt15398776']
  },

    {
      id:'international',
      icon:'🌏',
      name:'International',
      sub:'Cinema and series from across Asia, Europe and Latin America',
      filter:function(id){
        return [
          'korean_cinema_movies',
          'korean_cinema_series',
          'japanese_cinema_movies',
          'japanese_cinema_series',
          'chinese_cinema_movies',
          'chinese_cinema_series',
          'french_cinema_movies',
          'french_cinema_series',
          'spanish_cinema_movies',
          'spanish_cinema_series',
          'italian_cinema_movies',
          'italian_cinema_series',
          'german_cinema_movies',
          'german_cinema_series',
          'mexican_cinema_movies',
          'mexican_cinema_series',
          'argentine_cinema_movies',
          'argentine_cinema_series',
          'brazilian_cinema_movies',
          'brazilian_cinema_series'
        ].includes(id);
      },
      children:[
        {
          id:'korean-cinema',
          icon:'🇰🇷',
          name:'Korean Cinema',
          sub:'Korean movies and series',
          filter:function(id){
            return id === 'korean_cinema_movies'
              || id === 'korean_cinema_series';
          }
        },
        {
          id:'japanese-cinema',
          icon:'🇯🇵',
          name:'Japanese Cinema',
          sub:'Japanese movies and series',
          filter:function(id){
            return id === 'japanese_cinema_movies'
              || id === 'japanese_cinema_series';
          }
        },
        {
          id:'chinese-cinema',
          icon:'🇨🇳',
          name:'Chinese Cinema',
          sub:'Chinese movies and series',
          filter:function(id){
            return id === 'chinese_cinema_movies'
              || id === 'chinese_cinema_series';
          }
        },
        {
          id:'french-cinema',
          icon:'🇫🇷',
          name:'French Cinema',
          sub:'French movies and series',
          filter:function(id){
            return id === 'french_cinema_movies'
              || id === 'french_cinema_series';
          }
        },
        {
          id:'spanish-cinema',
          icon:'🇪🇸',
          name:'Spanish Cinema',
          sub:'Spanish movies and series',
          filter:function(id){
            return id === 'spanish_cinema_movies'
              || id === 'spanish_cinema_series';
          }
        },
        {
          id:'latin-american-cinema',
          icon:'🌎',
          name:'Latin American Cinema',
          sub:'Mexican, Argentine and Brazilian movies and series',
          filter:function(id){
            return [
              'mexican_cinema_movies',
              'mexican_cinema_series',
              'argentine_cinema_movies',
              'argentine_cinema_series',
              'brazilian_cinema_movies',
              'brazilian_cinema_series'
            ].includes(id);
          }
        },
        {
          id:'italian-cinema',
          icon:'🇮🇹',
          name:'Italian Cinema',
          sub:'Italian movies and series',
          filter:function(id){
            return id === 'italian_cinema_movies'
              || id === 'italian_cinema_series';
          }
        },
        {
          id:'german-cinema',
          icon:'🇩🇪',
          name:'German Cinema',
          sub:'German movies and series',
          filter:function(id){
            return id === 'german_cinema_movies'
              || id === 'german_cinema_series';
          }
        }
      ],
      posters:['tt6751668','tt4016934','tt0245429','tt2560140']
    },

  { id:'themed', icon:'✨', name:'Themed & Curated', sub:'Concepts, horror, cinema experiences and curated picks',
    filter: function(id){
      var tMdb=[
        'mdb_3892',
        'mdb_3920',
        'mdb_3923',
        'mdb_2909',
        'mdb_4081',
        'mdb_136620',
        'mdb_3885',
        'mdb_4390',
        'mdb_2858'
      ];

      return (id.startsWith('theme_')
          && !id.startsWith('theme_anime_')
          && !id.startsWith('theme_documentary_')
          && !id.startsWith('theme_kids_'))
          || id === 'spy_espionage_movies'
          || id === 'spy_espionage_series'
          || id === 'imax_movies'
        || tMdb.includes(id);
    },
    children:[
      {
        id:'heroes-concepts',
        icon:'🦸',
        name:'Heroes & Concepts',
        sub:'Superheroes, time loops, space and mind-benders',
        filter:function(id){
          return id === 'theme_superhero'
            || id === 'theme_timeloop'
            || id === 'mdb_3892'
            || id === 'mdb_3920'
            || id === 'mdb_3923'
            || id === 'mdb_2909';
        }
      },
      {
        id:'crime-underworld',
        icon:'🕵️',
        name:'Crime & Underworld',
        sub:'Heists, mafia, gangsters, detectives and killers',
        filter:function(id){
          return id === 'theme_heist'
              || id === 'spy_espionage_movies'
              || id === 'spy_espionage_series'
            || id === 'theme_mafia'
            || id === 'theme_gangster'
            || id === 'theme_detective'
            || id === 'theme_police'
            || id === 'theme_prison'
            || id === 'theme_murder'
            || id === 'theme_serialkiller'
            || id === 'mdb_4390'
            || id === 'mdb_2858';
        }
      },
      {
        id:'slashers-survival',
        icon:'🔪',
        name:'Slashers & Survival',
        sub:'Slashers, home invasion, found footage and attack films',
        filter:function(id){
          return id === 'theme_slasher'
            || id === 'theme_homeinvasion'
            || id === 'theme_foundfootage'
            || id === 'theme_animalattack';
        }
      },
      {
        id:'supernatural-horror',
        icon:'👻',
        name:'Supernatural Horror',
        sub:'Paranormal, possession, folk and gothic horror',
        filter:function(id){
          return id === 'theme_paranormal'
            || id === 'theme_possession'
            || id === 'theme_folkhorror'
            || id === 'theme_gothichorror';
        }
      },
      {
        id:'creatures-monsters',
        icon:'🧟',
        name:'Creatures & Monsters',
        sub:'Zombies, vampires, werewolves and creature features',
        filter:function(id){
          return id === 'theme_zombie'
            || id === 'theme_vampire'
            || id === 'theme_werewolf'
            || id === 'theme_creaturefeature';
        }
      },
      {
        id:'dark-psychological',
        icon:'🧠',
        name:'Dark & Psychological',
        sub:'Body horror, cosmic horror and stranger nightmares',
        filter:function(id){
          return id === 'theme_psychological'
            || id === 'theme_bodyhorror'
            || id === 'theme_cosmichorror'
            || id === 'theme_lovecraftian'
            || id === 'theme_horrorcomedy';
        }
      },
      {
        id:'cinema-experiences',
        icon:'🎞️',
        name:'Cinema Experiences',
        sub:'Large-format and premium cinema experiences',
        filter:function(id){
          return id === 'imax_movies';
        }
      },
      {
        id:'curated-lists',
        icon:'✨',
        name:'Curated Lists',
        sub:'Perfect scores, parody and seasonal picks',
        filter:function(id){
          return id === 'mdb_3885'
            || id === 'mdb_4081'
            || id === 'mdb_136620';
        }
      }
    ],
    posters:['tt0816692','tt1375666','tt0468569','tt1160419'] },
  { id:'decades', icon:'📅', name:'By Decade', sub:'1950s through 2020s + current year',
    filter: function(id){
      var dMdb=['mdb_91300','mdb_91301','mdb_91302','mdb_91303','mdb_91304'];
      return id === 'best_movies_2026'||id.startsWith('decade_')||dMdb.includes(id);
    },
    posters:['tt0111161','tt0068646','tt0071562','tt0050083'] },
  { id:'collections', icon:'🗂', name:'Film Collections', sub:'179 franchises grouped by theme',
    filter: function(id){
      return (
        id.endsWith('_coll')
        || id.endsWith('_collection')
        || id === 'mcu_chronological'
      ) && !id.endsWith('_tv_collection');
    },
    children:[
      {
        id:'superheroes-comics',
        icon:'🦸',
        name:'Superheroes & Comics',
        sub:'Marvel, DC and comic-book franchises',
        filter:function(id){
          return [
            'mcu_chronological',
            'mcu_collection',
            'avengers_coll',
            'captainamerica_coll',
            'ironman_collection',
            'thor_collection',
            'gotg_collection',
            'doctorstrange_coll',
            'blackpanther_coll',
            'antman_collection',
            'deadpool_coll',
            'xmen_collection',
            'wonderwoman_coll',
            'aquaman_collection',
            'spiderman_collection',
            'superman_collection',
            'batman_collection',
            'darkknight_coll',
            'manofsteel_coll',
            'blade_coll'
          ].includes(id);
        }
      },
      {
        id:'scifi-fantasy',
        icon:'🚀',
        name:'Sci-Fi & Fantasy',
        sub:'Space, fantasy, dystopia and speculative worlds',
        filter:function(id){
          return [
            'alien_collection',
            'avatar_collection',
            'bladerunner_coll',
            'narnia_coll',
            'divergent_coll',
            'dune_collection',
            'fantasticbeasts_coll',
            'ghostbusters_coll',
            'godzilla_coll',
            'hp_collection',
            'hungergames_coll',
            'jurassic_coll',
            'kingkong_coll',
            'lotr_collection',
            'mazerunner_coll',
            'meninblack_coll',
            'pacificrim_coll',
            'percyjackson_coll',
            'planetapes_coll',
            'predator_coll',
            'startrek_coll',
            'starwars_collection',
            'terminator_coll',
            'hobbit_collection',
            'matrix_collection',
            'mummy_coll',
            'transformers_coll',
            'tron_coll',
            'twilight_coll',
            'underworld_coll',
            'backtofuture_coll',
            'starshiptroopers_coll'
          ].includes(id);
        }
      },
      {
        id:'horror-supernatural',
        icon:'👻',
        name:'Horror & Supernatural',
        sub:'Slashers, monsters, ghosts and survival horror',
        filter:function(id){
          return [
            'quietplace_coll',
            'childsplay_coll',
            'dontbreathe_coll',
            'evildead_coll',
            'finaldestination_coll',
            'friday13_coll',
            'halloween_coll',
            'hellraiser_coll',
            'insidious_coll',
            'nightmare_coll',
            'paranormal_coll',
            'poltergeist_coll',
            'saw_collection',
            'scream_collection',
            'conjuring_coll',
            'exorcist_coll',
            'grudge_coll',
            'omen_coll',
            'purge_coll',
            'ring_coll',
            'vhs_coll',
            'residentevil_coll',
            'escaperoom_coll',
            'tremors_coll',
            'jaws_coll',
            'it_coll'
          ].includes(id);
        }
      },
      {
        id:'action-adventure',
        icon:'💥',
        name:'Action & Adventure',
        sub:'Spies, soldiers, chases and blockbuster action',
        filter:function(id){
          return [
            'badboys_coll',
            'behindenemy_coll',
            'diehard_collection',
            'dirtyharry_coll',
            'fastfurious_coll',
            'indiana_collection',
            'bond_collection',
            'jarhead_coll',
            'johnwick_coll',
            'kingsman_coll',
            'lethalweapon_coll',
            'madmax_collection',
            'missinginaction_coll',
            'mi_collection',
            'nationaltreasure_coll',
            'pirates_collection',
            'rambo_collection',
            'robocop_coll',
            'sniper_coll',
            'taken_collection',
            'bourne_collection',
            'dirtydozen_coll',
            'equalizer_coll',
            'expendables_coll',
            'transporter_coll',
            'topgun_coll',
            'xxx_coll',
            'rushhour_coll'
          ].includes(id);
        }
      },
      {
        id:'comedy-romance',
        icon:'😂',
        name:'Comedy & Romance',
        sub:'Comedy, romance and crowd-pleasing franchises',
        filter:function(id){
          return [
            'aceventura_coll',
            'americanpie_coll',
            'anchorman_coll',
            'austinpowers_coll',
            'beverlyhills_coll',
            'bigmomma_coll',
            'bridgetjones_coll',
            'bringiton_coll',
            'clerks_coll',
            'daddyshome_coll',
            'fiftyshades_coll',
            'jumpstreet_coll',
            'legallyblonde_coll',
            'magicmike_coll',
            'meetparents_coll',
            'lampoon_coll',
            'pitchperfect_coll',
            'scarymovie_coll',
            'hangover_coll',
            'waynesworld_coll',
            'zoolander_coll',
            'stepup_coll'
          ].includes(id);
        }
      },
      {
        id:'family-animation',
        icon:'🧸',
        name:'Family & Animation',
        sub:'Animation, family adventures and all-ages favourites',
        filter:function(id){
          return [
            'alvin_coll',
            'cars_coll',
            'despicableme_coll',
            'wimpykid_coll',
            'findingnemo_coll',
            'homealone_coll',
            'hoteltransylvania_coll',
            'httyd_collection',
            'iceage_collection',
            'kungfupanda_coll',
            'madagascar_coll',
            'shrek2_collection',
            'monsters_coll',
            'paddington_coll',
            'scoobydoo_coll',
            'secretlifepets_coll',
            'shrek_collection',
            'sing_coll',
            'addamsfamily_coll',
            'bossbaby_coll',
            'incredibles_coll',
            'lego_coll',
            'toystory_coll',
            'trolls_coll',
            'wreckitralph_coll',
            'jumanji_coll',
            'nightmuseum_coll'
          ].includes(id);
        }
      },
      {
        id:'anime',
        icon:'🍥',
        name:'Anime',
        sub:'Anime film franchises and long-running universes',
        filter:function(id){
          return [
            'demonslayer_coll',
            'detectiveconan_coll',
            'dragonball_coll',
            'evangelion_coll',
            'myheroacademia_coll',
            'naruto_coll',
            'onepiece_coll',
            'pokemon_coll'
          ].includes(id);
        }
      },
      {
        id:'sports',
        icon:'🏆',
        name:'Sports',
        sub:'Boxing, baseball, football and martial arts franchises',
        filter:function(id){
          return [
            'creed_coll',
            'goal_coll',
            'majorleague_coll',
            'rocky_coll',
            'karatekid_coll',
            'mightyducks_coll'
          ].includes(id);
        }
      },
      {
        id:'crime-thriller',
        icon:'🔎',
        name:'Crime & Thriller',
        sub:'Crime sagas, mysteries and investigative franchises',
        filter:function(id){
          return [
            'boondocksaints_coll',
            'hannibal_coll',
            'knivesout_coll',
            'nowyouseeme_coll',
            'oceans_collection',
            'langdon_coll',
            'sherlock_coll',
            'sicario_coll',
            'godfather_collection',
            'enolaholmes_coll'
          ].includes(id);
        }
      }
    ],
    posters:['tt0816692','tt4633694','tt1745960','tt6710474'] },
  { id:'universes', icon:'🌌', name:'Universes', sub:'Connected worlds spanning multiple stories, series and films',
    filter:function(id){
      return [
        'breakingbad_tv_collection',
        'breakingbad_movie_collection',
        'stephenking_movie_collection',
        'stephenking_tv_collection',
        'got_tv_collection',
        'theboys_tv_collection',
        'yellowstone_tv_collection',
        'walkingdead_tv_collection',
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
      ].includes(id);
    },
    children:[
      {
        id:'breaking-bad-universe',
        icon:'🧪',
        name:'Breaking Bad Universe',
        sub:'Breaking Bad, Better Call Saul and El Camino',
        filter:function(id){
          return [
            'breakingbad_tv_collection',
            'breakingbad_movie_collection'
          ].includes(id);
        }
      },
      {
        id:'stephen-king-universe',
        icon:'🎈',
        name:'Stephen King Universe',
        sub:'Stories and adaptations from across the Stephen King world',
        filter:function(id){
          return [
            'stephenking_movie_collection',
            'stephenking_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'game-of-thrones-universe',
        icon:'🐉',
        name:'Game of Thrones Universe',
        sub:'Westeros and its connected stories',
        filter:function(id){
          return id === 'got_tv_collection';
        }
      },
      {
        id:'the-boys-universe',
        icon:'🦸',
        name:'The Boys Universe',
        sub:'The Boys and its connected series',
        filter:function(id){
          return id === 'theboys_tv_collection';
        }
      },
      {
        id:'yellowstone-universe',
        icon:'🏔️',
        name:'Yellowstone Universe',
        sub:'The Dutton family across generations',
        filter:function(id){
          return id === 'yellowstone_tv_collection';
        }
      },
      {
        id:'walking-dead-universe',
        icon:'🧟',
        name:'The Walking Dead Universe',
        sub:'The Walking Dead and its connected series',
        filter:function(id){
          return id === 'walkingdead_tv_collection';
        }
      },
      {
        id:'dexter-universe',
        icon:'🩸',
        name:'Dexter Universe',
        sub:'Dexter and its connected stories',
        filter:function(id){
          return id === 'dexter_tv_collection';
        }
      },
      {
        id:'power-universe',
        icon:'⚡',
        name:'Power Universe',
        sub:'Power and its connected series',
        filter:function(id){
          return id === 'power_tv_collection';
        }
      },
      {
        id:'star-trek-universe',
        icon:'🖖',
        name:'Star Trek Universe',
        sub:'Star Trek films and connected live-action and animated series',
        filter:function(id){
          return [
            'startrek_coll',
            'startrek_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'star-wars-universe',
        icon:'🌠',
        name:'Star Wars Universe',
        sub:'Star Wars films and connected live-action and animated series',
        filter:function(id){
          return [
            'starwars_movie_collection',
            'starwars_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'marvel-cinematic-universe',
        icon:'🦸',
        name:'Marvel Cinematic Universe',
        sub:'MCU films, specials and connected series',
        filter:function(id){
          return [
            'mcu_movie_collection',
            'mcu_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'alien-predator-universe',
        icon:'👽',
        name:'Alien / Predator Universe',
        sub:'Alien, Predator and AVP films plus connected series',
        filter:function(id){
          return [
            'alien_predator_movie_collection',
            'alien_predator_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'csi-universe',
        icon:'🔎',
        name:'CSI Universe',
        sub:'CSI and its connected crime lab series',
        filter:function(id){
          return id === 'csi_tv_collection';
        }
      },
      {
        id:'ncis-universe',
        icon:'⚓',
        name:'NCIS Universe',
        sub:'NCIS and its connected field office series',
        filter:function(id){
          return id === 'ncis_tv_collection';
        }
      },
      {
        id:'chicago-universe',
        icon:'🚒',
        name:'Chicago Universe',
        sub:'Chicago Fire, P.D., Med and Justice',
        filter:function(id){
          return id === 'chicago_tv_collection';
        }
      },
      {
        id:'law-order-universe',
        icon:'⚖️',
        name:'Law & Order Universe',
        sub:'Law & Order and its connected series',
        filter:function(id){
          return id === 'laworder_tv_collection';
        }
      },
      {
        id:'doctor-who-universe',
        icon:'🌀',
        name:'Doctor Who Universe',
        sub:'Doctor Who and its connected series',
        filter:function(id){
          return id === 'doctorwho_tv_collection';
        }
      },
      {
        id:'vampire-diaries-universe',
        icon:'🩸',
        name:'The Vampire Diaries Universe',
        sub:'The Vampire Diaries, The Originals and Legacies',
        filter:function(id){
          return id === 'vampirediaries_tv_collection';
        }
      },
      {
        id:'sons-mayans-universe',
        icon:'🏍️',
        name:'Sons of Anarchy / Mayans Universe',
        sub:'Sons of Anarchy and Mayans M.C.',
        filter:function(id){
          return id === 'soa_mayans_tv_collection';
        }
      },
      {
        id:'vikings-universe',
        icon:'🛡️',
        name:'Vikings Universe',
        sub:'Vikings and Vikings: Valhalla',
        filter:function(id){
          return id === 'vikings_tv_collection';
        }
      },
      {
        id:'karate-kid-cobra-kai-universe',
        icon:'🥋',
        name:'Karate Kid / Cobra Kai Universe',
        sub:'The Karate Kid films and Cobra Kai',
        filter:function(id){
          return [
            'karatekid_coll',
            'cobra_kai_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'stargate-universe',
        icon:'🌌',
        name:'Stargate Universe',
        sub:'Stargate films and connected series',
        filter:function(id){
          return [
            'stargate_movie_collection',
            'stargate_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'battlestar-galactica-universe',
        icon:'🚀',
        name:'Battlestar Galactica Universe',
        sub:'Battlestar Galactica films and connected series',
        filter:function(id){
          return [
            'battlestar_movie_collection',
            'battlestar_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'bosch-universe',
        icon:'🕵️',
        name:'Bosch Universe',
        sub:'Bosch and Bosch: Legacy',
        filter:function(id){
          return id === 'bosch_tv_collection';
        }
      },
      {
        id:'jack-ryan-universe',
        icon:'🛰️',
        name:'Jack Ryan Universe',
        sub:"Tom Clancy's Jack Ryan films and series",
        filter:function(id){
          return [
            'jackryan_movie_collection',
            'jackryan_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'reacher-universe',
        icon:'👊',
        name:'Reacher Universe',
        sub:'Reacher',
        filter:function(id){
          return id === 'reacher_tv_collection';
        }
      },
      {
        id:'rookie-universe',
        icon:'🚓',
        name:'The Rookie Universe',
        sub:'The Rookie and The Rookie: Feds',
        filter:function(id){
          return id === 'rookie_tv_collection';
        }
      },
      {
        id:'nine-one-one-universe',
        icon:'🚨',
        name:'9-1-1 Universe',
        sub:'9-1-1 and 9-1-1: Lone Star',
        filter:function(id){
          return id === 'nineoneone_tv_collection';
        }
      }
    ],
    posters:['tt0903747','tt3032476','tt0944947','tt1520211']
  },
  { id:'tvcollections', icon:'📺', name:'TV Collections', sub:'Standalone television collections and long-running worlds',
    filter: function(id){
      return id.endsWith('_tv_collection') && ![
        'breakingbad_tv_collection',
        'got_tv_collection',
        'theboys_tv_collection',
        'yellowstone_tv_collection',
        'walkingdead_tv_collection',
        'dexter_tv_collection',
        'power_tv_collection',
        'stephenking_tv_collection'
      ].includes(id);
    },
    children:[
      {
        id:'crime-antiheroes',
        icon:'🕵️',
        name:'Crime & Antiheroes',
        sub:'Breaking Bad, Dexter, Sopranos and Power',
        filter:function(id){
          return [
            'breakingbad_tv_collection',
            'dexter_tv_collection',
            'sopranos_tv_collection',
            'power_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'fantasy-superheroes',
        icon:'🐉',
        name:'Fantasy & Superheroes',
        sub:'Game of Thrones and The Boys',
        filter:function(id){
          return [
            'got_tv_collection',
            'theboys_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'epic-drama',
        icon:'🏔️',
        name:'Epic Drama',
        sub:'Outlander and Yellowstone',
        filter:function(id){
          return [
            'outlander_tv_collection',
            'yellowstone_tv_collection'
          ].includes(id);
        }
      },
      {
        id:'survival-apocalypse',
        icon:'🧟',
        name:'Survival & Apocalypse',
        sub:'The Walking Dead universe',
        filter:function(id){
          return id === 'walkingdead_tv_collection';
        }
      }
    ],
    posters:['tt0903747','tt0944947','tt3032476','tt2306299'] },
  { id:'industry', icon:'🎬', name:'Industry', sub:'Studios, networks and production brands',
    filter: function(id){
      return id.startsWith('studio_')
        || id === 'mubi_movies'
        || id === 'criterion_movies'
        || id.startsWith('network_')
        || id === 'starz_series'
        || id === 'mgm_series';
    },
    children:[
      {
        id:'studios',
        icon:'🎬',
        name:'Studios',
        sub:'Marvel, A24, Blumhouse, Disney and more',
        filter:function(id){
          return id.startsWith('studio_')
            || id === 'mubi_movies'
            || id === 'criterion_movies';
        }
      },
      {
        id:'networks',
        icon:'🖥',
        name:'Networks',
        sub:'HBO, AMC, BBC, FX, ABC and more',
        filter:function(id){
          return id.startsWith('network_')
            || id === 'starz_series'
            || id === 'mgm_series';
        }
      }
    ],
    posters:['tt0816692','tt0903747','tt4633694','tt0944947'] },
  { id:'people', icon:'🎥', name:'People', sub:'Directors and actor filmographies',
    filter: function(id){
      return id.startsWith('director_')
        || id.startsWith('actor_');
    },
    children:[
      {
        id:'directors',
        icon:'🎥',
        name:'Directors',
        sub:'Nolan, Kubrick, Tarantino and more',
        filter:function(id){
          return id.startsWith('director_');
        }
      },
      {
        id:'actors',
        icon:'⭐',
        name:'Actors',
        sub:'60+ curated actor filmographies',
        filter:function(id){
          return id.startsWith('actor_');
        }
      }
    ],
    posters:['tt0816692','tt1375666','tt0468569','tt1160419'] },
  { id:'sports', icon:'🏆', name:'Sports', sub:'Live sport, football, motorsport, wrestling, MMA and more',
    filter: function(id){
      if(
        id === 'sports_epl_fixtures' ||
        id === 'sports_nba_fixtures' ||
        id === 'sports_nbl_fixtures'
      ){
        return false;
      }

      return id.startsWith('nuvio_sports_')
        || id.startsWith('wwe_')
        || id.startsWith('wwf_')
        || id.startsWith('ecw_')
        || id.startsWith('sports_')
        || id.startsWith('f1_')
        || id.startsWith('motogp_')
        || id.startsWith('motorsport_');
    },
    children:[
      {
        id:'live-sports',
        icon:'🔴',
        name:'Live & Upcoming',
        sub:'Live events, upcoming fixtures and 24/7 sports channels',
        filter:function(id){
          return id === 'nuvio_sports_live'
            || id === 'nuvio_sports_upcoming'
            || id === 'nuvio_sports_networks';
        }
      },
      {
        id:'football',
        icon:'⚽',
        name:'Football',
        sub:'Soccer, American football and college sport',
        filter:function(id){
          return id === 'nuvio_sports_football'
            || id === 'nuvio_sports_american_football'
            || id === 'nuvio_sports_college';
        }
      },
      {
        id:'basketball',
        icon:'🏀',
        name:'Basketball',
        sub:'Basketball events and live coverage',
        filter:function(id){
          return id === 'nuvio_sports_basketball';
        }
      },
      {
        id:'wrestling',
        icon:'🤼',
        name:'Wrestling',
        sub:'WWE, AEW, NJPW, TNA, ROH and classic wrestling',
        filter:function(id){
          return id.startsWith('wwe_')
            || id.startsWith('wwf_')
            || id.startsWith('ecw_')
            || id.startsWith('sports_wrestling_')
            || id.startsWith('sports_wwe_')
            || id.startsWith('sports_aew_')
            || id.startsWith('sports_njpw_')
            || id.startsWith('sports_tna_')
            || id.startsWith('sports_roh_');
        },
        children:[
          {
            id:'general',
            icon:'🤼',
            name:'General Wrestling',
            sub:'Broad wrestling events and shows',
            filter:function(id){
              return id.startsWith('sports_wrestling_');
            }
          },
          {
            id:'wwe',
            icon:'🏆',
            name:'WWE / WWF',
            sub:'Events, shows and classic collections',
            filter:function(id){
              return id.startsWith('wwe_')
                || id.startsWith('wwf_')
                || id.startsWith('ecw_')
                || id.startsWith('sports_wwe_');
            }
          },
          {
            id:'aew',
            icon:'⭐',
            name:'AEW',
            sub:'All Elite Wrestling events and shows',
            filter:function(id){
              return id.startsWith('sports_aew_');
            }
          },
          {
            id:'other-promotions',
            icon:'🌐',
            name:'NJPW / TNA / ROH',
            sub:'Major wrestling promotions beyond WWE and AEW',
            filter:function(id){
              return id.startsWith('sports_njpw_')
                || id.startsWith('sports_tna_')
                || id.startsWith('sports_roh_');
            }
          }
        ]
      },
      {
        id:'motorsport',
        icon:'🏎️',
        name:'Motorsport',
        sub:'Formula 1, MotoGP, NASCAR, WEC and live motor racing',
        filter:function(id){
          return id === 'nuvio_sports_motorsport'
            || id.startsWith('f1_')
            || id.startsWith('motogp_')
            || id.startsWith('motorsport_')
            || id.startsWith('sports_motorsport')
            || id.startsWith('sports_formula1_')
            || id.startsWith('sports_f1_');
        }
      },
      {
        id:'boxing',
        icon:'🥊',
        name:'Boxing',
        sub:'Major fights and classic bouts',
        filter:function(id){
          return id.startsWith('boxing_');
        }
      },
      {
        id:'mma',
        icon:'🥋',
        name:'MMA',
        sub:'UFC, PRIDE and live combat sport',
        filter:function(id){
          return id === 'nuvio_sports_mma'
            || id.startsWith('ufc_')
            || id.startsWith('mma_')
            || id.startsWith('pride_')
            || id.startsWith('sports_ufc_');
        }
      },
      {
        id:'other-live-sports',
        icon:'🏅',
        name:'Other Sports',
        sub:'Baseball, cricket, hockey, golf, tennis, rugby, darts and more',
        filter:function(id){
          return id === 'nuvio_sports_cricket'
            || id === 'nuvio_sports_hockey'
            || id === 'nuvio_sports_baseball'
            || id === 'nuvio_sports_golf'
            || id === 'nuvio_sports_tennis'
            || id === 'nuvio_sports_rugby'
            || id === 'nuvio_sports_darts'
            || id === 'nuvio_sports_other';
        }
      }
    ],
    posters:['tt0439335','tt3058844','tt8671116','tt21386522'] },
  { id:'trakt', icon:'🔗', name:'Trakt & Simkl', sub:'Watchlist, favourites, collection',
    filter: function(id){ return id.startsWith('trakt_')||id.startsWith('simkl_'); },
    posters:['tt0111161','tt0068646','tt0071562','tt0468569'] },
  { id:'animelists', icon:'🍥', name:'Anime Lists', sub:'MyAnimeList and AniList watching, plan to watch, trending',
    filter: function(id){ return id.startsWith('mal_')||id.startsWith('anilist_'); },
    posters:['tt0245429','tt2560140','tt9335498','tt5311514'] },
  { id:'merged', icon:'🧬', name:'Merged Rows', sub:'All Streaming, Staff Picks, New This Week, Hidden Gems',
    filter: function(id){ return id.startsWith('merged_'); },
    posters:['tt15398776','tt5180504','tt0468569','tt1160419'] },
];

var S2_CATEGORY_FAMILIES = [
  {
    id:'start-here',
    icon:'🚀',
    name:'Start Here',
    sub:'Quick picks, fresh releases and your cloud library',
    categories:['quickpicks','fresh-discovery','cloud-library']
  },
  {
    id:'streaming-family',
    icon:'📡',
    name:'Streaming',
    sub:'Netflix, Prime Video, Disney+, UK TV and specialist services',
    categories:['streaming']
  },
  {
    id:'browse-type',
    icon:'🧭',
    name:'Browse by Type',
    sub:'Genres, decades and themed or curated rows',
    categories:['genres','decades','themed']
  },
  {
    id:'world-specialist',
    icon:'🌍',
    name:'World Cinema & Specialist',
    sub:'Anime, documentaries, kids, Bollywood and international cinema',
    categories:['anime-discovery','documentary-discovery','kids-family-discovery','bollywood-discovery','international']
  },
  {
    id:'franchises-worlds',
    icon:'🌌',
    name:'Franchises & Worlds',
    sub:'Film collections, connected universes and TV collections',
    categories:['collections','universes','tvcollections']
  },
  {
    id:'studios-people',
    icon:'🎬',
    name:'Studios & People',
    sub:'Studios, networks, directors and actors',
    categories:['industry','people']
  },
  {
    id:'sports-family',
    icon:'🏆',
    name:'Sports',
    sub:'Live sport, football, motorsport, wrestling, MMA and more',
    categories:['sports']
  },
  {
    id:'accounts-custom',
    icon:'🔗',
    name:'Your Accounts & Custom',
    sub:'Trakt, Simkl, anime lists and merged rows',
    categories:['trakt','animelists','merged']
  }
];

function s2CategoryFamilyForId(categoryId){
  return S2_CATEGORY_FAMILIES.find(function(family){
    return family.categories.includes(categoryId);
  }) || null;
}


var S2_ORDER = {
  quickpicks: [
    'ai_recommended_movies',
    'ai_recommended_series',

    'rightnow_movies',
    'rightnow_series',

    'trending_movies',
    'trending_series',

    'popular_movies',
    'popular_series',

    'top_movies',
    'top_series',

    'now_playing_movies',
    'airing_series',
    'ontheair_series',

    'trakt_trending_movies',
    'trakt_trending_series',

    'mdb_2236',
    'mdb_1198',
    'mdb_69',
    'mdb_87667',
    'mdb_88434',
    'mdb_960',
    'mdb_86934',
    'mdb_2202',
    'mdb_1176',
    'mdb_86710'
  ],

  streaming: [
    'netflix_movies',
    'netflix_series',
    'amazon_movies',
    'amazon_series',
    'disney_movies',
    'disney_series',
    'tubi_movies',
    'tubi_series',
    'pluto_movies',
    'pluto_series',
    'hbo_movies',
    'hbo_series',
    'apple_movies',
    'apple_series',
    'paramount_movies',
    'paramount_series',
    'peacock_movies',
    'peacock_series',
    'hulu_movies',
    'hulu_series',
    'mgm_movies',
    'mgm_series',
    'starz_movies',
    'starz_series',
    'shudder_movies',
    'shudder_series',
    'britbox_movies',
    'britbox_series',
    'acorn_movies',
    'acorn_series',
    'itvx_movies',
    'itvx_series',
    'channel4_movies',
    'channel4_series',
    'crunchyroll_movies',
    'crunchyroll_series',
    'hidive_movies',
    'hidive_series',
    'mubi_movies',
    'discovery_series',
    'natgeo_series',
    'ae_series',
    'animalplanet_series'
  ],

  genres: [
    'action_movies',
    'action_series',
    'adventure_movies',
    'adventure_series',
    'animation_movies',
    'animation_series',
    'comedy_movies',
    'comedy_series',
    'crime_movies',
    'crime_series',
    'documentary_movies',
    'documentary_series',
    'drama_movies',
    'drama_series',
    'family_movies',
    'family_series',
    'fantasy_movies',
    'fantasy_series',
    'history_movies',
    'history_series',
    'horror_movies',
    'horror_series',
    'mystery_movies',
    'mystery_series',
    'reality_movies',
    'reality_series',
    'romance_movies',
    'romance_series',
    'romcom_movies',
    'romcom_series',
    'scifi_movies',
    'scifi_series',
    'thriller_movies',
    'thriller_series',
    'war_movies',
    'war_series',
    'western_movies',
    'western_series',
    'anime_movies',
    'anime_series',
    'bollywood_movies',
    'bollywood_series'
  ],

  sports: [
    'nuvio_sports_live',
    'nuvio_sports_upcoming',
    'nuvio_sports_networks',

    'nuvio_sports_football',
    'nuvio_sports_american_football',
    'nuvio_sports_college',

    'nuvio_sports_basketball',

    'nuvio_sports_motorsport',

    'nuvio_sports_mma',

    'nuvio_sports_cricket',
    'nuvio_sports_hockey',
    'nuvio_sports_baseball',
    'nuvio_sports_golf',
    'nuvio_sports_tennis',
    'nuvio_sports_rugby',
    'nuvio_sports_darts',
    'nuvio_sports_other',

    'sports_wwe_events',
    'sports_wwe_shows',
    'sports_aew_events',
    'sports_aew_shows',
    'sports_njpw_events',
    'sports_tna_events',
    'sports_tna_shows',
    'sports_roh_events',
    'sports_roh_shows',
    'sports_ufc_events',
    'sports_ufc_shows',
    'sports_formula1_shows',
    'sports_f1_fixtures',
    'f1_2025',
    'f1_events',
    'motogp_events',
    'motorsport_wec',
    'motorsport_nascar',
    'wwe_wrestlemania',
    'wwe_royal_rumble',
    'wwe_summerslam',
    'wwe_survivor_series',
    'wwe_money_in_the_bank',
    'wwe_elimination_chamber',
    'wwe_backlash',
    'wwf_wwe_king_of_the_ring',
    'wwf_wwe_no_mercy',
    'wwf_classics',
  ],

  trakt: [
    'trakt_watchlist_movies',
    'trakt_watchlist_series',
    'trakt_favorites_movies',
    'trakt_favorites_series',
    'trakt_collection_movies',
    'trakt_collection_series',
    'trakt_history_movies',
    'trakt_history_series',
    'trakt_recommendations_movies',
    'trakt_recommendations_series',
    'simkl_watchlist_movies',
    'simkl_watchlist_series',
    'simkl_favorites_movies',
    'simkl_favorites_series'
  ]
};

function s2NormaliseLabel(value){
  return String(value || '')
    .replace(/^[^\w]+/, '')
    .replace(/\s*[🎬📺]\s*$/, '')
    .replace(/\s+(Movies|Series|TV Series)$/i, '')
    .trim()
    .toLowerCase();
}

function s2MediaRank(def){
  if(!def) return 2;
  if(def.type === 'movie') return 0;
  if(def.type === 'series') return 1;
  return 2;
}

function getStep2CatalogDefinition(id){
  if(S2_DEFS[id]){
    return Object.assign({}, S2_DEFS[id], {
      userCreated:false,
      mergedCatalogId:S2_DEFS[id].handler === 'merged' ? id : null
    });
  }
  if(S2_UNIVERSE_FALLBACK_DEFS[id]){
    return Object.assign({}, S2_UNIVERSE_FALLBACK_DEFS[id], {
      id:id,
      userCreated:false,
      mergedCatalogId:null
    });
  }
  var merged = (mergedCatalogs || []).find(function(def){
    return mergedDerivedIds(def).includes(id);
  });
  if(!merged) return null;
  var type = id.endsWith('_movies') ? 'movie'
    : id.endsWith('_series') ? 'series'
    : merged.type;
  return {
    id:id,
    name:merged.name,
    type:type,
    handler:'merged',
    userCreated:merged.userCreated === true,
    mergedCatalogId:merged.id
  };
}

function getStep2CategoryIds(cat){
  var ids = Object.keys(S2_DEFS).filter(cat.filter);
  if(cat.id === 'universes'){
    Object.keys(S2_UNIVERSE_FALLBACK_DEFS).forEach(function(id){
      if(cat.filter(id) && !ids.includes(id)) ids.push(id);
    });
  }
  if(cat.id === 'merged'){
    (mergedCatalogs || []).forEach(function(def){
      mergedDerivedIds(def).forEach(function(id){
        if(!ids.includes(id)) ids.push(id);
      });
    });
  }
  if(cat.id === 'merged'){
    ids = ids.filter(function(id){ return !isRemovedMergedCatalogId(id); });
  }
  return getEffectiveDiscoveryIds(ids);
}

function s2SortIds(categoryId, ids){
  var preferred = S2_ORDER[categoryId] || [];
  var rank = Object.create(null);

  preferred.forEach(function(id, index){
    rank[id] = index;
  });

  return ids.slice().sort(function(a, b){
    var aPreferred = Object.prototype.hasOwnProperty.call(rank, a);
    var bPreferred = Object.prototype.hasOwnProperty.call(rank, b);

    if(aPreferred || bPreferred){
      if(aPreferred && bPreferred) return rank[a] - rank[b];
      return aPreferred ? -1 : 1;
    }

    if(categoryId === 'decades'){
      var aDecade = Number((String(a).match(/\d{4}/) || [0])[0]);
      var bDecade = Number((String(b).match(/\d{4}/) || [0])[0]);

      if(aDecade !== bDecade) return bDecade - aDecade;
    }

    var aDef = getStep2CatalogDefinition(a) || {};
    var bDef = getStep2CatalogDefinition(b) || {};

    var aLabel = s2NormaliseLabel(aDef.name || a);
    var bLabel = s2NormaliseLabel(bDef.name || b);

    if(aLabel !== bLabel){
      return aLabel.localeCompare(bLabel, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    }

    var mediaDifference = s2MediaRank(aDef) - s2MediaRank(bDef);
    if(mediaDifference !== 0) return mediaDifference;

    return String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  });
}

// Step 2 preset definitions live in /setup-modules/step2-presets.js

// Step 2 row-edit state must exist before any catalog button can be used.
window.catalogOverrides = (window.catalogOverrides && typeof window.catalogOverrides === 'object')
  ? window.catalogOverrides
  : {};
var catalogOverrideActiveId = null;

// Event delegation for s2 dynamic elements
function s2OpenCatalogEdit(e, editBtn){
  if(e){
    e.preventDefault();
    e.stopPropagation();
    if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }
  if(!editBtn) return false;
  var editTarget = editBtn.getAttribute('data-catalog-edit-action') || '';
  var editKind = editBtn.getAttribute('data-catalog-edit-kind') || 'override';
  if(!editTarget) return false;
  try {
    if(editKind === 'merged') openMergedCatalogEditor(editTarget);
    else openCatalogOverrideModal(editTarget);
  } catch(error) {
    console.error('[Catalog Edit] Failed to open row settings', error);
    try {
      if(typeof showBanner === 'function') {
        showBanner('Could not open Row Settings. Please reload Ultra MAX and try again.', 'error');
      }
    } catch(ignore) {}
  }
  return false;
}

function s2HandleDelegatedClick(e){
  var editBtn = e.target.closest('[data-catalog-edit-action]');
  if(editBtn){
    s2OpenCatalogEdit(e, editBtn);
    return;
  }
  var pill = e.target.closest('[data-pid]');
  if(pill){
    s2TogglePill(pill.dataset.pid);
    return;
  }
  var catHead = e.target.closest('[data-cid]');
  if(catHead){ s2ToggleCat(catHead.dataset.cid); return; }
  var selBtn = e.target.closest('[data-selcat]');
  if(selBtn){ s2SelectCat(selBtn.dataset.selcat, e); return; }
  var clrBtn = e.target.closest('[data-clrcat]');
  if(clrBtn){ s2ClearCat(clrBtn.dataset.clrcat, e); return; }
}
document.addEventListener('click', s2HandleDelegatedClick);
document.addEventListener('keydown', function(e){
  if((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches('.s2-pill[data-pid]')){
    e.preventDefault();
    s2TogglePill(e.target.dataset.pid);
  }
});

async function s2Init(){
  try {
    var res = await fetch('/catalog-defs.json', { cache:'no-store' });
    if(!res.ok) throw new Error('catalog-defs HTTP ' + res.status);

    var defs = await res.json();

    /*
     * Refresh the authoritative catalog definitions whenever Step 2 opens.
     * The previous implementation only fetched when S2_DEFS was empty,
     * which left already-open setup sessions with stale definitions after
     * new catalogs were deployed.
     */
    Object.assign(S2_DEFS, defs);

    console.log(
      'S2: loaded',
      Object.keys(S2_DEFS).length,
      'catalogs'
    );
  } catch(e) {
    console.warn('s2Init: could not refresh catalog defs', e);

    /*
     * Existing definitions are still usable if a refresh fails.
     * Only abort when we have no definitions at all.
     */
    if(Object.keys(S2_DEFS).length === 0) return;
  }
  // Wait for DOM to be ready
  await new Promise(function(r){ setTimeout(r, 50); });
  var grid = document.getElementById('s2PresetsGrid');
  var catgrid = document.getElementById('s2CatsGrid');
  if(!grid || !catgrid){ console.warn('s2Init: DOM not ready'); return; }
  s2RenderPresets();
  s2RenderCats();
  s2RenderRaw();
  s2ApplyLocalCopy(document.getElementById('step-2'));
  s2UpdateAll();
  console.log('S2: init complete');
}

// Step 2 preset artwork, rendering, and apply logic live in /setup-modules/step2-presets.js

function mergedRowMediaLabel(type){
  return s2LocalText(type === 'movie' ? 'movie' : type === 'series' ? 'series' : 'mixed');
}

function mergedRowActionIcon(kind){
  if(kind === 'edit'){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  }
  if(kind === 'delete'){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>';
  }
  if(kind === 'visibility-hidden'){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-2.1 3M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a10.7 10.7 0 004.1-.8"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function renderCatalogCompactItem(pill, id, def, categoryId){
  var isMergedRow = categoryId === 'merged';
  var userCreated = def.userCreated === true;
  var merged = userCreated
    ? (mergedCatalogs || []).find(function(item){ return item.id === def.mergedCatalogId; }) || null
    : null;
  var isHidden = hidden.has(id);
  var typeIcon = def.type === 'movie' ? '🎬' : def.type === 'series' ? '📺' : '◈';
  var editTarget = merged ? merged.id : id;
  var editKind = merged ? 'merged' : 'override';
  var editId = merged ? '' : ' id="s2ov-btn-'+id+'"';
  var deleteButton = isMergedRow
    ? '<button type="button" class="catalog-compact-action catalog-compact-delete" aria-label="'+escapeHtml(s2LocalText('deleteMergedRow')+' '+def.name)+'" title="'+escapeHtml(s2LocalText('delete'))+'" onclick="event.stopPropagation();requestRemoveMergedCatalog(\''+id+'\',this)">'
      + mergedRowActionIcon('delete') + '</button>'
    : '';

  pill.classList.add('catalog-compact-item');
  pill.innerHTML =
    '<div class="catalog-compact-main">'
      + '<div class="catalog-compact-identity">'
        + '<span class="catalog-compact-check" aria-hidden="true">✓</span>'
        + '<span class="catalog-compact-icon" aria-hidden="true">'+typeIcon+'</span>'
        + '<span class="catalog-compact-copy">'
          + '<span class="catalog-compact-title">'+escapeHtml(def.name)+'</span>'
          + '<span class="catalog-compact-meta">'
            + '<span>'+escapeHtml(mergedRowMediaLabel(def.type))+'</span>'
            + '<span class="catalog-compact-visibility-state">'+escapeHtml(s2LocalText(isHidden ? 'hidden' : 'visible'))+'</span>'
          + '</span>'
        + '</span>'
      + '</div>'
      + '<div class="catalog-compact-actions'+(isMergedRow ? ' merged-row-actions' : '')+'">'
        + '<button type="button" class="catalog-compact-action catalog-compact-settings'+((window.catalogOverrides && window.catalogOverrides[id])?' s2-pill-settings-active':'')+'"'+editId+' data-catalog-edit-action="'+escapeHtml(editTarget)+'" data-catalog-edit-kind="'+editKind+'" aria-label="'+escapeHtml(s2LocalText('edit')+' '+def.name)+'"'+(isMergedRow?' title="'+escapeHtml(s2LocalText('edit'))+'"':'')+'>'
          + mergedRowActionIcon('edit') + (isMergedRow?'':'<span>'+escapeHtml(s2LocalText('edit'))+'</span>')+'</button>'
        + '<button type="button" class="catalog-compact-action catalog-compact-visibility" data-catalog-visibility-action="'+id+'" aria-label="'+escapeHtml(s2LocalText(isHidden ? 'show' : 'hide')+' '+def.name)+'"'+(isMergedRow?' title="'+escapeHtml(s2LocalText(isHidden ? 'show' : 'hide'))+'"':'')+'>'
          + mergedRowActionIcon(isHidden ? 'visibility' : 'visibility-hidden') + (isMergedRow?'':'<span>'+escapeHtml(s2LocalText(isHidden ? 'show' : 'hide'))+'</span>')+'</button>'
        + deleteButton
      + '</div>'
      + '<input class="catalog-compact-hidden-input" type="checkbox" data-hid="'+id+'" onchange="s2ToggleHidden(this)" '+(isHidden?'checked':'')+' tabindex="-1" aria-hidden="true">'
    + '</div>';

  // Bind the row editor directly to the rendered button. This avoids relying
  // on inline handlers or document-level bubbling in Android WebView/app mode.
  var editButtonEl = pill.querySelector('[data-catalog-edit-action]');
  if(editButtonEl){
    editButtonEl.addEventListener('click', function(event){
      s2OpenCatalogEdit(event, editButtonEl);
    });
  }

  // Android/WebView can be unreliable with document-level delegated taps.
  // Bind the visibility control and the catalog row itself directly so a
  // selected row can always be toggled off without falling back to Clear All.
  var visibilityButtonEl = pill.querySelector('[data-catalog-visibility-action]');
  if(visibilityButtonEl){
    visibilityButtonEl.addEventListener('click', function(event){
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      s2ToggleCompactCatalogVisibility(id);
    });
  }

  pill.addEventListener('click', function(event){
    var target = event && event.target;
    var actionTarget = target && typeof target.closest === 'function'
      ? target.closest('.catalog-compact-actions, [data-hid]')
      : null;
    if(actionTarget) return;
    if(event){
      event.preventDefault();
      event.stopPropagation();
    }
    s2TogglePill(id);
  });
}

function s2RenderCats(){
  var grid = document.getElementById('s2CatsGrid');
  if(!grid) return;
  grid.innerHTML = '';

  var familyBodies = Object.create(null);
  var categoryFamilyIds = Object.create(null);

  S2_CATEGORY_FAMILIES.forEach(function(family){
    var familyCategories = family.categories
      .map(function(categoryId){
        return S2_CATEGORIES.find(function(cat){ return cat.id === categoryId; });
      })
      .filter(Boolean);

    if(!familyCategories.length) return;

    var familyRows = new Set();
    familyCategories.forEach(function(cat){
      categoryFamilyIds[cat.id] = family.id;
      getStep2CategoryIds(cat).forEach(function(id){ familyRows.add(id); });
    });

    var familyEl = document.createElement('details');
    familyEl.className = 's2-family';
    familyEl.id = 's2family-' + family.id;
    familyEl.setAttribute('data-family-id', family.id);

    var familySummary = document.createElement('summary');
    familySummary.className = 's2-family-summary';
    familySummary.innerHTML =
      '<span class="s2-family-icon">' + s2EscapeHtml(family.icon) + '</span>' +
      '<span class="s2-family-copy">' +
        '<span class="s2-family-name">' + s2EscapeHtml(family.name) + '</span>' +
        '<span class="s2-family-sub">' + s2EscapeHtml(family.sub) + '</span>' +
      '</span>' +
      '<span class="s2-family-meta">' +
        '<span class="s2-family-count">' + familyRows.size + ' rows</span>' +
        '<span class="s2-family-chev">▼</span>' +
      '</span>';

    var familyBody = document.createElement('div');
    familyBody.className = 's2-family-body';

    familyEl.appendChild(familySummary);
    familyEl.appendChild(familyBody);
    grid.appendChild(familyEl);
    familyBodies[family.id] = familyBody;
  });

  S2_CATEGORIES.forEach(function(cat){
    var ids = s2SortIds(cat.id, getStep2CategoryIds(cat));
    var div = document.createElement('div');
    div.className = 's2-cat';
    div.id = 's2cat-' + cat.id;

    // Progress bar
    var prog = document.createElement('div');
    prog.className = 's2-cat-prog';
    var progBar = document.createElement('div');
    progBar.className = 's2-cat-prog-bar';
    progBar.id = 's2prog-' + cat.id;
    progBar.style.width = '0%';
    prog.appendChild(progBar);
    div.appendChild(prog);

    // Header
    var head = document.createElement('div');
    head.className = 's2-cat-head';
    head.setAttribute('data-cid', cat.id);
    head.innerHTML = '<div class="s2-cat-icon">'+cat.icon+'</div>'
      +'<div class="s2-cat-info"><div class="s2-cat-name">'+cat.name+'</div><div class="s2-cat-sub">'+cat.sub+'</div></div>'
      +'<div class="s2-cat-badge"><span class="s2-cat-sel" id="s2catsel-'+cat.id+'">0</span><span class="s2-cat-tot">/ '+ids.length+'</span><span class="s2-cat-chev">▼</span></div>';
    div.appendChild(head);

    // Pills container
    var pillsDiv = document.createElement('div');
    pillsDiv.className = 's2-cat-pills catalog-compact-list';
    pillsDiv.id = 's2pills-' + cat.id;

    function appendCatalogPill(target, id){
      var def = getStep2CatalogDefinition(id);
      if(!def) return;

      var pill = document.createElement('span');
      pill.className = 's2-pill';
      pill.id = 's2pill-' + id;
      pill.setAttribute('data-pid', id);
      pill.setAttribute('role', 'button');
      pill.setAttribute('tabindex', '0');
      pill.setAttribute('aria-pressed', 'false');

      renderCatalogCompactItem(pill, id, def, cat.id);
      target.appendChild(pill);
    }

    if(Array.isArray(cat.children) && cat.children.length){
      var assignedIds = new Set();

      cat.children.forEach(function(child){
        var childIds = ids.filter(function(id){
          try{
            return child.filter(id);
          }catch(e){
            return false;
          }
        });

        /* Empty future sports sections remain hidden. */
        if(!childIds.length) return;

        childIds.forEach(function(id){
          assignedIds.add(id);
        });

        var childWrap = document.createElement('div');
        childWrap.className = 's2-child-category';
        childWrap.id = 's2child-' + cat.id + '-' + child.id;

        var childHead = document.createElement('button');
        childHead.type = 'button';
        childHead.className = 's2-child-head';

        childHead.addEventListener('click', function(event){
          s2ToggleChildCategory(cat.id, child.id, event);
        });

        var childSelected = childIds.filter(function(id){
          return selected.has(id);
        }).length;

        childHead.innerHTML =
          '<span class="s2-child-icon">'+(child.icon || '')+'</span>'
          +'<span class="s2-child-info">'
            +'<span class="s2-child-name">'
              +s2EscapeHtml(child.name || child.id)
            +'</span>'
            +'<span class="s2-child-sub">'
              +s2EscapeHtml(child.sub || '')
            +'</span>'
          +'</span>'
          +'<span class="s2-child-count">'
            +'<span class="s2-child-selected">'
              +childSelected
            +'</span> / '+childIds.length
          +'</span>'
          +'<span class="s2-child-chev">▼</span>';

        childWrap.appendChild(childHead);

        var childBody = document.createElement('div');
        childBody.className = 's2-child-body';

        if(Array.isArray(child.children) && child.children.length){
          var nestedAssignedIds = new Set();

          child.children.forEach(function(grandchild){
            var grandchildIds = childIds.filter(function(id){
              try{
                return grandchild.filter(id);
              }catch(e){
                return false;
              }
            });

            if(!grandchildIds.length) return;

            grandchildIds.forEach(function(id){
              nestedAssignedIds.add(id);
            });

            var nestedWrap = document.createElement('div');
            nestedWrap.className = 's2-child-category s2-nested-category';
            nestedWrap.id =
              's2child-' +
              cat.id +
              '-' +
              child.id +
              '-' +
              grandchild.id;

            var nestedHead = document.createElement('button');
            nestedHead.type = 'button';
            nestedHead.className = 's2-child-head s2-nested-head';

            nestedHead.addEventListener('click', function(event){
              event.preventDefault();
              event.stopPropagation();
              nestedWrap.classList.toggle('s2-child-open');
            });

            var nestedSelected =
              grandchildIds.filter(function(id){
                return selected.has(id);
              }).length;

            nestedHead.innerHTML =
              '<span class="s2-child-icon">' +
                (grandchild.icon || '') +
              '</span>' +
              '<span class="s2-child-info">' +
                '<span class="s2-child-name">' +
                  s2EscapeHtml(
                    grandchild.name ||
                    grandchild.id
                  ) +
                '</span>' +
                '<span class="s2-child-sub">' +
                  s2EscapeHtml(
                    grandchild.sub ||
                    ''
                  ) +
                '</span>' +
              '</span>' +
              '<span class="s2-child-count">' +
                '<span class="s2-child-selected">' +
                  nestedSelected +
                '</span> / ' +
                grandchildIds.length +
              '</span>' +
              '<span class="s2-child-chev">▼</span>';

            nestedWrap.appendChild(
              nestedHead
            );

            var nestedBody =
              document.createElement('div');

            nestedBody.className =
              's2-child-body s2-nested-body';

            grandchildIds.forEach(function(id){
              appendCatalogPill(
                nestedBody,
                id
              );
            });

            nestedWrap.appendChild(
              nestedBody
            );

            childBody.appendChild(
              nestedWrap
            );
          });

          var nestedUnassignedIds =
            childIds.filter(function(id){
              return !nestedAssignedIds.has(id);
            });

          nestedUnassignedIds.forEach(function(id){
            appendCatalogPill(
              childBody,
              id
            );
          });
        }else{
          childIds.forEach(function(id){
            appendCatalogPill(
              childBody,
              id
            );
          });
        }

        childWrap.appendChild(childBody);
        pillsDiv.appendChild(childWrap);
      });

      var unassignedIds = ids.filter(function(id){
        return !assignedIds.has(id);
      });

      /*
       * Defensive fallback. If we ever add a Sports catalog but forget
       * to classify it, it remains visible rather than disappearing.
       */
      if(unassignedIds.length){
        var otherWrap = document.createElement('div');
        otherWrap.className =
          's2-child-category s2-child-open';
        otherWrap.id =
          's2child-' + cat.id + '-other';

        var otherHead = document.createElement('button');
        otherHead.type = 'button';
        otherHead.className = 's2-child-head';

        otherHead.addEventListener('click', function(event){
          s2ToggleChildCategory(cat.id, 'other', event);
        });

        otherHead.innerHTML =
          '<span class="s2-child-icon">📦</span>'
          +'<span class="s2-child-info">'
            +'<span class="s2-child-name">Other</span>'
            +'<span class="s2-child-sub">Uncategorised rows</span>'
          +'</span>'
          +'<span class="s2-child-count">'
            +unassignedIds.length
          +'</span>'
          +'<span class="s2-child-chev">▼</span>';

        otherWrap.appendChild(otherHead);

        var otherBody = document.createElement('div');
        otherBody.className = 's2-child-body';

        unassignedIds.forEach(function(id){
          appendCatalogPill(otherBody, id);
        });

        otherWrap.appendChild(otherBody);
        pillsDiv.appendChild(otherWrap);
      }

    }else{
      ids.forEach(function(id){
        appendCatalogPill(pillsDiv, id);
      });
    }

    // Actions
    var actions = document.createElement('div');
    actions.className = 's2-cat-actions';
    var selBtn = document.createElement('button');
    selBtn.className = 's2-cat-btn';
    selBtn.textContent = umT('setup.misc.selectAll', 'Select all');
    selBtn.setAttribute('data-selcat', cat.id);
    var clrBtn = document.createElement('button');
    clrBtn.className = 's2-cat-btn danger';
    clrBtn.textContent = umT('setup.misc.clear', 'Clear');
    clrBtn.setAttribute('data-clrcat', cat.id);
    actions.appendChild(selBtn);
    actions.appendChild(clrBtn);
    if(cat.id === 'merged' && removedMergedCatalogIds.size){
      var restoreBtn = document.createElement('button');
      restoreBtn.className = 's2-cat-btn';
      restoreBtn.textContent = s2LocalText('restoreRemovedRows');
      restoreBtn.setAttribute('type', 'button');
      restoreBtn.addEventListener('click', function(event){
        event.stopPropagation();
        requestRestoreRemovedMergedRows(restoreBtn);
      });
      actions.appendChild(restoreBtn);
    }
    pillsDiv.appendChild(actions);
    div.appendChild(pillsDiv);

    var familyId = categoryFamilyIds[cat.id];
    var familyBody = familyId ? familyBodies[familyId] : null;
    (familyBody || grid).appendChild(div);
  });
}


// Step 2 selection, visibility, order, and all-hidden warning state live in /setup-modules/step2-selection-state.js

// Merged catalog state, editor, visibility, and removal lifecycle live in /setup-modules/merged-catalogs.js

// Step 2 reorder, bulk actions, and selection UI refresh live in /setup-modules/step2-selection-state.js

// Step 2 live/row/modal preview controller lives in /setup-modules/step2-preview.js

function s2RestoreFromSelected(){
  s2UpdateAll();
}

