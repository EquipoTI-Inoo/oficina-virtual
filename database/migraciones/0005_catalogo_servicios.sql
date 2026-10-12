-- =====================================================================
-- Catálogo real de servicios y plantillas de proyecto (reunión del 12 oct 2026).
--
-- - Los servicios son los que Inoo vende: Social Media Pro, Brandformance, Paid Media,
--   Diseño y desarrollo web, Implementación de CRM, Integración de CRM, Producción
--   audiovisual y Soporte continuo. Blog y Estáticos dejan de ser servicios: el blog es parte
--   del soporte continuo web y los estáticos son producción interna de Social Media Pro.
-- - Algunos servicios se contratan en una variante (tipo de web, nivel de audiovisual, marca
--   nueva o rebranding, soporte de CRM o web) y guardan detalle propio (CRM, licencias, usuarios).
-- - Cada servicio (y variante) tiene una plantilla con etapas y el % de avance acumulado al
--   terminar cada una. Al contratar, las etapas se copian al proyecto (etapa_proyecto); el
--   avance que ve el cliente sale de ahí. Los servicios mensuales repiten sus etapas cada mes.
-- Las preguntas de los briefs, los nombres de etapas y sus días son de relleno: se ajustan
-- editando las plantillas, sin tocar código.
-- =====================================================================

CREATE TYPE modalidad_servicio AS ENUM ('MENSUAL', 'PROYECTO');

ALTER TABLE servicio DROP CONSTRAINT servicio_categoria_key;
ALTER TABLE servicio ALTER COLUMN categoria DROP NOT NULL;
ALTER TABLE servicio
  ADD COLUMN modalidad modalidad_servicio NOT NULL DEFAULT 'MENSUAL',
  ADD COLUMN variantes jsonb NOT NULL DEFAULT '[]',   -- [{codigo, nombre}]; vacío = sin variante
  ADD COLUMN activo    boolean NOT NULL DEFAULT true; -- false = ya no se vende (se conserva por historia)

UPDATE servicio SET codigo = 'SOCIAL_MEDIA_PRO', nombre = 'Social Media Pro', modalidad = 'MENSUAL', orden = 1,
  descripcion = 'Creación de contenido para tus redes sociales.', unidad = 'piezas'
WHERE codigo = 'REDES_SOCIALES';
UPDATE servicio SET nombre = 'Paid Media', modalidad = 'MENSUAL', orden = 3,
  descripcion = 'Gestión de tu pauta publicitaria.', unidad = 'campañas'
WHERE codigo = 'PAID_MEDIA';
UPDATE servicio SET nombre = 'Diseño y desarrollo web', modalidad = 'PROYECTO', orden = 4,
  descripcion = 'Diseñamos y desarrollamos tu sitio, de la estructura a la publicación.', unidad = 'entregas',
  variantes = '[{"codigo":"LANDING","nombre":"Landing page"},{"codigo":"INFORMATIVA","nombre":"Web informativa"},{"codigo":"ECOMMERCE","nombre":"E-commerce"},{"codigo":"CATALOGO","nombre":"Catálogo"},{"codigo":"APLICATIVO","nombre":"Aplicativo web"}]'
WHERE codigo = 'WEB';
UPDATE servicio SET codigo = 'CRM_IMPLEMENTACION', nombre = 'Implementación de CRM', modalidad = 'PROYECTO', orden = 5,
  descripcion = 'Levantamos tus procesos, implementamos el CRM y capacitamos a tu equipo.', unidad = 'entregas'
WHERE codigo = 'CRM';
UPDATE servicio SET nombre = 'Producción audiovisual', modalidad = 'PROYECTO', orden = 7,
  descripcion = 'Fotografía y video para tu marca, en el nivel de producción que necesitas.', unidad = 'entregas',
  variantes = '[{"codigo":"FOTOGRAFIA","nombre":"Fotografía"},{"codigo":"FOTO_VIDEO_CRUDO","nombre":"Fotografía y video en crudo"},{"codigo":"PRODUCCION_POSTPRODUCCION","nombre":"Producción y postproducción"},{"codigo":"COBERTURA_COMPLETA","nombre":"Preproducción, producción y postproducción"}]'
WHERE codigo = 'AUDIOVISUAL';
UPDATE servicio SET activo = false, orden = 90 WHERE codigo IN ('BLOG', 'ESTATICOS');

