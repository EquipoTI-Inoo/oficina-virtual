/**
 * Proceso del despachador del outbox. Corre junto al portal (otro proceso del mismo contenedor o una
 * tarea programada) con DATABASE_URL y:
 *  · Correos (CORREOS_POR=portal, por defecto): SMTP_HOST, SMTP_PORT, SMTP_USUARIO, SMTP_CLAVE y
 *    CORREO_REMITENTE. El portal arma y manda cada correo (en local, Mailpit en el puerto 1025).
 *  · n8n (opcional): N8N_WEBHOOK_URL y N8N_WEBHOOK_SECRETO, para las demás automatizaciones. Con
 *    CORREOS_POR=n8n los correos los manda el workflow correos-por-evento en lugar del portal.
 *   npm run outbox            # bucle cada OUTBOX_INTERVALO_MS (por defecto 5 s)
 *   npm run outbox -- --una-vez
 */
import { despacharCorreos } from "../src/servidor/api";
import { correosPor, enviadorSmtp } from "../src/servidor/correo-smtp";
import { baseDatos } from "../src/servidor/db";
import { despacharPendientes } from "../src/servidor/outbox";

const destino = process.env.N8N_WEBHOOK_URL;
const secreto = process.env.N8N_WEBHOOK_SECRETO;
const enviar = correosPor() === "portal" ? enviadorSmtp() : null;
if (correosPor() === "portal" && !enviar) {
  console.error("Falta SMTP_HOST: con CORREOS_POR=portal el despachador manda los correos por SMTP (en local, SMTP_HOST=localhost y SMTP_PORT=1025 con Mailpit)");
  process.exit(1);
}
if (!enviar && !(destino && secreto)) {
  console.error("Faltan N8N_WEBHOOK_URL y N8N_WEBHOOK_SECRETO");
  process.exit(1);
}
const intervalo = Number(process.env.OUTBOX_INTERVALO_MS ?? 5000);
const unaVez = process.argv.includes("--una-vez");

async function ciclo() {
  if (enviar) {
    const r = await despacharCorreos(enviar);
    if (r.enviados || r.fallidos) console.log(`[correos] ${r.enviados} enviados, ${r.fallidos} fallidos (${r.eventos} eventos)`);
  }
  if (!destino || !secreto) return;
  const db = await baseDatos();
  let total = 0;
  for (;;) {
    const r = await despacharPendientes(db, { destino, secreto });
    total += r.entregados;
    if (r.fallidos || r.entregados === 0) break;
  }
  if (total) console.log(`[outbox] ${total} eventos entregados a n8n`);
}

// Sin await de nivel superior: tsx compila el paquete como CommonJS y lo rechaza.
async function principal() {
  if (unaVez) {
    await ciclo();
    process.exit(0);
  }
  for (;;) {
    await ciclo().catch((e) => console.error("[outbox]", e));
    await new Promise((r) => setTimeout(r, intervalo));
  }
}
void principal();
