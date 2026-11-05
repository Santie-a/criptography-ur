// Compartir la aplicación entre dispositivos: códigos QR, enlaces para
// unirse o pagar, y la cuenta regresiva del minado automático.
import { useEffect, useState } from "react";
import { encode } from "uqr";
import { useStore } from "../store";
import type { NetworkState } from "../types";

/**
 * Código QR en SVG. Siempre negro sobre blanco con margen de 4 módulos, aunque
 * la interfaz esté en tema oscuro: es lo que leen bien todas las cámaras.
 */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const qr = encode(value, { ecc: "M", border: 4 });
  let d = "";
  qr.data.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) d += `M${x} ${y}h1v1h-1z`;
  }));
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "[::1]" || host.startsWith("127.");
}

export interface AppLink {
  /** Origen con el que otros dispositivos abren la aplicación. */
  base: string;
  /** "public": configurada en el servidor; "lan": IP de la red local adivinada;
   *  "page": la de esta pestaña; "local": localhost, no sirve en otro dispositivo. */
  source: "public" | "lan" | "page" | "local";
}

export function appLink(state: NetworkState | null): AppLink {
  if (state?.public_url) return { base: state.public_url.replace(/\/$/, ""), source: "public" };
  if (!isLocalHost(location.hostname)) return { base: location.origin, source: "page" };
  if (state?.lan_url) return { base: state.lan_url, source: "lan" };
  return { base: location.origin, source: "local" };
}

export const joinUrl = (link: AppLink) => `${link.base}/#/billetera`;
export const payUrl = (link: AppLink, address: string) => `${link.base}/#/billetera?to=${address}`;

/**
 * Segundos hasta el próximo bloque automático, o null si está apagado.
 * El servidor mina a ritmo fijo, así que la cuenta se reinicia sola cada
 * `interval` segundos aunque no llegue un estado nuevo.
 */
export function useAutomineCountdown(): { interval: number; remaining: number | null } {
  const { state, updatedAt } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const interval = state?.automine?.interval ?? 0;
  useEffect(() => {
    if (!interval) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [interval]);
  const nextIn = state?.automine?.next_in;
  if (!interval || nextIn === null || nextIn === undefined || !updatedAt) return { interval, remaining: null };
  const elapsed = (now - updatedAt.getTime()) / 1000;
  let remaining = nextIn - elapsed;
  if (remaining < 0) remaining = ((remaining % interval) + interval) % interval;
  return { interval, remaining: Math.ceil(remaining) };
}
