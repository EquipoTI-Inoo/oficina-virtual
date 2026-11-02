/**
 * Cierre de proyecto (2 nov 2026, fase 17). Antes de cerrar, el portal muestra lo que quedó abierto (etapas,
 * tareas, entregables sin aprobar y requerimientos del cliente). Con pendientes, cerrar pide confirmarlo.
 * Al cerrar: el proyecto pasa a FINALIZADO, el mensaje de cierre queda como «Qué sigue» para el cliente y se
 * emite `servicio.cerrado` (n8n manda el agradecimiento y la encuesta de satisfacción).
 */
export interface PendientesCierre { etapas: number; tareas: number; entregables: number; requerimientos: number }

export const listoParaCerrar = (p: PendientesCierre) => p.etapas + p.tareas + p.entregables + p.requerimientos === 0;

export function validarCierre(b: { mensaje?: unknown; forzar?: unknown }) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (typeof b.mensaje !== "string" || b.mensaje.trim().length < 10 || b.mensaje.length > 2000) errores.push({ campo: "mensaje", mensaje: "Escribe el mensaje de cierre para el cliente (10 a 2000 caracteres)" });
  if (b.forzar !== undefined && typeof b.forzar !== "boolean") errores.push({ campo: "forzar", mensaje: "Debe ser verdadero o falso" });
  return errores;
}
