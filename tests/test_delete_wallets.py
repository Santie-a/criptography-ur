"""Eliminar billeteras de prueba y bloquear sus claves."""

from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from minichain.block import Transaction  # noqa: E402
from minichain.wallet import Wallet  # noqa: E402
from server.app import create_app  # noqa: E402
from server.config import Settings  # noqa: E402
from server.network import Network, ScenarioParams  # noqa: E402
from server.storage import FileStorage  # noqa: E402

TOKEN = "t0k3n"
ADMIN = {"Authorization": f"Bearer {TOKEN}"}
SETTINGS = Settings(cors_origins=[], frontend_dist=Path("/nonexistent"), admin_token=TOKEN, rate_limit=1000)


def register_body(w: Wallet, name: str) -> dict:
    sig = w.sign(Network.registration_message(name, w.pubkey_hex))
    return {"name": name, "pubkey": w.pubkey_hex, "signature": sig.to_hex()}


def signed_tx(w: Wallet, to: str, amount: int, seq: int) -> dict:
    return Transaction.create(w, to, amount, seq).to_dict()


@pytest.fixture
def client(tmp_path):
    net = Network(ScenarioParams(seed=11, difficulty=4), FileStorage(tmp_path / "red.json"), faucet_amount=25)
    with TestClient(create_app(SETTINGS, net)) as c:
        c.tmp = tmp_path
        yield c


def names(client):
    st = client.get("/api/state").json()
    return [w["name"] for w in st["wallets"]], [p["name"] for p in st["participants"]]


def test_delete_participant_blocks_its_key(client):
    w = Wallet.generate("w")
    client.post("/api/participants", json=register_body(w, "Prueba"))
    assert client.delete(f"/api/participants/{w.address}").status_code == 401          # solo el admin
    r = client.delete(f"/api/participants/{w.address}", headers=ADMIN)
    assert r.status_code == 200 and r.json()["banned"] is True
    assert "Prueba" not in names(client)[1]

    # No puede volver a registrarse, ni con otro nombre, ni enviar transacciones.
    r = client.post("/api/participants", json=register_body(w, "Prueba"))
    assert r.status_code == 400 and "bloqueada" in r.json()["detail"]
    assert client.post("/api/participants", json=register_body(w, "Otro")).status_code == 400
    r = client.post("/api/transactions", json=signed_tx(w, "mc" + "0" * 40, 1, 0))
    assert r.status_code == 400 and "bloqueada" in r.json()["detail"]
    banned = client.get("/api/state").json()["banned"]
    assert [b["name"] for b in banned] == ["Prueba"] and banned[0]["address"] == w.address


def test_delete_drops_pending_but_keeps_mined_history(client):
    w = Wallet.generate("w")
    client.post("/api/participants", json=register_body(w, "Prueba"))      # recibe 25 (pendiente)
    client.post("/api/mine", json={"miner": "Minera"}, headers=ADMIN)          # ya confirmadas
    assert client.post("/api/transactions", json=signed_tx(w, "mc" + "1" * 40, 5, 0)).status_code == 200
    r = client.delete(f"/api/participants/{w.address}", headers=ADMIN).json()
    assert r["dropped_pending"] == 1
    st = client.get("/api/state").json()
    assert st["mempool"] == []
    # La bienvenida ya minada sigue en la cadena y la cadena sigue siendo válida.
    assert client.get(f"/api/accounts/{w.address}").json()["balance"] == 25
    assert client.get("/api/validate").json()["ok"]


def test_delete_admin_wallet_but_not_scenario_wallets(client):
    assert client.post("/api/wallets", json={"name": "Temporal"}, headers=ADMIN).status_code == 200
    assert client.delete("/api/wallets/Temporal", headers=ADMIN).status_code == 200
    assert "Temporal" not in names(client)[0]
    for name in ("Alice", "Bob", "Minera", "Mallory"):
        r = client.delete(f"/api/wallets/{name}", headers=ADMIN)
        assert r.status_code == 400 and "escenario" in r.json()["detail"]
    st = client.get("/api/state").json()
    assert all(w["deletable"] is False for w in st["wallets"])
    assert client.delete("/api/wallets/NoExiste", headers=ADMIN).status_code == 404


def test_reset_can_clear_participants(client):
    a, b = Wallet.generate("a"), Wallet.generate("b")
    client.post("/api/participants", json=register_body(a, "Ana"))
    client.post("/api/reset", json={"seed": 11, "difficulty": 4}, headers=ADMIN)
    assert names(client)[1] == ["Ana"]                                         # por defecto se conservan
    client.post("/api/participants", json=register_body(b, "Beto"))
    client.post("/api/reset", json={"seed": 11, "difficulty": 4, "clear_participants": True}, headers=ADMIN)
    assert names(client)[1] == []
    assert client.post("/api/participants", json=register_body(a, "Ana")).status_code == 400
    assert {x["name"] for x in client.get("/api/state").json()["banned"]} == {"Ana", "Beto"}


def test_unban(client):
    a, b = Wallet.generate("a"), Wallet.generate("b")
    for w, n in ((a, "Ana"), (b, "Beto")):
        client.post("/api/participants", json=register_body(w, n))
        client.delete(f"/api/participants/{w.address}", headers=ADMIN)
    assert client.delete(f"/api/banned/{a.pubkey_hex}").status_code == 401
    assert client.delete(f"/api/banned/{a.pubkey_hex}", headers=ADMIN).json() == {"unbanned": 1}
    assert client.post("/api/participants", json=register_body(a, "Ana")).status_code == 200
    assert client.delete(f"/api/banned/{a.pubkey_hex}", headers=ADMIN).status_code == 404
    assert client.delete("/api/banned", headers=ADMIN).json() == {"unbanned": 1}
    assert client.get("/api/state").json()["banned"] == []


def test_bans_survive_restart(client):
    w = Wallet.generate("w")
    client.post("/api/participants", json=register_body(w, "Prueba"))
    client.delete(f"/api/participants/{w.address}", headers=ADMIN)
    net = Network(ScenarioParams(seed=1), FileStorage(client.tmp / "red.json"))
    assert w.pubkey_hex in net.banned and not net.participants
