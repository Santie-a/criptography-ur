// Shell de la aplicación (patrón UI shell de Carbon):
//   encabezado persistente: producto a la izquierda, funciones globales a la derecha
//   navegación lateral agrupada por función, plegable
//   barra de estado: visibilidad del estado del sistema (heurística 1 de Nielsen)
import {
  Blocks, Boxes, Coins, FileSignature, Hammer, LayoutDashboard, Menu, Moon, ScanSearch, Search,
  Send, Settings2, ShieldCheck, Spline, Sun, Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { api } from "../api";
import { go, href } from "../router";
import { useStore } from "../store";
import type { SearchResult } from "../types";
import { initials } from "./ui";

interface NavItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

export const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Red",
    items: [
      { id: "resumen", label: "Resumen", icon: LayoutDashboard },
      { id: "bloques", label: "Bloques", icon: Blocks },
      { id: "transacciones", label: "Transacciones", icon: Coins },
      { id: "billeteras", label: "Billeteras", icon: Wallet },
    ],
  },
  {
    title: "Seguridad",
    items: [
      { id: "integridad", label: "Integridad", icon: ShieldCheck },
      { id: "firmas", label: "Análisis de firmas", icon: ScanSearch },
    ],
  },
  {
    title: "Laboratorio",
    items: [
      { id: "lab/curva", label: "Curva elíptica", icon: Spline },
      { id: "lab/ecdsa", label: "ECDSA", icon: FileSignature },
    ],
  },
];

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    // Mantiene sincronizados los dos interruptores (encabezado y menú lateral).
    const obs = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("minichain-theme", next ? "dark" : "light");
    } catch {
      /* sin almacenamiento */
    }
  };
  return [dark, toggle];
}

