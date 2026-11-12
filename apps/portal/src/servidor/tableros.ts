/**
 * Tableros de InooWork en el portal (2 nov 2026): la API del portal (/tableros) sobre la API que InooWork ya
 * tiene (`GET /api/projects`, `PUT /api/projects/:id`), sin tocar su código. InooWork es la fuente.
 *
 * Variables: INOOWORK_URL e INOOWORK_API_KEY (las mismas de inoowork.ts; la llave por header `x-api-key`
 * del parche de seguridad INO-00). Sin INOOWORK_URL se usan proyectos de demo en memoria (modo simulado).
 *
 * InooWork guarda el proyecto completo de una vez; por eso cada cambio vuelve a leer el proyecto, aplica solo
 * ese cambio y lo guarda, para no pisar lo que otra persona cambió entretanto.
 * La usan la API simulada y el backend real: cada una pasa quién pide y cómo arma sus errores.
 */
import {
  aplicarEstadoProyecto, aplicarGrupo, aplicarItem, aplicarSubitem, borrarGrupo, ESTADOS_PROYECTO_IW, columnasPersonalizadas, editaProyecto, itemVencido, nuevoProyecto, personasDelProyecto, resumenProyecto,
  validarGrupo, validarItem, validarSubitem, validarTableroNuevo, veProyecto, type CambioItem, type ItemIW, type PersonaIW, type ProyectoIW, type TableroNuevo,
} from "../dominio/tableros";
import { culminadoArchivado } from "../dominio/proyectos";
import { accionColumna, agregarColumna, borrarColumna, cambiarColumna, guardarValor, marcarCambio, type CambioColumna, type ColumnaIW, type Conectados, type Quien } from "../dominio/tableros";
import { info, valorCalculado, type ItemCalc } from "../dominio/columnas";
import { PROYECTOS_DEMO } from "../mock/inoowork-demo";

const env = (k: string) => process.env[k]?.trim() || undefined;
export const tablerosConectados = () => !!env("INOOWORK_URL");

// ───────────────────────────── almacén: InooWork real o simulado

type ConSimulados = typeof globalThis & { __inooProyectosIW?: ProyectoIW[] };
const simulados = () => ((globalThis as ConSimulados).__inooProyectosIW ??= structuredClone(PROYECTOS_DEMO));
/** Pruebas: vuelve a los proyectos de demo. */
export function reiniciarTablerosSimulados() {
  (globalThis as ConSimulados).__inooProyectosIW = structuredClone(PROYECTOS_DEMO);
}

let enviar: typeof fetch = (...a) => fetch(...a);
/** Solo pruebas: reemplaza fetch para simular a InooWork. */
export function usarFetchTableros(f: typeof fetch | null) {
  enviar = f ?? ((...a) => fetch(...a));
}

