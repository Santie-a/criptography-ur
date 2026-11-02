"""ECDSA implementado sobre la aritmética de curve.py.

Claves:        d ∈ [1, n-1] secreta,  Q = d·G pública.
Firma de m:    z = H(m) (truncado a los bits de n)
               k ← nonce,  R = k·G,  r = R_x mod n
               s = k⁻¹ (z + r·d) mod n          → firma (r, s)
Verificación:  w = s⁻¹,  u1 = z·w,  u2 = r·w
               X = u1·G + u2·Q,  válida si X_x mod n == r

Por qué funciona: u1·G + u2·Q = w(z + r·d)·G = w·s·k·G = k·G = R.
"""

from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass

from .curve import Curve, Point, secp256k1
from .nonces import NonceFn, random_nonce
from .ntheory import modinv


@dataclass(frozen=True)
class Signature:
    r: int
    s: int

    def to_hex(self, curve: Curve = secp256k1) -> str:
        size = (curve.n.bit_length() + 7) // 8
        return (self.r.to_bytes(size, "big") + self.s.to_bytes(size, "big")).hex()

    @classmethod
    def from_hex(cls, data: str, curve: Curve = secp256k1) -> "Signature":
        raw = bytes.fromhex(data)
        size = (curve.n.bit_length() + 7) // 8
        if len(raw) != 2 * size:
            raise ValueError("longitud de firma inválida")
        return cls(int.from_bytes(raw[:size], "big"), int.from_bytes(raw[size:], "big"))


def hash_message(message: bytes) -> bytes:
    return hashlib.sha256(message).digest()


def digest_to_int(digest: bytes, n: int) -> int:
    """z: los bits más a la izquierda del hash, tantos como bits tenga n."""
    z = int.from_bytes(digest, "big")
    excess = len(digest) * 8 - n.bit_length()
    if excess > 0:
        z >>= excess
    return z


def generate_private_key(curve: Curve = secp256k1, rng=None) -> int:
    """d uniforme en [1, n-1]. rng (random.Random) solo para datos simulados."""
    if rng is None:
        return secrets.randbelow(curve.n - 1) + 1
    return rng.randrange(1, curve.n)


def public_key(d: int, curve: Curve = secp256k1) -> Point:
    if not 1 <= d < curve.n:
        raise ValueError("clave privada fuera de rango")
    return d * curve.G


def sign_digest(d: int, digest: bytes, nonce_fn: NonceFn = random_nonce,
                curve: Curve = secp256k1) -> Signature:
    n = curve.n
    z = digest_to_int(digest, n)
    for _ in range(100):
        k = nonce_fn(d, digest, curve)
        if not 1 <= k < n:
            raise ValueError("el generador de nonces devolvió un k fuera de rango")
        R = k * curve.G
        r = R.x % n
        if r == 0:
            continue
        s = modinv(k, n) * (z + r * d) % n
        if s == 0:
            continue
        return Signature(r, s)
    raise RuntimeError("no se pudo producir una firma (¿nonce degenerado?)")


def sign(d: int, message: bytes, nonce_fn: NonceFn = random_nonce,
         curve: Curve = secp256k1) -> Signature:
    return sign_digest(d, hash_message(message), nonce_fn, curve)


def verify_digest(Q: Point, digest: bytes, sig: Signature) -> bool:
    curve = Q.curve
    n = curve.n
    if Q.is_infinity:
        return False
    if not (1 <= sig.r < n and 1 <= sig.s < n):
        return False
    if curve.h != 1 and not (n * Q).is_infinity:
        return False  # Q fuera del subgrupo de orden n
    z = digest_to_int(digest, n)
    w = modinv(sig.s, n)
    u1 = z * w % n
    u2 = sig.r * w % n
    X = u1 * curve.G + u2 * Q
    if X.is_infinity:
        return False
    return X.x % n == sig.r


def verify(Q: Point, message: bytes, sig: Signature) -> bool:
    return verify_digest(Q, hash_message(message), sig)
