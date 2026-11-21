// Mis tickets en la nube (gratis): Upstash Redis vía REST, protegido con tu código personal.
// Variables en Vercel: TICKETS_KEY (tu código) y las de Upstash (KV_REST_API_URL + KV_REST_API_TOKEN,
// o UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN; Vercel las crea solas al conectar Upstash).
const crypto = require('crypto');
const MEM = new Map(); // solo pruebas locales (TICKETS_MEMORY=1)

function cfg() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token, key: process.env.TICKETS_KEY, mem: process.env.TICKETS_MEMORY === '1' };
}
function same(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
async function redis(c, cmd) {
  if (c.mem) { if (cmd[0] === 'GET') return MEM.get(cmd[1]) ?? null; MEM.set(cmd[1], cmd[2]); return 'OK'; }
  const r = await fetch(c.url, { method: 'POST', headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const DB = 'radar:tickets';

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const c = cfg();
  if (!c.key || (!c.mem && (!c.url || !c.token))) return res.status(503).json({ error: 'no-config' });
  const given = req.headers['x-key'] || '';
  if (!given || !same(given, c.key)) return res.status(401).json({ error: 'codigo' });
  try {
    if (req.method === 'GET') {
      const raw = await redis(c, ['GET', DB]);
      return res.status(200).json(raw ? JSON.parse(raw) : { tickets: [], del: {} });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!Array.isArray(b.tickets) || typeof b.del !== 'object') return res.status(400).json({ error: 'formato' });
      const s = JSON.stringify({ tickets: b.tickets, del: b.del || {}, at: Date.now() });
      if (s.length > 900000) return res.status(413).json({ error: 'muy grande' });
      await redis(c, ['SET', DB, s]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'metodo' });
  } catch (e) {
    return res.status(502).json({ error: 'nube', detail: String(e.message || e) });
  }
};
