-- =====================================================================
-- Herramientas de Jarvis por persona (13 nov 2026). Hasta ahora las skills y los conectores eran del área y los
-- ponía TI. Desde hoy hay un catálogo (las skills y MCP de Skillfera y los que Inoo agregue) y cada persona arma
-- su propio Jarvis: activa las skills que quiere, escribe las suyas y conecta los servicios que usa. Nada viene
-- activado de base.
--  · Skills: el bot recibe solo el nombre y la descripción de las que la persona activó, y lee la skill completa
--    con la herramienta skill_leer del MCP del portal cuando le hace falta (así no hay tope de tamaño).
--  · Conectores: servidores MCP remotos (HTTP). El portal hace de puente: el bot pide la lista de herramientas y
--    las usa con conector_usar, y el portal llama al servidor con la cuenta de la persona. En el VPS no se instala
--    nada. Si el servicio pide un token, la persona pega el suyo; se guarda cifrado y nunca se vuelve a mostrar.
-- Las skills y conectores del área (0049) siguen igual.
-- =====================================================================

CREATE TABLE skill_catalogo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  nombre         text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 80),
  descripcion    text NOT NULL DEFAULT '' CHECK (length(descripcion) <= 600),
  categoria      text NOT NULL DEFAULT 'General' CHECK (length(categoria) BETWEEN 1 AND 40),
  origen         text CHECK (origen IS NULL OR origen ~ '^https://'),
  licencia       text CHECK (licencia IS NULL OR length(licencia) <= 60),
  instrucciones  text NOT NULL CHECK (length(instrucciones) BETWEEN 1 AND 100000),
  archivos       jsonb NOT NULL DEFAULT '[]',
  tiene_scripts  boolean NOT NULL DEFAULT false,
  dueno_id       uuid REFERENCES usuario(id) ON DELETE CASCADE,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX skill_catalogo_categoria_idx ON skill_catalogo (categoria, nombre);
COMMENT ON TABLE skill_catalogo IS 'Catálogo de skills de Jarvis (13 nov). dueno_id null = del catálogo de Inoo; con dueño = skill personal, solo la ve quien la escribió. archivos: [{nombre, texto}].';
COMMENT ON COLUMN skill_catalogo.tiene_scripts IS 'La skill original trae scripts: en Jarvis solo se usan sus instrucciones y archivos de texto';

CREATE TABLE skill_persona (
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  skill_id    uuid NOT NULL REFERENCES skill_catalogo(id) ON DELETE CASCADE,
  activada_en timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz,
  PRIMARY KEY (usuario_id, skill_id)
);
COMMENT ON TABLE skill_persona IS 'Skills que cada persona activó para su Jarvis (13 nov).';

CREATE TABLE conector_catalogo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  nombre      text NOT NULL CHECK (length(nombre) BETWEEN 1 AND 60),
  descripcion text NOT NULL DEFAULT '' CHECK (length(descripcion) <= 600),
  categoria   text NOT NULL DEFAULT 'General' CHECK (length(categoria) BETWEEN 1 AND 40),
  url         text NOT NULL CHECK (url ~ '^https://[^/\s]+'),
  auth        text NOT NULL DEFAULT 'NINGUNA' CHECK (auth IN ('NINGUNA', 'TOKEN', 'TOKEN_OPCIONAL')),
  cabecera    text NOT NULL DEFAULT 'Authorization' CHECK (cabecera ~ '^[A-Za-z0-9-]{1,40}$'),
  prefijo     text NOT NULL DEFAULT 'Bearer ' CHECK (length(prefijo) <= 20),
  ayuda_token text CHECK (ayuda_token IS NULL OR length(ayuda_token) <= 600),
  origen      text CHECK (origen IS NULL OR origen ~ '^https://'),
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE conector_catalogo IS 'Catálogo de servidores MCP remotos que cualquiera del equipo puede conectar a su Jarvis (13 nov). Sin credenciales: el token es de cada persona.';

CREATE TABLE conector_persona (
  usuario_id    uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  conector_id   uuid NOT NULL REFERENCES conector_catalogo(id) ON DELETE CASCADE,
  token_cifrado text,
  conectado_en  timestamptz NOT NULL DEFAULT now(),
  ultimo_uso    timestamptz,
  PRIMARY KEY (usuario_id, conector_id)
);
COMMENT ON TABLE conector_persona IS 'Conectores que cada persona conectó (13 nov). token_cifrado: su token, cifrado con AES-256-GCM; nunca en claro ni de vuelta a la pantalla.';

-- El catálogo lo ve todo el equipo (las skills personales, solo su dueño); lo de cada persona, solo ella. Jarvis
-- corre como la persona que chatea, y los procesos como SERVICIO.
ALTER TABLE skill_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalogo_o_propia ON skill_catalogo USING (
  NOT app_es_cliente() AND (dueno_id IS NULL OR dueno_id::text = coalesce(current_setting('app.usuario_id', true), '')
    OR coalesce(current_setting('app.usuario_tipo', true), '') = 'SERVICIO'));
