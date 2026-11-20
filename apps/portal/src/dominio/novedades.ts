/**
 * Novedades por sección (20 nov 2026, pedido de Alonso): cada aviso de la campana puede ir a «Mi panel» (un cliente
 * nuevo o asignado) o a «Mi trabajo» (una tarea o un ítem asignado). El menú lateral cuenta los que no se vieron y
 * se limpian al abrir la sección. La misma regla vive en la migración 0068 (trigger de notificacion).
 */
export const MODULOS_NOVEDAD = ["PANEL", "TRABAJO"] as const;
export type ModuloNovedad = (typeof MODULOS_NOVEDAD)[number];

export const TITULO_CLIENTE_NUEVO = "Nuevo cliente agregado";
export const TITULO_CLIENTE_ASIGNADO = "Te asignaron el cliente";

/** La sección de un aviso según su título; null si es solo de la campana. */
export function moduloDeAviso(titulo: string): ModuloNovedad | null {
  if (titulo.startsWith(TITULO_CLIENTE_NUEVO) || titulo.startsWith(TITULO_CLIENTE_ASIGNADO)) return "PANEL";
  if (titulo === "Te asignaron una tarea" || / te asignó /.test(titulo)) return "TRABAJO";
  return null;
}
