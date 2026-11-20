// Lectura de datos públicos de ESPN (gratis, sin API key) y normalización.
(function (root) {
  'use strict';

  const LEAGUES = [
    { id: 'mex.1', name: 'Liga MX' },
    { id: 'uefa.champions', name: 'Champions League' },
    { id: 'uefa.europa', name: 'Europa League' },
    { id: 'eng.1', name: 'Premier League' },
    { id: 'esp.1', name: 'LaLiga' },
    { id: 'ita.1', name: 'Serie A' },
    { id: 'ger.1', name: 'Bundesliga' },
    { id: 'fra.1', name: 'Ligue 1' },
    { id: 'ned.1', name: 'Eredivisie' },
    { id: 'por.1', name: 'Liga Portugal' },
    { id: 'mex.w.1', name: 'Liga MX Femenil' },
    { id: 'eng.w.1', name: 'WSL (femenil)' },
    { id: 'esp.w.1', name: 'Liga F (femenil)' },
    { id: 'usa.nwsl', name: 'NWSL (femenil)' },
    { id: 'uefa.wchampions', name: 'Champions femenil' },
  ];

  const DEMO = typeof location !== 'undefined' && /[?&]demo=1/.test(location.search);
  const cache = new Map();
  const TTL = 2 * 60 * 1000; // en el navegador, los datos se reutilizan máximo 2 minutos
  let freshToken = null;
  const state = { lastFetch: null };

  // Borra lo guardado y pide todo de nuevo a ESPN, saltando la caché del servidor.
  function refresh() { cache.clear(); freshToken = String(Date.now()); }

  async function get(path, params = {}) {
    const key = path + JSON.stringify(params);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < TTL) return hit.p;
    const p = (async () => {
      if (DEMO) {
        const name = path.replace(/^apis\/(site\/v2|v2)\/sports\/soccer\/[^/]+\//, '').replace(/\//g, '_') + (params.fixture ? '_fixture' : '') + (params.season ? '_prev' : '');
        const r = await fetch(`mock/${name}.json`);
        if (!r.ok) throw new Error('sin datos demo: ' + name);
        state.lastFetch = new Date();
        return r.json();
      }
      const qs = new URLSearchParams({ path, ...params, ...(freshToken ? { fresh: freshToken } : {}) });
      let r;
      try { r = await fetch(`/api/espn?${qs}`); } catch (e) { r = null; }
      if (!r || r.status === 404) {
        // Sin proxy (por ejemplo, abierto como archivo): intento directo.
        const q2 = new URLSearchParams(params).toString();
        r = await fetch(`https://site.api.espn.com/${path}${q2 ? '?' + q2 : ''}`);
      }
      if (!r.ok) throw new Error(`ESPN respondió ${r.status}`);
      const j = await r.json();
      state.lastFetch = new Date();
      return j;
    })();
    cache.set(key, { p, t: Date.now() });
    p.catch(() => cache.delete(key));
    return p;
  }

  const site = (lg, rest) => `apis/site/v2/sports/soccer/${lg}/${rest}`;

  function num(x) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') return x;
    if (typeof x === 'object') return num(x.value ?? x.displayValue);
    const n = parseFloat(String(x));
    return isFinite(n) ? n : null;
  }

  function logoOf(team) {
    if (!team) return '';
    if (typeof team.logo === 'string') return team.logo;
    return (team.logos && team.logos[0] && team.logos[0].href) || '';
  }

  async function teams(lg) {
    const d = await get(site(lg, 'teams'));
    const list = (((d.sports || [])[0] || {}).leagues || [])[0]?.teams || [];
    return list.map(({ team: t }) => ({
      id: String(t.id), name: t.displayName, short: t.shortDisplayName || t.displayName,
      abbr: t.abbreviation || '', nick: t.nickname || '', logo: logoOf(t),
    })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async function standings(lg) {
    const d = await get(`apis/v2/sports/soccer/${lg}/standings`);
    const groups = d.children && d.children.length ? d.children : [d];
    const out = new Map();
    for (const g of groups) {
      const entries = (g.standings && g.standings.entries) || [];
      for (const e of entries) {
        const s = {};
        for (const st of e.stats || []) if (st.name) s[st.name] = st.value;
        const w = s.wins || 0, dr = s.ties || 0, l = s.losses || 0;
        const gp = s.gamesPlayed || (w + dr + l);
        out.set(String(e.team.id), {
          teamId: String(e.team.id), name: e.team.displayName, gp,
          gf: s.pointsFor || 0, ga: s.pointsAgainst || 0, w, d: dr, l,
          pts: s.points != null ? s.points : 3 * w + dr, rank: s.rank || null, group: g.name || '', gd: s.pointDifferential != null ? s.pointDifferential : (s.pointsFor || 0) - (s.pointsAgainst || 0),
        });
      }
    }
    return out;
  }

  function parseEvent(ev) {
    const c = (ev.competitions || [])[0] || {};
    const comps = c.competitors || [];
    const home = comps.find(x => x.homeAway === 'home') || comps[0] || {};
    const away = comps.find(x => x.homeAway === 'away') || comps[1] || {};
    const status = (c.status || ev.status || {}).type || {};
    return {
      id: String(ev.id), date: ev.date, name: ev.name,
      completed: !!status.completed, state: status.state || '', detail: status.shortDetail || status.description || '',
      homeId: String(home.id || home.team?.id), awayId: String(away.id || away.team?.id),
      homeName: home.team?.displayName || '', awayName: away.team?.displayName || '',
      homeLogo: logoOf(home.team), awayLogo: logoOf(away.team),
      hs: num(home.score), as: num(away.score),
      homeSot: statOf(home, 'shotsOnTarget'), awaySot: statOf(away, 'shotsOnTarget'),
      stats: { home: statsObj(home), away: statsObj(away) },
      homeForm: typeof home.form === 'string' ? home.form : '', awayForm: typeof away.form === 'string' ? away.form : '',
      homeAbbr: home.team?.abbreviation || '', awayAbbr: away.team?.abbreviation || '',
      odds: parseOdds((c.odds || [])[0]),
      venue: c.venue?.fullName || '',
    };
  }

  function statOf(comp, name) {
    const st = (comp.statistics || []).find(x => x.name === name);
    return st ? num(st.displayValue ?? st.value) : null;
  }

  function statsObj(comp) {
    const o = {};
    for (const st of comp.statistics || []) if (st.name) { const v = num(st.displayValue ?? st.value); if (v != null) o[st.name] = v; }
    return Object.keys(o).length ? o : null;
  }

  function parseOdds(o) {
    if (!o) return null;
    const pick = (...xs) => xs.find(x => x !== undefined && x !== null && x !== '');
    const ml = {
      home: pick(o.homeTeamOdds?.moneyLine, o.moneyline?.home?.close?.odds, o.moneyline?.home?.open?.odds),
      draw: pick(o.drawOdds?.moneyLine, o.moneyline?.draw?.close?.odds, o.moneyline?.draw?.open?.odds),
      away: pick(o.awayTeamOdds?.moneyLine, o.moneyline?.away?.close?.odds, o.moneyline?.away?.open?.odds),
    };
    const total = {
      line: num(pick(o.overUnder, o.total?.over?.close?.line?.replace?.(/[ou]/i, ''))),
      over: pick(o.overOdds, o.total?.over?.close?.odds),
      under: pick(o.underOdds, o.total?.under?.close?.odds),
    };
    return { provider: o.provider?.displayName || o.provider?.name || 'Casa', ml, total };
  }

  async function schedule(lg, teamId, opts = {}) {
    const params = {};
    if (opts.fixture) params.fixture = 'true';
    if (opts.season) params.season = String(opts.season);
    const d = await get(site(lg, `teams/${teamId}/schedule`), params);
    return { season: d.season?.year || d.requestedSeason?.year || null, events: (d.events || []).map(parseEvent) };
  }

  // Fecha del calendario de ESPN (hora del este de EU) para un partido.
  function espnDay(iso) {
    try {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
      return p.replace(/-/g, '');
    } catch (e) { return String(iso).slice(0, 10).replace(/-/g, ''); }
  }

  // Remates a puerta por partido: vienen en el calendario del día (no en el resumen).
  // Devuelve todos los partidos terminados de la liga en esas fechas, con goles y remates a puerta.
  async function matchStats(lg, isoDates) {
    const days = [...new Set(isoDates.map(espnDay))].slice(0, 40);
    const out = new Map();
    for (let i = 0; i < days.length; i += 6) {
      const chunk = await Promise.all(days.slice(i, i + 6).map(d => get(site(lg, 'scoreboard'), { dates: d }).catch(() => ({ events: [] }))));
      for (const d of chunk) for (const ev of d.events || []) {
        const e = parseEvent(ev);
        if (e.completed && e.hs != null && e.homeSot != null && e.awaySot != null) out.set(e.id, e);
      }
    }
    return out;
  }

  // Estadísticas (córners, remates, tarjetas) de partidos concretos, leyendo el scoreboard de su día.
  async function statsFor(lg, games) {
    const list = await matchStatsFull(lg, (games || []).map(g => g.date).filter(Boolean));
    return new Map(list.map(e => [String(e.id), e]));
  }

  // Últimos 5 enfrentamientos directos en esta liga (esta temporada y la anterior).
  async function h2h(lg, hId, aId) {
    const sh = await schedule(lg, hId).catch(() => ({ events: [] }));
    const prev = sh.season ? await schedule(lg, hId, { season: sh.season - 1 }).catch(() => ({ events: [] })) : { events: [] };
    const seen = new Set();
    return [...sh.events, ...prev.events].filter(e => e.completed && e.hs != null && ((e.homeId === hId && e.awayId === aId) || (e.homeId === aId && e.awayId === hId)))
      .filter(e => !seen.has(e.id) && seen.add(e.id)).sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, 5);
  }

  // Todos los partidos terminados (con estadísticas) de la liga en esas fechas.
  async function matchStatsFull(lg, isoDates) {
    const days = [...new Set(isoDates.map(espnDay))].slice(0, 45);
    const out = [], seen = new Set();
    for (let i = 0; i < days.length; i += 7) {
      const chunk = await Promise.all(days.slice(i, i + 7).map(d => get(site(lg, 'scoreboard'), { dates: d }).catch(() => ({ events: [] }))));
      for (const d of chunk) for (const ev of d.events || []) {
        const e = parseEvent(ev);
        if (e.completed && !seen.has(e.id) && e.stats && e.stats.home && e.stats.away) { seen.add(e.id); out.push(e); }
      }
    }
    return out;
  }

  // Consenso de varias casas (opcional): solo si en Vercel existe ODDS_API_KEY (The Odds API, plan gratis).
  const ODDS_SPORT = {
    'mex.1': 'soccer_mexico_ligamx', 'uefa.champions': 'soccer_uefa_champs_league', 'uefa.europa': 'soccer_uefa_europa_league',
    'eng.1': 'soccer_epl', 'esp.1': 'soccer_spain_la_liga', 'ita.1': 'soccer_italy_serie_a', 'ger.1': 'soccer_germany_bundesliga',
    'fra.1': 'soccer_france_ligue_one', 'ned.1': 'soccer_netherlands_eredivisie', 'por.1': 'soccer_portugal_primeira_liga',
    'nba': 'basketball_nba', 'nfl': 'americanfootball_nfl',
  };
  const oddsCache = new Map();
  async function consensusList(lg) {
    if (DEMO || !ODDS_SPORT[lg]) return null;
    if (oddsCache.has(lg) && Date.now() - oddsCache.get(lg).t < 10 * 60000) return oddsCache.get(lg).p;
    const p = fetch(`/api/odds?lg=${encodeURIComponent(lg)}`).then(r => r.ok ? r.json() : null).catch(() => null);
    oddsCache.set(lg, { p, t: Date.now() });
    return p;
  }
  // Las casas y ESPN escriben distinto los equipos: se llevan ambos a una forma común.
  const CANON = [
    ['manchester united', 'man united'], ['manchester city', 'man city'], ['man utd', 'man united'],
    ['1 fc koln', 'cologne'], ['fc koln', 'cologne'], ['koln', 'cologne'], ['bayern munchen', 'bayern munich'],
    ['borussia monchengladbach', 'gladbach'], ['monchengladbach', 'gladbach'], ['hamburger sv', 'hamburg'], ['hamburg sv', 'hamburg'],
    ['fsv mainz 05', 'mainz'], ['mainz 05', 'mainz'], ['tsg hoffenheim', 'hoffenheim'], ['1899 hoffenheim', 'hoffenheim'],
    ['internazionale', 'inter'], ['inter milan', 'inter'], ['ac milan', 'milan'], ['as roma', 'roma'], ['ss lazio', 'lazio'],
    ['paris saint germain', 'psg'], ['paris sg', 'psg'], ['atletico de madrid', 'atletico madrid'], ['athletic bilbao', 'athletic club'],
    ['wolverhampton wanderers', 'wolves'], ['wolverhampton', 'wolves'], ['brighton and hove albion', 'brighton'], ['tottenham hotspur', 'tottenham'],
    ['west ham united', 'west ham'], ['newcastle united', 'newcastle'], ['nottingham forest', 'nottingham'], ['leeds united', 'leeds'],
    ['club america', 'america'], ['club leon', 'leon'], ['pumas unam', 'unam'], ['atletico de san luis', 'san luis'], ['atletico san luis', 'san luis'],
    ['tigres uanl', 'tigres'], ['santos laguna', 'santos'], ['guadalajara chivas', 'guadalajara'], ['chivas guadalajara', 'guadalajara'], ['cf monterrey', 'monterrey'],
  ];
  const GENERIC = new Set(['united', 'city', 'club', 'real', 'sporting', 'athletic', 'atletico', 'deportivo', 'borussia', 'olympique', 'union', 'stade', 'racing', 'calcio']);
  function canon(x) {
    let n = ' ' + norm(x).replace(/\b(fc|cf|afc|sc|ac|ssc|cd|ud|sd|rc|sv|vfb|vfl)\b/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    for (const [a, b] of CANON) n = n.replace(' ' + a + ' ', ' ' + b + ' ');
    return n.trim();
  }
  function sameTeam(a, b) {
    const A = canon(a), B = canon(b);
    if (!A || !B) return false;
    if (A === B || (' ' + A + ' ').includes(' ' + B + ' ') || (' ' + B + ' ').includes(' ' + A + ' ')) return true;
    const wa = A.split(' ').filter(w => w.length >= 4 && !GENERIC.has(w)), wb = new Set(B.split(' ').filter(w => w.length >= 4 && !GENERIC.has(w)));
    return wa.some(w => wb.has(w));
  }
  async function consensus(lg, homeName, awayName, iso) {
    const list = await consensusList(lg);
    if (!Array.isArray(list)) return null;
    const t = iso ? new Date(iso).getTime() : null;
    const ev = list.find(e => sameTeam(e.home_team, homeName) && sameTeam(e.away_team, awayName) && (!t || Math.abs(new Date(e.commence_time) - t) < 36 * 3600e3));
    if (!ev) return null;
    const p1x2 = [], pOU = [];
    for (const b of ev.bookmakers || []) {
      const h2h = (b.markets || []).find(m => m.key === 'h2h');
      if (h2h) {
        const pr = n => (h2h.outcomes.find(o => o.name === n) || {}).price;
        const o = [pr(ev.home_team), pr('Draw'), pr(ev.away_team)];
        if (o.every(x => x > 1)) { const inv = o.map(x => 1 / x), s = inv.reduce((a, b) => a + b); p1x2.push(inv.map(x => x / s)); }
        else if (o[0] > 1 && o[2] > 1 && !o[1]) { const inv = [1 / o[0], 1 / o[2]], s = inv[0] + inv[1]; p1x2.push([inv[0] / s, 0, inv[1] / s]); }
      }
      const tot = (b.markets || []).find(m => m.key === 'totals');
      if (tot) {
        const ov = tot.outcomes.find(o => o.name === 'Over' && o.point === 2.5), un = tot.outcomes.find(o => o.name === 'Under' && o.point === 2.5);
        if (ov && un) { const a = 1 / ov.price, b2 = 1 / un.price; pOU.push(a / (a + b2)); }
      }
    }
    if (!p1x2.length) return null;
    const med = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const probs = [0, 1, 2].map(i => med(p1x2.map(x => x[i])));
    const sum = probs.reduce((a, b) => a + b);
    return { books: p1x2.length, probs: probs.map(x => x / sum), over25: pOU.length ? med(pOU) : null };
  }

  function yyyymmdd(dt) { return dt.toISOString().slice(0, 10).replace(/-/g, ''); }

  async function upcoming(lg, days = 7) {
    // ESPN rechaza rangos de fechas en fútbol: se pide día por día y se juntan.
    const now = Date.now(), seen = new Set(), out = [];
    const days_ = await Promise.all(Array.from({ length: days + 1 }, (_, i) =>
      get(site(lg, 'scoreboard'), { dates: yyyymmdd(new Date(now + i * 864e5)) }).catch(() => ({ events: [] }))));
    for (const d of days_) for (const ev of d.events || []) {
      if (seen.has(ev.id)) continue; seen.add(ev.id);
      const e = parseEvent(ev); if (!e.completed && e.state !== 'in' && new Date(e.date).getTime() > Date.now()) out.push(e);
    }
    return out.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  async function summary(lg, eventId) {
    const d = await get(site(lg, 'summary'), { event: eventId });
    const lastFive = {};
    for (const t of d.lastFiveGames || []) {
      lastFive[String(t.team?.id)] = (t.events || []).map(e => ({
        id: String(e.id), date: e.gameDate, result: e.gameResult, score: e.score,
        opp: e.opponent?.displayName || '', atVs: e.atVs || '', comp: e.leagueAbbreviation || e.competitionName || '',
      }));
    }
    const leaders = {};
    for (const t of d.leaders || []) {
      const id = String(t.team?.id);
      leaders[id] = {};
      for (const cat of t.leaders || []) {
        leaders[id][cat.name] = (cat.leaders || []).slice(0, 3).map(l => ({
          name: l.athlete?.displayName || l.athlete?.shortName || '',
          value: num(l.mainStat?.value) ?? num(String(l.displayValue || '').match(/[\d.]+/)?.[0]),
          text: l.displayValue || l.summary || '',
        }));
      }
    }
    const h2h = [];
    for (const g of d.headToHeadGames || []) for (const e of g.events || []) {
      h2h.push({ id: String(e.id), date: e.gameDate, score: e.score, homeId: String(e.homeTeamId), awayId: String(e.awayTeamId), hs: num(e.homeTeamScore), as: num(e.awayTeamScore) });
    }
    let odds = null;
    if (d.pickcenter && d.pickcenter[0]) odds = parseOdds(d.pickcenter[0]);
    else if (d.odds && d.odds[0]) odds = parseOdds(d.odds[0]);
    return { lastFive, leaders, h2h, odds };
  }

  // Divisiones local / visita y últimos 5 a partir del calendario de la temporada.
  function teamSplits(events, teamId) {
    const done = events.filter(e => e.completed && e.hs != null && e.as != null).sort((a, b) => new Date(b.date) - new Date(a.date));
    const home = { gp: 0, gf: 0, ga: 0 }, away = { gp: 0, gf: 0, ga: 0 };
    const results = [];
    for (const e of done) {
      const isHome = e.homeId === teamId;
      const gf = isHome ? e.hs : e.as, ga = isHome ? e.as : e.hs;
      const s = isHome ? home : away;
      s.gp++; s.gf += gf; s.ga += ga;
      results.push({ id: e.id, date: e.date, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D', score: `${gf}-${ga}`, opp: isHome ? e.awayName : e.homeName, atVs: isHome ? 'vs' : '@' });
    }
    return { home, away, last5: results.slice(0, 5), all: done };
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Nombres en español / alemán / apodos → como los escribe ESPN (en inglés).
  const ALIASES = {
    'koln': 'cologne', 'colonia': 'cologne', 'fc koln': 'cologne', '1 fc koln': 'cologne',
    'bayern munchen': 'bayern', 'munchen': 'bayern', 'bayern munich': 'bayern', 'munich': 'bayern',
    'gladbach': 'monchengladbach', 'hamburgo': 'hamburg', 'hsv': 'hamburg', 'maguncia': 'mainz',
    'stuttgart': 'stuttgart', 'dortmund': 'dortmund', 'bvb': 'dortmund', 'leipzig': 'leipzig',
    'inter': 'internazionale', 'inter de milan': 'internazionale', 'milan': 'ac milan', 'napoles': 'napoli',
    'roma': 'as roma', 'juve': 'juventus', 'florencia': 'fiorentina', 'atalanta': 'atalanta',
    'psg': 'paris saint germain', 'paris': 'paris saint germain', 'marsella': 'marseille', 'lyon': 'lyon',
    'monaco': 'monaco', 'niza': 'nice',
    'atletico': 'atletico madrid', 'atleti': 'atletico madrid', 'atletico de madrid': 'atletico madrid',
    'barca': 'barcelona', 'madrid': 'real madrid', 'athletic': 'athletic club', 'athletic bilbao': 'athletic club',
    'betis': 'real betis', 'sociedad': 'real sociedad', 'celta': 'celta vigo',
    'man city': 'manchester city', 'city': 'manchester city', 'man united': 'manchester united', 'man utd': 'manchester united',
    'united': 'manchester united', 'spurs': 'tottenham', 'wolves': 'wolverhampton',
    'chivas': 'guadalajara', 'pumas': 'unam', 'rayados': 'monterrey', 'tuzos': 'pachuca', 'xolos': 'tijuana',
    'gallos': 'queretaro', 'bravos': 'juarez', 'diablos': 'toluca', 'santos': 'santos laguna', 'rojinegros': 'atlas',
    'la maquina': 'cruz azul', 'aguilas': 'america', 'tigres': 'tigres', 'tuneros': 'san luis', 'atletico san luis': 'san luis',
    'franja': 'puebla', 'esmeraldas': 'leon', 'rayos': 'necaxa', 'mazatlan': 'mazatlan',
    'benfica': 'benfica', 'oporto': 'porto', 'sporting': 'sporting',
  };

  function findTeam(list, q) {
    const raw = norm(q);
    const n = ALIASES[raw] || raw;
    const alt = n !== raw ? raw : null;
    return findTeamNorm(list, n) || (alt && findTeamNorm(list, alt));
  }

  function findTeamNorm(list, n) {
    if (!n) return null;
    let best = null, bestScore = 0;
    for (const t of list) {
      const names = [t.name, t.short, t.abbr, t.nick].map(norm).filter(Boolean);
      let sc = 0;
      for (const nm of names) {
        if (nm === n) sc = Math.max(sc, 100);
        else if (nm.startsWith(n)) sc = Math.max(sc, 80);
        else if (nm.includes(n)) sc = Math.max(sc, 60);
        else if (n.includes(nm) && nm.length >= 4) sc = Math.max(sc, 50);
        else {
          const words = n.split(' ').filter(w => w.length >= 4);
          if (words.some(w => nm.includes(w))) sc = Math.max(sc, 40);
        }
      }
      if (sc > bestScore) { bestScore = sc; best = t; }
    }
    return best;
  }

  function parseMatchText(text) {
    const parts = String(text).split(/\s+(?:vs\.?|v\.?|contra|x)\s+|\s+-\s+/i);
    return parts.length >= 2 ? [parts[0].trim(), parts.slice(1).join(' ').trim()] : null;
  }

  const api = { LEAGUES, DEMO, h2h, statsFor, get, refresh, state, sameTeam, matchStatsFull, espnDay, matchStats, consensus, ODDS_SPORT, teams, standings, schedule, upcoming, summary, teamSplits, findTeam, parseMatchText, parseEvent, parseOdds, norm, num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarData = api;
})(typeof window !== 'undefined' ? window : globalThis);
