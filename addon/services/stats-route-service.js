function legacyStats(configs) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let active24 = 0, active7 = 0, active30 = 0;
  let newToday = 0, new7 = 0, new30 = 0;

  for (const config of Object.values(configs || {})) {
    const last = new Date(config.lastAccessed || config.updatedAt || config.createdAt || 0).getTime();
    const created = new Date(config.createdAt || 0).getTime();
    if (now - last < day) active24++;
    if (now - last < 7 * day) active7++;
    if (now - last < 30 * day) active30++;
    if (now - created < day) newToday++;
    if (now - created < 7 * day) new7++;
    if (now - created < 30 * day) new30++;
  }

  return {
    totalInstalls: Object.keys(configs || {}).length,
    active24Hours: active24,
    active7Days: active7,
    active30Days: active30,
    newToday,
    new7Days: new7,
    new30Days: new30
  };
}

function registerStatsRoutes(app, { loadConfigs, getConfigs = loadConfigs, profileStore, ownershipPolicy }) {
  app.get("/admin/stats/:secret", async (req, res) => {
    if (req.params.secret !== process.env.STATS_SECRET) return res.status(403).json({ error: "Forbidden" });
    try {
      const policy = typeof ownershipPolicy === "function" ? ownershipPolicy() : null;
      if (profileStore?.accountStats && policy?.ownershipEnabled && policy?.legacyFallbackEnabled === false) {
        return res.json(await profileStore.accountStats());
      }
      return res.json(legacyStats(getConfigs()));
    } catch (error) {
      return res.status(503).json({ error: "Stats unavailable" });
    }
  });
}

module.exports = { registerStatsRoutes, legacyStats };
