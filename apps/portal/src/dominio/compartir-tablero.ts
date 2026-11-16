/**
 * Compartir un tablero (16 nov 2026, Ernesto: «como en Monday o Google Docs»). Dos cosas, guardadas en el JSON del
 * proyecto de InooWork (InooWork las ignora y las conserva, como las automatizaciones):
 *  · `portalPermisos`: el permiso de cada miembro en el portal (lector, comentador o editor). Sin entrada = editor, que
 *    es como funcionaba todo antes; el líder y los admin son siempre editores.
 *  · `portalEnlaces`: un enlace por audiencia (equipo o invitados de afuera) con el permiso que da al entrar. El enlace
 *    lleva una firma (servidor/firma-enlace.ts): el id guardado en InooWork no basta para armarlo.
 */
import type { ProyectoIW } from "./tableros";

export const PERMISOS_TABLERO = ["LECTOR", "COMENTADOR", "EDITOR"] as const;
export type PermisoTablero = (typeof PERMISOS_TABLERO)[number];
export const AUDIENCIAS_ENLACE = ["EQUIPO", "INVITADO"] as const;
export type AudienciaEnlace = (typeof AUDIENCIAS_ENLACE)[number];
export interface EnlaceTablero { id: string; audiencia: AudienciaEnlace; permiso: PermisoTablero; activo: boolean; creadoPor: string | null; creadoEn: string }

const RANGO: Record<PermisoTablero, number> = { LECTOR: 1, COMENTADOR: 2, EDITOR: 3 };
export const esPermiso = (x: unknown): x is PermisoTablero => typeof x === "string" && (PERMISOS_TABLERO as readonly string[]).includes(x);
export const mayorPermiso = (a: PermisoTablero, b: PermisoTablero) => (RANGO[a] >= RANGO[b] ? a : b);

/** El permiso de alguien en el proyecto, o null si no lo ve. */
export function permisoEn(p: ProyectoIW, empleadoId: string | null, esAdmin: boolean): PermisoTablero | null {
  // 16 nov (Ernesto): un tablero privado (RR. HH., gerencia) lo ven solo su líder y sus miembros, ni los admins.
  if (esAdmin && !esPrivado(p)) return "EDITOR";
  if (!empleadoId) return null;
  if (p.leaderId === empleadoId) return "EDITOR";
  const m = (p.members ?? []).find((x) => x.employeeId === empleadoId);
  if (!m) return null;
  if ((m.status ?? "active") !== "active") return "LECTOR";
  const guardado = (p.portalPermisos as Record<string, unknown> | undefined)?.[empleadoId];
  return esPermiso(guardado) ? guardado : "EDITOR";
}

export const esPrivado = (p: ProyectoIW) => p.portalPrivado === true;
/** ¿Está la persona en el proyecto (líder o miembro)? */
export const estaEn = (p: ProyectoIW, empleadoId: string | null | undefined) =>
  !!empleadoId && (p.leaderId === empleadoId || (p.members ?? []).some((m) => m.employeeId === empleadoId));
/** Para vistas de otra persona (Mi área, su panel, su calendario): lo privado solo si quien mira también está. */
export const ocultoPara = (p: ProyectoIW, vistoPor: string | null | undefined) => esPrivado(p) && !estaEn(p, vistoPor);

export function fijarPermiso(p: ProyectoIW, empleadoId: string, permiso: PermisoTablero) {
  const xs = { ...((p.portalPermisos as Record<string, PermisoTablero> | undefined) ?? {}) };
  if (permiso === "EDITOR") delete xs[empleadoId]; else xs[empleadoId] = permiso;
  if (Object.keys(xs).length) p.portalPermisos = xs; else delete p.portalPermisos;
}

const idAzar = () => {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};
export const enlacesDe = (p: ProyectoIW): EnlaceTablero[] => (Array.isArray(p.portalEnlaces) ? (p.portalEnlaces as EnlaceTablero[]) : []);

/** Crea (o reemplaza) el enlace de esa audiencia: el anterior deja de funcionar. */
export function nuevoEnlace(p: ProyectoIW, audiencia: AudienciaEnlace, permiso: PermisoTablero, creadoPor: string | null, ahora = new Date()): EnlaceTablero {
  const e: EnlaceTablero = { id: idAzar(), audiencia, permiso, activo: true, creadoPor, creadoEn: ahora.toISOString() };
  p.portalEnlaces = [...enlacesDe(p).filter((x) => x.audiencia !== audiencia), e];
  return e;
}
