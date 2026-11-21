// Marcador en vivo de los tickets abiertos: lee el scoreboard de ESPN de cada partido y califica cada selección.
(function (root) {
  'use strict';
  const US = { nba: 'basketball', nfl: 'football' };

  // ¿Puede cambiar todavía? Prueba goles futuros (0–4 por lado): si todas las opciones dan lo mismo, está decidida.
  function lockState(fn, hs, as, maxAdd = 4) {
    const now = !!fn(hs, as);
    let canFlip = false;
    for (let i = 0; i <= maxAdd && !canFlip; i++) for (let j = 0; j <= maxAdd; j++) if (!!fn(hs + i, as + j) !== now) { canFlip = true; break; }
    return now ? (canFlip ? 'ok' : 'lock-ok') : (canFlip ? 'risk' : 'lock-bad');
  }

  function fnFor(leg) {
    const parts = String(leg.matchKey || '').split(':');
    if (parts.length !== 3) return null;
    const id = String(leg.key || '').slice(leg.matchKey.length + 1);
    if (US[parts[0]]) return id === '1' ? (h, a) => h > a : id === '2' ? (h, a) => a > h : null;
    const M = root.RadarModel;
    const d = M && M.marketDefs('L', 'V').find(x => x.id === id);
    return d ? d.fn : null;
  }

  // Estado de una selección dado el partido de ESPN (parseEvent).
  function legState(leg, ev) {
    if (!ev) return { st: 'nodata' };
    const fn = fnFor(leg), score = ev.hs != null && ev.as != null ? `${ev.hs}-${ev.as}` : '';
    if (ev.state === 'pre' || (!ev.completed && ev.state !== 'in')) return { st: 'pre', date: ev.date, detail: ev.detail };
    if (!fn) return { st: ev.completed ? 'post-na' : 'in-na', score, detail: ev.detail };
    if (ev.completed || ev.state === 'post') return { st: fn(ev.hs, ev.as) ? 'won' : 'lost', score, detail: ev.detail };
    const us = US[String(leg.matchKey).split(':')[0]];
    return { st: us ? (fn(ev.hs, ev.as) ? 'ok' : 'risk') : lockState(fn, ev.hs, ev.as), score, detail: ev.detail };
  }

  // Calificación automática del ticket: perdido si una selección ya falló al final; ganado si todas se cumplieron.
  function grade(states) {
    if (states.some(s => s.st === 'lost')) return 'perdido';
    if (states.length && states.every(s => s.st === 'won')) return 'ganado';
    return null;
  }

  // Busca los partidos en ESPN (un scoreboard por liga y día).
  async function fetchEvents(legs) {
    const D = root.RadarData, need = new Map();
    for (const l of legs) {
      const p = String(l.matchKey || '').split(':');
      if (p.length !== 3 || !l.t) continue;
      const k = `${p[0]}|${D.espnDay(l.t)}`;
      if (!need.has(k)) need.set(k, { lg: p[0], day: D.espnDay(l.t) });
    }
    const out = new Map();
    await Promise.all([...need.values()].map(async ({ lg, day }) => {
      try {
        const sport = US[lg] || 'soccer';
        const d = await D.get(`apis/site/v2/sports/${sport}/${lg}/scoreboard`, { dates: day, fresh: String(Math.floor(Date.now() / 60000)) });
        for (const e of d.events || []) { const ev = D.parseEvent(e); out.set(`${lg}:${ev.homeId}:${ev.awayId}`, ev); }
      } catch (e) { /* sin datos de esa liga: se muestra como sin datos */ }
    }));
    return out;
  }

  const api = { lockState, legState, grade, fetchEvents, fnFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RadarLive = api;
})(typeof window !== 'undefined' ? window : globalThis);
