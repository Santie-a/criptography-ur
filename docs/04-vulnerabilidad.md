# 4. La vulnerabilidad: reutilizar el nonce

> **En una frase:** si una billetera firma dos mensajes distintos con el mismo
> nonce k, las dos firmas forman un sistema de dos ecuaciones con dos incógnitas
> (k y la clave privada d), y cualquiera que lea la cadena puede resolverlo.

Antes de este documento conviene haber leído la sección de ECDSA de
[3. Criptografía](03-criptografia.md#37-la-firma-digital-ecdsa).

---

## 4.1 La idea, sin fórmulas

Cada firma ECDSA esconde la clave privada d detrás de un número secreto de un solo
uso, el nonce k. Una firma sola no revela nada: hay dos incógnitas (d y k) y una
sola ecuación. Es como saber que **x + y = 10**: hay infinitas respuestas.

Si la billetera vuelve a usar el mismo k para firmar otro mensaje, aparece una
segunda ecuación con **las mismas dos incógnitas**. Es como saber además que
**x − y = 4**: ahora la respuesta es única (x = 7, y = 3).

Eso es todo el ataque. El resto es aplicar la idea a la aritmética modular.

---

## 4.2 Qué ve el atacante

Mallory, la atacante, no tiene acceso a ninguna billetera ni al servidor. Solo lee
la cadena, que es pública. De cada transacción obtiene:

| Dato | De dónde sale | ¿Público? |
|---|---|---|
| Clave pública Q | Campo `sender` de la transacción | Sí |
| Firma (r, s) | Campo `signature` | Sí |
| z = SHA-256(mensaje) | Se calcula hasheando los campos de la transacción | Sí, cualquiera lo calcula |
| Nonce k | Nunca se publica | **No** |
| Clave privada d | Nunca se publica | **No** |

---

## 4.3 Cómo se detecta un nonce repetido

Recordemos que r es la coordenada x del punto R = k·G. **r depende solo de k**: si
dos firmas usan el mismo k, tienen exactamente el mismo r.

Así que detectar el problema es trivial: se agrupan todas las firmas de la cadena
por (clave pública, r). Si dos firmas de la misma clave tienen el mismo r y son de
mensajes distintos, se reutilizó el nonce.

```
Firmas de Bob en la cadena:
  bloque 1, tx 2   r = 88b5b4dc…7b3332   ◄─┐
  bloque 1, tx 4   r = 0b4b3d…c12e0c       │  mismo r:
  bloque 2, tx 2   r = 174dd5d7…6591b1     │  mismo k
  …                                        │
  bloque 5, tx 2   r = 88b5b4dc…7b3332   ◄─┘
```

En el código: `find_nonce_reuse` en `minichain/attack.py`.

---

## 4.4 La derivación, paso a paso

Las dos firmas, sobre mensajes con hashes z₁ y z₂, con la misma clave d y el mismo
nonce k:

```
s₁ = k⁻¹ · (z₁ + r·d)   (mod n)        ← firma 1
s₂ = k⁻¹ · (z₂ + r·d)   (mod n)        ← firma 2  (mismo k, mismo r, misma d)
```

**Paso 1. Multiplicar ambas por k** para quitar el inverso:

```
s₁·k = z₁ + r·d
s₂·k = z₂ + r·d
```

**Paso 2. Restar** la segunda de la primera. El término r·d desaparece:

```
s₁·k − s₂·k = z₁ − z₂
(s₁ − s₂)·k = z₁ − z₂
```

**Paso 3. Despejar k** (dividir = multiplicar por el inverso):

```
k = (z₁ − z₂) · (s₁ − s₂)⁻¹   (mod n)
```

Todo lo de la derecha es público. Ya tenemos k.

**Paso 4. Despejar d** de la primera ecuación:

```
s₁·k = z₁ + r·d
r·d  = s₁·k − z₁
d    = (s₁·k − z₁) · r⁻¹      (mod n)
```

Ya tenemos la clave privada.

**Paso 5. Confirmar** con datos públicos: calcular d·G y comparar con la clave
pública Q. Si coinciden, la clave es correcta sin ninguna duda.

---

## 4.5 El ataque con números

Usamos la curva de juguete de [3.4](03-criptografia.md#34-curvas-elípticas):
y² = x³ + 7 (mod 97), G = (1, 28), n = 79. La clave privada de la víctima es
d = 23 (Mallory no la sabe) y su clave pública es Q = (61, 28) (pública).

### Lo que hizo la víctima

Firmó dos mensajes distintos, con hashes z₁ = 45 y z₂ = 12, usando **el mismo
nonce k = 19** (por error).

```
R   = 19·G = (60, 45)     →  r = 60   (igual en las dos firmas)
k⁻¹ = 25

Firma 1:  s₁ = 25 · (45 + 60·23) mod 79 = 25 · 3  mod 79 = 75
Firma 2:  s₂ = 25 · (12 + 60·23) mod 79 = 25 · 49 mod 79 = 40
```

En la cadena aparecen las firmas **(60, 75)** y **(60, 40)**. Ambas son válidas.

### Lo que calcula Mallory (solo con datos públicos)

```
Ve el mismo r = 60 en dos firmas de la misma clave Q. Alarma.

Paso 3 · el nonce
  z₁ − z₂ = 45 − 12 = 33
  s₁ − s₂ = 75 − 40 = 35
  35⁻¹ mod 79 = 70              (35 · 70 = 2450 = 31·79 + 1)
  k = 33 · 70 = 2310 ≡ 19       ✓ es el nonce de la víctima

Paso 4 · la clave privada
  s₁·k − z₁ = 75·19 − 45 = 1380 ≡ 37
  60⁻¹ mod 79 = 54              (60 · 54 = 3240 = 41·79 + 1)
  d = 37 · 54 = 1998 ≡ 23       ✓ es la clave privada

Paso 5 · confirmación
  23·G = (61, 28) = Q           ✓ coincide con la clave pública
```

Con secp256k1 los números tienen 77 cifras en vez de 2, pero el cálculo es
idéntico y la computadora lo hace en milisegundos.

---

## 4.6 Qué puede hacer con la clave

Con d, Mallory puede firmar **cualquier mensaje** como si fuera la víctima. Por
ejemplo, un mensaje con hash z₃ = 70, con un nonce cualquiera k' = 5:

```
R' = 5·G = (20, 76)  →  r' = 20
s' = 5⁻¹ · (70 + 20·23) mod 79 = 27
Firma falsificada: (20, 27)
```

Cualquiera que la verifique con la clave pública Q = (61, 28) obtiene **"firma
válida"**. Es indistinguible de una firma legítima, porque **es** una firma
legítima: se hizo con la clave verdadera.

En la simulación, Mallory firma una transacción "Bob paga todo su saldo a Mallory",
la red la incluye en un bloque y el validador revisa la cadena completa: **todo
válido**.

---

## 4.7 Por qué el validador no lo puede impedir

El validador comprueba que cada firma corresponda a la clave pública del emisor.
La firma falsificada cumple eso perfectamente. No existe ninguna regla que pueda
distinguir "firmada por Bob" de "firmada por alguien que tiene la clave de Bob":
matemáticamente son lo mismo.

La seguridad de una billetera depende por completo de que su clave privada sea
secreta. El error no está en la cadena ni en el validador, sino en **cómo la
billetera eligió k**. Por eso la defensa también está en la billetera.

---

## 4.8 Cómo ocurre en la simulación

La billetera de Bob usa un generador de números aleatorios defectuoso que solo
tiene **8 estados posibles** (3 bits de entropía). Cada vez que firma, el
generador da uno de 8 nonces.

Bob firma unas **10 transacciones**. Con 10 firmas y solo 8 nonces posibles, por
el **principio del palomar** (si se meten 10 palomas en 8 casillas, al menos una
casilla tiene dos palomas) es seguro que al menos dos firmas comparten nonce.

En la práctica, con la configuración por defecto (semilla 2026):

| Métrica | Valor |
|---|---|
| Firmas en la cadena | 20 (de Alice, Bob y Carol) |
| Valores de r distintos | 16 |
| Pares con r repetido (todos de Bob) | 5 |
| Claves recuperadas | 1 (la de Bob) |

Alice (RFC 6979) y Carol (generador aleatorio correcto) no repiten nunca.

La entropía y la estrategia de Bob se configuran en **Escenario**. Con más bits
de entropía la colisión se vuelve menos probable; con "k constante" basta con dos
firmas cualesquiera.

### Un detalle: la misma k con claves distintas

El análisis agrupa por **clave y r**. Si dos personas distintas usaran el mismo k, las dos ecuaciones tendrían tres
incógnitas (k, d₁ y d₂) y este despeje directo no alcanza. Pero en cuanto se
conozca una de las claves, cae la otra.

### Otro detalle: firmas "low-s"

Bitcoin exige que s sea el menor de s y n − s (ambos son válidos para la misma
firma). Si una billetera normaliza así, una de las dos firmas puede aparecer con el
signo cambiado. El código del ataque prueba las dos posibilidades (s₂ y −s₂) y se
queda con la que pasa la confirmación d·G = Q. Por eso funciona en ambos casos.

---

## 4.9 Casos reales

| Año | Caso | Qué pasó |
|---|---|---|
| 2010 | **Sony PlayStation 3** | Sony firmaba el software de la consola con ECDSA usando **siempre el mismo k**. El grupo fail0verflow lo mostró en el congreso 27C3: con dos firmas oficiales calcularon la clave privada de Sony, lo que permitía firmar cualquier programa como si fuera oficial. En el proyecto: estrategia "k constante". |
| 2013 | **Billeteras de Bitcoin en Android** | Un fallo en la inicialización del generador `SecureRandom` de Java en Android hizo que produjera valores repetidos. Varias billeteras firmaron transacciones con el mismo k y les vaciaron las cuentas. En el proyecto: estrategia "RNG defectuoso". |

---

## 4.10 La defensa

### Nonces deterministas: RFC 6979

En lugar de pedirle k a un generador aleatorio, se calcula a partir de la clave
privada y del mensaje: **k = HMAC-DRBG(d, z)** (detalle en
[3.8](03-criptografia.md#38-el-nonce-k-el-punto-débil)).

| Situación | Resultado | ¿Sirve para el ataque? |
|---|---|---|
| Dos mensajes **distintos** | k distintos e impredecibles (dependen de d, que es secreta) | No: no hay r repetido |
| El **mismo** mensaje dos veces | El mismo k y la **misma firma** exacta | No: z₁ = z₂ y s₁ = s₂, así que la resta da 0 = 0 |
| Generador aleatorio roto | No importa: no se usa | — |

Es lo que usan hoy la mayoría de las implementaciones serias de ECDSA, incluida la
librería que usa Bitcoin Core. Esquemas más modernos, como Ed25519, ya calculan el
nonce de forma determinista por diseño.

En la simulación, con la misma semilla pero Bob usando RFC 6979, los 20 valores de
r son distintos y el ataque no encuentra nada.

### Lo que NO sirve como defensa

- **Cambiar la billetera después.** Si dos firmas con k repetido ya están en la
  cadena, la clave está expuesta para siempre: la cadena no se puede borrar. La
  única salida es mover los fondos a una clave nueva antes que el atacante.
- **Ocultar las firmas.** No se puede: la red necesita verlas para verificar.
- **Hacer más estricto el validador.** Como se explicó en 4.7, una firma
  falsificada con la clave correcta es indistinguible de una legítima.

---

## 4.11 Dónde verlo

| Qué | Dónde |
|---|---|
| Detección de r repetidos | `find_nonce_reuse` en `minichain/attack.py` |
| Fórmulas de k y d | `recover_from_pair` en `minichain/attack.py` |
| Ataque completo sobre la cadena | `recover_private_keys` en `minichain/attack.py` |
| Generadores defectuosos | `WeakRNGNonce` y `ConstantNonce` en `minichain/nonces.py` |
| Defensa | `rfc6979_nonce` en `minichain/nonces.py` |
| Pruebas | `tests/test_attack.py` |
| En la interfaz | La alerta en **Resumen**, la página **Seguridad → Análisis de firmas** (con la recuperación y el botón para explotar) y **Laboratorio → ECDSA** (con k fijo se reproduce a mano) |
| En la terminal | Pasos 4 a 7 de `python -m minichain` |

---

Anterior: [3. Criptografía](03-criptografia.md) · Siguiente: [5. El código](05-codigo.md)
