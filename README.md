# minichain: ECDSA desde cero y el ataque por nonce repetido

Proyecto de criptografía (Universidad del Rosario). Una cadena de bloques pequeña,
en Python puro, donde las transacciones se firman con **ECDSA sobre secp256k1**
(la curva de Bitcoin). Toda la aritmética de la curva está programada a mano.
Sobre esa cadena se demuestra un ataque real: si una billetera firma dos
transacciones con el mismo nonce `k`, cualquiera puede recuperar su clave
privada leyendo solo la cadena pública, y después firmar a su nombre sin que el
validador note nada.

Es un MVP con **datos simulados**: billeteras ficticias, tráfico aleatorio
reproducible con una semilla y una red de un solo nodo (sin P2P ni consenso).

## Ejecutar

Requiere Python 3.10 o superior. El proyecto no tiene dependencias en tiempo de
ejecución.

```bash
python -m minichain                      # demo completa, unos 8 s
python -m minichain --pausa              # se detiene entre pasos (para presentar en vivo)
python -m minichain --dificultad 18      # prueba de trabajo más cara
python -m minichain --bits-entropia 2 --semilla 7
```

Pruebas (usan la librería `ecdsa` como referencia):

```bash
pip install -r requirements.txt
python -m pytest
```

## Qué muestra la demo

1. **Curva**: G está en la curva, n·G = O, (a+b)·G = a·G + b·G, inverso por Euclides extendido.
2. **Cadena simulada**: Alice firma con RFC 6979, Carol con nonces aleatorios del
   sistema operativo, y Bob con una billetera cuyo generador aleatorio solo tiene
   2³ = 8 estados posibles. Se minan 5 bloques con prueba de trabajo.
3. **Validación** de la cadena honesta.
4. **Ataque**: Mallory recolecta (Q, r, s, z) de cada transacción, encuentra dos
   firmas de Bob con el mismo `r`, despeja `k` y `d`, y confirma `d·G = Q`.
5. **Robo**: Mallory firma una transferencia de todo el saldo de Bob hacia ella.
   La red mina el bloque y el validador acepta toda la cadena.
6. **Manipulación**: cambiar un monto, re-minar un bloque, intercambiar firmas,
   bajar la dificultad o gastar de más. El validador detecta cada caso.
7. **Defensa**: misma simulación con Bob usando RFC 6979. Ningún `r` se repite y
   el ataque no recupera nada.

## Estructura

| Archivo | Parte | Contenido |
|---|---|---|
| `minichain/ntheory.py` | 1 | Euclides extendido e inverso modular |
| `minichain/curve.py` | 1 | Curva sobre F_p, suma, duplicación, double-and-add, codificación SEC1, parámetros de secp256k1 |
| `minichain/signatures.py` | 2 | Generación de claves, firma y verificación ECDSA (SHA-256 de `hashlib`) |
| `minichain/nonces.py` | 2, 5, 6 | Nonce aleatorio, RFC 6979, y los generadores rotos (k constante, RNG débil) |
| `minichain/wallet.py` | 3 | Billetera: claves, dirección y estrategia de nonce |
| `minichain/merkle.py` | 3 | Raíz de Merkle |
| `minichain/block.py` | 3 | Transacciones, bloques, prueba de trabajo con dificultad ajustable |
| `minichain/chain.py` | 3 | La cadena: génesis, minado y estado de cuentas |
| `minichain/validator.py` | 4 | Recorre la cadena y reporta cada manipulación |
| `minichain/attack.py` | 5 | Recolección de firmas, detección de `r` repetido, recuperación de `k` y `d` |
| `minichain/simulation.py` | | Escenario con datos simulados |
| `minichain/demo.py` | | Demo narrada |
| `tests/` | | 34 pruebas, incluida la comparación contra `ecdsa` |

## La matemática

### Curva y grupo

secp256k1 es `y² = x³ + 7` sobre F_p con
`p = 2²⁵⁶ − 2³² − 977`. Sus puntos, junto con el punto en el infinito O,
forman un grupo abeliano. El generador G tiene orden primo
`n ≈ 2²⁵⁶` y el cofactor es 1.

- Suma (P ≠ ±Q): λ = (y₂ − y₁)/(x₂ − x₁), x₃ = λ² − x₁ − x₂, y₃ = λ(x₁ − x₃) − y₁
- Duplicación: λ = (3x₁² + a)/(2y₁), con las mismas fórmulas para x₃ y y₃
- Las divisiones son multiplicaciones por el inverso módulo p (Euclides extendido).
- k·P con double-and-add: se recorren los bits de k; en cada uno se duplica y, si el bit es 1, se suma P. Son O(log k) operaciones.

`tests/test_math.py` enumera los 100 puntos de una curva de juguete sobre F₉₇ y
comprueba neutro, inversos, conmutatividad y asociatividad.

### ECDSA

Clave privada `d ∈ [1, n−1]`, pública `Q = d·G`. Para firmar m con z = SHA-256(m):

$$R = kG,\quad r = R_x \bmod n,\quad s = k^{-1}(z + r d) \bmod n$$

Para verificar: w = s⁻¹, u₁ = z·w, u₂ = r·w, y se acepta si (u₁G + u₂Q)ₓ mod n = r.
Funciona porque u₁G + u₂Q = w(z + rd)G = kG.

La implementación se compara contra la librería `ecdsa`: mismas claves
públicas, firmas propias verificadas por la librería y viceversa, y con RFC 6979
el mismo `k` y la misma firma byte a byte.

### El ataque

Si dos firmas de la misma clave sobre z₁ ≠ z₂ usan el mismo k, comparten r, y

$$k \equiv (z_1 - z_2)(s_1 - s_2)^{-1} \pmod n, \qquad d \equiv (s_1 k - z_1)\, r^{-1} \pmod n$$

Todo lo necesario es público: Q y (r, s) están en la transacción, y z se calcula
hasheando la transacción. El atacante puede además confirmar el resultado
comprobando d·G = Q. `attack.py` también contempla firmas normalizadas a
"low-s" (s → n − s, regla de Bitcoin), probando ambos signos de s₂.

### La defensa: RFC 6979

k = HMAC-DRBG(d, H(m)). El nonce depende de la clave y del mensaje, no de un
generador aleatorio. Mensajes distintos producen nonces independientes, y el
mismo mensaje produce la misma firma, lo cual no sirve para el ataque porque z₁ = z₂.

## Contexto histórico

- **Sony PS3 (2010)**: el grupo fail0verflow mostró en el 27C3 que Sony firmaba
  el software de la consola con ECDSA usando siempre el mismo k. Con dos firmas
  recuperaron la clave privada. En el proyecto: `ConstantNonce`.
- **Android (2013)**: un fallo en la inicialización de `SecureRandom` de Java en
  Android hizo que el generador repitiera salidas. Varias billeteras de Bitcoin
  firmaron con k repetidos y les robaron fondos. En el proyecto: `WeakRNGNonce`.

## Simplificaciones

- Red de un solo nodo: no hay P2P, consenso distribuido ni bifurcaciones.
- Modelo de cuentas con contador `seq` (anti-replay) en lugar de UTXO.
- Dirección = primeros 20 bytes de SHA-256(clave pública comprimida), sin RIPEMD-160 ni Base58Check.
- Las firmas no se normalizan a low-s.
- La multiplicación escalar no es de tiempo constante: es correcta, pero no
  resiste ataques de canal lateral. No usar para proteger dinero real.
