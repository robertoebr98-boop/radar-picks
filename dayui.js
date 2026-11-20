(function () {
  'use strict';
  const D = window.RadarData, Y = window.RadarDay;
  const $ = id => document.getElementById(id);
  const pct = p => (p * 100).toFixed(0) + '%';
  const f2 = x => (x == null || !isFinite(x)) ? '-' : x.toFixed(2);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SOCCER = D.LEAGUES.map(l => l.id);
  const MAIN = ['mex.1', 'uefa.champions', 'uefa.europa', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1'];

  // Ligas que Draftea MX suele ofrecer. No hay lista pública: es una lista conservadora y Roberto la ajusta en la página.
  const DFT_DEFAULT = ['mex.1', 'mex.w.1', 'uefa.champions', 'uefa.europa', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'ned.1', 'por.1', 'eng.w.1', 'usa.nwsl', 'uefa.wchampions', 'nba', 'nfl'];
  const DKEY = 'radar.dft';
  function loadDft() { try { const x = JSON.parse(localStorage.getItem(DKEY)); if (x && Array.isArray(x.lgs)) return x; } catch (e) { /* nada */ } return { on: true, lgs: DFT_DEFAULT }; }
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
    $('dftreset').addEventListener('click', () => { DFT = { on: true, lgs: DFT_DEFAULT }; saveDft(); dftPanel(); });
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
      render(r, date);
    } catch (e) {
      $('dmsg').innerHTML = `<div class="err">No pude armar el pronóstico: ${esc(e.message)}</div>`;
    } finally { $('dgo').disabled = false; }
  }

  function legOf(x) {
    const m = x.match, mk = `${m.lg}:${m.ev.homeId}:${m.ev.awayId}`;
    return { key: `${mk}:${x.leg.id}`, matchKey: mk, t: m.ev.date, match: `${Y.shortName(m.ev.homeName)} vs ${Y.shortName(m.ev.awayName)}`, label: x.leg.label, p: x.leg.p, prov: +(x.leg.odd || x.leg.est).toFixed(2), provSrc: x.leg.odd ? 'ESPN' : 'estimado' };
  }
  function btn(x) { return window.RadarSlipBtn ? window.RadarSlipBtn(legOf(x)) : ''; }

  // Etiquetas de contexto de tabla (solo cuando hay algo que decir).
  function motLine(m) {
    const parts = [[m.ev.homeName, m.motH], [m.ev.awayName, m.motA]].filter(([, x]) => x && x.tag !== 'normal')
      .map(([n, x]) => `<span class="mtag ${x.tag}">${esc(Y.shortName(n))}: ${esc(x.label)}</span>`);
    return parts.length ? `<br><span class="mline">${parts.join(' ')}</span>` : '';
  }

  // Tu opinión por partido, al lado del modelo (no cambia sus números).
  const OP = () => window.RadarOpinion;
  const opKey = m => `${m.lg}:${m.ev.homeId}:${m.ev.awayId}:${String(m.ev.date || '').slice(0, 10)}`;
  const pOf = (m, id) => { const x = m.res && m.res.markets.find(k => k.id === id); return x ? x.p : null; };
  function opTag(m) {
    const r = OP() && OP().get(opKey(m));
    if (!r) return '';
    const a = OP().agreement(r.pModel);
    return a ? `<span class="st ${a.tag}">modelo ${pct(r.pModel)} · ${a.text}</span>` : '';
  }
  function opSelect(m, idx) {
    if (!OP() || !m.res || m.us) return '';
    const r = OP().get(opKey(m)), h = Y.shortName(m.ev.homeName), v = Y.shortName(m.ev.awayName);
    const opts = OP().PICKS.map(p => `<option value="${p.id}" ${r && r.pick === p.id ? 'selected' : ''}>${esc(p.label(h, v))}</option>`).join('');
    return `<div class="opw"><label>Tu opinión <select class="in sm" data-op="${idx}"><option value="">—</option>${opts}</select></label><span id="opt${idx}">${opTag(m)}</span></div>`;
  }
  function opPlayed(m) {
    if (!OP()) return '';
    const r = OP().resolve(opKey(m), m.ev.hs, m.ev.as);
    if (!r || r.hit == null) return '';
    const lab = (OP().PICKS.find(p => p.id === r.pick) || { label: () => r.pick }).label(Y.shortName(m.ev.homeName), Y.shortName(m.ev.awayName));
    return ` <span class="st ${r.hit ? 'ok' : 'bad'}">tu opinión ${r.hit ? '✓' : '✗'} ${esc(lab)}</span>`;
  }
  function opSummary() {
    const s = OP() && OP().stats();
    if (!s || (!s.n && !s.pending)) return '';
    if (!s.n) return `<p class="note">Tienes ${s.pending} opinión(es) esperando resultado. Cuando terminen los partidos verás aquí si tu intuición le gana al modelo.</p>`;
    const verdict = s.n < 30 ? `Con ${s.n} opiniones aún es muy pronto para concluir; hacen falta unas 30.`
      : s.hits > s.expected + 2 ? 'Tu intuición acierta más de lo que el modelo esperaba: vale la pena tomarla en cuenta.'
      : s.hits < s.expected - 2 ? 'Tu intuición acierta menos de lo que el modelo esperaba: confía más en el modelo.'
      : 'Tu intuición acierta lo mismo que el modelo esperaba: no le agrega ni le quita.';
    return `<div class="tk"><h3>Tu opinión vs el modelo</h3>
      <div class="sum"><span>Acertaste <b class="num">${s.hits} de ${s.n}</b></span><span>El modelo esperaba <b class="num">${s.expected.toFixed(1)}</b></span></div>
      <p class="note">Cuando el modelo coincidía (≥60%): ${s.agree.hits} de ${s.agree.n}. Cuando no coincidía (&lt;40%): ${s.disagree.hits} de ${s.disagree.n}. ${verdict}${s.pending ? ` Pendientes: ${s.pending}.` : ''}</p></div>`;
  }

  function matchTitle(m) { return `${esc(Y.shortName(m.ev.homeName))} vs ${esc(Y.shortName(m.ev.awayName))}`; }

  let SHOWN = [];

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
    for (const x of mainRows(m)) window.RadarSlip.register({ key: `${mk}:${x.id}`, matchKey: mk, t: m.ev.date, match: title, label: x.label, p: x.p, prov: +x.prov.toFixed(2), provSrc: x.src });
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
      const leg = { key: `${mkKey}:${x.id}`, matchKey: mkKey, t: m.ev.date, match: title, label: x.label, p: x.p, prov: +x.prov.toFixed(2), provSrc: x.src };
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
        <p class="note">Una selección por partido. Solo selecciones con prob ≥ ${Math.round(R.MIN_P * 100)}% y momio ≥ 1.30, sin volados, máximo ${R.MAX_LEGS}. "Pide ≥" es el momio mínimo que debe darte Draftea o Novibet; si da menos, quita esa selección.</p>`;
    } else html += '<p class="note">Ningún partido de este día pasa los filtros. Mejor no apostar.</p>';
    html += '</div>';

    if (r.value.length) {
      html += '<h3>Picks con valor (momio de referencia ESPN)</h3>' + [...r.value].sort((a, b) => byTime(a.match, b.match)).map(x => `<div class="leg"><span>${hr(x.match.ev.date)} <b>${esc(x.leg.label)}</b><br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)}</span></span>
        <span style="text-align:right"><b class="num">${f2(x.leg.odd)}</b><br><span class="m">prob ${pct(x.leg.p)} · valor ${f2(x.leg.ev)}</span></span>${btn(x)}</div>`).join('');
    }

    if (r.matches.length) html += '<h3>Por empezar · por hora de México</h3>';
    for (const m of [...r.matches].sort(byTime)) {
      const w = m.winner;
      const right = w ? `<b class="num">${pct(w.p)}</b>` : '<span class="m">sin datos</span>';
      const sub = w
        ? `${esc(w.label)}${m.safe && m.safe.id !== w.id ? ` · seguro: ${esc(m.safe.label)} ${pct(m.safe.p)}` : ''}${m.top ? ` · marcador ${m.top.h}-${m.top.a}` : ''}${m.cons ? ` · consenso ${m.cons.books} casas` : m.hasMarket ? '' : ' · sin momios'}`
        : (m.us ? 'ESPN aún no publica momios' : 'equipo sin partidos en la tabla');
      const clickable = !m.us && !m.noData;
      const idx = SHOWN.push(m) - 1;
      registerMatch(m);
      html += `<div class="dmw"><button class="dm" ${clickable ? `data-lg="${m.lg}" data-h="${m.ev.homeId}" data-a="${m.ev.awayId}"` : 'disabled'}>
        <span>${hr(m.ev.date)} <b>${matchTitle(m)}</b> <span class="m">${esc(m.league)}</span><br><span class="m">${sub}</span>${motLine(m)}</span><span style="text-align:right">${right}</span></button>
        ${m.legs && m.legs.length ? `<button class="mkbtn" data-mk="${idx}" aria-expanded="false">Mercados ▾</button><div class="mkpanel hidden" id="mk${idx}"></div>` : ''}${opSelect(m, idx)}</div>`;
    }
    if ((r.live || []).length) {
      html += '<h3>En juego (fuera del ticket)</h3>' + [...r.live].sort(byTime).map(m => `<div class="dm" style="cursor:default"><span>${hr(m.ev.date)} <b>${matchTitle(m)}</b> <span class="m">${esc(m.league)} · ${esc(m.ev.detail || 'en juego')}</span></span><span class="num">${m.ev.hs ?? '-'}-${m.ev.as ?? '-'}</span></div>`).join('');
    }
    if ((r.played || []).length) {
      const rv = r.review;
      html += `<h3>Ya jugados hoy${rv && rv.n ? ` · el modelo acertó ${rv.hits} de ${rv.n} selecciones` : ''}</h3>`;
      html += [...r.played].sort(byTime).map(m => {
        const L = m.reviewLeg;
        const tag = L ? `<span class="st ${L.hit ? 'ok' : 'bad'}">${L.hit ? '✓' : '✗'} ${esc(L.label)} ${pct(L.p)}</span>` : '<span class="m">sin selección sugerida</span>';
        return `<div class="dm" style="cursor:default"><span>${hr(m.ev.date)} <b>${matchTitle(m)}</b> <span class="m">${esc(m.league)}</span><br>${tag}${opPlayed(m)}</span><b class="num">${esc(m.result || '-')}</b></div>`;
      }).join('');
      if (rv && rv.surprises.length) html += `<p class="note">Sorpresas: ${rv.surprises.map(x => `${esc(x.label)} (${pct(x.p)}) no ganó`).join(' · ')}.</p>`;
      html += '<p class="note">La revisión usa la tabla de hoy, que ya incluye estos resultados; es una guía, no una medición exacta.</p>';
    }
    html += opSummary();
    html += '<p class="note">Toca un partido de fútbol para ver el análisis completo y capturar tus momios. NBA y NFL usan la probabilidad de la casa sin margen (sin modelo propio todavía). El pronóstico del día usa tabla + forma + momios; el análisis completo además usa local/visita y bajas.</p>';
    $('dout').innerHTML = html;
    const all = $('addall');
    if (all) all.addEventListener('click', () => {
      for (const x of t.legs) { const l = legOf(x); if (!window.RadarSlip.has(l.key)) window.RadarSlip.add(l); }
      $('slip').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (window.RadarSlip) window.RadarSlip.refresh();
    $('dout').querySelectorAll('select[data-op]').forEach(sel => sel.addEventListener('change', () => {
      const m = SHOWN[+sel.dataset.op], k = opKey(m);
      OP().set(k, sel.value ? { pick: sel.value, pModel: pOf(m, sel.value), match: `${Y.shortName(m.ev.homeName)} vs ${Y.shortName(m.ev.awayName)}`, date: m.ev.date } : null);
      $('opt' + sel.dataset.op).innerHTML = opTag(m);
    }));
    $('dout').querySelectorAll('[data-mk]').forEach(b => b.addEventListener('click', () => openMarkets(+b.dataset.mk, b)));
    $('dout').querySelectorAll('.dm[data-lg]').forEach(b => b.addEventListener('click', () => window.RadarApp.openMatch(b.dataset.lg, b.dataset.h, b.dataset.a)));
  }

  init();
})();
