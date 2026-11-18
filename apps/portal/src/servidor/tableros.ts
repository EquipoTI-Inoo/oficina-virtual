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
import { enlacesDe, esIdInvitado, esPermiso, esPrivado, fijarInvitado, fijarPermiso, invitadosDe, mayorPermiso, nuevoEnlace, ocultoPara, permisoEn, quitarInvitado, type PermisoTablero } from "../dominio/compartir-tablero";
import { leerToken, tokenDe } from "./firma-enlace";
import { automatizacionesDe, correrAutomatizaciones, MAX_AUTOMATIZACIONES_TABLERO, textoAutomatizacion, validarAutomatizacionTablero, type AutomatizacionTablero, type AvisoAutomatizacion } from "../dominio/automatizaciones-tablero";
import { clientesDeTableros } from "../dominio/cliente-de-tablero";
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

// ───────────────────────────── lo pendiente de una persona en los tableros (Mi trabajo, Mi panel, calendario)

export interface PendienteTablero {
  tableroId: string; tablero: string; cliente: string | null; itemId: string; nombre: string; padre: string | null; grupo: string | null;
  estado: string; prioridad: string | null; fecha: string | null; vencido: boolean; como: "RESPONSABLE" | "PERSONAS" | "SUBITEM";
}
/** Una tarea de un servicio de catálogo en la misma lista (13 nov): mismos campos, con su enlace al proyecto. */
const ESTADO_TAREA_IW: Record<string, string> = { PENDIENTE: "Sin Iniciar", EN_CURSO: "En Progreso", BLOQUEADA: "Bloqueado" };
export function tareaComoPendiente(t: { id: string; titulo: string; estado: string; fecha: string | null; servicioId: string; proyecto: string; cliente: string | null }, hoy: string) {
  return {
    tableroId: "", tablero: t.proyecto, cliente: t.cliente, itemId: t.id, nombre: t.titulo, padre: null, grupo: null, estado: ESTADO_TAREA_IW[t.estado] ?? t.estado,
    prioridad: null, fecha: t.fecha, vencido: !!t.fecha && t.fecha < hoy, como: "TAREA" as const, enlace: `/equipo/proyectos/${t.servicioId}`,
  };
}
/** Los ítems de tableros con fecha, como eventos del calendario. */
export const pendientesComoEventos = (xs: PendienteTablero[], desde: string, hasta: string, hoy: string) =>
  xs.filter((x) => x.fecha && x.fecha >= desde && x.fecha <= hasta).map((x) => ({
    id: `item-${x.tableroId}-${x.itemId}-${x.nombre}`.slice(0, 200), tipo: "TAREA" as const, titulo: x.padre ? `${x.nombre} (${x.padre})` : x.nombre, fecha: x.fecha!,
    detalle: x.tablero, enlace: `/equipo/proyectos/tableros/${x.tableroId}?item=${encodeURIComponent(x.itemId)}`, vencido: x.fecha! < hoy,
  }));

function pendientesDe(proyectos: ProyectoIW[], empleado: string): PendienteTablero[] {
  const datos: PendienteTablero[] = [];
  for (const p of proyectos) {
    // 18 nov (Ernesto): un proyecto culminado (o cancelado) ya no deja pendientes ni vencidos, aunque falten los 14 días para archivarse.
    if (p.archived || p.deleted || p.status === "Completado" || p.status === "Cancelado") continue;
    const cols = columnasPersonalizadas(p).filter((c) => c.type === "people");
    for (const it of p.items ?? []) {
      const grupo = (p.groups ?? []).find((g) => g.id === it.groupId)?.name ?? null;
      const enPersonas = cols.some((c) => Array.isArray(it[`${c.id}__d`]) && (it[`${c.id}__d`] as string[]).includes(empleado));
      if (it.status !== "Completado" && (it.assignee === empleado || enPersonas)) {
        datos.push({ tableroId: p.id, tablero: p.name, cliente: p.clientName?.trim() || null, itemId: it.id, nombre: it.name, padre: null, grupo, estado: it.status,
          prioridad: it.priority || null, fecha: it.dueDate || null, vencido: itemVencido(it), como: it.assignee === empleado ? "RESPONSABLE" : "PERSONAS" });
      }
      for (const s of it.subitems ?? []) {
        if (s.status === "Completado" || s.assignee !== empleado) continue;
        datos.push({ tableroId: p.id, tablero: p.name, cliente: p.clientName?.trim() || null, itemId: it.id, nombre: s.name, padre: it.name, grupo, estado: s.status,
          prioridad: null, fecha: s.dueDate || null, vencido: itemVencido(s), como: "SUBITEM" });
      }
    }
  }
  return datos.sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.nombre.localeCompare(b.nombre, "es"));
}

