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
MINICHAIN_HOST=0.0.0.0 MINICHAIN_AUTOMINE=20 python -m server
# los demás abren http://<ip-del-equipo>:8000
```

En Windows (PowerShell): `$env:MINICHAIN_HOST="0.0.0.0"; $env:MINICHAIN_AUTOMINE="20"; python -m server`.

Para que el público entre, pulsa **Invitar** en el encabezado y proyecta el código
QR. Con `MINICHAIN_HOST=0.0.0.0`, el servidor adivina la IP del equipo en la red
local y la pone en el código aunque tú hayas abierto la página en `localhost`. Si
adivina mal (varias tarjetas de red, VPN), abre la página con la IP correcta o
define `MINICHAIN_PUBLIC_URL=http://<ip>:8000`. Los celulares deben estar en la
misma Wi-Fi.
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

### Paso 2. Crear el servicio en Render con el Blueprint

El archivo [`render.yaml`](../render.yaml) de la raíz describe el servicio completo
(un *Blueprint*): Docker, plan gratuito, región Virginia, chequeo de salud en
`/api/health` y estas variables:

| Variable | Valor | Quién lo pone |
|---|---|---|
| `DATABASE_URL` | La cadena del paso 1 | **Tú**, en el panel de Render (`sync: false`: nunca va al repositorio) |
| `MINICHAIN_ADMIN_TOKEN` | Aleatorio | **Render lo genera** (`generateValue: true`). Para verlo: servicio → *Environment* |
| `MINICHAIN_ENV` | `production` | El Blueprint. Si faltara el token, nadie sería administrador (en vez de todos) |
| `MINICHAIN_AUTOMINE` | `20` | El Blueprint: mina la mempool cada 20 s |
| `MINICHAIN_FAUCET` | `25` | El Blueprint: monedas de bienvenida |
| `MINICHAIN_MAX_DIFFICULTY` | `18` | El Blueprint: la CPU gratuita es lenta |

`PORT` lo asigna Render y el servidor lo lee solo. Tampoco hace falta
`MINICHAIN_PUBLIC_URL`: Render define `RENDER_EXTERNAL_URL` y el código QR de
**Invitar** la usa.

1. En [dashboard.render.com](https://dashboard.render.com), **New → Blueprint** y
   elige el repositorio `santie-a/criptography-ur`, rama `main`.
2. Render lee `render.yaml` y muestra lo que va a crear: un servicio web
   `minichain`, plan Free. Te pide el valor de `DATABASE_URL`: pega la cadena del
   paso 1.
3. **Apply**. El primer despliegue tarda unos minutos (compila la UI y la imagen).
   Al terminar, la aplicación queda en `https://minichain-<sufijo>.onrender.com`.
4. Comprueba `https://<tu-url>/api/health`. Debe decir
   `"storage": {"kind": "postgres", "ok": true, ...}` y
   `"auth": {"required": true, ..., "locked": false}`.
5. Copia el token desde *Environment → MINICHAIN_ADMIN_TOKEN* (ícono del ojo).
   Abre la aplicación, pulsa **Administrar** e ingrésalo. Debe aparecer
   "Administrador" y los botones Transferir y Minar.

Con `autoDeploy`, cada push a `main` vuelve a desplegar. Las variables que pusiste
o que generó Render no se tocan en los despliegues siguientes.

> **Sin Blueprint.** Si prefieres crear el servicio a mano (**New → Web Service**),
> usa los mismos valores: runtime Docker, región Virginia, plan Free, health check
> `/api/health` y las variables de la tabla (el token lo generas tú con
> `python -c "import secrets; print(secrets.token_urlsafe(32))"`).

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
2. **Roles.** Sin token se puede leer todo y enviar transacciones firmadas con una
   clave propia; todo lo demás requiere `MINICHAIN_ADMIN_TOKEN`. Detalle en
   [Roles](CONECTAR_UI.md#roles). Las escrituras públicas tienen un límite por IP
   (`MINICHAIN_RATE_LIMIT`).
3. **El minado y la verificación ocupan CPU.** `MINICHAIN_MAX_DIFFICULTY` limita la
   dificultad por bloque. La validación de la cadena y el análisis de firmas se
   calculan una vez por bloque nuevo y se comparten entre todos los clientes. El
   minado automático solo mina cuando hay transacciones pendientes.
4. **Monedas de bienvenida.** Salen del saldo de Minera. Si muchas personas se unen
   a la vez y Minera se queda sin saldo disponible, el registro funciona igual y la
   página ofrece **Pedir 25** para intentarlo después del siguiente bloque (cada
   bloque le da 50 a Minera).

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
