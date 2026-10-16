/**
 * Estado de pago del cliente (reunión 15 oct). Lo marca a mano Administración o Finanzas: «Al día» o
 * «Atrasado» desde una fecha. El portal no guarda cuotas ni montos (eso vivirá en Cosmic).
 * Desde el umbral, operaciones ve una alerta para coordinar antes de seguir con el proyecto.
 */

/** Días de atraso desde los que se alerta a operaciones (de relleno hasta que Finanzas lo defina). */
export const UMBRAL_ALERTA_PAGO_DIAS = 7;

export type SituacionPago = "AL_DIA" | "ATRASADO";

/** Roles del equipo que ven y cambian los pagos. El resto del equipo solo ve la alerta. */
export const ROLES_FINANZAS = ["ADMIN", "FINANZAS"];

/** Días corridos (no hábiles) desde que dejó de pagar hasta hoy. */
export function diasAtrasoPago(atrasadoDesde: string | null, hoy: string): number {
  if (!atrasadoDesde) return 0;
  const ms = Date.parse(`${hoy.slice(0, 10)}T12:00:00Z`) - Date.parse(`${atrasadoDesde.slice(0, 10)}T12:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export const alertaPago = (situacion: SituacionPago, dias: number) => situacion === "ATRASADO" && dias >= UMBRAL_ALERTA_PAGO_DIAS;

/** Cambio de estado: si está atrasado, la fecha es obligatoria y no puede ser futura. */
export function validarEstadoPago(b: { situacion?: unknown; atrasadoDesde?: unknown; nota?: unknown }, hoy: string) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.situacion !== "AL_DIA" && b.situacion !== "ATRASADO") errores.push({ campo: "situacion", mensaje: "Elige «Al día» o «Atrasado»" });
  if (b.situacion === "ATRASADO") {
    if (typeof b.atrasadoDesde !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.atrasadoDesde)) errores.push({ campo: "atrasadoDesde", mensaje: "Indica desde cuándo está atrasado (AAAA-MM-DD)" });
    else if (b.atrasadoDesde > hoy.slice(0, 10)) errores.push({ campo: "atrasadoDesde", mensaje: "La fecha no puede ser futura" });
  }
  if (b.nota !== undefined && b.nota !== null && typeof b.nota !== "string") errores.push({ campo: "nota", mensaje: "La nota debe ser texto" });
  return errores;
}
