"use strict";

const LANGUAGE_DEFS = [
  { code: "en", label: "English", emoji: "🇬🇧", aliases: ["english", "eng"] },
  { code: "it", label: "Italian", emoji: "🇮🇹", aliases: ["italian", "italiano", "ita"] },
  { code: "es", label: "Spanish", emoji: "🇪🇸", aliases: ["spanish", "espanol", "español", "castellano", "spa"] },
  { code: "fr", label: "French", emoji: "🇫🇷", aliases: ["french", "fra", "fre"] },
  { code: "de", label: "German", emoji: "🇩🇪", aliases: ["german", "deu", "ger"] },
  { code: "pt", label: "Portuguese", emoji: "🇵🇹", aliases: ["portuguese", "por", "pt-br", "pt-pt"] },
  { code: "nl", label: "Dutch", emoji: "🇳🇱", aliases: ["dutch", "nld", "dut"] },
  { code: "pl", label: "Polish", emoji: "🇵🇱", aliases: ["polish", "pol"] },
  { code: "tr", label: "Turkish", emoji: "🇹🇷", aliases: ["turkish", "tur"] },
  { code: "ru", label: "Russian", emoji: "🇷🇺", aliases: ["russian", "rus"] },
  { code: "uk", label: "Ukrainian", emoji: "🇺🇦", aliases: ["ukrainian", "ukr"] },
  { code: "ja", label: "Japanese", emoji: "🇯🇵", aliases: ["japanese", "jpn"] },
  { code: "ko", label: "Korean", emoji: "🇰🇷", aliases: ["korean", "kor"] },
  { code: "zh", label: "Chinese", emoji: "🇨🇳", aliases: ["chinese", "mandarin", "cantonese", "zho", "chi"] },
  { code: "ar", label: "Arabic", emoji: "🇸🇦", aliases: ["arabic", "ara"] },
  { code: "hi", label: "Hindi", emoji: "🇮🇳", aliases: ["hindi", "hin"] },
  { code: "sv", label: "Swedish", emoji: "🇸🇪", aliases: ["swedish", "swe"] },
  { code: "no", label: "Norwegian", emoji: "🇳🇴", aliases: ["norwegian", "nor"] },
  { code: "da", label: "Danish", emoji: "🇩🇰", aliases: ["danish", "dan"] },
  { code: "fi", label: "Finnish", emoji: "🇫🇮", aliases: ["finnish", "fin"] },
  { code: "cs", label: "Czech", emoji: "🇨🇿", aliases: ["czech", "ces", "cze"] },
  { code: "hu", label: "Hungarian", emoji: "🇭🇺", aliases: ["hungarian", "hun"] },
  { code: "ro", label: "Romanian", emoji: "🇷🇴", aliases: ["romanian", "ron", "rum"] },
  { code: "el", label: "Greek", emoji: "🇬🇷", aliases: ["greek", "ell", "gre"] },
  { code: "he", label: "Hebrew", emoji: "🇮🇱", aliases: ["hebrew", "heb"] },
  { code: "id", label: "Indonesian", emoji: "🇮🇩", aliases: ["indonesian", "ind"] },
  { code: "th", label: "Thai", emoji: "🇹🇭", aliases: ["thai", "tha"] },
  { code: "vi", label: "Vietnamese", emoji: "🇻🇳", aliases: ["vietnamese", "vie"] }
];

const LANGUAGE_BY_CODE = new Map(LANGUAGE_DEFS.map(item => [item.code, item]));
const LANGUAGE_ALIAS_TO_CODE = new Map();

for (const item of LANGUAGE_DEFS) {
  LANGUAGE_ALIAS_TO_CODE.set(item.code, item.code);
  LANGUAGE_ALIAS_TO_CODE.set(item.label.toLowerCase(), item.code);
  for (const alias of item.aliases) LANGUAGE_ALIAS_TO_CODE.set(alias.toLowerCase(), item.code);
}

function normalizeStreamLanguageCode(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (!raw) return null;
  const emojiMatch = LANGUAGE_DEFS.find(item => item.emoji === raw);
  if (emojiMatch) return emojiMatch.code;
  if (LANGUAGE_ALIAS_TO_CODE.has(raw)) return LANGUAGE_ALIAS_TO_CODE.get(raw);
  const base = raw.split("-")[0];
  if (LANGUAGE_BY_CODE.has(base)) return base;
  return null;
}

