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
    if (o.total && o.total.line) { const L = o.total.line; r['O' + L] = d(o.total.over); r['U' + L] = d(o.total.under); }
    // Doble oportunidad derivada del 1X2 de la casa (mismo margen): así el ticket muestra momio de mercado, no estimado.
    if (r['1'] && r['X'] && r['2']) {
      const q = k => 1 / r[k];
      r['1X'] = 1 / (q('1') + q('X')); r['X2'] = 1 / (q('X') + q('2')); r['12'] = 1 / (q('1') + q('2'));
    }
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

  // Córners y tarjetas (props.js): solo en las ligas donde el backtest los validó (5 grandes de Europa, 3,800 partidos).
  // Momio siempre estimado (no hay fuente gratis) y un poco menos de confianza: "peor caso" 4 puntos abajo.
  const PROP_LGS = ['eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1'];
  const PROP_GROUPS = ['Córners', 'Tarjetas'];
  // Líneas que Draftea no ofrece (reportado por Roberto, 21-nov): no se sugieren.
  const NOT_IN_DRAFTEA = new Set(['K<5.5', 'K>5.5']);
  function propLegs(ev, avgs, lg) {
    const P = root.RadarProps;
    if (!P || !avgs) return [];
    return P.markets(ev, avgs, lg, shortName(ev.homeName), shortName(ev.awayName)).filter(x => PROP_GROUPS.includes(x.group) && !NOT_IN_DRAFTEA.has(x.id)).map(x => {
      const est = x.fair / P.PROP_MARGIN, vol = x.p >= 0.45 && x.p <= 0.55;
      return { id: x.id, label: x.label, group: x.group, p: x.p, worst: x.p - 0.04, odd: null, est, ev: null, prop: true,
        tag: vol ? 'volado' : est < TICKET.MIN_ODD ? 'momio-bajo' : 'estimado', minNeeded: Math.max(TICKET.MIN_ODD, 1 / x.p) };
    });
  }

  // NBA / NFL: probabilidad de la casa sin margen. NBA además: modelo de puntos por equipo (nba.js), mezclado 50/50.
  const NB = root.RadarNBA || (typeof require !== 'undefined' ? require('./nba.js') : null);
  // Hándicap del local: primero "details" ("BOS -10.5", sin ambigüedad), si no, el campo spread.
  function homeSpread(ev) {
    const o = ev.odds || {}, d = String(o.details || '').trim();
    const mt = d.match(/^([A-Z]{2,4})\s+([-+]?\d+(?:\.\d+)?)$/);
    if (mt) { const v = +mt[2]; if (mt[1] === ev.homeAbbr) return v; if (mt[1] === ev.awayAbbr) return -v; }
    if (/^even|^pk/i.test(d)) return 0;
    return o.spread && o.spread.home != null ? o.spread.home : null;
  }
  const half = x => Math.round(x * 2) / 2 + (Number.isInteger(Math.round(x * 2) / 2) ? 0.5 : 0); // a .5 para que no haya empate
  function usMatch(ev, nba) {
    const o = ev.odds;
    const dh = o && M.americanToDecimal(o.ml.home), da = o && M.americanToDecimal(o.ml.away);
    const hasML = !!(dh && da);
    if (!hasML && !nba) return { ev, legs: [], winner: null, hasMarket: false };
    const tagOf = (p, odd) => (p >= 0.45 && p <= 0.55) ? 'volado' : odd < TICKET.MIN_ODD ? 'momio-bajo' : odd === null ? 'estimado' : 'mercado';
    const mk = (id, label, p, odd, fn, group = 'Ganador') => {
      const est = odd || (1 / p) / TICKET.HOUSE_MARGIN;
      return { id, label, p, worst: p, odd: odd || null, est, ev: odd ? p * odd : null, tag: tagOf(p, odd || est), minNeeded: Math.max(TICKET.MIN_ODD, 1 / p), fn, group };
    };
    const H = shortName(ev.homeName), A = shortName(ev.awayName);
    const sp = homeSpread(ev), tot = o && o.total && o.total.line;
    const pr = nba && NB ? NB.project(nba.home, nba.away, { spread: sp, total: tot }) : null;
    let p1, p2;
    if (hasML) {
      const nv = M.noVig([dh, da]);
      p1 = pr ? (1 - NB.CFG.W_MARKET) * NB.phi(pr.mModel / NB.CFG.SD_MARGIN) + NB.CFG.W_MARKET * nv.probs[0] : nv.probs[0];
    } else if (pr) p1 = pr.pHome; else p1 = 0.5;
    p2 = 1 - p1;
    const legs = [mk('1', `Gana ${H}`, p1, hasML ? dh : null, (h, a) => h > a), mk('2', `Gana ${A}`, p2, hasML ? da : null, (h, a) => a > h)];
    if (pr) {
      // Hándicap corto del favorito (mitad de la línea): paga más que ganar y evita los -10+ (lección T1).
      if (sp != null && Math.abs(sp) >= 3) {
        const favHome = sp < 0, line = half(Math.min(Math.abs(sp) / 2, NB.CFG.MAX_SPREAD));
        const p = favHome ? NB.pHomeBy(pr, line) : 1 - NB.pHomeBy(pr, -line);
        legs.push(mk(favHome ? 'S1' : 'S2', `${favHome ? H : A} -${line}`, p, null, favHome ? (h, a) => h - a > line : (h, a) => a - h > line, 'Hándicap'));
      }
      // Totales alternos: línea de la casa ± 6.5 (≈ 63%) y ± 10.5 (≈ 71%).
      if (tot) for (const d of [6.5, 10.5]) {
        const lo = tot - d, hi = tot + d;
        legs.push(mk('O' + lo, `Más de ${lo} puntos`, NB.pOver(pr, lo), null, (h, a) => h + a > lo, 'Puntos'));
        legs.push(mk('U' + hi, `Menos de ${hi} puntos`, 1 - NB.pOver(pr, hi), null, (h, a) => h + a < hi, 'Puntos'));
      }
    }
    const w = legs[0].p >= legs[1].p ? legs[0] : legs[1];
    const info = nba ? { home: nba.home, away: nba.away, proj: pr, spread: sp } : null;
    return { ev, legs, winner: { id: w.id, label: w.label, p: w.p }, safe: { id: w.id, label: w.label, p: w.p }, hasMarket: hasML, us: true, total: tot, nba: info };
  }

  // Racha y puntos de los dos equipos (calendario de ESPN de cada uno).
  async function nbaInfo(ev) {
    if (!NB) return null;
    const sch = id => D.get(`apis/site/v2/sports/basketball/nba/teams/${id}/schedule`).then(d => (d.events || []).map(D.parseEvent));
    const [eh, ea] = await Promise.all([sch(ev.homeId), sch(ev.awayId)]);
    const home = NB.teamStats(eh, ev.homeId), away = NB.teamStats(ea, ev.awayId);
    return home && away ? { home, away } : null;
  }

  function shortName(n) { return String(n || '').replace(/^(FC|CF|AC|AS|SC|SV|1\. FC|TSG|VfB|RB)\s+/, '').replace(/\s+(FC|CF|UANL)$/, ''); }

  // SGP: varias selecciones del mismo partido no se pagan multiplicando; Draftea cobra según la prob. conjunta
  // (mismo criterio que la calculadora): producto × (prob. independiente ÷ conjunta) × 0.95.
  function sgpOdd(legs, pJoint) {
    const prod = legs.reduce((a, l) => a * (l.odd || l.est), 1);
    if (legs.length < 2 || !(pJoint > 0)) return prod;
    const ind = legs.reduce((a, l) => a * l.p, 1);
    return Math.max(1.01, prod * Math.min(1, ind / pJoint) * 0.95);
  }

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
        const fn = m.us ? leg.fn : fnOf(leg.id);
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
          const evs = (d.events || []).map(D.parseEvent);
          const rs = await Promise.all(evs.map(async e => {
            const nb = lg === 'nba' && !e.completed ? await nbaInfo(e).catch(() => null) : null;
            return { league: us.name, lg, ...usMatch(e, nb) };
          }));
          out.push(...rs);
        } else {
          const d = await D.get(`apis/site/v2/sports/soccer/${lg}/scoreboard`, { dates: date });
          const evs = (d.events || []).map(D.parseEvent);
          if (evs.length) {
            const st = await D.standings(lg);
            const avg = M.leagueAverage([...st.values()]);
            const Cx = root.RadarContext || (typeof require !== 'undefined' ? require('./context.js') : null);
            const cls = Cx ? Cx.classify([...st.values()], lg) : null;
            const name = (D.LEAGUES.find(l => l.id === lg) || {}).name || lg;
            const anyUp = evs.some(e => !e.completed && e.state !== 'in');
            // Ligas fuera del backtest: solo entran los grupos que pasaron la autovalidación (se corre en segundo plano).
            let groups = PROP_LGS.includes(lg) ? PROP_GROUPS : [];
            if (!groups.length && anyUp && root.RadarProps && root.RadarProps.selfCheck) {
              const ck = root.RadarProps.cachedCheck(lg);
              const ck2 = ck || await Promise.race([root.RadarProps.selfCheck(lg).catch(() => null), new Promise(r => setTimeout(() => r(null), 25000))]);
              if (ck2) groups = PROP_GROUPS.filter(g => ck2[g] && ck2[g].ok);
            }
            const pAvgs = anyUp && groups.length && root.RadarProps ? await root.RadarProps.leagueHistory(lg).catch(() => null) : null;
            // Por partido: consenso de casas y, si aún no empieza, sus últimos 5 enfrentamientos (en paralelo).
            const rs = await Promise.all(evs.map(async e => {
              const up = !e.completed && e.state !== 'in';
              const [cons, hh] = await Promise.all([
                D.consensus ? D.consensus(lg, e.homeName, e.awayName, e.date).catch(() => null) : null,
                up && D.h2h ? D.h2h(lg, e.homeId, e.awayId).catch(() => []) : [],
              ]);
              const r = soccerMatch(e, st, avg, cons, cls, hh);
              if (r && up && pAvgs) r.legs.push(...propLegs(e, pAvgs, lg).filter(l => groups.includes(l.group)));
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

  // Parlay soñador: la combinación MÁS PROBABLE (una selección por partido) cuyo momio total llega al objetivo.
  // Maximiza la suma de log(prob) con la condición de que la suma de log(momio) alcance log(objetivo).
  // Parlay soñador: MUCHAS selecciones, cada una con probabilidad individual alta (piso minP, sin sorpresas),
  // hasta llegar al momio objetivo con la mayor probabilidad total. Máx. perMatch por partido: la segunda solo si es de
  // otro grupo y no va en contra de la primera (con goles se mide en la matriz de marcadores).
  function dreamParlay(matches, targetOdd, opts = {}) {
    if (typeof opts === 'number') opts = { maxN: opts };
    const minP = opts.minP ?? 0.65, perMatch = opts.perMatch ?? 2, maxN = opts.maxN ?? 20;
    const STEP = 0.02, G = Math.ceil(Math.log(targetOdd) / STEP);
    const defs = {}; for (const d of M.marketDefs('L', 'V')) defs[d.id] = d.fn;
    const groupOf = l => l.group || (l.prop ? 'Conteo' : ({ '1': 'R', 'X': 'R', '2': 'R', '1X': 'R', 'X2': 'R', '12': 'R' }[l.id] || (/^(1|2|1X|X2|12)&/.test(l.id) ? 'R' : 'Goles')));
    const opt = (m, legs, p) => {
      const odd = sgpOdd(legs, p);
      return { match: m, legs, p, odd, n: legs.length, w: Math.max(1, Math.round(Math.log(odd) / STEP)), lp: Math.log(p) };
    };
    const per = [];
    for (const m of matches) {
      const ok = (m.legs || []).filter(l => l.p >= minP && (l.odd || l.est) >= 1.10 && l.tag !== 'volado');
      if (!ok.length) continue;
      const os = ok.map(l => opt(m, [l], l.p));
      if (perMatch >= 2) {
        const mat = m.res && M.scoreMatrix ? M.scoreMatrix(m.res.lh, m.res.la) : null;
        for (let a = 0; a < ok.length; a++) for (let b = a + 1; b < ok.length; b++) {
          const A = ok[a], B = ok[b];
          if (groupOf(A) === groupOf(B)) continue;
          let p = A.p * B.p; // córners/tarjetas con goles: casi independientes
          if (defs[A.id] && defs[B.id] && mat) {
            p = M.sumWhere(mat, (h, x) => defs[A.id](h, x) && defs[B.id](h, x));
            if (p < A.p * B.p * 0.98) continue; // van en contra: no se combinan
            p = Math.min(p, A.p, B.p);
          }
          os.push(opt(m, [A, B], p));
        }
      }
      per.push(os);
    }
    // dp[n][b] = mejor {lp, picks} con n selecciones y b pasos de momio (b = G: ya llegó).
    let dp = Array.from({ length: maxN + 1 }, () => new Array(G + 1).fill(null));
    dp[0][0] = { lp: 0, picks: [] };
    for (const os of per) {
      const nx = dp.map(r => r.slice());
      for (let n = 0; n < maxN; n++) for (let b = 0; b <= G; b++) {
        const cur = dp[n][b]; if (!cur) continue;
        for (const o of os) {
          const nn = n + o.n; if (nn > maxN) continue;
          const nb = Math.min(G, b + o.w), lp = cur.lp + o.lp;
          if (!nx[nn][nb] || nx[nn][nb].lp < lp) nx[nn][nb] = { lp, picks: [...cur.picks, o] };
        }
      }
      dp = nx;
    }
    let best = null, reached = true;
    for (let n = 1; n <= maxN; n++) if (dp[n][G] && (!best || dp[n][G].lp > best.lp)) best = dp[n][G];
    if (!best) { // no llega: el máximo momio posible con estas reglas
      reached = false;
      for (let b = G; b > 0 && !best; b--) for (let n = 1; n <= maxN; n++) if (dp[n][b] && (!best || dp[n][b].lp > best.lp)) best = dp[n][b];
    }
    if (!best) return null;
    const legs = best.picks.flatMap(o => o.legs.map(l => ({ match: o.match, leg: l })));
    const p = Math.exp(best.lp), odd = best.picks.reduce((a, o) => a * o.odd, 1);
    return { legs, p, odd, ev: p * odd - 1, real: legs.filter(x => x.leg.odd).length, reached, minLeg: Math.min(...legs.map(x => x.leg.p)), matches: best.picks.length };
  }

  // Ticket de N selecciones exactas (para boosts tipo "parlay de 10 selecciones +80%"): la combinación MÁS PROBABLE.
  // perMatch 1 = un partido por selección; 2–3 = pocos partidos con varias selecciones (SGP, prob. conjunta con la matriz).
  function pickN(matches, n, opts = {}) {
    const minP = opts.minP ?? 0.65, perMatch = opts.perMatch ?? 1, minOdd = opts.minOdd ?? 1.20;
    const defs = {}; for (const d of M.marketDefs('L', 'V')) defs[d.id] = d.fn;
    const groupOf = l => l.group || (l.prop ? 'Conteo' : ({ '1': 'R', 'X': 'R', '2': 'R', '1X': 'R', 'X2': 'R', '12': 'R' }[l.id] || (/^(1|2|1X|X2|12)&/.test(l.id) ? 'R' : 'Goles')));
    const per = [];
    for (const m of matches) {
      const ban = opts.ban || new Set(), mk = `${m.lg}:${m.ev.homeId}:${m.ev.awayId}`;
      const ok = (m.legs || []).filter(l => !ban.has(`${mk}:${l.id}`) && l.p >= minP && (l.odd || l.est) >= minOdd && l.tag !== 'volado').sort((a, b) => b.p - a.p).slice(0, 8);
      if (!ok.length) continue;
      const mat = m.res && M.scoreMatrix ? M.scoreMatrix(m.res.lh, m.res.la) : null;
      const joint = legs => {
        // NBA/NFL: sin matriz de goles; selecciones casi independientes (ganador + hándicap del mismo equipo van juntas).
        const g = m.us ? [] : legs.filter(l => defs[l.id]), o = m.us ? legs : legs.filter(l => !defs[l.id]);
        let pg = 1;
        if (g.length > 1 && mat) pg = M.sumWhere(mat, (h, x) => g.every(l => defs[l.id](h, x)));
        else if (g.length === 1) pg = g[0].p;
        return o.reduce((a, l) => a * l.p, pg);
      };
      const os = ok.map(l => ({ legs: [l], p: l.p }));
      const sub = (start, cur) => {
        if (cur.length >= 2) {
          const p = joint(cur), ind = cur.reduce((a, l) => a * l.p, 1);
          if (p < ind * 0.98) return; // van en contra entre sí
          os.push({ legs: [...cur], p: Math.min(p, ...cur.map(l => l.p)) });
        }
        if (cur.length >= perMatch) return;
        for (let i = start; i < ok.length; i++) {
          if (cur.some(l => groupOf(l) === groupOf(ok[i]))) continue;
          if (m.us && cur.some(l => (l.id + ok[i].id).match(/^(2S1|S12|1S2|S21)$/))) continue; // ganador de uno + hándicap del otro: van en contra
          sub(i + 1, [...cur, ok[i]]);
        }
      };
      if (perMatch >= 2) sub(0, []);
      per.push(os.map(o => ({ ...o, match: m, odd: sgpOdd(o.legs, o.p), lp: Math.log(o.p) })));
    }
    // dp[k] = combinación más probable con k selecciones.
    let dp = new Array(n + 1).fill(null); dp[0] = { lp: 0, picks: [] };
    for (const os of per) {
      const nx = dp.slice();
      for (let k = 0; k < n; k++) { const cur = dp[k]; if (!cur) continue;
        for (const o of os) { const kk = k + o.legs.length; if (kk > n) continue; const lp = cur.lp + o.lp; if (!nx[kk] || nx[kk].lp < lp) nx[kk] = { lp, picks: [...cur.picks, o] }; } }
      dp = nx;
    }
    let k = n; while (k > 0 && !dp[k]) k--;
    if (!k) return null;
    const best = dp[k];
    const legs = best.picks.flatMap(o => o.legs.map(l => ({ match: o.match, leg: l })));
    const p = Math.exp(best.lp), odd = best.picks.reduce((a, o) => a * o.odd, 1);
    return { legs, p, odd, reached: k === n, n: k, real: legs.filter(x => x.leg.odd).length, minLeg: Math.min(...legs.map(x => x.leg.p)), matches: best.picks.length };
  }
  // Boost de Draftea: sube la ganancia (no la entrada) en ese %.
  const boosted = (odd, b) => 1 + (odd - 1) * (1 + (b || 0) / 100);

  const api = { sgpOdd, nbaInfo, homeSpread, NOT_IN_DRAFTEA, pickN, boosted, PROP_LGS, propLegs, dreamParlay, bestCombos, safeLadder, US, TICKET, runDay, reviewPlayed, strategy, soccerMatch, usMatch, buildTicket, bestLeg, valuePicks, shortName, formArr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarDay = api;
})(typeof window !== 'undefined' ? window : globalThis);
