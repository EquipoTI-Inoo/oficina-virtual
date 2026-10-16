-- Correos automáticos (INO-04). n8n recibe cada evento del outbox, pide a la API los correos que
-- tocan (POST /integraciones/correos/preparar), los manda por SMTP e informa el resultado. La API
-- arma destinatarios y contenido, así que las reglas y los textos viven en el repo, no en n8n.
ALTER TABLE correo_enviado
  ADD COLUMN evento    text,
  -- Sin FK a propósito: el despachador tiene la fila del evento tomada (FOR UPDATE) mientras espera a n8n,
  -- y la verificación de una FK bloquearía el INSERT de preparar hasta que se venza el envío.
  ADD COLUMN outbox_id bigint,
  ADD COLUMN nombre    text,
  ADD COLUMN html      text,
  ADD COLUMN texto     text,
  ADD COLUMN error     text;
-- Un correo por evento y destinatario: si n8n reintenta, no se duplica.
CREATE UNIQUE INDEX correo_outbox_para ON correo_enviado (outbox_id, para) WHERE outbox_id IS NOT NULL;
COMMENT ON COLUMN correo_enviado.ses_message_id IS 'Message-ID del envío (SMTP en Fase 1, SES en Fase 2).';

-- Reglas globales; una fila con cliente_id del mismo evento la reemplaza para ese cliente.
-- plantilla = clave de la plantilla en src/dominio/correos.ts.
INSERT INTO regla_correo (evento, plantilla, destinatarios, descripcion) VALUES
  ('pieza.lista_revision',      'pieza.lista_revision',      'MIEMBROS_CLIENTE', 'Una pieza queda lista para tu revisión'),
  ('pieza.aprobada',            'pieza.aprobada',            'AMBOS',            'Confirmación cuando apruebas una pieza'),
  ('pieza.cambios_solicitados', 'pieza.cambios_solicitados', 'AMBOS',            'Confirmación cuando pides cambios'),
  ('brief.enviado',             'brief.enviado',             'ACCOUNT_MANAGER',  'Aviso al equipo cuando envías el brief del mes'),
  ('ticket.creado',             'ticket.creado',             'MIEMBROS_CLIENTE', 'Número de ticket y tiempo de respuesta comprometido'),
  ('ticket.resuelto',           'ticket.resuelto',           'MIEMBROS_CLIENTE', 'Aviso cuando el equipo resuelve tu ticket'),
  ('miembro.invitado',          'miembro.invitado',          'MIEMBROS_CLIENTE', 'Invitación al portal para un nuevo usuario'),
  ('requerimiento.creado',      'requerimiento.creado',      'MIEMBROS_CLIENTE', 'Lo que necesitamos de ti y hasta cuándo'),
  ('requerimiento.atrasado',    'requerimiento.atrasado',    'MIEMBROS_CLIENTE', 'Recordatorio cuando un pedido se pasa de la fecha límite'),
  ('requerimiento.enviado',     'requerimiento.enviado',     'ACCOUNT_MANAGER',  'Aviso al equipo cuando respondes un pedido');

-- Las reglas las cambia el equipo con SQL o desde NocoDB; la API solo las lee.
REVOKE INSERT, UPDATE, DELETE ON regla_correo FROM app_portal;
