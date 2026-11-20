#!/bin/sh
# Descarga ~10,000 partidos (5 ligas, 2019-2025) de github.com/datasets/football-datasets (datos de football-data.co.uk).
cd "$(dirname "$0")" && mkdir -p data
for lg in premier-league la-liga serie-a bundesliga ligue-1; do
  for s in 1920 2021 2122 2223 2324 2425; do
    curl -sf -o "data/$lg-$s.csv" "https://raw.githubusercontent.com/datasets/football-datasets/main/datasets/$lg/season-$s.csv" || echo "falló $lg $s"
  done
done
echo "Listo. Corre: node backtest/backtest.js"
