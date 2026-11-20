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
  function soccerMatch(ev, st, avg, cons) {
    const th = st.get(ev.homeId), ta = st.get(ev.awayId);
    if (!th || !ta || !th.gp || !ta.gp) return null;
    const odds = decOdds(ev.odds, false);
    const inp = {
      avg,
      home: { team: th, form: M.formFactor(formArr(ev.homeForm), th.pts / th.gp) },
      away: { team: ta, form: M.formFactor(formArr(ev.awayForm), ta.pts / ta.gp) },
    };
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
    return { ev, res, odds, winner, safe, legs, hasMarket: !!market, cons: cons || null, top: res.topScores[0] };
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

  // Elige la mejor pata de cada partido (una por partido: patas del mismo partido se mueven juntas).
  function bestLeg(match) {
    const ok = match.legs.filter(l => l.tag !== 'volado' && l.tag !== 'momio-bajo' && l.est >= TICKET.MIN_ODD && l.p >= TICKET.MIN_P);
    if (!ok.length) return null;
    // Prioridad: valor real con momio > probabilidad en el peor caso.
    ok.sort((a, b) => ((b.ev && b.ev >= M.CFG.VALUE_EV) - (a.ev && a.ev >= M.CFG.VALUE_EV)) || (b.worst - a.worst) || (b.p - a.p));
    return ok[0];
  }

  function buildTicket(matches) {
    const cands = [];
    for (const m of matches) {
      const leg = bestLeg(m);
      if (leg) cands.push({ match: m, leg });
    }
    cands.sort((a, b) => b.leg.worst - a.leg.worst || b.leg.p - a.leg.p);
    const legs = cands.slice(0, TICKET.MAX_LEGS);
    const p = legs.reduce((s, x) => s * x.leg.p, 1);
    const odd = legs.reduce((s, x) => s * (x.leg.odd || x.leg.minNeeded), 1);
    return { legs, p, odd, skipped: cands.length - legs.length };
  }

  function valuePicks(matches) {
    const out = [];
    for (const m of matches) for (const l of m.legs) if (l.odd && l.ev >= M.CFG.VALUE_EV && l.tag !== 'volado' && l.odd >= TICKET.MIN_ODD && !m.us) out.push({ match: m, leg: l });
    return out.sort((a, b) => b.leg.ev - a.leg.ev).slice(0, 10);
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
            const name = (D.LEAGUES.find(l => l.id === lg) || {}).name || lg;
            for (const e of evs) {
              const cons = D.consensus ? await D.consensus(lg, e.homeName, e.awayName, e.date).catch(() => null) : null;
              const r = soccerMatch(e, st, avg, cons);
              out.push(r ? { league: name, lg, ...r } : { league: name, lg, ev: e, legs: [], winner: null, noData: true });
            }
          }
        }
      } catch (e) { errors.push(`${lg}: ${e.message}`); }
      done++; if (onProgress) onProgress(done, leagueIds.length);
    }));
    out.sort((a, b) => new Date(a.ev.date) - new Date(b.ev.date));
    return { matches: out, ticket: buildTicket(out), value: valuePicks(out), errors };
  }

  const api = { US, TICKET, runDay, soccerMatch, usMatch, buildTicket, bestLeg, valuePicks, shortName, formArr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarDay = api;
})(typeof window !== 'undefined' ? window : globalThis);
