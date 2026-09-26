// ── Content Filters (anime / Indian cinema / category exclusions / rating / votes / year / country) ──
let animeFilterValue = 'allow';
let indianCinemaFilterValue = 'allow';

const contentExclusionFields = [
  { id: 'cfExcludeTalk', key: 'talk' }
];

function setAnimeFilterValue(value){
  animeFilterValue = ['allow','reduce','hide'].includes(value) ? value : 'allow';
  document.querySelectorAll('#animeFilterPills .pill').forEach(function(p){
    p.classList.toggle('selected', p.getAttribute('data-value') === animeFilterValue);
  });
}

function setIndianCinemaFilterValue(value){
  indianCinemaFilterValue = value === 'hide' ? 'hide' : 'allow';
  document.querySelectorAll('#indianCinemaFilterPills .pill').forEach(function(p){
    p.classList.toggle('selected', p.getAttribute('data-value') === indianCinemaFilterValue);
  });
}

function getContentExclusionValues(){
  return contentExclusionFields
    .filter(function(field){
      const el = document.getElementById(field.id);
      return !!(el && el.checked);
    })
    .map(function(field){ return field.key; });
}

function setContentExclusionValues(values){
  const enabled = new Set(
    Array.isArray(values)
      ? values.map(function(value){ return String(value || '').trim().toLowerCase(); })
      : []
  );

  contentExclusionFields.forEach(function(field){
    const el = document.getElementById(field.id);
    if(el) el.checked = enabled.has(field.key);
  });
}

function getContentFilterFields(){
  return {
    animeFilter: animeFilterValue,
    indianCinemaFilter: indianCinemaFilterValue,
    contentExclusions: getContentExclusionValues(),
    minRating: Number((document.getElementById('cfMinRating')||{}).value) || 0,
    minVotes: Number((document.getElementById('cfMinVotes')||{}).value) || 0,
    minYear: Number((document.getElementById('cfMinYear')||{}).value) || 0,
    maxYear: Number((document.getElementById('cfMaxYear')||{}).value) || 0,
    excludeCountries: ((document.getElementById('cfExcludeCountries')||{}).value || '')
      .split(',').map(function(s){ return s.trim().toUpperCase(); }).filter(Boolean)
  };
}

function setContentFilterFields(data){
  data = data || {};
  setAnimeFilterValue(data.animeFilter || 'allow');
  setIndianCinemaFilterValue(data.indianCinemaFilter || 'allow');
  setContentExclusionValues(data.contentExclusions);
  const minRatingEl = document.getElementById('cfMinRating'); if(minRatingEl) minRatingEl.value = data.minRating || 0;
  const minVotesEl = document.getElementById('cfMinVotes'); if(minVotesEl) minVotesEl.value = data.minVotes || 0;
  const minYearEl = document.getElementById('cfMinYear'); if(minYearEl) minYearEl.value = data.minYear || '';
  const maxYearEl = document.getElementById('cfMaxYear'); if(maxYearEl) maxYearEl.value = data.maxYear || '';
  const excludeCountriesEl = document.getElementById('cfExcludeCountries');
  if(excludeCountriesEl) excludeCountriesEl.value = Array.isArray(data.excludeCountries) ? data.excludeCountries.join(', ') : '';
}
