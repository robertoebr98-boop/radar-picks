const assert = require('assert');
const M = require('../model.js');
const D = require('../data.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('matriz suma 1', () => {
  const m = M.scoreMatrix(1.6, 1.1); let s = 0; m.forEach(r => r.forEach(v => s += v));
  assert(Math.abs(s - 1) < 1e-9);
});
t('Dixon-Coles sube el 1-1 y el 0-0 con rho negativo', () => {
  const a = M.scoreMatrix(1.3, 1.1, 0), b = M.scoreMatrix(1.3, 1.1, -0.08);
  assert(b[1][1] > a[1][1] && b[0][0] > a[0][0]);
});
t('americano a decimal', () => {
  assert.strictEqual(M.americanToDecimal(-110).toFixed(3), '1.909');
  assert.strictEqual(M.americanToDecimal('+270'), 3.7);
  assert.strictEqual(M.americanToDecimal(1.45), 1.45);
});
t('sin margen suma 1', () => {
  const r = M.noVig([1.9, 3.6, 4.2]); assert(Math.abs(r.probs.reduce((a, b) => a + b) - 1) < 1e-9); assert(r.margin > 0);
});
t('equipo fuerte en casa es favorito', () => {
  const inp = { avg: 1.4, home: { team: { gp: 15, gf: 30, ga: 12 }, form: 1 }, away: { team: { gp: 15, gf: 15, ga: 25 }, form: 1 } };
  const r = M.analyze(inp, null, { home: 'A', away: 'B' });
  const p1 = r.markets.find(m => m.id === '1').p, p2 = r.markets.find(m => m.id === '2').p;
  assert(p1 > 0.55 && p2 < 0.2, `${p1} ${p2}`);
  assert(r.markets.every(m => m.worst <= m.p + 1e-9));
});
t('mezcla con mercado mueve 1X2 a la mitad', () => {
  const inp = { avg: 1.4, home: { team: { gp: 15, gf: 21, ga: 21 }, form: 1 }, away: { team: { gp: 15, gf: 21, ga: 21 }, form: 1 } };
  const solo = M.analyze(inp, null, { home: 'A', away: 'B' });
  const mix = M.analyze(inp, { odds1: 1.5, oddsX: 4.2, odds2: 6.5 }, { home: 'A', away: 'B' });
  const s1 = solo.markets[0].p, m1 = mix.markets[0].p, k1 = mix.market.probs[0];
  assert(Math.abs(m1 - (s1 + k1) / 2) < 0.02, `${s1} ${m1} ${k1}`);
});
t('veredicto', () => {
  const mk = { p: 0.8, worst: 0.74 };
  assert.strictEqual(M.verdict(mk, 1.35).tag, 'doblete');
  assert.strictEqual(M.verdict(mk, 1.2).tag, 'momio-bajo');
  assert.strictEqual(M.verdict({ p: 0.5, worst: 0.4 }, 2.2).tag, 'volado');
  assert.strictEqual(M.verdict({ p: 0.4, worst: 0.3 }, 2.8).tag, 'valor');
  assert.strictEqual(M.verdict({ p: 0.4, worst: 0.3 }, 2.4).tag, 'sin-valor');
});
t('forma', () => {
  assert(M.formFactor(['W', 'W', 'W', 'W', 'W'], 1.5) > 1);
  assert(M.formFactor(['L', 'L', 'L', 'L', 'L'], 1.5) < 1);
  assert.strictEqual(M.formFactor([], 1.5), 1);
});
t('buscar equipos y texto', () => {
  const list = [{ id: '1', name: 'Tigres UANL', short: 'Tigres', abbr: 'TIG' }, { id: '2', name: 'América', short: 'América', abbr: 'AME' }, { id: '3', name: 'Atlético de San Luis', short: 'San Luis', abbr: 'ASL' }];
  assert.deepStrictEqual(D.parseMatchText('Tigres vs America'), ['Tigres', 'America']);
  assert.strictEqual(D.findTeam(list, 'america').id, '2');
  assert.strictEqual(D.findTeam(list, 'san luis').id, '3');
  assert.strictEqual(D.findTeam(list, 'tig').id, '1');
});
t('parse de odds formato scoreboard', () => {
  const o = D.parseOdds({ provider: { name: 'DK' }, overUnder: 2.5, moneyline: { home: { close: { odds: '-120' } }, away: { close: { odds: '+300' } }, draw: { close: { odds: '+250' } } }, total: { over: { close: { odds: '-105' } }, under: { close: { odds: '-115' } } } });
  assert.strictEqual(o.ml.home, '-120'); assert.strictEqual(o.total.line, 2.5); assert.strictEqual(o.total.over, '-105');
});
t('alias: Köln, Chivas, Inter', () => {
  const list = [{ id: '122', name: 'FC Cologne', short: 'Cologne', abbr: 'KOE' }, { id: '132', name: 'Bayern Munich', short: 'Bayern', abbr: 'MUN' }, { id: '268', name: 'Borussia Mönchengladbach', short: 'Gladbach', abbr: 'BMG' }, { id: '219', name: 'Guadalajara', short: 'Guadalajara', abbr: 'GDL' }, { id: '110', name: 'Internazionale', short: 'Internazionale', abbr: 'INT' }];
  assert.strictEqual(D.findTeam(list, 'Köln').id, '122');
  assert.strictEqual(D.findTeam(list, 'koln').id, '122');
  assert.strictEqual(D.findTeam(list, 'Bayern München').id, '132');
  assert.strictEqual(D.findTeam(list, 'Mönchengladbach').id, '268');
  assert.strictEqual(D.findTeam(list, 'chivas').id, '219');
  assert.strictEqual(D.findTeam(list, 'Inter').id, '110');
});
t('fuerza ajustada: anotar a un rival fuerte vale más', () => {
  const opp = id => id === 'fuerte' ? { att: 1.3, def: 0.7 } : { att: 0.8, def: 1.3 };
  const ms = r => Array.from({ length: 8 }, (_, i) => ({ date: `2026-10-${10 + i}`, homeId: 'A', awayId: r, hs: 2, as: 1 }));
  const vsFuerte = M.adjustedStrength(ms('fuerte'), 'A', opp, 1.4), vsDebil = M.adjustedStrength(ms('debil'), 'A', opp, 1.4);
  assert(vsFuerte.att > vsDebil.att && vsFuerte.def < vsDebil.def);
});
t('lo reciente pesa más', () => {
  const opp = () => ({ att: 1, def: 1 });
  const old = Array.from({ length: 10 }, (_, i) => ({ date: `2026-08-${10 + i}`, homeId: 'A', awayId: 'B', hs: 0, as: 0 }));
  const recent = Array.from({ length: 4 }, (_, i) => ({ date: `2026-11-${10 + i}`, homeId: 'A', awayId: 'B', hs: 3, as: 0 }));
  const a = M.adjustedStrength([...old, ...recent], 'A', opp, 1.4);
  const flat = (4 * 3) / (14 * 1.4 * 1.1);
  assert(a.att > flat, `${a.att} ${flat}`);
});
t('remates a puerta del calendario de ESPN', () => {
  const ev = { id: '1', date: '2026-11-08T14:30Z', competitions: [{ status: { type: { completed: true } }, competitors: [
    { id: '122', homeAway: 'home', score: '1', team: { id: '122', displayName: 'FC Cologne' }, statistics: [{ name: 'shotsOnTarget', displayValue: '6' }, { name: 'totalShots', displayValue: '12' }] },
    { id: '131', homeAway: 'away', score: '2', team: { id: '131', displayName: 'Bayer Leverkusen' }, statistics: [{ name: 'shotsOnTarget', displayValue: '8' }] }] }] };
  const e = D.parseEvent(ev);
  assert.strictEqual(e.homeSot, 6); assert.strictEqual(e.awaySot, 8); assert.strictEqual(e.hs, 1);
  assert.strictEqual(D.espnDay('2026-11-01T02:00Z'), '20261031');
});
t('combinar goles y remates', () => {
  const c = M.combineAdj({ att: 1, def: 1, n: 10 }, { att: 1.5, def: 0.5, n: 10 });
  assert(Math.abs(c.att - (0.2 + 0.8 * 1.5)) < 1e-9);
  assert.strictEqual(M.combineAdj({ att: 1, def: 1, n: 10 }, { att: 2, def: 2, n: 2 }).att, 1);
});

