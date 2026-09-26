// ── STREAM DISPLAY FORMATTER ──
// Mirrors services/stream-formatter.js on the backend so the preview shown
// here matches what the bridge will actually render. Kept intentionally
// small — it only needs to render one sample stream, not parse real ones.
const SF_PRESETS = {
  minimal: ['resolution'],
  compact: ['resolution', 'size', 'source'],
  detailed: ['title', 'resolution', 'source', 'codec', 'languages', 'audio', 'size', 'seeders']
};
const SF_FIELD_META = [
  { key: 'title', icon: '📄', label: 'Title / filename' },
  { key: 'resolution', icon: '📺', label: 'Resolution' },
  { key: 'size', icon: '💾', label: 'File size' },
  { key: 'bitrate', icon: '📶', label: 'Bitrate' },
  { key: 'source', icon: '🎞️', label: 'Source (BluRay/WEB-DL/…)' },
  { key: 'codec', icon: '🎛️', label: 'Codec' },
  { key: 'languages', icon: '🌐', label: 'Languages' },
  { key: 'audio', icon: '🔊', label: 'Audio' },
  { key: 'seeders', icon: '👤', label: 'Seeders' },
  { key: 'provider', icon: '⚙️', label: 'Provider' }
];
const SF_SAMPLE_FIELDS = {
  title: 'Movie.Name.2026.2160p.BluRay.x265-GROUP.mkv',
  resolution: '4K',
  size: '18 GB',
  sizeBytes: 19327352832,
  bitrate: '24 Mbps',
  bitrateMbps: 24,
  source: 'BluRay',
  codec: 'HEVC',
  languages: 'Italian · English',
  language: 'Italian',
  languageEmoji: '🇮🇹 🇬🇧',
  audio: 'DDP5.1',
  seeders: '142',
  seedersNum: 142,
  provider: 'Ultra MAX'
};
const SF_TEMPLATE_FIELD_KEYS = SF_FIELD_META.map(f => f.key).concat(['language', 'languageEmoji', 'sizeBytes', 'bitrateMbps', 'seedersNum']);

let streamFormatState = { mode: 'off', preset: 'compact', fields: SF_FIELD_META.map(f => f.key) };
let streamFormatSortable = null;

function getStreamFormatFromForm(){
  if (streamFormatState.mode === 'off') return null;
  if (streamFormatState.mode === 'custom') {
    const rows = Array.from(document.querySelectorAll('#streamFormatFieldList .sf-field-row'));
    const fields = rows
      .filter(r => r.querySelector('input[type=checkbox]').checked)
      .map(r => r.dataset.field);
    if (!fields.length) return null;
    return { mode: 'custom', fields };
  }
  if (streamFormatState.mode === 'template') {
    const nameTemplate = (document.getElementById('streamFormatNameTemplate') || {}).value || '';
    const titleTemplate = (document.getElementById('streamFormatTitleTemplate') || {}).value || '';
    if (!nameTemplate.trim() && !titleTemplate.trim()) return null;
    return { mode: 'template', nameTemplate: nameTemplate.slice(0, 500), titleTemplate: titleTemplate.slice(0, 500) };
  }
  return { mode: 'preset', preset: streamFormatState.preset };
}

