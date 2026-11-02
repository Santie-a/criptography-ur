// Laboratorio ECDSA: firmar con parámetros a la vista y ver cada valor
// intermedio. El historial detecta r repetidos y ofrece recuperar la clave.
import { KeyRound, PenLine, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { AsyncButton, Button, Field, Hex, Notice, PageHeader, Panel, Section, Switcher, Tag } from "../components/ui";
import { useStore } from "../store";
import type { RecoverResult, SignResult, VerifySteps } from "../types";

type Nonce = "rfc6979" | "random" | "fixed";

export function SignLab() {
  const { run } = useStore();
  const [message, setMessage] = useState("Alice paga 10 monedas a Bob");
  const [key, setKey] = useState("");
  const [nonce, setNonce] = useState<Nonce>("rfc6979");
  const [k, setK] = useState("c0ffee");
  const [result, setResult] = useState<SignResult | null>(null);
  const [history, setHistory] = useState<SignResult[]>([]);
  const [otherMsg, setOtherMsg] = useState("");
  const [otherCheck, setOtherCheck] = useState<VerifySteps | null>(null);
  const [recovered, setRecovered] = useState<RecoverResult | null>(null);

  const sign = async () => {
    const r = await run(() => api.sign(message, key || null, nonce, nonce === "fixed" ? k : undefined));
    if (!r) return;
    setResult(r);
    setKey(r.d);
    setOtherMsg(`${r.message} (alterado)`);
    setOtherCheck(null);
    setHistory((h) => [r, ...h].slice(0, 20));
  };

  // r -> número de mensajes distintos firmados con ese r por la misma clave.
  const reusedR = useMemo(() => {
    const zs = new Map<string, Set<string>>();
    history.forEach((h) => zs.set(`${h.d}:${h.r}`, (zs.get(`${h.d}:${h.r}`) ?? new Set()).add(h.z)));
    return new Set([...zs].filter(([, s]) => s.size > 1).map(([kk]) => kk.split(":")[1]));
  }, [history]);
  const reuse = useMemo(() => {
    for (let i = 0; i < history.length; i++)
      for (let j = i + 1; j < history.length; j++) {
        const a = history[i], b = history[j];
        if (a.d === b.d && a.r === b.r && a.z !== b.z) return [a, b] as const;
      }
    return null;
  }, [history]);

  const v = result?.verification;

  return (
    <>
      <PageHeader crumbs={[{ label: "Laboratorio" }, { label: "ECDSA" }]} title="Firma ECDSA"
        sub="Firma (r, s) con r = (k·G).x mod n y s = k⁻¹(z + r·d) mod n. Aquí el nonce k es visible para estudiarlo." />
      <div className="workbench">
        <div className="params">
          <Field label="Mensaje m">
            <textarea className="textarea" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Field label="Clave privada d (hex)" help="Vacía: se genera una nueva al firmar." group>
            <div className="row-nowrap">
              <input className="input mono grow" value={key} placeholder="se genera al firmar" onChange={(e) => setKey(e.target.value)} />
              <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={() => setKey("")} aria-label="Nueva clave" title="Nueva clave" />
            </div>
          </Field>
          <Field label="Generación de k" group>
            <Switcher label="Generación de k" value={nonce} onChange={setNonce} items={[
              { value: "rfc6979", label: "RFC 6979" },
              { value: "random", label: "Aleatorio" },
              { value: "fixed", label: "Fijo" },
            ]} />
          </Field>
          {nonce === "fixed" && (
            <Field label="k (hex)" help="Inseguro: firma dos mensajes distintos con el mismo k.">
              <input className="input mono" value={k} onChange={(e) => setK(e.target.value)} />
            </Field>
          )}
          <AsyncButton variant="primary" icon={<PenLine size={14} />} onRun={sign}>Firmar</AsyncButton>
        </div>

        <div className="stage">
          <Panel title="Firmas de esta sesión" meta={history.length ? ` · ${history.length}` : ""} flush
            actions={history.length > 0 && <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => { setHistory([]); setRecovered(null); }}>Limpiar</Button>}>
            {history.length === 0 ? <div className="empty">Aún no hay firmas.</div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Mensaje</th><th>k</th><th>r</th><th>s</th></tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i} className={reusedR.has(h.r) ? "row-bad" : ""}>
                        <td className="truncate" style={{ maxWidth: 220 }}>{h.message}</td>
                        <td><Tag tone={h.nonce === "fixed" ? "bad" : h.nonce === "rfc6979" ? "ok" : "accent"}>{h.nonce === "fixed" ? "fijo" : h.nonce === "random" ? "aleatorio" : "RFC 6979"}</Tag></td>
                        <td><Hex value={h.r} n={6} tone={reusedR.has(h.r) ? "bad" : undefined} /></td>
                        <td><Hex value={h.s} n={6} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {reuse && (
            <Panel title="Nonce repetido detectado" tone="bad">
              <div className="stack">
                <span className="small">Dos mensajes distintos de la misma clave comparten r. Con r, s₁, z₁, s₂, z₂ y la clave pública basta para despejar k y d.</span>
                <div><AsyncButton variant="danger" icon={<KeyRound size={14} />} onRun={async () => {
                  const [a, b] = reuse;
                  const r = await run(() => api.recover({ r: a.r, s1: a.s, z1: a.z, s2: b.s, z2: b.z, pubkey: a.Q.compressed }));
                  if (r) setRecovered(r);
                }}>Recuperar la clave privada</AsyncButton></div>
                {recovered && (
                  <dl className="kv">
                    <dt>k</dt><dd><Hex value={recovered.k} n={12} /></dd>
                    <dt>d</dt><dd><Hex value={recovered.d} n={12} tone="bad" /></dd>
                    <dt>d·G = Q</dt><dd>{recovered.matches_pubkey ? <Tag tone="bad">sí: clave comprometida</Tag> : <Tag>no</Tag>}</dd>
                    <dt>¿Es la clave real?</dt><dd>{recovered.d === reuse[0].d ? "Sí, idéntica" : "No"}</dd>
                  </dl>
                )}
              </div>
            </Panel>
          )}
        </div>

        <div className="results">
          <div className="inspector-head"><h2>Derivación</h2>{v && (v.valid ? <Tag tone="ok">firma válida</Tag> : <Tag tone="bad">inválida</Tag>)}</div>
          <div className="inspector-body">
            {result && v ? (
              <>
                <div className="derivation">
                  <Step n={1} title="Claves" eq="Q = d·G">
                    <dl className="kv"><dt>d</dt><dd><Hex value={result.d} n={10} /></dd><dt>Q</dt><dd><Hex value={result.Q.compressed} n={10} /></dd></dl>
                  </Step>
                  <Step n={2} title="Hash" eq="z = SHA-256(m)"><Hex value={result.z} n={12} /></Step>
                  <Step n={3} title="Nonce" eq={result.nonce === "rfc6979" ? "k = HMAC-DRBG(d, z)" : result.nonce === "fixed" ? "k elegido a mano" : "k ← aleatorio en [1, n−1]"}>
                    <Hex value={result.k} n={12} tone={result.nonce === "fixed" ? "bad" : undefined} />
                  </Step>
                  <Step n={4} title="r" eq="R = k·G,  r = R.x mod n"><Hex value={result.r} n={12} tone="accent" /></Step>
                  <Step n={5} title="s" eq="s = k⁻¹ (z + r·d) mod n"><Hex value={result.s} n={12} tone="accent" /></Step>
                  <Step n={6} title="Verificación (solo con Q)" eq="w = s⁻¹, u₁ = z·w, u₂ = r·w, X = u₁G + u₂Q" tone={v.valid ? "ok" : "bad"}>
                    <dl className="kv">
                      <dt>u₁</dt><dd><Hex value={v.u1!} n={8} /></dd>
                      <dt>u₂</dt><dd><Hex value={v.u2!} n={8} /></dd>
                      <dt>X.x mod n</dt><dd><Hex value={v.x_mod_n!} n={8} tone={v.valid ? "ok" : "bad"} /></dd>
                    </dl>
                  </Step>
                </div>
                <Section title="Verificar la misma firma sobre otro mensaje">
                  <input className="input" value={otherMsg} onChange={(e) => setOtherMsg(e.target.value)} />
                  <div className="row">
                    <AsyncButton size="sm" onRun={async () => {
                      const c = await run(() => api.verify(otherMsg, result.Q.compressed, result.r, result.s));
                      if (c) setOtherCheck(c);
                    }}>Verificar</AsyncButton>
                    {otherCheck && (otherCheck.valid ? <Tag tone="ok">válida</Tag> : <Tag tone="bad">inválida: X.x mod n ≠ r</Tag>)}
                  </div>
                </Section>
              </>
            ) : <Notice>Firma un mensaje para ver cada valor intermedio.</Notice>}
          </div>
        </div>
      </div>
    </>
  );
}

function Step({ n, title, eq, tone, children }: { n: number; title: string; eq: string; tone?: "ok" | "bad"; children: ReactNode }) {
  return (
    <div className="derivation-step">
      <div className={`n ${tone ?? ""}`}>{n}</div>
      <div style={{ minWidth: 0 }}>
        <div className="title">{title}</div>
        <div className="eq">{eq}</div>
        {children}
      </div>
    </div>
  );
}
