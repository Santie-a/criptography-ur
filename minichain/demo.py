"""Demostración narrada de punta a punta.

    python -m minichain                 # demo completa
    python -m minichain --pausa         # se detiene entre pasos (para presentar en vivo)
    python -m minichain --dificultad 18 --bits-entropia 2 --semilla 7
"""

from __future__ import annotations

import argparse
import copy
import time

from .attack import find_nonce_reuse, harvest_signatures, recover_private_keys
from .block import Block, Transaction, mine
from .chain import Blockchain, InvalidBlock
from .curve import secp256k1
from .nonces import rfc6979_nonce
from .ntheory import modinv
from .signatures import sign, verify
from .simulation import build_scenario, next_timestamp
from .validator import validate_chain
from .wallet import Wallet

N = secp256k1.n


def short(value, width: int = 10) -> str:
    text = f"{value:064x}" if isinstance(value, int) else str(value)
    return text if len(text) <= 2 * width + 1 else f"{text[:width]}…{text[-width:]}"


class Narrator:
    def __init__(self, pause: bool):
        self.pause = pause
        self.step = 0

    def section(self, title: str) -> None:
        if self.pause and self.step > 0:
            input("\n   [Enter para continuar] ")
        self.step += 1
        print(f"\n{'=' * 78}\n {self.step}. {title}\n{'=' * 78}")


def show_balances(chain: Blockchain, wallets: dict[str, Wallet]) -> None:
    for name, w in wallets.items():
        print(f"   {name:<8} {chain.balance(w.address):>6}   {w.address}")


def show_report(blocks: list[Block], difficulty: int) -> bool:
    report = validate_chain(blocks, difficulty)
    if report.ok:
        print(f"   VÁLIDA: {report.blocks_checked} bloques, "
              f"{report.signatures_checked} firmas ECDSA verificadas.")
    else:
        # Se detallan los problemas del primer bloque afectado y del enlace
        # siguiente; lo demás son consecuencias (seq y saldos que ya no cuadran).
        first = report.issues[0].block
        shown = [i for i in report.issues if i.block == first
                 or (i.block == first + 1 and i.kind == "enlace")]
        print(f"   RECHAZADA: {len(report.issues)} problema(s)")
        for issue in shown:
            print(f"     - {issue}")
        rest = len(report.issues) - len(shown)
        if rest:
            print(f"     - … y {rest} más en bloques posteriores (seq y saldos que dejan de "
                  "cuadrar al invalidar esa tx)")
    return report.ok


