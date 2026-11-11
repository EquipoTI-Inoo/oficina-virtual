/**
 * Columna «Archivos» de los tableros (11 nov 2026): subir, ver, bajar y quitar, con versiones (V1, V2…) y
 * comentarios por archivo, como en Monday. InooWork no guarda archivos: los bytes quedan en el portal y el ítem
 * solo guarda la lista. La comparten la API simulada y el backend real.
 */
import type { crearTableros, Yo } from "./tableros";

export const MAX_BYTES_ARCHIVO_TABLERO = 50 * 1024 * 1024;
export const MAX_ARCHIVOS_COLUMNA = 30;
export const MAX_VERSIONES = 100;

export interface VersionArchivo { id: string; version: number; nombre: string; mime: string; bytes: number; en: string; por: string | null }
/** Lo que guarda el ítem: el archivo con los datos de su última versión y la lista de versiones. */
export interface ArchivoColumna { id: string; nombre: string; mime: string; bytes: number; version: number; versiones: VersionArchivo[] }
export interface ComentarioArchivo { id: string; version: number; autor: string; texto: string; en: string }
export interface RepoArchivosTablero {
  guardar(a: { id: string; archivoId: string; version: number; nombre: string; mime: string; bytes: number; proyectoId: string; itemId: string; columnaId: string }, contenido: Uint8Array): Promise<void>;
  leer(proyectoId: string, id: string): Promise<{ nombre: string; mime: string; contenido: Uint8Array } | null>;
  borrar(proyectoId: string, archivoId: string): Promise<void>;
  comentarios(proyectoId: string, archivoId: string): Promise<ComentarioArchivo[]>;
  comentar(c: { proyectoId: string; archivoId: string; version: number; autor: string; texto: string }): Promise<void>;
}
type Fallar = (status: number, codigo: string, titulo: string, errores?: { campo: string; mensaje: string }[]) => Error;
type Tableros = ReturnType<typeof crearTableros>;

const texto = (xs: ArchivoColumna[]) => (!xs.length ? "" : xs.length === 1 ? xs[0].nombre : `${xs.length} archivos`);
const nombreSeguro = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 200);
const INLINE = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|wav|ogg)|application\/pdf)$/;

function desdeBase64(b64: string): Uint8Array | null {
  const limpio = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(limpio)) return null;
  return new Uint8Array(Buffer.from(limpio, "base64"));
}

/** Los archivos guardados antes de las versiones (o importados) se leen como una V1. */
export function normalizarArchivos(dato: unknown): ArchivoColumna[] {
  return (Array.isArray(dato) ? dato : []).map((a: Partial<ArchivoColumna>) => ({
    id: String(a.id), nombre: String(a.nombre ?? "archivo"), mime: String(a.mime ?? "application/octet-stream"), bytes: Number(a.bytes ?? 0), version: Number(a.version ?? 1),
    versiones: a.versiones?.length ? a.versiones : [{ id: String(a.id), version: 1, nombre: String(a.nombre ?? "archivo"), mime: String(a.mime ?? "application/octet-stream"), bytes: Number(a.bytes ?? 0), en: "", por: null }],
  }));
}