// ───────────────────────────── vistas para el portal

/** 17 nov: un invitado de afuera va con empleadoId «invitado:<usuarioId>» (dominio/compartir-tablero.ts) y su correo. */
export interface Yo { empleadoId: string | null; esAdmin: boolean; prueba?: boolean; usuarioId?: string; nombre?: string; email?: string }
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
  // 17 nov: un invitado de afuera ve el tablero y sus ítems, no cómo está compartido ni las reglas internas.
  const invitado = esIdInvitado(yo.empleadoId);
  const administra = editaProyecto(p, yo.empleadoId, yo.esAdmin) && !invitado;
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
    puedeBorrar: yo.esAdmin || (!!yo.empleadoId && p.leaderId === yo.empleadoId),
    // 16 nov: privado (solo sus personas, ni los admins); lo cambia solo el líder.
    privado: esPrivado(p),
    // 16 nov (tanda 4): marca, servicio vinculado y etiquetas libres, guardados en el JSON de InooWork.
    marcaId: typeof p.portalMarcaId === "string" ? p.portalMarcaId : null,
    servicioId: typeof p.portalServicioId === "string" ? p.portalServicioId : null,
    etiquetas: etiquetasDe(p),
    // 17 nov: su carpeta en Proyectos (la resuelve la API si se borró).
    carpetaId: invitado ? null : carpetaDe(p),
    puedeHacerPrivado: !!yo.empleadoId && p.leaderId === yo.empleadoId && !p.archived,
    // 16 nov: compartir como en Docs. El permiso de quien mira, el de cada persona y (para editores) los enlaces.
    miPermiso: permisoEn(p, yo.empleadoId, yo.esAdmin) ?? "LECTOR",
    permisos: invitado ? {} : Object.fromEntries(personasDelProyecto(p).map((x) => [x.id, permisoEn(p, x.id, false) ?? "LECTOR"])),
    enlaces: administra
      ? enlacesDe(p).map((e) => ({ audiencia: e.audiencia, permiso: e.permiso, activo: e.activo, token: tokenDe(p.id, e), creadoEn: e.creadoEn }))
      : [],
    // 17 nov: los invitados de afuera (solo para el equipo que edita) y si quien mira es uno.
    soyInvitado: invitado,
    invitados: administra
      ? Object.entries(invitadosDe(p)).map(([id, x]) => ({ id, nombre: x.nombre, email: x.email, permiso: x.permiso, desde: x.desde }))
      : [],
    // 13 nov: las automatizaciones del tablero («cuando X, hacer Y»), con su texto para leerlas.
    automatizaciones: invitado ? [] : automatizacionesDe(p).map((a) => ({ ...a, texto: textoAutomatizacion(a, p) })),
  };
}

const carpetaDe = (p: ProyectoIW) => (typeof p.portalCarpetaId === "string" ? p.portalCarpetaId : null);
/** La última vez que algo del tablero cambió: el ítem más reciente (creado o cambiado), o el proyecto. */
function ultimaActividad(p: ProyectoIW): string | null {
  let max = typeof p.createdAt === "string" ? p.createdAt : "";
  for (const it of p.items ?? []) {
    for (const f of [it.actualizadoEn, it.createdAt]) if (typeof f === "string" && f > max) max = f;
  }
  return max || null;
}

const hoyLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
const estadosDe = (p: ProyectoIW) => new Map((p.items ?? []).map((i) => [i.id, i.status]));

