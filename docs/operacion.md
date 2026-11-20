# Operación del portal en producción

Manual para quien mantiene `portal.inoo.pe`. Al 18 nov 2026 el portal está en producción desde el 6 nov,
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
| Videos de los tableros | Mismo Drive, carpeta «Videos de proyectos» › Empresa › Proyecto | Los sube el navegador directo a Google (sección 6 bis) |
| Respaldos | `infra/hostinger/respaldos` en el VPS (14 días) y Drive («Respaldos del portal», últimos 30) | `infra/hostinger/respaldo/respaldar.mjs` |
| Correo | Gmail SMTP de `asesoria@inoo.pe` (clave de aplicación «Portal») | El despachador del outbox manda los correos |

## 2. Cómo entra la gente

- **Equipo:** con su usuario y contraseña de InooWork (`AUTH_EQUIPO=inoowork`). También desde InooWork con
  «Portal de Inoo», que manda un pase de 60 s y un solo uso. La contraseña se cambia en InooWork.
- **Clientes:** correo y contraseña propios del portal (`AUTH_MODO=portal`). La crean con un enlace de un solo
  uso que el equipo copia desde la ficha del cliente («Copiar enlace»).
- **Invitados de afuera (17 nov):** un cliente o freelancer entra con el enlace de invitados de un tablero
  (Personas → «Para invitados de afuera»), crea su cuenta con su correo y su contraseña y solo ve los tableros
  donde lo invitaron. Usuarios `tipo = 'INVITADO'`; para todo lo de clientes son como un cliente sin cuentas.
- **2FA (16 nov):** opcional para todos, en Mi cuenta. App autenticadora (TOTP), códigos de respaldo y
  dispositivos de confianza por 30 días.
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

Si algo falla, `-1` deshace todo y la base queda como estaba. **Al 20 nov la producción tiene hasta la 0070.**
Los respaldos previos quedan como `/opt/inoo/respaldos/antes-00NN-AAAAMMDD-HHMM.sql`.

El CI (`.github/workflows/ci.yml`, job `base-de-datos`) aplica todas las migraciones de la carpeta en orden
sobre un Postgres 16 limpio, carga las semillas y corre `database/pruebas/comprobaciones.sql`: una migración que
no aplica en una base nueva falla ahí antes de llegar a producción.

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
- **Conexiones personales (0050, Calendar desde el 18 nov):** cada persona conecta su propia cuenta de Google (la
  que quiera, también un Gmail) desde Jarvis → Conectores, Mi cuenta o el Calendario.
  - **Google Drive** (solo lectura): sus bots lo usan en sus chats con `drive_buscar` y `drive_leer` del MCP.
  - **Google Calendar** (`calendar.events`): sus reuniones de Google se ven en su calendario del portal, y los
    eventos que agenda en el portal se copian a su Google (y se cambian o borran allá; `evento_agenda.google_id`).
    Jarvis todavía no tiene herramientas de agenda (pendiente).
  - Nadie copia llaves: el portal guarda solo el permiso, cifrado, y se puede desconectar.
  - **Para activarlo** (en espera de los correos del equipo, 18 nov):
    1. En el proyecto «Portal Inoo» de Google Cloud, pasar la pantalla de consentimiento a **Externo** (en modo
       «Prueba») y agregar como usuarios de prueba (hasta 100) los correos de quienes vayan a conectar.
    2. Habilitar las API de Drive y de Calendar y agregar los alcances `drive.readonly` y `calendar.events`.
    3. Crear un cliente OAuth de tipo **Aplicación web** con las URI
       `https://portal.inoo.pe/api/v1/conexiones/google-drive/vuelta` y
       `https://portal.inoo.pe/api/v1/conexiones/google-calendar/vuelta`.
    4. Poner `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` en el `.env` (y en `/opt/inoo/produccion.env`)
       y reiniciar el portal. `PORTAL_URL` ya llega por el `docker-compose.yml`.
    5. Para Drive en Jarvis: copiar `integrations/hermes/mcp-portal.mjs` a `/home/hermes/inoo/` y reiniciar Hermes.
  - En modo «Prueba», Google muestra «app no verificada» (Avanzado → Continuar) y el permiso vence a los 7 días:
    hay que volver a conectar. Para que no venza, Google tiene que verificar la app.
