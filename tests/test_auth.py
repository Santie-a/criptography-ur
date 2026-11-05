"""Roles: token de administrador, rutas públicas y límite de peticiones."""

from pathlib import Path

import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from minichain.block import Transaction  # noqa: E402
from minichain.wallet import Wallet  # noqa: E402
from server.app import create_app  # noqa: E402
from server.config import Settings  # noqa: E402
from server.network import Network, ScenarioParams  # noqa: E402

TOKEN = "token-de-prueba-123"
ADMIN = {"Authorization": f"Bearer {TOKEN}"}


def make_client(token=TOKEN, rate_limit=1000):
    settings = Settings(cors_origins=[], frontend_dist=Path("/nonexistent"),
                        admin_token=token, rate_limit=rate_limit)
    return TestClient(create_app(settings, Network(ScenarioParams(seed=11, difficulty=4))))


ADMIN_ROUTES = [
    ("post", "/api/reset", {"seed": 11, "difficulty": 4}),
    ("post", "/api/wallets", {"name": "Zoe"}),
    ("put", "/api/wallets/Bob/nonce", {"nonce": "rfc6979"}),
    ("post", "/api/transactions/transfer", {"sender": "Alice", "recipient": "Bob", "amount": 1}),
    ("post", "/api/mine", {"miner": "Alice"}),
    ("post", "/api/tamper", {"block": 1, "tx": 1, "action": "amount"}),
    ("post", "/api/validate/external", {"difficulty": 4, "blocks": []}),
    ("post", "/api/attack/steal", {"victim": "Bob"}),
    ("post", "/api/defense/compare", {"seed": 11}),
    ("get", "/api/admin/check", None),
]


@pytest.mark.parametrize("method,path,body", ADMIN_ROUTES)
def test_admin_routes_reject_without_token(method, path, body):
    with make_client() as c:
        kwargs = {} if body is None else {"json": body}
        r = getattr(c, method)(path, **kwargs)
        assert r.status_code == 401
        r = getattr(c, method)(path, headers={"Authorization": "Bearer incorrecto"}, **kwargs)
        assert r.status_code == 401


def test_admin_token_grants_access_and_state_reports_role():
    with make_client() as c:
        assert c.get("/api/state").json()["auth"] == {"required": True, "admin": False, "locked": False}
        assert c.get("/api/state", headers=ADMIN).json()["auth"] == {"required": True, "admin": True, "locked": False}
        assert c.get("/api/admin/check", headers=ADMIN).json() == {"ok": True}
        assert c.post("/api/transactions/transfer", headers=ADMIN,
                      json={"sender": "Alice", "recipient": "Bob", "amount": 1}).status_code == 200
        assert c.post("/api/mine", headers=ADMIN, json={"miner": "Alice"}).status_code == 200


def test_public_can_read_and_submit_own_signed_transactions():
    with make_client() as c:
        for path in ["/api/state", "/api/blocks/1", "/api/transactions", "/api/validate",
                     "/api/attack/scan", "/api/search?q=bob", "/api/lab/curve"]:
            assert c.get(path).status_code == 200, path
        assert c.post("/api/lab/ecdsa/sign", json={"message": "hola"}).status_code == 200
        # Una billetera propia: el servidor nunca ve su clave privada.
        me = Wallet.generate("yo")
        c.post("/api/mine", headers=ADMIN, json={"miner": me.address})
        alice = next(w for w in c.get("/api/state").json()["wallets"] if w["name"] == "Alice")
        tx = Transaction.create(me, alice["address"], 5, 0)
        assert c.post("/api/transactions", json=tx.to_dict()).status_code == 200
        # Sin la clave de Alice no se puede gastar su dinero.
        forged = Transaction.create(me, me.address, 5, 0)
        forged.sender = alice["pubkey"]
        r = c.post("/api/transactions", json=forged.to_dict())
        assert r.status_code == 400 and "firma" in r.json()["detail"]


def test_rate_limit_applies_to_public_writes_but_not_admin():
    with make_client(rate_limit=3) as c:
        codes = [c.post("/api/lab/ecdsa/sign", json={"message": "x"}).status_code for _ in range(5)]
        assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
        assert c.post("/api/lab/ecdsa/sign", json={"message": "x"}, headers=ADMIN).status_code == 200
        assert c.get("/api/state").status_code == 200   # las lecturas no tienen límite


def test_open_mode_without_token():
    with make_client(token=None, rate_limit=1) as c:
        assert c.get("/api/state").json()["auth"] == {"required": False, "admin": True, "locked": False}
        assert c.post("/api/mine", json={"miner": "Alice"}).status_code == 200
        assert all(c.post("/api/lab/ecdsa/sign", json={"message": "x"}).status_code == 200 for _ in range(3))


def test_production_without_token_is_locked_not_open():
    settings = Settings(cors_origins=[], frontend_dist=Path("/nonexistent"), admin_token=None, production=True)
    c = TestClient(create_app(settings, Network(ScenarioParams(seed=11, difficulty=4))))
    auth = c.get("/api/health").json()["auth"]
    assert auth == {"required": True, "admin": False, "locked": True}
    r = c.post("/api/mine", json={"miner": "Alice"})
    assert r.status_code == 401 and "no tiene MINICHAIN_ADMIN_TOKEN" in r.json()["detail"]
    assert c.post("/api/mine", json={"miner": "Alice"},
                  headers={"Authorization": "Bearer cualquier-cosa"}).status_code == 401
    # Leer sigue siendo público.
    assert c.get("/api/state").status_code == 200
