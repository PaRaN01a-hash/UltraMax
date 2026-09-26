// Stream language preference controls.
// Order is meaningful: the first selected language has highest priority.
const UM_STREAM_LANGUAGE_OPTIONS = [
  ['en','🇬🇧','English'], ['it','🇮🇹','Italian'], ['es','🇪🇸','Spanish'],
  ['fr','🇫🇷','French'], ['de','🇩🇪','German'], ['pt','🇵🇹','Portuguese'],
  ['nl','🇳🇱','Dutch'], ['pl','🇵🇱','Polish'], ['tr','🇹🇷','Turkish'],
  ['ru','🇷🇺','Russian'], ['uk','🇺🇦','Ukrainian'], ['ja','🇯🇵','Japanese'],
  ['ko','🇰🇷','Korean'], ['zh','🇨🇳','Chinese'], ['ar','🇸🇦','Arabic'],
  ['hi','🇮🇳','Hindi'], ['sv','🇸🇪','Swedish'], ['no','🇳🇴','Norwegian'],
  ['da','🇩🇰','Danish'], ['fi','🇫🇮','Finnish'], ['cs','🇨🇿','Czech'],
  ['hu','🇭🇺','Hungarian'], ['ro','🇷🇴','Romanian'], ['el','🇬🇷','Greek'],
  ['he','🇮🇱','Hebrew'], ['id','🇮🇩','Indonesian'], ['th','🇹🇭','Thai'],
  ['vi','🇻🇳','Vietnamese']
];

let streamLanguagePriority = ['en'];

function normaliseStreamLanguageCodes(value){
  const allowed = new Set(UM_STREAM_LANGUAGE_OPTIONS.map(function(item){ return item[0]; }));
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set();
  const out = [];
  raw.forEach(function(item){
    const code = String(item || '').trim().toLowerCase().split('-')[0];
    if(!allowed.has(code) || seen.has(code)) return;
    seen.add(code);
    out.push(code);
  });
  return out.slice(0, 12);
}

function streamLanguageMeta(code){
  return UM_STREAM_LANGUAGE_OPTIONS.find(function(item){ return item[0] === code; }) || [code, '🌐', code];
}

function getStreamLanguagesFromForm(){
  return streamLanguagePriority.slice();
}

function getStreamLanguageModeFromForm(){
  const el = document.getElementById('streamLanguageMode');
  if(!streamLanguagePriority.length) return 'all';
  const value = el ? el.value : 'prefer';
  return value === 'only' || value === 'prefer' ? value : 'all';
}

function renderStreamLanguageControls(){
  const list = document.getElementById('streamLanguagePriorityList');
  const add = document.getElementById('streamLanguageAdd');
  const mode = document.getElementById('streamLanguageMode');
  const hint = document.getElementById('streamLanguageHint');

  if(list){
    if(!streamLanguagePriority.length){
      list.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px 0;">No priority languages selected.</div>';
    } else {
      list.innerHTML = streamLanguagePriority.map(function(code, index){
        const meta = streamLanguageMeta(code);
        const showMoveButtons = streamLanguagePriority.length > 1;
        const upDisabled = index === 0 ? ' disabled' : '';
        const downDisabled = index === streamLanguagePriority.length - 1 ? ' disabled' : '';
        const moveButtons = showMoveButtons
          ? '<button type="button" onclick="moveStreamLanguage(\'' + code + '\',-1)"' + upDisabled + ' aria-label="Move ' + meta[2] + ' up">↑</button>' +
            '<button type="button" onclick="moveStreamLanguage(\'' + code + '\',1)"' + downDisabled + ' aria-label="Move ' + meta[2] + ' down">↓</button>'
          : '';
        return '<div class="stream-language-row">' +
          '<span class="stream-language-position">' + (index + 1) + '</span>' +
          '<span style="font-size:18px;flex-shrink:0;">' + meta[1] + '</span>' +
          '<span class="stream-language-name">' + meta[2] + '</span>' +
          '<span class="stream-language-actions">' +
            moveButtons +
            '<button type="button" onclick="removeStreamLanguage(\'' + code + '\')" aria-label="Remove ' + meta[2] + '">×</button>' +
          '</span>' +
        '</div>';
      }).join('');
    }
  }

  if(add){
    const selected = new Set(streamLanguagePriority);
    add.innerHTML = '<option value="">Add language…</option>' +
      UM_STREAM_LANGUAGE_OPTIONS
        .filter(function(item){ return !selected.has(item[0]); })
        .map(function(item){ return '<option value="' + item[0] + '">' + item[1] + ' ' + item[2] + '</option>'; })
        .join('');
  }

  if(mode){
    mode.disabled = streamLanguagePriority.length === 0;
    if(!streamLanguagePriority.length) mode.value = 'all';
    else if(mode.value !== 'prefer' && mode.value !== 'only') mode.value = 'prefer';
  }

  if(hint){
    if(!streamLanguagePriority.length){
      hint.textContent = 'All stream languages are allowed. Unknown-language results are kept.';
    } else if(getStreamLanguageModeFromForm() === 'only'){
      hint.textContent = 'Selected languages are prioritised and known non-matching streams are removed. Unknown-language results are kept when an addon does not expose enough metadata.';
    } else {
      hint.textContent = 'Selected languages are moved to the top in this order. Other and unknown languages remain available.';
    }
  }
}

function addStreamLanguage(code){
  const normalised = normaliseStreamLanguageCodes([code])[0];
  if(normalised && streamLanguagePriority.indexOf(normalised) === -1){
    streamLanguagePriority.push(normalised);
    const mode = document.getElementById('streamLanguageMode');
    if(mode && mode.value === 'all') mode.value = 'prefer';
  }
  const add = document.getElementById('streamLanguageAdd');
  if(add) add.value = '';
  renderStreamLanguageControls();
}

function moveStreamLanguage(code, delta){
  const index = streamLanguagePriority.indexOf(code);
  const target = index + Number(delta || 0);
  if(index < 0 || target < 0 || target >= streamLanguagePriority.length) return;
  const copy = streamLanguagePriority.slice();
  const tmp = copy[index];
  copy[index] = copy[target];
  copy[target] = tmp;
  streamLanguagePriority = copy;
  renderStreamLanguageControls();
}

function removeStreamLanguage(code){
  streamLanguagePriority = streamLanguagePriority.filter(function(item){ return item !== code; });
  renderStreamLanguageControls();
}

function restoreStreamLanguageUI(languages, mode, legacyEnglishOnly){
  if(Array.isArray(languages)){
    streamLanguagePriority = normaliseStreamLanguageCodes(languages);
  } else {
    streamLanguagePriority = legacyEnglishOnly === false ? [] : ['en'];
  }

  const modeEl = document.getElementById('streamLanguageMode');
  if(modeEl){
    if(!streamLanguagePriority.length) modeEl.value = 'all';
    else modeEl.value = mode === 'only' || mode === 'prefer'
      ? mode
      : (legacyEnglishOnly === false ? 'prefer' : 'only');
  }

  renderStreamLanguageControls();
}

(function initStreamLanguageControls(){
  function init(){ renderStreamLanguageControls(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