INSERT INTO servicio (codigo, nombre, categoria, descripcion, unidad, orden, modalidad, variantes) VALUES
  ('BRANDFORMANCE', 'Brandformance', NULL, 'Estrategia e identidad de una marca que convierte: logo, manual y posicionamiento.', 'entregas', 2, 'PROYECTO',
   '[{"codigo":"MARCA_NUEVA","nombre":"Marca nueva"},{"codigo":"REBRANDING","nombre":"Rebranding"}]'),
  ('CRM_INTEGRACION', 'Integración de CRM', NULL, 'Conectamos tu CRM con otras plataformas mediante APIs.', 'entregas', 6, 'PROYECTO', '[]'),
  ('SOPORTE_CONTINUO', 'Soporte continuo', NULL, 'Soporte mensual de tu CRM o tu web: tickets, tareas, sesiones y entregables.', 'entregas', 8, 'MENSUAL',
   '[{"codigo":"CRM","nombre":"Soporte de CRM"},{"codigo":"WEB","nombre":"Soporte y administración web"}]');

ALTER TABLE servicio_contratado
  ADD COLUMN variante text,                       -- uno de servicio.variantes[].codigo
  ADD COLUMN detalle  jsonb NOT NULL DEFAULT '{}', -- CRM: {crm, licencias, usuarios, tipoLicencia, plataformas[]}
  ADD COLUMN marca    text;                       -- «Implementación de CRM - <marca>»; null = nombre del cliente

