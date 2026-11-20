(function () {
  'use strict';
  const D = window.RadarData, Y = window.RadarDay;
  const $ = id => document.getElementById(id);
  const pct = p => (p * 100).toFixed(0) + '%';
  const f2 = x => (x == null || !isFinite(x)) ? '-' : x.toFixed(2);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SOCCER = D.LEAGUES.map(l => l.id);
  const MAIN = ['mex.1', 'uefa.champions', 'uefa.europa', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1'];

  function localISO(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10); }
  function hour(iso) { try { return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

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
    const ids = v === 'main' ? MAIN : v === 'soccer' ? SOCCER : v === 'all' ? [...SOCCER, 'nba', 'nfl'] : [v];
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
    return { key: `${mk}:${x.leg.id}`, matchKey: mk, match: `${Y.shortName(m.ev.homeName)} vs ${Y.shortName(m.ev.awayName)}`, label: x.leg.label, p: x.leg.p, prov: +(x.leg.odd || x.leg.est).toFixed(2), provSrc: x.leg.odd ? 'ESPN' : 'estimado' };
  }
  function btn(x) { return window.RadarSlipBtn ? window.RadarSlipBtn(legOf(x)) : ''; }

  // Etiquetas de contexto de tabla (solo cuando hay algo que decir).
  function motLine(m) {
    const parts = [[m.ev.homeName, m.motH], [m.ev.awayName, m.motA]].filter(([, x]) => x && x.tag !== 'normal')
      .map(([n, x]) => `<span class="mtag ${x.tag}">${esc(Y.shortName(n))}: ${esc(x.label)}</span>`);
    return parts.length ? `<br><span class="mline">${parts.join(' ')}</span>` : '';
  }

  function matchTitle(m) { return `${esc(Y.shortName(m.ev.homeName))} vs ${esc(Y.shortName(m.ev.awayName))}`; }

  let SHOWN = [];

  // Mercados de un partido: resultado, goles y ambos anotan (modelo + momio real si hay) y
  // córners, remates y tarjetas (modelo de conteos; momio estimado porque no hay fuente gratis).
  async function openMarkets(idx, btn) {
    const m = SHOWN[idx], panel = $('mk' + idx);
    const open = panel.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open); btn.textContent = open ? 'Mercados ▴' : 'Mercados ▾';
    if (!open || panel.dataset.done) return;
    panel.innerHTML = '<div class="loading"><span class="spin"></span>Calculando córners, remates y tarjetas…</div>';
    const name = n => Y.shortName(n);
    const MAIN = ['1', 'X', '2', '1X', 'X2', '12', 'O1.5', 'O2.5', 'O3.5', 'U2.5', 'U3.5', 'BTTS', 'NBTTS', 'H0.5', 'A0.5', 'H1.5', 'A1.5', '1&O1.5', '2&O1.5'];
    const rows = [];
    if (m.res) {
      for (const mk of m.res.markets) {
        if (!MAIN.includes(mk.id)) continue;
        let prov = m.odds && m.odds[mk.id], src = 'ESPN';
        const ci = { '1': 0, 'X': 1, '2': 2 }[mk.id];
        if (!prov && m.cons && ci != null) { prov = 1 / m.cons.probs[ci] / 1.05; src = 'consenso'; }
        if (!prov) { prov = mk.fair / 1.06; src = 'estimado'; }
        rows.push({ id: mk.id, group: mk.group, label: mk.label, p: mk.p, prov, src });
      }
    }
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
    const mkKey = `${m.lg}:${m.ev.homeId}:${m.ev.awayId}`, title = `${name(m.ev.homeName)} vs ${name(m.ev.awayName)}`;
    let html = '', g = '';
    for (const x of rows) {
      if (x.group !== g) { g = x.group; html += `<div class="mkg">${esc(g)}</div>`; }
      const vol = x.p >= 0.45 && x.p <= 0.55;
      const leg = { key: `${mkKey}:${x.id}`, matchKey: mkKey, match: title, label: x.label, p: x.p, prov: +x.prov.toFixed(2), provSrc: x.src };
      html += `<div class="mkr${x.p >= 0.7 ? ' hi' : ''}"><span>${esc(x.label)}${vol ? ' <span class="st vol">volado</span>' : ''}</span><span class="num">${pct(x.p)}</span><span class="num">${f2(x.prov)}<br><span class="m">${esc(x.src)}</span></span>${window.RadarSlipBtn ? window.RadarSlipBtn(leg) : ''}</div>`;
    }
    panel.innerHTML = `<div class="mkr hd"><span>Mercado</span><span>Prob.</span><span>Momio</span><span></span></div>${html}<p class="note">${esc(note)} "estimado" = momio justo del modelo menos el margen típico de la casa (6% en goles, 8% en córners/tarjetas). Escribe el real de Draftea en la calculadora. En verde, prob ≥ 70%.</p>`;
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
      html += t.legs.map(x => `<div class="leg"><span><b>${esc(x.leg.label)}</b><br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)} · ${hour(x.match.ev.date)}</span>${motLine(x.match)}</span>
        <span style="text-align:right"><b class="num">${pct(x.leg.p)}</b><br><span class="m">${x.leg.odd ? 'momio ' + f2(x.leg.odd) : 'pide ≥ ' + f2(x.leg.minNeeded)}</span></span>${btn(x)}</div>`).join('');
      html += `<button class="btn ghost sm" id="addall">Pasar el ticket sugerido a la calculadora</button>`;
      html += `<div class="sum"><span>Prob. de acertar todo: <b class="num">${pct(t.p)}</b></span><span>Momio total aprox.: <b class="num">${f2(t.odd)}</b></span></div>
        <p class="note">Una selección por partido. Solo selecciones con prob ≥ ${Math.round(R.MIN_P * 100)}% y momio ≥ 1.30, sin volados, máximo ${R.MAX_LEGS}. "Pide ≥" es el momio mínimo que debe darte Draftea o Novibet; si da menos, quita esa selección.</p>`;
    } else html += '<p class="note">Ningún partido de este día pasa los filtros. Mejor no apostar.</p>';
    html += '</div>';

    if (r.value.length) {
      html += '<h3>Picks con valor (momio de referencia ESPN)</h3>' + r.value.map(x => `<div class="leg"><span><b>${esc(x.leg.label)}</b><br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)}</span></span>
        <span style="text-align:right"><b class="num">${f2(x.leg.odd)}</b><br><span class="m">prob ${pct(x.leg.p)} · valor ${f2(x.leg.ev)}</span></span>${btn(x)}</div>`).join('');
    }

    if (r.matches.length) html += '<h3>Por empezar</h3>';
    let lg = '';
    for (const m of r.matches) {
      if (m.league !== lg) { lg = m.league; html += `<div class="lgh">${esc(lg)}</div>`; }
      const w = m.winner;
      const right = w ? `<b class="num">${pct(w.p)}</b>` : '<span class="m">sin datos</span>';
      const sub = w
        ? `${esc(w.label)}${m.safe && m.safe.id !== w.id ? ` · seguro: ${esc(m.safe.label)} ${pct(m.safe.p)}` : ''}${m.top ? ` · marcador ${m.top.h}-${m.top.a}` : ''}${m.cons ? ` · consenso ${m.cons.books} casas` : m.hasMarket ? '' : ' · sin momios'}`
        : (m.us ? 'ESPN aún no publica momios' : 'equipo sin partidos en la tabla');
      const clickable = !m.us && !m.noData;
      const idx = SHOWN.push(m) - 1;
      html += `<div class="dmw"><button class="dm" ${clickable ? `data-lg="${m.lg}" data-h="${m.ev.homeId}" data-a="${m.ev.awayId}"` : 'disabled'}>
        <span><b>${matchTitle(m)}</b> <span class="m">${hour(m.ev.date)}</span><br><span class="m">${sub}</span>${motLine(m)}</span><span style="text-align:right">${right}</span></button>
        ${m.legs && m.legs.length ? `<button class="mkbtn" data-mk="${idx}" aria-expanded="false">Mercados ▾</button><div class="mkpanel hidden" id="mk${idx}"></div>` : ''}</div>`;
    }
    if ((r.live || []).length) {
      html += '<h3>En juego (fuera del ticket)</h3>' + r.live.map(m => `<div class="dm" style="cursor:default"><span><b>${matchTitle(m)}</b> <span class="m">${esc(m.league)} · ${esc(m.ev.detail || 'en juego')}</span></span><span class="num">${m.ev.hs ?? '-'}-${m.ev.as ?? '-'}</span></div>`).join('');
    }
    if ((r.played || []).length) {
      const rv = r.review;
      html += `<h3>Ya jugados hoy${rv && rv.n ? ` · el modelo acertó ${rv.hits} de ${rv.n} selecciones` : ''}</h3>`;
      html += r.played.map(m => {
        const L = m.reviewLeg;
        const tag = L ? `<span class="st ${L.hit ? 'ok' : 'bad'}">${L.hit ? '✓' : '✗'} ${esc(L.label)} ${pct(L.p)}</span>` : '<span class="m">sin selección sugerida</span>';
        return `<div class="dm" style="cursor:default"><span><b>${matchTitle(m)}</b> <span class="m">${esc(m.league)}</span><br>${tag}</span><b class="num">${esc(m.result || '-')}</b></div>`;
      }).join('');
      if (rv && rv.surprises.length) html += `<p class="note">Sorpresas: ${rv.surprises.map(x => `${esc(x.label)} (${pct(x.p)}) no ganó`).join(' · ')}.</p>`;
      html += '<p class="note">La revisión usa la tabla de hoy, que ya incluye estos resultados; es una guía, no una medición exacta.</p>';
    }
    html += '<p class="note">Toca un partido de fútbol para ver el análisis completo y capturar tus momios. NBA y NFL usan la probabilidad de la casa sin margen (sin modelo propio todavía). El pronóstico del día usa tabla + forma + momios; el análisis completo además usa local/visita y bajas.</p>';
    $('dout').innerHTML = html;
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
