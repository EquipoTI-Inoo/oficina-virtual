/**
 * Tableros de InooWork en el portal (2 nov 2026). InooWork es la fuente: sus proyectos (grupos, ítems,
 * subítems, columnas y vistas, como Monday) se leen y se guardan por la API que InooWork ya tiene, sin tocar
 * su código. El portal los muestra con su estilo y cada cambio se aplica sobre el proyecto recién leído
 * (InooWork guarda el proyecto completo), para no pisar lo que otra persona cambió.
 * Cómo se juntan con los proyectos de clientes del portal se decide después de la demo con Ernesto.
 *
 * Aquí: el formato de InooWork, quién ve y edita, y los cambios sobre el JSON del proyecto.
 */
import { permisoEn } from "./compartir-tablero";

import { alternarCronometro, alternarVoto, info, validarConfig, valorDeColumna, type ConfigColumna, type ContextoValor, type Cronometro, type TipoColumna } from "./columnas";

// ───────────────────────────── formato de InooWork (tabla projects, JSON)

export interface PersonaIW { id: string; nombre: string }
export interface SubitemIW {
  id: string; name: string; status: string; assignee?: string; assigneeName?: string; assigneeAvatar?: string; dueDate?: string; createdAt?: string;
  /** 20 nov: descripción y valores de columnas propios del subítem (mismo formato que los ítems). */
  notes?: string;
  [columna: string]: unknown;
}
export interface ItemIW {
  id: string; name: string; status: string; assignee?: string; assigneeName?: string; assigneeAvatar?: string;
  dueDate?: string; priority?: string; notes?: string; createdAt?: string; groupId: string; subitems?: SubitemIW[];
  [columna: string]: unknown;
}
export interface GrupoIW { id: string; name: string; color: string; collapsed?: boolean }
export interface ColumnaIW { id: string; label: string; type: string; width?: number; fixed?: boolean; config?: ConfigColumna }
export interface VistaIW { id: string; name: string; type: string; isDefault?: boolean; columns?: ColumnaIW[]; filters?: unknown[] }
export interface ProyectoIW {
  id: string; name: string; clientName?: string; description?: string; status?: string; department?: string;
  leaderId?: string; leaderName?: string; leaderAvatar?: string; color?: string; createdAt?: string; archived?: boolean; archivedAt?: string; deleted?: boolean;
  /** Puesto por el portal al culminarlo (6 nov): a los 14 días se archiva solo. */
  completadoEn?: string;
  members?: { employeeId: string; name?: string; avatar?: string; addedAt?: string; status?: string }[];
  groups?: GrupoIW[]; items?: ItemIW[]; views?: VistaIW[];
  [otro: string]: unknown;
}

export const ESTADOS_ITEM = ["Sin Iniciar", "En Progreso", "En Revisión", "Completado", "Soporte Continuo", "Bloqueado"] as const;
export type EstadoItem = (typeof ESTADOS_ITEM)[number];
/** Los colores de InooWork, para que el equipo reconozca su tablero. */
export const COLOR_ESTADO: Record<EstadoItem, string> = {
  "Sin Iniciar": "#c4c4c4", "En Progreso": "#fdab3d", "En Revisión": "#0086c0", Completado: "#00c875", "Soporte Continuo": "#a25ddc", Bloqueado: "#e2445c",
};
export const PRIORIDADES_ITEM = ["Baja", "Media", "Alta", "Urgente"] as const;
export type PrioridadItem = (typeof PRIORIDADES_ITEM)[number];
export const COLOR_PRIORIDAD: Record<PrioridadItem, string> = { Baja: "#00c875", Media: "#fdab3d", Alta: "#e07b39", Urgente: "#e2445c" };
export const COLORES_GRUPO = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"] as const;
export const TIPOS_VISTA = ["table", "kanban", "calendar", "timeline", "chart"] as const;

/** Columnas fijas de InooWork; las demás de las vistas son personalizadas (su valor va en item[col.id]). */
const COLUMNAS_FIJAS = new Set(["name", "assignee", "priority", "status", "dueDate", "notes"]);

// ───────────────────────────── permisos (los mismos de InooWork, pages/Projects.tsx, más los del portal: compartir-tablero.ts)

export const veProyecto = (p: ProyectoIW, empleadoId: string | null, esAdmin: boolean) => permisoEn(p, empleadoId, esAdmin) !== null;
/** 16 nov: edita quien tiene permiso de editor en el portal (los miembros sin permiso guardado lo son, como antes). */
export const editaProyecto = (p: ProyectoIW, empleadoId: string | null, esAdmin: boolean) => permisoEn(p, empleadoId, esAdmin) === "EDITOR";
/** 16 nov: comenta el comentador o el editor; el lector solo mira. */
export const comentaProyecto = (p: ProyectoIW, empleadoId: string | null, esAdmin: boolean) => {
  const x = permisoEn(p, empleadoId, esAdmin);
  return x === "EDITOR" || x === "COMENTADOR";
};

// ───────────────────────────── vista para el portal

