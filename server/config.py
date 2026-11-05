"""Configuración por variables de entorno (todas opcionales)."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _list(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("MINICHAIN_HOST", "127.0.0.1")
    # PORT es la variable que asignan Render y otros proveedores.
    port: int = int(os.getenv("MINICHAIN_PORT") or os.getenv("PORT") or "8000")
    # Orígenes permitidos para CORS. Solo hace falta si la UI se sirve desde
    # otro dominio/puerto (por ejemplo el servidor de desarrollo de Vite).
    cors_origins: list[str] = field(default_factory=lambda: _list(
        os.getenv("MINICHAIN_CORS", "http://localhost:5173,http://127.0.0.1:5173")))
    # Carpeta con la UI compilada (npm run build). Si existe, se sirve en "/".
    frontend_dist: Path = Path(os.getenv("MINICHAIN_FRONTEND_DIST", str(ROOT / "frontend" / "dist")))
    # Escenario inicial
    seed: int = int(os.getenv("MINICHAIN_SEED", "2026"))
    difficulty: int = int(os.getenv("MINICHAIN_DIFFICULTY", "14"))
    # Límite de dificultad por bloque, para que nadie bloquee el servidor minando.
    max_difficulty: int = int(os.getenv("MINICHAIN_MAX_DIFFICULTY", "22"))
    # Persistencia. Si hay DATABASE_URL se usa PostgreSQL (por ejemplo Supabase);
    # si no, MINICHAIN_STATE_FILE (un archivo JSON); si no, solo memoria.
    database_url: str | None = os.getenv("DATABASE_URL") or os.getenv("MINICHAIN_DATABASE_URL") or None
    state_file: str | None = os.getenv("MINICHAIN_STATE_FILE") or None
    # Token del administrador. Sin él, el servidor está en modo abierto (todos
    # son administradores): solo para desarrollo local.
    admin_token: str | None = os.getenv("MINICHAIN_ADMIN_TOKEN") or None
    # Peticiones públicas de escritura por minuto y por IP (0 = sin límite).
    rate_limit: int = int(os.getenv("MINICHAIN_RATE_LIMIT", "60"))
    # Monedas que regala Minera a cada participante nuevo (0 = desactivado).
    faucet_amount: int = int(os.getenv("MINICHAIN_FAUCET", "25"))
    # Minar la mempool cada N segundos (0 = solo minado manual).
    automine: int = int(os.getenv("MINICHAIN_AUTOMINE", "0"))
    # URL con la que los demás dispositivos abren la aplicación (para el QR de
    # invitación). Render define RENDER_EXTERNAL_URL automáticamente.
    public_url: str | None = (os.getenv("MINICHAIN_PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or None)


def lan_url(s: Settings) -> str | None:
    """Adivina la URL en la red local cuando el servidor escucha en todas las interfaces.

    Sirve para el QR de invitación al exponer desde un PC: quien lo abre en
    localhost vería "localhost", que en un celular no apunta a este equipo.
    Dentro de Docker la IP sería la del contenedor, así que no se adivina.
    """
    if s.public_url or s.host != "0.0.0.0" or Path("/.dockerenv").exists():
        return None
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))  # UDP: no envía nada, solo elige la interfaz
            ip = sock.getsockname()[0]
    except OSError:
        return None
    if ip.startswith("127."):
        return None
    return f"http://{ip}:{s.port}"


settings = Settings()
