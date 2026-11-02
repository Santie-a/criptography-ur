"""Ataque por nonce repetido y defensa con RFC 6979."""

import random

import pytest

from minichain.attack import find_nonce_reuse, harvest_signatures, recover_from_pair, recover_private_keys
from minichain.block import Transaction
from minichain.curve import secp256k1
from minichain.nonces import ConstantNonce, WeakRNGNonce, rfc6979_nonce
from minichain.signatures import digest_to_int, hash_message, sign
from minichain.simulation import build_scenario, next_timestamp
from minichain.wallet import Wallet

N = secp256k1.n


def test_formulas_recover_k_and_d():
    rng = random.Random(7)
    d, k = rng.randrange(1, N), rng.randrange(1, N)
    m1, m2 = b"tx 1", b"tx 2"
    s1 = sign(d, m1, ConstantNonce(k - 1))  # ConstantNonce devuelve (k-1) % (n-1) + 1 = k
    s2 = sign(d, m2, ConstantNonce(k - 1))
    assert s1.r == s2.r
    z1, z2 = (digest_to_int(hash_message(m), N) for m in (m1, m2))
    rec_k, rec_d = recover_from_pair(s1.r, s1.s, z1, s2.s, z2, d * secp256k1.G)
    assert (rec_k, rec_d) == (k, d)


def test_recovery_survives_low_s_normalization():
    rng = random.Random(8)
    d = rng.randrange(1, N)
    nonce = ConstantNonce(rng.getrandbits(256))
    s1, s2 = sign(d, b"a", nonce), sign(d, b"b", nonce)
    z1, z2 = (digest_to_int(hash_message(m), N) for m in (b"a", b"b"))
    # Una de las firmas publicada con s -> n - s (sigue siendo válida).
    result = recover_from_pair(s1.r, s1.s, z1, N - s2.s, z2, d * secp256k1.G)
    assert result is not None and result[1] == d


@pytest.mark.parametrize("victim_nonce", ["weak", "constant"])
def test_attack_on_simulated_chain(victim_nonce):
    sc = build_scenario(seed=11, difficulty=4, victim_nonce=victim_nonce, entropy_bits=3)
    bob, mallory = sc.wallets["Bob"], sc.wallets["Mallory"]
    found = recover_private_keys(sc.chain.blocks)
    assert set(found) == {bob.address}  # solo Bob cae; Alice y Carol están a salvo
    d = found[bob.address].d
    assert d == bob.private_key

    loot = sc.chain.balance(bob.address)
    forged = Transaction.create(Wallet("x", d), mallory.address, loot,
                                sc.chain.next_seq(bob.address))
    sc.chain.mine_block([forged], sc.wallets["Minera"].address, next_timestamp(sc.chain))
    assert sc.chain.validate().ok
    assert sc.chain.balance(bob.address) == 0
    assert sc.chain.balance(mallory.address) == loot


def test_weak_rng_repeats_by_pigeonhole():
    nonce = WeakRNGNonce(entropy_bits=2, seed=0)
    ks = [nonce(1, b"", secp256k1) for _ in range(5)]
    assert len(set(ks)) <= 4


def test_rfc6979_defeats_the_attack():
    sc = build_scenario(seed=11, difficulty=4, victim_nonce="rfc6979")
    observed = harvest_signatures(sc.chain.blocks)
    assert len({o.r for o in observed}) == len(observed)
    assert find_nonce_reuse(observed) == []
    assert recover_private_keys(sc.chain.blocks) == {}


def test_rfc6979_same_message_gives_no_usable_pair():
    d = random.Random(9).randrange(1, N)
    a, b = sign(d, b"igual", rfc6979_nonce), sign(d, b"igual", rfc6979_nonce)
    assert a == b  # mismo r, pero también mismo z y mismo s: no hay ecuación que resolver
