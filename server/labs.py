"""Laboratorios sin estado: curva de juguete y ECDSA paso a paso."""

from __future__ import annotations

import hashlib

from minichain.curve import (Curve, Point, decode_point, encode_point, enumerate_points,
                            point_order, scalar_mult_trace, secp256k1)
from minichain.nonces import ConstantNonce, random_nonce, rfc6979_nonce
from minichain.ntheory import modinv
from minichain.signatures import digest_to_int, generate_private_key

from .network import BadRequest, hx

N = secp256k1.n
MAX_TOY_P = 1000


def _is_prime(p: int) -> bool:
    if p < 2:
        return False
    i = 2
    while i * i <= p:
        if p % i == 0:
            return False
        i += 1
    return True


def toy_curve(p: int, a: int, b: int) -> Curve:
    if not 3 <= p <= MAX_TOY_P or not _is_prime(p):
        raise BadRequest(f"p debe ser un primo entre 3 y {MAX_TOY_P}")
    if (4 * a ** 3 + 27 * b ** 2) % p == 0:
        raise BadRequest("4a³ + 27b² ≡ 0 (mod p): la curva es singular")
    return Curve(f"toy{p}", p, a % p, b % p, gx=0, gy=0, n=0)


def _pt(curve: Curve, xy: list[int] | None) -> Point:
    if xy is None:
        return curve.infinity
    try:
        return Point(curve, xy[0], xy[1])
    except ValueError as exc:
        raise BadRequest(str(exc)) from None


def _xy(P: Point) -> list[int] | None:
    return None if P.is_infinity else [P.x, P.y]


def _hasse(p: int) -> list[int]:
    """Teorema de Hasse: |#E − (p + 1)| ≤ 2√p, con #E contando O."""
    from math import isqrt
    root4p = isqrt(4 * p)  # floor(2√p)
    return [p + 1 - root4p, p + 1 + root4p]


def curve_points(p: int, a: int, b: int) -> dict:
    curve = toy_curve(p, a, b)
    pts = enumerate_points(curve)
    return {"p": p, "a": curve.a, "b": curve.b, "order": len(pts),
            "points": [_xy(P) for P in pts[1:]],
            "hasse_bound": _hasse(p)}


def curve_add(p: int, a: int, b: int, P_xy, Q_xy) -> dict:
    curve = toy_curve(p, a, b)
    P, Q = _pt(curve, P_xy), _pt(curve, Q_xy)
    R = P + Q
    out = {"P": P_xy, "Q": Q_xy, "R": _xy(R), "lambda": None}
    if P.is_infinity or Q.is_infinity:
        out["case"] = "identity"
        out["explanation"] = "O es el neutro: P + O = P."
    elif P.x == Q.x and (P.y + Q.y) % p == 0:
        out["case"] = "inverse"
        out["explanation"] = "Q = −P: la recta es vertical y la suma es el punto en el infinito O."
    elif P == Q:
        num, den = (3 * P.x * P.x + curve.a) % p, (2 * P.y) % p
        lam = num * modinv(den, p) % p
        out.update(case="tangent", **{"lambda": lam},
                   explanation=f"Duplicación: λ = (3x² + a)/(2y) = {num}·{den}⁻¹ ≡ {lam} (mod {p}).")
    else:
        num, den = (Q.y - P.y) % p, (Q.x - P.x) % p
        lam = num * modinv(den, p) % p
        out.update(case="secant", **{"lambda": lam},
                   explanation=f"Secante: λ = (y₂ − y₁)/(x₂ − x₁) = {num}·{den}⁻¹ ≡ {lam} (mod {p}).")
    return out


def curve_mul(p: int, a: int, b: int, P_xy, k: int) -> dict:
    curve = toy_curve(p, a, b)
    P = _pt(curve, P_xy)
    if P.is_infinity:
        raise BadRequest("elige un punto distinto de O")
    if not 1 <= k <= 10 ** 6:
        raise BadRequest("k debe estar entre 1 y 1 000 000")
    steps = scalar_mult_trace(k, P)
    return {
        "k": k, "binary": bin(k)[2:], "P": P_xy, "order": point_order(P),
        "result": _xy(steps[-1]["point"]),
        "steps": [{"bit_index": s["bit_index"], "bit": s["bit"], "op": s["op"],
                   "point": _xy(s["point"])} for s in steps],
        "operations": len(steps),
    }


def secp256k1_info() -> dict:
    G = secp256k1.G
    return {"name": "secp256k1", "equation": "y² = x³ + 7", "p": hx(secp256k1.p),
            "n": hx(N), "gx": hx(G.x), "gy": hx(G.y), "h": secp256k1.h,
            "p_bits": secp256k1.p.bit_length(), "n_bits": N.bit_length()}


