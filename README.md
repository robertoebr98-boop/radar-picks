# Radar de picks

Escribe el partido ("Tigres vs América") y la página trae tabla, forma de los últimos 5, partidos entre ellos, goleadores y momios de referencia. Calcula probabilidades con Poisson + Dixon-Coles, mezcla 50/50 con la casa sin margen y marca picks de **doblete** (≥70% en el peor caso, momio ≥1.30) y de **valor** (prob × momio ≥ 1.05).

**Costo: $0.** Datos públicos de ESPN (sin API key), modelo propio en JavaScript (sin IA), hosting gratis en Vercel.

## Pronóstico del día
Elige fecha y liga (o todas): analiza cada partido con tabla + forma + momios de ESPN, da el ganador probable y arma un ticket sugerido (una selección por partido, prob ≥ 62%, momio ≥ 1.30, sin volados, máx 10). NBA y NFL: probabilidad de la casa sin margen.

## Más fuentes (gratis)
- **Remates a puerta** por partido: calendario de ESPN (automático).
- **Consenso de varias casas** (opcional): crea una key gratis en the-odds-api.com y agrégala en Vercel → Settings → Environment Variables como `ODDS_API_KEY`, luego Redeploy. Sin key, la página usa los momios de ESPN.
- **Backtest:** `backtest/RESULTADOS.md`.

## Calculadora de ticket
Toca + en cualquier mercado, en el ticket sugerido o en los picks con valor. Columna provisional automática + columna Draftea. Al recargar la página todo arranca limpio (ticket, momios capturados, bajas); solo se recuerdan la liga y el tema.

## Mis tickets
Guarda el ticket de la calculadora (nombre, selecciones, momios, monto, pago) en este navegador. Abrir, marcar ganado/perdido/pendiente, borrar, balance. Exportar/Importar archivo para pasarlos entre celular y PC.

## Contexto de tabla
Cada equipo lleva etiqueta: Ya clasificado / Se juega algo / Nada en juego (solo en el último cuarto de la temporada). Quien se juega algo recibe +8% de ataque (backtest). Ya clasificado = aviso de posible rotación.

## Archivos
- `context.js`: contexto de tabla.
- `saved.js`: Mis tickets.
- `slip.js`: calculadora de ticket.
- `day.js`, `dayui.js`: pronóstico del día.
- `index.html`, `app.js`: la página.
- `model.js`: el modelo (Poisson, Dixon-Coles, mezcla con mercado, filtros).
- `data.js`: lectura de ESPN.
- `api/espn.js`: proxy gratuito en Vercel (cache 10 min).
- `mock/`: datos de ejemplo. Abre `/?demo=1` para ver la página sin internet.

## Probar en tu compu
```
npm test          # 10 pruebas del modelo
npm run dev       # http://localhost:3000  (o /?demo=1)
```

## Límites conocidos
- ESPN no publica lesiones de fútbol: marca las bajas a mano en la página.
- Sin xG público gratis: el modelo usa goles reales.
- La API de ESPN no es oficial; si cambia, hay que ajustar `data.js`.
- NBA y NFL: siguiente fase.
