// Parses the freeform name/title/filename text that upstream stream addons
// (Comet, AIOStreams, etc.) return, pulls out the fields a user might want
// to display, and re-renders a stream's name/title according to the
// user's chosen preset, custom field list, or custom template.
//
// The "custom template" mode is Ultra MAX's answer to AIOStreams' custom
// formatter — a {field::modifier} template DSL, deliberately NOT raw
// JavaScript. A template is stored in configs.json and re-run on every
// stream request for that token, server-side, for every viewer of that
// addon — accepting arbitrary JS there would mean any token owner could
// execute arbitrary code on the shared server (read other tokens' API
// keys, hit internal services, etc.). The DSL below is a closed grammar:
// a fixed field whitelist, a fixed modifier whitelist, regex-based
// parsing, no eval/Function/vm. It cannot do anything its author didn't
// explicitly implement.

const PRESETS = {
  minimal: ["resolution"],
  compact: ["resolution", "size", "source"],
  detailed: ["title", "resolution", "source", "codec", "audio", "size", "seeders"]
};

const FIELD_KEYS = ["title", "resolution", "size", "source", "codec", "audio", "seeders", "provider"];

// Fields available to the custom field-list AND the template engine.
// sizeBytes/seedersNum are numeric variants for template comparators
// (e.g. {sizeBytes::>5000000000[...]}) and aren't shown in the field-list UI.
const TEMPLATE_FIELD_KEYS = FIELD_KEYS.concat(["sizeBytes", "seedersNum"]);

const FIELD_ICONS = {
  title: "📄",
  resolution: "📺",
  size: "💾",
  source: "🎞️",
  codec: "🎛️",
  audio: "🔊",
  seeders: "👤",
  provider: "⚙️"
};

const TEMPLATE_MAX_LENGTH = 500;

function formatBytes(bytes) {
  if (!bytes || !Number.isFinite(bytes)) return null;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function firstMatch(text, patterns) {
  for (const [re, label] of patterns) {
    if (re.test(text)) return label;
  }
  return null;
}

function extractStreamFields(stream, addonName) {
  const rawName = String(stream.name || "");
  const rawTitle = String(stream.title || stream.description || "");
  const filename = String((stream.behaviorHints && stream.behaviorHints.filename) || "");
  const text = `${rawName}\n${rawTitle}\n${filename}`;

  const resolution = firstMatch(text, [
    [/2160p|4k|uhd/i, "4K"],
    [/1080p/i, "1080p"],
    [/720p/i, "720p"],
    [/480p/i, "480p"]
  ]);

  const sizeBytes = Number((stream.behaviorHints && stream.behaviorHints.videoSize) || 0);
  const sizeMatch = text.match(/([\d.]+\s?(?:GB|MB))/i);
  const size = formatBytes(sizeBytes) || (sizeMatch ? sizeMatch[1] : null);

  const codec = firstMatch(text, [
    [/hevc|x265|h\.?265/i, "HEVC"],
    [/avc|x264|h\.?264/i, "H.264"],
    [/av1/i, "AV1"]
  ]);

  const audio = firstMatch(text, [
    [/atmos/i, "Atmos"],
    [/ddp5\.1|dd\+5\.1|eac3/i, "DDP5.1"],
    [/dd5\.1|ac3/i, "DD5.1"],
    [/dts-hd|dts/i, "DTS"],
    [/aac/i, "AAC"]
  ]);

  const source = firstMatch(text, [
    [/remux/i, "REMUX"],
    [/bluray|blu-ray/i, "BluRay"],
    [/web-?dl/i, "WEB-DL"],
    [/webrip/i, "WEBRip"],
    [/hdrip/i, "HDRip"],
    [/\bcam\b|\bts\b|telesync/i, "CAM"]
  ]);

  const seedersMatch = text.match(/👤\s?(\d+)/) || text.match(/(\d+)\s?seeds?\b/i);
  const seeders = seedersMatch ? seedersMatch[1] : null;

  return {
    title: filename || rawTitle || rawName || null,
    resolution,
    size,
    codec,
    audio,
    source,
    seeders,
    provider: addonName || null,
    sizeBytes: sizeBytes || 0,
    seedersNum: seeders ? Number(seeders) || 0 : 0
  };
}

// ── Safe template engine ──────────────────────────────────────────────
// Grammar (all via regex substitution, no code execution):
//   {field}                              → plain interpolation
//   {field::upper} {field::lower}        → case modifiers
//   {field::truncate(20)}                → cap length, append "…"
//   {field::cond["true text"||"false"]}  → ternary; cond is one of:
//       (empty)   → truthy check
//       =value    → case-insensitive equals
//       ~value    → case-insensitive contains
//       >N <N >=N <=N → numeric compare (for sizeBytes/seedersNum)
//   {? ...text with {field} refs... ?}   → whole block is dropped if every
//                                           field referenced inside is empty

function getFieldValue(fields, name) {
  if (!TEMPLATE_FIELD_KEYS.includes(name)) return "";
  const v = fields[name];
  return v === null || v === undefined ? "" : v;
}

function applyModifier(value, modName, arg) {
  switch (modName) {
    case "upper": return String(value).toUpperCase();
    case "lower": return String(value).toLowerCase();
    case "truncate": {
      const n = parseInt(arg, 10);
      const s = String(value);
      if (!Number.isFinite(n) || s.length <= n) return s;
      return s.slice(0, n) + "…";
    }
    default: return value; // unknown modifier: safe no-op, not an error
  }
}

function evalComparator(fields, fieldName, cond) {
  const raw = getFieldValue(fields, fieldName);
  if (!cond) return !!raw && raw !== "0";

  const eq = cond.match(/^=(.*)$/);
  if (eq) return String(raw).toLowerCase() === eq[1].toLowerCase();

  const contains = cond.match(/^~(.*)$/);
  if (contains) return String(raw).toLowerCase().includes(contains[1].toLowerCase());

  const num = cond.match(/^(>=|<=|>|<)([\d.]+)$/);
  if (num) {
    const value = parseFloat(raw);
    const target = parseFloat(num[2]);
    if (!Number.isFinite(value)) return false;
    switch (num[1]) {
      case ">": return value > target;
      case "<": return value < target;
      case ">=": return value >= target;
      case "<=": return value <= target;
    }
  }

  return !!raw;
}

function interpolateSimple(text, fields) {
  return String(text).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, field) => String(getFieldValue(fields, field)));
}

