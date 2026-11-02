"""Transacciones, bloques y prueba de trabajo."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from .curve import Point, decode_point, secp256k1
from .merkle import merkle_root
from .signatures import Signature
from .wallet import Wallet, address_from_pubkey

BLOCK_REWARD = 50
GENESIS_PREV_HASH = "00" * 32


def _canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()


@dataclass
class Transaction:
    """Transferencia en un modelo de cuentas.

    sender:  clave pública comprimida del emisor (hex), o None para una
             transacción sin firma (asignación del génesis o recompensa).
    seq:     contador de transacciones del emisor. Impide reenviar una
             transacción vieja (replay) y hace que cada mensaje firmado sea
             distinto. No confundir con el nonce k de ECDSA ni con el de la
             prueba de trabajo.
    """

    sender: str | None
    recipient: str
    amount: int
    seq: int
    memo: str = ""
    signature: Signature | None = None

    @property
    def is_coinbase(self) -> bool:
        return self.sender is None

    @property
    def sender_address(self) -> str | None:
        return None if self.sender is None else address_from_pubkey(bytes.fromhex(self.sender))

    def sender_point(self) -> Point:
        return decode_point(secp256k1, bytes.fromhex(self.sender))

    def payload(self) -> bytes:
        """Los bytes que se firman: todos los campos menos la firma."""
        return _canonical({
            "sender": self.sender,
            "recipient": self.recipient,
            "amount": self.amount,
            "seq": self.seq,
            "memo": self.memo,
        })

    def to_dict(self) -> dict:
        return {
            "sender": self.sender,
            "recipient": self.recipient,
            "amount": self.amount,
            "seq": self.seq,
            "memo": self.memo,
            "signature": None if self.signature is None else self.signature.to_hex(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Transaction":
        sig = data.get("signature")
        return cls(
            sender=data["sender"],
            recipient=data["recipient"],
            amount=data["amount"],
            seq=data["seq"],
            memo=data.get("memo", ""),
            signature=None if sig is None else Signature.from_hex(sig),
        )

    def txid(self) -> str:
        return hashlib.sha256(_canonical(self.to_dict())).hexdigest()

    @classmethod
    def create(cls, wallet: Wallet, recipient: str, amount: int, seq: int,
               memo: str = "") -> "Transaction":
        tx = cls(wallet.pubkey_hex, recipient, amount, seq, memo)
        tx.signature = wallet.sign(tx.payload())
        return tx

    @classmethod
    def coinbase(cls, recipient: str, amount: int, memo: str = "") -> "Transaction":
        return cls(None, recipient, amount, 0, memo)


@dataclass
class Block:
    index: int
    prev_hash: str
    timestamp: int
    difficulty: int  # bits en cero exigidos al inicio del hash
    transactions: list[Transaction] = field(default_factory=list)
    merkle_root: str = ""
    nonce: int = 0

    def compute_merkle_root(self) -> str:
        return merkle_root([tx.txid() for tx in self.transactions])

    def header_prefix(self) -> bytes:
        return (f"{self.index}|{self.prev_hash}|{self.merkle_root}|"
                f"{self.timestamp}|{self.difficulty}|").encode()

    def hash(self) -> str:
        return hashlib.sha256(self.header_prefix() + str(self.nonce).encode()).hexdigest()

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "hash": self.hash(),
            "prev_hash": self.prev_hash,
            "timestamp": self.timestamp,
            "difficulty": self.difficulty,
            "merkle_root": self.merkle_root,
            "nonce": self.nonce,
            "transactions": [tx.to_dict() for tx in self.transactions],
        }


def meets_difficulty(block_hash: str, difficulty: int) -> bool:
    """El hash, leído como entero de 256 bits, debe ser < 2^(256 - difficulty)."""
    return int(block_hash, 16) < (1 << (256 - difficulty))


def mine(block: Block, start_nonce: int = 0) -> int:
    """Busca un nonce que cumpla la dificultad. Devuelve el número de intentos.

    En promedio hacen falta 2^difficulty intentos: cada bit extra duplica el
    trabajo.
    """
    block.merkle_root = block.compute_merkle_root()
    prefix = block.header_prefix()
    target = 1 << (256 - block.difficulty)
    nonce = start_nonce
    while True:
        digest = hashlib.sha256(prefix + str(nonce).encode()).digest()
        if int.from_bytes(digest, "big") < target:
            block.nonce = nonce
            return nonce - start_nonce + 1
        nonce += 1
