"""Validador: recorre la cadena y reporta cualquier manipulación.

Comprueba, bloque por bloque:
  - índice consecutivo y marca de tiempo no decreciente
  - enlace: prev_hash == hash del bloque anterior
  - prueba de trabajo con la dificultad exigida por la red
  - raíz de Merkle recalculada a partir de las transacciones
  - reglas de las transacciones: firma ECDSA válida, contador (seq) correcto,
    saldo suficiente, montos positivos y recompensa del minero correcta.

No se detiene en el primer error: sigue y reporta todos los problemas.
"""

from __future__ import annotations

import copy
from collections import defaultdict
from dataclasses import dataclass, field

from .block import BLOCK_REWARD, GENESIS_PREV_HASH, Block, Transaction, meets_difficulty
from .signatures import verify


@dataclass
class Issue:
    block: int
    tx: int | None
    kind: str
    detail: str

    def __str__(self) -> str:
        where = f"bloque {self.block}" + ("" if self.tx is None else f", tx {self.tx}")
        return f"[{self.kind}] {where}: {self.detail}"


@dataclass
class Ledger:
    """Estado de cuentas que resulta de aplicar las transacciones en orden."""

    balances: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    seqs: dict[str, int] = field(default_factory=lambda: defaultdict(int))

    def copy(self) -> "Ledger":
        return copy.deepcopy(self)

    def balance(self, address: str) -> int:
        return self.balances.get(address, 0)

    def next_seq(self, address: str) -> int:
        return self.seqs.get(address, 0)


@dataclass
class ValidationReport:
    issues: list[Issue]
    ledger: Ledger
    blocks_checked: int
    signatures_checked: int

    @property
    def ok(self) -> bool:
        return not self.issues


def check_transaction(tx: Transaction, ledger: Ledger,
                      verify_signature: bool = True) -> tuple[str, str] | None:
    """Valida una transacción firmada contra el estado actual.

    Devuelve (tipo, detalle) del problema, o None si es válida (y la aplica).

    `verify_signature=False` omite solo la verificación ECDSA (la parte cara).
    Se usa con datos que ya se verificaron antes y no pudieron cambiar: la
    mempool del propio nodo al minar, o la cadena guardada por el propio
    servidor al restaurarla. Nunca con datos que llegan de afuera.
    """
    if tx.is_coinbase:
        return ("coinbase", "transacción sin firma fuera de su lugar")
    if not isinstance(tx.amount, int) or tx.amount <= 0:
        return ("monto", f"monto inválido: {tx.amount!r}")
    if tx.signature is None:
        return ("firma", "transacción sin firma")
    try:
        Q = tx.sender_point()
    except ValueError as exc:
        return ("firma", f"clave pública inválida: {exc}")
    if verify_signature and not verify(Q, tx.payload(), tx.signature):
        return ("firma", "la firma ECDSA no verifica")
    sender = tx.sender_address
    if tx.seq != ledger.next_seq(sender):
        return ("secuencia", f"seq={tx.seq}, se esperaba {ledger.next_seq(sender)}")
    if ledger.balance(sender) < tx.amount:
        return ("saldo", f"saldo {ledger.balance(sender)} < monto {tx.amount}")
    ledger.balances[sender] -= tx.amount
    ledger.balances[tx.recipient] += tx.amount
    ledger.seqs[sender] += 1
    return None


def validate_block(block: Block, prev: Block | None, ledger: Ledger,
                   required_difficulty: int,
                   verify_signatures: bool = True) -> tuple[list[Issue], int]:
    """Valida un bloque y aplica sus transacciones válidas a `ledger`.

    Devuelve (problemas, firmas verificadas). Ver `check_transaction` sobre
    `verify_signatures`.
    """
    issues: list[Issue] = []
    i = block.index
    expected_index = 0 if prev is None else prev.index + 1

    if block.index != expected_index:
        issues.append(Issue(i, None, "índice", f"índice {block.index}, se esperaba {expected_index}"))

    expected_prev = GENESIS_PREV_HASH if prev is None else prev.hash()
    if block.prev_hash != expected_prev:
        issues.append(Issue(i, None, "enlace",
                            f"prev_hash {block.prev_hash[:16]}… no coincide con el hash "
                            f"del bloque anterior {expected_prev[:16]}…"))

    if prev is not None and block.timestamp < prev.timestamp:
        issues.append(Issue(i, None, "tiempo", "marca de tiempo anterior a la del bloque previo"))

    if block.difficulty < required_difficulty:
        issues.append(Issue(i, None, "pow",
                            f"dificultad {block.difficulty} menor que la exigida ({required_difficulty})"))
    if not meets_difficulty(block.hash(), block.difficulty):
        issues.append(Issue(i, None, "pow",
                            f"el hash {block.hash()[:16]}… no cumple {block.difficulty} bits en cero"))

    recomputed = block.compute_merkle_root()
    if block.merkle_root != recomputed:
        issues.append(Issue(i, None, "merkle",
                            f"raíz guardada {block.merkle_root[:16]}… ≠ recalculada {recomputed[:16]}…"))

    signatures = 0
    for j, tx in enumerate(block.transactions):
        if prev is None:  # génesis: solo asignaciones iniciales sin firma
            if not tx.is_coinbase or tx.amount <= 0:
                issues.append(Issue(i, j, "génesis", "el génesis solo admite asignaciones"))
                continue
            ledger.balances[tx.recipient] += tx.amount
            continue
        if tx.is_coinbase:
            if j != 0:
                issues.append(Issue(i, j, "coinbase", "la recompensa debe ser la primera transacción"))
            elif tx.amount != BLOCK_REWARD:
                issues.append(Issue(i, j, "coinbase",
                                    f"recompensa {tx.amount}, se esperaba {BLOCK_REWARD}"))
            else:
                ledger.balances[tx.recipient] += tx.amount
            continue
        signatures += 1 if verify_signatures else 0
        problem = check_transaction(tx, ledger, verify_signatures)
        if problem is not None:
            issues.append(Issue(i, j, *problem))

    return issues, signatures


def validate_chain(blocks: list[Block], required_difficulty: int) -> ValidationReport:
    ledger = Ledger()
    issues: list[Issue] = []
    signatures = 0
    if not blocks:
        issues.append(Issue(0, None, "génesis", "la cadena está vacía"))
    prev = None
    for block in blocks:
        block_issues, sigs = validate_block(block, prev, ledger, required_difficulty)
        issues.extend(block_issues)
        signatures += sigs
        prev = block
    return ValidationReport(issues, ledger, len(blocks), signatures)
