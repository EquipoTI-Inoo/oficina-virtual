-- =====================================================================
-- Rol de la API (/api/v1). RLS no se aplica al dueño de las tablas, así que la API
-- trabaja dentro de cada transacción con `SET LOCAL ROLE app_portal`, un rol sin
-- BYPASSRLS. El usuario con el que se conecta (dueño del esquema en Fase 1, usuario
-- de RDS en Fase 2) debe ser miembro de app_portal: lo asegura el GRANT del final.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_portal') THEN
    CREATE ROLE app_portal NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_portal;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_portal;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_portal;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_portal;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_portal;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_portal;

-- Catálogos y reglas: la API solo los lee.
REVOKE INSERT, UPDATE, DELETE ON transicion_pieza, tarifa_modelo, servicio FROM app_portal;
-- La auditoría solo crece: nadie la edita ni la borra desde la API.
REVOKE UPDATE, DELETE ON evento_pieza FROM app_portal;

GRANT app_portal TO CURRENT_USER;
