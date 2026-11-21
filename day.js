// Pronóstico del día: analiza todos los partidos de una fecha y arma picks + ticket sugerido.
(function (root) {
  'use strict';
  const M = root.RadarModel || (typeof require !== 'undefined' ? require('./model.js') : null);
  const D = root.RadarData || (typeof require !== 'undefined' ? require('./data.js') : null);

  const US = [
    { id: 'nba', name: 'NBA', sport: 'basketball' },
    { id: 'nfl', name: 'NFL', sport: 'football' },
  ];
  const TICKET = { MAX_LEGS: 10, MIN_ODD: 1.30, MIN_P: 0.62, HOUSE_MARGIN: 1.06 };

  // Mercados de fútbol que sí ofrecen Draftea / Novibet casi siempre.
  const SOCCER_LEG_IDS = ['1', '2', '1X', 'X2', '12', 'O1.5', 'O2.5', 'U2.5', 'U3.5', 'BTTS', 'NBTTS', 'H0.5', 'A0.5', '1&O1.5', '2&O1.5'];

  function decOdds(o, flip) {
    if (!o) return {};
    const d = v => M.americanToDecimal(v);
    const r = { '1': d(flip ? o.ml.away : o.ml.home), 'X': d(o.ml.draw), '2': d(flip ? o.ml.home : o.ml.away) };
    if (o.total && o.total.line === 2.5) { r['O2.5'] = d(o.total.over); r['U2.5'] = d(o.total.under); }
    for (const k of Object.keys(r)) if (!r[k]) delete r[k];
    return r;
  }

  function formArr(str) { return String(str || '').toUpperCase().replace(/[^WDL]/g, '').split('').slice(-5); }

  // Analiza un partido de fútbol solo con tabla + forma + momios del calendario (2 llamadas por liga).
  function soccerMatch(ev, st, avg, cons, cls, h2hGames) {
    const C = root.RadarContext || (typeof require !== 'undefined' ? require('./context.js') : null);
    const motH = cls ? cls.get(ev.homeId) || null : null, motA = cls ? cls.get(ev.awayId) || null : null;
    const th = st.get(ev.homeId), ta = st.get(ev.awayId);
    if (!th || !ta || !th.gp || !ta.gp) return null;
    const odds = decOdds(ev.odds, false);
    const inp = {
      avg,
      home: { team: th, form: M.formFactor(formArr(ev.homeForm), th.pts / th.gp), motiveF: C ? C.factor(motH) : 1 },
      away: { team: ta, form: M.formFactor(formArr(ev.awayForm), ta.pts / ta.gp), motiveF: C ? C.factor(motA) : 1 },
    };
    const h2hS = h2hGames && h2hGames.length ? M.h2hSummary(h2hGames, ev.homeId) : null;
    if (h2hS) inp.h2h = { n: h2hS.n, gH: h2hS.gH, gA: h2hS.gA };
    let market = odds['1'] && odds['X'] && odds['2'] ? { odds1: odds['1'], oddsX: odds['X'], odds2: odds['2'], over25: odds['O2.5'], under25: odds['U2.5'] } : null;
    if (cons) {
      market = { odds1: 1 / cons.probs[0], oddsX: 1 / cons.probs[1], odds2: 1 / cons.probs[2] };
      if (cons.over25) { market.over25 = 1 / cons.over25; market.under25 = 1 / (1 - cons.over25); }
    }
    const res = M.analyze(inp, market, { home: shortName(ev.homeName), away: shortName(ev.awayName) });
    const by = id => res.markets.find(m => m.id === id);
    const p1 = by('1').p, px = by('X').p, p2 = by('2').p;
    let winner;
    if (p1 >= p2 && p1 >= px) winner = { id: '1', label: `Gana ${shortName(ev.homeName)}`, p: p1 };
    else if (p2 >= p1 && p2 >= px) winner = { id: '2', label: `Gana ${shortName(ev.awayName)}`, p: p2 };
    else winner = { id: 'X', label: 'Empate', p: px };
    // Si el favorito no llega a 50%, la recomendación es doble oportunidad.
    let safe = winner;
    if (winner.p < 0.5) safe = winner.id === '2' ? { id: 'X2', label: by('X2').label, p: by('X2').p } : { id: '1X', label: by('1X').label, p: by('1X').p };
    const legs = res.markets.filter(m => SOCCER_LEG_IDS.includes(m.id)).map(m => legOf(m, odds[m.id]));
    return { ev, res, odds, winner, safe, legs, hasMarket: !!market, cons: cons || null, top: res.topScores[0], motH, motA, h2hS };
  }

  function legOf(m, odd) {
    const est = odd || m.fair / TICKET.HOUSE_MARGIN; // si no hay momio real, estimación con margen típico
    const v = M.verdict(m, odd);
    return { id: m.id, label: m.label, p: m.p, worst: m.worst, odd: odd || null, est, ev: odd ? m.p * odd : null, tag: v.tag, minNeeded: v.minNeeded };
  }

  // NBA / NFL: probabilidad de la casa sin margen (sin modelo propio todavía).
  function usMatch(ev) {
    const o = ev.odds;
    if (!o) return { ev, legs: [], winner: null, hasMarket: false };
    const dh = M.americanToDecimal(o.ml.home), da = M.americanToDecimal(o.ml.away);
    if (!dh || !da) return { ev, legs: [], winner: null, hasMarket: false };
    const nv = M.noVig([dh, da]);
    const mk = (id, label, p, odd) => ({ id, label, p, worst: p, odd, est: odd, ev: p * odd, tag: (p >= 0.45 && p <= 0.55) ? 'volado' : odd < TICKET.MIN_ODD ? 'momio-bajo' : 'mercado', minNeeded: Math.max(TICKET.MIN_ODD, 1 / p) });
    const legs = [mk('1', `Gana ${shortName(ev.homeName)}`, nv.probs[0], dh), mk('2', `Gana ${shortName(ev.awayName)}`, nv.probs[1], da)];
    const w = legs[0].p >= legs[1].p ? legs[0] : legs[1];
    return { ev, legs, winner: { id: w.id, label: w.label, p: w.p }, safe: { id: w.id, label: w.label, p: w.p }, hasMarket: true, us: true, total: o.total && o.total.line };
  }

  function shortName(n) { return String(n || '').replace(/^(FC|CF|AC|AS|SC|SV|1\. FC|TSG|VfB|RB)\s+/, '').replace(/\s+(FC|CF|UANL)$/, ''); }

  // Elige la mejor selección de cada partido (una por partido: selecciones del mismo partido se mueven juntas).
  function bestLeg(match, rules = TICKET) {
    const ok = match.legs.filter(l => l.tag !== 'volado' && l.tag !== 'momio-bajo' && l.est >= TICKET.MIN_ODD && l.p >= rules.MIN_P);
    if (!ok.length) return null;
    // Prioridad: valor real con momio > probabilidad en el peor caso.
    ok.sort((a, b) => ((b.ev && b.ev >= M.CFG.VALUE_EV) - (a.ev && a.ev >= M.CFG.VALUE_EV)) || (b.worst - a.worst) || (b.p - a.p));
    return ok[0];
  }

  function buildTicket(matches, rules = TICKET) {
    const cands = [];
    for (const m of matches) {
      const leg = bestLeg(m, rules);
      if (leg) cands.push({ match: m, leg });
    }
    cands.sort((a, b) => b.leg.worst - a.leg.worst || b.leg.p - a.leg.p);
    const legs = cands.slice(0, rules.MAX_LEGS);
    const p = legs.reduce((s, x) => s * x.leg.p, 1);
    const odd = legs.reduce((s, x) => s * (x.leg.odd || x.leg.minNeeded), 1);
    return { legs, p, odd, skipped: cands.length - legs.length, rules };
  }

  function valuePicks(matches) {
    const out = [];
    for (const m of matches) for (const l of m.legs) if (l.odd && l.ev >= M.CFG.VALUE_EV && l.tag !== 'volado' && l.p >= 0.6 && l.odd >= TICKET.MIN_ODD && !m.us) out.push({ match: m, leg: l });
    return out.sort((a, b) => b.leg.ev - a.leg.ev).slice(0, 10);
  }

  // ¿Cómo le fue al modelo hoy? Revisa la selección que habría sugerido en cada partido ya jugado.
  function reviewPlayed(played) {
    const defs = M.marketDefs('L', 'V');
    const fnOf = id => (defs.find(d => d.id === id) || {}).fn;
    const legs = [], surprises = [];
    for (const m of played) {
      const hs = m.ev.hs, as = m.ev.as;
      if (hs == null || as == null) continue;
      m.result = `${hs}-${as}`;
      const leg = m.legs && m.legs.length ? bestLeg(m) : null;
      if (leg) {
        const fn = m.us ? (leg.id === '1' ? (h, a) => h > a : (h, a) => a > h) : fnOf(leg.id);
        if (fn) { const hit = !!fn(hs, as); legs.push({ match: m, leg, hit }); m.reviewLeg = { label: leg.label, p: leg.p, hit }; }
      }
      if (m.winner && m.winner.p >= 0.6) {
        const w = m.winner.id, ok = w === '1' ? hs > as : w === '2' ? as > hs : hs === as;
        if (!ok) surprises.push({ match: m, label: m.winner.label, p: m.winner.p });
      }
    }
    const n = legs.length, hits = legs.filter(x => x.hit).length;
    const expected = n ? legs.reduce((a, x) => a + x.leg.p, 0) / n : null;
    return { n, hits, rate: n ? hits / n : null, expected, legs, surprises };
  }

  // Estrategia "dentro de lo seguro": si hoy el modelo falla más de lo normal, se suben los filtros.
  function strategy(review) {
    const r = { ...TICKET, mode: 'normal', why: 'Sin partidos jugados hoy para comparar: reglas normales.' };
    if (!review || review.n < 3) return r;
    const gap = review.expected - review.rate;
    if (gap > 0.15 || review.surprises.length >= 3) {
      return { ...r, MIN_P: 0.72, MAX_LEGS: 4, mode: 'defensivo', why: `Día de sorpresas: acertó ${review.hits} de ${review.n} selecciones (esperaba ${(review.expected * 100).toFixed(0)}%) y ${review.surprises.length} favorito(s) cayeron. Ticket corto y solo selecciones ≥ 72%.` };
    }
    if (gap > 0.05) {
      return { ...r, MIN_P: 0.67, MAX_LEGS: 6, mode: 'cauteloso', why: `Hoy acertó ${review.hits} de ${review.n} selecciones, un poco menos de lo esperado. Selecciones ≥ 67% y máximo 6.` };
    }
    return { ...r, mode: 'normal', why: `Hoy el modelo va bien: ${review.hits} de ${review.n} selecciones acertadas (esperaba ${(review.expected * 100).toFixed(0)}%). Reglas normales.` };
  }

  function ymd(dateStr) { return String(dateStr).replace(/-/g, ''); }

  // leagues: array de ids (fútbol) o 'nba' / 'nfl'
  async function runDay(dateStr, leagueIds, onProgress) {
    const date = ymd(dateStr);
    const out = [], errors = [];
    let done = 0;
    await Promise.all(leagueIds.map(async lg => {
      try {
        const us = US.find(u => u.id === lg);
        if (us) {
          const d = await D.get(`apis/site/v2/sports/${us.sport}/${lg}/scoreboard`, { dates: date });
          for (const e of (d.events || []).map(D.parseEvent)) out.push({ league: us.name, lg, ...usMatch(e) });
        } else {
          const d = await D.get(`apis/site/v2/sports/soccer/${lg}/scoreboard`, { dates: date });
          const evs = (d.events || []).map(D.parseEvent);
          if (evs.length) {
            const st = await D.standings(lg);
            const avg = M.leagueAverage([...st.values()]);
            const Cx = root.RadarContext || (typeof require !== 'undefined' ? require('./context.js') : null);
            const cls = Cx ? Cx.classify([...st.values()], lg) : null;
            const name = (D.LEAGUES.find(l => l.id === lg) || {}).name || lg;
            // Por partido: consenso de casas y, si aún no empieza, sus últimos 5 enfrentamientos (en paralelo).
            const rs = await Promise.all(evs.map(async e => {
              const up = !e.completed && e.state !== 'in';
              const [cons, hh] = await Promise.all([
                D.consensus ? D.consensus(lg, e.homeName, e.awayName, e.date).catch(() => null) : null,
                up && D.h2h ? D.h2h(lg, e.homeId, e.awayId).catch(() => []) : [],
              ]);
              const r = soccerMatch(e, st, avg, cons, cls, hh);
              return r ? { league: name, lg, h2hGames: hh, ...r } : { league: name, lg, ev: e, legs: [], winner: null, noData: true };
            }));
            out.push(...rs);
          }
        }
      } catch (e) { errors.push(`${lg}: ${e.message}`); }
      done++; if (onProgress) onProgress(done, leagueIds.length);
    }));
    out.sort((a, b) => new Date(a.ev.date) - new Date(b.ev.date));
    // Solo entran al ticket los partidos que no han empezado.
    const now = Date.now();
    const upcoming = out.filter(m => !m.ev.completed && m.ev.state !== 'in' && new Date(m.ev.date).getTime() > now);
    const live = out.filter(m => !m.ev.completed && (m.ev.state === 'in' || (m.ev.state !== 'post' && new Date(m.ev.date).getTime() <= now)));
    const played = out.filter(m => m.ev.completed);
    const review = reviewPlayed(played);
    const rules = strategy(review);
    return { matches: upcoming, live, played, review, rules, ticket: buildTicket(upcoming, rules), value: valuePicks(upcoming), errors };
  }

  // "Más selecciones seguras": en cada partido la selección MÁS probable que aún pague al menos minOdd,
  // y combinaciones de 1, 2, 3… partidos (de la más segura a la menos). Cada selección extra multiplica la
  // probabilidad hacia abajo y suma el margen de la casa.
  function safeLadder(matches, minOdd = TICKET.MIN_ODD, maxN = 8) {
    const picks = [];
    for (const m of matches) {
      const ok = (m.legs || []).filter(l => l.tag !== 'volado' && (l.odd || l.est) >= minOdd && l.p > 0.55);
      if (!ok.length) continue;
      ok.sort((a, b) => b.p - a.p || b.worst - a.worst);
      picks.push({ match: m, leg: ok[0] });
    }
    picks.sort((a, b) => b.leg.p - a.leg.p);
    const rows = [];
    let p = 1, odd = 1, real = 0;
    for (let i = 0; i < Math.min(maxN, picks.length); i++) {
      const L = picks[i].leg, o = L.odd || L.est;
      p *= L.p; odd *= o; if (L.odd) real++;
      rows.push({ n: i + 1, legs: picks.slice(0, i + 1), p, odd, ev: p * odd - 1, real });
    }
    return rows;
  }

  // "Mejor momio para tu riesgo": combinaciones (una selección por partido) con prob. total ≥ minP que
  // dan el momio total más alto, para 1…maxN selecciones. Programación dinámica sobre −log(prob).
  function bestCombos(matches, minP = 0.40, minOdd = TICKET.MIN_ODD, maxN = 6) {
    const STEP = 0.01, B = Math.ceil(-Math.log(minP) / STEP);
    const opts = [];
    for (const m of matches) {
      const ok = (m.legs || []).filter(l => l.tag !== 'volado' && (l.odd || l.est) >= minOdd && l.p > 0.55)
        .map(l => ({ match: m, leg: l, c: Math.ceil(-Math.log(l.p) / STEP), g: Math.log(l.odd || l.est) }));
      if (ok.length) opts.push(ok);
    }
    // dp[n][b] = mejor {g, picks} usando n selecciones con "costo" de probabilidad b.
    let dp = Array.from({ length: maxN + 1 }, () => new Array(B + 1).fill(null));
    dp[0][0] = { g: 0, picks: [] };
    for (const ok of opts) {
      const nx = dp.map(r => r.slice());
      for (let n = 0; n < maxN; n++) for (let b = 0; b <= B; b++) {
        const cur = dp[n][b]; if (!cur) continue;
        for (const o of ok) {
          const nb = b + o.c; if (nb > B) continue;
          const g = cur.g + o.g;
          if (!nx[n + 1][nb] || nx[n + 1][nb].g < g) nx[n + 1][nb] = { g, picks: [...cur.picks, o] };
        }
      }
      dp = nx;
    }
    const rows = [];
    for (let n = 1; n <= maxN; n++) {
      let best = null;
      for (const s of dp[n]) if (s && (!best || s.g > best.g)) best = s;
      if (!best) continue;
      const legs = best.picks.map(o => ({ match: o.match, leg: o.leg }));
      const p = legs.reduce((a, x) => a * x.leg.p, 1), odd = legs.reduce((a, x) => a * (x.leg.odd || x.leg.est), 1);
      if (p < minP) continue;
      rows.push({ n, legs, p, odd, ev: p * odd - 1, real: legs.filter(x => x.leg.odd).length });
    }
    return rows.sort((a, b) => b.odd - a.odd);
  }

  const api = { bestCombos, safeLadder, US, TICKET, runDay, reviewPlayed, strategy, soccerMatch, usMatch, buildTicket, bestLeg, valuePicks, shortName, formArr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarDay = api;
})(typeof window !== 'undefined' ? window : globalThis);