function renderCustomTemplate(template, fields) {
  if (!template) return "";
  let out = String(template).slice(0, TEMPLATE_MAX_LENGTH);

  // 1. Optional groups {? ... ?} — dropped entirely if every field ref inside is empty.
  out = out.replace(/\{\?([\s\S]*?)\?\}/g, (_, inner) => {
    const refs = Array.from(inner.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)/g)).map(m => m[1]);
    const hasAny = refs.some(name => !!getFieldValue(fields, name));
    if (refs.length && !hasAny) return "";
    return interpolateSimple(inner, fields);
  });

  // 2. Ternary conditionals {field::cond["true"||"false"]}
  out = out.replace(
    /\{([a-zA-Z_][a-zA-Z0-9_]*)::([^\[\]{}]*)\["((?:[^"\\]|\\.)*)"\|\|"((?:[^"\\]|\\.)*)"\]\}/g,
    (_, field, cond, trueText, falseText) => {
      const truthy = evalComparator(fields, field, cond.trim());
      return interpolateSimple(truthy ? trueText : falseText, fields);
    }
  );

  // 3. Modifier chains {field::mod1::mod2(arg)}
  out = out.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)((?:::[a-zA-Z]+(?:\([^()]*\))?)*)\}/g, (_, field, mods) => {
    let value = getFieldValue(fields, field);
    if (mods) {
      for (const part of mods.split("::").filter(Boolean)) {
        const m = part.match(/^([a-zA-Z]+)(?:\(([^()]*)\))?$/);
        if (m) value = applyModifier(value, m[1], m[2]);
      }
    }
    return String(value);
  });

  // 4. Any remaining plain {field}
  out = interpolateSimple(out, fields);

  return out;
}

function sanitizeStreamFormat(sf) {
  if (!sf || typeof sf !== "object") return null;

  if (sf.mode === "custom") {
    const fields = Array.isArray(sf.fields)
      ? sf.fields.filter(f => FIELD_KEYS.includes(f)).slice(0, FIELD_KEYS.length)
      : [];
    if (!fields.length) return null;
    return { mode: "custom", fields };
  }

  if (sf.mode === "template") {
    const nameTemplate = typeof sf.nameTemplate === "string" ? sf.nameTemplate.slice(0, TEMPLATE_MAX_LENGTH) : "";
    const titleTemplate = typeof sf.titleTemplate === "string" ? sf.titleTemplate.slice(0, TEMPLATE_MAX_LENGTH) : "";
    if (!nameTemplate && !titleTemplate) return null;
    return { mode: "template", nameTemplate, titleTemplate };
  }

  const preset = Object.prototype.hasOwnProperty.call(PRESETS, sf.preset) ? sf.preset : "compact";
  return { mode: "preset", preset };
}

function applyStreamFormat(stream, formatConfig, addonName) {
  const clean = sanitizeStreamFormat(formatConfig);
  if (!clean) return stream;

  const extracted = extractStreamFields(stream, addonName);

  if (clean.mode === "template") {
    const name = renderCustomTemplate(clean.nameTemplate, extracted).trim();
    const title = renderCustomTemplate(clean.titleTemplate, extracted).trim();
    if (!name && !title) return stream;
    return {
      ...stream,
      ...(name ? { name } : {}),
      ...(title ? { title } : {})
    };
  }

  const fieldKeys = clean.mode === "custom" ? clean.fields : PRESETS[clean.preset];
  if (!fieldKeys || !fieldKeys.length) return stream;

  const parts = fieldKeys
    .map(key => {
      const value = extracted[key];
      if (!value) return null;
      return key === "title" ? value : `${FIELD_ICONS[key]} ${value}`;
    })
    .filter(Boolean);

  if (!parts.length) return stream;

  const nameBadge = ["⚡ Ultra MAX", extracted.resolution].filter(Boolean).join(" ");

  return {
    ...stream,
    name: nameBadge,
    title: parts.join("\n")
  };
}

module.exports = {
  PRESETS,
  FIELD_KEYS,
  TEMPLATE_FIELD_KEYS,
  extractStreamFields,
  renderCustomTemplate,
  sanitizeStreamFormat,
  applyStreamFormat
};
