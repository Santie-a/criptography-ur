# 1. El proyecto en general

> **En una frase:** minichain es una blockchain pequeña, escrita desde cero en
> Python, que sirve para demostrar en vivo cómo un error al firmar transacciones
> permite a cualquiera robar la clave privada de una billetera.

## ¿Qué problema muestra?

Las criptomonedas como Bitcoin protegen el dinero con **firmas digitales**. Cada
vez que alguien envía dinero, firma la transacción con su clave privada, y la red
comprueba la firma con su clave pública. Mientras la clave privada sea secreta,
nadie más puede gastar ese dinero.

El algoritmo de firma que usa Bitcoin se llama **ECDSA**. Tiene un requisito que
parece un detalle técnico: cada firma necesita un número aleatorio nuevo, llamado
**nonce**, que nunca se debe repetir. Si una billetera firma dos transacciones
distintas con el mismo nonce, cualquiera que lea la cadena (que es pública) puede
calcular su clave privada con una operación de álgebra de secundaria.

Esto no es teórico:

- **2010, PlayStation 3**: Sony firmaba el software de la consola usando siempre
  el mismo nonce. Un grupo de investigadores recuperó la clave privada de Sony y
  pudo firmar programas como si fueran oficiales.
- **2013, Android**: un fallo en el generador de números aleatorios de Android
  hizo que algunas billeteras de Bitcoin repitieran nonces. Les robaron los fondos.

minichain reproduce exactamente ese escenario con datos simulados.

## ¿Qué hace el proyecto, en orden?

1. **Programa las matemáticas desde cero**: la curva elíptica de Bitcoin
   (secp256k1), la suma de puntos, la multiplicación y el inverso modular. No usa
   ninguna librería de criptografía para esto.
2. **Programa la firma digital ECDSA**: generar claves, firmar y verificar. Para
   comprobar que está bien hecha, se compara contra una librería reconocida
   (`ecdsa`) en las pruebas automáticas.
3. **Construye una blockchain**: transacciones firmadas, bloques enlazados por
   hash, árbol de Merkle y prueba de trabajo (minado).
4. **Construye un validador**: un programa que recorre toda la cadena y detecta
   cualquier manipulación.
5. **Ejecuta el ataque**: busca en la cadena dos firmas con el nonce repetido,
   calcula la clave privada de la víctima y firma una transacción a su nombre. El
   validador la acepta, porque la firma es matemáticamente perfecta.
6. **Muestra la defensa**: con nonces deterministas (estándar RFC 6979), el nonce
   no puede repetirse y el ataque deja de funcionar.

## Las tres piezas del software

```
┌─────────────────────┐     HTTP / WebSocket     ┌──────────────────┐        ┌───────────────────────┐
│  Interfaz web       │  ─────────────────────►  │  Servidor        │  ───►  │  Núcleo (minichain/)  │
│  (frontend/)        │  ◄─────────────────────  │  (server/)       │        │  toda la criptografía │
│  lo que se ve       │       datos en JSON      │  traduce a JSON  │        │  y la blockchain      │
└─────────────────────┘                          └──────────────────┘        └───────────────────────┘
```

| Pieza | Carpeta | Para qué sirve | Lenguaje |
|---|---|---|---|
| **Núcleo** | `minichain/` | Toda la lógica: curva elíptica, firmas, bloques, validador, ataque. Es el corazón del proyecto y funciona solo, sin las otras dos piezas. | Python, sin dependencias |
| **Servidor** | `server/` | Expone el núcleo por internet (o red local) para que la interfaz lo use. Guarda la red compartida y avisa a todos los navegadores cuando algo cambia. | Python (FastAPI) |
| **Interfaz** | `frontend/` | La aplicación web: tablas, gráficos, botones. No hace ningún cálculo criptográfico; todo se lo pide al servidor. | TypeScript (React) |

Esta separación es intencional: la criptografía vive en un solo lugar, el núcleo,
y tanto la demo de terminal como la interfaz web usan exactamente el mismo código.

## Tres formas de usarlo

| Forma | Comando | Cuándo conviene |
|---|---|---|
| **Demo en terminal** | `python -m minichain` | Para ver todo el flujo en 8 segundos sin instalar nada. Imprime cada paso con sus números. Con `--pausa` se detiene entre pasos. |
| **Aplicación web** | `python -m server` (después de compilar la UI) | Para exponer: se navega la red, se ven los bloques, se ejecuta el ataque con botones. Varias personas pueden conectarse a la vez. |
| **API** | `http://localhost:8000/api/docs` | Para programar otros clientes (por ejemplo un script que firma con su propia clave). |

Las instrucciones de instalación están en el [README principal](../README.md#ejecutar).

## Los personajes de la simulación

Al arrancar, el programa genera una red con cinco billeteras y algunas
transacciones entre ellas. Todos los datos salen de una **semilla** (un número):
la misma semilla genera siempre las mismas claves y montos.

| Personaje | Papel | Cómo genera sus nonces | ¿Es vulnerable? |
|---|---|---|---|
| **Alice** | Usuaria normal | RFC 6979 (determinista, la defensa) | No |
| **Bob** | **La víctima** | Un generador aleatorio defectuoso con solo 8 valores posibles, como el de Android en 2013 (configurable) | **Sí** |
| **Carol** | Usuaria normal | Aleatorio del sistema operativo (correcto) | No |
| **Minera** | Mina los bloques y cobra la recompensa | No firma transacciones | No |
| **Mallory** | **La atacante** | No tiene fondos ni acceso a nada: solo lee la cadena pública | — |

Alice, Bob y Carol empiezan con 1000 monedas cada uno. Bob envía la mitad de las
transacciones, así que firma unas 10 veces. Como su generador solo tiene 8 valores
posibles, por el **principio del palomar** (10 firmas en 8 "casillas") al menos dos
firmas comparten nonce. Ahí está la vulnerabilidad.

## Qué está simplificado respecto a Bitcoin

El proyecto concentra la dificultad en la criptografía. Lo que haría enorme un
proyecto de blockchain se dejó fuera a propósito:

| Bitcoin real | minichain | Por qué |
|---|---|---|
| Miles de nodos que se comunican por internet (red P2P) | Un solo nodo | La red P2P no tiene que ver con la vulnerabilidad. |
| Consenso entre nodos, bifurcaciones de la cadena | No hay | Igual que lo anterior. |
| Modelo de "salidas no gastadas" (UTXO) | Modelo de cuentas con saldo y un contador por cuenta | Es mucho más fácil de entender y de mostrar. |
| Dirección = RIPEMD-160(SHA-256(clave)) en Base58 | Dirección = primeros 20 bytes de SHA-256(clave) | El detalle de formato no cambia nada de la seguridad. |
| Dificultad que se ajusta sola cada dos semanas | Dificultad fija y configurable | Para que el minado tarde segundos. |
| Firmas normalizadas ("low-s") | Sin normalizar | El ataque funciona igual en ambos casos (el código contempla las dos variantes). |

## Qué se comprobó

- 71 pruebas automáticas (`python -m pytest`) cubren la aritmética de la curva, la
  comparación contra la librería `ecdsa`, la cadena, el validador, el ataque, la
  defensa y la API.
- La firma propia coincide byte a byte con la de la librería `ecdsa` cuando ambas
  usan RFC 6979.

---

Siguiente: [2. Blockchain](02-blockchain.md)
