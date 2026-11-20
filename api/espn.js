// Proxy gratuito a la API pública de ESPN (no requiere API key).
// Solo deja pasar rutas de lectura conocidas, y cachea 10 min en Vercel.
const ALLOWED = /^apis\/(site\/v2|v2)\/sports\/(soccer|basketball|football)\/[a-z0-9._]+\/(teams|teams\/\d+|teams\/\d+\/schedule|standings|scoreboard|summary)$/;
const ALLOWED_PARAMS = new Set(['event', 'dates', 'fixture', 'season', 'limit']);

module.exports = async function handler(req, res) {
  const { path, ...rest } = req.query || {};
  if (!path || !ALLOWED.test(path)) {
    res.status(400).json({ error: 'ruta no permitida' });
    return;
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) if (ALLOWED_PARAMS.has(k)) qs.set(k, String(v));
  const url = `https://site.api.espn.com/${path}${qs.toString() ? '?' + qs : ''}`;
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    const body = await r.text();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'ESPN no respondió', detail: String(e) });
  }
};
