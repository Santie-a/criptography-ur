"""Estrategias para generar el nonce k de ECDSA.

Toda la seguridad de ECDSA depende de que k sea secreto, uniforme y distinto
en cada firma. Este módulo incluye una estrategia correcta (aleatoria), la
defensa (RFC 6979) y dos generadores defectuosos que reproducen fallos reales.

Una estrategia es cualquier función  (d, digest, curve) -> k  con 1 <= k < n.
"""

from __future__ import annotations

import hashlib
import hmac
import random
import secrets
from typing import Callable

from .curve import Curve

NonceFn = Callable[[int, bytes, Curve], int]


def random_nonce(d: int, digest: bytes, curve: Curve) -> int:
    """Nonce uniforme en [1, n-1] tomado del CSPRNG del sistema operativo."""
    return secrets.randbelow(curve.n - 1) + 1


# ---------------------------------------------------------------- RFC 6979

def _bits2int(data: bytes, qlen: int) -> int:
    x = int.from_bytes(data, "big")
    blen = len(data) * 8
    if blen > qlen:
        x >>= blen - qlen
    return x


def _int2octets(x: int, rlen: int) -> bytes:
    return x.to_bytes(rlen, "big")


def _bits2octets(data: bytes, q: int, qlen: int, rlen: int) -> bytes:
    z1 = _bits2int(data, qlen)
    return _int2octets(z1 % q, rlen)


def rfc6979_nonce(d: int, digest: bytes, curve: Curve, hashfunc=hashlib.sha256) -> int:
    """Nonce determinista según RFC 6979, sección 3.2 (HMAC-DRBG).

    k = F(d, H(m)): mismo mensaje y misma clave dan el mismo k; mensajes
    distintos dan nonces independientes. No depende de ningún generador
    aleatorio, así que un RNG roto ya no puede filtrar la clave.
    """
    q = curve.n
    qlen = q.bit_length()
    rlen = (qlen + 7) // 8
    hlen = hashfunc().digest_size

    def mac(key: bytes, msg: bytes) -> bytes:
        return hmac.new(key, msg, hashfunc).digest()

    x = _int2octets(d, rlen)
    h1 = _bits2octets(digest, q, qlen, rlen)

    V = b"\x01" * hlen                       # paso b
    K = b"\x00" * hlen                       # paso c
    K = mac(K, V + b"\x00" + x + h1)         # paso d
    V = mac(K, V)                            # paso e
    K = mac(K, V + b"\x01" + x + h1)         # paso f
    V = mac(K, V)                            # paso g
    while True:                              # paso h
        T = b""
        while len(T) * 8 < qlen:
            V = mac(K, V)
            T += V
        k = _bits2int(T, qlen)
        if 1 <= k < q:
            return k
        K = mac(K, V + b"\x00")
        V = mac(K, V)


# ------------------------------------------------------ generadores rotos

class ConstantNonce:
    """Siempre el mismo k. Es el error de Sony en la PS3 (expuesto en 2010):
    el firmware se firmaba con un k fijo, y con dos firmas cualesquiera se
    recuperó la clave privada de la consola."""

    def __init__(self, k: int):
        self.k = k

    def __call__(self, d: int, digest: bytes, curve: Curve) -> int:
        return self.k % (curve.n - 1) + 1


class WeakRNGNonce:
    """Generador con muy poca entropía efectiva.

    Modela el fallo de SecureRandom en Android (agosto de 2013): el generador
    no se inicializaba bien y producía salidas repetidas, y varias billeteras
    de Bitcoin firmaron transacciones distintas con el mismo k.

    Aquí el estado interno solo puede tomar 2**entropy_bits valores. Por el
    principio del palomar, tras 2**entropy_bits + 1 firmas hay al menos un k
    repetido, y por la paradoja del cumpleaños suele ocurrir mucho antes.
    """

    def __init__(self, entropy_bits: int = 3, seed: int | None = None):
        if not 1 <= entropy_bits <= 64:
            raise ValueError("entropy_bits debe estar entre 1 y 64")
        self.entropy_bits = entropy_bits
        self._rng = random.Random(seed)

    def __call__(self, d: int, digest: bytes, curve: Curve) -> int:
        state = self._rng.getrandbits(self.entropy_bits)
        out = hashlib.sha256(b"weak-rng" + state.to_bytes(8, "big")).digest()
        return int.from_bytes(out, "big") % (curve.n - 1) + 1
