-- =====================================================================
-- Oficina Virtual de IA + Portal de Clientes — Esquema de datos v1.1
-- v1.1 (6 oct 2026): ajustes tras cruzar con las pantallas de Figma del portal.
-- PostgreSQL 16 (Fase 1: Postgres en VPS Hostinger + NocoDB; Fase 2: Amazon RDS)
--
-- Convenciones
--   * snake_case en la base; la API expone camelCase.
--   * PK uuid (gen_random_uuid). Los tickets además tienen un número legible.
--   * Toda tabla con datos de un cliente lleva cliente_id (separación multi-cliente, PRD).
--   * Fechas en timestamptz (UTC). Periodos mensuales como texto 'AAAA-MM'.
--   * Los estados son enums de Postgres; los mismos valores viajan en la API.
--   * El estado de una pieza solo cambia por la función cambiar_estado_pieza(),
--     que valida la transición y escribe la auditoría. Así n8n (Fase 1, SQL directo)
--     y la API (Fase 2) respetan las mismas reglas.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
CREATE TYPE tipo_usuario       AS ENUM ('EQUIPO', 'CLIENTE', 'SERVICIO');
CREATE TYPE rol_equipo         AS ENUM ('ACCOUNT_MANAGER', 'DISENO', 'AUDIOVISUAL', 'PAID_MEDIA', 'DESARROLLO_WEB', 'ADMIN');
CREATE TYPE rol_cliente        AS ENUM ('ADMIN_CLIENTE', 'APROBADOR', 'LECTOR');
CREATE TYPE estado_cliente     AS ENUM ('ACTIVO', 'PAUSADO', 'BAJA');
CREATE TYPE tipo_referencia    AS ENUM ('MARCA_ADMIRADA', 'COMPETIDOR', 'PIEZA_EJEMPLO', 'MANUAL_MARCA', 'LOGO', 'OTRO');
CREATE TYPE categoria_servicio AS ENUM ('BLOG', 'REDES_SOCIALES', 'ESTATICOS', 'AUDIOVISUAL', 'PAID_MEDIA', 'WEB', 'CRM');
CREATE TYPE estado_servicio    AS ENUM ('ACTIVO', 'PAUSADO', 'FINALIZADO');
CREATE TYPE tipo_pieza         AS ENUM ('BLOG', 'COPY', 'ESTATICO', 'CARRUSEL', 'PORTADA', 'GUION', 'SHOTLIST', 'STORYBOARD',
                                        'PROTOTIPO_WEB', 'ANUNCIO', 'REPORTE');
CREATE TYPE estado_pieza       AS ENUM ('BORRADOR', 'EN_REVISION_INTERNA', 'LISTO_REVISION', 'APROBADO_CLIENTE',
                                        'CAMBIOS_SOLICITADOS', 'PUBLICADO');
CREATE TYPE estado_calendario  AS ENUM ('PROPUESTO', 'CAMBIOS_SOLICITADOS', 'APROBADO_PLAN');
CREATE TYPE estado_brief       AS ENUM ('BORRADOR', 'ENVIADO', 'CONFIRMADO');
CREATE TYPE estado_idea        AS ENUM ('PROPUESTA', 'ELEGIDA', 'DESCARTADA');
CREATE TYPE tipo_autor         AS ENUM ('AGENTE', 'PERSONA');
CREATE TYPE canal_decision     AS ENUM ('PORTAL', 'PANEL', 'TELEGRAM', 'SLACK', 'SISTEMA');
CREATE TYPE origen_archivo     AS ENUM ('CLIENTE', 'EQUIPO', 'AGENTE');
CREATE TYPE almacen_archivo    AS ENUM ('S3', 'DRIVE');
CREATE TYPE estado_archivo     AS ENUM ('PENDIENTE_SUBIDA', 'SUBIDO', 'DISPONIBLE', 'ELIMINADO');
CREATE TYPE uso_archivo        AS ENUM ('BRIEF', 'ADJUNTO_TICKET', 'BIBLIOTECA', 'ENTREGABLE', 'CONTRATO', 'INFORME');
CREATE TYPE categoria_ticket   AS ENUM ('MARKETING', 'DISENO', 'WEB', 'FACTURACION', 'OTRO');
CREATE TYPE urgencia_ticket    AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');
CREATE TYPE estado_ticket      AS ENUM ('ABIERTO', 'EN_PROCESO', 'ESPERANDO_CLIENTE', 'RESUELTO', 'CERRADO');
CREATE TYPE estado_hito        AS ENUM ('SIN_INICIAR', 'EN_PROGRESO', 'EN_REVISION', 'COMPLETADO', 'BLOQUEADO');
CREATE TYPE estado_ejecucion   AS ENUM ('EN_CURSO', 'OK', 'ERROR', 'CANCELADA');
CREATE TYPE estado_envio       AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO');
CREATE TYPE metrica_canal      AS ENUM ('ALCANCE', 'VISITAS_SITIO', 'CONTACTOS', 'COMPRAS', 'CLIENTES_RECURRENTES', 'IMPRESIONES', 'INTERACCIONES', 'CLICS');

