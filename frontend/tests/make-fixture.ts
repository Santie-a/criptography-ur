// Genera tests/fixtures/device_wallet.json: firmas hechas en "el navegador"
// (este código) que la implementación de Python debe aceptar. Se ejecuta una
// vez: node tests/make-fixture.ts
import { writeFileSync } from "node:fs";
import {
  addressFromPublicKey, publicKeyHex, registrationMessage, sha256Hex, signMessage, signTransaction, txPayload,
} from "../src/wallet/crypto.ts";

const priv = "6f1d3e0a5c2b9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706";
const pub = publicKeyHex(priv);
const memos = ["", "café", "niño 😀", 'comillas "y" \\barra', "línea\nnueva\ttab", "\u0001control", "ñandú/€"];
const cases = memos.map((memo, i) => {
  const { tx, signed } = signTransaction(priv, { recipient: "mc" + "ab".repeat(20), amount: 10 + i, seq: i, memo });
  return { ...tx, payload: txPayload(tx), z: signed.z };
});
const name = "Sofía";
const reg = signMessage(priv, registrationMessage(name, pub));
const out = {
  private_key: priv, pubkey: pub, address: addressFromPublicKey(pub),
  cases, registration: { name, message: reg.message, signature: reg.signature, z: sha256Hex(reg.message) },
};
writeFileSync(new URL("../../tests/fixtures/device_wallet.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("ok", out.address);
