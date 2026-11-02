import { useEffect, useState, type ComponentType } from "react";
import { Dialogs } from "./components/dialogs";
import { Header, NAV, SideNav, StatusBar } from "./components/shell";
import { Notice } from "./components/ui";
import { Blocks } from "./pages/Blocks";
import { CurveLab } from "./pages/CurveLab";
import { Dashboard } from "./pages/Dashboard";
import { Integrity } from "./pages/Integrity";
import { Scenario } from "./pages/Scenario";
import { SignatureAnalysis } from "./pages/SignatureAnalysis";
import { SignLab } from "./pages/SignLab";
import { Transactions } from "./pages/Transactions";
import { Wallets } from "./pages/Wallets";
import { useRoute } from "./router";
import { useStore } from "./store";

const PAGES: Record<string, ComponentType> = {
  resumen: Dashboard,
  bloques: Blocks,
  transacciones: Transactions,
  billeteras: Wallets,
  integridad: Integrity,
  firmas: SignatureAnalysis,
  "lab/curva": CurveLab,
  "lab/ecdsa": SignLab,
  escenario: Scenario,
};

const TITLES: Record<string, string> = Object.fromEntries(
  [...NAV.flatMap((g) => g.items.map((i) => [i.id, i.label])), ["escenario", "Escenario"]],
);

function useNavMode(): [boolean, boolean, () => void, () => void] {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("minichain-nav") === "collapsed";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggle = () => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setMobileOpen((o) => !o);
      return;
    }
    setCollapsed((c) => {
      try {
        localStorage.setItem("minichain-nav", c ? "expanded" : "collapsed");
      } catch {
        /* sin almacenamiento */
      }
      return !c;
    });
  };
  return [collapsed, mobileOpen, toggle, () => setMobileOpen(false)];
}

export function App() {
  const route = useRoute();
  const { state, error } = useStore();
  const [collapsed, mobileOpen, toggleNav, closeMobile] = useNavMode();
  const Page = PAGES[route.path] ?? Dashboard;

  useEffect(() => {
    const t = TITLES[route.path];
    document.title = t && route.path !== "resumen" ? `${t} · minichain` : "minichain explorer";
  }, [route.path]);

  return (
    <div className={`app ${collapsed ? "nav-collapsed" : ""} ${mobileOpen ? "nav-open" : ""}`}>
      <Header onToggleNav={toggleNav} />
      <SideNav current={route.path} onNavigate={closeMobile} />
      <main className="main" id="contenido">
        {error && !state ? (
          <div className="page-body">
            <Notice tone="bad" title="No hay conexión con el servidor">
              {error} Inicia <code>python -m server</code> y recarga la página.
            </Notice>
          </div>
        ) : state ? <Page /> : null}
      </main>
      <StatusBar />
      <Dialogs />
    </div>
  );
}
