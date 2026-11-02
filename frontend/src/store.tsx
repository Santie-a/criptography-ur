// Estado global de la UI: el estado de la red (por HTTP) y la conexión en
// tiempo real (WebSocket). Cuando el servidor avisa de un cambio, se vuelve
// a pedir /api/state. Así todas las pestañas y clientes se mantienen al día.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, eventsUrl } from "./api";
import type { NetworkState } from "./types";

type Conn = "connecting" | "online" | "offline";

interface Toast {
  id: number;
  text: string;
  tone: "info" | "bad";
}

interface Store {
  state: NetworkState | null;
  error: string | null;
  conn: Conn;
  clients: number;
  refresh: () => Promise<void>;
  setState: (s: NetworkState) => void;
  notify: (text: string, tone?: "info" | "bad") => void;
  /** Ejecuta una acción mostrando el error como aviso si falla. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  lastEvent: number;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [clients, setClients] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastEvent, setLastEvent] = useState(0);
  const versionRef = useRef(-1);

  const refresh = useCallback(async () => {
    try {
      const s = await api.state();
      versionRef.current = s.version;
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const notify = useCallback((text: string, tone: "info" | "bad" = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 6000 : 3200);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (e) {
        notify(e instanceof ApiError || e instanceof Error ? e.message : String(e), "bad");
        return undefined;
      }
    },
    [notify],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        if (ev.version !== versionRef.current) {
          refresh();
          setLastEvent(Date.now());
        }
      };
      ws.onclose = () => {
        setConn("offline");
        if (closed) return;
        timer = window.setTimeout(connect, Math.min(10000, 500 * 2 ** retry++));
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
    <Ctx.Provider value={{ state, error, conn, clients, refresh, setState, notify, run, lastEvent }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "bad" ? "bad" : ""}`}>
            {t.text}
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

/** Billetera con la que actúa este cliente (se recuerda por navegador). */
export function useActingWallet(): [string, (name: string) => void] {
  const [name, setName] = useState<string>(() => {
    try {
      return localStorage.getItem("minichain-wallet") ?? "Alice";
    } catch {
      return "Alice";
    }
  });
  const set = (n: string) => {
    setName(n);
    try {
      localStorage.setItem("minichain-wallet", n);
    } catch {
      /* almacenamiento no disponible */
    }
  };
  return [name, set];
}
