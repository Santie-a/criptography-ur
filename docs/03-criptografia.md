# 3. Criptografía

> **En una frase:** minichain usa dos herramientas criptográficas, la función
> hash SHA-256 (una huella digital de cualquier dato) y la firma digital ECDSA
> (una prueba de que el dueño de una clave autorizó un mensaje), y esta última se
> construye con aritmética de curvas elípticas.

Este documento va de lo más simple a lo más complejo. Los ejemplos con números
pequeños se pueden seguir con calculadora; todos fueron verificados con el código
del proyecto.

---

## 3.1 Cifrar, firmar y hashear no son lo mismo

| Operación | Para qué sirve | ¿Se puede deshacer? | ¿Se usa en minichain? |
|---|---|---|---|
| **Cifrar** | Ocultar un mensaje: solo quien tiene la clave lo puede leer (confidencialidad). | Sí, con la clave. | **No.** Todo en la cadena es público a propósito. |
| **Firmar** | Probar quién escribió un mensaje y que nadie lo cambió (autenticidad e integridad). El mensaje sigue siendo legible por todos. | No aplica: la firma se verifica, no se "descifra". | **Sí**: ECDSA, en cada transacción. |
| **Hashear** | Obtener una huella corta y única de un dato. | No: es de un solo sentido. | **Sí**: SHA-256, en txids, bloques, Merkle, direcciones y dentro de la firma. |

Una blockchain como Bitcoin no oculta nada: cualquiera puede ver quién pagó a
quién y cuánto. Lo que garantiza es que **nadie puede gastar dinero ajeno ni
cambiar el pasado**. Por eso la vulnerabilidad de este proyecto no "rompe un
cifrado": permite **falsificar firmas**.

---

## 3.2 Funciones hash: SHA-256

Una función hash toma un dato de cualquier tamaño y devuelve un número de tamaño
fijo. SHA-256 devuelve 256 bits (64 dígitos hexadecimales).

```
SHA-256("Alice paga 10 monedas a Bob") = df46e41e3cc072323aaa2507a29fceec3fc3c438306121c7380d778041d208b0
SHA-256("Alice paga 11 monedas a Bob") = 5dbaffee23ba4989f375805a1c85f8b59a2dcecf578a3153c49433446436bd53
```

Un solo carácter distinto cambia el resultado por completo (**efecto avalancha**).

Propiedades que importan:

| Propiedad | Qué significa | Para qué la usa minichain |
|---|---|---|
| **Determinista** | El mismo dato da siempre el mismo hash. | Cualquiera puede recalcular y comparar. |
| **De un solo sentido** | Dado un hash, no se puede encontrar el dato original. | — |
| **Resistente a colisiones** | En la práctica es imposible encontrar dos datos con el mismo hash. | Cambiar una transacción sin cambiar su hash es imposible: así se detectan manipulaciones. |
| **Impredecible** | No se puede saber cómo será el hash sin calcularlo. | La prueba de trabajo solo se puede resolver probando. |

Dónde aparece SHA-256 en el proyecto:

- El **txid** de cada transacción.
- El **hash de cada bloque** y el enlace `prev_hash`.
- Los nodos del **árbol de Merkle**.
- La **dirección** de cada billetera.
- Dentro de la **firma ECDSA**: lo que se firma no es el mensaje sino su hash `z`.

SHA-256 no se programó desde cero: se usa el de la librería estándar de Python
(`hashlib`), como pedía el enunciado.

---

## 3.3 Aritmética modular

### La idea: un reloj

En un reloj de 12 horas, 10 + 5 = 3: después de 12 se vuelve a empezar. Eso es
sumar **módulo 12**. "a mod n" es el residuo de dividir a entre n:

```
17 mod 12 = 5        100 mod 97 = 3        −3 mod 97 = 94
```

En criptografía todo se calcula módulo un número enorme. Así los números nunca
crecen sin control y las operaciones se vuelven difíciles de invertir.

### Dividir: el inverso modular

En aritmética modular no hay "división" directa. En su lugar se multiplica por el
**inverso**: el inverso de a módulo n es el número a⁻¹ tal que

```
a · a⁻¹ ≡ 1 (mod n)
```

Ejemplo: el inverso de 56 módulo 97 es 26, porque 56 · 26 = 1456 = 15 · 97 + **1**.

Existe solo si a y n no tienen factores comunes. Cuando n es primo (como en
secp256k1), todo número distinto de 0 tiene inverso.

### Cómo se calcula: algoritmo de Euclides extendido

Euclides calcula el máximo común divisor dividiendo repetidamente. La versión
extendida, además, lleva la cuenta de "cuántas veces 56" vale cada residuo.
Cuando el residuo llega a 1, ese coeficiente es el inverso.

