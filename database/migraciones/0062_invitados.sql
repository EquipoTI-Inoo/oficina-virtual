-- =====================================================================
-- Invitados de afuera en los tableros (17 nov 2026, Ernesto: compartir «como en Monday o Google Docs»).
-- Un invitado (un cliente o un freelancer) entra con el enlace de invitados de un tablero, crea su cuenta con su
-- correo y su contraseña, y solo ve los tableros donde lo invitaron. A qué tableros entra se guarda en el tablero
-- (JSON del proyecto en InooWork, `portalInvitados`); la API lo revisa en cada pedido.
--  · tipo_usuario suma INVITADO.
--  · Para todo lo que es de los clientes, un invitado es como un cliente sin cuentas: no ve nada.
--  · Los comentarios y archivos de los tableros (que eran solo del equipo) también los alcanza el invitado; la API
--    solo le deja los de sus tableros, igual que con los tableros privados.
-- =====================================================================

ALTER TYPE tipo_usuario ADD VALUE IF NOT EXISTS 'INVITADO';

CREATE OR REPLACE FUNCTION app_es_cliente() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.usuario_tipo', true), '') IN ('CLIENTE', 'INVITADO');
$$;

CREATE OR REPLACE FUNCTION app_puede_ver_cliente(p_cliente_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.usuario_tipo', true), '') IN ('CLIENTE', 'INVITADO')
      THEN p_cliente_id = ANY (coalesce(nullif(current_setting('app.cliente_ids', true), ''), '{}')::uuid[])
    WHEN app_es_prueba() IS NULL THEN true
    ELSE EXISTS (SELECT 1 FROM cliente c WHERE c.id = p_cliente_id)
  END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['actualizacion_tablero', 'archivo_tablero', 'comentario_archivo_tablero'] LOOP
    EXECUTE format($p$ALTER POLICY solo_equipo ON %I USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO', 'INVITADO'))$p$, t);
  END LOOP;
END $$;
