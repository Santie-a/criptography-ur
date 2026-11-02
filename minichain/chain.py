"""La cadena: génesis, minado de bloques nuevos y estado de cuentas."""

from __future__ import annotations

import json

from .block import BLOCK_REWARD, GENESIS_PREV_HASH, Block, Transaction, mine
from .validator import Issue, Ledger, validate_block, validate_chain, ValidationReport


class InvalidBlock(Exception):
    def __init__(self, issues: list[Issue]):
        self.issues = issues
        super().__init__("; ".join(str(i) for i in issues))


class Blockchain:
    def __init__(self, difficulty: int):
        self.difficulty = difficulty
        self.blocks: list[Block] = []
        self.ledger = Ledger()
        self.genesis_attempts = 0

    @classmethod
    def create(cls, allocations: dict[str, int], difficulty: int,
               timestamp: int = 0) -> "Blockchain":
        chain = cls(difficulty)
        genesis = Block(0, GENESIS_PREV_HASH, timestamp, difficulty,
                        [Transaction.coinbase(addr, amount, "asignación inicial")
                         for addr, amount in allocations.items()])
        chain.genesis_attempts = mine(genesis)
        chain.add_block(genesis)
        return chain

    @property
    def tip(self) -> Block:
        return self.blocks[-1]

    def balance(self, address: str) -> int:
        return self.ledger.balance(address)

    def next_seq(self, address: str) -> int:
        return self.ledger.next_seq(address)

    def add_block(self, block: Block) -> None:
        """Valida el bloque contra el estado actual y, si es válido, lo agrega."""
        prev = self.blocks[-1] if self.blocks else None
        trial = self.ledger.copy()
        issues, _ = validate_block(block, prev, trial, self.difficulty)
        if issues:
            raise InvalidBlock(issues)
        self.blocks.append(block)
        self.ledger = trial

    def mine_block(self, transactions: list[Transaction], miner_address: str,
                   timestamp: int) -> tuple[Block, int]:
        """Arma un bloque con la recompensa del minero, lo mina y lo agrega."""
        txs = [Transaction.coinbase(miner_address, BLOCK_REWARD, f"recompensa bloque {len(self.blocks)}")]
        txs.extend(transactions)
        block = Block(len(self.blocks), self.tip.hash(), timestamp, self.difficulty, txs)
        attempts = mine(block)
        self.add_block(block)
        return block, attempts

    def validate(self) -> ValidationReport:
        return validate_chain(self.blocks, self.difficulty)

    def to_json(self) -> str:
        return json.dumps({"difficulty": self.difficulty,
                           "blocks": [b.to_dict() for b in self.blocks]}, indent=2)
