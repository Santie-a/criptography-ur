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
    port: int = int(os.getenv("MINICHAIN_PORT", "8000"))
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


settings = Settings()
