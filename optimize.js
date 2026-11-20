// Optimizar ticket: propone cambios para subir el valor esperado respetando las reglas
// (máx 10 selecciones, momio ≥ 1.30, sin volados, prob ≥ 60%).
// El valor esperado de un ticket es monto × (Π prob×momio − 1): conviene que cada selección tenga prob×momio alto.
// Solo los momios reales (Draftea, ESPN, consenso, capturado) dicen algo del valor; los "estimados" no.
(function (root) {
  'use strict';
  const R = { MAX: 10, MIN_ODD: 1.30, MIN_P: 0.60, VOL: [0.45, 0.55], EST_V: 0.98 };

  const oddOf = l => l.dft || l.prov || null;
  const isReal = l => !!l.dft || (l.provSrc && !/estimado|anterior/i.test(l.provSrc));
  const valueOf = l => (isReal(l) && oddOf(l) ? l.p * oddOf(l) : null);
  const allowed = l => {
    const o = oddOf(l);
    return o && o >= R.MIN_ODD && l.p >= R.MIN_P && !(l.p >= R.VOL[0] && l.p <= R.VOL[1]);
  };

  // legs: selecciones actuales. pool: Map matchKey -> {match, items:[{key,id,label,p,prov,provSrc}]}
  function optimize(legs, pool, opts = {}) {
    const changes = [];
    const after = [];
    const inTicket = new Set(legs.map(l => l.key));
    for (const l of legs) {
      const cur = { ...l };
      const alts = ((pool.get(l.matchKey) || {}).items || []).filter(x => !inTicket.has(x.key)).map(x => ({ ...x, matchKey: l.matchKey, match: l.match, dft: null }));
      const curV = valueOf(cur);
      // 1) Mejor alternativa con momio real y más valor.
      const realBetter = alts.filter(x => allowed(x) && valueOf(x) != null)
        .filter(x => valueOf(x) > (curV != null ? curV : R.EST_V) + 0.02)
        .sort((a, b) => valueOf(b) - valueOf(a))[0];
      if (realBetter) {
        changes.push({ type: 'swap', from: cur, to: realBetter, why: `más valor: ${(valueOf(realBetter)).toFixed(2)} vs ${curV != null ? curV.toFixed(2) : 'momio estimado'}` });
        after.push(realBetter); inTicket.add(realBetter.key); continue;
      }
      // 2) Quitar la que resta valor con momio real (si quedan otras).
      if (curV != null && curV < 0.97 && legs.length > 1) {
        changes.push({ type: 'remove', from: cur, why: `resta valor (${curV.toFixed(2)} < 1): el momio paga menos de lo que vale` });
        continue;
      }
      // 3) Sin momios reales: cambiar a una más segura del mismo partido que siga pagando ≥ 1.30.
      if (curV == null) {
        const safer = alts.filter(x => allowed(x) && x.p >= cur.p + 0.05).sort((a, b) => b.p - a.p)[0];
        if (safer) { changes.push({ type: 'swap', from: cur, to: safer, why: `más segura: ${Math.round(safer.p * 100)}% vs ${Math.round(cur.p * 100)}%` }); after.push(safer); inTicket.add(safer.key); continue; }
      }
      // 4) Fuera de las reglas y sin alternativa: quitar.
      if (!allowed(cur) && legs.length > 1) {
        changes.push({ type: 'remove', from: cur, why: oddOf(cur) < R.MIN_ODD ? 'momio menor a 1.30' : cur.p < R.MIN_P ? 'probabilidad menor a 60%' : 'es un volado' });
        continue;
      }
      after.push(cur);
    }
    // 5) Opcional: sumar selecciones con valor real de otros partidos.
    if (opts.allowAdd) {
      const used = new Set(after.map(l => l.matchKey));
      const adds = [];
      for (const [mk, g] of pool) {
        if (used.has(mk) || !g.items.length) continue;
        const best = g.items.map(x => ({ ...x, matchKey: mk, match: g.match, dft: null }))
          .filter(x => !inTicket.has(x.key) && allowed(x) && valueOf(x) != null && valueOf(x) >= 1.05)
          .sort((a, b) => valueOf(b) - valueOf(a))[0];
        if (best) adds.push(best);
      }
      adds.sort((a, b) => valueOf(b) - valueOf(a));
      for (const a of adds) {
        if (after.length >= R.MAX) break;
        after.push(a); changes.push({ type: 'add', to: a, why: `valor ${valueOf(a).toFixed(2)} con momio ${a.provSrc}` });
      }
    }
    // Máximo 10: deja fuera las de menor valor (o menor prob si no hay momio real).
    while (after.length > R.MAX) {
      const worst = after.reduce((w, l) => ((valueOf(l) ?? l.p) < (valueOf(w) ?? w.p) ? l : w), after[0]);
      after.splice(after.indexOf(worst), 1); changes.push({ type: 'remove', from: worst, why: 'máximo 10 selecciones' });
    }
    return { after, changes };
  }

  function summary(legs, stake) {
    const p = legs.reduce((a, l) => a * l.p, 1);
    const odd = legs.reduce((a, l) => a * (oddOf(l) || 1), 1);
    const real = legs.filter(isReal).length;
    return { p, odd, ev: stake * (p * odd - 1), n: legs.length, real };
  }

  const api = { R, optimize, summary, isReal, valueOf, allowed, oddOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarOptimize = api;
})(typeof window !== 'undefined' ? window : globalThis);