export const columnasPersonalizadas = (p: ProyectoIW): ColumnaIW[] => {
  const vistas = p.views ?? [];
  const todas = vistas.flatMap((v) => v.columns ?? []).filter((c) => !COLUMNAS_FIJAS.has(c.id));
  return todas.filter((c, i) => todas.findIndex((x) => x.id === c.id) === i);
};

/** Personas que se pueden asignar: el líder y los miembros activos. */
export function personasDelProyecto(p: ProyectoIW): PersonaIW[] {
  const xs: PersonaIW[] = [];
  if (p.leaderId) xs.push({ id: p.leaderId, nombre: p.leaderName || p.leaderId });
  for (const m of p.members ?? []) if ((m.status ?? "active") === "active" && !xs.some((x) => x.id === m.employeeId)) xs.push({ id: m.employeeId, nombre: m.name || m.employeeId });
  return xs;
}

const hoy = () => new Date().toISOString().slice(0, 10);
export const itemVencido = (i: { status: string; dueDate?: string }, dia = hoy()) => i.status !== "Completado" && !!i.dueDate && i.dueDate < dia;

const normalizarCliente = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^prueba\s*·\s*/, "").replace(/\s+/g, " ").trim();
/** En InooWork el cliente es texto: «Casa Oliva» y «casa  oliva» son el mismo. */
export const mismoCliente = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && normalizarCliente(a) === normalizarCliente(b);

/** Estados de un proyecto en InooWork (pages/Projects.tsx, PROJECT_STATUS_COLORS). */
export const ESTADOS_PROYECTO_IW = ["Sin Iniciar", "En Progreso", "En Revisión", "Completado", "Soporte Continuo", "En Pausa", "Cancelado"] as const;

/**
 * En qué columna de «Proyectos» va un tablero. Los cancelados no se muestran (null). Con todos sus ítems
 * completados pero el estado todavía abierto, va a «Por cerrar» (6 nov): falta que alguien lo marque culminado.
 */
export function columnaDeTablero(estado: string | null | undefined, items: { total: number; completados: number; vencidos: number }) {
  switch (estado) {
    case "Cancelado": return null;
    case "Completado": return "CULMINADO" as const;
    case "Soporte Continuo": return "SOPORTE_CONTINUO" as const;
    case "En Pausa": return "EN_PAUSA" as const;
    case "En Revisión": return "POR_CERRAR" as const;
  }
  if (items.total > 0 && items.completados === items.total) return "POR_CERRAR" as const;
  if (estado === "Sin Iniciar") return "POR_INICIAR" as const;
  return items.vencidos > 0 ? ("CON_RETRASO" as const) : ("EN_CURSO" as const);
}

/** Los tableros donde la persona es líder o miembro, para su panel (6 nov). Los culminados y cancelados no cuentan como activos. */
export function tablerosDelPanel(lista: { id: string; nombre: string; cliente: string | null; estado: string | null; items: { total: number; completados: number; vencidos: number }; esMio: boolean }[]) {
  const tableros = lista.filter((t) => t.esMio).flatMap((t) => {
    const columna = columnaDeTablero(t.estado, t.items);
    return columna ? [{ id: t.id, nombre: t.nombre, cliente: t.cliente, columna, items: t.items }] : [];
  });
  return { tableros, activos: tableros.filter((t) => t.columna !== "CULMINADO").length };
}

/** Cambia el estado del proyecto. Al culminarlo guarda la fecha (completadoEn) para archivarlo a los 14 días. */
export function aplicarEstadoProyecto(p: ProyectoIW, estado: string, hoyIso = hoy()) {
  p.status = estado;
  if (estado === "Completado") p.completadoEn ??= hoyIso;
  else delete p.completadoEn;
}

export function resumenProyecto(p: ProyectoIW, dia = hoy()) {
  const items = p.items ?? [];
  return { total: items.length, completados: items.filter((i) => i.status === "Completado").length, vencidos: items.filter((i) => itemVencido(i, dia)).length };
}

// ───────────────────────────── validar y aplicar cambios

