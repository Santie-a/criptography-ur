"""Nodo: la cadena más una mempool de transacciones pendientes.

Es la pieza que usa el servidor: varios clientes envían transacciones a la
mempool, y cualquiera puede pedir minar un bloque con ellas. Todas las
operaciones toman un candado, así que el nodo es seguro entre hilos.
"""

from __future__ import annotations

import threading
import time

from .block import Block, Transaction
from .chain import Blockchain, InvalidBlock
from .validator import check_transaction

MAX_BLOCK_TXS = 50


class RejectedTransaction(Exception):
    def __init__(self, kind: str, detail: str):
        self.kind = kind
        self.detail = detail
        super().__init__(f"[{kind}] {detail}")


class Node:
    def __init__(self, chain: Blockchain):
        self.chain = chain
        self.mempool: list[Transaction] = []
        self.lock = threading.RLock()
        # Estado que resulta de aplicar la mempool sobre la cadena. Se
        # actualiza al encolar y se recalcula al minar.
        self.pending = chain.ledger.copy()

    def next_seq(self, address: str) -> int:
        """Siguiente seq contando también las transacciones pendientes."""
        with self.lock:
            return self.pending.next_seq(address)

    def available_balance(self, address: str) -> int:
        with self.lock:
            return self.pending.balance(address)

    def submit(self, tx: Transaction) -> str:
        """Valida la transacción contra el estado pendiente y la encola."""
        with self.lock:
            if tx.is_coinbase:
                raise RejectedTransaction("coinbase", "solo el minero crea transacciones sin firma")
            problem = check_transaction(tx, self.pending)  # si es válida, la aplica
            if problem is not None:
                raise RejectedTransaction(*problem)
            self.mempool.append(tx)
            return tx.txid()

    def mine(self, miner_address: str, difficulty: int | None = None,
             timestamp: int | None = None) -> tuple[Block, int]:
        """Mina un bloque con las transacciones pendientes (hasta MAX_BLOCK_TXS)."""
        with self.lock:
            batch = self.mempool[:MAX_BLOCK_TXS]
            if timestamp is None:
                timestamp = max(int(time.time()), self.chain.tip.timestamp + 1)
            if difficulty is not None and difficulty < self.chain.difficulty:
                raise ValueError(f"la dificultad mínima de la red es {self.chain.difficulty}")
            # Las firmas de la mempool ya se verificaron al entrar (submit) y los
            # objetos no cambian: no hace falta verificarlas otra vez al minar.
            block, attempts = self.chain.mine_block(batch, miner_address, timestamp, difficulty,
                                                    verify_signatures=False)
            self.mempool = self.mempool[len(batch):]
            self._prune()
            return block, attempts

    def _prune(self) -> None:
        """Descarta de la mempool lo que dejó de ser válido (seq o saldo)."""
        ledger = self.chain.ledger.copy()
        self.mempool = [tx for tx in self.mempool if check_transaction(tx, ledger, False) is None]
        self.pending = ledger

    def restore_mempool(self, transactions: list[Transaction]) -> None:
        """Vuelve a cargar una mempool guardada por el propio servidor."""
        with self.lock:
            self.mempool = list(transactions)
            self._prune()


__all__ = ["Node", "RejectedTransaction", "InvalidBlock", "MAX_BLOCK_TXS"]
