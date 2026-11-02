"""Estado compartido del servidor: un nodo, sus billeteras y el escenario.

Todos los clientes conectados ven y modifican la misma red. Los números de
256 bits se envían como cadenas hexadecimales (JSON/JavaScript no los
representan con exactitud como números).
"""

from __future__ import annotations

import copy
import threading
import time
from dataclasses import asdict, dataclass

from minichain.attack import find_nonce_reuse, harvest_signatures, recover_private_keys
from minichain.block import Block, Transaction, meets_difficulty, mine
from minichain.chain import Blockchain, InvalidBlock
from minichain.curve import decode_point, secp256k1
from minichain.merkle import merkle_levels, merkle_proof, verify_merkle_proof
from minichain.node import Node, RejectedTransaction
from minichain.nonces import NONCE_KINDS
from minichain.ntheory import modinv
from minichain.simulation import BLOCK_INTERVAL, build_scenario, make_nonce_fn
from minichain.validator import ValidationReport, validate_chain
from minichain.wallet import Wallet

N = secp256k1.n


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


def hx(value: int) -> str:
    return f"{value:064x}"


@dataclass
class ScenarioParams:
    seed: int = 2026
    difficulty: int = 14
    victim_nonce: str = "weak"
    entropy_bits: int = 3
    n_blocks: int = 5
    tx_per_block: int = 4


TAMPER_ACTIONS = {
    "amount": "Cambiar el monto de la transacción",
    "recipient": "Cambiar el destinatario",
    "swap_signature": "Poner la firma de otra transacción",
    "remine": "Cambiar el monto, recalcular Merkle y re-minar el bloque",
    "lower_difficulty": "Bajar la dificultad del bloque y re-minarlo",
    "break_link": "Alterar el prev_hash del bloque",
}


