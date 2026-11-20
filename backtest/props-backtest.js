// Calibración de córners, remates, remates a puerta y tarjetas con datos reales (mismos CSV que backtest.js).
// Cada partido se predice con los partidos de las 5 semanas anteriores de su liga (igual que la página).
const fs = require('fs'), path = require('path');
const P = require('../props.js');
const dir = process.argv[2] || path.join(__dirname, 'data');
const LG = { 'premier-league': 'eng.1', 'la-liga': 'esp.1', 'serie-a': 'ita.1', 'bundesliga': 'ger.1', 'ligue-1': 'fra.1' };
const files = fs.readdirSync(dir).filter(f => /-(2324|2425)\.csv$/.test(f));
const B = {};
const bucket = p => p >= 0.8 ? '0.80+' : p >= 0.7 ? '0.70-0.80' : p >= 0.6 ? '0.60-0.70' : null;
for (const f of files) {
  const lg = LG[f.replace(/-\d{4}\.csv$/, '')];
  const [head, ...rows] = fs.readFileSync(path.join(dir, f), 'utf8').trim().split(/\r?\n/);
  const h = head.split(',');
  const ms = rows.map(r => { const c = r.split(','); const o = {}; h.forEach((k, i) => o[k] = c[i]); return o; }).filter(r => r.HC !== '' && r.HC !== undefined).map((r, i) => ({
    id: String(i), date: new Date(r.Date).getTime(), homeId: r.HomeTeam, awayId: r.AwayTeam,
    stats: { home: { wonCorners: +r.HC, totalShots: +r.HS, shotsOnTarget: +r.HST, foulsCommitted: +r.HF }, away: { wonCorners: +r.AC, totalShots: +r.AS, shotsOnTarget: +r.AST, foulsCommitted: +r.AF } },
    cards: +r.HY + +r.AY + +r.HR + +r.AR,
  }));
  for (const m of ms) {
    const hist = ms.filter(x => x.date < m.date && x.date >= m.date - 35 * 864e5);
    const avgs = P.teamAverages(hist);
    const mk = P.markets(m, avgs, lg, 'L', 'V');
    const H = m.stats.home, A = m.stats.away;
    const actual = { C: H.wonCorners + A.wonCorners, CH: H.wonCorners, CA: A.wonCorners, S: H.totalShots + A.totalShots, T: H.shotsOnTarget + A.shotsOnTarget, TH: H.shotsOnTarget, TA: A.shotsOnTarget, K: m.cards };
    for (const x of mk) {
      const mm = x.id.match(/^([A-Z]+)([HA]?)([<>])([\d.]+)$/);
      const key = mm[1] + mm[2], v = actual[key];
      const hit = mm[3] === '>' ? v > +mm[4] : v < +mm[4];
      const g = x.group, b = bucket(x.p);
      if (!b) continue;
      B[g] = B[g] || {}; B[g][b] = B[g][b] || [0, 0, 0];
      B[g][b][0]++; B[g][b][1] += x.p; B[g][b][2] += hit ? 1 : 0;
    }
  }
}
for (const [g, bs] of Object.entries(B)) {
  console.log(g);
  for (const [b, [n, sp, hits]] of Object.entries(bs).sort()) console.log(`  ${b.padEnd(10)} dijo ${(100 * sp / n).toFixed(1)}%  pasó ${(100 * hits / n).toFixed(1)}%  (${n})`);
}