| Residuo r | Cociente q | Coeficiente t (r ≡ t · 56 mod 97) |
|---|---|---|
| 97 | | 0 |
| 56 | | 1 |
| 41 | 1 | −1 |
| 15 | 1 | 2 |
| 11 | 2 | −5 |
| 4 | 1 | 7 |
| 3 | 2 | −19 |
| **1** | 1 | **26** |

Cada fila sale de las dos anteriores: `r = r₋₂ − q·r₋₁` y `t = t₋₂ − q·t₋₁`.
Resultado: 56⁻¹ ≡ 26 (mod 97).

En el código: `minichain/ntheory.py` (`egcd` y `modinv`).

---

## 3.4 Curvas elípticas

### La ecuación

Una curva elíptica es el conjunto de puntos (x, y) que cumplen

```
y² = x³ + a·x + b
```

La curva de Bitcoin, **secp256k1**, es la más simple posible: a = 0 y b = 7.

```
y² = x³ + 7
```

Con números reales, la curva se ve como una línea suave y simétrica respecto al
eje x. En criptografía no se usan números reales sino **enteros módulo un primo
p**: entonces la "curva" es una nube de puntos sueltos (es lo que se ve en
**Laboratorio → Curva elíptica**). Sigue siendo simétrica: si (x, y) está en la
curva, también (x, p − y).

### Una curva de juguete

Para los ejemplos se usa una curva con la misma forma que secp256k1, pero con un
primo pequeño:

```
y² = x³ + 7   (mod 97)
```

Tiene exactamente **79 puntos** (contando uno especial, O, que se explica abajo).
Tomamos como punto de partida **G = (1, 28)**. Comprobación: 28² = 784 ≡ 8 (mod 97)
y 1³ + 7 = 8. ✓

### Sumar puntos

Lo sorprendente de las curvas elípticas es que se pueden **sumar puntos** y el
resultado es otro punto de la curva. La regla geométrica:

- **P + Q con P ≠ Q (secante)**: se traza la recta que pasa por P y Q; corta a la
  curva en un tercer punto; ese punto reflejado es P + Q.
- **P + P (tangente o duplicación)**: lo mismo, pero con la recta tangente en P.
- **P + (−P)**: la recta es vertical y no corta en ningún otro punto. El resultado
  es un punto especial, **O** (el "punto en el infinito"), que hace de cero:
  P + O = P.
- **−P**: el reflejo de P. Si P = (x, y), entonces −P = (x, −y).

Traducido a fórmulas (todo módulo p):

```
Pendiente:
  secante:     λ = (y₂ − y₁) / (x₂ − x₁)
  tangente:    λ = (3·x₁² + a) / (2·y₁)

Resultado:
  x₃ = λ² − x₁ − x₂
  y₃ = λ·(x₁ − x₃) − y₁
```

"Dividir" significa multiplicar por el inverso modular (3.3).

### Ejemplo: 2G = G + G

Con G = (1, 28) en la curva de juguete (a = 0, p = 97):

```
λ  = 3·1² / (2·28) = 3 / 56 = 3 · 26 = 78           (56⁻¹ = 26, calculado arriba)
x₃ = 78² − 1 − 1 = 6082 ≡ 68
y₃ = 78·(1 − 68) − 28 = −5254 ≡ 81
2G = (68, 81)
```

### Ejemplo: 3G = 2G + G

```
λ  = (28 − 81) / (1 − 68) = 44 / 30 = 44 · 55 = 2420 ≡ 92      (30⁻¹ = 55)
x₃ = 92² − 68 − 1 = 8395 ≡ 53
y₃ = 92·(68 − 53) − 81 = 1299 ≡ 38
3G = (53, 38)
```

### Por qué esto es un grupo

Con esta suma, los puntos de la curva cumplen las mismas reglas que la suma de
números: hay un neutro (O), cada punto tiene opuesto (−P), y se puede asociar y
conmutar. En matemáticas, eso se llama un **grupo abeliano**. Las pruebas del
proyecto (`tests/test_math.py`) recorren todos los puntos de una curva pequeña y
comprueban cada una de estas propiedades.

En el código: `minichain/curve.py` (`point_add`, `point_double`).

---

## 3.5 Multiplicar un punto por un número

"k·G" significa sumar G consigo mismo k veces. Para k de 256 bits, sumar una por
una tardaría más que la edad del universo. El truco se llama **double-and-add**
(duplicar y sumar), y es como la exponenciación rápida:

1. Se escribe k en binario.
2. Se empieza con R = O.
3. Por cada bit, de izquierda a derecha: R = 2R (duplicar), y si el bit es 1,
   R = R + G (sumar).

Ejemplo: **23·G**, con 23 = 10111 en binario.