-- ---------------------------------------------------------------------
-- Identidad y acceso
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub      text UNIQUE,                 -- null en Fase 1 (sin Cognito)
  email            citext NOT NULL UNIQUE,
  nombre           text NOT NULL,
  cargo            text,                        -- 'Administradora', 'Coordinación de contenidos'
  tipo             tipo_usuario NOT NULL,
  rol_equipo       rol_equipo,                  -- solo tipo EQUIPO
  inoowork_empleado_id text,                    -- p. ej. 'EMP-002', para asignar tareas
  telegram_chat_id text,
  slack_user_id    text,
  activo           boolean NOT NULL DEFAULT true,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rol_equipo_coherente CHECK ((tipo = 'EQUIPO') = (rol_equipo IS NOT NULL))
);

CREATE TABLE cliente (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               text NOT NULL,
  slug                 text NOT NULL UNIQUE,     -- nombre de carpeta en Drive
  estado               estado_cliente NOT NULL DEFAULT 'ACTIVO',
  marca                jsonb NOT NULL DEFAULT '{}',  -- {descripcion, mensajeCentral, campanaActual, valores[], paleta[], tipografias[]}
  tono                 jsonb NOT NULL DEFAULT '{}',  -- {etiquetas[], descripcion, ejemplo}
  publico              jsonb NOT NULL DEFAULT '{}',  -- {descripcion, intereses[], segmentos}
  pilares_contenido    text[] NOT NULL DEFAULT '{}',
  canales              text[] NOT NULL DEFAULT '{}', -- 'INSTAGRAM','LINKEDIN','FACEBOOK','TIKTOK','BLOG','WEB'
  wordpress_url        text,
  account_manager_id   uuid REFERENCES usuario(id),
  contacto_principal_id uuid REFERENCES usuario(id),   -- el contacto del cliente que se muestra en panel y ficha
  drive_carpeta_id     text,                     -- 01_Clientes/<Cliente>/
  drive_carpetas       jsonb NOT NULL DEFAULT '{}', -- {marca, contenidoCliente, briefs, entregables}
  drive_url            text,
  limite_gasto_ia_usd  numeric(10,2) NOT NULL DEFAULT 25.00,
  umbral_alerta_pct    smallint NOT NULL DEFAULT 80 CHECK (umbral_alerta_pct BETWEEN 1 AND 100),
  creado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_en       timestamptz NOT NULL DEFAULT now()
);

-- Usuarios del cliente y su permiso dentro de esa cuenta (POR-01).
CREATE TABLE miembro_cliente (
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  rol         rol_cliente NOT NULL DEFAULT 'APROBADOR',
  creado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, usuario_id)
);

-- Llaves de integración (n8n, InooWork). Se guarda solo el hash.
CREATE TABLE api_key (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,                     -- 'n8n-produccion', 'inoowork'
  prefijo     text NOT NULL UNIQUE,              -- primeros 8 caracteres, para identificarla
  hash        text NOT NULL,                     -- sha256 de la llave completa
  scopes      text[] NOT NULL,                   -- 'piezas:write','ejecuciones:write','tickets:sync',...
  activa      boolean NOT NULL DEFAULT true,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_uso  timestamptz
);

-- ---------------------------------------------------------------------
-- Perfil del cliente: referencias y briefs (CLI-01, CLI-02, MKT-01)
-- ---------------------------------------------------------------------
CREATE TABLE archivo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  origen                origen_archivo NOT NULL,
  almacen               almacen_archivo NOT NULL,
  s3_key                text,
  drive_file_id         text,
  nombre                text NOT NULL,
  mime                  text NOT NULL,
  bytes                 bigint CHECK (bytes >= 0),
  sha256                text,
  categoria             text,                    -- 'FOTO','VIDEO','DOCUMENTO','LOGO',...
  etiquetas             text[] NOT NULL DEFAULT '{}',
  uso                   uso_archivo NOT NULL,
  brief_id              uuid,                    -- FK abajo; archivos subidos dentro de un brief
  estado                estado_archivo NOT NULL DEFAULT 'PENDIENTE_SUBIDA',
  -- Declaración de derechos de uso (POR-05, riesgo del PRD)
  declara_derechos      boolean NOT NULL DEFAULT false,
  declarado_por         uuid REFERENCES usuario(id),
  declarado_en          timestamptz,
  subido_por            uuid REFERENCES usuario(id),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ubicacion_coherente CHECK (
    (almacen = 'S3' AND s3_key IS NOT NULL) OR (almacen = 'DRIVE' AND drive_file_id IS NOT NULL)),
  -- La declaración se firma al enviar el brief: un archivo del cliente para la biblioteca
  -- no queda DISPONIBLE sin ella. Los adjuntos de tickets no la necesitan.
  CONSTRAINT derechos_cliente CHECK (
    origen <> 'CLIENTE' OR uso = 'ADJUNTO_TICKET' OR estado <> 'DISPONIBLE'
    OR (declara_derechos AND declarado_por IS NOT NULL AND declarado_en IS NOT NULL))
);
CREATE INDEX archivo_cliente_idx ON archivo (cliente_id, estado, creado_en DESC);

