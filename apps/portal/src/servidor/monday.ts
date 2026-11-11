/**
 * Importar tableros de Monday (9 nov 2026): la lectura por la API de Monday (GraphQL) y el motor de la importación,
 * que comparten la API simulada y el backend real (cada una pasa cómo guarda el registro y el historial).
 *
 * Variable: MONDAY_API_TOKEN, la clave personal de un admin de Monday (Perfil → Desarrolladores → Mi token).
 * La pone el admin en el .env del servidor y se borra al terminar la importación. Sin ella se usan tableros de demo.
 * Solo lectura: el portal nunca escribe en Monday.
 */
import { convertirTablero, emparejarPersonas, historialDe, nombreArchivo, previaMonday, TABLEROS_MONDAY_DEMO, validarImportacion,
  type ArchivoMonday, type ColumnaMonday, type ItemMonday, type PedidoImportacion, type PersonaMonday, type RespuestaMonday, type TableroMonday, type TableroMondayResumen } from "../dominio/monday";
import { ESTADOS_ITEM, type EstadoItem, type PersonaIW } from "../dominio/tableros";
import type { Almacen } from "./almacen";
import type { crearTableros, Yo } from "./tableros";

const token = () => process.env.MONDAY_API_TOKEN?.trim() || undefined;
export const mondayConectado = () => !!token();
const demo = (prueba?: boolean) => !mondayConectado() || !!prueba;

let enviar: typeof fetch = (...a) => fetch(...a);
/** Solo pruebas: reemplaza fetch para simular a Monday (y la descarga de archivos). */
export function usarFetchMonday(f: typeof fetch | null) {
  enviar = f ?? ((...a) => fetch(...a));
  cache.clear();
}

export class SinMonday extends Error {}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  for (let intento = 0; ; intento++) {
    let r: Response;
    try {
      r = await enviar("https://api.monday.com/v2", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: token()!, "api-version": "2024-10" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new SinMonday(`Monday no respondió (${(e as Error).message})`);
    }
    const j = (await r.json().catch(() => null)) as { data?: T; errors?: { message?: string }[]; error_message?: string } | null;
    const error = j?.errors?.map((e) => e.message).join("; ") || j?.error_message || (!r.ok ? `Monday respondió ${r.status}` : "");
    // Límite de complejidad o de pedidos por minuto: esperar y volver a intentar.
    if (error && intento < 4 && (r.status === 429 || /complexity|rate limit|too many/i.test(error))) {
      await espera(Math.min(60_000, 5_000 * 2 ** intento));
      continue;
    }
    if (r.status === 401 || /not authenticated|unauthorized/i.test(error)) throw new SinMonday("La clave de Monday no es válida o venció");
    if (error || !j?.data) throw new SinMonday(error || "Monday no devolvió datos");
    return j.data;
  }
}

// ───────────────────────────── lectura

interface UsuarioApi { id: string | number; name?: string; email?: string | null }
interface AssetApi { id: string | number; name?: string; file_size?: number | null; public_url?: string | null }
interface UpdateApi { id: string | number; text_body?: string; created_at?: string; creator?: UsuarioApi | null; replies?: { text_body?: string; created_at?: string; creator?: UsuarioApi | null }[]; assets?: AssetApi[] }
interface ValorApi { id: string; text?: string | null; value?: unknown }
interface ItemApi {
  id: string | number; name?: string; created_at?: string; group?: { id: string } | null; column_values?: ValorApi[];
  subitems?: { id: string | number; name?: string; created_at?: string; board?: { columns?: ColumnaApi[] } | null; column_values?: ValorApi[] }[];
  updates?: UpdateApi[]; assets?: AssetApi[];
}
interface ColumnaApi { id: string; title?: string; type?: string }

const ITEM = `id name created_at group { id } column_values { id text value }
  subitems { id name created_at board { columns { id title type } } column_values { id text value } }
  updates (limit: 100) { id text_body created_at creator { id name email } replies { text_body created_at creator { id name email } } assets { id name file_size public_url } }
  assets { id name file_size public_url }`;

