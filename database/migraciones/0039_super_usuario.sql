-- =====================================================================
-- Super usuario y permisos por persona (pedido de Ernesto, 2 nov; hecho el 5 nov 2026).
--  · El super usuario está por encima de ADMIN: es el único que cambia niveles, permisos y quién es ADMIN.
--  · permisos_personalizados concede (true) o quita (false) un permiso a una persona, sobre lo que da su nivel.
--  · cambio_acceso guarda cada cambio. La aplicación solo puede leer y agregar: el historial no se edita.
-- La API impone las reglas (src/dominio/accesos.ts).
-- =====================================================================

ALTER TABLE usuario
  ADD COLUMN es_super_usuario boolean NOT NULL DEFAULT false,
  ADD COLUMN permisos_personalizados jsonb NOT NULL DEFAULT '{}',
  ADD CONSTRAINT super_solo_equipo CHECK (NOT es_super_usuario OR tipo = 'EQUIPO'),
  ADD CONSTRAINT permisos_son_objeto CHECK (jsonb_typeof(permisos_personalizados) = 'object');
COMMENT ON COLUMN usuario.es_super_usuario IS 'Por encima de ADMIN: cambia niveles, permisos y quién es ADMIN.';
COMMENT ON COLUMN usuario.permisos_personalizados IS 'Permiso → true (concedido) o false (quitado). Lo que no está lo da el nivel.';

CREATE TABLE cambio_acceso (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuario(id),
  hecho_por  uuid REFERENCES usuario(id),
  campo      text NOT NULL,
  antes      text NOT NULL,
  despues    text NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cambio_acceso_usuario_idx ON cambio_acceso (usuario_id, creado_en DESC);

ALTER TABLE cambio_acceso ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON cambio_acceso USING (NOT app_es_cliente());
GRANT SELECT, INSERT ON cambio_acceso TO app_portal;

-- Solo para el demo ya desplegado: sin un super usuario, nadie podría cambiar niveles. Ernesto y Omar se marcan
-- al importarlos de InooWork. En una base sin este usuario de demo no hace nada.
UPDATE usuario SET es_super_usuario = true WHERE email = 'admin@inoo.pe' AND tipo = 'EQUIPO' AND rol_equipo = 'ADMIN';
