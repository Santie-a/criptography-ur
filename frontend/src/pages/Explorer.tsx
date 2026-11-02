import { Hammer, Plus, Send, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { ChainStrip, MerkleTree } from "../components/chain";
import { AsyncButton, Badge, Callout, Card, Empty, Field, fmtTime, Hex, NonceBadge, PageHead } from "../components/ui";
import { useActingWallet, useStore } from "../store";
import type { BlockDetail, MerkleProof, MineResult, NonceKind, Tx } from "../types";

function hashParam(name: string): string | null {
  const q = location.hash.split("?")[1];
  return q ? new URLSearchParams(q).get(name) : null;
}

export function Explorer() {
  const { state, run, notify, lastEvent } = useStore();
  const [selected, setSelected] = useState<number | null>(() => {
    const b = hashParam("b");
    return b === null ? null : Number(b);
  });
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [txIndex, setTxIndex] = useState<number | null>(null);
  const [proof, setProof] = useState<MerkleProof | null>(null);

  const height = state?.height ?? 0;
  const current = selected ?? height;

  useEffect(() => {
    if (!state) return;
    run(() => api.block(Math.min(current, height))).then((b) => b && setBlock(b));
  }, [current, height, state?.version, run, state]);

  useEffect(() => {
    setTxIndex(null);
    setProof(null);
  }, [current]);

  useEffect(() => {
    if (txIndex === null || !block) return;
    run(() => api.proof(block.index, txIndex)).then((p) => p && setProof(p));
  }, [txIndex, block, run]);

  if (!state) return null;
  const tx = txIndex !== null ? block?.transactions[txIndex] : null;

  return (
    <>
      <PageHead eyebrow="Paso 3" title="Explorador de la cadena">
        Cada bloque guarda la raíz de Merkle de sus transacciones y el hash del bloque anterior, y su propio
        hash debe empezar con tantos bits en cero como marque la dificultad. Todos los clientes conectados
        comparten esta red{lastEvent ? "; los cambios llegan en tiempo real." : "."}
      </PageHead>

      <Card title="Bloques" hint="Clic en un bloque para ver su contenido." flush>
        <ChainStrip blocks={state.blocks} selected={current} onSelect={setSelected} />
      </Card>

      <div className="split">
        <div className="stack-lg">
          {block && (
            <Card title={block.index === 0 ? "Génesis" : `Bloque ${block.index}`}
              actions={block.meets_difficulty ? <Badge tone="ok">PoW válida</Badge> : <Badge tone="bad">PoW inválida</Badge>}>
              <div className="stack-lg">
                <div className="grid grid-2">
                  <dl className="kv">
                    <dt>Hash</dt><dd><Hex value={block.hash} n={10} /></dd>
                    <dt>Anterior</dt><dd><Hex value={block.prev_hash} n={10} /></dd>
                    <dt>Raíz Merkle</dt><dd><Hex value={block.merkle_root} n={10} /></dd>
                  </dl>
                  <dl className="kv">
                    <dt>Nonce PoW</dt><dd className="num">{block.nonce.toLocaleString("es")}</dd>
                    <dt>Dificultad</dt><dd>{block.difficulty} bits · hash &lt; 2<sup>{256 - block.difficulty}</sup></dd>
                    <dt>Fecha</dt><dd>{fmtTime(block.timestamp)}</dd>
                  </dl>
                </div>
                <div>
                  <div className="xs muted" style={{ marginBottom: 4 }}>
                    Árbol de Merkle {proof ? "· en violeta el camino de la prueba, en ámbar los hermanos" : "· clic en una transacción para ver su prueba"}
                  </div>
                  <MerkleTree levels={block.merkle_levels} leafLabels={block.transactions.map((_, i) => `tx ${i}`)} highlightLeaf={txIndex} />
                </div>
              </div>
            </Card>
          )}

          {block && (
            <Card title="Transacciones" flush>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>de</th><th>para</th><th className="right">monto</th><th>r</th><th>memo</th></tr></thead>
                  <tbody>
                    {block.transactions.map((t, i) => (
                      <tr key={t.txid} className={`clickable ${txIndex === i ? "selected" : ""}`} onClick={() => setTxIndex(i)}>
                        <td className="num faint">{i}</td>
                        <td>{t.coinbase ? <Badge tone="warn">{block.index === 0 ? "asignación" : "recompensa"}</Badge> : t.sender_name ?? <Hex value={t.sender_address!} n={5} />}</td>
                        <td>{t.recipient_name ?? <Hex value={t.recipient} n={5} />}</td>
                        <td className="right num">{t.amount}</td>
                        <td>{t.signature ? <Hex value={t.signature.r} n={5} /> : <span className="faint">—</span>}</td>
                        <td className="muted">{t.memo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {tx && <TxDetail tx={tx} proof={proof} />}
        </div>

        <div className="stack-lg">
          <WalletPanel />
          <MinePanel onMined={(r) => { setSelected(r.block.index); notify(`Bloque ${r.block.index} minado en ${r.attempts.toLocaleString("es")} intentos`); }} />
          <Card title={`Mempool (${state.mempool.length})`} hint="Transacciones válidas esperando bloque." flush>
            {state.mempool.length === 0 ? <Empty>Vacía. Envía una transferencia.</Empty> : (
              <table className="table">
                <tbody>
                  {state.mempool.map((t) => (
                    <tr key={t.txid}>
                      <td>{t.sender_name ?? "externo"} → {t.recipient_name ?? "externo"}</td>
                      <td className="right num">{t.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function TxDetail({ tx, proof }: { tx: Tx; proof: MerkleProof | null }) {
  return (
    <Card title="Transacción" hint="Lo que el validador y el atacante ven: todo es público.">
      <dl className="kv">
        <dt>txid</dt><dd><Hex value={tx.txid} n={12} /></dd>
        {tx.sender && <><dt>Clave pública</dt><dd><Hex value={tx.sender} n={12} /></dd></>}
        <dt>seq</dt><dd className="num">{tx.seq}</dd>
        <dt>Mensaje firmado</dt><dd><code className="hex full">{tx.payload}</code></dd>
        {tx.signature ? (
          <>
            <dt>r</dt><dd><Hex value={tx.signature.r} full /></dd>
            <dt>s</dt><dd><Hex value={tx.signature.s} full /></dd>
          </>
        ) : <><dt>Firma</dt><dd className="muted">Sin firma: la crea la red (génesis o recompensa del minero).</dd></>}
        {proof && (
          <>
            <dt>Prueba Merkle</dt>
            <dd className="stack" style={{ gap: 6 }}>
              {proof.proof.length === 0 ? <span className="muted">Única transacción: su hoja es la raíz.</span> :
                proof.proof.map((p, i) => (
                  <div key={i} className="row xs"><Badge tone="warn">{p.side === "L" ? "izq." : "der."}</Badge><Hex value={p.sibling} n={10} /></div>
                ))}
              <span className="xs muted">
                {proof.proof.length} hashes bastan para demostrar que la tx está en el bloque · {proof.valid ? <span className="ok-text">verificada contra la raíz</span> : <span className="bad-text">no verifica</span>}
              </span>
            </dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function WalletPanel() {
  const { state, run, notify } = useStore();
  const [acting, setActing] = useActingWallet();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState(10);
  const [memo, setMemo] = useState("");
  const [newName, setNewName] = useState("");
  const [newNonce, setNewNonce] = useState<NonceKind>("rfc6979");
  if (!state) return null;
  const me = state.wallets.find((w) => w.name === acting) ?? state.wallets[0];
  const others = state.wallets.filter((w) => w.name !== me.name);
  const recipient = to && others.some((w) => w.name === to) ? to : others[0]?.name ?? "";

  return (
    <Card title={<><UserRound size={16} /> Actuar como</>} hint="Cada navegador elige con qué billetera firma.">
      <div className="stack-lg">
        <div className="stack">
          <select className="select" value={me.name} onChange={(e) => setActing(e.target.value)}>
            {state.wallets.map((w) => <option key={w.name} value={w.name}>{w.name} · {w.balance}</option>)}
          </select>
          <div className="row-between small">
            <span className="muted">Saldo disponible</span>
            <strong className="num">{me.available}{me.available !== me.balance && <span className="faint"> / {me.balance}</span>}</strong>
          </div>
          <div className="row-between small">
            <span className="muted">Nonce</span><NonceBadge kind={me.nonce} />
          </div>
        </div>
        <div className="divider" />
        <div className="stack">
          <div className="grid grid-2">
            <Field label="Para">
              <select className="select" value={recipient} onChange={(e) => setTo(e.target.value)}>
                {others.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
              </select>
            </Field>
            <Field label="Monto"><input className="input num" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          </div>
          <Field label="Memo"><input className="input" value={memo} maxLength={80} onChange={(e) => setMemo(e.target.value)} placeholder="opcional" /></Field>
          <AsyncButton variant="primary" icon={<Send size={14} />} onRun={async () => {
            const t = await run(() => api.transfer(me.name, recipient, amount, memo));
            if (t) { notify(`Firmada y enviada a la mempool (seq ${t.seq})`); setMemo(""); }
          }}>Firmar y enviar</AsyncButton>
        </div>
        <div className="divider" />
        <div className="stack">
          <span className="xs muted">Nueva billetera (empieza en 0: mina un bloque para cobrar la recompensa)</span>
          <div className="row">
            <input className="input grow" style={{ width: 120 }} placeholder="Nombre" value={newName} maxLength={24} onChange={(e) => setNewName(e.target.value)} />
            <select className="select" style={{ width: 130 }} value={newNonce} onChange={(e) => setNewNonce(e.target.value as NonceKind)}>
              <option value="rfc6979">RFC 6979</option>
              <option value="random">Aleatorio</option>
              <option value="weak">RNG débil</option>
              <option value="constant">k fijo</option>
            </select>
            <AsyncButton icon={<Plus size={14} />} disabled={!newName.trim()} onRun={async () => {
              const w = await run(() => api.createWallet(newName.trim(), newNonce));
              if (w) { setActing(w.name); setNewName(""); notify(`Billetera ${w.name} creada`); }
            }}>Crear</AsyncButton>
          </div>
        </div>
      </div>
    </Card>
  );
}

function MinePanel({ onMined }: { onMined: (r: MineResult) => void }) {
  const { state, run } = useStore();
  const [acting] = useActingWallet();
  const [extra, setExtra] = useState(0);
  const [last, setLast] = useState<{ r: MineResult; ms: number } | null>(null);
  if (!state) return null;
  const difficulty = state.difficulty + extra;
  const miner = state.wallets.some((w) => w.name === acting) ? acting : state.wallets[0].name;
  return (
    <Card title={<><Hammer size={16} /> Minar</>} hint={`La recompensa (50) va a ${miner}.`}>
      <div className="stack">
        <Field label={`Dificultad: ${difficulty} bits (mínimo de la red ${state.difficulty})`}>
          <input type="range" min={0} max={Math.max(0, 22 - state.difficulty)} value={extra} onChange={(e) => setExtra(Number(e.target.value))} />
        </Field>
        <p className="xs muted num">Intentos esperados: 2<sup>{difficulty}</sup> ≈ {(2 ** difficulty).toLocaleString("es")}. Cada bit duplica el trabajo.</p>
        <AsyncButton variant="primary" icon={<Hammer size={14} />} onRun={async () => {
          const t0 = performance.now();
          const r = await run(() => api.mine(miner, difficulty));
          if (r) { setLast({ r, ms: performance.now() - t0 }); onMined(r); }
        }}>Minar bloque con {state.mempool.length} tx</AsyncButton>
        {last && (
          <Callout tone="ok" title={`Bloque ${last.r.block.index}`}>
            {last.r.attempts.toLocaleString("es")} intentos en {(last.ms / 1000).toFixed(2)} s · hash <code>{last.r.block.hash.slice(0, 12)}…</code>
          </Callout>
        )}
      </div>
    </Card>
  );
}
