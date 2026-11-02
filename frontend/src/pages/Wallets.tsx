import { Plus, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Hex, Inspector, NonceTag, Notice, PageHeader, Panel, Section, Tag, initials } from "../components/ui";
import { go, href, useRoute } from "../router";
import { useStore } from "../store";
import type { NonceKind, WalletDetail } from "../types";

export function Wallets() {
  const { state, scan, identity, setIdentity, run, notify, openDialog } = useStore();
  const { params } = useRoute();
  const selected = params.get("w") ?? identity;
  const [detail, setDetail] = useState<WalletDetail | null>(null);

  useEffect(() => {
    run(() => api.wallet(selected)).then((d) => d && setDetail(d));
  }, [selected, state?.version, run]);

  if (!state) return null;
  const exposed = new Set(scan?.recoveries.map((r) => r.address) ?? []);

  return (
    <>
      <PageHeader crumbs={[{ label: "Red", href: href("resumen") }, { label: "Billeteras" }]} title="Billeteras"
        sub="Las billeteras de la simulación las custodia el servidor; cada navegador elige con cuál firma."
        actions={<Button variant="primary" icon={<Plus size={14} />} onClick={() => openDialog("wallet")}>Nueva billetera</Button>} />
      <div className="list-detail">
        <div className="list">
          <Panel flush>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Nombre</th><th>Dirección</th><th className="right">Saldo</th><th className="right">Disponible</th><th className="right">Seq</th><th>Nonce</th><th>Estado</th></tr></thead>
                <tbody>
                  {state.wallets.map((w) => (
                    <tr key={w.name} className={`clickable ${w.name === selected ? "selected" : ""}`} onClick={() => go("billeteras", { w: w.name })}>
                      <td>
                        <span className="row-nowrap"><span className="avatar" style={{ width: 20, height: 20, fontSize: 9 }}>{initials(w.name)}</span><strong>{w.name}</strong>
                          {w.name === identity && <Tag tone="accent">tú</Tag>}</span>
                      </td>
                      <td><Hex value={w.address} n={6} /></td>
                      <td className="right num">{w.balance}</td>
                      <td className="right num">{w.available}</td>
                      <td className="right num">{w.next_seq}</td>
                      <td><NonceTag kind={w.nonce} /></td>
                      <td>{exposed.has(w.address) ? <Tag tone="bad">clave expuesta</Tag> : <span className="faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {detail && (
          <Inspector title={detail.name} actions={detail.name !== identity && (
            <Button size="sm" icon={<UserCheck size={12} />} onClick={() => { setIdentity(detail.name); notify(`Ahora firmas como ${detail.name}`); }}>Usar</Button>
          )}>
            {exposed.has(detail.address) && (
              <Notice tone="bad" title="Clave privada expuesta" actions={<Button size="sm" variant="danger" onClick={() => go("firmas", { a: detail.address })}>Ver</Button>}>
                Dos de sus firmas comparten el nonce.
              </Notice>
            )}
            <Section title="Saldo">
              <dl className="kv">
                <dt>Confirmado</dt><dd className="num">{detail.balance}</dd>
                <dt>Disponible</dt><dd className="num">{detail.available} <span className="xs faint">(descontando pendientes)</span></dd>
                <dt>Próximo seq</dt><dd className="num">{detail.next_seq}</dd>
                <dt>Firmas publicadas</dt><dd className="num">{detail.signatures}</dd>
              </dl>
            </Section>
            <Section title="Claves">
              <dl className="kv">
                <dt>Dirección</dt><dd><Hex value={detail.address} n={14} /></dd>
                <dt>Clave pública</dt><dd><Hex value={detail.pubkey} full /></dd>
                <dt>Clave privada</dt><dd className="muted small">Solo la conoce el servidor.</dd>
              </dl>
            </Section>
            <Section title="Generación del nonce k">
              <select className="select" value={detail.nonce} onChange={async (e) => {
                const w = await run(() => api.setNonce(detail.name, e.target.value as NonceKind));
                if (w) notify(`${detail.name} firmará con: ${w.nonce_label}`);
              }}>
                {Object.entries(state.nonce_kinds).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <span className="xs muted">Cambiarla solo afecta firmas futuras: las ya publicadas siguen en la cadena.</span>
            </Section>
            <Section title={`Historial (${detail.history.length})`}>
              <div style={{ margin: "0 -16px" }}>
                <table className="table">
                  <tbody>
                    {detail.history.slice(0, 30).map((t) => {
                      const out = t.sender_address === detail.address;
                      return (
                        <tr key={t.txid} className="clickable" onClick={() => go("transacciones", { tx: t.txid })}>
                          <td className="num faint">#{t.block}</td>
                          <td>{out ? `→ ${t.recipient_name ?? "externa"}` : `← ${t.coinbase ? (t.block === 0 ? "génesis" : "recompensa") : t.sender_name ?? "externa"}`}</td>
                          <td className={`right num ${out ? "bad-text" : "ok-text"}`}>{out ? "−" : "+"}{t.amount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          </Inspector>
        )}
      </div>
    </>
  );
}
