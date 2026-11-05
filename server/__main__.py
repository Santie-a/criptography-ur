"""python -m server [--host 0.0.0.0] [--port 8000] [--reload]"""

import argparse
import logging

import uvicorn

from .config import settings

parser = argparse.ArgumentParser(description="Servidor de minichain (API + UI)")
parser.add_argument("--host", default=settings.host)
parser.add_argument("--port", type=int, default=settings.port)
parser.add_argument("--reload", action="store_true", help="reiniciar al cambiar el código")
args = parser.parse_args()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

print(f"\n  minichain en http://{args.host}:{args.port}   (API: /api/docs)\n")
# Un solo proceso: el estado de la red vive en memoria. Ver docs/DESPLIEGUE.md.
uvicorn.run("server.app:app", host=args.host, port=args.port, reload=args.reload, workers=1)
