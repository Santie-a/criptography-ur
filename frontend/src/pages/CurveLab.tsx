// Laboratorio de curva: banco de trabajo con parámetros a la izquierda,
// el lienzo al centro y los resultados a la derecha.
import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { AsyncButton, Field, Hex, PageHeader, Section, Switcher, Tag } from "../components/ui";
import { useStore } from "../store";
import type { CurveAdd, CurveMul, CurvePoints, Pt, Secp256k1Info } from "../types";

const PRESETS = [
  { label: "y² = x³ + 2x + 3 (mod 97)", p: 97, a: 2, b: 3 },
  { label: "y² = x³ + 7 (mod 67)", p: 67, a: 0, b: 7 },
  { label: "y² = x³ − x (mod 71)", p: 71, a: -1, b: 0 },
  { label: "y² = x³ + 7 (mod 251)", p: 251, a: 0, b: 7 },
];

const key = (p: Pt) => (p ? `${p[0]},${p[1]}` : "O");
const fmt = (p: Pt) => (p ? `(${p[0]}, ${p[1]})` : "O");

export function CurveLab() {
  const { run } = useStore();
  const [params, setParams] = useState({ p: 97, a: 2, b: 3 });
  const [draft, setDraft] = useState(params);
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
  useEffect(() => { run(() => api.secp256k1()).then((s) => s && setSecp(s)); }, [run]);
  useEffect(() => {
    if (!curve || mode !== "add" || !P) return;
    run(() => api.curveAdd(curve.p, curve.a, curve.b, P, Q)).then((r) => r && setSum(r));
  }, [curve, P, Q, mode, run]);

  const clickPoint = (pt: [number, number]) => {
    if (mode === "mul") { setP(pt); setMul(null); return; }
    if (key(pt) === key(P) || (P && Q && key(P) !== key(Q))) { setP(pt); setQ(pt); } else setQ(pt);
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

  const size = 560;
  const pad = 30;
  const pp = curve?.p ?? 97;
  const sx = (x: number) => pad + (x / (pp - 1)) * (size - 2 * pad);
  const sy = (y: number) => size - pad - (y / (pp - 1)) * (size - 2 * pad);
  const r = pp > 150 ? 2.4 : pp > 80 ? 3.4 : 4.2;
  const presetIdx = PRESETS.findIndex((x) => x.p === params.p && x.a === params.a && x.b === params.b);

  return (
    <>
      <PageHeader crumbs={[{ label: "Laboratorio" }, { label: "Curva elíptica" }]} title="Curva elíptica sobre F_p"
        sub="Una curva pequeña para ver el grupo de puntos. secp256k1 usa las mismas fórmulas con p de 256 bits." />
      <div className="workbench">
        <div className="params">
          <Field label="Curva">
            <select className="select" value={presetIdx} onChange={(e) => { const pr = PRESETS[Number(e.target.value)]; setParams(pr); setDraft(pr); }}>
              {PRESETS.map((pr, i) => <option key={pr.label} value={i}>{pr.label}</option>)}
              <option value={-1} disabled>Personalizada</option>
            </select>
          </Field>
          <div className="grid-3">
            <Field label="p"><input className="input num" type="number" value={draft.p} onChange={(e) => setDraft({ ...draft, p: Number(e.target.value) })} /></Field>
            <Field label="a"><input className="input num" type="number" value={draft.a} onChange={(e) => setDraft({ ...draft, a: Number(e.target.value) })} /></Field>
            <Field label="b"><input className="input num" type="number" value={draft.b} onChange={(e) => setDraft({ ...draft, b: Number(e.target.value) })} /></Field>
          </div>
          <button className="btn" onClick={() => setParams(draft)}>Aplicar parámetros</button>
          <div className="divider" />
          <Field label="Operación" group>
            <Switcher label="Operación" value={mode} onChange={(m) => { setMode(m); setMul(null); }}
              items={[{ value: "add", label: "Suma P + Q" }, { value: "mul", label: "Escalar k · P" }]} />
          </Field>
          {mode === "add" ? (
            <p className="xs muted">Clic en un punto para P y en otro para Q. El mismo punto dos veces es una duplicación.</p>
          ) : (
            <>
              <p className="xs muted">Clic en un punto para elegir P.</p>
              <Field label="k">
                <input className="input num" type="number" min={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
              </Field>
              <AsyncButton variant="primary" icon={<Play size={14} />} disabled={!P || !curve}
                onRun={async () => { const m = await run(() => api.curveMul(pp, curve!.a, curve!.b, P, k)); if (m) setMul(m); }}>
                Calcular k · P
              </AsyncButton>
            </>
          )}
          {curve && (
            <dl className="kv">
              <dt>#E(F_p)</dt><dd className="num">{curve.order} puntos</dd>
              <dt>Hasse</dt><dd className="num">{curve.hasse_bound[0]} ≤ #E ≤ {curve.hasse_bound[1]}</dd>
            </dl>
          )}
        </div>

        <div className="stage">
          <div className="canvas">
            <svg className="plot" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 640 }} role="img" aria-label="Puntos de la curva">
              <line className="axis" x1={pad} y1={size - pad} x2={size - pad} y2={size - pad} />
              <line className="axis" x1={pad} y1={pad} x2={pad} y2={size - pad} />
              <line className="gridline" x1={pad} y1={sy((pp - 1) / 2)} x2={size - pad} y2={sy((pp - 1) / 2)} strokeDasharray="4 4" />
              <text className="label" x={pad} y={size - 10}>0</text>
              <text className="label" x={size - pad} y={size - 10} textAnchor="end">x = {pp - 1}</text>
              <text className="label" x={4} y={pad + 4}>{pp - 1}</text>
              {curve?.points.map((pt) => {
                const h = highlight(pt);
                return (
                  <circle key={key(pt)} className={`pt ${h}`} cx={sx(pt[0])} cy={sy(pt[1])} r={h && h !== "trail" ? r + 2.5 : r} onClick={() => clickPoint(pt)}>
                    <title>{fmt(pt)}{trail.has(key(pt)) ? ` · paso ${trail.get(key(pt))}` : ""}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="legend">
              <span><i style={{ background: "var(--accent)" }} />P</span>
              {mode === "add" && <span><i style={{ background: "var(--warn)" }} />Q</span>}
              {mode === "mul" && <span><i style={{ background: "var(--iris-7)" }} />intermedios</span>}
              <span><i style={{ background: "var(--ok)" }} />{mode === "add" ? "P + Q" : "k · P"}</span>
              <span className="faint">Línea punteada: eje de simetría, (x, y) y (x, −y) son inversos.</span>
            </div>
          </div>
        </div>

        <div className="results">
          <div className="inspector-head"><h2>Resultado</h2></div>
          <div className="inspector-body">
            {mode === "add" ? (sum ? (
              <>
                <Section title="Suma">
                  <div className="formula">{fmt(sum.P)} + {fmt(sum.Q)} = <strong className="ok-text">{fmt(sum.R)}</strong></div>
                  <div><Tag tone={sum.case === "tangent" ? "warn" : sum.case === "inverse" ? "bad" : "accent"}>
                    {{ secant: "secante", tangent: "tangente (duplicación)", inverse: "P + (−P) = O", identity: "neutro" }[sum.case]}
                  </Tag></div>
                </Section>
                <Section title="Cálculo">
                  <p className="small">{sum.explanation}</p>
                  {sum.lambda !== null && sum.R && (
                    <div className="formula">x₃ = λ² − x₁ − x₂ = {sum.R[0]}<br />y₃ = λ(x₁ − x₃) − y₁ = {sum.R[1]}</div>
                  )}
                </Section>
              </>
            ) : <span className="small muted">Elige P en el lienzo.</span>) : mul ? (
              <>
                <Section title="Escalar">
                  <div className="formula">{mul.k} = {mul.binary}₂ → {mul.k}·P = <strong className="ok-text">{fmt(mul.result)}</strong></div>
                  <span className="xs muted">
                    {mul.operations} operaciones en lugar de {mul.k - 1} sumas. Orden de P: {mul.order}
                    {mul.k % mul.order === 0 ? `, así que ${mul.k}·P = O.` : mul.k > mul.order ? `; ${mul.k}·P = ${mul.k % mul.order}·P.` : "."}
                  </span>
                </Section>
                <Section title="Traza de double-and-add">
                  <div style={{ margin: "0 -16px" }}>
                    <table className="table">
                      <thead><tr><th>Bit</th><th>Operación</th><th>R</th></tr></thead>
                      <tbody>
                        {mul.steps.map((s, i) => (
                          <tr key={i}><td className="mono">{s.bit}</td><td>{s.op === "double" ? "R ← 2R" : "R ← R + P"}</td><td className="mono">{fmt(s.point)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              </>
            ) : <span className="small muted">Elige P y calcula k · P.</span>}

            {secp && (
              <Section title="secp256k1 (la curva real)">
                <dl className="kv">
                  <dt>Ecuación</dt><dd>{secp.equation}</dd>
                  <dt>p</dt><dd><Hex value={secp.p} n={10} /></dd>
                  <dt>n (orden de G)</dt><dd><Hex value={secp.n} n={10} /></dd>
                  <dt>G.x</dt><dd><Hex value={secp.gx} n={10} /></dd>
                  <dt>G.y</dt><dd><Hex value={secp.gy} n={10} /></dd>
                  <dt>Cofactor</dt><dd>{secp.h}</dd>
                </dl>
              </Section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
