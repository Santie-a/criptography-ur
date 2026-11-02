# minichain UI

Interfaz web de minichain (React 19 + TypeScript + Vite). No hace criptografía:
todo lo calcula el servidor de Python (`../server`) usando el núcleo (`../minichain`).

```bash
npm install
npm run dev        # http://localhost:5173, reenvía /api a http://127.0.0.1:8000
npm run build      # genera dist/, que `python -m server` sirve en http://localhost:8000
npm run typecheck
```

| Archivo | Qué hay |
|---|---|
| `src/api.ts` | Único punto de contacto con la API |
| `src/types.ts` | Tipos de las respuestas |
| `src/store.tsx` | Estado de la red, WebSocket con reconexión, identidad activa, alertas y diálogos |
| `src/router.ts` | Rutas por hash con parámetros (`#/bloques?b=3`) |
| `src/styles/tokens.css` | Tokens de diseño (Radix Colors, capas, esquinas rectas) |
| `src/components/shell.tsx` | Encabezado, búsqueda global, navegación lateral y barra de estado |
| `src/components/` | Componentes base, diálogos y visualizaciones (cadena, árbol de Merkle) |
| `src/pages/` | Una página por sección de la navegación |

Cómo encaja con la simulación: [../docs/CONECTAR_UI.md](../docs/CONECTAR_UI.md).
Decisiones de diseño: [../docs/DISENO.md](../docs/DISENO.md).
