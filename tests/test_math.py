"""Teoría de números y aritmética de la curva."""

import itertools
import random

import ecdsa
import pytest

from minichain.curve import Curve, Point, decode_point, encode_point, secp256k1
from minichain.ntheory import egcd, modinv

# Curva de juguete y^2 = x^3 + 2x + 3 sobre F_97: pequeña para enumerar el grupo entero.
TOY = Curve("toy97", p=97, a=2, b=3, gx=3, gy=6, n=5, h=20)


def all_points(curve):
    pts = [curve.infinity]
    for x in range(curve.p):
        for y in range(curve.p):
            if curve.contains(x, y):
                pts.append(Point(curve, x, y))
    return pts


def test_egcd_bezout():
    rng = random.Random(1)
    for _ in range(200):
        a, b = rng.randrange(1, 10**30), rng.randrange(1, 10**30)
        g, x, y = egcd(a, b)
        assert a * x + b * y == g
        assert a % g == 0 and b % g == 0


def test_modinv_matches_builtin():
    rng = random.Random(2)
    n = secp256k1.n
    for _ in range(200):
        a = rng.randrange(1, n)
        assert modinv(a, n) == pow(a, -1, n)
        assert a * modinv(a, n) % n == 1


def test_modinv_errors():
    with pytest.raises(ZeroDivisionError):
        modinv(0, 7)
    with pytest.raises(ValueError):
        modinv(6, 9)


def test_toy_curve_is_a_group():
    pts = all_points(TOY)
    O = TOY.infinity
    assert len(pts) == 100  # #E(F_97) = 100 = 5 * 20
    for P in pts:
        assert P + O == P and O + P == P          # neutro
        assert (P + (-P)).is_infinity             # inverso
    for P, Q in itertools.product(pts, repeat=2):
        assert P + Q == Q + P                     # conmutatividad (y cerradura: Point valida)
    rng = random.Random(3)
    for _ in range(2000):
        P, Q, R = rng.choice(pts), rng.choice(pts), rng.choice(pts)
        assert (P + Q) + R == P + (Q + R)         # asociatividad
    assert (TOY.n * TOY.G).is_infinity


def test_scalar_mult_matches_repeated_addition():
    for P in all_points(TOY)[1:20]:
        acc = TOY.infinity
        for k in range(30):
            assert k * P == acc
            acc = acc + P


def test_secp256k1_parameters_match_library():
    lib = ecdsa.SECP256k1
    assert secp256k1.p == lib.curve.p()
    assert secp256k1.a == lib.curve.a() and secp256k1.b == lib.curve.b()
    assert secp256k1.n == lib.order
    assert (secp256k1.gx, secp256k1.gy) == (lib.generator.x(), lib.generator.y())


def test_secp256k1_group_facts():
    G = secp256k1.G
    assert secp256k1.contains(G.x, G.y)
    assert (secp256k1.n * G).is_infinity
    assert (secp256k1.n - 1) * G == -G
    a, b = 0xDEADBEEF, 0xC0FFEE
    assert (a + b) * G == a * G + b * G
    assert (a * b) * G == a * (b * G)


def test_scalar_mult_matches_library():
    rng = random.Random(4)
    gen = ecdsa.SECP256k1.generator
    for _ in range(10):
        k = rng.randrange(1, secp256k1.n)
        P, L = k * secp256k1.G, k * gen
        assert (P.x, P.y) == (L.x(), L.y())


def test_point_encoding_roundtrip_and_library():
    rng = random.Random(5)
    for _ in range(10):
        d = rng.randrange(1, secp256k1.n)
        P = d * secp256k1.G
        vk = ecdsa.SigningKey.from_secret_exponent(d, curve=ecdsa.SECP256k1).get_verifying_key()
        assert encode_point(P, compressed=True) == vk.to_string("compressed")
        assert encode_point(P, compressed=False) == vk.to_string("uncompressed")
        assert decode_point(secp256k1, encode_point(P)) == P
        assert decode_point(secp256k1, encode_point(P, compressed=False)) == P


def test_rejects_points_off_curve():
    with pytest.raises(ValueError):
        Point(secp256k1, 1, 1)
    with pytest.raises(ValueError):
        decode_point(secp256k1, b"\x02" + (5).to_bytes(32, "big"))  # x=5: x^3+7 no es cuadrado
