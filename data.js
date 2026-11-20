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
    { id: 'eng.w.1', name: 'WSL (femenil)' },
    { id: 'esp.w.1', name: 'Liga F (femenil)' },
    { id: 'usa.nwsl', name: 'NWSL (femenil)' },
    { id: 'uefa.wchampions', name: 'Champions femenil' },
  ];

  const DEMO = typeof location !== 'undefined' && /[?&]demo=1/.test(location.search);
  const cache = new Map();

  async function get(path, params = {}) {
    const key = path + JSON.stringify(params);
    if (cache.has(key)) return cache.get(key);
    const p = (async () => {
      if (DEMO) {
        const name = path.replace(/^apis\/(site\/v2|v2)\/sports\/soccer\/[^/]+\//, '').replace(/\//g, '_') + (params.fixture ? '_fixture' : '') + (params.season ? '_prev' : '');
        const r = await fetch(`mock/${name}.json`);
        if (!r.ok) throw new Error('sin datos demo: ' + name);
        return r.json();
      }
      const qs = new URLSearchParams({ path, ...params });
      let r;
      try { r = await fetch(`/api/espn?${qs}`); } catch (e) { r = null; }
      if (!r || r.status === 404) {
        // Sin proxy (por ejemplo, abierto como archivo): intento directo.
        const q2 = new URLSearchParams(params).toString();
        r = await fetch(`https://site.api.espn.com/${path}${q2 ? '?' + q2 : ''}`);
      }
      if (!r.ok) throw new Error(`ESPN respondió ${r.status}`);
      return r.json();
    })();
    cache.set(key, p);
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
          pts: s.points != null ? s.points : 3 * w + dr, rank: s.rank || null, group: g.name || '',
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
      odds: parseOdds((c.odds || [])[0]),
      venue: c.venue?.fullName || '',
    };
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

  function yyyymmdd(dt) { return dt.toISOString().slice(0, 10).replace(/-/g, ''); }

  async function upcoming(lg, days = 7) {
    const now = new Date(), end = new Date(now.getTime() + days * 864e5);
    const d = await get(site(lg, 'scoreboard'), { dates: `${yyyymmdd(now)}-${yyyymmdd(end)}` });
    return (d.events || []).map(parseEvent).filter(e => !e.completed);
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

  function findTeam(list, q) {
    const n = norm(q);
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

  const api = { LEAGUES, DEMO, get, teams, standings, schedule, upcoming, summary, teamSplits, findTeam, parseMatchText, parseEvent, parseOdds, norm, num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarData = api;
})(typeof window !== 'undefined' ? window : globalThis);
