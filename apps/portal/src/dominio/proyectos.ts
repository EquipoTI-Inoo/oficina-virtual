/**
 * El proyecto como eje del trabajo del equipo (reunión 15 oct): cada tarjeta del pipeline es un
 * proyecto (servicio contratado) y adentro tiene sus etapas y sus tareas internas.
 */

export type ColumnaProyecto = "POR_INICIAR" | "EN_CURSO" | "ESPERA_CLIENTE" | "CON_RETRASO" | "POR_CERRAR" | "EN_PAUSA";
export type EstadoTarea = "PENDIENTE" | "EN_CURSO" | "BLOQUEADA" | "HECHA";

export const COLUMNAS_PROYECTO: { clave: ColumnaProyecto; titulo: string }[] = [
  { clave: "POR_INICIAR", titulo: "Por iniciar" },
  { clave: "EN_CURSO", titulo: "En curso" },
  { clave: "ESPERA_CLIENTE", titulo: "Esperando al cliente" },
  { clave: "CON_RETRASO", titulo: "Con retraso" },
  { clave: "POR_CERRAR", titulo: "Por cerrar" },
  { clave: "EN_PAUSA", titulo: "En pausa" },
];

/** Desde este avance el proyecto está «por cerrar» (entrega, capacitación, cierre). */
export const AVANCE_POR_CERRAR = 90;

interface DatosColumna {
  estado: string;
  avance: { porcentaje: number; etapasCompletadas: number; totalEtapas?: number; etapaActual?: { estado: string; atrasada: boolean } | null };
  /** La etapa actual depende del cliente (brief, revisión, accesos). */
  esperaCliente: boolean;
  requerimientosAtrasados: number;
}

/** En qué columna del pipeline va un proyecto; ver el orden de prioridad en /panel/proyectos. */
export function columnaProyecto(p: DatosColumna): ColumnaProyecto {
  if (p.estado === "PAUSADO") return "EN_PAUSA";
  if (p.avance.totalEtapas === 0) return p.requerimientosAtrasados > 0 ? "ESPERA_CLIENTE" : "EN_CURSO"; // por consumo (soporte): no tiene etapas
  const actual = p.avance.etapaActual;
  if (p.requerimientosAtrasados > 0 || (p.esperaCliente && actual?.atrasada)) return "ESPERA_CLIENTE";
  if (actual?.atrasada) return "CON_RETRASO";
  if (p.avance.porcentaje === 0 && p.avance.etapasCompletadas === 0 && (!actual || actual.estado === "SIN_INICIAR")) return "POR_INICIAR";
  if (p.avance.porcentaje >= AVANCE_POR_CERRAR) return "POR_CERRAR";
  return "EN_CURSO";
}

export const ESTADOS_TAREA: EstadoTarea[] = ["PENDIENTE", "EN_CURSO", "BLOQUEADA", "HECHA"];

// ───────────────────────────── cierre de reuniones (reunión 15 oct)

/** Plazo por defecto de un pendiente que sale de una reunión. */
export const DIAS_PENDIENTE_REUNION = 2;
export const RESUMEN_MINIMO = 10;
export interface PendienteReunion { texto: string; de: "CLIENTE" | "INOO"; responsableId: string | null; diasHabiles: number }

/**
 * Al marcar una reunión como realizada el resumen es obligatorio (cada reunión tiene un objetivo y se
 * documenta). Los pendientes solo se aceptan en ese momento: los del cliente se vuelven requerimientos
 * y los de Inoo, tareas. `resumenActual` es el que ya tenía la reunión (al editar).
 */
