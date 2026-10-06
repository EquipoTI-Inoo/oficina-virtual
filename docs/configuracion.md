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

Postgres ejecuta `database/migraciones/0001_esquema.sql` y luego `database/semillas/0001_casa_oliva.sql`
**solo la primera vez** que se crea el volumen. Para volver a empezar: `infra/local/reiniciar-base.sh`.

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

## 5. Pasar del entorno de pruebas al backend real

El frontend solo conoce el contrato. Para usar un backend real basta con:

1. Implementar `/api/v1` según `docs/arquitectura/openapi.yaml` (las pruebas de `tests/api` describen
   las reglas que debe cumplir y pueden adaptarse para correr contra el backend).
2. Desplegar el portal con `API_MODO=proxy` y `API_URL_BACKEND=<url del backend>`, o mover las rutas
   reales dentro de `app/api/v1` (decisión 1 de la arquitectura).
3. Reemplazar el ingreso de prueba (`POST /api/v1/__pruebas/ingresar`, token `demo.<id>`) por Cognito.
   Está aislado en `PantallaIngreso` y en `src/base.tsx` (`api()` envía `Authorization: Bearer`).
4. Reemplazar las URLs de subida simuladas por URLs prefirmadas de S3 (el flujo ya es el del contrato:
   `POST /archivos` → `PUT` directo → `POST /archivos/{id}/confirmar`).

## 6. Seguridad del repositorio

- Nunca subir `.env`, credenciales ni datos reales de clientes (`.gitignore` ya los excluye).
- Las contraseñas `demo1234` existen solo en `src/mock/datos.ts` para el entorno de pruebas.
- Los datos de prueba (Casa Oliva y demás) son ficticios.
