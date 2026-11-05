"""Roles y límites de uso.

Dos roles:

  administrador  quien tiene MINICHAIN_ADMIN_TOKEN. Controla la simulación:
                 regenerar la red, firmar con las billeteras custodiadas por
                 el servidor (las de la demostración), minar, manipular y
                 explotar claves.
  público        cualquiera con la URL. Puede leer todo (la cadena es pública)
                 y enviar transacciones firmadas por él mismo: la firma ECDSA
                 es la autorización, no hace falta ninguna cuenta.

Sin MINICHAIN_ADMIN_TOKEN el servidor está en "modo abierto": todo el mundo es
administrador. Sirve para desarrollo local y nunca debe usarse en una URL
pública (el servidor lo advierte en el registro y en /api/health).

En producción (MINICHAIN_ENV=production, o en Render) falta de token no abre
nada: queda "bloqueado" y nadie es administrador hasta configurarlo.
"""

from __future__ import annotations

import hmac
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class AdminAuth:
    def __init__(self, token: str | None, production: bool = False):
        self.token = token or None
        # En producción, un token olvidado no debe convertir a todos en administradores.
        self.locked = production and self.token is None

    @property
    def required(self) -> bool:
        return self.token is not None or self.locked

    def is_admin(self, request: Request) -> bool:
        if self.locked:
            return False
        if not self.required:
            return True
        header = request.headers.get("authorization", "")
        scheme, _, given = header.partition(" ")
        if scheme.lower() != "bearer" or not given:
            return False
        # Comparación en tiempo constante: no revela cuántos caracteres acertó.
        return hmac.compare_digest(given.encode(), self.token.encode())

    def __call__(self, request: Request) -> None:
        """Dependencia de FastAPI para las rutas de administrador."""
        if not self.is_admin(request):
            detail = ("El servidor no tiene MINICHAIN_ADMIN_TOKEN configurado: nadie puede administrar."
                      if self.locked else "Esta acción requiere el token de administrador.")
            raise HTTPException(status_code=401, detail=detail,
                                headers={"WWW-Authenticate": "Bearer"})


class RateLimiter:
    """Ventana deslizante en memoria: `limit` peticiones por minuto y por IP.

    El administrador no tiene límite. Detrás del proxy de Render la IP real
    llega en X-Forwarded-For; uvicorn la usa si FORWARDED_ALLOW_IPS lo permite.
    """

    def __init__(self, limit_per_minute: int, auth: AdminAuth, window: float = 60.0):
        self.limit = limit_per_minute
        self.window = window
        self.auth = auth
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def __call__(self, request: Request) -> None:
        # Sin límite para el administrador (y, en modo abierto, para todos).
        if self.limit <= 0 or self.auth.is_admin(request):
            return
        ip = request.client.host if request.client else "desconocida"
        now = time.monotonic()
        with self._lock:
            hits = self._hits[ip]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                retry = max(1, int(self.window - (now - hits[0])))
                raise HTTPException(status_code=429,
                                    detail=f"Demasiadas peticiones. Intenta de nuevo en {retry} s.",
                                    headers={"Retry-After": str(retry)})
            hits.append(now)
            if len(self._hits) > 10_000:  # evita crecer sin límite
                stale = [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]
                for k in stale:
                    del self._hits[k]
