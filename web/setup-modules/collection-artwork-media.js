const IMAGE_BASE = 'https://ultramax.vip/images/';
const IMAGE_MAP = {
  'Studios':          { cover: IMAGE_BASE + 'studios.png' },
  'Actors':           { cover: IMAGE_BASE + 'actors.png' },
  'Directors':        { cover: IMAGE_BASE + 'directors.jpg' },
  'Film Collections': { cover: IMAGE_BASE + 'scott-defaults/film-collections.png' },
};


const FOLDER_IMAGE_OVERRIDES = {
  /* Scott mop-up: decades / history / war / releases */
  best_movies_2026: { cover: IMAGE_BASE + 'this-year.png', shape: 'LANDSCAPE' },
  decade_1970s: { cover: IMAGE_BASE + '1970.png', shape: 'LANDSCAPE' },
  decade_1960s: { cover: IMAGE_BASE + '1960.png', shape: 'LANDSCAPE' },
  decade_1950s: { cover: IMAGE_BASE + '1950.png', shape: 'LANDSCAPE' },
  history_movies: { cover: IMAGE_BASE + 'scott-defaults/history.png', shape: 'LANDSCAPE' },
  history_series: { cover: IMAGE_BASE + 'scott-defaults/history.png', shape: 'LANDSCAPE' },
  war_movies: { cover: IMAGE_BASE + 'scott-defaults/war.png', shape: 'LANDSCAPE' },
  war_series: { cover: IMAGE_BASE + 'scott-defaults/war.png', shape: 'LANDSCAPE' },
  standup_movies: { cover: IMAGE_BASE + 'scott-genres/genre-stand-up-comedy.png', shape: 'LANDSCAPE' },
  new_movies: { cover: IMAGE_BASE + 'scott-genres/genre-new-releases.png', shape: 'LANDSCAPE' },
  mdb_84401: { cover: IMAGE_BASE + 'scott-defaults/reality-tv.png', shape: 'LANDSCAPE' },


  /* Scott AI / Trakt / Simkl / network canonical artwork */
  ai_recommended_movies: { cover: IMAGE_BASE + 'scott-defaults/ai-recommended-movies.png', shape: 'LANDSCAPE' },
  ai_recommended_series: { cover: IMAGE_BASE + 'scott-defaults/ai-recommended-series.png', shape: 'LANDSCAPE' },
  ai_anime_anilist: { cover: IMAGE_BASE + 'scott-defaults/ai-anime.png', shape: 'LANDSCAPE' },
  rightnow_movies: { cover: IMAGE_BASE + 'scott-defaults/right-now-movies.png', shape: 'LANDSCAPE' },
  rightnow_series: { cover: IMAGE_BASE + 'scott-defaults/right-now-series.png', shape: 'LANDSCAPE' },
  trakt_trending_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },
  trakt_trending_series: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },
  trakt_popular_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt-popular.png', shape: 'LANDSCAPE' },
  trakt_popular_series: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },
  trakt_anticipated_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt-anticipated.png', shape: 'LANDSCAPE' },
  trakt_anticipated_series: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },
  trakt_favorites_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },
  trakt_favorites_series: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },
  trakt_fav_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt-favourites.png', shape: 'LANDSCAPE' },
  trakt_fav_series: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },
  trakt_watchlist_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt-watchlist.png', shape: 'LANDSCAPE' },
  trakt_watchlist_series: { cover: IMAGE_BASE + 'scott-defaults/trakt-watchlist.png', shape: 'LANDSCAPE' },
  trakt_collection_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt-collection.png', shape: 'LANDSCAPE' },
  trakt_collection_series: { cover: IMAGE_BASE + 'scott-defaults/trakt-collection.png', shape: 'LANDSCAPE' },
  simkl_watchlist_movies: { cover: IMAGE_BASE + 'scott-defaults/simkl-watchlist.png', shape: 'LANDSCAPE' },
  simkl_watchlist_series: { cover: IMAGE_BASE + 'scott-defaults/simkl-watchlist.png', shape: 'LANDSCAPE' },
  simkl_favorites_movies: { cover: IMAGE_BASE + 'scott-defaults/simkl.png', shape: 'LANDSCAPE' },
  simkl_favorites_series: { cover: IMAGE_BASE + 'scott-defaults/simkl.png', shape: 'LANDSCAPE' },
  network_hbo: { cover: IMAGE_BASE + 'scott-defaults/hbo-max.png', shape: 'LANDSCAPE' },
  network_abc: { cover: IMAGE_BASE + 'scott-defaults/abc.png', shape: 'LANDSCAPE' },
  network_aande: { cover: IMAGE_BASE + 'scott-defaults/a-and-e.png', shape: 'LANDSCAPE' },
  network_adultswim: { cover: IMAGE_BASE + 'scott-defaults/adult-swim.png', shape: 'LANDSCAPE' },
  network_amc: { cover: IMAGE_BASE + 'scott-defaults/amc-plus.png', shape: 'LANDSCAPE' },
  network_bravo: { cover: IMAGE_BASE + 'scott-defaults/bravo.png', shape: 'LANDSCAPE' },
  network_cartoon: { cover: IMAGE_BASE + 'scott-defaults/cartoon-network.png', shape: 'LANDSCAPE' },
  network_bbc: { cover: IMAGE_BASE + 'uk-networks/bbc-one.png', shape: 'LANDSCAPE' },
  mdb_3087: { cover: IMAGE_BASE + 'uk-networks/bbc-one.png', shape: 'LANDSCAPE' },


  mdb_bbc_shows_series: { cover: IMAGE_BASE + 'scott-defaults/bbc-shows.jpg', shape: 'LANDSCAPE' },
  /* Scott non-horror theme canonical artwork */
  theme_mafia: { cover: IMAGE_BASE + 'scott-defaults/mafia.png', shape: 'LANDSCAPE' },
  theme_gangster: { cover: IMAGE_BASE + 'scott-defaults/gangster.png', shape: 'LANDSCAPE' },
  theme_detective: { cover: IMAGE_BASE + 'scott-defaults/detective.png', shape: 'LANDSCAPE' },
    spy_espionage_movies: { cover: IMAGE_BASE + 'scott-defaults/spy-espionage.png', shape: 'LANDSCAPE' },
    spy_espionage_series: { cover: IMAGE_BASE + 'scott-defaults/spy-espionage.png', shape: 'LANDSCAPE' },
  theme_police: { cover: IMAGE_BASE + 'scott-defaults/police.png', shape: 'LANDSCAPE' },
  theme_prison: { cover: IMAGE_BASE + 'scott-defaults/prison.png', shape: 'LANDSCAPE' },
  theme_heist: { cover: IMAGE_BASE + 'scott-step4/themed-heist.png', shape: 'LANDSCAPE' },
  theme_murder: { cover: IMAGE_BASE + 'scott-defaults/murder-mystery.png', shape: 'LANDSCAPE' },
  theme_timeloop: { cover: IMAGE_BASE + 'scott-step4/themed-time-loop.png', shape: 'LANDSCAPE' },
  theme_superhero: { cover: IMAGE_BASE + 'scott-step4/themed-superhero.png', shape: 'LANDSCAPE' },
  mdb_reality_tv_series: { cover: IMAGE_BASE + 'scott-defaults/reality-tv.png', shape: 'LANDSCAPE' },
  romcom_movies: { cover: IMAGE_BASE + 'scott-defaults/romcom.png', shape: 'LANDSCAPE' },
  curiosity_movies: { cover: IMAGE_BASE + 'scott-defaults/curiosity.png', shape: 'LANDSCAPE' },
  curiosity_series: { cover: IMAGE_BASE + 'scott-defaults/curiosity.png', shape: 'LANDSCAPE' },
  adventure_movies: { cover: IMAGE_BASE + 'scott-genres/genre-adventure.png', shape: 'LANDSCAPE' },
  adventure_series: { cover: IMAGE_BASE + 'scott-genres/genre-adventure.png', shape: 'LANDSCAPE' },
  western_movies: { cover: IMAGE_BASE + 'scott-genres/genre-western.png', shape: 'LANDSCAPE' },


  /* Scott horror/theme canonical artwork */
  theme_psychological: { cover: IMAGE_BASE + 'scott-step4/themed-psychological-horror.png', shape: 'LANDSCAPE' },
  theme_folkhorror: { cover: IMAGE_BASE + 'scott-step4/themed-folk-horror.png', shape: 'LANDSCAPE' },
  theme_bodyhorror: { cover: IMAGE_BASE + 'scott-step4/themed-body-horror.png', shape: 'LANDSCAPE' },
  theme_slasher: { cover: IMAGE_BASE + 'scott-step4/themed-slasher.png', shape: 'LANDSCAPE' },
  theme_cosmichorror: { cover: IMAGE_BASE + 'scott-step4/themed-cosmic-horror.png', shape: 'LANDSCAPE' },
  theme_lovecraftian: { cover: IMAGE_BASE + 'scott-step4/themed-lovecraftian-horror.png', shape: 'LANDSCAPE' },
  theme_animalattack: { cover: IMAGE_BASE + 'scott-step4/themed-animal-attack.png', shape: 'LANDSCAPE' },
  theme_zombie: { cover: IMAGE_BASE + 'scott-step4/themed-zombie.png', shape: 'LANDSCAPE' },
  theme_serialkiller: { cover: IMAGE_BASE + 'scott-step4/themed-serial-killer.png', shape: 'LANDSCAPE' },
  theme_gothichorror: { cover: IMAGE_BASE + 'scott-step4/themed-gothic-horror.png', shape: 'LANDSCAPE' },
  theme_possession: { cover: IMAGE_BASE + 'scott-step4/themed-possession.png', shape: 'LANDSCAPE' },
  theme_vampire: { cover: IMAGE_BASE + 'scott-step4/themed-vampire.png', shape: 'LANDSCAPE' },
  theme_foundfootage: { cover: IMAGE_BASE + 'scott-step4/themed-found-footage.png', shape: 'LANDSCAPE' },
  theme_homeinvasion: { cover: IMAGE_BASE + 'scott-step4/themed-home-invasion.png', shape: 'LANDSCAPE' },
  theme_paranormal: { cover: IMAGE_BASE + 'scott-step4/themed-paranormal.png', shape: 'LANDSCAPE' },
  theme_werewolf: { cover: IMAGE_BASE + 'scott-step4/themed-werewolf.png', shape: 'LANDSCAPE' },
  theme_horrorcomedy: { cover: IMAGE_BASE + 'scott-step4/themed-horror-comedy.png', shape: 'LANDSCAPE' },
  theme_creaturefeature: { cover: IMAGE_BASE + 'scott-step4/themed-creature-feature.png', shape: 'LANDSCAPE' },


  /* Scott Decades + Kids canonical artwork */
  mdb_best_of_2020s: { cover: IMAGE_BASE + 'scott-defaults/decade-2020s.png', shape: 'LANDSCAPE' },
  mdb_best_of_2010s: { cover: IMAGE_BASE + 'scott-defaults/decade-2010s.png', shape: 'LANDSCAPE' },
  mdb_best_of_2000s: { cover: IMAGE_BASE + 'scott-defaults/decade-2000s.png', shape: 'LANDSCAPE' },
  mdb_best_of_1990s: { cover: IMAGE_BASE + 'scott-defaults/decade-1990s.png', shape: 'LANDSCAPE' },
  mdb_best_of_1980s: { cover: IMAGE_BASE + 'scott-defaults/decade-1980s.png', shape: 'LANDSCAPE' },
  mdb_91304: { cover: IMAGE_BASE + 'scott-defaults/decade-2020s.png', shape: 'LANDSCAPE' },
  mdb_91303: { cover: IMAGE_BASE + 'scott-defaults/decade-2010s.png', shape: 'LANDSCAPE' },
  mdb_91302: { cover: IMAGE_BASE + 'scott-defaults/decade-2000s.png', shape: 'LANDSCAPE' },
  mdb_91300: { cover: IMAGE_BASE + 'scott-defaults/decade-1990s.png', shape: 'LANDSCAPE' },
  mdb_91301: { cover: IMAGE_BASE + 'scott-defaults/decade-1980s.png', shape: 'LANDSCAPE' },
  mdb_trending_kids_movies: { cover: IMAGE_BASE + 'scott-step4-kids/step4-kids-movies.png', shape: 'LANDSCAPE' },
  mdb_trending_kids_series: { cover: IMAGE_BASE + 'scott-step4-kids/step4-kids-series.png', shape: 'LANDSCAPE' },
  mdb_top_kids_movies_week: { cover: IMAGE_BASE + 'scott-step4-kids/step4-top-kids-this-week.png', shape: 'LANDSCAPE' },
  mdb_88307: { cover: IMAGE_BASE + 'scott-step4-kids/step4-kids-movies.png', shape: 'LANDSCAPE' },
  mdb_88309: { cover: IMAGE_BASE + 'scott-step4-kids/step4-kids-series.png', shape: 'LANDSCAPE' },
  mdb_13: { cover: IMAGE_BASE + 'scott-step4-kids/step4-top-kids-this-week.png', shape: 'LANDSCAPE' },


  /* Scott canonical default artwork */
  popular_movies: { cover: IMAGE_BASE + 'scott-defaults/popular-movies.png' },
  popular_series: { cover: IMAGE_BASE + 'scott-defaults/popular-series.png' },
  top_movies: { cover: IMAGE_BASE + 'scott-defaults/top-rated-movies.png' },
  top_series: { cover: IMAGE_BASE + 'scott-defaults/top-rated-series.png' },
  now_movies: { cover: IMAGE_BASE + 'scott-defaults/now-playing.png' },
  airing_series: { cover: IMAGE_BASE + 'scott-defaults/airing-today.png' },
  ontheair_series: { cover: IMAGE_BASE + 'scott-defaults/on-the-air.png' },
  action_movies: { cover: IMAGE_BASE + 'scott-genres/genre-action.png'},
  action_series: { cover: IMAGE_BASE + 'scott-genres/genre-action.png'},
  comedy_movies: { cover: IMAGE_BASE + 'scott-genres/genre-comedy.png'},
  comedy_series: { cover: IMAGE_BASE + 'scott-genres/genre-comedy.png'},
  horror_movies: { cover: IMAGE_BASE + 'scott-genres/genre-horror.png'},
  horror_series: { cover: IMAGE_BASE + 'scott-genres/genre-horror.png'},
  scifi_movies: { cover: IMAGE_BASE + 'scott-genres/genre-sci-fi.png'},
  scifi_series: { cover: IMAGE_BASE + 'scott-genres/genre-sci-fi.png'},
  thriller_movies: { cover: IMAGE_BASE + 'scott-genres/genre-thriller.png'},
  thriller_series: { cover: IMAGE_BASE + 'scott-genres/genre-thriller.png'},
  crime_movies: { cover: IMAGE_BASE + 'scott-genres/genre-crime.png'},
  crime_series: { cover: IMAGE_BASE + 'scott-genres/genre-crime.png'},
  drama_movies: { cover: IMAGE_BASE + 'scott-genres/genre-drama.png'},
  drama_series: { cover: IMAGE_BASE + 'scott-genres/genre-drama.png'},
  romance_movies: { cover: IMAGE_BASE + 'scott-genres/genre-romance.png'},
  romance_series: { cover: IMAGE_BASE + 'scott-genres/genre-romance.png'},
  mystery_movies: { cover: IMAGE_BASE + 'scott-genres/genre-mystery.png'},
  mystery_series: { cover: IMAGE_BASE + 'scott-genres/genre-mystery.png'},
  fantasy_movies: { cover: IMAGE_BASE + 'scott-genres/genre-fantasy.png'},
  fantasy_series: { cover: IMAGE_BASE + 'scott-genres/genre-fantasy.png'},
  family_movies: { cover: IMAGE_BASE + 'scott-genres/genre-family.png'},
  family_series: { cover: IMAGE_BASE + 'scott-genres/genre-family.png'},
  animation_movies: { cover: IMAGE_BASE + 'scott-genres/genre-animated.png'},
  animation_series: { cover: IMAGE_BASE + 'scott-genres/genre-animated.png'},
  documentary_movies: { cover: IMAGE_BASE + 'scott-genres/genre-documentary.png'},
  documentary_series: { cover: IMAGE_BASE + 'scott-genres/genre-documentary.png'},
  anime_movies: { cover: IMAGE_BASE + 'scott-genres/genre-anime.png'},
  anime_series: { cover: IMAGE_BASE + 'scott-genres/genre-anime.png'},
  bollywood_movies: { cover: IMAGE_BASE + 'scott-genres/genre-bollywood.png'},
  bollywood_series: { cover: IMAGE_BASE + 'scott-genres/genre-bollywood.png'},
  got_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/game-of-thrones.png' },
  breakingbad_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/breaking-bad.png' },
  breakingbad_movie_collection: { cover: IMAGE_BASE + 'scott-defaults/breaking-bad.png' },
  stephenking_movie_collection: { cover: IMAGE_BASE + 'scott-defaults/horror.png' },
  stephenking_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/horror.png' },
  sopranos_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/sopranos.png' },
  outlander_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/outlander.png' },
  theboys_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/the-boys.png' },
  yellowstone_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/yellowstone.png' },
  walkingdead_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/walking-dead.png' },
  dexter_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/dexter.png' },
  power_tv_collection: { cover: IMAGE_BASE + 'scott-defaults/power.png' },

  /* Trending / Popular / New / Latest */
  trending_movies: { cover: IMAGE_BASE + 'scott-defaults/trending-movies.png', shape: 'LANDSCAPE' },
  trending_series: { cover: IMAGE_BASE + 'scott-defaults/trending-series.png', shape: 'LANDSCAPE' },







  mdb_2236: { cover: IMAGE_BASE + 'scott-defaults/best-movies.png', shape: 'LANDSCAPE' },
  mdb_1198: { cover: IMAGE_BASE + 'scott-defaults/popular-movies-spotlight.png', shape: 'LANDSCAPE' },
  mdb_69: { cover: IMAGE_BASE + 'scott-defaults/popular-movies-spotlight.png', shape: 'LANDSCAPE' },
  mdb_86934: { cover: IMAGE_BASE + 'scott-defaults/new-movies.png', shape: 'LANDSCAPE' },
  mdb_960: { cover: IMAGE_BASE + 'scott-defaults/new-movies.png', shape: 'LANDSCAPE' },
  mdb_2202: { cover: IMAGE_BASE + 'scott-defaults/new-movies.png', shape: 'LANDSCAPE' },
  mdb_1176: { cover: IMAGE_BASE + 'scott-defaults/new-movies.png', shape: 'LANDSCAPE' },
  mdb_86710: { cover: IMAGE_BASE + 'new_latest.latest_airing_shows.webp', shape: 'LANDSCAPE' },

  /* Curated */
  mdb_mindfuck_movies: { cover: IMAGE_BASE + 'scott-step4/themed-mind-benders.png', shape: 'LANDSCAPE' },
  mdb_plot_twists_movies: { cover: IMAGE_BASE + 'themed_curated.plot_twists.webp', shape: 'LANDSCAPE' },
  mdb_outer_space_movies: { cover: IMAGE_BASE + 'scott-step4/themed-outer-space.png', shape: 'LANDSCAPE' },
  mdb_time_travel_movies: { cover: IMAGE_BASE + 'scott-step4/themed-time-travel.png', shape: 'LANDSCAPE' },
  mdb_modern_horror_movies: { cover: IMAGE_BASE + 'scott-step4/themed-modern-horror.png', shape: 'LANDSCAPE' },
  mdb_horror_classics_movies: { cover: IMAGE_BASE + 'scott-step4/themed-horror-classics.png', shape: 'LANDSCAPE' },
  mdb_rotten_tomatoes_100_movies: { cover: IMAGE_BASE + 'scott-step4/themed-perfect-scores.png', shape: 'LANDSCAPE' },
  mdb_parody_movies: { cover: IMAGE_BASE + 'scott-step4/themed-parody.png', shape: 'LANDSCAPE' },
  mdb_true_crime_movies: { cover: IMAGE_BASE + 'scott-step4/themed-true-crime.png', shape: 'LANDSCAPE' },
  mdb_thrilling_movies: { cover: IMAGE_BASE + 'scott-step4/themed-thrillers.png', shape: 'LANDSCAPE' },
  mdb_seasonal_movies: { cover: IMAGE_BASE + 'scott-step4/themed-seasonal.png', shape: 'LANDSCAPE' },

  /* Trakt */
  mdb_trakt_trending_movies: { cover: IMAGE_BASE + 'scott-defaults/trakt-trending-v2.png', shape: 'LANDSCAPE' },
  mdb_88434: { cover: IMAGE_BASE + 'scott-defaults/trakt.png', shape: 'LANDSCAPE' },












  /* Decades: current semantic IDs */
  mdb_best_of_2025:  { cover: IMAGE_BASE + 'awards_canon.best_2025_movies.webp', shape: 'LANDSCAPE' },





  /* Decades: retained legacy numeric IDs */
  mdb_92337: { cover: IMAGE_BASE + 'awards_canon.best_2025_movies.webp', shape: 'LANDSCAPE' },





  /* Kids & Family: current semantic IDs */



  /* Kids & Family: retained legacy numeric IDs */



  /* Kids / Family */



  /* UK */

  mdb_3091: { cover: IMAGE_BASE + 'network_abc.jpg' },
  mdb_uk_shows_series: { cover: IMAGE_BASE + 'scott-defaults/uk_shows.png', shape: 'LANDSCAPE' },
  itvx_movies: { cover: IMAGE_BASE + 'scott-streaming/streaming-itvx.jpg', gif: 'https://ultramax.vip/images/uk.itvx.focus.gif' },
  itvx_series: { cover: IMAGE_BASE + 'scott-streaming/streaming-itvx.jpg', gif: 'https://ultramax.vip/images/uk.itvx.focus.gif' },
  channel4_movies: { cover: IMAGE_BASE + 'scott-streaming/streaming-channel-4.jpg', gif: 'https://ultramax.vip/images/uk.channel_4.focus.gif' },
  channel4_series: { cover: IMAGE_BASE + 'scott-streaming/streaming-channel-4.jpg', gif: 'https://ultramax.vip/images/uk.channel_4.focus.gif' },

  /* Genres */





  /* Collections */
  hp_collection: { cover: IMAGE_BASE + 'scott-defaults/harry-potter.webp', shape: 'LANDSCAPE' },
  startrek_coll: { cover: IMAGE_BASE + 'scott-defaults/star-trek.webp', shape: 'LANDSCAPE' },
  lotr_collection: { cover: IMAGE_BASE + 'scott-defaults/lord-of-the-rings.webp', shape: 'LANDSCAPE' },
  hobbit_collection: { cover: IMAGE_BASE + 'scott-defaults/the-hobbit.webp', shape: 'LANDSCAPE' },
  starwars_collection: { cover: IMAGE_BASE + 'scott-defaults/star-wars.webp', shape: 'LANDSCAPE' },
  bond_collection: { cover: IMAGE_BASE + 'scott-defaults/james-bond.webp', shape: 'LANDSCAPE' },
  mi_collection: { cover: IMAGE_BASE + 'scott-defaults/mission-impossible.webp', shape: 'LANDSCAPE' },
  indiana_collection: { cover: IMAGE_BASE + 'scott-defaults/indiana-jones.webp', shape: 'LANDSCAPE' },
  jurassic_coll: { cover: IMAGE_BASE + 'scott-defaults/jurassic-park.webp', shape: 'LANDSCAPE' },
  fastfurious_coll: { cover: IMAGE_BASE + 'scott-defaults/fast-furious.webp', shape: 'LANDSCAPE' },
  johnwick_coll: { cover: IMAGE_BASE + 'scott-defaults/john-wick.webp', shape: 'LANDSCAPE' },
  matrix_collection: { cover: IMAGE_BASE + 'scott-defaults/matrix.webp', shape: 'LANDSCAPE' },
  diehard_collection: { cover: IMAGE_BASE + 'scott-defaults/die-hard.webp', shape: 'LANDSCAPE' },
  taken_collection: { cover: IMAGE_BASE + 'scott-defaults/taken.webp', shape: 'LANDSCAPE' },
  bourne_collection: { cover: IMAGE_BASE + 'scott-defaults/bourne.webp', shape: 'LANDSCAPE' },
  oceans_collection: { cover: IMAGE_BASE + 'scott-defaults/oceans.webp', shape: 'LANDSCAPE' },
  madmax_collection: { cover: IMAGE_BASE + 'scott-defaults/mad-max.webp', shape: 'LANDSCAPE' },
  rambo_collection: { cover: IMAGE_BASE + 'scott-defaults/rambo.webp', shape: 'LANDSCAPE' },
  expendables_coll: { cover: IMAGE_BASE + 'scott-defaults/expendables.webp', shape: 'LANDSCAPE' },
  kingsman_coll: { cover: IMAGE_BASE + 'scott-defaults/kingsman.webp', shape: 'LANDSCAPE' },
  avengers_coll: { cover: IMAGE_BASE + 'scott-defaults/avengers.webp', shape: 'LANDSCAPE' },
  captainamerica_coll: { cover: IMAGE_BASE + 'captainamerica_tmdb.jpg', shape: 'LANDSCAPE' },
  ironman_collection: { cover: IMAGE_BASE + 'ironman_tmdb.jpg', shape: 'LANDSCAPE' },
  thor_collection: { cover: IMAGE_BASE + 'scott-defaults/thor.webp', shape: 'LANDSCAPE' },
  gotg_collection: { cover: IMAGE_BASE + 'scott-defaults/guardians-of-the-galaxy.webp', shape: 'LANDSCAPE' },
  doctorstrange_coll: { cover: IMAGE_BASE + 'scott-defaults/doctor-strange.webp', shape: 'LANDSCAPE' },
  blackpanther_coll: { cover: IMAGE_BASE + 'blackpanther_tmdb.jpg', shape: 'LANDSCAPE' },
  antman_collection: { cover: IMAGE_BASE + 'antman_tmdb.jpg', shape: 'LANDSCAPE' },
  deadpool_coll: { cover: IMAGE_BASE + 'scott-defaults/deadpool.webp', shape: 'LANDSCAPE' },
  xmen_collection: { cover: IMAGE_BASE + 'scott-defaults/x-men.webp', shape: 'LANDSCAPE' },
  spiderman_collection: { cover: IMAGE_BASE + 'scott-defaults/spider-man.webp', shape: 'LANDSCAPE' },
  wonderwoman_coll: { cover: IMAGE_BASE + 'wonderwoman_tmdb.jpg', shape: 'LANDSCAPE' },
  aquaman_collection: { cover: IMAGE_BASE + 'aquaman_tmdb.jpg', shape: 'LANDSCAPE' },
  superman_collection: { cover: IMAGE_BASE + 'scott-defaults/superman.webp', shape: 'LANDSCAPE' },
  batman_collection: { cover: IMAGE_BASE + 'scott-defaults/batman.webp', shape: 'LANDSCAPE' },
  alien_collection: { cover: IMAGE_BASE + 'scott-defaults/alien.webp', shape: 'LANDSCAPE' },
  terminator_coll: { cover: IMAGE_BASE + 'scott-defaults/terminator.webp', shape: 'LANDSCAPE' },
  predator_coll: { cover: IMAGE_BASE + 'scott-defaults/predator.webp', shape: 'LANDSCAPE' },
  halloween_coll: { cover: IMAGE_BASE + 'scott-defaults/halloween.webp', shape: 'LANDSCAPE' },
  nightmare_coll: { cover: IMAGE_BASE + 'scott-defaults/nightmare-on-elm-street.webp', shape: 'LANDSCAPE' },
  saw_collection: { cover: IMAGE_BASE + 'scott-defaults/saw.webp', shape: 'LANDSCAPE' },
  scream_collection: { cover: IMAGE_BASE + 'scott-defaults/scream.webp', shape: 'LANDSCAPE' },
  conjuring_coll: { cover: IMAGE_BASE + 'scott-defaults/conjuring.webp', shape: 'LANDSCAPE' },
  planetapes_coll: { cover: IMAGE_BASE + 'scott-defaults/planet-of-the-apes.webp', shape: 'LANDSCAPE' },
  transformers_coll: { cover: IMAGE_BASE + 'scott-defaults/transformers.webp', shape: 'LANDSCAPE' },
  hungergames_coll: { cover: IMAGE_BASE + 'scott-defaults/hunger-games.webp', shape: 'LANDSCAPE' },
  pirates_collection: { cover: IMAGE_BASE + 'scott-defaults/pirates-of-the-caribbean.webp', shape: 'LANDSCAPE' },
  shrek_collection: { cover: IMAGE_BASE + 'scott-defaults/shrek.webp', shape: 'LANDSCAPE' },
  iceage_collection: { cover: IMAGE_BASE + 'scott-defaults/ice-age.webp', shape: 'LANDSCAPE' },
  httyd_collection: { cover: IMAGE_BASE + 'scott-defaults/how-to-train-your-dragon.webp', shape: 'LANDSCAPE' },
  despicableme_coll: { cover: IMAGE_BASE + 'scott-defaults/despicable-me.webp', shape: 'LANDSCAPE' },
  kungfupanda_coll: { cover: IMAGE_BASE + 'scott-defaults/kung-fu-panda.webp', shape: 'LANDSCAPE' },
  incredibles_coll: { cover: IMAGE_BASE + 'scott-defaults/incredibles.webp', shape: 'LANDSCAPE' },
  toystory_coll: { cover: IMAGE_BASE + 'scott-defaults/toy-story.webp', shape: 'LANDSCAPE' },
  findingnemo_coll: { cover: IMAGE_BASE + 'scott-defaults/finding-nemo.webp', shape: 'LANDSCAPE' },
  shrek2_collection: { cover: IMAGE_BASE + 'scott-defaults/minions.png', shape: 'LANDSCAPE' },
  dune_collection: { cover: IMAGE_BASE + 'scott-defaults/dune.webp', shape: 'LANDSCAPE' },
  godfather_collection: { cover: IMAGE_BASE + 'scott-defaults/godfather.webp', shape: 'LANDSCAPE' },
  avatar_collection: { cover: IMAGE_BASE + 'scott-defaults/avatar.webp', shape: 'LANDSCAPE' },
  scarymovie_coll: { cover: IMAGE_BASE + 'scott-defaults/scary-movie.webp', shape: 'LANDSCAPE' },
  knivesout_coll: { cover: IMAGE_BASE + 'scott-defaults/knives-out.webp', shape: 'LANDSCAPE' },
  mazerunner_coll: { cover: IMAGE_BASE + 'scott-defaults/maze-runner.webp', shape: 'LANDSCAPE' },
  backtofuture_coll: { cover: IMAGE_BASE + 'scott-defaults/back-to-the-future.webp', shape: 'LANDSCAPE' },
  sherlock_coll: { cover: IMAGE_BASE + 'scott-defaults/sherlock-holmes.webp', shape: 'LANDSCAPE' },

  /* Studios */
  studio_ghibli: { cover: IMAGE_BASE + 'scott-studios/studio-ghibli.jpg', gif: 'https://ultramax.vip/images/studios.ghibli.focus.gif' },
  studio_wb: { cover: IMAGE_BASE + 'scott-studios/studio-warner-bros.jpg', gif: 'https://ultramax.vip/images/studios.warner_bros.focus.gif' },
  studio_universal: { cover: IMAGE_BASE + 'scott-studios/studio-universal.jpg', gif: 'https://ultramax.vip/images/studios.universal.focus.gif' },
  studio_universal: { cover: IMAGE_BASE + 'scott-studios/studio-universal.jpg'},
  studio_sony: { cover: IMAGE_BASE + 'scott-studios/studio-sony-pictures.jpg', gif: IMAGE_BASE + 'Sony.gif' },
  studio_paramount: { cover: IMAGE_BASE + 'scott-studios/studio-paramount.jpg', gif: IMAGE_BASE + 'Paramount.gif' },
  studio_20thcentury: { cover: IMAGE_BASE + 'scott-studios/studio-20th-century.jpg', gif: IMAGE_BASE + '20th.gif' },
  studio_lionsgate: { cover: IMAGE_BASE + 'scott-studios/studio-lionsgate.jpg', gif: IMAGE_BASE + 'Lion.gif' },
  studio_newline: { cover: IMAGE_BASE + 'scott-studios/studio-new-line.jpg', gif: IMAGE_BASE + 'Newline.gif' },
  studio_canalplus: { cover: IMAGE_BASE + 'scott-studios/studio-canal-plus.jpg', gif: IMAGE_BASE + 'canal.gif' }
}