CREATE TABLE referencia_cliente (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  tipo        tipo_referencia NOT NULL DEFAULT 'OTRO',
  titulo      text NOT NULL,                     -- 'Natura Perú', 'Referencia de fotografía y tono editorial'
  url         text,
  archivo_id  uuid REFERENCES archivo(id),
  notas       text,                              -- qué tomar como inspiración
  paleta      text[] NOT NULL DEFAULT '{}',      -- colores hex destacados de la referencia
  creado_por  uuid REFERENCES usuario(id),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referencia_con_fuente CHECK (url IS NOT NULL OR archivo_id IS NOT NULL OR notas IS NOT NULL)
);
CREATE INDEX referencia_cliente_idx ON referencia_cliente (cliente_id, tipo);

CREATE TABLE brief (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  periodo        char(7) NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- Lo llena el cliente desde el portal ("El enfoque de este mes") y el AM lo completa
  objetivo_comunicacion text,
  consideraciones text,
  contenido_md   text,                           -- versión ampliada del AM para los agentes
  drive_file_id  text,
  estado         estado_brief NOT NULL DEFAULT 'BORRADOR',
  declara_derechos boolean NOT NULL DEFAULT false,
  enviado_por    uuid REFERENCES usuario(id),
  enviado_en     timestamptz,
  confirmado_por uuid REFERENCES usuario(id),
  confirmado_en  timestamptz,
  creado_por     uuid REFERENCES usuario(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, periodo),
  CONSTRAINT envio_con_derechos CHECK (estado = 'BORRADOR' OR (declara_derechos AND enviado_por IS NOT NULL))
);
ALTER TABLE archivo ADD CONSTRAINT archivo_brief_fk FOREIGN KEY (brief_id) REFERENCES brief(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- Servicios contratados (POR-02) y su enlace con proyectos de InooWork (INO-07)
-- ---------------------------------------------------------------------
CREATE TABLE servicio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text NOT NULL UNIQUE,              -- 'CONTENIDO_MENSUAL','PAID_MEDIA','WEB','CRM',...
  nombre      text NOT NULL,
  categoria   categoria_servicio NOT NULL UNIQUE,  -- un servicio de catálogo por categoría
  descripcion text,                              -- 'Artículos optimizados y propuestas editoriales.'
  unidad      text NOT NULL DEFAULT 'piezas',    -- 'artículos', 'piezas', 'diseños'
  orden       smallint NOT NULL DEFAULT 0
);

INSERT INTO servicio (codigo, nombre, categoria, descripcion, unidad, orden) VALUES
  ('BLOG',           'Blog',           'BLOG',           'Artículos optimizados y propuestas editoriales.',                'artículos', 1),
  ('REDES_SOCIALES', 'Redes sociales', 'REDES_SOCIALES', 'Contenido para Instagram y Facebook. Incluye guiones de reel.', 'piezas',    2),
  ('ESTATICOS',      'Estáticos',      'ESTATICOS',      'Diseños de marca para tus canales digitales.',                  'diseños',   3),
  ('AUDIOVISUAL',    'Audiovisual',    'AUDIOVISUAL',    'Producción y edición de video.',                                'videos',    4),
  ('PAID_MEDIA',     'Paid media',     'PAID_MEDIA',     'Gestión de campañas y pauta digital.',                          'campañas',  5),
  ('WEB',            'Web',            'WEB',            'Diseño y desarrollo de sitios web.',                            'entregas',  6),
  ('CRM',            'CRM',            'CRM',            'Automatización y gestión de contactos.',                        'entregas',  7);

-- Plan comercial del cliente ("Plan Crecimiento · Contrato hasta el 31 dic 2026").
CREATE TABLE plan_cliente (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  fecha_inicio        date NOT NULL,
  fecha_fin           date,
  contrato_archivo_id uuid REFERENCES archivo(id),
  vigente             boolean NOT NULL DEFAULT true,
  creado_en           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plan_vigente_unico ON plan_cliente (cliente_id) WHERE vigente;

CREATE TABLE servicio_contratado (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  servicio_id           uuid NOT NULL REFERENCES servicio(id),
  plan_id               uuid REFERENCES plan_cliente(id),
  alcance               text,
  siguiente_paso        text,                    -- "Revisar «5 hábitos…» y confirmar la idea pendiente"
  siguiente_paso_responsable_id uuid REFERENCES usuario(id),
  estado                estado_servicio NOT NULL DEFAULT 'ACTIVO',
  fecha_inicio          date NOT NULL,
  fecha_fin             date,
  inoowork_proyecto_id  text,                    -- 'PROJ-ABC123'
  creado_en             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, cliente_id)
);
CREATE INDEX servicio_contratado_cliente_idx ON servicio_contratado (cliente_id, estado);

-- Entregables incluidos por mes: permite "consumo vs lo contratado".
CREATE TABLE entregable_incluido (
  servicio_contratado_id uuid NOT NULL REFERENCES servicio_contratado(id) ON DELETE CASCADE,
  tipo_pieza             tipo_pieza NOT NULL,
  cantidad_mensual       integer NOT NULL CHECK (cantidad_mensual > 0),
  PRIMARY KEY (servicio_contratado_id, tipo_pieza)
);

