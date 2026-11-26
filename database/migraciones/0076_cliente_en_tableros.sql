-- 26 nov 2026 (Alonso, Swiss Capital): un cliente también puede estar invitado a tableros, como un invitado de afuera,
-- y con permiso de editor subir archivos. Los comentarios y archivos de los tableros (equipo e invitados) también los
-- alcanza un cliente; la API solo le deja los de los tableros donde está invitado (igual que con los invitados).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['actualizacion_tablero', 'archivo_tablero', 'comentario_archivo_tablero'] LOOP
    EXECUTE format($p$ALTER POLICY solo_equipo ON %I USING (coalesce(current_setting('app.usuario_tipo', true), '') IN ('EQUIPO', 'SERVICIO', 'INVITADO', 'CLIENTE'))$p$, t);
  END LOOP;
END $$;
