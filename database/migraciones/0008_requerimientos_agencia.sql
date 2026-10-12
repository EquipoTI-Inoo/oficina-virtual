-- =====================================================================
-- Requerimientos de la agencia al cliente (reunión del 12 oct 2026). Reemplazan a los
-- requerimientos del brief (cliente → agencia) de la migración 0004.
--
-- - El equipo le pide algo al cliente desde una plantilla con formulario (brief web, kickoff de
--   CRM, accesos, catálogo…). Es la única sección donde el cliente opera.
-- - Fecha límite en días hábiles (vence a las 23:59 de Lima). Si se atrasa, una tarea diaria de n8n
--   corre las etapas sin completar del servicio los días de atraso que falten aplicar
--   (dias_corridos) y avisa al cliente por correo.
-- Las preguntas de las plantillas son de relleno y también están en src/dominio/requerimientos.ts
-- (tests/api/db.test.ts comprueba que coinciden).
-- =====================================================================

DROP TABLE requerimiento;
DROP TYPE estado_requerimiento;
DROP TYPE prioridad_requerimiento;

ALTER TYPE uso_archivo ADD VALUE IF NOT EXISTS 'REQUERIMIENTO';

CREATE TYPE estado_requerimiento AS ENUM ('PENDIENTE', 'ENVIADO', 'OBSERVADO', 'APROBADO');

CREATE TABLE plantilla_requerimiento (
  codigo       text PRIMARY KEY,
  nombre       text NOT NULL,
  descripcion  text,
  servicios    text[] NOT NULL DEFAULT '{}',   -- códigos de servicio donde se suele pedir; vacío = cualquiera
  dias_habiles smallint NOT NULL CHECK (dias_habiles BETWEEN 1 AND 30),
  campos       jsonb NOT NULL,                 -- [{clave, etiqueta, tipo, obligatorio, ayuda?, opciones?}]
  activa       boolean NOT NULL DEFAULT true
);

CREATE TABLE requerimiento (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL,
  cliente_id             uuid NOT NULL,
  plantilla_codigo       text REFERENCES plantilla_requerimiento(codigo),
  titulo                 text NOT NULL CHECK (length(trim(titulo)) >= 3),
  descripcion            text,
  mensaje                text,                 -- nota del equipo al pedirlo
  campos                 jsonb NOT NULL,       -- copia del formulario al momento de pedirlo
  respuestas             jsonb NOT NULL DEFAULT '{}',
  estado                 estado_requerimiento NOT NULL DEFAULT 'PENDIENTE',
  emitido_en             timestamptz NOT NULL DEFAULT now(),
  fecha_limite           date NOT NULL,
  dias_corridos          smallint NOT NULL DEFAULT 0 CHECK (dias_corridos >= 0),
  nota_equipo            text,
  enviado_en             timestamptz,
  enviado_por            uuid REFERENCES usuario(id),
  revisado_en            timestamptz,
  revisado_por           uuid REFERENCES usuario(id),
  creado_por             uuid REFERENCES usuario(id),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT enviado_con_fecha CHECK (estado = 'PENDIENTE' OR enviado_en IS NOT NULL),
  CONSTRAINT observado_con_nota CHECK (estado <> 'OBSERVADO' OR nota_equipo IS NOT NULL)
);
CREATE INDEX requerimiento_cliente_idx ON requerimiento (cliente_id, estado, fecha_limite);

ALTER TABLE requerimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON requerimiento USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON requerimiento TO app_portal;
GRANT SELECT ON plantilla_requerimiento TO app_portal;

