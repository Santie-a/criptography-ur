"""Estado compartido del servidor: un nodo, sus billeteras y el escenario.

Todos los clientes conectados ven y modifican la misma red. Los números de
256 bits se envían como cadenas hexadecimales (JSON/JavaScript no los
representan con exactitud como números).
"""

from __future__ import annotations

import copy
import logging
import threading
import time
from dataclasses import asdict, dataclass
from functools import lru_cache

from minichain.attack import (ObservedSignature, Recovery, find_nonce_reuse, harvest_signatures,
                              recover_from_pair, recover_private_keys)
from minichain.block import Block, Transaction, meets_difficulty, mine
from minichain.chain import Blockchain, InvalidBlock
from minichain.curve import decode_point, secp256k1
from minichain.merkle import merkle_levels, merkle_proof, verify_merkle_proof
from minichain.node import Node, RejectedTransaction
from minichain.nonces import NONCE_KINDS, nonce_from_dict, nonce_to_dict
from minichain.ntheory import modinv
from minichain.simulation import BLOCK_INTERVAL, build_scenario, make_nonce_fn
from minichain.validator import Issue, Ledger, ValidationReport, validate_block, validate_chain
from minichain.wallet import Wallet

from .storage import FORMAT_VERSION, MemoryStorage, Storage

