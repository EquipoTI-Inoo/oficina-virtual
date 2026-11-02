/**
 * Altas, cambios y bajas del equipo de Inoo (2 nov 2026). El portal e InooWork comparten a las personas:
 * lo que se crea, cambia o desactiva en uno pasa al otro. Del portal a InooWork se manda al momento
 * (src/servidor/inoowork.ts); de InooWork al portal llega por /integraciones/inoowork/sincronizacion.
 * Se enlazan por el id de empleado de InooWork (EMP-…) y, si falta, por el correo.
 * Borrar es desactivar en los dos: se pierde el acceso, pero se conservan asistencia, vacaciones y tareas.
 */
import { esNivel } from "./accesos";
import type { Area } from "./ia-equipo";

export const ROLES_EQUIPO = ["ACCOUNT_MANAGER", "DISENO", "AUDIOVISUAL", "PAID_MEDIA", "DESARROLLO_WEB", "ADMIN", "FINANZAS"] as const;
export type RolEquipo = (typeof ROLES_EQUIPO)[number];
export const esRolEquipo = (v: unknown): v is RolEquipo => typeof v === "string" && (ROLES_EQUIPO as readonly string[]).includes(v);

/** Rol con que nace una persona según su área, si no se elige otro. */
export const ROL_DEL_AREA: Record<Area, RolEquipo> = {
  ADMINISTRACION: "ADMIN", CRM: "ACCOUNT_MANAGER", COMERCIAL: "ACCOUNT_MANAGER", AUDIOVISUAL: "AUDIOVISUAL", DISENO: "DISENO", MARKETING: "PAID_MEDIA",
};
/** Sin área, el rol que no abre nada especial. */
export const ROL_SIN_AREA: RolEquipo = "DISENO";

/** Áreas de InooWork (tabla `areas`) ↔ áreas del portal. */
const AREA_DEL_DEPARTAMENTO: Record<string, Area> = {
  "administración": "ADMINISTRACION", finanzas: "ADMINISTRACION", operaciones: "ADMINISTRACION", rrhh: "ADMINISTRACION", general: "ADMINISTRACION",
  "crm e innovación": "CRM", crm: "CRM",
  comercial: "COMERCIAL", ventas: "COMERCIAL",
  "comunicación audiovisual": "AUDIOVISUAL", audiovisual: "AUDIOVISUAL",
  "diseño grafico": "DISENO", "diseño gráfico": "DISENO", "diseño": "DISENO",
  marketing: "MARKETING",
};
export const DEPARTAMENTO_DEL_AREA: Record<Area, string> = {
  ADMINISTRACION: "Administración", CRM: "CRM e Innovación", COMERCIAL: "Comercial", AUDIOVISUAL: "Comunicación Audiovisual", DISENO: "Diseño Grafico", MARKETING: "Marketing",
};
export const areaDeDepartamento = (d: string | null | undefined): Area | null => (d ? AREA_DEL_DEPARTAMENTO[d.trim().toLowerCase()] ?? null : null);
/** Finanzas es Administración en el portal, pero con su rol propio. */
export const departamentoDe = (p: { area: Area | null; rolEquipo: string | null }) => (p.rolEquipo === "FINANZAS" ? "Finanzas" : p.area ? DEPARTAMENTO_DEL_AREA[p.area] : null);

export const correoValido = (v: unknown): v is string => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
export const inicialesDe = (nombre: string) => nombre.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

type Errores = { campo: string; mensaje: string }[];
const CAMPOS_CAMBIO = ["area", "nivel", "esLead", "nombre", "correo", "cargo", "rolEquipo", "activo", "reportaAId"] as const;
export type CambioPersona = Partial<Record<(typeof CAMPOS_CAMBIO)[number], unknown>>;

/** PATCH /panel/equipo/{id}: datos, área, nivel (null = el del área), lead, rol y activo. */
export function validarPersonaEquipo(b: CambioPersona, esArea: (v: unknown) => boolean): Errores {
  const errores: Errores = [];
  if (CAMPOS_CAMBIO.every((k) => b[k] === undefined)) errores.push({ campo: "area", mensaje: "Indica qué cambiar" });
  if (b.area !== undefined && b.area !== null && !esArea(b.area)) errores.push({ campo: "area", mensaje: "Elige una de las áreas" });
  if (b.nivel !== undefined && b.nivel !== null && !esNivel(b.nivel)) errores.push({ campo: "nivel", mensaje: "Usa ADMIN, CUENTA, PROYECTO o null" });
  if (b.esLead !== undefined && typeof b.esLead !== "boolean") errores.push({ campo: "esLead", mensaje: "Debe ser verdadero o falso" });
  if (b.activo !== undefined && typeof b.activo !== "boolean") errores.push({ campo: "activo", mensaje: "Debe ser verdadero o falso" });
  if (b.nombre !== undefined && (typeof b.nombre !== "string" || !b.nombre.trim())) errores.push({ campo: "nombre", mensaje: "Escribe el nombre" });
  if (b.correo !== undefined && !correoValido(b.correo)) errores.push({ campo: "correo", mensaje: "Escribe un correo válido" });
  if (b.cargo !== undefined && b.cargo !== null && typeof b.cargo !== "string") errores.push({ campo: "cargo", mensaje: "Escribe el cargo" });
  if (b.rolEquipo !== undefined && !esRolEquipo(b.rolEquipo)) errores.push({ campo: "rolEquipo", mensaje: "Elige un rol" });
  if (b.reportaAId !== undefined && b.reportaAId !== null && typeof b.reportaAId !== "string") errores.push({ campo: "reportaAId", mensaje: "Elige a una persona del equipo" });
  return errores;
}

