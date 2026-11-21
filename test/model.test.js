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
const P = require('../props.js');
t('córners/remates/tarjetas: binomial negativa y mercados', () => {
  assert(Math.abs(P.overProb(2, 1, 1.5) - (1 - Math.exp(-2) * 3)) < 1e-9); // Poisson: P(X>=2)
  assert(P.overProb(10, 1.8, 9.5) < P.overProb(10, 1, 9.5) + 0.05);
  const evs = [];
  for (let i = 0; i < 12; i++) evs.push({ homeId: i % 2 ? 'A' : 'C', awayId: i % 2 ? 'B' : 'D', stats: { home: { wonCorners: 7, totalShots: 15, shotsOnTarget: 5, foulsCommitted: 11 }, away: { wonCorners: 3, totalShots: 9, shotsOnTarget: 3, foulsCommitted: 12 } } });
  const avgs = P.teamAverages(evs);
  const mk = P.markets({ homeId: 'A', awayId: 'B' }, avgs, 'eng.1', 'A', 'B');
  const over = mk.find(x => x.id === 'C>8.5'), under = mk.find(x => x.id === 'C<8.5');
  assert(over && under && Math.abs(over.p + under.p - 1) < 1e-9);
  assert(mk.expected.corners > 8 && mk.expected.corners < 12, mk.expected.corners);
  assert(mk.find(x => x.group === 'Tarjetas'));
});
const C = require('../context.js');
t('contexto de tabla Liga MX última jornada', () => {
  const pts = [38, 33, 30, 28, 27, 26, 25, 24, 22, 21, 20, 19, 17, 15, 14, 12, 10, 8];
  const tab = pts.map((p, i) => ({ teamId: 't' + (i + 1), gp: 16, pts: p }));
  const c = C.classify(tab, 'mex.1');
  assert.strictEqual(c.get('t1').tag, 'asegurado');
  assert.strictEqual(c.get('t6').tag, 'asegurado');  // 26 pts: el 9º ya no lo alcanza
  assert.strictEqual(c.get('t8').tag, 'presion');    // defiende el 8º lugar
  assert.strictEqual(c.get('t10').tag, 'presion');   // a 3 pts del 8º con 1 partido
  assert.strictEqual(c.get('t12').tag, 'sin-nada');  // ya no alcanza
  assert.strictEqual(c.get('t18').tag, 'sin-nada');
  const early = C.classify(tab.map(x => ({ ...x, gp: 5 })), 'mex.1');
  assert.strictEqual(early.get('t1').tag, 'normal');
  assert.strictEqual(C.factor(c.get('t10')), 1.08);
});
t('últimos 5 enfrentamientos: resumen y peso 10%', () => {
  const g = [{ id: '1', homeId: 'A', awayId: 'B', hs: 3, as: 1, stats: { home: { wonCorners: 6 }, away: { wonCorners: 4 } } }, { id: '2', homeId: 'B', awayId: 'A', hs: 0, as: 2 }, { id: '3', homeId: 'A', awayId: 'B', hs: 1, as: 1 }];
  const H = M.h2hSummary(g, 'A');
  assert.strictEqual(H.n, 3); assert.strictEqual(H.w, 2); assert.strictEqual(H.d, 1);
  assert(Math.abs(H.gH - 2) < 1e-9 && Math.abs(H.gA - 2 / 3) < 1e-9);
  assert.strictEqual(H.corners.avg, 10); assert.strictEqual(H.corners.n, 1);
  const team = { gp: 10, gf: 15, ga: 12, pts: 15 };
  const base = { avg: 1.4, home: { team }, away: { team } };
  const a = M.expectedGoals(JSON.parse(JSON.stringify(base)));
  const b = M.expectedGoals({ ...JSON.parse(JSON.stringify(base)), h2h: { n: 5, gH: 3, gA: 0 } });
  assert(Math.abs(b.lh - (0.9 * a.lh + 0.1 * 3)) < 1e-9 && b.la < a.la);
  const c = M.expectedGoals({ ...JSON.parse(JSON.stringify(base)), h2h: { n: 2, gH: 3, gA: 0 } });
  assert.strictEqual(c.lh, a.lh);
});
t('más selecciones seguras: escalera baja la prob y sube el momio', () => {
  const mk = (p, est, tag = 'x') => ({ id: 'a', label: 'L', p, worst: p, est, odd: null, tag });
  const ms = [{ legs: [mk(0.75, 1.30), mk(0.85, 1.12)] }, { legs: [mk(0.70, 1.35)] }, { legs: [mk(0.50, 1.90, 'volado')] }];
  const r = Y.safeLadder(ms, 1.30);
  assert.strictEqual(r.length, 2);
  assert(Math.abs(r[1].p - 0.75 * 0.70) < 1e-9 && r[1].odd > r[0].odd);
  assert.strictEqual(Y.safeLadder(ms, 1.10)[0].legs[0].leg.p, 0.85);
});
t('mejor momio para tu riesgo: respeta la prob. mínima y maximiza el momio', () => {
  const mk = (id, p, est) => ({ id, label: id, p, worst: p, est, odd: null, tag: 'x' });
  const ms = [{ legs: [mk('a1', 0.80, 1.18), mk('a2', 0.65, 1.45)] }, { legs: [mk('b1', 0.75, 1.26), mk('b2', 0.60, 1.57)] }, { legs: [mk('c1', 0.70, 1.35)] }];
  const r = Y.bestCombos(ms, 0.40, 1.15, 3);
  for (const x of r) assert(x.p >= 0.40 - 1e-9, x.p);
  const two = r.find(x => x.n === 2);
  assert(two && Math.abs(two.odd - 1.57 * 1.35) < 1e-9, JSON.stringify(two && two.odd)); // a2+b2 = 39% no entra; la que más paga con ≥40% es b2+c1 (42%)
});
t('parlay soñador: llega al momio objetivo con la combinación más probable', () => {
  const mk = (id, p, est) => ({ id, label: id, p, worst: p, est, odd: null, tag: 'x' });
  const ms = Array.from({ length: 8 }, () => ({ legs: [mk('fav', 0.70, 1.35), mk('dog', 0.25, 3.8), mk('x', 0.28, 3.4)] }));
  const r = Y.dreamParlay(ms, 1000);
  assert(r && r.odd >= 1000 * 0.97, r && r.odd);
  // la prob. es la del producto de sus selecciones
  assert(Math.abs(r.p - r.legs.reduce((a, x) => a * x.leg.p, 1)) < 1e-12);
  assert.strictEqual(Y.dreamParlay(ms.slice(0, 1), 1e6), null);
});
t('lectura del partido: favorito claro, parejo y acierto', () => {
  const RR = require('../reading.js');
  const a = RR.text({ h: 'Tigres', a: 'Atlas', p1: 0.62, px: 0.22, p2: 0.16, lh: 1.9, la: 0.8, formH: ['W', 'W', 'W', 'D', 'L'], formA: ['L', 'L', 'D', 'L', 'W'], h2h: { n: 4, w: 3, d: 1, l: 0 } });
  assert(a.winner === 'h' && a.tag === 'ok' && /Tigres/.test(a.lines[0]) && /respalda/.test(a.lines[1]), JSON.stringify(a));
  const b = RR.text({ h: 'A', a: 'B', p1: 0.36, px: 0.30, p2: 0.34, lh: 1.2, la: 1.1 });
  assert(b.winner === 'x' && /parejo/.test(b.lines[0]), JSON.stringify(b));
  assert(RR.hit(a, 2, 0) === true && RR.hit(a, 1, 1) === false && RR.hit(b, 1, 0) === true && RR.hit(b, 3, 1) === false);
});
t('marcador en vivo: asegurada, en riesgo, calificación', () => {
  global.RadarModel = M;
  const LV = require('../live.js');
  const over25 = (h, a) => h + a >= 3, under35 = (h, a) => h + a <= 3;
  assert(LV.lockState(over25, 2, 1) === 'lock-ok' && LV.lockState(over25, 1, 0) === 'risk');
  assert(LV.lockState(under35, 1, 1) === 'ok' && LV.lockState(under35, 3, 1) === 'lock-bad');
  const leg = { key: 'mex.1:1:2:O2.5', matchKey: 'mex.1:1:2' };
  assert(LV.fnFor(leg)); {
    assert(LV.legState(leg, { state: 'in', hs: 2, as: 1 }).st === 'lock-ok');
    assert(LV.legState(leg, { state: 'post', completed: true, hs: 1, as: 0 }).st === 'lost');
  }
  assert(LV.grade([{ st: 'won' }, { st: 'won' }]) === 'ganado' && LV.grade([{ st: 'won' }, { st: 'lost' }]) === 'perdido' && LV.grade([{ st: 'won' }, { st: 'ok' }]) === null);
});
const OP = require('../opinion.js');
t('opinión: se califica y se compara con lo que esperaba el modelo', () => {
  OP._useMemory({});
  OP.set('a', { pick: '1X', pModel: 0.7 }); OP.set('b', { pick: '2', pModel: 0.3 }); OP.set('c', { pick: 'X', pModel: 0.28 });
  assert.strictEqual(OP.resolve('a', 1, 1).hit, true);
  assert.strictEqual(OP.resolve('b', 0, 2).hit, true);
  assert.strictEqual(OP.resolve('c', 2, 0).hit, false);
  assert.strictEqual(OP.resolve('a', 0, 3).hit, true); // ya calificada, no cambia
  const s = OP.stats();
  assert.strictEqual(s.n, 3); assert.strictEqual(s.hits, 2); assert(Math.abs(s.expected - 1.28) < 1e-9);
  assert.deepStrictEqual(s.disagree, { n: 2, hits: 1 });
  assert.strictEqual(OP.agreement(0.72).tag, 'ok');
});
const O = require('../optimize.js');
t('optimizar ticket: cambia, quita y respeta reglas', () => {
  const pool = new Map([
    ['A', { match: 'A1 vs A2', items: [
      { key: 'A:1', label: 'A1 gana', p: 0.62, prov: 1.50, provSrc: 'ESPN' },      // valor 0.93
      { key: 'A:1X', label: 'A1 o empate', p: 0.82, prov: 1.32, provSrc: 'ESPN' }, // valor 1.08
      { key: 'A:X', label: 'Empate', p: 0.50, prov: 2.10, provSrc: 'ESPN' }] }], // volado
    ['B', { match: 'B1 vs B2', items: [{ key: 'B:O1.5', label: 'O1.5', p: 0.80, prov: 1.15, provSrc: 'ESPN' }] }],
    ['C', { match: 'C1 vs C2', items: [{ key: 'C:1', label: 'C1 gana', p: 0.70, prov: 1.60, provSrc: 'consenso' }] }],
  ]);
  const legs = [
    { key: 'A:1', matchKey: 'A', match: 'A1 vs A2', label: 'A1 gana', p: 0.62, prov: 1.50, provSrc: 'ESPN', dft: null },
    { key: 'B:O1.5', matchKey: 'B', match: 'B1 vs B2', label: 'O1.5', p: 0.80, prov: 1.15, provSrc: 'ESPN', dft: null },
  ];
  const r = O.optimize(legs, pool);
  assert.deepStrictEqual(r.after.map(l => l.key), ['A:1X']);
  assert.deepStrictEqual(r.changes.map(c => c.type), ['swap', 'remove']);
  const r2 = O.optimize(legs, pool, { allowAdd: true });
  assert(r2.after.some(l => l.key === 'C:1') && !r2.after.some(l => l.key === 'A:X'));
  assert(O.summary(r2.after, 10).ev > O.summary(legs, 10).ev);
  // mismo número: la que resta se cambia por otro partido; excluye partidos de tickets abiertos
  const rk = O.optimize(legs, pool, { mode: 'keep' });
  assert.strictEqual(rk.after.length, legs.length, JSON.stringify(rk.after.map(l => l.key)));
  assert(!rk.after.some(l => l.key === 'C:1') && rk.changes.some(c => c.type === 'note')); // C (70%) es menos segura que B (80%)
  const pool2 = new Map([...pool, ['C', { match: 'C1 vs C2', items: [{ key: 'C:1', label: 'C1 gana', p: 0.80, prov: 1.40, provSrc: 'consenso' }] }]]);
  const rk2 = O.optimize(legs, pool2, { mode: 'keep' });
  assert(rk2.after.length === legs.length && rk2.after.some(l => l.key === 'C:1'));
  const rx = O.optimize(legs, pool2, { mode: 'keep', exclude: new Set(['C']) });
  assert(rx.after.length === legs.length && !rx.after.some(l => l.key === 'C:1') && rx.changes.some(c => c.type === 'note'));
  // alargar: reemplaza/quita y luego suma; nunca queda más corto si hay candidatos
  const rg = O.optimize(legs, pool, { mode: 'grow' });
  assert(rg.after.length >= legs.length && rg.after.some(l => l.key === 'C:1'), JSON.stringify(rg.after.map(l => l.key)));
  const rge = O.optimize(legs, pool, { mode: 'grow', exclude: new Set(['C']) });
  assert(rge.info.excluded === 1 && rge.info.cands === 0);
  // estimados: solo cambia a una más segura que siga pagando >= 1.30
  const est = [{ key: 'E:1', matchKey: 'E', match: 'E', label: 'E1', p: 0.64, prov: 1.47, provSrc: 'estimado' }];
  const pe = new Map([['E', { match: 'E', items: [{ key: 'E:1X', label: 'E1X', p: 0.75, prov: 1.31, provSrc: 'estimado' }, { key: 'E:O0.5', label: 'O0.5', p: 0.93, prov: 1.05, provSrc: 'estimado' }] }]]);
  assert.strictEqual(O.optimize(est, pe).after[0].key, 'E:1X');
  // máximo 10
  const many = Array.from({ length: 12 }, (_, i) => ({ key: 'M' + i, matchKey: 'M' + i, match: 'M', label: 'x', p: 0.7 + i / 100, prov: 1.5, provSrc: 'ESPN' }));
  assert.strictEqual(O.optimize(many, new Map()).after.length, 10);
});
console.log(`\n${n} pruebas OK`);
