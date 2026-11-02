import { RotateCcw, Scale, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../api";
import { AsyncButton, Badge, Callout, Card, Field, Hex, PageHead } from "../components/ui";
import { useStore } from "../store";
import type { DefenseStats, SignResult } from "../types";

export function Defense() {
  const { state, setState, run, notify } = useStore();
  const [cmp, setCmp] = useState<Record<"weak" | "rfc6979", DefenseStats> | null>(null);
  const [demo, setDemo] = useState<SignResult[]>([]);
  const [seed, setSeed] = useState<number | null>(null);
  const [bits, setBits] = useState<number | null>(null);
  if (!state) return null;
  const s = seed ?? state.params.seed;
  const b = bits ?? state.params.entropy_bits;
  const bob = state.wallets.find((w) => w.name === "Bob");

  return (
    <>
      <PageHead eyebrow="Paso 6" title="Defensa: nonces deterministas (RFC 6979)">
        En lugar de pedirle k a un generador aleatorio, se deriva de la clave y del mensaje con HMAC:
        k = HMAC-DRBG(d, H(m)). Mensajes distintos dan nonces independientes y ya no hay RNG que pueda fallar.
      </PageHead>

      <div className="split">
        <Card title={<><Scale size={16} /> Misma simulación, dos billeteras</>} actions={
          <AsyncButton variant="primary" onRun={async () => { const r = await run(() => api.compareDefense(s, b)); if (r) setCmp(r); }}>Comparar</AsyncButton>
        }>
          <div className="stack-lg">
            <div className="grid grid-2">
              <Field label="Semilla"><input className="input num" type="number" value={s} onChange={(e) => setSeed(Number(e.target.value))} /></Field>
              <Field label="Entropía del RNG débil (bits)"><input className="input num" type="number" min={1} max={16} value={b} onChange={(e) => setBits(Number(e.target.value))} /></Field>
            </div>
            {cmp ? (
              <div className="grid grid-2">
                <Column title="Bob con RNG defectuoso" tone="bad" stats={cmp.weak} />
                <Column title="Bob con RFC 6979" tone="ok" stats={cmp.rfc6979} />
              </div>
            ) : <p className="small muted">Se generan dos cadenas idénticas salvo por cómo Bob elige k, y se les aplica el mismo ataque.</p>}
          </div>
        </Card>

        <div className="stack-lg">
          <Card title={<><ShieldCheck size={16} /> Aplicar a la red</>}>
            <div className="stack">
              <p className="small muted">Bob usa ahora: <strong>{bob?.nonce_label ?? "—"}</strong></p>
              <AsyncButton variant="primary" icon={<RotateCcw size={14} />} onRun={async () => {
                const r = await run(() => api.reset({ ...state.params, victim_nonce: "rfc6979" }));
                if (r) { setState(r); notify("Red regenerada: Bob firma con RFC 6979"); }
              }}>Regenerar la red con RFC 6979</AsyncButton>
              <AsyncButton onRun={async () => {
                const r = await run(() => api.setNonce("Bob", "rfc6979"));
                if (r) notify("Bob firmará con RFC 6979 desde ahora");
              }}>Solo cambiar la billetera de Bob</AsyncButton>
              <Callout tone="warn" title="Cambiar la billetera no borra el pasado">
                Las firmas viejas con k repetido siguen en la cadena: si ya se publicaron, la clave está
                comprometida. La única salida es mover los fondos a una clave nueva antes que el atacante.
              </Callout>
            </div>
          </Card>

          <Card title="Determinismo" hint="La misma clave firmando con RFC 6979.">
            <div className="stack">
              <AsyncButton onRun={async () => {
                const a = await run(() => api.sign("pago de 10", null, "rfc6979"));
                if (!a) return;
                const a2 = await run(() => api.sign("pago de 10", a.d, "rfc6979"));
                const c = await run(() => api.sign("pago de 11", a.d, "rfc6979"));
                if (a2 && c) setDemo([a, a2, c]);
              }}>Firmar tres mensajes</AsyncButton>
              {demo.length === 3 && (
                <table className="table">
                  <thead><tr><th>mensaje</th><th>r</th></tr></thead>
                  <tbody>
                    {demo.map((d, i) => (
                      <tr key={i}><td>{d.message}</td><td><Hex value={d.r} n={6} tone={i < 2 ? "accent" : undefined} /></td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {demo.length === 3 && (
                <p className="xs muted">
                  El mismo mensaje da la misma firma ({demo[0].s === demo[1].s ? "s idéntico" : "s distinto"}), pero como z₁ = z₂ las
                  ecuaciones del ataque no dan nada. Un mensaje distinto da otro r.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Cómo funciona RFC 6979 (sección 3.2)">
        <ol className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li>V = 0x01 0x01 … (32 bytes), K = 0x00 0x00 … (32 bytes)</li>
          <li>K = HMAC<sub>K</sub>(V ‖ 0x00 ‖ d ‖ H(m)),  V = HMAC<sub>K</sub>(V)</li>
          <li>K = HMAC<sub>K</sub>(V ‖ 0x01 ‖ d ‖ H(m)),  V = HMAC<sub>K</sub>(V)</li>
          <li>V = HMAC<sub>K</sub>(V); si V como entero está en [1, n−1], k = V. Si no, se actualizan K y V y se repite.</li>
        </ol>
        <p className="xs muted" style={{ marginTop: 12 }}>
          Implementado en <code>minichain/nonces.py</code> y comprobado contra la librería <code>ecdsa</code> en las pruebas.
        </p>
      </Card>
    </>
  );
}

function Column({ title, tone, stats }: { title: string; tone: "ok" | "bad"; stats: DefenseStats }) {
  const rows: [string, number, number][] = [
    ["Firmas de Bob", stats.bob_signatures, stats.bob_signatures],
    ["r distintos de Bob", stats.bob_unique_r, stats.bob_signatures],
    ["Pares con r repetido", stats.pairs, Math.max(stats.pairs, 1)],
    ["Claves recuperadas", stats.recovered, 1],
  ];
  return (
    <div className={`card ${tone === "bad" ? "tone-bad" : "tone-ok"}`} style={{ padding: 16 }}>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <strong className="small">{title}</strong>
        <Badge tone={tone}>{stats.recovered > 0 ? "clave expuesta" : "a salvo"}</Badge>
      </div>
      <div className="bars">
        {rows.map(([label, v, max]) => (
          <div key={label} className="bar-row" style={{ gridTemplateColumns: "1fr 60px 28px" }}>
            <span className="xs muted">{label}</span>
            <div className="bar-track"><div className={`bar-fill ${tone}`} style={{ width: `${max ? Math.min(100, (v / max) * 100) : 0}%` }} /></div>
            <span className="num small right">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
