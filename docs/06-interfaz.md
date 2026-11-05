# 6. La interfaz

> **En una frase:** la aplicación web es un explorador de la blockchain simulada
> con herramientas de seguridad: se recorre la red, el sistema detecta solo las
> claves expuestas y desde ahí se profundiza en el ataque y la defensa.

Para abrirla: `python -m server` y luego `http://localhost:8000` (instrucciones
completas en el [README](../README.md#ejecutar)).

---

## 6.1 Cómo está organizada la pantalla

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ≡ minichain  simnet·semilla 2026  [Buscar…  Ctrl K]  Transferir Minar AL▾ ☾ ⚙ │ ← Encabezado
├──────────────┬───────────────────────────────────────┬───────────────────┤
│ RED          │ Red / Bloques               (ruta)    │                   │
│  Resumen     │ Bloques                [Minar bloque] │   Inspector       │
│  Bloques   6 │ ───────────────────────────────────── │   (detalle de lo  │
│  Transacc.   │                                       │    que elijas en  │
│  Billeteras 5│   Contenido de la página              │    la lista)      │
│ SEGURIDAD    │   (tablas, gráficos, formularios)     │                   │
│  Integridad  │                                       │                   │
│  Análisis  1 │                                       │                   │
│ LABORATORIO  │                                       │                   │
│  Curva       │                                       │                   │
│  ECDSA       │                                       │                   │
│ ──────────── │                                       │                   │
│  Escenario   │                                       │                   │
├──────────────┴───────────────────────────────────────┴───────────────────┤
│ ● Conectado │ 2 clientes │ Altura 5 │ Pendientes 0 │ ● 1 clave expuesta   │ ← Barra de estado
└──────────────────────────────────────────────────────────────────────────┘
```

### El encabezado (arriba, oscuro)

Siempre visible, en todas las páginas. De izquierda a derecha:

| Elemento | Para qué sirve |
|---|---|
| **≡** | Pliega la navegación lateral a solo íconos (o la abre, en el celular). |
| **minichain explorer** | Vuelve al Resumen. |
| **simnet · semilla 2026** | Indica que es una red simulada y con qué semilla se generó. |
| **Buscar** (`Ctrl K` o `/`) | Búsqueda global. Acepta un número de bloque (`3`), el comienzo de un hash o txid (`0003e1`), un nombre (`bob`) o una dirección (`mc3212`). Con las flechas y Enter se va directo al detalle. |
| **Transferir** *(administrador)* | Abre el diálogo para enviar dinero desde una billetera de la simulación. |
| **Minar** *(administrador)* | Abre el diálogo para minar un bloque con las transacciones pendientes. |
| **AL ▾** (identidad) *(administrador)* | Con qué billetera de la simulación firma el administrador. |
| **Administrar / Administrador** | Ingresar el token de administrador, o ver la sesión activa y cerrarla. Si el servidor no tiene token configurado, en su lugar aparece **modo abierto**. |
| **☾ / ☀** | Tema oscuro o claro. |
| **⚙** *(administrador)* | Configuración del escenario. |

### La navegación lateral (izquierda)

Agrupada por **para qué** sirve cada sección, no por un orden de pasos:

| Grupo | Propósito |
|---|---|
| **Tú** | Tu billetera en este dispositivo: crearla, recibir y enviar. |
| **Red** | Ver lo que hay: bloques, transacciones y billeteras. Es la parte de "explorador de bloques". |
| **Seguridad** | Auditar lo que hay: si la cadena fue manipulada y si alguna firma expone una clave. |
| **Laboratorio** | Entender las piezas matemáticas por separado, con números pequeños o con todos los valores intermedios a la vista. |
| **Escenario** (abajo) | Configurar y regenerar la simulación. |

Los números a la derecha son datos reales (cantidad de bloques, de billeteras, de
pendientes). El número **rojo** junto a "Análisis de firmas" aparece solo cuando
hay claves expuestas.

### La barra de estado (abajo)

Muestra en todo momento el estado del sistema: conexión con el servidor, cuántos
clientes hay conectados, altura de la cadena, dificultad, transacciones
pendientes, claves expuestas (en rojo, con enlace al análisis) y la hora de la
última actualización.

### El inspector (derecha)

En las páginas con listas, al elegir una fila aparece su detalle a la derecha, sin
perder la lista de vista. Lo seleccionado queda en la dirección de la página (por
ejemplo `#/bloques?b=3`): se puede copiar el enlace, recargar o usar "atrás".

### Los diálogos

Transferir, minar y crear billetera se abren en una ventana encima de la página
actual. Se cierran con **Esc** o con **Cancelar**.

| Diálogo | Qué pide | Qué hace |
|---|---|---|
| **Nueva transacción** | Destinatario, monto y memo. Muestra tu saldo disponible. | Firma con tu billetera (y con la estrategia de nonce de tu billetera) y la deja en la mempool. |
| **Minar bloque** | La dificultad del bloque (el mínimo de la red o más). Muestra el objetivo y los intentos esperados. | Mina un bloque con todo lo pendiente; la recompensa de 50 va a tu billetera. Al terminar muestra los intentos que tomó y un botón para ver el bloque. |
| **Nueva billetera** | Nombre y estrategia de nonce. | Crea un par de claves y te cambia a esa billetera. Empieza en 0: mina un bloque para tener fondos. |

### Quién puede hacer qué

La aplicación tiene dos roles (detalle técnico en [Roles](CONECTAR_UI.md#roles)):

| | Visitante (sin token) | Administrador |
|---|---|---|
| Explorar bloques, transacciones y billeteras | Sí | Sí |
| Ver la integridad de la cadena y el análisis de firmas, incluida la clave recuperada | Sí | Sí |
| Usar los laboratorios | Sí (con límite de uso) | Sí |
| Crear su billetera en el dispositivo y enviar desde ella | Sí | Sí |
| Transferir, minar, crear billeteras de la simulación y cambiar su nonce | No | Sí |
| Simular manipulaciones, validar archivos y comparar estrategias | No | Sí |
| Explotar una clave expuesta y regenerar la red | No | Sí |

Al visitante no se le muestran los botones que no puede usar. Donde una página
tiene una función de administrador, aparece en su lugar un aviso **Requiere
administrador** con un botón para ingresar. La barra de estado indica el rol:
"Solo lectura", "Administrador" o "Modo abierto".

El administrador ingresa con **Administrar** en el encabezado. El token queda
guardado en ese navegador hasta que cierre la sesión.

### Varias personas a la vez

Todos los navegadores conectados comparten **la misma red**. Si alguien envía o el
administrador mina, los demás lo ven al instante (la página se actualiza sola). En
clase, cada estudiante crea su billetera en el celular, el administrador le envía
monedas y desde ahí pueden enviarse entre ellos.

---

## 6.2 Tú · Mi billetera

**Propósito:** que cada persona tenga su propia billetera, en su celular o PC, y la
use como una billetera real: **la clave privada se genera y se guarda solo en ese
dispositivo**. El servidor nunca la recibe.

### Si todavía no hay billetera

| Zona | Qué hace |
|---|---|
| **Crear tu billetera** | Pide un nombre, genera un par de claves en el navegador y registra el nombre en la red. El registro va **firmado con la nueva clave**, así nadie puede registrar una clave pública ajena con otro nombre. |
| **Restaurar una billetera** | Para recuperar una billetera exportada antes: se pega la clave privada (64 dígitos hexadecimales) y el nombre. |

### Con billetera

| Zona | Qué muestra o hace |
|---|---|
| **Saldo** | Lo disponible (descontando lo que está pendiente) y lo confirmado. Se actualiza solo cuando alguien te envía o se mina un bloque. |
| **Enviar** | Destinatario (otro participante, una billetera de la simulación o una dirección), monto y memo. **Firmar en este dispositivo y enviar** arma la transacción, la firma aquí y la manda a la red. Debajo, "Qué firmó este dispositivo" muestra el mensaje exacto, su hash z y la firma (r, s). |
| **Recibir** | Tu dirección, con un botón para copiarla. |
| **Movimientos** | Lo que enviaste y recibiste, incluido lo pendiente. |
| **Seguridad** | La clave pública, **Exportar clave privada** (para respaldarla) y **Olvidar billetera en este dispositivo**. |

En el encabezado, a la derecha, aparece tu nombre (o "Crear billetera" si aún no
tienes); lleva a esta página.

### Lo que conviene saber

- **La firma es la autorización.** Para enviar no hace falta cuenta ni contraseña:
  el servidor solo comprueba que la firma corresponde a la clave pública del emisor.
  Sin tu clave privada, nadie puede gastar tus monedas, ni siquiera el servidor.
- **Nonces seguros.** La billetera del dispositivo firma con RFC 6979: no puede
  repetir nonces, así que no es vulnerable al ataque del [documento 4](04-vulnerabilidad.md).
- **Si borras los datos del navegador, pierdes la billetera**, igual que si pierdes
  una billetera real. Por eso existe *Exportar clave privada*.
- Si el administrador regenera la red, tu billetera sigue registrada con su nombre,
  pero el saldo vuelve a 0 porque la cadena es nueva.

**Qué concepto ilustra:** la diferencia entre clave privada (secreta, en tu
dispositivo) y clave pública (la conoce todo el mundo), y que en una blockchain la
identidad **es** la clave ([2.2](02-blockchain.md#22-las-cuentas-y-las-direcciones)).

---

## 6.3 Red · Resumen

**Propósito:** ver el estado de la red de un vistazo y enterarse de cualquier
problema de seguridad. Es la página de inicio.

| Zona | Qué muestra |
|---|---|
| **Alertas** (arriba) | Si una clave está expuesta, un aviso rojo: "Clave privada de Bob expuesta", con las dos firmas que comparten r y un botón **Analizar**. Si alguna billetera usa un generador inseguro pero todavía no repitió nonce, un aviso amarillo. Si todo está bien, no aparece nada. |
| **Métricas** | Altura, dificultad, firmas en la cadena (y cuántos r distintos), pendientes y claves expuestas. |
| **Cadena** | La tira de bloques enlazados. Clic en uno para abrirlo en Bloques. |
| **Últimos bloques / Últimas transacciones** | Las más recientes; clic para ver el detalle. |
| **Integridad de la cadena** | Resultado de validar la cadena completa en este momento. |
| **Billeteras** | Saldo y estrategia de nonce de cada una. |

**Qué concepto ilustra:** que la vulnerabilidad se descubre leyendo datos
públicos. Nadie "hackeó" nada: el sistema simplemente analizó las firmas.

---

## 6.4 Red · Bloques

**Propósito:** inspeccionar la cadena bloque por bloque y ver cómo se enlazan.

| Zona | Qué muestra |
|---|---|
| **Cadena** | Tira de bloques con su hash, el hash del anterior y el nonce de la prueba de trabajo. El seleccionado se resalta. |
| **Tabla** | Todos los bloques, del más nuevo al más viejo: hash, anterior, cantidad de transacciones, nonce, dificultad y fecha. |
| **Inspector → Encabezado** | Si la prueba de trabajo es válida, todos los campos del encabezado y **el texto exacto que se hashea** para obtener el hash del bloque. Con las flechas ‹ › se pasa al bloque anterior o siguiente. |
| **Inspector → Transacciones** | Las transacciones del bloque; clic para abrir una. |
| **Inspector → Árbol de Merkle** | El árbol dibujado. Al elegir una transacción se resalta el camino hasta la raíz (violeta) y los hashes hermanos que forman la prueba (ámbar), y se comprueba la prueba contra la raíz. |

**Qué concepto ilustra:** el encadenamiento por hash ([2.5](02-blockchain.md#25-los-bloques)),
la prueba de trabajo ([2.7](02-blockchain.md#27-la-prueba-de-trabajo-minar)) y el árbol de
Merkle ([2.6](02-blockchain.md#26-el-árbol-de-merkle)).

---

## 6.5 Red · Transacciones

**Propósito:** ver cada transacción con su firma y lo que se firmó.

| Zona | Qué muestra |
|---|---|
| **Pestañas** | **Confirmadas** (ya en un bloque) y **Pendientes** (en la mempool). |
| **Filtro** | Solo las transacciones de una billetera. |
| **Tabla** | Txid, bloque, de, para, monto, seq, el valor **r** de la firma y el memo. Un r en **rojo** significa que esa misma clave usó ese r en otra firma: nonce repetido. |
| **Inspector** | Estado (confirmada o pendiente, si tiene nonce reutilizado), los datos, la firma completa (clave pública, r y s), **el mensaje firmado** tal cual, y la prueba de inclusión Merkle. |

**Qué concepto ilustra:** que todo lo que necesita el atacante (Q, r, s y el
mensaje para calcular z) está a la vista de cualquiera
([4.2](04-vulnerabilidad.md#42-qué-ve-el-atacante)).

---

## 6.6 Red · Billeteras

**Propósito:** ver y gestionar las cuentas.

| Zona | Qué muestra |
|---|---|
| **Botón Nueva billetera** *(administrador)* | Crea una billetera de la simulación, custodiada por el servidor. |
| **Tabla** | Todas las billeteras. La columna **Clave en** dice dónde vive la clave privada: **servidor** (las de la simulación: Alice, Bob, Carol…) o **dispositivo** (las de los participantes). Además: dirección, saldo confirmado, disponible (descontando lo pendiente), próximo seq, estrategia de nonce y estado ("clave expuesta" si aplica). |
| **Inspector** | Saldo, cuántas firmas publicó, dirección y clave pública (la privada nunca se muestra), la estrategia de nonce (el administrador la puede cambiar en las billeteras del servidor) y el historial. El botón **Usar** cambia la billetera con la que firma el administrador. |

**Qué concepto ilustra:** que la clave pública es pública y la privada no; y que la
estrategia de nonce es una decisión de la billetera, no de la red. Cambiarla solo
afecta las firmas futuras ([4.10](04-vulnerabilidad.md#410-la-defensa)).

---

## 6.7 Seguridad · Integridad

**Propósito:** comprobar que nadie manipuló la cadena, y experimentar con
manipulaciones para ver qué regla las detecta.

Tiene tres pestañas y un botón **Exportar JSON** (descarga la cadena completa).

### Cadena actual

Valida la cadena real cada vez que cambia. Muestra:

- Un aviso verde ("La cadena es válida") o rojo.
- Métricas: bloques revisados, firmas verificadas, bloques con problemas y
  problemas encontrados.
- La tira de bloques coloreada: verde los válidos, rojo los que tienen problemas,
  y un enlace punteado donde se rompe el `prev_hash`.
- Una tabla de problemas con el bloque, la transacción, la regla que falló, el
  detalle y si el problema es **directo** o **derivado** (consecuencia del primero).

### Simular manipulación

Elige un bloque, una transacción y un cambio, y pulsa **Aplicar y validar**. El
cambio se hace sobre **una copia**: la red real no se modifica.

| Cambio disponible | Qué se espera ver |
|---|---|
| Cambiar el monto | Falla la raíz de Merkle y la firma |
| Cambiar el destinatario | Falla la raíz de Merkle y la firma |
| Poner la firma de otra transacción | Falla la raíz de Merkle y la firma |
| Cambiar el monto, recalcular Merkle y re-minar | Falla la firma y se rompe el enlace con el bloque siguiente |
| Bajar la dificultad y re-minar | Falla la dificultad mínima y se rompe el enlace |
| Alterar el prev_hash | Se rompe el enlace |

### Validar archivo

Pega (o abre) una cadena en JSON y valídala. La idea: exportar la cadena, editar a
mano un monto en un editor de texto, y comprobar que el validador lo detecta.

**Qué concepto ilustra:** las reglas del validador
([2.8](02-blockchain.md#28-el-validador-cómo-se-detecta-una-manipulación)) y por qué
reescribir la historia no pasa desapercibido.

---

## 6.8 Seguridad · Análisis de firmas

**Propósito:** auditar todas las firmas publicadas en busca de nonces repetidos,
demostrar la recuperación de la clave y la explotación, y comparar con la defensa.

### Pestaña Reutilización de nonce

| Zona | Qué muestra |
|---|---|
| **Métricas** | Firmas analizadas, valores de r distintos, pares con r repetido y claves expuestas. |
| **Hallazgos** | Una fila por clave expuesta, con severidad "crítica", la billetera, el r compartido y las dos firmas involucradas. Clic para verla en el inspector. |
| **Firmas en la cadena** | Todas las firmas (bloque, firmante, r, s, z). Las de r repetido en rojo. |
| **Inspector → Evidencia** | El r compartido y los valores s y z de cada firma. |
| **Inspector → Recuperación** | Los tres pasos con los números reales: el nonce k = (z₁ − z₂)(s₁ − s₂)⁻¹, la clave d = (s₁k − z₁)r⁻¹, y la comprobación d·G = Q. Una etiqueta indica además si coincide con la clave real (eso solo lo puede saber el servidor). |
| **Inspector → Explotar** | Elige a quién enviar los fondos y pulsa **Firmar como Bob y minar**. Se crea una transacción con la clave recuperada, se mina y se muestra que **la validación sigue pasando**, junto con los saldos antes y después. |

El análisis corre solo cada vez que cambia la cadena (por eso aparecen las alertas
en el resto de la aplicación). **Reanalizar** lo fuerza.

### Pestaña Comparar estrategias

| Zona | Qué muestra |
|---|---|
| **Misma simulación, distinto generador de k** | Con la semilla y la entropía elegidas, genera dos redes idénticas salvo por cómo Bob elige k (RNG defectuoso contra RFC 6979) y les aplica el mismo análisis. Una tabla compara firmas de Bob, r distintos, pares repetidos y claves recuperadas. |
| **RFC 6979** | Firma tres mensajes con la misma clave: dos iguales y uno distinto. Los dos iguales dan el mismo r (y la misma firma); el distinto da otro r. |
| **Aviso** | Cambiar el generador no protege las firmas ya publicadas. Enlace a Escenario. |

**Qué concepto ilustra:** todo el [documento 4](04-vulnerabilidad.md).

---

## 6.9 Laboratorio · Curva elíptica

**Propósito:** ver con los ojos cómo funciona el grupo de puntos de una curva
elíptica, con una curva lo bastante pequeña como para dibujarla.

Está dividida en tres columnas, como una herramienta de trabajo:

| Columna | Qué tiene |
|---|---|
| **Parámetros** (izquierda) | La curva (ejemplos predefinidos, incluida y² = x³ + 7, la misma forma que secp256k1) o p, a y b a mano. La operación: **Suma P + Q** o **Escalar k · P**. La cantidad de puntos y la cota de Hasse. |
| **Lienzo** (centro) | Todos los puntos de la curva. Clic en un punto para elegir P y en otro para Q. La línea punteada es el eje de simetría: (x, y) y (x, −y) son inversos. |
| **Resultado** (derecha) | En suma: P + Q, si fue secante, tangente o P + (−P) = O, y el cálculo de λ, x₃ e y₃. En escalar: k en binario, el resultado, el orden de P y la **tabla de double-and-add** paso a paso (los puntos intermedios se marcan en el lienzo). Abajo, los parámetros reales de secp256k1. |

**Qué concepto ilustra:** [3.4](03-criptografia.md#34-curvas-elípticas) y
[3.5](03-criptografia.md#35-multiplicar-un-punto-por-un-número).

---

## 6.10 Laboratorio · ECDSA

**Propósito:** firmar un mensaje viendo todos los valores intermedios,
incluido el nonce k (que en una billetera real nunca se muestra), y reproducir el
ataque a mano.

| Columna | Qué tiene |
|---|---|
| **Parámetros** | El mensaje, la clave privada (vacía para generar una), y cómo se elige k: **RFC 6979**, **Aleatorio** o **Fijo** (con el valor de k). |
| **Centro** | El historial de firmas de la sesión. Si la misma clave firmó dos mensajes distintos con el mismo r, las filas se marcan en rojo y aparece el panel **Nonce repetido detectado** con el botón **Recuperar la clave privada**. |
| **Derivación** (derecha) | Los seis pasos: claves (d y Q), hash z, nonce k, r, s y la verificación (u₁, u₂ y X.x mod n = r). Abajo, un campo para verificar la misma firma sobre otro mensaje y ver que falla. |

**Para reproducir el ataque:** elige **Fijo**, firma un mensaje, cambia el texto y
vuelve a firmar. Aparece el aviso; pulsa **Recuperar la clave privada** y compara
el d obtenido con el de arriba.

**Qué concepto ilustra:** [3.7](03-criptografia.md#37-la-firma-digital-ecdsa) y la
vulnerabilidad a pequeña escala.

---

## 6.11 Escenario

**Propósito:** configurar la simulación y volver a generarla.

| Opción | Qué controla |
|---|---|
| **Semilla** | Las claves, montos y destinatarios. La misma semilla da la misma red (salvo los nonces aleatorios de Carol). |
| **Dificultad mínima** | Bits en cero exigidos al hash de cada bloque. Cada bit duplica el trabajo de minado. |
| **Bloques iniciales** | Cuántos bloques se minan al generar la red. |
| **Transacciones por bloque** | Cuántas transacciones lleva cada bloque inicial. Bob envía la mitad. |
| **Generación del nonce k (Bob)** | RFC 6979, aleatorio, RNG defectuoso o k constante. **Decide si el ataque es posible.** |
| **Entropía del generador** | Solo con RNG defectuoso: cuántos estados tiene (2^bits). La página calcula cuántas firmas hará Bob y avisa si la colisión es segura por el principio del palomar. |

El botón **Regenerar** reemplaza la red **para todos los clientes conectados**:
se pierden los bloques, transacciones y billeteras creadas desde la última vez.

---

## 6.12 Atajos

| Atajo | Acción |
|---|---|
| `Ctrl K` o `/` | Ir a la búsqueda |
| `↑` `↓` `Enter` | Moverse por los resultados de búsqueda y abrir uno |
| `Esc` | Cerrar un diálogo o la búsqueda |
| Clic en cualquier hash | Copiarlo completo |

---

Anterior: [5. El código](05-codigo.md) · Siguiente: [7. Guion para exponer](07-guion-exposicion.md)
