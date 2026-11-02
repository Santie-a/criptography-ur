"""API HTTP (REST) + WebSocket de minichain.

Documentación interactiva generada automáticamente en /api/docs.
"""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import labs
from .config import Settings, settings as default_settings
from .events import EventBus
from .network import BadRequest, Network, NotFound, ScenarioParams, TAMPER_ACTIONS

NonceKind = Literal["rfc6979", "random", "weak", "constant"]


# ------------------------------------------------------------------ modelos

class ResetRequest(BaseModel):
    seed: int = 2026
    difficulty: int = Field(14, ge=0, le=20)
    victim_nonce: NonceKind = "weak"
    entropy_bits: int = Field(3, ge=1, le=16)
    n_blocks: int = Field(5, ge=1, le=12)
    tx_per_block: int = Field(4, ge=1, le=8)


class WalletRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=24)
    nonce: NonceKind = "rfc6979"
    entropy_bits: int = Field(3, ge=1, le=16)


class NonceRequest(BaseModel):
    nonce: NonceKind
    entropy_bits: int = Field(3, ge=1, le=16)


class TransferRequest(BaseModel):
    sender: str = Field(..., description="nombre de la billetera que firma")
    recipient: str = Field(..., description="nombre de billetera o dirección mc…")
    amount: int = Field(..., gt=0)
    memo: str = Field("", max_length=80)


class RawTransaction(BaseModel):
    sender: str = Field(..., description="clave pública comprimida (hex, 33 bytes)")
    recipient: str
    amount: int
    seq: int
    memo: str = ""
    signature: str = Field(..., description="r || s en hex (64 bytes)")


class MineRequest(BaseModel):
    miner: str = Field(..., description="nombre de billetera o dirección que cobra la recompensa")
    difficulty: int | None = Field(None, ge=0, description="opcional; nunca menor que la de la red")


class TamperRequest(BaseModel):
    block: int
    tx: int
    action: Literal["amount", "recipient", "swap_signature", "remine", "lower_difficulty", "break_link"]


class StealRequest(BaseModel):
    victim: str
    thief: str = "Mallory"
    miner: str | None = None


class DefenseRequest(BaseModel):
    seed: int = 2026
    entropy_bits: int = Field(3, ge=1, le=16)


class CurveRequest(BaseModel):
    p: int = 97
    a: int = 2
    b: int = 3


class CurveAddRequest(CurveRequest):
    P: list[int] | None = Field(None, min_length=2, max_length=2)
    Q: list[int] | None = Field(None, min_length=2, max_length=2)


class CurveMulRequest(CurveRequest):
    P: list[int] = Field(..., min_length=2, max_length=2)
    k: int


class SignRequest(BaseModel):
    message: str = Field(..., max_length=2000)
    private_key: str | None = Field(None, description="hex; vacío = generar una nueva")
    nonce: Literal["random", "rfc6979", "fixed"] = "rfc6979"
    k: str | None = Field(None, description="hex, solo con nonce='fixed'")


class RecoverRequest(BaseModel):
    r: str
    s1: str
    z1: str
    s2: str
    z2: str
    pubkey: str | None = None


class VerifyRequest(BaseModel):
    message: str = Field(..., max_length=2000)
    pubkey: str
    r: str
    s: str


# ------------------------------------------------------------------ app

