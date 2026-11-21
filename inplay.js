// Apuestas en vivo: con el marcador y el minuto de ESPN, recalcula lo que falta del partido.
// Goles que faltan = goles esperados antes del partido × fracción del partido que queda (2º tiempo pesa más).
// Validado al medio tiempo con 5 temporadas de las 5 grandes ligas (backtest/inplay-backtest.js).
(function (root) {
  'use strict';
  const M = root.RadarModel || (typeof require !== 'undefined' ? require('./model.js') : null);
  const CFG = { TRAIL: 1.15, LEAD: 0.92, FIRST_HALF: 0.45, RED_SELF: 0.70, RED_OPP: 1.25, ADDED: 4, MIN_P: 0.80, MAX_P: 0.985, MIN_FAIR: 1.03 };

  // "67'" → 67 · "45'+2'" → 45 · "HT"/"Descanso" → 45 · "90'+4'" → 90. Devuelve null si no se entiende.
  function minuteOf(detail, state) {
    const d = String(detail || '').trim();
    if (/^(HT|Half ?time|Descanso|MT)$/i.test(d)) return 45;
    const m = d.match(/^(\d{1,3})'?(?:\s*\+\s*(\d{1,2})'?)?/);
    if (m) return Math.min(90, +m[1]);
    return state === 'in' ? null : null;
  }

  // Fracción de goles esperados que todavía falta, con el 2º tiempo más goleador y tiempo agregado.
  function remaining(t) {
    const s1 = CFG.FIRST_HALF, s2 = 1 - s1, add = CFG.ADDED / 45;
    if (t < 45) return s1 * ((45 - t) / 45 + add * 0.5) / (1 + add * 0.5) + s2;
    if (t === 45) return s2;
    return s2 * Math.max((90 - t) / 45 + add, add * 0.5) / (1 + add);
  }

  // Probabilidad de cada mercado al final, dado el marcador actual y lo que falta.
  function project({ lh, la, hs, as, minute, redH = 0, redA = 0, names }) {
    const f = remaining(minute);
    let rh = lh * f, ra = la * f;
    // Estado del partido: el que pierde ataca más y el que gana se cuida (calibrado en el backtest).
    if (hs > as) { ra *= CFG.TRAIL; rh *= CFG.LEAD; } else if (as > hs) { rh *= CFG.TRAIL; ra *= CFG.LEAD; }
    if (redH) { rh *= CFG.RED_SELF ** redH; ra *= CFG.RED_OPP ** redH; }
    if (redA) { ra *= CFG.RED_SELF ** redA; rh *= CFG.RED_OPP ** redA; }
    const mat = M.scoreMatrix(rh, ra); // goles que faltan
    const defs = M.marketDefs((names && names.home) || 'Local', (names && names.away) || 'Visita');
    const out = [];
    for (const d of defs) {
      let p = 0;
      for (let i = 0; i < mat.length; i++) for (let j = 0; j < mat[i].length; j++) if (d.fn(hs + i, as + j)) p += mat[i][j];
      out.push({ id: d.id, group: d.group, label: d.label, p });
    }
    return { rh, ra, markets: out, f };
  }

  // Selecciones "seguras" en vivo: prob. alta pero aún con momio (no decididas), una por grupo.
  function safePicks(proj) {
    // Sin combinados: en vivo casi siempre repiten otra selección (doble exposición al mismo resultado).
    const ok = proj.markets.filter(x => x.group !== 'Combinados' && x.p >= CFG.MIN_P && x.p <= CFG.MAX_P && 1 / x.p >= CFG.MIN_FAIR)
      .sort((a, b) => b.p - a.p);
    const seen = new Set(), picks = [];
    for (const x of ok) { if (seen.has(x.group)) continue; seen.add(x.group); picks.push({ ...x, need: 1 / x.p }); }
    return picks.slice(0, 3);
  }

  const api = { CFG, minuteOf, remaining, project, safePicks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarInPlay = api;
})(typeof window !== 'undefined' ? window : globalThis);
