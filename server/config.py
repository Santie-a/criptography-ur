"""Configuración por variables de entorno (todas opcionales)."""

from __future__ import annotations

import os
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


settings = Settings()
