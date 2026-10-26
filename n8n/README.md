# Workflows de n8n

Un archivo JSON exportado por workflow, en la carpeta del agente (estructura del PRD).
Exportar desde n8n con «Download» y sin credenciales; las credenciales viven solo en n8n.

En Fase 1 los workflows escriben en Postgres con SQL directo, pero **los cambios de estado de piezas
pasan siempre por `cambiar_estado_pieza()`** (valida la transición, audita y deja el evento en el outbox).
En Fase 2 escriben a través de `/api/v1/integraciones/*` con API key.

Para probar contra el entorno local: `docker compose --profile fase1 up` en `infra/local`
(n8n en http://localhost:5678, correos a Mailpit).

## Conexión con el portal (`comunes/`)

El portal avisa a n8n de todo lo que pasa con eventos del outbox (`npm run outbox` en el portal), firmados
con HMAC. **Los correos los manda el propio portal** (`CORREOS_POR=portal`, por defecto), con el horario de
atención de Inoo para los del cliente (L-V 9:00-18:00, sábado 9:00-13:30). n8n solo los manda si se configura
`CORREOS_POR=n8n` (workflow `correos-por-evento.json`; en ese caso el horario no se aplica).

| Workflow | Disparo | Qué hace |
|---|---|---|
| `correos-por-evento.json` (solo con `CORREOS_POR=n8n`; por defecto los correos los manda el portal) | Webhook `POST /webhook/inoo-eventos` (destino de `N8N_WEBHOOK_URL`) | Verifica la firma → `POST /api/v1/integraciones/correos/preparar` → responde 200 al despachador → manda cada correo por SMTP → `POST /api/v1/integraciones/correos/{id}/resultado` (ENVIADO o FALLIDO) |
| `atrasos-requerimientos.json` | Lunes a viernes 8:00 y todos los días 8:05 (Lima) | `POST /api/v1/integraciones/requerimientos/atrasos`: corre el cronograma de los pedidos vencidos. `POST /api/v1/integraciones/servicios/inactividad`: si nadie del cliente usa el portal en 30 días, sus servicios pasan a standby (7 días antes se avisa una vez). Los correos los manda el portal |
| `etapas-del-mes.json` | Día 25 a las 6:00 (mes siguiente) y día 1 a las 6:00 (repaso del mes en curso) | `POST /api/v1/integraciones/servicios/etapas-del-mes`: los servicios mensuales vigentes (Social Media Pro, Paid Media…) reciben las etapas de su plantilla. Repetirlo no duplica nada |

Si la firma no cuadra, el webhook responde 401 y el despachador reintenta con espera exponencial; si
`preparar` falla, n8n responde error y también se reintenta. `preparar` es idempotente por evento y
destinatario, así que un reintento no duplica correos.

### Para activarlos

1. Importar `atrasos-requerimientos.json` y `etapas-del-mes.json` (Workflows → Import from file);
   `correos-por-evento.json` solo con `CORREOS_POR=n8n`.
2. Variables de entorno de n8n (ya están en los `docker-compose.yml`):
   - `PORTAL_API_URL`: URL del portal vista desde n8n (sin `/api/v1`).
   - `INOO_WEBHOOK_SECRETO`: el mismo valor que `N8N_WEBHOOK_SECRETO` del portal.
   - `CORREO_REMITENTE`: p. ej. `Inoo <no-responder@inoo.pe>`.
   - `NODE_FUNCTION_ALLOW_BUILTIN=crypto` y `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` (la verificación de firma los usa).
3. Credenciales en n8n:
   - **Portal Inoo · X-Api-Key** (Header Auth): nombre `X-Api-Key`, valor = una llave creada con
     `npm run api-key` con los scopes `requerimientos:write` y `servicios:write` (más `correos:write` si n8n manda los correos).
   - **SMTP Inoo** (SMTP): solo con `CORREOS_POR=n8n`. En local, Mailpit (`mailpit:1025`, sin TLS ni usuario).
4. Activar los workflows. En el portal, `N8N_WEBHOOK_URL=https://<n8n>/webhook/inoo-eventos`.