const FOLDER_MEDIA = {
  'Netflix':            { cover: IMAGE_BASE + 'scott-streaming/streaming-netflix.jpg',              gif: IMAGE_BASE + 'netflix.gif',              shape: 'LANDSCAPE' },
  'Prime Video':        { cover: IMAGE_BASE + 'scott-streaming/streaming-prime-video.jpg',                gif: IMAGE_BASE + 'Prime.gif',                shape: 'LANDSCAPE' },
  'Disney+':            { cover: IMAGE_BASE + 'scott-streaming/streaming-disney-plus.png', gif: IMAGE_BASE + 'Disney.gif', shape: 'LANDSCAPE' },
  'HBO / Max':          { cover: IMAGE_BASE + 'scott-streaming/streaming-hbo-max.jpg', gif: IMAGE_BASE + 'HBO.gif', shape: 'LANDSCAPE' },
  'Apple TV+':          { cover: IMAGE_BASE + 'scott-streaming/streaming-apple-tv-plus.jpg', gif: IMAGE_BASE + 'Apple.gif', shape: 'LANDSCAPE' },
  'Paramount+':         { cover: IMAGE_BASE + 'scott-streaming/streaming-paramount-plus.jpg',            gif: IMAGE_BASE + 'Paramount.gif',            shape: 'LANDSCAPE' },
  'Peacock':            { cover: IMAGE_BASE + 'scott-streaming/streaming-peacock.jpg',              gif: IMAGE_BASE + 'Peacock.gif',              shape: 'LANDSCAPE' },
  'Tubi':               { cover: 'https://ultramax.vip/assets/artwork/collections/tubi.png?v=20260911-1526', gif: 'https://media2.giphy.com/media/v1.Y2lkPTZjMDliOTUyN21jcmZnMzV6czQ0M3BmcTExcG5hMmtkbWFsNWo5ZGhwZWM1cjZoOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/nuCR4AXBkHU0eYGj08/giphy.gif', shape: 'LANDSCAPE' },
  'Pluto TV':           { cover: 'https://ultramax.vip/assets/artwork/collections/pluto.png?v=20260911-1526', gif: 'https://ultramax.vip/assets/artwork/collections/pluto.gif?v=20260911-1706', shape: 'LANDSCAPE' },
  'Hulu':               { cover: IMAGE_BASE + 'scott-streaming/streaming-hulu.jpg',                 gif: IMAGE_BASE + 'Hulu.gif',                 shape: 'LANDSCAPE' },
  'Shudder':            { cover: IMAGE_BASE + 'scott-streaming/streaming-shudder.jpg',              gif: IMAGE_BASE + 'Shudder.gif',              shape: 'LANDSCAPE' },
  'BritBox':            { cover: IMAGE_BASE + 'scott-streaming/streaming-britbox.jpg',                 gif: IMAGE_BASE + 'Brit.gif',                 shape: 'LANDSCAPE' },
  'MGM+':               { cover: IMAGE_BASE + 'scott-streaming/streaming-mgm-plus.jpg',                  gif: IMAGE_BASE + 'MGM.gif',                  shape: 'LANDSCAPE' },
  'Discovery+':         { cover: IMAGE_BASE + 'scott-streaming/streaming-discovery-plus.jpg',            gif: IMAGE_BASE + 'Discovery.gif',            shape: 'LANDSCAPE' },
  'National Geographic':{ cover: IMAGE_BASE + 'scott-streaming/streaming-national-geographic.jpg',               gif: IMAGE_BASE + 'NatGeo.gif',               shape: 'LANDSCAPE' },
  'A&E':                { cover: IMAGE_BASE + 'scott-streaming/streaming-a-and-e.jpg', gif: IMAGE_BASE + 'A&E.gif', shape: 'LANDSCAPE' },

  'Marvel':             { cover: IMAGE_BASE + 'scott-studios/studio-marvel.png',               gif: IMAGE_BASE + 'Marvel.gif',               shape: 'LANDSCAPE' },
  'DC':                 { cover: IMAGE_BASE + 'scott-studios/studio-dc.jpg',                   gif: IMAGE_BASE + 'DC.gif',                   shape: 'LANDSCAPE' },
  'A24':                { cover: IMAGE_BASE + 'scott-studios/studio-a24.jpg',                  gif: IMAGE_BASE + 'A24.gif',                  shape: 'LANDSCAPE' },
  'Blumhouse':          { cover: IMAGE_BASE + 'scott-studios/studio-blumhouse.jpg',            gif: IMAGE_BASE + 'Blumhouse.gif',            shape: 'LANDSCAPE' },
  'Pixar':              { cover: IMAGE_BASE + 'scott-studios/studio-pixar.png',                gif: IMAGE_BASE + 'Pixar.gif',                shape: 'LANDSCAPE' },
  'DreamWorks':         { cover: IMAGE_BASE + 'scott-studios/studio-dreamworks.jpg',           gif: IMAGE_BASE + 'Dreamworks.gif',           shape: 'LANDSCAPE' },

  'Action':             { cover: IMAGE_BASE + 'scott-genres/genre-action.png',                                           shape: 'LANDSCAPE' },
  'Horror':             { cover: IMAGE_BASE + 'scott-genres/genre-horror.png',                                           shape: 'LANDSCAPE' },
  'Comedy':             { cover: IMAGE_BASE + 'scott-genres/genre-comedy.png',                                           shape: 'LANDSCAPE' },
  'Sci-Fi':             { cover: IMAGE_BASE + 'scott-genres/genre-sci-fi.png',                                            shape: 'LANDSCAPE' },
  'Thriller':           { cover: IMAGE_BASE + 'scott-genres/genre-thriller.png',                                         shape: 'LANDSCAPE' },
  'Drama':              { cover: IMAGE_BASE + 'scott-genres/genre-drama.png',                                            shape: 'LANDSCAPE' },
  'Romance':            { cover: IMAGE_BASE + 'scott-genres/genre-romance.png',                                          shape: 'LANDSCAPE' },
  'Animation':          { cover: IMAGE_BASE + 'scott-genres/genre-animated.png',                                        shape: 'LANDSCAPE' },
  'Anime':              { cover: IMAGE_BASE + 'scott-genres/genre-anime.png',                                            shape: 'LANDSCAPE' },
  // Anime Phase 2A artwork, mirrored with creator permission.
  'Discover Anime': {
    cover: IMAGE_BASE + 'anime/discover-anime-cover.jpg',
    gif: IMAGE_BASE + 'anime/discover-anime-focus.jpg',
    hero: IMAGE_BASE + 'anime/discover-anime-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Shonen & Action Anime': {
    cover: IMAGE_BASE + 'anime/shonen-action-cover.jpg',
    gif: IMAGE_BASE + 'anime/shonen-action-focus.jpg',
    hero: IMAGE_BASE + 'anime/shonen-action-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Isekai & Fantasy Sagas': {
    cover: IMAGE_BASE + 'anime/isekai-fantasy-cover.jpg',
    gif: IMAGE_BASE + 'anime/isekai-fantasy-focus.jpg',
    hero: IMAGE_BASE + 'anime/isekai-fantasy-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Slice of Life & Romance': {
    cover: IMAGE_BASE + 'anime/slice-of-life-cover.jpg',
    gif: IMAGE_BASE + 'anime/slice-of-life-focus.jpg',
    hero: IMAGE_BASE + 'anime/slice-of-life-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Sports & Competition Anime': {
    cover: IMAGE_BASE + 'anime/sports-anime-cover.jpg',
    gif: IMAGE_BASE + 'anime/sports-anime-focus.jpg',
    hero: IMAGE_BASE + 'anime/sports-anime-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Studio Spotlight': {
    cover: IMAGE_BASE + 'anime/studio-spotlight-cover.jpg',
    gif: IMAGE_BASE + 'anime/studio-spotlight-focus.jpg',
    hero: IMAGE_BASE + 'anime/studio-spotlight-hero.jpg',
    shape: 'LANDSCAPE'
  },
  // Bollywood Phase 2 artwork, created for Ultra MAX.
  'Discover Bollywood': {
    cover: IMAGE_BASE + 'bollywood/discover-cover.jpg',
    gif: IMAGE_BASE + 'bollywood/discover-focus.jpg',
    hero: IMAGE_BASE + 'bollywood/discover-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Action, Thriller & Crime': {
    cover: IMAGE_BASE + 'bollywood/action-thriller-crime-cover.jpg',
    gif: IMAGE_BASE + 'bollywood/action-thriller-crime-focus.jpg',
    hero: IMAGE_BASE + 'bollywood/action-thriller-crime-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Comedy & Romance': {
    cover: IMAGE_BASE + 'bollywood/comedy-romance-cover.jpg',
    gif: IMAGE_BASE + 'bollywood/comedy-romance-focus.jpg',
    hero: IMAGE_BASE + 'bollywood/comedy-romance-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Bollywood Drama': {
    cover: IMAGE_BASE + 'bollywood/drama-cover.jpg',
    gif: IMAGE_BASE + 'bollywood/drama-focus.jpg',
    hero: IMAGE_BASE + 'bollywood/drama-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Discover Documentaries': {
    cover: IMAGE_BASE + 'scott-genres/genre-documentary.png?v=20260910-205802',
    hero: IMAGE_BASE + 'scott-genres/genre-documentary.png?v=20260910-205802',
    shape: 'LANDSCAPE'
  },
  // Documentary Phase 2B artwork.
  'True Crime': {
    cover: IMAGE_BASE + 'scott-step4/themed-true-crime.png',
    gif: IMAGE_BASE + 'scott-step4/themed-true-crime.png',
    hero: IMAGE_BASE + 'scott-step4/themed-true-crime.png',
    shape: 'LANDSCAPE'
  },
  'True Crime & Serial Killers': {
    cover: 'https://ultramax.vip/images/documentaries/true-crime.png',
    gif: 'https://ultramax.vip/images/documentaries/true-crime.png',
    hero: 'https://ultramax.vip/images/documentaries/true-crime.png',
    shape: 'LANDSCAPE'
  },
  'Nature, Wildlife & Earth': {
    cover: IMAGE_BASE + 'documentaries/nature-earth-cover.jpg',
    gif: IMAGE_BASE + 'documentaries/nature-earth-focus.jpg',
    hero: IMAGE_BASE + 'documentaries/nature-earth-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Science, Tech & Cosmos': {
    cover: IMAGE_BASE + 'documentaries/science-cosmos-cover.jpg',
    gif: IMAGE_BASE + 'documentaries/science-cosmos-focus.jpg',
    hero: IMAGE_BASE + 'documentaries/science-cosmos-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'History, War & Civilizations': {
    cover: IMAGE_BASE + 'documentaries/history-war-cover.jpg',
    gif: IMAGE_BASE + 'documentaries/history-war-focus.jpg',
    hero: IMAGE_BASE + 'documentaries/history-war-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Music & Concert Documentaries': {
    cover: IMAGE_BASE + 'documentaries/music-documentaries-cover.jpg',
    gif: IMAGE_BASE + 'documentaries/music-documentaries-focus.jpg',
    hero: IMAGE_BASE + 'documentaries/music-documentaries-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Sports & Athletic Stories': {
    cover: IMAGE_BASE + 'documentaries/sports-stories-cover.jpg',
    gif: IMAGE_BASE + 'documentaries/sports-stories-focus.jpg',
    hero: IMAGE_BASE + 'documentaries/sports-stories-hero.jpg',
    shape: 'LANDSCAPE'
  },
  // Kids & Family Phase 2C artwork.
  'Discover Kids & Family': {
    cover: IMAGE_BASE + 'kids-family/discover-kids-cover.jpg',
    gif: IMAGE_BASE + 'kids-family/discover-kids-focus.jpg',
    hero: IMAGE_BASE + 'kids-family/discover-kids-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'New for Kids': {
    cover: IMAGE_BASE + 'kids-family/new-kids-movies.png',
    gif: IMAGE_BASE + 'kids-family/new-kids-movies.png',
    hero: IMAGE_BASE + 'kids-family/new-kids-movies.png',
    shape: 'LANDSCAPE'
  },
  'Preschool & Learning': {
    cover: IMAGE_BASE + 'kids-family/preschool-learning-cover.jpg',
    gif: IMAGE_BASE + 'kids-family/preschool-learning-focus.jpg',
    hero: IMAGE_BASE + 'kids-family/preschool-learning-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Animated Studio Spotlight': {
    cover: IMAGE_BASE + 'kids-family/animated-studios-cover.jpg',
    gif: IMAGE_BASE + 'kids-family/animated-studios-focus.jpg',
    hero: IMAGE_BASE + 'kids-family/animated-studios-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Family Movie Night': {
    cover: IMAGE_BASE + 'kids-family/family-movie-night-cover.jpg',
    gif: IMAGE_BASE + 'kids-family/family-movie-night-focus.jpg',
    hero: IMAGE_BASE + 'kids-family/family-movie-night-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Kids Superheroes': {
    cover: IMAGE_BASE + 'kids-family/kids-superheroes-cover.jpg',
    gif: IMAGE_BASE + 'kids-family/kids-superheroes-focus.jpg',
    hero: IMAGE_BASE + 'kids-family/kids-superheroes-hero.jpg',
    shape: 'LANDSCAPE'
  },
  'Documentary':        { cover: IMAGE_BASE + 'scott-genres/genre-documentary.png',                                      shape: 'LANDSCAPE' },
  'Crime':              { cover: IMAGE_BASE + 'scott-genres/genre-crime.png',                                            shape: 'LANDSCAPE' },
  'Fantasy':            { cover: IMAGE_BASE + 'scott-genres/genre-fantasy.png',                                           shape: 'LANDSCAPE' },
  'History & War':      { cover: IMAGE_BASE + 'scott-genres/genre-history.png',                                          shape: 'LANDSCAPE' },
  'History':            { cover: IMAGE_BASE + 'scott-defaults/history.png',                                          shape: 'LANDSCAPE' },
  'Nature':             { cover: IMAGE_BASE + 'themed_curated.nature.webp',                                           shape: 'LANDSCAPE' },
  'BBC Shows':          { cover: IMAGE_BASE + 'uk.bbc.webp',                                                        shape: 'LANDSCAPE' },

  'Christopher Nolan':  { cover: IMAGE_BASE + 'director_nolan.jpg',                                          shape: 'LANDSCAPE' },
  'Martin Scorsese':    { cover: IMAGE_BASE + 'director_scorsese.jpg',                                       shape: 'LANDSCAPE' },
  'Steven Spielberg':   { cover: IMAGE_BASE + 'director_spielberg.jpg',                                      shape: 'LANDSCAPE' },
  'Denis Villeneuve':   { cover: IMAGE_BASE + 'director_villeneuve.jpg',                                     shape: 'LANDSCAPE' },
  'David Fincher':      { cover: IMAGE_BASE + 'director_fincher.jpg',                                        shape: 'LANDSCAPE' },
  'Stanley Kubrick':    { cover: IMAGE_BASE + 'director_kubrick.jpg',                                        shape: 'LANDSCAPE' },
  'Alfred Hitchcock':   { cover: IMAGE_BASE + 'director_hitchcock.jpg',                                      shape: 'LANDSCAPE' },
  'Wes Anderson':       { cover: IMAGE_BASE + 'director_anderson.jpg',                                       shape: 'LANDSCAPE' },
  'Tim Burton':         { cover: IMAGE_BASE + 'director_burton.jpg',                                          shape: 'LANDSCAPE' },
  'Quentin Tarantino':  { cover: IMAGE_BASE + 'director_tarantino.jpg',                                       shape: 'LANDSCAPE' },
  'John Hughes':        { cover: IMAGE_BASE + 'director_hughes.jpg',                                          shape: 'LANDSCAPE' },

  'Adam Sandler':       { cover: IMAGE_BASE + 'actor_sandler.jpg',       shape: 'POSTER' },
  'Angelina Jolie':     { cover: IMAGE_BASE + 'actor_jolie.jpg',         shape: 'POSTER' },
  'Brad Pitt':          { cover: IMAGE_BASE + 'actor_pitt.jpg',          shape: 'POSTER' },
  'Christian Bale':     { cover: IMAGE_BASE + 'actor_bale.jpg',          shape: 'POSTER' },
  'Clint Eastwood':     { cover: IMAGE_BASE + 'actors.clint_eastwood.webp',      shape: 'POSTER' },
  'Denzel Washington':  { cover: IMAGE_BASE + 'actor_denzel.jpg',        shape: 'POSTER' },
  'Jim Carrey':         { cover: IMAGE_BASE + 'actor_carrey.jpg',        shape: 'POSTER' },
  'Johnny Depp':        { cover: IMAGE_BASE + 'actor_depp.jpg',          shape: 'POSTER' },
  'Leonardo DiCaprio':  { cover: IMAGE_BASE + 'actor_dicaprio.jpg',      shape: 'POSTER' },
  'Margot Robbie':      { cover: IMAGE_BASE + 'actor_robbie.jpg',        shape: 'POSTER' },
  'Matt Damon':         { cover: IMAGE_BASE + 'actor_damon.jpg',         shape: 'POSTER' },
  'Morgan Freeman':     { cover: IMAGE_BASE + 'actor_freeman.jpg',       shape: 'POSTER' },
  'Robert De Niro':     { cover: IMAGE_BASE + 'actor_deniro.jpg',        shape: 'POSTER' },
  'Robert Downey Jr':   { cover: IMAGE_BASE + 'actor_rdj.jpg',           shape: 'POSTER' },
  'Ryan Gosling':       { cover: IMAGE_BASE + 'actor_gosling.jpg',       shape: 'POSTER' },
  'Ryan Reynolds':      { cover: IMAGE_BASE + 'actor_reynolds.jpg',      shape: 'POSTER' },
  'Seth Rogen':         { cover: IMAGE_BASE + 'actor_rogen.jpg',         shape: 'POSTER' },
  'Tom Cruise':         { cover: IMAGE_BASE + 'actor_cruise.jpg',        shape: 'POSTER' },
  'Tom Hanks':          { cover: IMAGE_BASE + 'actor_hanks.jpg',         shape: 'POSTER' },
  'Will Ferrell':       { cover: IMAGE_BASE + 'actor_ferrell.jpg',       shape: 'POSTER' },
  'Will Smith':         { cover: IMAGE_BASE + 'actor_smith.jpg',         shape: 'POSTER' },

  'Harry Potter':       { cover: IMAGE_BASE + 'scott-defaults/harry-potter.webp',                                        shape: 'LANDSCAPE' },
  'Lord of the Rings':  { cover: IMAGE_BASE + 'scott-defaults/lord-of-the-rings.webp',                                               shape: 'LANDSCAPE' },
  'The Hobbit':         { cover: IMAGE_BASE + 'scott-defaults/the-hobbit.webp',                                             shape: 'LANDSCAPE' },
  'Star Wars':          { cover: IMAGE_BASE + 'scott-defaults/star-wars.webp',                                           shape: 'LANDSCAPE' },
  'James Bond':         { cover: IMAGE_BASE + 'scott-defaults/james-bond.webp',                                               shape: 'LANDSCAPE' },
  'Mission Impossible': { cover: IMAGE_BASE + 'scott-defaults/mission-impossible.webp',                                  shape: 'LANDSCAPE' },
  'Indiana Jones':      { cover: IMAGE_BASE + 'scott-defaults/indiana-jones.webp',                                       shape: 'LANDSCAPE' },
  'Jurassic Park':      { cover: IMAGE_BASE + 'scott-defaults/jurassic-park.webp',                                           shape: 'LANDSCAPE' },
  'Fast & Furious':     { cover: IMAGE_BASE + 'scott-defaults/fast-furious.webp',                                        shape: 'LANDSCAPE' },
  'John Wick':          { cover: IMAGE_BASE + 'scott-defaults/john-wick.webp',                                           shape: 'LANDSCAPE' },
  'The Matrix':         { cover: IMAGE_BASE + 'scott-defaults/matrix.webp',                                             shape: 'LANDSCAPE' },
  'Die Hard':           { cover: IMAGE_BASE + 'scott-defaults/die-hard.webp',                                            shape: 'LANDSCAPE' },
  'Taken':              { cover: IMAGE_BASE + 'scott-defaults/taken.webp',                                              shape: 'LANDSCAPE' },
  'Bourne':             { cover: IMAGE_BASE + 'scott-defaults/bourne.webp',                                             shape: 'LANDSCAPE' },
  'Oceans':             { cover: IMAGE_BASE + 'scott-defaults/oceans.webp',                                             shape: 'LANDSCAPE' },
  'Mad Max':            { cover: IMAGE_BASE + 'scott-defaults/mad-max.webp',                                             shape: 'LANDSCAPE' },
  'Rambo':              { cover: IMAGE_BASE + 'scott-defaults/rambo.webp',                                              shape: 'LANDSCAPE' },
  'Expendables':        { cover: IMAGE_BASE + 'scott-defaults/expendables.webp',                                        shape: 'LANDSCAPE' },
  'Kingsman':           { cover: IMAGE_BASE + 'scott-defaults/kingsman.webp',                                           shape: 'LANDSCAPE' },
  'Marvel Avengers':    { cover: IMAGE_BASE + 'scott-defaults/avengers.webp',                                           shape: 'LANDSCAPE' },
  'Captain America':    { cover: IMAGE_BASE + 'scott-defaults/captain-america.png',                                     shape: 'LANDSCAPE' },
  'Iron Man':           { cover: IMAGE_BASE + 'scott-defaults/iron-man.png',                                            shape: 'LANDSCAPE' },
  'Thor':               { cover: IMAGE_BASE + 'scott-defaults/thor.webp',                                               shape: 'LANDSCAPE' },
  'Guardians of the Galaxy': { cover: IMAGE_BASE + 'scott-defaults/guardians-of-the-galaxy.webp',                                          shape: 'LANDSCAPE' },
  'Doctor Strange':     { cover: IMAGE_BASE + 'scott-defaults/doctor-strange.webp',                                      shape: 'LANDSCAPE' },
  'Black Panther':      { cover: IMAGE_BASE + 'scott-defaults/black-panther.png',                                       shape: 'LANDSCAPE' },
  'Ant-Man':            { cover: IMAGE_BASE + 'scott-defaults/ant-man.png',                                             shape: 'LANDSCAPE' },
  'Deadpool':           { cover: IMAGE_BASE + 'scott-defaults/deadpool.webp',                                           shape: 'LANDSCAPE' },
  'X-Men':              { cover: IMAGE_BASE + 'scott-defaults/x-men.webp',                                               shape: 'LANDSCAPE' },
  'Spider-Man':         { cover: IMAGE_BASE + 'scott-defaults/spider-man.webp',                                               shape: 'LANDSCAPE' },
  'Wonder Woman':       { cover: IMAGE_BASE + 'scott-defaults/wonder-woman.png',                                        shape: 'LANDSCAPE' },
  'Aquaman':            { cover: IMAGE_BASE + 'scott-defaults/aquaman.png',                                            shape: 'LANDSCAPE' },
  'Superman':           { cover: IMAGE_BASE + 'scott-defaults/superman.webp',                                           shape: 'LANDSCAPE' },
  'Batman':             { cover: IMAGE_BASE + 'scott-defaults/batman.webp',                                             shape: 'LANDSCAPE' },
  'Alien':              { cover: IMAGE_BASE + 'scott-defaults/alien.webp',                                              shape: 'LANDSCAPE' },
  'Terminator':         { cover: IMAGE_BASE + 'scott-defaults/terminator.webp',                                         shape: 'LANDSCAPE' },
  'Predator':           { cover: IMAGE_BASE + 'scott-defaults/predator.webp',                                           shape: 'LANDSCAPE' },
  'Halloween':          { cover: IMAGE_BASE + 'scott-defaults/halloween.webp',                                          shape: 'LANDSCAPE' },
  'Nightmare on Elm Street': { cover: IMAGE_BASE + 'scott-defaults/nightmare-on-elm-street.webp',                                     shape: 'LANDSCAPE' },
  'Saw':                { cover: IMAGE_BASE + 'scott-defaults/saw.webp',                                                shape: 'LANDSCAPE' },
  'Scream':             { cover: IMAGE_BASE + 'scott-defaults/scream.webp',                                             shape: 'LANDSCAPE' },
  'Conjuring':          { cover: IMAGE_BASE + 'scott-defaults/conjuring.webp',                                          shape: 'LANDSCAPE' },
  'Scary Movie':        { cover: IMAGE_BASE + 'scott-defaults/scary-movie.webp',                                              shape: 'LANDSCAPE' },
  'Planet of the Apes': { cover: IMAGE_BASE + 'scott-defaults/planet-of-the-apes.webp',                                         shape: 'LANDSCAPE' },
  'Transformers':       { cover: IMAGE_BASE + 'scott-defaults/transformers.webp',                                       shape: 'LANDSCAPE' },
  'Hunger Games':       { cover: IMAGE_BASE + 'scott-defaults/hunger-games.webp',                                        shape: 'LANDSCAPE' },
  'Maze Runner':        { cover: IMAGE_BASE + 'scott-defaults/maze-runner.webp',                                              shape: 'LANDSCAPE' },
  'Pirates of the Caribbean': { cover: IMAGE_BASE + 'scott-defaults/pirates-of-the-caribbean.webp',                                      shape: 'LANDSCAPE' },
  'Shrek':              { cover: IMAGE_BASE + 'scott-defaults/shrek.webp',                                              shape: 'LANDSCAPE' },
  'Ice Age':            { cover: IMAGE_BASE + 'scott-defaults/ice-age.webp',                                             shape: 'LANDSCAPE' },
  'How to Train Your Dragon': { cover: IMAGE_BASE + 'scott-defaults/how-to-train-your-dragon.webp',                                        shape: 'LANDSCAPE' },
  'Despicable Me':      { cover: IMAGE_BASE + 'scott-defaults/despicable-me.webp',                                       shape: 'LANDSCAPE' },
  // New actors (kao-xt.com)
  'Timothee Chalamet':  { cover: IMAGE_BASE + 'Actors/Timothee Chalamet/cover.webp', shape: 'POSTER' },
  'Zendaya':            { cover: 'https://kao-xt.com/Actors/Zendaya/cover.webp',                    shape: 'POSTER' },
  'Florence Pugh':      { cover: 'https://kao-xt.com/Actors/Florence%20Pugh/cover.webp',            shape: 'POSTER' },
  'Tom Holland':        { cover: 'https://ultramax.vip/images/quick/actors__tom_holland__cover.png',             gif: 'https://ultramax.vip/images/quick/actors__tom_holland__gif.gif', shape: 'POSTER' },
  'Sydney Sweeney':     { cover: 'https://ultramax.vip/images/quick/actors__sydney_sweeney__cover.png',          gif: 'https://ultramax.vip/images/quick/actors__sydney_sweeney__gif.gif', shape: 'POSTER' },
  'Jenna Ortega':       { cover: 'https://ultramax.vip/images/quick/actors__jenna_ortega__cover.png',            gif: 'https://ultramax.vip/images/quick/actors__jenna_ortega__gif.gif', shape: 'POSTER' },
  'Dwayne Johnson':     { cover: 'https://ultramax.vip/images/quick/actors__dwayne_johnson__cover.png',          gif: 'https://ultramax.vip/images/quick/actors__dwayne_johnson__gif.gif', shape: 'POSTER' },
  'Nicole Kidman':      { cover: 'https://ultramax.vip/images/quick/actors__nicole_kidman__cover.png',           gif: 'https://ultramax.vip/images/quick/actors__nicole_kidman__gif.gif', shape: 'POSTER' },
  'Jake Gyllenhaal':    { cover: 'https://ultramax.vip/images/quick/actors__jake_gyllenhaal__cover.png',         gif: 'https://ultramax.vip/images/quick/actors__jake_gyllenhaal__gif.gif', shape: 'POSTER' },
  'Matthew McConaughey':{ cover: 'https://ultramax.vip/images/quick/actors__matthew_mcconaughey__cover.png',     gif: 'https://ultramax.vip/images/quick/actors__matthew_mcconaughey__gif.gif', shape: 'POSTER' },
  'Harrison Ford':      { cover: 'https://ultramax.vip/images/quick/actors__harrison_ford__cover.png',           gif: 'https://ultramax.vip/images/quick/actors__harrison_ford__gif.gif', shape: 'POSTER' },
  'Ben Stiller':        { cover: 'https://ultramax.vip/images/quick/actors__ben_stiller__cover.png',             gif: 'https://ultramax.vip/images/quick/actors__ben_stiller__gif.gif', shape: 'POSTER' },
  'Robin Williams':     { cover: 'https://ultramax.vip/images/quick/actors__robin_williams__cover.png',          gif: 'https://ultramax.vip/images/quick/actors__robin_williams__gif.gif', shape: 'POSTER' },
  'Daniel Craig':       { cover: 'https://ultramax.vip/images/quick/actors__daniel_craig__cover.png',            gif: 'https://ultramax.vip/images/quick/actors__daniel_craig__gif.gif', shape: 'POSTER' },
  'Scarlett Johansson': { cover: 'https://kao-xt.com/Actors/Scarlett%20Johansson/cover.webp',       shape: 'POSTER' },
  'Cate Blanchett':     { cover: 'https://kao-xt.com/Actors/Cate%20Blanchett/cover.webp',           shape: 'POSTER' },
  'Cillian Murphy':     { cover: 'https://kao-xt.com/Actors/Cillian%20Murphy/cover.webp',           shape: 'POSTER' },
  'Anthony Hopkins':    { cover: 'https://kao-xt.com/Actors/Anthony%20Hopkins/cover.webp',          shape: 'POSTER' },
  'Jack Nicholson':     { cover: 'https://kao-xt.com/Actors/Jack%20Nicholson/cover.webp',           shape: 'POSTER' },
  'Natalie Portman':    { cover: 'https://kao-xt.com/Actors/Natalie%20Portman/cover.webp',          shape: 'POSTER' },
  'Keanu Reeves':       { cover: 'https://kao-xt.com/Actors/Keanu%20Reeves/cover.webp',             shape: 'POSTER' },
  'Liam Neeson':        { cover: 'https://kao-xt.com/Actors/Liam%20Neeson/cover.webp',              shape: 'POSTER' },
  'Daniel Day-Lewis':   { cover: 'https://kao-xt.com/Actors/Daniel%20Day-Lewis/cover.webp',         shape: 'POSTER' },

  // New directors (kao-xt.com)
  'James Cameron':        { cover: 'https://kao-xt.com/Directors/James%20Cameron/cover.webp',         gif: 'https://ultramax.vip/images/quick/legendary_directors__james_cameron__gif.gif',        shape: 'LANDSCAPE' },
  'Ridley Scott':         { cover: 'https://kao-xt.com/Directors/Ridley%20Scott/cover.webp',           gif: 'https://ultramax.vip/images/quick/legendary_directors__ridley_scott__gif.gif',         shape: 'LANDSCAPE' },
  'Guillermo del Toro':   { cover: IMAGE_BASE + 'Directors/Guillermo Del Toro/cover.webp', shape: 'LANDSCAPE' },
  'Paul Thomas Anderson': { cover: 'https://ultramax.vip/images/quick/legendary_directors__paul_thomas_anderson__cover.png', gif: 'https://ultramax.vip/images/quick/legendary_directors__paul_thomas_anderson__gif.gif', shape: 'LANDSCAPE' },
  'Greta Gerwig':         { cover: 'https://ultramax.vip/images/quick/legendary_directors__greta_gerwig__cover.png',         gif: 'https://ultramax.vip/images/quick/legendary_directors__greta_gerwig__gif.gif',         shape: 'LANDSCAPE' },
  'Spike Lee':            { cover: 'https://ultramax.vip/images/quick/legendary_directors__spike_lee__cover.png',            gif: 'https://ultramax.vip/images/quick/legendary_directors__spike_lee__gif.gif',            shape: 'LANDSCAPE' },
  'John Carpenter':       { cover: 'https://ultramax.vip/images/quick/legendary_directors__john_carpenter__cover.png',       gif: 'https://ultramax.vip/images/quick/legendary_directors__john_carpenter__gif.gif',       shape: 'LANDSCAPE' },
  'Francis Ford Coppola': { cover: 'https://ultramax.vip/images/quick/legendary_directors__francis_ford_coppola__cover.png', gif: 'https://ultramax.vip/images/quick/legendary_directors__francis_ford_coppola__gif.gif', shape: 'LANDSCAPE' },
  'Brian De Palma':       { cover: 'https://ultramax.vip/images/quick/legendary_directors__brian_de_palma__cover.png',       gif: 'https://ultramax.vip/images/quick/legendary_directors__brian_de_palma__gif.gif',       shape: 'LANDSCAPE' },
  'Peter Jackson':        { cover: 'https://ultramax.vip/images/quick/legendary_directors__peter_jackson__cover.png',        gif: 'https://ultramax.vip/images/quick/legendary_directors__peter_jackson__gif.gif',        shape: 'LANDSCAPE' },
  'David Lynch':          { cover: 'https://ultramax.vip/images/quick/legendary_directors__david_lynch__cover.png',          gif: 'https://ultramax.vip/images/quick/legendary_directors__david_lynch__gif.gif',          shape: 'LANDSCAPE' },

  // New streaming (kao-xt.com)
  'Shudder':            { cover: IMAGE_BASE + 'scott-streaming/streaming-shudder.jpg', gif: IMAGE_BASE + 'Shudder.gif', shape: 'LANDSCAPE' },
  'BritBox':            { cover: IMAGE_BASE + 'scott-streaming/streaming-britbox.jpg',                                         gif: IMAGE_BASE + 'Brit.gif',                                     shape: 'LANDSCAPE' },
  'Acorn':              { cover: IMAGE_BASE + 'scott-streaming/streaming-acorn-tv.jpg', gif: 'https://ultramax.vip/images/uk.acorn_tv.focus.gif', shape: 'LANDSCAPE' },
  'ITVX':               { cover: IMAGE_BASE + 'scott-streaming/streaming-itvx.jpg', gif: 'https://ultramax.vip/images/uk.itvx.focus.gif', shape: 'LANDSCAPE' },
  // UK network artwork (Kaptain Cinematic Ghost set).
  'BBC One':      { cover: IMAGE_BASE + 'uk-networks/bbc-one.png', gif: IMAGE_BASE + 'uk-networks/bbc-one-hover.png', shape: 'POSTER' },
  'BBC Two':      { cover: IMAGE_BASE + 'uk-networks/bbc-two.png', gif: IMAGE_BASE + 'uk-networks/bbc-two-hover.png', shape: 'POSTER' },
  'BBC Three':    { cover: IMAGE_BASE + 'uk-networks/bbc-three.png', gif: IMAGE_BASE + 'uk-networks/bbc-three-hover.png', shape: 'POSTER' },
  'BBC Four':     { cover: IMAGE_BASE + 'uk-networks/bbc-four.png', gif: IMAGE_BASE + 'uk-networks/bbc-four-hover.png', shape: 'POSTER' },
  'ITV':          { cover: IMAGE_BASE + 'uk-networks/itv.png', gif: IMAGE_BASE + 'uk-networks/itv-hover.png', shape: 'POSTER' },
  'ITV2':         { cover: IMAGE_BASE + 'uk-networks/itv2.png', gif: IMAGE_BASE + 'uk-networks/itv2-hover.png', shape: 'POSTER' },
  'Channel 4':    { cover: IMAGE_BASE + 'uk-networks/channel-4.png', gif: IMAGE_BASE + 'uk-networks/channel-4-hover.png', shape: 'POSTER' },
  'Channel 5':    { cover: IMAGE_BASE + 'uk-networks/channel-5.png', gif: IMAGE_BASE + 'uk-networks/channel-5-hover.png', shape: 'POSTER' },
  'Dave':         { cover: IMAGE_BASE + 'uk-networks/dave.png', gif: IMAGE_BASE + 'uk-networks/dave-hover.png', shape: 'POSTER' },
  'E4':           { cover: IMAGE_BASE + 'uk-networks/e4.png', gif: IMAGE_BASE + 'uk-networks/e4-hover.png', shape: 'POSTER' },
  'Sky Atlantic': { cover: IMAGE_BASE + 'uk-networks/sky-atlantic.png', gif: IMAGE_BASE + 'uk-networks/sky-atlantic-hover.png', shape: 'POSTER' },
  'Sky Max':      { cover: IMAGE_BASE + 'uk-networks/sky-max.png', gif: IMAGE_BASE + 'uk-networks/sky-max-hover.png', shape: 'POSTER' },
  'Crunchyroll':        { cover: IMAGE_BASE + 'scott-streaming/streaming-crunchyroll.jpg', gif: IMAGE_BASE + 'streaming_services.crunchyroll.focus.gif', shape: 'LANDSCAPE' },
  'Starz':              { cover: IMAGE_BASE + 'scott-streaming/streaming-starz.jpg', gif: 'https://ultramax.vip/images/quick/starz.gif', shape: 'LANDSCAPE' },
  'MUBI':               { cover: IMAGE_BASE + 'scott-streaming/streaming-mubi.jpg', gif: 'https://ultramax.vip/images/quick/mubi.gif', shape: 'LANDSCAPE' },
  'Discovery+':         { cover: IMAGE_BASE + 'scott-streaming/streaming-discovery-plus.jpg', gif: IMAGE_BASE + 'Discovery.gif', shape: 'LANDSCAPE' },
  'National Geographic':{ cover: IMAGE_BASE + 'scott-streaming/streaming-national-geographic.jpg',                                       gif: IMAGE_BASE + 'NatGeo.gif',                                   shape: 'LANDSCAPE' },
  'Animal Planet':      { cover: IMAGE_BASE + 'scott-streaming/streaming-animal-planet.jpg', gif: 'https://ultramax.vip/images/animal_planet.gif?v=20260820b', shape: 'LANDSCAPE' },

  // Scott Sports collection artwork
  'Live & Upcoming':    { cover: IMAGE_BASE + 'scott-sports/live-upcoming.png', shape: 'LANDSCAPE' },
  'Football':           { cover: IMAGE_BASE + 'scott-sports/football.png', shape: 'LANDSCAPE' },
  'Basketball':         { cover: IMAGE_BASE + 'scott-sports/basketball.png', shape: 'LANDSCAPE' },
  'Wrestling':          { cover: IMAGE_BASE + 'scott-sports/wrestling.png', shape: 'LANDSCAPE' },
  'Motorsport':         { cover: IMAGE_BASE + 'scott-sports/motorsport.png', shape: 'LANDSCAPE' },
  'Boxing':             { cover: IMAGE_BASE + 'scott-sports/boxing.png', shape: 'LANDSCAPE' },
  'MMA':                { cover: IMAGE_BASE + 'scott-sports/mma.png', shape: 'LANDSCAPE' },
  'Other Sports':       { cover: IMAGE_BASE + 'scott-sports/other-sports.png', shape: 'LANDSCAPE' },

  // New genres
  'Adventure':          { cover: IMAGE_BASE + 'scott-genres/genre-adventure.png',       gif: 'https://ultramax.vip/images/quick/genres__adventure__gif.gif',       shape: 'LANDSCAPE' },
  'Western':            { cover: IMAGE_BASE + 'scott-genres/genre-western.png',         gif: 'https://ultramax.vip/images/quick/genres__western__gif.gif',         shape: 'LANDSCAPE' },
  'Rom-Com':            { cover: IMAGE_BASE + 'scott-defaults/romcom.png', gif: 'https://ultramax.vip/images/quick/genres__romantic_comedy__gif.gif', shape: 'LANDSCAPE' },
  'Stand-Up':           { cover: IMAGE_BASE + 'scott-genres/genre-stand-up-comedy.png', gif: 'https://ultramax.vip/images/quick/genres__stand_up_comedy__gif.gif', shape: 'LANDSCAPE' },
  'New Releases':       { cover: IMAGE_BASE + 'scott-genres/genre-new-releases.png',                                                         shape: 'LANDSCAPE' },
  'Reality TV':         { cover: IMAGE_BASE + 'scott-defaults/reality-tv.png',      gif: 'https://ultramax.vip/images/quick/genres__reality_tv__gif.gif',      shape: 'LANDSCAPE' },
  'War':                { cover: IMAGE_BASE + 'scott-defaults/war.png',              gif: 'https://ultramax.vip/images/quick/genres__war__gif.gif',              shape: 'LANDSCAPE' },
  'History':            { cover: IMAGE_BASE + 'scott-defaults/history.png',          gif: 'https://ultramax.vip/images/quick/genres__history__gif.gif',          shape: 'LANDSCAPE' },
  'History & War':      { cover: IMAGE_BASE + 'scott-genres/genre-history.png',          gif: 'https://ultramax.vip/images/quick/genres__history__gif.gif',          shape: 'LANDSCAPE' },

  // New studios
  'Walt Disney Pictures': { cover: IMAGE_BASE + 'scott-studios/studio-walt-disney-pictures.png',         shape: 'LANDSCAPE' },
  'Lucasfilm':            { cover: IMAGE_BASE + 'scott-studios/studio-lucasfilm.jpg', shape: 'LANDSCAPE' },
  'MGM':                  { cover: IMAGE_BASE + 'scott-studios/studio-mgm.jpg',           shape: 'LANDSCAPE' },

  // International Cinema artwork (Kaptain assets).
  'Korean Cinema': { cover: IMAGE_BASE + 'international/korean-cinema.png', gif: IMAGE_BASE + 'international/korean-cinema.gif', hero: IMAGE_BASE + 'international/korean-cinema.png', shape: 'LANDSCAPE' },
  'Japanese Cinema': { cover: IMAGE_BASE + 'international/japanese-cinema.png', gif: IMAGE_BASE + 'international/japanese-cinema.gif', hero: IMAGE_BASE + 'international/japanese-cinema.png', shape: 'LANDSCAPE' },
  'Chinese Cinema': { cover: IMAGE_BASE + 'international/chinese-cinema.png', gif: IMAGE_BASE + 'international/chinese-cinema.gif', hero: IMAGE_BASE + 'international/chinese-cinema.png', shape: 'LANDSCAPE' },
  'French Cinema': { cover: IMAGE_BASE + 'international/french-cinema.png', gif: IMAGE_BASE + 'international/french-cinema.gif', hero: IMAGE_BASE + 'international/french-cinema.png', shape: 'LANDSCAPE' },
  'Spanish Cinema': { cover: IMAGE_BASE + 'international/spanish-cinema.png', gif: IMAGE_BASE + 'international/spanish-cinema.gif', hero: IMAGE_BASE + 'international/spanish-cinema.png', shape: 'LANDSCAPE' },
  'Latin American Cinema': { cover: IMAGE_BASE + 'international/latin-american-cinema.png', gif: IMAGE_BASE + 'international/latin-american-cinema.gif', hero: IMAGE_BASE + 'international/latin-american-cinema.png', shape: 'LANDSCAPE' },
  'Italian Cinema': { cover: IMAGE_BASE + 'international/italian-cinema.png', gif: IMAGE_BASE + 'international/italian-cinema.gif', hero: IMAGE_BASE + 'international/italian-cinema.png', shape: 'LANDSCAPE' },
  'German Cinema': { cover: IMAGE_BASE + 'international/german-cinema.png', gif: IMAGE_BASE + 'international/german-cinema.gif', hero: IMAGE_BASE + 'international/german-cinema.png', shape: 'LANDSCAPE' },

  // Themed horror subgenres (Scott's images)
  'Zombie':              { cover: IMAGE_BASE + 'scott-step4/themed-zombie.png', shape: 'LANDSCAPE' },
  'Zombies':             { cover: IMAGE_BASE + 'scott-step4/themed-zombie.png', shape: 'LANDSCAPE' },
  'Slasher':             { cover: IMAGE_BASE + 'scott-step4/themed-slasher.png', shape: 'LANDSCAPE' },
  'Paranormal':          { cover: IMAGE_BASE + 'scott-step4/themed-paranormal.png', shape: 'LANDSCAPE' },
  'Possession':          { cover: IMAGE_BASE + 'scott-step4/themed-possession.png', shape: 'LANDSCAPE' },
  'Found Footage':       { cover: IMAGE_BASE + 'scott-step4/themed-found-footage.png', shape: 'LANDSCAPE' },
  'Home Invasion':       { cover: IMAGE_BASE + 'scott-step4/themed-home-invasion.png', shape: 'LANDSCAPE' },
  'Psychological Horror':{ cover: IMAGE_BASE + 'scott-step4/themed-psychological-horror.png', shape: 'LANDSCAPE' },
  'Horror Comedy':       { cover: IMAGE_BASE + 'scott-step4/themed-horror-comedy.png', shape: 'LANDSCAPE' },
  'Folk Horror':         { cover: IMAGE_BASE + 'scott-step4/themed-folk-horror.png', shape: 'LANDSCAPE' },
  'Gothic Horror':       { cover: IMAGE_BASE + 'scott-step4/themed-gothic-horror.png', shape: 'LANDSCAPE' },
  'Body Horror':         { cover: IMAGE_BASE + 'scott-step4/themed-body-horror.png', shape: 'LANDSCAPE' },
  'Lovecraftian Horror': { cover: IMAGE_BASE + 'scott-step4/themed-lovecraftian-horror.png', shape: 'LANDSCAPE' },
  'Cosmic Horror':       { cover: IMAGE_BASE + 'scott-step4/themed-cosmic-horror.png', shape: 'LANDSCAPE' },
  'Animal Attack':       { cover: IMAGE_BASE + 'scott-step4/themed-animal-attack.png', shape: 'LANDSCAPE' },
  'Werewolf':            { cover: IMAGE_BASE + 'scott-step4/themed-werewolf.png', shape: 'LANDSCAPE' },
  'Vampire':             { cover: IMAGE_BASE + 'scott-step4/themed-vampire.png', shape: 'LANDSCAPE' },
  'Serial Killer':       { cover: IMAGE_BASE + 'scott-step4/themed-serial-killer.png', shape: 'LANDSCAPE' },
  'Creature Feature':    { cover: IMAGE_BASE + 'scott-step4/themed-creature-feature.png', shape: 'LANDSCAPE' },

  // Latest folders
  'Netflix Latest':     { cover: 'https://ultramax.vip/images/quick/streaming_services__netflix__cover.webp',   shape: 'LANDSCAPE' },
  'Prime Latest':       { cover: 'https://ultramax.vip/images/quick/streaming_services__prime_video__cover.webp', shape: 'LANDSCAPE' },
  'Disney+ Latest':     { cover: 'https://ultramax.vip/images/quick/streaming_services__disney__cover.webp',     shape: 'LANDSCAPE' },
  'Apple TV+ Latest':   { cover: 'https://ultramax.vip/images/quick/streaming_services__apple_tv__cover.webp',   shape: 'LANDSCAPE' },
  'HBO Latest':         { cover: 'https://ultramax.vip/images/quick/streaming_services__hbo_max__cover.webp',    shape: 'LANDSCAPE' },
  'Paramount+ Latest':  { cover: 'https://ultramax.vip/images/quick/streaming_services__paramount__cover.webp', shape: 'LANDSCAPE' },
  'Hulu Latest':        { cover: 'https://ultramax.vip/images/quick/streaming_services__hulu__cover.webp',       shape: 'LANDSCAPE' },
  'Fresh Releases':     { cover: IMAGE_BASE + 'scott-defaults/new-releases.png',        gif: 'https://ultramax.vip/images/quick/trending_new__new_movies__gif.png', shape: 'LANDSCAPE' },
  'Airing Now':         { cover: IMAGE_BASE + 'scott-defaults/new-tv.png',        gif: 'https://ultramax.vip/images/quick/trending_new__new_series__gif.png', shape: 'LANDSCAPE' },
  'New Movies':         { cover: IMAGE_BASE + 'scott-defaults/new-releases.png',        gif: 'https://ultramax.vip/images/quick/trending_new__new_movies__gif.png', shape: 'LANDSCAPE' },
  'New TV':             { cover: IMAGE_BASE + 'scott-defaults/new-tv.png',        gif: 'https://ultramax.vip/images/quick/trending_new__new_series__gif.png', shape: 'LANDSCAPE' }
};

const TITLE_MEDIA_PRIORITY = new Set([
  'BBC One',
  'True Crime & Serial Killers'
]);

function applyFolderMedia(folder){
  if(Array.isArray(folder.rows)){
    folder.rows = folder.rows.map(normalizeCatalogId).filter(function(id, i, rows){
      return id && rows.indexOf(id) === i;
    });
  }
  const folderId = folder.id || folder.catalogId || (folder.rows && folder.rows[0]) || '';
  const titleMedia = FOLDER_MEDIA[folder.title];
  const media = TITLE_MEDIA_PRIORITY.has(folder.title)
    ? (titleMedia || FOLDER_IMAGE_OVERRIDES[folderId])
    : (FOLDER_IMAGE_OVERRIDES[folderId] || titleMedia);

  if(!media){
    return folder;
  }

  folder.coverImageUrl = media.cover || '';
  folder.focusGifUrl = media.gif || '';
  folder.focusGifEnabled = !!media.gif;
  folder.heroBackdropUrl = media.hero || '';
  folder.tileShape = media.shape || 'LANDSCAPE';
  return folder;
}

