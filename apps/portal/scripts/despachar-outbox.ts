/**
 * Proceso del despachador del outbox. Corre junto al portal (otro proceso del mismo contenedor o una
 * tarea programada) con: DATABASE_URL, N8N_WEBHOOK_URL y N8N_WEBHOOK_SECRETO.
 *   npm run outbox            # bucle cada OUTBOX_INTERVALO_MS (por defecto 5 s)
 *   npm run outbox -- --una-vez
 */
import { baseDatos } from "../src/servidor/db";
import { despacharPendientes } from "../src/servidor/outbox";

const destino = process.env.N8N_WEBHOOK_URL;
const secreto = process.env.N8N_WEBHOOK_SECRETO;
if (!destino || !secreto) {
  console.error("Faltan N8N_WEBHOOK_URL y N8N_WEBHOOK_SECRETO");
  process.exit(1);
}
const intervalo = Number(process.env.OUTBOX_INTERVALO_MS ?? 5000);
const unaVez = process.argv.includes("--una-vez");

async function ciclo() {
  const db = await baseDatos();
  let total = 0;
  for (;;) {
    const r = await despacharPendientes(db, { destino: destino!, secreto: secreto! });
    total += r.entregados;
    if (r.fallidos || r.entregados === 0) break;
  }
  if (total) console.log(`[outbox] ${total} eventos entregados`);
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