N = secp256k1.n
log = logging.getLogger("minichain.network")


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
    def __init__(self, params: ScenarioParams | None = None, storage: Storage | None = None):
        self.lock = threading.RLock()
        self.version = 0
        self.storage: Storage = storage or MemoryStorage()
        self.storage_error: str | None = None
        self.restored = False
        # Si no se pudo LEER el almacenamiento al arrancar, no se escribe nada:
        # escribir reemplazaría la red guardada por una nueva. Se corrige
        # reiniciando el servidor cuando la base de datos esté disponible.
        self._storage_blocked = False
        # Las cachés tienen su propio candado: un cálculo largo (la primera
        # validación tras reiniciar) no bloquea transferencias ni minado.
        self._cache_lock = threading.Lock()
        self._persisted_blocks = 0      # cuántos bloques ya están en el almacenamiento
        self._replace_pending = True     # la próxima escritura reemplaza todo
        self._clear_caches()
        if not self._restore():
            self.reset(params or ScenarioParams())

    # ------------------------------------------------------------ persistencia

    def _snapshot_state(self) -> dict:
        return {
            "format": FORMAT_VERSION,
            "version": self.version,
            "params": asdict(self.params),
            "difficulty": self.chain.difficulty,
            "wallets": [{"name": w.name, "private_key": hx(w.private_key),
                         "nonce": nonce_to_dict(w.nonce_fn)} for w in self.wallets.values()],
            "mempool": [tx.to_dict() for tx in self.node.mempool],
        }

    def _persist(self) -> None:
        """Guarda el estado actual. Se llama con el candado tomado, tras cada cambio.

        Si falla (por ejemplo, la base de datos no responde), la red sigue
        funcionando en memoria y la próxima escritura reintenta lo pendiente.
        """
        if self._storage_blocked:
            return
        replace = self._replace_pending
        start = 0 if replace else self._persisted_blocks
        blocks = self.chain.blocks
        try:
            self.storage.save(self._snapshot_state(), [b.to_dict() for b in blocks[start:]], replace)
        except Exception as exc:  # noqa: BLE001 - cualquier fallo del almacenamiento
            self.storage_error = f"{type(exc).__name__}: {exc}"
            log.error("no se pudo guardar el estado: %s", self.storage_error)
            return
        self.storage_error = None
        self._persisted_blocks = len(blocks)
        self._replace_pending = False

    def _restore(self) -> bool:
        """Carga el estado guardado. Devuelve False si no hay nada o no sirve."""
        try:
            saved = self.storage.load()
        except Exception as exc:  # noqa: BLE001
            self._storage_blocked = True
            self.storage_error = (f"no se pudo leer el almacenamiento al arrancar ({type(exc).__name__}: {exc}). "
                                  "La red funciona solo en memoria y no se guarda; reinicia el servidor "
                                  "cuando la base de datos esté disponible.")
            log.error(self.storage_error)
            return False
        if saved is None:
            return False
        state, blocks = saved
        try:
            if state.get("format") != FORMAT_VERSION:
                raise ValueError(f"formato {state.get('format')} no soportado")
            # Los datos los escribió este mismo servidor después de validarlos:
            # se revisan enlaces, prueba de trabajo, Merkle y saldos, pero no se
            # repite la verificación ECDSA (la parte lenta).
            chain = Blockchain.from_dict({"difficulty": state["difficulty"], "blocks": blocks},
                                         verify_signatures=False)
            node = Node(chain)
            node.restore_mempool([Transaction.from_dict(t) for t in state["mempool"]])
            wallets = {w["name"]: Wallet(w["name"], int(w["private_key"], 16), nonce_from_dict(w["nonce"]))
                       for w in state["wallets"]}
            params = ScenarioParams(**state["params"])
        except Exception as exc:  # noqa: BLE001
            log.error("estado guardado inválido, se genera una red nueva: %s", exc)
            return False
        with self.lock:
            self.params, self.node, self.wallets = params, node, wallets
            self.version = int(state["version"])
            self._persisted_blocks = len(chain.blocks)
            self._replace_pending = False
            self._clear_caches()
            self.restored = True
        log.info("red restaurada: %d bloques, %d pendientes, versión %d",
                 len(chain.blocks), len(node.mempool), self.version)
        return True

    def storage_info(self) -> dict:
        return {"kind": self.storage.kind, "ok": self.storage_error is None,
                "error": self.storage_error, "restored": self.restored}

    def _changed(self) -> None:
        """Registra un cambio de estado: nueva versión y escritura en el almacenamiento."""
        self.version += 1
        self._persist()

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
            self._clear_caches()
            self._replace_pending = True
            self.restored = False
            self._changed()

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
            self._changed()
            return self.wallet_json(wallet)

    def set_nonce(self, name: str, nonce: str, entropy_bits: int = 3) -> dict:
        if nonce not in NONCE_KINDS:
            raise BadRequest(f"estrategia desconocida: {nonce}")
        with self.lock:
            wallet = self.wallet(name)
            wallet.nonce_fn = make_nonce_fn(nonce, None, entropy_bits)
            self._changed()
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
        self._changed()
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
            self._changed()
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
                "storage": self.storage_info(),
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

    # ------------------------------------------------------------ cachés
    #
    # Verificar una firma en Python puro cuesta decenas de milisegundos (más en
    # un servidor gratuito con poca CPU). Si cada navegador revalidara la cadena
    # completa cada vez que algo cambia, unos pocos clientes saturarían el
    # servidor. Como la cadena solo crece (salvo al regenerar), se valida una
    # vez cada bloque nuevo y se guarda el resultado; lo mismo con el análisis
    # de firmas. Todos los clientes reciben la misma respuesta ya calculada.

    def _clear_caches(self) -> None:
        self._val = {"count": 0, "tip": None, "ledger": Ledger(), "issues": [], "sigs": 0}
        self._scan = {"count": 0, "tip": None, "observed": [], "recoveries": {}}

    @staticmethod
    def _cache_prefix_valid(cache: dict, blocks: list[Block]) -> bool:
        n = cache["count"]
        return n <= len(blocks) and (n == 0 or blocks[n - 1].hash() == cache["tip"])

    def validate(self) -> dict:
        # Los bloques no cambian una vez agregados y la lista solo crece, así
        # que basta una copia de la lista para trabajar fuera del candado.
        with self.lock:
            blocks = list(self.chain.blocks)
            difficulty = self.chain.difficulty
        with self._cache_lock:
            if not self._cache_prefix_valid(self._val, blocks):
                self._val = {"count": 0, "tip": None, "ledger": Ledger(), "issues": [], "sigs": 0}
            v = self._val
            for i in range(v["count"], len(blocks)):
                prev = blocks[i - 1] if i > 0 else None
                issues, sigs = validate_block(blocks[i], prev, v["ledger"], difficulty)
                v["issues"].extend(issues)
                v["sigs"] += sigs
            if blocks:
                v["count"], v["tip"] = len(blocks), blocks[-1].hash()
            report = ValidationReport(list(v["issues"]), v["ledger"], v["count"], v["sigs"])
            if not blocks:
                report.issues.append(Issue(0, None, "génesis", "la cadena está vacía"))
            return self.report_json(report, blocks)

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

    def _scan_raw(self) -> tuple[list[ObservedSignature], list, dict[str, Recovery]]:
        """Firmas, pares con r repetido y claves recuperadas; se recalcula por bloque nuevo."""
        with self.lock:
            blocks = list(self.chain.blocks)
        with self._cache_lock:
            if not self._cache_prefix_valid(self._scan, blocks):
                self._scan = {"count": 0, "tip": None, "observed": [], "recoveries": {}}
            c = self._scan
            if c["count"] < len(blocks):
                c["observed"].extend(harvest_signatures(blocks[c["count"]:]))
                c["count"], c["tip"] = len(blocks), blocks[-1].hash()
            pairs = find_nonce_reuse(c["observed"])
            for a, b in pairs:
                if a.address in c["recoveries"]:
                    continue
                Q = decode_point(secp256k1, bytes.fromhex(a.pubkey_hex))
                result = recover_from_pair(a.r, a.s, a.z, b.s, b.z, Q, secp256k1)
                if result is not None:
                    c["recoveries"][a.address] = Recovery(a, b, *result)
            return c["observed"], pairs, c["recoveries"]

    def warm_up(self) -> None:
        """Precalcula validación y análisis (al arrancar, en segundo plano)."""
        t0 = time.perf_counter()
        self.validate()
        self._scan_raw()
        log.info("cachés listas en %.1f s", time.perf_counter() - t0)

    def attack_scan(self) -> dict:
        observed, pairs, found = self._scan_raw()
        with self.lock:
            names = self.names_by_address()
            wallets = dict(self.wallets)
        groups: dict[tuple[str, str], set[tuple[int, int]]] = {}
        for a, b in pairs:
            key = (a.address, hx(a.r))
            groups.setdefault(key, set()).update({(a.block, a.tx), (b.block, b.tx)})

        recoveries = []
        for address, rec in found.items():
            a, b = rec.first, rec.second
            name = names.get(address)
            wallet = wallets.get(name) if name else None
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
                # _scan_raw solo guarda recuperaciones que pasaron d·G == Q.
                "dG_matches_pubkey": True,
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
            found = self._scan_raw()[2]
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
    @lru_cache(maxsize=32)
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
