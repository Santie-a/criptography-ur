#!/usr/bin/env bash
# Modo desarrollo: API con recarga automática (puerto 8000) + Vite (puerto 5173).
# Abre http://localhost:5173. Ctrl+C detiene ambos.
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'kill 0' EXIT
${PYTHON:-python3} -m server --reload &
(cd frontend && npm run dev) &
wait
