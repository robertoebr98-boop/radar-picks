# Radar de picks

Escribe el partido ("Tigres vs América") y la página trae tabla, forma de los últimos 5, partidos entre ellos, goleadores y momios de referencia. Calcula probabilidades con Poisson + Dixon-Coles, mezcla 50/50 con la casa sin margen y marca picks de **doblete** (≥70% en el peor caso, momio ≥1.30) y de **valor** (prob × momio ≥ 1.05).

**Costo: $0.** Datos públicos de ESPN (sin API key), modelo propio en JavaScript (sin IA), hosting gratis en Vercel.

## Pronóstico del día
Elige fecha y liga (o todas): analiza cada partido con tabla + forma + momios de ESPN, da el ganador probable y arma un ticket sugerido (una pata por partido, prob ≥ 62%, momio ≥ 1.30, sin volados, máx 10). NBA y NFL: probabilidad de la casa sin margen.

## Archivos
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
