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
  aplicarGrupo, aplicarItem, aplicarSubitem, borrarGrupo, columnasPersonalizadas, editaProyecto, itemVencido, nuevoProyecto, personasDelProyecto, resumenProyecto,
  validarGrupo, validarItem, validarSubitem, validarTableroNuevo, veProyecto, type CambioItem, type ItemIW, type PersonaIW, type ProyectoIW, type TableroNuevo,
} from "../dominio/tableros";
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

async function listarIW(): Promise<ProyectoIW[]> {
  // Copia: un cambio que falla a medias no toca los datos guardados.
  if (!tablerosConectados()) return structuredClone(simulados());
  const xs = await llamar("GET", "/api/projects");
  return Array.isArray(xs) ? (xs as ProyectoIW[]) : [];
}
async function obtenerIW(id: string): Promise<ProyectoIW | null> {
  return (await listarIW()).find((p) => p.id === id) ?? null;
}
async function guardarIW(p: ProyectoIW) {
  if (!tablerosConectados()) {
    const xs = simulados();
    const i = xs.findIndex((x) => x.id === p.id);
    if (i >= 0) xs[i] = p;
    return;
  }
  await llamar("PUT", `/api/projects/${encodeURIComponent(p.id)}`, p);
}
async function crearIW(p: ProyectoIW) {
  if (!tablerosConectados()) {
    simulados().push(structuredClone(p));
    return;
  }
  await llamar("POST", "/api/projects", p);
}

// ───────────────────────────── vistas para el portal

export interface Yo { empleadoId: string | null; esAdmin: boolean }
/** Para crear (6 nov): quién lo crea, su departamento en InooWork y cómo pasar ids del portal a fichas de InooWork. */
export interface DatosCreacion {
  lider: PersonaIW | null;
  departamento: string | null;
  /** Ids de usuario del portal → personas de InooWork; los que no tienen ficha no vuelven. */
  miembros: (usuarioIds: string[]) => Promise<PersonaIW[]>;
}
type Fallar = (status: number, codigo: string, titulo: string, errores?: { campo: string; mensaje: string }[]) => Error;

const persona = (id?: string, nombre?: string) => (id ? { id, nombre: nombre || id } : null);
const TIPO_VISTA: Record<string, string> = { table: "TABLA", kanban: "KANBAN", calendar: "CALENDARIO", timeline: "LINEA_TIEMPO", chart: "GRAFICO" };

function itemVista(p: ProyectoIW, it: ItemIW, cols: { id: string }[]) {
  return {
    id: it.id, nombre: it.name, estado: it.status, responsable: persona(it.assignee, it.assigneeName), fecha: it.dueDate || null,
    prioridad: it.priority || "Media", notas: it.notes || "", grupoId: it.groupId, creadoEn: it.createdAt || null, vencido: itemVencido(it),
    valores: Object.fromEntries(cols.map((c) => [c.id, it[c.id] ?? ""]).filter(([, v]) => v !== "")) as Record<string, string | number>,
    subitems: (it.subitems ?? []).map((s) => ({ id: s.id, nombre: s.name, estado: s.status, responsable: persona(s.assignee, s.assigneeName), fecha: s.dueDate || null, vencido: itemVencido(s) })),
  };
}

function tableroVista(p: ProyectoIW, yo: Yo) {
  const cols = columnasPersonalizadas(p);
  const tipos = [...new Set((p.views ?? []).map((v) => TIPO_VISTA[v.type]).filter(Boolean))];
  return {
    id: p.id, nombre: p.name, cliente: p.clientName?.trim() || null, descripcion: p.description || null, color: p.color || "#6366f1", estado: p.status || null, area: p.department || null,
    lider: persona(p.leaderId, p.leaderName), personas: personasDelProyecto(p),
    grupos: (p.groups ?? []).map((g) => ({ id: g.id, nombre: g.name, color: g.color })),
    columnas: cols.map((c) => ({ id: c.id, nombre: c.label, tipo: c.type })),
    vistas: (tipos.length ? tipos : ["TABLA"]).map((t) => ({ tipo: t })),
    items: (p.items ?? []).map((it) => itemVista(p, it, cols)),
    puedeEditar: editaProyecto(p, yo.empleadoId, yo.esAdmin),
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
    const p = await obtenerIW(id);
    if (!p || p.archived || !veProyecto(p, yo.empleadoId, yo.esAdmin)) throw fallar(404, "NO_ENCONTRADO", "No encontramos ese proyecto");
    return p;
  };
  /** Vuelve a leer, revisa permisos, aplica el cambio y guarda. */
  const cambiar = (id: string, yo: Yo, fn: (p: ProyectoIW) => void) =>
    protegido(async () => {
      const p = await visible(id, yo);
      if (!editaProyecto(p, yo.empleadoId, yo.esAdmin)) throw fallar(403, "SIN_PERMISO", "Solo el líder y los miembros del proyecto lo pueden cambiar");
      fn(p);
      await guardarIW(p);
      return tableroVista(p, yo);
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
    listar: (yo: Yo) => protegido(async () => ({
      conectado: tablerosConectados(),
      datos: (await listarIW())
        .filter((p) => !p.archived && veProyecto(p, yo.empleadoId, yo.esAdmin))
        .map((p) => ({
          id: p.id, nombre: p.name, cliente: p.clientName?.trim() || null, descripcion: p.description || null, color: p.color || "#6366f1", estado: p.status || null, area: p.department || null,
          lider: persona(p.leaderId, p.leaderName), miembros: personasDelProyecto(p).length, items: resumenProyecto(p), puedeEditar: editaProyecto(p, yo.empleadoId, yo.esAdmin),
          esMio: !!yo.empleadoId && personasDelProyecto(p).some((x) => x.id === yo.empleadoId),
        })),
    })),
    crear: (yo: Yo, b: TableroNuevo, datos: DatosCreacion) => protegido(async () => {
      if (!yo.empleadoId && !yo.esAdmin) throw fallar(403, "SIN_FICHA_INOOWORK", "Necesitas tu ficha de InooWork para crear proyectos");
      validar(validarTableroNuevo(b));
      const ids = [...new Set((b.miembros as string[] | undefined) ?? [])];
      const miembros = ids.length ? await datos.miembros(ids) : [];
      if (miembros.length !== ids.length) validar([{ campo: "miembros", mensaje: "Alguna de esas personas no tiene ficha en InooWork" }]);
      const p = nuevoProyecto(b, yo.empleadoId ? datos.lider : null, miembros, datos.departamento);
      await crearIW(p);
      return tableroVista(p, yo);
    }),
    ver: (id: string, yo: Yo) => protegido(async () => tableroVista(await visible(id, yo), yo)),
    cambiarCliente: (id: string, yo: Yo, b: { cliente?: unknown }) => cambiar(id, yo, (p) => {
      const cliente = typeof b.cliente === "string" ? b.cliente.trim() : "";
      validar(cliente && cliente.length <= 120 ? [] : [{ campo: "cliente", mensaje: "Escribe el nombre del cliente" }]);
      p.clientName = cliente;
    }),
    crearItem: (id: string, yo: Yo, b: CambioItem) => cambiar(id, yo, (p) => {
      validar(validarItem(b, p, true));
      aplicarItem(p, b, null);
    }),
    cambiarItem: (id: string, itemId: string, yo: Yo, b: CambioItem) => cambiar(id, yo, (p) => {
      item(p, itemId);
      validar(validarItem(b, p, false));
      aplicarItem(p, b, itemId);
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