type Errores = { campo: string; mensaje: string }[];
const esFecha = (v: unknown) => v === "" || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v));
const nuevoId = (prefijo: string) => `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

export interface CambioItem { nombre?: unknown; estado?: unknown; responsableId?: unknown; fecha?: unknown; prioridad?: unknown; notas?: unknown; grupoId?: unknown; valores?: unknown }
/** Ítems de los tableros conectados (columna «Conectar tableros»), por id de tablero. */
export type Conectados = Record<string, { id: string; name: string }[]>;
/** Quién hace el cambio (para «Última actualización» y «Registro de creación»). */
export interface Quien { id: string | null; nombre: string | null }

const contextoValor = (p: ProyectoIW, itemId?: string): ContextoValor => ({
  personas: personasDelProyecto(p), items: (p.items ?? []).map((i) => ({ id: i.id, name: i.name })), itemId, conectados: undefined,
});
/** Convierte el valor de una columna según su tipo. */
export function valorParaItem(p: ProyectoIW, colId: string, v: unknown, conectados: Conectados = {}, itemId?: string) {
  const col = columnasPersonalizadas(p).find((c) => c.id === colId);
  if (!col) return { error: "Esa columna no es de este proyecto" } as const;
  const ctx = contextoValor(p, itemId);
  if (col.type === "board_relation") ctx.conectados = conectados[col.config?.tableroId ?? ""] ?? [];
  return valorDeColumna({ tipo: col.type, config: col.config }, v, ctx);
}

export function validarItem(b: CambioItem, p: ProyectoIW, nuevo: boolean, conectados: Conectados = {}, itemId?: string): Errores {
  const e: Errores = [];
  if ((nuevo || b.nombre !== undefined) && !(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 300)) e.push({ campo: "nombre", mensaje: "Escribe el ítem (hasta 300 caracteres)" });
  if (b.estado !== undefined && !(ESTADOS_ITEM as readonly unknown[]).includes(b.estado)) e.push({ campo: "estado", mensaje: "Estado no válido" });
  if (b.prioridad !== undefined && !(PRIORIDADES_ITEM as readonly unknown[]).includes(b.prioridad)) e.push({ campo: "prioridad", mensaje: "Prioridad no válida" });
  if (b.fecha !== undefined && b.fecha !== null && !esFecha(b.fecha)) e.push({ campo: "fecha", mensaje: "Usa el formato AAAA-MM-DD" });
  if (b.notas !== undefined && b.notas !== null && !(typeof b.notas === "string" && b.notas.length <= 5000)) e.push({ campo: "notas", mensaje: "Hasta 5000 caracteres" });
  if (b.responsableId !== undefined && b.responsableId !== null && !personasDelProyecto(p).some((x) => x.id === b.responsableId)) e.push({ campo: "responsableId", mensaje: "Elige a alguien del proyecto" });
  if ((nuevo || b.grupoId !== undefined) && !(p.groups ?? []).some((g) => g.id === b.grupoId)) e.push({ campo: "grupoId", mensaje: "Ese grupo no es de este proyecto" });
  if (b.valores !== undefined) {
    const cols = columnasPersonalizadas(p);
    const v = b.valores as Record<string, unknown>;
    if (!v || typeof v !== "object" || Array.isArray(v)) e.push({ campo: "valores", mensaje: "Valores no válidos" });
    else for (const [k, x] of Object.entries(v)) {
      if (!cols.some((c) => c.id === k)) e.push({ campo: `valores.${k}`, mensaje: "Esa columna no es de este proyecto" });
      else {
        const r = valorParaItem(p, k, x, conectados, itemId);
        if ("error" in r) e.push({ campo: `valores.${k}`, mensaje: r.error });
      }
    }
  }
  return e;
}

const asignar = (p: ProyectoIW, x: { assignee?: string; assigneeName?: string; assigneeAvatar?: string }, id: string | null) => {
  const persona = id ? personasDelProyecto(p).find((y) => y.id === id) : undefined;
  x.assignee = persona?.id ?? "";
  x.assigneeName = persona?.nombre ?? "";
  x.assigneeAvatar = (id && (p.members ?? []).find((m) => m.employeeId === id)?.avatar) || (id === p.leaderId ? p.leaderAvatar ?? "" : "");
};

/** Aplica un cambio a un ítem (o lo crea, como en InooWork: Sin Iniciar, prioridad Media). Devuelve el id. */
export function aplicarItem(p: ProyectoIW, b: CambioItem, itemId: string | null, quien?: Quien, conectados: Conectados = {}): string {
  p.items ??= [];
  let it = itemId ? p.items.find((x) => x.id === itemId) : undefined;
  if (!it) {
    it = { id: nuevoId("item"), name: "", status: "Sin Iniciar", assignee: "", assigneeName: "", assigneeAvatar: "", dueDate: "", priority: "Media", notes: "", createdAt: hoy(), groupId: b.grupoId as string, subitems: [] };
    if (quien?.nombre) it.creadoPorNombre = quien.nombre;
    p.items.push(it);
  }
  marcarCambio(it, quien);
  if (typeof b.nombre === "string") it.name = b.nombre.trim();
  if (typeof b.estado === "string") it.status = b.estado;
  if (typeof b.prioridad === "string") it.priority = b.prioridad;
  if (b.fecha !== undefined) it.dueDate = (b.fecha as string | null) ?? "";
  if (b.notas !== undefined) it.notes = ((b.notas as string | null) ?? "").trim();
  if (typeof b.grupoId === "string") it.groupId = b.grupoId;
  if (b.responsableId !== undefined) asignar(p, it, b.responsableId as string | null);
  if (b.valores) for (const [k, v] of Object.entries(b.valores as Record<string, unknown>)) {
    const r = valorParaItem(p, k, v, conectados, it.id);
    if ("error" in r) continue; // ya validado
    guardarValor(it, k, r.texto, r.dato);
  }
  return it.id;
}

/** El texto visible en la columna (lo que ve InooWork) y el dato del portal aparte. */
export function guardarValor(it: ItemIW, colId: string, texto: string, dato?: unknown) {
  it[colId] = texto;
  if (dato === undefined) delete it[`${colId}__d`];
  else it[`${colId}__d`] = dato;
}
export function marcarCambio(it: ItemIW, quien?: Quien) {
  it.actualizadoEn = new Date().toISOString();
  if (quien?.nombre) it.actualizadoPorNombre = quien.nombre;
}

// ───────────────────────────── columnas (11 nov): la biblioteca de Monday

export interface CambioColumna { nombre?: unknown; tipo?: unknown; config?: unknown; antesDe?: unknown }

/**
 * 25 nov (Ernesto: columnas con arrastrar y soltar; clic derecho → agregar a los lados): pone la columna antes de
 * `antesDe` (otra columna del tablero) o al final si es null, en todas las vistas.
 */
function colocarColumna(p: ProyectoIW, colId: string, antesDe: string | null) {
  for (const v of p.views ?? []) {
    const xs = v.columns ?? [];
    const col = xs.find((c) => c.id === colId);
    if (!col) continue;
    const resto = xs.filter((c) => c.id !== colId);
    const i = antesDe ? resto.findIndex((c) => c.id === antesDe) : -1;
    v.columns = i < 0 ? [...resto, col] : [...resto.slice(0, i), col, ...resto.slice(i)];
  }
}
/** `antesDe` válido: undefined (no se mueve), null (al final) o el id de otra columna personalizada. */
function antesDeValido(p: ProyectoIW, colId: string | null, antesDe: unknown): Errores {
  if (antesDe === undefined || antesDe === null) return [];
  return typeof antesDe === "string" && antesDe !== colId && columnasPersonalizadas(p).some((c) => c.id === antesDe) ? [] : [{ campo: "antesDe", mensaje: "Esa columna no está en el tablero" }];
}
const FIJAS_IW = new Set(["name", "assignee", "priority", "status", "dueDate", "notes"]);
const tiposDe = (p: ProyectoIW) => [{ id: "status", tipo: "status" }, ...columnasPersonalizadas(p).map((c) => ({ id: c.id, tipo: c.type }))];

export function agregarColumna(p: ProyectoIW, b: CambioColumna): { id?: string; errores: Errores } {
  const e: Errores = [];
  if (!(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  const i = typeof b.tipo === "string" ? info(b.tipo) : undefined;
  if (!i) e.push({ campo: "tipo", mensaje: "Elige un tipo de columna de la biblioteca" });
  if (columnasPersonalizadas(p).length >= 60) e.push({ campo: "tipo", mensaje: "Hasta 60 columnas por tablero" });
  const { config, errores } = i ? validarConfig(i.tipo, b.config, tiposDe(p)) : { config: {}, errores: [] };
  e.push(...errores, ...antesDeValido(p, null, b.antesDe));
  if (e.length) return { errores: e };
  const col: ColumnaIW = { id: nuevoId("col"), label: String(b.nombre).trim(), type: i!.tipo, width: 150, config };
  p.views ??= [];
  if (!p.views.length) p.views.push({ id: nuevoId("view"), name: "Tabla Principal", type: "table", isDefault: true, columns: [], filters: [] });
  for (const v of p.views) v.columns = [...(v.columns ?? []), { ...col, config: structuredClone(config) }];
  if (typeof b.antesDe === "string") colocarColumna(p, col.id, b.antesDe);
  return { id: col.id, errores: [] };
}

export function cambiarColumna(p: ProyectoIW, colId: string, b: CambioColumna): Errores {
  const col = columnasPersonalizadas(p).find((c) => c.id === colId);
  if (!col) return [{ campo: "columna", mensaje: "No encontramos esa columna" }];
  const e: Errores = [];
  if (b.nombre !== undefined && !(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  e.push(...antesDeValido(p, colId, b.antesDe));
  let config = col.config;
  if (b.config !== undefined) {
    if (!info(col.type)) e.push({ campo: "config", mensaje: "Esta columna de InooWork no tiene configuración" });
    else {
      const r = validarConfig(col.type as TipoColumna, { ...(col.config ?? {}), ...(b.config as object) }, tiposDe(p).filter((x) => x.id !== colId));
      e.push(...r.errores);
      config = r.config;
    }
  }
  if (e.length) return e;
  for (const v of p.views ?? []) for (const c of v.columns ?? []) if (c.id === colId) {
    if (typeof b.nombre === "string") c.label = b.nombre.trim();
    if (config) c.config = structuredClone(config);
  }
  if (b.antesDe !== undefined) colocarColumna(p, colId, b.antesDe as string | null);
  // Si cambian las etiquetas o las opciones, los valores que ya no existen se vacían.
  if (col.type === "etiqueta" && config?.etiquetas) for (const it of p.items ?? []) if (it[colId] && !config.etiquetas.some((l) => l.texto === it[colId])) it[colId] = "";
  return [];
}

export function borrarColumna(p: ProyectoIW, colId: string): string | null {
  if (FIJAS_IW.has(colId) || !columnasPersonalizadas(p).some((c) => c.id === colId)) return "No encontramos esa columna";
  for (const v of p.views ?? []) v.columns = (v.columns ?? []).filter((c) => c.id !== colId);
  for (const it of p.items ?? []) { delete it[colId]; delete it[`${colId}__d`]; }
  return null;
}

/** Votar, el cronómetro y el botón: columnas que se usan con un clic. */
export function accionColumna(p: ProyectoIW, itemId: string, colId: string, quien: Quien): string | null {
  const it = (p.items ?? []).find((x) => x.id === itemId);
  const col = columnasPersonalizadas(p).find((c) => c.id === colId);
  if (!it || !col) return "No encontramos ese ítem o esa columna";
  if (col.type === "vote") {
    if (!quien.id) return "Necesitas tu ficha para votar";
    const r = alternarVoto(it[`${colId}__d`] as string[] | undefined, quien.id);
    guardarValor(it, colId, r.texto, r.dato.length ? r.dato : undefined);
  } else if (col.type === "time_tracking") {
    const r = alternarCronometro(it[`${colId}__d`] as Cronometro | undefined);
    guardarValor(it, colId, r.texto, r.dato);
  } else if (col.type === "button") {
    const a = col.config?.accion;
    if (!a) return "Configura qué hace el botón";
    if (a.columnaId === "status") {
      if (!(ESTADOS_ITEM as readonly string[]).includes(a.valor)) return "El botón tiene un estado que ya no existe";
      it.status = a.valor;
    } else {
      const r = valorParaItem(p, a.columnaId, a.columnaId && columnasPersonalizadas(p).find((c) => c.id === a.columnaId)?.type === "checkbox" ? a.valor === "✓" || a.valor === "true" : a.valor);
      if ("error" in r) return `El botón no pudo cambiar la columna: ${r.error}`;
      guardarValor(it, a.columnaId, r.texto, r.dato);
    }
  } else return "Esa columna no tiene acción";
  marcarCambio(it, quien);
  return null;
}

/**
 * 20 nov (Alonso): columnas que pueden tener los subítems. Las calculadas y las que conectan tableros dependen del
 * ítem completo, así que quedan fuera.
 */
const FUERA_DE_SUBITEMS = new Set(["mirror", "formula", "board_relation", "dependency", "auto_number", "item_id", "creation_log", "last_updated", "progress", "button"]);
export const columnaParaSubitems = (tipo: string) => !FUERA_DE_SUBITEMS.has(tipo);
/** Las columnas que el tablero muestra en sus subítems (en el orden del tablero). */
export function columnasDeSubitems(p: ProyectoIW): string[] {
  const elegidas = Array.isArray(p.portalColumnasSubitems) ? (p.portalColumnasSubitems as unknown[]).filter((x): x is string => typeof x === "string") : [];
  return columnasPersonalizadas(p).filter((c) => elegidas.includes(c.id) && columnaParaSubitems(c.type)).map((c) => c.id);
}

export function validarSubitem(b: CambioItem, p: ProyectoIW, nuevo: boolean): Errores {
  const errores = validarItem({ ...b, grupoId: undefined, prioridad: undefined }, p, false).concat(
    nuevo && !(typeof b.nombre === "string" && b.nombre.trim()) ? [{ campo: "nombre", mensaje: "Escribe el subítem" }] : [],
  );
  // Solo las columnas habilitadas para los subítems.
  if (b.valores && typeof b.valores === "object" && !Array.isArray(b.valores)) {
    const permitidas = new Set(columnasDeSubitems(p));
    for (const k of Object.keys(b.valores as Record<string, unknown>)) {
      if (!permitidas.has(k)) errores.push({ campo: `valores.${k}`, mensaje: "Esa columna no está habilitada para los subítems" });
    }
  }
  return errores;
}

export function aplicarSubitem(p: ProyectoIW, item: ItemIW, b: CambioItem, subId: string | null): string {
  item.subitems ??= [];
  let s = subId ? item.subitems.find((x) => x.id === subId) : undefined;
  if (!s) {
    // 25 nov (Ernesto: «subítems con herencia»): el subítem nuevo hereda el responsable y la fecha de su ítem; se cambian igual.
    s = { id: nuevoId("sub"), name: "", status: "Sin Iniciar", assignee: item.assignee ?? "", assigneeName: item.assigneeName ?? "", assigneeAvatar: item.assigneeAvatar ?? "", dueDate: item.dueDate ?? "", createdAt: hoy() };
    item.subitems.push(s);
  }
  if (typeof b.nombre === "string") s.name = b.nombre.trim();
  if (typeof b.estado === "string") s.status = b.estado;
  if (b.fecha !== undefined) s.dueDate = (b.fecha as string | null) ?? "";
  if (b.responsableId !== undefined) asignar(p, s, b.responsableId as string | null);
  if (b.notas !== undefined) s.notes = ((b.notas as string | null) ?? "").trim();
  if (b.valores) for (const [k, v] of Object.entries(b.valores as Record<string, unknown>)) {
    const r = valorParaItem(p, k, v, {}, s.id);
    if ("error" in r) continue; // ya validado
    guardarValor(s as unknown as ItemIW, k, r.texto, r.dato);
  }
  return s.id;
}

/** 20 nov: qué columnas del tablero se muestran en los subítems (ids de columnas que lo admiten). */
export function validarColumnasSubitems(p: ProyectoIW, v: unknown): Errores {
  if (!Array.isArray(v) || v.length > 30) return [{ campo: "columnasSubitems", mensaje: "Elige hasta 30 columnas" }];
  const ok = new Set(columnasPersonalizadas(p).filter((c) => columnaParaSubitems(c.type)).map((c) => c.id));
  return v.every((x) => typeof x === "string" && ok.has(x)) ? [] : [{ campo: "columnasSubitems", mensaje: "Alguna de esas columnas no existe o no se puede usar en subítems" }];
}

export function validarGrupo(b: { nombre?: unknown; color?: unknown }, nuevo: boolean): Errores {
  const e: Errores = [];
  if ((nuevo || b.nombre !== undefined) && !(typeof b.nombre === "string" && b.nombre.trim().length >= 1 && b.nombre.trim().length <= 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  if (b.color !== undefined && !(typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color))) e.push({ campo: "color", mensaje: "Color no válido" });
  return e;
}

export function aplicarGrupo(p: ProyectoIW, b: { nombre?: unknown; color?: unknown }, grupoId: string | null): string {
  p.groups ??= [];
  let g = grupoId ? p.groups.find((x) => x.id === grupoId) : undefined;
  if (!g) {
    g = { id: nuevoId("group"), name: "", color: COLORES_GRUPO[p.groups.length % COLORES_GRUPO.length], collapsed: false };
    p.groups.push(g);
  }
  if (typeof b.nombre === "string") g.name = b.nombre.trim();
  if (typeof b.color === "string") g.color = b.color;
  return g.id;
}

/** Borrar un grupo pasa sus ítems al primer grupo que queda (nunca se borran ítems sin querer). */
export function borrarGrupo(p: ProyectoIW, grupoId: string): string | null {
  const otros = (p.groups ?? []).filter((g) => g.id !== grupoId);
  if (!otros.length) return "Un proyecto necesita al menos un grupo";
  p.groups = otros;
  for (const it of p.items ?? []) if (it.groupId === grupoId) it.groupId = otros[0].id;
  return null;
}

// ───────────────────────────── proyecto nuevo (6 nov): la misma plantilla de InooWork (pages/Projects.tsx)

export interface TableroNuevo { nombre?: unknown; cliente?: unknown; descripcion?: unknown; color?: unknown; miembros?: unknown }

export function validarTableroNuevo(b: TableroNuevo): Errores {
  const e: Errores = [];
  const texto = (v: unknown, max: number) => typeof v === "string" && v.trim().length >= 1 && v.trim().length <= max;
  if (!texto(b.nombre, 120)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 120 caracteres)" });
  if (!texto(b.cliente, 120)) e.push({ campo: "cliente", mensaje: "Escribe el nombre del cliente" });
  if (b.descripcion !== undefined && !(typeof b.descripcion === "string" && b.descripcion.length <= 2000)) e.push({ campo: "descripcion", mensaje: "La descripción es muy larga" });
  if (b.color !== undefined && !(typeof b.color === "string" && /^#[0-9a-f]{6}$/i.test(b.color))) e.push({ campo: "color", mensaje: "Color no válido" });
  if (b.miembros !== undefined && !(Array.isArray(b.miembros) && b.miembros.length <= 50 && b.miembros.every((x) => typeof x === "string"))) e.push({ campo: "miembros", mensaje: "Elige a las personas de la lista" });
  return e;
}

const COLUMNAS_INICIALES = (): ColumnaIW[] => [
  { id: "name", label: "Item", type: "text", width: 280, fixed: true },
  { id: "assignee", label: "Responsable", type: "person", width: 160 },
  { id: "priority", label: "Prioridad", type: "priority", width: 120 },
  { id: "status", label: "Estado", type: "status", width: 140 },
  { id: "dueDate", label: "Fecha Límite", type: "date", width: 130 },
  { id: "notes", label: "Descripción", type: "text", width: 200 },
];

/** El líder es quien lo crea (si no tiene ficha en InooWork, queda sin líder, como cuando lo crea un admin allá). */
export function nuevoProyecto(b: TableroNuevo, lider: PersonaIW | null, miembros: PersonaIW[], departamento: string | null, ahora = Date.now()): ProyectoIW {
  const color = typeof b.color === "string" ? b.color : COLORES_GRUPO[0];
  return {
    // Como InooWork (PROJ-<fecha en base 36>), más un sufijo: dos creados en el mismo milisegundo no chocan.
    id: `PROJ-${ahora.toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    name: String(b.nombre).trim(),
    clientName: String(b.cliente).trim(),
    description: typeof b.descripcion === "string" ? b.descripcion.trim() : "",
    status: "Sin Iniciar",
    department: departamento ?? "General",
    leaderId: lider?.id ?? "",
    leaderName: lider?.nombre ?? "",
    leaderAvatar: "",
    color,
    members: miembros.filter((m) => m.id !== lider?.id).map((m) => ({ employeeId: m.id, name: m.nombre, avatar: "", addedAt: new Date(ahora).toISOString().slice(0, 10), status: "active" })),
    createdAt: new Date(ahora).toISOString().slice(0, 10),
    views: [
      { id: `view-${ahora}`, name: "Tabla Principal", type: "table", isDefault: true, columns: COLUMNAS_INICIALES(), filters: [] },
      { id: `view-${ahora + 1}`, name: "Línea de Tiempo", type: "timeline", isDefault: false, columns: COLUMNAS_INICIALES(), filters: [] },
      { id: `view-${ahora + 2}`, name: "Kanban", type: "kanban", isDefault: false, columns: COLUMNAS_INICIALES(), filters: [] },
    ],
    items: [],
    groups: [{ id: "default", name: "To-Do", color, collapsed: false }],
  };
}