def run(seed: int, difficulty: int, entropy_bits: int, pause: bool) -> None:
    say = Narrator(pause)

    # ------------------------------------------------------------------ 1
    say.section("La curva secp256k1:  y² = x³ + 7 sobre F_p")
    G = secp256k1.G
    print(f"   p = {short(secp256k1.p, 16)}")
    print(f"   n = {short(N, 16)}  (orden de G, primo)")
    print(f"   G en la curva:            {secp256k1.contains(G.x, G.y)}")
    print(f"   n·G = O (punto infinito): {(N * G).is_infinity}")
    a, b = 123456789, 987654321
    print(f"   (a+b)·G == a·G + b·G:     {(a + b) * G == a * G + b * G}")
    print(f"   G + (-G) = O:             {(G + (-G)).is_infinity}")
    print(f"   inverso de 3 mod n por Euclides extendido: 3·{short(modinv(3, N), 6)} ≡ "
          f"{3 * modinv(3, N) % N} (mod n)")

    # ------------------------------------------------------------------ 2
    say.section(f"Cadena simulada (semilla {seed}, dificultad {difficulty} bits)")
    print("   Alice firma con RFC 6979, Carol con nonces aleatorios del SO.")
    print(f"   Bob usa una billetera con un RNG defectuoso: solo 2^{entropy_bits} "
          f"= {2 ** entropy_bits} nonces posibles.\n")

    def on_block(block: Block, attempts: int) -> None:
        print(f"   bloque {block.index}  hash {short(block.hash(), 8)}  "
              f"merkle {short(block.merkle_root, 6)}  txs {len(block.transactions):>2}  "
              f"intentos PoW {attempts:>7}")

    t0 = time.perf_counter()
    sc = build_scenario(seed=seed, difficulty=difficulty, victim_nonce="weak",
                        entropy_bits=entropy_bits, on_block=on_block)
    chain, wallets = sc.chain, sc.wallets
    print(f"\n   Minado en {time.perf_counter() - t0:.2f} s "
          f"(en promedio 2^{difficulty} = {2 ** difficulty} intentos por bloque).")
    print("\n   Saldos:")
    show_balances(chain, wallets)

    # ------------------------------------------------------------------ 3
    say.section("Validador: la cadena honesta")
    show_report(chain.blocks, chain.difficulty)

    # ------------------------------------------------------------------ 4
    say.section("Ataque: Mallory lee la cadena pública buscando r repetidos")
    names = sc.names_by_address()
    observed = harvest_signatures(chain.blocks)
    print(f"   Firmas recolectadas: {len(observed)} (de cada una: Q, r, s y z = SHA-256(tx))")
    pairs = find_nonce_reuse(observed)
    print(f"   Pares con la misma clave y el mismo r: {len(pairs)}")
    recoveries = recover_private_keys(chain.blocks)
    if not recoveries:
        print("   No hubo reutilización de nonce con estos parámetros; prueba otra semilla "
              "o menos bits de entropía.")
        return
    bob = wallets["Bob"]
    rec = recoveries.get(bob.address) or next(iter(recoveries.values()))
    s1, s2 = rec.first, rec.second
    print(f"\n   Víctima: {names[s1.address]}")
    print(f"   tx A (bloque {s1.block}, tx {s1.tx}):  r = {short(s1.r)}")
    print(f"                             s1 = {short(s1.s)}   z1 = {short(s1.z)}")
    print(f"   tx B (bloque {s2.block}, tx {s2.tx}):  r = {short(s2.r)}")
    print(f"                             s2 = {short(s2.s)}   z2 = {short(s2.z)}")
    print("\n   k = (z1 - z2)(s1 - s2)⁻¹ mod n")
    print(f"     = {short(rec.k)}")
    print("   d = (s1·k - z1) r⁻¹ mod n")
    print(f"     = {short(rec.d)}")
    print(f"\n   ¿d·G == clave pública de la víctima? {rec.d * G == bob.public_key}")
    print(f"   ¿d == clave privada real de Bob?     {rec.d == bob.private_key}  "
          "(esto solo lo podemos comprobar nosotros)")

    # ------------------------------------------------------------------ 5
    say.section("Robo: Mallory firma a nombre de Bob con la clave recuperada")
    stolen = Wallet("Bob (falsificado)", rec.d, rfc6979_nonce)
    amount = chain.balance(bob.address)
    forged = Transaction.create(stolen, wallets["Mallory"].address, amount,
                                chain.next_seq(bob.address), "gracias, Bob")
    print(f"   tx falsificada: Bob → Mallory, {amount} monedas, seq {forged.seq}")
    print(f"   firma (r, s) = ({short(forged.signature.r, 6)}, {short(forged.signature.s, 6)})")
    block, attempts = chain.mine_block([forged], wallets["Minera"].address, next_timestamp(chain))
    print(f"   La red aceptó el bloque {block.index} ({attempts} intentos de PoW).\n")
    print("   El validador revisa toda la cadena de nuevo:")
    show_report(chain.blocks, chain.difficulty)
    print("\n   Saldos:")
    show_balances(chain, wallets)
    print("\n   El validador no puede distinguir esta transacción de una legítima:")
    print("   la firma es matemáticamente correcta porque se hizo con la clave real.")

    # ------------------------------------------------------------------ 6
    say.section("Manipulación de la cadena: el validador la detecta")
    honest = chain.blocks
    target = 2

    print(f"   a) Cambiar el monto de una transacción del bloque {target}:")
    tampered = copy.deepcopy(honest)
    tampered[target].transactions[1].amount += 500
    show_report(tampered, chain.difficulty)

    print(f"\n   b) Lo mismo, pero recalculando la raíz de Merkle y re-minando el bloque {target}:")
    tampered = copy.deepcopy(honest)
    tampered[target].transactions[1].amount += 500
    mine(tampered[target])
    show_report(tampered, chain.difficulty)
    print("      (la firma sigue rota y además se rompe el enlace con el bloque siguiente)")

    print("\n   c) Reemplazar una firma por otra válida de otro mensaje:")
    tampered = copy.deepcopy(honest)
    tampered[target].transactions[1].signature = tampered[target].transactions[2].signature
    show_report(tampered, chain.difficulty)

    print("\n   d) Bajar la dificultad del bloque para re-minarlo barato:")
    tampered = copy.deepcopy(honest)
    tampered[target].difficulty = 1
    mine(tampered[target])
    show_report(tampered, chain.difficulty)

    print("\n   e) Intentar agregar un bloque con una tx que gasta más de lo que hay:")
    alice = wallets["Alice"]
    greedy = Transaction.create(alice, wallets["Mallory"].address, 10 ** 6,
                                chain.next_seq(alice.address))
    try:
        chain.mine_block([greedy], wallets["Minera"].address, next_timestamp(chain))
    except InvalidBlock as exc:
        for issue in exc.issues:
            print(f"   RECHAZADO: {issue}")

    # ------------------------------------------------------------------ 7
    say.section("Defensa: nonces deterministas (RFC 6979)")
    print("   Se repite la simulación con la misma semilla, pero Bob firma con RFC 6979.\n")
    safe = build_scenario(seed=seed, difficulty=difficulty, victim_nonce="rfc6979",
                          entropy_bits=entropy_bits)
    observed = harvest_signatures(safe.chain.blocks)
    rs = [o.r for o in observed]
    print(f"   Firmas en la cadena: {len(observed)},  valores de r distintos: {len(set(rs))}")
    print(f"   Pares con r repetido: {len(find_nonce_reuse(observed))}")
    print(f"   Claves recuperadas:   {len(recover_private_keys(safe.chain.blocks))}")

    d = safe.wallets["Bob"].private_key
    m = b"el mismo mensaje"
    sig1, sig2 = sign(d, m, rfc6979_nonce), sign(d, m, rfc6979_nonce)
    print("\n   Con RFC 6979, k = HMAC-DRBG(d, H(m)):")
    print(f"   - mismo mensaje dos veces → misma firma: {sig1 == sig2} "
          "(z1 = z2, así que las fórmulas no dan nada)")
    sig3 = sign(d, b"otro mensaje", rfc6979_nonce)
    print(f"   - mensaje distinto → r distinto:         {sig1.r != sig3.r}")
    print(f"   - y la firma sigue siendo ECDSA estándar: {verify(safe.wallets['Bob'].public_key, m, sig1)}")
    print("\n   El nonce ya no depende de ningún generador aleatorio, así que un RNG roto")
    print("   (Android 2013) o un k fijo (PS3 2010) dejan de ser posibles.\n")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Mini-blockchain con ECDSA y ataque por nonce repetido")
    parser.add_argument("--semilla", type=int, default=2026, help="semilla de los datos simulados")
    parser.add_argument("--dificultad", type=int, default=14,
                        help="bits en cero de la prueba de trabajo (default 14)")
    parser.add_argument("--bits-entropia", type=int, default=3,
                        help="entropía del RNG defectuoso de Bob (default 3 → 8 nonces posibles)")
    parser.add_argument("--pausa", action="store_true", help="esperar Enter entre pasos")
    args = parser.parse_args(argv)
    if not 0 <= args.dificultad <= 24:
        parser.error("la dificultad debe estar entre 0 y 24 bits")
    run(args.semilla, args.dificultad, args.bits_entropia, args.pausa)


if __name__ == "__main__":
    main()
