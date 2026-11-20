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
console.log(`\n${n} pruebas OK`);
