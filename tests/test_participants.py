"""Billeteras en dispositivos: registro firmado, cuentas, persistencia y uso."""

import json
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
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "device_wallet.json").read_text(encoding="utf-8"))


def register_body(w: Wallet, name: str) -> dict:
    sig = w.sign(Network.registration_message(name, w.pubkey_hex))
    return {"name": name, "pubkey": w.pubkey_hex, "signature": sig.to_hex()}


@pytest.fixture
def client(tmp_path):
    settings = Settings(cors_origins=[], frontend_dist=Path("/nonexistent"), admin_token=TOKEN, rate_limit=1000)
    net = Network(ScenarioParams(seed=11, difficulty=4), FileStorage(tmp_path / "red.json"))
    with TestClient(create_app(settings, net)) as c:
        c.tmp = tmp_path
        yield c


def test_register_with_browser_signature(client):
    reg = FIXTURE["registration"]
    r = client.post("/api/participants", json={"name": reg["name"], "pubkey": FIXTURE["pubkey"],
                                               "signature": reg["signature"]})
    assert r.status_code == 200, r.text
    assert r.json()["address"] == FIXTURE["address"] and r.json()["custody"] == "dispositivo"
    st = client.get("/api/state").json()
    assert [p["name"] for p in st["participants"]] == ["Sofía"]


def test_registration_requires_owner_signature(client):
    me, other = Wallet.generate("yo"), Wallet.generate("otro")
    body = register_body(other, "Impostor")
    body["pubkey"] = me.pubkey_hex                        # firma de otra clave
    assert client.post("/api/participants", json=body).status_code == 400
    body = register_body(me, "Ana")
    body["name"] = "Otro nombre"                          # firma de otro nombre
    assert client.post("/api/participants", json=body).status_code == 400


def test_names_are_unique_and_reregistering_is_idempotent(client):
    a, b = Wallet.generate("a"), Wallet.generate("b")
    assert client.post("/api/participants", json=register_body(a, "Ana")).status_code == 200
    assert client.post("/api/participants", json=register_body(b, "ana")).status_code == 400   # sin distinguir mayúsculas
    assert client.post("/api/participants", json=register_body(b, "Alice")).status_code == 400  # billetera de la demo
    assert client.post("/api/participants", json=register_body(a, "Ana")).status_code == 200    # mismo registro
    assert client.post("/api/participants", json=register_body(a, "Ana María")).json()["name"] == "Ana María"
    assert len(client.get("/api/state").json()["participants"]) == 1


def test_device_wallet_end_to_end(client):
    me = Wallet.generate("celular")
    client.post("/api/participants", json=register_body(me, "Lucía"))
    # El administrador le envía fondos por nombre y mina.
    assert client.post("/api/transactions/transfer", headers=ADMIN,
                       json={"sender": "Alice", "recipient": "Lucía", "amount": 30}).status_code == 200
    client.post("/api/mine", headers=ADMIN, json={"miner": "Minera"})
    acct = client.get(f"/api/accounts/{me.address}").json()
    assert acct["name"] == "Lucía" and acct["balance"] == 30 and acct["next_seq"] == 0
    # El dispositivo firma con su clave; el servidor solo verifica.
    bob = next(w for w in client.get("/api/state").json()["wallets"] if w["name"] == "Bob")
    tx = Transaction.create(me, bob["address"], 12, acct["next_seq"], "desde el celular")
    sent = client.post("/api/transactions", json=tx.to_dict()).json()
    assert sent["sender_name"] == "Lucía" and sent["recipient_name"] == "Bob"
    assert client.get(f"/api/accounts/{me.address}").json()["next_seq"] == 1
    detail = client.get("/api/wallets/Lucía").json()
    assert detail["signatures"] == 0 and len(detail["history"]) == 1   # la enviada aún está pendiente
    assert any(r["ref"] == "Lucía" for r in client.get("/api/search", params={"q": "luc"}).json())


def test_participants_survive_restart_and_reset(client):
    me = Wallet.generate("x")
    client.post("/api/participants", json=register_body(me, "Mateo"))
    net = Network(ScenarioParams(seed=1), FileStorage(client.tmp / "red.json"))
    assert net.restored and net.participants[me.address]["name"] == "Mateo"
    net.reset(ScenarioParams(seed=12, difficulty=4, n_blocks=1))
    assert me.address in net.participants          # el registro sobrevive a regenerar la red


def test_account_lookup_validation(client):
    assert client.get("/api/accounts/xyz").status_code == 400
    unknown = "mc" + "0" * 40
    assert client.get(f"/api/accounts/{unknown}").json()["name"] is None