/**
 * 23 nov (auditoría Impeccable, contraste): los colores de estado son los de Monday, y el texto blanco sobre naranja,
 * gris o rojo no llega a 4,5:1. El texto va blanco o casi negro, el que contraste más con ese fondo.
 */
export function textoSobre(fondo: string | undefined | null): string | undefined {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(fondo?.trim() ?? "");
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  const canal = (i: number) => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  const conBlanco = 1.05 / (l + 0.05);
  const conOscuro = (l + 0.05) / (0.0056 + 0.05); // #111111
  return conOscuro > conBlanco ? "#111111" : "#ffffff";
}
/** Fondo de color con su texto legible. */
export const fondoConTexto = (fondo: string | undefined | null) => ({ background: fondo ?? undefined, color: textoSobre(fondo) });

/**
 * 25 nov (Ernesto: Gantt en Proyectos): el tramo de un proyecto. Empieza en su creación (o en su primer ítem, si es
 * anterior) y termina en la fecha límite más tardía de sus ítems y subítems; sin fechas límite, no tiene fin.
 */
export function fechasDelProyecto(p: ProyectoIW): { inicio: string | null; fin: string | null } {
  const dia = (x?: string) => (x && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null);
  const items = (p.items ?? []).flatMap((i) => [i, ...(i.subitems ?? [])]);
  const limites = items.map((i) => dia(i.dueDate)).filter((x): x is string => !!x).sort();
  const inicios = [dia(p.createdAt), ...items.map((i) => dia(i.createdAt))].filter((x): x is string => !!x).sort();
  const inicio = inicios[0] ?? limites[0] ?? null;
  const fin = limites.at(-1) ?? null;
  return { inicio: inicio && fin && fin < inicio ? fin : inicio, fin };
}

