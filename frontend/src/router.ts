// Enrutador mínimo por hash: #/bloques?b=3. Sin dependencias y funciona
// igual servido por Python, por Vite o desde un hosting estático.
import { useEffect, useState } from "react";

export interface Route {
  path: string;
  params: URLSearchParams;
}

function read(): Route {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query] = raw.split("?");
  return { path: path || "resumen", params: new URLSearchParams(query ?? "") };
}

export function href(path: string, params?: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([k, v]) => v !== null && v !== undefined && v !== "" && q.set(k, String(v)));
  const qs = q.toString();
  return `#/${path}${qs ? `?${qs}` : ""}`;
}

export function go(path: string, params?: Record<string, string | number | null | undefined>): void {
  location.hash = href(path, params);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
