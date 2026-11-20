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
    sel.addEventListener('change', () => { store.set('radar.lg', sel.value); loadLeague(); });
    $('go').addEventListener('click', onSearch);
    $('q').addEventListener('keydown', e => { if (e.key === 'Enter') onSearch(); });
    $('clearodds').addEventListener('click', () => { S.odds = {}; saveOdds(); render(); });
    $('espnodds').addEventListener('click', () => { applyEspnOdds(true); render(); });
    loadLeague().then(() => {
      const h = params.get('h'), a = params.get('a');
      if (h && a) analyzeMatch(h, a);
    });
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
    try { return new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; }
  }

  function onSearch() {
    const pair = D.parseMatchText($('q').value);
    if (!pair) { $('searchmsg').innerHTML = '<div class="err">Escribe "Local vs Visita", por ejemplo: Tigres vs América.</div>'; return; }
    const h = D.findTeam(S.teams, pair[0]), a = D.findTeam(S.teams, pair[1]);
    if (!h || !a || h.id === a.id) {
      $('searchmsg').innerHTML = `<div class="err">No encontré ${!h ? `"${esc(pair[0])}"` : `"${esc(pair[1])}"`} en ${esc($('league').selectedOptions[0].text)}. Revisa la liga o el nombre.</div>`;
      return;
    }
    $('searchmsg').innerHTML = '';
    analyzeMatch(h.id, a.id);
  }

  // ---------- Carga del partido ----------
  async function analyzeMatch(hId, aId) {
    const lg = S.lg;
    const home = S.teams.find(t => t.id === hId) || { id: hId, name: 'Local' };
    const away = S.teams.find(t => t.id === aId) || { id: aId, name: 'Visita' };
    $('searchmsg').innerHTML = `<div class="loading"><span class="spin"></span>Juntando datos de ${esc(home.name)} vs ${esc(away.name)}…</div>`;
    history.replaceState(null, '', `?lg=${lg}&h=${hId}&a=${aId}${D.DEMO ? '&demo=1' : ''}`);
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

      S.ctx = {
        lg, home, away, st, sth, sta, splH, splA, fixture, sum, h2h: h2h.slice(0, 5),
        avg: M.leagueAverage([...st.values()]),
        espnOdds: (sum && sum.odds) || (fixture && fixture.odds) || null,
      };
      S.oddsFrom = null;
      S.key = `radar.odds.${lg}.${hId}.${aId}`;
      S.odds = store.get(S.key, {});
      S.out = store.get(S.key + '.out', {});
      S.bajas = store.get(S.key + '.bajas', { home: 0, away: 0 });
      if (!Object.keys(S.odds).length) applyEspnOdds(false);
      $('searchmsg').innerHTML = '';
      $('result').classList.remove('hidden');
      render();
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function saveOdds() { if (S.key) store.set(S.key, S.odds); }

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
      home: { team: c.sth, split: c.splH.home, form: M.formFactor(l5h.map(x => x.result), ppgH), bajas: bajasPct('home') },
      away: { team: c.sta, split: c.splA.away, form: M.formFactor(l5a.map(x => x.result), ppgA), bajas: bajasPct('away') },
    };
    const o = S.odds;
    const market = (o['1'] && o['X'] && o['2']) ? { odds1: o['1'], oddsX: o['X'], odds2: o['2'], over25: o['O2.5'], under25: o['U2.5'] } : null;
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
    $('hl').src = c.home.logo || ''; $('al').src = c.away.logo || '';
    $('hl').classList.toggle('hidden', !c.home.logo); $('al').classList.toggle('hidden', !c.away.logo);
    $('hs').textContent = `${c.sth.rank ? c.sth.rank + 'º · ' : ''}${c.sth.pts} pts · xG ${f2(res.lh)}`;
    $('as').textContent = `${c.sta.rank ? c.sta.rank + 'º · ' : ''}${c.sta.pts} pts · xG ${f2(res.la)}`;
    const top = res.topScores[0];
    $('xs').textContent = `${top.h}-${top.a}`;
    $('bar3').innerHTML = `<div class="bh" style="width:${p1 * 100}%">${pct(p1)}</div><div class="bd" style="width:${px * 100}%">${pct(px)}</div><div class="ba" style="width:${p2 * 100}%">${pct(p2)}</div>`;
    $('mkt').innerHTML = res.market
      ? `<span>Casa sin margen: ${pct(res.market.probs[0])} · ${pct(res.market.probs[1])} · ${pct(res.market.probs[2])}</span><span>Margen ${(res.market.margin * 100).toFixed(1)}%</span>`
      : '<span>Solo modelo: captura momios de resultado para mezclar con la casa.</span>';
    $('meta').innerHTML = res.topScores.slice(1, 5).map(s => `<span class="pill num">${s.h}-${s.a} ${pct(s.p)}</span>`).join('');

    renderMarkets(res);
    renderVerdict(res, inp);
    renderForm(l5h, l5a);
    renderStats();
    renderH2H();
    renderPlayers();
    renderCalc(inp, res);
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
    let html = '<tr><th>Mercado</th><th>Prob. / peor</th><th>Momio</th></tr>';
    let group = '';
    for (const mk of res.markets) {
      if (mk.group !== group) { group = mk.group; html += `<tr class="grp"><td colspan="3">${esc(group)}</td></tr>`; }
      const odd = S.odds[mk.id];
      const v = M.verdict(mk, odd);
      const be = odd ? Math.min(100, 100 / odd) : null;
      html += `<tr>
        <td><span class="mk">${esc(mk.label)}</span><span class="rg">justo ${f2(mk.fair)}</span> ${tagHtml(v)}</td>
        <td class="num">${pct(mk.p)} <span class="rg">/ ${pct(mk.worst)}</span><div class="meter"><i style="width:${mk.p * 100}%"></i>${be ? `<s style="left:${be}%"></s>` : ''}</div></td>
        <td><input class="odd" inputmode="decimal" data-id="${mk.id}" value="${odd || ''}" placeholder="—" aria-label="Momio ${esc(mk.label)}"></td></tr>`;
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

  function renderVerdict(res, inp) {
    const rows = res.markets.map(mk => ({ mk, odd: S.odds[mk.id], v: M.verdict(mk, S.odds[mk.id]) }));
    const dbl = rows.filter(r => r.v.tag === 'doblete').sort((a, b) => b.mk.worst - a.mk.worst);
    const val = rows.filter(r => r.v.tag === 'valor').sort((a, b) => b.v.ev - a.v.ev);
    const cand = rows.filter(r => r.v.tag === 'candidato' && r.mk.fair >= 1.2).sort((a, b) => b.mk.p - a.mk.p).slice(0, 4);
    let html = '';
    for (const r of dbl.slice(0, 4)) html += vrow(r, 'ok', 'Doblete');
    for (const r of val.slice(0, 4)) html += vrow(r, 'val', 'Valor');
    if (!dbl.length && !val.length) {
      html += '<div class="vrow"><span>Ningún mercado con momio capturado pasa los filtros.</span></div>';
    }
    if (cand.length) html += '<h3 style="margin-top:6px">Candidatos: captura su momio</h3>';
    for (const r of cand) html += `<div class="vrow"><span><b>${esc(r.mk.label)}</b><br><span class="note">prob ${pct(r.mk.p)}, peor ${pct(r.mk.worst)}</span></span><span class="r"><span class="note">pide ≥</span><b class="num">${f2(r.v.minNeeded)}</b></span></div>`;
    $('verdict').innerHTML = html;
    const c = S.ctx;
    const minGp = Math.min(c.sth.gp, c.sta.gp);
    const conf = minGp >= 10 && res.market ? 'Confianza media-alta' : minGp >= 6 ? 'Confianza media' : 'Confianza baja (pocos partidos)';
    const notes = [conf, res.market ? 'modelo mezclado con la casa' : 'sin momios de resultado: solo modelo, no apuestes por valor'];
    if (inp.home.bajas || inp.away.bajas) notes.push(`bajas: ${c.home.short || c.home.name} -${inp.home.bajas.toFixed(0)}%, ${c.away.short || c.away.name} -${inp.away.bajas.toFixed(0)}%`);
    notes.push('patas del mismo partido están correlacionadas: combina con otro partido');
    $('vnote').textContent = notes.join(' · ') + '.';
  }

  function vrow(r, cls, tag) {
    return `<div class="vrow ${cls}"><span><b>${esc(r.mk.label)}</b><br><span class="note">prob ${pct(r.mk.p)} · peor ${pct(r.mk.worst)} · valor ${f2(r.v.ev)}</span></span><span class="r"><b class="num">${f2(r.odd)}</b><span class="st ${cls === 'ok' ? 'ok' : 'lean'}">${tag}</span></span></div>`;
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
    $('h2hnote').textContent = 'Incluye esta temporada y la anterior de esta competencia. Pesa poco en el modelo: cambian los planteles.';
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
        <div class="bj"><span>% ataque perdido por otras bajas</span><input class="odd" inputmode="numeric" data-side="${side}" value="${S.bajas[side] || ''}" placeholder="0"></div></div>`;
    };
    $('players').innerHTML = col('home', c.home) + col('away', c.away);
    $('players').querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) S.out[cb.dataset.k] = 1; else delete S.out[cb.dataset.k];
      store.set(S.key + '.out', S.out); setTimeout(render);
    }));
    $('players').querySelectorAll('input[data-side]').forEach(inp => inp.addEventListener('change', () => {
      const n = Math.max(0, Math.min(40, parseFloat(inp.value) || 0));
      S.bajas[inp.dataset.side] = n; store.set(S.key + '.bajas', S.bajas); setTimeout(render);
    }));
  }

  function renderCalc(inp, res) {
    const b = res.base;
    const rows = [
      ['Promedio de goles por equipo en la liga', inp.avg.toFixed(2)],
      ['Ataque local / defensa visita', `${f2(b.sh.att)} / ${f2(b.sa.def)}`],
      ['Ataque visita / defensa local', `${f2(b.sa.att)} / ${f2(b.sh.def)}`],
      ['Forma local / visita', `${f2(inp.home.form)} / ${f2(inp.away.form)}`],
      ['Bajas local / visita', `${inp.home.bajas.toFixed(0)}% / ${inp.away.bajas.toFixed(0)}%`],
      ['Goles esperados solo modelo', `${f2(b.lh)} - ${f2(b.la)}`],
      ['Goles esperados finales', `${f2(res.lh)} - ${f2(res.la)}`],
      ['Dixon-Coles ρ', M.CFG.RHO],
    ];
    $('calc').innerHTML = rows.map(r => `<span class="k">${r[0]}</span><span class="num">${r[1]}</span>`).join('');
  }

  init();
})();
