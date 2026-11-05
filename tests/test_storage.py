"""Persistencia (archivo y Postgres) y cachés de validación y análisis."""

import json
import os
import random

import pytest

from minichain.attack import recover_private_keys
from minichain.curve import secp256k1
from minichain.nonces import ConstantNonce, WeakRNGNonce, nonce_from_dict, nonce_to_dict, rfc6979_nonce
from minichain.validator import validate_chain
from server.network import Network, ScenarioParams
from server.storage import FileStorage, MemoryStorage, PostgresStorage

PARAMS = ScenarioParams(seed=11, difficulty=4)


def busy_network(storage):
    net = Network(PARAMS, storage)
    net.transfer("Alice", "Carol", 7, "a")
    net.mine("Mallory", None, 22)
    net.create_wallet("Zoe", "constant")
    net.transfer("Carol", "Zoe", 3, "pendiente")      # queda en la mempool
    net.set_nonce("Bob", "rfc6979")
    return net


def same_state(a: Network, b: Network):
    assert b.chain.tip.hash() == a.chain.tip.hash()
    assert b.version == a.version
    assert [t.txid() for t in b.node.mempool] == [t.txid() for t in a.node.mempool]
    assert set(b.wallets) == set(a.wallets)
    for name, w in a.wallets.items():
        assert b.wallets[name].private_key == w.private_key
        assert b.wallets[name].nonce_kind == w.nonce_kind
        assert b.chain.balance(w.address) == a.chain.balance(w.address)
        assert b.node.available_balance(w.address) == a.node.available_balance(w.address)


def test_nonce_strategies_roundtrip_and_weak_rng_continues():
    weak = WeakRNGNonce(3, seed=5)
    for _ in range(4):
        weak(1, b"", secp256k1)  # avanza el generador
    copy_ = nonce_from_dict(json.loads(json.dumps(nonce_to_dict(weak))))
    assert [weak(1, b"", secp256k1) for _ in range(10)] == [copy_(1, b"", secp256k1) for _ in range(10)]
    const = ConstantNonce(12345)
    assert nonce_from_dict(nonce_to_dict(const))(1, b"", secp256k1) == const(1, b"", secp256k1)
    assert nonce_from_dict(nonce_to_dict(rfc6979_nonce)) is rfc6979_nonce


def test_file_storage_restores_everything(tmp_path):
    path = tmp_path / "estado.json"
    a = busy_network(FileStorage(path))
    b = Network(ScenarioParams(seed=999), FileStorage(path))  # los parámetros se ignoran: hay estado
    assert b.restored and not a.restored
    same_state(a, b)
    assert b.validate()["ok"]
    # La red restaurada sigue funcionando y guardando.
    b.mine("Alice", None, 22)
    c = Network(PARAMS, FileStorage(path))
    same_state(b, c)


def test_reset_replaces_stored_chain(tmp_path):
    path = tmp_path / "estado.json"
    a = busy_network(FileStorage(path))
    a.reset(ScenarioParams(seed=12, difficulty=4, n_blocks=2))
    b = Network(PARAMS, FileStorage(path))
    same_state(a, b)
    assert len(b.chain.blocks) == 3


def test_tampered_storage_is_rejected_and_regenerated(tmp_path):
    path = tmp_path / "estado.json"
    busy_network(FileStorage(path))
    data = json.loads(path.read_text())
    data["blocks"][1]["transactions"][1]["amount"] += 100  # rompe la raíz de Merkle
    path.write_text(json.dumps(data))
    b = Network(PARAMS, FileStorage(path))
    assert not b.restored
    assert b.validate()["ok"]


class FlakyStorage(MemoryStorage):
    def __init__(self):
        self.fail = False
        self.saved_blocks = 0

    def save(self, state, new_blocks, replace):
        if self.fail:
            raise ConnectionError("base de datos caída")
        self.saved_blocks = (0 if replace else self.saved_blocks) + len(new_blocks)


def test_storage_failure_does_not_break_the_network():
    st = FlakyStorage()
    net = Network(PARAMS, st)
    st.fail = True
    net.transfer("Alice", "Bob", 1)
    net.mine("Alice", None, 22)
    assert net.storage_info()["ok"] is False
    st.fail = False
    net.transfer("Alice", "Bob", 1)           # la siguiente escritura recupera lo pendiente
    assert net.storage_info()["ok"] is True
    assert st.saved_blocks == len(net.chain.blocks)


def test_incremental_validation_matches_full_validation():
    net = Network(PARAMS)
    first = net.validate()
    for i in range(3):
        net.transfer("Alice", "Carol", 2 + i)
        net.mine("Carol", None, 22)
    inc = net.validate()
    full = validate_chain(net.chain.blocks, net.chain.difficulty)
    assert inc["ok"] and full.ok
    assert inc["blocks_checked"] == len(net.chain.blocks) == first["blocks_checked"] + 3
    assert inc["signatures_checked"] == full.signatures_checked
    net.reset(ScenarioParams(seed=3, difficulty=4, n_blocks=1))
    assert net.validate()["blocks_checked"] == 2


def test_cached_scan_matches_direct_attack():
    net = Network(PARAMS)
    scan = net.attack_scan()
    direct = recover_private_keys(net.chain.blocks)
    assert {r["address"] for r in scan["recoveries"]} == set(direct)
    net.steal("Bob", "Mallory", None, 22)
    again = net.attack_scan()
    assert len(again["signatures"]) == len(scan["signatures"]) + 1
    assert net.validate()["ok"]


@pytest.mark.skipif(not os.getenv("MINICHAIN_TEST_DATABASE_URL"),
                    reason="define MINICHAIN_TEST_DATABASE_URL para probar contra PostgreSQL")
def test_postgres_storage_roundtrip():
    url = os.environ["MINICHAIN_TEST_DATABASE_URL"]
    st = PostgresStorage(url)
    st._run(lambda cur: cur.execute("delete from minichain.blocks; delete from minichain.state"))
    a = busy_network(PostgresStorage(url))
    b = Network(ScenarioParams(seed=random.randint(1, 10**6)), PostgresStorage(url))
    assert b.restored
    same_state(a, b)
    b.reset(ScenarioParams(seed=12, difficulty=4, n_blocks=2))
    c = Network(PARAMS, PostgresStorage(url))
    same_state(b, c)


class UnreachableStorage(MemoryStorage):
    kind = "postgres"

    def __init__(self):
        self.writes = 0

    def load(self):
        raise ConnectionError("la base de datos está pausada")

    def save(self, state, new_blocks, replace):
        self.writes += 1


def test_unreadable_storage_at_boot_never_overwrites_saved_chain():
    st = UnreachableStorage()
    net = Network(PARAMS, st)              # arranca igual, en memoria
    net.transfer("Alice", "Bob", 1)
    net.mine("Alice", None, 22)
    info = net.storage_info()
    assert info["ok"] is False and "reinicia" in info["error"]
    assert st.writes == 0                  # nunca reemplazó lo guardado