INSERT INTO plantilla_requerimiento (codigo, nombre, descripcion, servicios, dias_habiles, campos) VALUES
  ('BRIEF_WEB', 'Brief de desarrollo web', 'Lo que necesitamos saber para diseñar tu sitio.', ARRAY['WEB']::text[], 3,
   '[{"clave":"objetivo","etiqueta":"¿Para qué quieres el sitio?","tipo":"TEXTO_LARGO","obligatorio":true,"ayuda":"Vender en línea, mostrar tus servicios, captar contactos…"},{"clave":"publico","etiqueta":"¿A quién le habla tu sitio?","tipo":"TEXTO_LARGO","obligatorio":true},{"clave":"secciones","etiqueta":"Secciones que imaginas","tipo":"LISTA","obligatorio":true,"ayuda":"Una por línea: Inicio, Nosotros, Productos, Contacto…"},{"clave":"referencias","etiqueta":"Sitios que te gustan","tipo":"LISTA","obligatorio":false,"ayuda":"Un enlace por línea y, si quieres, qué te gusta de cada uno."},{"clave":"dominio","etiqueta":"¿Ya tienes dominio y hosting?","tipo":"OPCION","obligatorio":true,"opciones":["Sí, ambos","Solo dominio","No, necesito ayuda"]},{"clave":"marca","etiqueta":"Logo y manual de marca","tipo":"ARCHIVOS","obligatorio":false}]'),
  ('BRIEF_BRANDING', 'Brief de marca', 'Para entender tu marca antes de diseñarla (o rediseñarla).', ARRAY['BRANDFORMANCE']::text[], 5,
   '[{"clave":"historia","etiqueta":"Cuéntanos la historia de tu marca","tipo":"TEXTO_LARGO","obligatorio":true},{"clave":"valores","etiqueta":"Tres palabras que la describan","tipo":"TEXTO","obligatorio":true},{"clave":"competidores","etiqueta":"Competidores principales","tipo":"LISTA","obligatorio":true,"ayuda":"Uno por línea."},{"clave":"evitar","etiqueta":"¿Qué no quieres que transmita?","tipo":"TEXTO_LARGO","obligatorio":false},{"clave":"referencias","etiqueta":"Marcas que admiras","tipo":"LISTA","obligatorio":false}]'),
  ('KICKOFF_CRM', 'Preguntas del kickoff de CRM', 'Cómo vendes hoy, para armar tus procesos en el CRM.', ARRAY['CRM_IMPLEMENTACION', 'CRM_INTEGRACION']::text[], 3,
   '[{"clave":"proceso","etiqueta":"¿Cómo es hoy tu proceso de venta, de principio a fin?","tipo":"TEXTO_LARGO","obligatorio":true},{"clave":"vendedores","etiqueta":"¿Cuántas personas venden?","tipo":"TEXTO","obligatorio":true},{"clave":"canales","etiqueta":"¿Por dónde te llegan los clientes?","tipo":"LISTA","obligatorio":true,"ayuda":"WhatsApp, web, redes, referidos…"},{"clave":"herramientas","etiqueta":"Herramientas que usan hoy","tipo":"TEXTO_LARGO","obligatorio":false,"ayuda":"Excel, otro CRM, WhatsApp Business…"},{"clave":"objetivo","etiqueta":"¿Qué esperas lograr con el CRM?","tipo":"TEXTO_LARGO","obligatorio":true}]'),
  ('USUARIOS_CRM', 'Usuarios del CRM', 'Quiénes usarán el CRM, para crear sus licencias.', ARRAY['CRM_IMPLEMENTACION', 'CRM_INTEGRACION']::text[], 2,
   '[{"clave":"usuarios","etiqueta":"Usuarios","tipo":"LISTA","obligatorio":true,"ayuda":"Uno por línea: nombre, correo y cargo."},{"clave":"administrador","etiqueta":"¿Quién será el administrador del CRM?","tipo":"TEXTO","obligatorio":true}]'),
  ('BRIEF_SOCIAL', 'Brief de contenido del mes', 'Lo que quieres comunicar el próximo mes en redes.', ARRAY['SOCIAL_MEDIA_PRO']::text[], 5,
   '[{"clave":"objetivo","etiqueta":"¿Qué quieres lograr este mes?","tipo":"TEXTO_LARGO","obligatorio":true},{"clave":"fechas","etiqueta":"Fechas importantes","tipo":"LISTA","obligatorio":false,"ayuda":"Lanzamientos, promociones, eventos. Una por línea."},{"clave":"productos","etiqueta":"Productos o servicios a destacar","tipo":"LISTA","obligatorio":false},{"clave":"material","etiqueta":"Fotos o videos que quieras usar","tipo":"ARCHIVOS","obligatorio":false}]'),
  ('ACCESOS_REDES', 'Accesos a redes sociales', 'Para publicar y pautar en tus cuentas.', ARRAY['SOCIAL_MEDIA_PRO', 'PAID_MEDIA']::text[], 2,
   '[{"clave":"cuentas","etiqueta":"Tus cuentas","tipo":"LISTA","obligatorio":true,"ayuda":"Un enlace por línea (Instagram, Facebook, TikTok…)."},{"clave":"business","etiqueta":"¿Nos diste acceso a tu Meta Business Suite?","tipo":"SI_NO","obligatorio":true,"ayuda":"Agrega a accesos@inoo.pe como socio. No nos envíes contraseñas."}]'),
  ('MANUAL_MARCA', 'Manual de marca y logo', 'Para que todo lo que hagamos respete tu identidad.', ARRAY[]::text[], 2,
   '[{"clave":"archivos","etiqueta":"Manual de marca, logo y tipografías","tipo":"ARCHIVOS","obligatorio":true},{"clave":"notas","etiqueta":"Algo que debamos saber","tipo":"TEXTO_LARGO","obligatorio":false}]'),
  ('CATALOGO_PRODUCTOS', 'Catálogo de productos', 'Tus productos con precio y descripción.', ARRAY['WEB', 'SOCIAL_MEDIA_PRO', 'PAID_MEDIA']::text[], 3,
   '[{"clave":"archivo","etiqueta":"Catálogo en archivo","tipo":"ARCHIVOS","obligatorio":false,"ayuda":"Excel o PDF. Si no lo tienes, lista los productos abajo."},{"clave":"lista","etiqueta":"O lista tus productos","tipo":"LISTA","obligatorio":false,"ayuda":"Uno por línea: nombre, precio y una frase."}]'),
  ('INFO_IA', 'Información de tu empresa para la IA', 'Con esto entrenamos al asistente que responde por tu marca.', ARRAY[]::text[], 3,
   '[{"clave":"empresa","etiqueta":"¿Qué hace tu empresa?","tipo":"TEXTO_LARGO","obligatorio":true},{"clave":"preguntas","etiqueta":"Preguntas frecuentes de tus clientes y sus respuestas","tipo":"LISTA","obligatorio":true,"ayuda":"Una por línea: pregunta → respuesta."},{"clave":"tono","etiqueta":"¿Cómo debe hablar el asistente?","tipo":"TEXTO","obligatorio":true},{"clave":"documentos","etiqueta":"Documentos útiles","tipo":"ARCHIVOS","obligatorio":false}]'),
  ('ACCESOS_WEB', 'Acceso a tu sitio web', 'Para administrar tu web (blogs, páginas, actualizaciones).', ARRAY['SOPORTE_CONTINUO', 'WEB']::text[], 2,
   '[{"clave":"url","etiqueta":"Dirección de tu sitio","tipo":"URL","obligatorio":true},{"clave":"usuario","etiqueta":"¿Creaste un usuario administrador para Inoo?","tipo":"SI_NO","obligatorio":true,"ayuda":"Usa el correo accesos@inoo.pe. No nos envíes contraseñas."}]')
;
