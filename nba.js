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

  // ---------- Jugadores: puntos, rebotes, asistencias y triples (líneas alternas "X+") ----------
  // Fuente: box score de ESPN de los últimos partidos de cada equipo + lista de lesionados del partido.
  // Probabilidad: binomial negativa con la media reciente (60% últimos 5 + 40% resto) y dispersión por estadística.
  // Lección de T4: las líneas altas de una sola figura tumban tickets → solo se muestran líneas con ≥ 60%.
  const PCFG = {
    GAMES: 8, MIN_MIN: 20, MIN_GP: 3, MIN_P: 0.60, MAX_P: 0.85, // arriba de 85% el momio queda ≤ 1.08: no paga nada
    // varianza / media (NBA, aproximado de la literatura de props; sin backtest propio todavía)
    DISP: { pts: 2.2, reb: 1.6, ast: 1.7, tpm: 1.4 },
    LINES: { pts: [5, 10, 15, 20, 25, 30, 35], reb: [2, 4, 6, 8, 10, 12], ast: [2, 4, 6, 8, 10], tpm: [1, 2, 3, 4, 5] },
    LABEL: { pts: 'puntos', reb: 'rebotes', ast: 'asistencias', tpm: 'triples' },
  };
  const lgam = x => { // log-gamma (Lanczos)
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgam(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };
  // P(X ≥ k) con media mu y varianza = disp·mu (Poisson si disp ≤ 1).
  function pAtLeast(mu, k, disp) {
    if (mu <= 0) return k <= 0 ? 1 : 0;
    let cdf = 0;
    if (disp <= 1.0001) { let term = Math.exp(-mu); for (let i = 0; i < k; i++) { cdf += term; term *= mu / (i + 1); } }
    else {
      const r = mu / (disp - 1), q = r / (r + mu);
      for (let i = 0; i < k; i++) cdf += Math.exp(lgam(i + r) - lgam(r) - lgam(i + 1) + r * Math.log(q) + i * Math.log(1 - q));
    }
    return Math.max(0, Math.min(1, 1 - cdf));
  }

  // Box score de ESPN → [{ id, name, team, min, pts, reb, ast, tpm, dnp }]
  function parseBox(summary) {
    const out = [];
    for (const t of ((summary && summary.boxscore) || {}).players || []) {
      const team = String(t.team && t.team.id);
      for (const st of t.statistics || []) {
        const keys = (st.keys || st.names || st.labels || []).map(k => String(k).toLowerCase());
        const ix = (...ns) => keys.findIndex(k => ns.includes(k));
        const iMin = ix('minutes', 'min'), iPts = ix('points', 'pts'), iReb = ix('rebounds', 'reb'), iAst = ix('assists', 'ast');
        const i3 = keys.findIndex(k => k.startsWith('threepointfieldgoals') || k === '3pt');
        for (const a of st.athletes || []) {
          const v = a.stats || [], n = i => (i >= 0 && v[i] != null ? parseFloat(String(v[i]).split('-')[0]) : NaN);
          const ath = a.athlete || {};
          const row = { id: String(ath.id || ath.displayName), name: ath.displayName || ath.shortName || '', team, dnp: !!a.didNotPlay || !v.length,
            min: n(iMin), pts: n(iPts), reb: n(iReb), ast: n(iAst), tpm: n(i3) };
          if (!row.dnp && !isFinite(row.min)) row.dnp = true;
          out.push(row);
        }
      }
    }
    return out;
  }

  // Lesionados del partido (summary del evento que viene): { athleteId|nombre: 'Out' | 'Day-To-Day' | ... }
  function parseInjuries(summary) {
    const m = new Map();
    for (const t of (summary && summary.injuries) || []) for (const i of t.injuries || []) {
      const a = i.athlete || {}, st = i.status || (i.type && i.type.description) || '';
      if (a.id) m.set(String(a.id), st); if (a.displayName) m.set(a.displayName, st);
    }
    return m;
  }

  // games: arreglo de box scores (más reciente al final) del equipo; devuelve jugadores con promedios y líneas.
  function playerLines(games, teamId, injuries = new Map()) {
    const id = String(teamId), by = new Map();
    games.forEach((box, gi) => {
      for (const r of box) if (r.team === id) {
        const p = by.get(r.id) || { id: r.id, name: r.name, rows: [], gp: 0, last: -1 };
        if (!r.dnp && r.min > 0) { p.rows.push({ ...r, gi }); p.gp++; p.last = gi; }
        by.set(r.id, p);
      }
    });
    const lastGame = games.length - 1, out = [];
    for (const p of by.values()) {
      if (p.gp < PCFG.MIN_GP) continue;
      const avg = k => p.rows.reduce((s, r) => s + (isFinite(r[k]) ? r[k] : 0), 0) / p.rows.length;
      const min = avg('min'); if (min < PCFG.MIN_MIN) continue;
      const st = injuries.get(p.id) || injuries.get(p.name) || '';
      const out_ = /^out$/i.test(st);
      const recent = p.rows.slice(-5), older = p.rows.slice(0, -5);
      const mean = k => {
        const a = recent.reduce((s, r) => s + (r[k] || 0), 0) / recent.length;
        if (!older.length) return a;
        const b = older.reduce((s, r) => s + (r[k] || 0), 0) / older.length;
        return 0.6 * a + 0.4 * b;
      };
      const pl = { id: p.id, name: p.name, gp: p.gp, of: games.length, min, status: st, out: out_, missedLast: p.last < lastGame, avg: {}, legs: [] };
      for (const k of ['pts', 'reb', 'ast', 'tpm']) {
        const mu = mean(k); pl.avg[k] = mu;
        if (out_) continue;
        for (const line of PCFG.LINES[k]) {
          const pr = pAtLeast(mu, line, PCFG.DISP[k]);
          if (pr >= PCFG.MIN_P && pr <= PCFG.MAX_P) pl.legs.push({ stat: k, line, p: pr, label: `${p.name} ${line}+ ${PCFG.LABEL[k]}` });
        }
      }
      // De cada estadística, solo las dos líneas más altas que pasan (las más bajas pagan casi nada).
      pl.legs = ['pts', 'reb', 'ast', 'tpm'].flatMap(k => pl.legs.filter(l => l.stat === k).slice(-2));
      out.push(pl);
    }
    return out.sort((a, b) => b.min - a.min);
  }

  // Carga todo para un partido (lo usa el panel Mercados). D = RadarData.
  async function playerProps(D, ev) {
    const sum = id => D.get('apis/site/v2/sports/basketball/nba/summary', { event: id });
    const sch = id => D.get(`apis/site/v2/sports/basketball/nba/teams/${id}/schedule`).then(d => (d.events || []).map(D.parseEvent));
    const lastIds = evs => evs.filter(e => e.completed).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-PCFG.GAMES).map(e => e.id);
    const [sh, sa, up] = await Promise.all([sch(ev.homeId), sch(ev.awayId), sum(ev.id).catch(() => null)]);
    const inj = parseInjuries(up);
    const boxes = async ids => (await Promise.all(ids.map(i => sum(i).then(parseBox).catch(() => null)))).filter(Boolean);
    const [bh, ba] = await Promise.all([boxes(lastIds(sh)), boxes(lastIds(sa))]);
    return { home: playerLines(bh, ev.homeId, inj), away: playerLines(ba, ev.awayId, inj), injuries: inj.size };
  }

  const api = { CFG, PCFG, phi, teamStats, project, pHomeBy, pOver, pAtLeast, parseBox, parseInjuries, playerLines, playerProps };
  root.RadarNBA = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
