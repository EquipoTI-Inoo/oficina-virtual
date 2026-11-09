# inoo-oficina-virtual

Monorepo del **Portal de Inoo** (Asesorías Estratégicas): el portal de clientes, el espacio del equipo y Jarvis,
los bots de IA de cada área. **En producción desde el 6 nov 2026 en `portal.inoo.pe`**, con usuarios reales: el
equipo entra con su usuario de InooWork y los clientes con correo y contraseña propios.

## Empezar en 2 minutos (API simulada)

```bash
cd apps/portal
npm install
npm run dev            # http://localhost:3000
```

En local, sin base de datos, el portal usa una API simulada que cumple el mismo contrato
(`docs/arquitectura/openapi.yaml`) con datos de prueba:

| Usuario | Correo | Contraseña | Ve |
|---|---|---|---|
| Cliente (administradora) | valeria@casaoliva.pe | demo1234 | Portal de Casa Oliva |
| Cliente (solo lectura) | martin@casaoliva.pe | demo1234 | Portal, sin poder aprobar |
| Equipo (account manager, lead de CRM) | diego.castro@inoo.pe | demo1234 | Sus cuentas y proyectos |
| Equipo (administración, super usuario) | admin@inoo.pe | demo1234 | Todo, incluidos niveles, permisos y conectores |
| Equipo (Finanzas) | finanzas@inoo.pe | demo1234 | Todo lo de Administración y el estado de pago |
| Equipo por proyecto (desarrollo web) | camila.paredes@inoo.pe | demo1234 | Solo sus proyectos y sus marcas |

Entorno completo con Docker (portal, Postgres con semillas, Prism, Mailpit, MinIO):

```bash
cp infra/local/.env.example infra/local/.env
docker compose -f infra/local/docker-compose.yml up --build
```

## Qué hace el portal

- **Clientes:** inicio de su cuenta, sus servicios con avance por etapas, entregables para aprobar o pedir
  cambios, requerimientos (lo que la agencia le pide) con plazos en días hábiles, soporte y Mi cuenta.
- **Equipo:** Mi panel, calendario del colaborador, Proyectos (pipeline, tareas, Gantt, entregables, taller web),
  Clientes, Empresas, Organigrama, Equipo (personas sincronizadas con InooWork), Feriados y avisos, Costos de IA
  y Mi cuenta. Cada persona ve según su nivel: ADMIN todo; CRM y Comercial sus cuentas; el resto sus proyectos.
- **Jarvis:** bots de IA por área (y Gerencia para los super usuarios) con chats que se guardan, skills,
  conectores MCP, rutinas, automatizaciones, biblioteca en Drive y registro de actividad. Corren en un Hermes por
  área y el gasto se cobra a cada persona, con topes por área. Ver `docs/arquitectura/arquitectura.md` §0.
- **La IA no se nota para el cliente:** todo lo que hace Jarvis lo revisa y lo envía el equipo.

## Documentación

| Documento | Contenido |
|---|---|
| `docs/operacion.md` | **Producción:** dónde vive cada cosa, cómo publicar, migraciones, procesos programados, respaldos y Jarvis |
| `docs/configuracion.md` | Requisitos, variables de entorno, Docker local, backend real |
| `docs/entorno-de-pruebas.md` | API simulada, datos y usuarios de prueba, cuenta de pruebas en producción, pruebas automáticas |
| `docs/arquitectura/arquitectura.md` | Arquitectura (estado real y diseño original), esquema de datos, flujos y seguridad |
| `docs/arquitectura/openapi.yaml` | Contrato de la API: lo cumplen la API simulada y el backend real |
| `docs/diseno.md` | Tokens de Figma y todas las pantallas, con las que no tienen diseño |
| `docs/prd.md`, `docs/backlog-y-casos-de-uso.md` | Producto: objetivos, fases y su estado, casos de uso |

## Estructura

```
apps/portal/              Portal Next.js: pantallas, /api/v1 (API simulada y backend real) y pruebas
database/migraciones/     Esquema de Postgres en migraciones numeradas (0001 a 0049)
database/semillas/        Datos de prueba y llave de integración de desarrollo
docs/                     Producto, arquitectura, diseño, configuración y operación
infra/hostinger/          Producción: Compose del portal, Postgres, Caddy, respaldos y procesos programados (trabajos/)
infra/local/              Entorno local con Docker
infra/aws/                Fase 2 (sin usar por ahora)
n8n/workflows/            Workflows de los agentes de contenido
prompts/ integrations/ templates/
```

## Estado (9 nov 2026)

- En producción: todo el contrato sobre Postgres con RLS, ingreso propio sin AWS, archivos y respaldos en
  Google Drive, correos por SMTP, personas sincronizadas con InooWork y Jarvis en las seis áreas.
- Pruebas: 473 de API (cada flujo contra la API simulada y contra Postgres), de navegador y visuales.
- Publicado el 9 nov: Empresas, áreas que lidera cada persona y Jarvis avanzado (migración 0049), con los
  procesos programados instalados en el VPS.
- Por decidir: bóveda de contraseñas por cliente y grupo de WhatsApp al crear un proyecto.

Detalle de fases y pendientes en `docs/prd.md` («Estado de implementación»).
