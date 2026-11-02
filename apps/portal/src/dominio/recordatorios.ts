/**
 * Recordatorios (2 nov 2026, fase 18). n8n llama una vez al día, temprano, a /integraciones/recordatorios y
 * el portal emite un evento por cada cosa que vence o pasa el próximo día hábil; n8n manda el correo:
 *  · tarea.por_vencer          a quien tiene la tarea interna;
 *  · requerimiento.por_vencer  al cliente (lo que nos tiene que entregar);
 *  · reunion.proxima           al responsable y al cliente.
 * Cada aviso sale una sola vez (recordatorio_enviado), aunque n8n repita la llamada.
 */
import { sumarDiasHabiles } from "./servicios";

/**
 * Qué se recuerda hoy: lo que vence o pasa después de hoy y hasta el próximo día hábil, inclusive. Un viernes
 * entran el sábado, el domingo y el lunes, para que el aviso no llegue el mismo lunes.
 */
export function ventanaRecordatorio(hoy: string, feriados?: ReadonlySet<string>): { desde: string; hasta: string } {
  return { desde: hoy, hasta: sumarDiasHabiles(hoy, 1, feriados) };
}

/** ¿`fecha` (YYYY-MM-DD) cae en la ventana (después de `desde`, hasta `hasta` inclusive)? */
export const enVentana = (fecha: string | null | undefined, v: { desde: string; hasta: string }) => !!fecha && fecha > v.desde && fecha <= v.hasta;

export type TipoRecordatorio = "tarea.por_vencer" | "requerimiento.por_vencer" | "reunion.proxima";
export const claveRecordatorio = (tipo: TipoRecordatorio, id: string, fecha: string) => `${tipo}:${id}:${fecha}`;