const persona = (u: UsuarioApi | null | undefined): PersonaMonday => ({ id: String(u?.id ?? ""), nombre: u?.name || "Alguien en Monday", email: u?.email || null });
const archivo = (a: AssetApi): ArchivoMonday => ({ id: String(a.id), nombre: a.name || `archivo-${a.id}`, url: a.public_url || null, bytes: a.file_size ?? null });
const respuesta = (x: { text_body?: string; created_at?: string; creator?: UsuarioApi | null }): RespuestaMonday => {
  const p = persona(x.creator);
  return { autor: p.nombre, email: p.email, fecha: x.created_at ?? "", texto: (x.text_body ?? "").trim() };
};
const valores = (xs: ValorApi[] | undefined) => (xs ?? []).map((v) => ({ id: v.id, texto: v.text ?? "", valor: v.value ?? null }));
const columnas = (xs: ColumnaApi[] | undefined): ColumnaMonday[] => (xs ?? []).map((c) => ({ id: c.id, titulo: c.title ?? c.id, tipo: c.type ?? "text" }));

function item(x: ItemApi): ItemMonday {
  return {
    id: String(x.id), nombre: x.name ?? "", grupoId: x.group?.id ?? "", creadoEn: x.created_at ?? null, valores: valores(x.column_values),
    subitems: (x.subitems ?? []).map((s) => ({ id: String(s.id), nombre: s.name ?? "", creadoEn: s.created_at ?? null, valores: valores(s.column_values) })),
    actualizaciones: (x.updates ?? []).map((u) => ({ id: String(u.id), ...respuesta(u), respuestas: (u.replies ?? []).map(respuesta), archivos: (u.assets ?? []).map(archivo) }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    archivos: (x.assets ?? []).map(archivo),
  };
}

let usuariosCache: { en: number; xs: PersonaMonday[] } | null = null;
async function usuarios(): Promise<PersonaMonday[]> {
  if (usuariosCache && Date.now() - usuariosCache.en < 10 * 60_000) return usuariosCache.xs;
  const d = await graphql<{ users: UsuarioApi[] }>("query { users (limit: 1000) { id name email } }");
  usuariosCache = { en: Date.now(), xs: (d.users ?? []).map(persona) };
  return usuariosCache.xs;
}

/** El tablero leído hace poco (la vista previa y la importación no lo leen dos veces). */
const cache = new Map<string, { en: number; t: TableroMonday }>();

async function leerReal(id: string): Promise<TableroMonday | null> {
  const c = cache.get(id);
  if (c && Date.now() - c.en < 10 * 60_000) return c.t;
  const d = await graphql<{ boards: { id: string; name?: string; description?: string | null; workspace?: { name?: string } | null; owners?: UsuarioApi[]; columns?: ColumnaApi[];
    groups?: { id: string; title?: string; color?: string | null }[]; items_page?: { cursor?: string | null; items?: ItemApi[] } }[] }>(
    `query ($ids: [ID!]) { boards (ids: $ids) { id name description workspace { name } owners { id name email } columns { id title type } groups { id title color }
      items_page (limit: 25) { cursor items { ${ITEM} } } } }`, { ids: [id] });
  const b = d.boards?.[0];
  if (!b) return null;
  const crudos = [...(b.items_page?.items ?? [])];
  let cursor = b.items_page?.cursor ?? null;
  while (cursor) {
    const n = await graphql<{ next_items_page: { cursor?: string | null; items?: ItemApi[] } }>(
      `query ($c: String!) { next_items_page (cursor: $c, limit: 25) { cursor items { ${ITEM} } } }`, { c: cursor });
    crudos.push(...(n.next_items_page?.items ?? []));
    cursor = n.next_items_page?.cursor ?? null;
  }
  const colsSub = crudos.flatMap((x) => x.subitems ?? []).find((s) => s.board?.columns?.length)?.board?.columns;
  const t: TableroMonday = {
    id: String(b.id), nombre: b.name ?? `Tablero ${b.id}`, descripcion: b.description ?? "", espacio: b.workspace?.name ?? null,
    columnas: columnas(b.columns), columnasSubitem: columnas(colsSub),
    grupos: (b.groups ?? []).map((g) => ({ id: g.id, titulo: g.title ?? g.id, color: g.color ?? null })),
    duenos: (b.owners ?? []).map(persona), usuarios: await usuarios(), items: crudos.map(item),
  };
  cache.set(id, { en: Date.now(), t });
  return t;
}

export async function listarTablerosMonday(prueba?: boolean): Promise<TableroMondayResumen[]> {
  if (demo(prueba)) return TABLEROS_MONDAY_DEMO.map((t) => ({ id: t.id, nombre: t.nombre, espacio: t.espacio, items: t.items.length, actualizadoEn: null }));
  const r: TableroMondayResumen[] = [];
  for (let page = 1; page <= 50; page++) {
    const d = await graphql<{ boards: { id: string; name?: string; type?: string; items_count?: number | null; updated_at?: string | null; workspace?: { name?: string } | null }[] }>(
      "query ($p: Int!) { boards (limit: 100, page: $p, state: active) { id name type items_count updated_at workspace { name } } }", { p: page });
    const xs = d.boards ?? [];
    for (const b of xs) if (!b.type || b.type === "board") r.push({ id: String(b.id), nombre: b.name ?? `Tablero ${b.id}`, espacio: b.workspace?.name ?? null, items: b.items_count ?? 0, actualizadoEn: b.updated_at ?? null });
    if (xs.length < 100) break;
  }
  return r;
}

export async function leerTableroMonday(id: string, prueba?: boolean): Promise<TableroMonday | null> {
  if (demo(prueba)) return structuredClone(TABLEROS_MONDAY_DEMO.find((t) => t.id === id) ?? null);
  return leerReal(id);
}

// ───────────────────────────── el motor

export interface EquipoMonday { id: string; nombre: string; email: string | null; empleadoId: string | null }
export interface ArchivoGuardado { id: string; nombre: string; bytes: number | null; clave: string | null; error?: string }
export interface FilaHistorial {
  id: string; itemId: string; tipo: "ACTUALIZACION" | "ARCHIVOS"; autor: string | null; fecha: string | null; texto: string;
  respuestas: RespuestaMonday[]; archivos: ArchivoGuardado[];
}
export interface Importacion { tableroId: string; nombre: string; proyectoId: string; en: string }
export interface RepoMonday {
  importaciones(): Promise<Importacion[]>;
  equipo(): Promise<EquipoMonday[]>;
  /** Guarda (o reemplaza) el registro de la importación y el historial del proyecto. */
  guardar(reg: { tableroId: string; nombre: string; proyectoId: string; resumen: Record<string, number> }, filas: FilaHistorial[]): Promise<void>;
  historial(proyectoId: string, itemId: string): Promise<FilaHistorial[]>;
  archivo(proyectoId: string, archivoId: string): Promise<ArchivoGuardado | null>;
  almacen: Almacen | null;
}
type Fallar = (status: number, codigo: string, titulo: string, errores?: { campo: string; mensaje: string }[]) => Error;
type Tableros = ReturnType<typeof crearTableros>;

const MAX_ARCHIVO = 100 * 1024 * 1024;

async function copiar(a: ArchivoMonday, clave: string, almacen: Almacen | null): Promise<ArchivoGuardado> {
  const base = { id: a.id, nombre: a.nombre, bytes: a.bytes };
  if (!almacen) return { ...base, clave: null, error: "Sin almacén de archivos configurado" };
  if (!a.url) return { ...base, clave: null, error: "Monday no dio el enlace del archivo" };
  if (a.bytes && a.bytes > MAX_ARCHIVO) return { ...base, clave: null, error: "Pesa más de 100 MB" };
  try {
    const r = await enviar(a.url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return { ...base, clave: null, error: `Monday respondió ${r.status}` };
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > MAX_ARCHIVO) return { ...base, clave: null, error: "Pesa más de 100 MB" };
    await almacen.subir(clave, r.headers.get("content-type") || "application/octet-stream", bytes);
    return { ...base, bytes: bytes.byteLength, clave };
  } catch (e) {
    return { ...base, clave: null, error: (e as Error).message.slice(0, 200) };
  }
}

export function crearImportadorMonday(fallar: Fallar, tableros: Tableros) {
  const protegido = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SinMonday) throw fallar(502, "MONDAY_NO_RESPONDE", "No pudimos leer Monday", [{ campo: "monday", mensaje: e.message }]);
      throw e;
    }
  };
  const tablero = async (id: string, prueba?: boolean) => {
    if (!/^[0-9A-Za-z_-]{1,40}$/.test(id)) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese tablero de Monday");
    const t = await leerTableroMonday(id, prueba);
    if (!t) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese tablero de Monday");
    return t;
  };
  /** La importación que sigue vigente (si borraron el proyecto, el tablero se puede volver a importar). */
  const vigente = async (repo: RepoMonday, id: string, yo: Yo) => {
    const x = (await repo.importaciones()).find((i) => i.tableroId === id);
    return x && (await tableros.existe(x.proyectoId, yo)) ? x : null;
  };

  return {
    listar: (repo: RepoMonday, yo: Yo) => protegido(async () => {
      const [xs, imps] = await Promise.all([listarTablerosMonday(yo.prueba), repo.importaciones()]);
      return {
        conectado: mondayConectado() && !yo.prueba,
        datos: xs.map((t) => {
          const i = imps.find((x) => x.tableroId === t.id);
          return { ...t, importado: i ? { proyectoId: i.proyectoId, en: i.en } : null };
        }),
      };
    }),

    previa: (repo: RepoMonday, id: string, yo: Yo) => protegido(async () => {
      const t = await tablero(id, yo.prueba);
      const p = previaMonday(t);
      const equipo = await repo.equipo();
      const sugeridas = emparejarPersonas(p.personas, equipo);
      const imp = await vigente(repo, id, yo);
      return {
        ...p,
        personas: p.personas.map((x) => ({ ...x, sugeridoId: sugeridas[x.id] })),
        equipo: equipo.map((e) => ({ id: e.id, nombre: e.nombre, conFicha: !!e.empleadoId })),
        importado: imp ? { proyectoId: imp.proyectoId, en: imp.en } : null,
      };
    }),

    importar: (repo: RepoMonday, id: string, yo: Yo & { usuarioId: string; departamento: string | null }, b: PedidoImportacion) => protegido(async () => {
      const t = await tablero(id, yo.prueba);
      const previa = previaMonday(t);
      const errores = validarImportacion(b, previa);
      if (errores.length) throw fallar(422, "VALIDACION", "Revisa los campos marcados", errores);
      if (await vigente(repo, id, yo)) throw fallar(409, "YA_IMPORTADO", "Ese tablero ya está en el portal");

      const equipo = await repo.equipo();
      const ficha = (usuarioId: string | null | undefined, campo: string): PersonaIW | null => {
        if (!usuarioId) return null;
        const e = equipo.find((x) => x.id === usuarioId);
        if (!e) throw fallar(422, "VALIDACION", "Revisa los campos marcados", [{ campo, mensaje: "Esa persona no está en el equipo" }]);
        if (!e.empleadoId) throw fallar(422, "VALIDACION", "Revisa los campos marcados", [{ campo, mensaje: `${e.nombre} no tiene ficha en InooWork` }]);
        return { id: e.empleadoId, nombre: e.nombre };
      };
      const elegidas = { ...emparejarPersonas(previa.personas, equipo), ...((b.personas ?? {}) as Record<string, string | null>) };
      // Sugeridas sin ficha de InooWork quedan sin asignar; las que eligió el admin tienen que tener ficha.
      const pedidas = (b.personas ?? {}) as Record<string, string | null>;
      const personas: Record<string, PersonaIW | null> = {};
      for (const [mid, uid] of Object.entries(elegidas)) {
        personas[mid] = mid in pedidas ? ficha(uid, `personas.${mid}`) : (equipo.find((x) => x.id === uid)?.empleadoId ? ficha(uid, `personas.${mid}`) : null);
      }
      const duenoMapeado = previa.personas.find((x) => x.esDueno && personas[x.id])?.id;
      const yoFicha = equipo.find((x) => x.id === yo.usuarioId)?.empleadoId ? ficha(yo.usuarioId, "liderId") : null;
      const lider = typeof b.liderId === "string" ? ficha(b.liderId, "liderId") : (duenoMapeado ? personas[duenoMapeado] : yoFicha);
      const miembros = [...new Map(Object.values(personas).filter((x): x is PersonaIW => !!x).map((x) => [x.id, x])).values()];
      if (!lider && !miembros.length) throw fallar(422, "VALIDACION", "Revisa los campos marcados", [{ campo: "liderId", mensaje: "Elige un líder: ningún proyecto queda sin una persona de Inoo" }]);

      const estados: Record<string, EstadoItem> = Object.fromEntries(previa.estados.map((e) => [e.etiqueta, e.sugerido]));
      for (const [k, v] of Object.entries((b.estados ?? {}) as Record<string, string>)) if (ESTADOS_ITEM.includes(v as EstadoItem)) estados[k] = v as EstadoItem;
      const { proyecto, items } = convertirTablero(t, {
        nombre: typeof b.nombre === "string" && b.nombre.trim() ? b.nombre.trim() : t.nombre, cliente: typeof b.cliente === "string" ? b.cliente.trim() : "",
        estados, personas, lider, miembros, departamento: yo.departamento,
      });

      // Archivos: se copian al almacén del portal, Google Drive (los enlaces de Monday vencen). De a 4 a la vez.
      // Con copiarArchivos: false quedan solo con su nombre en el historial (para no llenar el Drive).
      const historial = historialDe(t);
      const unicos = new Map<string, ArchivoMonday>();
      for (const h of historial) for (const a of h.archivos) unicos.set(a.id, a);
      const copiados = new Map<string, ArchivoGuardado>();
      const cola = [...unicos.values()];
      if (b.copiarArchivos === false) for (const a of cola.splice(0)) copiados.set(a.id, { id: a.id, nombre: a.nombre, bytes: a.bytes, clave: null, error: "Se importó sin copiar los archivos" });
      await Promise.all(Array.from({ length: Math.min(4, cola.length) }, async () => {
        for (let a = cola.shift(); a; a = cola.shift()) copiados.set(a.id, await copiar(a, `monday/${proyecto.id}/${a.id}-${nombreArchivo(a.nombre)}`, repo.almacen));
      }));
      const filas: FilaHistorial[] = historial.map((h, n) => ({
        id: `${proyecto.id}-${n}`, itemId: items[h.itemMondayId], tipo: h.tipo, autor: h.autor, fecha: h.fecha || null, texto: h.texto, respuestas: h.respuestas,
        archivos: h.archivos.map((a) => copiados.get(a.id)!),
      }));
      const resumen = {
        grupos: previa.conteo.grupos, items: previa.conteo.items, subitems: previa.conteo.subitems, actualizaciones: previa.conteo.actualizaciones,
        archivos: copiados.size, archivosCopiados: [...copiados.values()].filter((a) => a.clave).length,
        sinResponsable: (proyecto.items ?? []).filter((i) => !i.assignee).length,
      };
      // Primero el registro (si InooWork falla, la transacción se deshace y no queda nada a medias en el portal).
      await repo.guardar({ tableroId: t.id, nombre: t.nombre, proyectoId: proyecto.id, resumen }, filas);
      const tablero_ = await tableros.importar(proyecto, yo);
      return { tablero: tablero_, resumen, archivosSinCopiar: [...copiados.values()].filter((a) => !a.clave).map((a) => ({ nombre: a.nombre, motivo: a.error ?? "" })) };
    }),

    /** Historial de Monday de un ítem: quien ve el tablero lo ve. */
    historial: async (repo: RepoMonday, proyectoId: string, itemId: string, yo: Yo) => {
      await tableros.ver(proyectoId, yo);
      // En orden: primero lo que no tiene fecha (archivos sueltos del ítem), luego por fecha.
      const xs = (await repo.historial(proyectoId, itemId)).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
      return {
        datos: xs.map((h) => ({
          id: h.id, tipo: h.tipo, autor: h.autor, fecha: h.fecha, texto: h.texto, respuestas: h.respuestas.map((r) => ({ autor: r.autor, fecha: r.fecha || null, texto: r.texto })),
          archivos: h.archivos.map((a) => ({ id: a.id, nombre: a.nombre, bytes: a.bytes, disponible: !!a.clave })),
        })),
      };
    },
    descargar: async (repo: RepoMonday, proyectoId: string, archivoId: string, yo: Yo) => {
      await tableros.ver(proyectoId, yo);
      const a = await repo.archivo(proyectoId, archivoId);
      if (!a) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese archivo");
      if (!a.clave || !repo.almacen) throw fallar(409, "ARCHIVO_NO_COPIADO", "Ese archivo no se pudo traer de Monday", [{ campo: "archivo", mensaje: a.error ?? "" }]);
      return { url: repo.almacen.urlDescarga(a.clave, a.nombre).url };
    },
  };
}
