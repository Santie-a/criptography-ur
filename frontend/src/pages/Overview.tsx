import { Blocks, Crosshair, FileSignature, RotateCcw, ShieldCheck, ShieldHalf, Spline } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { ChainStrip } from "../components/chain";
import { AsyncButton, Card, Field, NonceBadge, PageHead, Stat } from "../components/ui";
import { useStore } from "../store";
import type { NonceKind, ScenarioParams } from "../types";

const FLOW = [
  { id: "curva", icon: Spline, title: "1 · Curva elíptica", text: "Los puntos de y² = x³ + ax + b sobre F_p forman un grupo. Suma, duplicación y double-and-add." },
  { id: "firmas", icon: FileSignature, title: "2 · Firmas ECDSA", text: "Firma (r, s) con s = k⁻¹(z + r·d). Cada paso con sus números reales." },
  { id: "cadena", icon: Blocks, title: "3 · Cadena", text: "Transacciones firmadas, raíz de Merkle, enlace por hash y prueba de trabajo." },
  { id: "validador", icon: ShieldCheck, title: "4 · Validador", text: "Manipula una copia de la cadena y mira cómo se detecta cada cambio." },
  { id: "ataque", icon: Crosshair, title: "5 · Ataque", text: "Dos firmas con el mismo k revelan la clave privada. El robo pasa la validación.", tone: "bad" },
  { id: "defensa", icon: ShieldHalf, title: "6 · Defensa", text: "Con nonces deterministas (RFC 6979) el ataque deja de funcionar.", tone: "ok" },
];

export function Overview() {
  const { state, setState, run, notify } = useStore();
  const [form, setForm] = useState<ScenarioParams | null>(null);

  useEffect(() => {
    if (state && !form) setForm(state.params);
  }, [state, form]);

  if (!state || !form) return null;
  const signatures = state.blocks.reduce((acc, b) => acc + Math.max(0, b.tx_count - 1), 0);
  const set = (k: keyof ScenarioParams, v: string) =>
    setForm({ ...form, [k]: k === "victim_nonce" ? v : Number(v) });
  const bobSigns = Math.floor((form.n_blocks * form.tx_per_block) / 2);

  return (
    <>
      <PageHead eyebrow="Proyecto de criptografía" title="Una mini-blockchain y el ataque que la rompe">
        ECDSA sobre secp256k1 programado desde cero. Si una billetera firma dos transacciones con el mismo
        nonce, cualquiera puede recuperar su clave privada leyendo solo la cadena pública. Así cayeron la PS3
        de Sony (2010) y varias billeteras de Bitcoin en Android (2013).
      </PageHead>

      <div className="grid grid-4">
        <Stat label="Altura" value={state.height} sub={`${state.blocks.length} bloques con génesis`} />
        <Stat label="Dificultad" value={`${state.difficulty} bits`} sub={`≈ ${(2 ** state.difficulty).toLocaleString("es")} intentos por bloque`} />
        <Stat label="Firmas en la cadena" value={signatures} sub={`${state.mempool.length} transacciones pendientes`} />
        <Stat label="Billeteras" value={state.wallets.length} sub="compartidas por todos los clientes" />
      </div>

      <Card title="La cadena actual" hint="Cada bloque guarda el hash del anterior. Clic para explorarlo." flush>
        <ChainStrip blocks={state.blocks} onSelect={(i) => (location.hash = `#/cadena?b=${i}`)} />
      </Card>

      <div className="steps-flow">
        {FLOW.map((s) => (
          <a key={s.id} href={`#/${s.id}`} className={`card step-card ${s.tone ?? ""}`}>
            <div className="icon-wrap"><s.icon size={16} /></div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </a>
        ))}
      </div>

      <div className="split">
        <Card title="Escenario simulado" hint="Todos los datos salen de la semilla, salvo los nonces aleatorios de Carol.">
          <div className="stack-lg">
            <div className="grid grid-3">
              <Field label="Semilla"><input className="input num" type="number" value={form.seed} onChange={(e) => set("seed", e.target.value)} /></Field>
              <Field label="Dificultad (bits)"><input className="input num" type="number" min={0} max={20} value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)} /></Field>
              <Field label="Nonce de Bob">
                <select className="select" value={form.victim_nonce} onChange={(e) => set("victim_nonce", e.target.value)}>
                  {(Object.keys(state.nonce_kinds) as NonceKind[]).map((k) => (
                    <option key={k} value={k}>{state.nonce_kinds[k]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Entropía del RNG débil (bits)"><input className="input num" type="number" min={1} max={16} value={form.entropy_bits} onChange={(e) => set("entropy_bits", e.target.value)} /></Field>
              <Field label="Bloques"><input className="input num" type="number" min={1} max={12} value={form.n_blocks} onChange={(e) => set("n_blocks", e.target.value)} /></Field>
              <Field label="Transacciones por bloque"><input className="input num" type="number" min={1} max={8} value={form.tx_per_block} onChange={(e) => set("tx_per_block", e.target.value)} /></Field>
            </div>
            <div className="row-between">
              <p className="small muted">
                {form.victim_nonce === "weak"
                  ? `Bob firmará unas ${bobSigns} veces con solo ${2 ** form.entropy_bits} nonces posibles${bobSigns > 2 ** form.entropy_bits ? ": por el principio del palomar, alguno se repite." : "."}`
                  : form.victim_nonce === "constant"
                    ? "Bob usará siempre el mismo k: basta con dos firmas."
                    : "Con esta estrategia Bob no debería repetir nonces."}
              </p>
              <AsyncButton variant="primary" icon={<RotateCcw size={14} />} onRun={async () => {
                const s = await run(() => api.reset(form));
                if (s) {
                  setState(s);
                  notify("Escenario regenerado");
                }
              }}>Regenerar</AsyncButton>
            </div>
          </div>
        </Card>

        <Card title="Billeteras" flush>
          <table className="table">
            <tbody>
              {state.wallets.map((w) => (
                <tr key={w.name}>
                  <td><strong>{w.name}</strong></td>
                  <td><NonceBadge kind={w.nonce} /></td>
                  <td className="right num">{w.balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