-- Copia saneada de los ítems del proyecto de InooWork (sin notas internas).
-- La llena la sincronización; el portal lee de aquí, nunca de InooWork directo.
CREATE TABLE hito_proyecto (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL REFERENCES servicio_contratado(id) ON DELETE CASCADE,
  inoowork_item_id       text NOT NULL,
  grupo                  text,
  titulo                 text NOT NULL,
  estado                 estado_hito NOT NULL,
  responsable_nombre     text,
  periodo                char(7),                -- hitos mensuales: Planificación, Producción, Revisión, Publicación
  fecha_inicio           date,
  fecha_estimada         date,                   -- fin previsto
  espera_cliente         boolean NOT NULL DEFAULT false,  -- "Tu siguiente paso"
  nota_cliente           text,                   -- "Por pieza aprobada"
  visible_cliente        boolean NOT NULL DEFAULT true,
  orden                  integer NOT NULL DEFAULT 0,
  sincronizado_en        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (servicio_contratado_id, inoowork_item_id)
);

-- ---------------------------------------------------------------------
-- Planificación: calendario editorial e ideas de blog (MKT-01, POR-04)
-- ---------------------------------------------------------------------
CREATE TABLE calendario (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  periodo       char(7) NOT NULL CHECK (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  brief_id      uuid REFERENCES brief(id),
  estado        estado_calendario NOT NULL DEFAULT 'PROPUESTO',
  version       integer NOT NULL DEFAULT 1,
  resumen       text,
  cupo_ideas_blog smallint NOT NULL DEFAULT 0,   -- cuántas ideas de blog elige el cliente este mes
  aprobado_por  uuid REFERENCES usuario(id),
  aprobado_en   timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, periodo)
);

CREATE TABLE idea_blog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  periodo     char(7) NOT NULL,
  titulo      text NOT NULL,
  palabra_clave text,
  angulo      text,
  resumen     text,
  fuentes     jsonb NOT NULL DEFAULT '[]',       -- [{titulo, url}]
  estado      estado_idea NOT NULL DEFAULT 'PROPUESTA',
  decidido_por uuid REFERENCES usuario(id),
  decidido_en timestamptz,
  pieza_id    uuid,                              -- FK abajo: la pieza BLOG creada al elegirla
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idea_blog_cliente_idx ON idea_blog (cliente_id, periodo, estado);

-- ---------------------------------------------------------------------
-- Piezas (entregables), versiones, auditoría y comentarios
-- ---------------------------------------------------------------------
CREATE TABLE pieza (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id             uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  servicio_contratado_id uuid,
  calendario_id          uuid REFERENCES calendario(id),
  tipo                   tipo_pieza NOT NULL,
  titulo                 text NOT NULL,
  resumen                text,                        -- una línea que ve el cliente en listas
  canal                  text,
  periodo                char(7) NOT NULL,
  fecha_programada       timestamptz,
  estado                 estado_pieza NOT NULL DEFAULT 'BORRADOR',
  version_actual         integer NOT NULL DEFAULT 0,  -- última versión creada
  version_cliente        integer,                     -- versión que ve el cliente (la enviada a LISTO_REVISION)
  responsable_id         uuid REFERENCES usuario(id), -- persona del equipo que revisa
  nota_estado            text,                        -- "Lista para programar", "Ajustes antes de volver a revisión" 
  etiquetas              text[] NOT NULL DEFAULT '{}',-- pilar, objetivo, formato (biblioteca paid media)
  apta_paid_media        boolean NOT NULL DEFAULT false,
  inoowork_item_id       text,
  wordpress_post_id      text,
  publicado_url          text,
  publicado_en           timestamptz,
  creado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  -- la pieza y su servicio deben ser del mismo cliente
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id)
);
CREATE INDEX pieza_cliente_estado_idx ON pieza (cliente_id, estado, periodo);
CREATE INDEX pieza_calendario_idx ON pieza (calendario_id);
CREATE INDEX pieza_paid_idx ON pieza USING gin (etiquetas) WHERE apta_paid_media;

ALTER TABLE idea_blog ADD CONSTRAINT idea_blog_pieza_fk FOREIGN KEY (pieza_id) REFERENCES pieza(id);

-- Cada versión es inmutable: autor, contenido, fuentes y archivo (trazabilidad, PRD).
CREATE TABLE version_pieza (
  pieza_id         uuid NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
  numero           integer NOT NULL CHECK (numero > 0),
  autor_tipo       tipo_autor NOT NULL,
  autor_usuario_id uuid REFERENCES usuario(id),
  agente           text,                         -- 'contenido-blog','estaticos',...
  contenido        jsonb NOT NULL DEFAULT '{}',  -- estructura según tipo (ver contrato API)
  fuentes          jsonb NOT NULL DEFAULT '[]',  -- [{titulo, url}]
  archivo_id       uuid REFERENCES archivo(id),  -- docx/png/pdf en Drive o S3
  vista_previa_url text,                         -- prototipos web
  ejecucion_id     uuid,                         -- FK abajo
  nota_cambios     text,
  enviada_cliente_en timestamptz,                -- cuándo pasó a LISTO_REVISION; solo estas versiones ve el cliente
  enviada_por      uuid REFERENCES usuario(id),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pieza_id, numero),
  CONSTRAINT autor_coherente CHECK (
    (autor_tipo = 'AGENTE' AND agente IS NOT NULL) OR (autor_tipo = 'PERSONA' AND autor_usuario_id IS NOT NULL))
);

