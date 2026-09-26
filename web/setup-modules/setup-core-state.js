const BASE_URL = window.location.origin;
const API_BASE = window.location.origin;
const DISPLAY_URL = window.location.origin;
  const MAX_COLLECTION_FOLDERS = 8;
let selected = new Set();
let editToken = null;
let currentStep = 1;
var premiumizeLibraryConnected = false;
var premiumizeLibraryPersisted = false;
var premiumizeDisconnectRequested = false;
var PREMIUMIZE_LIBRARY_IDS = ['premiumize_movies','premiumize_series'];
var torboxLibraryConnected = false;
var torboxLibraryPersisted = false;
var torboxDisconnectRequested = false;
var TORBOX_LIBRARY_IDS = ['torbox_movies','torbox_series'];

function cloudLibraryRenderSummary(){
  var summary = document.getElementById('cloudLibrarySummary');
  var count = (premiumizeLibraryConnected ? 1 : 0) + (torboxLibraryConnected ? 1 : 0);
  if(summary) summary.textContent = count === 0 ? 'None connected' : (count === 1 ? '1 connected' : '2 connected');
  if(window.UltraMaxStep1PlayReady && typeof window.UltraMaxStep1PlayReady.update === 'function'){
    setTimeout(function(){ window.UltraMaxStep1PlayReady.update(); }, 0);
  }
}

// Cloud Library provider actions live in premiumize-library.js and torbox-library.js



// Shared wizard-context bridge lives in /setup-modules/wizard-context-bridge.js



// Discovery provider capability logic lives in /setup-modules/discovery-providers.js

const PRESETS = {
  quickpicks: [
    'quick_trending_movies','quick_trending_series',
    'quick_netflix_movies','quick_netflix_series',
    'quick_prime_movies','quick_prime_series',
    'quick_disney_movies','quick_disney_series',
    'quick_apple_movies','quick_apple_series'
  ],
  lite: ['trending_movies','trending_series','popular_movies','popular_series','now_movies','airing_series','netflix_movies','netflix_series','amazon_movies','amazon_series','disney_movies','disney_series','mdb_88328','mdb_86751'],
  casual: ['trending_movies','trending_series','mdb_2236','popular_movies','popular_series','top_movies','top_series','now_movies','airing_series','action_movies','action_series','comedy_movies','comedy_series','horror_movies','drama_movies','drama_series','scifi_movies','mdb_87667','mdb_960','mdb_69'],
  binge: ['trending_movies','trending_series','mdb_2236','popular_movies','popular_series','top_movies','top_series','now_movies','airing_series','ontheair_series','mdb_87667','mdb_88434','mdb_2236','mdb_1198','mdb_69','mdb_86934','mdb_960','mdb_1176','mdb_86710','netflix_movies','netflix_series','amazon_movies','amazon_series','disney_movies','disney_series','hbo_movies','hbo_series','apple_movies','apple_series','action_movies','action_series','comedy_movies','comedy_series','horror_movies','horror_series','scifi_movies','scifi_series','thriller_movies','thriller_series','crime_movies','crime_series','drama_movies','drama_series','romance_movies','mystery_movies','animation_movies','animation_series','documentary_movies','mdb_3892','mdb_3920','mdb_2909','mdb_3885','mdb_136620','theme_superhero','theme_heist','theme_zombie','studio_marvel','studio_dc','studio_a24','mdb_92337','mdb_91304','mdb_91303']
};



const hidden = new Set();
