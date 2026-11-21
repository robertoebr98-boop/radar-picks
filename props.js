// Mercados extra por partido: córners, remates, remates a puerta y tarjetas.
// Datos: calendario de ESPN de las últimas 5 semanas (gratis). Modelo: binomial negativa.
(function (root) {
  'use strict';
  const D = root.RadarData || (typeof require !== 'undefined' ? require('./data.js') : null);

  // Varianza / media dentro de un partido, calibrada con backtest/props-backtest.js (3,800 partidos, 2023-2025).
  const DISP = { corners: 1.8, shots: 1.3, sot: 1.2, cards: 1.2 };
  // Tarjetas promedio por partido (amarillas + rojas). ESPN no da tarjetas por partido en el calendario.
  const CARDS_AVG = { 'eng.1': 4.3, 'esp.1': 4.8, 'ita.1': 4.3, 'ger.1': 4.2, 'fra.1': 4.0, 'mex.1': 4.8, 'ned.1': 3.9, 'por.1': 4.9 };
  const HOME = 1.06, AWAY = 0.94, K = 3;
  const PROP_MARGIN = 1.08; // las casas cobran más margen en córners/tarjetas

  // P(X > line) con binomial negativa de media m y varianza m*disp (si disp ≤ 1, Poisson).
  function overProb(m, disp, line) {
    const kMax = Math.floor(line);
    let cdf = 0;
    if (disp <= 1.0001) {
      let p = Math.exp(-m); cdf = p;
      for (let k = 1; k <= kMax; k++) { p *= m / k; cdf += p; }
    } else {
      const r = m / (disp - 1), q = r / (r + m);
      let p = Math.pow(q, r); cdf = p;
      for (let k = 0; k < kMax; k++) { p *= (k + r) / (k + 1) * (1 - q); cdf += p; }
    }
    return Math.min(1, Math.max(0, 1 - cdf));
  }

  // Promedios por equipo (a favor / en contra) a partir de partidos terminados con estadísticas.
  function teamAverages(events) {
    const T = new Map(), L = { n: 0, corners: 0, shots: 0, sot: 0, fouls: 0, cards: 0, cardsN: 0 };
    const g = id => { if (!T.has(id)) T.set(id, { n: 0, cF: 0, cA: 0, sF: 0, sA: 0, tF: 0, tA: 0, fF: 0, fA: 0 }); return T.get(id); };
    for (const e of events) {
      const h = e.stats && e.stats.home, a = e.stats && e.stats.away;
      if (!h || !a || h.wonCorners == null || a.wonCorners == null) continue;
      const H = g(e.homeId), A = g(e.awayId);
      if (e.cards) { L.cards += e.cards.home + e.cards.away; L.cardsN++; }
      H.n++; A.n++; L.n++;
      H.cF += h.wonCorners; H.cA += a.wonCorners; A.cF += a.wonCorners; A.cA += h.wonCorners;
      H.sF += h.totalShots || 0; H.sA += a.totalShots || 0; A.sF += a.totalShots || 0; A.sA += h.totalShots || 0;
      H.tF += h.shotsOnTarget || 0; H.tA += a.shotsOnTarget || 0; A.tF += a.shotsOnTarget || 0; A.tA += h.shotsOnTarget || 0;
      H.fF += h.foulsCommitted || 0; H.fA += a.foulsCommitted || 0; A.fF += a.foulsCommitted || 0; A.fA += h.foulsCommitted || 0;
      L.corners += h.wonCorners + a.wonCorners; L.shots += (h.totalShots || 0) + (a.totalShots || 0);
      L.sot += (h.shotsOnTarget || 0) + (a.shotsOnTarget || 0); L.fouls += (h.foulsCommitted || 0) + (a.foulsCommitted || 0);
    }
    const per = L.n ? { corners: L.corners / L.n / 2, shots: L.shots / L.n / 2, sot: L.sot / L.n / 2, fouls: L.fouls / L.n / 2, cards: L.cardsN ? L.cards / L.cardsN : null, cardsN: L.cardsN } : null;
    return { teams: T, league: per, n: L.n };
  }

  // Esperado de un conteo para el local: mezcla su "a favor" con el "en contra" del rival, encogido al promedio.
  function expCount(hF, hN, aA, aN, avg) {
    const f = (hF + K * avg) / (hN + K), a = (aA + K * avg) / (aN + K);
    return Math.sqrt(f * a); // media geométrica: ataque de uno contra defensa del otro
  }

  function markets(ev, avgs, lg, homeName, awayName) {
    const out = [];
    if (!avgs || !avgs.league || avgs.n < 10) return out;
    const L = avgs.league, h = avgs.teams.get(ev.homeId), a = avgs.teams.get(ev.awayId);
    if (!h || !a || h.n < 2 || a.n < 2) return out;
    const add = (id, group, label, p, est = true) => { if (p > 0.02 && p < 0.98) out.push({ id, group, label, p, fair: 1 / p, est }); };
    // Córners
    const cH = expCount(h.cF, h.n, a.cA, a.n, L.corners) * HOME, cA = expCount(a.cF, a.n, h.cA, h.n, L.corners) * AWAY, cT = cH + cA;
    for (const line of [7.5, 8.5, 9.5, 10.5, 11.5]) {
      const p = overProb(cT, DISP.corners, line);
      add(`C>${line}`, 'Córners', `Más de ${line} córners`, p); add(`C<${line}`, 'Córners', `Menos de ${line} córners`, 1 - p);
    }
    for (const [side, m, nm] of [['H', cH, homeName], ['A', cA, awayName]]) for (const line of [3.5, 4.5, 5.5]) add(`C${side}>${line}`, 'Córners', `${nm} más de ${line} córners`, overProb(m, DISP.corners, line));
    // Remates a puerta (Draftea no ofrece remates totales, reportado 21-nov)
    const sH = expCount(h.sF, h.n, a.sA, a.n, L.shots) * HOME, sA = expCount(a.sF, a.n, h.sA, h.n, L.shots) * AWAY; // solo para el esperado
    const tH = expCount(h.tF, h.n, a.tA, a.n, L.sot) * HOME, tA = expCount(a.tF, a.n, h.tA, h.n, L.sot) * AWAY;
    for (const line of [6.5, 7.5, 8.5, 9.5]) { const p = overProb(tH + tA, DISP.sot, line); add(`T>${line}`, 'Remates a puerta', `Más de ${line} remates a puerta`, p); add(`T<${line}`, 'Remates a puerta', `Menos de ${line} remates a puerta`, 1 - p); }
    for (const [side, m, nm] of [['H', tH, homeName], ['A', tA, awayName]]) for (const line of [2.5, 3.5, 4.5]) add(`T${side}>${line}`, 'Remates a puerta', `${nm} más de ${line} a puerta`, overProb(m, DISP.sot, line));
    // Tarjetas: promedio de la liga ajustado por las faltas de ambos equipos
    const base = CARDS_AVG[lg] || (L.cards && L.cardsN >= 20 ? L.cards : 4.4);
    const foulF = L.fouls ? ((h.fF + K * L.fouls) / (h.n + K) + (a.fF + K * L.fouls) / (a.n + K)) / (2 * L.fouls) : 1;
    const kT = base * Math.min(1.3, Math.max(0.75, foulF));
    for (const line of [2.5, 3.5, 4.5, 5.5]) { const p = overProb(kT, DISP.cards, line); add(`K>${line}`, 'Tarjetas', `Más de ${line} tarjetas`, p); add(`K<${line}`, 'Tarjetas', `Menos de ${line} tarjetas`, 1 - p); }
    out.expected = { corners: cT, shots: sH + sA, sot: tH + tA, cards: kT };
    return out;
  }

  // Calendario de las últimas 5 semanas de una liga (una vez por liga; días pasados se cachean 6 h en el servidor).
  const cache = new Map();
  function leagueHistory(lg, days = 35) {
    if (cache.has(lg)) return cache.get(lg);
    const p = (async () => {
      const now = Date.now(), dates = [];
      for (let i = 1; i <= days; i++) dates.push(new Date(now - i * 864e5).toISOString());
      const evs = await D.matchStatsFull(lg, dates);
      return teamAverages(evs);
    })();
    cache.set(lg, p);
    p.catch(() => cache.delete(lg));
    return p;
  }

  // Autovalidación gratis para ligas fuera del backtest (Liga MX, J1…): con los últimos ~150 días de ESPN,
  // predice cada partido con las 5 semanas anteriores (igual que la página) y compara lo que dijo con lo que pasó.
  const bucket = p => p >= 0.8 ? '80%+' : p >= 0.7 ? '70–80%' : p >= 0.6 ? '60–70%' : null;
  function evaluate(evs, lg) {
    evs = [...evs].sort((a, b) => new Date(a.date) - new Date(b.date));
    const G = { 'Córners': { B: {}, matches: 0 }, 'Tarjetas': { B: {}, matches: 0 } };
    for (const m of evs) {
      const t = new Date(m.date).getTime();
      const hist = evs.filter(x => { const u = new Date(x.date).getTime(); return u < t && u >= t - 35 * 864e5; });
      if (hist.length < 10) continue;
      const mk = markets(m, teamAverages(hist), lg, 'L', 'V');
      const H = m.stats.home, A = m.stats.away;
      const act = { C: H.wonCorners + A.wonCorners, CH: H.wonCorners, CA: A.wonCorners, K: m.cards ? m.cards.home + m.cards.away : null };
      const seen = {};
      for (const x of mk) {
        if (!G[x.group]) continue;
        const mm = x.id.match(/^([A-Z]+)([HA]?)([<>])([\d.]+)$/); if (!mm) continue;
        const v = act[mm[1] + mm[2]]; if (v == null) continue;
        const b = bucket(x.p); if (!b) continue;
        const hit = mm[3] === '>' ? v > +mm[4] : v < +mm[4];
        const g = G[x.group]; const r = g.B[b] = g.B[b] || { n: 0, said: 0, hit: 0 };
        r.n++; r.said += x.p; r.hit += hit ? 1 : 0; seen[x.group] = 1;
      }
      for (const k of Object.keys(seen)) G[k].matches++;
    }
    const out = {};
    for (const [k, g] of Object.entries(G)) {
      const rows = Object.entries(g.B).sort().map(([b, r]) => ({ b, n: r.n, said: r.said / r.n, hit: r.hit / r.n }));
      const tot = rows.reduce((a, r) => ({ n: a.n + r.n, said: a.said + r.said * r.n, hit: a.hit + r.hit * r.n }), { n: 0, said: 0, hit: 0 });
      const ok = g.matches >= 60 && tot.n >= 200 && Math.abs(tot.said - tot.hit) / tot.n <= 0.03 && rows.every(r => r.n < 40 || Math.abs(r.said - r.hit) <= 0.05);
      out[k] = { ok, matches: g.matches, rows, said: tot.n ? tot.said / tot.n : null, hit: tot.n ? tot.hit / tot.n : null };
    }
    return out;
  }
  const CK = lg => 'radar.propcheck.' + lg, CK_TTL = 3 * 864e5;
  function cachedCheck(lg) { try { const v = JSON.parse(localStorage.getItem(CK(lg))); return v && Date.now() - v.at < CK_TTL ? v.res : null; } catch (e) { return null; } }
  const running = new Map();
  function selfCheck(lg, days = 150) {
    const c = cachedCheck(lg); if (c) return Promise.resolve(c);
    if (running.has(lg)) return running.get(lg);
    const p = (async () => {
      const now = Date.now(), dates = [];
      for (let i = 1; i <= days; i++) dates.push(new Date(now - i * 864e5).toISOString());
      const res = evaluate(await D.matchStatsFull(lg, dates, days + 5), lg);
      try { localStorage.setItem(CK(lg), JSON.stringify({ at: Date.now(), res })); } catch (e) { /* nada */ }
      return res;
    })();
    running.set(lg, p); p.finally(() => running.delete(lg)).catch(() => {});
    return p;
  }

  const api = { evaluate, selfCheck, cachedCheck, DISP, CARDS_AVG, PROP_MARGIN, overProb, teamAverages, expCount, markets, leagueHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarProps = api;
})(typeof window !== 'undefined' ? window : globalThis);
