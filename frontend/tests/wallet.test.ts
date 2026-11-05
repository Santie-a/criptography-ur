// Pruebas de la criptografía del navegador: node --test tests/
// Usan la misma fixture que tests/test_device_wallet.py (Python), así que si
// cualquiera de los dos lados cambia el formato, falla alguno.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as secp from "@noble/secp256k1";
import {
  addressFromPublicKey, canonicalJson, fromHex, generatePrivateKey, isValidPrivateKey, publicKeyHex,
  registrationMessage, signMessage, signTransaction, txPayload,
} from "../src/wallet/crypto.ts";

const fx = JSON.parse(readFileSync(new URL("../../tests/fixtures/device_wallet.json", import.meta.url), "utf8"));

test("clave pública y dirección", () => {
  assert.equal(publicKeyHex(fx.private_key), fx.pubkey);
  assert.equal(addressFromPublicKey(fx.pubkey), fx.address);
});

test("el texto firmado coincide con Python y la firma es determinista (RFC 6979)", () => {
  for (const c of fx.cases) {
    const { tx, signed } = signTransaction(fx.private_key, { recipient: c.recipient, amount: c.amount, seq: c.seq, memo: c.memo });
    assert.equal(txPayload(tx), c.payload, c.memo);
    assert.equal(signed.z, c.z);
    assert.equal(tx.signature, c.signature);
  }
});

test("registro firmado", () => {
  const r = fx.registration;
  assert.equal(registrationMessage(r.name, fx.pubkey), r.message);
  assert.equal(signMessage(fx.private_key, r.message).signature, r.signature);
});

test("JSON canónico como json.dumps de Python", () => {
  assert.equal(canonicalJson({ b: 1, a: "é" }), '{"a":"\\u00e9","b":1}');
  assert.equal(canonicalJson({ x: "😀" }), '{"x":"\\ud83d\\ude00"}');
  assert.equal(canonicalJson({ x: "a\"b\\c\n" }), '{"x":"a\\"b\\\\c\\n"}');
});

test("claves nuevas", () => {
  const d = generatePrivateKey();
  assert.ok(isValidPrivateKey(d));
  assert.ok(!isValidPrivateKey("00".repeat(32)));
  assert.ok(!isValidPrivateKey("zz"));
  const signed = signMessage(d, "hola");
  const sig = new secp.Signature(BigInt("0x" + signed.r), BigInt("0x" + signed.s));
  assert.ok(secp.verify(sig, fromHex(signed.z), publicKeyHex(d)));
});
