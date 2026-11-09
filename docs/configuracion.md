# Configuración

Guía para levantar el portal y el entorno de pruebas, y para preparar la Fase 1 en Hostinger.

## 1. Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22 o superior | Portal, pruebas, scripts |
| npm | 10 o superior | Dependencias (workspaces) |
| Docker + Compose v2 | 24 o superior | Entorno completo y Fase 1 |
| Navegadores de Playwright | `npx playwright install chromium` | Pruebas de interfaz |

## 2. Portal sin Docker

```bash
cd apps/portal
cp .env.example .env.local     # opcional; los valores por defecto sirven
npm install
npm run dev                    # http://localhost:3000
```

El portal sirve la interfaz y también `/api/v1`. Con `API_MODO=mock` (por defecto) la API responde
desde memoria con los datos de Figma; cada reinicio del servidor vuelve a los datos iniciales, y
`POST /api/v1/__pruebas/reiniciar` hace lo mismo sin reiniciar.

### Variables de entorno del portal

| Variable | Valores | Por defecto | Efecto |
|---|---|---|---|
| `API_MODO` | `mock`, `proxy` | `mock` | `mock`: API simulada en memoria. `proxy`: reenvía `/api/v1/*` a `API_URL_BACKEND` |
| `API_URL_BACKEND` | URL | — | Destino del proxy (Prism en `http://localhost:4010` o el backend real) |
| `MOCK_LATENCIA_MS` | número | `0` | Retraso artificial de cada respuesta simulada, para ver estados de carga |
| `PERMITIR_MOCK` | `true`, `false` | `false` | En un build de producción la API simulada responde 404 salvo que sea `true` (solo contenedores de prueba) |
| `NAVEGADOR_MODO` | `simulado`, `real` | `simulado` | Taller web (fase 19): `real` saca capturas de verdad y arma el PDF con Chromium (Playwright). En `simulado`, capturas de relleno y el informe en HTML |
| `CHROMIUM_PATH` | ruta | — | Chromium del sistema. La imagen Docker (Alpine) usa el de `apk`; en local basta `npx playwright install chromium` |
| `STITCH_API_KEY` | clave | — | Prototipo con Stitch (MCP de Google). Solo se usa con `IA_MODO=real`; sin clave, pantallas de relleno. No es la clave de Gemini |
| `STITCH_URL` | URL | `https://stitch.googleapis.com/mcp` | Servidor MCP de Stitch |
| `DEEPSEEK_API_KEY` | clave | — | Jarvis del equipo (30 oct): la clave de Inoo para DeepSeek. Solo la usa la pasarela `/api/v1/ia-equipo`; los Jarvis (Hermes) entran con su llave personal y nunca ven esta clave. Sin ella, la pasarela responde 503 `SIN_CLAVE` |
| `DEEPSEEK_KEYS` | JSON | — | Opcional (2 nov): una clave de DeepSeek por área, `{"CRM": "sk-…"}`, para ver el consumo de cada área en el panel de DeepSeek. Las áreas sin clave usan `DEEPSEEK_API_KEY` |
| `IA_EQUIPO_URL` | URL | `https://api.deepseek.com` | A dónde reenvía la pasarela (las pruebas usan un DeepSeek falso) |
| `JARVIS_HERMES` | JSON | — | El Hermes de cada área, donde corren sus bots: `{"CRM": {"url": "http://127.0.0.1:8642", "clave": "…"}}`. La clave es la `API_SERVER_KEY` de ese Hermes y también su `OPENAI_API_KEY` para entrar a la pasarela `/ia-equipo` (nadie del equipo genera llaves: la pasarela cobra a la persona por la marca de la conversación). Un área sin entrada ve sus bots pero no puede chatear (409 `JARVIS_NO_CONECTADO`) |

> La API simulada nunca debe quedar activa en un despliegue real. Por eso un build de producción
> la bloquea si no se activa `PERMITIR_MOCK=true` explícitamente.

### Scripts (`apps/portal`)

