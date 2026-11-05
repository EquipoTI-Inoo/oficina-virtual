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

/**
 * Permisos sueltos (5 nov 2026). El nivel da unos por defecto y el super usuario puede conceder o quitar cada
 * uno a una persona. Lo que cada quien ve (cuentas y proyectos) sigue saliendo del nivel.
 */
export const PERMISOS = ["GESTIONAR_EQUIPO", "ASIGNAR_ACCESOS", "COSTOS_IA", "ESTADO_PAGO"] as const;
export type Permiso = (typeof PERMISOS)[number];
export const esPermiso = (v: unknown): v is Permiso => typeof v === "string" && (PERMISOS as readonly string[]).includes(v);
export const NOMBRE_PERMISO: Record<Permiso, { titulo: string; ayuda: string }> = {
  GESTIONAR_EQUIPO: { titulo: "Gestionar el equipo", ayuda: "Dar de alta, editar y desactivar colaboradores" },
  ASIGNAR_ACCESOS: { titulo: "Asignar accesos", ayuda: "Asignar gente a las cuentas y los proyectos que ve" },
  COSTOS_IA: { titulo: "Costos de IA", ayuda: "Ver los costos y mover los topes de cada área" },
  ESTADO_PAGO: { titulo: "Estado de pago", ayuda: "Cambiar si una cuenta está al día o atrasada" },
};
/** true = concedido, false = quitado; si no está, manda el nivel. */
export type PermisosPersonalizados = Partial<Record<Permiso, boolean>>;

interface PersonaConPermisos {
  rolEquipo: string | null;
  area: Area | null;
  nivelAcceso?: Nivel | null;
  esSuperUsuario?: boolean;
  permisosPersonalizados?: PermisosPersonalizados | null;
}

/** Nivel efectivo: el super usuario es ADMIN; si no, el elegido o el del rol y el área. Sin área, por proyecto (lo más cerrado). */
export function nivelDe(p: { rolEquipo: string | null; area: Area | null; nivelAcceso?: Nivel | null; esSuperUsuario?: boolean }): Nivel {
  if (p.esSuperUsuario) return "ADMIN";
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

/** Permisos efectivos. El super usuario los tiene todos y a él no se le aplican los personalizados. */
export function permisosDe(p: PersonaConPermisos): Permiso[] {
  if (p.esSuperUsuario) return [...PERMISOS];
  const base: readonly Permiso[] = nivelDe(p) === "ADMIN" ? PERMISOS : p.rolEquipo === "FINANZAS" ? ["ESTADO_PAGO"] : [];
  return PERMISOS.filter((x) => p.permisosPersonalizados?.[x] ?? base.includes(x));
}

interface Persona extends PersonaConPermisos {
  id: string;
  esLead?: boolean;
  /** Efectivos, si ya vienen calculados (la sesión); si no, se calculan. */
  permisos?: readonly Permiso[];
}

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

/** ¿`actor` puede asignar accesos a `objetivo`? Con el permiso, a cualquiera; un lead, a la gente de su área. */
export function puedeAsignar(actor: Persona, objetivo: { area: Area | null; tipo?: string }) {
  if (objetivo.tipo && objetivo.tipo !== "EQUIPO") return false;
  if ((actor.permisos ?? permisosDe(actor)).includes("ASIGNAR_ACCESOS")) return true;
  return !!actor.esLead && !!actor.area && actor.area === objetivo.area;
}

/** ¿`actor` puede ver la carga y el calendario de `objetivo`? Él mismo, el nivel ADMIN o un lead de su área. */
export function puedeSupervisar(actor: Persona, objetivo: { id: string; area: Area | null }) {
  return actor.id === objetivo.id || nivelDe(actor) === "ADMIN" || (!!actor.esLead && !!actor.area && actor.area === objetivo.area);
}

// ───────────────────────────────────────────── super usuario (pedido de Ernesto, 2 nov; hecho el 5 nov)

export const SOLO_SUPER = "Solo un super usuario puede cambiar niveles, permisos y quién es ADMIN";

/** Lo que define el acceso de una persona. */
export interface EstadoAcceso extends PersonaConPermisos {
  rolEquipo: string | null;
  area: Area | null;
  nivelAcceso: Nivel | null;
  esSuperUsuario: boolean;
  activo: boolean;
  permisosPersonalizados: PermisosPersonalizados;
}

/** Cambio pedido, ya validado. En `permisos`, null vuelve a lo que da el nivel. */
export interface CambioAcceso {
  rolEquipo?: unknown;
  area?: unknown;
  nivel?: unknown;
  esSuperUsuario?: unknown;
  activo?: unknown;
  permisos?: unknown;
}

export function validarPermisos(v: unknown): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "Indica los permisos a cambiar";
  for (const [k, x] of Object.entries(v)) {
    if (!esPermiso(k)) return `No existe el permiso ${k}`;
    if (x !== true && x !== false && x !== null) return "Cada permiso se concede (true), se quita (false) o vuelve a su nivel (null)";
  }
  return null;
}

function aplicarPermisos(antes: PermisosPersonalizados, cambio: unknown): PermisosPersonalizados {
  const r: PermisosPersonalizados = { ...antes };
  for (const [k, x] of Object.entries((cambio ?? {}) as Record<Permiso, boolean | null>)) {
    if (x === null) delete r[k as Permiso];
    else r[k as Permiso] = x;
  }
  return r;
}

