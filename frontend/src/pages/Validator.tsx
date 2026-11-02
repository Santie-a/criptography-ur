import { Download, FlaskConical, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { ChainStrip } from "../components/chain";
import { AsyncButton, Badge, Button, Callout, Card, Field, PageHead } from "../components/ui";
import { useStore } from "../store";
import type { BlockDetail, Issue, ValidationResult } from "../types";

const KIND_LABEL: Record<string, string> = {
  firma: "firma", merkle: "Merkle", enlace: "enlace", pow: "prueba de trabajo", secuencia: "secuencia",
  saldo: "saldo", coinbase: "recompensa", "índice": "índice", tiempo: "tiempo", "génesis": "génesis", monto: "monto",
};

export function Validator() {
  const { state, run } = useStore();
  const [actions, setActions] = useState<Record<string, string>>({});
  const [blockIdx, setBlockIdx] = useState(2);
  const [block, setBlock] = useState<BlockDetail | null>(null);
  const [txIdx, setTxIdx] = useState(1);
  const [action, setAction] = useState("amount");
  const [result, setResult] = useState<(ValidationResult & { title: string; note?: string }) | null>(null);
  const [external, setExternal] = useState("");

  useEffect(() => {
    run(() => api.tamperActions()).then((a) => a && setActions(a));
  }, [run]);

  useEffect(() => {
    if (!state) return;
    const i = Math.min(Math.max(1, blockIdx), state.height);
    run(() => api.block(i)).then((b) => {
      if (!b) return;
      setBlock(b);
      const signed = b.transactions.findIndex((t) => !t.coinbase);
      setTxIdx((cur) => (b.transactions[cur] && !b.transactions[cur].coinbase ? cur : signed));
    });
  }, [blockIdx, state?.height, run, state]);

  if (!state) return null;
  const signedTxs = block?.transactions.map((t, i) => ({ t, i })).filter(({ t }) => !t.coinbase) ?? [];

  return (
    <>
      <PageHead eyebrow="Paso 4" title="El validador detecta cualquier manipulación">
        Recorre la cadena bloque por bloque: índice, enlace con el bloque anterior, prueba de trabajo, raíz de
        Merkle, firmas ECDSA, contadores y saldos. Las manipulaciones se hacen sobre una copia: la red no cambia.
      </PageHead>

      <div className="split">
        <div className="stack-lg">
          <Card title="Resultado" actions={
            <AsyncButton icon={<ShieldCheck size={14} />} onRun={async () => {
              const r = await run(() => api.validate());
              if (r) setResult({ ...r, title: "Cadena actual de la red" });
            }}>Validar la cadena real</AsyncButton>
          }>
            {result ? <ReportView result={result} /> : (
              <p className="small muted">Valida la cadena real o aplica una manipulación a la derecha.</p>
            )}
          </Card>
          {result && (
            <Card title="Bloques revisados" hint="En rojo los bloques con problemas; un enlace punteado indica prev_hash roto." flush>
              <ChainStrip blocks={result.blocks} />
            </Card>
          )}
        </div>

        <div className="stack-lg">
          <Card title={<><FlaskConical size={16} /> Manipular una copia</>}>
            <div className="stack">
              <div className="grid grid-2">
                <Field label="Bloque">
                  <select className="select" value={Math.min(blockIdx, state.height)} onChange={(e) => setBlockIdx(Number(e.target.value))}>
                    {state.blocks.slice(1).map((b) => <option key={b.index} value={b.index}>Bloque {b.index}</option>)}
                  </select>
                </Field>
                <Field label="Transacción">
                  <select className="select" value={txIdx} onChange={(e) => setTxIdx(Number(e.target.value))}>
                    {signedTxs.map(({ t, i }) => <option key={i} value={i}>tx {i}: {t.sender_name ?? "?"} → {t.recipient_name ?? "?"} ({t.amount})</option>)}
                  </select>
                </Field>
              </div>
              <div className="stack" role="radiogroup" style={{ gap: 6 }}>
                {Object.entries(actions).map(([id, label]) => (
                  <label key={id} className="row small" style={{ cursor: "pointer", flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <input type="radio" name="action" checked={action === id} onChange={() => setAction(id)} style={{ marginTop: 4 }} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <AsyncButton variant="danger" disabled={signedTxs.length === 0} onRun={async () => {
                const r = await run(() => api.tamper(Math.min(blockIdx, state.height), txIdx, action));
                if (r) setResult({ ...r, title: r.description, note: `Bloque ${r.tampered.block}, tx ${r.tampered.tx}` });
              }}>Manipular y validar</AsyncButton>
            </div>
          </Card>

          <Card title="Validar un archivo" hint="Descarga la cadena, edítala a mano y vuelve a pegarla.">
            <div className="stack">
              <Button icon={<Download size={14} />} onClick={async () => {
                const data = await run(() => api.exportChain());
                if (!data) return;
                const text = JSON.stringify(data, null, 2);
                setExternal(text);
                const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
                const a = document.createElement("a");
                a.href = url;
                a.download = "minichain.json";
                a.click();
                URL.revokeObjectURL(url);
              }}>Descargar cadena (JSON)</Button>
              <Field label="JSON de la cadena">
                <textarea className="textarea mono" rows={6} value={external} onChange={(e) => setExternal(e.target.value)} placeholder='{"difficulty": 14, "blocks": [...]}' />
              </Field>
              <AsyncButton icon={<Upload size={14} />} disabled={!external.trim()} onRun={async () => {
                let parsed: unknown;
                try { parsed = JSON.parse(external); } catch { setResult(null); return void run(async () => { throw new Error("El texto no es JSON válido"); }); }
                const r = await run(() => api.validateExternal(parsed));
                if (r) setResult({ ...r, title: "Cadena pegada" });
              }}>Validar JSON</AsyncButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export function ReportView({ result }: { result: ValidationResult & { title: string; note?: string } }) {
  const grouped = useMemo(() => {
    const m = new Map<number, Issue[]>();
    result.issues.forEach((i) => m.set(i.block, [...(m.get(i.block) ?? []), i]));
    return [...m.entries()];
  }, [result]);
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <strong>{result.title}</strong>
          {result.note && <div className="xs muted">{result.note}</div>}
        </div>
        {result.ok ? <Badge tone="ok">VÁLIDA</Badge> : <Badge tone="bad">RECHAZADA · {result.issues.length}</Badge>}
      </div>
      {result.ok ? (
        <Callout tone="ok" title="Sin problemas">
          {result.blocks_checked} bloques y {result.signatures_checked} firmas ECDSA verificadas.
        </Callout>
      ) : (
        <div className="stack">
          {grouped.map(([b, issues], gi) => (
            <div key={b} className="stack" style={{ gap: 6 }}>
              <div className="xs muted">Bloque {b}{gi > 0 ? " · consecuencia de lo anterior" : ""}</div>
              {issues.map((i, k) => (
                <div key={k} className="row small" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <Badge tone={gi === 0 ? "bad" : "warn"}>{KIND_LABEL[i.kind] ?? i.kind}</Badge>
                  <span>{i.tx !== null && <span className="faint">tx {i.tx} · </span>}{i.detail}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
