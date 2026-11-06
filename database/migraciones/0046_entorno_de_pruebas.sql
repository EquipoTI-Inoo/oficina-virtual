-- =====================================================================
-- Entorno de pruebas (6 nov 2026). Los datos de prueba (clientes «PRUEBA · …», su gente y los usuarios de prueba
-- del equipo) viven en el mismo portal, pero separados por la base:
--  · Quien es de prueba solo ve y toca lo de prueba, aunque sea Admin o super usuario.
--  · Las personas reales no ven nada de prueba.
-- La API fija app.es_prueba ('true' / 'false') en cada solicitud del equipo o de un cliente; los procesos del
-- sistema (n8n, sincronización, formularios públicos) no la fijan y ven todo.
-- Se entra a pruebas con la cuenta pruebas@inoo.pe, que elige con qué usuario de prueba entrar.
-- =====================================================================

ALTER TABLE usuario
  ADD COLUMN es_prueba boolean NOT NULL DEFAULT false,
  ADD COLUMN es_cuenta_pruebas boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN usuario.es_prueba IS 'Usuario del entorno de pruebas: solo ve datos de prueba, y las personas reales no lo ven.';
COMMENT ON COLUMN usuario.es_cuenta_pruebas IS 'La cuenta pruebas@inoo.pe: no trabaja; solo elige con qué usuario de prueba entrar.';

-- ¿La solicitud es del entorno de pruebas? null = un proceso del sistema, que ve todo.
CREATE FUNCTION app_es_prueba() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE coalesce(current_setting('app.es_prueba', true), '') WHEN 'true' THEN true WHEN 'false' THEN false END;
$$;

-- Usuarios de prueba: los del equipo de prueba y la gente de los clientes de prueba (que no esté en uno real).
UPDATE usuario SET es_prueba = true WHERE lower(email::text) LIKE '%@prueba.inoo.pe';
UPDATE usuario u SET es_prueba = true
WHERE u.tipo = 'CLIENTE'
  AND EXISTS (SELECT 1 FROM miembro_cliente m JOIN cliente c ON c.id = m.cliente_id WHERE m.usuario_id = u.id AND c.es_prueba)
  AND NOT EXISTS (SELECT 1 FROM miembro_cliente m JOIN cliente c ON c.id = m.cliente_id WHERE m.usuario_id = u.id AND NOT c.es_prueba);
-- El equipo de prueba vuelve a estar activo (solo se ve en pruebas) y su Admin es super usuario de pruebas.
UPDATE usuario SET activo = true WHERE es_prueba AND tipo = 'EQUIPO';
UPDATE usuario SET es_super_usuario = true WHERE es_prueba AND tipo = 'EQUIPO' AND lower(email::text) = 'admin@prueba.inoo.pe';

-- La cuenta de pruebas. Su contraseña la pone un super usuario real con un enlace (Equipo → Cuenta de pruebas).
INSERT INTO usuario (email, nombre, tipo, es_prueba, es_cuenta_pruebas)
VALUES ('pruebas@inoo.pe', 'Entorno de pruebas', 'CLIENTE', true, true)
ON CONFLICT (email) DO UPDATE SET es_prueba = true, es_cuenta_pruebas = true, activo = true;

-- Clientes: cada uno en su mundo.
ALTER TABLE cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY entorno ON cliente USING (app_es_prueba() IS NULL OR es_prueba = app_es_prueba());

-- Personas: cada una en su mundo. Las cuentas de servicio (n8n, procesos) se ven desde los dos.
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY entorno ON usuario USING (app_es_prueba() IS NULL OR tipo = 'SERVICIO' OR es_prueba = app_es_prueba());

-- Todo lo que cuelga de un cliente sigue la misma regla (la consulta a cliente pasa por su política).
CREATE OR REPLACE FUNCTION app_puede_ver_cliente(p_cliente_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.usuario_tipo', true), '') = 'CLIENTE'
      THEN p_cliente_id = ANY (coalesce(nullif(current_setting('app.cliente_ids', true), ''), '{}')::uuid[])
    WHEN app_es_prueba() IS NULL THEN true
    ELSE EXISTS (SELECT 1 FROM cliente c WHERE c.id = p_cliente_id)
  END;
$$;
