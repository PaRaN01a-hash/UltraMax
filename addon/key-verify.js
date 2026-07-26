const fetch = globalThis.fetch;
const PROVIDERS = {
  tmdb: async (key) => { const r = await fetch(`https://api.themoviedb.org/3/authentication`, { headers: { Authorization: `Bearer ${key}` } }); return r.ok; },
  mdblist: async (key) => { const r = await fetch(`https://api.mdblist.com/user?apikey=${key}`); return r.ok; },
  rpdb: async (key) => { const r = await fetch(`https://api.ratingposterdb.com/${key}/imdb/poster-default/tt0111161.jpg`, { method: "HEAD" }); return r.ok; },
  fanart: async (key) => { const r = await fetch(`https://webservice.fanart.tv/v3/movies/550?api_key=${key}`); return r.ok; },
  tp: async (key) => { const r = await fetch(`https://api.top-streaming.stream/${key}/imdb/poster-default/tt0111161.jpg`, { method: "HEAD" }); return r.ok; },
  omdb: async (key) => { const r = await fetch(`https://www.omdbapi.com/?apikey=${key}&i=tt0111161`); const d = await r.json(); return d && !d.Error; },
  gemini: async (key) => { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`); return r.ok; }
};
const MESSAGES = { tmdb:"TMDB key OK.", mdblist:"MDBList key OK.", rpdb:"RPDB key OK.", fanart:"Fanart.tv key OK.", tp:"Top Posters key OK.", omdb:"OMDb key OK.", gemini:"Gemini key OK." };
async function verifyHandler(req, res) {
  const provider = req.params.provider;
  const key = req.query.key || "";
  if (!key) return res.json({ valid: false, message: "No key provided." });
  if (!PROVIDERS[provider]) return res.status(404).json({ valid: false, message: "Unknown provider." });
  try {
    const valid = await PROVIDERS[provider](key);
    res.json({ valid, message: valid ? MESSAGES[provider] : `Could not verify ${provider} key.` });
  } catch (e) { res.json({ valid: false, message: "Verification failed." }); }
}
module.exports = { verifyHandler };
