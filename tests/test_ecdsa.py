"""ECDSA propio comparado contra la librería `ecdsa`."""

import hashlib
import random

import ecdsa
import pytest
from ecdsa.rfc6979 import generate_k

from minichain.curve import secp256k1
from minichain.nonces import rfc6979_nonce
from minichain.signatures import Signature, public_key, sign, verify

N = secp256k1.n


def raw(r, s, order):
    return (r, s)


def unraw(sig, order):
    return sig


def lib_keys(d):
    sk = ecdsa.SigningKey.from_secret_exponent(d, curve=ecdsa.SECP256k1, hashfunc=hashlib.sha256)
    return sk, sk.get_verifying_key()


@pytest.fixture
def keys():
    rng = random.Random(10)
    return [rng.randrange(1, N) for _ in range(5)]


def test_public_key_matches_library(keys):
    for d in keys:
        Q = public_key(d)
        _, vk = lib_keys(d)
        assert (Q.x, Q.y) == (vk.pubkey.point.x(), vk.pubkey.point.y())


def test_our_signatures_verify_in_library(keys):
    for i, d in enumerate(keys):
        msg = f"mensaje {i}".encode()
        sig = sign(d, msg)
        _, vk = lib_keys(d)
        assert vk.verify((sig.r, sig.s), msg, hashfunc=hashlib.sha256, sigdecode=unraw)


def test_library_signatures_verify_in_ours(keys):
    for i, d in enumerate(keys):
        msg = f"otro mensaje {i}".encode()
        sk, _ = lib_keys(d)
        r, s = sk.sign(msg, hashfunc=hashlib.sha256, sigencode=raw)
        assert verify(public_key(d), msg, Signature(r, s))


def test_rfc6979_nonce_matches_library(keys):
    for i, d in enumerate(keys):
        digest = hashlib.sha256(f"m{i}".encode()).digest()
        assert rfc6979_nonce(d, digest, secp256k1) == generate_k(N, d, hashlib.sha256, digest)


def test_deterministic_signature_matches_library(keys):
    for i, d in enumerate(keys):
        msg = f"determinista {i}".encode()
        ours = sign(d, msg, rfc6979_nonce)
        sk, _ = lib_keys(d)
        r, s = sk.sign_deterministic(msg, hashfunc=hashlib.sha256, sigencode=raw)
        assert (ours.r, ours.s) == (r, s)


def test_rejects_bad_signatures(keys):
    d, other = keys[0], keys[1]
    Q = public_key(d)
    msg = b"pago de 10 monedas"
    sig = sign(d, msg)
    assert verify(Q, msg, sig)
    assert not verify(Q, b"pago de 99 monedas", sig)          # mensaje alterado
    assert not verify(public_key(other), msg, sig)            # otra clave
    assert not verify(Q, msg, Signature(sig.r, (sig.s + 1) % N))
    assert not verify(Q, msg, Signature(0, sig.s))            # r fuera de rango
    assert not verify(Q, msg, Signature(sig.r, N))            # s fuera de rango


def test_signature_hex_roundtrip(keys):
    sig = sign(keys[0], b"x")
    assert Signature.from_hex(sig.to_hex()) == sig