- **Bóveda personal (0051):** nada que configurar más allá de `SESION_SECRETO` (o `BOVEDA_SECRETO`). Nadie de TI
  puede abrir una bóveda: si alguien olvida su clave, la borra desde «Olvidé mi clave». Reiniciar el portal cierra
  las bóvedas abiertas (Jarvis deja de poder leerlas hasta que la persona la vuelva a abrir). Para que Jarvis la
  use, el Hermes necesita el MCP 0.4.0 (`integrations/hermes/mcp-portal.mjs`).
- **Jarvis en Chrome (0066, 18 nov):** la extensión 2.0.0 (`extensiones/jarvis-chrome`, se descarga desde
  `/descargas/jarvis-chrome.zip`) vive en el panel lateral de Chrome. La persona la vincula con un código de un
  solo uso que genera en Jarvis → Conectores → Jarvis en Chrome. La extensión recibe una llave `nv_…` que el portal
  guarda solo como hash (`navegador_vinculo`) y que sirve solo para `/navegador/*`, `/jarvis/*`, `/me/jarvis/*` y
  `/me`.
  - **Cómo corre una acción:** el bot pide la acción con las herramientas `navegador_*` del MCP. El portal la deja
    pendiente (`navegador_accion`) y el panel la toma cada 1,5 s y la hace en la pestaña que la persona está viendo
    (o en la que fijó en el panel). Jarvis puede cambiar de pestaña y abrir una nueva; sirve desde cualquier chat. El MCP espera la
    respuesta hasta 45 s. Una acción vence a los 3 minutos.
  - **Requisitos:** solo funciona con el panel abierto; el portal lo da por conectado si habló hace menos de 90 s.
  - **Permisos** (como Claude in Chrome): se eligen en el panel, por defecto «Aprobar cada acción».
  - **Lo prohibido** se rechaza en el portal y en la extensión: comprar, crear cuentas, tarjetas o documentos de
    identidad, y páginas internas.
  - **Sitios del equipo:** los bloqueados o «solo estos» los pone un super usuario (`navegador_regla`).
  - **Para activarlo:** respaldo y migración 0066. Después se copia `integrations/hermes/mcp-portal.mjs` (0.6.1) a
    `/home/hermes/inoo/` y se reinicia Hermes. Quien tenga la extensión vieja reemplaza la carpeta y toca
    «Actualizar» en `chrome://extensions`.
- **Rutinas y automatizaciones:** las corre `inoo-jarvis.timer`. Cada ejecución la paga quien la creó, su
  respuesta queda como un chat del bot (`job-<id>`) y se avisa en la campana. Si el Hermes del área no está
  conectado o el área llegó a su tope, la ejecución queda «Falló» con el motivo.

## 6 bis. Archivos y videos de los tableros

- **Archivos** (columna «Archivos»): hasta 50 MB, pasan por el portal y quedan en Drive (`tableros/<proyecto>/…`)
  con versiones y comentarios (también anclados a un punto de una imagen o a un segundo de un video). Quien
  escribió un comentario lo corrige o lo borra; un admin también lo borra (0064).
- **Videos** (18 nov): el navegador los sube **directo a Google**, sin pasar por el servidor, hasta 5 GB. El portal
  abre una subida reanudable con la cuenta de `asesoria@inoo.pe` (y el `Origin` de `PORTAL_URL`) en
  «Videos de proyectos» › Empresa › Proyecto; las carpetas se crean solas y se renombran si cambia el proyecto.
  Al terminar, el video entra a la celda (`archivo_tablero.clave = 'drive:<id>'`). Se mira en el portal por tramos
  (`Range`) con un enlace firmado de 4 horas (`/api/v1/videos-tablero/{token}`), así que se puede comentar y nadie
  necesita permisos en Drive. Al quitarlo de la celda va a la papelera de Drive (30 días para recuperarlo).
- Todavía no se probó una subida real a Drive desde el navegador (en local se simula). Si Google rechazara la
  subida directa (CORS), el error sale al usuario como «No se pudo subir el video».

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

## 9. Pendientes de operación (18 nov 2026)

- **Google Calendar y Drive personales:** juntar los correos de Google del equipo y seguir la sección 6
  (cliente OAuth web, «Externo» con usuarios de prueba y las dos variables).
- **Videos:** subir un video real a un tablero para confirmar la subida directa a Drive.
- **Jarvis con la agenda:** herramientas para ver la agenda y proponer eventos (pendiente acordado el 18 nov).
- **Textos legales:** borrador de privacidad y términos en revisión; no se publican hasta tener el visto bueno.
- Publicar el APK nuevo de InooWork.
