function extractInfoHashFromMagnet(magnet){
  const m = String(magnet || "").match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/);
  return m ? m[1].toLowerCase() : null;
}

module.exports = {
  extractInfoHashFromMagnet
};
