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

Postgres ejecuta las migraciones de `database/migraciones/` (0001 a 0018) y luego `database/semillas/0001_casa_oliva.sql`
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

## 4. Fase 1 en el VPS de Hostinger (`infra/hostinger`)

1. Apuntar dos subdominios al VPS (por ejemplo `n8n.inoo.pe` y `panel.inoo.pe`).
2. En el VPS: clonar el repositorio, `cd infra/hostinger`, `cp .env.example .env` y completar los secretos
   con `openssl rand` como indica el archivo. Guardar `N8N_ENCRYPTION_KEY` en el gestor de secretos.
3. `docker compose up -d`. Caddy obtiene los certificados HTTPS automáticamente.
4. Crear las cuentas individuales del equipo en n8n y NocoDB (sin cuentas compartidas, como pide el PRD).
5. En NocoDB, conectar la base `oficina_virtual` para tener el panel interno sobre las mismas tablas.
6. Cargar en n8n las credenciales de Google Drive, Gemini, OpenAI, Anthropic, Telegram/Slack e InooWork.
7. Respaldos: el servicio `respaldo` deja un `pg_dump` diario en `infra/hostinger/respaldos/` y borra los
   de más de 14 días. Copiar esa carpeta fuera del VPS (Drive o S3).

**Antes de conectar InooWork (INO-00):** desplegar el parche de seguridad en `intranet.inoo.pe`,
cambiar la contraseña de admin expuesta en el historial y usar la API key solo por header `x-api-key`.

## 5. Backend real (`API_MODO=db`)

El backend vive dentro del portal (`src/servidor/`, decisión 1 de la arquitectura) y usa el mismo
Postgres del esquema. Las reglas no se duplican en TypeScript: los cambios de estado pasan por
`cambiar_estado_pieza()`, la visibilidad la garantiza RLS (cada transacción corre como el rol
`app_portal` con `app.usuario_tipo` y `app.cliente_ids`) y cada cambio deja su evento en `outbox_evento`.

**Estado (26 oct 2026, tras unir la rama backend-real-y-n8n con las fases 10 a 19).** Todo el contrato está implementado contra la base salvo la sincronización con
InooWork (`POST /integraciones/inoowork/sincronizacion` y `POST /webhooks/inoowork`, fase 6), que responde
`501 RUTA_NO_IMPLEMENTADA`. Cada ruta tiene la misma forma que la API simulada y las suites compartidas de
`tests/api/flujo-*.ts` corren contra las dos. `Idempotency-Key` se guarda en la tabla `idempotencia`.

| Variable | Valores | Efecto |
|---|---|---|
| `DATABASE_URL` | URL de Postgres | Base con todas las migraciones de `database/migraciones/` aplicadas, en orden |
| `AUTH_MODO` | `demo`, `cognito` | `demo`: token `demo.<usuario_id>` (bloqueado en producción salvo `PERMITIR_AUTH_DEMO=true`). `cognito`: JWT de los dos pools, verificado con su JWKS |
| `COGNITO_REGION`, `COGNITO_POOL_EQUIPO`, `COGNITO_POOL_CLIENTES`, `COGNITO_CLIENT_IDS` | | Pools y apps de Cognito; el `sub` se busca en `usuario.cognito_sub` |
| `N8N_WEBHOOK_URL`, `N8N_WEBHOOK_SECRETO` | | Destino y secreto del despachador del outbox (`npm run outbox`) |
| `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` | | Bucket de archivos de clientes. El navegador sube y descarga con URLs prefirmadas (15 min); sin estas variables las subidas responden `503 ALMACEN_NO_CONFIGURADO` |
| `S3_ENDPOINT`, `S3_ENDPOINT_PUBLICO` | URL | Solo MinIO: `http://minio:9000` y la URL que ve el navegador (`http://localhost:9000`). En AWS se dejan vacías |
| `PORTAL_URL` | URL | Base de los enlaces de los correos automáticos (p. ej. `https://portal.inoo.pe`) |

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
`DOMINIO_PORTAL` detrás de Caddy) y el despachador (`outbox`). Las variables están en `infra/hostinger/.env.example`.

**Pendiente:** la sincronización con InooWork (en pausa).

## 6. Seguridad del repositorio

- Nunca subir `.env`, credenciales ni datos reales de clientes (`.gitignore` ya los excluye).
- Las contraseñas `demo1234` existen solo en `src/mock/datos.ts` para el entorno de pruebas.
- Los datos de prueba (Casa Oliva y demás) son ficticios.
