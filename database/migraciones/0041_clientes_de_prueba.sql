-- =====================================================================
-- Clientes de prueba (6 nov 2026): los datos de demo se quedan como entorno de prueba, pero no cuentan en los
-- números de la agencia ni en los costos de IA. Se siguen viendo en las listas, con «PRUEBA ·» en el nombre.
-- =====================================================================

ALTER TABLE cliente ADD COLUMN es_prueba boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN cliente.es_prueba IS 'Cliente del entorno de prueba: no cuenta en los números de la agencia.';

UPDATE cliente SET es_prueba = true WHERE nombre LIKE 'PRUEBA · %';
