/**
 * 24 nov 2026, una sola vez: a quien ya le aprobaron marcas lo suma a los tableros abiertos de esas marcas (lo que
 * desde hoy hace el portal al aprobar). Idempotente: donde ya está no lo toca.
 *   npx tsx scripts/tableros-de-marcas.ts            → solo muestra qué haría
 *   npx tsx scripts/tableros-de-marcas.ts --aplicar  → lo hace
 */
import { sumarATablerosDeMarca } from "../src/servidor/api";
import { baseDatos } from "../src/servidor/db";

async function principal() {
  const aplicar = process.argv.includes("--aplicar");
  const db = await baseDatos();
  await db.transaccion(async (c) => {
    const filas = (await c.query<{ usuario_id: string; cliente_id: string; persona: string; marca: string }>(
      `SELECT DISTINCT s.usuario_id, s.cliente_id, u.nombre AS persona, cl.nombre AS marca
       FROM solicitud_acceso s JOIN usuario u ON u.id = s.usuario_id JOIN cliente cl ON cl.id = s.cliente_id
       WHERE s.tipo = 'MARCA' AND s.estado = 'APROBADA' AND u.activo AND NOT coalesce(u.es_prueba, false)
         AND coalesce(u.nivel_acceso::text, '') <> 'ADMIN' AND NOT u.es_super_usuario
       ORDER BY u.nombre, cl.nombre`,
    )).rows;
    let total = 0;
    for (const f of filas) {
      const hechos = await sumarATablerosDeMarca(c, f.usuario_id, f.cliente_id, { simular: !aplicar });
      total += hechos.length;
      console.log(`${f.persona} · ${f.marca}: ${hechos.length ? hechos.join(" | ") : "nada nuevo"}`);
    }
    console.log(`${aplicar ? "Sumados" : "Se sumarían"} ${total} lugares en tableros (${filas.length} marcas aprobadas).`);
  });
  process.exit(0);
}
void principal();