| Bit | Operación | R | Equivale a |
|---|---|---|---|
| 1 | duplicar, sumar | (1, 28) | 1G |
| 0 | duplicar | (68, 81) | 2G |
| 1 | duplicar, sumar | (20, 76) | 4G → 5G |
| 1 | duplicar, sumar | (65, 5) | 10G → 11G |
| 1 | duplicar, sumar | **(61, 28)** | 22G → **23G** |

Nueve operaciones en lugar de 22 sumas. Para un k de 256 bits son unas 380
operaciones en vez de 10⁷⁷.

En el código: `scalar_mult` en `minichain/curve.py`. En la interfaz:
**Laboratorio → Curva elíptica → Escalar k · P** muestra esta tabla para cualquier k.

---

## 3.6 Por qué es seguro: el logaritmo discreto

Hay una asimetría enorme:

- **Fácil**: dado d, calcular Q = d·G (unos cientos de operaciones).
- **Imposible en la práctica**: dado Q, encontrar d.

Encontrar d se llama el **problema del logaritmo discreto en curvas elípticas**.
En la curva de juguete se resuelve probando los 79 valores. En secp256k1 habría que
probar del orden de 10³⁸ valores incluso con el mejor algoritmo conocido: ninguna
computadora actual lo logra.

Esto es lo que permite que la **clave privada** sea d y la **clave pública** sea
Q = d·G: se puede publicar Q sin revelar d.

### Los parámetros de secp256k1

| Parámetro | Valor | Qué es |
|---|---|---|
| p | 2²⁵⁶ − 2³² − 977 | El primo módulo el que se calcula todo |
| a, b | 0, 7 | La ecuación y² = x³ + 7 |
| G | (79be667e…16f81798, 483ada77…fb10d4b8) | El punto de partida, fijo y público |
| n | fffffff…d0364141 (≈ 1,158 · 10⁷⁷) | Cuántos puntos hay antes de volver a O: n·G = O. Las claves privadas van de 1 a n − 1. |

---

## 3.7 La firma digital ECDSA

### Las claves

```
Clave privada:  d       un número al azar entre 1 y n − 1   (secreto)
Clave pública:  Q = d·G un punto de la curva                 (público)
```

En la curva de juguete: **d = 23**, así que **Q = 23·G = (61, 28)** (calculado en
3.5).

### Firmar un mensaje

Para firmar el mensaje m:

| Paso | Qué se hace | Por qué |
|---|---|---|
| 1 | z = SHA-256(m), interpretado como número | Se firma la huella del mensaje, no el mensaje. |
| 2 | Se elige un **nonce k** al azar entre 1 y n − 1 | Esconde la clave privada dentro de la firma. **Tiene que ser secreto y distinto cada vez.** |
| 3 | R = k·G, y r = (coordenada x de R) mod n | La primera mitad de la firma. |
| 4 | s = k⁻¹ · (z + r·d) mod n | La segunda mitad. Aquí entra la clave privada d. |
| 5 | La firma es el par **(r, s)** | Se publica junto con el mensaje. |

**Ejemplo con la curva de juguete** (n = 79, d = 23). Para no depender de SHA-256,
usamos un "hash" de juguete z₁ = 45.

```
k   = 19                        (nonce elegido al azar)
R   = 19·G = (60, 45)    →  r = 60
k⁻¹ = 25                        (porque 19 · 25 = 475 = 6·79 + 1)
s   = 25 · (45 + 60·23) mod 79
    = 25 · (1425 mod 79)
    = 25 · 3 = 75
Firma: (r, s) = (60, 75)
```

### Verificar una firma

Quien verifica tiene el mensaje, la firma (r, s) y la clave pública Q. **No tiene
d ni k.**

| Paso | Qué se hace |
|---|---|
| 1 | Comprobar que r y s están entre 1 y n − 1 |
| 2 | z = SHA-256(m) |
| 3 | w = s⁻¹ mod n |
| 4 | u₁ = z·w mod n,  u₂ = r·w mod n |
| 5 | X = u₁·G + u₂·Q |
| 6 | La firma es válida si (coordenada x de X) mod n = r |

**Ejemplo** (seguimos con la firma (60, 75) sobre z₁ = 45):

```
w  = 75⁻¹ mod 79 = 59
u₁ = 45 · 59 = 2655 ≡ 48
u₂ = 60 · 59 = 3540 ≡ 64
u₁·G = 48·G = (52, 16)
u₂·Q = 64·Q = (78, 36)
X  = (52, 16) + (78, 36) = (60, 45)
X.x mod 79 = 60 = r   ✓  firma válida
```

### Por qué funciona

Sustituyendo, X es en realidad el mismo punto R que usó quien firmó:

```
X = u₁·G + u₂·Q
  = (z·w)·G + (r·w)·(d·G)        porque Q = d·G
  = w · (z + r·d) · G
  = s⁻¹ · (z + r·d) · G
  = k · G                        porque s = k⁻¹·(z + r·d), entonces s⁻¹·(z + r·d) = k
  = R
```

Solo quien conoce d puede producir un s que haga coincidir todo. Y si alguien
cambia el mensaje, cambia z, cambia X, y la comprobación falla.

En el código: `minichain/signatures.py` (`sign`, `verify`). En la interfaz:
**Laboratorio → ECDSA** muestra cada uno de estos valores para una firma real.

---

## 3.8 El nonce k: el punto débil

El nonce k es un número de un solo uso que debe cumplir tres condiciones:

1. **Secreto**: si alguien conoce k de una firma, despeja d de `s = k⁻¹(z + r·d)`.
2. **Impredecible**: incluso conocer algunos bits de k a lo largo de muchas firmas
   permite, con técnicas más avanzadas, recuperar d.
3. **Único**: si se repite en dos mensajes distintos, cualquiera puede calcular k
   y luego d, **sin conocer nada secreto**. Es la vulnerabilidad del
   [documento 4](04-vulnerabilidad.md).

### Las formas de generar k en el proyecto

| Estrategia | Cómo funciona | ¿Segura? | Dónde se usa |
|---|---|---|---|
| **Aleatorio del sistema** | k sale del generador criptográfico del sistema operativo. | Sí, si el generador funciona bien. | Billetera de Carol |
| **RFC 6979 (determinista)** | k se calcula a partir de la clave privada y del mensaje con HMAC-SHA256. No depende de ningún generador aleatorio. | Sí | Billetera de Alice (y la defensa) |
| **RNG defectuoso** | Un generador con muy pocos estados posibles (por defecto 8), como el de Android en 2013. | **No**: los valores se repiten. | Billetera de Bob (la víctima) |
| **k constante** | Siempre el mismo k, como la PS3 de Sony. | **No** | Opcional, configurable |

En el código: `minichain/nonces.py`.

### RFC 6979, en palabras simples

La idea es reemplazar "tirar un dado" por "calcular": k = HMAC-DRBG(d, z), un
generador pseudoaleatorio alimentado con la clave privada y el hash del mensaje.

- **Mismo mensaje y misma clave → mismo k → misma firma.** No es un problema: como
  z también es el mismo, no hay dos ecuaciones distintas que combinar.
- **Mensaje distinto → k completamente distinto e impredecible**, porque depende de
  d, que es secreto.
- **No hay generador aleatorio que pueda fallar.**

Los pasos del estándar (sección 3.2 del RFC), que están implementados tal cual en
`rfc6979_nonce`:

```
V = 0x01 0x01 … 0x01   (32 bytes)
K = 0x00 0x00 … 0x00   (32 bytes)
K = HMAC_K(V ‖ 0x00 ‖ d ‖ z)
V = HMAC_K(V)
K = HMAC_K(V ‖ 0x01 ‖ d ‖ z)
V = HMAC_K(V)
repetir:
    V = HMAC_K(V)
    si 1 ≤ V < n: k = V, terminar
    si no: K = HMAC_K(V ‖ 0x00), V = HMAC_K(V)
```

---

## 3.9 ¿Cómo sabemos que la implementación es correcta?

Programar criptografía desde cero es fácil de hacer mal. Por eso las pruebas
automáticas (`tests/test_ecdsa.py`, `tests/test_math.py`) comparan contra la
librería `ecdsa`, que es la implementación de referencia en Python:

| Comprobación | Resultado |
|---|---|
| Los parámetros de secp256k1 son iguales a los de la librería | ✓ |
| d·G da el mismo punto que la librería | ✓ |
| La codificación de la clave pública (comprimida y sin comprimir) es igual | ✓ |
| Una firma nuestra la acepta la librería | ✓ |
| Una firma de la librería la acepta nuestra verificación | ✓ |
| Con RFC 6979, nuestro k es idéntico al de la librería | ✓ |
| Con RFC 6979, nuestra firma es idéntica byte a byte | ✓ |
| Firmas alteradas, de otra clave o fuera de rango se rechazan | ✓ |

### Lo que no se hizo (y no hace falta para el proyecto)

La multiplicación de puntos **no es de tiempo constante**: tarda un poco más o
menos según los bits de la clave. Un atacante que pudiera medir tiempos con mucha
precisión podría aprovecharlo. Es correcta matemáticamente y suficiente para una
demostración, pero no se debe usar para proteger dinero real.

---

Anterior: [2. Blockchain](02-blockchain.md) · Siguiente: [4. La vulnerabilidad](04-vulnerabilidad.md)
