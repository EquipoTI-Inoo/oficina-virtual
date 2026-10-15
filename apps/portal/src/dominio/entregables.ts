/**
 * Entregables genéricos del proyecto (reunión 15 oct): un archivo o enlace dentro de una etapa, con
 * versiones, aprobación del cliente y rebotes (cada vez que pide cambios). Lo comparten la API
 * simulada y el backend real.
 */

export type FormatoEntregable = "PDF" | "IMAGEN" | "ENLACE" | "PROTOTIPO" | "DOCUMENTO";
export type EstadoEntregable = "EN_PREPARACION" | "LISTO_REVISION" | "CAMBIOS_SOLICITADOS" | "APROBADO";

export const FORMATOS_ENTREGABLE: FormatoEntregable[] = ["PDF", "IMAGEN", "ENLACE", "PROTOTIPO", "DOCUMENTO"];

/** Desde cuántos rebotes un entregable pide apoyo (reunión 15 oct: «tres o cuatro cambios, alerta»). */
export const REBOTES_ALERTA = 3;

/**
 * Lo que ve el cliente: nunca EN_PREPARACION. Si ya se le envió una versión y el equipo prepara la
 * siguiente, es porque pidió cambios: le llega CAMBIOS_SOLICITADOS («Revisado»).
 */
export const estadoEntregableCliente = (estado: EstadoEntregable): EstadoEntregable => (estado === "EN_PREPARACION" ? "CAMBIOS_SOLICITADOS" : estado);

/** Un enlace válido: https:// o http://, o una ruta del propio portal (/muestras/…). */
export const urlValida = (v: unknown) => typeof v === "string" && (/^https?:\/\/\S+$/.test(v) || /^\/[^\s/]\S*$/.test(v));

type Errores = { campo: string; mensaje: string }[];

export function validarEntregable(b: { titulo?: unknown; formato?: unknown; url?: unknown; descripcion?: unknown; nota?: unknown; etapaId?: unknown }): Errores {
  const errores: Errores = [];
  const t = typeof b.titulo === "string" ? b.titulo.trim() : "";
  if (t.length < 3 || t.length > 200) errores.push({ campo: "titulo", mensaje: "Ponle un nombre (entre 3 y 200 caracteres)" });
  if (!FORMATOS_ENTREGABLE.includes(b.formato as FormatoEntregable)) errores.push({ campo: "formato", mensaje: "Elige el formato" });
  if (!urlValida(b.url)) errores.push({ campo: "url", mensaje: "Pega el enlace del archivo o del prototipo (https://…)" });
  if (b.etapaId !== undefined && b.etapaId !== null && typeof b.etapaId !== "string") errores.push({ campo: "etapaId", mensaje: "Etapa no válida" });
  return errores;
}

export function validarVersionEntregable(b: { url?: unknown }): Errores {
  return urlValida(b.url) ? [] : [{ campo: "url", mensaje: "Pega el enlace de la nueva versión (https://…)" }];
}

/** Para listas: primero lo que espera revisión (lo más antiguo arriba), luego el resto (lo más nuevo arriba). */
export function ordenarEntregables<T extends { estado: string; enviadoEn?: string | null; creadoEn: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => {
    const ra = a.estado === "LISTO_REVISION";
    const rb = b.estado === "LISTO_REVISION";
    if (ra !== rb) return ra ? -1 : 1;
    if (ra) return (a.enviadoEn ?? "").localeCompare(b.enviadoEn ?? "");
    return b.creadoEn.localeCompare(a.creadoEn);
  });
}