def create_app(settings: Settings = default_settings, network: Network | None = None) -> FastAPI:
    app = FastAPI(title="minichain API", version="1.0.0",
                  description="Mini-blockchain con ECDSA sobre secp256k1 y el ataque por nonce repetido.",
                  docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                           allow_methods=["*"], allow_headers=["*"])

    net = network or Network(ScenarioParams(seed=settings.seed, difficulty=settings.difficulty))
    bus = EventBus()
    app.state.network = net
    app.state.bus = bus

    @app.exception_handler(BadRequest)
    async def _bad_request(_: Request, exc: BadRequest):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.exception_handler(NotFound)
    async def _not_found(_: Request, exc: NotFound):
        return JSONResponse({"detail": str(exc)}, status_code=404)

    async def changed(kind: str, **extra) -> None:
        await bus.publish({"type": kind, "version": net.version, **extra})

    # ---------------------------------------------------------- red

    @app.get("/api/health", tags=["red"])
    async def health():
        return {"ok": True, "version": net.version, "clients": bus.clients}

    @app.get("/api/state", tags=["red"], summary="Billeteras, mempool y resumen de bloques")
    async def state():
        return await run_in_threadpool(net.state, bus.clients)

    @app.post("/api/reset", tags=["red"], summary="Regenerar el escenario simulado")
    async def reset(req: ResetRequest):
        await run_in_threadpool(net.reset, ScenarioParams(**req.model_dump()))
        await changed("reset")
        return await run_in_threadpool(net.state, bus.clients)

    @app.get("/api/blocks/{index}", tags=["cadena"])
    async def block(index: int):
        return await run_in_threadpool(net.block, index)

    @app.get("/api/blocks/{index}/proof/{tx}", tags=["cadena"], summary="Prueba de inclusión Merkle")
    async def proof(index: int, tx: int):
        return await run_in_threadpool(net.proof, index, tx)

    @app.get("/api/chain/export", tags=["cadena"], summary="Cadena completa en JSON")
    async def export_chain():
        return await run_in_threadpool(net.export_chain)

    @app.post("/api/wallets", tags=["billeteras"], summary="Crear una billetera (cada cliente puede tener la suya)")
    async def create_wallet(req: WalletRequest):
        w = await run_in_threadpool(net.create_wallet, req.name, req.nonce, req.entropy_bits)
        await changed("wallet", name=w["name"])
        return w

    @app.put("/api/wallets/{name}/nonce", tags=["billeteras"], summary="Cambiar la estrategia de nonce")
    async def set_nonce(name: str, req: NonceRequest):
        w = await run_in_threadpool(net.set_nonce, name, req.nonce, req.entropy_bits)
        await changed("wallet", name=name)
        return w

    @app.post("/api/transactions/transfer", tags=["transacciones"],
              summary="El servidor firma con la billetera indicada y encola la tx")
    async def transfer(req: TransferRequest):
        tx = await run_in_threadpool(net.transfer, req.sender, req.recipient, req.amount, req.memo)
        await changed("mempool", txid=tx["txid"])
        return tx

    @app.post("/api/transactions", tags=["transacciones"],
              summary="Encolar una tx ya firmada por el cliente (clave propia)")
    async def submit(req: RawTransaction):
        tx = await run_in_threadpool(net.submit_raw, req.model_dump())
        await changed("mempool", txid=tx["txid"])
        return tx

    @app.post("/api/mine", tags=["cadena"], summary="Minar un bloque con la mempool")
    async def mine_block(req: MineRequest):
        result = await run_in_threadpool(net.mine, req.miner, req.difficulty, settings.max_difficulty)
        await changed("block", index=result["block"]["index"])
        return result

    # ---------------------------------------------------------- validación

    @app.get("/api/validate", tags=["validador"])
    async def validate():
        return await run_in_threadpool(net.validate)

    @app.get("/api/tamper/actions", tags=["validador"])
    async def tamper_actions():
        return TAMPER_ACTIONS

    @app.post("/api/tamper", tags=["validador"],
              summary="Manipular una copia de la cadena y validarla (no altera la red)")
    async def tamper(req: TamperRequest):
        return await run_in_threadpool(net.tamper, req.block, req.tx, req.action)

    @app.post("/api/validate/external", tags=["validador"], summary="Validar una cadena en JSON")
    async def validate_external(data: dict):
        return await run_in_threadpool(net.validate_external, data)

    # ---------------------------------------------------------- ataque y defensa

    @app.get("/api/attack/scan", tags=["ataque"], summary="Buscar r repetidos y recuperar claves")
    async def attack_scan():
        return await run_in_threadpool(net.attack_scan)

    @app.post("/api/attack/steal", tags=["ataque"], summary="Firmar como la víctima y minar")
    async def steal(req: StealRequest):
        result = await run_in_threadpool(net.steal, req.victim, req.thief, req.miner,
                                         settings.max_difficulty)
        await changed("block", index=result["mined"]["block"]["index"])
        return result

    @app.post("/api/defense/compare", tags=["defensa"],
              summary="Misma simulación con RNG defectuoso y con RFC 6979")
    async def defense(req: DefenseRequest):
        return await run_in_threadpool(Network.compare_defense, req.seed, req.entropy_bits)

    # ---------------------------------------------------------- laboratorios

    @app.get("/api/lab/curve", tags=["laboratorio"], summary="Puntos de una curva pequeña")
    async def lab_curve(p: int = 97, a: int = 2, b: int = 3):
        return await run_in_threadpool(labs.curve_points, p, a, b)

    @app.post("/api/lab/curve/add", tags=["laboratorio"])
    async def lab_add(req: CurveAddRequest):
        return labs.curve_add(req.p, req.a, req.b, req.P, req.Q)

    @app.post("/api/lab/curve/mul", tags=["laboratorio"], summary="k·P con traza de double-and-add")
    async def lab_mul(req: CurveMulRequest):
        return await run_in_threadpool(labs.curve_mul, req.p, req.a, req.b, req.P, req.k)

    @app.get("/api/lab/secp256k1", tags=["laboratorio"])
    async def lab_secp():
        return labs.secp256k1_info()

    @app.post("/api/lab/ecdsa/sign", tags=["laboratorio"], summary="Firma ECDSA con todos los pasos")
    async def lab_sign(req: SignRequest):
        return await run_in_threadpool(labs.ecdsa_sign, req.message, req.private_key, req.nonce, req.k)

    @app.post("/api/lab/ecdsa/verify", tags=["laboratorio"])
    async def lab_verify(req: VerifyRequest):
        return await run_in_threadpool(labs.ecdsa_verify, req.message, req.pubkey, req.r, req.s)

    @app.post("/api/lab/ecdsa/recover", tags=["laboratorio"],
              summary="Recuperar k y d de dos firmas con el mismo r")
    async def lab_recover(req: RecoverRequest):
        return await run_in_threadpool(labs.ecdsa_recover, req.r, req.s1, req.z1, req.s2, req.z2, req.pubkey)

    # ---------------------------------------------------------- tiempo real

    @app.websocket("/api/events")
    async def events(ws: WebSocket):
        await bus.connect(ws)
        try:
            await ws.send_json({"type": "hello", "version": net.version, "clients": bus.clients})
            while True:
                await ws.receive_text()  # mantiene viva la conexión; ignoramos lo recibido
        except WebSocketDisconnect:
            pass
        finally:
            await bus.disconnect(ws)

    # ---------------------------------------------------------- UI compilada

    if settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="ui")
    else:
        @app.get("/", include_in_schema=False)
        async def root():
            return {"mensaje": "API de minichain funcionando. La UI no está compilada: "
                               "ejecuta `npm run build` en frontend/ o usa `npm run dev`.",
                    "docs": "/api/docs"}

    return app


app = create_app()
