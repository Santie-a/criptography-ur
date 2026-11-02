# Sistema de diseño

Decisiones de la interfaz y la investigación que las respalda: primero la
estructura (dónde va cada cosa), después lo visual. Todos los valores visuales
están en `frontend/src/styles/tokens.css`; los componentes no usan colores sueltos.

## Objetivo

Que se vea y se use como un software de análisis, no como una presentación por
pasos. Un explorador de bloques con herramientas de seguridad: la red se
inspecciona, las alertas aparecen solas y el usuario profundiza donde quiere. Se
puede exponer en orden (Resumen → Laboratorio → Bloques → Integridad → Análisis de
firmas), pero la interfaz no impone ese orden.

## Referentes revisados

| Sistema | Qué se tomó |
|---|---|
| [Carbon (IBM), UI shell](https://www.carbondesignsystem.com/components/ui-shell-header/guidelines) | La estructura del shell: encabezado persistente a lo ancho, navegación lateral para la navegación secundaria y paneles de detalle. Esquinas rectas y profundidad por capas. |
| [Carbon, tabla de datos](https://carbondesignsystem.com/components/data-table/usage/) | Filas de 32–48 px y barra de herramientas de la misma altura que las filas. |
| [Primer (GitHub), navegación](https://primer.style/product/ui-patterns/navigation) | Encabezado de página con migas de pan; pestañas justo encima del contenido que cambian; barra lateral "padre" que controla el detalle. Tokens en dos capas ([color](https://primer.style/foundations/color/overview)). |
| [Patrón lista-detalle (Microsoft)](https://learn.microsoft.com/dual-screen/design/list-detail) y [SAP](https://learning.sap.com/learning-journeys/develop-sapui5-applications/designing-a-list-detail-application_a8654105-93dc-4fca-aa5c-d9e9d5d4f8c3) | Lista a un lado y detalle al otro, para recorrer muchos objetos sin perder el lugar. |
| [NN/g, visibilidad del estado del sistema](https://nngroup.com/articles/visibility-system-status) | Mostrar siempre el estado (conexión, altura, hora de la última actualización) y reservar las alertas para lo crítico, para no causar fatiga. |
| [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) | La paleta y la semántica de sus 12 pasos. |
| [Geist (Vercel)](https://vercel.com/geist) | Estética de herramienta para desarrolladores y monoespaciada para datos. |
| [Carbon, visualización de datos](https://carbondesignsystem.com/data-visualization/color-palettes/) | Contraste de 3:1 para marcas en gráficos y no codificar significado solo con color. |

## Estructura

```
┌───────────────────────────────────────────────────────────────────────┐
│ ≡  minichain  simnet   [ Buscar…        Ctrl K ]  Transferir  Minar  AL▾ │  encabezado
├────────────┬──────────────────────────────────────┬───────────────────┤
│ RED        │ Red / Bloques                         │                   │
│  Resumen   │ Bloques                  [Minar]      │  Inspector        │
│  Bloques   │ ─────────────────────────────────     │  (detalle del     │
│  Transacc. │  lista / tabla                        │   elemento        │
│  Billeteras│                                       │   elegido)        │
│ SEGURIDAD  │                                       │                   │
│  Integridad│                                       │                   │
│  Firmas  1 │                                       │                   │
│ LABORATORIO│                                       │                   │
├────────────┴──────────────────────────────────────┴───────────────────┤
│ ● Conectado │ 2 clientes │ Altura 7 │ Pendientes 0 │ ● 1 clave expuesta │  barra de estado
└───────────────────────────────────────────────────────────────────────┘
```

**Encabezado** (`components/shell.tsx`). Siguiendo a Carbon, el producto va a la
izquierda y las funciones se vuelven más globales hacia la derecha: marca, red
activa, búsqueda global, acciones que sirven desde cualquier pantalla (transferir,
minar), la identidad con la que firma este navegador, y tema y configuración al
extremo. Es oscuro en ambos temas para separar el marco de la aplicación del
contenido.

**Navegación lateral**. Nueve destinos, más de los cinco que Carbon recomienda
para pasar a navegación lateral. Se agrupan por función, no por orden de
exposición: *Red* (lo que hay), *Seguridad* (auditar lo que hay), *Laboratorio*
(entender las piezas) y, abajo y separado, *Escenario* (configuración). Los
contadores muestran datos reales; el rojo de "Análisis de firmas" aparece solo
cuando hay una clave expuesta. Se puede plegar a íconos y en móvil es un panel
deslizable.

**Encabezado de página**. Migas de pan, título, una línea de contexto y las
acciones de la página a la derecha. Cuando una página tiene modos, van como
pestañas debajo del título, justo encima del contenido que cambian (Primer).

**Lista-detalle**. Bloques, Transacciones, Billeteras y Análisis de firmas usan
una tabla y un inspector a la derecha. La selección vive en la URL
(`#/bloques?b=3`), así que se puede enlazar, recargar o volver atrás.

**Banco de trabajo**. Los laboratorios (Curva, ECDSA) usan tres columnas:
parámetros, lienzo y resultados, como una herramienta de diseño o un IDE.

**Barra de estado**. Conexión, clientes conectados, altura, dificultad,
pendientes, alertas y la hora de la última actualización (NN/g, heurística 1).

**Diálogos**. Las acciones globales (transferir, minar, crear billetera) se abren
en un `<dialog>` nativo, que atrapa el foco y se cierra con Esc. El botón primario
va a la derecha del pie, separado de cancelar.

**Alertas en lugar de pasos**. El ataque no es "el paso 5": el análisis de firmas
corre en segundo plano cada vez que cambia la cadena, y si encuentra dos firmas con
el mismo r, aparece una alerta en el Resumen, un contador rojo en la navegación,
una marca en la billetera afectada y un aviso en la barra de estado. Todas llevan
al análisis. Si no hay hallazgos, no hay alertas.

**Búsqueda global** (`Ctrl K` o `/`). Acepta número de bloque, prefijo de hash o
txid, nombre de billetera o dirección, y lleva directo al detalle.

## Forma

- **Esquinas rectas en todo** (`--radius: 0`), como Carbon. Lo único redondo son
  los puntos de datos: los indicadores de estado y los puntos de la curva.
- **Profundidad por capas**, sin sombras: lienzo (`--canvas`), paneles
  (`--layer-1`) y campos o cabeceras de tabla (`--layer-2`). Las sombras quedan
  solo para lo que flota: diálogos, resultados de búsqueda y avisos.
- **Selección e importancia con franjas**: la fila seleccionada y el destino activo
  de la navegación llevan una franja de 3 px del color de acento a la izquierda; las
  notificaciones, una franja del color de su estado.
- **Campos al estilo Carbon**: fondo de capa con una línea inferior, no una caja.
- Rejilla de 8 px (con medio paso de 4). Controles de 32 px, filas de tabla de
  36 px, encabezado de 48 px, barra de estado de 26 px.

## Paleta

[Radix Colors](https://www.radix-ui.com/colors) ofrece escalas de 12 pasos, cada
una con versión clara y oscura. Cada paso tiene un uso: 1–2 fondos, 3–5 fondos de
componentes (normal, hover, activo), 6–8 bordes, 9–10 color sólido, 11 texto de
bajo contraste y 12 texto de alto contraste.

| Rol | Escala | Paso 9 | Por qué |
|---|---|---|---|
| Neutro | **Slate** | `#8b8d98` | Gris levemente azulado: técnico sin ser azul, armoniza con el acento. |
| Acento | **Iris** | `#5b5bd6` | Índigo sobrio para acción principal, selección y foco. |
| Válido | **Jade** | `#29a383` | Verde frío. |
| Crítico / ataque | **Ruby** | `#e54666` | Rojo con un toque rosado que combina con iris. |
| Aviso / PoW | **Amber** | `#ffc53d` | Advertencias y hermanos en la prueba de Merkle. |

### Contraste (WCAG 2.1)

Calculado con la fórmula de luminancia relativa de WCAG sobre los valores reales
de Radix 3.0. AA exige 4.5:1 para texto normal y 3:1 para texto grande y gráficos.

| Par | Claro | Oscuro |
|---|---|---|
| Texto principal (slate-12 / slate-1) | 15.98 | 16.25 |
| Texto secundario (slate-11 / fondo) | 5.79 | 8.45 |
| Botón principal (blanco / iris-9) | 5.37 | 5.37 |
| Botón de peligro (blanco / `--bad-solid`) | 5.43 (ruby-11) | 5.40 (ruby-8) |
| Etiqueta de acento (iris-11 / iris-3) | 5.41 | 7.22 |
| Etiqueta válida (`--ok-on-soft` / jade-3) | 10.97 (jade-12) | 7.96 (jade-11) |
| Etiqueta crítica (ruby-11 / ruby-3) | 4.70 | 7.68 |
| Etiqueta de aviso (`--warn-on-soft` / amber-3) | 10.47 (amber-12) | — |

En tema claro, jade-11 sobre jade-3 da 4.19 y blanco sobre ruby-9 da 3.89, ambos
por debajo de AA; por eso existen `--ok-on-soft`, `--warn-on-soft` y
`--bad-solid`. Además del color, cada estado lleva texto o ícono.

## Tipografía

| Uso | Fuente | Por qué |
|---|---|---|
| Interfaz | **Inter** (variable) | Muy legible a tamaños pequeños, con cifras tabulares para alinear columnas. Se activan `cv11` y `ss01`. |
| Datos | **JetBrains Mono** (variable) | Distingue 0/O y 1/l/I y se lee bien muy pequeña ([comparativa](https://fontalternatives.com/blog/pairing-monospace-fonts-with-sans-serifs/)). Hashes, firmas y fórmulas. |

Escala: 11 · 12 · 13 · 14 · 16 · 20 · 28 px. Las fuentes viajan con la UI
compilada (`@fontsource-variable/*`): funciona sin internet.

## Componentes

`frontend/src/components/`:

- `shell.tsx`: encabezado, búsqueda global, navegación lateral, barra de estado.
- `ui.tsx`: `PageHeader`, `Panel`, `Inspector`, `Section`, `Tabs`, `Switcher`,
  `Modal`, `Button`, `AsyncButton`, `Field`, `Tag`, `NonceTag`, `Hex` (abrevia y
  copia al hacer clic), `Notice`, `Metrics`, `Empty`.
- `dialogs.tsx`: transferir, minar y crear billetera.
- `chain.tsx`: la tira de bloques enlazados y el árbol de Merkle.

Íconos: [Lucide](https://lucide.dev).

## Cambiar el aspecto

- **Otro acento**: reemplaza `iris` por otra escala de Radix en los `@import` y en
  las variables `--accent-*`.
- **Esquinas redondeadas**: el reinicio global está en la primera regla de
  `styles/app.css` (`border-radius: 0`).
- **Otra fuente**: instala `@fontsource-variable/<fuente>`, impórtala en
  `src/main.tsx` y cambia `--font-sans` o `--font-mono`.