class SinInooWork extends Error {}
async function llamar(metodo: string, ruta: string, cuerpo?: unknown) {
  const base = env("INOOWORK_URL")!.replace(/\/+$/, "");
  let r: Response;
  try {
    r = await enviar(`${base}${ruta}`, {
      method: metodo,
      headers: { "content-type": "application/json", ...(env("INOOWORK_API_KEY") ? { "x-api-key": env("INOOWORK_API_KEY")! } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new SinInooWork(`InooWork no respondió (${(e as Error).message})`);
  }
  if (!r.ok) throw new SinInooWork(`InooWork respondió ${r.status}`);
  return r.json() as Promise<unknown>;
}

/** En el entorno de pruebas (6 nov) siempre el set de demo, nunca el InooWork real. */
const demo = (prueba?: boolean) => !tablerosConectados() || !!prueba;

async function listarIW(prueba?: boolean): Promise<ProyectoIW[]> {
  // Copia: un cambio que falla a medias no toca los datos guardados.
  if (demo(prueba)) return structuredClone(simulados());
  const xs = await llamar("GET", "/api/projects");
  return Array.isArray(xs) ? (xs as ProyectoIW[]) : [];
}
async function obtenerIW(id: string, prueba?: boolean): Promise<ProyectoIW | null> {
  return (await listarIW(prueba)).find((p) => p.id === id) ?? null;
}
async function guardarIW(p: ProyectoIW, prueba?: boolean) {
  if (demo(prueba)) {
    const xs = simulados();
    const i = xs.findIndex((x) => x.id === p.id);
    if (i >= 0) xs[i] = p;
    return;
  }
  await llamar("PUT", `/api/projects/${encodeURIComponent(p.id)}`, p);
}
async function crearIW(p: ProyectoIW, prueba?: boolean) {
  if (demo(prueba)) {
    simulados().push(structuredClone(p));
    return;
  }
  await llamar("POST", "/api/projects", p);
}

// ───────────────────────────── vistas para el portal

export interface Yo { empleadoId: string | null; esAdmin: boolean; prueba?: boolean; usuarioId?: string; nombre?: string }
const quienDe = (yo: Yo): Quien => ({ id: yo.usuarioId ?? yo.empleadoId, nombre: yo.nombre ?? null });
/** Para crear (6 nov): quién lo crea, su departamento en InooWork y cómo pasar ids del portal a fichas de InooWork. */
export interface DatosCreacion {
  lider: PersonaIW | null;
  departamento: string | null;
  /** Ids de usuario del portal → personas de InooWork; los que no tienen ficha no vuelven. */
  miembros: (usuarioIds: string[]) => Promise<PersonaIW[]>;
}
/** Los ítems de los tableros conectados (columna «Conectar tableros»); solo los que el usuario puede ver. */
async function conectadosDe(p: ProyectoIW, yo: Yo): Promise<Record<string, ProyectoIW["items"]>> {
  const ids = [...new Set(columnasPersonalizadas(p).filter((c) => c.type === "board_relation" && c.config?.tableroId).map((c) => c.config!.tableroId!))];
  if (!ids.length) return {};
  const todos = await listarIW(yo.prueba);
  return Object.fromEntries(ids.map((id) => {
    const x = todos.find((q) => q.id === id && !q.deleted && veProyecto(q, yo.empleadoId, yo.esAdmin));
    return [id, x?.items ?? []];
  }));
}
const soloNombres = (c: Record<string, ProyectoIW["items"]>): Conectados => Object.fromEntries(Object.entries(c).map(([k, xs]) => [k, (xs ?? []).map((i) => ({ id: i.id, name: i.name }))]));

type Fallar = (status: number, codigo: string, titulo: string, errores?: { campo: string; mensaje: string }[]) => Error;

const persona = (id?: string, nombre?: string) => (id ? { id, nombre: nombre || id } : null);
const TIPO_VISTA: Record<string, string> = { table: "TABLA", kanban: "KANBAN", calendar: "CALENDARIO", timeline: "LINEA_TIEMPO", chart: "GRAFICO" };

function itemVista(p: ProyectoIW, it: ItemIW, cols: ColumnaIW[], conectados: Record<string, ProyectoIW["items"]>) {
  const calc = { cols: cols.map((c) => ({ id: c.id, label: c.label, tipo: c.type, config: c.config })), items: (p.items ?? []) as ItemCalc[], conectados: conectados as Record<string, ItemCalc[]> };
  const valor = (c: ColumnaIW) => (info(c.type)?.calculada ? valorCalculado(it as ItemCalc, calc.cols.find((x) => x.id === c.id)!, calc) : it[c.id] ?? "");
  return {
    datos: Object.fromEntries(cols.filter((c) => it[`${c.id}__d`] !== undefined).map((c) => [c.id, it[`${c.id}__d`]])),
    id: it.id, nombre: it.name, estado: it.status, responsable: persona(it.assignee, it.assigneeName), fecha: it.dueDate || null,
    prioridad: it.priority || "Media", notas: it.notes || "", grupoId: it.groupId, creadoEn: it.createdAt || null, vencido: itemVencido(it), deMonday: !!it.mondayId,
    valores: Object.fromEntries(cols.map((c) => [c.id, valor(c)]).filter(([, v]) => v !== "")) as Record<string, string | number>,
    subitems: (it.subitems ?? []).map((s) => ({ id: s.id, nombre: s.name, estado: s.status, responsable: persona(s.assignee, s.assigneeName), fecha: s.dueDate || null, vencido: itemVencido(s) })),
  };
}

function tableroVista(p: ProyectoIW, yo: Yo, conectados: Record<string, ProyectoIW["items"]> = {}) {
  const cols = columnasPersonalizadas(p);
  const tipos = [...new Set((p.views ?? []).map((v) => TIPO_VISTA[v.type]).filter(Boolean))];
  return {
    id: p.id, nombre: p.name, cliente: p.clientName?.trim() || null, descripcion: p.description || null, color: p.color || "#6366f1", estado: p.status || null, area: p.department || null,
    completadoEn: p.completadoEn ?? null,
    lider: persona(p.leaderId, p.leaderName), personas: personasDelProyecto(p),
    grupos: (p.groups ?? []).map((g) => ({ id: g.id, nombre: g.name, color: g.color })),
    columnas: cols.map((c) => ({ id: c.id, nombre: c.label, tipo: c.type, config: c.config ?? null })),
    vistas: (tipos.length ? tipos : ["TABLA"]).map((t) => ({ tipo: t })),
    items: (p.items ?? []).map((it) => itemVista(p, it, cols, conectados)),
    puedeEditar: editaProyecto(p, yo.empleadoId, yo.esAdmin) && !p.archived,
    archivado: !!p.archived, archivadoEn: p.archivedAt ?? null,
    puedeDesarchivar: !!p.archived && editaProyecto(p, yo.empleadoId, yo.esAdmin),
  };
}

export function crearTableros(fallar: Fallar) {
  const protegido = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SinInooWork) throw fallar(502, "INOOWORK_NO_RESPONDE", "No pudimos hablar con InooWork", [{ campo: "inoowork", mensaje: e.message }]);
      throw e;
    }
  };
  const visible = async (id: string, yo: Yo) => {
    const p = await obtenerIW(id, yo.prueba);
    if (!p || p.deleted || !veProyecto(p, yo.empleadoId, yo.esAdmin)) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese proyecto");
    return p;
  };
  /** Vuelve a leer, revisa permisos, aplica el cambio y guarda. */
  const cambiar = (id: string, yo: Yo, fn: (p: ProyectoIW, conectados: Conectados) => void | Promise<void>) =>
    protegido(async () => {
      const p = await visible(id, yo);
      if (!editaProyecto(p, yo.empleadoId, yo.esAdmin)) throw fallar(403, "SIN_PERMISO", "Solo el líder y los miembros del proyecto lo pueden cambiar");
      if (p.archived) throw fallar(409, "ARCHIVADO", "Este proyecto está archivado: desarchívalo para cambiarlo");
      const antes = await conectadosDe(p, yo);
      await fn(p, soloNombres(antes));
      await guardarIW(p, yo.prueba);
      return tableroVista(p, yo, await conectadosDe(p, yo));
    });
  const validar = (errores: { campo: string; mensaje: string }[]) => {
    if (errores.length) throw fallar(422, "VALIDACION", "Revisa los campos marcados", errores);
  };
  const item = (p: ProyectoIW, itemId: string) => {
    const it = (p.items ?? []).find((x) => x.id === itemId);
    if (!it) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese ítem");
    return it;
  };

  return {
    /**
     * Mi trabajo (12 nov), como en Monday: lo asignado a mí en todos los tableros que veo (responsable, una columna de
     * personas o un subítem), sin lo completado.
     */
    miTrabajo: (yo: Yo) => protegido(async () => {
      if (!yo.empleadoId) return { datos: [] as unknown[] };
      const yoId = yo.empleadoId;
      const datos: { tableroId: string; tablero: string; cliente: string | null; itemId: string; nombre: string; padre: string | null; grupo: string | null;
        estado: string; prioridad: string | null; fecha: string | null; vencido: boolean; como: "RESPONSABLE" | "PERSONAS" | "SUBITEM" }[] = [];
      for (const p of await listarIW(yo.prueba)) {
        if (p.archived || p.deleted || !veProyecto(p, yo.empleadoId, yo.esAdmin)) continue;
        const cols = columnasPersonalizadas(p).filter((c) => c.type === "people");
        for (const it of p.items ?? []) {
          const grupo = (p.groups ?? []).find((g) => g.id === it.groupId)?.name ?? null;
          const enPersonas = cols.some((c) => Array.isArray(it[`${c.id}__d`]) && (it[`${c.id}__d`] as string[]).includes(yoId));
          if (it.status !== "Completado" && (it.assignee === yoId || enPersonas)) {
            datos.push({ tableroId: p.id, tablero: p.name, cliente: p.clientName?.trim() || null, itemId: it.id, nombre: it.name, padre: null, grupo, estado: it.status,
              prioridad: it.priority || null, fecha: it.dueDate || null, vencido: itemVencido(it), como: it.assignee === yoId ? "RESPONSABLE" : "PERSONAS" });
          }
          for (const s of it.subitems ?? []) {
            if (s.status === "Completado" || s.assignee !== yoId) continue;
            datos.push({ tableroId: p.id, tablero: p.name, cliente: p.clientName?.trim() || null, itemId: it.id, nombre: s.name, padre: it.name, grupo, estado: s.status,
              prioridad: null, fecha: s.dueDate || null, vencido: itemVencido(s), como: "SUBITEM" });
          }
        }
      }
      datos.sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.nombre.localeCompare(b.nombre, "es"));
      return { datos };
    }),
    /** Con `archivados`, solo los archivados (13 nov): guardados, fuera de las listas del día a día. */
    listar: (yo: Yo, o: { archivados?: boolean } = {}) => protegido(async () => ({
      conectado: tablerosConectados() && !yo.prueba,
      datos: (await listarIW(yo.prueba))
        .filter((p) => !!p.archived === !!o.archivados && !p.deleted && veProyecto(p, yo.empleadoId, yo.esAdmin))
        .map((p) => ({
          id: p.id, nombre: p.name, cliente: p.clientName?.trim() || null, descripcion: p.description || null, color: p.color || "#6366f1", estado: p.status || null, area: p.department || null,
          lider: persona(p.leaderId, p.leaderName), miembros: personasDelProyecto(p).length, items: resumenProyecto(p), puedeEditar: editaProyecto(p, yo.empleadoId, yo.esAdmin),
          esMio: !!yo.empleadoId && personasDelProyecto(p).some((x) => x.id === yo.empleadoId),
          archivadoEn: p.archivedAt ?? null,
        })),
    })),
    /** Desarchivar (13 nov): vuelve a las listas, en curso (si no, el proceso diario lo archivaría de nuevo). */
    desarchivar: (id: string, yo: Yo) => protegido(async () => {
      const p = await visible(id, yo);
      if (!editaProyecto(p, yo.empleadoId, yo.esAdmin)) throw fallar(403, "SIN_PERMISO", "Solo el líder, los miembros o un admin lo pueden desarchivar");
      if (!p.archived) throw fallar(409, "NO_ARCHIVADO", "Este proyecto no está archivado");
      p.archived = false;
      delete p.archivedAt;
      delete p.completadoEn;
      if (p.status === "Completado") p.status = "En Progreso";
      await guardarIW(p, yo.prueba);
      return tableroVista(p, yo, await conectadosDe(p, yo));
    }),
    crear: (yo: Yo, b: TableroNuevo, datos: DatosCreacion) => protegido(async () => {
      if (!yo.empleadoId && !yo.esAdmin) throw fallar(403, "SIN_FICHA_INOOWORK", "Necesitas tu ficha de InooWork para crear proyectos");
      validar(validarTableroNuevo(b));
      const ids = [...new Set((b.miembros as string[] | undefined) ?? [])];
      const miembros = ids.length ? await datos.miembros(ids) : [];
      if (miembros.length !== ids.length) validar([{ campo: "miembros", mensaje: "Alguna de esas personas no tiene ficha en InooWork" }]);
      // 6 nov: ningún proyecto sin una persona de Inoo (quien lo crea sin ficha tiene que sumar a alguien).
      if (!yo.empleadoId && !miembros.length) validar([{ campo: "miembros", mensaje: "Agrega al menos a una persona de Inoo" }]);
      const p = nuevoProyecto(b, yo.empleadoId ? datos.lider : null, miembros, datos.departamento);
      await crearIW(p, yo.prueba);
      return tableroVista(p, yo);
    }),
    ver: (id: string, yo: Yo) => protegido(async () => {
      const p = await visible(id, yo);
      return tableroVista(p, yo, await conectadosDe(p, yo));
    }),
    /** Columnas (11 nov): la biblioteca de tipos de Monday. */
    crearColumna: (id: string, yo: Yo, b: CambioColumna) => cambiar(id, yo, (p) => {
      const r = agregarColumna(p, b);
      validar(r.errores);
    }),
    cambiarColumna: (id: string, colId: string, yo: Yo, b: CambioColumna) => cambiar(id, yo, (p) => {
      if (!columnasPersonalizadas(p).some((c) => c.id === colId)) throw fallar(404, "NO_ENCONTRADO", "No encontramos esa columna");
      validar(cambiarColumna(p, colId, b));
    }),
    borrarColumna: (id: string, colId: string, yo: Yo) => cambiar(id, yo, (p) => {
      const e = borrarColumna(p, colId);
      if (e) throw fallar(404, "NO_ENCONTRADO", e);
    }),
    /** Votar, iniciar o pausar el cronómetro, apretar el botón. */
    accion: (id: string, itemId: string, colId: string, yo: Yo) => cambiar(id, yo, (p) => {
      const e = accionColumna(p, itemId, colId, quienDe(yo));
      if (e) throw fallar(e.startsWith("No encontramos") ? 404 : 409, e.startsWith("No encontramos") ? "NO_ENCONTRADO" : "ACCION_NO_VALIDA", e);
    }),
    /** Para los archivos de una columna: aplica un cambio al dato del ítem (texto y lista de archivos). */
    cambiarDatoColumna: (id: string, itemId: string, colId: string, yo: Yo, fn: (dato: unknown) => { texto: string; dato: unknown }) => cambiar(id, yo, (p) => {
      const it = item(p, itemId);
      const col = columnasPersonalizadas(p).find((c) => c.id === colId);
      if (!col || col.type !== "file") throw fallar(404, "NO_ENCONTRADO", "No encontramos esa columna de archivos");
      const r = fn(it[`${colId}__d`]);
      guardarValor(it, colId, r.texto, r.dato);
      marcarCambio(it, quienDe(yo));
    }),
    /** Importación de Monday (9 nov): crea el proyecto ya armado. */
    importar: (p: ProyectoIW, yo: Yo) => protegido(async () => {
      await crearIW(p, yo.prueba);
      return tableroVista(p, yo);
    }),
    /** Los ids de todos los proyectos que existen (sin borrar), de una sola lectura (13 nov: la importación masiva). */
    existentes: (yo: Yo) => protegido(async () => new Set((await listarIW(yo.prueba)).filter((p) => !p.deleted).map((p) => p.id))),
    /** ¿Sigue existiendo (y sin borrar) ese proyecto? Para no importar dos veces el mismo tablero. */
    existe: (id: string, yo: Yo) => protegido(async () => {
      const p = await obtenerIW(id, yo.prueba);
      return !!p && !p.deleted;
    }),
    /** Cliente y estado del proyecto (6 nov: «Completado» lo culmina y a los 14 días se archiva). */
    cambiarProyecto: (id: string, yo: Yo, b: { cliente?: unknown; estado?: unknown }) => cambiar(id, yo, (p) => {
      const errores: { campo: string; mensaje: string }[] = [];
      if (b.cliente === undefined && b.estado === undefined) errores.push({ campo: "cliente", mensaje: "Di qué cambiar: cliente o estado" });
      const cliente = typeof b.cliente === "string" ? b.cliente.trim() : "";
      if (b.cliente !== undefined && !(cliente && cliente.length <= 120)) errores.push({ campo: "cliente", mensaje: "Escribe el nombre del cliente" });
      if (b.estado !== undefined && !ESTADOS_PROYECTO_IW.includes(b.estado as (typeof ESTADOS_PROYECTO_IW)[number])) errores.push({ campo: "estado", mensaje: `Usa uno de: ${ESTADOS_PROYECTO_IW.join(", ")}` });
      validar(errores);
      if (b.cliente !== undefined) p.clientName = cliente;
      if (b.estado !== undefined) aplicarEstadoProyecto(p, b.estado as string);
    }),
    /**
     * Proceso diario (6 nov): los proyectos «Completado» reciben su fecha de culminado si no la tienen (los que se
     * culminaron en InooWork) y, a los 14 días, se archivan como en InooWork (archived + archivedAt).
     */
    archivarCulminados: (hoy: string) => protegido(async () => {
      let fechados = 0;
      let archivados = 0;
      for (const p of await listarIW()) {
        if (p.archived || p.deleted || p.status !== "Completado") continue;
        if (!p.completadoEn) {
          p.completadoEn = hoy;
          fechados++;
        } else if (culminadoArchivado(p.completadoEn, hoy)) {
          p.archived = true;
          p.archivedAt = new Date(`${hoy}T12:00:00Z`).toISOString();
          archivados++;
        } else continue;
        await guardarIW(p);
      }
      return { fechados, archivados };
    }),
    crearItem: (id: string, yo: Yo, b: CambioItem) => cambiar(id, yo, (p, con) => {
      validar(validarItem(b, p, true, con));
      aplicarItem(p, b, null, quienDe(yo), con);
    }),
    cambiarItem: (id: string, itemId: string, yo: Yo, b: CambioItem) => cambiar(id, yo, (p, con) => {
      item(p, itemId);
      validar(validarItem(b, p, false, con, itemId));
      aplicarItem(p, b, itemId, quienDe(yo), con);
    }),
    /**
     * Acciones en lote (12 nov), como en Monday: el mismo cambio a varios ítems (estado, responsable, prioridad, fecha,
     * grupo) o borrarlos, en un solo guardado en InooWork.
     */
    lote: (id: string, yo: Yo, b: { ids?: unknown; cambio?: unknown; borrar?: unknown }) => cambiar(id, yo, (p, con) => {
      const ids = Array.isArray(b.ids) ? [...new Set(b.ids as unknown[])] : [];
      if (!ids.length || ids.length > 500 || ids.some((x) => typeof x !== "string")) validar([{ campo: "ids", mensaje: "Elige entre 1 y 500 ítems" }]);
      for (const x of ids as string[]) item(p, x);
      if (b.borrar === true) {
        p.items = (p.items ?? []).filter((x) => !(ids as string[]).includes(x.id));
        return;
      }
      const c = (b.cambio ?? {}) as CambioItem;
      if (typeof c !== "object" || c.nombre !== undefined || c.valores !== undefined) validar([{ campo: "cambio", mensaje: "En lote se cambia estado, responsable, prioridad, fecha o grupo" }]);
      if (!Object.keys(c).length) validar([{ campo: "cambio", mensaje: "Di qué cambiar" }]);
      validar(validarItem(c, p, false, con));
      for (const x of ids as string[]) aplicarItem(p, c, x, quienDe(yo), con);
    }),
    borrarItem: (id: string, itemId: string, yo: Yo) => cambiar(id, yo, (p) => {
      item(p, itemId);
      p.items = (p.items ?? []).filter((x) => x.id !== itemId);
    }),
    crearSubitem: (id: string, itemId: string, yo: Yo, b: CambioItem) => cambiar(id, yo, (p) => {
      const it = item(p, itemId);
      validar(validarSubitem(b, p, true));
      aplicarSubitem(p, it, b, null);
    }),
    cambiarSubitem: (id: string, itemId: string, subId: string, yo: Yo, b: CambioItem) => cambiar(id, yo, (p) => {
      const it = item(p, itemId);
      if (!(it.subitems ?? []).some((s) => s.id === subId)) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese subítem");
      validar(validarSubitem(b, p, false));
      aplicarSubitem(p, it, b, subId);
    }),
    borrarSubitem: (id: string, itemId: string, subId: string, yo: Yo) => cambiar(id, yo, (p) => {
      const it = item(p, itemId);
      it.subitems = (it.subitems ?? []).filter((s) => s.id !== subId);
    }),
    crearGrupo: (id: string, yo: Yo, b: { nombre?: unknown; color?: unknown }) => cambiar(id, yo, (p) => {
      validar(validarGrupo(b, true));
      aplicarGrupo(p, b, null);
    }),
    cambiarGrupo: (id: string, grupoId: string, yo: Yo, b: { nombre?: unknown; color?: unknown }) => cambiar(id, yo, (p) => {
      if (!(p.groups ?? []).some((g) => g.id === grupoId)) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese grupo");
      validar(validarGrupo(b, false));
      aplicarGrupo(p, b, grupoId);
    }),
    borrarGrupo: (id: string, grupoId: string, yo: Yo) => cambiar(id, yo, (p) => {
      if (!(p.groups ?? []).some((g) => g.id === grupoId)) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese grupo");
      const error = borrarGrupo(p, grupoId);
      if (error) throw fallar(409, "ULTIMO_GRUPO", error);
    }),
  };
}
