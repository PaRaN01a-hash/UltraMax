async function checkStreamWizard(req, res) {
  try {
    const manifestUrl = String(req.body?.manifestUrl || '').trim();

    if (!manifestUrl) {
      return res.status(400).json({
        ok: false,
        error: 'Missing manifestUrl'
      });
    }

    if (!/^https?:\/\/.+\/manifest\.json(\?.*)?$/i.test(manifestUrl)) {
      return res.status(400).json({
        ok: false,
        error: 'That does not look like a Stremio manifest URL. It should end with /manifest.json'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const r = await fetch(manifestUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'UltraMAX-StreamWizard/1.0'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    const raw = await r.text();

    if (!r.ok) {
      if (r.status === 403) {
        const lower = manifestUrl.toLowerCase();

        const guessedName =
          lower.includes('torrentio') ? 'Torrentio' :
          lower.includes('comet') ? 'Comet' :
          lower.includes('aio') ? 'AIOStreams' :
          'Protected stream addon';

        return res.json({
          ok: true,
          protected: true,
          manifestUrl,
          id: null,
          name: guessedName,
          version: null,
          description: 'This addon blocked Ultra MAX server-side checking with HTTP 403.',
          logo: null,
          resources: ['stream'],
          types: ['movie', 'series'],
          catalogCount: 0,
          supportsStreams: true,
          warning: 'This addon blocked verification with HTTP 403, but it may still work normally inside Nuvio/Stremio.'
        });
      }

      return res.status(400).json({
        ok: false,
        error: `Manifest returned HTTP ${r.status}`,
        preview: raw.slice(0, 300)
      });
    }

    let manifest;

    try {
      manifest = JSON.parse(raw);
    } catch (e) {
      return res.status(400).json({
        ok: false,
        error: 'Manifest did not return valid JSON',
        preview: raw.slice(0, 300)
      });
    }

    const resources = Array.isArray(manifest.resources)
      ? manifest.resources
      : [];

    const types = Array.isArray(manifest.types)
      ? manifest.types
      : [];

    const catalogs = Array.isArray(manifest.catalogs)
      ? manifest.catalogs
      : [];

    const supportsStreams =
      resources.includes('stream') ||
      resources.some(
        x => typeof x === 'object' && x.name === 'stream'
      );

    return res.json({
      ok: true,
      manifestUrl,
      id: manifest.id || null,
      name: manifest.name || 'Unnamed addon',
      version: manifest.version || null,
      description: manifest.description || null,
      logo: manifest.logo || manifest.icon || null,
      resources,
      types,
      catalogCount: catalogs.length,
      supportsStreams,
      warning: supportsStreams
        ? null
        : 'This addon does not appear to provide stream resources.'
    });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error:
        err.name === 'AbortError'
          ? 'Manifest check timed out'
          : String(err.message || err)
    });
  }
}

module.exports = {
  checkStreamWizard
};