export function Header({ onToggleNav }: { onToggleNav: () => void }) {
  const { state, identity, setIdentity, openDialog } = useStore();
  const [dark, toggleTheme] = useTheme();

  return (
    <header className="header">
      <button className="header-btn" onClick={onToggleNav} aria-label="Mostrar u ocultar navegación"><Menu size={18} /></button>
      <a className="brand" href={href("resumen")} style={{ color: "inherit", textDecoration: "none" }}>
        <span className="brand-mark"><Boxes size={14} /></span>
        <span className="brand-text">minichain<small>explorer</small></span>
      </a>
      {state && (
        <span className="network-tag" title="Red simulada">
          <span className="dot ok" /> simnet · semilla {state.params.seed}
        </span>
      )}
      <GlobalSearch />
      <div className="header-right">
        <button className="header-btn hide-sm" onClick={() => openDialog("transfer")} title="Nueva transacción">
          <Send size={16} /><span className="label-text">Transferir</span>
        </button>
        <button className="header-btn" onClick={() => openDialog("mine")} title="Minar un bloque">
          <Hammer size={16} /><span className="label-text">Minar</span>
        </button>
        <span className="header-sep hide-sm" />
        <label className="identity" title="Billetera con la que firma este navegador">
          <span className="avatar">{initials(identity)}</span>
          <span className="sr-only">Actuar como</span>
          <select value={identity} onChange={(e) => setIdentity(e.target.value)}>
            {state?.wallets.map((w) => <option key={w.name} value={w.name}>{w.name}</option>)}
          </select>
        </label>
        <span className="header-sep hide-sm" />
        <button className="header-btn hide-sm" onClick={toggleTheme} aria-label={dark ? "Tema claro" : "Tema oscuro"} title={dark ? "Tema claro" : "Tema oscuro"}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <a className="header-btn hide-sm" href={href("escenario")} title="Configuración de la simulación" aria-label="Configuración">
          <Settings2 size={16} />
        </a>
      </div>
    </header>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  // Ctrl+K o "/" enfocan la búsqueda.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => api.search(q).then((r) => { setResults(r); setActive(0); }).catch(() => setResults([])), 150);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (r: SearchResult) => {
    if (r.type === "block") go("bloques", { b: r.ref });
    if (r.type === "tx") go("transacciones", { tx: r.ref });
    if (r.type === "wallet") go("billeteras", { w: r.ref });
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="search">
      <Search size={15} className="icon" />
      <input
        ref={input}
        value={q}
        placeholder="Buscar bloque, txid, billetera o dirección"
        aria-label="Buscar"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && results[active]) pick(results[active]);
          if (e.key === "Escape") { setQ(""); input.current?.blur(); }
        }}
      />
      <kbd>Ctrl K</kbd>
      {open && q.trim() && (
        <div className="search-results" role="listbox">
          {results.length === 0 ? <div className="empty" style={{ padding: 16 }}>Sin resultados</div> :
            results.map((r, i) => {
              const Icon = r.type === "block" ? Blocks : r.type === "tx" ? Coins : Wallet;
              return (
                <button key={`${r.type}-${r.ref}`} className={i === active ? "active" : ""} onMouseDown={() => pick(r)} role="option" aria-selected={i === active}>
                  <Icon size={15} />
                  <span style={{ minWidth: 0 }}>
                    <div className="small">{r.label}</div>
                    <div className="detail truncate">{r.detail}</div>
                  </span>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}

export function SideNav({ current, onNavigate }: { current: string; onNavigate: () => void }) {
  const { state, scan } = useStore();
  const exposed = scan?.recoveries.length ?? 0;
  const counts: Record<string, { n: number; bad?: boolean } | undefined> = {
    bloques: state ? { n: state.blocks.length } : undefined,
    transacciones: state?.mempool.length ? { n: state.mempool.length } : undefined,
    billeteras: state ? { n: state.wallets.length } : undefined,
    firmas: exposed ? { n: exposed, bad: true } : undefined,
  };
  const section = current.split("/")[0] === "lab" ? current : current.split("/")[0];
  const [dark, toggleTheme] = useTheme();
  return (
    <nav className="sidenav" aria-label="Navegación principal">
      {NAV.map((g) => (
        <div key={g.title} className="nav-group">
          <div className="nav-title">{g.title}</div>
          {g.items.map((it) => {
            const c = counts[it.id];
            return (
              <a key={it.id} href={href(it.id)} onClick={onNavigate} title={it.label}
                className={`nav-item ${section === it.id ? "active" : ""}`} aria-current={section === it.id ? "page" : undefined}>
                <it.icon size={16} />
                <span className="nav-label">{it.label}</span>
                {c && <span className={`nav-count ${c.bad ? "bad" : ""}`} title={c.bad ? "Claves expuestas" : undefined}>{c.n}</span>}
              </a>
            );
          })}
        </div>
      ))}
      <div className="nav-group nav-bottom">
        <a href={href("escenario")} onClick={onNavigate} title="Escenario" className={`nav-item ${section === "escenario" ? "active" : ""}`}>
          <Settings2 size={16} /><span className="nav-label">Escenario</span>
        </a>
        <button type="button" className="nav-item" onClick={toggleTheme} title="Cambiar tema">
          {dark ? <Sun size={16} /> : <Moon size={16} />}<span className="nav-label">{dark ? "Tema claro" : "Tema oscuro"}</span>
        </button>
        <a href="/api/docs" target="_blank" rel="noreferrer" className="nav-item" title="Referencia de la API">
          <FileSignature size={16} /><span className="nav-label">API</span>
        </a>
      </div>
    </nav>
  );
}

export function StatusBar() {
  const { state, conn, clients, updatedAt, scan } = useStore();
  const exposed = scan?.recoveries.length ?? 0;
  return (
    <footer className="statusbar">
      <span>
        <span className={`dot ${conn === "online" ? "ok" : conn === "offline" ? "bad" : "warn"}`} />
        {conn === "online" ? "Conectado" : conn === "offline" ? "Sin conexión" : "Conectando"}
      </span>
      {conn === "online" && <span className="hide-sm">{clients} {clients === 1 ? "cliente" : "clientes"}</span>}
      {state && (
        <>
          <span className="num">Altura {state.height}</span>
          <span className="num hide-sm">Dificultad {state.difficulty} bits</span>
          <span className="num">Pendientes {state.mempool.length}</span>
          {exposed > 0 && (
            <span style={{ color: "var(--bad-text)" }}>
              <span className="dot bad" />
              <a href={href("firmas")} style={{ color: "inherit" }}>{exposed} {exposed === 1 ? "clave expuesta" : "claves expuestas"}</a>
            </span>
          )}
        </>
      )}
      <span className="end num hide-sm">
        {updatedAt ? `Actualizado ${updatedAt.toLocaleTimeString("es-CO")}` : "—"} · secp256k1
      </span>
    </footer>
  );
}
