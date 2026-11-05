# 5. El código

> **En una frase:** el núcleo (`minichain/`) hace toda la criptografía y la
> blockchain sin depender de nada; el servidor (`server/`) lo expone como una API;
> la interfaz (`frontend/`) solo muestra datos y llama a esa API.

Este documento recorre cada archivo: para qué existe, qué contiene y de qué otros
depende. Para el flujo de una petición completa entre la interfaz y el núcleo, ver
[Conectar la UI](CONECTAR_UI.md).

---

## 5.1 Mapa del repositorio

```
criptography-ur/
├── minichain/          Núcleo: matemáticas, firmas, blockchain, ataque
├── server/             API HTTP + WebSocket que expone el núcleo
├── frontend/           Aplicación web (React + TypeScript)
├── tests/              Pruebas automáticas
├── docs/               Esta documentación
├── scripts/dev.sh      Arranca servidor + interfaz en modo desarrollo
├── Makefile            Atajos: make install, make run, make test, make demo
├── Dockerfile          Imagen lista para desplegar
├── docker-compose.yml  Arranque con Docker en un comando
├── requirements*.txt   Dependencias de Python (solo servidor y pruebas)
└── pyproject.toml      Metadatos del proyecto y configuración de pytest
```

---

## 5.2 El núcleo: `minichain/`

Los archivos están ordenados de lo más básico a lo más alto: cada uno solo usa
los que están arriba de él en esta lista.

```
ntheory ──► curve ──► signatures ──► wallet ──► block ──► validator ──► chain ──► node
                         ▲                         ▲                                │
                      nonces                     merkle                    attack ◄─┘
                                                                     simulation, demo
```

### `ntheory.py`: teoría de números

**Propósito:** las dos operaciones de aritmética modular que necesita todo lo demás.

| Función | Qué hace |
|---|---|
| `egcd(a, b)` | Euclides extendido: devuelve (g, x, y) con a·x + b·y = g = mcd(a, b). |
| `modinv(a, m)` | Inverso de a módulo m. Lanza error si a = 0 o si no es invertible. |

