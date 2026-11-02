"""Ataque por reutilización del nonce k, usando solo datos públicos de la cadena.

Cada transacción publica la clave pública Q del emisor, la firma (r, s) y el
mensaje firmado, del que cualquiera calcula z = H(m). Si la misma clave firmó
dos mensajes distintos con el mismo k, entonces r = (k·G)_x mod n se repite y

    s1 = k⁻¹(z1 + r·d)       s2 = k⁻¹(z2 + r·d)      (mod n)

Restando:  s1 - s2 = k⁻¹(z1 - z2)   ⇒   k = (z1 - z2)(s1 - s2)⁻¹  (mod n)
Despejando de la primera:               d = (s1·k - z1)·r⁻¹      (mod n)

Detalle: si una implementación normaliza s a "low-s" (s → n - s, como exige
Bitcoin desde BIP 62/146), una de las firmas puede venir con el signo
cambiado. Por eso se prueban s2 y -s2, y cada candidato a d se confirma
comprobando d·G == Q, también con datos públicos.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from itertools import combinations

from .block import Block
from .curve import Curve, Point, decode_point, secp256k1
from .ntheory import modinv
from .signatures import digest_to_int, hash_message


@dataclass(frozen=True)
class ObservedSignature:
    block: int
    tx: int
    pubkey_hex: str
    address: str
    r: int
    s: int
    z: int


@dataclass(frozen=True)
class Recovery:
    first: ObservedSignature
    second: ObservedSignature
    k: int
    d: int


def harvest_signatures(blocks: list[Block], curve: Curve = secp256k1) -> list[ObservedSignature]:
    """Extrae (Q, r, s, z) de todas las transacciones firmadas de la cadena."""
    observed = []
    for block in blocks:
        for j, tx in enumerate(block.transactions):
            if tx.is_coinbase or tx.signature is None:
                continue
            z = digest_to_int(hash_message(tx.payload()), curve.n)
            observed.append(ObservedSignature(block.index, j, tx.sender, tx.sender_address,
                                              tx.signature.r, tx.signature.s, z))
    return observed


def find_nonce_reuse(observed: list[ObservedSignature]) -> list[tuple[ObservedSignature, ObservedSignature]]:
    """Pares de firmas de una misma clave con el mismo r sobre mensajes distintos."""
    groups: dict[tuple[str, int], list[ObservedSignature]] = defaultdict(list)
    for sig in observed:
        groups[(sig.pubkey_hex, sig.r)].append(sig)
    pairs = []
    for sigs in groups.values():
        for a, b in combinations(sigs, 2):
            if a.z != b.z:
                pairs.append((a, b))
    return pairs


def recover_from_pair(r: int, s1: int, z1: int, s2: int, z2: int,
                      Q: Point | None = None, curve: Curve = secp256k1) -> tuple[int, int] | None:
    """Aplica las fórmulas del ataque. Devuelve (k, d) o None.

    Si se pasa Q, el resultado se confirma con d·G == Q.
    """
    n = curve.n
    for s2_signed in (s2, (-s2) % n):
        if (s1 - s2_signed) % n == 0:
            continue
        k = (z1 - z2) * modinv(s1 - s2_signed, n) % n
        if k == 0:
            continue
        d = (s1 * k - z1) * modinv(r, n) % n
        if Q is None:
            return k, d
        if d != 0 and d * curve.G == Q:
            return k, d
    return None


def recover_private_keys(blocks: list[Block], curve: Curve = secp256k1) -> dict[str, Recovery]:
    """Ejecuta el ataque completo. Devuelve {dirección víctima: Recovery}."""
    found: dict[str, Recovery] = {}
    for a, b in find_nonce_reuse(harvest_signatures(blocks, curve)):
        if a.address in found:
            continue
        Q = decode_point(curve, bytes.fromhex(a.pubkey_hex))
        result = recover_from_pair(a.r, a.s, a.z, b.s, b.z, Q, curve)
        if result is not None:
            found[a.address] = Recovery(a, b, *result)
    return found
