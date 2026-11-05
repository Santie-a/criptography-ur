"""python -m server [--host 0.0.0.0] [--port 8000] [--reload]"""

import argparse
import logging
import os

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
# proxy_headers: detrás del proxy de Render, la IP real del cliente llega en
# X-Forwarded-For (la usa el límite de peticiones). Solo se confía en ella si
# viene de FORWARDED_ALLOW_IPS (en el Dockerfile se fija en "*").
uvicorn.run("server.app:app", host=args.host, port=args.port, reload=args.reload, workers=1,
            proxy_headers=True, forwarded_allow_ips=os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1"))
