"""Etapa 4: monedas de bienvenida (faucet) y minado automático."""

import time
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from minichain.wallet import Wallet  # noqa: E402
from server.app import create_app  # noqa: E402
from server.config import Settings, lan_url  # noqa: E402
from server.network import FAUCET_WALLET, Network, ScenarioParams  # noqa: E402

TOKEN = "t0k3n"
ADMIN = {"Authorization": f"Bearer {TOKEN}"}
SETTINGS = Settings(cors_origins=[], frontend_dist=Path("/nonexistent"), admin_token=TOKEN, rate_limit=1000)


def register_body(w: Wallet, name: str) -> dict:
    sig = w.sign(Network.registration_message(name, w.pubkey_hex))
    return {"name": name, "pubkey": w.pubkey_hex, "signature": sig.to_hex()}


def make_client(**net_kwargs) -> TestClient:
    net = Network(ScenarioParams(seed=11, difficulty=4), **net_kwargs)
    return TestClient(create_app(SETTINGS, net))


@pytest.fixture
def client():
    with make_client(faucet_amount=25) as c:
        yield c


def participant(client, address):
    return next(p for p in client.get("/api/state").json()["participants"] if p["address"] == address)


def test_new_participant_gets_welcome_coins_once(client):
    w = Wallet.generate("w")
    r = client.post("/api/participants", json=register_body(w, "Lucía")).json()
    assert r["welcome"]["amount"] == 25 and r["welcome"]["memo"] == "bienvenida"
    assert r["welcomed"] is True and r["available"] == 25
    assert participant(client, w.address)["welcomed"] is True

    # Ni registrarse de nuevo ni pedirlas otra vez da más monedas.
    again = client.post("/api/participants", json=register_body(w, "Lucía")).json()
    assert again["welcome"] is None and again["welcome_error"] is None
    r = client.post("/api/faucet", json={"address": w.address})
    assert r.status_code == 400 and "ya recibió" in r.json()["detail"]
    assert client.get(f"/api/accounts/{w.address}").json()["available"] == 25


def test_welcome_is_signed_by_minera_and_chain_stays_valid(client):
    w = Wallet.generate("w")
    client.post("/api/participants", json=register_body(w, "Lucía"))
    tx = client.get("/api/state").json()["mempool"][0]
    assert tx["sender_name"] == FAUCET_WALLET
    assert client.post("/api/mine", json={"miner": FAUCET_WALLET}, headers=ADMIN).status_code == 200
    assert client.get("/api/validate").json()["ok"]
    acct = client.get(f"/api/accounts/{w.address}").json()
    assert acct["balance"] == 25
    # Ya confirmada, sigue contando como recibida.
    assert participant(client, w.address)["welcomed"] is True


def test_faucet_only_for_registered_participants(client):
    r = client.post("/api/faucet", json={"address": Wallet.generate("x").address})
    assert r.status_code == 400 and "registra" in r.json()["detail"]


def test_faucet_disabled():
    with make_client(faucet_amount=0) as c:
        w = Wallet.generate("w")
        r = c.post("/api/participants", json=register_body(w, "Ana")).json()
        assert r["welcome"] is None and r["welcomed"] is False
        assert c.post("/api/faucet", json={"address": w.address}).status_code == 400
        assert c.get("/api/state").json()["faucet"]["amount"] == 0


def test_faucet_without_funds_still_registers():
    with make_client(faucet_amount=10**9) as c:
        w = Wallet.generate("w")
        r = c.post("/api/participants", json=register_body(w, "Ana"))
        assert r.status_code == 200
        assert r.json()["welcome"] is None and "fondos" in r.json()["welcome_error"]
        assert c.get("/api/state").json()["mempool"] == []


def test_reset_allows_a_new_welcome(client):
    w = Wallet.generate("w")
    client.post("/api/participants", json=register_body(w, "Ana"))
    assert client.post("/api/reset", json={"seed": 11, "difficulty": 4}, headers=ADMIN).status_code == 200
    # El participante sigue registrado, pero la cadena nueva no tiene su bienvenida.
    assert participant(client, w.address)["welcomed"] is False
    r = client.post("/api/faucet", json={"address": w.address})
    assert r.status_code == 200 and r.json()["amount"] == 25


def test_automine_tick():
    net = Network(ScenarioParams(seed=11, difficulty=4))
    assert net.automine_tick(1000.0, 22) is None and net.next_automine_at is None   # apagado
    net.automine_interval = 10
    assert net.automine_tick(1000.0, 22) is None                                   # arma el reloj
    assert net.automine_info(now=1004.0)["next_in"] == 6.0
    assert net.automine_tick(1009.0, 22) is None                                   # aún no
    height = len(net.chain.blocks)
    assert net.automine_tick(1010.0, 22) is None                                   # mempool vacía: no mina
    assert len(net.chain.blocks) == height and net.next_automine_at == 1020.0
    net.transfer("Alice", "Carol", 3)
    reward_before = net.chain.balance(net.wallets[FAUCET_WALLET].address)
    result = net.automine_tick(1020.0, 22)
    assert result["block"]["tx_count"] == 2 and not net.node.mempool
    assert net.chain.balance(net.wallets[FAUCET_WALLET].address) == reward_before + 50


def test_automine_endpoint_requires_admin(client):
    assert client.put("/api/automine", json={"interval": 20}).status_code == 401
    r = client.put("/api/automine", json={"interval": 20}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["interval"] == 20 and 19 <= r.json()["next_in"] <= 20
    assert client.get("/api/state").json()["automine"]["interval"] == 20
    assert client.put("/api/automine", json={"interval": 99999}, headers=ADMIN).status_code == 422
    assert client.put("/api/automine", json={"interval": 0}, headers=ADMIN).json()["next_in"] is None


def test_automine_loop_mines_pending_transactions():
    with make_client(automine_interval=1) as c:
        height = c.get("/api/state").json()["height"]
        assert c.post("/api/transactions/transfer", headers=ADMIN,
                      json={"sender": "Alice", "recipient": "Carol", "amount": 2}).status_code == 200
        deadline = time.time() + 8
        while time.time() < deadline:
            st = c.get("/api/state").json()
            if st["height"] > height:
                break
            time.sleep(0.2)
        assert st["height"] == height + 1 and st["mempool"] == []


def test_links_in_state(client):
    st = client.get("/api/state").json()
    assert "public_url" in st and "lan_url" in st


def test_lan_url_only_when_listening_on_all_interfaces():
    assert lan_url(Settings(host="127.0.0.1")) is None
    assert lan_url(Settings(host="0.0.0.0", public_url="https://x.onrender.com")) is None
