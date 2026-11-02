// Integridad: la validación como herramienta de auditoría, con tres modos:
// la cadena real, una simulación "qué pasaría si" y un archivo importado.
import { Download, FileUp, FlaskConical, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { ChainStrip } from "../components/chain";
import { AsyncButton, Button, Field, Metrics, Notice, PageHeader, Panel, Tabs, Tag } from "../components/ui";
import { href, useRoute } from "../router";
import { useStore } from "../store";
import type { BlockDetail, TamperResult, ValidationResult } from "../types";

type Mode = "actual" | "simular" | "archivo";

const KIND: Record<string, string> = {
  firma: "Firma", merkle: "Merkle", enlace: "Enlace", pow: "Prueba de trabajo", secuencia: "Secuencia",
  saldo: "Saldo", coinbase: "Recompensa", "índice": "Índice", tiempo: "Tiempo", "génesis": "Génesis", monto: "Monto",
};

export function Integrity() {
  const { state } = useStore();
  const { params } = useRoute();
  const [mode, setMode] = useState<Mode>((params.get("modo") as Mode) || "actual");
  if (!state) return null;
  return (
    <>
      <PageHeader crumbs={[{ label: "Seguridad" }, { label: "Integridad" }]} title="Integridad de la cadena"
        sub="Índice, enlace por hash, prueba de trabajo, raíz de Merkle, firmas ECDSA, contadores y saldos."
        actions={<Button icon={<Download size={14} />} onClick={exportChain}>Exportar JSON</Button>}
        tabs={<Tabs value={mode} onChange={setMode} items={[
          { value: "actual", label: "Cadena actual" },
          { value: "simular", label: "Simular manipulación" },
          { value: "archivo", label: "Validar archivo" },
        ]} />} />
      <div className="page-body">
        {mode === "actual" && <Current />}
        {mode === "simular" && <Simulate />}
        {mode === "archivo" && <ImportFile />}
      </div>
    </>
  );
}

async function exportChain() {
  const data = await api.exportChain();
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "minichain.json";
  a.click();
  URL.revokeObjectURL(url);
}

function Current() {
  const { state, run } = useStore();
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const validate = async () => {
    const r = await run(() => api.validate());
    if (r) { setResult(r); setAt(new Date()); }
  };
  useEffect(() => { validate(); }, [state?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="spread">
        <span className="small muted">{at ? `Última validación: ${at.toLocaleTimeString("es-CO")}` : "Validando…"}</span>
        <AsyncButton icon={<RefreshCw size={14} />} onRun={validate}>Validar de nuevo</AsyncButton>
      </div>
      {result && <Report result={result} />}
    </>
  );
}

function Report({ result, title }: { result: ValidationResult; title?: string }) {
  const firstBad = result.issues[0]?.block;
  return (
    <>
      {result.ok
        ? <Notice tone="ok" title={title ?? "La cadena es válida"}>Ningún bloque presenta problemas.</Notice>
        : <Notice tone="bad" title={title ?? "La cadena no es válida"}>El primer problema está en el bloque {firstBad}; los demás pueden ser consecuencia de ese.</Notice>}
      <Metrics items={[
        { label: "Bloques revisados", value: result.blocks_checked },
        { label: "Firmas verificadas", value: result.signatures_checked },
        { label: "Bloques con problemas", value: result.blocks.filter((b) => !b.ok).length, tone: result.ok ? undefined : "bad" },
        { label: "Problemas", value: result.issues.length, tone: result.ok ? undefined : "bad" },
      ]} />
      <Panel title="Bloques" meta=" · rojo: con problemas; línea punteada: enlace roto" flush>
        <ChainStrip blocks={result.blocks} />
      </Panel>
      {!result.ok && (
        <Panel title="Problemas detectados" flush>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Bloque</th><th>Tx</th><th>Regla</th><th>Detalle</th><th>Origen</th></tr></thead>
              <tbody>
                {result.issues.map((i, k) => (
                  <tr key={k}>
                    <td className="num">#{i.block}</td>
                    <td className="num">{i.tx ?? "—"}</td>
                    <td><Tag tone={i.block === firstBad ? "bad" : "warn"}>{KIND[i.kind] ?? i.kind}</Tag></td>
                    <td className="wrap">{i.detail}</td>
                    <td className="muted">{i.block === firstBad ? "directo" : "derivado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

function Simulate() {
  const { state, run } = useStore();
  const [actions, setActions] = useState<Record<string, string>>({});
  const [blockIdx, setBlockIdx] = useState(Math.min(2, state?.height ?? 1));
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [txIdx, setTxIdx] = useState(1);
  const [action, setAction] = useState("amount");
  const [result, setResult] = useState<TamperResult | null>(null);

  useEffect(() => { run(() => api.tamperActions()).then((a) => a && setActions(a)); }, [run]);
  useEffect(() => {
    if (!state || state.height < 1) return;
    run(() => api.block(Math.max(1, Math.min(blockIdx, state.height)))).then((b) => {
      if (!b) return;
      setBlock(b);
      const first = b.transactions.findIndex((t) => !t.coinbase);
      setTxIdx((cur) => (b.transactions[cur] && !b.transactions[cur].coinbase ? cur : first));
    });
  }, [blockIdx, state, run]);

  if (!state) return null;
  if (state.height < 1) return <Notice>La cadena solo tiene el génesis. Mina un bloque primero.</Notice>;
  const signed = block?.transactions.map((t, i) => ({ t, i })).filter(({ t }) => !t.coinbase) ?? [];

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "340px minmax(0,1fr)", alignItems: "start" }}>
      <Panel title={<><FlaskConical size={15} /> Manipulación</>}>
        <div className="stack">
          <Notice>Se aplica a una copia. La red no cambia.</Notice>
          <Field label="Bloque">
            <select className="select" value={blockIdx} onChange={(e) => setBlockIdx(Number(e.target.value))}>
              {state.blocks.slice(1).map((b) => <option key={b.index} value={b.index}>Bloque #{b.index}</option>)}
            </select>
          </Field>
          <Field label="Transacción">
            <select className="select" value={txIdx} onChange={(e) => setTxIdx(Number(e.target.value))}>
              {signed.map(({ t, i }) => <option key={i} value={i}>tx {i} · {t.sender_name ?? "?"} → {t.recipient_name ?? "?"} ({t.amount})</option>)}
            </select>
          </Field>
          <Field label="Cambio" group>
            <div className="stack-sm">
              {Object.entries(actions).map(([id, label]) => (
                <label key={id} className="row-nowrap small" style={{ alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="radio" name="tamper" checked={action === id} onChange={() => setAction(id)} style={{ marginTop: 3 }} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </Field>
          <AsyncButton variant="danger" disabled={!signed.length} onRun={async () => {
            const r = await run(() => api.tamper(blockIdx, txIdx, action));
            if (r) setResult(r);
          }}>Aplicar y validar</AsyncButton>
        </div>
      </Panel>
      <div className="stack">
        {result ? <Report result={result} title={`${result.description} (bloque #${result.tampered.block}, tx ${result.tampered.tx})`} />
          : <Panel title="Resultado"><span className="small muted">Elige un cambio y aplícalo para ver qué reglas lo detectan.</span></Panel>}
      </div>
    </div>
  );
}

function ImportFile() {
  const { run } = useStore();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <Panel title={<><FileUp size={15} /> Cadena en JSON</>} actions={
        <label className="btn sm">
          Abrir archivo
          <input type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setText(await f.text());
          }} />
        </label>
      }>
        <div className="stack">
          <span className="xs muted">Exporta la cadena, edítala a mano (por ejemplo un monto) y valídala aquí.</span>
          <textarea className="textarea mono" rows={16} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"difficulty": 14, "blocks": [...]}' />
          {parseError && <Notice tone="bad">{parseError}</Notice>}
          <AsyncButton variant="primary" disabled={!text.trim()} onRun={async () => {
            let parsed: unknown;
            try { parsed = JSON.parse(text); setParseError(null); } catch { setParseError("El texto no es JSON válido."); return; }
            const r = await run(() => api.validateExternal(parsed));
            if (r) setResult(r);
          }}>Validar</AsyncButton>
        </div>
      </Panel>
      <div className="stack">
        {result ? <Report result={result} /> : <Panel title="Resultado"><span className="small muted">Sin validar todavía. <a href={href("integridad")}>Ver la cadena actual</a></span></Panel>}
      </div>
    </div>
  );
}
