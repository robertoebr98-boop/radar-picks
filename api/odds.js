// Momios de varias casas (consenso) con The Odds API. Opcional y gratis (500 créditos al mes).
// Requiere la variable ODDS_API_KEY en Vercel. Sin key, responde 404 y la página sigue con ESPN.
const SPORT = {
  'mex.1': 'soccer_mexico_ligamx', 'uefa.champions': 'soccer_uefa_champs_league', 'uefa.europa': 'soccer_uefa_europa_league',
  'eng.1': 'soccer_epl', 'esp.1': 'soccer_spain_la_liga', 'ita.1': 'soccer_italy_serie_a', 'ger.1': 'soccer_germany_bundesliga',
  'fra.1': 'soccer_france_ligue_one', 'ned.1': 'soccer_netherlands_eredivisie', 'por.1': 'soccer_portugal_primeira_liga',
  'nba': 'basketball_nba', 'nfl': 'americanfootball_nfl',
};
// Errores con estado 200 y {error}: la página los ignora (no es un arreglo) y se pueden revisar desde el navegador.
module.exports = async function handler(req, res) {
  const key = process.env.ODDS_API_KEY;
  const q = req.query || {};
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (!key) { res.setHeader('cache-control', 'no-store'); res.status(200).json({ error: 'Falta ODDS_API_KEY en Vercel (o falta Redeploy después de agregarla).' }); return; }
  if (q.check) {
    // /v4/sports no gasta créditos: sirve para revisar que la key funcione y cuántos créditos quedan.
    try {
      const r = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(key)}`);
      res.setHeader('cache-control', 'no-store');
      res.status(200).json({ keyOk: r.ok, status: r.status, remaining: r.headers.get('x-requests-remaining'), used: r.headers.get('x-requests-used') });
    } catch (e) { res.status(200).json({ error: 'The Odds API no respondió' }); }
    return;
  }
  const sport = SPORT[q.lg];
  if (!sport) { res.status(200).json({ error: 'liga sin momios de consenso' }); return; }
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    if (!r.ok) { res.setHeader('cache-control', 'no-store'); res.status(200).json({ error: `The Odds API respondió ${r.status}`, detail: body.slice(0, 300) }); return; }
    // 30 min de caché para cuidar los 500 créditos gratis del mes.
    res.setHeader('cache-control', 's-maxage=1800, stale-while-revalidate=600');
    res.status(200).send(body);
  } catch (e) {
    res.status(200).json({ error: 'The Odds API no respondió' });
  }
};
