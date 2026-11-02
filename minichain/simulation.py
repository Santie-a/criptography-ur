"""Escenario simulado: billeteras ficticias, tráfico aleatorio y una cadena minada.

Personajes:
  Alice    firma con RFC 6979 (correcto)
  Bob      la víctima: su billetera usa la estrategia de nonce configurable
           (por defecto un RNG con poca entropía, como Android en 2013)
  Carol    firma con nonces aleatorios del sistema operativo (correcto)
  Minera   recibe la recompensa de cada bloque; nunca firma
  Mallory  la atacante: no tiene fondos y solo lee la cadena pública
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .block import Transaction
from .chain import Blockchain
from .nonces import ConstantNonce, NonceFn, WeakRNGNonce, random_nonce, rfc6979_nonce
from .wallet import Wallet

BASE_TIMESTAMP = 1_767_225_600  # 2026-01-01 00:00:00 UTC
BLOCK_INTERVAL = 600  # 10 minutos simulados entre bloques
INITIAL_BALANCE = 1000


def make_nonce_fn(kind: str, seed: int, entropy_bits: int) -> NonceFn:
    if kind == "weak":
        return WeakRNGNonce(entropy_bits, seed)
    if kind == "constant":
        return ConstantNonce(random.Random(seed).getrandbits(256))
    if kind == "rfc6979":
        return rfc6979_nonce
    if kind == "random":
        return random_nonce
    raise ValueError(f"estrategia de nonce desconocida: {kind}")


@dataclass
class Scenario:
    chain: Blockchain
    wallets: dict[str, Wallet]
    mining_attempts: list[int] = field(default_factory=list)

    def names_by_address(self) -> dict[str, str]:
        return {w.address: name for name, w in self.wallets.items()}


def build_scenario(seed: int = 2026, difficulty: int = 14, victim_nonce: str = "weak",
                   entropy_bits: int = 3, n_blocks: int = 5, tx_per_block: int = 4,
                   on_block=None) -> Scenario:
    """Construye la cadena simulada. Todo sale de `seed` salvo los nonces
    aleatorios de Carol, que vienen del sistema operativo como debe ser.

    Bob envía la mitad de las transacciones, así que con n_blocks=5 y
    tx_per_block=4 firma 10 veces. Con entropy_bits=3 solo hay 8 nonces
    posibles: por el principio del palomar, alguno se repite.
    """
    rng = random.Random(seed)
    wallets = {
        "Alice": Wallet.generate("Alice", rng, rfc6979_nonce),
        "Bob": Wallet.generate("Bob", rng, make_nonce_fn(victim_nonce, seed, entropy_bits)),
        "Carol": Wallet.generate("Carol", rng, random_nonce),
        "Minera": Wallet.generate("Minera", rng),
        "Mallory": Wallet.generate("Mallory", rng),
    }
    users = ["Alice", "Bob", "Carol"]
    chain = Blockchain.create({wallets[u].address: INITIAL_BALANCE for u in users},
                              difficulty, BASE_TIMESTAMP)
    scenario = Scenario(chain, wallets, [chain.genesis_attempts])
    if on_block:
        on_block(chain.tip, chain.genesis_attempts)

    senders_cycle = ["Alice", "Bob", "Carol", "Bob"]
    memos = ["café", "arriendo", "libros", "almuerzo", "regalo", "factura", "préstamo", "boletas"]
    for b in range(1, n_blocks + 1):
        pending: list[Transaction] = []
        seqs: dict[str, int] = {}
        for t in range(tx_per_block):
            sender = senders_cycle[t % len(senders_cycle)]
            recipient = rng.choice([u for u in users if u != sender])
            wallet = wallets[sender]
            seq = seqs.get(sender, chain.next_seq(wallet.address))
            seqs[sender] = seq + 1
            amount = rng.randint(1, 40)
            pending.append(Transaction.create(wallet, wallets[recipient].address, amount, seq,
                                              rng.choice(memos)))
        block, attempts = chain.mine_block(pending, wallets["Minera"].address,
                                           BASE_TIMESTAMP + b * BLOCK_INTERVAL)
        scenario.mining_attempts.append(attempts)
        if on_block:
            on_block(block, attempts)
    return scenario


def next_timestamp(chain: Blockchain) -> int:
    return chain.tip.timestamp + BLOCK_INTERVAL

