-- =====================================================================
-- Jarvis avanzado (9 nov 2026, reunión del 6 nov).
--  · Skills: instrucciones y archivos de texto reutilizables de un área (como las Skills de Claude, los GPTs o
--    los Gems). Se le activan a un bot y entran en lo que sabe. uso_skill deja la trazabilidad.
--  · Conectores: los servidores MCP que puede usar cada área. El portal guarda solo el catálogo (nombre, url y
--    áreas); las credenciales las pone TI en el Hermes del área, nunca aquí (decisión «Jarvis sin llaves»).
--  · Rutinas: pedidos que un bot hace solo cada día, semana o mes. Automatizaciones: pedidos que hace cuando pasa
--    algo en el portal (un evento del outbox). Las dos crean ejecuciones, que corre el proceso de Jarvis cada 10
--    minutos; cada ejecución la paga quien creó la rutina o la automatización.
--  · Biblioteca: lo que genera Jarvis y alguien decide guardar, con su copia en Drive.
-- =====================================================================

CREATE TABLE skill_jarvis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  espacio        text NOT NULL CHECK (espacio IN ('ADMINISTRACION', 'CRM', 'COMERCIAL', 'AUDIOVISUAL', 'DISENO', 'MARKETING', 'GERENCIA')),
  nombre         text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 80),
  descripcion    text NOT NULL DEFAULT '',
  instrucciones  text NOT NULL,
  archivos       jsonb NOT NULL DEFAULT '[]',
  creado_por     uuid NOT NULL REFERENCES usuario(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE skill_jarvis IS 'Skills de Jarvis por área o Gerencia (9 nov). archivos: [{nombre, texto}].';

CREATE TABLE bot_skill (
  bot_id   uuid NOT NULL REFERENCES bot_jarvis(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skill_jarvis(id) ON DELETE CASCADE,
  PRIMARY KEY (bot_id, skill_id)
);

CREATE TABLE uso_skill (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  skill_id   uuid NOT NULL REFERENCES skill_jarvis(id) ON DELETE CASCADE,
  bot_id     uuid REFERENCES bot_jarvis(id) ON DELETE SET NULL,
  sesion_id  text NOT NULL,
  usuario_id uuid REFERENCES usuario(id),
  origen     text NOT NULL CHECK (origen IN ('CHAT', 'RUTINA', 'AUTOMATIZACION')),
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX uso_skill_skill_idx ON uso_skill (skill_id, creado_en DESC);
COMMENT ON TABLE uso_skill IS 'Trazabilidad: cada vez que un bot trabajó con una skill activa.';

CREATE TABLE conector_jarvis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 60),
  descripcion    text NOT NULL DEFAULT '',
  url            text CHECK (url IS NULL OR url ~ '^https?://'),
  espacios       text[] NOT NULL DEFAULT '{}',
  estado         text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'CONECTADO', 'APAGADO')),
  creado_por     uuid NOT NULL REFERENCES usuario(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE conector_jarvis IS 'Catálogo de conectores MCP (9 nov). espacios vacío = todas las áreas. Sin credenciales: van en el Hermes.';

CREATE TABLE bot_conector (
  bot_id      uuid NOT NULL REFERENCES bot_jarvis(id) ON DELETE CASCADE,
  conector_id uuid NOT NULL REFERENCES conector_jarvis(id) ON DELETE CASCADE,
  PRIMARY KEY (bot_id, conector_id)
);

CREATE TABLE rutina_jarvis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      uuid NOT NULL REFERENCES bot_jarvis(id) ON DELETE CASCADE,
  nombre      text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 80),
  pedido      text NOT NULL CHECK (length(pedido) BETWEEN 1 AND 4000),
  frecuencia  text NOT NULL CHECK (frecuencia IN ('DIARIA', 'LABORABLES', 'SEMANAL', 'MENSUAL')),
  hora        text NOT NULL CHECK (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  dia_semana  smallint CHECK (dia_semana BETWEEN 1 AND 7),
  dia_mes     smallint CHECK (dia_mes BETWEEN 1 AND 28),
  activa      boolean NOT NULL DEFAULT true,
  proxima_en  timestamptz NOT NULL,
  creado_por  uuid NOT NULL REFERENCES usuario(id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rutina_jarvis_proxima_idx ON rutina_jarvis (proxima_en) WHERE activa;

CREATE TABLE automatizacion_jarvis (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      uuid NOT NULL REFERENCES bot_jarvis(id) ON DELETE CASCADE,
  nombre      text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 80),
  evento      text NOT NULL CHECK (evento ~ '^[a-z_]+\.[a-z_]+$'),
  pedido      text NOT NULL CHECK (length(pedido) BETWEEN 1 AND 4000),
  activa      boolean NOT NULL DEFAULT true,
  creado_por  uuid NOT NULL REFERENCES usuario(id),
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automatizacion_jarvis_evento_idx ON automatizacion_jarvis (evento) WHERE activa;

CREATE TABLE ejecucion_jarvis (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id             uuid NOT NULL REFERENCES bot_jarvis(id) ON DELETE CASCADE,
  rutina_id          uuid REFERENCES rutina_jarvis(id) ON DELETE SET NULL,
  automatizacion_id  uuid REFERENCES automatizacion_jarvis(id) ON DELETE SET NULL,
  usuario_id         uuid NOT NULL REFERENCES usuario(id),
  pedido             text NOT NULL,
  contexto           jsonb NOT NULL DEFAULT '{}',
  estado             text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'HECHA', 'FALLIDA')),
  sesion_id          text,
  error              text,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  terminado_en       timestamptz
);
CREATE INDEX ejecucion_jarvis_pendiente_idx ON ejecucion_jarvis (creado_en) WHERE estado = 'PENDIENTE';
CREATE INDEX ejecucion_jarvis_bot_idx ON ejecucion_jarvis (bot_id, creado_en DESC);
COMMENT ON TABLE ejecucion_jarvis IS 'Cada vez que una rutina o automatización le pide algo a un bot. La paga usuario_id.';

