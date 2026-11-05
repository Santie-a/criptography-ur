// Bloques: lista-detalle. La tabla mantiene el contexto; el inspector muestra
// el bloque elegido con pestañas sobre el contenido que controlan.
import { ChevronLeft, ChevronRight, Hammer } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { api } from "../api";
import { ChainStrip, MerkleTree } from "../components/chain";
import { Button, Hex, Inspector, PageHeader, Panel, Section, Tabs, Tag, fmtTime } from "../components/ui";
import { go, href, useRoute } from "../router";
import { useStore } from "../store";
import type { BlockDetail, MerkleProof } from "../types";

export function Blocks() {
  const { state, run, openDialog, isAdmin } = useStore();
  const { params } = useRoute();
  const height = state?.height ?? 0;
  const selected = Math.min(Number(params.get("b") ?? height), height);
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [tab, setTab] = useState<"resumen" | "tx" | "merkle">("resumen");
  const [leaf, setLeaf] = useState<number | null>(null);
  const [proof, setProof] = useState<MerkleProof | null>(null);

  useEffect(() => {
    run(() => api.block(selected)).then((b) => b && setBlock(b));
    setLeaf(null);
    setProof(null);
  }, [selected, state?.version, run]);

  useEffect(() => {
    if (leaf === null || !block) return;
    run(() => api.proof(block.index, leaf)).then((p) => p && setProof(p));
  }, [leaf, block, run]);

  if (!state) return null;
  const rows = [...state.blocks].reverse();
  const select = (i: number) => go("bloques", { b: i });

  return (
    <>
      <PageHeader crumbs={[{ label: "Red", href: href("resumen") }, { label: "Bloques" }]} title="Bloques"
        sub={`${state.blocks.length} bloques · dificultad mínima ${state.difficulty} bits`}
        actions={isAdmin && <Button variant="primary" icon={<Hammer size={14} />} onClick={() => openDialog("mine")}>Minar bloque</Button>} />
      <div className="list-detail">
        <div className="list">
          <Panel title="Cadena" flush>
            <ChainStrip blocks={state.blocks} selected={selected} onSelect={select} />
          </Panel>
          <Panel flush>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Bloque</th><th>Hash</th><th>Anterior</th><th className="right">Tx</th><th className="right">Nonce PoW</th><th className="right">Bits</th><th>Fecha</th></tr></thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.index} className={`clickable ${b.index === selected ? "selected" : ""}`} onClick={() => select(b.index)}>
                      <td className="num">#{b.index}{b.index === 0 && <span className="faint"> génesis</span>}</td>
                      <td><Hex value={b.hash} n={6} /></td>
                      <td><Hex value={b.prev_hash} n={6} /></td>
                      <td className="right num">{b.tx_count}</td>
                      <td className="right num">{b.nonce.toLocaleString("es")}</td>
                      <td className="right num">{b.difficulty}</td>
                      <td className="muted">{fmtTime(b.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {block && (
          <Inspector title={block.index === 0 ? "Bloque génesis" : `Bloque #${block.index}`}
            actions={<>
              <Button variant="ghost" size="sm" icon={<ChevronLeft size={14} />} disabled={block.index === 0} onClick={() => select(block.index - 1)} aria-label="Bloque anterior" />
              <Button variant="ghost" size="sm" icon={<ChevronRight size={14} />} disabled={block.index === height} onClick={() => select(block.index + 1)} aria-label="Bloque siguiente" />
            </>}>
            <div style={{ margin: "-16px -16px 0" }}>
              <Tabs value={tab} onChange={setTab} items={[
                { value: "resumen", label: "Encabezado" },
                { value: "tx", label: `Transacciones (${block.transactions.length})` },
                { value: "merkle", label: "Árbol de Merkle" },
              ]} />
            </div>

            {tab === "resumen" && (
              <>
                <Section title="Prueba de trabajo">
                  <div className="row">
                    {block.meets_difficulty ? <Tag tone="ok">válida</Tag> : <Tag tone="bad">inválida</Tag>}
                    <span className="small muted">hash &lt; 2<sup>{256 - block.difficulty}</sup> ({block.difficulty} bits en cero)</span>
                  </div>
                </Section>
                <Section title="Encabezado">
                  <dl className="kv">
                    <dt>Hash</dt><dd><Hex value={block.hash} full /></dd>
                    <dt>Anterior</dt><dd>{block.index > 0 ? <a href={href("bloques", { b: block.index - 1 })}><Hex value={block.prev_hash} n={12} /></a> : <Hex value={block.prev_hash} n={12} />}</dd>
                    <dt>Raíz Merkle</dt><dd><Hex value={block.merkle_root} n={12} /></dd>
                    <dt>Nonce PoW</dt><dd className="num">{block.nonce.toLocaleString("es")}</dd>
                    <dt>Dificultad</dt><dd>{block.difficulty} bits</dd>
                    <dt>Fecha</dt><dd>{fmtTime(block.timestamp)}</dd>
                  </dl>
                </Section>
                <Section title="Lo que se hashea">
                  <code className="hex full">{block.index}|{block.prev_hash}|{block.merkle_root}|{block.timestamp}|{block.difficulty}|{block.nonce}</code>
                  <span className="xs muted">SHA-256 de estos campos. Cambiar cualquier transacción cambia la raíz de Merkle, y con ella este hash.</span>
                </Section>
              </>
            )}

            {tab === "tx" && (
              <div style={{ margin: "0 -16px" }}>
                <table className="table">
                  <thead><tr><th>#</th><th>De → Para</th><th className="right">Monto</th></tr></thead>
                  <tbody>
                    {block.transactions.map((t, i) => (
                      <tr key={t.txid} className="clickable" onClick={() => go("transacciones", { tx: t.txid })}>
                        <td className="num faint">{i}</td>
                        <td>{t.coinbase ? <Tag tone="warn">{block.index === 0 ? "asignación" : "recompensa"}</Tag> : t.sender_name ?? "externa"} → {t.recipient_name ?? "externa"}</td>
                        <td className="right num">{t.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "merkle" && (
              <>
                <Section title="Árbol">
                  <MerkleTree levels={block.merkle_levels} leafLabels={block.transactions.map((_, i) => `tx ${i}`)} highlightLeaf={leaf} />
                  <span className="xs muted">Hoja = SHA-256(0x00 ‖ txid) · nodo = SHA-256(0x01 ‖ izq ‖ der). Si un nivel es impar se duplica el último.</span>
                </Section>
                <Section title="Prueba de inclusión">
                  <select className="select" value={leaf ?? ""} onChange={(e) => setLeaf(e.target.value === "" ? null : Number(e.target.value))}>
                    <option value="">Elegir transacción…</option>
                    {block.transactions.map((t, i) => <option key={i} value={i}>tx {i} · {t.coinbase ? "recompensa" : `${t.sender_name ?? "?"} → ${t.recipient_name ?? "?"}`}</option>)}
                  </select>
                  {proof && (
                    <>
                      {proof.proof.length === 0 ? <span className="small muted">Única transacción: su hoja es la raíz.</span> : (
                        <dl className="kv">
                          {proof.proof.map((p, i) => (
                            <Fragment key={i}><dt>Nivel {i} · {p.side === "L" ? "izq." : "der."}</dt><dd><Hex value={p.sibling} n={12} /></dd></Fragment>
                          ))}
                        </dl>
                      )}
                      <div className="row">
                        {proof.valid ? <Tag tone="ok">verifica contra la raíz</Tag> : <Tag tone="bad">no verifica</Tag>}
                        <span className="xs muted">{proof.proof.length} hashes en lugar de {block.transactions.length} transacciones</span>
                      </div>
                    </>
                  )}
                </Section>
              </>
            )}
          </Inspector>
        )}
      </div>
    </>
  );
}
