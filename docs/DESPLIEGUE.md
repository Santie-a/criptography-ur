# Despliegue y escalado

Tres formas de poner la red en marcha, de la más simple a la de producción:

| Opción | Para qué | Dónde se guarda la red |
|---|---|---|
| 1. Red local del salón | Un computador hace de servidor; los demás entran por su IP | Memoria (o un archivo) |
| 2. Docker | Cualquier máquina o proveedor que ejecute contenedores | Memoria, archivo o PostgreSQL |
| 3. **Render + Supabase** | Una URL pública para entrar desde cualquier celular o PC | PostgreSQL en Supabase |

---

## Persistencia: dónde se guarda la red

El servidor valida todo en memoria y, después de cada cambio (transferencia,
bloque minado, billetera nueva, regenerar…), guarda una copia. Al arrancar, si
hay una copia, la restaura en lugar de generar una red nueva.

| Variable | Almacenamiento | Uso |
|---|---|---|
| `DATABASE_URL` | PostgreSQL | Producción (Supabase) |
| `MINICHAIN_STATE_FILE` | Un archivo JSON | Desarrollo local que sobreviva reinicios |
| ninguna | Solo memoria | Desarrollo; al reiniciar se regenera desde la semilla |

Qué se guarda (en el esquema `minichain`, ver `server/storage.py`):

- `minichain.blocks`: un bloque por fila. Solo se insertan los nuevos.
- `minichain.state`: una fila con los parámetros del escenario, la versión, la
  mempool y las billeteras custodiadas por el servidor (las de la demostración,
  con su clave privada simulada y el estado de su generador de nonces, para que
  Bob siga repitiendo nonces igual después de un reinicio).

Las tablas se crean solas al arrancar. Están fuera del esquema `public` y con
seguridad por filas (RLS) activa, así que la API REST de Supabase no las expone:
solo el servidor las lee, con la cadena de conexión.

Al restaurar se revisan enlaces, prueba de trabajo, Merkle, contadores y saldos.
Si el estado guardado fue alterado, el servidor lo descarta y genera una red nueva.
No se repite la verificación ECDSA al restaurar (los datos los escribió el propio
servidor después de verificarlos); esa verificación se hace en segundo plano
justo después de arrancar, para el panel de Integridad.

Si la base de datos falla, la red sigue funcionando en memoria, `/api/health`
indica `"storage": {"ok": false, ...}` y la siguiente escritura reintenta lo
pendiente.

---

## Opción 1: en el salón de clase (red local)

```bash
cd frontend && npm install && npm run build && cd ..
MINICHAIN_HOST=0.0.0.0 python -m server
# los demás abren http://<ip-del-equipo>:8000
```

En Windows (PowerShell): `$env:MINICHAIN_HOST="0.0.0.0"; python -m server`.
Para que la red sobreviva si se cierra el servidor, agrega
`MINICHAIN_STATE_FILE=red.json`.

---

## Opción 2: Docker

La imagen compila la UI y la sirve junto con la API desde un solo proceso.

```bash
docker compose up --build        # http://localhost:8000
```

Con PostgreSQL: `docker run -e DATABASE_URL=postgresql://... -p 8000:8000 <imagen>`.

---

## Opción 3: Render + Supabase (producción gratuita)

```
celulares y PCs ──HTTPS / WebSocket──►  Render (servidor + UI)  ──Postgres──►  Supabase
```

Un solo servicio de Render sirve la interfaz y la API en la misma URL. Supabase
solo se usa como base de datos: la lógica y la validación siguen en el servidor.

### Paso 1. Crear la base de datos en Supabase

