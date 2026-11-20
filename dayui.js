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
    $('dgo').addEventListener('click', run);
  }

  let ran = false;
  window.RadarDayUI = { rerun: () => ran ? run() : Promise.resolve() };

  async function run() {
    const v = $('dlg').value, date = $('dday').value;
    ran = true;
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

  function matchTitle(m) { return `${esc(Y.shortName(m.ev.homeName))} vs ${esc(Y.shortName(m.ev.awayName))}`; }

  function render(r, date) {
    if (!r.matches.length) { $('dout').innerHTML = '<p class="note">No hay partidos ese día en lo que elegiste.</p>'; return; }
    const t = r.ticket;
    let html = `<div class="tk"><h3>Ticket sugerido · ${t.legs.length} patas</h3>`;
    if (t.legs.length) {
      html += t.legs.map(x => `<div class="leg"><span><b>${esc(x.leg.label)}</b><br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)} · ${hour(x.match.ev.date)}</span></span>
        <span style="text-align:right"><b class="num">${pct(x.leg.p)}</b><br><span class="m">${x.leg.odd ? 'momio ' + f2(x.leg.odd) : 'pide ≥ ' + f2(x.leg.minNeeded)}</span></span></div>`).join('');
      html += `<div class="sum"><span>Prob. de acertar todo: <b class="num">${pct(t.p)}</b></span><span>Momio total aprox.: <b class="num">${f2(t.odd)}</b></span></div>
        <p class="note">Una pata por partido. Solo patas con prob ≥ 62% y momio ≥ 1.30, sin volados, máximo 10. "Pide ≥" es el momio mínimo que debe darte Draftea o Novibet; si da menos, quita esa pata.</p>`;
    } else html += '<p class="note">Ningún partido de este día pasa los filtros. Mejor no apostar.</p>';
    html += '</div>';

    if (r.value.length) {
      html += '<h3>Picks con valor (momio de referencia ESPN)</h3>' + r.value.map(x => `<div class="leg"><span><b>${esc(x.leg.label)}</b><br><span class="m">${matchTitle(x.match)} · ${esc(x.match.league)}</span></span>
        <span style="text-align:right"><b class="num">${f2(x.leg.odd)}</b><br><span class="m">prob ${pct(x.leg.p)} · valor ${f2(x.leg.ev)}</span></span></div>`).join('');
    }

    html += '<h3>Todos los partidos</h3>';
    let lg = '';
    for (const m of r.matches) {
      if (m.league !== lg) { lg = m.league; html += `<div class="lgh">${esc(lg)}</div>`; }
      const w = m.winner;
      const right = w ? `<b class="num">${pct(w.p)}</b>` : '<span class="m">sin datos</span>';
      const sub = w
        ? `${esc(w.label)}${m.safe && m.safe.id !== w.id ? ` · seguro: ${esc(m.safe.label)} ${pct(m.safe.p)}` : ''}${m.top ? ` · marcador ${m.top.h}-${m.top.a}` : ''}${m.cons ? ` · consenso ${m.cons.books} casas` : m.hasMarket ? '' : ' · sin momios'}`
        : (m.us ? 'ESPN aún no publica momios' : 'equipo sin partidos en la tabla');
      const clickable = !m.us && !m.noData;
      html += `<button class="dm" ${clickable ? `data-lg="${m.lg}" data-h="${m.ev.homeId}" data-a="${m.ev.awayId}"` : 'disabled'}>
        <span><b>${matchTitle(m)}</b> <span class="m">${hour(m.ev.date)}</span><br><span class="m">${sub}</span></span><span style="text-align:right">${right}</span></button>`;
    }
    html += '<p class="note">Toca un partido de fútbol para ver el análisis completo y capturar tus momios. NBA y NFL usan la probabilidad de la casa sin margen (sin modelo propio todavía). El pronóstico del día usa tabla + forma + momios; el análisis completo además usa local/visita y bajas.</p>';
    $('dout').innerHTML = html;
    $('dout').querySelectorAll('.dm[data-lg]').forEach(b => b.addEventListener('click', () => window.RadarApp.openMatch(b.dataset.lg, b.dataset.h, b.dataset.a)));
  }

  init();
})();
