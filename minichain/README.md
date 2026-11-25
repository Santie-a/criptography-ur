# minichain por consola

Una blockchain pequeña con ECDSA sobre secp256k1 programado desde cero, y el
ataque que recupera una clave privada cuando una billetera repite el nonce `k`.

## Cómo ejecutarlo

Requiere Python 3.10 o superior. No necesita instalar nada: la carpeta es
autocontenida y solo usa la librería estándar.

Desde dentro de esta carpeta:

```bash
python .              # recorrido completo, unos segundos
python . --pausa      # espera Enter entre pasos (para exponer)
```

Desde la carpeta que la contiene también funcionan `python minichain` y
`python -m minichain`. En algunos sistemas el comando es `python3`.

Opciones:

| Opción | Por defecto | Qué cambia |
|---|---|---|
| `--semilla N` | 2026 | Los datos simulados (claves, montos, destinatarios) |
| `--dificultad N` | 14 | Bits en cero de la prueba de trabajo (0 a 24; cada bit duplica el tiempo de minado) |
| `--bits-entropia N` | 3 | Entropía del generador defectuoso de Bob: 2^N nonces posibles |

Con `--bits-entropia 3` Bob tiene 8 nonces posibles y firma 10 veces, así que
alguno se repite siempre. Con valores más altos puede no repetirse y el ataque
no encuentra nada.

## Qué hace, paso a paso

1. **Curva:** comprueba que G está en secp256k1, que n·G es el punto infinito y
   calcula un inverso modular con Euclides extendido.
2. **Cadena:** crea cinco billeteras (Alice, Bob, Carol, Minera y Mallory) y mina
   6 bloques con transacciones firmadas, raíz de Merkle y prueba de trabajo.
3. **Validador:** revisa la cadena honesta: es válida.
4. **Ataque:** Mallory lee la cadena, encuentra dos firmas de Bob con el mismo
   `r` y despeja `k = (z1 − z2)(s1 − s2)⁻¹` y `d = (s1·k − z1)·r⁻¹ (mod n)`.
5. **Robo:** firma una transferencia de todo el saldo de Bob con la clave
   recuperada. El validador la acepta, porque la firma es correcta.
6. **Manipulación:** cambia montos, firmas y dificultad de bloques viejos; el
   validador rechaza cada caso y dice qué regla falló.
7. **Defensa:** repite todo con RFC 6979 (nonce determinista): ningún `r` se
   repite y no se recupera ninguna clave.

## Qué funciona

- Aritmética de curvas elípticas sobre F_p: suma, duplicación, double-and-add.
- ECDSA: firma y verificación, con cuatro formas de generar `k` (RFC 6979,
  aleatorio, generador defectuoso y `k` constante).
- Transacciones firmadas con contador anti-repetición, árbol de Merkle con
  pruebas de inclusión, enlace por hash y prueba de trabajo ajustable.
- Validador con 10 reglas que reporta todos los problemas, no solo el primero.
- Detección de nonces repetidos, recuperación de `k` y `d` y transacción
  falsificada que pasa la validación.

## Qué falta

- Un solo nodo: no hay red P2P, consenso ni bifurcaciones.
- Modelo de cuentas con contador, no UTXO.
- Direcciones simplificadas (SHA-256 truncado, sin RIPEMD-160 ni Base58Check).
- Las firmas no se normalizan a *low-s*.
- La multiplicación escalar no es de tiempo constante. No usar con dinero real.
- La consola muestra un recorrido fijo: no tiene comandos para crear billeteras
  o enviar transacciones a mano.

## Archivos

| Archivo | Contenido |
|---|---|
| `ntheory.py` | Euclides extendido e inverso modular |
| `curve.py` | Puntos, suma, duplicación, multiplicación escalar, secp256k1 |
| `signatures.py` | Firma y verificación ECDSA |
| `nonces.py` | Generadores de `k`: RFC 6979, aleatorio, defectuoso, constante |
| `wallet.py` | Par de claves y dirección |
| `merkle.py` | Árbol de Merkle y pruebas de inclusión |
| `block.py` | Transacciones, bloques y minado |
| `chain.py`, `node.py` | Cadena y transacciones pendientes |
| `validator.py` | Las reglas de validez |
| `attack.py` | Búsqueda de `r` repetidos y recuperación de la clave |
| `simulation.py` | Escenario con las cinco billeteras |
| `demo.py` | El recorrido que muestra `python -m minichain` |
