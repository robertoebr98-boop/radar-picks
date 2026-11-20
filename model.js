// Modelo Poisson del Radar de picks. Determinista, sin IA, sin costo.
// Funciona en el navegador (window.RadarModel) y en Node (module.exports) para pruebas.
(function (root) {
  'use strict';

  const CFG = {
    HFA_HOME: 1.10,      // ventaja de local (1.60 / 1.45 aprox.)
    HFA_AWAY: 0.90,      // visita (1.30 / 1.45 aprox.)
    SHRINK_GAMES: 3,     // partidos "fantasma" en el promedio de liga para no sobrerreaccionar
    SPLIT_WEIGHT: 0.4,   // peso de la división local/visita frente al total
    FORM_EXP: 0.25,      // forma últimos 5 elevada a 0.25
    FORM_CLAMP: [0.88, 1.12],
    RHO: -0.08,          // Dixon-Coles
    MAX_GOALS: 10,
    MARKET_WEIGHT: 0.5,  // 50% modelo + 50% casa sin margen
    RANGE: 0.15,         // λ ±15% para el peor caso
    DOBLETE_PROB: 0.70,
    MIN_ODD: 1.30,
    VALUE_EV: 1.05,
    // Ajustados con backtest de ~8,000 partidos (backtest/RESULTADOS.md)
    HALF_LIFE: 30,       // cada 30 partidos atrás, el partido pesa la mitad
    ADJ_PRIOR_GOALS: 1,  // goles 'fantasma' para no sobrerreaccionar
    ADJ_WEIGHT: 0.75,    // 75% fuerza ajustada por rival, 25% tabla
    ADJ_SOT: 0.8,        // dentro del ajuste: 80% remates a puerta, 20% goles (si hay remates)
  };

  function poissonPmf(k, lambda) {
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) p *= lambda / i;
    return p;
  }

  function dcTau(h, a, lh, la, rho) {
    if (h === 0 && a === 0) return 1 - lh * la * rho;
    if (h === 0 && a === 1) return 1 + lh * rho;
    if (h === 1 && a === 0) return 1 + la * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
  }

  // Matriz de marcadores [h][a] normalizada.
  function scoreMatrix(lh, la, rho = CFG.RHO, max = CFG.MAX_GOALS) {
    const ph = [], pa = [];
    for (let i = 0; i <= max; i++) { ph.push(poissonPmf(i, lh)); pa.push(poissonPmf(i, la)); }
    const m = [];
    let total = 0;
    for (let h = 0; h <= max; h++) {
      const row = [];
      for (let a = 0; a <= max; a++) {
        const v = Math.max(0, ph[h] * pa[a] * dcTau(h, a, lh, la, rho));
        row.push(v); total += v;
      }
      m.push(row);
    }
    for (const row of m) for (let a = 0; a < row.length; a++) row[a] /= total;
    return m;
  }

  function sumWhere(m, fn) {
    let s = 0;
    for (let h = 0; h < m.length; h++) for (let a = 0; a < m[h].length; a++) if (fn(h, a)) s += m[h][a];
    return s;
  }

  // Lista de mercados que el modelo sabe valuar. id estable para guardar momios.
  function marketDefs(homeName, awayName) {
    const H = homeName, A = awayName;
    return [
      { id: '1', group: 'Resultado', label: `Gana ${H}`, fn: (h, a) => h > a },
      { id: 'X', group: 'Resultado', label: 'Empate', fn: (h, a) => h === a },
      { id: '2', group: 'Resultado', label: `Gana ${A}`, fn: (h, a) => a > h },
      { id: '1X', group: 'Doble oportunidad', label: `${H} o empate`, fn: (h, a) => h >= a },
      { id: 'X2', group: 'Doble oportunidad', label: `${A} o empate`, fn: (h, a) => a >= h },
      { id: '12', group: 'Doble oportunidad', label: 'No empate', fn: (h, a) => h !== a },
      { id: 'O0.5', group: 'Goles', label: 'Más de 0.5 goles', fn: (h, a) => h + a >= 1 },
      { id: 'O1.5', group: 'Goles', label: 'Más de 1.5 goles', fn: (h, a) => h + a >= 2 },
      { id: 'O2.5', group: 'Goles', label: 'Más de 2.5 goles', fn: (h, a) => h + a >= 3 },
      { id: 'O3.5', group: 'Goles', label: 'Más de 3.5 goles', fn: (h, a) => h + a >= 4 },
      { id: 'U2.5', group: 'Goles', label: 'Menos de 2.5 goles', fn: (h, a) => h + a <= 2 },
      { id: 'U3.5', group: 'Goles', label: 'Menos de 3.5 goles', fn: (h, a) => h + a <= 3 },
      { id: 'U4.5', group: 'Goles', label: 'Menos de 4.5 goles', fn: (h, a) => h + a <= 4 },
      { id: 'BTTS', group: 'Ambos anotan', label: 'Ambos anotan: Sí', fn: (h, a) => h > 0 && a > 0 },
      { id: 'NBTTS', group: 'Ambos anotan', label: 'Ambos anotan: No', fn: (h, a) => h === 0 || a === 0 },
      { id: 'H0.5', group: 'Goles por equipo', label: `${H} anota`, fn: (h) => h >= 1 },
      { id: 'H1.5', group: 'Goles por equipo', label: `${H} 2+ goles`, fn: (h) => h >= 2 },
      { id: 'A0.5', group: 'Goles por equipo', label: `${A} anota`, fn: (h, a) => a >= 1 },
      { id: 'A1.5', group: 'Goles por equipo', label: `${A} 2+ goles`, fn: (h, a) => a >= 2 },
      { id: '1&O1.5', group: 'Combinados', label: `Gana ${H} y +1.5`, fn: (h, a) => h > a && h + a >= 2 },
      { id: '2&O1.5', group: 'Combinados', label: `Gana ${A} y +1.5`, fn: (h, a) => a > h && h + a >= 2 },
      { id: '1X&U3.5', group: 'Combinados', label: `${H} o empate y -3.5`, fn: (h, a) => h >= a && h + a <= 3 },
      { id: 'X2&U3.5', group: 'Combinados', label: `${A} o empate y -3.5`, fn: (h, a) => a >= h && h + a <= 3 },
      { id: '12&O1.5', group: 'Combinados', label: 'No empate y +1.5', fn: (h, a) => h !== a && h + a >= 2 },
    ];
  }

  // ---- Fuerzas de equipo ----
  // standings: [{teamId, gp, gf, ga}] ; splits: {home:{gp,gf,ga}, away:{gp,gf,ga}} por equipo (opcional)
  function leagueAverage(standings) {
    let gp = 0, gf = 0;
    for (const t of standings) { gp += t.gp; gf += t.gf; }
    return gp > 0 ? gf / gp : 1.35;
  }

  function strength(team, avg, split, venueFactor) {
    const k = CFG.SHRINK_GAMES;
    let att = (team.gf + k * avg) / ((team.gp + k) * avg);
    let def = (team.ga + k * avg) / ((team.gp + k) * avg);
    if (split && split.gp >= 3) {
      // Fuerza en la misma condición (local o visita), relativa a lo que se espera en esa condición.
      const expFor = avg * venueFactor, expAg = avg * (2 - venueFactor);
      const sAtt = (split.gf + k * expFor) / ((split.gp + k) * expFor);
      const sDef = (split.ga + k * expAg) / ((split.gp + k) * expAg);
      const w = CFG.SPLIT_WEIGHT;
      att = (1 - w) * att + w * sAtt;
      def = (1 - w) * def + w * sDef;
    }
    return { att, def };
  }

  // Forma: puntos por partido últimos 5 vs puntos por partido de la temporada.
  function formFactor(last5Results, seasonPpg) {
    if (!last5Results || !last5Results.length || !seasonPpg) return 1;
    const pts = last5Results.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
    const ppg5 = pts / last5Results.length;
    const ratio = (ppg5 + 0.5) / (seasonPpg + 0.5); // +0.5 suaviza ceros
    const f = Math.pow(ratio, CFG.FORM_EXP);
    return Math.min(CFG.FORM_CLAMP[1], Math.max(CFG.FORM_CLAMP[0], f));
  }

  // inputs: {avg, home:{team, split, form, bajas}, away:{...}}  bajas en % (0-30) que resta al ataque propio
  // Fuerza ajustada por rival y con peso a lo reciente.
  // matches: [{date, homeId, awayId, hs, as}] completados (cualquier orden). oppStrength(id) -> {att, def}.
  function adjustedStrength(matches, teamId, oppStrength, avg) {
    const done = matches.filter(m => m.hs != null && m.as != null).sort((a, b) => new Date(b.date) - new Date(a.date));
    let gf = 0, ga = 0, expF = 0, expA = 0, n = 0;
    done.forEach((m, i) => {
      const home = m.homeId === teamId;
      const opp = oppStrength(home ? m.awayId : m.homeId) || { att: 1, def: 1 };
      const w = Math.pow(0.5, i / CFG.HALF_LIFE) * (m.prevSeason ? 0.6 : 1);
      gf += w * (home ? m.hs : m.as); ga += w * (home ? m.as : m.hs);
      expF += w * avg * (home ? CFG.HFA_HOME : CFG.HFA_AWAY) * opp.def;
      expA += w * avg * (home ? CFG.HFA_AWAY : CFG.HFA_HOME) * opp.att;
      n++;
    });
    const K = CFG.ADJ_PRIOR_GOALS;
    return { att: (gf + K) / (expF + K), def: (ga + K) / (expA + K), n };
  }

  // Mezcla la fuerza por goles con la fuerza por remates a puerta (convertidos a goles).
  function combineAdj(goals, sot) {
    if (!sot || sot.n < 4) return goals;
    const w = CFG.ADJ_SOT;
    return { att: (1 - w) * goals.att + w * sot.att, def: (1 - w) * goals.def + w * sot.def, n: goals.n, sot: sot, goals: goals };
  }

  function expectedGoals(inp) {
    const sh = strength(inp.home.team, inp.avg, inp.home.split, CFG.HFA_HOME);
    const sa = strength(inp.away.team, inp.avg, inp.away.split, CFG.HFA_AWAY);
    // Si hay fuerza ajustada por rival, se mezcla 50/50 y la forma pesa la mitad (lo reciente ya cuenta más).
    let fh = inp.home.form || 1, fa = inp.away.form || 1;
    for (const [s, adj] of [[sh, inp.home.adj], [sa, inp.away.adj]]) {
      if (adj && adj.n >= 4) {
        s.rawAtt = s.att; s.rawDef = s.def;
        s.att = (1 - CFG.ADJ_WEIGHT) * s.att + CFG.ADJ_WEIGHT * adj.att;
        s.def = (1 - CFG.ADJ_WEIGHT) * s.def + CFG.ADJ_WEIGHT * adj.def;
        s.adj = adj;
      }
    }
    // Con ajuste por rival la forma ya está incluida (el backtest empeora si se suma aparte).
    if (inp.home.adj && inp.home.adj.n >= 4) fh = 1;
    if (inp.away.adj && inp.away.adj.n >= 4) fa = 1;
    inp.home.formUsed = fh; inp.away.formUsed = fa;
    const bh = 1 - (inp.home.bajas || 0) / 100;
    const ba = 1 - (inp.away.bajas || 0) / 100;
    // La baja defensiva rival sube un poco tu ataque (mitad del efecto).
    const bhDef = 1 + (inp.away.bajasDef || 0) / 200;
    const baDef = 1 + (inp.home.bajasDef || 0) / 200;
    const lh = inp.avg * CFG.HFA_HOME * sh.att * sa.def * fh * bh * bhDef;
    const la = inp.avg * CFG.HFA_AWAY * sa.att * sh.def * fa * ba * baDef;
    return { lh: clampL(lh), la: clampL(la), sh, sa };
  }

  function clampL(x) { return Math.min(4.5, Math.max(0.15, x)); }

  // ---- Mercado ----
  function americanToDecimal(ml) {
    if (ml === null || ml === undefined || ml === '') return null;
    const n = typeof ml === 'number' ? ml : parseFloat(String(ml).replace(/[^\d.+-]/g, ''));
    if (!isFinite(n) || n === 0) return null;
    if (Math.abs(n) < 100 && n > 1) return n; // ya era decimal
    return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
  }

  function noVig(odds) {
    const inv = odds.map(o => 1 / o);
    const s = inv.reduce((a, b) => a + b, 0);
    return { probs: inv.map(x => x / s), margin: s - 1 };
  }

  // Busca λ que reproduzcan las probabilidades objetivo (1X2 y, si hay, más de 2.5).
  function fitLambdas(target, start) {
    let best = null;
    const loss = (lh, la) => {
      const m = scoreMatrix(lh, la);
      const p1 = sumWhere(m, (h, a) => h > a), px = sumWhere(m, (h, a) => h === a), p2 = 1 - p1 - px;
      let e = (p1 - target.p1) ** 2 + (px - target.px) ** 2 + (p2 - target.p2) ** 2;
      if (target.pOver25 != null) e += (sumWhere(m, (h, a) => h + a >= 3) - target.pOver25) ** 2;
      return e;
    };
    // búsqueda gruesa y luego fina alrededor del inicio
    const grid = (cH, cA, span, step) => {
      for (let lh = Math.max(0.15, cH - span); lh <= cH + span; lh += step)
        for (let la = Math.max(0.15, cA - span); la <= cA + span; la += step) {
          const e = loss(lh, la);
          if (!best || e < best.e) best = { lh, la, e };
        }
    };
    grid(start.lh, start.la, 1.2, 0.1);
    grid(best.lh, best.la, 0.12, 0.01);
    return { lh: best.lh, la: best.la };
  }

  // ---- Análisis completo ----
  // market: {odds1, oddsX, odds2 (decimales), over25, under25} opcional
  function analyze(inp, market, names) {
    const base = expectedGoals(inp);
    let lh = base.lh, la = base.la, mkt = null;
    if (market && market.odds1 && market.oddsX && market.odds2) {
      const nv = noVig([market.odds1, market.oddsX, market.odds2]);
      const mModel = scoreMatrix(lh, la);
      const m1 = sumWhere(mModel, (h, a) => h > a), mx = sumWhere(mModel, (h, a) => h === a);
      const w = CFG.MARKET_WEIGHT;
      const target = {
        p1: (1 - w) * m1 + w * nv.probs[0],
        px: (1 - w) * mx + w * nv.probs[1],
        p2: (1 - w) * (1 - m1 - mx) + w * nv.probs[2],
      };
      if (market.over25 && market.under25) {
        const ou = noVig([market.over25, market.under25]);
        target.pOver25 = (1 - w) * sumWhere(mModel, (h, a) => h + a >= 3) + w * ou.probs[0];
        mkt = { ou: ou.probs, ouMargin: ou.margin };
      }
      const fit = fitLambdas(target, { lh, la });
      lh = fit.lh; la = fit.la;
      mkt = Object.assign(mkt || {}, { probs: nv.probs, margin: nv.margin, target });
    }
    const m = scoreMatrix(lh, la);
    const r = CFG.RANGE;
    const worstMs = [[1 - r, 1 - r], [1 - r, 1 + r], [1 + r, 1 - r], [1 + r, 1 + r]].map(([a, b]) => scoreMatrix(lh * a, la * b));
    const defs = marketDefs(names.home, names.away);
    const markets = defs.map(d => {
      const p = sumWhere(m, d.fn);
      const worst = Math.min(...worstMs.map(wm => sumWhere(wm, d.fn)));
      return { id: d.id, group: d.group, label: d.label, p, worst, fair: 1 / p };
    });
    // Marcadores más probables
    const scores = [];
    for (let h = 0; h <= 6; h++) for (let a = 0; a <= 6; a++) scores.push({ h, a, p: m[h][a] });
    scores.sort((x, y) => y.p - x.p);
    return { base, lh, la, market: mkt, markets, topScores: scores.slice(0, 6) };
  }

  // Clasifica un mercado con momio (decimal) capturado.
  function verdict(mk, odd) {
    const minNeeded = Math.max(CFG.MIN_ODD, CFG.VALUE_EV / mk.p);
    if (!odd) {
      if (mk.p >= 0.45 && mk.p <= 0.55) return { tag: 'volado', minNeeded };
      if (mk.p >= CFG.DOBLETE_PROB && mk.worst >= CFG.DOBLETE_PROB && mk.p <= 0.83) return { tag: 'candidato', minNeeded };
      return { tag: 'sin-momio', minNeeded };
    }
    const ev = mk.p * odd;
    if (odd < CFG.MIN_ODD) return { tag: 'momio-bajo', ev, minNeeded };
    if (mk.p >= 0.45 && mk.p <= 0.55) return { tag: 'volado', ev, minNeeded };
    if (mk.p >= CFG.DOBLETE_PROB && mk.worst >= CFG.DOBLETE_PROB && ev >= 1.0) return { tag: 'doblete', ev, minNeeded };
    if (ev >= CFG.VALUE_EV) return { tag: 'valor', ev, minNeeded };
    return { tag: 'sin-valor', ev, minNeeded };
  }

  const api = { CFG, adjustedStrength, combineAdj, poissonPmf, scoreMatrix, sumWhere, marketDefs, leagueAverage, strength, formFactor, expectedGoals, americanToDecimal, noVig, fitLambdas, analyze, verdict };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
