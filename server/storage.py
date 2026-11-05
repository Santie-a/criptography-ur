"""Persistencia del estado de la red.

El servidor sigue siendo la única autoridad: valida todo en memoria y, después
de cada cambio, guarda una copia aquí. Al arrancar, si hay una copia, la
restaura en lugar de generar una red nueva. Así la red sobrevive a reinicios
(Render reinicia los servicios gratuitos cuando quedan inactivos).

Tres implementaciones con la misma interfaz:

  MemoryStorage    no guarda nada (por defecto, desarrollo local)
  FileStorage      un archivo JSON (MINICHAIN_STATE_FILE)
  PostgresStorage  PostgreSQL, por ejemplo Supabase (DATABASE_URL)

Qué se guarda:
  - bloques: uno por fila, solo se insertan los nuevos
  - estado: una sola fila con los parámetros del escenario, la versión, la
    mempool y las billeteras custodiadas por el servidor (las de la
    demostración, con su clave privada simulada y la estrategia de nonce)
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from pathlib import Path
from typing import Protocol

log = logging.getLogger("minichain.storage")

FORMAT_VERSION = 1


class Storage(Protocol):
    kind: str

    def load(self) -> tuple[dict, list[dict]] | None:
        """Devuelve (estado, bloques en orden) o None si no hay nada guardado."""

    def save(self, state: dict, new_blocks: list[dict], replace: bool) -> None:
        """Guarda el estado y agrega `new_blocks` al final.

        Con `replace=True` se borran primero todos los bloques guardados (se
        regeneró la red) y `new_blocks` es la cadena completa.
        """


class MemoryStorage:
    kind = "memoria"

    def load(self) -> tuple[dict, list[dict]] | None:
        return None

    def save(self, state: dict, new_blocks: list[dict], replace: bool) -> None:
        return None


class FileStorage:
    """Un archivo JSON. Útil para desarrollo local y para las pruebas."""

    kind = "archivo"

    def __init__(self, path: str | os.PathLike):
        self.path = Path(path)
        self._blocks: list[dict] | None = None

    def load(self) -> tuple[dict, list[dict]] | None:
        if not self.path.exists():
            return None
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self._blocks = data["blocks"]
        return data["state"], data["blocks"]

    def save(self, state: dict, new_blocks: list[dict], replace: bool) -> None:
        if replace or self._blocks is None:
            self._blocks = [] if replace else (self.load() or ({}, []))[1]
        self._blocks.extend(new_blocks)
        payload = json.dumps({"format": FORMAT_VERSION, "state": state, "blocks": self._blocks},
                             ensure_ascii=False)
        # Escritura atómica: un archivo temporal que reemplaza al anterior.
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".minichain-", suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp, self.path)


SCHEMA_SQL = """
create schema if not exists minichain;

create table if not exists minichain.blocks (
    height     integer primary key,
    hash       text not null,
    data       jsonb not null,
    created_at timestamptz not null default now()
);

create table if not exists minichain.state (
    id         smallint primary key default 1 check (id = 1),
    data       jsonb not null,
    updated_at timestamptz not null default now()
);

-- Defensa en profundidad: con RLS activo y sin políticas, los roles de la API
-- de Supabase (anon, authenticated) no ven ninguna fila aunque el esquema se
-- expusiera por error. El servidor entra como dueño de las tablas y no lo afecta.
alter table minichain.blocks enable row level security;
alter table minichain.state  enable row level security;
"""


class PostgresStorage:
    """PostgreSQL (por ejemplo Supabase).

    Las tablas viven en el esquema `minichain`, no en `public`: Supabase solo
    expone `public` por su API REST, así que estas tablas no quedan accesibles
    desde internet con la clave anónima del proyecto. Solo el servidor las lee,
    con la cadena de conexión.
    """

    kind = "postgres"

    def __init__(self, url: str):
        import psycopg  # importación diferida: solo hace falta si se usa Postgres

        self._psycopg = psycopg
        self.url = url
        self._conn = None
        self._schema_ready = False
        self._lock = threading.Lock()
        # No se conecta aquí: si la base no está disponible al arrancar, el
        # servidor debe arrancar igual (y avisar), no caerse.

    def _connect(self):
        # prepare_threshold=None: el pooler de Supabase en modo transacción no
        # admite sentencias preparadas.
        return self._psycopg.connect(self.url, connect_timeout=10, prepare_threshold=None)

    def _run(self, fn):
        """Ejecuta `fn(cursor)` en una transacción; reconecta una vez si la conexión cayó."""
        with self._lock:
            for attempt in (1, 2):
                try:
                    if self._conn is None or self._conn.closed:
                        self._conn = self._connect()
                    if not self._schema_ready:
                        with self._conn.transaction(), self._conn.cursor() as cur:
                            cur.execute(SCHEMA_SQL)
                        self._schema_ready = True
                    with self._conn.transaction(), self._conn.cursor() as cur:
                        return fn(cur)
                except self._psycopg.OperationalError:
                    if self._conn is not None:
                        self._conn.close()
                    self._conn = None
                    if attempt == 2:
                        raise
                    log.warning("conexión a Postgres perdida; reintentando")

    def load(self) -> tuple[dict, list[dict]] | None:
        def q(cur):
            cur.execute("select data from minichain.state where id = 1")
            row = cur.fetchone()
            if row is None:
                return None
            cur.execute("select height, data from minichain.blocks order by height")
            rows = cur.fetchall()
            if [h for h, _ in rows] != list(range(len(rows))):
                raise ValueError("los bloques guardados no son consecutivos")
            return row[0], [d for _, d in rows]
        return self._run(q)

    def save(self, state: dict, new_blocks: list[dict], replace: bool) -> None:
        Json = self._psycopg.types.json.Jsonb

        def q(cur):
            if replace:
                cur.execute("delete from minichain.blocks")
            if new_blocks:
                cur.executemany(
                    "insert into minichain.blocks (height, hash, data) values (%s, %s, %s)",
                    [(b["index"], b["hash"], Json(b)) for b in new_blocks],
                )
            cur.execute(
                "insert into minichain.state (id, data, updated_at) values (1, %s, now()) "
                "on conflict (id) do update set data = excluded.data, updated_at = now()",
                (Json(state),),
            )
        self._run(q)


def storage_from_env(database_url: str | None, state_file: str | None) -> Storage:
    if database_url:
        return PostgresStorage(database_url)
    if state_file:
        return FileStorage(state_file)
    return MemoryStorage()