-- Auditoría de estados: quién aprobó qué, cuándo y por qué canal.
CREATE TABLE evento_pieza (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pieza_id    uuid NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
  de_estado   estado_pieza,
  a_estado    estado_pieza NOT NULL,
  version     integer,
  usuario_id  uuid REFERENCES usuario(id),
  canal       canal_decision NOT NULL,
  comentario  text,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evento_pieza_idx ON evento_pieza (pieza_id, creado_en);

CREATE TABLE comentario_pieza (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pieza_id    uuid NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
  version     integer,
  autor_id    uuid NOT NULL REFERENCES usuario(id),
  texto       text NOT NULL,
  interno     boolean NOT NULL DEFAULT false,    -- true: solo lo ve el equipo
  ancla       jsonb,                             -- opcional: {parrafo} o {x,y} sobre imagen
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comentario_pieza_idx ON comentario_pieza (pieza_id, creado_en);

-- Transiciones válidas de una pieza (PRD + CU-06).
CREATE TABLE transicion_pieza (
  de_estado estado_pieza NOT NULL,
  a_estado  estado_pieza NOT NULL,
  actor     tipo_usuario NOT NULL,               -- quién puede hacerla
  PRIMARY KEY (de_estado, a_estado, actor)
);
INSERT INTO transicion_pieza VALUES
  ('BORRADOR',            'EN_REVISION_INTERNA', 'SERVICIO'),
  ('BORRADOR',            'EN_REVISION_INTERNA', 'EQUIPO'),
  ('EN_REVISION_INTERNA', 'BORRADOR',            'EQUIPO'),
  ('EN_REVISION_INTERNA', 'LISTO_REVISION',      'EQUIPO'),   -- humano en el loop: solo el equipo
  ('LISTO_REVISION',      'APROBADO_CLIENTE',    'CLIENTE'),
  ('LISTO_REVISION',      'CAMBIOS_SOLICITADOS', 'CLIENTE'),
  ('LISTO_REVISION',      'APROBADO_CLIENTE',    'EQUIPO'),   -- AM aprueba en nombre del cliente (Fase 1)
  ('LISTO_REVISION',      'CAMBIOS_SOLICITADOS', 'EQUIPO'),
  ('LISTO_REVISION',      'EN_REVISION_INTERNA', 'EQUIPO'),   -- retirar del portal
  ('CAMBIOS_SOLICITADOS', 'BORRADOR',            'SERVICIO'), -- el agente regenera
  ('CAMBIOS_SOLICITADOS', 'EN_REVISION_INTERNA', 'EQUIPO'),
  ('APROBADO_CLIENTE',    'EN_REVISION_INTERNA', 'EQUIPO'),   -- nueva versión tras aprobar (la aprobación no se hereda)
  ('APROBADO_CLIENTE',    'PUBLICADO',           'SERVICIO'),
  ('APROBADO_CLIENTE',    'PUBLICADO',           'EQUIPO');

CREATE OR REPLACE FUNCTION cambiar_estado_pieza(
  p_pieza_id uuid, p_a_estado estado_pieza, p_usuario_id uuid,
  p_canal canal_decision, p_comentario text DEFAULT NULL, p_version_esperada integer DEFAULT NULL)
RETURNS pieza LANGUAGE plpgsql AS $$
DECLARE
  v_pieza pieza;
  v_actor tipo_usuario;
  v_de    estado_pieza;
BEGIN
  SELECT * INTO v_pieza FROM pieza WHERE id = p_pieza_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PIEZA_NO_ENCONTRADA' USING ERRCODE = 'P0002'; END IF;

  SELECT tipo INTO v_actor FROM usuario WHERE id = p_usuario_id;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'USUARIO_NO_ENCONTRADO' USING ERRCODE = 'P0002'; END IF;

  -- Un cliente solo actúa sobre piezas de su cuenta y si su rol se lo permite.
  IF v_actor = 'CLIENTE' AND NOT EXISTS (
       SELECT 1 FROM miembro_cliente m
       WHERE m.cliente_id = v_pieza.cliente_id AND m.usuario_id = p_usuario_id
         AND m.rol IN ('ADMIN_CLIENTE', 'APROBADOR')) THEN
    RAISE EXCEPTION 'SIN_PERMISO' USING ERRCODE = '42501';
  END IF;

  -- Concurrencia: el cliente aprueba exactamente la versión que vio.
  IF p_version_esperada IS NOT NULL AND p_version_esperada IS DISTINCT FROM v_pieza.version_cliente THEN
    RAISE EXCEPTION 'VERSION_DESACTUALIZADA' USING ERRCODE = '40001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM transicion_pieza
                 WHERE de_estado = v_pieza.estado AND a_estado = p_a_estado AND actor = v_actor) THEN
    RAISE EXCEPTION 'TRANSICION_INVALIDA % -> % (%)', v_pieza.estado, p_a_estado, v_actor USING ERRCODE = '23514';
  END IF;

  IF p_a_estado = 'CAMBIOS_SOLICITADOS' AND coalesce(trim(p_comentario), '') = '' THEN
    RAISE EXCEPTION 'COMENTARIO_REQUERIDO' USING ERRCODE = '23502';
  END IF;

  v_de := v_pieza.estado;
  IF p_a_estado = 'LISTO_REVISION' THEN
    UPDATE version_pieza SET enviada_cliente_en = now(), enviada_por = p_usuario_id
    WHERE pieza_id = p_pieza_id AND numero = v_pieza.version_actual;
  END IF;

  UPDATE pieza SET
    estado          = p_a_estado,
    version_cliente = CASE WHEN p_a_estado = 'LISTO_REVISION' THEN version_actual ELSE version_cliente END,
    publicado_en    = CASE WHEN p_a_estado = 'PUBLICADO' THEN now() ELSE publicado_en END,
    actualizado_en  = now()
  WHERE id = p_pieza_id
  RETURNING * INTO v_pieza;

  INSERT INTO evento_pieza (pieza_id, de_estado, a_estado, version, usuario_id, canal, comentario)
  VALUES (p_pieza_id, v_de, p_a_estado, v_pieza.version_cliente, p_usuario_id, p_canal, p_comentario);

  INSERT INTO outbox_evento (tipo, cliente_id, payload)
  VALUES ('pieza.estado_cambiado', v_pieza.cliente_id,
          jsonb_build_object('piezaId', v_pieza.id, 'estado', p_a_estado, 'usuarioId', p_usuario_id,
                             'canal', p_canal, 'comentario', p_comentario));
  RETURN v_pieza;
END $$;

-- ---------------------------------------------------------------------
-- Soporte: tickets (INO-03, INO-08)
-- ---------------------------------------------------------------------
CREATE TABLE ticket (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                   bigint GENERATED ALWAYS AS IDENTITY (START WITH 1001) UNIQUE,  -- se muestra como #1042
  cliente_id               uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  creado_por               uuid NOT NULL REFERENCES usuario(id),
  asunto                   text NOT NULL,
  categoria                categoria_ticket NOT NULL,
  descripcion              text NOT NULL,
  urgencia                 urgencia_ticket,                  -- la clasifica Gemini Flash-Lite
  urgencia_justificacion   text,
  estado                   estado_ticket NOT NULL DEFAULT 'ABIERTO',
  resumen_estado           text,                             -- "Diego Castro está revisando tu solicitud."
  area_asignada            text,                             -- área de InooWork
  asignado_nombre          text,
  inoowork_ref             text,                             -- id del ítem/ticket en InooWork
  pieza_id                 uuid REFERENCES pieza(id),        -- opcional: ticket sobre una pieza
  sla_primera_respuesta_en timestamptz NOT NULL,             -- creado + 1 día hábil
  primera_respuesta_en     timestamptz,
  resuelto_en              timestamptz,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_cliente_idx ON ticket (cliente_id, estado, creado_en DESC);

CREATE TABLE ticket_mensaje (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  autor_id    uuid REFERENCES usuario(id),
  autor_nombre text NOT NULL,                    -- se copia porque puede venir de InooWork
  texto       text NOT NULL,
  interno     boolean NOT NULL DEFAULT false,
  archivo_ids uuid[] NOT NULL DEFAULT '{}',
  origen      text NOT NULL DEFAULT 'PORTAL',    -- 'PORTAL' | 'INOOWORK'
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_mensaje_idx ON ticket_mensaje (ticket_id, creado_en);

-- ---------------------------------------------------------------------
-- Agentes y costos (ADM-01, límite US$25 y alerta 80 %)
-- ---------------------------------------------------------------------
CREATE TABLE ejecucion_agente (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id        uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  agente            text NOT NULL,               -- 'marketing-jefe','contenido-blog','estaticos',...
  n8n_workflow_id   text,
  n8n_execution_id  text,
  pieza_id          uuid REFERENCES pieza(id),
  estado            estado_ejecucion NOT NULL DEFAULT 'EN_CURSO',
  error             text,
  iniciado_en       timestamptz NOT NULL DEFAULT now(),
  finalizado_en     timestamptz,
  UNIQUE (n8n_execution_id, agente)
);
CREATE INDEX ejecucion_cliente_idx ON ejecucion_agente (cliente_id, iniciado_en DESC);

-- Una fila por llamada a modelo (una ejecución puede usar varios modelos).
CREATE TABLE consumo_modelo (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ejecucion_id    uuid NOT NULL REFERENCES ejecucion_agente(id) ON DELETE CASCADE,
  cliente_id      uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  proveedor       text NOT NULL,                 -- 'google','openai','anthropic','replicate'
  modelo          text NOT NULL,                 -- 'gemini-3.8-flash','gpt-6.1-sol',...
  tokens_entrada  integer NOT NULL DEFAULT 0,
  tokens_salida   integer NOT NULL DEFAULT 0,
  imagenes        integer NOT NULL DEFAULT 0,
  costo_usd       numeric(12,6) NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consumo_cliente_mes_idx ON consumo_modelo (cliente_id, creado_en);

ALTER TABLE version_pieza ADD CONSTRAINT version_ejecucion_fk FOREIGN KEY (ejecucion_id) REFERENCES ejecucion_agente(id);

-- Tarifas vigentes (hoja 1 del Excel); permite el cambio de Gemini 3.8 Flash el 1 ene 2027.
CREATE TABLE tarifa_modelo (
  modelo                text NOT NULL,
  vigente_desde         date NOT NULL,
  usd_millon_entrada    numeric(10,4) NOT NULL,
  usd_millon_salida     numeric(10,4) NOT NULL,
  usd_por_imagen        numeric(10,4),
  PRIMARY KEY (modelo, vigente_desde)
);
INSERT INTO tarifa_modelo VALUES
  ('gemini-3.8-flash',      '2026-10-01', 0.75, 3.75, NULL),
  ('gemini-3.8-flash',      '2027-01-01', 1.50, 7.50, NULL),
  ('gemini-3.5-flash-lite', '2026-10-01', 0.30, 2.50, NULL),
  ('gpt-6.1-sol',           '2026-10-01', 2.00, 10.00, NULL),
  ('gpt-5.4-mini',          '2026-10-01', 0.75, 4.50, NULL),
  ('gpt-image-2',           '2026-10-01', 5.00, 30.00, 0.12),
  ('claude-opus-5.5',       '2026-10-01', 4.00, 20.00, NULL),
  ('claude-sonnet-5.5',     '2026-10-01', 2.00, 10.00, NULL);

CREATE VIEW gasto_ia_mensual AS
SELECT c.id AS cliente_id,
       to_char(date_trunc('month', cm.creado_en AT TIME ZONE 'America/Lima'), 'YYYY-MM') AS periodo,
       sum(cm.costo_usd)::numeric(12,4) AS gasto_usd,
       c.limite_gasto_ia_usd,
       round(100 * sum(cm.costo_usd) / nullif(c.limite_gasto_ia_usd, 0), 1) AS pct_limite
FROM consumo_modelo cm JOIN cliente c ON c.id = cm.cliente_id
GROUP BY c.id, 2, c.limite_gasto_ia_usd;

-- ---------------------------------------------------------------------
-- Resultados y customer journey (PRG-01, POR-06)
-- ---------------------------------------------------------------------
CREATE TABLE metrica_pieza (
  pieza_id      uuid NOT NULL REFERENCES pieza(id) ON DELETE CASCADE,
  cliente_id    uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  fecha         date NOT NULL,
  canal         text NOT NULL,
  impresiones   integer NOT NULL DEFAULT 0,
  alcance       integer NOT NULL DEFAULT 0,
  interacciones integer NOT NULL DEFAULT 0,
  clics         integer NOT NULL DEFAULT 0,
  extra         jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (pieza_id, fecha, canal)
);
CREATE INDEX metrica_cliente_fecha_idx ON metrica_pieza (cliente_id, fecha);

-- Decisión por defecto (pregunta abierta del PRD): el journey es un mapa de etapas que diseña
-- el equipo, con un valor por periodo que se carga a mano o se importa (GA4/CRM) más adelante.
-- Métricas diarias del cliente por canal (redes y sitio), para KPIs y "Rendimiento por canal".
-- canal: 'INSTAGRAM','FACEBOOK','BLOG','SITIO','TOTAL'. Las carga n8n desde las APIs de redes y GA4.
CREATE TABLE metrica_cliente (
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  fecha       date NOT NULL,
  canal       text NOT NULL,
  metrica     metrica_canal NOT NULL,
  valor       numeric(14,2) NOT NULL,
  fuente      text NOT NULL DEFAULT 'MANUAL',    -- 'META','GA4','CRM','MANUAL'
  es_muestra  boolean NOT NULL DEFAULT false,    -- datos de ejemplo, el portal lo avisa
  PRIMARY KEY (cliente_id, fecha, canal, metrica)
);

CREATE TABLE journey_etapa (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  orden       smallint NOT NULL,
  nombre      text NOT NULL,                     -- 'Descubrimiento','Interés','Consideración','Compra','Fidelización'
  descripcion text,                              -- 'personas alcanzadas'
  metrica     metrica_canal,                     -- si está, el valor sale de metrica_cliente (canal TOTAL)
  UNIQUE (cliente_id, orden)
);
CREATE TABLE journey_valor (
  etapa_id    uuid NOT NULL REFERENCES journey_etapa(id) ON DELETE CASCADE,
  periodo     char(7) NOT NULL,
  valor       numeric(14,2) NOT NULL,
  fuente      text NOT NULL DEFAULT 'MANUAL',    -- 'MANUAL' | 'GA4' | 'CRM'
  PRIMARY KEY (etapa_id, periodo)
);

-- Lectura del periodo ("Lo que nos dicen los datos") e informe descargable.
-- La redacta el agente con Gemini y la publica una persona del equipo.
CREATE TABLE resumen_resultados (
  cliente_id     uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  periodo        char(7) NOT NULL,
  texto          text NOT NULL,
  informe_archivo_id uuid REFERENCES archivo(id),  -- PDF de "Descargar informe"
  publicado      boolean NOT NULL DEFAULT false,
  publicado_por  uuid REFERENCES usuario(id),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, periodo)
);

-- ---------------------------------------------------------------------
-- Notificaciones del portal (campana)
-- ---------------------------------------------------------------------
CREATE TABLE notificacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  cliente_id  uuid REFERENCES cliente(id) ON DELETE CASCADE,
  tipo        text NOT NULL,                     -- 'PIEZAS_LISTAS','PIEZA_APROBADA','TICKET_RESPONDIDO','TICKET_CREADO',...
  titulo      text NOT NULL,                     -- 'Tienes contenido nuevo'
  cuerpo      text,                              -- '4 piezas listas para revisión...'
  enlace      text,                              -- ruta del portal: '/entregables', '/tickets/{id}'
  leida_en    timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notificacion_usuario_idx ON notificacion (usuario_id, creado_en DESC) WHERE leida_en IS NULL;

-- ---------------------------------------------------------------------
-- Correos automáticos (INO-04) y eventos salientes (outbox)
-- ---------------------------------------------------------------------
CREATE TABLE regla_correo (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento       text NOT NULL,                    -- 'pieza.lista_revision','ticket.resuelto',...
  plantilla    text NOT NULL,                    -- nombre de plantilla SES
  destinatarios text NOT NULL,                   -- 'MIEMBROS_CLIENTE' | 'ACCOUNT_MANAGER' | 'AMBOS'
  cliente_id   uuid REFERENCES cliente(id) ON DELETE CASCADE,  -- null = regla global
  activa       boolean NOT NULL DEFAULT true,
  descripcion  text NOT NULL                     -- texto que ve el cliente: "Te avisamos cuando..."
);

CREATE TABLE correo_enviado (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   uuid NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
  regla_id     uuid REFERENCES regla_correo(id),
  para         citext NOT NULL,
  asunto       text NOT NULL,
  estado       estado_envio NOT NULL DEFAULT 'PENDIENTE',
  ses_message_id text,
  enviado_en   timestamptz,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX correo_cliente_idx ON correo_enviado (cliente_id, creado_en DESC);

-- Transactional outbox: la API escribe el evento en la misma transacción que el cambio;
-- un despachador lo entrega a n8n (webhook firmado) y marca entregado_en.
CREATE TABLE outbox_evento (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo          text NOT NULL,
  cliente_id    uuid,
  payload       jsonb NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  entregado_en  timestamptz,
  intentos      integer NOT NULL DEFAULT 0,
  ultimo_error  text
);
CREATE INDEX outbox_pendiente_idx ON outbox_evento (id) WHERE entregado_en IS NULL;

-- Idempotencia de POST (aprobaciones, tickets, subidas): misma Idempotency-Key = misma respuesta.
CREATE TABLE idempotencia (
  clave        text NOT NULL,
  usuario_id   uuid NOT NULL,
  hash_peticion text NOT NULL,
  estado_http  smallint NOT NULL,
  respuesta    jsonb NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, clave)
);

-- ---------------------------------------------------------------------
-- Aislamiento por cliente (defensa en profundidad, Fase 2)
-- La API fija por conexión: SET app.usuario_tipo = 'CLIENTE'; SET app.cliente_ids = '{uuid,...}'.
-- El equipo y los servicios usan un rol de BD sin RLS (BYPASSRLS) o app.usuario_tipo <> 'CLIENTE'.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_puede_ver_cliente(p_cliente_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.usuario_tipo', true), '') <> 'CLIENTE'
      OR p_cliente_id = ANY (coalesce(nullif(current_setting('app.cliente_ids', true), ''), '{}')::uuid[]);
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['archivo','referencia_cliente','brief','plan_cliente','servicio_contratado','calendario','idea_blog',
                           'pieza','ticket','ejecucion_agente','consumo_modelo','metrica_pieza','metrica_cliente',
                           'journey_etapa','resumen_resultados','correo_enviado']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY aislamiento_cliente ON %I USING (app_puede_ver_cliente(cliente_id))', t);
  END LOOP;
END $$;

-- El cliente ve todas sus piezas en listas y calendario (las que están en BORRADOR o
-- EN_REVISION_INTERNA le llegan como EN_PRODUCCION, sin contenido), pero nunca el contenido
-- de una versión que el equipo no le envió, ni comentarios internos.
CREATE OR REPLACE FUNCTION app_es_cliente() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.usuario_tipo', true), '') = 'CLIENTE';
$$;

ALTER TABLE version_pieza ENABLE ROW LEVEL SECURITY;
CREATE POLICY version_visible ON version_pieza USING (
  NOT app_es_cliente()
  OR (enviada_cliente_en IS NOT NULL AND EXISTS (SELECT 1 FROM pieza p WHERE p.id = pieza_id)));

ALTER TABLE comentario_pieza ENABLE ROW LEVEL SECURITY;
CREATE POLICY comentario_visible ON comentario_pieza USING (
  NOT app_es_cliente()
  OR (NOT interno AND EXISTS (SELECT 1 FROM pieza p WHERE p.id = pieza_id)));

ALTER TABLE resumen_resultados ADD CONSTRAINT resumen_publicado CHECK (NOT publicado OR publicado_por IS NOT NULL);
CREATE POLICY resumen_solo_publicado ON resumen_resultados AS RESTRICTIVE USING (NOT app_es_cliente() OR publicado);
