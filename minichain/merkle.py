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


def _leaf(txid: str) -> bytes:
    return _h(b"\x00" + bytes.fromhex(txid))


def _node(left: bytes, right: bytes) -> bytes:
    return _h(b"\x01" + left + right)


def merkle_levels(txids: list[str]) -> list[list[str]]:
    """Todos los niveles del árbol, de las hojas (nivel 0) a la raíz."""
    if not txids:
        return [[_h(b"").hex()]]
    level = [_leaf(t) for t in txids]
    levels = [level]
    while len(level) > 1:
        if len(level) % 2 == 1:
            level = level + [level[-1]]
        level = [_node(level[i], level[i + 1]) for i in range(0, len(level), 2)]
        levels.append(level)
    return [[x.hex() for x in lvl] for lvl in levels]


def merkle_root(txids: list[str]) -> str:
    return merkle_levels(txids)[-1][0]


def merkle_proof(txids: list[str], index: int) -> list[tuple[str, str]]:
    """Prueba de inclusión de txids[index]: lista de (hermano, lado).

    lado = "L" si el hermano va a la izquierda, "R" si va a la derecha.
    Con log2(#tx) hashes se demuestra que una tx está en el bloque sin
    descargar las demás (lo que hacen las billeteras ligeras, SPV).
    """
    if not 0 <= index < len(txids):
        raise IndexError("índice de transacción fuera de rango")
    level = [_leaf(t) for t in txids]
    proof = []
    while len(level) > 1:
        if len(level) % 2 == 1:
            level = level + [level[-1]]
        sibling = index ^ 1
        proof.append((level[sibling].hex(), "L" if sibling < index else "R"))
        level = [_node(level[i], level[i + 1]) for i in range(0, len(level), 2)]
        index //= 2
    return proof


def verify_merkle_proof(txid: str, proof: list[tuple[str, str]], root: str) -> bool:
    acc = _leaf(txid)
    for sibling_hex, side in proof:
        sibling = bytes.fromhex(sibling_hex)
        acc = _node(sibling, acc) if side == "L" else _node(acc, sibling)
    return acc.hex() == root
