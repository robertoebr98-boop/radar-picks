// NBA v1: puntos por equipo (temporada + últimos 10), racha y proyección de marcador.
// Proyección: puntos de A = promedio de (lo que mete A, lo que recibe B) ± ventaja de local.
// Se mezcla 50/50 con la casa (margen = −spread, total = línea) y las probabilidades salen de una normal.
// Sin backtest todavía (primera prueba 24-nov-2026): tratar como guía, no como modelo validado.
(function (root) {
  const CFG = {
    HCA: 2.4,          // ventaja de local en puntos (NBA reciente ≈ 2–2.5)
    W_LAST10: 0.5,     // peso de los últimos 10 vs toda la temporada
    SD_MARGIN: 13,     // desviación del margen final
    SD_TOTAL: 19,      // desviación del total de puntos
    W_MARKET: 0.5,     // mezcla con la casa
    MIN_GAMES: 5,
    MAX_SPREAD: 9.5,   // lección T1: spreads de -10 o más fallan por 1-2 puntos; no se sugieren
  };

  // Normal acumulada (Abramowitz-Stegun 7.1.26).
  function phi(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }

  // Resumen de un equipo con sus partidos ya jugados (eventos de D.parseEvent).
  function teamStats(events, teamId) {
    const id = String(teamId);
    const g = (events || []).filter(e => e.completed && e.hs != null && e.as != null && (e.homeId === id || e.awayId === id))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(e => { const home = e.homeId === id; const pf = home ? e.hs : e.as, pa = home ? e.as : e.hs; return { pf, pa, w: pf > pa, home }; });
    if (!g.length) return null;
    const avg = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
    const l10 = g.slice(-10);
    let streak = 0; const lastW = g[g.length - 1].w;
    for (let i = g.length - 1; i >= 0 && g[i].w === lastW; i--) streak++;
    return {
      n: g.length, w: g.filter(x => x.w).length, l: g.filter(x => !x.w).length,
      pf: avg(g, 'pf'), pa: avg(g, 'pa'), pf10: avg(l10, 'pf'), pa10: avg(l10, 'pa'),
      w10: l10.filter(x => x.w).length, n10: l10.length, streak: (lastW ? 'G' : 'P') + streak,
    };
  }

  const blendW = s => s.n >= CFG.MIN_GAMES ? CFG.W_LAST10 : 0;
  const off = s => (1 - blendW(s)) * s.pf + blendW(s) * s.pf10;
  const def = s => (1 - blendW(s)) * s.pa + blendW(s) * s.pa10;

  // market: { spread: puntos del local (negativo = local favorito), total }
  function project(h, a, market = {}) {
    if (!h || !a || h.n < CFG.MIN_GAMES || a.n < CFG.MIN_GAMES) return null;
    const ph = (off(h) + def(a)) / 2 + CFG.HCA / 2, pa = (off(a) + def(h)) / 2 - CFG.HCA / 2;
    const mModel = ph - pa, tModel = ph + pa;
    const hasS = market.spread != null && isFinite(market.spread), hasT = market.total != null && isFinite(market.total);
    const margin = hasS ? (1 - CFG.W_MARKET) * mModel + CFG.W_MARKET * (-market.spread) : mModel;
    const total = hasT ? (1 - CFG.W_MARKET) * tModel + CFG.W_MARKET * market.total : tModel;
    return { ph, pa, mModel, tModel, margin, total, pHome: phi(margin / CFG.SD_MARGIN) };
  }

  // Probabilidad de que el local gane por más de x puntos (x puede ser negativo).
  const pHomeBy = (pr, x) => phi((pr.margin - x) / CFG.SD_MARGIN);
  const pOver = (pr, line) => phi((pr.total - line) / CFG.SD_TOTAL);

  const api = { CFG, phi, teamStats, project, pHomeBy, pOver };
  root.RadarNBA = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
