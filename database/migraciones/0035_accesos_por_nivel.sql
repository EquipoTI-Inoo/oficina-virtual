-- =====================================================================
-- Accesos del equipo por nivel (2 nov 2026). Antes cualquier persona del equipo veía todas las cuentas;
-- ahora cada una ve lo suyo, según su nivel (que sale del área y el ADMIN puede cambiar a una persona):
--  · ADMIN     el rol ADMIN y toda el área de Administración (Finanzas incluida): todo, y asigna accesos.
--  · CUENTA    CRM y Comercial: las cuentas asignadas (y las que lleva como AM) con todo lo de adentro.
--  · PROYECTO  Audiovisual, Diseño y Marketing: solo sus proyectos (con briefs y requerimientos) y el
--              perfil de marca de esos clientes; nada comercial.
-- Los leads de área (puede haber varios) asignan a la gente de su área, supervisan lo que hace su área y
-- ven su carga y su calendario. La API impone estas reglas en cada consulta.
-- =====================================================================

CREATE TYPE nivel_acceso AS ENUM ('ADMIN', 'CUENTA', 'PROYECTO');

ALTER TABLE usuario
  ADD COLUMN nivel_acceso nivel_acceso,
  ADD COLUMN es_lead boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT nivel_solo_equipo CHECK (nivel_acceso IS NULL OR tipo = 'EQUIPO'),
  ADD CONSTRAINT lead_solo_equipo CHECK (NOT es_lead OR tipo = 'EQUIPO');
COMMENT ON COLUMN usuario.nivel_acceso IS 'Nivel elegido por el ADMIN para esta persona; null = el de su área (src/dominio/accesos.ts).';
COMMENT ON COLUMN usuario.es_lead IS 'Lead de su área: asigna a la gente de su área, supervisa su trabajo y ve su carga y calendario.';

-- Cuentas asignadas a personas de nivel CUENTA (además de las que llevan como AM).
CREATE TABLE acceso_cuenta (
  usuario_id   uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  cliente_id   uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  asignado_por uuid REFERENCES usuario(id),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, cliente_id)
);
CREATE INDEX acceso_cuenta_cliente_idx ON acceso_cuenta (cliente_id);

-- Personas asignadas a un proyecto (además del responsable).
CREATE TABLE miembro_proyecto (
  usuario_id             uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  servicio_contratado_id uuid NOT NULL REFERENCES servicio_contratado(id) ON DELETE CASCADE,
  asignado_por           uuid REFERENCES usuario(id),
  creado_en              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, servicio_contratado_id)
);
CREATE INDEX miembro_proyecto_servicio_idx ON miembro_proyecto (servicio_contratado_id);

ALTER TABLE acceso_cuenta ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON acceso_cuenta USING (NOT app_es_cliente());
ALTER TABLE miembro_proyecto ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON miembro_proyecto USING (NOT app_es_cliente());

GRANT SELECT, INSERT, UPDATE, DELETE ON acceso_cuenta, miembro_proyecto TO app_portal;