| Script | Qué hace |
|---|---|
| `npm run dev` / `build` / `start` | Next.js en desarrollo, build `standalone`, servidor de producción |
| `npm run typecheck` | TypeScript estricto |
| `npm run test:api` | Pruebas del contrato sobre la API simulada (no necesitan servidor) |
| `npm run test:e2e` | Flujos de interfaz con Playwright (levanta `npm run dev` si no hay `BASE_URL`) |
| `npm run test:visual` | Regresión visual de las 16 pantallas |
| `npm run mock` | Solo la API simulada en `http://localhost:4000/api/v1` (Postman, n8n) |
| `npm run vista-previa` | Versión estática sin Next.js en `dist-vista-previa/` (revisión de diseño) |
| `npm run db:semillas` | Regenera `database/semillas/0001_casa_oliva.sql` desde `src/mock/datos.ts` |

## 3. Entorno completo con Docker (`infra/local`)

```bash
cd infra/local
cp .env.example .env
docker compose up --build            # agrega -d para dejarlo en segundo plano
docker compose --profile fase1 up    # además n8n y NocoDB
```

| Servicio | URL / puerto | Credenciales | Sustituye a |
|---|---|---|---|
| Portal | http://localhost:3000 | ver usuarios de prueba | Portal en ECS/Amplify |
| Prism (contrato completo) | http://localhost:4010 | `Authorization: Bearer cualquiera` | Backend `/api/v1` |
| Postgres 16 | localhost:5432 | `inoo` / `inoo`, base `oficina_virtual` | RDS |
| Mailpit | http://localhost:8025 (SMTP 1025) | — | Amazon SES |
| MinIO | http://localhost:9001 (API 9000) | `inoo` / `inoo-minio-123` | S3 (bucket `inoo-contenido-clientes`) |
| n8n (perfil `fase1`) | http://localhost:5678 | se crea al primer ingreso | n8n en VPS/ECS |
| NocoDB (perfil `fase1`) | http://localhost:8080 | se crea al primer ingreso | Panel interno Fase 1 |

Postgres ejecuta las migraciones de `database/migraciones/` (0001 a 0049) y luego `database/semillas/0001_casa_oliva.sql`
**solo la primera vez** que se crea el volumen. Para volver a empezar: `infra/local/reiniciar-base.sh`.

### Probar el backend real en local (base, archivos, correos y n8n)

1. En `infra/local/.env`: `API_MODO=db`.
2. `docker compose --profile fase1 up --build -d postgres prism portal mailpit minio minio-bucket n8n outbox`
   (si la base ya existía de antes, `./reiniciar-base.sh` para que corran las migraciones nuevas).
3. Portal en http://localhost:3000 con los usuarios de prueba (clave `demo1234`): `valeria@casaoliva.pe`
   (cliente), `diego.castro@inoo.pe` (equipo). Los archivos van a MinIO y se ven en http://localhost:9001.
4. n8n en http://localhost:5678: crear la cuenta, importar los dos JSON de `n8n/workflows/comunes`
   y crear las credenciales «Portal Inoo · X-Api-Key» (Header Auth `X-Api-Key` = `demo-n8n`) y
   «SMTP Inoo» (host `mailpit`, puerto `1025`, sin SSL ni usuario). Activar `atrasos-requerimientos`; `correos-por-evento`
   solo si se usa `CORREOS_POR=n8n` (por defecto los correos los manda el portal).
