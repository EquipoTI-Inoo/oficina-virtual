# Infraestructura Fase 2 (AWS)

Pendiente (Sprint 4). Componentes definidos en `docs/arquitectura/arquitectura.md` §1:
CloudFront + ALB, ECS Fargate (portal Next.js y n8n en queue mode con Redis), RDS Postgres 16,
S3 privado para contenido del cliente, Cognito (pools de equipo y clientes), SES.

El portal ya está preparado: imagen `apps/portal/Dockerfile` (salida `standalone`) y `API_MODO=proxy`
para apuntar a la API real. La migración desde Hostinger es `pg_dump` / `pg_restore` del mismo esquema.
