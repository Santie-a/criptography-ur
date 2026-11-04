# minichain: ECDSA desde cero y el ataque por nonce repetido

Proyecto de criptografía (Universidad del Rosario). Una cadena de bloques pequeña,
en Python puro, donde las transacciones se firman con **ECDSA sobre secp256k1**
(la curva de Bitcoin). Toda la aritmética de la curva está programada a mano.
Sobre esa cadena se demuestra un ataque real: si una billetera firma dos
transacciones con el mismo nonce `k`, cualquiera puede recuperar su clave
privada leyendo solo la cadena pública, y después firmar a su nombre sin que el
validador note nada.

Es un MVP con **datos simulados**: billeteras ficticias, tráfico aleatorio
reproducible con una semilla y un solo nodo (sin P2P ni consenso). Se puede usar
de tres formas: una demo narrada en la terminal, una interfaz web para
presentarlo, o una API para conectar otros clientes.

## Ejecutar

Requisitos: Python 3.10+ (en macOS y Linux el comando suele ser `python3`) y, para la interfaz, Node.js 20+.

**Solo la demo en terminal** (no instala nada):

```bash
python -m minichain              # unos 8 s
python -m minichain --pausa      # se detiene entre pasos
```

**La interfaz web** (un solo proceso sirve API y UI):

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
python -m server                 # abre http://localhost:8000
```

**Desarrollo** (recarga automática de API y UI): `make dev` o `./scripts/dev.sh`,
y abre http://localhost:5173.

**Docker**: `docker compose up --build` y abre http://localhost:8000.

**Pruebas**:

```bash
pip install -r requirements-dev.txt
python -m pytest                 # 48 pruebas: núcleo, comparación con `ecdsa` y API
cd frontend && npm run typecheck
```

Con `make` instalado, `make install`, `make run`, `make test` y `make demo` hacen lo mismo.

## La interfaz

Un explorador de bloques con herramientas de seguridad, organizado como una
aplicación (encabezado, navegación lateral, inspector de detalle y barra de
estado), no como una secuencia de pasos:

| Sección | Qué hay |
|---|---|
| **Red · Resumen** | Métricas de la red, últimos bloques y transacciones, integridad y alertas de seguridad. |
| **Red · Bloques** | Tabla de bloques e inspector con encabezado, transacciones, árbol de Merkle y prueba de inclusión. |
| **Red · Transacciones** | Confirmadas y pendientes; cada una con su firma (r, s), el mensaje firmado y su prueba Merkle. |
| **Red · Billeteras** | Saldos, claves públicas, historial y la estrategia de nonce de cada billetera (editable). |
| **Seguridad · Integridad** | Validación de la cadena real, simulación de manipulaciones sobre una copia y validación de un JSON importado. |
| **Seguridad · Análisis de firmas** | Detecta r repetidos, despeja k y d con los números reales y permite explotar la clave; compara RNG defectuoso contra RFC 6979. |
| **Laboratorio · Curva elíptica** | Curva pequeña sobre F_p: suma de puntos (con λ) y k·P con la traza de double-and-add. |
| **Laboratorio · ECDSA** | Firma con todos los valores intermedios; con k fijo detecta el r repetido y recupera la clave. |
| **Escenario** | Semilla, dificultad, tamaño de la red y la estrategia de nonce de Bob. |

El análisis de firmas corre solo cada vez que cambia la cadena: si una clave
queda expuesta aparece una alerta en el Resumen, en la navegación y en la barra
de estado. Transferir y minar están en el encabezado y sirven desde cualquier
pantalla; la búsqueda global (`Ctrl K`) encuentra bloques, transacciones y
billeteras.

**Recorrido sugerido para exponer**: Resumen (la alerta) → Laboratorio · Curva →
Laboratorio · ECDSA → Bloques → Integridad → Análisis de firmas (explotar y
comparar estrategias) → Escenario (regenerar con RFC 6979).

Varios navegadores pueden conectarse a la vez: comparten la red, cada uno elige
con qué billetera firma y los cambios llegan en tiempo real por WebSocket.

## Estructura

```
minichain/      núcleo: curva, ECDSA, nonces, Merkle, bloques, validador, ataque (sin dependencias)
server/         API HTTP + WebSocket (FastAPI) que expone el núcleo
frontend/       interfaz (React + TypeScript + Vite)
tests/          pruebas del núcleo y de la API
docs/           cómo conectar la UI, despliegue y sistema de diseño
```

| Archivo | Parte | Contenido |
|---|---|---|
| `minichain/ntheory.py` | 1 | Euclides extendido e inverso modular |
| `minichain/curve.py` | 1 | Curva sobre F_p, suma, duplicación, double-and-add (con traza), codificación SEC1, secp256k1 |
| `minichain/signatures.py` | 2 | Claves, firma y verificación ECDSA (SHA-256 de `hashlib`) |
| `minichain/nonces.py` | 2, 5, 6 | Nonce aleatorio, RFC 6979, k constante (PS3) y RNG débil (Android) |
| `minichain/merkle.py` | 3 | Raíz, niveles y pruebas de inclusión de Merkle |
| `minichain/block.py` | 3 | Transacciones, bloques y prueba de trabajo |
| `minichain/chain.py` | 3 | Cadena, minado, exportación e importación en JSON |
| `minichain/node.py` | 3 | Nodo con mempool, seguro entre hilos |
| `minichain/validator.py` | 4 | Recorre la cadena y reporta cada manipulación |
| `minichain/attack.py` | 5 | Detección de r repetidos y recuperación de k y d |
| `minichain/simulation.py` | | Escenario con datos simulados |
| `minichain/demo.py` | | Demo narrada en la terminal |

## Documentación

La carpeta [docs/](docs/README.md) explica el proyecto desde cero, sin suponer
conocimientos previos. Orden de lectura sugerido:

1. [El proyecto en general](docs/01-proyecto.md): qué demuestra, sus partes y los personajes de la simulación.
2. [Blockchain](docs/02-blockchain.md): transacciones, bloques, hash, Merkle, minado y validación.
3. [Criptografía](docs/03-criptografia.md): hashes, aritmética modular, curvas elípticas y ECDSA, con un ejemplo con números pequeños.
4. [La vulnerabilidad](docs/04-vulnerabilidad.md): por qué repetir el nonce entrega la clave privada, paso a paso, y la defensa.
5. [El código](docs/05-codigo.md): qué hace cada archivo.
6. [La interfaz](docs/06-interfaz.md): el propósito de cada sección y cada página.
7. [Guion para exponer](docs/07-guion-exposicion.md): recorrido de la demostración en vivo y preguntas frecuentes.

Además: el [glosario](docs/glosario.md), [cómo conectar la UI con la
simulación](docs/CONECTAR_UI.md), el [despliegue](docs/DESPLIEGUE.md) y el
[sistema de diseño](docs/DISENO.md). Con el servidor encendido, la referencia
interactiva de la API está en http://localhost:8000/api/docs.

## La matemática

### Curva y grupo

secp256k1 es `y² = x³ + 7` sobre F_p con `p = 2²⁵⁶ − 2³² − 977`. Sus puntos,
junto con el punto en el infinito O, forman un grupo abeliano. El generador G
tiene orden primo `n ≈ 2²⁵⁶` y el cofactor es 1.

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
hasheando la transacción. El atacante confirma el resultado comprobando d·G = Q.
`attack.py` también contempla firmas normalizadas a "low-s" (s → n − s, regla de
Bitcoin), probando ambos signos de s₂.

### La defensa: RFC 6979

k = HMAC-DRBG(d, H(m)). El nonce depende de la clave y del mensaje, no de un
generador aleatorio. Mensajes distintos producen nonces independientes, y el
mismo mensaje produce la misma firma, lo cual no sirve para el ataque porque z₁ = z₂.
Cambiar a RFC 6979 no protege firmas ya publicadas: si una clave ya repitió un
nonce en la cadena, está comprometida.

## Contexto histórico

- **Sony PS3 (2010)**: el grupo fail0verflow mostró en el 27C3 que Sony firmaba
  el software de la consola con ECDSA usando siempre el mismo k. Con dos firmas
  recuperaron la clave privada. En el proyecto: `ConstantNonce`.
- **Android (2013)**: un fallo en la inicialización de `SecureRandom` de Java en
  Android hizo que el generador repitiera salidas. Varias billeteras de Bitcoin
  firmaron con k repetidos y les robaron fondos. En el proyecto: `WeakRNGNonce`.

## Simplificaciones

- Un solo nodo: no hay P2P, consenso distribuido ni bifurcaciones.
- Modelo de cuentas con contador `seq` (anti-replay) en lugar de UTXO.
- Dirección = primeros 20 bytes de SHA-256(clave pública comprimida), sin RIPEMD-160 ni Base58Check.
- Las firmas no se normalizan a low-s.
- En el servidor, las billeteras de la demo son custodiadas por el servidor y no
  hay autenticación (ver [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)).
- La multiplicación escalar no es de tiempo constante: es correcta, pero no
  resiste ataques de canal lateral. No usar para proteger dinero real.