5. Cada acción del portal (pedir cambios, abrir un ticket, invitar a alguien, enviar un entregable) pasa por el
   despachador (`outbox`), que manda el correo por SMTP a Mailpit (http://localhost:8025); también queda en
   Cuenta → Correos automáticos. Con `CORREOS_POR=n8n`, en cambio, el correo lo manda el workflow de n8n.

Para que el portal hable con Prism en vez de la API simulada: `API_MODO=proxy` en `infra/local/.env`.
Prism responde con los ejemplos del contrato (útil para probar que la interfaz tolera respuestas válidas
distintas a las de Figma).

## 4. Producción en el VPS de Hostinger (`infra/hostinger`)

El portal corre en producción en `portal.inoo.pe` desde el 6 nov 2026. **La operación diaria (publicar, migraciones,
procesos programados, respaldos, Jarvis) está en `docs/operacion.md`.** Para montar un VPS desde cero:

1. Apuntar los subdominios al VPS (`portal.inoo.pe`; n8n y NocoDB viven en otro VPS).
2. Clonar el repositorio en `/opt/inoo/oficina-virtual`, `cd infra/hostinger`, `cp .env.example .env` y completar
   los secretos (los que se generan, con `openssl rand` como indica el archivo).
3. `docker compose -p inoo-fase1 up -d`. Caddy obtiene los certificados HTTPS. Una base nueva corre todas las
   migraciones al crearse.
4. Importar al equipo desde InooWork (botón en «Equipo») y marcar a los super usuarios.
5. Conectar Google Drive (`node integrations/google/conectar.mjs drive`) y el SMTP.
6. Instalar los procesos programados: `bash infra/hostinger/trabajos/instalar.sh`.
7. Respaldos: el servicio `respaldo` deja un `pg_dump` diario (14 días en el VPS, los últimos 30 en Drive).

**Antes de conectar InooWork (INO-00):** desplegar el parche de seguridad en `intranet.inoo.pe`,
cambiar la contraseña de admin expuesta en el historial y usar la API key solo por header `x-api-key`.

## 5. Backend real (`API_MODO=db`)

El backend vive dentro del portal (`src/servidor/`, decisión 1 de la arquitectura) y usa el mismo
Postgres del esquema. Las reglas no se duplican en TypeScript: los cambios de estado pasan por
`cambiar_estado_pieza()`, la visibilidad la garantiza RLS (cada transacción corre como el rol
`app_portal` con `app.usuario_tipo` y `app.cliente_ids`) y cada cambio deja su evento en `outbox_evento`.

**Estado (9 nov 2026).** Todo el contrato está implementado contra la base y corre en producción desde el 6 nov.
La única parte a medias es la sincronización que manda InooWork (`POST /integraciones/inoowork/sincronizacion`):
recibe personas (empleados y empleados eliminados), y para proyectos y tickets responde `501 RUTA_NO_IMPLEMENTADA`;
los tableros de InooWork se leen directo de su API. Cada ruta tiene la misma forma que la API simulada y las suites compartidas de
`tests/api/flujo-*.ts` corren contra las dos. `Idempotency-Key` se guarda en la tabla `idempotencia`.

| Variable | Valores | Efecto |
|---|---|---|
| `DATABASE_URL` | URL de Postgres | Base con todas las migraciones de `database/migraciones/` aplicadas, en orden |
| `AUTH_MODO` | `demo`, `cognito` | `demo`: token `demo.<usuario_id>` (bloqueado en producción salvo `PERMITIR_AUTH_DEMO=true`). `cognito`: JWT de los dos pools, verificado con su JWKS |
| `COGNITO_REGION`, `COGNITO_POOL_EQUIPO`, `COGNITO_POOL_CLIENTES`, `COGNITO_CLIENT_IDS` | | Pools y apps de Cognito; el `sub` se busca en `usuario.cognito_sub` |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRETO` | | Destino y secreto del despachador del outbox (`npm run outbox`) |
| `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | | Bucket de archivos de clientes. El navegador sube y descarga con URLs prefirmadas (15 min); sin estas variables las subidas responden `503 ALMACEN_NO_CONFIGURADO` |
| `DRIVE_CLIENT_ID`, `DRIVE_CLIENT_SECRET`, `DRIVE_REFRESH_TOKEN`, `DRIVE_CARPETA_ID` | | Archivos en Google Drive, si no hay `S3_BUCKET`. Se conectan con `node integrations/google/conectar.mjs drive`; el correo, con `... smtp`. Sin `DRIVE_CARPETA_ID`, crea la carpeta «Portal Inoo». El navegador sube y descarga por el portal con URLs firmadas de 15 min, hasta 250 MB por archivo |
| `S3_ENDPOINT`, `S3_ENDPOINT_PUBLICO` | URL | Solo MinIO: `http://minio:9000` y la URL que ve el navegador (`http://localhost:9000`). En AWS se dejan vacías |
| `PORTAL_URL` | URL | Base de los enlaces de los correos automáticos (p. ej. `https://portal.inoo.pe`) |
| `AUTH_MODO` = `portal` | | Desde el 5 nov, en producción: los clientes entran con correo y contraseña propios (hash scrypt en `usuario.clave_hash`) y la crean con un enlace de un solo uso |
| `AUTH_EQUIPO` | `inoowork` | El equipo entra con su usuario y contraseña de InooWork (`POST /api/login` de InooWork). Necesita `INOOWORK_URL` y `SESION_SECRETO` |
| `SESION_SECRETO` | 32 caracteres o más | Firma las sesiones del portal y las URLs temporales de Drive. Sin él, ingresar responde 503 |
| `INOOWORK_URL`, `INOOWORK_API_KEY` | URL, clave | API de InooWork (`https://intranet.inoo.pe`); la clave va en el header `x-api-key` (parche INO-00). Sin URL, la conexión se simula |
| `INOOWORK_SYNC_MINUTOS` | número | `60`. Cada cuánto el portal trae las personas de InooWork, con el propio uso del portal; `0` la apaga |
| `CORREOS_POR` | `portal`, `n8n` | `portal` (por defecto): el despachador manda los correos por SMTP. `n8n`: se los entrega a n8n |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SEGURO`, `SMTP_USUARIO`, `SMTP_CLAVE`, `CORREO_REMITENTE` | | Servidor de correo. En producción, Gmail SMTP de `asesoria@inoo.pe` con una clave de aplicación |
| `IA_MODO` | `simulado`, `real` | `simulado` (por defecto): el taller web, Stitch y las transcripciones responden de relleno. `real`: llaman a los modelos |
| `IA_TOPE_DIARIO_USD` | número | `2`. Tope diario de gasto de esos modelos en todo el sistema; al llegar, vuelven a simulado. No aplica a Jarvis, que tiene topes por área |
| `GEMINI_API_KEY`, `GEMINI_MODELO` | clave, modelo | Gemini Flash para casi todo (por defecto `gemini-flash-latest`) |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODELO` | clave, modelo | Claude para razonamiento y prototipos del taller web |
| `N8N_URL` | URL | Enlace a cada ejecución de n8n en «Costos de IA» |
| `PERMITIR_AUTH_DEMO`, `CLAVE_DEMO` | `true`; texto | Solo entornos de prueba: tokens `demo.<id>` y la clave única de los usuarios demo (`demo1234`). Nunca en producción |
| `NEXT_PUBLIC_FECHA_FIJA` | `AAAA-MM-DD` | Fija «hoy» en la fecha de los datos de prueba (pruebas visuales) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | | Conexiones personales de Jarvis (9 nov): cliente OAuth de tipo **Aplicación web** (no el de escritorio de Drive) con la URI de redirección `{PORTAL_URL}/api/v1/conexiones/google-drive/vuelta` y el alcance `drive.readonly`. Sin ellas, «Conectar» sale como no disponible |
| `CONEXIONES_SECRETO` | 32 caracteres o más | Opcional: cifra los permisos de las conexiones (AES-256-GCM). Si falta, se deriva de `SESION_SECRETO`; cambiar cualquiera de los dos obliga a reconectar |

**Taller web (fase 19).** `GET|PUT /servicios-contratados/{id}/taller-web` y sus pasos (`capturas`, `analisis`,
`flujograma`, `documento`, `prototipo`, `demos`) están implementados contra la base (migración `0021_taller_web.sql`).
Las reglas viven en `src/servidor/taller-web.ts` y las comparten la API simulada y Postgres. Los archivos generados
(capturas, pantallas, informe y demos) se guardan por ahora en `archivo_generado` (bytea) y se sirven por token en
`/api/v1/publico/{token}` y `/demo/{token}`, sin sesión. Los archivos de los clientes ya usan S3 (`src/servidor/almacen.ts`);
pasar también los del taller queda pendiente.
Algunos sitios (por ejemplo, los que están detrás de Akamai) bloquean las capturas automáticas: el taller no lo
esquiva, avisa y deja calificar esa referencia a mano.

**Despachador del outbox.** `npm run outbox` hace dos cosas con los eventos pendientes:
- **Correos** (`CORREOS_POR=portal`, por defecto): arma los correos de cada evento y los manda por SMTP
  (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SEGURO`, `SMTP_USUARIO`, `SMTP_CLAVE`, `CORREO_REMITENTE`). Cada correo
  queda ENVIADO o FALLIDO; si falla, el evento se reintenta con espera exponencial (24 h) sin repetir lo que ya salió.
  Los correos al cliente solo salen en el horario de atención de Inoo (L-V 9:00-18:00 y sábado 9:00-13:30, hora de
  Lima, sin feriados ni días no laborables); fuera de ese horario esperan a la siguiente apertura. Los avisos al
  equipo salen al momento. La regla está en `src/dominio/calendario.ts`.
- **n8n** (opcional, `N8N_WEBHOOK_URL`): le entrega los eventos en orden y firmados (`X-Inoo-Firma` = HMAC-SHA256
  de `<X-Inoo-Timestamp>.<cuerpo>`) para las demás automatizaciones, con los mismos reintentos.
Correrlo como segundo proceso del contenedor del portal o como tarea programada.

**Pruebas.** `npm run test:api` corre el flujo de piezas contra la API simulada y contra Postgres 16 en
proceso (PGlite, sin Docker), con RLS activo, y prueba el despachador. En CI, el job `base-de-datos` además
aplica las migraciones en un Postgres real.

**Bucket S3.** Necesita CORS que permita `PUT` y `GET` desde el dominio del portal con la cabecera
`Content-Type`, y una regla de ciclo de vida que borre los objetos de archivos marcados `ELIMINADO`
(el portal hace borrado lógico). La llave de AWS solo necesita `s3:PutObject`, `s3:GetObject` y `s3:ListBucket` (para el `HEAD`).

**Correos automáticos.** Por defecto los manda el propio portal (despachador, `CORREOS_POR=portal`). Con
`CORREOS_POR=n8n`, el despachador entrega cada evento a n8n (`n8n/workflows/comunes/correos-por-evento.json`),
que pide al portal los correos ya armados (`POST /integraciones/correos/preparar`), los manda por SMTP y devuelve
el resultado; con `CORREOS_POR=portal` esa ruta responde 409 para que no salgan dobles. Reglas en `regla_correo` (una fila con `cliente_id` reemplaza a la global), textos en
`src/dominio/correos.ts`. La llave de n8n necesita los scopes `correos:write`, `requerimientos:write` y `servicios:write`.

**Ingreso con Cognito.** La pantalla de ingreso usa `POST /sesion/ingresar`. Con `AUTH_MODO=cognito` el portal
habla con la API de Cognito (sin SDK): prueba el pool de clientes y luego el del equipo, maneja el primer ingreso
del invitado (contraseña temporal → `POST /sesion/nueva-clave`), «¿Olvidaste tu contraseña?» (`/sesion/olvide-clave`
y `/sesion/restablecer`) y renueva el token con el refresh token cuando la API responde 401 (`/sesion/renovar`).
Variables: `COGNITO_REGION`, `COGNITO_POOL_CLIENTES`, `COGNITO_POOL_EQUIPO`, `COGNITO_APP_CLIENTES` y
`COGNITO_APP_EQUIPO` (app clients públicos con `ALLOW_USER_PASSWORD_AUTH` y `ALLOW_REFRESH_TOKEN_AUTH`). En el
primer ingreso el usuario del portal se vincula con su `sub` por el correo verificado. Al invitar a alguien
(`miembro.invitado`), el despachador lo crea en el pool de clientes (`AdminCreateUser`, firmado con las
credenciales de AWS) y Cognito le manda la contraseña temporal. Las personas del equipo se crean a mano en su
pool. Con `AUTH_MODO=demo`, `/sesion/ingresar` sigue usando las credenciales de prueba.
Todavía no se probó contra pools reales (no existen): las pruebas simulan la API de Cognito.

**Producción en el VPS.** `infra/hostinger/docker-compose.yml` levanta también el portal (`portal`, en
`DOMINIO_PORTAL` detrás de Caddy), el despachador (`outbox`) y los respaldos (`respaldo`). Las variables están
en `infra/hostinger/.env.example`. Cómo publicar, aplicar migraciones e instalar los procesos programados:
`docs/operacion.md`.

**Equipo, Jarvis y tareas diarias de n8n (2 nov 2026).**

- **Personas del equipo e InooWork.** El ADMIN da de alta, edita y desactiva colaboradores en «Equipo» (`/panel/personas`). Cada cambio se manda a InooWork (`src/servidor/inoowork.ts`) con `INOOWORK_URL` e `INOOWORK_API_KEY`. Sin `INOOWORK_URL` queda «InooWork simulado». Lo que cambia en InooWork llega por `POST /integraciones/inoowork/sincronizacion` con `empleados` y `empleadosEliminados` (scope `inoowork:sync`). Borrar es desactivar en los dos.
- **Jarvis sin llaves personales.** Cada Hermes de área entra a la pasarela con su clave de `JARVIS_HERMES`. El portal marca cada conversación, cobra a la persona dueña de esa conversación y deja que las herramientas del portal (`mcp-portal.mjs`) lean con sus permisos (`X-Jarvis-Conversacion`, solo lectura). Ver `integrations/hermes/`.
- **Transcripciones.** «Nuevo cliente» y «Marcar reunión realizada» proponen datos desde la transcripción con DeepSeek, cobrados al área y a la persona que lo pide. Si el área está pausada o no hay clave, se usa un borrador por reglas. Nada se guarda hasta que una persona lo confirma.
- **Proyectos → Tableros de InooWork.** InooWork es la fuente: el portal lee y guarda sus proyectos (grupos, ítems, subítems, columnas y vistas) por la API que InooWork ya tiene (`GET /api/projects`, `PUT /api/projects/:id`), sin tocar su código. Cada cambio vuelve a leer el proyecto y aplica solo ese cambio. Usa `INOOWORK_URL` e `INOOWORK_API_KEY`; sin ellas, proyectos de demo. Cada persona se reconoce por su id de empleado, y el nivel ADMIN ve todos los proyectos.
- **El equipo entra con su usuario de InooWork.** Con `AUTH_EQUIPO=inoowork` y `SESION_SECRETO` (32 caracteres o más), el portal verifica el usuario y la contraseña con `POST /api/login` de InooWork, sin guardarlos, y da una sesión del portal de 12 horas. Los clientes siguen con Cognito. Cambiar o recuperar la contraseña se hace en InooWork.
- **Procesos diarios (6:00 de Lima).** Desde el 6 nov ya no van por n8n: los corre `inoo-diarios.timer` en el VPS (`docs/operacion.md` §5). Lo que sigue describe las rutas que llama.
- **n8n, una vez al día y temprano:** `POST /integraciones/recordatorios` (scope `recordatorios:write`) emite `tarea.por_vencer`, `requerimiento.por_vencer` y `reunion.proxima` para lo que vence o pasa el próximo día hábil, una sola vez cada aviso. Al cerrar un proyecto se emite `servicio.cerrado`, para el agradecimiento y la encuesta.

## 6. Seguridad del repositorio

- Nunca subir `.env`, credenciales ni datos reales de clientes (`.gitignore` ya los excluye).
- Las contraseñas `demo1234` existen solo en `src/mock/datos.ts` para el entorno de pruebas.
- Los datos de prueba (Casa Oliva y demás) son ficticios.
