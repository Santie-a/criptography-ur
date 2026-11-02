"""API del servidor: flujo completo como lo haría la UI o un cliente externo."""

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from minichain.block import Transaction  # noqa: E402
from minichain.wallet import Wallet  # noqa: E402
from server.app import create_app  # noqa: E402
from server.config import Settings  # noqa: E402
from server.network import Network, ScenarioParams  # noqa: E402


@pytest.fixture(scope="module")
def client():
    net = Network(ScenarioParams(seed=11, difficulty=4))
    settings = Settings(cors_origins=[], frontend_dist=__import__("pathlib").Path("/nonexistent"))
    with TestClient(create_app(settings, net)) as c:
        yield c


def test_state_and_blocks(client):
    st = client.get("/api/state").json()
    assert st["height"] == 5
    assert {w["name"] for w in st["wallets"]} >= {"Alice", "Bob", "Carol", "Mallory"}
    blk = client.get("/api/blocks/1").json()
    assert blk["meets_difficulty"] and blk["merkle_levels"][-1] == [blk["merkle_root"]]
    proof = client.get("/api/blocks/1/proof/2").json()
    assert proof["valid"]
    assert client.get("/api/blocks/99").status_code == 404


def test_transfer_mine_and_validate(client):
    tx = client.post("/api/transactions/transfer",
                     json={"sender": "Alice", "recipient": "Carol", "amount": 5}).json()
    assert tx["sender_name"] == "Alice"
    assert len(client.get("/api/state").json()["mempool"]) == 1
    r = client.post("/api/transactions/transfer",
                    json={"sender": "Alice", "recipient": "Carol", "amount": 10**9})
    assert r.status_code == 400 and "saldo" in r.json()["detail"]
    mined = client.post("/api/mine", json={"miner": "Mallory"}).json()
    assert mined["block"]["tx_count"] == 2
    assert client.post("/api/mine", json={"miner": "Mallory", "difficulty": 1}).status_code == 400
    assert client.get("/api/validate").json()["ok"]


def test_external_client_with_own_key(client):
    me = Wallet.generate("externo")
    client.post("/api/mine", json={"miner": me.address})  # cobra la recompensa
    alice = next(w for w in client.get("/api/state").json()["wallets"] if w["name"] == "Alice")
    tx = Transaction.create(me, alice["address"], 20, 0, "firmado fuera del servidor")
    body = tx.to_dict()
    assert client.post("/api/transactions", json=body).status_code == 200
    body["amount"] = 49  # alterar después de firmar
    body["seq"] = 1
    assert client.post("/api/transactions", json=body).status_code == 400


def test_tamper_does_not_modify_network(client):
    before = client.get("/api/state").json()["tip"]
    res = client.post("/api/tamper", json={"block": 2, "tx": 1, "action": "remine"}).json()
    assert not res["ok"]
    assert {"firma", "enlace"} <= {i["kind"] for i in res["issues"]}
    assert client.get("/api/state").json()["tip"] == before
    assert client.get("/api/validate").json()["ok"]


def test_attack_and_steal(client):
    scan = client.get("/api/attack/scan").json()
    assert scan["pairs"] > 0
    (rec,) = scan["recoveries"]
    assert rec["name"] == "Bob" and rec["matches_real_key"] and rec["dG_matches_pubkey"]
    res = client.post("/api/attack/steal", json={"victim": "Bob"}).json()
    assert res["validation"]["ok"]
    assert res["balances_after"]["Bob"] == 0
    assert res["balances_after"]["Mallory"] > res["balances_before"]["Mallory"]


def test_defense_and_reset(client):
    cmp_ = client.post("/api/defense/compare", json={"seed": 11}).json()
    assert cmp_["weak"]["recovered"] == 1 and cmp_["rfc6979"]["recovered"] == 0
    st = client.post("/api/reset", json={"seed": 11, "difficulty": 4, "victim_nonce": "rfc6979"}).json()
    assert next(w for w in st["wallets"] if w["name"] == "Bob")["nonce"] == "rfc6979"
    assert client.get("/api/attack/scan").json()["recoveries"] == []


def test_labs(client):
    c = client.get("/api/lab/curve", params={"p": 97, "a": 2, "b": 3}).json()
    assert c["order"] == 100 and len(c["points"]) == 99
    add = client.post("/api/lab/curve/add", json={"P": [3, 6], "Q": [3, 6]}).json()
    assert add["case"] == "tangent" and add["R"] == [80, 10]
    mul = client.post("/api/lab/curve/mul", json={"P": [3, 6], "k": 5}).json()
    assert mul["result"] is None and mul["order"] == 5
    assert client.get("/api/lab/curve", params={"p": 91}).status_code == 400
    sig = client.post("/api/lab/ecdsa/sign", json={"message": "hola", "nonce": "rfc6979"}).json()
    assert sig["verification"]["valid"]
    ver = client.post("/api/lab/ecdsa/verify", json={"message": "hola!", "pubkey": sig["Q"]["compressed"],
                                                     "r": sig["r"], "s": sig["s"]}).json()
    assert not ver["valid"]


def test_websocket_events(client):
    with client.websocket_connect("/api/events") as ws:
        assert ws.receive_json()["type"] in ("presence", "hello")
        client.post("/api/wallets", json={"name": "Zoe"})
        kinds = set()
        for _ in range(4):
            kinds.add(ws.receive_json()["type"])
            if "wallet" in kinds:
                break
        assert "wallet" in kinds


def test_lab_recover_from_fixed_k(client):
    k = "1" * 40
    a = client.post("/api/lab/ecdsa/sign", json={"message": "uno", "nonce": "fixed", "k": k}).json()
    b = client.post("/api/lab/ecdsa/sign", json={"message": "dos", "nonce": "fixed", "k": k,
                                                 "private_key": a["d"]}).json()
    assert a["r"] == b["r"]
    rec = client.post("/api/lab/ecdsa/recover", json={"r": a["r"], "s1": a["s"], "z1": a["z"], "s2": b["s"],
                                                      "z2": b["z"], "pubkey": a["Q"]["compressed"]}).json()
    assert rec["d"] == a["d"] and rec["matches_pubkey"]


def test_search_transactions_and_wallet_detail(client):
    st = client.get("/api/state").json()
    assert client.get("/api/search", params={"q": "2"}).json()[0]["type"] == "block"
    assert any(r["type"] == "wallet" for r in client.get("/api/search", params={"q": "ali"}).json())
    txs = client.get("/api/transactions").json()
    assert txs[0]["block"] == st["height"]
    first = txs[0]
    hits = client.get("/api/search", params={"q": first["txid"][:10]}).json()
    assert any(h["type"] == "tx" and h["ref"] == first["txid"] for h in hits)
    detail = client.get(f"/api/transactions/{first['txid']}").json()
    assert detail["proof"]["valid"] and detail["block"] == first["block"]
    assert client.get("/api/transactions/" + "0" * 64).status_code == 404
    alice = client.get("/api/wallets/Alice").json()
    assert alice["history"] and all(alice["address"] in (t["sender_address"], t["recipient"]) for t in alice["history"])