// ---- Pronóstico del día ----
global.RadarModel = M; global.RadarData = D;
const Y = require('../day.js');
t('ticket: una pata por partido, momio ≥1.30, máx 10', () => {
  const st = new Map([['1', { gp: 15, gf: 32, ga: 10, pts: 35 }], ['2', { gp: 15, gf: 12, ga: 28, pts: 12 }], ['3', { gp: 15, gf: 21, ga: 21, pts: 21 }], ['4', { gp: 15, gf: 20, ga: 22, pts: 20 }]]);
  const ev = (id, h, a, odds) => ({ id, date: '2026-11-21T20:00Z', homeId: h, awayId: a, homeName: 'Equipo ' + h, awayName: 'Equipo ' + a, homeForm: 'WWWDW', awayForm: 'LLDLL', odds });
  const ms = [];
  for (let i = 0; i < 14; i++) ms.push(Y.soccerMatch(ev(String(i), i % 2 ? '1' : '3', i % 2 ? '2' : '4', null), st, 1.4));
  const tk = Y.buildTicket(ms);
  assert(tk.legs.length <= 10);
  assert(tk.legs.every(x => (x.leg.odd || x.leg.minNeeded) >= 1.30 && x.leg.tag !== 'volado' && x.leg.p >= 0.62));
  assert.strictEqual(new Set(tk.legs.map(x => x.match.ev.id)).size, tk.legs.length);
  const strong = ms[1];
  assert.strictEqual(strong.winner.id, '1');
});
t('NBA: probabilidad sin margen', () => {
  const r = Y.usMatch({ id: 'x', homeName: 'Lakers', awayName: 'Jazz', odds: { ml: { home: -300, away: 240 }, total: {} } });
  assert(r.winner.id === '1' && r.winner.p > 0.7 && r.winner.p < 0.76);
});
t('día de sorpresas: estrategia defensiva', () => {
  const st = new Map([['1', { gp: 15, gf: 32, ga: 10, pts: 35 }], ['2', { gp: 15, gf: 12, ga: 28, pts: 12 }]]);
  const played = [];
  for (let i = 0; i < 5; i++) {
    const m = Y.soccerMatch({ id: 'p' + i, date: '2026-11-20T15:00Z', homeId: '1', awayId: '2', homeName: 'Fuerte', awayName: 'Débil', homeForm: 'WWWWW', awayForm: 'LLLLL', odds: null, completed: true, hs: 0, as: 2 }, st, 1.4);
    played.push(m);
  }
  const rv = Y.reviewPlayed(played);
  assert(rv.n === 5 && rv.surprises.length === 5, JSON.stringify([rv.n, rv.hits, rv.surprises.length]));
  const r = Y.strategy(rv);
  assert.strictEqual(r.mode, 'defensivo'); assert(r.MAX_LEGS <= 4 && r.MIN_P >= 0.72);
  assert.strictEqual(Y.strategy({ n: 1 }).mode, 'normal');
});
t('nombres de casas vs ESPN', () => {
  const ok = [['1. FC Köln', 'FC Cologne'], ['Bayern Munich', 'Bayern Munich'], ['Borussia Monchengladbach', 'Borussia Mönchengladbach'], ['Club America', 'América'], ['Club Leon', 'León'], ['Atletico San Luis', 'Atlético de San Luis'], ['Inter Milan', 'Internazionale'], ['Manchester United', 'Manchester United'], ['Paris Saint Germain', 'Paris Saint-Germain'], ['Tigres UANL', 'Tigres UANL'], ['FC Juarez', 'FC Juárez'], ['Pumas UNAM', 'Pumas UNAM']];
  for (const [a, b] of ok) assert(D.sameTeam(a, b), a + ' ~ ' + b);
  const no = [['Manchester United', 'Newcastle United'], ['Manchester City', 'Manchester United'], ['Real Madrid', 'Real Sociedad'], ['Atletico Madrid', 'Athletic Club'], ['Inter', 'AC Milan']];
  for (const [a, b] of no) assert(!D.sameTeam(a, b), a + ' !~ ' + b);
});
console.log(`\n${n} pruebas OK`);
