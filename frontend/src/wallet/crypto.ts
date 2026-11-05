// Criptografía de la billetera del dispositivo.
//
// La clave privada se genera y se usa SOLO en este navegador. Al servidor le
// llegan la clave pública y las firmas; la verificación la hace la
// implementación propia de minichain en Python (minichain/signatures.py).
//
// Para firmar se usa @noble/secp256k1, una implementación auditada de ECDSA
// sobre secp256k1 con nonces deterministas RFC 6979: la billetera del
// celular no puede repetir nonces.
//
// Este archivo no importa nada local, para poder probarlo con node directamente
// (frontend/tests/wallet.test.ts).
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import * as secp from "@noble/secp256k1";

// La firma síncrona de noble necesita HMAC-SHA256 (para RFC 6979). Se usa la
// de @noble/hashes y no WebCrypto, que solo existe en páginas HTTPS: así
// también funciona desde un celular conectado por la IP de la red local.
secp.etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) =>
  hmac(sha256, key, secp.etc.concatBytes(...msgs));

const enc = new TextEncoder();

export const toHex = (b: Uint8Array): string => secp.etc.bytesToHex(b);
export const fromHex = (h: string): Uint8Array => secp.etc.hexToBytes(h);
export const sha256Hex = (data: string | Uint8Array): string =>
  toHex(sha256(typeof data === "string" ? enc.encode(data) : data));

export function generatePrivateKey(): string {
  return toHex(secp.utils.randomPrivateKey());
}

export function isValidPrivateKey(hex: string): boolean {
  try {
    return /^[0-9a-f]{64}$/i.test(hex) && secp.utils.isValidPrivateKey(hex.toLowerCase());
  } catch {
    return false;
  }
}

/** Clave pública comprimida (33 bytes) en hex, igual que encode_point en Python. */
export function publicKeyHex(privHex: string): string {
  return toHex(secp.getPublicKey(privHex, true));
}

/** Dirección = "mc" + primeros 20 bytes de SHA-256(clave pública), como wallet.py. */
export function addressFromPublicKey(pubHex: string): string {
  return "mc" + sha256Hex(fromHex(pubHex)).slice(0, 40);
}

/**
 * JSON canónico idéntico a json.dumps(obj, sort_keys=True, separators=(",", ":"))
 * de Python: claves ordenadas, sin espacios y todo carácter no ASCII escapado
 * como \uXXXX (Python usa ensure_ascii=True por defecto; JavaScript no escapa).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") {
    return JSON.stringify(value).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => canonicalJson(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}

export interface TxFields {
  sender: string;     // clave pública comprimida (hex)
  recipient: string;  // dirección mc…
  amount: number;
  seq: number;
  memo: string;
}

/** Los bytes que se firman, como Transaction.payload() en minichain/block.py. */
export function txPayload(f: TxFields): string {
  return canonicalJson({ amount: f.amount, memo: f.memo, recipient: f.recipient, sender: f.sender, seq: f.seq });
}

export interface SignedMessage {
  message: string;
  z: string;   // SHA-256 del mensaje, en hex
  r: string;   // 64 dígitos hex
  s: string;
  signature: string; // r || s, el formato que espera la API
}

/** Firma ECDSA con nonce RFC 6979. z = SHA-256(mensaje), igual que en el servidor. */
export function signMessage(privHex: string, message: string): SignedMessage {
  const z = sha256(enc.encode(message));
  const sig = secp.sign(z, privHex);
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  return { message, z: toHex(z), r, s, signature: r + s };
}

/** Mensaje que se firma para registrar un nombre: prueba que el dueño de la clave lo pidió. */
export function registrationMessage(name: string, pubHex: string): string {
  return `minichain:registro:${name}:${pubHex}`;
}

export function signTransaction(privHex: string, fields: Omit<TxFields, "sender">) {
  const sender = publicKeyHex(privHex);
  const full: TxFields = { ...fields, sender };
  const signed = signMessage(privHex, txPayload(full));
  return { tx: { ...full, signature: signed.signature }, signed };
}
