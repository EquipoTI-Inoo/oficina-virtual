-- =====================================================================
-- Correos directos por SMTP (26 oct): el portal manda los correos automáticos él mismo (CORREOS_POR=portal,
-- el despachador `npm run outbox`), sin depender de n8n. Cada evento del outbox lleva su propio registro de
-- correos, aparte de la entrega a n8n (que sigue para las demás automatizaciones).
-- =====================================================================

ALTER TABLE outbox_evento
  ADD COLUMN correos_procesados_en timestamptz,
  ADD COLUMN correos_intentos      integer NOT NULL DEFAULT 0 CHECK (correos_intentos >= 0),
  ADD COLUMN correos_error         text;

-- Los eventos que ya existían no mandan correos al desplegar (n8n ya se ocupó de ellos, o eran pruebas).
UPDATE outbox_evento SET correos_procesados_en = now();

CREATE INDEX outbox_correos_pendientes ON outbox_evento (id) WHERE correos_procesados_en IS NULL;
