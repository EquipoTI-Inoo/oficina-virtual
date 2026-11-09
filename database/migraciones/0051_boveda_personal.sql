-- =====================================================================
-- Bóveda personal (9 nov 2026). Cada persona del equipo guarda los accesos de sus clientes (redes, hosting…).
-- Solo la ven ella y su Jarvis: ni su jefe, ni su área, ni los super usuarios, ni el servicio.
--  · La contraseña de cada acceso se cifra EN EL NAVEGADOR con una llave aleatoria de la bóveda (AES-256-GCM).
--    Esa llave se guarda envuelta con otra que sale de la clave personal (PBKDF2-SHA256). El servidor nunca ve la
--    clave personal ni las contraseñas: sin la clave, nadie puede abrirla. Si la persona la olvida, solo puede
--    borrar su bóveda y empezar de nuevo.
--  · El nombre, el usuario y la web de cada acceso se guardan cifrados con una llave del servidor, para que Jarvis
--    sepa qué hay (nunca recibe la contraseña).
-- =====================================================================

CREATE TABLE boveda (
  usuario_id      uuid PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  sal             text NOT NULL CHECK (sal ~ '^[A-Za-z0-9_-]{16,128}$'),
  iteraciones     integer NOT NULL CHECK (iteraciones BETWEEN 300000 AND 5000000),
  llave_envuelta  text NOT NULL CHECK (length(llave_envuelta) <= 1000),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE boveda IS 'Bóveda personal (9 nov): la llave de la bóveda, envuelta con la clave personal (que el servidor nunca ve).';

CREATE TABLE acceso_boveda (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       uuid NOT NULL REFERENCES boveda(usuario_id) ON DELETE CASCADE,
  cliente_id       uuid REFERENCES cliente(id) ON DELETE SET NULL,
  datos_cifrados   text NOT NULL,
  secreto_cifrado  text NOT NULL CHECK (length(secreto_cifrado) <= 20000),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX acceso_boveda_usuario_idx ON acceso_boveda (usuario_id);
COMMENT ON COLUMN acceso_boveda.datos_cifrados IS 'Nombre, usuario y web, cifrados con la llave del servidor (BOVEDA_SECRETO).';
COMMENT ON COLUMN acceso_boveda.secreto_cifrado IS 'Contraseña y notas, cifradas en el navegador con la llave de la bóveda.';

-- Solo la dueña. Sin excepciones: ni ADMIN, ni super usuario, ni SERVICIO.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['boveda', 'acceso_boveda'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY solo_duena ON %I USING (usuario_id::text = coalesce(current_setting('app.usuario_id', true), ''))$p$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_portal', t);
  END LOOP;
END $$;

-- Jarvis puede leer la bóveda mientras está abierta (decidido el 9 nov, aceptando que la contraseña pasa por el
-- modelo de IA). Como los chats son del área, el chat donde Jarvis leyó la bóveda pasa a ser privado: solo lo ve su
-- dueña.
ALTER TABLE sesion_jarvis ADD COLUMN privada_de uuid REFERENCES usuario(id) ON DELETE CASCADE;
COMMENT ON COLUMN sesion_jarvis.privada_de IS 'Si no es NULL, el chat solo lo ve esa persona (Jarvis leyó su bóveda en él).';
