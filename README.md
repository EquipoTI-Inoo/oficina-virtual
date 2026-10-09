# inoo-oficina-virtual

Monorepo de la **Oficina virtual de IA** y el **Portal de clientes** de Inoo (Asesorías Estratégicas).
La estructura sigue el PRD (`docs/prd.md`). Este primer corte entrega el **portal de clientes y el panel
interno con un entorno de pruebas completo**: las 16 pantallas de Figma, una API simulada que cumple el
contrato `docs/arquitectura/openapi.yaml` y una base Postgres con los mismos datos de prueba.

## Empezar en 2 minutos

```bash
cd apps/portal
npm install
npm run dev            # http://localhost:3000
```

| Usuario | Correo | Contraseña | Ve |
|---|---|---|---|
| Cliente (administradora) | valeria@casaoliva.pe | demo1234 | Portal de Casa Oliva |
| Cliente (solo lectura) | martin@casaoliva.pe | demo1234 | Portal, sin poder aprobar |
| Equipo (account manager) | diego.castro@inoo.pe | demo1234 | Panel interno |
| Equipo (administración) | admin@inoo.pe | demo1234 | Panel interno + costos de IA |

Entorno completo con Docker (portal, Postgres con semillas, Prism, Mailpit, MinIO):

```bash
cp infra/local/.env.example infra/local/.env
docker compose -f infra/local/docker-compose.yml up --build
```

## Documentación

| Documento | Contenido |
|---|---|
| `docs/configuracion.md` | Requisitos, variables de entorno, puertos, Docker, Fase 1 en Hostinger, paso a backend real |
| `docs/entorno-de-pruebas.md` | Qué simula el entorno, datos y usuarios, escenarios de prueba manual, pruebas automáticas |
| `docs/diseno.md` | Tokens medidos en Figma, relación pantalla ↔ frame, diferencias conocidas |
| `docs/arquitectura/` | Arquitectura v1.1, contrato OpenAPI |
| `docs/prd.md`, `docs/backlog-y-casos-de-uso.md` | Documentos de producto |

## Estructura

```
apps/portal/          Portal Next.js (UI cliente + panel interno + /api/v1)
database/             migraciones (esquema.sql v1.1), semillas y comprobaciones
docs/                 PRD, backlog, arquitectura, diseño y configuración
infra/local/          entorno de pruebas con Docker
infra/hostinger/      Fase 1: n8n + Postgres + NocoDB + Caddy
infra/aws/            Fase 2 (pendiente)
n8n/workflows/        un workflow por agente (vacío por ahora)
prompts/ integrations/ templates/   según el PRD
```

## Estado

Hecho: portal con las 16 pantallas de Figma y 4 sin diseño, API simulada con todas las operaciones del
contrato (incluidas `/integraciones/*` para n8n y el outbox de eventos), pruebas de contrato (45), de interfaz
y visuales, semillas SQL, Docker local y Fase 1.
Backend real (`API_MODO=db`, primer corte): flujo de entregables sobre Postgres con RLS, `cambiar_estado_pieza()`,
idempotencia, verificación de JWT de Cognito y despachador del outbox hacia n8n (`docs/configuracion.md` §5).
Pendiente: el resto de rutas en el backend, S3 real, API keys de integraciones, despliegue en AWS e InooWork.
