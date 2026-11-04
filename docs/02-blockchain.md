# 2. Blockchain

> **En una frase:** una blockchain es un libro de cuentas público, dividido en
> páginas (bloques), donde cada página guarda una huella de la anterior, de modo
> que cambiar algo del pasado rompe todas las páginas siguientes y se nota.

Este documento explica cada pieza con ejemplos reales sacados de minichain. Las
partes criptográficas (hash y firmas) se mencionan aquí por lo que hacen; cómo
funcionan por dentro está en [3. Criptografía](03-criptografia.md).

---

## 2.1 La idea: un libro de cuentas que nadie puede reescribir

Imagina un cuaderno donde se anota cada pago: "Alice le paga 10 a Bob", "Bob le
paga 5 a Carol"... Con ese cuaderno, cualquiera puede calcular cuánto tiene cada
persona. El problema es la confianza: ¿quién guarda el cuaderno?, ¿qué impide que
alguien borre una línea o cambie un 10 por un 100?

Una blockchain resuelve tres problemas a la vez:

| Problema | Solución | Herramienta |
|---|---|---|
| ¿Cómo sé que Alice autorizó el pago y no otra persona? | Alice **firma** cada pago con su clave privada. | Firma digital ECDSA |
| ¿Cómo sé que nadie cambió un pago viejo? | Cada página guarda la **huella** de la página anterior. | Función hash SHA-256 |
| ¿Por qué no reescribir todo el cuaderno con huellas nuevas? | Crear cada página cuesta mucho trabajo de cómputo. | Prueba de trabajo (minado) |

---

## 2.2 Las cuentas y las direcciones

Cada participante tiene una **billetera**, que no es más que un par de claves:

- **Clave privada**: un número secreto enorme (de 256 bits, unas 77 cifras
  decimales). Con ella se firma. Quien la tiene, controla el dinero.
- **Clave pública**: se calcula a partir de la privada y se puede mostrar a todo
  el mundo. Sirve para verificar firmas. De la pública **no** se puede obtener la
  privada (salvo que se cometa el error que demuestra este proyecto).
- **Dirección**: una versión corta de la clave pública, para recibir pagos. En
  minichain es `mc` seguido de los primeros 20 bytes del hash de la clave pública:

```
Clave pública de Alice: 02ff6d32cb9bb9b1e836c9355834741ff2ff538d96f52119c25191254803d3291a
Dirección de Alice:     mcc172556a0175361397f44c28af8f51c89ef5975b
```

En el código: `minichain/wallet.py`.

---

## 2.3 Las transacciones

Una transacción es una orden de pago firmada. En minichain tiene estos campos:

| Campo | Qué es | Ejemplo |
|---|---|---|
| `sender` | Clave pública de quien paga | `02ff6d32…3291a` |
| `recipient` | Dirección de quien recibe | `mc013b91…15b4a` |
| `amount` | Monto | `21` |
| `seq` | Contador de transacciones de quien paga (0, 1, 2…) | `0` |
| `memo` | Nota libre | `almuerzo` |
| `signature` | La firma (r, s) | dos números de 64 dígitos hexadecimales |

### ¿Qué se firma exactamente?

Todo menos la firma, convertido a texto en un orden fijo. Esto es lo que firmó
Alice en una transacción real de la simulación:

```json
{"amount":21,"memo":"almuerzo","recipient":"mc013b91d8480bb34cc77b36ac3ca8a59a02d15b4a","sender":"02ff6d32cb9bb9b1e836c9355834741ff2ff538d96f52119c25191254803d3291a","seq":0}
```

Si alguien cambia aunque sea un carácter (por ejemplo el `21` por `91`), la firma
deja de ser válida, porque se firmó el texto original.

### ¿Para qué sirve `seq`?

