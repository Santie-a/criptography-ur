// Cliente de la API. Toda la comunicación con la simulación pasa por aquí:
// si cambias de backend (otro host, otro puerto), solo cambia VITE_API_URL.
import type {
  AttackScan, BlockDetail, CurveAdd, CurveMul, CurvePoints, DefenseStats, MerkleProof,
  MineResult, NetworkState, NonceKind, Pt, RecoverResult, ScenarioParams, SearchResult, Secp256k1Info,
  SignResult, StealResult, TamperResult, Tx, TxDetail, TxRow, ValidationResult, VerifySteps, Wallet,
  WalletDetail,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// Token del administrador. Se recuerda en este navegador (el PC de quien
// expone); los participantes no lo necesitan.
const TOKEN_KEY = "minichain-admin-token";
let adminToken: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

export function getAdminToken(): string | null {
  return adminToken;
}

export function setAdminToken(token: string | null): void {
  adminToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* almacenamiento no disponible: el token dura lo que dure la pestaña */
  }
}

async function request<T>(method: string, path: string, body?: unknown, token = adminToken): Promise<T> {
  let res: Response;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor. ¿Está corriendo `python -m server`?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d: { msg: string }) => d.msg).join("; ")
      : data.detail ?? res.statusText;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body: unknown = {}) => request<T>("POST", path, body);
const put = <T>(path: string, body: unknown) => request<T>("PUT", path, body);

export const api = {
  // red
  state: () => get<NetworkState>("/api/state"),
  /** Comprueba un token sin guardarlo. */
  checkAdmin: (token: string) => request<{ ok: boolean }>("GET", "/api/admin/check", undefined, token),
  reset: (params: Partial<ScenarioParams>) => post<NetworkState>("/api/reset", params),
  block: (i: number) => get<BlockDetail>(`/api/blocks/${i}`),
  proof: (i: number, tx: number) => get<MerkleProof>(`/api/blocks/${i}/proof/${tx}`),
  exportChain: () => get<unknown>("/api/chain/export"),
  search: (q: string) => get<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  transactions: (address?: string) =>
    get<TxRow[]>(`/api/transactions${address ? `?address=${encodeURIComponent(address)}` : ""}`),
  transaction: (txid: string) => get<TxDetail>(`/api/transactions/${txid}`),
  wallet: (name: string) => get<WalletDetail>(`/api/wallets/${encodeURIComponent(name)}`),
  // billeteras y transacciones
  createWallet: (name: string, nonce: NonceKind) => post<Wallet>("/api/wallets", { name, nonce }),
  setNonce: (name: string, nonce: NonceKind) =>
    put<Wallet>(`/api/wallets/${encodeURIComponent(name)}/nonce`, { nonce }),
  transfer: (sender: string, recipient: string, amount: number, memo: string) =>
    post<Tx>("/api/transactions/transfer", { sender, recipient, amount, memo }),
  mine: (miner: string, difficulty?: number) => post<MineResult>("/api/mine", { miner, difficulty }),
  // validador
  validate: () => get<ValidationResult>("/api/validate"),
  tamper: (block: number, tx: number, action: string) =>
    post<TamperResult>("/api/tamper", { block, tx, action }),
  tamperActions: () => get<Record<string, string>>("/api/tamper/actions"),
  validateExternal: (chain: unknown) => post<ValidationResult>("/api/validate/external", chain),
  // ataque y defensa
  scan: () => get<AttackScan>("/api/attack/scan"),
  steal: (victim: string, thief: string) => post<StealResult>("/api/attack/steal", { victim, thief }),
  compareDefense: (seed: number, entropy_bits: number) =>
    post<Record<"weak" | "rfc6979", DefenseStats>>("/api/defense/compare", { seed, entropy_bits }),
  // laboratorios
  curve: (p: number, a: number, b: number) => get<CurvePoints>(`/api/lab/curve?p=${p}&a=${a}&b=${b}`),
  curveAdd: (p: number, a: number, b: number, P: Pt, Q: Pt) =>
    post<CurveAdd>("/api/lab/curve/add", { p, a, b, P, Q }),
  curveMul: (p: number, a: number, b: number, P: Pt, k: number) =>
    post<CurveMul>("/api/lab/curve/mul", { p, a, b, P, k }),
  secp256k1: () => get<Secp256k1Info>("/api/lab/secp256k1"),
  sign: (message: string, private_key: string | null, nonce: string, k?: string) =>
    post<SignResult>("/api/lab/ecdsa/sign", { message, private_key, nonce, k }),
  verify: (message: string, pubkey: string, r: string, s: string) =>
    post<VerifySteps>("/api/lab/ecdsa/verify", { message, pubkey, r, s }),
  recover: (body: { r: string; s1: string; z1: string; s2: string; z2: string; pubkey?: string }) =>
    post<RecoverResult>("/api/lab/ecdsa/recover", body),
};

/** URL del WebSocket de eventos, derivada de la URL de la API. */
export function eventsUrl(): string {
  if (BASE) return BASE.replace(/^http/, "ws") + "/api/events";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/events`;
}
