(function () {
  'use strict';
  const M = window.RadarModel, D = window.RadarData;
  const $ = id => document.getElementById(id);
  const pct = p => (p * 100).toFixed(0) + '%';
  const f2 = x => (x == null || !isFinite(x)) ? '-' : x.toFixed(2);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };

  const S = { lg: null, teams: [], ctx: null, odds: {}, out: {}, bajas: { home: 0, away: 0 } };

  // ---------- Inicio ----------
  function init() {
    const sel = $('league');
    sel.innerHTML = D.LEAGUES.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
    const params = new URLSearchParams(location.search);
    sel.value = params.get('lg') || store.get('radar.lg', 'mex.1');
    // Al recargar, la página arranca limpia (sin partido ni pronóstico abiertos).
    history.replaceState(null, '', D.DEMO ? '?demo=1' : location.pathname);
    sel.addEventListener('change', () => { store.set('radar.lg', sel.value); loadLeague(); });
    $('go').addEventListener('click', onSearch);
    $('q').addEventListener('keydown', e => { if (e.key === 'Enter') onSearch(); });
    $('clearodds').addEventListener('click', () => { S.odds = {}; saveOdds(); render(); });
    $('espnodds').addEventListener('click', () => { applyEspnOdds(true); render(); });
    $('back').addEventListener('click', () => {
      $('result').classList.add('hidden'); $('dout').classList.remove('hidden');
      $('daycard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('closeres').addEventListener('click', () => { $('result').classList.add('hidden'); S.current = null; });
    loadLeague();
  }

  async function loadLeague() {
    S.lg = $('league').value;
    $('fixtures').innerHTML = '<div class="loading"><span class="spin"></span>Cargando partidos…</div>';
    $('searchmsg').innerHTML = '';
    try {
      S.teams = await D.teams(S.lg);
      $('teamlist').innerHTML = S.teams.map(t => `<option value="${esc(t.name)}">`).join('');
    } catch (e) {
      S.teams = [];
      $('searchmsg').innerHTML = `<div class="err">No pude cargar los equipos de esta liga (${esc(e.message)}). Prueba otra liga o recarga.</div>`;
    }
    try {
      const fx = await D.upcoming(S.lg, 7);
      $('fixtures').innerHTML = fx.length ? fx.map(e => `
        <button class="fx" data-h="${e.homeId}" data-a="${e.awayId}">
          <span><b>${esc(e.homeName)}</b> vs <b>${esc(e.awayName)}</b></span>
          <span class="d">${fmtDate(e.date)}</span>
        </button>`).join('') : '<p class="note">Sin partidos en los próximos 7 días. Escribe el partido arriba.</p>';
      $('fixtures').querySelectorAll('.fx').forEach(b => b.addEventListener('click', () => analyzeMatch(b.dataset.h, b.dataset.a)));
    } catch (e) {
      $('fixtures').innerHTML = `<p class="note">No pude cargar el calendario (${esc(e.message)}). Escribe el partido arriba.</p>`;
    }
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + ' (MX)'; } catch (e) { return iso; }
  }

  function onSearch() {
    const pair = D.parseMatchText($('q').value);
    if (!pair) { $('searchmsg').innerHTML = '<div class="err">Escribe "Local vs Visita", por ejemplo: Tigres vs América.</div>'; return; }
    const h = D.findTeam(S.teams, pair[0]), a = D.findTeam(S.teams, pair[1]);
    if (!h || !a || h.id === a.id) {
      $('searchmsg').innerHTML = `<div class="err">No encontré ${!h ? `"${esc(pair[0])}"` : `"${esc(pair[1])}"`} en ${esc($('league').selectedOptions[0].text)}. Equipos de esta liga: ${S.teams.map(t => esc(t.short || t.name)).join(', ')}.</div>`;
      return;
    }
    $('searchmsg').innerHTML = '';
    analyzeMatch(h.id, a.id);
  }

  // ---------- Carga del partido ----------
  async function analyzeMatch(hId, aId, quiet) {
    const lg = S.lg;
    const home = S.teams.find(t => t.id === hId) || { id: hId, name: 'Local' };
    const away = S.teams.find(t => t.id === aId) || { id: aId, name: 'Visita' };
    // Partido nuevo: se oculta el anterior mientras carga, para no mezclar datos de dos partidos.
    if (!quiet && S.current && (S.current[0] !== hId || S.current[1] !== aId)) $('result').classList.add('hidden');
    $('searchmsg').innerHTML = `<div class="loading"><span class="spin"></span>Juntando datos de ${esc(home.name)} vs ${esc(away.name)}…</div>`;
    try {
      const [st, sh, sa, fxh] = await Promise.all([
        D.standings(lg), D.schedule(lg, hId), D.schedule(lg, aId),
        D.schedule(lg, hId, { fixture: true }).catch(() => ({ events: [] })),
      ]);
      const season = sh.season || sa.season;
      const [ph, pa] = season ? await Promise.all([
        D.schedule(lg, hId, { season: season - 1 }).catch(() => ({ events: [] })),
        D.schedule(lg, aId, { season: season - 1 }).catch(() => ({ events: [] })),
      ]) : [{ events: [] }, { events: [] }];
      const fixture = fxh.events.find(e => (e.homeId === hId && e.awayId === aId) || (e.homeId === aId && e.awayId === hId)) || null;
      let sum = null;
      if (fixture) sum = await D.summary(lg, fixture.id).catch(() => null);

      const sth = st.get(hId), sta = st.get(aId);
      if (!sth || !sta) throw new Error('alguno de los equipos no aparece en la tabla de esta liga');
      const splH = D.teamSplits(sh.events, hId), splA = D.teamSplits(sa.events, aId);
      const allEvents = [...sh.events, ...sa.events, ...ph.events, ...pa.events];
      const seen = new Set();
      const h2h = allEvents.filter(e => e.completed && e.hs != null && ((e.homeId === hId && e.awayId === aId) || (e.homeId === aId && e.awayId === hId)))
        .filter(e => !seen.has(e.id) && seen.add(e.id))
        .sort((x, y) => new Date(y.date) - new Date(x.date)).slice(0, 5);
      if (sum && sum.h2h.length) for (const g of sum.h2h) if (!seen.has(g.id)) { seen.add(g.id); h2h.push({ ...g, homeName: g.homeId === hId ? home.name : away.name, awayName: g.awayId === hId ? home.name : away.name }); }
      h2h.sort((x, y) => new Date(y.date) - new Date(x.date));

      // Fuerza de cada rival según la tabla, para ajustar cada resultado por la calidad del rival.
      const avgL = M.leagueAverage([...st.values()]);
      const oppStrength = id => { const t = st.get(String(id)); return t && t.gp ? M.strength(t, avgL) : null; };
      const prevMark = evs => evs.map(e => ({ ...e, prevSeason: true }));
      const goalsH = M.adjustedStrength([...sh.events.filter(e => e.completed), ...prevMark(ph.events.filter(e => e.completed))], hId, oppStrength, avgL);
      const goalsA = M.adjustedStrength([...sa.events.filter(e => e.completed), ...prevMark(pa.events.filter(e => e.completed))], aId, oppStrength, avgL);
      // Más fuentes: remates a puerta partido por partido (calendario de ESPN) y consenso de casas (si hay key).
      $('searchmsg').innerHTML = `<div class="loading"><span class="spin"></span>Leyendo remates a puerta y momios de varias casas…</div>`;
      const playedDates = [...sh.events, ...sa.events].filter(e => e.completed).map(e => e.date);
      const [stats, h2hStats, cons] = await Promise.all([
        D.matchStats(lg, playedDates).catch(() => new Map()),
        D.statsFor(lg, h2h.slice(0, 5)).catch(() => new Map()),
        D.consensus(lg, home.name, away.name, fixture && fixture.date).catch(() => null),
      ]);
      let sumG = 0, sumS = 0;
      for (const e of stats.values()) { sumG += e.hs + e.as; sumS += e.homeSot + e.awaySot; }
      const conv = sumS > 0 ? sumG / sumS : null;
      const sotEvents = id => conv ? [...stats.values()].filter(e => e.homeId === id || e.awayId === id).map(e => ({ ...e, hs: e.homeSot * conv, as: e.awaySot * conv })) : [];
      const sotH = sotEvents(hId), sotA = sotEvents(aId);
      const adjH = M.combineAdj(goalsH, sotH.length ? M.adjustedStrength(sotH, hId, oppStrength, avgL) : null);
      const adjA = M.combineAdj(goalsA, sotA.length ? M.adjustedStrength(sotA, aId, oppStrength, avgL) : null);
      const sotTeam = (evs, id) => { let f = 0, a = 0; for (const e of evs) { const h = e.homeId === id; f += h ? e.homeSot : e.awaySot; a += h ? e.awaySot : e.homeSot; } return evs.length ? { n: evs.length, f: f / evs.length, a: a / evs.length } : null; };
      const cls = window.RadarContext ? window.RadarContext.classify([...st.values()], lg) : new Map();
      S.ctx = {
        motH: cls.get(hId) || null, motA: cls.get(aId) || null,
        adjH, adjA, cons, conv, sotStatsH: sotTeam(sotH, hId), sotStatsA: sotTeam(sotA, aId),
        lg, home, away, st, sth, sta, splH, splA, fixture, sum, h2h: h2h.slice(0, 5), h2hS: M.h2hSummary(h2h, hId, h2hStats),
        avg: M.leagueAverage([...st.values()]),
        espnOdds: (sum && sum.odds) || (fixture && fixture.odds) || null,
      };
      S.oddsFrom = null;
      S.key = `radar.odds.${lg}.${hId}.${aId}`;
      // Momios y bajas se recuerdan solo mientras la página está abierta.
      S.odds = MEMO[S.key] || {};
      S.out = MEMO[S.key + '.out'] || {};
      S.bajas = MEMO[S.key + '.bajas'] || { home: 0, away: 0 };
      S.mood = MEMO[S.key + '.mood'] || { home: 0, away: 0 };
      if (!Object.keys(S.odds).length) applyEspnOdds(false);
      $('searchmsg').innerHTML = '';
      $('result').classList.remove('hidden');
      if (!quiet) {
        // Un análisis reemplaza al pronóstico del día (desde el pronóstico, se puede volver).
        $('dout').classList.add('hidden');
        $('back').classList.toggle('hidden', !S.fromDay);
        if (!S.fromDay && window.RadarDayUI) window.RadarDayUI.clear();
      }
      render();
      if (!quiet) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
      S.current = [hId, aId];
    } catch (e) {
      $('searchmsg').innerHTML = `<div class="err">No pude armar el análisis: ${esc(e.message)}.</div>`;
    }
  }

  function applyEspnOdds(force) {
    const o = S.ctx && S.ctx.espnOdds;
    if (!o) return;
    const set = (k, v) => { const d = M.americanToDecimal(v); if (d && (force || !S.odds[k])) S.odds[k] = +d.toFixed(2); };
    // Ojo: la casa de ESPN pone local/visita según su propio partido; si está invertido lo corrige.
    const flipped = S.ctx.fixture && S.ctx.fixture.homeId !== S.ctx.home.id;
    set('1', flipped ? o.ml.away : o.ml.home);
    set('X', o.ml.draw);
    set('2', flipped ? o.ml.home : o.ml.away);
    if (o.total && o.total.line === 2.5) { set('O2.5', o.total.over); set('U2.5', o.total.under); }
    S.oddsFrom = o.provider;
    saveOdds();
  }

  const MEMO = {};
  function saveOdds() { if (S.key) MEMO[S.key] = S.odds; }

  // ---------- Modelo ----------
  function bajasPct(side) {
    const c = S.ctx, teamId = side === 'home' ? c.home.id : c.away.id;
    const gf = side === 'home' ? c.sth.gf : c.sta.gf;
    let p = +S.bajas[side] || 0;
    const L = c.sum && c.sum.leaders[teamId];
    if (L && gf > 0) {
      for (const pl of (L.goalsLeaders || [])) {
        if (S.out[teamId + ':' + pl.name] && pl.value) p += Math.min(25, (pl.value / gf) * 100 * 0.6);
      }
    }
    return Math.min(40, p);
  }

  function compute() {
    const c = S.ctx;
    const l5h = (c.sum && c.sum.lastFive[c.home.id]) || c.splH.last5;
    const l5a = (c.sum && c.sum.lastFive[c.away.id]) || c.splA.last5;
    const ppgH = c.sth.gp ? c.sth.pts / c.sth.gp : 0, ppgA = c.sta.gp ? c.sta.pts / c.sta.gp : 0;
    const inp = {
      avg: c.avg,
      home: { motiveF: (window.RadarContext ? window.RadarContext.factor(c.motH) : 1) * (1 + M.CFG.MOOD * (S.mood.home || 0)), team: c.sth, split: c.splH.home, form: M.formFactor(l5h.map(x => x.result), ppgH), bajas: bajasPct('home'), adj: c.adjH },
      h2h: c.h2hS ? { n: c.h2hS.n, gH: c.h2hS.gH, gA: c.h2hS.gA } : null,
      away: { motiveF: (window.RadarContext ? window.RadarContext.factor(c.motA) : 1) * (1 + M.CFG.MOOD * (S.mood.away || 0)), team: c.sta, split: c.splA.away, form: M.formFactor(l5a.map(x => x.result), ppgA), bajas: bajasPct('away'), adj: c.adjA },
    };
    const o = S.odds;
    let market = (o['1'] && o['X'] && o['2']) ? { odds1: o['1'], oddsX: o['X'], odds2: o['2'], over25: o['O2.5'], under25: o['U2.5'] } : null;
    // El consenso de varias casas es mejor referencia que una sola casa: si existe, manda en la mezcla.
    if (c.cons) {
      const cp = c.cons.probs;
      market = { odds1: 1 / cp[0], oddsX: 1 / cp[1], odds2: 1 / cp[2] };
      if (c.cons.over25) { market.over25 = 1 / c.cons.over25; market.under25 = 1 / (1 - c.cons.over25); }
      else if (o['O2.5'] && o['U2.5']) { market.over25 = o['O2.5']; market.under25 = o['U2.5']; }
    }
    const res = M.analyze(inp, market, { home: c.home.short || c.home.name, away: c.away.short || c.away.name });
    return { inp, res, l5h, l5a };
  }

  // ---------- Render ----------
  function render() {
    const c = S.ctx; if (!c) return;
    const { inp, res, l5h, l5a } = compute();
    const p1 = res.markets.find(m => m.id === '1').p, px = res.markets.find(m => m.id === 'X').p, p2 = res.markets.find(m => m.id === '2').p;

    $('comp').textContent = [$('league').selectedOptions[0].text, c.fixture ? fmtDate(c.fixture.date) : 'partido hipotético', c.fixture?.venue].filter(Boolean).join(' · ');
    $('hn').textContent = c.home.short || c.home.name; $('an').textContent = c.away.short || c.away.name;
    // Escudos: se ocultan y se vacían antes de cargar el nuevo, para que nunca quede el del partido anterior
    // mientras el nuevo tarda en llegar (o si no llega).
    for (const [id, url] of [['hl', c.home.logo || (c.fixture && (c.fixture.homeId === c.home.id ? c.fixture.homeLogo : c.fixture.awayLogo))], ['al', c.away.logo || (c.fixture && (c.fixture.awayId === c.away.id ? c.fixture.awayLogo : c.fixture.homeLogo))]]) {
      const im = $(id), u = url || '';
      if (im.dataset.u === u) continue;
      im.dataset.u = u; im.classList.add('hidden'); im.removeAttribute('src');
      if (u) { im.onload = () => { if (im.dataset.u === u) im.classList.remove('hidden'); }; im.src = u; }
    }
    $('hs').textContent = `${c.sth.rank ? c.sth.rank + 'º · ' : ''}${c.sth.pts} pts`;
    $('as').textContent = `${c.sta.rank ? c.sta.rank + 'º · ' : ''}${c.sta.pts} pts`;
    // Centro del tablero: goles esperados de cada uno (cambian partido a partido) en lugar de un marcador exacto.
    $('xs').textContent = `${f2(res.lh)} – ${f2(res.la)}`;
    const hn = c.home.short || c.home.name, an = c.away.short || c.away.name;
    // Resultado probable = el lado con más probabilidad en el 1X2 y, si es victoria, por cuántos goles.
    const lead = p1 >= px && p1 >= p2 ? 1 : p2 >= px ? -1 : 0;
    const by1 = (res.margins.find(x => x.d === lead) || { p: 0 }).p;
    const resTxt = lead === 0 ? `empate · ${pct(px)}` : `gana ${esc(lead > 0 ? hn : an)} · ${pct(lead > 0 ? p1 : p2)} (por 1 gol: ${pct(by1)})`;
    // Marcador estimado: redondeo de los goles esperados (p. ej. 1.20–1.76 → 1-2), con la prob. de ese marcador exacto.
    const rh = Math.round(res.lh), ra = Math.round(res.la);
    const rp = (M.scoreMatrix(res.lh, res.la)[rh] || [])[ra] || 0;
    $('xslab').textContent = 'goles esperados';
    $('bar3').innerHTML = `<div class="bh" style="width:${p1 * 100}%">${pct(p1)}</div><div class="bd" style="width:${px * 100}%">${pct(px)}</div><div class="ba" style="width:${p2 * 100}%">${pct(p2)}</div>`;
    $('mkt').innerHTML = res.market
      ? `<span>${c.cons ? `Consenso de ${c.cons.books} casas` : 'Casa sin margen'}: ${pct(res.market.probs[0])} · ${pct(res.market.probs[1])} · ${pct(res.market.probs[2])}</span><span>${c.cons ? 'sin margen' : `Margen ${(res.market.margin * 100).toFixed(1)}%`}</span>`
      : '<span>Solo modelo: captura momios de resultado para mezclar con la casa.</span>';
    $('meta').innerHTML = `<div class="resline">Resultado probable: <b>${resTxt}</b></div><div class="resline">Marcador estimado: <b class="num">${rh} - ${ra}</b> · ${pct(rp)} <span class="m">(redondeo de los goles esperados)</span></div>` + '<span class="m">Marcadores exactos más probables:</span> ' + res.topScores.slice(0, 4).map(s => `<span class="pill num">${s.h}-${s.a} ${pct(s.p)}</span>`).join('') + '<span class="m">(un marcador exacto casi nunca pasa de 15–20%; por eso arriba salen seguido 1-1, 1-0 o 0-0)</span>';
    $('motive').innerHTML = [[c.home, c.motH, 'h'], [c.away, c.motA, 'a']].map(([t, m, k]) => m ? `<div class="mot ${k}"><span class="mtag ${m.tag}">${esc(m.label)}</span> <b>${esc(t.short || t.name)}</b> <span>${esc(m.detail)}</span></div>` : '').join('');

    renderMarkets(res);
    renderVerdict(res, inp);
    renderForm(l5h, l5a);
    renderStats();
    renderH2H();
    renderPlayers();
    renderCalc(inp, res);
    if (window.RadarSlip) window.RadarSlip.refresh();
  }

  function tagHtml(v) {
    const map = {
      doblete: ['ok', 'Doblete'], valor: ['lean', 'Valor'], volado: ['vol', 'Volado'], 'momio-bajo': ['bad', '< 1.30'],
      'sin-valor': ['no', 'Sin valor'], candidato: ['lean', 'Candidato'], 'sin-momio': ['no', '—'],
    };
    const [cls, txt] = map[v.tag] || ['no', v.tag];
    if (v.tag === 'sin-momio') return '';
    return `<span class="st ${cls}">${txt}</span>`;
  }

  function renderMarkets(res) {
    let html = '<tr><th>Mercado</th><th>Prob. / peor</th><th>Momio</th><th></th></tr>';
    const c = S.ctx, matchName = `${c.home.short || c.home.name} vs ${c.away.short || c.away.name}`, matchKey = `${c.lg}:${c.home.id}:${c.away.id}`;
    let group = '';
    for (const mk of res.markets) {
      if (mk.group !== group) { group = mk.group; html += `<tr class="grp"><td colspan="4">${esc(group)}</td></tr>`; }
      const odd = S.odds[mk.id];
      const v = M.verdict(mk, odd);
      const be = odd ? Math.min(100, 100 / odd) : null;
      html += `<tr>
        <td><span class="mk">${esc(mk.label)}</span><span class="rg">justo ${f2(mk.fair)}</span> ${tagHtml(v)}</td>
        <td class="num">${pct(mk.p)} <span class="rg">/ ${pct(mk.worst)}</span><div class="meter"><i style="width:${mk.p * 100}%"></i>${be ? `<s style="left:${be}%"></s>` : ''}</div></td>
        <td><input class="odd" inputmode="decimal" data-id="${mk.id}" value="${odd || ''}" placeholder="—" aria-label="Momio ${esc(mk.label)}"></td>
        <td class="addc">${slipBtn({ key: `${matchKey}:${mk.id}`, matchKey, t: c.fixture ? c.fixture.date : null, match: matchName, label: mk.label, p: mk.p, ...provOf(mk, odd) })}</td></tr>`;
    }
    $('mkts').innerHTML = html;
    $('oddsrc').textContent = S.oddsFrom ? `momios precargados: ${S.oddsFrom}` : '';
    $('mkts').querySelectorAll('input.odd').forEach(inp => inp.addEventListener('change', () => {
      const n = parseFloat(inp.value.replace(',', '.'));
      let d = isFinite(n) ? (Math.abs(n) >= 100 ? M.americanToDecimal(n) : n) : null;
      if (d && d > 1) S.odds[inp.dataset.id] = +d.toFixed(2); else delete S.odds[inp.dataset.id];
      saveOdds(); setTimeout(render);
    }));
  }

  // Momio provisional: el que ya hay (capturado o ESPN), si no el consenso de casas, si no el justo menos el margen típico.
  function provOf(mk, odd) {
    if (odd) return { prov: odd, provSrc: S.oddsFrom && S.odds[mk.id] === odd ? S.oddsFrom : 'capturado' };
    const c = S.ctx, i = { '1': 0, 'X': 1, '2': 2 }[mk.id];
    if (c && c.cons && i != null && c.cons.probs[i] > 0) return { prov: +(1 / c.cons.probs[i] / 1.05).toFixed(2), provSrc: 'consenso' };
    return { prov: +(mk.fair / 1.06).toFixed(2), provSrc: 'estimado' };
  }

  function slipBtn(leg) {
    if (window.RadarSlip && window.RadarSlip.register) window.RadarSlip.register(leg);
    return `<button class="addb" data-slip="${esc(leg.key)}" data-leg="${esc(JSON.stringify(leg))}" aria-label="Agregar ${esc(leg.label)} al ticket">+</button>`;
  }
  window.RadarSlipBtn = slipBtn;

  function renderVerdict(res, inp) {
    const rows = res.markets.map(mk => ({ mk, odd: S.odds[mk.id], v: M.verdict(mk, S.odds[mk.id]) }));
    const dbl = rows.filter(r => r.v.tag === 'doblete').sort((a, b) => b.mk.worst - a.mk.worst);
    // Valor "seguro" = cumple tus reglas de combinada (prob ≥ 60%, sin volado, momio ≥ 1.30).
    // El resto con valor (sorpresas a momio alto) va aparte: a la larga pagan, pero fallan la mayoría de las veces.
    const okRules = r => r.mk.p >= 0.6 && r.odd >= 1.30;
    const valAll = rows.filter(r => r.v.tag === 'valor').sort((a, b) => b.v.ev - a.v.ev);
    const val = valAll.filter(okRules), risky = valAll.filter(r => !okRules(r));
    const cand = rows.filter(r => r.v.tag === 'candidato' && r.mk.fair >= 1.2).sort((a, b) => b.mk.p - a.mk.p).slice(0, 4);
    let html = '';
    for (const r of dbl.slice(0, 4)) html += vrow(r, 'ok', 'Doblete');
    for (const r of val.slice(0, 4)) html += vrow(r, 'val', 'Valor');
    if (!dbl.length && !val.length) {
      html += '<div class="vrow"><span>Ningún mercado con momio capturado pasa los filtros.</span></div>';
    }
    if (risky.length) {
      html += '<h3 style="margin-top:6px">Valor de riesgo (no para combinadas)</h3>';
      for (const r of risky.slice(0, 3)) html += vrow(r, 'risk', 'Riesgo');
      html += `<p class="note">El momio paga más de lo que vale, pero pegan ${risky.length === 1 ? 'menos' : 'pocas'} veces (prob menor a 60% o volado). Solo como apuesta sencilla y chica; en un ticket combinado lo tumban.</p>`;
    }
    if (cand.length) html += '<h3 style="margin-top:6px">Candidatos: captura su momio</h3>';
    for (const r of cand) html += `<div class="vrow"><span><b>${esc(r.mk.label)}</b><br><span class="note">prob ${pct(r.mk.p)}, peor ${pct(r.mk.worst)}</span></span><span class="r"><span class="note">pide ≥</span><b class="num">${f2(r.v.minNeeded)}</b></span></div>`;
    $('verdict').innerHTML = html;
    const c = S.ctx;
    const minGp = Math.min(c.sth.gp, c.sta.gp);
    const conf = minGp >= 10 && res.market ? 'Confianza media-alta' : minGp >= 6 ? 'Confianza media' : 'Confianza baja (pocos partidos)';
    const notes = [conf, res.market ? 'modelo mezclado con la casa' : 'sin momios de resultado: solo modelo, no apuestes por valor'];
    if (inp.home.bajas || inp.away.bajas) notes.push(`bajas: ${c.home.short || c.home.name} -${inp.home.bajas.toFixed(0)}%, ${c.away.short || c.away.name} -${inp.away.bajas.toFixed(0)}%`);
    for (const [t, m] of [[c.home, c.motH], [c.away, c.motA]]) {
      if (!m) continue;
      if (m.tag === 'asegurado') notes.push(`${t.short || t.name} ya está clasificado: puede rotar titulares, cuidado con selecciones a su favor`);
      if (m.tag === 'sin-nada') notes.push(`${t.short || t.name} no se juega nada`);
      if (m.tag === 'presion') notes.push(`${t.short || t.name} ${m.detail.split(' · ')[1] || 'se juega algo'}: el modelo le sube 8% el ataque`);
    }
    for (const [side, t] of [['home', c.home], ['away', c.away]]) if (S.mood[side]) notes.push(`tu opinión: ${t.short || t.name} ${S.mood[side] > 0 ? 'en racha (+8% ataque)' : 'en crisis (−8% ataque)'}; no está validado con datos`);
    notes.push('selecciones del mismo partido están correlacionadas: combina con otro partido');
    $('vnote').textContent = notes.join(' · ') + '.';
  }

  function vrow(r, cls, tag) {
    return `<div class="vrow ${cls}"><span><b>${esc(r.mk.label)}</b><br><span class="note">prob ${pct(r.mk.p)} · peor ${pct(r.mk.worst)} · valor ${f2(r.v.ev)}</span></span><span class="r"><b class="num">${f2(r.odd)}</b><span class="st ${cls === 'ok' ? 'ok' : cls === 'risk' ? 'vol' : 'lean'}">${tag}</span></span></div>`;
  }

  function formCol(cls, name, l5) {
    return `<div class="fcol"><div class="ftitle ${cls}">${esc(name)}<span class="dots">${l5.map(x => `<span class="dot ${x.result}">${{ W: 'G', D: 'E', L: 'P' }[x.result] || '?'}</span>`).join('')}</span></div>
      ${l5.map(x => `<div class="fl"><span>${esc(x.atVs === '@' ? '@ ' : 'vs ')}${esc(x.opp)}</span><span class="num">${esc(x.score)}</span></div>`).join('') || '<p class="note">Sin partidos.</p>'}</div>`;
  }

  function renderForm(l5h, l5a) {
    const c = S.ctx;
    $('form').innerHTML = formCol('h', c.home.short || c.home.name, l5h) + formCol('a', c.away.short || c.away.name, l5a);
  }

  function renderStats() {
    const c = S.ctx, h = c.sth, a = c.sta, sh = c.splH, sa = c.splA;
    const per = (x, n) => n ? (x / n).toFixed(2) : '-';
    const rows = [
      ['Partidos', h.gp, a.gp],
      ['Récord (G-E-P)', `${h.w}-${h.d}-${h.l}`, `${a.w}-${a.d}-${a.l}`],
      ['Goles a favor / partido', per(h.gf, h.gp), per(a.gf, a.gp)],
      ['Goles en contra / partido', per(h.ga, h.gp), per(a.ga, a.gp)],
      ['Local: GF / GC por partido', `${per(sh.home.gf, sh.home.gp)} / ${per(sh.home.ga, sh.home.gp)}`, `${per(sa.home.gf, sa.home.gp)} / ${per(sa.home.ga, sa.home.gp)}`],
      ['Visita: GF / GC por partido', `${per(sh.away.gf, sh.away.gp)} / ${per(sh.away.ga, sh.away.gp)}`, `${per(sa.away.gf, sa.away.gp)} / ${per(sa.away.ga, sa.away.gp)}`],
      ['Promedio de la liga', c.avg.toFixed(2), ''],
    ];
    $('stats').innerHTML = `<span class="hd">Temporada</span><span class="hd h">${esc(c.home.abbr || 'LOC')}</span><span class="hd a">${esc(c.away.abbr || 'VIS')}</span>` +
      rows.map(r => `<span>${r[0]}</span><span class="h num">${r[1]}</span><span class="a num">${r[2]}</span>`).join('');
  }

  function renderH2H() {
    const c = S.ctx;
    $('h2h').innerHTML = c.h2h.map(e => `<span>${esc(e.homeName)} vs ${esc(e.awayName)} <span class="note">${e.date ? new Date(e.date).toLocaleDateString('es-MX') : ''}</span></span><span class="num">${e.hs}-${e.as}</span>`).join('') || '<span class="note">Sin enfrentamientos en esta temporada ni la anterior.</span>';
    const H = c.h2hS, hn = esc(c.home.short || c.home.name);
    const avgTxt = (x, lbl) => x ? ` · ${x.avg.toFixed(1)} ${lbl}${x.n < H.n ? ` (${x.n} con datos)` : ''}` : '';
    $('h2hnote').innerHTML = H
      ? `<b>Últimos ${H.n}:</b> ${hn} ganó ${H.w}, empataron ${H.d}, perdió ${H.l} · goles por partido ${(H.gH + H.gA).toFixed(1)} (${H.gH.toFixed(1)} a ${H.gA.toFixed(1)}) · más de 2.5 en ${H.o25} de ${H.n} · ambos anotan en ${H.btts} de ${H.n}${avgTxt(H.corners, 'córners')}${avgTxt(H.shots, 'remates')}${avgTxt(H.cards, 'tarjetas')}.<br>`
        + (H.n >= M.CFG.H2H_MIN ? `En el cálculo pesa ${Math.round(M.CFG.H2H_WEIGHT * Math.min(H.n, 5) / 5 * 100)}% en los goles esperados (el backtest con 5,621 partidos dio que 10% es lo que mejor predice; más peso empeora).` : `Con menos de ${M.CFG.H2H_MIN} enfrentamientos no entra al cálculo, solo es contexto.`)
        + ' Incluye esta temporada y la anterior de esta competencia.'
      : 'Sin enfrentamientos recientes: no entra al cálculo.';
  }

  function renderPlayers() {
    const c = S.ctx;
    const col = (side, team) => {
      const L = c.sum && c.sum.leaders[team.id];
      const list = [];
      if (L) {
        for (const [cat, lab] of [['goalsLeaders', 'goles'], ['assistsLeaders', 'asistencias'], ['totalShots', 'tiros']]) {
          for (const pl of (L[cat] || []).slice(0, cat === 'goalsLeaders' ? 3 : 1)) list.push({ ...pl, lab, cat });
        }
      }
      const items = list.map(pl => {
        const k = team.id + ':' + pl.name;
        const can = pl.cat === 'goalsLeaders';
        return `<label class="pl">${can ? `<input type="checkbox" data-k="${esc(k)}" ${S.out[k] ? 'checked' : ''} aria-label="${esc(pl.name)} no juega">` : '<span></span>'}
          <span><span class="nm">${esc(pl.name)}</span><br><span class="why">${pl.value ?? ''} ${pl.lab}</span></span>
          <span class="why">${can ? (S.out[k] ? 'fuera' : 'juega') : ''}</span></label>`;
      }).join('');
      return `<div class="fcol"><div class="ftitle ${side === 'home' ? 'h' : 'a'}">${esc(team.short || team.name)}</div>
        ${items || '<p class="note">ESPN no trae líderes de este partido todavía.</p>'}
        <div class="bj"><span>% ataque perdido por otras bajas</span><input class="odd" inputmode="numeric" data-side="${side}" value="${S.bajas[side] || ''}" placeholder="0"></div>
        ${brkNote(side === 'home' ? c.adjH : c.adjA)}
        <div class="bj"><span>Momento (tu opinión)</span><select class="in sm" data-mood="${side}" aria-label="Momento de ${esc(team.short || team.name)}">
          <option value="0" ${!S.mood[side] ? 'selected' : ''}>Normal</option>
          <option value="1" ${S.mood[side] === 1 ? 'selected' : ''}>En racha (+8% ataque)</option>
          <option value="-1" ${S.mood[side] === -1 ? 'selected' : ''}>En crisis (−8% ataque)</option></select></div></div>`;
    };
    $('players').innerHTML = col('home', c.home) + col('away', c.away);
    $('players').querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) S.out[cb.dataset.k] = 1; else delete S.out[cb.dataset.k];
      MEMO[S.key + '.out'] = S.out; setTimeout(render);
    }));
    $('players').querySelectorAll('select[data-mood]').forEach(sel => sel.addEventListener('change', () => {
      S.mood[sel.dataset.mood] = +sel.value; MEMO[S.key + '.mood'] = S.mood; setTimeout(render);
    }));
    $('players').querySelectorAll('input[data-side]').forEach(inp => inp.addEventListener('change', () => {
      const n = Math.max(0, Math.min(40, parseFloat(inp.value) || 0));
      S.bajas[inp.dataset.side] = n; MEMO[S.key + '.bajas'] = S.bajas; setTimeout(render);
    }));
  }

  // Aviso de cambio de forma: los últimos 6 partidos rinden muy distinto a los anteriores (ajustado por rival).
  function brkNote(adj) {
    const b = adj && ((adj.goals && adj.goals.brk) || adj.brk || (adj.sot && adj.sot.brk));
    if (!b) return '';
    const up = b.diff > 0;
    return `<p class="note"><span class="st ${up ? 'ok' : 'bad'}">${up ? 'Mejoró' : 'Empeoró'}</span> en sus últimos ${b.n} partidos: ${up ? '+' : ''}${b.diff.toFixed(1)} goles netos por partido frente a lo que se esperaba antes. El modelo ya da más peso a lo reciente; si crees que es un cambio real (alineación, técnico, refuerzo), márcalo abajo.</p>`;
  }

  function renderCalc(inp, res) {
    const b = res.base, c = S.ctx;
    const rows = [
      ['Promedio de goles por equipo en la liga', inp.avg.toFixed(2)],
      ['Ataque local / defensa visita', `${f2(b.sh.att)} / ${f2(b.sa.def)}`],
      ['Ataque visita / defensa local', `${f2(b.sa.att)} / ${f2(b.sh.def)}`],
      ['Ataque/defensa ajustados por rival (local)', b.sh.adj ? `${f2(b.sh.adj.att)} / ${f2(b.sh.adj.def)} · ${b.sh.adj.n} partidos` : 'sin datos'],
      ['Ataque/defensa ajustados por rival (visita)', b.sa.adj ? `${f2(b.sa.adj.att)} / ${f2(b.sa.adj.def)} · ${b.sa.adj.n} partidos` : 'sin datos'],
      ['Remates a puerta por partido (local): a favor / en contra', c.sotStatsH ? `${c.sotStatsH.f.toFixed(1)} / ${c.sotStatsH.a.toFixed(1)} · ${c.sotStatsH.n} partidos` : 'sin datos'],
      ['Remates a puerta por partido (visita): a favor / en contra', c.sotStatsA ? `${c.sotStatsA.f.toFixed(1)} / ${c.sotStatsA.a.toFixed(1)} · ${c.sotStatsA.n} partidos` : 'sin datos'],
      ['Goles por remate a puerta en la liga', c.conv ? c.conv.toFixed(2) : '-'],
      ['Momios usados para mezclar', c.cons ? `consenso de ${c.cons.books} casas` : S.odds['1'] ? 'los capturados / ESPN' : 'ninguno'],
      ['Contexto de tabla (local / visita)', `${c.motH ? c.motH.label : '-'} / ${c.motA ? c.motA.label : '-'}`],
      ['Forma local / visita', `${f2(inp.home.formUsed ?? inp.home.form)} / ${f2(inp.away.formUsed ?? inp.away.form)}`],
      ['Bajas local / visita', `${inp.home.bajas.toFixed(0)}% / ${inp.away.bajas.toFixed(0)}%`],
      ['Goles esperados solo modelo', `${f2(b.lh)} - ${f2(b.la)}`],
      ['Goles esperados finales', `${f2(res.lh)} - ${f2(res.la)}`],
      ['Dixon-Coles ρ', M.CFG.RHO],
    ];
    $('calc').innerHTML = rows.map(r => `<span class="k">${r[0]}</span><span class="num">${r[1]}</span>`).join('');
  }

  // ---------- Datos siempre frescos ----------
  let refreshing = false;
  async function refreshAll() {
    if (refreshing) return;
    refreshing = true; $('refresh').disabled = true; $('upd').textContent = 'Actualizando…';
    try {
      D.refresh();
      await loadLeague();
      if (S.current && S.ctx && !$('result').classList.contains('hidden')) { await analyzeMatch(S.current[0], S.current[1], true); }
      if (window.RadarDayUI) await window.RadarDayUI.rerun();
    } finally { refreshing = false; $('refresh').disabled = false; showUpdated(); }
  }
  function showUpdated() {
    const t = D.state.lastFetch;
    if (!t) { $('upd').textContent = 'Cargando datos…'; return; }
    const min = Math.floor((Date.now() - t.getTime()) / 60000);
    $('upd').textContent = `Datos de ESPN de las ${t.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}${min >= 1 ? ` (hace ${min} min)` : ''}`;
  }
  $('refresh').addEventListener('click', refreshAll);
  const setThemeIcon = () => { $('theme').textContent = document.documentElement.dataset.theme === 'light' ? '☾' : '☀︎'; };
  $('theme').addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('radar.theme', light ? 'light' : 'dark'); } catch (e) { /* sin almacenamiento */ }
    setThemeIcon();
  });
  setThemeIcon();
  setInterval(showUpdated, 15000);
  // Cada 5 minutos con la página abierta, y al volver a la pestaña si ya pasó ese tiempo.
  const stale = () => !D.state.lastFetch || Date.now() - D.state.lastFetch.getTime() > 5 * 60000;
  setInterval(() => { if (document.visibilityState === 'visible' && stale()) refreshAll(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && stale()) refreshAll(); });
  setTimeout(showUpdated, 1500);

  // Para el pronóstico del día: abrir el análisis completo de un partido.
  window.RadarApp = {
    async openMatch(lg, hId, aId) {
      if ($('league').value !== lg || S.lg !== lg) { $('league').value = lg; store.set('radar.lg', lg); await loadLeague(); }
      S.fromDay = true;
      try { return await analyzeMatch(hId, aId); } finally { S.fromDay = false; }
    },
    hideMatch() { $('result').classList.add('hidden'); $('back').classList.add('hidden'); },
  };

  init();
})();
