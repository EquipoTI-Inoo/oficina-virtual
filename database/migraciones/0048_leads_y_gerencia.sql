-- =====================================================================
-- Leads de varias áreas y bots de Gerencia (8 nov 2026, reunión del 6 nov).
--  · usuario.areas_lideradas: las áreas que lidera la persona, aparte de su área (que trae InooWork y la
--    sincronización pisa). Omar Suyo lidera Administración y Ernesto (CEO) lidera Comercial.
--  · bot_jarvis.seccion: AREA (de su área) o GERENCIA (solo los super usuarios; su gasto va a Administración).
-- =====================================================================

ALTER TABLE usuario ADD COLUMN areas_lideradas area_equipo[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN usuario.areas_lideradas IS 'Áreas que lidera, además de su área si es_lead (8 nov).';
UPDATE usuario SET areas_lideradas = ARRAY[area] WHERE es_lead AND area IS NOT NULL;
UPDATE usuario SET areas_lideradas = array(SELECT DISTINCT unnest(areas_lideradas || 'ADMINISTRACION'::area_equipo)) WHERE inoowork_empleado_id = 'EMP-174' AND NOT es_prueba;
UPDATE usuario SET areas_lideradas = array(SELECT DISTINCT unnest(areas_lideradas || 'COMERCIAL'::area_equipo)) WHERE inoowork_empleado_id = 'EMP-875' AND NOT es_prueba;

ALTER TABLE bot_jarvis ADD COLUMN seccion text NOT NULL DEFAULT 'AREA' CHECK (seccion IN ('AREA', 'GERENCIA'));
COMMENT ON COLUMN bot_jarvis.seccion IS 'AREA: de su área. GERENCIA: solo super usuarios; su área (para el gasto) es Administración.';

-- Personajes más amigables (reunión del 6 nov): una mascota sobre el color del bot. Sin personaje se ve su inicial.
ALTER TABLE bot_jarvis ADD COLUMN personaje text CHECK (personaje IS NULL OR personaje ~ '^[A-Z_]{2,20}$');
COMMENT ON COLUMN bot_jarvis.personaje IS 'Mascota del bot (ZORRO, BUHO…); la lista está en dominio/ia-equipo.ts.';

-- Compartir un bot con otra área (reunión del 6 nov). Prestarlo: la otra área lo usa (no lo edita) y paga lo que
-- gasta; con_chats decide si ve también los chats del dueño. Copiarlo no necesita tabla (es un bot nuevo).
CREATE TABLE prestamo_bot (
  bot_id        uuid NOT NULL REFERENCES bot_jarvis(id) ON DELETE CASCADE,
  espacio       text NOT NULL CHECK (espacio IN ('ADMINISTRACION', 'CRM', 'COMERCIAL', 'AUDIOVISUAL', 'DISENO', 'MARKETING', 'GERENCIA')),
  con_chats     boolean NOT NULL DEFAULT false,
  prestado_por  uuid NOT NULL REFERENCES usuario(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_id, espacio)
);
COMMENT ON TABLE prestamo_bot IS 'Bots de Jarvis prestados a otra área o a Gerencia (8 nov).';
ALTER TABLE prestamo_bot ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON prestamo_bot USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE, DELETE ON prestamo_bot TO app_portal;

-- Desde qué espacio se habló en cada chat (NULL = el del bot). Separa los chats del dueño de los de quien lo tiene prestado.
ALTER TABLE sesion_jarvis ADD COLUMN espacio text CHECK (espacio IS NULL OR espacio IN ('ADMINISTRACION', 'CRM', 'COMERCIAL', 'AUDIOVISUAL', 'DISENO', 'MARKETING', 'GERENCIA'));
