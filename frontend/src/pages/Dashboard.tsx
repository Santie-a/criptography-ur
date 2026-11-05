// Resumen: estado de la red de un vistazo y alertas de seguridad.
// Las alertas son la puerta de entrada al análisis: el sistema detecta el
// problema y el usuario profundiza, como en una herramienta de monitoreo.
import { ArrowRight, Hammer, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { ChainStrip } from "../components/chain";
import { Button, Hex, Metrics, Notice, NonceTag, PageHeader, Panel, Tag, fmtAgo } from "../components/ui";
import { go, href } from "../router";
import { useStore } from "../store";
import type { TxRow, ValidationResult } from "../types";

export function Dashboard() {
  const { state, scan, openDialog, isAdmin } = useStore();
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [integrity, setIntegrity] = useState<ValidationResult | null>(null);

  useEffect(() => {
    api.transactions().then((t) => setTxs(t.slice(0, 8))).catch(() => setTxs([]));
    api.validate().then(setIntegrity).catch(() => setIntegrity(null));
  }, [state?.version]);

  if (!state) return null;
  const signatures = state.blocks.reduce((acc, b) => acc + Math.max(0, b.tx_count - 1), 0);
  const recent = [...state.blocks].reverse().slice(0, 8);
  const exposed = scan?.recoveries ?? [];
  const weakWallets = state.wallets.filter((w) => w.nonce === "weak" || w.nonce === "constant");

  return (
    <>
      <PageHeader crumbs={[{ label: "Red" }]} title="Resumen"
        sub={`Red simulada con ECDSA sobre secp256k1 · ${state.wallets.length} billeteras`}
        actions={isAdmin && <>
          <Button icon={<Send size={14} />} onClick={() => openDialog("transfer")}>Nueva transacción</Button>
          <Button variant="primary" icon={<Hammer size={14} />} onClick={() => openDialog("mine")}>Minar bloque</Button>
        </>} />
      <div className="page-body">
        {exposed.map((r) => (
          <Notice key={r.address} tone="bad" title={`Clave privada de ${r.name ?? "una billetera"} expuesta`}
            actions={<Button size="sm" variant="danger" icon={<ArrowRight size={12} />} onClick={() => go("firmas", { a: r.address })}>Analizar</Button>}>
            Dos firmas publicadas (bloque {r.first.block} tx {r.first.tx} y bloque {r.second.block} tx {r.second.tx}) comparten
            el mismo r, así que reutilizaron el nonce k. Cualquiera que lea la cadena puede calcular la clave.
          </Notice>
        ))}
        {exposed.length === 0 && weakWallets.length > 0 && (
          <Notice tone="warn" title="Billeteras con generador de nonces inseguro">
            {weakWallets.map((w) => w.name).join(", ")} {weakWallets.length === 1 ? "usa" : "usan"} una estrategia de nonce que puede repetir k.
            Aún no hay firmas repetidas en la cadena.
          </Notice>
        )}

        <Metrics items={[
          { label: "Altura", value: state.height, sub: `${state.blocks.length} bloques con génesis` },
          { label: "Dificultad", value: `${state.difficulty} bits`, sub: `≈ ${(2 ** state.difficulty).toLocaleString("es")} intentos por bloque` },
          { label: "Firmas en la cadena", value: signatures, sub: `${scan?.unique_r ?? "—"} valores de r distintos` },
          { label: "Pendientes", value: state.mempool.length, sub: "en la mempool" },
          { label: "Claves expuestas", value: exposed.length, sub: "por reutilización de nonce", tone: exposed.length ? "bad" : undefined },
        ]} />

        <Panel title="Cadena" meta={` · enlazada por hash`} flush
          actions={<a className="btn ghost sm" href={href("bloques")}>Ver bloques <ArrowRight size={12} /></a>}>
          <ChainStrip blocks={state.blocks} selected={state.height} onSelect={(i) => go("bloques", { b: i })} />
        </Panel>

        <div className="grid-2">
          <Panel title="Últimos bloques" flush actions={<a className="btn ghost sm" href={href("bloques")}>Todos</a>}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Bloque</th><th>Hash</th><th className="right">Tx</th><th className="right">Nonce PoW</th><th>Fecha</th></tr></thead>
                <tbody>
                  {recent.map((b) => (
                    <tr key={b.index} className="clickable" onClick={() => go("bloques", { b: b.index })}>
                      <td><a href={href("bloques", { b: b.index })}>#{b.index}</a></td>
                      <td><Hex value={b.hash} n={6} /></td>
                      <td className="right num">{b.tx_count}</td>
                      <td className="right num">{b.nonce.toLocaleString("es")}</td>
                      <td className="muted">{fmtAgo(b.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Últimas transacciones" flush actions={<a className="btn ghost sm" href={href("transacciones")}>Todas</a>}>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Txid</th><th>De</th><th>Para</th><th className="right">Monto</th></tr></thead>
                <tbody>
                  {txs.map((t) => (
                    <tr key={t.txid} className="clickable" onClick={() => go("transacciones", { tx: t.txid })}>
                      <td><Hex value={t.txid} n={5} /></td>
                      <td>{t.coinbase ? <Tag tone="warn">{t.block === 0 ? "génesis" : "recompensa"}</Tag> : t.sender_name ?? "externa"}</td>
                      <td>{t.recipient_name ?? "externa"}</td>
                      <td className="right num">{t.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="grid-2">
          <Panel title="Integridad de la cadena" actions={<a className="btn ghost sm" href={href("integridad")}>Detalle</a>}>
            {integrity ? (integrity.ok
              ? <Notice tone="ok" title="Cadena válida">{integrity.blocks_checked} bloques y {integrity.signatures_checked} firmas ECDSA verificadas: enlaces, prueba de trabajo, Merkle, firmas y saldos.</Notice>
              : <Notice tone="bad" title={`${integrity.issues.length} problemas`}>La cadena no pasa la validación.</Notice>)
              : <span className="muted small">Validando…</span>}
          </Panel>
          <Panel title="Billeteras" flush actions={<a className="btn ghost sm" href={href("billeteras")}>Gestionar</a>}>
            <table className="table">
              <tbody>
                {state.wallets.map((w) => (
                  <tr key={w.name} className="clickable" onClick={() => go("billeteras", { w: w.name })}>
                    <td><strong>{w.name}</strong></td>
                    <td><NonceTag kind={w.nonce} /></td>
                    <td className="right num">{w.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}
