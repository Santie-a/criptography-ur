import { Send } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Button, Empty, Hex, Inspector, PageHeader, Panel, Section, Tabs, Tag, fmtTime } from "../components/ui";
import { go, href, useRoute } from "../router";
import { useStore } from "../store";
import type { TxDetail, TxRow } from "../types";

export function Transactions() {
  const { state, scan, run, openDialog, isAdmin } = useStore();
  const { params } = useRoute();
  const txid = params.get("tx");
  const [tab, setTab] = useState<"confirmadas" | "pendientes">("confirmadas");
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<TxRow[]>([]);
  const [detail, setDetail] = useState<TxDetail | null>(null);

  useEffect(() => {
    api.transactions().then(setRows).catch(() => setRows([]));
  }, [state?.version]);

  useEffect(() => {
    if (!txid) {
      setDetail(null);
      return;
    }
    run(() => api.transaction(txid)).then((d) => d && setDetail(d));
  }, [txid, state?.version, run]);

  // r compartido por la misma clave: lo marca el análisis de firmas.
  const reused = useMemo(() => new Set(scan?.collisions.map((c) => c.r) ?? []), [scan]);

  if (!state) return null;
  const pending: TxRow[] = state.mempool.map((t) => ({ ...t, block: null, position: null, timestamp: null }));
  const source = tab === "confirmadas" ? rows : pending;
  const visible = filter ? source.filter((t) => t.sender_name === filter || t.recipient_name === filter) : source;

  return (
    <>
      <PageHeader crumbs={[{ label: "Red", href: href("resumen") }, { label: "Transacciones" }]} title="Transacciones"
        actions={isAdmin && <Button variant="primary" icon={<Send size={14} />} onClick={() => openDialog("transfer")}>Nueva transacción</Button>}
        tabs={<Tabs value={tab} onChange={setTab} items={[
          { value: "confirmadas", label: `Confirmadas (${rows.length})` },
          { value: "pendientes", label: `Pendientes (${state.mempool.length})` },
        ]} />} />
      <div className="list-detail">
        <div className="list">
          <Panel flush>
            <div className="table-toolbar">
              <span className="small muted">Filtrar por billetera</span>
              <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">Todas</option>
                {state.wallets.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
              </select>
              <span className="grow" />
              <span className="xs faint">{visible.length} resultados</span>
            </div>
            {visible.length === 0 ? <Empty>{tab === "pendientes" ? "No hay transacciones pendientes." : "Sin resultados."}</Empty> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Txid</th><th>Bloque</th><th>De</th><th>Para</th><th className="right">Monto</th><th className="right">Seq</th><th>r de la firma</th><th>Memo</th></tr></thead>
                  <tbody>
                    {visible.map((t) => (
                      <tr key={t.txid} className={`clickable ${t.txid === txid ? "selected" : ""}`} onClick={() => go("transacciones", { tx: t.txid })}>
                        <td><Hex value={t.txid} n={5} /></td>
                        <td className="num">{t.block === null ? <Tag>pendiente</Tag> : `#${t.block}`}</td>
                        <td>{t.coinbase ? <Tag tone="warn">{t.block === 0 ? "génesis" : "recompensa"}</Tag> : t.sender_name ?? "externa"}</td>
                        <td>{t.recipient_name ?? "externa"}</td>
                        <td className="right num">{t.amount}</td>
                        <td className="right num">{t.coinbase ? "—" : t.seq}</td>
                        <td>{t.signature ? <Hex value={t.signature.r} n={5} tone={reused.has(t.signature.r) ? "bad" : undefined} /> : <span className="faint">—</span>}</td>
                        <td className="muted truncate" style={{ maxWidth: 160 }}>{t.memo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {detail ? <TxInspector tx={detail} reused={!!detail.signature && reused.has(detail.signature.r)} onClose={() => go("transacciones")} /> : (
          <aside className="inspector"><Empty>Selecciona una transacción para ver su firma, el mensaje firmado y su prueba de inclusión.</Empty></aside>
        )}
      </div>
    </>
  );
}

function TxInspector({ tx, reused, onClose }: { tx: TxDetail; reused: boolean; onClose: () => void }) {
  return (
    <Inspector title="Transacción" onClose={onClose}>
      <Section title="Estado">
        <div className="row">
          {tx.block === null ? <Tag>pendiente</Tag> : <Tag tone="ok">confirmada en el bloque #{tx.block}</Tag>}
          {tx.coinbase && <Tag tone="warn">sin firma: la crea la red</Tag>}
          {reused && <Tag tone="bad">nonce reutilizado</Tag>}
        </div>
      </Section>
      <Section title="Datos">
        <dl className="kv">
          <dt>Txid</dt><dd><Hex value={tx.txid} n={14} /></dd>
          {tx.block !== null && <><dt>Bloque</dt><dd><a href={href("bloques", { b: tx.block })}>#{tx.block}</a>, posición {tx.position}</dd></>}
          {tx.timestamp && <><dt>Fecha</dt><dd>{fmtTime(tx.timestamp)}</dd></>}
          <dt>De</dt><dd>{tx.sender_name ? <a href={href("billeteras", { w: tx.sender_name })}>{tx.sender_name}</a> : tx.coinbase ? "—" : <Hex value={tx.sender_address!} n={10} />}</dd>
          <dt>Para</dt><dd>{tx.recipient_name ? <a href={href("billeteras", { w: tx.recipient_name })}>{tx.recipient_name}</a> : <Hex value={tx.recipient} n={10} />}</dd>
          <dt>Monto</dt><dd className="num">{tx.amount}</dd>
          {!tx.coinbase && <><dt>Seq</dt><dd className="num">{tx.seq}</dd></>}
          {tx.memo && <><dt>Memo</dt><dd>{tx.memo}</dd></>}
        </dl>
      </Section>
      {tx.signature && (
        <Section title="Firma ECDSA">
          <dl className="kv">
            <dt>Clave pública</dt><dd><Hex value={tx.sender!} n={12} /></dd>
            <dt>r</dt><dd><Hex value={tx.signature.r} full tone={reused ? "bad" : undefined} /></dd>
            <dt>s</dt><dd><Hex value={tx.signature.s} full /></dd>
          </dl>
          {reused && <span className="xs bad-text">Otra firma de esta misma clave tiene este r. <a href={href("firmas", { a: tx.sender_address })}>Ver análisis</a></span>}
        </Section>
      )}
      <Section title="Mensaje firmado (z = SHA-256 de esto)">
        <code className="hex full">{tx.payload}</code>
      </Section>
      {tx.proof && (
        <Section title="Prueba de inclusión Merkle">
          <dl className="kv">
            {tx.proof.proof.map((p, i) => (
              <Fragment key={i}><dt>Nivel {i} · {p.side === "L" ? "izq." : "der."}</dt><dd><Hex value={p.sibling} n={12} /></dd></Fragment>
            ))}
            <dt>Raíz</dt><dd><Hex value={tx.proof.root} n={12} /></dd>
          </dl>
          {tx.proof.valid ? <Tag tone="ok">verifica contra la raíz del bloque</Tag> : <Tag tone="bad">no verifica</Tag>}
        </Section>
      )}
    </Inspector>
  );
}
