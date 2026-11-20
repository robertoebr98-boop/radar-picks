// Momios de varias casas (consenso) con The Odds API. Opcional y gratis (500 créditos al mes).
// Requiere la variable ODDS_API_KEY en Vercel. Sin key, responde 404 y la página sigue con ESPN.
const SPORT = {
  'mex.1': 'soccer_mexico_ligamx', 'uefa.champions': 'soccer_uefa_champs_league', 'uefa.europa': 'soccer_uefa_europa_league',
  'eng.1': 'soccer_epl', 'esp.1': 'soccer_spain_la_liga', 'ita.1': 'soccer_italy_serie_a', 'ger.1': 'soccer_germany_bundesliga',
  'fra.1': 'soccer_france_ligue_one', 'ned.1': 'soccer_netherlands_eredivisie', 'por.1': 'soccer_portugal_primeira_liga',
  'nba': 'basketball_nba', 'nfl': 'americanfootball_nfl',
};
module.exports = async function handler(req, res) {
  const key = process.env.ODDS_API_KEY;
  const sport = SPORT[(req.query || {}).lg];
  if (!key) { res.status(404).json({ error: 'sin ODDS_API_KEY' }); return; }
  if (!sport) { res.status(400).json({ error: 'liga sin momios de consenso' }); return; }
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url);
    const body = await r.text();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    // 30 min de caché para cuidar los 500 créditos gratis del mes.
    res.setHeader('cache-control', 's-maxage=1800, stale-while-revalidate=600');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'The Odds API no respondió' });
  }
};
