// Prueba del modelo en vivo al medio tiempo: con el marcador del descanso y los goles esperados del partido,
// ¿las selecciones de 80%+ pegan lo que dicen? Mismos CSV que backtest.js (traen marcador al descanso).
// Goles esperados antes del partido: ataque/defensa simples con los partidos previos de la temporada.
const fs = require('fs'), path = require('path');
const IP = require('../inplay.js');
if (process.env.IPCFG) Object.assign(IP.CFG, JSON.parse(process.env.IPCFG));
const dir = process.argv[2] || path.join(__dirname, 'data');
const files = fs.readdirSync(dir).filter(f => /\.csv$/.test(f));
const B = {}; let g1 = 0, g2 = 0, n = 0;
const bucket = p => p >= 0.95 ? '95%+' : p >= 0.9 ? '90–95%' : p >= 0.85 ? '85–90%' : p >= 0.8 ? '80–85%' : null;
for (const f of files) {
  const [head, ...rows] = fs.readFileSync(path.join(dir, f), 'utf8').trim().split(/\r?\n/);
  const h = head.split(',');
  const ms = rows.map(r => { const c = r.split(','); const o = {}; h.forEach((k, i) => o[k] = c[i]); return o; })
    .filter(r => r.HTHG !== '' && r.HTHG !== undefined && r.FTHG !== '');
  const T = new Map(); let LH = 0, LA = 0, LN = 0;
  const t = id => { if (!T.has(id)) T.set(id, { hf: 0, ha: 0, hn: 0, af: 0, aa: 0, an: 0 }); return T.get(id); };
  for (const r of ms) {
    const H = t(r.HomeTeam), A = t(r.AwayTeam), K = 5;
    if (LN >= 40 && H.hn + H.an >= 5 && A.hn + A.an >= 5) {
      const lh0 = LH / LN, la0 = LA / LN, avg = (lh0 + la0) / 2;
      const att = x => ((x.hf + x.af) + K * avg) / ((x.hn + x.an) + K) / avg;
      const def = x => ((x.ha + x.aa) + K * avg) / ((x.hn + x.an) + K) / avg;
      const lh = lh0 * att(H) * def(A), la = la0 * att(A) * def(H);
      const hs = +r.HTHG, as = +r.HTAG, fh = +r.FTHG, fa = +r.FTAG;
      const pr = IP.project({ lh, la, hs, as, minute: 45 });
      const defs = require('../model.js').marketDefs('L', 'V');
      for (const x of pr.markets) {
        const b = bucket(x.p); if (!b || x.p > 0.985) continue;
        const hit = defs.find(d => d.id === x.id).fn(fh, fa);
        const k = b; B[k] = B[k] || [0, 0, 0]; B[k][0]++; B[k][1] += x.p; B[k][2] += hit ? 1 : 0;
        const kg = x.group + ' ' + b; B[kg] = B[kg] || [0, 0, 0]; B[kg][0]++; B[kg][1] += x.p; B[kg][2] += hit ? 1 : 0;
      }
      n++;
    }
    const hs = +r.HTHG, as = +r.HTAG, fh = +r.FTHG, fa = +r.FTAG;
    g1 += hs + as; g2 += fh + fa - hs - as;
    H.hf += fh; H.ha += fa; H.hn++; A.af += fa; A.aa += fh; A.an++; LH += fh; LA += fa; LN++;
  }
}
console.log(`Partidos evaluados: ${n}. Goles en 1er tiempo: ${(100 * g1 / (g1 + g2)).toFixed(1)}%`);
for (const [k, [c, sp, hit]] of Object.entries(B).sort()) if (c >= 200 || !/ /.test(k)) console.log(`  ${k.padEnd(34)} dijo ${(100 * sp / c).toFixed(1)}%  pasó ${(100 * hit / c).toFixed(1)}%  (${c})`);
