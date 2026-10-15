-- =====================================================================
-- La IA es interna (reunión del 15 oct 2026): el cliente no debe notar que su trabajo se hace con IA.
-- Solo en CRM, donde Inoo vende agentes de IA y WhatsApp API, se le puede pedir información «para la IA».
-- La API ya no deja pedir una plantilla en un servicio que no está en su lista.
-- =====================================================================

UPDATE plantilla_requerimiento
SET nombre      = 'Información para tu agente de IA',
    descripcion = 'Con esto entrenamos al agente de IA que atenderá a tus clientes por WhatsApp.',
    servicios   = ARRAY['CRM_IMPLEMENTACION', 'CRM_INTEGRACION']::text[]
WHERE codigo = 'INFO_IA';
