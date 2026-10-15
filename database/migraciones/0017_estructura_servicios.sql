-- =====================================================================
-- Estructura real de cada servicio (instructivos de proceso y reunión del 15 oct 2026).
--  · Cada etapa tiene su reunión clave: la que la cierra con un objetivo y un resumen. Las etapas con
--    reunión clave son las «reuniones óptimas» del proyecto (KPI de la fase 13).
--  · Cada plantilla dice qué requerimientos se le piden al cliente al crear el proyecto («todo al inicio»).
--  · Web pasa a brief → arquitectura y benchmark → accesos → prototipo → implementación → presentación.
--  · El proyecto tiene un responsable de Inoo; el detalle guarda tamaño, páginas, productos, CMS, etc.
--  · Los pendientes del cliente que salen de una reunión son requerimientos «Pendiente de la reunión».
-- Las etapas de los proyectos que ya existían no cambian: solo las plantillas.
-- El bloque de plantillas sale de apps/portal/scripts/generar-migracion-plantillas.ts.
-- =====================================================================

ALTER TABLE etapa_plantilla ADD COLUMN reunion_clave text;
ALTER TABLE etapa_proyecto  ADD COLUMN reunion_clave text;
ALTER TABLE plantilla_proyecto ADD COLUMN requerimientos text[] NOT NULL DEFAULT '{}';
ALTER TABLE servicio_contratado ADD COLUMN responsable_id uuid REFERENCES usuario(id);
COMMENT ON COLUMN servicio_contratado.detalle IS 'Web: {tamano, paginas, productos, cms, alcanceWeb}. CRM: {crm, licencias, usuarios, tipoLicencia, plataformas[], agenteIa, whatsappApi}';

DO $$
DECLARE
  p record;
  e jsonb;
  i int;
  v_servicio uuid;
  v_plantilla uuid;