// ── Client-side mirror of the server's safe template engine ──
// (services/stream-formatter.js renderCustomTemplate) — used only to
// render the live preview here; the server independently re-parses and
// re-validates every template it stores or runs, so this copy being
// slightly out of sync would only ever affect the preview, never safety.
function sfGetFieldValue(fields, name){
  if (SF_TEMPLATE_FIELD_KEYS.indexOf(name) === -1) return '';
  const v = fields[name];
  return (v === null || v === undefined) ? '' : v;
}
function sfApplyModifier(value, modName, arg){
  if (modName === 'upper') return String(value).toUpperCase();
  if (modName === 'lower') return String(value).toLowerCase();
  if (modName === 'truncate') {
    const n = parseInt(arg, 10);
    const s = String(value);
    if (!isFinite(n) || s.length <= n) return s;
    return s.slice(0, n) + '…';
  }
  return value;
}
function sfEvalComparator(fields, fieldName, cond){
  const raw = sfGetFieldValue(fields, fieldName);
  if (!cond) return !!raw && raw !== '0';
  let m = cond.match(/^=(.*)$/);
  if (m) return String(raw).toLowerCase() === m[1].toLowerCase();
  m = cond.match(/^~(.*)$/);
  if (m) return String(raw).toLowerCase().indexOf(m[1].toLowerCase()) !== -1;
  m = cond.match(/^(>=|<=|>|<)([\d.]+)$/);
  if (m) {
    const value = parseFloat(raw), target = parseFloat(m[2]);
    if (!isFinite(value)) return false;
    if (m[1] === '>') return value > target;
    if (m[1] === '<') return value < target;
    if (m[1] === '>=') return value >= target;
    if (m[1] === '<=') return value <= target;
  }
  return !!raw;
}
function sfInterpolateSimple(text, fields){
  return String(text).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, function(_, field){ return String(sfGetFieldValue(fields, field)); });
}
function sfRenderCustomTemplate(template, fields){
  if (!template) return '';
  let out = String(template).slice(0, 500);
  out = out.replace(/\{\?([\s\S]*?)\?\}/g, function(_, inner){
    const refs = []; let m; const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)/g;
    while ((m = re.exec(inner))) refs.push(m[1]);
    const hasAny = refs.some(function(name){ return !!sfGetFieldValue(fields, name); });
    if (refs.length && !hasAny) return '';
    return sfInterpolateSimple(inner, fields);
  });
  out = out.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)::([^\[\]{}]*)\["((?:[^"\\]|\\.)*)"\|\|"((?:[^"\\]|\\.)*)"\]\}/g,
    function(_, field, cond, trueText, falseText){
      const truthy = sfEvalComparator(fields, field, cond.trim());
      return sfInterpolateSimple(truthy ? trueText : falseText, fields);
    });
  out = out.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)((?:::[a-zA-Z]+(?:\([^()]*\))?)*)\}/g, function(_, field, mods){
    let value = sfGetFieldValue(fields, field);
    if (mods) {
      mods.split('::').filter(Boolean).forEach(function(part){
        const m = part.match(/^([a-zA-Z]+)(?:\(([^()]*)\))?$/);
        if (m) value = sfApplyModifier(value, m[1], m[2]);
      });
    }
    return String(value);
  });
  return sfInterpolateSimple(out, fields);
}

