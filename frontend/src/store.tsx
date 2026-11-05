// Estado global de la aplicación:
//  - estado de la red (HTTP) y eventos en tiempo real (WebSocket)
//  - identidad activa: con qué billetera actúa este navegador
//  - alertas de seguridad: resultado del análisis de firmas, recalculado
//    cada vez que cambia la cadena
//  - diálogos globales (nueva transacción, minar, nueva billetera)
import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, eventsUrl, getAdminToken, setAdminToken } from "./api";
import type { AttackScan, NetworkState } from "./types";

type Conn = "connecting" | "online" | "offline";
export type DialogKind = "transfer" | "mine" | "wallet" | "admin" | "invite" | null;

interface Toast {
  id: number;
  text: string;
  tone: "ok" | "bad";
}

interface Store {
  state: NetworkState | null;
  error: string | null;
  conn: Conn;
  clients: number;
  updatedAt: Date | null;
  scan: AttackScan | null;
  identity: string;
  setIdentity: (name: string) => void;
  dialog: DialogKind;
  openDialog: (d: DialogKind) => void;
  /** Este navegador puede usar las acciones de administrador. */
  isAdmin: boolean;
  /** El servidor exige token (false = modo abierto, desarrollo local). */
  authRequired: boolean;
  login: (token: string) => Promise<boolean>;
  logout: () => void;
  refresh: () => Promise<void>;
  rescan: () => Promise<void>;
  setState: (s: NetworkState) => void;
  notify: (text: string, tone?: "ok" | "bad") => void;
  /** Ejecuta una llamada y muestra el error como aviso si falla. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

const Ctx = createContext<Store | null>(null);

function readIdentity(): string {
  try {
    return localStorage.getItem("minichain-wallet") ?? "Alice";
  } catch {
    return "Alice";
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<NetworkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [clients, setClients] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [scan, setScan] = useState<AttackScan | null>(null);
  const [identity, setIdentityRaw] = useState(readIdentity);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const versionRef = useRef(-1);

  const setState = useCallback((s: NetworkState) => {
    versionRef.current = s.version;
    setStateRaw(s);
    setUpdatedAt(new Date());
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [setState]);

  const notify = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 6000 : 3500);
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      // Token vencido o cambiado en el servidor: se olvida y se avisa.
      if (e instanceof ApiError && e.status === 401 && getAdminToken()) {
        setAdminToken(null);
        refresh();
        notify("La sesión de administrador ya no es válida. Vuelve a ingresar el token.", "bad");
        return undefined;
      }
      notify(e instanceof ApiError || e instanceof Error ? e.message : String(e), "bad");
      return undefined;
    }
  }, [notify, refresh]);

  const login = useCallback(async (token: string) => {
    try {
      await api.checkAdmin(token);
    } catch (e) {
      notify(e instanceof ApiError && e.status === 401 ? "Token incorrecto." : String(e), "bad");
      return false;
    }
    setAdminToken(token);
    await refresh();
    notify("Sesión de administrador iniciada");
    return true;
  }, [notify, refresh]);

  const logout = useCallback(() => {
    setAdminToken(null);
    setDialog(null);
    refresh();
    notify("Sesión de administrador cerrada");
  }, [notify, refresh]);

  const isAdmin = state?.auth?.admin ?? false;
  const authRequired = state?.auth?.required ?? true;

  const setIdentity = useCallback((name: string) => {
    setIdentityRaw(name);
    try {
      localStorage.setItem("minichain-wallet", name);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Análisis de firmas en segundo plano: alimenta las alertas del shell.
  const rescan = useCallback(async () => {
    try {
      setScan(await api.scan());
    } catch {
      setScan(null);
    }
  }, []);
  const version = state?.version;
  useEffect(() => {
    if (version !== undefined) rescan();
  }, [version, rescan]);

  // Si la identidad elegida ya no existe (por ejemplo tras regenerar), usar la primera.
  useEffect(() => {
    if (state && !state.wallets.some((w) => w.name === identity)) setIdentity(state.wallets[0]?.name ?? "Alice");
  }, [state, identity, setIdentity]);

  // WebSocket con reconexión exponencial.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: number | undefined;
    let closed = false;
    const connect = () => {
      setConn("connecting");
      ws = new WebSocket(eventsUrl());
      ws.onopen = () => {
        retry = 0;
        setConn("online");
        refresh();
      };
      ws.onmessage = (msg) => {
        const ev = JSON.parse(msg.data);
        if (typeof ev.clients === "number") setClients(ev.clients);
        if (ev.type === "presence" || ev.type === "hello") return;
        if (ev.version !== versionRef.current) refresh();
      };
      ws.onclose = () => {
        setConn("offline");
        if (!closed) timer = window.setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [refresh]);

  return (
    <Ctx.Provider value={{
      state, error, conn, clients, updatedAt, scan, identity, setIdentity,
      dialog, openDialog: setDialog, isAdmin, authRequired, login, logout,
      refresh, rescan, setState, notify, run,
    }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.tone === "bad" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore fuera de StoreProvider");
  return s;
}
