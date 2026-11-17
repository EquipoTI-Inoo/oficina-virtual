/**
 * Carpetas de Proyectos (17 nov 2026, Ernesto: «carpetas por empresa, con las marcas en subcarpetas»), como en Monday:
 * Empresa → Marca → Carpeta → Subcarpeta → Proyectos. Lo comparten la API simulada, el backend y la pantalla.
 */
import { claveCliente, esClienteInterno } from "./clientes-tablero";

export interface CarpetaBase { id: string; empresaClave: string; marcaId: string | null; padreId: string | null; nombre: string; borrada?: boolean }

export const MAX_NOMBRE_CARPETA = 80;
export const nombreCarpeta = (x: unknown) => (typeof x === "string" && x.trim().length >= 1 && x.trim().length <= MAX_NOMBRE_CARPETA ? x.trim().replace(/\s+/g, " ") : null);

/** La clave de la empresa de un nombre de cliente: «Inoo (interno)» y «Inoo» son la misma. */
export const claveEmpresa = (nombre: string | null | undefined) => (nombre && esClienteInterno(nombre.replace(/\s*\(interno\)\s*$/i, "")) ? "inoo" : claveCliente(nombre ?? "Sin cliente"));

/**
 * Dónde queda un proyecto cuya carpeta se borró: sube a la carpeta de arriba (o a ninguna). Una carpeta que no
 * existe (o de otra empresa) también cuenta como ninguna.
 */
export function carpetaVigente<C extends CarpetaBase>(id: string | null | undefined, carpetas: C[]): C | null {
  const porId = new Map(carpetas.map((c) => [c.id, c]));
  let c = id ? porId.get(id) : undefined;
  for (let n = 0; c && c.borrada && n < 5; n++) c = c.padreId ? porId.get(c.padreId) : undefined;
  return c && !c.borrada ? c : null;
}

/** Revisa una carpeta nueva. `padre` ya buscado (null si no viene). Devuelve los errores por campo. */
export function validarCarpetaNueva(b: { nombre?: unknown; empresa?: unknown }, padre: CarpetaBase | null | undefined, padreId: unknown) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (!nombreCarpeta(b.nombre)) errores.push({ campo: "nombre", mensaje: `Escribe el nombre de la carpeta (hasta ${MAX_NOMBRE_CARPETA} caracteres)` });
  if (typeof b.empresa !== "string" || !b.empresa.trim() || b.empresa.trim().length > 120) errores.push({ campo: "empresa", mensaje: "Di de qué empresa es la carpeta" });
  if (padreId !== undefined && padreId !== null) {
    if (!padre || padre.borrada) errores.push({ campo: "padreId", mensaje: "No encontramos la carpeta de arriba" });
    else if (padre.padreId) errores.push({ campo: "padreId", mensaje: "Solo hay un nivel de subcarpetas" });
    else if (typeof b.empresa === "string" && claveEmpresa(b.empresa) !== padre.empresaClave) errores.push({ campo: "padreId", mensaje: "La carpeta de arriba es de otra empresa" });
  }
  return errores;
}
