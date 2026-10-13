-- =====================================================================
-- Blogs revisados por el equipo (reunión del 12 oct 2026: «el cliente no va a aprobar los blogs»;
-- son parte del soporte y administración web). El equipo aprueba el artículo directo desde su
-- revisión interna. La API solo permite esta transición para piezas BLOG y no deja enviar un blog a
-- revisión del cliente; el cliente no los ve en sus entregables.
-- =====================================================================

INSERT INTO transicion_pieza (de_estado, a_estado, actor) VALUES ('EN_REVISION_INTERNA', 'APROBADO_CLIENTE', 'EQUIPO')
ON CONFLICT DO NOTHING;
