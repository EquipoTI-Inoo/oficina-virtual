# Workflows de n8n

Un archivo JSON exportado por workflow, en la carpeta del agente (estructura del PRD).
Exportar desde n8n con «Download» y sin credenciales; las credenciales viven solo en n8n.

En Fase 1 los workflows escriben en Postgres con SQL directo, pero **los cambios de estado de piezas
pasan siempre por `cambiar_estado_pieza()`** (valida la transición, audita y deja el evento en el outbox).
En Fase 2 escriben a través de `/api/v1/integraciones/*` con API key.

Para probar contra el entorno local: `docker compose --profile fase1 up` en `infra/local`
(n8n en http://localhost:5678, correos a Mailpit).
