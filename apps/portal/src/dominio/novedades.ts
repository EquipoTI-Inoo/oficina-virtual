/**
 * Novedades por sección (20 nov 2026, pedido de Alonso): cada aviso de la campana puede ir a «Mi panel» (un cliente
 * nuevo o asignado) o a «Mi trabajo» (una tarea o un ítem asignado). El menú lateral cuenta los que no se vieron y
 * se limpian al abrir la sección. La misma regla vive en la migración 0068 (trigger de notificacion).
 */
export const MODULOS_NOVEDAD = ["PANEL", "TRABAJO"] as const;
export type ModuloNovedad = (typeof MODULOS_NOVEDAD)[number];

export const TITULO_CLIENTE_NUEVO = "Nuevo cliente agregado";
export const TITULO_CLIENTE_ASIGNADO = "Te asignaron el cliente";
/** 24 nov: a la persona la sumaron a un proyecto (tablero). También va a «Mi panel» (migración 0072). */
export const TITULO_PROYECTO_NUEVO = "Te sumaron al proyecto";

/** 24 nov: un cliente o proyecto es «nuevo» la primera semana. */
export const DIAS_NUEVO = 7;
export const esNuevo = (f: string | Date | null | undefined, ahora = Date.now()) => {
  const t = f ? new Date(f).getTime() : NaN;
  return Number.isFinite(t) && ahora - t < DIAS_NUEVO * 86_400_000 && t <= ahora + 86_400_000;
};

/** La sección de un aviso según su título; null si es solo de la campana. */
export function moduloDeAviso(titulo: string): ModuloNovedad | null {
  if (titulo.startsWith(TITULO_CLIENTE_NUEVO) || titulo.startsWith(TITULO_CLIENTE_ASIGNADO) || titulo.startsWith(TITULO_PROYECTO_NUEVO)) return "PANEL";
  if (titulo === "Te asignaron una tarea" || / te asignó /.test(titulo)) return "TRABAJO";
  return null;
}