// ───────────────────────────── etiquetas libres de los tableros (16 nov, tanda 4)
const MAX_ETIQUETAS = 10;
const etiquetasDe = (p: ProyectoIW): string[] => (Array.isArray(p.portalEtiquetas) ? (p.portalEtiquetas as unknown[]).filter((x): x is string => typeof x === "string") : []);
/** Recortadas y sin repetir (sin importar mayúsculas). null si no es una lista válida. */
export function limpiarEtiquetas(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const xs: string[] = [];
  for (const e of x) {
    if (typeof e !== "string") return null;
    const t = e.trim().replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > 30) return null;
    if (!xs.some((y) => y.toLowerCase() === t.toLowerCase())) xs.push(t);
  }
  return xs.length > MAX_ETIQUETAS ? null : xs;
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
      if (!yo.empleadoId) return { datos: [] as PendienteTablero[], vinculado: false };
      const ps = (await listarIW(yo.prueba)).filter((p) => veProyecto(p, yo.empleadoId, yo.esAdmin));
      return { datos: pendientesDe(ps, yo.empleadoId), vinculado: true };
    }),
    /**
     * 13 nov (auditoría): lo pendiente en tableros de varias personas de una sola lectura (Mi panel, «Mi área» y el
     * calendario). Son sus ítems: no depende de quién pregunta (eso ya lo revisa la ruta).
     */
    /** `vistoPor`: quien mira (16 nov): los tableros privados donde no está no aparecen. */
    pendientesDeVarios: (empleados: string[], prueba?: boolean, vistoPor?: string | null) => protegido(async () => {
      if (!empleados.length) return new Map<string, PendienteTablero[]>();
      const ps = (await listarIW(prueba)).filter((p) => vistoPor === undefined || !ocultoPara(p, vistoPor));
      return new Map(empleados.map((e) => [e, pendientesDe(ps, e)]));
    }),
    /** Con `archivados`, solo los archivados (13 nov): guardados, fuera de las listas del día a día. */
    listar: (yo: Yo, o: { archivados?: boolean; vistoPor?: string | null } = {}) => protegido(async () => ({
      conectado: tablerosConectados() && !yo.prueba,
      datos: (await listarIW(yo.prueba))
        .filter((p) => (o.archivados ? !!p.archived || p.status === "Cancelado" : !p.archived) && !p.deleted && veProyecto(p, yo.empleadoId, yo.esAdmin) && (o.vistoPor === undefined || !ocultoPara(p, o.vistoPor)))
        .map((p) => ({
          id: p.id, nombre: p.name, cliente: p.clientName?.trim() || null, descripcion: p.description || null, color: p.color || "#6366f1", estado: p.status || null, area: p.department || null,
          lider: persona(p.leaderId, p.leaderName), miembros: personasDelProyecto(p).length, items: resumenProyecto(p), puedeEditar: editaProyecto(p, yo.empleadoId, yo.esAdmin),
          esMio: !!yo.empleadoId && personasDelProyecto(p).some((x) => x.id === yo.empleadoId),
          archivadoEn: p.archivedAt ?? null,
          privado: esPrivado(p),
          marcaId: typeof p.portalMarcaId === "string" ? p.portalMarcaId : null,
          servicioId: typeof p.portalServicioId === "string" ? p.portalServicioId : null,
          etiquetas: etiquetasDe(p),
          // 17 nov (carpetas y filtros de Proyectos): su carpeta, quiénes están y cuándo se movió por última vez.
          carpetaId: esIdInvitado(yo.empleadoId) ? null : carpetaDe(p),
          personaIds: personasDelProyecto(p).map((x) => x.id),
          actualizadoEn: ultimaActividad(p),
        })),
    })),
    /**
     * 16 nov (Ernesto): los tableros sin archivar que ve quien pregunta, con su cliente, para la ficha de Empresas.
     * En InooWork el cliente es solo un nombre: quien llama lo compara con `claveCliente`.
     */
    conCliente: (yo: Yo) => protegido(async () =>
      (await listarIW(yo.prueba))
        .filter((p) => !p.archived && !p.deleted && !!p.clientName?.trim() && veProyecto(p, yo.empleadoId, yo.esAdmin))
        .map((p) => {
          const r = resumenProyecto(p);
          return { cliente: p.clientName!.trim(), id: p.id, nombre: p.name, estado: p.status || null, lider: p.leaderName || null, items: r.total, completados: r.completados };
        })),
    /**
     * Borrar un proyecto (13 nov): solo el líder o un admin, como en InooWork. Es un borrado suave (deleted), así que
     * se puede recuperar desde InooWork; desaparece del portal.
     */
    borrar: (id: string, yo: Yo) => protegido(async () => {
      const p = await visible(id, yo);
      if (!(yo.esAdmin || (!!yo.empleadoId && p.leaderId === yo.empleadoId))) throw fallar(403, "SIN_PERMISO", "Solo el líder del proyecto o un admin lo puede borrar");
      p.deleted = true;
      p.deletedAt = new Date().toISOString();
      await guardarIW(p, yo.prueba);
      return null;
    }),
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
    /**
     * 13 nov: el cliente de los tableros que vinieron de Monday sin cliente, sacado de su nombre (dominio/cliente-de-tablero).
     * `asegurar` da el nombre del cliente en el portal (y crea la ficha si hace falta). Sin `aplicar`, solo la vista previa.
     */
    clientesDeMonday: (o: { aplicar: boolean; prueba?: boolean; asegurar: (nombre: string, conFicha: boolean) => Promise<string> }) => protegido(async () => {
      const todos = (await listarIW(o.prueba)).filter((p) => p.mondayId && !p.deleted && !p.clientName?.trim());
      const mapa = clientesDeTableros(todos.map((p) => p.name));
      const activos = new Set(todos.filter((p) => !p.archived).map((p) => mapa.get(p.name)).filter((c): c is { tipo: "CLIENTE"; nombre: string } => c?.tipo === "CLIENTE").map((c) => c.nombre));
      const lista: { tableroId: string; tablero: string; archivado: boolean; cliente: string | null; conFicha: boolean }[] = [];
      const nombres = new Map<string, string>();
      for (const p of todos) {
        const c = mapa.get(p.name);
        const cliente = c?.tipo === "INTERNO" ? "Inoo" : c?.tipo === "CLIENTE" ? c.nombre : null;
        const conFicha = c?.tipo === "CLIENTE" && activos.has(c.nombre);
        let final = cliente;
        if (o.aplicar && cliente) {
          if (!nombres.has(cliente)) nombres.set(cliente, cliente === "Inoo" ? "Inoo" : await o.asegurar(cliente, conFicha));
          final = nombres.get(cliente)!;
          p.clientName = final;
          await guardarIW(p, o.prueba);
        }
        lista.push({ tableroId: p.id, tablero: p.name, archivado: !!p.archived, cliente: final, conFicha });
      }
      return {
        aplicado: o.aplicar, tableros: lista.length, internos: lista.filter((x) => x.cliente === "Inoo").length, sinCliente: lista.filter((x) => !x.cliente).length,
        clientesConFicha: [...new Set(lista.filter((x) => x.conFicha).map((x) => x.cliente!))].sort(),
        clientesSinFicha: [...new Set(lista.filter((x) => x.cliente && !x.conFicha && x.cliente !== "Inoo").map((x) => x.cliente!))].sort(),
        lista,
      };
    }),
    existentes: (yo: Yo) => protegido(async () => new Set((await listarIW(yo.prueba)).filter((p) => !p.deleted).map((p) => p.id))),
    /** ¿Sigue existiendo (y sin borrar) ese proyecto? Para no importar dos veces el mismo tablero. */
    existe: (id: string, yo: Yo) => protegido(async () => {
      const p = await obtenerIW(id, yo.prueba);
      return !!p && !p.deleted;
    }),
    /** Cliente y estado del proyecto (6 nov: «Completado» lo culmina y a los 14 días se archiva). */
    /**
     * `marcaId` y `servicioId` llegan ya revisados por la ruta (que son del mismo cliente); aquí solo se guardan.
     * Cambiar el cliente suelta la marca y el servicio, que eran del anterior.
     */
    cambiarProyecto: (id: string, yo: Yo, b: { cliente?: unknown; estado?: unknown; privado?: unknown; marcaId?: string | null; servicioId?: string | null; etiquetas?: unknown; carpetaId?: string | null; nombre?: unknown; descripcion?: unknown }) => cambiar(id, yo, (p) => {
      const errores: { campo: string; mensaje: string }[] = [];
      if ([b.cliente, b.estado, b.privado, b.marcaId, b.servicioId, b.etiquetas, b.carpetaId, b.nombre, b.descripcion].every((x) => x === undefined)) errores.push({ campo: "cliente", mensaje: "Di qué cambiar: nombre, descripción, cliente, estado, privado, marca, carpeta, servicio o etiquetas" });
      // 17 nov: el nombre y la descripción se editan desde el portal (la descripción con sus enlaces).
      if (b.nombre !== undefined && !(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 120)) errores.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 120 caracteres)" });
      if (b.descripcion !== undefined && !(typeof b.descripcion === "string" && b.descripcion.length <= 2000)) errores.push({ campo: "descripcion", mensaje: "La descripción es muy larga (hasta 2000 caracteres)" });
      const etiquetas = b.etiquetas === undefined ? undefined : limpiarEtiquetas(b.etiquetas);
      if (etiquetas === null) errores.push({ campo: "etiquetas", mensaje: `Hasta ${MAX_ETIQUETAS} etiquetas de hasta 30 caracteres` });
      if (b.privado !== undefined) {
        if (typeof b.privado !== "boolean") errores.push({ campo: "privado", mensaje: "Debe ser true o false" });
        else if (!(yo.empleadoId && p.leaderId === yo.empleadoId)) throw fallar(403, "SIN_PERMISO", "Solo el líder del proyecto lo hace privado o lo vuelve a abrir");
      }
      const cliente = typeof b.cliente === "string" ? b.cliente.trim() : "";
      if (b.cliente !== undefined && !(cliente && cliente.length <= 120)) errores.push({ campo: "cliente", mensaje: "Escribe el nombre del cliente" });
      if (b.estado !== undefined && !ESTADOS_PROYECTO_IW.includes(b.estado as (typeof ESTADOS_PROYECTO_IW)[number])) errores.push({ campo: "estado", mensaje: `Usa uno de: ${ESTADOS_PROYECTO_IW.join(", ")}` });
      validar(errores);
      if (b.cliente !== undefined) p.clientName = cliente;
      if (b.estado !== undefined) aplicarEstadoProyecto(p, b.estado as string);
      if (b.privado === true) p.portalPrivado = true;
      else if (b.privado === false) delete p.portalPrivado;
      if (typeof b.nombre === "string") p.name = b.nombre.trim();
      if (typeof b.descripcion === "string") p.description = b.descripcion.trim();
      // Cambiar de cliente o de marca saca al proyecto de su carpeta (salvo que venga la nueva).
      if ((b.cliente !== undefined || b.marcaId !== undefined) && b.carpetaId === undefined) delete p.portalCarpetaId;
      if (b.carpetaId !== undefined) { if (b.carpetaId) p.portalCarpetaId = b.carpetaId; else delete p.portalCarpetaId; }
      if (b.cliente !== undefined && b.marcaId === undefined) { delete p.portalMarcaId; }
      if (b.cliente !== undefined && b.servicioId === undefined) { delete p.portalServicioId; }
      if (b.marcaId !== undefined) { if (b.marcaId) p.portalMarcaId = b.marcaId; else delete p.portalMarcaId; }
      if (b.servicioId !== undefined) { if (b.servicioId) p.portalServicioId = b.servicioId; else delete p.portalServicioId; }
      if (etiquetas) { if (etiquetas.length) p.portalEtiquetas = etiquetas; else delete p.portalEtiquetas; }
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
    // 13 nov: después de cada cambio corren las automatizaciones del tablero; los avisos los manda la API.
    crearItem: async (id: string, yo: Yo, b: CambioItem) => {
      let avisos: AvisoAutomatizacion[] = [];
      const t = await cambiar(id, yo, (p, con) => {
        validar(validarItem(b, p, true, con));
        const antes = estadosDe(p);
        aplicarItem(p, b, null, quienDe(yo), con);
        avisos = correrAutomatizaciones(p, antes, hoyLima(), quienDe(yo), con);
      });
      return t && { ...t, avisosAutomatizacion: avisos };
    },
    cambiarItem: async (id: string, itemId: string, yo: Yo, b: CambioItem) => {
      let avisos: AvisoAutomatizacion[] = [];
      const t = await cambiar(id, yo, (p, con) => {
        item(p, itemId);
        validar(validarItem(b, p, false, con, itemId));
        const antes = estadosDe(p);
        aplicarItem(p, b, itemId, quienDe(yo), con);
        avisos = correrAutomatizaciones(p, antes, hoyLima(), quienDe(yo), con);
      });
      return t && { ...t, avisosAutomatizacion: avisos };
    },
    /**
     * 16 nov (Ernesto: arrastrar y soltar): mueve un ítem antes de otro (o al final de un grupo). El orden es el del
     * arreglo de ítems de InooWork, así que InooWork lo ve igual.
     */
    moverItem: (id: string, itemId: string, yo: Yo, b: { grupoId?: unknown; antesDe?: unknown }) => cambiar(id, yo, (p) => {
      const it = item(p, itemId);
      const grupoId = typeof b.grupoId === "string" ? b.grupoId : it.groupId;
      if (!(p.groups ?? []).some((g) => g.id === grupoId)) validar([{ campo: "grupoId", mensaje: "Ese grupo no es de este proyecto" }]);
      const antes = b.antesDe === undefined || b.antesDe === null ? null : (p.items ?? []).find((x) => x.id === b.antesDe);
      if (b.antesDe !== undefined && b.antesDe !== null && (!antes || antes.id === itemId || antes.groupId !== grupoId)) validar([{ campo: "antesDe", mensaje: "Ese ítem no está en el grupo de destino" }]);
      const resto = (p.items ?? []).filter((x) => x.id !== itemId);
      it.groupId = grupoId;
      let i = antes ? resto.indexOf(antes) : -1;
      if (i < 0) {
        // Al final del grupo: después de su último ítem (o al final de todo si el grupo está vacío).
        const ultimo = resto.map((x) => x.groupId).lastIndexOf(grupoId);
        i = ultimo < 0 ? resto.length : ultimo + 1;
      }
      resto.splice(i, 0, it);
      p.items = resto;
      marcarCambio(it, quienDe(yo));
    }),
    crearAutomatizacion: (id: string, yo: Yo, b: { cuando?: unknown; hacer?: unknown; activa?: unknown }) => cambiar(id, yo, (p) => {
      validar(validarAutomatizacionTablero(b, p));
      const xs = automatizacionesDe(p);
      if (xs.length >= MAX_AUTOMATIZACIONES_TABLERO) validar([{ campo: "cuando", mensaje: `Hasta ${MAX_AUTOMATIZACIONES_TABLERO} automatizaciones por tablero` }]);
      const a: AutomatizacionTablero = {
        id: `auto-${crypto.randomUUID()}`, activa: b.activa !== false, cuando: b.cuando as AutomatizacionTablero["cuando"], hacer: b.hacer as AutomatizacionTablero["hacer"],
        creadaPor: yo.nombre ?? null, creadaEn: new Date().toISOString(),
      };
      p.portalAutomatizaciones = [...xs, a];
    }),
    cambiarAutomatizacion: (id: string, autoId: string, yo: Yo, b: { cuando?: unknown; hacer?: unknown; activa?: unknown }) => cambiar(id, yo, (p) => {
      const xs = automatizacionesDe(p);
      const a = xs.find((x) => x.id === autoId);
      if (!a) throw fallar(404, "NO_ENCONTRADO", "No encontramos esa automatización");
      validar(validarAutomatizacionTablero(b, p, true));
      p.portalAutomatizaciones = xs.map((x) => (x.id === autoId ? {
        ...x, ...(b.cuando !== undefined ? { cuando: b.cuando as AutomatizacionTablero["cuando"] } : {}), ...(b.hacer !== undefined ? { hacer: b.hacer as AutomatizacionTablero["hacer"] } : {}),
        ...(typeof b.activa === "boolean" ? { activa: b.activa } : {}),
      } : x));
    }),
    borrarAutomatizacion: (id: string, autoId: string, yo: Yo) => cambiar(id, yo, (p) => {
      const xs = automatizacionesDe(p);
      if (!xs.some((x) => x.id === autoId)) throw fallar(404, "NO_ENCONTRADO", "No encontramos esa automatización");
      p.portalAutomatizaciones = xs.filter((x) => x.id !== autoId);
    }),
    /**
     * Acciones en lote (12 nov), como en Monday: el mismo cambio a varios ítems (estado, responsable, prioridad, fecha,
     * grupo) o borrarlos, en un solo guardado en InooWork.
     */
    lote: async (id: string, yo: Yo, b: { ids?: unknown; cambio?: unknown; borrar?: unknown }) => {
      let avisos: AvisoAutomatizacion[] = [];
      const t = await cambiar(id, yo, (p, con) => {
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
      const antes = estadosDe(p);
      for (const x of ids as string[]) aplicarItem(p, c, x, quienDe(yo), con);
      avisos = correrAutomatizaciones(p, antes, hoyLima(), quienDe(yo), con);
      });
      return t && { ...t, avisosAutomatizacion: avisos };
    },
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
    /**
     * 16 nov (Ernesto: «problemas al agregar personas»): antes solo se elegían al crear el tablero. Agrega a quien edita
     * (líder, miembro o admin); una persona quitada antes vuelve a quedar activa.
     */
    agregarMiembros: (id: string, yo: Yo, personas: PersonaIW[], permiso: unknown = "EDITOR") => cambiar(id, yo, (p) => {
      if (!personas.length) validar([{ campo: "usuarioIds", mensaje: "Elige al menos a una persona del equipo con ficha en InooWork" }]);
      if (!esPermiso(permiso)) validar([{ campo: "permiso", mensaje: "Usa LECTOR, COMENTADOR o EDITOR" }]);
      const hoy = new Date().toISOString().slice(0, 10);
      p.members ??= [];
      for (const x of personas) {
        if (x.id === p.leaderId) continue;
        const ya = p.members.find((m) => m.employeeId === x.id);
        if (ya) { ya.status = "active"; ya.name ||= x.nombre; } else p.members.push({ employeeId: x.id, name: x.nombre, avatar: "", addedAt: hoy, status: "active" });
        fijarPermiso(p, x.id, permiso as PermisoTablero);
      }
    }),
    /** 16 nov: cambiar el permiso de alguien (lector, comentador, editor). El líder o un admin; el líder siempre edita. */
    cambiarPermiso: (id: string, empleadoId: string, yo: Yo, permiso: unknown) => cambiar(id, yo, (p) => {
      if (!(yo.esAdmin || (!!yo.empleadoId && p.leaderId === yo.empleadoId))) throw fallar(403, "SIN_PERMISO", "Solo el líder del proyecto o un admin cambia los permisos");
      if (!esPermiso(permiso)) validar([{ campo: "permiso", mensaje: "Usa LECTOR, COMENTADOR o EDITOR" }]);
      if (empleadoId === p.leaderId) throw fallar(409, "ES_LIDER", "El líder siempre puede editar");
      if (!(p.members ?? []).some((m) => m.employeeId === empleadoId && (m.status ?? "active") === "active")) throw fallar(404, "NO_ENCONTRADO", "Esa persona no está en el proyecto");
      fijarPermiso(p, empleadoId, permiso as PermisoTablero);
    }),
    /** 16 nov: el enlace para compartir de una audiencia; crearlo de nuevo reemplaza al anterior (deja de funcionar). */
    crearEnlace: (id: string, yo: Yo, b: { audiencia?: unknown; permiso?: unknown }) => cambiar(id, yo, (p) => {
      const errores: { campo: string; mensaje: string }[] = [];
      if (b.audiencia !== "EQUIPO" && b.audiencia !== "INVITADO") errores.push({ campo: "audiencia", mensaje: "Usa EQUIPO o INVITADO" });
      if (!esPermiso(b.permiso)) errores.push({ campo: "permiso", mensaje: "Usa LECTOR, COMENTADOR o EDITOR" });
      validar(errores);
      if (esIdInvitado(yo.empleadoId)) throw fallar(403, "SIN_PERMISO", "Solo el equipo de Inoo comparte los tableros");
      const e = nuevoEnlace(p, b.audiencia as "EQUIPO" | "INVITADO", b.permiso as PermisoTablero, yo.usuarioId ?? null);
      if (!tokenDe(p.id, e)) throw fallar(503, "SIN_SECRETO", "El portal no tiene configurada la firma de enlaces (SESION_SECRETO)");
    }),
    cambiarEnlace: (id: string, audiencia: string, yo: Yo, b: { permiso?: unknown; activo?: unknown }) => cambiar(id, yo, (p) => {
      if (esIdInvitado(yo.empleadoId)) throw fallar(403, "SIN_PERMISO", "Solo el equipo de Inoo comparte los tableros");
      const e = enlacesDe(p).find((x) => x.audiencia === audiencia);
      if (!e) throw fallar(404, "NO_ENCONTRADO", "Este tablero no tiene ese enlace");
      const errores: { campo: string; mensaje: string }[] = [];
      if (b.permiso !== undefined && !esPermiso(b.permiso)) errores.push({ campo: "permiso", mensaje: "Usa LECTOR, COMENTADOR o EDITOR" });
      if (b.activo !== undefined && typeof b.activo !== "boolean") errores.push({ campo: "activo", mensaje: "Debe ser true o false" });
      validar(errores);
      if (b.permiso !== undefined) e.permiso = b.permiso as PermisoTablero;
      if (b.activo !== undefined) e.activo = b.activo as boolean;
    }),
    /**
     * 16 nov: entrar con un enlace del equipo. Suma a quien lo abre con el permiso del enlace (si ya estaba, se queda con
     * el mayor de los dos). Un enlace apagado, reemplazado o con la firma mal no sirve.
     */
    unirse: (token: unknown, yo: Yo) => protegido(async () => {
      const t = leerToken(token);
      const p = t ? await obtenerIW(t.proyectoId, yo.prueba) : null;
      const e = p && !p.deleted ? enlacesDe(p).find((x) => x.id === t!.enlaceId) : undefined;
      if (!p || !e || !e.activo) throw fallar(404, "ENLACE_NO_VALIDO", "Este enlace ya no funciona: pídele uno nuevo a quien te lo mandó");
      // 17 nov: un invitado de afuera solo entra con el enlace de invitados; queda con el mayor de sus permisos.
      if (esIdInvitado(yo.empleadoId)) {
        if (e.audiencia !== "INVITADO") throw fallar(403, "SOLO_EQUIPO", "Este enlace es solo para el equipo de Inoo");
        const actual = permisoEn(p, yo.empleadoId, false);
        if (actual && mayorPermiso(actual, e.permiso) === actual) return { tableroId: p.id, permiso: actual };
        fijarInvitado(p, yo.usuarioId!, { nombre: yo.nombre ?? "Invitado", email: yo.email ?? "", permiso: e.permiso, desde: invitadosDe(p)[yo.usuarioId!]?.desde ?? new Date().toISOString() });
        await guardarIW(p, yo.prueba);
        return { tableroId: p.id, permiso: e.permiso };
      }
      // Alguien del equipo que abre el enlace de invitados entra igual, como con el del equipo.
      if (!yo.empleadoId) {
        if (yo.esAdmin) return { tableroId: p.id, permiso: "EDITOR" as PermisoTablero };
        throw fallar(409, "SIN_FICHA_INOOWORK", "Necesitas tu ficha de InooWork para entrar a los proyectos");
      }
      const actual = permisoEn(p, yo.empleadoId, false);
      if (actual && (p.leaderId === yo.empleadoId || mayorPermiso(actual, e.permiso) === actual)) return { tableroId: p.id, permiso: actual };
      p.members ??= [];
      const ya = p.members.find((m) => m.employeeId === yo.empleadoId);
      if (ya) ya.status = "active";
      else p.members.push({ employeeId: yo.empleadoId, name: yo.nombre ?? yo.empleadoId, avatar: "", addedAt: new Date().toISOString().slice(0, 10), status: "active" });
      fijarPermiso(p, yo.empleadoId, e.permiso);
      await guardarIW(p, yo.prueba);
      return { tableroId: p.id, permiso: e.permiso };
    }),
    /** Quitar a alguien (16 nov): solo el líder o un admin, y nunca al líder. Sale de la lista y deja de ver el proyecto. */
    quitarMiembro: (id: string, empleadoId: string, yo: Yo) => cambiar(id, yo, (p) => {
      if (!(yo.esAdmin || (!!yo.empleadoId && p.leaderId === yo.empleadoId))) throw fallar(403, "SIN_PERMISO", "Solo el líder del proyecto o un admin puede quitar personas");
      if (empleadoId === p.leaderId) throw fallar(409, "ES_LIDER", "El líder no se puede quitar del proyecto");
      const m = (p.members ?? []).find((x) => x.employeeId === empleadoId && (x.status ?? "active") === "active");
      if (!m) throw fallar(404, "NO_ENCONTRADO", "Esa persona no está en el proyecto");
      p.members = (p.members ?? []).filter((x) => x.employeeId !== empleadoId);
    }),
    /**
     * 17 nov: lo que dice un enlace de invitados antes de entrar (el nombre del tablero y el permiso), para la pantalla
     * de registro. Solo con un enlace de invitados válido y prendido.
     */
    enlaceInvitado: (token: unknown, prueba?: boolean) => protegido(async () => {
      const t = leerToken(token);
      const p = t ? await obtenerIW(t.proyectoId, prueba) : null;
      const e = p && !p.deleted ? enlacesDe(p).find((x) => x.id === t!.enlaceId) : undefined;
      if (!p || !e || !e.activo || e.audiencia !== "INVITADO") throw fallar(404, "ENLACE_NO_VALIDO", "Este enlace ya no funciona: pídele uno nuevo a quien te lo mandó");
      return { tablero: p.name, permiso: e.permiso };
    }),
    /** 17 nov: el permiso de un invitado de afuera. El líder o un admin, como con las personas del equipo. */
    cambiarInvitado: (id: string, usuarioId: string, yo: Yo, permiso: unknown) => cambiar(id, yo, (p) => {
      if (!(yo.esAdmin || (!!yo.empleadoId && p.leaderId === yo.empleadoId))) throw fallar(403, "SIN_PERMISO", "Solo el líder del proyecto o un admin cambia los permisos");
      if (!esPermiso(permiso)) validar([{ campo: "permiso", mensaje: "Usa LECTOR, COMENTADOR o EDITOR" }]);
      const x = invitadosDe(p)[usuarioId];
      if (!x) throw fallar(404, "NO_ENCONTRADO", "Esa persona no está invitada a este proyecto");
      fijarInvitado(p, usuarioId, { ...x, permiso: permiso as PermisoTablero });
    }),
    /** 17 nov: sacar a un invitado de afuera. Deja de ver el tablero al instante (su cuenta sigue, sin tableros). */
    quitarInvitado: (id: string, usuarioId: string, yo: Yo) => cambiar(id, yo, (p) => {
      if (!(yo.esAdmin || (!!yo.empleadoId && p.leaderId === yo.empleadoId))) throw fallar(403, "SIN_PERMISO", "Solo el líder del proyecto o un admin puede quitar personas");
      if (!invitadosDe(p)[usuarioId]) throw fallar(404, "NO_ENCONTRADO", "Esa persona no está invitada a este proyecto");
      quitarInvitado(p, usuarioId);
    }),
    /** Quiénes faltan (16 nov): de una lista de candidatos, los que no están ya en el proyecto. */
    sinEstar: <C extends { empleado: string }>(id: string, yo: Yo, candidatos: C[]) => protegido(async () => {
      const p = await visible(id, yo);
      const ya = new Set(personasDelProyecto(p).map((x) => x.id));
      return candidatos.filter((c) => !ya.has(c.empleado));
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
