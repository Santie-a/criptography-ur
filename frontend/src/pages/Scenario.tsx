// Escenario: página de configuración (etiqueta y descripción a la izquierda,
// control a la derecha) con una sola acción destructiva al final.
import { RotateCcw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { AdminRequired } from "../components/admin";
import { AsyncButton, Notice, PageHeader, Panel } from "../components/ui";
import { useStore } from "../store";
import type { NonceKind, ScenarioParams } from "../types";

function Row({ title, desc, children }: { title: string; desc: ReactNode; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <div className="title">{title}</div>
        <div className="desc">{desc}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

const AUTOMINE_OPTIONS = [0, 10, 20, 30, 60];

/** Ajustes que se aplican al instante, sin regenerar la red. */
function LiveSettings() {
  const { state, run, notify, refresh, isAdmin } = useStore();
  if (!state) return null;
  const current = state.automine.interval;
  const options = AUTOMINE_OPTIONS.includes(current) ? AUTOMINE_OPTIONS : [...AUTOMINE_OPTIONS, current].sort((a, b) => a - b);
  return (
    <Panel title="Red en vivo" meta=" · se aplica al instante">
      <Row title="Minado automático" desc={<>
        Cada cuántos segundos el servidor mina la mempool, con la recompensa para {state.automine.miner}. Si no hay
        transacciones pendientes, no mina. Al reiniciar el servidor vuelve al valor de <code>MINICHAIN_AUTOMINE</code>.
      </>}>
        <select className="select" value={current} disabled={!isAdmin} onChange={async (e) => {
          const interval = Number(e.target.value);
          const r = await run(() => api.setAutomine(interval));
          if (r) {
            notify(interval ? `Minado automático cada ${interval} s` : "Minado automático apagado");
            refresh();
          }
        }}>
          {options.map((n) => <option key={n} value={n}>{n ? `Cada ${n} s` : "Apagado"}</option>)}
        </select>
      </Row>
      <Row title="Monedas de bienvenida" desc={<>
        Lo que {state.faucet.wallet} regala a cada billetera de dispositivo nueva, una vez por red. Se configura con{" "}
        <code>MINICHAIN_FAUCET</code>.
      </>}>
        <span className="num">{state.faucet.amount ? `${state.faucet.amount} monedas` : "Desactivadas"}</span>
      </Row>
    </Panel>
  );
}

export function Scenario() {
  const { state, setState, run, notify, isAdmin } = useStore();
  const [form, setForm] = useState<ScenarioParams | null>(null);
  useEffect(() => {
    if (state && !form) setForm(state.params);
  }, [state, form]);
  if (!state || !form) return null;

  const set = <K extends keyof ScenarioParams>(k: K, v: ScenarioParams[K]) => setForm({ ...form, [k]: v });
  const bobSigns = Math.floor((form.n_blocks * form.tx_per_block) / 2);
  const dirty = JSON.stringify(form) !== JSON.stringify(state.params);

  return (
    <>
      <PageHeader crumbs={[{ label: "Configuración" }, { label: "Escenario" }]} title="Escenario de simulación"
        sub="Los datos se generan a partir de una semilla: la misma configuración produce la misma red." />
      <div className="page-body" style={{ maxWidth: 920 }}>
        {!isAdmin && <AdminRequired>Puedes ver la configuración actual; cambiarla y regenerar la red es del administrador.</AdminRequired>}
        <LiveSettings />
        <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
        <Panel title="Red">
          <Row title="Semilla" desc="Determina claves, montos y destinatarios. Solo los nonces aleatorios de Carol no dependen de ella.">
            <input className="input num" type="number" value={form.seed} onChange={(e) => set("seed", Number(e.target.value))} />
          </Row>
          <Row title="Dificultad mínima" desc={`Bits en cero que debe tener el hash de cada bloque. ${form.difficulty} bits ≈ ${(2 ** form.difficulty).toLocaleString("es")} intentos.`}>
            <input className="input num" type="number" min={0} max={20} value={form.difficulty} onChange={(e) => set("difficulty", Number(e.target.value))} />
          </Row>
          <Row title="Bloques iniciales" desc="Bloques minados al generar la red, sin contar el génesis.">
            <input className="input num" type="number" min={1} max={12} value={form.n_blocks} onChange={(e) => set("n_blocks", Number(e.target.value))} />
          </Row>
          <Row title="Transacciones por bloque" desc="Alice, Bob y Carol se turnan; Bob envía la mitad.">
            <input className="input num" type="number" min={1} max={8} value={form.tx_per_block} onChange={(e) => set("tx_per_block", Number(e.target.value))} />
          </Row>
        </Panel>

        <Panel title="Billetera de Bob">
          <Row title="Generación del nonce k" desc="Alice usa RFC 6979 y Carol nonces aleatorios. La de Bob decide si el ataque es posible.">
            <select className="select" value={form.victim_nonce} onChange={(e) => set("victim_nonce", e.target.value as NonceKind)}>
              {(Object.keys(state.nonce_kinds) as NonceKind[]).map((k) => <option key={k} value={k}>{state.nonce_kinds[k]}</option>)}
            </select>
          </Row>
          {form.victim_nonce === "weak" && (
            <Row title="Entropía del generador" desc={`Estados posibles: 2^${form.entropy_bits} = ${2 ** form.entropy_bits}. Bob firmará unas ${bobSigns} veces${bobSigns > 2 ** form.entropy_bits ? ": por el principio del palomar, algún k se repite." : "."}`}>
              <input className="input num" type="number" min={1} max={16} value={form.entropy_bits} onChange={(e) => set("entropy_bits", Number(e.target.value))} />
            </Row>
          )}
        </Panel>
        </fieldset>

        {isAdmin && <Notice tone="warn" title="Regenerar reemplaza la red para todos los clientes conectados"
          actions={<AsyncButton variant="danger" icon={<RotateCcw size={14} />} onRun={async () => {
            const s = await run(() => api.reset(form));
            if (s) { setState(s); setForm(s.params); notify("Red regenerada"); }
          }}>{dirty ? "Aplicar y regenerar" : "Regenerar"}</AsyncButton>}>
          Se pierden los bloques, transacciones y billeteras creadas desde la última generación.
        </Notice>}
      </div>
    </>
  );
}