ALTER TABLE conector_catalogo ENABLE ROW LEVEL SECURITY;
CREATE POLICY solo_equipo ON conector_catalogo USING (NOT app_es_cliente());
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_catalogo, conector_catalogo TO app_portal;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['skill_persona', 'conector_persona'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY solo_suya ON %I USING (
      usuario_id::text = coalesce(current_setting('app.usuario_id', true), '')
      OR coalesce(current_setting('app.usuario_tipo', true), '') = 'SERVICIO')$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_portal', t);
  END LOOP;
END $$;

-- Conectores de partida: los MCP remotos de Skillfera que funcionan por HTTP. Los que piden token los conecta
-- cada persona con el suyo. Ninguno queda conectado para nadie.
INSERT INTO conector_catalogo (slug, nombre, descripcion, categoria, url, auth, cabecera, prefijo, ayuda_token, origen) VALUES
  ('exa', 'Exa', 'Busca en internet y lee páginas web completas: competencia, referentes, noticias, datos de un cliente.', 'Investigación',
   'https://mcp.exa.ai/mcp', 'NINGUNA', 'Authorization', 'Bearer ', NULL, 'https://github.com/exa-labs/exa-mcp-server'),
  ('context7', 'Context7', 'Documentación al día de librerías y frameworks (React, Next.js, Supabase…), con ejemplos por versión. Para quien programa.', 'Desarrollo',
   'https://mcp.context7.com/mcp', 'TOKEN_OPCIONAL', 'Authorization', 'Bearer ', 'Funciona sin token, con límites. Para más consultas, crea una clave gratis en context7.com/dashboard y pégala aquí.', 'https://github.com/upstash/context7'),
  ('deepwiki', 'DeepWiki', 'Explica y responde preguntas sobre cualquier repositorio público de GitHub (cómo está hecho, dónde está algo).', 'Desarrollo',
   'https://mcp.deepwiki.com/mcp', 'NINGUNA', 'Authorization', 'Bearer ', NULL, 'https://docs.devin.ai/work-with-devin/deepwiki-mcp'),
  ('github', 'GitHub', 'Tus repositorios, issues, pull requests y Actions de GitHub, con tus permisos.', 'Desarrollo',
   'https://api.githubcopilot.com/mcp/', 'TOKEN', 'Authorization', 'Bearer ', 'En GitHub: Settings → Developer settings → Personal access tokens → Fine-grained. Elige solo los repos que necesitas y, si alcanza, permisos de solo lectura.', 'https://github.com/github/github-mcp-server'),
  ('apify', 'Apify', 'Usa los «actores» de Apify para sacar datos de webs y redes (Instagram, Google Maps, TikTok…).', 'Investigación',
   'https://mcp.apify.com', 'TOKEN', 'Authorization', 'Bearer ', 'En apify.com: Settings → API & Integrations → Personal API token. Cada uso gasta créditos de tu cuenta de Apify.', 'https://github.com/apify/apify-mcp-server'),
  ('stripe', 'Stripe', 'Consulta clientes, pagos y facturas de una cuenta de Stripe.', 'Finanzas',
   'https://mcp.stripe.com', 'TOKEN', 'Authorization', 'Bearer ', 'Usa una clave restringida (Developers → API keys → Create restricted key) con solo los permisos de lectura que necesitas; mejor en modo de prueba.', 'https://github.com/stripe/ai'),
  ('magic-21st', '21st.dev Magic', 'Genera y busca componentes de interfaz (React) de la librería de 21st.dev.', 'Diseño',
   'https://21st.dev/api/mcp', 'TOKEN', 'x-api-key', '', 'En 21st.dev: Magic → API key.', 'https://github.com/21st-dev/magic-mcp');

-- Skill de partida: la marca de Inoo (para que el catálogo no arranque vacío y sirva de ejemplo).
INSERT INTO skill_catalogo (slug, nombre, descripcion, categoria, instrucciones) VALUES
  ('marca-inoo', 'Marca Inoo', 'Cómo suena y se ve Inoo: tono directo, paleta y tipografía. Úsala al escribir textos o proponer piezas con la marca de Inoo.', 'Inoo',
   E'# Marca Inoo\n\n## Tono\n- Directo, claro y cercano. Frases cortas. Nada de relleno ni frases hechas.\n- Hablamos de resultados concretos, no de promesas.\n- Español neutro con trato de «tú».\n\n## Visual\n- 80 % blanco y negro. Tipografía Poppins.\n- Morado #AD4DFA y verde #21F921 solo como acentos (el punto del logo, una línea, un dato).\n- Para texto o enlaces en morado, #8B2FD6 (tiene contraste suficiente).\n- Botones principales en negro. Sin etiquetas en MAYÚSCULAS espaciadas.\n');
