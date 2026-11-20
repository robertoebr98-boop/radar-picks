// Backtest del modelo con ~10,000 partidos reales (5 ligas europeas, 2019-2025).
// Datos: football-data.co.uk vía github.com/datasets/football-datasets (gratis).
// Uso: node backtest/backtest.js <carpeta-con-csv>
// Mide Brier y log-loss del 1X2 sin mirar el futuro (cada partido se predice solo con partidos anteriores).
const fs = require('fs'), path = require('path');
const M = require('../model.js');

function readCsv(f) {
  const [head, ...rows] = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/);
  const h = head.split(',');
  return rows.map(r => { const c = r.split(','); const o = {}; h.forEach((k, i) => o[k] = c[i]); return o; })
    .filter(r => r.FTHG !== '' && r.FTHG !== undefined)
    .map(r => ({ date: r.Date, home: r.HomeTeam, away: r.AwayTeam, hg: +r.FTHG, ag: +r.FTAG, hst: +r.HST, ast: +r.AST }));
}

const LEGS = [['1X', (h, a) => h >= a], ['X2', (h, a) => a >= h], ['12', (h, a) => h !== a], ['O1.5', (h, a) => h + a >= 2], ['O2.5', (h, a) => h + a >= 3], ['U2.5', (h, a) => h + a <= 2], ['U3.5', (h, a) => h + a <= 3], ['BTTS', (h, a) => h > 0 && a > 0], ['NBTTS', (h, a) => !(h > 0 && a > 0)]];
let CAL = null;
const LGID = { 'premier-league': 'eng.1', 'la-liga': 'esp.1', 'serie-a': 'ita.1', 'bundesliga': 'ger.1', 'ligue-1': 'fra.1' };
function evaluate(seasons, opt) {
  let brier = 0, ll = 0, n = 0, bo = 0, bb = 0;
  CAL = { '0.60-0.70': [0, 0, 0], '0.70-0.80': [0, 0, 0], '0.80-0.90': [0, 0, 0], '0.90+': [0, 0, 0] };
  for (const s of seasons) {
    const prev = opt.usePrev ? s.prev : null;
    const hist = [];
    opt._older = s.older || [];
    for (const m of s.matches) {
      const pred = predict(hist, m, { ...opt, lgId: LGID[s.lg] }, prev);
      if (pred && (!opt.onlyLate || m._late) && (!opt.onlyH2H || m._h2h)) {
        const o = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2;
        const p = [pred.p1, pred.px, pred.p2];
        brier += p.reduce((acc, q, i) => acc + (q - (i === o ? 1 : 0)) ** 2, 0);
        ll += -Math.log(Math.max(1e-9, p[o]));
        n++;
        const o25 = pred.legs.find(l => l.id === 'O2.5'), bt = pred.legs.find(l => l.id === 'BTTS');
        bo += (o25.p - (o25.hit ? 1 : 0)) ** 2; bb += (bt.p - (bt.hit ? 1 : 0)) ** 2;
        for (const l of pred.legs) {
          const b = l.p >= 0.9 ? '0.90+' : l.p >= 0.8 ? '0.80-0.90' : l.p >= 0.7 ? '0.70-0.80' : l.p >= 0.6 ? '0.60-0.70' : null;
          if (b) { CAL[b][0]++; CAL[b][1] += l.p; CAL[b][2] += l.hit ? 1 : 0; }
        }
      }
      hist.push(m);
    }
  }
  return { brier: brier / n, logloss: ll / n, n, bo: bo / n, bb: bb / n };
}

function table(hist) {
  const t = new Map();
  const g = id => { if (!t.has(id)) t.set(id, { gp: 0, gf: 0, ga: 0, pts: 0, sf: 0, sa: 0, home: { gp: 0, gf: 0, ga: 0 }, away: { gp: 0, gf: 0, ga: 0 } }); return t.get(id); };
  for (const m of hist) {
    const h = g(m.home), a = g(m.away);
    h.gp++; a.gp++; h.gf += m.hg; h.ga += m.ag; a.gf += m.ag; a.ga += m.hg;
    h.sf += m.hst; h.sa += m.ast; a.sf += m.ast; a.sa += m.hst;
    h.home.gp++; h.home.gf += m.hg; h.home.ga += m.ag; a.away.gp++; a.away.gf += m.ag; a.away.ga += m.hg;
    h.pts += m.hg > m.ag ? 3 : m.hg === m.ag ? 1 : 0; a.pts += m.ag > m.hg ? 3 : m.hg === m.ag ? 1 : 0;
  }
  return t;
}

