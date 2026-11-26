-- 26 nov 2026: el calendario del equipo aprende de qué cliente es un dominio de correo. Cuando alguien del equipo
-- asigna a mano el cliente de un evento que tiene invitados de afuera, su dominio queda asociado
-- (retailnexagroup.com → Nexaretail) y los próximos eventos con ese dominio se sugieren solos. Solo equipo.

CREATE TABLE cliente_dominio (
  dominio    text PRIMARY KEY CHECK (dominio ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  cliente_id uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  creado_por uuid REFERENCES usuario(id),
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cliente_dominio_cliente_idx ON cliente_dominio (cliente_id);

ALTER TABLE cliente_dominio ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON cliente_dominio USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE, DELETE ON cliente_dominio TO app_portal;