Evita el **ataque de repetición** (replay). Sin el contador, alguien podría copiar
una transacción vieja y válida de Alice ("Alice paga 21 a Carol") y volver a
enviarla mil veces: la firma seguiría siendo válida. Con `seq`, la red exige que
la siguiente transacción de Alice tenga exactamente el número siguiente. Una copia
vieja trae un `seq` ya usado y se rechaza.

Además hace que cada mensaje firmado sea distinto, incluso si Alice paga el mismo
monto a la misma persona dos veces.

### El identificador de la transacción (txid)

Es el hash SHA-256 de la transacción completa, incluida la firma:

```
txid: d0f2d534f8ddc514a5a6653b06dbfbcc6c40db7a56a51404675f1aa227a82089
```

Sirve como nombre único. Es lo que se busca en la barra de búsqueda de la interfaz.

### Transacciones sin firma

Hay dos tipos de transacciones que no tienen firma, porque las crea la propia red:

- **Asignación inicial**: en el primer bloque (génesis), Alice, Bob y Carol reciben
  1000 monedas cada uno. Sin esto no habría dinero en circulación.
- **Recompensa (coinbase)**: cada bloque nuevo empieza con un pago de 50 monedas a
  quien lo minó. Es el incentivo para minar.

En el código: `minichain/block.py` (clase `Transaction`).

---

## 2.4 La mempool: la sala de espera

Cuando alguien envía una transacción, no entra a la cadena de inmediato. Primero
va a la **mempool** (memory pool), una lista de transacciones pendientes. El nodo
la revisa antes de aceptarla:

- ¿La firma es válida?
- ¿El `seq` es el siguiente que corresponde?
- ¿Le alcanza el saldo, **contando las otras pendientes**? Si Alice tiene 100 y ya
  tiene pendiente un pago de 80, no puede enviar otro de 30.

Las transacciones salen de la mempool cuando alguien mina un bloque que las
incluye.

En el código: `minichain/node.py`. En la interfaz: **Transacciones → Pendientes**.

---

## 2.5 Los bloques

Un bloque agrupa transacciones y tiene un **encabezado** con estos campos:

| Campo | Qué es |
|---|---|
| `index` | Número del bloque (0 es el génesis) |
| `prev_hash` | **Hash del bloque anterior**: el eslabón de la cadena |
| `merkle_root` | Una huella que resume todas las transacciones del bloque (ver 2.6) |
| `timestamp` | Fecha y hora |
| `difficulty` | Cuántos bits en cero debe tener el hash del bloque (ver 2.7) |
| `nonce` | Un número que el minero va cambiando hasta cumplir la dificultad |

> **Cuidado con la palabra "nonce".** En este proyecto aparecen dos nonces que no
> tienen nada que ver entre sí:
> - El **nonce de la prueba de trabajo** (este, en el bloque): un contador que el
>   minero prueba al azar. Es público y no pasa nada si se repite.
> - El **nonce de la firma ECDSA** (`k`): un número secreto que se usa al firmar.
>   **Si se repite, se pierde la clave privada.** Es el protagonista del
>   [documento 4](04-vulnerabilidad.md).

### El hash del bloque

El hash del bloque es el SHA-256 de su encabezado escrito así:

```
índice | hash anterior | raíz de Merkle | fecha | dificultad | nonce
1|00f3f0301a7c…44c4|72c9cddfcab3…b232|1767226200|8|77
```

```
hash = 0073859c76a35956a4d19642455eec68afbdaec0c29ffb004901715b902cc396
```

### Por qué se llama "cadena"

