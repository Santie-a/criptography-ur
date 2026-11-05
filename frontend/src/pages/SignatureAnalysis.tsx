// Análisis de firmas: auditoría de los nonces publicados en la cadena.
// Hallazgos a la izquierda, explicación y explotación en el inspector.
import { Crosshair, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { AdminRequired } from "../components/admin";
import { AsyncButton, Button, Empty, Field, Hex, Inspector, Metrics, Notice, PageHeader, Panel, Section, Tabs, Tag } from "../components/ui";
import { go, href, useRoute } from "../router";
import { useStore } from "../store";
import type { DefenseStats, Recovery, SignResult, StealResult } from "../types";

export function SignatureAnalysis() {
  const [tab, setTab] = useState<"nonces" | "estrategias">("nonces");
  return (
    <>
      <PageHeader crumbs={[{ label: "Seguridad" }, { label: "Análisis de firmas" }]} title="Análisis de firmas"
        sub="Busca firmas de una misma clave con el mismo r: revelan el nonce k y, con él, la clave privada."
        tabs={<Tabs value={tab} onChange={setTab} items={[
          { value: "nonces", label: "Reutilización de nonce" },
          { value: "estrategias", label: "Comparar estrategias" },
        ]} />} />
      {tab === "nonces" ? <NonceReuse /> : <div className="page-body"><Strategies /></div>}
    </>
  );
}

function NonceReuse() {
  const { state, scan, rescan } = useStore();
  const { params } = useRoute();
  const recoveries = scan?.recoveries ?? [];
  const selected = recoveries.find((r) => r.address === params.get("a")) ?? recoveries[0];
  const colliding = new Set(scan?.collisions.map((c) => c.r) ?? []);
  if (!state) return null;

  return (
    <div className="list-detail">
      <div className="list">
        <div className="spread">
          <span className="small muted">Fuente: solo datos públicos de la cadena (Q, r, s y z = SHA-256 del mensaje).</span>
          <AsyncButton size="sm" icon={<RefreshCw size={12} />} onRun={rescan}>Reanalizar</AsyncButton>
        </div>
        <Metrics items={[
          { label: "Firmas analizadas", value: scan?.signatures.length ?? "—" },
          { label: "Valores de r distintos", value: scan?.unique_r ?? "—" },
          { label: "Pares con r repetido", value: scan?.pairs ?? "—", tone: scan?.pairs ? "bad" : undefined },
          { label: "Claves expuestas", value: recoveries.length, tone: recoveries.length ? "bad" : undefined },
        ]} />

        <Panel title="Hallazgos" flush>
          {recoveries.length === 0 ? (
            <Empty>Ninguna clave firmó dos mensajes con el mismo r. No hay nada que explotar.</Empty>
          ) : (
            <table className="table">
              <thead><tr><th>Severidad</th><th>Billetera</th><th>r compartido</th><th>Firmas involucradas</th></tr></thead>
              <tbody>
                {recoveries.map((r) => (
                  <tr key={r.address} className={`clickable ${selected?.address === r.address ? "selected" : ""}`} onClick={() => go("firmas", { a: r.address })}>
                    <td><Tag tone="bad">crítica</Tag></td>
                    <td><strong>{r.name ?? "externa"}</strong></td>
                    <td><Hex value={r.r} n={6} tone="bad" /></td>
                    <td className="num">bloque {r.first.block} tx {r.first.tx} · bloque {r.second.block} tx {r.second.tx}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Firmas en la cadena" meta={scan ? ` · ${scan.signatures.length}` : ""} flush>
          <div className="table-wrap" style={{ maxHeight: 420 }}>
            <table className="table">
              <thead><tr><th>Bloque · tx</th><th>Firmante</th><th>r</th><th>s</th><th>z</th></tr></thead>
              <tbody>
                {scan?.signatures.map((s) => (
                  <tr key={`${s.block}-${s.tx}`} className={colliding.has(s.r) ? "row-bad" : ""}>
                    <td className="num">#{s.block} · {s.tx}</td>
                    <td>{s.name ?? <Hex value={s.address} n={5} />}</td>
                    <td><Hex value={s.r} n={6} tone={colliding.has(s.r) ? "bad" : undefined} /></td>
                    <td><Hex value={s.s} n={6} /></td>
                    <td><Hex value={s.z} n={6} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {selected ? <RecoveryInspector rec={selected} /> : (
        <aside className="inspector"><Empty>Sin hallazgos. Si quieres reproducir el ataque, configura a Bob con un RNG defectuoso en <a href={href("escenario")}>Escenario</a>.</Empty></aside>
      )}
    </div>
  );
}

function RecoveryInspector({ rec }: { rec: Recovery }) {
  const { state, run, notify, isAdmin } = useStore();
  const [thief, setThief] = useState("Mallory");
  const [result, setResult] = useState<StealResult | null>(null);
  const targets = state?.wallets.filter((w) => w.name !== rec.name) ?? [];
  const victim = state?.wallets.find((w) => w.address === rec.address);

  return (
    <Inspector title={`Clave de ${rec.name ?? "billetera externa"}`}>
      <Section title="Evidencia">
        <dl className="kv">
          <dt>r</dt><dd><Hex value={rec.r} n={12} tone="bad" /></dd>
          <dt>Firma 1</dt><dd className="small">bloque {rec.first.block}, tx {rec.first.tx}</dd>
          <dt>s₁ · z₁</dt><dd className="row-nowrap"><Hex value={rec.first.s} n={5} /><Hex value={rec.first.z} n={5} /></dd>
          <dt>Firma 2</dt><dd className="small">bloque {rec.second.block}, tx {rec.second.tx}</dd>
          <dt>s₂ · z₂</dt><dd className="row-nowrap"><Hex value={rec.second.s} n={5} /><Hex value={rec.second.z} n={5} /></dd>
        </dl>
      </Section>
      <Section title="Recuperación">
        <div className="derivation">
          <div className="derivation-step">
            <div className="n">1</div>
            <div style={{ minWidth: 0 }}>
              <div className="title">Nonce</div>
              <div className="formula">k ≡ (z₁ − z₂)(s₁ − s₂)⁻¹ (mod n)</div>
              <dl className="kv" style={{ marginTop: 6 }}>
                <dt>z₁ − z₂</dt><dd><Hex value={rec.z_diff} n={8} /></dd>
                <dt>(s₁ − s₂)⁻¹</dt><dd>{rec.s_diff_inv ? <Hex value={rec.s_diff_inv} n={8} /> : <span className="xs muted">firma low-s: se usó −s₂</span>}</dd>
                <dt>k</dt><dd><Hex value={rec.k} n={8} tone="accent" /></dd>
              </dl>
            </div>
          </div>
          <div className="derivation-step">
            <div className="n">2</div>
            <div style={{ minWidth: 0 }}>
              <div className="title">Clave privada</div>
              <div className="formula">d ≡ (s₁·k − z₁)·r⁻¹ (mod n)</div>
              <dl className="kv" style={{ marginTop: 6 }}>
                <dt>r⁻¹</dt><dd><Hex value={rec.r_inv} n={8} /></dd>
                <dt>d</dt><dd><Hex value={rec.d} n={8} tone="bad" /></dd>
              </dl>
            </div>
          </div>
          <div className="derivation-step">
            <div className={`n ${rec.dG_matches_pubkey ? "ok" : "bad"}`}>3</div>
            <div style={{ minWidth: 0 }}>
              <div className="title">Comprobación pública</div>
              <div className="eq">d·G = Q (la clave pública publicada)</div>
              <div className="row">
                {rec.dG_matches_pubkey ? <Tag tone="ok">coincide</Tag> : <Tag tone="bad">no coincide</Tag>}
                {rec.matches_real_key && <Tag tone="bad">igual a la clave real</Tag>}
              </div>
            </div>
          </div>
        </div>
      </Section>
      <Section title="Explotar">
        <span className="small muted">
          Firma una transferencia de todo el saldo disponible ({victim?.available ?? "—"}) con la clave recuperada. La red la acepta: la firma es válida.
        </span>
        {isAdmin ? (
          <>
            <Field label="Destino de los fondos">
              <select className="select" value={thief} onChange={(e) => setThief(e.target.value)}>
                {targets.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
              </select>
            </Field>
            <AsyncButton variant="danger" icon={<Crosshair size={14} />} disabled={!victim?.available} onRun={async () => {
              const r = await run(() => api.steal(rec.name ?? rec.address, thief));
              if (r) { setResult(r); notify(`Transferencia falsificada incluida en el bloque #${r.mined.block.index}`); }
            }}>Firmar como {rec.name ?? "la víctima"} y minar</AsyncButton>
          </>
        ) : (
          <AdminRequired>
            En la red compartida, la explotación la ejecuta el administrador. La clave recuperada está arriba:
            cualquiera puede calcularla, porque sale de datos públicos.
          </AdminRequired>
        )}
        {result && (
          <>
            <Notice tone="warn" title="La validación sigue pasando">
              Bloque #{result.mined.block.index}: {result.validation.signatures_checked} firmas verificadas, incluida la falsificada. <a href={href("transacciones", { tx: result.tx.txid })}>Ver transacción</a>
            </Notice>
            <div style={{ margin: "0 -16px" }}>
              <table className="table">
                <thead><tr><th>Billetera</th><th className="right">Antes</th><th className="right">Después</th></tr></thead>
                <tbody>
                  {Object.keys(result.balances_after).map((n) => {
                    const d = result.balances_after[n] - (result.balances_before[n] ?? 0);
                    return (
                      <tr key={n}>
                        <td>{n}</td>
                        <td className="right num">{result.balances_before[n] ?? 0}</td>
                        <td className={`right num ${d < 0 ? "bad-text" : d > 0 ? "ok-text" : ""}`}>{result.balances_after[n]}{d !== 0 && ` (${d > 0 ? "+" : ""}${d})`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </Inspector>
  );
}

function Strategies() {
  const { state, run, isAdmin } = useStore();
  const [seed, setSeed] = useState(state?.params.seed ?? 2026);
  const [bits, setBits] = useState(state?.params.entropy_bits ?? 3);
  const [cmp, setCmp] = useState<Record<"weak" | "rfc6979", DefenseStats> | null>(null);
  const [demo, setDemo] = useState<SignResult[]>([]);

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", alignItems: "start" }}>
      <Panel title="Misma simulación, distinto generador de k" actions={
        isAdmin && <AsyncButton size="sm" variant="primary" onRun={async () => { const r = await run(() => api.compareDefense(seed, bits)); if (r) setCmp(r); }}>Ejecutar</AsyncButton>
      }>
        <div className="stack">
          <div className="grid-2">
            <Field label="Semilla"><input className="input num" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></Field>
            <Field label="Entropía del RNG defectuoso (bits)"><input className="input num" type="number" min={1} max={16} value={bits} onChange={(e) => setBits(Number(e.target.value))} /></Field>
          </div>
          {cmp ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Métrica</th><th className="right">RNG defectuoso</th><th className="right">RFC 6979</th></tr></thead>
                <tbody>
                  {([
                    ["Firmas de Bob", "bob_signatures"],
                    ["r distintos de Bob", "bob_unique_r"],
                    ["Pares con r repetido", "pairs"],
                    ["Claves recuperadas", "recovered"],
                  ] as const).map(([label, key]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className={`right num ${key === "recovered" && cmp.weak[key] ? "bad-text" : ""}`}>{cmp.weak[key]}</td>
                      <td className={`right num ${key === "recovered" ? "ok-text" : ""}`}>{cmp.rfc6979[key]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : isAdmin ? <span className="small muted">Genera dos cadenas idénticas salvo por cómo Bob elige k, y les aplica el mismo análisis.</span>
            : <AdminRequired>La comparación genera dos redes completas en el servidor; la ejecuta el administrador.</AdminRequired>}
        </div>
      </Panel>

      <div className="stack">
        <Panel title="RFC 6979: k = HMAC-DRBG(d, H(m))">
          <div className="stack">
            <span className="small muted">El nonce sale de la clave y del mensaje. Mensajes distintos dan k independientes; el mismo mensaje da la misma firma, que no sirve para el ataque porque z₁ = z₂.</span>
            <AsyncButton size="sm" onRun={async () => {
              const a = await run(() => api.sign("pago de 10", null, "rfc6979"));
              if (!a) return;
              const b = await run(() => api.sign("pago de 10", a.d, "rfc6979"));
              const c = await run(() => api.sign("pago de 11", a.d, "rfc6979"));
              if (b && c) setDemo([a, b, c]);
            }}>Firmar tres mensajes con la misma clave</AsyncButton>
            {demo.length === 3 && (
              <div style={{ margin: "0 -16px -16px" }}>
                <table className="table">
                  <thead><tr><th>Mensaje</th><th>r</th></tr></thead>
                  <tbody>{demo.map((d, i) => <tr key={i}><td>{d.message}</td><td><Hex value={d.r} n={6} tone={i < 2 ? "accent" : undefined} /></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
        <Notice tone="warn" title="Cambiar el generador no protege firmas viejas">
          Si una clave ya repitió un nonce en la cadena, está comprometida. Hay que mover los fondos a una clave nueva.
          {isAdmin && <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => go("escenario")}>Configurar el escenario</Button></div>}
        </Notice>
      </div>
    </div>
  );
}
