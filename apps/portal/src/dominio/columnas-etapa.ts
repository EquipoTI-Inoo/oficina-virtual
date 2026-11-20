/**
 * Columnas libres en las etapas de un proyecto (20 nov 2026, pedido de Alonso, opción A): las etapas de la plantilla
 * siguen siendo la fuente de lo que ve el cliente, y el equipo les suma columnas como en Monday. Por ejemplo, en la
 * fila «Kickoff» el enlace de la reunión; en otra etapa, un archivo o una aprobación. Solo las ve el equipo.
 */
export const TIPOS_COLUMNA_ETAPA = ["TEXTO", "ENLACE", "FECHA", "ESTADO", "APROBACION", "ARCHIVOS"] as const;
export type TipoColumnaEtapa = (typeof TIPOS_COLUMNA_ETAPA)[number];
export const NOMBRE_TIPO_COLUMNA_ETAPA: Record<TipoColumnaEtapa, string> = {
  TEXTO: "Texto", ENLACE: "Enlace", FECHA: "Fecha", ESTADO: "Estado", APROBACION: "Aprobación", ARCHIVOS: "Archivos",
};
type Errores = { campo: string; mensaje: string }[];

export function validarColumnaEtapa(b: { nombre?: unknown; tipo?: unknown; opciones?: unknown }, nueva: boolean): Errores {
  const e: Errores = [];
  if ((nueva || b.nombre !== undefined) && !(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 60)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 60 caracteres)" });
  if (nueva && !(TIPOS_COLUMNA_ETAPA as readonly unknown[]).includes(b.tipo)) e.push({ campo: "tipo", mensaje: "Elige el tipo de columna" });
  if (b.opciones !== undefined && !(Array.isArray(b.opciones) && b.opciones.length <= 20 && b.opciones.every((o) => typeof o === "string" && o.trim().length >= 1 && o.length <= 40))) {
    e.push({ campo: "opciones", mensaje: "Hasta 20 opciones de hasta 40 caracteres" });
  }
  if (nueva && b.tipo === "ESTADO" && !(Array.isArray(b.opciones) && b.opciones.length >= 2)) e.push({ campo: "opciones", mensaje: "Un estado necesita al menos 2 opciones" });
  return e;
}

/** Opciones de un estado nuevo si no se dan. */
export const OPCIONES_ESTADO_ETAPA = ["Pendiente", "En curso", "Listo"];

export type ValorArchivos = { archivoId: string; nombre: string }[];
export type ValorAprobacion = { aprobado: boolean; por: string | null; en: string };

/**
 * Valida el valor que llega para una columna. null o "" lo borra. La aprobación llega como true o false y el servidor
 * le agrega quién y cuándo. Los archivos llegan como lista de {archivoId, nombre} (el servidor revisa que existan).
 */
export function validarValorEtapa(col: { tipo: string; opciones: string[] }, v: unknown): { valor: unknown } | { error: string } {
  if (v === null || v === "") return { valor: null };
  switch (col.tipo) {
    case "TEXTO": return typeof v === "string" && v.length <= 5000 ? { valor: v.trim() } : { error: "Hasta 5000 caracteres" };
    case "ENLACE": return typeof v === "string" && /^https?:\/\/\S+\.\S+/.test(v.trim()) && v.length <= 2000 ? { valor: v.trim() } : { error: "Escribe un enlace que empiece con https://" };
    case "FECHA": return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? { valor: v } : { error: "Usa el formato AAAA-MM-DD" };
    case "ESTADO": return typeof v === "string" && col.opciones.includes(v) ? { valor: v } : { error: "Elige una de las opciones" };
    case "APROBACION": return typeof v === "boolean" ? { valor: v } : { error: "Aprobado o no" };
    case "ARCHIVOS": {
      const ok = Array.isArray(v) && v.length <= 20 && v.every((a) => a && typeof a === "object" && typeof (a as { archivoId?: unknown }).archivoId === "string" && typeof (a as { nombre?: unknown }).nombre === "string");
      return ok ? { valor: (v as ValorArchivos).map((a) => ({ archivoId: a.archivoId, nombre: a.nombre.slice(0, 255) })) } : { error: "Lista de archivos no válida" };
    }
    default: return { error: "Tipo de columna desconocido" };
  }
}

/** Cuántas etapas pierden su dato si se borra la columna (para avisar antes de confirmar). */
export const etapasConValor = (etapas: { valores?: Record<string, unknown> | null }[], colId: string) =>
  etapas.filter((e) => { const v = e.valores?.[colId]; return v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length); }).length;
