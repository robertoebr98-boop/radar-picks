(function () {
  'use strict';
  const D = window.RadarData, Y = window.RadarDay;
  const $ = id => document.getElementById(id);
  const pct = p => (p * 100).toFixed(0) + '%';
  const f2 = x => (x == null || !isFinite(x)) ? '-' : x.toFixed(2);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SOCCER = D.LEAGUES.map(l => l.id);
  const MAIN = ['mex.1', 'col.1', 'jpn.1', 'uefa.champions', 'uefa.europa', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1'];

  // Ligas que Draftea MX suele ofrecer. No hay lista pública: es una lista conservadora y Roberto la ajusta en la página.
  const DFT_DEFAULT = ['mex.1', 'col.1', 'jpn.1', 'mex.w.1', 'uefa.champions', 'uefa.europa', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'ned.1', 'por.1', 'eng.w.1', 'usa.nwsl', 'uefa.wchampions', 'nba', 'nfl'];
  const DKEY = 'radar.dft';
  function loadDft() {
    const all = [...D.LEAGUES.map(l => l.id), 'nba', 'nfl'];
    try {
      const x = JSON.parse(localStorage.getItem(DKEY));
      if (x && Array.isArray(x.lgs)) {
        // Ligas nuevas en la página (que no existían cuando guardó): entran marcadas si están en la lista de Draftea.
        const known = x.known || all.filter(id => id !== 'col.1');
        for (const id of DFT_DEFAULT) if (!known.includes(id) && !x.lgs.includes(id)) x.lgs.push(id);
        x.known = all;
        return x;
      }
    } catch (e) { /* nada */ }
    return { on: true, lgs: DFT_DEFAULT, known: all };
  }
  let DFT = loadDft();
  function saveDft() { try { localStorage.setItem(DKEY, JSON.stringify(DFT)); } catch (e) { /* nada */ } }
  function dftPanel() {
    const all = [...D.LEAGUES, ...Y.US.map(u => ({ id: u.id, name: u.name }))];
    $('dftlist').innerHTML = all.map(l => `<label><input type="checkbox" data-dl="${l.id}" ${DFT.lgs.includes(l.id) ? 'checked' : ''}> ${esc(l.name)}</label>`).join('');
    $('dfton').checked = DFT.on;
    $('dftbox').classList.toggle('off', !DFT.on);
  }

  function localISO(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10); }
  // Hora de México (como la muestra Draftea).
  function hour(iso) { try { return new Date(iso).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; } }
  const hr = iso => `<span class="hr num">${hour(iso)}</span>`;
  const byTime = (a, b) => new Date(a.ev.date) - new Date(b.ev.date);

  function init() {
    $('dday').value = localISO(new Date());
    $('dlg').innerHTML = [
      '<option value="main">Fútbol: ligas principales</option>',
      '<option value="soccer">Fútbol: todas</option>',
      ...D.LEAGUES.map(l => `<option value="${l.id}">${esc(l.name)}</option>`),
      ...Y.US.map(u => `<option value="${u.id}">${u.name} (momios de la casa)</option>`),
      '<option value="all">Todo (fútbol + NBA + NFL)</option>',
    ].join('');
    $('dgo').addEventListener('click', () => run());
    dftPanel();
    $('dfton').addEventListener('change', () => { DFT.on = $('dfton').checked; saveDft(); dftPanel(); });
    $('dftlist').addEventListener('change', e => {
      const id = e.target.dataset.dl; if (!id) return;
      DFT.lgs = e.target.checked ? [...new Set([...DFT.lgs, id])] : DFT.lgs.filter(x => x !== id);
      saveDft();
    });
    $('dftreset').addEventListener('click', () => { DFT = { on: true, lgs: DFT_DEFAULT, known: DFT.known }; saveDft(); dftPanel(); });
  }

  let ran = false;
  window.RadarDayUI = {
    rerun: () => ran ? run(true) : Promise.resolve(),
    clear: () => { ran = false; $('dout').innerHTML = ''; $('dmsg').innerHTML = ''; },
  };

  async function run(quiet) {
    const v = $('dlg').value, date = $('dday').value;
    ran = true;
    if (!quiet) {
      // El pronóstico reemplaza al análisis de un partido.
      if (window.RadarApp) window.RadarApp.hideMatch();
      $('dout').classList.remove('hidden');
    }
    if (!date) return;
    let ids = v === 'main' ? MAIN : v === 'soccer' ? SOCCER : v === 'all' ? [...SOCCER, 'nba', 'nfl'] : [v];
    // Solo ligas de Draftea (si eligió una liga suelta, se respeta su elección).
    if (DFT.on && ids.length > 1) ids = ids.filter(id => DFT.lgs.includes(id));
    if (!ids.length) { $('dout').innerHTML = ''; $('dmsg').innerHTML = '<p class="note">Ninguna liga marcada en "Solo ligas de Draftea". Marca alguna o apaga el filtro.</p>'; return; }
    $('dout').innerHTML = '';
    $('dmsg').innerHTML = '<div class="loading"><span class="spin"></span>Analizando partidos…</div>';
    $('dgo').disabled = true;
    try {
      const r = await Y.runDay(date, ids, (d, n) => { $('dmsg').innerHTML = `<div class="loading"><span class="spin"></span>Analizando ligas: ${d} de ${n}…</div>`; });
      $('dmsg').innerHTML = r.errors.length ? `<p class="note">No cargaron: ${esc(r.errors.join(' · '))}</p>` : '';
      LASTREQ = { date, ids };
      render(r, date);
    } catch (e) {
      $('dmsg').innerHTML = `<div class="err">No pude armar el pronóstico: ${esc(e.message)}</div>`;
    } finally { $('dgo').disabled = false; }
  }

  function legOf(x) {
    const m = x.match, mk = `${m.lg}:${m.ev.homeId}:${m.ev.awayId}`;
    return { key: `${mk}:${x.leg.id}`, matchKey: mk, lam: m.res ? [m.res.lh, m.res.la] : null, t: m.ev.date, match: `${Y.shortName(m.ev.homeName)} vs ${Y.shortName(m.ev.awayName)}`, label: x.leg.label, p: x.leg.p, prov: +(x.leg.odd || x.leg.est).toFixed(2), provSrc: x.leg.odd ? 'ESPN' : 'estimado' };
  }
  function btn(x) { return window.RadarSlipBtn ? window.RadarSlipBtn(legOf(x)) : ''; }

  // Etiquetas de contexto de tabla (solo cuando hay algo que decir).
  function motLine(m) {
    const parts = [[m.ev.homeName, m.motH], [m.ev.awayName, m.motA]].filter(([, x]) => x && x.tag !== 'normal')
      .map(([n, x]) => `<span class="mtag ${x.tag}">${esc(Y.shortName(n))}: ${esc(x.label)}</span>`);
    return parts.length ? `<br><span class="mline">${parts.join(' ')}</span>` : '';
  }

  // Lectura automática del partido (posible ganador y por qué).
  const pOf = (m, id) => { const x = m.res && m.res.markets.find(k => k.id === id); return x ? x.p : null; };
  function readingOf(m) {
    const RR = window.RadarReading;
    if (!RR || !m.res || m.us) return null;
    return RR.text({ h: Y.shortName(m.ev.homeName), a: Y.shortName(m.ev.awayName), p1: pOf(m, '1'), px: pOf(m, 'X'), p2: pOf(m, '2'),
      lh: m.res.lh, la: m.res.la, formH: Y.formArr(m.ev.homeForm), formA: Y.formArr(m.ev.awayForm), motH: m.motH, motA: m.motA, h2h: m.h2hS });
  }
  const fold = (title, body, cls = '') => `<details class="tk fold ${cls}"><summary>${title}</summary>${body}</details>`;

  function matchTitle(m) { return `${esc(Y.shortName(m.ev.homeName))} vs ${esc(Y.shortName(m.ev.awayName))}`; }

  let SHOWN = [];
  let LADMIN = 1.30, LADP = 0.40, LAST = null, LASTREQ = null;
  const DREAM = { stake: 5, target: 30000, days: 1, extra: [] };
  async function buildDream() {
    const box = $('dream'); if (!box || !LAST) return;
    DREAM.stake = Math.max(1, +$('drstake').value || 5); DREAM.target = Math.max(100, +$('drtarget').value || 30000); DREAM.days = +$('drdays').value || 1;
    let matches = [...LAST.matches];
    if (DREAM.days > 1 && LASTREQ) {
      box.innerHTML = '<div class="loading"><span class="spin"></span>Juntando partidos de los próximos días…</div>';
      for (let d = 1; d < DREAM.days; d++) {
        const dt = new Date(LASTREQ.date + 'T12:00:00'); dt.setDate(dt.getDate() + d);
        try { const r2 = await Y.runDay(localISO(dt), LASTREQ.ids); matches.push(...r2.matches); } catch (e) { /* sigue con lo que hay */ }
      }
    }
    const odd = DREAM.target / DREAM.stake;
    const t = Y.dreamParlay(matches, odd);
    if (!t) { box.innerHTML = `<p class="note">Con ${matches.length} partidos no se llega a momio ${Math.round(odd).toLocaleString('es-MX')}. Suma días o baja el objetivo.</p>`; return; }
    const oneIn = Math.round(1 / t.p);
    const p5 = Y.dreamParlay(matches, 20);
    box.innerHTML = `<div class="sum"><span>${t.legs.length} selecciones · momio <b class="num">${Math.round(t.odd).toLocaleString('es-MX')}</b></span><span>$${DREAM.stake} → <b class="num">$${Math.round(DREAM.stake * t.odd).toLocaleString('es-MX')}</b></span></div>
      <div class="warnbox"><b>Probabilidad real: ${(t.p * 100).toFixed(t.p < 0.001 ? 4 : 2)}%</b>, o sea, pega <b>1 de cada ${oneIn.toLocaleString('es-MX')}</b> intentos. Jugando $${DREAM.stake} cada semana, en promedio tardarías ${oneIn > 104 ? `${(oneIn / 52).toFixed(0)} años` : `${oneIn} semanas`} en pegarlo y gastarías ~$${(oneIn * DREAM.stake).toLocaleString('es-MX')} en el camino. Valor esperado ${(t.ev * 100).toFixed(0)}% por ticket${t.real < t.legs.length ? ' (con momios estimados; con momios reales de Draftea cambia)' : ''}.
      ${p5 ? `<br>Para tener ~5% de probabilidad el momio debe ser ~20x: con estos partidos, momio ${p5.odd.toFixed(1)} pega ${(p5.p * 100).toFixed(1)}% ($${DREAM.stake} → $${Math.round(DREAM.stake * p5.odd)}).` : ''}</div>
      <div class="dlegs">${t.legs.map(x => `<div class="leg"><span>${hr(x.match.ev.date)} <b>${esc(x.leg.label)}</b>${x.leg.prop ? ' <span class="st lean" title="Córners/tarjetas: validado en 3,800 partidos de las 5 grandes ligas; momio estimado">conteo · estimado</span>' : ''}<br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)}</span></span><span style="text-align:right"><b class="num">${pct(x.leg.p)}</b><br><span class="m">${x.leg.odd ? 'momio ' + f2(x.leg.odd) : 'aprox ' + f2(x.leg.est)}</span></span>${btn(x)}</div>`).join('')}</div>
      <button class="btn ghost sm" id="dradd">Pasar el parlay soñador a la calculadora</button>
      <p class="note">Elige en cada partido la selección que más momio da por cada punto de probabilidad que pierdes, hasta llegar al premio. Es la forma más probable de llegar a ese momio con estos partidos, pero sigue siendo una lotería: tómalo como entretenimiento, aparte de tus tickets regulares, y guárdalo en Mis tickets como "Soñador".</p>`;
    const add = $('dradd');
    if (add) add.addEventListener('click', () => {
      for (const x of t.legs) { const l = legOf(x); if (!window.RadarSlip.has(l.key)) window.RadarSlip.add(l); }
      if (window.RadarSlip.setStake) window.RadarSlip.setStake(DREAM.stake);
      if (window.RadarSaved && window.RadarSaved.setKind) window.RadarSaved.setKind('sonador');
      $('slip').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderLadder() {
    const box = $('ladder');
    if (!box || !LAST) return;
    const rows = Y.bestCombos(LAST.matches, LADP, LADMIN);
    if (!rows.length) { box.innerHTML = `<p class="note">Ninguna combinación llega a ${Math.round(LADP * 100)}% con momio mínimo ${LADMIN.toFixed(2)}. Baja la prob. mínima o el momio mínimo.</p>`; return; }
    const stake = (window.RadarSlip && window.RadarSlip.snapshot().stake) || 10;
    box.innerHTML = rows.map((x, i) => `<div class="combo${i === 0 ? ' top' : ''}">
      <div class="ch"><span><b>${x.n} ${x.n === 1 ? 'selección' : 'selecciones'}</b>${i === 0 ? ' <span class="st ok">paga más</span>' : ''}</span>
        <span class="num">prob <b>${pct(x.p)}</b> · momio <b>${f2(x.odd)}</b> · $${stake} → <b>$${(stake * x.odd).toFixed(0)}</b></span></div>
      <div class="m">${x.legs.map(l => `<b>${esc(l.leg.label)}</b> ${matchTitle(l.match)} (${pct(l.leg.p)}${l.leg.odd ? ', ESPN ' + f2(l.leg.odd) : ''})`).join('<br>')}</div>
      <div class="m">valor esperado ${(x.ev * 100).toFixed(0)}% ${x.real < x.n ? `· ${x.n - x.real} con momio estimado` : '· todos con momio real'}</div>
      <button class="btn ghost sm" data-lad="${i}">Pasar a la calculadora</button></div>`).join('');
    box.querySelectorAll('[data-lad]').forEach(b => b.addEventListener('click', () => {
      const row = rows[+b.dataset.lad];
      for (const x of row.legs) { const l = legOf(x); if (!window.RadarSlip.has(l.key)) window.RadarSlip.add(l); }
      $('slip').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  // Mercados principales de un partido con su momio provisional (ESPN, consenso o estimado).
  const MAIN_MK = ['1', 'X', '2', '1X', 'X2', '12', 'O1.5', 'O2.5', 'O3.5', 'U2.5', 'U3.5', 'BTTS', 'NBTTS', 'H0.5', 'A0.5', 'H1.5', 'A1.5', '1&O1.5', '2&O1.5'];
  function mainRows(m) {
    const rows = [];
    if (!m.res) return rows;
    for (const mk of m.res.markets) {
      if (!MAIN_MK.includes(mk.id)) continue;
      let prov = m.odds && m.odds[mk.id], src = 'ESPN';
      const ci = { '1': 0, 'X': 1, '2': 2 }[mk.id];
      if (!prov && m.cons && ci != null) { prov = 1 / m.cons.probs[ci] / 1.05; src = 'consenso'; }
      if (!prov) { prov = mk.fair / 1.06; src = 'estimado'; }
      rows.push({ id: mk.id, group: mk.group, label: mk.label, p: mk.p, prov, src });
    }
    return rows;
  }
  // Le pasa a la calculadora las alternativas de cada partido para el botón Optimizar.
  function registerMatch(m) {
    if (!window.RadarSlip || !window.RadarSlip.register) return;
    const mk = `${m.lg}:${m.ev.homeId}:${m.ev.awayId}`, title = `${Y.shortName(m.ev.homeName)} vs ${Y.shortName(m.ev.awayName)}`;
    for (const x of mainRows(m)) window.RadarSlip.register({ key: `${mk}:${x.id}`, matchKey: mk, lam: m.res ? [m.res.lh, m.res.la] : null, t: m.ev.date, match: title, label: x.label, p: x.p, prov: +x.prov.toFixed(2), provSrc: x.src });
  }

  // Mercados de un partido: resultado, goles y ambos anotan (modelo + momio real si hay) y
  // córners, remates y tarjetas (modelo de conteos; momio estimado porque no hay fuente gratis).
  async function openMarkets(idx, btn) {
    const m = SHOWN[idx], panel = $('mk' + idx);
    const open = panel.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open); btn.textContent = open ? 'Mercados ▴' : 'Mercados ▾';
    if (!open || panel.dataset.done) return;
    panel.innerHTML = '<div class="loading"><span class="spin"></span>Calculando córners, remates y tarjetas…</div>';
    const name = n => Y.shortName(n);
    const rows = mainRows(m);
    let note = '';
    if (!m.us && window.RadarProps) {
      try {
        const avgs = await window.RadarProps.leagueHistory(m.lg);
        const props = window.RadarProps.markets(m.ev, avgs, m.lg, name(m.ev.homeName), name(m.ev.awayName));
        for (const x of props) rows.push({ id: x.id, group: x.group, label: x.label, p: x.p, prov: x.fair / window.RadarProps.PROP_MARGIN, src: 'estimado' });
        if (props.expected) note = `Esperado: ${props.expected.corners.toFixed(1)} córners · ${props.expected.shots.toFixed(0)} remates · ${props.expected.sot.toFixed(1)} a puerta · ${props.expected.cards.toFixed(1)} tarjetas.`;
        else note = 'Sin suficientes partidos recientes con estadísticas para córners, remates y tarjetas.';
        if (Y.PROP_LGS && !Y.PROP_LGS.includes(m.lg) && window.RadarProps.selfCheck) {
          const ck = await window.RadarProps.selfCheck(m.lg).catch(() => null);
          const tx = g => { const v = ck && ck[g]; return !v || !v.matches ? `${g.toLowerCase()} sin datos suficientes` : `${g.toLowerCase()} ${v.ok ? 'validados' : 'NO validados'} (${v.matches} partidos: dijo ${Math.round(v.said * 100)}%, pasó ${Math.round(v.hit * 100)}%)`; };
          note += ` Prueba con los últimos 150 días de esta liga: ${tx('Córners')}; ${tx('Tarjetas')}. Solo lo validado entra al ticket sugerido.`;
        }
      } catch (e) { note = 'No pude cargar córners/remates/tarjetas.'; }
    }
    // Últimos 5 enfrentamientos: contexto (y ya pesan 10% en los goles esperados).
    let h2hHtml = '';
    if (m.h2hGames && m.h2hGames.length && D.statsFor) {
      const sm = await D.statsFor(m.lg, m.h2hGames).catch(() => new Map());
      const H = window.RadarModel.h2hSummary(m.h2hGames, m.ev.homeId, sm);
      const av = (x, l) => x ? ` · ${x.avg.toFixed(1)} ${l}` : '';
      h2hHtml = `<p class="note"><b>Últimos ${H.n} entre ellos:</b> ${esc(name(m.ev.homeName))} ${H.w}G ${H.d}E ${H.l}P · ${(H.gH + H.gA).toFixed(1)} goles por partido · más de 2.5 en ${H.o25}/${H.n} · ambos anotan ${H.btts}/${H.n}${av(H.corners, 'córners')}${av(H.shots, 'remates')}${av(H.cards, 'tarjetas')}.${H.n >= window.RadarModel.CFG.H2H_MIN ? ' Ya pesa 10% en los goles esperados.' : ' Pocos partidos: solo contexto.'}</p>`;
    } else if (!m.us) h2hHtml = '<p class="note">Sin enfrentamientos recientes en esta liga.</p>';
    const mkKey = `${m.lg}:${m.ev.homeId}:${m.ev.awayId}`, title = `${name(m.ev.homeName)} vs ${name(m.ev.awayName)}`;
    let html = '', g = '';
    for (const x of rows) {
      if (x.group !== g) { g = x.group; html += `<div class="mkg">${esc(g)}</div>`; }
      const vol = x.p >= 0.45 && x.p <= 0.55;
      const leg = { key: `${mkKey}:${x.id}`, matchKey: mkKey, lam: m.res ? [m.res.lh, m.res.la] : null, t: m.ev.date, match: title, label: x.label, p: x.p, prov: +x.prov.toFixed(2), provSrc: x.src };
      html += `<div class="mkr${x.p >= 0.7 ? ' hi' : ''}"><span>${esc(x.label)}${vol ? ' <span class="st vol">volado</span>' : ''}</span><span class="num">${pct(x.p)}</span><span class="num">${f2(x.prov)}<br><span class="m">${esc(x.src)}</span></span>${window.RadarSlipBtn ? window.RadarSlipBtn(leg) : ''}</div>`;
    }
    panel.innerHTML = h2hHtml + `<div class="mkr hd"><span>Mercado</span><span>Prob.</span><span>Momio</span><span></span></div>${html}<p class="note">${esc(note)} "estimado" = momio justo del modelo menos el margen típico de la casa (6% en goles, 8% en córners/tarjetas). Escribe el real de Draftea en la calculadora. En verde, prob ≥ 70%.</p>`;
    panel.dataset.done = '1';
    if (window.RadarSlip) window.RadarSlip.refresh();
  }

  function render(r, date) {
    SHOWN = [];
    const t = r.ticket, R = r.rules || Y.TICKET;
    const nothing = !r.matches.length && !(r.played || []).length && !(r.live || []).length;
    if (nothing) { $('dout').innerHTML = '<p class="note">No hay partidos ese día en lo que elegiste.</p>'; return; }
    let html = '';
    // Estrategia del día según cómo le fue al modelo en los partidos ya jugados.
    const modeCls = { normal: 'ok', cauteloso: 'vol', defensivo: 'bad' }[R.mode] || 'no';
    html += `<div class="strat"><span class="st ${modeCls}">Estrategia: ${esc(R.mode || 'normal')}</span> <span>${esc(R.why || '')}</span></div>`;
    if (!r.matches.length) html += '<p class="note">Ya no quedan partidos por empezar ese día. Abajo ves cómo le fue al modelo.</p>';
    html += `<div class="tk"><h3>Ticket sugerido · ${t.legs.length} selecciones · solo partidos por empezar</h3>`;
    if (t.legs.length) {
      html += [...t.legs].sort((a, b) => byTime(a.match, b.match)).map(x => `<div class="leg"><span>${hr(x.match.ev.date)} <b>${esc(x.leg.label)}</b><br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)}</span>${motLine(x.match)}</span>
        <span style="text-align:right"><b class="num">${pct(x.leg.p)}</b><br><span class="m">${x.leg.odd ? 'momio ' + f2(x.leg.odd) : 'pide ≥ ' + f2(x.leg.minNeeded)}</span></span>${btn(x)}</div>`).join('');
      html += `<button class="btn ghost sm" id="addall">Pasar el ticket sugerido a la calculadora</button>`;
      html += `<div class="sum"><span>Prob. de acertar todo: <b class="num">${pct(t.p)}</b></span><span>Momio total aprox.: <b class="num">${f2(t.odd)}</b></span></div>
        <p class="note">Prob ≥ ${Math.round(R.MIN_P * 100)}%, momio ≥ 1.30, sin volados. "Pide ≥": si Draftea da menos, quítala.</p>`;
    } else html += '<p class="note">Ningún partido de este día pasa los filtros. Mejor no apostar.</p>';
    html += '</div>';

    html += '<div class="tools">';
    // Parlay soñador: entrada chica, premio grande, con la probabilidad real a la vista.
    html += fold('Parlay soñador <span class="m">entrada chica, premio grande</span>', `
      <div class="opth">
        <label class="m">Entrada $<input class="in sm" id="drstake" type="number" min="1" step="1" value="${DREAM.stake}" style="width:70px"></label>
        <label class="m">Premio objetivo $<input class="in sm" id="drtarget" type="number" min="100" step="1000" value="${DREAM.target}" style="width:100px"></label>
        <label class="m">Partidos de <select class="in sm" id="drdays">${[1, 2, 3].map(d => `<option value="${d}" ${d === DREAM.days ? 'selected' : ''}>${d === 1 ? 'este día' : d + ' días'}</option>`).join('')}</select></label>
        <button class="btn sm" id="drgo">Armar</button></div>
      <div id="dream"></div>`, 'dream');
    // Mejor momio para tu riesgo: ranking de combinaciones con prob. total mínima.
    html += fold('Mejor momio para tu riesgo <span class="m">combinaciones con prob. mínima</span>', `
      <div class="opth"><label class="m">Prob. total mínima <select class="in sm" id="ladp">${[0.30, 0.40, 0.50, 0.60].map(x => `<option value="${x}" ${x === LADP ? 'selected' : ''}>${Math.round(x * 100)}%</option>`).join('')}</select></label>
      <label class="m">Momio mínimo por selección <select class="in sm" id="ladmin">${[1.30, 1.25, 1.20, 1.15].map(x => `<option value="${x}" ${x === LADMIN ? 'selected' : ''}>${x.toFixed(2)}${x === 1.30 ? ' (tu regla)' : ''}</option>`).join('')}</select></label></div>
      <div id="ladder"></div>
      <p class="note">Una selección por partido. Con momios estimados, para el mismo riesgo <b>menos selecciones pagan más</b> (cada una suma ~6% de margen de la casa).</p>`);
    if (r.value.length) {
      html += fold(`Picks con valor <span class="m">${r.value.length} con momio ESPN</span>`, [...r.value].sort((a, b) => byTime(a.match, b.match)).map(x => `<div class="leg"><span>${hr(x.match.ev.date)} <b>${esc(x.leg.label)}</b><br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)}</span></span>
        <span style="text-align:right"><b class="num">${f2(x.leg.odd)}</b><br><span class="m">prob ${pct(x.leg.p)} · valor ${f2(x.leg.ev)}</span></span>${btn(x)}</div>`).join(''));
    }

    html += '</div>';
    if (r.matches.length) html += '<h3>Por empezar · por hora de México</h3><div class="dgrid">';
    for (const m of [...r.matches].sort(byTime)) {
      const w = m.winner;
      const right = w ? `<b class="num">${pct(w.p)}</b>` : '<span class="m">sin datos</span>';
      const rd = readingOf(m);
      const sub = rd ? `<span class="rdl ${rd.tag}">${esc(rd.lines[0])}</span>${rd.lines[1] ? `<br><span class="m">${esc(rd.lines[1])}</span>` : ''}` : w
        ? `${esc(w.label)}${m.safe && m.safe.id !== w.id ? ` · seguro: ${esc(m.safe.label)} ${pct(m.safe.p)}` : ''}${m.res ? ` · goles esperados ${f2(m.res.lh)}–${f2(m.res.la)}` : ''}${m.cons ? ` · consenso ${m.cons.books} casas` : m.hasMarket ? '' : ' · sin momios'}`
        : (m.us ? 'ESPN aún no publica momios' : 'equipo sin partidos en la tabla');
      const clickable = !m.us && !m.noData;
      const idx = SHOWN.push(m) - 1;
      registerMatch(m);
      html += `<div class="dmw"><button class="dm" ${clickable ? `data-lg="${m.lg}" data-h="${m.ev.homeId}" data-a="${m.ev.awayId}"` : 'disabled'}>
        <span>${hr(m.ev.date)} <b>${matchTitle(m)}</b> <span class="m">${esc(m.league)}</span><br><span class="m">${sub}</span>${motLine(m)}</span><span style="text-align:right">${right}</span></button>
        ${m.legs && m.legs.length ? `<button class="mkbtn" data-mk="${idx}" aria-expanded="false">Mercados ▾</button><div class="mkpanel hidden" id="mk${idx}"></div>` : ''}</div>`;
    }
    if (r.matches.length) html += '</div>';
    if ((r.live || []).length) {
      html += '<h3>En juego (fuera del ticket)</h3>' + [...r.live].sort(byTime).map(m => `<div class="dm" style="cursor:default"><span>${hr(m.ev.date)} <b>${matchTitle(m)}</b> <span class="m">${esc(m.league)} · ${esc(m.ev.detail || 'en juego')}</span></span><span class="num">${m.ev.hs ?? '-'}-${m.ev.as ?? '-'}</span></div>`).join('');
    }
    if ((r.played || []).length) {
      const rv = r.review;
      let ph = '', rdN = 0, rdOk = 0;
      ph += [...r.played].sort(byTime).map(m => {
        const L = m.reviewLeg;
        const rd = readingOf(m), rh = rd && window.RadarReading.hit(rd, m.ev.hs, m.ev.as);
        if (rh != null) { rdN++; if (rh) rdOk++; }
        const rdTag = rh == null ? '' : ` <span class="st ${rh ? 'ok' : 'bad'}">lectura ${rh ? '✓' : '✗'} ${rd.winner === 'x' ? 'parejo' : esc(Y.shortName(rd.winner === 'h' ? m.ev.homeName : m.ev.awayName))}</span>`;
        const tag = L ? `<span class="st ${L.hit ? 'ok' : 'bad'}">${L.hit ? '✓' : '✗'} ${esc(L.label)} ${pct(L.p)}</span>` : '<span class="m">sin selección sugerida</span>';
        return `<div class="dm" style="cursor:default"><span>${hr(m.ev.date)} <b>${matchTitle(m)}</b> <span class="m">${esc(m.league)}</span><br>${tag}${rdTag}</span><b class="num">${esc(m.result || '-')}</b></div>`;
      }).join('');
      if (rv && rv.surprises.length) ph += `<p class="note">Sorpresas: ${rv.surprises.map(x => `${esc(x.label)} (${pct(x.p)}) no ganó`).join(' · ')}.</p>`;
      ph += '<p class="note">Usa la tabla de hoy, que ya incluye estos resultados: es guía, no medición exacta. "Parejo" acierta si nadie gana por 2 o más.</p>';
      const sumTxt = [rv && rv.n ? `selecciones ${rv.hits}/${rv.n}` : '', rdN ? `lectura ${rdOk}/${rdN}` : ''].filter(Boolean).join(' · ');
      html += fold(`Ya jugados hoy <span class="m">${sumTxt}</span>`, ph);
    }
    html += '<p class="note">Toca un partido para ver el análisis completo. NBA y NFL usan la probabilidad de la casa sin margen.</p>';
    $('dout').innerHTML = html;
    LAST = r; renderLadder();
    const lm = $('ladmin'); if (lm) lm.addEventListener('change', () => { LADMIN = +lm.value; renderLadder(); });
    const lp = $('ladp'); if (lp) lp.addEventListener('change', () => { LADP = +lp.value; renderLadder(); });
    const dg = $('drgo'); if (dg) dg.addEventListener('click', () => buildDream());
    const all = $('addall');
    if (all) all.addEventListener('click', () => {
      for (const x of t.legs) { const l = legOf(x); if (!window.RadarSlip.has(l.key)) window.RadarSlip.add(l); }
      $('slip').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (window.RadarSlip) window.RadarSlip.refresh();
    $('dout').querySelectorAll('[data-mk]').forEach(b => b.addEventListener('click', () => openMarkets(+b.dataset.mk, b)));
    $('dout').querySelectorAll('.dm[data-lg]').forEach(b => b.addEventListener('click', () => window.RadarApp.openMatch(b.dataset.lg, b.dataset.h, b.dataset.a)));
  }

  init();
})();