1. En [supabase.com/dashboard](https://supabase.com/dashboard), **New project**.
   - Nombre: `minichain`.
   - Región: **East US (North Virginia)** (`us-east-1`), la misma que usaremos en
     Render, para que la latencia entre ambos sea mínima.
   - **Contraseña de la base de datos**: genera una y guárdala. Supabase no la
     vuelve a mostrar (se puede restablecer en *Database → Settings*).
2. Cuando el proyecto esté listo, botón **Connect** (arriba) → pestaña
   **Connection string** → **Session pooler**. Copia la cadena, que se ve así:

   ```
   postgresql://postgres.<ref-del-proyecto>:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   ```

   Reemplaza `[YOUR-PASSWORD]` por la contraseña. Esa cadena es el valor de
   `DATABASE_URL`.

> **Por qué el *session pooler* y no la conexión directa.** En el plan gratuito,
> la conexión directa de Supabase (`db.<ref>.supabase.co`) solo funciona por IPv6,
> y Render se conecta por IPv4. El *session pooler* funciona por IPv4 y está
> pensado para un servidor que mantiene una conexión abierta, que es nuestro caso
> ([documentación](https://supabase.com/docs/guides/database/connecting-to-postgres)).

No hace falta crear tablas: el servidor las crea al arrancar.

### Paso 2. Crear el servicio en Render

> Esta parte se terminará de automatizar con un `render.yaml` en una etapa
> posterior. Estos son los pasos manuales equivalentes.

1. En [dashboard.render.com](https://dashboard.render.com), **New → Web Service**,
   y conecta el repositorio de GitHub `santie-a/criptography-ur`, rama `main`.
2. Configuración:
   - **Language / Runtime**: Docker (usa el `Dockerfile` del repositorio).
   - **Region**: **Virginia (US East)**.
   - **Instance type**: Free.
   - **Health check path**: `/api/health`.
3. **Environment variables**:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | La cadena del paso 1. Márcala como secreta. |
   | `MINICHAIN_CORS` | vacío (la UI se sirve desde el mismo dominio) |
   | `MINICHAIN_MAX_DIFFICULTY` | `18` (la CPU gratuita es lenta) |

   `PORT` lo asigna Render y el servidor lo lee solo.
4. **Create Web Service**. El primer despliegue tarda unos minutos (compila la UI
   y la imagen). Al terminar, la aplicación queda en
   `https://<nombre>.onrender.com`.
5. Comprueba `https://<nombre>.onrender.com/api/health`. Debe decir
   `"storage": {"kind": "postgres", "ok": true, ...}`.

### Paso 3. Comprobar que la red sobrevive reinicios

1. Haz una transferencia y mina un bloque desde la aplicación.
2. En Render, **Manual Deploy → Restart service** (o espera a que se duerma).
3. Al volver, `/api/health` debe decir `"restored": true` y la red debe estar igual.

En Supabase, *Table Editor → esquema `minichain`* muestra los bloques guardados.

### Antes de cada clase

| Qué | Por qué | Qué hacer |
|---|---|---|
| Render se duerme | El servicio gratuito se apaga tras 15 minutos sin tráfico y tarda alrededor de un minuto en despertar ([Render](https://render.com/docs/free)). Mientras haya alguien conectado no se apaga. | Abrir la URL unos minutos antes de empezar. |
| Supabase se pausa | Los proyectos gratuitos se pausan tras una semana sin uso ([Supabase](https://supabase.com/pricing)). | El día antes, entrar al panel de Supabase y pulsar *Restore* si está pausado. |
| Horas gratuitas | Render da 750 horas al mes por workspace: alcanza para un servicio encendido todo el mes. | Nada, salvo que haya otros servicios gratuitos en el mismo workspace. |

---

## Límites actuales

1. **Un solo proceso.** El estado se valida en memoria; el servidor corre con un
   solo *worker*. Para varias instancias habría que reemplazar `EventBus` por uno
   sobre Redis y coordinar la escritura de bloques.
2. **Todavía no hay roles.** Cualquiera con la URL puede regenerar la red, firmar
   con las billeteras de la demostración o lanzar el ataque. Es lo próximo a
   resolver (etapa 2: token de administrador).
3. **El minado y la verificación ocupan CPU.** `MINICHAIN_MAX_DIFFICULTY` limita la
   dificultad por bloque. La validación de la cadena y el análisis de firmas se
   calculan una vez por bloque nuevo y se comparten entre todos los clientes.

### Detrás de un proxy inverso propio

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

```bash
cd frontend
VITE_API_URL=https://api.ejemplo.com npm run build      # sube dist/
# en el servidor:
MINICHAIN_CORS=https://ui.ejemplo.com python -m server
```
