import { Crosshair, KeyRound, Search, Skull } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { AsyncButton, Badge, Callout, Card, Field, Hex, PageHead, Stat } from "../components/ui";
import { useStore } from "../store";
import type { AttackScan, Recovery, StealResult } from "../types";

export function Attack() {
  const { state, run, notify } = useStore();
  const [scan, setScan] = useState<AttackScan | null>(null);
  const [selected, setSelected] = useState(0);
  const [thief, setThief] = useState("Mallory");
  const [stolen, setStolen] = useState<StealResult | null>(null);

  const doScan = async () => {
    const s = await run(() => api.scan());
    if (s) { setScan(s); setSelected(0); setStolen(null); }
  };

  if (!state) return null;
  const colliding = new Set(scan?.collisions.map((c) => c.r) ?? []);
  const rec = scan?.recoveries[selected];

  return (
    <>
      <PageHead eyebrow="Paso 5" title="Recuperar una clave privada desde la cadena pública">
        Mallory no tiene acceso a ninguna billetera: solo lee los bloques. De cada transacción obtiene la
        clave pública Q, la firma (r, s) y z = SHA-256(mensaje). Si dos firmas de la misma clave comparten r,
        compartieron el nonce k.
      </PageHead>

      <Card title={<><Search size={16} /> 1 · Recolectar firmas</>} actions={
        <AsyncButton variant="primary" icon={<Search size={14} />} onRun={doScan}>{scan ? "Volver a escanear" : "Escanear la cadena"}</AsyncButton>
      }>
        {!scan ? <p className="small muted">El escaneo agrupa las firmas por (clave pública, r).</p> : (
          <div className="stack-lg">
            <div className="grid grid-4">
              <Stat label="Firmas" value={scan.signatures.length} />
              <Stat label="Valores de r distintos" value={scan.unique_r} />
              <Stat label="Pares con r repetido" value={scan.pairs} />
              <Stat label="Claves recuperadas" value={scan.recoveries.length} />
            </div>
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius)" }}>
              <table className="table">
                <thead><tr><th>bloque · tx</th><th>firmante</th><th>r</th><th>s</th><th>z</th></tr></thead>
                <tbody>
                  {scan.signatures.map((s) => (
                    <tr key={`${s.block}-${s.tx}`} className={colliding.has(s.r) ? "row-bad" : ""}>
                      <td className="num">{s.block} · {s.tx}</td>
                      <td>{s.name ?? <Hex value={s.address} n={5} />}</td>
                      <td><Hex value={s.r} n={6} tone={colliding.has(s.r) ? "bad" : undefined} /></td>
                      <td><Hex value={s.s} n={6} /></td>
                      <td><Hex value={s.z} n={6} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {scan.recoveries.length === 0 && (
              <Callout tone="ok" title="Ningún r se repite">
                Nadie reutilizó un nonce, así que no hay nada que despejar. Si Bob usa RFC 6979, el ataque no
                aplica; para verlo funcionar, regenera el escenario en Inicio con el RNG defectuoso.
              </Callout>
            )}
          </div>
        )}
      </Card>

      {rec && scan && (
        <div className="split">
          <Card title={<><KeyRound size={16} /> 2 · Despejar k y d</>} actions={
            scan.recoveries.length > 1 && (
              <select className="select" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
                {scan.recoveries.map((r, i) => <option key={r.address} value={i}>{r.name ?? r.address}</option>)}
              </select>
            )
          }>
            <RecoveryView rec={rec} />
          </Card>

          <Card title={<><Skull size={16} /> 3 · Robar</>} tone="bad">
            <div className="stack">
              <p className="small muted">
                Con d, Mallory firma una transferencia de todo el saldo de {rec.name ?? "la víctima"} hacia la billetera
                que elijas. La red la mina y el validador la acepta: la firma es matemáticamente correcta.
              </p>
              <Field label="Enviar los fondos a">
                <select className="select" value={thief} onChange={(e) => setThief(e.target.value)}>
                  {state.wallets.filter((w) => w.name !== rec.name).map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
                </select>
              </Field>
              <AsyncButton variant="danger" icon={<Crosshair size={14} />} onRun={async () => {
                const r = await run(() => api.steal(rec.name ?? rec.address, thief));
                if (r) { setStolen(r); notify(`Robo incluido en el bloque ${r.mined.block.index}`); }
              }}>Firmar como {rec.name ?? "la víctima"} y minar</AsyncButton>
              {stolen && <StealView result={stolen} />}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function RecoveryView({ rec }: { rec: Recovery }) {
  return (
    <div className="derivation">
      <div className="derivation-step">
        <div className="n bad">!</div>
        <div style={{ minWidth: 0 }}>
          <div className="title">Mismo r en dos transacciones de {rec.name ?? "la víctima"}</div>
          <div className="eq">bloque {rec.first.block} tx {rec.first.tx} y bloque {rec.second.block} tx {rec.second.tx}</div>
          <dl className="kv xs">
            <dt>r</dt><dd><Hex value={rec.r} n={12} tone="bad" /></dd>
            <dt>s₁, z₁</dt><dd className="row"><Hex value={rec.first.s} n={6} /><Hex value={rec.first.z} n={6} /></dd>
            <dt>s₂, z₂</dt><dd className="row"><Hex value={rec.second.s} n={6} /><Hex value={rec.second.z} n={6} /></dd>
          </dl>
        </div>
      </div>
      <div className="derivation-step">
        <div className="n">1</div>
        <div style={{ minWidth: 0 }}>
          <div className="title">Restar las dos firmas elimina d</div>
          <div className="formula xs">s₁ − s₂ ≡ k⁻¹(z₁ − z₂)  ⇒  k ≡ (z₁ − z₂)(s₁ − s₂)⁻¹ (mod n)</div>
          <dl className="kv xs" style={{ marginTop: 8 }}>
            <dt>z₁ − z₂</dt><dd><Hex value={rec.z_diff} n={10} /></dd>
            <dt>(s₁ − s₂)⁻¹</dt><dd>{rec.s_diff_inv ? <Hex value={rec.s_diff_inv} n={10} /> : <span className="muted">firma normalizada (low-s): se usó −s₂</span>}</dd>
            <dt>k</dt><dd><Hex value={rec.k} n={10} tone="accent" /></dd>
          </dl>
        </div>
      </div>
      <div className="derivation-step">
        <div className="n">2</div>
        <div style={{ minWidth: 0 }}>
          <div className="title">Despejar la clave privada</div>
          <div className="formula xs">s₁·k ≡ z₁ + r·d  ⇒  d ≡ (s₁·k − z₁)·r⁻¹ (mod n)</div>
          <dl className="kv xs" style={{ marginTop: 8 }}>
            <dt>r⁻¹</dt><dd><Hex value={rec.r_inv} n={10} /></dd>
            <dt>d</dt><dd><Hex value={rec.d} n={10} tone="bad" /></dd>
          </dl>
        </div>
      </div>
      <div className="derivation-step">
        <div className={`n ${rec.dG_matches_pubkey ? "ok" : "bad"}`}>3</div>
        <div style={{ minWidth: 0 }}>
          <div className="title">Comprobarlo con datos públicos</div>
          <div className="eq">d·G debe ser la clave pública publicada en sus transacciones</div>
          <div className="row">
            {rec.dG_matches_pubkey ? <Badge tone="ok">d·G = Q</Badge> : <Badge tone="bad">no coincide</Badge>}
            {rec.matches_real_key && <Badge tone="bad">idéntica a la clave real de {rec.name}</Badge>}
          </div>
          <p className="xs faint" style={{ marginTop: 6 }}>La segunda comprobación solo la puede hacer el servidor, que conoce la clave real.</p>
        </div>
      </div>
    </div>
  );
}

function StealView({ result }: { result: StealResult }) {
  const names = Object.keys(result.balances_after);
  return (
    <div className="stack">
      <Callout tone={result.validation.ok ? "warn" : "ok"} title={result.validation.ok ? "El validador acepta la cadena" : "Rechazada"}>
        Bloque {result.mined.block.index} minado. {result.validation.blocks_checked} bloques y {result.validation.signatures_checked} firmas
        verificadas, incluida la falsificada.
      </Callout>
      <table className="table">
        <thead><tr><th>billetera</th><th className="right">antes</th><th className="right">después</th></tr></thead>
        <tbody>
          {names.map((n) => {
            const d = result.balances_after[n] - (result.balances_before[n] ?? 0);
            return (
              <tr key={n}>
                <td>{n}</td>
                <td className="right num">{result.balances_before[n] ?? 0}</td>
                <td className={`right num ${d < 0 ? "bad-text" : d > 0 ? "ok-text" : ""}`}>
                  {result.balances_after[n]} {d !== 0 && <span className="xs">({d > 0 ? "+" : ""}{d})</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
