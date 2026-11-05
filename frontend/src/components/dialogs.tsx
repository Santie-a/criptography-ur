// Acciones globales en diálogos modales, abiertas desde el encabezado:
// funcionan desde cualquier pantalla sin perder el contexto.
import { Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { go } from "../router";
import { useStore } from "../store";
import type { MineResult, NonceKind } from "../types";
import { QrCode, appLink, joinUrl } from "./share";
import { Button, Field, Modal, Notice } from "./ui";

export function Dialogs() {
  const { dialog, openDialog } = useStore();
  const close = () => openDialog(null);
  return (
    <>
      <TransferDialog open={dialog === "transfer"} onClose={close} />
      <MineDialog open={dialog === "mine"} onClose={close} />
      <WalletDialog open={dialog === "wallet"} onClose={close} />
      <AdminDialog open={dialog === "admin"} onClose={close} />
      <InviteDialog open={dialog === "invite"} onClose={close} />
    </>
  );
}


function TransferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, identity, run, notify } = useStore();
  const me = state?.wallets.find((w) => w.name === identity);
  const others = [...(state?.wallets ?? []), ...(state?.participants ?? [])].filter((w) => w.name !== identity);
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(10);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && !others.some((w) => w.name === to)) setTo(others[0]?.name ?? "");
  }, [open, others, to]);

  const submit = async () => {
    if (!me) return;
    setBusy(true);
    const t = await run(() => api.transfer(me.name, to, amount, memo));
    setBusy(false);
    if (t) {
      notify(`Transacción firmada y en la mempool (seq ${t.seq})`);
      setMemo("");
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} kicker={me ? `Firma: ${me.name} · disponible ${me.available}` : undefined} title="Nueva transacción"
      footer={<>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={!me || !to || amount <= 0} onClick={submit}>Firmar y enviar</Button>
      </>}>
      <div className="grid-2">
        <Field label="Destinatario">
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            {others.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="Monto">
          <input className="input num" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
      </div>
      <Field label="Memo (opcional)">
        <input className="input" maxLength={80} value={memo} onChange={(e) => setMemo(e.target.value)} />
      </Field>
      {me && (
        <p className="xs muted">
          Se firma con ECDSA usando la estrategia de nonce de {me.name} ({me.nonce_label}) y queda pendiente hasta
          que alguien mine un bloque.
        </p>
      )}
    </Modal>
  );
}

function MineDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, identity, run, notify } = useStore();
  const [extra, setExtra] = useState(0);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ r: MineResult; ms: number } | null>(null);
  useEffect(() => {
    if (open) setLast(null);
  }, [open]);
  if (!state) return null;
  const difficulty = state.difficulty + extra;

  const submit = async () => {
    setBusy(true);
    const t0 = performance.now();
    const r = await run(() => api.mine(identity, difficulty));
    setBusy(false);
    if (r) {
      setLast({ r, ms: performance.now() - t0 });
      notify(`Bloque ${r.block.index} minado (${r.attempts.toLocaleString("es")} intentos)`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} kicker={`Recompensa de 50 para ${identity}`} title="Minar bloque"
      footer={last ? <>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="primary" onClick={() => { onClose(); go("bloques", { b: last.r.block.index }); }}>Ver bloque {last.r.block.index}</Button>
      </> : <>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} onClick={submit}>Minar ({state.mempool.length} tx)</Button>
      </>}>
      <Field label={`Dificultad: ${difficulty} bits`} help={`Mínimo de la red: ${state.difficulty}. Cada bit duplica el trabajo esperado.`}>
        <input type="range" min={0} max={Math.max(0, 22 - state.difficulty)} value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
      </Field>
      <dl className="kv">
        <dt>Objetivo</dt><dd className="mono xs">hash &lt; 2<sup>{256 - difficulty}</sup></dd>
        <dt>Intentos esperados</dt><dd className="num">2<sup>{difficulty}</sup> ≈ {(2 ** difficulty).toLocaleString("es")}</dd>
        <dt>Transacciones</dt><dd className="num">{state.mempool.length} pendientes + recompensa</dd>
      </dl>
      {state.automine.interval > 0 && !last && (
        <p className="xs muted">
          El minado automático también mina la mempool cada {state.automine.interval} s, con la recompensa
          para {state.automine.miner}.
        </p>
      )}
      {last && (
        <Notice tone="ok" title={`Bloque ${last.r.block.index} agregado a la cadena`}>
          {last.r.attempts.toLocaleString("es")} intentos en {(last.ms / 1000).toFixed(2)} s · hash <code>{last.r.block.hash.slice(0, 16)}…</code>
        </Notice>
      )}
    </Modal>
  );
}

function WalletDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, notify, setIdentity } = useStore();
  const [name, setName] = useState("");
  const [nonce, setNonce] = useState<NonceKind>("rfc6979");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const w = await run(() => api.createWallet(name.trim(), nonce));
    setBusy(false);
    if (w) {
      setIdentity(w.name);
      notify(`Billetera ${w.name} creada. Ahora actúas como ${w.name}.`);
      setName("");
      onClose();
      go("billeteras", { w: w.name });
    }
  };
  return (
    <Modal open={open} onClose={onClose} kicker="Se genera un par de claves en el servidor" title="Nueva billetera"
      footer={<>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={submit}>Crear</Button>
      </>}>
      <Field label="Nombre">
        <input className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Estrategia de nonce" help="Las dos últimas son inseguras a propósito: sirven para reproducir el ataque.">
        <select className="select" value={nonce} onChange={(e) => setNonce(e.target.value as NonceKind)}>
          <option value="rfc6979">RFC 6979 (determinista)</option>
          <option value="random">Aleatorio del sistema operativo</option>
          <option value="weak">RNG defectuoso (Android 2013)</option>
          <option value="constant">k constante (PS3 2010)</option>
        </select>
      </Field>
      <p className="xs muted">Empieza con saldo 0. Mina un bloque para cobrar la recompensa.</p>
    </Modal>
  );
}

function AdminDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAdmin, login, logout } = useStore();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setToken("");
  }, [open]);

  if (isAdmin) {
    return (
      <Modal open={open} onClose={onClose} kicker="Sesión activa en este navegador" title="Administrador"
        footer={<>
          <Button onClick={onClose}>Cerrar</Button>
          <Button variant="danger" onClick={logout}>Cerrar sesión</Button>
        </>}>
        <p className="small">
          Puedes regenerar la red, firmar con las billeteras de la simulación (Alice, Bob, Carol…), minar,
          manipular copias de la cadena y ejecutar la explotación.
        </p>
        <p className="xs muted">El token queda guardado en este navegador hasta que cierres la sesión.</p>
      </Modal>
    );
  }

  const submit = async () => {
    setBusy(true);
    const ok = await login(token.trim());
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} kicker="Control de la simulación" title="Ingresar como administrador"
      footer={<>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={busy} disabled={!token.trim()} onClick={submit}>Ingresar</Button>
      </>}>
      <Field label="Token de administrador" help="Es el valor de MINICHAIN_ADMIN_TOKEN configurado en el servidor.">
        <input className="input mono" type="password" autoComplete="current-password" value={token}
          onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" && token.trim() && submit()} />
      </Field>
      <p className="xs muted">
        Sin token puedes explorar toda la red y usar los laboratorios. Las transacciones propias no necesitan token:
        la firma de tu billetera es la autorización.
      </p>
    </Modal>
  );
}

/** Código QR para que otros abran la aplicación en su celular. Pensado para proyectarlo. */
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, notify } = useStore();
  const link = appLink(state);
  const url = joinUrl(link);
  const welcome = state?.faucet.amount ?? 0;
  return (
    <Modal open={open} onClose={onClose} kicker="Apunta la cámara del celular al código" title="Unirse a la red"
      footer={<>
        <Button onClick={onClose}>Cerrar</Button>
        <Button icon={<Copy size={14} />} onClick={() => {
          navigator.clipboard?.writeText(url).then(() => notify("Enlace copiado"));
        }}>Copiar enlace</Button>
      </>}>
      <div className="invite">
        {open && <QrCode value={url} size={280} label={`Código QR de ${url}`} />}
        <code className="mono small invite-url">{url}</code>
      </div>
      {link.source === "local" ? (
        <Notice tone="warn" title="Este enlace solo funciona en este computador">
          La página está abierta en <code>localhost</code>. Para que entren otros dispositivos, arranca el servidor con{" "}
          <code>MINICHAIN_HOST=0.0.0.0</code> y abre la página con la IP del computador, o define{" "}
          <code>MINICHAIN_PUBLIC_URL</code>.
        </Notice>
      ) : link.source === "lan" ? (
        <p className="xs muted">Dirección de la red local detectada por el servidor: los celulares deben estar en la misma Wi-Fi.</p>
      ) : null}
      <p className="xs muted">
        Cada persona crea su billetera en su propio dispositivo
        {welcome > 0 ? ` y recibe ${welcome} monedas de bienvenida de ${state?.faucet.wallet}` : ""}.
      </p>
    </Modal>
  );
}
