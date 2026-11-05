"""Compatibilidad entre la billetera del navegador y el servidor.

tests/fixtures/device_wallet.json lo genera frontend/tests/make-fixture.ts con
el mismo código que firma en el celular (@noble/secp256k1). Aquí se comprueba
con la implementación propia de minichain que:
  - la clave pública y la dirección se derivan igual,
  - el texto que se firma es idéntico byte a byte (incluidos acentos y emojis),
  - las firmas verifican.
frontend/tests/wallet.test.ts comprueba lo mismo del lado de JavaScript.
"""

import json
from pathlib import Path

from minichain.block import Transaction
from minichain.curve import secp256k1
from minichain.signatures import Signature, public_key, verify
from minichain.wallet import Wallet

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "device_wallet.json").read_text(encoding="utf-8"))


def test_keys_and_address_match():
    w = Wallet("dispositivo", int(FIXTURE["private_key"], 16))
    assert w.pubkey_hex == FIXTURE["pubkey"]
    assert w.address == FIXTURE["address"]


def test_payload_is_byte_identical_and_signatures_verify():
    Q = public_key(int(FIXTURE["private_key"], 16), secp256k1)
    for case in FIXTURE["cases"]:
        tx = Transaction.from_dict(case)
        assert tx.payload().decode() == case["payload"], case["memo"]
        assert verify(Q, tx.payload(), tx.signature), case["memo"]
        # Con la firma alterada, ya no verifica.
        bad = Signature(tx.signature.r, (tx.signature.s + 1) % secp256k1.n)
        assert not verify(Q, tx.payload(), bad)


def test_registration_signature_verifies():
    reg = FIXTURE["registration"]
    Q = public_key(int(FIXTURE["private_key"], 16), secp256k1)
    assert verify(Q, reg["message"].encode(), Signature.from_hex(reg["signature"]))
