# Despliegue y escalado

## Opción 1: en el salón de clase (red local)

Un computador corre el servidor y los demás se conectan por la IP de ese equipo.
Cada estudiante abre la UI, elige o crea una billetera y hace transacciones en la
misma red.

```bash
cd frontend && npm install && npm run build && cd ..
MINICHAIN_HOST=0.0.0.0 python -m server
# los demás abren http://<ip-del-equipo>:8000
```

En Windows (PowerShell): `$env:MINICHAIN_HOST="0.0.0.0"; python -m server`.

## Opción 2: Docker

La imagen compila la UI y la sirve junto con la API desde un solo proceso.

```bash
docker compose up --build        # http://localhost:8000
```

Sirve en cualquier servicio que ejecute contenedores (Render, Railway, Fly.io,
Google Cloud Run, una VM). Requisitos del proveedor:

- Exponer el puerto `8000` (o fijar `MINICHAIN_PORT`).
- Permitir **WebSockets** en `/api/events`. Si no hay WebSockets, la UI sigue
  funcionando, pero solo se actualiza al recargar o al hacer acciones propias.
- **Una sola instancia** (ver *Límites actuales*).

### Detrás de un proxy inverso

Caddy (HTTPS automático):

```
minichain.ejemplo.com {
    reverse_proxy localhost:8000
}
```

nginx (hay que reenviar el *upgrade* del WebSocket):

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### UI y API en dominios distintos

Por ejemplo, la UI en un hosting estático (Vercel, Netlify, GitHub Pages) y la API
en otro lado:

```bash
cd frontend
VITE_API_URL=https://api.ejemplo.com npm run build      # sube dist/
# en el servidor:
MINICHAIN_CORS=https://ui.ejemplo.com python -m server
```

## Límites actuales

Esto es una simulación educativa. Antes de exponerla a internet conviene saber:

1. **El estado vive en memoria de un proceso.** Si el proceso se reinicia, se
   regenera el escenario desde la semilla. Por eso el servidor corre con un solo
   *worker*: varios procesos tendrían cadenas distintas.
2. **No hay autenticación.** Cualquiera que abra la página puede firmar con
   cualquier billetera del servidor (las billeteras son custodiadas por el
   servidor, a propósito, para la demo), regenerar la red o lanzar el ataque.
3. **El minado ocupa CPU.** `MINICHAIN_MAX_DIFFICULTY` limita cuánto puede pedir un
   cliente por bloque.

## Cómo escalarlo cuando haga falta

El código ya está separado para que cada paso sea local:

| Necesidad | Qué cambiar | Dónde |
|---|---|---|
| Sobrevivir reinicios | Guardar la cadena con `Blockchain.to_json()` al minar y cargarla con `Blockchain.from_json()` (que revalida todo) al arrancar | `server/network.py` |
| Varias instancias | Mover el estado a una base de datos y reemplazar `EventBus` por uno sobre Redis pub/sub con la misma interfaz (`publish`, `connect`, `disconnect`) | `server/events.py`, `server/network.py` |
| Usuarios reales | Agregar sesiones y que cada usuario solo controle sus billeteras, o mejor, que firme en el navegador y use solo `POST /api/transactions` | `server/app.py` |
| Abuso | Límite de peticiones por IP (por ejemplo `slowapi`) y un tope de billeteras por cliente | `server/app.py` |
| Varias redes aisladas | Un `Network` por sala, con la sala en la URL (`/api/salas/{id}/...`) | `server/app.py` |

La ruta `POST /api/transactions` ya acepta transacciones firmadas fuera del
servidor, así que un cliente con su propia clave no requiere cambios en la API.
