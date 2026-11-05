// Mi billetera: la billetera de este dispositivo (celular o PC).
//
// Todo lo que requiere la clave privada (crear la billetera, registrar el
// nombre y firmar transacciones) ocurre aquí, en el navegador. Al servidor solo
// le llegan la clave pública, el nombre y las firmas.
import { ArrowDownLeft, ArrowUpRight, Copy, KeyRound, PenLine, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { AsyncButton, Button, Empty, Field, Hex, Notice, PageHeader, Panel, Tag, fmtTime } from "../components/ui";
import { href, go } from "../router";
import { useStore } from "../store";
import type { Tx, TxRow } from "../types";
import { generatePrivateKey, isValidPrivateKey, registrationMessage, signMessage, signTransaction } from "../wallet/crypto";
import type { SignedMessage } from "../wallet/crypto";
import { makeDeviceWallet, useDeviceWallet, type DeviceWallet } from "../wallet/device";

async function register(w: DeviceWallet) {
  const sig = signMessage(w.privateKey, registrationMessage(w.name, w.pubkey));
  return api.registerParticipant(w.name, w.pubkey, sig.signature);
}

export function MyWallet() {
  const [wallet, save, forget] = useDeviceWallet();
  return (
    <>
      <PageHeader crumbs={[{ label: "Tú" }, { label: "Mi billetera" }]} title="Mi billetera"
        sub="La clave privada se genera y se guarda solo en este dispositivo. El servidor nunca la recibe." />
      <div className="page-body wallet-page">
        {wallet ? <WalletView wallet={wallet} onForget={forget} /> : <Onboarding onCreated={save} />}
      </div>
    </>
  );
}

function Onboarding({ onCreated }: { onCreated: (w: DeviceWallet) => boolean }) {
  const { run, notify } = useStore();
  const [name, setName] = useState("");
  const [restoreKey, setRestoreKey] = useState("");
  const [restoreName, setRestoreName] = useState("");

  const create = async (nm: string, priv: string) => {
    const w = makeDeviceWallet(nm.trim(), priv);
    const ok = await run(() => register(w));
    if (!ok) return;
    if (!onCreated(w)) {
      notify("Este navegador no permite guardar datos (¿modo privado?). La billetera no se pudo guardar.", "bad");
      return;
    }
    notify(`Billetera de ${w.name} creada en este dispositivo`);
  };

  return (
    <div className="wallet-grid">
      <Panel title={<><Smartphone size={15} /> Crear tu billetera</>}>
        <div className="stack">
          <Field label="Tu nombre en la red" help="Lo verán los demás participantes en lugar de tu dirección.">
            <input className="input" maxLength={24} value={name} autoComplete="nickname"
              onChange={(e) => setName(e.target.value)} placeholder="Por ejemplo, Sofía" />
          </Field>
          <AsyncButton variant="primary" icon={<KeyRound size={14} />} disabled={!name.trim()}
            onRun={() => create(name, generatePrivateKey())}>Crear billetera</AsyncButton>
          <ul className="small muted bullet">
            <li>Se genera un par de claves ECDSA (secp256k1) en este navegador.</li>
            <li>El servidor recibe tu nombre y tu clave pública, firmados con tu clave para probar que son tuyos.</li>
            <li>Si borras los datos del navegador, pierdes la billetera. Puedes exportar la clave para respaldarla.</li>
          </ul>
        </div>
      </Panel>
      <Panel title="Restaurar una billetera">
        <div className="stack">
          <Field label="Clave privada (64 dígitos hexadecimales)">
            <input className="input mono" value={restoreKey} onChange={(e) => setRestoreKey(e.target.value.trim())}
              autoComplete="off" spellCheck={false} />
          </Field>
          <Field label="Nombre">
            <input className="input" maxLength={24} value={restoreName} onChange={(e) => setRestoreName(e.target.value)} />
          </Field>
          <AsyncButton disabled={!isValidPrivateKey(restoreKey) || !restoreName.trim()}
            onRun={() => create(restoreName, restoreKey.toLowerCase())}>Restaurar</AsyncButton>
          {restoreKey && !isValidPrivateKey(restoreKey) && <span className="xs bad-text">No es una clave privada válida.</span>}
        </div>
      </Panel>
    </div>
  );
}

function WalletView({ wallet, onForget }: { wallet: DeviceWallet; onForget: () => void }) {
  const { state, notify } = useStore();
  const me = state?.participants.find((p) => p.address === wallet.address);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const tried = useRef(false);

  // Si el servidor no conoce esta billetera (red regenerada, servidor sin
  // persistencia...), se vuelve a registrar sola: la clave está aquí.
  useEffect(() => {
    if (!state || me || tried.current) return;
    tried.current = true;
    register(wallet).catch((e) => setRegisterError(e instanceof Error ? e.message : String(e)));
  }, [state, me, wallet]);

  return (
    <div className="wallet-grid">
      <div className="stack-lg">
        {registerError && (
          <Notice tone="bad" title="El servidor no aceptó el registro de esta billetera">{registerError}</Notice>
        )}
        <Panel>
          <div className="balance">
            <div className="row-nowrap">
              <span className="avatar lg">{wallet.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <div className="balance-name">{wallet.name}</div>
                <div className="xs muted">Billetera en este dispositivo</div>
              </div>
            </div>
            <div className="balance-amount num">{me?.available ?? "—"}</div>
            <div className="small muted">
              disponibles{me && me.balance !== me.available && ` · ${me.balance} confirmados`}
            </div>
          </div>
        </Panel>
        <SendForm wallet={wallet} available={me?.available ?? 0} />
      </div>
      <div className="stack-lg">
        <Panel title="Recibir">
          <div className="stack">
            <span className="small muted">Comparte tu nombre o esta dirección para que te envíen monedas.</span>
            <div className="address-box">
              <code className="mono">{wallet.address}</code>
              <Button size="sm" icon={<Copy size={12} />} onClick={() => {
                navigator.clipboard?.writeText(wallet.address).then(() => notify("Dirección copiada"));
              }}>Copiar</Button>
            </div>
            <a className="xs" href={href("billeteras", { w: wallet.name })}>Ver en el explorador</a>
          </div>
        </Panel>
        <History address={wallet.address} />
        <Security wallet={wallet} onForget={onForget} />
      </div>
    </div>
  );
}

function SendForm({ wallet, available }: { wallet: DeviceWallet; available: number }) {
  const { state, run, notify } = useStore();
  const [to, setTo] = useState("");
  const [custom, setCustom] = useState("");
  const [amount, setAmount] = useState(5);
  const [memo, setMemo] = useState("");
  const [last, setLast] = useState<{ tx: Tx; signed: SignedMessage } | null>(null);

  const recipients = useMemo(() => {
    const list = [
      ...(state?.participants ?? []).map((p) => ({ name: p.name, address: p.address, kind: "dispositivo" })),
      ...(state?.wallets ?? []).map((w) => ({ name: w.name, address: w.address, kind: "simulación" })),
    ];
    return list.filter((r) => r.address !== wallet.address);
  }, [state, wallet.address]);

  const recipient = to === "__custom" ? custom.trim() : (recipients.find((r) => r.name === to)?.address ?? "");
  const validRecipient = /^mc[0-9a-f]{40}$/.test(recipient) && recipient !== wallet.address;
  const tooMuch = amount > available;

  const send = async () => {
    // El seq se pide justo antes de firmar: cuenta también las transacciones pendientes.
    const acct = await run(() => api.account(wallet.address));
    if (!acct) return;
    const { tx, signed } = signTransaction(wallet.privateKey, { recipient, amount, seq: acct.next_seq, memo: memo.trim() });
    const sent = await run(() => api.submitTransaction(tx));
    if (!sent) return;
    setLast({ tx: sent, signed });
    setMemo("");
    notify("Transacción firmada en este dispositivo y enviada");
  };

  return (
    <Panel title={<><ArrowUpRight size={15} /> Enviar</>}>
      <div className="stack">
        <Field label="Para">
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Elegir destinatario…</option>
            {recipients.map((r) => <option key={r.address} value={r.name}>{r.name} · {r.kind}</option>)}
            <option value="__custom">Otra dirección…</option>
          </select>
        </Field>
        {to === "__custom" && (
          <Field label="Dirección">
            <input className="input mono" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="mc…" spellCheck={false} />
          </Field>
        )}
        <div className="grid-2">
          <Field label="Monto">
            <input className="input num" type="number" min={1} inputMode="numeric" value={amount}
              onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))} />
          </Field>
          <Field label="Memo (opcional)">
            <input className="input" maxLength={80} value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
        </div>
        {tooMuch && <span className="xs bad-text">Solo tienes {available} disponibles.</span>}
        <AsyncButton variant="primary" icon={<PenLine size={14} />} disabled={!validRecipient || amount <= 0 || tooMuch}
          onRun={send}>Firmar en este dispositivo y enviar</AsyncButton>
        {last && (
          <div className="stack-sm">
            <Notice tone="ok" title="Enviada a la red">
              Queda pendiente hasta que se mine un bloque. <a href={href("transacciones", { tx: last.tx.txid })}>Ver transacción</a>
            </Notice>
            <details className="signed-details">
              <summary className="small">Qué firmó este dispositivo</summary>
              <dl className="kv">
                <dt>Mensaje</dt><dd><code className="hex full">{last.signed.message}</code></dd>
                <dt>z = SHA-256</dt><dd><Hex value={last.signed.z} n={10} /></dd>
                <dt>r</dt><dd><Hex value={last.signed.r} n={10} /></dd>
                <dt>s</dt><dd><Hex value={last.signed.s} n={10} /></dd>
                <dt>Nonce k</dt><dd className="small">RFC 6979: depende de tu clave y del mensaje, no se puede repetir.</dd>
              </dl>
            </details>
          </div>
        )}
      </div>
    </Panel>
  );
}

