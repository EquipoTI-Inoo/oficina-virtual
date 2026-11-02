/**
 * Accesos del equipo por nivel (2 nov 2026). Cada persona del equipo ve lo suyo:
 *  · ADMIN     el rol ADMIN o FINANZAS y toda el área de Administración: todas las cuentas y proyectos.
 *  · CUENTA    CRM y Comercial: las cuentas asignadas (acceso_cuenta) y las que lleva como AM, con todo.
 *  · PROYECTO  Audiovisual, Diseño y Marketing: sus proyectos (miembro, responsable o con tareas) y, de
 *              esos clientes, solo lo de marca, briefs y requerimientos; nada comercial.
 * El nivel sale del área; el ADMIN lo puede cambiar a una persona. Los leads de área asignan a la gente de
 * su área y ven lo que hace su área (sus cuentas o proyectos, su carga y su calendario).
 */
import type { Area } from "./ia-equipo";

export const NIVELES = ["ADMIN", "CUENTA", "PROYECTO"] as const;
export type Nivel = (typeof NIVELES)[number];
export const esNivel = (v: unknown): v is Nivel => typeof v === "string" && (NIVELES as readonly string[]).includes(v);
export const NOMBRE_NIVEL: Record<Nivel, string> = { ADMIN: "Administrador", CUENTA: "Por cuenta", PROYECTO: "Por proyecto" };

const NIVEL_DEL_AREA: Record<Area, Nivel> = {
  ADMINISTRACION: "ADMIN", CRM: "CUENTA", COMERCIAL: "CUENTA", AUDIOVISUAL: "PROYECTO", DISENO: "PROYECTO", MARKETING: "PROYECTO",
};

/** Nivel efectivo: el elegido por el ADMIN o, si no, el del rol y el área. Sin área, por proyecto (lo más cerrado). */
export function nivelDe(p: { rolEquipo: string | null; area: Area | null; nivelAcceso?: Nivel | null }): Nivel {
  if (p.nivelAcceso) return p.nivelAcceso;
  if (p.rolEquipo === "ADMIN" || p.rolEquipo === "FINANZAS") return "ADMIN";
  return p.area ? NIVEL_DEL_AREA[p.area] : "PROYECTO";
}

/** Lo que una persona del equipo puede ver. `cuentas`: clientes completos; `proyectos`: proyectos sueltos. */
export interface Alcance {
  nivel: Nivel;
  todo: boolean;
  cuentas: ReadonlySet<string>;
  proyectos: ReadonlySet<string>;
}

export const ALCANCE_TOTAL: Alcance = { nivel: "ADMIN", todo: true, cuentas: new Set(), proyectos: new Set() };

interface Persona { id: string; rolEquipo: string | null; area: Area | null; nivelAcceso?: Nivel | null; esLead?: boolean }

/**
 * Arma el alcance a partir de las relaciones guardadas. Los leads reparten el trabajo de su área, así que
 * ven todas las cuentas (nivel CUENTA) o todos los proyectos (nivel PROYECTO) para poder asignar.
 */
export function calcularAlcance(
  yo: Persona,
  r: {
    /** Cuentas de la persona: asignadas o como AM. */
    cuentas: () => string[];
    /** Proyectos de la persona: miembro, responsable o con tareas. */
    proyectos: () => string[];
    /** Proyectos de una cuenta. */
    proyectosDeCuenta: (clienteId: string) => string[];
    todasLasCuentas: () => string[];
    todosLosProyectos: () => string[];
  },
): Alcance {
  const nivel = nivelDe(yo);
  if (nivel === "ADMIN") return { ...ALCANCE_TOTAL };
  const cuentas = new Set(nivel === "CUENTA" ? (yo.esLead ? r.todasLasCuentas() : r.cuentas()) : []);
  const proyectos = new Set(nivel === "PROYECTO" && yo.esLead ? r.todosLosProyectos() : r.proyectos());
  for (const c of cuentas) r.proyectosDeCuenta(c).forEach((p) => proyectos.add(p));
  return { nivel, todo: false, cuentas, proyectos };
}

export const veCuenta = (a: Alcance, clienteId: string) => a.todo || a.cuentas.has(clienteId);
export const veProyecto = (a: Alcance, scId: string) => a.todo || a.proyectos.has(scId);

/** ¿`actor` puede asignar accesos a `objetivo`? El nivel ADMIN a cualquiera; un lead, a la gente de su área. */
export function puedeAsignar(actor: Persona, objetivo: { area: Area | null; tipo?: string }) {
  if (objetivo.tipo && objetivo.tipo !== "EQUIPO") return false;
  if (nivelDe(actor) === "ADMIN") return true;
  return !!actor.esLead && !!actor.area && actor.area === objetivo.area;
}

/** ¿`actor` puede ver la carga y el calendario de `objetivo`? Él mismo, el nivel ADMIN o un lead de su área. */
export function puedeSupervisar(actor: Persona, objetivo: { id: string; area: Area | null }) {
  return actor.id === objetivo.id || nivelDe(actor) === "ADMIN" || (!!actor.esLead && !!actor.area && actor.area === objetivo.area);
}