def _parse_hex(value: str, name: str) -> int:
    try:
        return int(value.strip().removeprefix("0x"), 16)
    except ValueError:
        raise BadRequest(f"{name} debe ser hexadecimal") from None


def ecdsa_sign(message: str, private_key: str | None, nonce: str, k: str | None) -> dict:
    d = generate_private_key() if not private_key else _parse_hex(private_key, "la clave privada")
    if not 1 <= d < N:
        raise BadRequest("la clave privada debe estar en [1, n−1]")
    msg = message.encode()
    digest = hashlib.sha256(msg).digest()
    z = digest_to_int(digest, N)
    if nonce == "rfc6979":
        kk = rfc6979_nonce(d, digest, secp256k1)
    elif nonce == "random":
        kk = random_nonce(d, digest, secp256k1)
    elif nonce == "fixed":
        if not k:
            raise BadRequest("indica el valor de k")
        kk = _parse_hex(k, "k")
        if not 1 <= kk < N:
            raise BadRequest("k debe estar en [1, n−1]")
        kk = ConstantNonce(kk - 1)(d, digest, secp256k1)  # = kk
    else:
        raise BadRequest(f"estrategia desconocida: {nonce}")
    Q = d * secp256k1.G
    R = kk * secp256k1.G
    r = R.x % N
    k_inv = modinv(kk, N)
    s = k_inv * (z + r * d) % N
    if r == 0 or s == 0:
        raise BadRequest("k degenerado: r o s es 0, prueba otro")
    return {
        "message": message,
        "d": hx(d),
        "Q": {"x": hx(Q.x), "y": hx(Q.y), "compressed": encode_point(Q).hex()},
        "hash": digest.hex(), "z": hx(z),
        "nonce": nonce, "k": hx(kk), "k_inv": hx(k_inv),
        "R": {"x": hx(R.x), "y": hx(R.y)},
        "r": hx(r), "s": hx(s),
        "verification": _verify_steps(Q, z, r, s),
    }


def _verify_steps(Q: Point, z: int, r: int, s: int) -> dict:
    if not (1 <= r < N and 1 <= s < N):
        return {"valid": False, "reason": "r o s fuera de [1, n−1]"}
    w = modinv(s, N)
    u1, u2 = z * w % N, r * w % N
    X = u1 * secp256k1.G + u2 * Q
    if X.is_infinity:
        return {"valid": False, "reason": "u1·G + u2·Q = O"}
    return {"w": hx(w), "u1": hx(u1), "u2": hx(u2),
            "X": {"x": hx(X.x), "y": hx(X.y)}, "x_mod_n": hx(X.x % N),
            "valid": X.x % N == r}


def ecdsa_verify(message: str, pubkey: str, r: str, s: str) -> dict:
    try:
        Q = decode_point(secp256k1, bytes.fromhex(pubkey.strip()))
    except ValueError as exc:
        raise BadRequest(f"clave pública inválida: {exc}") from None
    rr, ss = _parse_hex(r, "r"), _parse_hex(s, "s")
    z = digest_to_int(hashlib.sha256(message.encode()).digest(), N)
    steps = _verify_steps(Q, z, rr, ss)
    steps["z"] = hx(z)
    return steps


def ecdsa_recover(r: str, s1: str, z1: str, s2: str, z2: str, pubkey: str | None) -> dict:
    """Las fórmulas del ataque sobre dos firmas cualesquiera con el mismo r."""
    from minichain.attack import recover_from_pair

    Q = None
    if pubkey:
        try:
            Q = decode_point(secp256k1, bytes.fromhex(pubkey.strip()))
        except ValueError as exc:
            raise BadRequest(f"clave pública inválida: {exc}") from None
    vals = [_parse_hex(v, name) for v, name in ((r, "r"), (s1, "s1"), (z1, "z1"), (s2, "s2"), (z2, "z2"))]
    rr, ss1, zz1, ss2, zz2 = vals
    if zz1 == zz2:
        raise BadRequest("los dos mensajes son iguales (z1 = z2): no hay ecuación que resolver")
    result = recover_from_pair(rr, ss1, zz1, ss2, zz2, Q, secp256k1)
    if result is None:
        raise BadRequest("las firmas no comparten nonce (o no son de esta clave)")
    k, d = result
    return {"k": hx(k), "d": hx(d), "matches_pubkey": None if Q is None else d * secp256k1.G == Q}