Explicación con ejemplo: [3.3](03-criptografia.md#33-aritmética-modular).

### `curve.py`: curvas elípticas

**Propósito:** representar una curva y sus puntos, y sumarlos y multiplicarlos.

| Elemento | Qué hace |
|---|---|
| `Curve` | Los parámetros de una curva: p, a, b, el generador G, su orden n y el cofactor. |
| `Point` | Un punto (x, y), o el punto en el infinito O. Al crearlo comprueba que esté en la curva. Permite escribir `P + Q`, `-P` y `k * P`. |
| `point_add`, `point_double` | Las fórmulas de secante y tangente. |
| `scalar_mult` | k·P con double-and-add. |
| `scalar_mult_trace` | Lo mismo, pero devuelve cada paso (lo usa el laboratorio de la interfaz). |
| `enumerate_points` | Todos los puntos de una curva pequeña (para dibujarla). |
| `point_order` | Cuántas veces hay que sumar P hasta llegar a O. |
| `encode_point`, `decode_point` | Convertir un punto a bytes y de vuelta (formato SEC1, comprimido o no). Para descomprimir calcula una raíz cuadrada modular. |
| `secp256k1` | La curva de Bitcoin, con sus parámetros oficiales. |

Explicación: [3.4](03-criptografia.md#34-curvas-elípticas) y [3.5](03-criptografia.md#35-multiplicar-un-punto-por-un-número).

### `nonces.py`: cómo se elige el nonce k

**Propósito:** todas las formas de generar k, la buena, la defensa y las rotas.

| Elemento | Qué hace |
|---|---|
| `random_nonce` | k aleatorio del generador criptográfico del sistema operativo. |
| `rfc6979_nonce` | k determinista según RFC 6979 (la defensa). |
| `WeakRNGNonce` | Generador con pocos estados (por defecto 8). Simula Android 2013. |
| `ConstantNonce` | Siempre el mismo k. Simula la PS3. |
| `NONCE_KINDS`, `nonce_kind` | Nombres legibles de cada estrategia, para la interfaz. |

Explicación: [3.8](03-criptografia.md#38-el-nonce-k-el-punto-débil).

### `signatures.py`: ECDSA

**Propósito:** generar claves, firmar y verificar.

| Elemento | Qué hace |
|---|---|
| `Signature` | El par (r, s), con conversión a y desde hexadecimal. |
| `hash_message`, `digest_to_int` | z = SHA-256(m) como número (truncado al tamaño de n si hiciera falta). |
| `generate_private_key`, `public_key` | d al azar y Q = d·G. |
| `sign`, `sign_digest` | La firma; recibe la estrategia de nonce como parámetro. |
| `verify`, `verify_digest` | La verificación; rechaza r o s fuera de rango y Q inválida. |

Explicación: [3.7](03-criptografia.md#37-la-firma-digital-ecdsa).

### `wallet.py`: billeteras

**Propósito:** juntar en un objeto la clave privada, la pública, la dirección y la
estrategia de nonce con la que firma esa billetera.

| Elemento | Qué hace |
|---|---|
| `address_from_pubkey` | Dirección = `mc` + primeros 20 bytes de SHA-256(clave pública comprimida). |
| `Wallet` | Una billetera. `Wallet.generate(nombre)` crea una nueva; `wallet.sign(mensaje)` firma con su estrategia de nonce. |

### `merkle.py`: árbol de Merkle

**Propósito:** resumir las transacciones de un bloque en un solo hash y probar que
una transacción está incluida.

| Función | Qué hace |
|---|---|
| `merkle_root` | La raíz a partir de los txids. |
| `merkle_levels` | Todos los niveles del árbol (para dibujarlo). |
| `merkle_proof` | Los hashes hermanos que prueban que una transacción está en el bloque. |
| `verify_merkle_proof` | Comprueba una prueba contra una raíz. |

Explicación: [2.6](02-blockchain.md#26-el-árbol-de-merkle).

### `block.py`: transacciones, bloques y minado

**Propósito:** las estructuras de datos de la cadena.

| Elemento | Qué hace |
|---|---|
| `Transaction` | Una transacción. `payload()` es el texto exacto que se firma; `txid()` su identificador; `create()` arma y firma una; `coinbase()` crea una sin firma (asignación o recompensa). |
| `Block` | Un bloque. `hash()` calcula su hash a partir del encabezado; `compute_merkle_root()` recalcula la raíz. |
| `meets_difficulty` | ¿El hash empieza con los bits en cero exigidos? |
| `mine` | Prueba nonces hasta cumplir la dificultad y devuelve cuántos intentos hicieron falta. |
| `BLOCK_REWARD` | La recompensa del minero: 50. |

Explicación: [2.3](02-blockchain.md#23-las-transacciones), [2.5](02-blockchain.md#25-los-bloques) y [2.7](02-blockchain.md#27-la-prueba-de-trabajo-minar).

### `validator.py`: el validador

**Propósito:** revisar una cadena completa y decir exactamente qué está mal.

| Elemento | Qué hace |
|---|---|
| `Ledger` | Los saldos y contadores `seq` que resultan de aplicar las transacciones en orden. |
| `check_transaction` | Valida una transacción firmada (firma, seq, saldo, monto) contra un `Ledger` y la aplica si es válida. |
| `validate_block` | Las reglas de un bloque: índice, enlace, fecha, dificultad, prueba de trabajo, Merkle, recompensa y cada transacción. |
| `validate_chain` | Recorre todos los bloques y junta los problemas. No se detiene en el primero. |
| `Issue`, `ValidationReport` | Un problema (bloque, transacción, tipo, detalle) y el reporte completo. |

Explicación: [2.8](02-blockchain.md#28-el-validador-cómo-se-detecta-una-manipulación).

### `chain.py`: la cadena

**Propósito:** guardar los bloques y garantizar que solo entren bloques válidos.

| Elemento | Qué hace |
|---|---|
| `Blockchain.create` | Crea la cadena con su bloque génesis y las asignaciones iniciales. |
| `add_block` | Valida un bloque contra el estado actual y lo agrega; si no es válido lanza `InvalidBlock`. |
| `mine_block` | Arma un bloque con la recompensa y las transacciones dadas, lo mina y lo agrega. |
| `to_json`, `from_json` | Exportar e importar la cadena (al importar se revalida todo). |

### `node.py`: el nodo con mempool

**Propósito:** lo que usa el servidor cuando hay varias personas enviando
transacciones a la vez.

| Elemento | Qué hace |
|---|---|
| `Node.submit` | Valida una transacción contra el estado **pendiente** (cadena + mempool) y la encola. |
| `Node.mine` | Mina un bloque con lo pendiente (máximo 50 transacciones) y limpia la mempool. |
| `next_seq`, `available_balance` | Contador y saldo contando lo pendiente. |
| `lock` | Un candado: dos peticiones simultáneas no pueden dañar el estado. |

### `attack.py`: el ataque

**Propósito:** recuperar claves privadas usando **solo** datos públicos de la cadena.

| Función | Qué hace |
|---|---|
| `harvest_signatures` | Recorre la cadena y extrae de cada transacción (Q, r, s, z). |
| `find_nonce_reuse` | Agrupa por (clave, r) y devuelve los pares con mensajes distintos. |
| `recover_from_pair` | Aplica las fórmulas k = (z₁ − z₂)(s₁ − s₂)⁻¹ y d = (s₁k − z₁)r⁻¹; contempla firmas low-s y confirma con d·G = Q. |
| `recover_private_keys` | Todo lo anterior junto: devuelve las claves recuperadas por dirección. |

Explicación: [4. La vulnerabilidad](04-vulnerabilidad.md).

### `simulation.py`: los datos simulados

**Propósito:** generar una red reproducible a partir de una semilla.

`build_scenario` crea las cinco billeteras (Alice, Bob, Carol, Minera, Mallory),
el génesis con 1000 monedas para cada usuario, y varios bloques de transacciones
aleatorias. Bob recibe la estrategia de nonce configurada (por defecto el RNG
defectuoso). Ver [1. Los personajes](01-proyecto.md#los-personajes-de-la-simulación).

### `demo.py` y `__main__.py`: la demo de terminal

**Propósito:** contar la historia completa en la terminal, en siete secciones:

1. La curva (comprobaciones de grupo).
2. La cadena simulada, con los intentos de minado de cada bloque.
3. Validación de la cadena honesta.
4. El ataque: firmas recolectadas, el par con r repetido, k y d calculados.
5. El robo: transacción falsificada, minada y aceptada por el validador.
6. Manipulaciones y lo que detecta el validador.
7. La defensa con RFC 6979.

Se ejecuta con `python -m minichain`. Opciones: `--pausa` (espera Enter entre
secciones), `--semilla`, `--dificultad`, `--bits-entropia`.

---

## 5.3 El servidor: `server/`

**Propósito general:** convertir el núcleo en un servicio al que se conectan la
interfaz y otros clientes. No contiene criptografía propia: todo lo calcula
`minichain`.

| Archivo | Propósito |
|---|---|
| `__main__.py` | `python -m server`: arranca el servidor (opciones `--host`, `--port`, `--reload`). |
| `config.py` | Lee la configuración de variables de entorno (puerto, semilla, dificultad, CORS…). |
| `app.py` | Define todas las rutas de la API (`/api/...`) y el WebSocket de eventos. Valida los datos de entrada y sirve la interfaz compilada en `/`. |
| `network.py` | El estado compartido: un `Node`, las billeteras y el escenario. Traduce los objetos del núcleo a JSON (los números de 256 bits van como texto hexadecimal). Contiene la búsqueda, las manipulaciones de prueba, el ataque y la comparación de estrategias. Guarda la validación y el análisis de firmas en caché: cada bloque nuevo se valida una sola vez y todos los clientes reciben el mismo resultado. |
| `labs.py` | Los laboratorios: curva pequeña (puntos, suma, k·P con traza) y ECDSA paso a paso (firmar, verificar, recuperar). No guardan estado. |
| `events.py` | El canal de eventos en tiempo real: avisa a todos los navegadores cuando algo cambia. |
| `security.py` | Los roles: comprueba el token de administrador (`MINICHAIN_ADMIN_TOKEN`) en las rutas que controlan la simulación, y limita las escrituras públicas por IP. Ver [Roles](CONECTAR_UI.md#roles). |
| `storage.py` | Dónde se guarda la red: en memoria, en un archivo JSON o en PostgreSQL (Supabase). El servidor guarda tras cada cambio y restaura al arrancar. Ver [Despliegue](DESPLIEGUE.md#persistencia-dónde-se-guarda-la-red). |

La lista de rutas está en [Conectar la UI](CONECTAR_UI.md#endpoints) y, con el
servidor encendido, en `http://localhost:8000/api/docs`.

---

## 5.4 La interfaz: `frontend/`

**Propósito general:** mostrar la red y permitir actuar sobre ella. Nunca calcula
criptografía.

| Archivo | Propósito |
|---|---|
| `src/main.tsx` | Punto de entrada: carga fuentes, estilos y la aplicación. |
| `src/App.tsx` | El armazón: encabezado, navegación, contenido y barra de estado; decide qué página mostrar según la URL. |
| `src/router.ts` | Las rutas (`#/bloques?b=3`). La selección queda en la URL: se puede enlazar y recargar. |
| `src/api.ts` | **El único lugar que habla con el servidor.** Una función por cada ruta de la API. |
| `src/types.ts` | La forma de los datos que devuelve el servidor. |
| `src/store.tsx` | El estado global: datos de la red, conexión en tiempo real, billetera con la que firma este navegador, alertas de seguridad y diálogos abiertos. |
| `src/components/shell.tsx` | Encabezado, búsqueda global, navegación lateral y barra de estado. |
| `src/components/dialogs.tsx` | Los diálogos de transferir, minar, crear billetera e ingresar como administrador. |
| `src/components/admin.tsx` | El aviso "Requiere administrador" que reemplaza las acciones restringidas. |
| `src/components/ui.tsx` | Componentes base: paneles, tablas, pestañas, botones, etiquetas, avisos… |
| `src/components/chain.tsx` | Visualizaciones: la tira de bloques enlazados y el árbol de Merkle. |
| `src/pages/*.tsx` | Una página por sección. Se describen en [6. La interfaz](06-interfaz.md). |
| `src/styles/tokens.css` | Colores, tipografía y medidas (ver [Sistema de diseño](DISENO.md)). |
| `src/styles/app.css` | Estilos de todos los componentes. |

---

## 5.5 Las pruebas: `tests/`

Se ejecutan con `python -m pytest`. Son 71 (una de ellas, la de PostgreSQL, solo corre si se define `MINICHAIN_TEST_DATABASE_URL`).

| Archivo | Qué comprueba |
|---|---|
| `test_math.py` | Euclides extendido e inverso; que los puntos de una curva pequeña forman un grupo (neutro, inversos, conmutatividad, asociatividad); que la multiplicación coincide con sumas repetidas; los parámetros y resultados de secp256k1 contra la librería `ecdsa`; codificación de puntos. |
| `test_ecdsa.py` | Claves, firmas y verificación contra la librería `ecdsa`, en ambos sentidos; que RFC 6979 da el mismo k y la misma firma; que se rechazan firmas alteradas. |
| `test_chain.py` | Merkle (raíz calculada a mano y pruebas de inclusión para cada hoja); minado; que una cadena honesta es válida; que se detecta cada tipo de manipulación; que se rechaza gastar de más, repetir transacciones y suplantar firmas; mempool; exportar e importar. |
| `test_attack.py` | Las fórmulas recuperan k y d; funcionan con firmas low-s; el ataque sobre la cadena simulada recupera exactamente la clave de Bob y el robo pasa la validación; con RFC 6979 no se recupera nada. |
| `test_server.py` | El flujo completo por la API: estado, bloques, transferir, minar, cliente con clave propia, manipulación sin afectar la red, ataque, defensa, laboratorios, búsqueda y eventos en tiempo real. |
| `test_auth.py` | Que cada ruta de administrador rechaza peticiones sin token o con un token incorrecto y las acepta con el correcto; que el público puede leer todo y enviar transacciones firmadas con su propia clave, pero no gastar dinero ajeno; el límite de peticiones; y el modo abierto. |
| `test_storage.py` | Que la red se guarda y se restaura igual (bloques, mempool, billeteras, versión y el generador de Bob), que un estado guardado alterado se rechaza, que una caída de la base de datos no rompe la red ni sobrescribe lo guardado, y que la validación incremental y el análisis cacheado dan lo mismo que el cálculo completo. Incluye una prueba contra PostgreSQL real. |

---

Anterior: [4. La vulnerabilidad](04-vulnerabilidad.md) · Siguiente: [6. La interfaz](06-interfaz.md)