Cada bloque guarda el hash del anterior en `prev_hash`:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Bloque 0     │     │ Bloque 1     │     │ Bloque 2     │
│ prev: 0000…  │ ◄── │ prev: hash0  │ ◄── │ prev: hash1  │
│ txs…         │     │ txs…         │     │ txs…         │
│ hash0        │     │ hash1        │     │ hash2        │
└──────────────┘     └──────────────┘     └──────────────┘
```

Supón que alguien cambia un monto en el bloque 1:

1. Cambia la transacción → cambia la raíz de Merkle del bloque 1.
2. Cambia la raíz → cambia el hash del bloque 1.
3. El bloque 2 sigue guardando el hash **viejo** del bloque 1 → el enlace se rompe.

Para que no se note, habría que rehacer el bloque 1, el 2, el 3… hasta el último,
y además rehacer el trabajo de minado de cada uno (2.7). Eso es lo que hace a la
cadena difícil de reescribir.

En el código: `minichain/block.py` (clase `Block`) y `minichain/chain.py`. En la
interfaz: **Bloques**.

---

## 2.6 El árbol de Merkle

### El problema

El encabezado del bloque tiene que "comprometerse" con todas sus transacciones:
si cambia una, el hash del bloque debe cambiar. Se podría simplemente hashear todas
las transacciones juntas, pero el árbol de Merkle hace algo mejor: permite probar
que **una** transacción está en el bloque sin mostrar las demás.

### Cómo se construye

Con cuatro transacciones A, B, C y D:

```
                    raíz = H(1 ‖ hAB ‖ hCD)
                   /                       \
        hAB = H(1 ‖ hA ‖ hB)         hCD = H(1 ‖ hC ‖ hD)
           /          \                 /          \
   hA = H(0 ‖ A)  hB = H(0 ‖ B)   hC = H(0 ‖ C)  hD = H(0 ‖ D)
