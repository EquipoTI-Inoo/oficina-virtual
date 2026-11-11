/**
 * Columna «Archivos» de los tableros (11 nov 2026): subir, bajar y quitar. InooWork no guarda archivos, así que
 * los bytes quedan en el portal y el ítem solo guarda la lista. La comparten la API simulada y el backend real.
 */
import type { crearTableros, Yo } from "./tableros";

export const MAX_BYTES_ARCHIVO_TABLERO = 15 * 1024 * 1024;
export const MAX_ARCHIVOS_COLUMNA = 30;

export interface ArchivoColumna { id: string; nombre: string; mime: string; bytes: number }
export interface RepoArchivosTablero {
  guardar(a: ArchivoColumna & { proyectoId: string; itemId: string; columnaId: string }, contenido: Uint8Array): Promise<void>;
  leer(proyectoId: string, id: string): Promise<{ nombre: string; mime: string; contenido: Uint8Array } | null>;
  borrar(proyectoId: string, id: string): Promise<void>;
}
type Fallar = (status: number, codigo: string, titulo: string, errores?: { campo: string; mensaje: string }[]) => Error;
type Tableros = ReturnType<typeof crearTableros>;

const texto = (xs: ArchivoColumna[]) => (!xs.length ? "" : xs.length === 1 ? xs[0].nombre : `${xs.length} archivos`);
const nombreSeguro = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 200);

function desdeBase64(b64: string): Uint8Array | null {
  const limpio = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpio)) return null;
  return new Uint8Array(Buffer.from(limpio, "base64"));
}

export function crearArchivosTablero(fallar: Fallar, tableros: Tableros) {
  return {
    subir: async (repo: RepoArchivosTablero, proyectoId: string, itemId: string, columnaId: string, yo: Yo, b: { nombre?: unknown; mime?: unknown; base64?: unknown }) => {
      const errores: { campo: string; mensaje: string }[] = [];
      const nombre = typeof b.nombre === "string" ? nombreSeguro(b.nombre) : "";
      if (!nombre) errores.push({ campo: "nombre", mensaje: "Falta el nombre del archivo" });
      const mime = typeof b.mime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(b.mime) && b.mime.length <= 120 ? b.mime : "application/octet-stream";
      const bytes = typeof b.base64 === "string" ? desdeBase64(b.base64) : null;
      if (!bytes) errores.push({ campo: "base64", mensaje: "Falta el archivo" });
      else if (bytes.byteLength > MAX_BYTES_ARCHIVO_TABLERO) errores.push({ campo: "base64", mensaje: "Hasta 15 MB por archivo" });
      if (errores.length) throw fallar(422, "VALIDACION", "Revisa el archivo", errores);
      const a: ArchivoColumna = { id: crypto.randomUUID(), nombre, mime, bytes: bytes!.byteLength };
      // Primero el ítem (revisa permisos y el límite); en el backend real todo va en la misma transacción.
      const t = await tableros.cambiarDatoColumna(proyectoId, itemId, columnaId, yo, (dato) => {
        const xs = (Array.isArray(dato) ? dato : []) as ArchivoColumna[];
        if (xs.length >= MAX_ARCHIVOS_COLUMNA) throw fallar(409, "DEMASIADOS_ARCHIVOS", `Hasta ${MAX_ARCHIVOS_COLUMNA} archivos por celda`);
        const nuevos = [...xs, a];
        return { texto: texto(nuevos), dato: nuevos };
      });
      await repo.guardar({ ...a, proyectoId, itemId, columnaId }, bytes!);
      return t;
    },
    quitar: async (repo: RepoArchivosTablero, proyectoId: string, itemId: string, columnaId: string, archivoId: string, yo: Yo) => {
      let estaba = false;
      const t = await tableros.cambiarDatoColumna(proyectoId, itemId, columnaId, yo, (dato) => {
        const xs = (Array.isArray(dato) ? dato : []) as ArchivoColumna[];
        estaba = xs.some((x) => x.id === archivoId);
        const quedan = xs.filter((x) => x.id !== archivoId);
        return { texto: texto(quedan), dato: quedan.length ? quedan : undefined };
      });
      if (!estaba) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese archivo");
      await repo.borrar(proyectoId, archivoId);
      return t;
    },
    bajar: async (repo: RepoArchivosTablero, proyectoId: string, archivoId: string, yo: Yo) => {
      await tableros.ver(proyectoId, yo);
      const f = /^[0-9a-f-]{36}$/i.test(archivoId) ? await repo.leer(proyectoId, archivoId) : null;
      if (!f) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese archivo");
      return new Response(f.contenido as BodyInit, {
        headers: {
          "content-type": f.mime, "x-content-type-options": "nosniff",
          "content-disposition": `attachment; filename="${encodeURIComponent(f.nombre)}"; filename*=UTF-8''${encodeURIComponent(f.nombre)}`,
        },
      });
    },
  };
}