-- ---------------------------------------------------------------------
-- Plantillas
-- ---------------------------------------------------------------------
CREATE TABLE plantilla_proyecto (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_id uuid NOT NULL REFERENCES servicio(id),
  variante    text,                               -- null = sirve para todas las variantes
  nombre      text NOT NULL,
  -- Métricas que muestra el perfil del proyecto, en orden:
  -- REUNIONES_REALIZADAS, REUNIONES_EXITOSAS, DOCUMENTOS_A_TIEMPO, PIEZAS_APROBADAS, TICKETS_RESUELTOS, RESULTADOS_CAMPANA
  metricas    text[] NOT NULL DEFAULT '{}',
  activa      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plantilla_activa_unica ON plantilla_proyecto (servicio_id, coalesce(variante, '')) WHERE activa;

CREATE TABLE etapa_plantilla (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plantilla_id  uuid NOT NULL REFERENCES plantilla_proyecto(id) ON DELETE CASCADE,
  orden         smallint NOT NULL,
  nombre        text NOT NULL,
  descripcion   text,
  avance_pct    smallint NOT NULL CHECK (avance_pct BETWEEN 1 AND 100),  -- acumulado al terminar la etapa
  dias_habiles  smallint NOT NULL DEFAULT 5 CHECK (dias_habiles >= 0),
  espera_cliente boolean NOT NULL DEFAULT false,  -- la etapa depende de algo del cliente (brief, aprobación)
  UNIQUE (plantilla_id, orden)
);

-- Etapas de cada proyecto (copia de la plantilla al contratar; el equipo las mueve).
CREATE TABLE etapa_proyecto (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio_contratado_id uuid NOT NULL,
  cliente_id             uuid NOT NULL,
  etapa_plantilla_id     uuid REFERENCES etapa_plantilla(id) ON DELETE SET NULL,
  periodo                char(7),                -- servicios mensuales: un juego de etapas por mes
  orden                  smallint NOT NULL,
  nombre                 text NOT NULL,
  descripcion            text,
  avance_pct             smallint NOT NULL CHECK (avance_pct BETWEEN 1 AND 100),
  estado                 estado_hito NOT NULL DEFAULT 'SIN_INICIAR',
  espera_cliente         boolean NOT NULL DEFAULT false,
  fecha_inicio           date,
  fecha_estimada         date,                   -- fin previsto (se corre si el cliente se atrasa)
  fecha_fin              date,                   -- fin real
  actualizado_por        uuid REFERENCES usuario(id),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (servicio_contratado_id, cliente_id) REFERENCES servicio_contratado(id, cliente_id) ON DELETE CASCADE,
  CONSTRAINT fin_si_completada CHECK (estado <> 'COMPLETADO' OR fecha_fin IS NOT NULL)
);
CREATE UNIQUE INDEX etapa_proyecto_orden ON etapa_proyecto (servicio_contratado_id, coalesce(periodo, ''), orden);

ALTER TABLE servicio_contratado ADD COLUMN plantilla_id uuid REFERENCES plantilla_proyecto(id);

ALTER TABLE etapa_proyecto ENABLE ROW LEVEL SECURITY;
CREATE POLICY aislamiento_cliente ON etapa_proyecto USING (app_puede_ver_cliente(cliente_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON etapa_proyecto TO app_portal;
GRANT SELECT ON plantilla_proyecto, etapa_plantilla TO app_portal;

-- Plantillas iniciales. Formato de cada fila: (servicio, variante, nombre, métricas, etapas[nombre, %, días, espera_cliente]).
DO $$
DECLARE
  p record;
  e jsonb;
  v_plantilla uuid;
  i int;
BEGIN
  FOR p IN SELECT * FROM (VALUES
    ('SOCIAL_MEDIA_PRO', NULL, 'Social Media Pro · mes', ARRAY['PIEZAS_APROBADAS','REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO'],
     '[["Planificación del mes",25,3,false],["Sesión de contenido",50,5,false],["Producción y revisión",80,8,true],["Publicación",100,6,false]]'),
    ('PAID_MEDIA', NULL, 'Paid Media · mes', ARRAY['RESULTADOS_CAMPANA','PIEZAS_APROBADAS','REUNIONES_REALIZADAS'],
     '[["Estrategia y presupuesto",25,3,true],["Configuración de campañas",50,3,false],["Campañas activas",80,12,false],["Reporte del mes",100,2,false]]'),
    ('SOPORTE_CONTINUO', NULL, 'Soporte continuo · mes', ARRAY['TICKETS_RESUELTOS','REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO'],
     '[["Plan de trabajo del mes",20,2,false],["Atención de tickets y tareas",70,14,false],["Sesión de seguimiento",85,2,false],["Entregables e informe",100,2,false]]'),
    ('BRANDFORMANCE', 'MARCA_NUEVA', 'Brandformance · marca nueva', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO'],
     '[["Diagnóstico y estrategia",25,8,true],["Concepto e identidad visual",60,12,true],["Manual de marca",90,8,true],["Entrega final",100,2,false]]'),
    ('BRANDFORMANCE', 'REBRANDING', 'Brandformance · rebranding', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO'],
     '[["Auditoría de la marca actual",20,6,true],["Estrategia de reposicionamiento",40,6,true],["Nueva identidad visual",70,12,true],["Manual de marca",90,6,true],["Entrega y transición",100,3,false]]'),
    ('WEB', 'LANDING', 'Web · landing page', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS'],
     '[["Brief y estructura",15,3,true],["Diseño",45,5,true],["Desarrollo",80,6,false],["Revisión y publicación",100,3,true]]'),
    ('WEB', 'INFORMATIVA', 'Web · informativa', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS'],
     '[["Brief y arquitectura de contenidos",15,5,true],["Diseño",40,10,true],["Desarrollo",75,12,false],["Carga de contenidos",90,5,true],["Revisión y publicación",100,3,true]]'),
    ('WEB', 'ECOMMERCE', 'Web · e-commerce', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS'],
     '[["Brief y arquitectura de la tienda",10,5,true],["Diseño",30,12,true],["Desarrollo de la tienda",60,20,false],["Carga de productos y pasarela de pago",80,8,true],["Pruebas de compra",90,4,false],["Lanzamiento",100,2,true]]'),
    ('WEB', 'CATALOGO', 'Web · catálogo', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS'],
     '[["Brief y estructura del catálogo",15,4,true],["Diseño",40,8,true],["Desarrollo",70,12,false],["Carga de productos",90,6,true],["Revisión y publicación",100,3,true]]'),
    ('WEB', 'APLICATIVO', 'Web · aplicativo', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO'],
     '[["Levantamiento de requerimientos",15,10,true],["Prototipo",35,12,true],["Desarrollo",75,30,false],["Pruebas y ajustes",90,10,true],["Lanzamiento",100,3,false]]'),
    -- Implementación de CRM: tres etapas; la tercera son dos capacitaciones (20 → 60 → 80 → 100).
    ('CRM_IMPLEMENTACION', NULL, 'Implementación de CRM', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO'],
     '[["Levantamiento de información",20,10,true],["Procesos e implementación",60,20,false],["Capacitación 1",80,3,true],["Capacitación 2",100,3,true]]'),
    ('CRM_INTEGRACION', NULL, 'Integración de CRM', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS'],
     '[["Análisis de plataformas y accesos",20,5,true],["Desarrollo de la integración",60,15,false],["Pruebas",85,5,true],["Puesta en marcha",100,2,false]]'),
    ('AUDIOVISUAL', 'FOTOGRAFIA', 'Audiovisual · fotografía', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS'],
     '[["Coordinación de la sesión",30,3,true],["Sesión de fotos",70,1,false],["Selección y retoque",100,5,true]]'),
    ('AUDIOVISUAL', 'FOTO_VIDEO_CRUDO', 'Audiovisual · foto y video en crudo', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS'],
     '[["Coordinación del rodaje",30,3,true],["Rodaje",80,2,false],["Entrega del material",100,2,false]]'),
    ('AUDIOVISUAL', 'PRODUCCION_POSTPRODUCCION', 'Audiovisual · producción y postproducción', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS'],
     '[["Coordinación del rodaje",20,3,true],["Rodaje",50,2,false],["Edición y postproducción",85,8,true],["Entrega final",100,2,false]]'),
    ('AUDIOVISUAL', 'COBERTURA_COMPLETA', 'Audiovisual · cobertura completa', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS'],
     '[["Idea y guion",20,5,true],["Plan de rodaje",35,3,true],["Rodaje",60,3,false],["Edición y postproducción",90,10,true],["Entrega final",100,2,false]]')
  ) AS t(codigo, variante, nombre, metricas, etapas)
  LOOP
    INSERT INTO plantilla_proyecto (servicio_id, variante, nombre, metricas)
    SELECT s.id, p.variante, p.nombre, p.metricas FROM servicio s WHERE s.codigo = p.codigo
    RETURNING id INTO v_plantilla;
    i := 0;
    FOR e IN SELECT * FROM jsonb_array_elements(p.etapas::jsonb) LOOP
      i := i + 1;
      INSERT INTO etapa_plantilla (plantilla_id, orden, nombre, avance_pct, dias_habiles, espera_cliente)
      VALUES (v_plantilla, i, e->>0, (e->>1)::smallint, (e->>2)::smallint, (e->>3)::boolean);
    END LOOP;
  END LOOP;
END $$;

-- Soporte continuo: la misma plantilla para CRM y web (variante null), con los blogs dentro del de web.
-- Contratos que ya existían con los servicios retirados:
--   Estáticos → se suman al Social Media Pro del mismo cliente (sus piezas y su cuota mensual).
--   Blog      → Soporte continuo, variante web.
DO $$
DECLARE
  r record;
  v_smp uuid;
BEGIN
  FOR r IN SELECT sc.* FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id WHERE s.codigo = 'ESTATICOS' LOOP
    SELECT sc.id INTO v_smp FROM servicio_contratado sc JOIN servicio s ON s.id = sc.servicio_id
    WHERE s.codigo = 'SOCIAL_MEDIA_PRO' AND sc.cliente_id = r.cliente_id ORDER BY sc.creado_en LIMIT 1;
    IF v_smp IS NULL THEN
      UPDATE servicio_contratado SET servicio_id = (SELECT id FROM servicio WHERE codigo = 'SOCIAL_MEDIA_PRO') WHERE id = r.id;
    ELSE
      UPDATE pieza SET servicio_contratado_id = v_smp WHERE servicio_contratado_id = r.id;
      INSERT INTO entregable_incluido (servicio_contratado_id, tipo_pieza, cantidad_mensual)
      SELECT v_smp, tipo_pieza, cantidad_mensual FROM entregable_incluido WHERE servicio_contratado_id = r.id
      ON CONFLICT (servicio_contratado_id, tipo_pieza) DO UPDATE SET cantidad_mensual = entregable_incluido.cantidad_mensual + excluded.cantidad_mensual;
      DELETE FROM servicio_contratado WHERE id = r.id;
    END IF;
  END LOOP;
  UPDATE servicio_contratado SET servicio_id = (SELECT id FROM servicio WHERE codigo = 'SOPORTE_CONTINUO'), variante = 'WEB'
  WHERE servicio_id = (SELECT id FROM servicio WHERE codigo = 'BLOG');
END $$;

-- La creación de piezas de blog busca el soporte web del cliente (antes: servicio BLOG).
COMMENT ON COLUMN servicio.categoria IS 'Obsoleto desde 0005: los servicios se identifican por codigo.';
