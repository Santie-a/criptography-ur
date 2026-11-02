"""Billetera: un par de claves ECDSA y la estrategia de nonce que usa al firmar."""

from __future__ import annotations

import hashlib

from .curve import Point, encode_point, secp256k1
from .nonces import NonceFn, nonce_kind, rfc6979_nonce
from .signatures import Signature, generate_private_key, public_key, sign


def address_from_pubkey(pubkey: bytes) -> str:
    """Dirección = primeros 20 bytes de SHA-256(clave pública comprimida).

    (Bitcoin usa RIPEMD-160(SHA-256(·)) y Base58Check; aquí se simplifica.)
    """
    return "mc" + hashlib.sha256(pubkey).hexdigest()[:40]


class Wallet:
    def __init__(self, name: str, private_key: int, nonce_fn: NonceFn = rfc6979_nonce):
        self.name = name
        self._d = private_key
        self.nonce_fn = nonce_fn
        self.public_key: Point = public_key(private_key, secp256k1)
        self.pubkey_bytes = encode_point(self.public_key, compressed=True)
        self.pubkey_hex = self.pubkey_bytes.hex()
        self.address = address_from_pubkey(self.pubkey_bytes)

    @classmethod
    def generate(cls, name: str, rng=None, nonce_fn: NonceFn = rfc6979_nonce) -> "Wallet":
        return cls(name, generate_private_key(secp256k1, rng), nonce_fn)

    @property
    def nonce_kind(self) -> str:
        return nonce_kind(self.nonce_fn)

    @property
    def private_key(self) -> int:
        return self._d

    def sign(self, message: bytes) -> Signature:
        return sign(self._d, message, self.nonce_fn, secp256k1)

    def __repr__(self) -> str:
        return f"Wallet({self.name!r}, {self.address})"
