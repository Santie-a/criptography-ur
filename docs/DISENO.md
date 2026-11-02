# Sistema de diseño

Decisiones de la interfaz y la investigación que las respalda. Todo lo visual se
define en `frontend/src/styles/tokens.css`; los componentes no usan colores
sueltos.

## Objetivo

Una herramienta técnica para presentar en clase: se lee a distancia, aguanta
mucho texto hexadecimal y deja claro el estado de cada cosa (válido, inválido,
ataque, defensa) sin depender solo del color. "Elegante pero limpia": casi todo
en grises, un solo color de acento, y el color de estado reservado para lo que
importa.

## Referentes revisados

| Sistema | Qué se tomó |
|---|---|
| [Radix Colors](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) | La paleta completa y la semántica de sus 12 pasos por escala. |
| [Primer (GitHub)](https://primer.style/foundations/color/overview) | Tokens en dos capas: primitivos (que ignoran el tema) y funcionales (que cambian con el tema). |
| [Geist (Vercel)](https://vercel.com/geist) | Estética de herramienta para desarrolladores: bordes finos, radios pequeños, mucho espacio, monoespaciada para datos. |
| [Carbon (IBM), visualización de datos](https://carbondesignsystem.com/data-visualization/color-palettes/) | Contraste mínimo de 3:1 contra el fondo para marcas en gráficos, y no codificar significado solo con color. |
| [Betterment, modo oscuro](https://www.betterment.com/resources/dark-mode) | Cada token semántico tiene un valor para cada tema, tomado del lado opuesto de la escala. |

## Paleta

[Radix Colors](https://www.radix-ui.com/colors) ofrece escalas de 12 pasos, cada
una con versión clara y oscura diseñadas en conjunto. Cada paso tiene un uso:
1–2 fondos, 3–5 fondos de componentes (normal, hover, activo), 6–8 bordes,
9–10 color sólido, 11 texto de bajo contraste y 12 texto de alto contraste. Eso
hace que el modo oscuro salga casi gratis: el token `--accent-soft` es `iris-3`
en ambos temas y Radix ya resolvió cómo se ve cada uno.

| Rol | Escala | Claro (paso 9) | Por qué |
|---|---|---|---|
| Neutro | **Slate** | `#8b8d98` | Gris levemente azulado: se lee técnico sin ser azul y armoniza con un acento índigo. La guía de Radix muestra que el tono del gris cambia la sensación de toda la página. |
| Acento | **Iris** | `#5b5bd6` | Índigo-violeta sobrio. Distinto del azul genérico de enlaces y de los colores de estado. |
| Válido / defensa | **Jade** | `#29a383` | Verde más frío y elegante que el verde puro. |
| Inválido / ataque | **Ruby** | `#e54666` | Rojo con un toque rosado que combina con iris. |
| PoW / aviso | **Amber** | `#ffc53d` | Advertencias y hermanos en la prueba de Merkle. |

### Contraste (WCAG 2.1)

Calculado con la fórmula de luminancia relativa de WCAG sobre los valores reales
de Radix 3.0. AA exige 4.5:1 para texto normal y 3:1 para texto grande y
elementos gráficos.

| Par | Claro | Oscuro |
|---|---|---|
| Texto principal (slate-12 / slate-1) | 15.98 | 16.25 |
| Texto secundario (slate-11 / fondo) | 5.79 | 8.45 |
| Botón principal (blanco / iris-9) | 5.37 | 5.37 |
| Botón de peligro (blanco / `--bad-solid`) | 5.43 (ruby-11) | 5.40 (ruby-8) |
| Etiqueta de acento (iris-11 / iris-3) | 5.41 | 7.22 |
| Etiqueta válida (`--ok-on-soft` / jade-3) | 10.97 (jade-12) | 7.96 (jade-11) |
| Etiqueta inválida (ruby-11 / ruby-3) | 4.70 | 7.68 |
| Etiqueta de aviso (`--warn-on-soft` / amber-3) | 10.47 (amber-12) | — |

Dos ajustes salieron de esta tabla: en tema claro, jade-11 sobre jade-3 da 4.19 y
blanco sobre ruby-9 da 3.89, ambos por debajo de AA. Por eso existen los tokens
`--ok-on-soft`, `--warn-on-soft` y `--bad-solid`, que usan otro paso solo donde
hace falta.

Además del color, cada estado lleva texto ("VÁLIDA", "RECHAZADA", "clave
expuesta") o un ícono, para quien no distingue rojo de verde.

## Tipografía

| Uso | Fuente | Por qué |
|---|---|---|
| Interfaz | **Inter** (variable) | La sans-serif más usada en interfaces de producto; buena a tamaños pequeños, con cifras tabulares (`tabular-nums`) para que las columnas de números se alineen. Se activan `cv11` y `ss01` para una "a" de un piso y cifras más claras. |
| Datos | **JetBrains Mono** (variable) | Distingue bien 0/O y 1/l/I, tiene altura de x grande y se lee bien muy pequeña ([comparativa](https://fontalternatives.com/blog/pairing-monospace-fonts-with-sans-serifs/)). Clave para hashes, firmas y fórmulas. Inter + JetBrains Mono es una pareja habitual en paneles técnicos. |

Las fuentes se instalan como paquetes npm (`@fontsource-variable/*`) y viajan con
la UI compilada: no se pide nada a Google Fonts ni a un CDN, así que la interfaz
funciona sin internet en el salón.

Escala: 12 · 13 · 15 · 18 · 24 · 32 px. Los títulos usan peso 600 y espaciado
negativo leve.

## Espaciado, forma y profundidad

- Base de 4 px: 4, 8, 12, 16, 24, 32, 48, 64.
- Radios: 6 px (controles pequeños), 8 px (botones, campos), 12 px (tarjetas).
- Profundidad con bordes de un paso de neutro y una sombra muy suave; en modo
  oscuro la profundidad viene del brillo de la superficie, no de sombras.

## Componentes

Todos en `frontend/src/components/ui.tsx`: `Card`, `Button`, `AsyncButton`
(muestra la carga mientras espera al servidor), `Badge`, `Hex` (abrevia un valor
hexadecimal y lo copia completo al hacer clic), `Field`, `Segmented`, `Callout`,
`Stat`, `PageHead`. Los específicos del dominio están en
`frontend/src/components/chain.tsx`: la tira de bloques enlazados y el árbol de
Merkle con el camino de la prueba resaltado.

Íconos: [Lucide](https://lucide.dev), de trazo fino y consistente con el resto.

## Cambiar el aspecto

- **Otro acento**: reemplaza `iris` por otra escala de Radix (por ejemplo
  `indigo`, `teal` o `plum`) en los `@import` y en las variables `--accent-*`.
- **Otro neutro**: `slate` por `mauve`, `sage`, `olive` o `sand` si cambias el acento a uno cálido.
- **Otra fuente**: instala `@fontsource-variable/<fuente>`, impórtala en
  `src/main.tsx` y cambia `--font-sans` o `--font-mono`.