function predict(hist, m, opt, prev) {
  const t = table(hist);
  const th = t.get(m.home), ta = t.get(m.away);
  if (!th || !ta || th.gp < opt.minGames || ta.gp < opt.minGames) return null;
  const all = [...t.values()];
  const avg = M.leagueAverage(all);
  const avgSot = all.reduce((s, x) => s + x.sf, 0) / all.reduce((s, x) => s + x.gp, 0);
  const conv = avg / avgSot;
  const res = r => (r.hg > r.ag ? 'W' : r.hg < r.ag ? 'L' : 'D');
  const last5 = id => hist.filter(x => x.home === id || x.away === id).slice(-5).map(x => x.home === id ? res(x) : ({ W: 'L', L: 'W', D: 'D' })[res(x)]);
  const oppS = id => { const x = t.get(id); return x && x.gp ? M.strength(x, avg) : null; };
  const toEv = (arr, prevSeason) => arr.map(x => ({ date: x.date, homeId: x.home, awayId: x.away, hs: x.hg, as: x.ag, prevSeason }));
  const toSot = (arr, prevSeason) => arr.map(x => ({ date: x.date, homeId: x.home, awayId: x.away, hs: x.hst * conv, as: x.ast * conv, prevSeason }));
  const mine = id => hist.filter(x => x.home === id || x.away === id);
  const prevOf = id => prev ? prev.filter(x => x.home === id || x.away === id) : [];
  const side = (id, team) => {
    const o = { team, split: opt.split ? (id === m.home ? team.home : team.away) : undefined, form: opt.form ? M.formFactor(last5(id), team.pts / team.gp) : 1 };
    if (opt.adj) {
      const g = M.adjustedStrength([...toEv(mine(id)), ...toEv(prevOf(id), true)], id, oppS, avg);
      const s = opt.sot ? M.adjustedStrength([...toSot(mine(id)), ...toSot(prevOf(id), true)], id, oppS, avg) : null;
      o.adj = s ? M.combineAdj(g, s) : g;
    }
    return o;
  };
  const saved = { ...M.CFG };
  Object.assign(M.CFG, opt.cfg || {});
  const inp = { avg, home: side(m.home, th), away: side(m.away, ta) };
  let { lh, la } = M.expectedGoals(inp);
  if (opt.ctx) {
    const C = require('../context.js');
    const rows = [...t.entries()].map(([id, x]) => ({ teamId: id, gp: x.gp, pts: x.pts, gd: x.gf - x.ga }));
    const cls = C.classify(rows, opt.lgId, opt.rules);
    const f = c => c ? (opt.ctx[c.motivation] || 1) : 1;
    const ch = cls.get(m.home), ca = cls.get(m.away);
    lh *= f(ch); la *= f(ca);
    if (opt.onlyLate) m._late = !!((ch && ch.motivation !== 'normal') || (ca && ca.motivation !== 'normal'));
  }
  if (opt.h2h) {
    // Últimos 5 enfrentamientos directos (cualquier sede, temporadas anteriores incluidas).
    const meet = [...opt._older, ...hist].filter(x => (x.home === m.home && x.away === m.away) || (x.home === m.away && x.away === m.home)).slice(-5);
    if (meet.length >= (opt.h2hMin || 3)) {
      const gH = meet.reduce((a, x) => a + (x.home === m.home ? x.hg : x.ag), 0) / meet.length;
      const gA = meet.reduce((a, x) => a + (x.home === m.away ? x.hg : x.ag), 0) / meet.length;
      const w = opt.h2h * meet.length / 5;
      lh = (1 - w) * lh + w * gH; la = (1 - w) * la + w * gA;
      m._h2h = true;
    }
  }
  const mat = M.scoreMatrix(lh, la);
  Object.assign(M.CFG, saved);
  const p1 = M.sumWhere(mat, (h, a) => h > a), px = M.sumWhere(mat, (h, a) => h === a);
  const legs = LEGS.map(([id, fn]) => ({ id, p: M.sumWhere(mat, fn), hit: fn(m.hg, m.ag) }));
  return { p1, px, p2: 1 - p1 - px, legs };
}

const dir = process.argv[2] || path.join(__dirname, 'data');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort();
const byLeague = {};
for (const f of files) { const lg = f.replace(/-\d{4}\.csv$/, ''); (byLeague[lg] = byLeague[lg] || []).push(readCsv(path.join(dir, f))); }
const seasons = [];
for (const lg of Object.keys(byLeague)) byLeague[lg].forEach((ms, i) => { if (i > 0) seasons.push({ lg, matches: ms, prev: byLeague[lg][i - 1], older: byLeague[lg].slice(0, i).flat() }); });

const base = { minGames: 4, split: true, form: true };
const V2 = { HALF_LIFE: 8, ADJ_PRIOR_GOALS: 2, ADJ_WEIGHT: 0.5 };
const variants = (process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : null) || [
  ['Siempre 46/26/28 (referencia tonta)', null],
  ['v2: tabla + local/visita + forma', { ...base }],
  ['v3: + ajuste por rival y recencia', { ...base, adj: true, usePrev: true, cfg: V2, keepForm: true }],
  ['v4: + remates a puerta + pesos del backtest', { ...base, adj: true, usePrev: true, sot: true }],
];
for (const [name, opt] of variants) {
  if (!opt) {
    let b = 0, l = 0, n = 0;
    for (const s of seasons) for (const m of s.matches.slice(40)) { const o = m.hg > m.ag ? 0 : m.hg === m.ag ? 1 : 2; const p = [0.46, 0.26, 0.28]; b += p.reduce((a, q, i) => a + (q - (i === o ? 1 : 0)) ** 2, 0); l -= Math.log(p[o]); n++; }
    console.log(`${name.padEnd(42)} Brier ${(b / n).toFixed(4)}  log-loss ${(l / n).toFixed(4)}  n=${n}`);
    continue;
  }
  const r = evaluate(seasons, opt);
  console.log(`${name.padEnd(42)} Brier ${r.brier.toFixed(4)}  log-loss ${r.logloss.toFixed(4)}  n=${r.n}  Brier O2.5 ${r.bo.toFixed(4)}  ambos anotan ${r.bb.toFixed(4)}`);
}
console.log('\nCalibración de patas (último modelo): prob. que dijo el modelo vs. lo que pasó');
for (const [b, [n, sp, hits]] of Object.entries(CAL)) if (n) console.log(`  ${b.padEnd(10)} dijo ${(100 * sp / n).toFixed(1)}%  pasó ${(100 * hits / n).toFixed(1)}%  (${n} patas)`);