function normalizeStreamLanguages(value) {
  const raw = Array.isArray(value)
    ? value
    : (typeof value === "string" ? value.split(/[\s,;|]+/) : []);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const code = normalizeStreamLanguageCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeStreamLanguageMode(value, languages = []) {
  if (!languages.length) return "all";
  return value === "only" || value === "prefer" ? value : "prefer";
}

function resolveStreamLanguageSettings(config = {}) {
  const hasNewSettings =
    Array.isArray(config.streamLanguages) ||
    typeof config.streamLanguageMode === "string";

  if (!hasNewSettings) {
    return config.debridEnglishOnly !== false
      ? { languages: ["en"], mode: "only", legacy: true }
      : { languages: [], mode: "all", legacy: true };
  }

  const languages = normalizeStreamLanguages(config.streamLanguages);
  return {
    languages,
    mode: normalizeStreamLanguageMode(config.streamLanguageMode, languages),
    legacy: false
  };
}

function appendStructuredLanguageValues(target, value) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) appendStructuredLanguageValues(target, item);
    return;
  }
  if (typeof value === "object") {
    for (const key of ["code", "language", "lang", "iso639_1", "iso_639_1", "name"]) {
      if (value[key]) appendStructuredLanguageValues(target, value[key]);
    }
    return;
  }
  const text = String(value || "").trim();
  if (!text) return;

  for (const def of LANGUAGE_DEFS) {
    if (text.includes(def.emoji)) target.push(def.code);
  }

  for (const part of text.split(/[\s,;|/+]+/)) {
    const code = normalizeStreamLanguageCode(part);
    if (code) target.push(code);
  }
}

function textHasAlias(text, alias) {
  const escaped = alias.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^A-Za-z])" + escaped + "([^A-Za-z]|$)", "i").test(text);
}

function detectStreamLanguages(stream = {}) {
  const hints = stream.behaviorHints || {};
  const structured = [];
  for (const value of [
    stream.language,
    stream.languages,
    stream.audioLanguage,
    stream.audioLanguages,
    stream.languageEmoji,
    stream.languageEmojis,
    hints.language,
    hints.languages,
    hints.audioLanguage,
    hints.audioLanguages
  ]) {
    appendStructuredLanguageValues(structured, value);
  }

  const found = [];
  const seen = new Set();
  const add = code => {
    if (code && !seen.has(code)) {
      seen.add(code);
      found.push(code);
    }
  };
  structured.forEach(add);

  const text = [stream.name, stream.title, stream.description, hints.filename]
    .map(value => String(value || ""))
    .filter(Boolean)
    .join("\n");

  for (const def of LANGUAGE_DEFS) {
    if (text.includes(def.emoji)) {
      add(def.code);
      continue;
    }
    if (def.aliases.some(alias => textHasAlias(text, alias))) add(def.code);
  }
  return found;
}

function getLanguageDefinition(code) {
  return LANGUAGE_BY_CODE.get(normalizeStreamLanguageCode(code)) || null;
}

function describeStreamLanguages(codes = []) {
  const normalized = normalizeStreamLanguages(codes);
  const defs = normalized.map(code => LANGUAGE_BY_CODE.get(code)).filter(Boolean);
  return {
    codes: normalized,
    language: defs[0] ? defs[0].label : null,
    languages: defs.length ? defs.map(item => item.label).join(" · ") : null,
    languageEmoji: defs.length ? defs.map(item => item.emoji).join(" ") : null
  };
}

function languagePreferenceRank(stream, preferred = []) {
  const order = normalizeStreamLanguages(preferred);
  if (!order.length) return Number.MAX_SAFE_INTEGER;
  const detected = detectStreamLanguages(stream);
  let best = Number.MAX_SAFE_INTEGER;
  for (const code of detected) {
    const index = order.indexOf(code);
    if (index !== -1 && index < best) best = index;
  }
  return best;
}

module.exports = {
  LANGUAGE_DEFS,
  normalizeStreamLanguageCode,
  normalizeStreamLanguages,
  normalizeStreamLanguageMode,
  resolveStreamLanguageSettings,
  detectStreamLanguages,
  describeStreamLanguages,
  getLanguageDefinition,
  languagePreferenceRank
};
