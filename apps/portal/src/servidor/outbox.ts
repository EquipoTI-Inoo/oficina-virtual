/**
 * Despachador del outbox (arquitectura, decisión 3): entrega a n8n los eventos que la API y
 * cambiar_estado_pieza() dejaron en outbox_evento, en orden, al menos una vez.
 *
 * - Firma: X-Inoo-Firma = sha256=<HMAC-SHA256 de "<X-Inoo-Timestamp>.<cuerpo>"> (contrato, webhooks).
 * - Reintentos con espera exponencial (30 s, 1 min, 2 min…) hasta 24 h desde que se creó el evento.
 * - FOR UPDATE SKIP LOCKED: se pueden correr varios despachadores sin entregar dos veces el mismo lote.
 */
import { createHmac } from "node:crypto";
import type { BaseDatos } from "./db";

export interface OpcionesDespacho {
  destino: string;
  secreto: string;
  lote?: number;
  fetch?: typeof fetch;
}

export interface ResultadoDespacho {
  entregados: number;
  fallidos: number;
}

export function firmar(secreto: string, ts: string, cuerpo: string) {
  return `sha256=${createHmac("sha256", secreto).update(`${ts}.${cuerpo}`).digest("hex")}`;
}

export async function despacharPendientes(db: BaseDatos, o: OpcionesDespacho): Promise<ResultadoDespacho> {
  const enviar = o.fetch ?? fetch;
  return db.transaccion(async (c) => {
    // Los vencidos (más de 24 h) no bloquean la cola: quedan con su último error para revisión manual.
    const { rows } = await c.query<{ id: string; tipo: string; cliente_id: string | null; payload: unknown; creado_en: Date; intentos: number; toca: boolean }>(
      `SELECT id, tipo, cliente_id, payload, creado_en, intentos,
              (intentos = 0 OR creado_en + interval '30 seconds' * power(2, intentos - 1) <= now()) AS toca
       FROM outbox_evento
       WHERE entregado_en IS NULL AND creado_en > now() - interval '24 hours'
       ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [o.lote ?? 50],
    );
    let entregados = 0;
    let fallidos = 0;
    for (const e of rows) {
      // En orden: si el más antiguo todavía espera su reintento, nadie se le adelanta.
      if (!e.toca) break;
      const cuerpo = JSON.stringify({ id: Number(e.id), tipo: e.tipo, ocurridoEn: new Date(e.creado_en).toISOString(), clienteId: e.cliente_id, datos: e.payload });
      const ts = String(Math.floor(Date.now() / 1000));
      let error: string | null = null;
      try {
        const r = await enviar(o.destino, {
          method: "POST",
          headers: { "content-type": "application/json", "x-inoo-firma": firmar(o.secreto, ts, cuerpo), "x-inoo-timestamp": ts },
          body: cuerpo,
          signal: AbortSignal.timeout(10_000),
        });
        if (!r.ok) error = `HTTP ${r.status}`;
      } catch (x) {
        error = (x as Error).message;
      }
      if (error) {
        fallidos++;
        await c.query("UPDATE outbox_evento SET intentos = intentos + 1, ultimo_error = $2 WHERE id = $1", [e.id, error]);
        // En orden: si uno falla, los siguientes esperan para no adelantarse.
        break;
      }
      entregados++;
      await c.query("UPDATE outbox_evento SET entregado_en = now(), intentos = intentos + 1, ultimo_error = NULL WHERE id = $1", [e.id]);
    }
    return { entregados, fallidos };
  });
}
