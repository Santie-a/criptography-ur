import { KeyRound, PenLine, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api";
import { AsyncButton, Badge, Button, Callout, Card, Field, Hex, PageHead, Segmented } from "../components/ui";
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
    setOtherMsg(r.message + " (alterado)");
    setOtherCheck(null);
    setHistory((h) => [r, ...h].slice(0, 12));
  };

  // Firmas de la misma clave con el mismo r sobre mensajes distintos.
  const reuse = useMemo(() => {
    for (let i = 0; i < history.length; i++)
      for (let j = i + 1; j < history.length; j++) {
        const a = history[i], b = history[j];
        if (a.d === b.d && a.r === b.r && a.z !== b.z) return [a, b] as const;
      }
    return null;
  }, [history]);
  // r -> cantidad de mensajes distintos firmados con ese r (misma firma repetida no cuenta).
  const repeatedR = useMemo(() => {
    const zs = new Map<string, Set<string>>();
    history.forEach((h) => zs.set(h.r, (zs.get(h.r) ?? new Set()).add(h.z)));
    return new Map([...zs].map(([r, set]) => [r, set.size]));
  }, [history]);

  const v = result?.verification;

  return (
    <>
      <PageHead eyebrow="Paso 2" title="Firmar y verificar con ECDSA">
        La firma de un mensaje m es el par (r, s). Aquí se ven todos los números intermedios, incluido el
        nonce k, que en una billetera real nunca sale del dispositivo.
      </PageHead>

      <div className="split">
        <div className="stack-lg">
          <Card title="Firmar">
            <div className="stack-lg">
              <Field label="Mensaje m">
                <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
              </Field>
              <Field label="Clave privada d (hex; vacío = generar una)" group>
                <div className="row">
                  <input className="input mono grow" value={key} placeholder="se genera al firmar"
                    onChange={(e) => setKey(e.target.value)} />
                  <Button variant="ghost" icon={<RefreshCw size={14} />} onClick={() => setKey("")}>Nueva</Button>
                </div>
              </Field>
              <Field label="Cómo se elige k" group>
                <Segmented value={nonce} onChange={setNonce} options={[
                  { value: "rfc6979", label: "RFC 6979" },
                  { value: "random", label: "Aleatorio" },
                  { value: "fixed", label: "Fijo (inseguro)" },
                ]} />
              </Field>
              {nonce === "fixed" && (
                <Field label="k (hex)">
                  <input className="input mono" value={k} onChange={(e) => setK(e.target.value)} />
                </Field>
              )}
              <div className="row-between">
                <p className="small muted">
                  {nonce === "fixed"
                    ? "Firma dos mensajes distintos con el mismo k y mira qué pasa abajo."
                    : nonce === "rfc6979" ? "k = HMAC-DRBG(d, H(m)): mismo mensaje, misma firma." : "k uniforme del generador del sistema operativo."}
                </p>
                <AsyncButton variant="primary" icon={<PenLine size={14} />} onRun={sign}>Firmar</AsyncButton>
              </div>
            </div>
          </Card>

          <Card title="Firmas de esta sesión" hint="Si dos comparten r, comparten k." flush
            actions={history.length > 0 && <Button size="sm" variant="ghost" icon={<Trash2 size={12} />} onClick={() => { setHistory([]); setRecovered(null); }}>Limpiar</Button>}>
            {history.length === 0 ? <div className="empty">Aún no hay firmas.</div> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>mensaje</th><th>k</th><th>r</th><th>s</th></tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i} className={(repeatedR.get(h.r) ?? 0) > 1 ? "row-bad" : ""}>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.message}</td>
                        <td><Badge tone={h.nonce === "fixed" ? "bad" : h.nonce === "rfc6979" ? "ok" : "accent"}>{h.nonce}</Badge></td>
                        <td><Hex value={h.r} n={6} tone={(repeatedR.get(h.r) ?? 0) > 1 ? "bad" : undefined} /></td>
                        <td><Hex value={h.s} n={6} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {reuse && (
            <Card title="Nonce repetido" tone="bad">
              <div className="stack">
                <Callout tone="bad" title="Dos mensajes distintos, mismo r">
                  Con solo datos públicos (r, s₁, z₁, s₂, z₂ y la clave pública) se puede despejar k y luego d.
                </Callout>
                <AsyncButton variant="danger" icon={<KeyRound size={14} />} onRun={async () => {
                  const [a, b] = reuse;
                  const r = await run(() => api.recover({ r: a.r, s1: a.s, z1: a.z, s2: b.s, z2: b.z, pubkey: a.Q.compressed }));
                  if (r) setRecovered(r);
                }}>Recuperar la clave privada</AsyncButton>
                {recovered && (
                  <dl className="kv">
                    <dt>k</dt><dd><Hex value={recovered.k} n={12} /></dd>
                    <dt>d</dt><dd><Hex value={recovered.d} n={12} tone="bad" /></dd>
                    <dt>d·G = Q</dt><dd>{recovered.matches_pubkey ? <Badge tone="bad">sí: clave comprometida</Badge> : <Badge>no</Badge>}</dd>
                    <dt>¿Es la clave real?</dt><dd>{recovered.d === reuse[0].d ? "Sí, idéntica." : "No"}</dd>
                  </dl>
                )}
              </div>
            </Card>
          )}
        </div>

        <Card title="Paso a paso" hint={result ? undefined : "Firma un mensaje para ver la derivación."}>
          {result && v ? (
            <div className="derivation">
              <Step n={1} title="Claves" eq="Q = d·G">
                <dl className="kv xs"><dt>d</dt><dd><Hex value={result.d} n={10} /></dd><dt>Q</dt><dd><Hex value={result.Q.compressed} n={10} /></dd></dl>
              </Step>
              <Step n={2} title="Hash del mensaje" eq="z = SHA-256(m)">
                <Hex value={result.z} n={12} />
              </Step>
              <Step n={3} title="Nonce" eq={result.nonce === "rfc6979" ? "k = HMAC-DRBG(d, z)" : result.nonce === "fixed" ? "k elegido a mano" : "k ← aleatorio en [1, n−1]"}>
                <Hex value={result.k} n={12} tone={result.nonce === "fixed" ? "bad" : undefined} />
              </Step>
              <Step n={4} title="Punto R" eq="R = k·G,  r = R.x mod n">
                <Hex value={result.r} n={12} tone="accent" />
              </Step>
              <Step n={5} title="Segunda mitad" eq="s = k⁻¹ (z + r·d) mod n">
                <Hex value={result.s} n={12} tone="accent" />
              </Step>
              <Step n={6} title="Verificación (solo con Q)" eq="w = s⁻¹,  u₁ = z·w,  u₂ = r·w,  X = u₁G + u₂Q" tone={v.valid ? "ok" : "bad"}>
                <dl className="kv xs">
                  <dt>u₁</dt><dd><Hex value={v.u1!} n={8} /></dd>
                  <dt>u₂</dt><dd><Hex value={v.u2!} n={8} /></dd>
                  <dt>X.x mod n</dt><dd><Hex value={v.x_mod_n!} n={8} tone={v.valid ? "ok" : "bad"} /></dd>
                </dl>
                <div style={{ marginTop: 6 }}>{v.valid ? <Badge tone="ok">X.x mod n = r · firma válida</Badge> : <Badge tone="bad">inválida</Badge>}</div>
              </Step>
              <div className="divider" />
              <div className="stack" style={{ paddingTop: 8 }}>
                <Field label="¿Y si el mensaje cambia? Verificar la misma firma sobre:">
                  <input className="input" value={otherMsg} onChange={(e) => setOtherMsg(e.target.value)} />
                </Field>
                <div className="row">
                  <AsyncButton size="sm" onRun={async () => {
                    const c = await run(() => api.verify(otherMsg, result.Q.compressed, result.r, result.s));
                    if (c) setOtherCheck(c);
                  }}>Verificar</AsyncButton>
                  {otherCheck && (otherCheck.valid ? <Badge tone="ok">válida</Badge> : <Badge tone="bad">inválida: X.x mod n ≠ r</Badge>)}
                </div>
              </div>
            </div>
          ) : <p className="small muted">El resultado aparecerá aquí.</p>}
        </Card>
      </div>
    </>
  );
}

function Step({ n, title, eq, tone, children }: { n: number; title: string; eq: string; tone?: "ok" | "bad"; children: React.ReactNode }) {
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