BEGIN
  FOR p IN SELECT * FROM (VALUES
    ('SOCIAL_MEDIA_PRO', NULL, 'Social Media Pro · mes', ARRAY['PIEZAS_APROBADAS','REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO']::text[], ARRAY['BRIEF_SOCIAL','ACCESOS_REDES','MANUAL_MARCA']::text[],
     '[["Planificación del mes",25,3,false,"Reunión de estrategia y planning"],["Sesión de contenido",50,5,false,"Sesión audiovisual"],["Producción y revisión",80,8,true,"Presentación de piezas"],["Publicación",100,6,false,"Reunión de métricas"]]'),
    ('PAID_MEDIA', NULL, 'Paid Media · mes', ARRAY['RESULTADOS_CAMPANA','PIEZAS_APROBADAS','REUNIONES_REALIZADAS']::text[], ARRAY['ACCESOS_REDES']::text[],
     '[["Estrategia y presupuesto",25,3,true,"Reunión de estrategia"],["Configuración de campañas",50,3,false,null],["Campañas activas",80,12,false,null],["Reporte del mes",100,2,false,"Reunión de resultados"]]'),
    ('SOPORTE_CONTINUO', NULL, 'Soporte continuo · mes', ARRAY['TICKETS_RESUELTOS','REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO']::text[], ARRAY[]::text[],
     '[["Plan de trabajo del mes",20,2,false,null],["Atención de tickets y tareas",70,14,false,null],["Sesión de seguimiento",85,2,false,"Sesión de seguimiento"],["Entregables e informe",100,2,false,null]]'),
    ('BRANDFORMANCE', 'MARCA_NUEVA', 'Brandformance · marca nueva', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO']::text[], ARRAY['BRIEF_BRANDING']::text[],
     '[["Brief",15,3,true,"Reunión de brief"],["Propuestas",55,6,false,"Presentación de propuestas"],["Ajustes",80,2,true,null],["Entrega final",100,3,false,"Presentación final"]]'),
    ('BRANDFORMANCE', 'REBRANDING', 'Brandformance · rebranding', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO']::text[], ARRAY['BRIEF_BRANDING','MANUAL_MARCA']::text[],
     '[["Brief y auditoría de la marca actual",15,4,true,"Reunión de brief"],["Estrategia de reposicionamiento",30,4,false,null],["Propuestas",60,6,false,"Presentación de propuestas"],["Ajustes",80,2,true,null],["Entrega final",100,3,false,"Presentación final"]]'),
    ('WEB', 'LANDING', 'Web · landing page', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS']::text[], ARRAY['BRIEF_WEB','ACCESOS_WEB','MANUAL_MARCA']::text[],
     '[["Brief y kickoff",10,3,true,"Reunión de brief"],["Arquitectura y benchmark",25,5,true,"Aprobación del flujograma"],["Accesos y hosting",30,2,true,null],["Prototipo",55,10,true,"Presentación del prototipo"],["Implementación",90,5,false,null],["Presentación y entrega",100,2,true,"Presentación final"]]'),
    ('WEB', 'INFORMATIVA', 'Web · informativa', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS']::text[], ARRAY['BRIEF_WEB','ACCESOS_WEB','MANUAL_MARCA']::text[],
     '[["Brief y kickoff",10,3,true,"Reunión de brief"],["Arquitectura y benchmark",20,5,true,"Aprobación del flujograma"],["Accesos y hosting",25,2,true,null],["Prototipo",50,10,true,"Presentación del prototipo"],["Implementación",80,15,false,null],["Presentación y capacitación",95,2,true,"Presentación final"],["Entrega",100,1,false,null]]'),
    ('WEB', 'ECOMMERCE', 'Web · e-commerce', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS']::text[], ARRAY['BRIEF_WEB','ACCESOS_WEB','MANUAL_MARCA','CATALOGO_PRODUCTOS']::text[],
     '[["Brief y kickoff",5,3,true,"Reunión de brief"],["Arquitectura y benchmark",15,5,true,"Aprobación del flujograma"],["Accesos y hosting",20,2,true,null],["Prototipo",40,10,true,"Presentación del prototipo"],["Implementación de la tienda",70,20,false,null],["Carga de productos y pasarela de pago",85,8,true,null],["Presentación y capacitación",95,2,true,"Presentación final"],["Entrega",100,1,false,null]]'),
    ('WEB', 'CATALOGO', 'Web · catálogo', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS']::text[], ARRAY['BRIEF_WEB','ACCESOS_WEB','MANUAL_MARCA','CATALOGO_PRODUCTOS']::text[],
     '[["Brief y kickoff",5,3,true,"Reunión de brief"],["Arquitectura y benchmark",15,5,true,"Aprobación del flujograma"],["Accesos y hosting",20,2,true,null],["Prototipo",40,10,true,"Presentación del prototipo"],["Implementación",70,12,false,null],["Carga de productos",85,6,true,null],["Presentación y capacitación",95,2,true,"Presentación final"],["Entrega",100,1,false,null]]'),
    ('WEB', 'APLICATIVO', 'Web · aplicativo', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO']::text[], ARRAY['BRIEF_WEB','ACCESOS_WEB']::text[],
     '[["Levantamiento de requerimientos",15,10,true,"Reunión de levantamiento"],["Prototipo",35,12,true,"Presentación del prototipo"],["Desarrollo",75,30,false,null],["Pruebas y ajustes",90,10,true,"Revisión de la versión beta"],["Lanzamiento",100,3,false,"Presentación final"]]'),
    ('CRM_IMPLEMENTACION', NULL, 'Implementación de CRM', ARRAY['REUNIONES_REALIZADAS','REUNIONES_EXITOSAS','DOCUMENTOS_A_TIEMPO']::text[], ARRAY['KICKOFF_CRM','USUARIOS_CRM']::text[],
     '[["Levantamiento de información",20,10,true,"Reunión de levantamiento"],["Procesos e implementación",60,20,false,"Aprobación de la arquitectura"],["Capacitación 1",80,3,true,"Implementación beta"],["Capacitación 2",100,3,true,"Capacitación"]]'),
    ('CRM_INTEGRACION', NULL, 'Integración de CRM', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','REUNIONES_EXITOSAS']::text[], ARRAY['KICKOFF_CRM','USUARIOS_CRM']::text[],
     '[["Análisis de plataformas y accesos",20,5,true,"Reunión de levantamiento"],["Desarrollo de la integración",60,15,false,null],["Pruebas",85,5,true,"Revisión de la integración"],["Puesta en marcha",100,2,false,"Puesta en marcha"]]'),
    ('AUDIOVISUAL', 'FOTOGRAFIA', 'Audiovisual · fotografía', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS']::text[], ARRAY[]::text[],
     '[["Coordinación de la sesión",30,3,true,"Reunión de coordinación"],["Sesión de fotos",70,1,false,null],["Selección y retoque",100,5,true,null]]'),
    ('AUDIOVISUAL', 'FOTO_VIDEO_CRUDO', 'Audiovisual · foto y video en crudo', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS']::text[], ARRAY[]::text[],
     '[["Coordinación del rodaje",30,3,true,"Reunión de coordinación"],["Rodaje",80,2,false,null],["Entrega del material",100,2,false,null]]'),
    ('AUDIOVISUAL', 'PRODUCCION_POSTPRODUCCION', 'Audiovisual · producción y postproducción', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS']::text[], ARRAY[]::text[],
     '[["Coordinación del rodaje",20,3,true,"Reunión de coordinación"],["Rodaje",50,2,false,null],["Edición y postproducción",85,8,true,null],["Entrega final",100,2,false,null]]'),
    ('AUDIOVISUAL', 'COBERTURA_COMPLETA', 'Audiovisual · cobertura completa', ARRAY['REUNIONES_REALIZADAS','DOCUMENTOS_A_TIEMPO','PIEZAS_APROBADAS']::text[], ARRAY[]::text[],
     '[["Idea y guion",20,5,true,"Reunión de idea y guion"],["Plan de rodaje",35,3,true,null],["Rodaje",60,3,false,null],["Edición y postproducción",90,10,true,null],["Entrega final",100,2,false,null]]')
  ) AS t(codigo, variante, nombre, metricas, requerimientos, etapas)
  LOOP
    SELECT id INTO v_servicio FROM servicio WHERE codigo = p.codigo;
    SELECT id INTO v_plantilla FROM plantilla_proyecto
    WHERE servicio_id = v_servicio AND coalesce(variante, '') = coalesce(p.variante, '') AND activa;
    IF v_plantilla IS NULL THEN
      INSERT INTO plantilla_proyecto (servicio_id, variante, nombre, metricas, requerimientos)
      VALUES (v_servicio, p.variante, p.nombre, p.metricas, p.requerimientos) RETURNING id INTO v_plantilla;
    ELSE
      UPDATE plantilla_proyecto SET nombre = p.nombre, metricas = p.metricas, requerimientos = p.requerimientos WHERE id = v_plantilla;
      DELETE FROM etapa_plantilla WHERE plantilla_id = v_plantilla;
    END IF;
    i := 0;
    FOR e IN SELECT * FROM jsonb_array_elements(p.etapas::jsonb) LOOP
      i := i + 1;
      INSERT INTO etapa_plantilla (plantilla_id, orden, nombre, avance_pct, dias_habiles, espera_cliente, reunion_clave)
      VALUES (v_plantilla, i, e->>0, (e->>1)::smallint, (e->>2)::smallint, (e->>3)::boolean, e->>4);
    END LOOP;
  END LOOP;
END $$;

INSERT INTO plantilla_requerimiento (codigo, nombre, descripcion, servicios, dias_habiles, campos) VALUES
  ('PENDIENTE_REUNION', 'Pendiente de la reunión', 'Lo que quedó pendiente de tu lado en la última reunión.', ARRAY[]::text[], 2,
   '[{"clave":"respuesta","etiqueta":"Tu respuesta","tipo":"TEXTO_LARGO","obligatorio":true},{"clave":"archivos","etiqueta":"Archivos","tipo":"ARCHIVOS","obligatorio":false}]');
