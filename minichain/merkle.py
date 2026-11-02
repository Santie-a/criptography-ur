"""Árbol de Merkle sobre los identificadores de las transacciones.

hoja  = SHA-256(0x00 || txid)
nodo  = SHA-256(0x01 || izquierdo || derecho)

Los prefijos 0x00 / 0x01 separan hojas de nodos internos (evitan que un nodo
interno se haga pasar por hoja). Si un nivel tiene un número impar de nodos,
el último se duplica, como en Bitcoin.
"""

from __future__ import annotations

import hashlib


def _h(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def merkle_root(txids: list[str]) -> str:
    if not txids:
        return _h(b"").hex()
    level = [_h(b"\x00" + bytes.fromhex(t)) for t in txids]
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        level = [_h(b"\x01" + level[i] + level[i + 1]) for i in range(0, len(level), 2)]
    return level[0].hex()
