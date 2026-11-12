/**
 * Bandeja «Por revisar» (13 nov 2026, auditoría): lo que espera al equipo en las cuentas o proyectos de cada uno.
 * Requerimientos que el cliente ya envió y entregables que hay que mandar, corregir o que esperan al cliente.
 */
export type AccionPorRevisar = "REVISAR" | "CORREGIR" | "ENVIAR" | "ESPERA_CLIENTE";

export const ACCIONES_POR_REVISAR: { clave: AccionPorRevisar; titulo: string; ayuda: string }[] = [
  { clave: "REVISAR", titulo: "Requerimientos por revisar", ayuda: "El cliente ya los envió: apruébalos o pídele que corrija." },
  { clave: "CORREGIR", titulo: "Cambios pedidos por el cliente", ayuda: "Entregables que el cliente devolvió con comentarios." },
  { clave: "ENVIAR", titulo: "Entregables por enviar", ayuda: "En preparación: súbele la versión y envíala al cliente." },
  { clave: "ESPERA_CLIENTE", titulo: "Esperando al cliente", ayuda: "Ya se enviaron; el cliente aún no decide." },
];

export function accionPorRevisar(tipo: "REQUERIMIENTO" | "ENTREGABLE", estado: string): AccionPorRevisar | null {
  if (tipo === "REQUERIMIENTO") return estado === "ENVIADO" ? "REVISAR" : null;
  if (estado === "CAMBIOS_SOLICITADOS") return "CORREGIR";
  if (estado === "EN_PREPARACION") return "ENVIAR";
  if (estado === "LISTO_REVISION") return "ESPERA_CLIENTE";
  return null;
}

export const enlacePorRevisar = (tipo: "REQUERIMIENTO" | "ENTREGABLE", id: string) =>
  tipo === "REQUERIMIENTO" ? `/requerimientos/${id}` : `/equipo/entregables/${id}`;

/** Lo que pide acción del equipo (para el contador del menú): revisar y corregir. */
export const pideAccion = (a: AccionPorRevisar) => a === "REVISAR" || a === "CORREGIR";

/** Lo más antiguo primero: es lo que más espera. */
export const ordenarPorRevisar = <T extends { fecha: string }>(xs: T[]) => xs.sort((a, b) => a.fecha.localeCompare(b.fecha));