// ───────────────────────────── plantillas de tableros (25 nov, idea del usuario)

/**
 * La estructura de un tablero que se puede reutilizar: sus grupos, sus columnas propias (con su configuración) y, si
 * se quiere, sus ítems y subítems de ejemplo, sin responsables, fechas ni valores.
 */
export interface EstructuraTablero {
  grupos: { nombre: string; color: string }[];
  columnas: { nombre: string; tipo: string; config?: unknown }[];
  items: { nombre: string; grupo: number; subitems?: string[] }[];
}
export interface PlantillaTableroFija { id: string; nombre: string; descripcion: string; estructura: EstructuraTablero }

const g = (nombres: string[]) => nombres.map((nombre, i) => ({ nombre, color: COLORES_GRUPO[i % COLORES_GRUPO.length] }));
const its = (porGrupo: string[][]) => porGrupo.flatMap((xs, grupo) => xs.map((nombre) => ({ nombre, grupo })));
const ARCHIVOS = { nombre: "Archivos", tipo: "file" };
const ENLACE = { nombre: "Enlace", tipo: "link" };

/** Las que vienen con el portal: los servicios de Inoo. Se usan tal cual o como punto de partida. */
export const PLANTILLAS_TABLERO: readonly PlantillaTableroFija[] = [
  {
    id: "web", nombre: "Desarrollo web", descripcion: "Del brief a la publicación: descubrimiento, diseño, desarrollo, contenido y lanzamiento.",
    estructura: {
      grupos: g(["Descubrimiento", "Diseño", "Desarrollo", "Contenido", "Pruebas y lanzamiento"]),
      columnas: [ENLACE, ARCHIVOS],
      items: its([
        ["Brief del cliente", "Benchmark de referencias", "Mapa del sitio"],
        ["Flujograma", "Diseño del inicio", "Diseño de páginas internas"],
        ["Maquetación", "Formularios y correos", "Versión para celular"],
        ["Textos", "Imágenes"],
        ["Revisión con el cliente", "Dominio y hosting", "Publicación"],
      ]),
    },
  },
  {
    id: "branding", nombre: "Branding", descripcion: "Investigación, concepto, diseño de la identidad y entrega del manual.",
    estructura: {
      grupos: g(["Investigación", "Concepto", "Diseño", "Entrega"]),
      columnas: [ARCHIVOS],
      items: its([
        ["Brief de marca", "Análisis de la competencia"],
        ["Moodboard", "Propuestas de concepto"],
        ["Propuestas de logo", "Paleta y tipografías", "Aplicaciones"],
        ["Manual de marca", "Entrega de archivos"],
      ]),
    },
  },
  {
    id: "social", nombre: "Social Media mensual", descripcion: "Recurrente: un grupo por semana, con el canal, la fecha de publicación y la pieza.",
    estructura: {
      grupos: g(["Semana 1", "Semana 2", "Semana 3", "Semana 4"]),
      columnas: [
        { nombre: "Canal", tipo: "etiqueta", config: { etiquetas: [
          { texto: "Instagram", color: "#e2445c" }, { texto: "Facebook", color: "#0086c0" }, { texto: "TikTok", color: "#333333" }, { texto: "LinkedIn", color: "#1f76c2" },
        ] } },
        { nombre: "Publicación", tipo: "date" },
        { nombre: "Pieza", tipo: "file" },
      ],
      items: its([["Calendario del mes", "Aprobación del cliente"]]),
    },
  },
  {
    id: "crm", nombre: "Implementación de CRM", descripcion: "Diagnóstico, configuración, integraciones, capacitación y acompañamiento.",
    estructura: {
      grupos: g(["Diagnóstico", "Configuración", "Integraciones", "Capacitación", "Acompañamiento"]),
      columnas: [ARCHIVOS],
      items: its([
        ["Levantamiento de procesos", "Mapa del pipeline"],
        ["Usuarios y permisos", "Campos y etapas", "Importación de contactos"],
        ["Integración con la web"],
        ["Capacitación 1", "Capacitación 2"],
        ["Seguimiento del primer mes"],
      ]),
    },
  },
  {
    id: "audiovisual", nombre: "Audiovisual", descripcion: "Preproducción, rodaje, edición y entrega.",
    estructura: {
      grupos: g(["Preproducción", "Rodaje", "Edición", "Entrega"]),
      columnas: [ENLACE, ARCHIVOS],
      items: its([
        ["Guion", "Shotlist", "Locación y permisos"],
        ["Rodaje"],
        ["Primer corte", "Color y audio"],
        ["Entrega final"],
      ]),
    },
  },
];

