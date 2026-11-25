// NFL v1: mercados completos a partir de los momios gratis de ESPN.
// 1) Junta TODAS las casas que trae ESPN (scoreboard + pickcenter del resumen) y llena los huecos de una con otra.
// 2) Si falta el ganador (moneyline), lo saca del hándicap; si falta el hándicap, lo saca del ganador.
// 3) Con margen = −hándicap y total = línea de la casa (normal), arma hándicap, alternos, totales y puntos por equipo.
// 4) Jugadores: últimos 6 box scores (yardas de pase/carrera/recepción, recepciones, pases completos, TD) + lesionados.
//    Momio real de props si ESPN lo publica (propBets de sports.core); si no, estimado.
// Sin backtest todavía (primera versión 25-nov-2026): guía, no modelo validado.
(function (root) {
  const CFG = {
    SD_MARGIN: 13.5,   // desviación del margen final en NFL (histórica ≈ 13–14)
    SD_TOTAL: 13.5,    // desviación del total de puntos
    SD_TEAM: 9.5,      // desviación de los puntos de un equipo
    DEFAULT_TOTAL: 44, // promedio de la liga si la casa no publica total
    MAX_SPREAD: 9.5,   // lección T1: hándicaps de -10 o más fallan por 1–2 puntos
    ALT_TOTAL: [7, 10],   // a ±7 ≈ 70% y ±10 ≈ 77% (líneas .5: sin empate)
  };

  function phi(x) {
    const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  // Inversa de phi (bisección: suficiente y sin dependencias).
  function invPhi(p) {
    p = Math.min(0.999, Math.max(0.001, p));
    let lo = -6, hi = 6;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (phi(m) < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function amToDec(ml) {
    if (ml === null || ml === undefined || ml === '') return null;
    const n = typeof ml === 'number' ? ml : parseFloat(String(ml).replace(/[^\d.+-]/g, ''));
    if (!isFinite(n) || n === 0 || Math.abs(n) < 100) return null;
    return n > 0 ? 1 + n / 100 : 1 + 100 / -n;
  }
  const numOr = x => { const n = typeof x === 'number' ? x : parseFloat(x); return isFinite(n) ? n : null; };

  // Hándicap del local desde "details" ("KC -7.5") o el campo spread.
  function homeSpreadOf(o, ev) {
    if (!o) return null;
    const d = String(o.details || '').trim();
    const mt = d.match(/^([A-Z]{2,4})\s+([-+]?\d+(?:\.\d+)?)$/);
    if (mt && ev) { const v = +mt[2]; if (mt[1] === ev.homeAbbr) return v; if (mt[1] === ev.awayAbbr) return -v; }
    if (/^even|^pk/i.test(d)) return 0;
    return o.spread && o.spread.home != null ? numOr(o.spread.home) : null;
  }

  // Une varias casas (ya pasadas por parseOdds): por campo, la primera que lo tenga.
  function mergeOdds(list, ev) {
    const xs = (list || []).filter(Boolean);
    if (!xs.length) return null;
    const first = f => { for (const o of xs) { const v = f(o); if (v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && !isFinite(v))) return { v, o }; } return { v: null, o: null }; };
    const mlH = first(o => o.ml && amToDec(o.ml.home) && amToDec(o.ml.away) ? o.ml.home : null);
    const sp = first(o => homeSpreadOf(o, ev));
    const tl = first(o => o.total && numOr(o.total.line));
    const books = [...new Set(xs.map(o => o.provider).filter(Boolean))];
    return {
      provider: books.join(', ') || 'Casa', books,
      ml: { home: mlH.v, away: mlH.o ? mlH.o.ml.away : null, draw: null },
      spread: { home: sp.v, homeOdds: sp.o && sp.o.spread ? sp.o.spread.homeOdds : null, awayOdds: sp.o && sp.o.spread ? sp.o.spread.awayOdds : null },
      total: { line: tl.v, over: tl.o ? tl.o.total.over : null, under: tl.o ? tl.o.total.under : null },
      details: sp.o ? sp.o.details || '' : '',
    };
  }

  // Margen (local − visita) y total esperados, solo con la casa.
  function project(o, ev) {
    if (!o) return null;
    const dh = amToDec(o.ml && o.ml.home), da = amToDec(o.ml && o.ml.away);
    const sp = homeSpreadOf(o, ev), tl = o.total ? numOr(o.total.line) : null;
    let pML = null;
    if (dh && da) { const a = 1 / dh, b = 1 / da; pML = a / (a + b); }
    if (sp == null && pML == null) return null;
    // Con los dos, el margen sale del hándicap (más estable) y el ganador del moneyline.
    const margin = sp != null ? -sp : CFG.SD_MARGIN * invPhi(pML);
    const pHome = pML != null ? pML : phi(margin / CFG.SD_MARGIN);
    const total = tl != null ? tl : CFG.DEFAULT_TOTAL;
    return { margin, total, pHome, spread: sp, line: tl, hasML: pML != null, ph: total / 2 + margin / 2, pa: total / 2 - margin / 2 };
  }
  const pHomeBy = (pr, x) => phi((pr.margin - x) / CFG.SD_MARGIN);
  const pOver = (pr, line) => phi((pr.total - line) / CFG.SD_TOTAL);
  const pTeamOver = (mean, line) => phi((mean - line) / CFG.SD_TEAM);
  const half = x => { const r = Math.round(x * 2) / 2; return Number.isInteger(r) ? r + 0.5 : r; };
  const sgn = x => (x > 0 ? '+' : '') + x;

  // Selecciones del partido. mk(id, label, p, odd|null, fn, group) lo pone day.js (mismas etiquetas que NBA).
  function legs(ev, o, mk, H, A) {
    const pr = project(o, ev);
    if (!pr) return { legs: [], proj: null };
    const out = [];
    const dh = amToDec(o.ml && o.ml.home), da = amToDec(o.ml && o.ml.away);
    out.push(mk('1', `Gana ${H}`, pr.pHome, pr.hasML ? dh : null, (h, a) => h > a));
    out.push(mk('2', `Gana ${A}`, 1 - pr.pHome, pr.hasML ? da : null, (h, a) => a > h));
    const sp = pr.spread;
    if (sp != null) {
      // Hándicap principal de la casa (≈ 50%: volado, pero con momio real).
      const so = o.spread || {};
      out.push(mk('SPH', `${H} ${sgn(sp)}`, pHomeBy(pr, -sp), amToDec(so.homeOdds), (h, a) => h - a + sp > 0, 'Hándicap'));
      out.push(mk('SPA', `${A} ${sgn(-sp)}`, 1 - pHomeBy(pr, -sp), amToDec(so.awayOdds), (h, a) => a - h - sp > 0, 'Hándicap'));
      const favHome = sp < 0, abs = Math.abs(sp);
      // Favorito con hándicap corto (mitad de la línea hacia abajo, tope 9.5): paga más que ganar. −7.5 → −3.5 (número clave 3).
      if (abs >= 3) {
        const line = Math.min(Math.floor(abs / 2) + 0.5, CFG.MAX_SPREAD);
        const p = favHome ? pHomeBy(pr, line) : 1 - pHomeBy(pr, -line);
        out.push(mk(favHome ? 'S1' : 'S2', `${favHome ? H : A} -${line}`, p, null, favHome ? (h, a) => h - a > line : (h, a) => a - h > line, 'Hándicap'));
      }
      // No favorito con colchón (+6.5 sobre la línea) ≈ 68%.
      const dl = half(abs + 6.5);
      const pd = favHome ? 1 - pHomeBy(pr, dl) : pHomeBy(pr, -dl);
      out.push(mk(favHome ? 'D2' : 'D1', `${favHome ? A : H} +${dl}`, pd, null, favHome ? (h, a) => a - h + dl > 0 : (h, a) => h - a + dl > 0, 'Hándicap'));
    }
    if (pr.line != null) {
      const t = o.total || {}, L = pr.line;
      out.push(mk('OT', `Más de ${L} puntos`, pOver(pr, L), amToDec(t.over), (h, a) => h + a > L, 'Puntos'));
      out.push(mk('UT', `Menos de ${L} puntos`, 1 - pOver(pr, L), amToDec(t.under), (h, a) => h + a < L, 'Puntos'));
      for (const d of CFG.ALT_TOTAL) {
        const lo = half(L - d), hi = half(L + d);
        out.push(mk('O' + lo, `Más de ${lo} puntos`, pOver(pr, lo), null, (h, a) => h + a > lo, 'Puntos'));
        out.push(mk('U' + hi, `Menos de ${hi} puntos`, 1 - pOver(pr, hi), null, (h, a) => h + a < hi, 'Puntos'));
      }
      // Puntos por equipo: línea ~6.5 abajo de lo esperado (≈ 75%).
      for (const [id, name, mean, fn] of [['TH', H, pr.ph, (h) => h], ['TA', A, pr.pa, (h, a) => a]]) {
        const line = Math.max(3.5, half(mean - 6.5));
        out.push(mk(id + line, `${name} más de ${line} puntos`, pTeamOver(mean, line), null, (h, a) => fn(h, a) > line, 'Puntos por equipo'));
      }
    }
    return { legs: out, proj: pr };
  }

  // ---------- Jugadores ----------
  const PCFG = {
    GAMES: 6, MIN_GP: 3, MIN_P: 0.60, MAX_P: 0.85,
    // Yardas: normal con desviación = max(piso, cv × media). Conteos: binomial negativa / Poisson.
    YDS: { passYds: { cv: 0.28, floor: 45 }, rushYds: { cv: 0.5, floor: 15 }, recYds: { cv: 0.55, floor: 14 } },
    MIN_VOL: { passYds: 150, rushYds: 25, recYds: 20, rec: 2, cmp: 12 }, // promedio mínimo para mostrar al jugador en ese mercado
    LINES: {
      passYds: [150, 175, 200, 225, 250, 275, 300], rushYds: [25, 40, 50, 60, 75, 90, 100], recYds: [20, 30, 40, 50, 60, 75, 90, 100],
      rec: [2, 3, 4, 5, 6, 7, 8], cmp: [12, 15, 18, 20, 22, 25], passTd: [1, 2, 3], td: [1],
    },
    LABEL: { passYds: 'yardas de pase', rushYds: 'yardas por tierra', recYds: 'yardas por recepción', rec: 'recepciones', cmp: 'pases completos', passTd: 'TD de pase', td: 'TD (anota en cualquier momento)' },
    DISP: { rec: 1.25, cmp: 1.3 },
  };
  const lgam = x => {
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgam(1 - x);
    x -= 1; let a = c[0]; const t = x + g + 0.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  };
  function pAtLeast(mu, k, disp = 1) {
    if (mu <= 0) return k <= 0 ? 1 : 0;
    let cdf = 0;
    if (disp <= 1.0001) { let term = Math.exp(-mu); for (let i = 0; i < k; i++) { cdf += term; term *= mu / (i + 1); } }
    else { const r = mu / (disp - 1), q = r / (r + mu); for (let i = 0; i < k; i++) cdf += Math.exp(lgam(i + r) - lgam(r) - lgam(i + 1) + r * Math.log(q) + i * Math.log(1 - q)); }
    return Math.max(0, Math.min(1, 1 - cdf));
  }
  // Yardas "X+" = más de X − 0.5 (las yardas son enteras).
  function pYds(k, mu, line) { const c = PCFG.YDS[k]; return phi((mu - (line - 0.5)) / Math.max(c.floor, c.cv * mu)); }

  // Box score NFL de ESPN → [{ id, name, team, passYds, cmp, passTd, rushYds, rushTd, rec, recYds, recTd }]
  function parseBox(summary) {
    const by = new Map();
    for (const t of ((summary && summary.boxscore) || {}).players || []) {
      const team = String(t.team && t.team.id);
      for (const st of t.statistics || []) {
        const grp = String(st.name || '').toLowerCase();
        if (!['passing', 'rushing', 'receiving'].includes(grp)) continue;
        const keys = (st.keys || st.names || []).map(k => String(k));
        const ix = k => keys.indexOf(k);
        for (const a of st.athletes || []) {
          const ath = a.athlete || {}, v = a.stats || [];
          const id = String(ath.id || ath.displayName);
          const n = i => (i >= 0 && v[i] != null ? parseFloat(String(v[i]).split('/')[0]) : 0) || 0;
          const r = by.get(id) || { id, name: ath.displayName || ath.shortName || '', team, passYds: 0, cmp: 0, passTd: 0, rushYds: 0, rushTd: 0, rec: 0, recYds: 0, recTd: 0, att: 0, car: 0 };
          if (grp === 'passing') {
            const ic = keys.findIndex(k => /^completions/i.test(k));
            r.cmp = n(ic); r.att = ic >= 0 && v[ic] ? parseFloat(String(v[ic]).split('/')[1]) || 0 : 0;
            r.passYds = n(ix('passingYards')); r.passTd = n(ix('passingTouchdowns'));
          } else if (grp === 'rushing') { r.car = n(ix('rushingAttempts')); r.rushYds = n(ix('rushingYards')); r.rushTd = n(ix('rushingTouchdowns')); }
          else { r.rec = n(ix('receptions')); r.recYds = n(ix('receivingYards')); r.recTd = n(ix('receivingTouchdowns')); }
          by.set(id, r);
        }
      }
    }
    return [...by.values()];
  }

  function parseInjuries(summary) {
    const m = new Map();
    for (const t of (summary && summary.injuries) || []) for (const i of t.injuries || []) {
      const a = i.athlete || {}, st = i.status || (i.type && i.type.description) || '';
      if (a.id) m.set(String(a.id), st); if (a.displayName) m.set(a.displayName, st);
    }
    return m;
  }

  // games: box scores del equipo (más reciente al final). real: Map de momios reales "id|mercado|línea" → decimal.
  function playerLines(games, teamId, injuries = new Map(), real = new Map()) {
    const id = String(teamId), by = new Map();
    games.forEach((box, gi) => {
      for (const r of box) if (r.team === id) {
        const p = by.get(r.id) || { id: r.id, name: r.name, rows: [], last: -1 };
        p.rows.push({ ...r, td: r.rushTd + r.recTd, gi }); p.last = gi; by.set(r.id, p);
      }
    });
    const out = [], lastGame = games.length - 1;
    for (const p of by.values()) {
      if (p.rows.length < PCFG.MIN_GP) continue;
      const st = injuries.get(p.id) || injuries.get(p.name) || '';
      const isOut = /^(out|injured reserve|ir|doubtful)$/i.test(st);
      const recent = p.rows.slice(-3), older = p.rows.slice(0, -3);
      const mean = k => {
        const a = recent.reduce((s, r) => s + (r[k] || 0), 0) / recent.length;
        if (!older.length) return a;
        return 0.6 * a + 0.4 * older.reduce((s, r) => s + (r[k] || 0), 0) / older.length;
      };
      const pl = { id: p.id, name: p.name, gp: p.rows.length, of: games.length, status: st, out: isOut, missedLast: p.last < lastGame, avg: {}, legs: [] };
      const add = (stat, line, pr) => {
        if (pr < PCFG.MIN_P || pr > PCFG.MAX_P) return;
        const odd = real.get(`${p.id}|${stat}|${line}`) || null;
        pl.legs.push({ stat, line, p: pr, odd, label: `${p.name} ${line}+ ${PCFG.LABEL[stat]}` });
      };
      for (const k of ['passYds', 'rushYds', 'recYds', 'rec', 'cmp', 'passTd', 'td']) pl.avg[k] = mean(k);
      if (!isOut) {
        for (const k of ['passYds', 'rushYds', 'recYds']) if (pl.avg[k] >= PCFG.MIN_VOL[k]) for (const L of PCFG.LINES[k]) add(k, L, pYds(k, pl.avg[k], L));
        for (const k of ['rec', 'cmp']) if (pl.avg[k] >= PCFG.MIN_VOL[k]) for (const L of PCFG.LINES[k]) add(k, L, pAtLeast(pl.avg[k], L, PCFG.DISP[k]));
        if (pl.avg.passYds >= PCFG.MIN_VOL.passYds) for (const L of PCFG.LINES.passTd) add('passTd', L, pAtLeast(pl.avg.passTd, L));
        // TD en cualquier momento: Poisson con su tasa reciente (casi nunca pasa de 60%, por eso rara vez aparece).
        add('td', 1, pAtLeast(pl.avg.td, 1));
      }
      // De cada mercado, solo las dos líneas más altas que pasan (las bajas pagan casi nada).
      pl.legs = [...new Set(pl.legs.map(l => l.stat))].flatMap(k => pl.legs.filter(l => l.stat === k).slice(-2));
      if (pl.legs.length || pl.out) out.push(pl);
    }
    const vol = pl => pl.avg.passYds + pl.avg.rushYds + pl.avg.recYds;
    return out.sort((a, b) => vol(b) - vol(a));
  }

  // ---------- Momios reales de props (ESPN core: propBets). Formato no documentado: lectura tolerante. ----------
  const TYPE_MAP = [
    [/passing yards/i, 'passYds'], [/rushing yards/i, 'rushYds'], [/receiving yards/i, 'recYds'],
    [/receptions/i, 'rec'], [/completions/i, 'cmp'], [/passing touchdowns|passing tds/i, 'passTd'], [/anytime touchdown|anytime td/i, 'td'],
  ];
  function parsePropBets(json) {
    const m = new Map();
    for (const it of (json && json.items) || []) {
      try {
        const tname = (it.type && (it.type.name || it.type.displayName)) || it.name || '';
        const stat = (TYPE_MAP.find(([re]) => re.test(tname)) || [])[1];
        if (!stat) continue;
        const ref = (it.athlete && (it.athlete.$ref || it.athlete.id)) || '';
        const aid = (String(ref).match(/athletes\/(\d+)/) || [])[1] || (/^\d+$/.test(String(ref)) ? String(ref) : null);
        if (!aid) continue;
        const am = it.odds && (it.odds.american ? (it.odds.american.value ?? it.odds.american) : it.odds.value);
        const dec = amToDec(am);
        if (!dec) continue;
        const tot = numOr(it.odds && it.odds.total && (it.odds.total.value ?? it.odds.total));
        const target = numOr(it.current && it.current.target && (it.current.target.value ?? it.current.target));
        // Línea "Over X.5" → "X+" ; anytime TD → 1+. Solo se guarda el lado "más de".
        const side = String((it.odds && it.odds.side) || it.side || '').toLowerCase();
        if (/under/.test(side)) continue;
        const raw = stat === 'td' ? 1 : (tot != null ? tot : target);
        if (raw == null) continue;
        const line = stat === 'td' ? 1 : Number.isInteger(raw) ? raw : Math.ceil(raw);
        m.set(`${aid}|${stat}|${line}`, dec);
      } catch (e) { /* sigue */ }
    }
    return m;
  }

  // Carga todo para un partido (panel Mercados). D = RadarData.
  async function playerProps(D, ev) {
    const sum = id => D.get('apis/site/v2/sports/football/nfl/summary', { event: id });
    const sch = id => D.get(`apis/site/v2/sports/football/nfl/teams/${id}/schedule`).then(d => (d.events || []).map(D.parseEvent));
    const lastIds = evs => evs.filter(e => e.completed).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-PCFG.GAMES).map(e => e.id);
    const [sh, sa, up, real] = await Promise.all([sch(ev.homeId), sch(ev.awayId), sum(ev.id).catch(() => null), realProps(D, ev.id).catch(() => new Map())]);
    const inj = parseInjuries(up);
    const boxes = async ids => (await Promise.all(ids.map(i => sum(i).then(parseBox).catch(() => null)))).filter(Boolean);
    const [bh, ba] = await Promise.all([boxes(lastIds(sh)), boxes(lastIds(sa))]);
    return { home: playerLines(bh, ev.homeId, inj, real), away: playerLines(ba, ev.awayId, inj, real), injuries: inj.size, realCount: real.size };
  }
  async function realProps(D, eventId) {
    if (!D.core) return new Map();
    const base = `v2/sports/football/leagues/nfl/events/${eventId}/competitions/${eventId}/odds`;
    const list = await D.core(base, { limit: 50 }).catch(() => null);
    const ids = [...new Set(((list && list.items) || []).map(x => (String((x.$ref || (x.provider && x.provider.$ref) || '')).match(/odds\/(\d+)/) || [])[1] || (x.provider && x.provider.id)).filter(Boolean))];
    for (const pid of ids.slice(0, 3)) {
      const j = await D.core(`${base}/${pid}/propBets`, { limit: 1000 }).catch(() => null);
      const m = parsePropBets(j);
      if (m.size) return m;
    }
    return new Map();
  }

  const api = { CFG, PCFG, phi, invPhi, amToDec, homeSpreadOf, mergeOdds, project, pHomeBy, pOver, legs, pAtLeast, pYds, parseBox, parseInjuries, playerLines, parsePropBets, playerProps };
  root.RadarNFL = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
