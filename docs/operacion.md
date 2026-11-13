# Operación del portal en producción

Manual para quien mantiene `portal.inoo.pe`. Al 9 nov 2026 el portal está en producción desde el 6 nov,
con usuarios reales: **respaldar antes de tocar datos** y no hacer pruebas destructivas en el servidor.
Ninguna clave va en este documento ni en el repositorio: se dice en qué archivo vive cada una.

## 1. Dónde vive cada cosa

| Pieza | Dónde | Notas |
|---|---|---|
| Portal (Next.js 15 standalone) + Postgres | VPS KVM 1 de Hostinger (`179.66.130.29`), en `/opt/inoo/oficina-virtual` | Docker Compose en `infra/hostinger`, proyecto `inoo-fase1`. Caddy sirve `portal.inoo.pe` con HTTPS |
| Secretos del portal | `/opt/inoo/oficina-virtual/infra/hostinger/.env` (solo en el VPS) | Plantilla sin valores en `infra/hostinger/.env.example` |
| Jarvis (Hermes, un perfil por área) | Mismo VPS, `/home/hermes/inoo/` (MCP del portal en `mcp-portal.mjs`) | El portal lo encuentra con `JARVIS_HERMES` |
| n8n y NocoDB | VPS aparte (`76.13.226.162`) | Siguen detrás de la clave de Caddy |
| InooWork (`intranet.inoo.pe`) | Hosting compartido de Hostinger | El portal usa su login (`AUTH_EQUIPO=inoowork`) y su API (`INOOWORK_URL`, `INOOWORK_API_KEY`) |
| Archivos | Google Drive de `asesoria@inoo.pe` (carpeta «Portal Inoo») | Sin AWS por ahora. Variables `DRIVE_*` |
| Respaldos | `infra/hostinger/respaldos` en el VPS (14 días) y Drive («Respaldos del portal», últimos 30) | `infra/hostinger/respaldo/respaldar.mjs` |
| Correo | Gmail SMTP de `asesoria@inoo.pe` (clave de aplicación «Portal») | El despachador del outbox manda los correos |

## 2. Cómo entra la gente

- **Equipo:** con su usuario y contraseña de InooWork (`AUTH_EQUIPO=inoowork`). También desde InooWork con
  «Portal de Inoo», que manda un pase de 60 s y un solo uso. La contraseña se cambia en InooWork.
- **Clientes:** correo y contraseña propios del portal (`AUTH_MODO=portal`). La crean con un enlace de un solo
  uso que el equipo copia desde la ficha del cliente («Copiar enlace»).
- **Super usuarios:** Ernesto Vasquez Rojas y Omar Suyo. Solo ellos cambian niveles, permisos, quién es ADMIN,
  qué áreas lidera cada persona y los conectores de Jarvis.
- **Cuenta de pruebas:** `pruebas@inoo.pe` abre `/pruebas` para entrar como cualquier usuario de prueba. Sus
  datos están separados por RLS (ver `docs/entorno-de-pruebas.md`). Su contraseña la pone un super usuario con
  el botón «Cuenta de pruebas» en Equipo.

## 3. Publicar una versión nueva

Desde una terminal con acceso al VPS (la llave SSH del equipo de TI o la terminal del navegador de hPanel):

```bash
cd /opt/inoo/oficina-virtual && git pull && cd infra/hostinger \
  && docker compose -p inoo-fase1 up -d --build --no-deps portal
```

Tarda de 3 a 5 minutos. Después, comprobar:

```bash
docker ps --filter name=portal --format '{{.Names}} | {{.Status}} | {{.CreatedAt}}'   # «healthy» y fecha nueva
curl -s -o /dev/null -w '%{http_code}\n' https://portal.inoo.pe/ingresar           # 200
```

Si el commit trae una migración nueva, se aplica **antes** de reconstruir (sección 4).

## 4. Migraciones de base de datos

Las migraciones están en `database/migraciones/`, numeradas, y se aplican **una sola vez y en orden**. Una base
nueva las corre todas al crearse (`docker-compose.yml` las monta en `docker-entrypoint-initdb.d`). En la base
de producción se aplican a mano, siempre con respaldo previo y en una sola transacción:

```bash
cd /opt/inoo/oficina-virtual/infra/hostinger
docker compose -p inoo-fase1 exec -T postgres pg_dump -U inoo -Fc oficina_virtual > /opt/inoo/respaldos/antes-00NN.dump
docker compose -p inoo-fase1 exec -T postgres psql -U inoo -d oficina_virtual -1 -v ON_ERROR_STOP=1 \
  < ../../database/migraciones/00NN_nombre.sql
```

Si algo falla, `-1` deshace todo y la base queda como estaba. **Al 9 nov la producción tiene hasta la 0049**; la 0050
(conexiones personales) va con su versión.

## 5. Procesos programados

Viven en `infra/hostinger/trabajos/` y se instalan (o actualizan) con un solo comando, que se puede repetir:

```bash
bash /opt/inoo/oficina-virtual/infra/hostinger/trabajos/instalar.sh
```

El instalador crea la llave de servicio `trabajos-diarios` sin mostrarla (queda en `/opt/inoo/trabajos/llave`,
solo para root), le da los scopes que necesita y activa dos timers de systemd:

| Timer | Cuándo | Qué hace |
|---|---|---|
| `inoo-diarios.timer` | Todos los días a las 6:00 de Lima | Atrasos de requerimientos, recordatorios (tareas, requerimientos y reuniones), standby por inactividad, etapas del mes y archivar los tableros de InooWork culminados hace 14 días. Repetirlo el mismo día no duplica nada |
| `inoo-jarvis.timer` | Cada 10 minutos | Pone en cola las rutinas de Jarvis que tocan y corre hasta 5 rutinas o automatizaciones pendientes (`/integraciones/jarvis/ejecutar`) |

