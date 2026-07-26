const { extractInfoHashFromMagnet } = require("../utils/magnets");

async function jackettSearch(config, type, id){
  const resolver = config.streamResolver || {};
  const base = resolver.jackettUrl;
  const key = resolver.jackettApiKey;

  if(!base || !key) return [];

  const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

  try {
    const category = type === "series" ? "5000" : "2000";
    const url = `${base}/api/v2.0/indexers/${resolver.jackettIndexers || "all"}/results?apikey=${key}&Query=${encodeURIComponent(id)}&Category=${category}`;

    const resp = await fetch(url);
    if(!resp.ok) return [];

    const data = await resp.json();

    return (data.Results || [])
      .filter(r => r.MagnetUri)
      .slice(0, 30)
      .map(r => {
        const magnet = r.MagnetUri;
        return {
          title: r.Title,
          magnet,
          infoHash: extractInfoHashFromMagnet(magnet),
          size: r.Size || 0,
          seeders: r.Seeders || 0
        };
      })
      .filter(r => r.infoHash);

  } catch(e){
    console.log("JACKETT ERROR", e.message);
    return [];
  }
}

module.exports = {
  jackettSearch
};
