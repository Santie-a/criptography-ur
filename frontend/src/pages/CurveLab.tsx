import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { AsyncButton, Badge, Card, Field, Hex, PageHead, Segmented } from "../components/ui";
import { useStore } from "../store";
import type { CurveAdd, CurveMul, CurvePoints, Pt, Secp256k1Info } from "../types";

const PRESETS = [
  { label: "y² = x³ + 2x + 3 (mod 97)", p: 97, a: 2, b: 3 },
  { label: "y² = x³ + 7 (mod 67) · forma de secp256k1", p: 67, a: 0, b: 7 },
  { label: "y² = x³ − x (mod 71)", p: 71, a: -1, b: 0 },
  { label: "y² = x³ + 7 (mod 251)", p: 251, a: 0, b: 7 },
];

const key = (p: Pt) => (p ? `${p[0]},${p[1]}` : "O");
const fmt = (p: Pt) => (p ? `(${p[0]}, ${p[1]})` : "O");

export function CurveLab() {
  const { run } = useStore();
  const [params, setParams] = useState(PRESETS[0]);
  const [curve, setCurve] = useState<CurvePoints | null>(null);
  const [mode, setMode] = useState<"add" | "mul">("add");
  const [P, setP] = useState<Pt>(null);
  const [Q, setQ] = useState<Pt>(null);
  const [k, setK] = useState(13);
  const [sum, setSum] = useState<CurveAdd | null>(null);
  const [mul, setMul] = useState<CurveMul | null>(null);
  const [secp, setSecp] = useState<Secp256k1Info | null>(null);

  useEffect(() => {
    run(() => api.curve(params.p, params.a, params.b)).then((c) => {
      if (!c) return;
      setCurve(c);
      setP(c.points[0] ?? null);
      setQ(c.points[1] ?? null);
      setSum(null);
      setMul(null);
    });
  }, [params, run]);

  useEffect(() => {
    run(() => api.secp256k1()).then((s) => s && setSecp(s));
  }, [run]);

  // Recalcula P + Q al cambiar la selección.
  useEffect(() => {
    if (!curve || mode !== "add" || !P) return;
    run(() => api.curveAdd(curve.p, curve.a, curve.b, P, Q)).then((r) => r && setSum(r));
  }, [curve, P, Q, mode, run]);

  const clickPoint = (pt: [number, number]) => {
    if (mode === "mul") {
      setP(pt);
      setMul(null);
      return;
    }
    // Primer clic: P. Segundo: Q. El siguiente vuelve a empezar.
    if (key(pt) === key(P) || (P && Q && key(P) !== key(Q))) {
      setP(pt);
      setQ(pt);
    } else {
      setQ(pt);
    }
  };

  const trail = useMemo(() => {
    const m = new Map<string, number>();
    mul?.steps.forEach((s, i) => s.point && m.set(key(s.point), i + 1));
    return m;
  }, [mul]);

  const highlight = (pt: [number, number]) => {
    const kk = key(pt);
    if (mode === "add") {
      if (sum?.R && kk === key(sum.R)) return "R";
      if (kk === key(P)) return "P";
      if (kk === key(Q)) return "Q";
    } else {
      if (mul?.result && kk === key(mul.result)) return "R";
      if (kk === key(P)) return "P";
      if (trail.has(kk)) return "trail";
    }
    return "";
  };

  const size = 520;
  const pad = 28;
  const pp = curve?.p ?? 97;
  const sx = (x: number) => pad + (x / (pp - 1)) * (size - 2 * pad);
  const sy = (y: number) => size - pad - (y / (pp - 1)) * (size - 2 * pad);
  const r = pp > 150 ? 2.2 : pp > 80 ? 3.4 : 4.2;

  return (
    <>
      <PageHead eyebrow="Paso 1" title="La curva como grupo">
        Una curva pequeña sobre F_p para ver lo que en secp256k1 ocurre con números de 256 bits. Los puntos,
        junto con el punto en el infinito O, forman un grupo: P + Q siempre es otro punto de la curva.
      </PageHead>

      <div className="split">
        <Card
          title={curve ? `E(F_${curve.p}) tiene ${curve.order} puntos` : "Curva"}
          hint={curve ? `Incluye O. Por el teorema de Hasse, #E está entre ${curve.hasse_bound[0]} y ${curve.hasse_bound[1]}.` : undefined}
          actions={<Segmented value={mode} onChange={(m) => { setMode(m); setMul(null); }}
            options={[{ value: "add", label: "P + Q" }, { value: "mul", label: "k · P" }]} />}
        >
          <svg className="plot" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Puntos de la curva">
            <line className="axis" x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} />
            <line className="axis" x1={pad} y1={pad} x2={pad} y2={size - pad} />
            <line className="gridline" x1={pad} y1={sy((pp - 1) / 2)} x2={size - pad} y2={sy((pp - 1) / 2)} strokeDasharray="4 4" />
            <text className="label" x={pad} y={size - 8}>0</text>
            <text className="label" x={size - pad} y={size - 8} textAnchor="end">x = {pp - 1}</text>
            <text className="label" x={4} y={pad + 4}>{pp - 1}</text>
            {curve?.points.map((pt) => {
              const h = highlight(pt);
              return (
                <circle key={key(pt)} className={`pt ${h}`} cx={sx(pt[0])} cy={sy(pt[1])}
                  r={h && h !== "trail" ? r + 2.5 : r} onClick={() => clickPoint(pt)}>
                  <title>{fmt(pt)}{trail.has(key(pt)) ? ` · paso ${trail.get(key(pt))}` : ""}</title>
                </circle>
              );
            })}
          </svg>
          <div className="legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: "var(--accent)" }} />P</span>
            {mode === "add" && <span><i style={{ background: "var(--warn)" }} />Q</span>}
            {mode === "mul" && <span><i style={{ background: "var(--iris-7)" }} />puntos intermedios</span>}
            <span><i style={{ background: "var(--ok)" }} />{mode === "add" ? "P + Q" : "k · P"}</span>
            <span className="faint">La línea punteada es el eje de simetría: (x, y) y (x, −y) son inversos.</span>
          </div>
        </Card>

        <div className="stack-lg">
          <Card title="Curva">
            <div className="stack">
              <Field label="Ejemplos">
                <select className="select" value={PRESETS.findIndex((x) => x.p === params.p && x.a === params.a && x.b === params.b)}
                  onChange={(e) => setParams(PRESETS[Number(e.target.value)])}>
                  {PRESETS.map((pr, i) => <option key={pr.label} value={i}>{pr.label}</option>)}
                  <option value={-1} disabled>Personalizada</option>
                </select>
              </Field>
              <CustomCurve value={params} onApply={(c) => setParams({ ...c, label: "" })} />
            </div>
          </Card>

          {mode === "add" ? (
            <Card title="Suma de puntos" hint="Clic en un punto para P y en otro para Q. El mismo punto dos veces es una duplicación.">
              {sum ? (
                <div className="stack">
                  <div className="formula">{fmt(sum.P)} + {fmt(sum.Q)} = <strong className="ok-text">{fmt(sum.R)}</strong></div>
                  <Badge tone={sum.case === "tangent" ? "warn" : sum.case === "inverse" ? "bad" : "accent"}>
                    {{ secant: "secante", tangent: "tangente (duplicación)", inverse: "P + (−P) = O", identity: "neutro" }[sum.case]}
                  </Badge>
                  <p className="small muted">{sum.explanation}</p>
                  {sum.lambda !== null && sum.R && (
                    <div className="formula xs">
                      x₃ = λ² − x₁ − x₂ = {sum.R[0]}<br />y₃ = λ(x₁ − x₃) − y₁ = {sum.R[1]}
                    </div>
                  )}
                </div>
              ) : <p className="small muted">Elige P en el gráfico.</p>}
            </Card>
          ) : (
            <Card title="Double-and-add" hint="Por cada bit de k: duplicar, y si el bit es 1, sumar P.">
              <div className="stack">
                <div className="row">
                  <Field label={`k (P = ${fmt(P)})`}>
                    <input className="input num" type="number" min={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
                  </Field>
                  <div style={{ alignSelf: "flex-end" }}>
                    <AsyncButton variant="primary" icon={<Play size={14} />} disabled={!P}
                      onRun={async () => { const m = await run(() => api.curveMul(pp, curve!.a, curve!.b, P, k)); if (m) setMul(m); }}>
                      Calcular
                    </AsyncButton>
                  </div>
                </div>
                {mul && (
                  <>
                    <div className="formula">{mul.k} = {mul.binary}₂ → {mul.k}·P = <strong className="ok-text">{fmt(mul.result)}</strong></div>
                    <p className="small muted">
                      {mul.operations} operaciones en lugar de {mul.k - 1} sumas. El orden de P es {mul.order}
                      {mul.k % mul.order === 0 ? `, así que ${mul.k}·P = O.` : mul.k > mul.order ? `: ${mul.k}·P = ${mul.k % mul.order}·P.` : "."}
                    </p>
                    <div className="table-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
                      <table className="table">
                        <thead><tr><th>bit</th><th>operación</th><th>R</th></tr></thead>
                        <tbody>
                          {mul.steps.map((s, i) => (
                            <tr key={i}>
                              <td className="mono">{s.bit}</td>
                              <td>{s.op === "double" ? "R ← 2R" : "R ← R + P"}</td>
                              <td className="mono">{fmt(s.point)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {secp && (
        <Card title="La curva real: secp256k1" hint="Las mismas fórmulas, pero con un primo de 256 bits. Imposible de dibujar; fácil de calcular.">
          <dl className="kv">
            <dt>Ecuación</dt><dd>{secp.equation} sobre F_p</dd>
            <dt>p ({secp.p_bits} bits)</dt><dd><Hex value={secp.p} full /></dd>
            <dt>n, orden de G ({secp.n_bits} bits)</dt><dd><Hex value={secp.n} full /></dd>
            <dt>G</dt><dd className="stack" style={{ gap: 4 }}><Hex value={secp.gx} full /><Hex value={secp.gy} full /></dd>
            <dt>Cofactor</dt><dd>{secp.h}: todos los puntos están en el subgrupo generado por G</dd>
          </dl>
        </Card>
      )}
    </>
  );
}

function CustomCurve({ value, onApply }: { value: { p: number; a: number; b: number }; onApply: (v: { p: number; a: number; b: number }) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="row" style={{ alignItems: "flex-end" }}>
      <div className="grid grid-3 grow">
        <Field label="p (primo)"><input className="input num" type="number" value={v.p} onChange={(e) => setV({ ...v, p: Number(e.target.value) })} /></Field>
        <Field label="a"><input className="input num" type="number" value={v.a} onChange={(e) => setV({ ...v, a: Number(e.target.value) })} /></Field>
        <Field label="b"><input className="input num" type="number" value={v.b} onChange={(e) => setV({ ...v, b: Number(e.target.value) })} /></Field>
      </div>
      <button className="btn" onClick={() => onApply(v)}>Aplicar</button>
    </div>
  );
}