export function crearArchivosTablero(fallar: Fallar, tableros: Tableros) {
  const leerArchivo = (b: { nombre?: unknown; mime?: unknown; base64?: unknown }) => {
    const errores: { campo: string; mensaje: string }[] = [];
    const nombre = typeof b.nombre === "string" ? nombreSeguro(b.nombre) : "";
    if (!nombre) errores.push({ campo: "nombre", mensaje: "Falta el nombre del archivo" });
    const mime = typeof b.mime === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(b.mime) && b.mime.length <= 120 ? b.mime : "application/octet-stream";
    const bytes = typeof b.base64 === "string" ? desdeBase64(b.base64) : null;
    if (!bytes) errores.push({ campo: "base64", mensaje: "Falta el archivo" });
    else if (bytes.byteLength > MAX_BYTES_ARCHIVO_TABLERO) errores.push({ campo: "base64", mensaje: "Hasta 50 MB por archivo" });
    if (errores.length) throw fallar(422, "VALIDACION", "Revisa el archivo", errores);
    return { nombre, mime, bytes: bytes! };
  };
  /** El archivo tiene que estar en algún ítem del tablero (y quien pide, poder ver el tablero). */
  const archivoDelTablero = async (proyectoId: string, archivoId: string, yo: Yo) => {
    const t = await tableros.ver(proyectoId, yo);
    const archivos = new Set(t.columnas.filter((c) => c.tipo === "file").map((c) => c.id));
    for (const it of t.items) for (const [col, d] of Object.entries(it.datos ?? {})) {
      if (!archivos.has(col)) continue;
      const a = normalizarArchivos(d).find((x) => x.id === archivoId);
      if (a) return a;
    }
    throw fallar(404, "NO_ENCONTRADO", "No encontramos ese archivo");
  };

  return {
    subir: async (repo: RepoArchivosTablero, proyectoId: string, itemId: string, columnaId: string, yo: Yo, b: { nombre?: unknown; mime?: unknown; base64?: unknown }) => {
      const f = leerArchivo(b);
      const id = crypto.randomUUID();
      const v: VersionArchivo = { id, version: 1, nombre: f.nombre, mime: f.mime, bytes: f.bytes.byteLength, en: new Date().toISOString(), por: yo.nombre ?? null };
      const a: ArchivoColumna = { id, nombre: f.nombre, mime: f.mime, bytes: v.bytes, version: 1, versiones: [v] };
      // Primero el ítem (revisa permisos y el límite); en el backend real todo va en la misma transacción.
      const t = await tableros.cambiarDatoColumna(proyectoId, itemId, columnaId, yo, (dato) => {
        const xs = normalizarArchivos(dato);
        if (xs.length >= MAX_ARCHIVOS_COLUMNA) throw fallar(409, "DEMASIADOS_ARCHIVOS", `Hasta ${MAX_ARCHIVOS_COLUMNA} archivos por celda`);
        const nuevos = [...xs, a];
        return { texto: texto(nuevos), dato: nuevos };
      });
      await repo.guardar({ id, archivoId: id, version: 1, nombre: f.nombre, mime: f.mime, bytes: v.bytes, proyectoId, itemId, columnaId }, f.bytes);
      return t;
    },
    /** Una versión nueva del mismo archivo (V2, V3…): las anteriores se conservan. */
    nuevaVersion: async (repo: RepoArchivosTablero, proyectoId: string, itemId: string, columnaId: string, archivoId: string, yo: Yo, b: { nombre?: unknown; mime?: unknown; base64?: unknown }) => {
      const f = leerArchivo(b);
      const id = crypto.randomUUID();
      let numero = 0;
      const t = await tableros.cambiarDatoColumna(proyectoId, itemId, columnaId, yo, (dato) => {
        const xs = normalizarArchivos(dato);
        const a = xs.find((x) => x.id === archivoId);
        if (!a) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese archivo");
        if (a.versiones.length >= MAX_VERSIONES) throw fallar(409, "DEMASIADAS_VERSIONES", `Hasta ${MAX_VERSIONES} versiones por archivo`);
        numero = Math.max(...a.versiones.map((x) => x.version)) + 1;
        const v: VersionArchivo = { id, version: numero, nombre: f.nombre, mime: f.mime, bytes: f.bytes.byteLength, en: new Date().toISOString(), por: yo.nombre ?? null };
        Object.assign(a, { nombre: f.nombre, mime: f.mime, bytes: v.bytes, version: numero, versiones: [...a.versiones, v] });
        return { texto: texto(xs), dato: xs };
      });
      await repo.guardar({ id, archivoId, version: numero, nombre: f.nombre, mime: f.mime, bytes: f.bytes.byteLength, proyectoId, itemId, columnaId }, f.bytes);
      return t;
    },
    quitar: async (repo: RepoArchivosTablero, proyectoId: string, itemId: string, columnaId: string, archivoId: string, yo: Yo) => {
      let estaba = false;
      const t = await tableros.cambiarDatoColumna(proyectoId, itemId, columnaId, yo, (dato) => {
        const xs = normalizarArchivos(dato);
        estaba = xs.some((x) => x.id === archivoId);
        const quedan = xs.filter((x) => x.id !== archivoId);
        return { texto: texto(quedan), dato: quedan.length ? quedan : undefined };
      });
      if (!estaba) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese archivo");
      await repo.borrar(proyectoId, archivoId);
      return t;
    },
    /** Una versión (por su id). Con `enLinea`, imágenes, videos, audio y PDF se muestran en el visor. */
    bajar: async (repo: RepoArchivosTablero, proyectoId: string, versionId: string, yo: Yo, enLinea = false) => {
      await tableros.ver(proyectoId, yo);
      const f = /^[0-9a-f-]{36}$/i.test(versionId) ? await repo.leer(proyectoId, versionId) : null;
      if (!f) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese archivo");
      const enLineaSeguro = enLinea && INLINE.test(f.mime);
      return new Response(f.contenido as BodyInit, {
        headers: {
          "content-type": enLineaSeguro ? f.mime : "application/octet-stream", "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
          "content-disposition": `${enLineaSeguro ? "inline" : "attachment"}; filename="${encodeURIComponent(f.nombre)}"; filename*=UTF-8''${encodeURIComponent(f.nombre)}`,
        },
      });
    },
    comentarios: async (repo: RepoArchivosTablero, proyectoId: string, archivoId: string, yo: Yo) => {
      const a = await archivoDelTablero(proyectoId, archivoId, yo);
      return { archivo: a, datos: await repo.comentarios(proyectoId, archivoId) };
    },
    comentar: async (repo: RepoArchivosTablero, proyectoId: string, archivoId: string, yo: Yo, b: { texto?: unknown; version?: unknown }) => {
      const a = await archivoDelTablero(proyectoId, archivoId, yo);
      const t = typeof b.texto === "string" ? b.texto.trim() : "";
      const errores: { campo: string; mensaje: string }[] = [];
      if (!t || t.length > 5000) errores.push({ campo: "texto", mensaje: "Escribe el comentario (hasta 5000 caracteres)" });
      const version = b.version === undefined ? a.version : Number(b.version);
      if (!a.versiones.some((v) => v.version === version)) errores.push({ campo: "version", mensaje: "Esa versión no existe" });
      if (errores.length) throw fallar(422, "VALIDACION", "Revisa el comentario", errores);
      await repo.comentar({ proyectoId, archivoId, version, autor: yo.nombre ?? "Alguien del equipo", texto: t });
      return { archivo: a, datos: await repo.comentarios(proyectoId, archivoId) };
    },
  };
}
