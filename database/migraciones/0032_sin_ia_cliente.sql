-- =====================================================================
-- Se quita la IA para el cliente (30 oct 2026). La sección «Agentes de IA» de la fase 16a sale del portal:
-- los agentes para clientes viven en Cosmiq, el CRM de Inoo, y el portal solo enlaza a la cuenta del
-- cliente desde sus proyectos de CRM (servicio_contratado.detalle.enlaceCosmiq). Vuelve la regla de que el
-- cliente nunca ve IA. Los agentes de Inoo para el equipo («Mi Jarvis») se construyen aparte.
-- =====================================================================

DROP TABLE contenido_ia;
DROP TABLE pregunta_sin_respuesta;
DROP TABLE mensaje_ia;
DROP TABLE conversacion_ia;
DROP TABLE version_agente_ia;
DROP TABLE agente_ia;
DROP TABLE base_conocimiento;
DROP TYPE estado_agente_ia;
DROP TYPE tono_agente_ia;

COMMENT ON COLUMN servicio_contratado.detalle IS 'Web: {tamano, paginas, productos, cms, alcanceWeb}. CRM: {crm, licencias, usuarios, tipoLicencia, plataformas[], agenteIa, whatsappApi, enlaceCosmiq}';
