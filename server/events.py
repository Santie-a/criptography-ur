"""Bus de eventos para notificar a los clientes conectados por WebSocket.

Cada cambio de estado (bloque minado, transacción nueva, reinicio...) se
publica como un mensaje JSON pequeño; los clientes vuelven a pedir lo que
necesiten por HTTP. Así el protocolo en tiempo real es mínimo.

Este bus vive en memoria de un solo proceso. Para correr varios procesos o
máquinas, se reemplaza por uno respaldado en Redis pub/sub con la misma
interfaz (publish / connect / disconnect). Ver docs/DESPLIEGUE.md.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import WebSocket


class EventBus:
    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def clients(self) -> int:
        return len(self._clients)

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)
        await self.publish({"type": "presence", "clients": self.clients})

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)
        await self.publish({"type": "presence", "clients": self.clients})

    async def publish(self, event: dict) -> None:
        message = json.dumps(event)
        async with self._lock:
            clients = list(self._clients)
        dead = []
        for ws in clients:
            try:
                await ws.send_text(message)
            except Exception:  # cliente desconectado a medias
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)