const mismosPersonalizados = (a: PermisosPersonalizados, b: PermisosPersonalizados) => PERMISOS.every((x) => a[x] === b[x]);

/**
 * Reglas del super usuario para PATCH /panel/equipo/{id}, iguales en la API simulada y en el backend real.
 * Mira el acceso efectivo, no solo el campo `nivel`: mover a alguien al área de Administración o cambiarle el
 * rol también le cambia lo que puede hacer. `prohibido` es un 403; `errores`, un 422.
 */
export function revisarCambioAcceso(actorEsSuper: boolean, antes: EstadoAcceso, b: CambioAcceso, otrosSupersActivos: number) {
  const despues: EstadoAcceso = {
    rolEquipo: b.rolEquipo !== undefined ? (b.rolEquipo as string) : antes.rolEquipo,
    area: b.area !== undefined ? (b.area as Area | null) : antes.area,
    nivelAcceso: b.nivel !== undefined ? (b.nivel as Nivel | null) : antes.nivelAcceso,
    esSuperUsuario: typeof b.esSuperUsuario === "boolean" ? b.esSuperUsuario : antes.esSuperUsuario,
    activo: typeof b.activo === "boolean" ? b.activo : antes.activo,
    permisosPersonalizados: aplicarPermisos(antes.permisosPersonalizados, b.permisos),
  };
  const cambiaAcceso = antes.esSuperUsuario !== despues.esSuperUsuario
    || antes.nivelAcceso !== despues.nivelAcceso
    || nivelDe(antes) !== nivelDe(despues)
    || !mismosPersonalizados(antes.permisosPersonalizados, despues.permisosPersonalizados)
    || permisosDe(antes).join() !== permisosDe(despues).join();
  let prohibido: string | null = null;
  if (!actorEsSuper && antes.esSuperUsuario) prohibido = "Solo un super usuario puede cambiar a otro super usuario";
  else if (!actorEsSuper && cambiaAcceso) prohibido = SOLO_SUPER;
  const errores: { campo: string; mensaje: string }[] = [];
  // Siempre debe quedar alguien que pueda repartir accesos.
  if (antes.esSuperUsuario && !otrosSupersActivos) {
    if (!despues.esSuperUsuario) errores.push({ campo: "esSuperUsuario", mensaje: "Debe quedar al menos un super usuario" });
    if (!despues.activo) errores.push({ campo: "activo", mensaje: "No se puede desactivar al último super usuario" });
  }
  return { prohibido, errores, despues };
}

/**
 * Lo que llega de InooWork no reparte accesos: si el cambio de área le cambiaría el nivel a la persona, el área
 * se queda como está hasta que lo decida un super usuario. Tampoco se desactiva al último super usuario.
 */
export function limitarCambiosDeInooWork<C extends { area?: Area; activo?: boolean }>(c: C, p: { rolEquipo: string | null; area: Area | null; nivelAcceso?: Nivel | null; esSuperUsuario?: boolean }, otrosSupersActivos: number): C {
  const r = { ...c };
  if (r.area && nivelDe({ ...p, area: r.area }) !== nivelDe(p)) delete r.area;
  if (r.activo === false && p.esSuperUsuario && !otrosSupersActivos) delete r.activo;
  return r;
}

/** Un alta sin ser super usuario no puede nacer con nivel elegido ni con privilegios. */
export function altaProhibida(actorEsSuper: boolean, n: { rolEquipo: string | null; area: Area | null; nivel: Nivel | null }) {
  if (actorEsSuper) return null;
  const nueva = { rolEquipo: n.rolEquipo, area: n.area, nivelAcceso: n.nivel };
  return n.nivel !== null || nivelDe(nueva) === "ADMIN" || permisosDe(nueva).length ? SOLO_SUPER : null;
}

const etiquetaNivel = (s: EstadoAcceso) => `${NOMBRE_NIVEL[nivelDe(s)]}${s.nivelAcceso ? " (elegido)" : " (según su área)"}`;
const etiquetaPermiso = (v: boolean | undefined) => (v === undefined ? "Según su nivel" : v ? "Concedido" : "Quitado");
const siNo = (v: boolean) => (v ? "Sí" : "No");

/** Lo que queda en el historial de accesos: qué cambió, en palabras. */
export function cambiosDeAcceso(antes: EstadoAcceso, despues: EstadoAcceso) {
  const r: { campo: string; antes: string; despues: string }[] = [];
  const anotar = (campo: string, a: string, d: string) => {
    if (a !== d) r.push({ campo, antes: a, despues: d });
  };
  anotar("Super usuario", siNo(antes.esSuperUsuario), siNo(despues.esSuperUsuario));
  anotar("Nivel de acceso", etiquetaNivel(antes), etiquetaNivel(despues));
  anotar("Activo", siNo(antes.activo), siNo(despues.activo));
  for (const x of PERMISOS) anotar(NOMBRE_PERMISO[x].titulo, etiquetaPermiso(antes.permisosPersonalizados[x]), etiquetaPermiso(despues.permisosPersonalizados[x]));
  return r;
}