Para revisarlos: `systemctl list-timers 'inoo-*'` y `journalctl -u inoo-diarios.service -n 20` (o
`inoo-jarvis.service`). Instalados el 9 nov.

## 6. Jarvis

- Cada área tiene su Hermes. El portal lo encuentra con `JARVIS_HERMES` (JSON por área con `url` y `clave`).
  Un área sin entrada ve sus bots, pero no puede chatear.
- Nadie del equipo maneja llaves: la pasarela `/api/v1/ia-equipo` cobra a la persona por la marca de la
  conversación. Los topes por área se cambian en «Costos de IA».
- **Mis herramientas (0057, 13 nov):** cada persona arma su Jarvis en Jarvis → Mis herramientas. Activa skills del
  catálogo (`skill_catalogo`), escribe las suyas y conecta servicios MCP remotos (`conector_catalogo`) con su cuenta.
  Nada viene activado de base. El bot recibe solo la lista (nombre y para qué sirve) y lee cada skill con
  `skill_leer`. Usa los servicios con `conector_herramientas` y `conector_usar`: el portal hace de puente y llama al
  servidor MCP con el token de la persona, guardado cifrado. En el VPS no se instala nada por persona. Necesita el
  MCP 0.5.0 (`integrations/hermes/mcp-portal.mjs` copiado a `/home/hermes/inoo/` y Hermes reiniciado).
  - **Catálogo de skills:** se genera con `apps/portal/scripts/skills-a-sql.mjs`, a partir de los repos públicos de
    Skillfera clonados en una carpeta (la lista de fuentes está en el script). El script imprime el SQL, que se
    carga con `psql -1`. Es idempotente y no toca las skills propias.
  - **Conectores nuevos:** por ahora se agregan con un `INSERT INTO conector_catalogo` (solo `https`, sin
    credenciales). Siguen el modelo de los de la migración 0057.
- **Conectores (MCP) del área:** el portal guarda solo el catálogo. Un super usuario lo agrega en Jarvis → Conectores y
  queda «Falta conectarlo». TI configura el servidor MCP y su credencial en el Hermes del área y lo marca
  «Conectado». Desde ahí los bots que lo tengan activo lo usan. El portal rechaza llaves o tokens en sus campos.
- **Conexiones personales (0050):** cada persona conecta su propia cuenta en Mi cuenta → Conexiones (por ahora,
  Google Drive en solo lectura) y sus bots la usan solo en sus chats, con las herramientas `drive_buscar` y
  `drive_leer` del MCP. Nadie copia llaves: el portal guarda el permiso cifrado y se puede desconectar. Para
  activarlo: (1) en el proyecto «Portal Inoo» de Google Cloud, crear un cliente OAuth de tipo Aplicación web con la
  URI `https://portal.inoo.pe/api/v1/conexiones/google-drive/vuelta`, habilitar la API de Drive y agregar el
  alcance `drive.readonly`; (2) poner `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` en el `.env` y
  reconstruir el portal; (3) copiar `integrations/hermes/mcp-portal.mjs` a `/home/hermes/inoo/` y reiniciar Hermes.
  Con el público «Interno» solo entran cuentas de `inoo.pe`; para cuentas de Gmail hay que pasar a «Externo» y
  agregarlas como usuarios de prueba (hasta 100) mientras Google no verifique la app.
- **Bóveda personal (0051):** nada que configurar más allá de `SESION_SECRETO` (o `BOVEDA_SECRETO`). Nadie de TI
  puede abrir una bóveda: si alguien olvida su clave, la borra desde «Olvidé mi clave». Reiniciar el portal cierra
  las bóvedas abiertas (Jarvis deja de poder leerlas hasta que la persona la vuelva a abrir). Para que Jarvis la
  use, el Hermes necesita el MCP 0.4.0 (`integrations/hermes/mcp-portal.mjs`).
- **Rutinas y automatizaciones:** las corre `inoo-jarvis.timer`. Cada ejecución la paga quien la creó, su
  respuesta queda como un chat del bot (`job-<id>`) y se avisa en la campana. Si el Hermes del área no está
  conectado o el área llegó a su tope, la ejecución queda «Falló» con el motivo.

## 7. Respaldos

El servicio `respaldo` del Compose hace un `pg_dump` diario en `infra/hostinger/respaldos` (se guardan 14 días) y
sube una copia a Drive, a «Respaldos del portal» (se guardan los últimos 30). Antes de cada migración se hace uno a mano (sección 4).

Para restaurar en una base aparte y revisar: `pg_restore -d <base_de_prueba> <archivo>.dump`. Nunca restaurar
encima de producción sin respaldar primero lo que haya.

## 8. Qué revisar después de un cambio

1. `docker ps`: el contenedor `inoo-fase1-portal-1` en «healthy» y con la fecha nueva.
2. `https://portal.inoo.pe/ingresar` responde 200.
3. Entrar con un usuario del equipo y abrir Mi panel, Proyectos y Jarvis.
4. Si hubo migración: que no haya errores en `docker logs inoo-fase1-portal-1 --since 10m`.

## 9. Pendientes de operación (9 nov 2026)

- Publicar el APK nuevo de InooWork y luego pasar su API a `estricto: true`.
- Google Calendar real: en espera de que el equipo tenga cuentas de Gmail propias.