export function validarCierreReunion(
  b: { estado?: unknown; resumen?: unknown; pendientes?: unknown },
  resumenActual: string | null = null,
): { pendientes: PendienteReunion[]; errores: Errores } {
  const errores: Errores = [];
  const cerrando = b.estado === "REALIZADA";
  const resumen = b.resumen !== undefined ? b.resumen : resumenActual;
  if (cerrando && !(typeof resumen === "string" && resumen.trim().length >= RESUMEN_MINIMO)) {
    errores.push({ campo: "resumen", mensaje: "Escribe el resumen de la reunión: qué se vio y qué se acordó" });
  }
  if (b.pendientes === undefined) return { pendientes: [], errores };
  if (!cerrando) return { pendientes: [], errores: [...errores, { campo: "pendientes", mensaje: "Los pendientes se cargan al marcar la reunión como realizada" }] };
  if (!Array.isArray(b.pendientes) || b.pendientes.length > 20) return { pendientes: [], errores: [...errores, { campo: "pendientes", mensaje: "Hasta 20 pendientes" }] };
  const pendientes: PendienteReunion[] = [];
  b.pendientes.forEach((x: Record<string, unknown>, i) => {
    const texto = typeof x?.texto === "string" ? x.texto.trim() : "";
    if (texto.length < 3 || texto.length > 200) errores.push({ campo: `pendientes.${i}.texto`, mensaje: "Describe el pendiente (3 a 200 caracteres)" });
    if (x?.de !== "CLIENTE" && x?.de !== "INOO") errores.push({ campo: `pendientes.${i}.de`, mensaje: "¿Es del cliente o de Inoo?" });
    const dias = x?.diasHabiles ?? DIAS_PENDIENTE_REUNION;
    if (!(Number.isInteger(dias) && (dias as number) >= 1 && (dias as number) <= 30)) errores.push({ campo: `pendientes.${i}.diasHabiles`, mensaje: "Entre 1 y 30 días hábiles" });
    const responsableId = x?.de === "INOO" && typeof x?.responsableId === "string" ? x.responsableId : null;
    pendientes.push({ texto, de: x?.de as PendienteReunion["de"], responsableId, diasHabiles: dias as number });
  });
  return { pendientes, errores };
}

/** Vencida: no está hecha y la fecha límite ya pasó (el mismo día todavía está a tiempo). */
export const tareaVencida = (t: { estado: string; fechaLimite: string | null }, hoy: string) => t.estado !== "HECHA" && !!t.fechaLimite && t.fechaLimite < hoy.slice(0, 10);

/** Abiertas primero (por fecha límite, sin fecha al final), luego las hechas (la más reciente primero). */
export function ordenarTareas<T extends { estado: string; fechaLimite?: string | null; creadoEn: string; completadaEn?: string | null }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => {
    const ha = a.estado === "HECHA";
    const hb = b.estado === "HECHA";
    if (ha !== hb) return ha ? 1 : -1;
    if (ha) return (b.completadaEn ?? "").localeCompare(a.completadaEn ?? "");
    const fa = a.fechaLimite ?? null;
    const fb = b.fechaLimite ?? null;
    if (fa !== fb) return !fa ? 1 : !fb ? -1 : fa.localeCompare(fb);
    return a.creadoEn.localeCompare(b.creadoEn);
  });
}

type Errores = { campo: string; mensaje: string }[];

/** Tarea nueva (`parcial` = false) o cambio. Que el responsable sea del equipo y la etapa del proyecto lo revisa la API. */
export function validarTarea(b: { titulo?: unknown; descripcion?: unknown; estado?: unknown; fechaLimite?: unknown; responsableId?: unknown; etapaId?: unknown }, parcial: boolean): Errores {
  const errores: Errores = [];
  if (!parcial || b.titulo !== undefined) {
    const t = typeof b.titulo === "string" ? b.titulo.trim() : "";
    if (t.length < 3 || t.length > 200) errores.push({ campo: "titulo", mensaje: "Escribe la tarea (entre 3 y 200 caracteres)" });
  }
  if (b.descripcion !== undefined && b.descripcion !== null && typeof b.descripcion !== "string") errores.push({ campo: "descripcion", mensaje: "La descripción debe ser texto" });
  if (b.estado !== undefined && !ESTADOS_TAREA.includes(b.estado as EstadoTarea)) errores.push({ campo: "estado", mensaje: "Estado no válido" });
  if (b.fechaLimite !== undefined && b.fechaLimite !== null && !(typeof b.fechaLimite === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fechaLimite))) {
    errores.push({ campo: "fechaLimite", mensaje: "Usa el formato AAAA-MM-DD" });
  }
  for (const k of ["responsableId", "etapaId"] as const) {
    if (b[k] !== undefined && b[k] !== null && typeof b[k] !== "string") errores.push({ campo: k, mensaje: "Identificador no válido" });
  }
  return errores;
}