/**
 * Organigrama: ¿puede `personaId` reportar a `jefeId`? No a sí misma ni a alguien que (directa o
 * indirectamente) le reporta a ella. `jefeDe` da el jefe actual de cada persona.
 */
export function errorReportaA(personaId: string, jefeId: string, jefeDe: (id: string) => string | null): string | null {
  if (jefeId === personaId) return "Una persona no puede reportarse a sí misma";
  for (let x: string | null = jefeId, vueltas = 0; x && vueltas < 500; x = jefeDe(x), vueltas++) {
    if (x === personaId) return "Esa persona ya le reporta (directa o indirectamente)";
  }
  return null;
}

export interface NuevaPersona { nombre: string; correo: string; cargo: string | null; area: Area | null; rolEquipo: RolEquipo; nivel: "ADMIN" | "CUENTA" | "PROYECTO" | null; esLead: boolean; reportaAId: string | null }

/** POST /panel/personas: alta de un colaborador. El correo es su usuario en el portal y en InooWork. */
export function validarNuevaPersona(b: Record<string, unknown>, esArea: (v: unknown) => boolean): { errores: Errores; persona: NuevaPersona | null } {
  const errores: Errores = [];
  if (typeof b.nombre !== "string" || !b.nombre.trim()) errores.push({ campo: "nombre", mensaje: "Escribe el nombre" });
  if (!correoValido(b.correo)) errores.push({ campo: "correo", mensaje: "Escribe un correo válido" });
  if (b.cargo !== undefined && b.cargo !== null && typeof b.cargo !== "string") errores.push({ campo: "cargo", mensaje: "Escribe el cargo" });
  if (b.area !== undefined && b.area !== null && !esArea(b.area)) errores.push({ campo: "area", mensaje: "Elige una de las áreas" });
  if (b.nivel !== undefined && b.nivel !== null && !esNivel(b.nivel)) errores.push({ campo: "nivel", mensaje: "Usa ADMIN, CUENTA, PROYECTO o null" });
  if (b.esLead !== undefined && typeof b.esLead !== "boolean") errores.push({ campo: "esLead", mensaje: "Debe ser verdadero o falso" });
  if (b.rolEquipo !== undefined && !esRolEquipo(b.rolEquipo)) errores.push({ campo: "rolEquipo", mensaje: "Elige un rol" });
  if (b.reportaAId !== undefined && b.reportaAId !== null && typeof b.reportaAId !== "string") errores.push({ campo: "reportaAId", mensaje: "Elige a una persona del equipo" });
  if (errores.length) return { errores, persona: null };
  const area = (b.area ?? null) as Area | null;
  return {
    errores,
    persona: {
      nombre: (b.nombre as string).trim(),
      correo: (b.correo as string).trim().toLowerCase(),
      cargo: typeof b.cargo === "string" && b.cargo.trim() ? b.cargo.trim() : null,
      area,
      rolEquipo: (b.rolEquipo as RolEquipo | undefined) ?? (area ? ROL_DEL_AREA[area] : ROL_SIN_AREA),
      nivel: (b.nivel ?? null) as NuevaPersona["nivel"],
      esLead: b.esLead === true,
      reportaAId: typeof b.reportaAId === "string" ? b.reportaAId : null,
    },
  };
}

/** Empleado tal como lo guarda InooWork (tabla `employees`, JSON). Solo los campos que comparten. */
export interface EmpleadoInooWork {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  status?: string | null;
  username?: string | null;
  /** Username en InooWork de su jefe (organigrama). */
  supervisorUsername?: string | null;
}

/**
 * Lo que el portal manda a InooWork de una persona. `username`: el que ya tiene en InooWork o, si nace en el
 * portal, su correo (InooWork también busca por él). `supervisorUsername`: el de su jefe.
 */
export function empleadoDesdePersona(p: { nombre: string; correo: string; usuarioInooWork?: string | null; cargo: string | null; area: Area | null; rolEquipo: string | null; activo: boolean; supervisorUsername?: string | null }) {
  return {
    name: p.nombre,
    email: p.correo,
    username: p.usuarioInooWork || p.correo,
    supervisorUsername: p.supervisorUsername ?? "",
    role: p.cargo ?? "",
    department: departamentoDe(p) ?? "",
    status: p.activo ? "active" : "inactive",
  };
}

/** Id nuevo con el mismo formato que usa InooWork al dar de alta (AdminNewEmployee). */
export const nuevoIdEmpleado = () => `EMP-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/** Lo que cambia en el portal cuando llega un empleado de InooWork. Solo lo que difiere; el área solo si InooWork la conoce. */
export function cambiosDesdeEmpleado(
  e: EmpleadoInooWork,
  actual: { nombre: string; correo: string; cargo: string | null; area: Area | null; activo: boolean },
): { nombre?: string; correo?: string; cargo?: string | null; area?: Area; activo?: boolean } {
  const c: ReturnType<typeof cambiosDesdeEmpleado> = {};
  if (e.name?.trim() && e.name.trim() !== actual.nombre) c.nombre = e.name.trim();
  const correo = correoValido(e.email) ? e.email.trim().toLowerCase() : null;
  if (correo && correo !== actual.correo) c.correo = correo;
  if (e.role !== undefined && (e.role?.trim() || null) !== actual.cargo) c.cargo = e.role?.trim() || null;
  const area = areaDeDepartamento(e.department);
  if (area && area !== actual.area) c.area = area;
  if (e.status !== undefined && e.status !== null && (e.status !== "inactive") !== actual.activo) c.activo = e.status !== "inactive";
  return c;
}