function History({ address }: { address: string }) {
  const { state } = useStore();
  const [rows, setRows] = useState<TxRow[]>([]);
  useEffect(() => {
    api.transactions(address).then(setRows).catch(() => setRows([]));
  }, [address, state?.version]);
  const pending = (state?.mempool ?? []).filter((t) => t.sender_address === address || t.recipient === address);
  const all = [...pending.map((t) => ({ ...t, block: null, position: null, timestamp: null })), ...rows];
  return (
    <Panel title="Movimientos" meta={all.length ? ` · ${all.length}` : ""} flush>
      {all.length === 0 ? <Empty>Aún no tienes movimientos. Pide que te envíen monedas.</Empty> : (
        <table className="table">
          <tbody>
            {all.slice(0, 40).map((t) => {
              const out = t.sender_address === address;
              const other = out ? t.recipient_name ?? "dirección externa" : t.coinbase ? "recompensa" : t.sender_name ?? "dirección externa";
              return (
                <tr key={t.txid} className="clickable" onClick={() => go("transacciones", { tx: t.txid })}>
                  <td style={{ width: 28 }}>{out ? <ArrowUpRight size={14} className="bad-text" /> : <ArrowDownLeft size={14} className="ok-text" />}</td>
                  <td className="truncate" style={{ maxWidth: 180 }}>{other}{t.memo && <span className="faint"> · {t.memo}</span>}</td>
                  <td>{t.block === null ? <Tag>pendiente</Tag> : <span className="xs faint">{t.timestamp ? fmtTime(t.timestamp) : ""}</span>}</td>
                  <td className={`right num ${out ? "bad-text" : "ok-text"}`}>{out ? "−" : "+"}{t.amount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function Security({ wallet, onForget }: { wallet: DeviceWallet; onForget: () => void }) {
  const { notify } = useStore();
  const [reveal, setReveal] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  return (
    <Panel title={<><ShieldCheck size={15} /> Seguridad</>}>
      <div className="stack">
        <dl className="kv">
          <dt>Clave pública</dt><dd><Hex value={wallet.pubkey} n={10} /></dd>
          <dt>Nonces</dt><dd className="small">RFC 6979 (deterministas)</dd>
          <dt>Creada</dt><dd className="small">{new Date(wallet.createdAt).toLocaleString("es-CO")}</dd>
        </dl>
        {reveal ? (
          <Notice tone="warn" title="Tu clave privada"
            actions={<Button size="sm" icon={<Copy size={12} />} onClick={() => {
              navigator.clipboard?.writeText(wallet.privateKey).then(() => notify("Clave copiada"));
            }}>Copiar</Button>}>
            <code className="mono xs" style={{ wordBreak: "break-all" }}>{wallet.privateKey}</code>
            <div className="xs" style={{ marginTop: 6 }}>Quien la tenga controla tu dinero. Guárdala solo para restaurar la billetera.</div>
          </Notice>
        ) : (
          <Button icon={<KeyRound size={14} />} onClick={() => setReveal(true)}>Exportar clave privada</Button>
        )}
        {confirmForget ? (
          <Notice tone="bad" title="¿Olvidar la billetera en este dispositivo?"
            actions={<div className="row-nowrap">
              <Button size="sm" onClick={() => setConfirmForget(false)}>Cancelar</Button>
              <Button size="sm" variant="danger" onClick={onForget}>Olvidar</Button>
            </div>}>
            Sin la clave privada no podrás volver a usar estas monedas.
          </Notice>
        ) : (
          <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => setConfirmForget(true)}>Olvidar billetera en este dispositivo</Button>
        )}
      </div>
    </Panel>
  );
}