/** La estructura de un tablero existente, para guardarla como plantilla. */
export function estructuraDe(p: ProyectoIW, conItems: boolean): EstructuraTablero {
  const grupos = (p.groups ?? []).map((x) => ({ nombre: x.name, color: x.color }));
  const indice = new Map((p.groups ?? []).map((x, i) => [x.id, i]));
  return {
    grupos,
    columnas: columnasPersonalizadas(p).filter((c) => !!info(c.type)).map((c) => ({ nombre: c.label, tipo: c.type, ...(c.config ? { config: structuredClone(c.config) } : {}) })),
    items: conItems ? (p.items ?? []).filter((x) => indice.has(x.groupId)).map((x) => ({ nombre: x.name, grupo: indice.get(x.groupId)!, ...((x.subitems ?? []).length ? { subitems: x.subitems!.map((s) => s.name) } : {}) })) : [],
  };
}

/** Revisa una estructura que llega de afuera (una plantilla guardada) antes de aplicarla. */
export function validarEstructura(v: unknown): { estructura: EstructuraTablero; errores: Errores } {
  const e = (v && typeof v === "object" ? v : {}) as Partial<EstructuraTablero>;
  const grupos = Array.isArray(e.grupos) ? e.grupos.filter((x) => typeof x?.nombre === "string" && x.nombre.trim()).slice(0, 30).map((x) => ({ nombre: x.nombre.trim().slice(0, 80), color: /^#[0-9a-f]{6}$/i.test(String(x.color)) ? x.color : COLORES_GRUPO[0] })) : [];
  const columnas = Array.isArray(e.columnas) ? e.columnas.filter((x) => typeof x?.nombre === "string" && typeof x?.tipo === "string" && !!info(x.tipo)).slice(0, 60) : [];
  const items = Array.isArray(e.items) ? e.items.filter((x) => typeof x?.nombre === "string" && x.nombre.trim() && Number.isInteger(x.grupo) && x.grupo >= 0 && x.grupo < grupos.length).slice(0, 300) : [];
  const errores: Errores = grupos.length ? [] : [{ campo: "plantilla", mensaje: "La plantilla no tiene grupos" }];
  return { estructura: { grupos, columnas, items }, errores };
}

/** Pone la estructura en un tablero recién creado (vacío): sus grupos, columnas e ítems de ejemplo. */
export function aplicarEstructura(p: ProyectoIW, e: EstructuraTablero) {
  const ids = e.grupos.map(() => nuevoId("g"));
  p.groups = e.grupos.map((x, i) => ({ id: ids[i], name: x.nombre, color: x.color, collapsed: false }));
  for (const c of e.columnas) agregarColumna(p, { nombre: c.nombre, tipo: c.tipo, config: c.config });
  p.items = e.items.map((x) => ({
    id: nuevoId("item"), name: x.nombre.trim().slice(0, 300), status: "Sin Iniciar", assignee: "", assigneeName: "", assigneeAvatar: "", dueDate: "", priority: "Media", notes: "", createdAt: hoy(), groupId: ids[x.grupo],
    subitems: (x.subitems ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 50).map((s) => ({ id: nuevoId("sub"), name: s.trim().slice(0, 300), status: "Sin Iniciar", assignee: "", assigneeName: "", assigneeAvatar: "", dueDate: "", createdAt: hoy() })),
  }));
}
