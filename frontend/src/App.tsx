import {
  Blocks, Crosshair, FileSignature, Home, Moon, ShieldCheck, ShieldHalf, Spline, Sun,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Callout } from "./components/ui";
import { Attack } from "./pages/Attack";
import { CurveLab } from "./pages/CurveLab";
import { Defense } from "./pages/Defense";
import { Explorer } from "./pages/Explorer";
import { Overview } from "./pages/Overview";
import { SignLab } from "./pages/SignLab";
import { Validator } from "./pages/Validator";
import { useStore } from "./store";

interface Route {
  id: string;
  label: string;
  step?: number;
  icon: ComponentType<{ size?: number }>;
  page: ComponentType;
}

export const ROUTES: Route[] = [
  { id: "inicio", label: "Inicio", icon: Home, page: Overview },
  { id: "curva", label: "Curva elíptica", step: 1, icon: Spline, page: CurveLab },
  { id: "firmas", label: "Firmas ECDSA", step: 2, icon: FileSignature, page: SignLab },
  { id: "cadena", label: "Cadena", step: 3, icon: Blocks, page: Explorer },
  { id: "validador", label: "Validador", step: 4, icon: ShieldCheck, page: Validator },
  { id: "ataque", label: "Ataque", step: 5, icon: Crosshair, page: Attack },
  { id: "defensa", label: "Defensa", step: 6, icon: ShieldHalf, page: Defense },
];

function useHashRoute(): string {
  const read = () => location.hash.replace(/^#\/?/, "").split("?")[0] || "inicio";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      document.querySelector(".main")?.scrollTo?.(0, 0);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  return (
    <button
      className="btn ghost icon"
      aria-label={dark ? "Usar tema claro" : "Usar tema oscuro"}
      title={dark ? "Tema claro" : "Tema oscuro"}
      onClick={() => {
        const next = !dark;
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("minichain-theme", next ? "dark" : "light");
        } catch {
          /* sin almacenamiento */
        }
        setDark(next);
      }}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function App() {
  const route = useHashRoute();
  const { state, conn, clients, error } = useStore();
  const current = ROUTES.find((r) => r.id === route) ?? ROUTES[0];
  const Page = current.page;

  useEffect(() => {
    document.title = current.id === "inicio" ? "minichain" : `${current.label} · minichain`;
  }, [current]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Spline size={18} /></div>
          <div>
            <div className="brand-name">minichain</div>
            <div className="brand-sub">ECDSA · secp256k1</div>
          </div>
        </div>
        <nav className="nav" aria-label="Secciones">
          <div className="nav-label">Recorrido</div>
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} className={r.id === current.id ? "active" : ""}
              aria-current={r.id === current.id ? "page" : undefined} title={r.label}>
              {r.step ? <span className="nav-step">{r.step}</span> : <span className="nav-step"><r.icon size={12} /></span>}
              <span className="label">{r.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="status-line">
            <span className={`dot ${conn === "online" ? "ok" : conn === "offline" ? "bad" : "warn"}`} />
            {conn === "online" ? "En línea" : conn === "offline" ? "Sin conexión" : "Conectando…"}
            {conn === "online" && <span className="faint">· {clients} {clients === 1 ? "cliente" : "clientes"}</span>}
          </div>
          {state && (
            <div className="status-line num">
              Altura {state.height} · {state.difficulty} bits · {state.mempool.length} pendientes
            </div>
          )}
          <div className="row" style={{ paddingLeft: 4 }}>
            <ThemeToggle />
            <a className="btn ghost sm" href="/api/docs" target="_blank" rel="noreferrer">API</a>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="page">
          {error && !state && (
            <Callout tone="bad" title="No se pudo cargar la red">
              {error} Inicia el servidor con <code>python -m server</code> y recarga.
            </Callout>
          )}
          <Page />
        </div>
      </main>
    </div>
  );
}