CREATE TABLE biblioteca_jarvis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  espacio       text NOT NULL CHECK (espacio IN ('ADMINISTRACION', 'CRM', 'COMERCIAL', 'AUDIOVISUAL', 'DISENO', 'MARKETING', 'GERENCIA')),
  bot_id        uuid REFERENCES bot_jarvis(id) ON DELETE SET NULL,
  bot_nombre    text NOT NULL,
  sesion_id     text,
  titulo        text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 120),
  contenido     text NOT NULL,
  clave_archivo text,
  creado_por    uuid NOT NULL REFERENCES usuario(id),
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX biblioteca_jarvis_espacio_idx ON biblioteca_jarvis (espacio, creado_en DESC);
COMMENT ON TABLE biblioteca_jarvis IS 'Lo que genera Jarvis y se guarda (9 nov). clave_archivo: su copia .md en Drive, si está conectado.';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['skill_jarvis', 'bot_skill', 'uso_skill', 'conector_jarvis', 'bot_conector', 'rutina_jarvis', 'automatizacion_jarvis', 'ejecucion_jarvis', 'biblioteca_jarvis'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY solo_equipo ON %I USING (NOT app_es_cliente())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_portal', t);
  END LOOP;
END $$;

-- Automatizaciones: cada evento del outbox crea las ejecuciones de las automatizaciones que lo esperan. Solo pasan
-- los ids del evento (nunca textos ni datos personales): el bot lee el resto con los permisos de quien la creó.
-- Los eventos de clientes de prueba no disparan nada. Un error aquí nunca frena la acción que lo disparó.
CREATE FUNCTION app_jarvis_automatizar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ctx jsonb;
BEGIN
  IF NEW.cliente_id IS NOT NULL AND EXISTS (SELECT 1 FROM cliente WHERE id = NEW.cliente_id AND es_prueba) THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM automatizacion_jarvis WHERE activa AND evento = NEW.tipo) THEN RETURN NEW; END IF;
  SELECT jsonb_object_agg(k, v) INTO ctx FROM jsonb_each(NEW.payload) AS e(k, v)
    WHERE k ~ '(Id|Ids|^numero|^estado|^periodo)$' AND jsonb_typeof(v) IN ('string', 'number', 'array') AND length(v::text) <= 400;
  ctx := coalesce(ctx, '{}') || jsonb_build_object('evento', NEW.tipo, 'clienteId', NEW.cliente_id);
  INSERT INTO ejecucion_jarvis (bot_id, automatizacion_id, usuario_id, pedido, contexto)
  SELECT a.bot_id, a.id, a.creado_por, a.pedido, ctx FROM automatizacion_jarvis a JOIN usuario u ON u.id = a.creado_por AND u.activo
  WHERE a.activa AND a.evento = NEW.tipo;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'app_jarvis_automatizar: %', SQLERRM;
  RETURN NEW;
END $$;
CREATE TRIGGER jarvis_automatizar AFTER INSERT ON outbox_evento FOR EACH ROW EXECUTE FUNCTION app_jarvis_automatizar();