function toggleStreamFormatCheatsheet(){
  const el = document.getElementById('streamFormatCheatsheet');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function renderStreamFormatFieldList(){
  const list = document.getElementById('streamFormatFieldList');
  if (!list) return;
  const order = streamFormatState.fields && streamFormatState.fields.length
    ? streamFormatState.fields.concat(SF_FIELD_META.map(f => f.key).filter(k => !streamFormatState.fields.includes(k)))
    : SF_FIELD_META.map(f => f.key);
  const enabled = new Set(streamFormatState.mode === 'custom' && streamFormatState.customEnabled ? streamFormatState.customEnabled : order);

  list.innerHTML = order.map(function(key){
    const meta = SF_FIELD_META.find(f => f.key === key);
    if (!meta) return '';
    const checked = enabled.has(key) ? 'checked' : '';
    return '<div class="sf-field-row" data-field="' + key + '">' +
      '<span class="sf-field-drag">⠿</span>' +
      '<input type="checkbox" ' + checked + ' onchange="renderStreamFormatPreview()">' +
      '<span class="sf-field-label">' + meta.icon + ' ' + meta.label + '</span>' +
    '</div>';
  }).join('');

  if (streamFormatSortable) { streamFormatSortable.destroy(); streamFormatSortable = null; }
  if (window.Sortable) {
    streamFormatSortable = Sortable.create(list, {
      animation: 150,
      ghostClass: 'sf-ghost',
      handle: '.sf-field-drag',
      onEnd: renderStreamFormatPreview
    });
  }
}

function renderStreamFormatPreview(){
  const previewEl = document.getElementById('streamFormatPreview');
  if (!previewEl) return;

  const preserveSource =
    !!(document.getElementById('preserveStreamSourceBranding') || {}).checked;

  const previewName = preserveSource
    ? 'Comet 4K'
    : '⚡ Ultra MAX 4K';

  let fieldKeys;
  if (streamFormatState.mode === 'off') {
    previewEl.textContent =
      previewName + '\nMovie.Name.2026.2160p.BluRay.x265-GROUP.mkv';
    return;
  }
  if (streamFormatState.mode === 'template') {
    const nameTemplate = (document.getElementById('streamFormatNameTemplate') || {}).value || '';
    const titleTemplate = (document.getElementById('streamFormatTitleTemplate') || {}).value || '';
    const name = sfRenderCustomTemplate(nameTemplate, SF_SAMPLE_FIELDS).trim();
    const title = sfRenderCustomTemplate(titleTemplate, SF_SAMPLE_FIELDS).trim();
    previewEl.textContent = (name || '(name unchanged)') + '\n' + (title || '(title unchanged)');
    return;
  }
  if (streamFormatState.mode === 'custom') {
    const rows = Array.from(document.querySelectorAll('#streamFormatFieldList .sf-field-row'));
    fieldKeys = rows.filter(r => r.querySelector('input[type=checkbox]').checked).map(r => r.dataset.field);
  } else {
    fieldKeys = SF_PRESETS[streamFormatState.preset] || SF_PRESETS.compact;
  }

  const parts = fieldKeys.map(function(key){
    const meta = SF_FIELD_META.find(f => f.key === key);
    const value = SF_SAMPLE_FIELDS[key];
    if (!meta || !value) return null;
    return key === 'title' ? value : meta.icon + ' ' + value;
  }).filter(Boolean);

  previewEl.textContent = parts.length
    ? (
        (preserveSource
          ? 'Comet'
          : '⚡ Ultra MAX'
        ) +
        ' ' +
        SF_SAMPLE_FIELDS.resolution +
        '\n' +
        parts.join('\n')
      )
    : '(pick at least one field)';
}

function selectStreamFormatPreset(key){
  streamFormatState.mode = (key === 'custom' || key === 'off' || key === 'template') ? key : 'preset';
  if (streamFormatState.mode === 'preset') streamFormatState.preset = key;

  document.querySelectorAll('#streamFormatPresets .sf-preset-btn').forEach(function(btn){
    btn.classList.toggle('sf-active', btn.dataset.preset === key);
  });

  const customEditor = document.getElementById('streamFormatCustomEditor');
  if (customEditor) customEditor.style.display = key === 'custom' ? 'block' : 'none';
  if (key === 'custom') renderStreamFormatFieldList();

  const codeEditor = document.getElementById('streamFormatCodeEditor');
  if (codeEditor) codeEditor.style.display = key === 'template' ? 'block' : 'none';

  renderStreamFormatPreview();
}

function restoreStreamFormatUI(streamFormat){
  if (!streamFormat || !streamFormat.mode) {
    streamFormatState = { mode: 'off', preset: 'compact', fields: SF_FIELD_META.map(f => f.key) };
    selectStreamFormatPreset('off');
    return;
  }
  if (streamFormat.mode === 'template') {
    const nameEl = document.getElementById('streamFormatNameTemplate');
    const titleEl = document.getElementById('streamFormatTitleTemplate');
    if (nameEl) nameEl.value = streamFormat.nameTemplate || '';
    if (titleEl) titleEl.value = streamFormat.titleTemplate || '';
    selectStreamFormatPreset('template');
  } else if (streamFormat.mode === 'custom' && Array.isArray(streamFormat.fields)) {
    streamFormatState.fields = streamFormat.fields;
    streamFormatState.customEnabled = streamFormat.fields.slice();
    selectStreamFormatPreset('custom');
  } else {
    streamFormatState.preset = streamFormat.preset || 'compact';
    selectStreamFormatPreset(streamFormatState.preset);
  }
}

(function initStreamFormatDefault(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ selectStreamFormatPreset('off'); });
  } else {
    selectStreamFormatPreset('off');
  }
})();