class Network:
    def __init__(self, params: ScenarioParams | None = None):
        self.lock = threading.RLock()
        self.version = 0
        self.reset(params or ScenarioParams())

    # ------------------------------------------------------------ escenario

    def reset(self, params: ScenarioParams) -> None:
        if params.victim_nonce not in NONCE_KINDS:
            raise BadRequest(f"estrategia desconocida: {params.victim_nonce}")
        scenario = build_scenario(seed=params.seed, difficulty=params.difficulty,
                                  victim_nonce=params.victim_nonce,
                                  entropy_bits=params.entropy_bits,
                                  n_blocks=params.n_blocks, tx_per_block=params.tx_per_block,
                                  # La historia simulada termina "ahora": las fechas se ven reales.
                                  base_timestamp=int(time.time()) - (params.n_blocks + 1) * BLOCK_INTERVAL)
        with self.lock:
            self.params = params
            self.node = Node(scenario.chain)
            self.wallets: dict[str, Wallet] = dict(scenario.wallets)
            self.version += 1

    @property
    def chain(self) -> Blockchain:
        return self.node.chain

    # ------------------------------------------------------------ billeteras

    def wallet(self, name: str) -> Wallet:
        try:
            return self.wallets[name]
        except KeyError:
            raise NotFound(f"no existe la billetera {name!r}") from None

    def resolve_address(self, name_or_address: str) -> str:
        if name_or_address in self.wallets:
            return self.wallets[name_or_address].address
        if name_or_address.startswith("mc") and len(name_or_address) == 42:
            return name_or_address
        raise NotFound(f"destinatario desconocido: {name_or_address!r}")

    def names_by_address(self) -> dict[str, str]:
        return {w.address: name for name, w in self.wallets.items()}

    def create_wallet(self, name: str, nonce: str, entropy_bits: int = 3) -> dict:
        name = name.strip()
        if not name or len(name) > 24:
            raise BadRequest("el nombre debe tener entre 1 y 24 caracteres")
        if nonce not in NONCE_KINDS:
            raise BadRequest(f"estrategia desconocida: {nonce}")
        with self.lock:
            if name in self.wallets:
                raise BadRequest(f"ya existe una billetera llamada {name!r}")
            wallet = Wallet.generate(name, None, make_nonce_fn(nonce, None, entropy_bits))
            self.wallets[name] = wallet
            self.version += 1
            return self.wallet_json(wallet)

    def set_nonce(self, name: str, nonce: str, entropy_bits: int = 3) -> dict:
        if nonce not in NONCE_KINDS:
            raise BadRequest(f"estrategia desconocida: {nonce}")
        with self.lock:
            wallet = self.wallet(name)
            wallet.nonce_fn = make_nonce_fn(nonce, None, entropy_bits)
            self.version += 1
            return self.wallet_json(wallet)

    def wallet_json(self, w: Wallet) -> dict:
        return {
            "name": w.name,
            "address": w.address,
            "pubkey": w.pubkey_hex,
            "balance": self.chain.balance(w.address),
            "available": self.node.available_balance(w.address),
            "next_seq": self.node.next_seq(w.address),
            "nonce": w.nonce_kind,
            "nonce_label": NONCE_KINDS.get(w.nonce_kind, w.nonce_kind),
        }

    # ------------------------------------------------------------ transacciones

    def transfer(self, sender: str, recipient: str, amount: int, memo: str = "") -> dict:
        with self.lock:
            wallet = self.wallet(sender)
            to = self.resolve_address(recipient)
            tx = Transaction.create(wallet, to, amount, self.node.next_seq(wallet.address), memo[:80])
            return self._submit(tx)

    def submit_raw(self, data: dict) -> dict:
        try:
            tx = Transaction.from_dict(data)
        except (KeyError, ValueError, TypeError) as exc:
            raise BadRequest(f"transacción mal formada: {exc}") from None
        with self.lock:
            return self._submit(tx)

    def _submit(self, tx: Transaction) -> dict:
        try:
            self.node.submit(tx)
        except RejectedTransaction as exc:
            raise BadRequest(str(exc)) from None
        self.version += 1
        return self.tx_json(tx)

    def mine(self, miner: str, difficulty: int | None, max_difficulty: int) -> dict:
        if difficulty is not None and difficulty > max_difficulty:
            raise BadRequest(f"la dificultad máxima permitida es {max_difficulty}")
        with self.lock:
            address = self.resolve_address(miner)
            try:
                block, attempts = self.node.mine(address, difficulty)
            except (ValueError, InvalidBlock) as exc:
                raise BadRequest(str(exc)) from None
            self.version += 1
            return {"block": self.block_summary(block), "attempts": attempts,
                    "expected_attempts": 2 ** block.difficulty}

    # ------------------------------------------------------------ lectura

    def tx_json(self, tx: Transaction) -> dict:
        names = self.names_by_address()
        sender_address = tx.sender_address
        return {
            "txid": tx.txid(),
            "coinbase": tx.is_coinbase,
            "sender": tx.sender,
            "sender_address": sender_address,
            "sender_name": names.get(sender_address) if sender_address else None,
            "recipient": tx.recipient,
            "recipient_name": names.get(tx.recipient),
            "amount": tx.amount,
            "seq": tx.seq,
            "memo": tx.memo,
            "signature": None if tx.signature is None else {"r": hx(tx.signature.r),
                                                            "s": hx(tx.signature.s)},
            "payload": tx.payload().decode(),
        }

    def block_summary(self, b: Block) -> dict:
        return {
            "index": b.index,
            "hash": b.hash(),
            "prev_hash": b.prev_hash,
            "timestamp": b.timestamp,
            "difficulty": b.difficulty,
            "merkle_root": b.merkle_root,
            "nonce": b.nonce,
            "tx_count": len(b.transactions),
        }

    def block_json(self, b: Block) -> dict:
        data = self.block_summary(b)
        data["transactions"] = [self.tx_json(tx) for tx in b.transactions]
        data["merkle_levels"] = merkle_levels([tx.txid() for tx in b.transactions])
        data["meets_difficulty"] = meets_difficulty(b.hash(), b.difficulty)
        return data

    def block(self, index: int) -> dict:
        with self.lock:
            if not 0 <= index < len(self.chain.blocks):
                raise NotFound(f"no existe el bloque {index}")
            return self.block_json(self.chain.blocks[index])

    def proof(self, index: int, tx_index: int) -> dict:
        with self.lock:
            if not 0 <= index < len(self.chain.blocks):
                raise NotFound(f"no existe el bloque {index}")
            block = self.chain.blocks[index]
            txids = [tx.txid() for tx in block.transactions]
            if not 0 <= tx_index < len(txids):
                raise NotFound(f"el bloque {index} no tiene la transacción {tx_index}")
            path = merkle_proof(txids, tx_index)
            return {
                "txid": txids[tx_index],
                "root": block.merkle_root,
                "proof": [{"sibling": s, "side": side} for s, side in path],
                "valid": verify_merkle_proof(txids[tx_index], path, block.merkle_root),
            }

    # ------------------------------------------------------------ consultas

    def _tx_index(self) -> list[tuple[int, int, Transaction]]:
        """(bloque, posición, tx) de toda la cadena, de la más reciente a la más vieja."""
        out = []
        for b in reversed(self.chain.blocks):
            for j in range(len(b.transactions) - 1, -1, -1):
                out.append((b.index, j, b.transactions[j]))
        return out

    def transactions(self, address: str | None = None, limit: int = 200) -> list[dict]:
        with self.lock:
            rows = []
            for bi, j, tx in self._tx_index():
                if address and address not in (tx.sender_address, tx.recipient):
                    continue
                row = self.tx_json(tx)
                row.update(block=bi, position=j, timestamp=self.chain.blocks[bi].timestamp)
                rows.append(row)
                if len(rows) >= limit:
                    break
            return rows

    def transaction(self, txid: str) -> dict:
        with self.lock:
            for tx in self.node.mempool:
                if tx.txid() == txid:
                    return {**self.tx_json(tx), "block": None, "position": None,
                            "timestamp": None, "proof": None}
            for bi, j, tx in self._tx_index():
                if tx.txid() == txid:
                    row = self.tx_json(tx)
                    row.update(block=bi, position=j, timestamp=self.chain.blocks[bi].timestamp,
                               proof=self.proof(bi, j))
                    return row
        raise NotFound("no existe esa transacción")

    def wallet_detail(self, name: str) -> dict:
        with self.lock:
            w = self.wallet(name)
            data = self.wallet_json(w)
            data["history"] = self.transactions(w.address, limit=100)
            data["signatures"] = sum(1 for t in data["history"] if t["sender_address"] == w.address)
            return data

    def search(self, query: str) -> list[dict]:
        """Busca por número de bloque, nombre de billetera, dirección, hash o txid."""
        q = query.strip().lower().removeprefix("0x")
        if not q:
            return []
        results: list[dict] = []
        with self.lock:
            blocks = self.chain.blocks
            if q.isdigit() and int(q) < len(blocks):
                b = blocks[int(q)]
                results.append({"type": "block", "ref": str(b.index), "label": f"Bloque {b.index}",
                                "detail": b.hash()})
            for name, w in self.wallets.items():
                if q in name.lower() or (len(q) >= 4 and w.address.startswith(q)):
                    results.append({"type": "wallet", "ref": name, "label": name, "detail": w.address})
            if len(q) >= 4 and all(c in "0123456789abcdef" for c in q):
                for b in blocks:
                    if b.hash().startswith(q):
                        results.append({"type": "block", "ref": str(b.index),
                                        "label": f"Bloque {b.index}", "detail": b.hash()})
                for bi, j, tx in self._tx_index():
                    if tx.txid().startswith(q):
                        results.append({"type": "tx", "ref": tx.txid(),
                                        "label": f"Transacción en bloque {bi}", "detail": tx.txid()})
                for tx in self.node.mempool:
                    if tx.txid().startswith(q):
                        results.append({"type": "tx", "ref": tx.txid(), "label": "Transacción pendiente",
                                        "detail": tx.txid()})
        return results[:12]

    def state(self, clients: int = 0) -> dict:
        with self.lock:
            return {
                "version": self.version,
                "params": asdict(self.params),
                "difficulty": self.chain.difficulty,
                "height": len(self.chain.blocks) - 1,
                "tip": self.chain.tip.hash(),
                "wallets": [self.wallet_json(w) for w in self.wallets.values()],
                "mempool": [self.tx_json(tx) for tx in self.node.mempool],
                "blocks": [self.block_summary(b) for b in self.chain.blocks],
                "nonce_kinds": NONCE_KINDS,
                "clients": clients,
            }

    def export_chain(self) -> dict:
        with self.lock:
            return self.chain.to_dict()

    # ------------------------------------------------------------ validación

    def report_json(self, report: ValidationReport, blocks: list[Block]) -> dict:
        bad = {i.block for i in report.issues}
        return {
            "ok": report.ok,
            "blocks_checked": report.blocks_checked,
            "signatures_checked": report.signatures_checked,
            "issues": [{"block": i.block, "tx": i.tx, "kind": i.kind, "detail": i.detail}
                       for i in report.issues],
            "blocks": [{"index": b.index, "hash": b.hash(), "prev_hash": b.prev_hash,
                        "ok": b.index not in bad} for b in blocks],
        }

    def validate(self) -> dict:
        with self.lock:
            blocks = list(self.chain.blocks)
            difficulty = self.chain.difficulty
        return self.report_json(validate_chain(blocks, difficulty), blocks)

    def validate_external(self, data: dict) -> dict:
        try:
            blocks = [Block.from_dict(b) for b in data["blocks"]]
            difficulty = int(data["difficulty"])
        except (KeyError, ValueError, TypeError) as exc:
            raise BadRequest(f"cadena mal formada: {exc}") from None
        return self.report_json(validate_chain(blocks, difficulty), blocks)

    def tamper(self, block_index: int, tx_index: int, action: str) -> dict:
        """Aplica una manipulación a una COPIA de la cadena y la valida."""
        if action not in TAMPER_ACTIONS:
            raise BadRequest(f"acción desconocida: {action}")
        with self.lock:
            blocks = copy.deepcopy(self.chain.blocks)
            difficulty = self.chain.difficulty
            mallory = self.wallets.get("Mallory")
        if not 1 <= block_index < len(blocks):
            raise BadRequest("elige un bloque distinto del génesis")
        block = blocks[block_index]
        signed = [j for j, tx in enumerate(block.transactions) if not tx.is_coinbase]
        if tx_index not in signed:
            raise BadRequest("elige una transacción firmada del bloque")
        tx = block.transactions[tx_index]
        if action == "amount":
            tx.amount += 500
        elif action == "recipient":
            tx.recipient = mallory.address if mallory else "mc" + "0" * 40
        elif action == "swap_signature":
            others = [j for j in signed if j != tx_index]
            if not others:
                raise BadRequest("el bloque necesita otra transacción firmada")
            tx.signature = block.transactions[others[0]].signature
        elif action == "remine":
            tx.amount += 500
            mine(block)
        elif action == "lower_difficulty":
            block.difficulty = 1
            mine(block)
        elif action == "break_link":
            block.prev_hash = "f" * 64
        result = self.report_json(validate_chain(blocks, difficulty), blocks)
        result["action"] = action
        result["description"] = TAMPER_ACTIONS[action]
        result["tampered"] = {"block": block_index, "tx": tx_index}
        return result

    # ------------------------------------------------------------ ataque

    def attack_scan(self) -> dict:
        with self.lock:
            blocks = list(self.chain.blocks)
            names = self.names_by_address()
            wallets = dict(self.wallets)
        observed = harvest_signatures(blocks)
        pairs = find_nonce_reuse(observed)
        groups: dict[tuple[str, str], set[tuple[int, int]]] = {}
        for a, b in pairs:
            key = (a.address, hx(a.r))
            groups.setdefault(key, set()).update({(a.block, a.tx), (b.block, b.tx)})

        recoveries = []
        for address, rec in recover_private_keys(blocks).items():
            a, b = rec.first, rec.second
            name = names.get(address)
            wallet = wallets.get(name) if name else None
            Q = rec.d * secp256k1.G
            published = decode_point(secp256k1, bytes.fromhex(a.pubkey_hex))
            recoveries.append({
                "address": address,
                "name": name,
                "pubkey": a.pubkey_hex,
                "first": {"block": a.block, "tx": a.tx, "s": hx(a.s), "z": hx(a.z)},
                "second": {"block": b.block, "tx": b.tx, "s": hx(b.s), "z": hx(b.z)},
                "r": hx(a.r),
                "z_diff": hx((a.z - b.z) % N),
                "s_diff": hx((a.s - b.s) % N),
                "s_diff_inv": hx(modinv(a.s - b.s, N)) if (a.s - b.s) % N else None,
                "r_inv": hx(modinv(a.r, N)),
                "k": hx(rec.k),
                "d": hx(rec.d),
                "dG": {"x": hx(Q.x), "y": hx(Q.y)},
                "dG_matches_pubkey": Q == published,
                # Solo el servidor conoce la clave real; sirve para la demostración.
                "matches_real_key": wallet is not None and wallet.private_key == rec.d,
            })
        return {
            "signatures": [{"block": o.block, "tx": o.tx, "address": o.address,
                            "name": names.get(o.address), "r": hx(o.r), "s": hx(o.s),
                            "z": hx(o.z)} for o in observed],
            "unique_r": len({o.r for o in observed}),
            "collisions": [{"address": addr, "name": names.get(addr), "r": r,
                            "positions": sorted([list(p) for p in pos])}
                           for (addr, r), pos in groups.items()],
            "pairs": len(pairs),
            "recoveries": recoveries,
        }

    def steal(self, victim: str, thief: str, miner: str | None, max_difficulty: int) -> dict:
        """Recupera la clave de la víctima desde la cadena pública y la usa."""
        with self.lock:
            victim_address = self.resolve_address(victim)
            thief_address = self.resolve_address(thief)
            found = recover_private_keys(self.chain.blocks)
            if victim_address not in found:
                raise BadRequest("no hay dos firmas de esa billetera con el mismo r: "
                                 "su clave no se puede recuperar")
            d = found[victim_address].d
            forged_wallet = Wallet("falsificada", d)
            amount = self.node.available_balance(victim_address)
            if amount <= 0:
                raise BadRequest("la víctima no tiene saldo disponible")
            before = {w.name: self.chain.balance(w.address) for w in self.wallets.values()}
            tx = Transaction.create(forged_wallet, thief_address, amount,
                                    self.node.next_seq(victim_address), "firmado con la clave recuperada")
            submitted = self._submit(tx)
            # Mina un tercero (la red), para que el saldo del ladrón refleje solo lo robado.
            default_miner = "Minera" if "Minera" in self.wallets else thief
            mined = self.mine(miner or default_miner, None, max_difficulty)
            after = {w.name: self.chain.balance(w.address) for w in self.wallets.values()}
        return {"tx": submitted, "mined": mined, "validation": self.validate(),
                "balances_before": before, "balances_after": after}

    @staticmethod
    def compare_defense(seed: int, entropy_bits: int) -> dict:
        """Misma simulación con el nonce defectuoso y con RFC 6979."""
        out = {}
        for kind in ("weak", "rfc6979"):
            sc = build_scenario(seed=seed, difficulty=4, victim_nonce=kind,
                                entropy_bits=entropy_bits)
            observed = harvest_signatures(sc.chain.blocks)
            bob = sc.wallets["Bob"]
            bob_rs = [o.r for o in observed if o.address == bob.address]
            out[kind] = {
                "signatures": len(observed),
                "unique_r": len({o.r for o in observed}),
                "bob_signatures": len(bob_rs),
                "bob_unique_r": len(set(bob_rs)),
                "pairs": len(find_nonce_reuse(observed)),
                "recovered": len(recover_private_keys(sc.chain.blocks)),
            }
        return out
