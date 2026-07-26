function scoreStreamCandidate(candidate){
  const title = String(candidate.title || "").toLowerCase();
  let score = 0;

  if(title.includes("2160p") || title.includes("4k")) score += 40;
  else if(title.includes("1080p")) score += 30;
  else if(title.includes("720p")) score += 20;

  if(title.includes("remux")) score += 15;
  if(title.includes("bluray") || title.includes("blu-ray")) score += 12;
  if(title.includes("web-dl") || title.includes("webrip")) score += 8;

  if(title.includes("cam") || title.includes("ts") || title.includes("telesync")) score -= 100;
  if(title.includes("sample")) score -= 50;

  score += Math.min(Number(candidate.seeders || 0), 100) / 10;

  return score;
}

function rankStreamCandidates(candidates){
  return [...(candidates || [])].sort((a,b) => scoreStreamCandidate(b) - scoreStreamCandidate(a));
}

module.exports = {
  scoreStreamCandidate,
  rankStreamCandidates
};
