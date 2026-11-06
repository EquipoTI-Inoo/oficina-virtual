/**
 * Tableros de InooWork en el portal (2 nov 2026). InooWork es la fuente: sus proyectos (grupos, ítems,
 * subítems, columnas y vistas, como Monday) se leen y se guardan por la API que InooWork ya tiene, sin tocar
 * su código. El portal los muestra con su estilo y cada cambio se aplica sobre el proyecto recién leído
 * (InooWork guarda el proyecto completo), para no pisar lo que otra persona cambió.
 * Cómo se juntan con los proyectos de clientes del portal se decide después de la demo con Ernesto.
 *
 * Aquí: el formato de InooWork, quién ve y edita, y los cambios sobre el JSON del proyecto.
 */

// ───────────────────────────── formato de InooWork (tabla projects, JSON)

export interface PersonaIW { id: string; nombre: string }
export interface SubitemIW { id: string; name: string; status: string; assignee?: string; assigneeName?: string; assigneeAvatar?: string; dueDate?: string; createdAt?: string }
export interface ItemIW {
  id: string; name: string; status: string; assignee?: string; assigneeName?: string; assigneeAvatar?: string;
  dueDate?: string; priority?: string; notes?: string; createdAt?: string; groupId: string; subitems?: SubitemIW[];
  [columna: string]: unknown;
}
export interface GrupoIW { id: string; name: string; color: string; collapsed?: boolean }
export interface ColumnaIW { id: string; label: string; type: string; width?: number; fixed?: boolean }
export interface VistaIW { id: string; name: string; type: string; isDefault?: boolean; columns?: ColumnaIW[]; filters?: unknown[] }
export interface ProyectoIW {
  id: string; name: string; clientName?: string; description?: string; status?: string; department?: string;
  leaderId?: string; leaderName?: string; leaderAvatar?: string; color?: string; createdAt?: string; archived?: boolean;
  members?: { employeeId: string; name?: string; avatar?: string; status?: string }[];
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

// ───────────────────────────── permisos (los mismos de InooWork, pages/Projects.tsx)

export const veProyecto = (p: ProyectoIW, empleadoId: string | null, esAdmin: boolean) =>
  esAdmin || (!!empleadoId && (p.leaderId === empleadoId || (p.members ?? []).some((m) => m.employeeId === empleadoId)));
export const editaProyecto = (p: ProyectoIW, empleadoId: string | null, esAdmin: boolean) =>
  esAdmin || (!!empleadoId && (p.leaderId === empleadoId || (p.members ?? []).some((m) => m.employeeId === empleadoId && (m.status ?? "active") === "active")));

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

/** En qué columna de «Proyectos» va un tablero. Los cancelados no se muestran (null). */
export function columnaDeTablero(estado: string | null | undefined, vencidos: number) {
  switch (estado) {
    case "Cancelado": return null;
    case "Sin Iniciar": return "POR_INICIAR" as const;
    case "En Pausa": return "EN_PAUSA" as const;
    case "En Revisión":
    case "Completado": return "POR_CERRAR" as const;
    default: return vencidos > 0 ? ("CON_RETRASO" as const) : ("EN_CURSO" as const);
  }
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

export function validarItem(b: CambioItem, p: ProyectoIW, nuevo: boolean): Errores {
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
      else if (x !== null && !(typeof x === "string" && x.length <= 500) && typeof x !== "number") e.push({ campo: `valores.${k}`, mensaje: "Valor no válido" });
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
export function aplicarItem(p: ProyectoIW, b: CambioItem, itemId: string | null): string {
  p.items ??= [];
  let it = itemId ? p.items.find((x) => x.id === itemId) : undefined;
  if (!it) {
    it = { id: nuevoId("item"), name: "", status: "Sin Iniciar", assignee: "", assigneeName: "", assigneeAvatar: "", dueDate: "", priority: "Media", notes: "", createdAt: hoy(), groupId: b.grupoId as string, subitems: [] };
    p.items.push(it);
  }
  if (typeof b.nombre === "string") it.name = b.nombre.trim();
  if (typeof b.estado === "string") it.status = b.estado;
  if (typeof b.prioridad === "string") it.priority = b.prioridad;
  if (b.fecha !== undefined) it.dueDate = (b.fecha as string | null) ?? "";
  if (b.notas !== undefined) it.notes = ((b.notas as string | null) ?? "").trim();
  if (typeof b.grupoId === "string") it.groupId = b.grupoId;
  if (b.responsableId !== undefined) asignar(p, it, b.responsableId as string | null);
  if (b.valores) for (const [k, v] of Object.entries(b.valores as Record<string, unknown>)) it[k] = v === null ? "" : v;
  return it.id;
}

export function validarSubitem(b: CambioItem, p: ProyectoIW, nuevo: boolean): Errores {
  return validarItem({ ...b, grupoId: undefined, prioridad: undefined, notas: undefined, valores: undefined }, p, false).concat(
    nuevo && !(typeof b.nombre === "string" && b.nombre.trim()) ? [{ campo: "nombre", mensaje: "Escribe el subítem" }] : [],
  );
}

export function aplicarSubitem(p: ProyectoIW, item: ItemIW, b: CambioItem, subId: string | null): string {
  item.subitems ??= [];
  let s = subId ? item.subitems.find((x) => x.id === subId) : undefined;
  if (!s) {
    s = { id: nuevoId("sub"), name: "", status: "Sin Iniciar", assignee: "", assigneeName: "", assigneeAvatar: "", dueDate: "", createdAt: hoy() };
    item.subitems.push(s);
  }
  if (typeof b.nombre === "string") s.name = b.nombre.trim();
  if (typeof b.estado === "string") s.status = b.estado;
  if (b.fecha !== undefined) s.dueDate = (b.fecha as string | null) ?? "";
  if (b.responsableId !== undefined) asignar(p, s, b.responsableId as string | null);
  return s.id;
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
