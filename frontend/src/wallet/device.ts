// La billetera de este dispositivo, guardada en el navegador.
//
// La clave privada se queda aquí: nunca se envía al servidor. Si se borran los
// datos del navegador, la billetera se pierde (como en una billetera real), por
// eso la interfaz ofrece exportarla.
import { useCallback, useEffect, useState } from "react";
import { addressFromPublicKey, publicKeyHex } from "./crypto";

const KEY = "minichain-device-wallet";

export interface DeviceWallet {
  name: string;
  privateKey: string;
  pubkey: string;
  address: string;
  createdAt: number;
}

function read(): DeviceWallet | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeviceWallet) : null;
  } catch {
    return null;
  }
}

export function makeDeviceWallet(name: string, privateKey: string): DeviceWallet {
  const pubkey = publicKeyHex(privateKey);
  return { name, privateKey, pubkey, address: addressFromPublicKey(pubkey), createdAt: Date.now() };
}

/** [billetera, guardar, olvidar]. Se sincroniza entre pestañas del mismo navegador. */
export function useDeviceWallet(): [DeviceWallet | null, (w: DeviceWallet) => boolean, () => void] {
  const [wallet, setWallet] = useState<DeviceWallet | null>(read);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEY && setWallet(read());
    const onLocal = () => setWallet(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("minichain-wallet-changed", onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("minichain-wallet-changed", onLocal);
    };
  }, []);
  const save = useCallback((w: DeviceWallet) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(w));
    } catch {
      return false; // sin almacenamiento (modo privado estricto): la billetera no se puede guardar
    }
    setWallet(w);
    window.dispatchEvent(new Event("minichain-wallet-changed"));
    return true;
  }, []);
  const forget = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nada que borrar */
    }
    setWallet(null);
    window.dispatchEvent(new Event("minichain-wallet-changed"));
  }, []);
  return [wallet, save, forget];
}