```

1. Cada transacción se hashea: son las **hojas**.
2. Las hojas se agrupan de a dos y se hashea cada par.
3. Se repite hasta que queda un solo hash: la **raíz**.
4. Si en un nivel queda un número impar, el último se duplica (igual que Bitcoin).

Los prefijos `0` (hoja) y `1` (nodo interno) evitan que alguien haga pasar un nodo
interno por una transacción.

### La prueba de inclusión

Para demostrar que C está en el bloque basta con entregar dos hashes: `hD` y `hAB`.
Quien verifica calcula:

```
hC  = H(0 ‖ C)
hCD = H(1 ‖ hC ‖ hD)       ← usa hD (entregado)
raíz = H(1 ‖ hAB ‖ hCD)    ← usa hAB (entregado)
```

Si el resultado coincide con la raíz del encabezado, C está en el bloque. Con mil
transacciones basta con unos 10 hashes en vez de mil: así funcionan las billeteras
ligeras de Bitcoin, que no descargan la cadena completa.

En el código: `minichain/merkle.py`. En la interfaz: **Bloques → pestaña Árbol de
Merkle** (el camino de la prueba se resalta) y el detalle de cada transacción.

---

## 2.7 La prueba de trabajo (minar)

### La regla

Un bloque solo es válido si su hash empieza con cierta cantidad de **bits en
cero**. Esa cantidad es la **dificultad**. Con dificultad 14, el hash debe ser
menor que 2²⁴² (de los 256 bits del hash, los 14 primeros deben ser 0).

### Cómo se cumple

No hay forma de "calcular" un hash con ceros al principio: el hash es
impredecible. La única estrategia es probar (los hashes de este ejemplo son
ilustrativos):

```
nonce = 0  → hash = 8a3f…   ✗
nonce = 1  → hash = 2c91…   ✗
nonce = 2  → hash = f0e7…   ✗
…
nonce = 22 344 → hash = 0003e1…   ✓  (empieza con 14 bits en cero)
```

Esto es **minar**. Cada intento tiene una probabilidad de 1 en 2¹⁴ de acertar, así
que en promedio hacen falta 2¹⁴ = 16 384 intentos. **Cada bit más de dificultad
duplica el trabajo**: con 20 bits son un millón de intentos.

### Para qué sirve

Hace que reescribir la historia sea caro. Quien quiera cambiar un bloque viejo
tiene que volver a minar ese bloque y todos los que vienen después. En Bitcoin la
dificultad es tan alta que la red entera tarda unos 10 minutos por bloque.

Verificar, en cambio, es instantáneo: basta con calcular un hash y ver si empieza
con ceros. Esta asimetría (caro de producir, barato de comprobar) es la clave.

### La recompensa

Quien mina un bloque se paga 50 monedas en la primera transacción del bloque (la
coinbase). El validador comprueba que no se pague más.

En el código: `mine()` en `minichain/block.py`. En la interfaz: el botón **Minar**
del encabezado (se puede subir la dificultad de un bloque y ver cuántos intentos
tomó).

---

## 2.8 El validador: cómo se detecta una manipulación

El validador recorre la cadena desde el génesis y, para cada bloque, comprueba:

| # | Regla | Qué detecta |
|---|---|---|
| 1 | El índice es el anterior + 1 | Bloques insertados o borrados |
| 2 | `prev_hash` es igual al hash real del bloque anterior | **Enlace roto**: alguien modificó un bloque anterior |
| 3 | La fecha no es anterior a la del bloque previo | Bloques fuera de orden |
| 4 | La dificultad no es menor que la mínima de la red | Alguien re-minó un bloque "fácil" para ahorrarse trabajo |
| 5 | El hash cumple la dificultad | Bloque sin prueba de trabajo válida |
| 6 | La raíz de Merkle recalculada coincide con la guardada | **Transacción modificada** dentro del bloque |
| 7 | El génesis solo tiene asignaciones; los demás, solo una recompensa de exactamente 50 y en primer lugar | Dinero creado de la nada |
| 8 | Cada transacción firmada tiene una **firma ECDSA válida** | Transacción alterada o firmada por otra persona |
| 9 | El `seq` es el que corresponde | Transacciones repetidas (replay) |
| 10 | El emisor tiene saldo suficiente y el monto es positivo | Gastar dinero que no se tiene |

El validador **no se detiene en el primer error**: los reporta todos. Por eso, al
cambiar un monto viejo suelen aparecer varios problemas: el directo (firma y
Merkle del bloque alterado) y los derivados (como esa transacción ya no cuenta, los
`seq` y saldos posteriores dejan de cuadrar).

### Ejemplos de manipulación y qué regla los atrapa

| Manipulación | Reglas que fallan |
|---|---|
| Cambiar el monto de una transacción | 6 (Merkle) y 8 (firma) |
| Cambiar el monto, recalcular Merkle y re-minar el bloque | 8 (firma) y 2 (el bloque siguiente apunta al hash viejo) |
| Poner la firma de otra transacción | 6 y 8 |
| Bajar la dificultad del bloque para re-minarlo rápido | 4 y 2 |
| Alterar el `prev_hash` | 2 |
| Gastar más de lo que se tiene | 10 |

### Lo que el validador NO puede detectar

Una transacción firmada con la clave privada correcta **es válida**, la haya
firmado el dueño o un ladrón que obtuvo la clave. El validador comprueba
matemática, no intenciones. Eso es exactamente lo que explota el ataque del
[documento 4](04-vulnerabilidad.md): el robo pasa todas las reglas.

En el código: `minichain/validator.py`. En la interfaz: **Integridad** (cadena
actual, simulación de manipulaciones y validación de un archivo JSON).

---

## 2.9 Resumen del ciclo de vida de un pago

```
Alice decide pagar 10 a Bob
        │
        ▼
1. Arma la transacción (sender, recipient, amount, seq, memo)
2. La firma con su clave privada (ECDSA)               → minichain/wallet.py
        │
        ▼
3. La envía al nodo: va a la mempool si es válida      → minichain/node.py
        │
        ▼
4. Un minero la incluye en un bloque, junto con su recompensa
5. Calcula la raíz de Merkle y busca un nonce que cumpla la dificultad  → minichain/block.py
        │
        ▼
6. El bloque se valida y se agrega a la cadena         → minichain/chain.py, validator.py
7. Los saldos se actualizan: Alice −10, Bob +10
```

---

Anterior: [1. El proyecto](01-proyecto.md) · Siguiente: [3. Criptografía](03-criptografia.md)
