/**
 * Calendario del equipo (26 nov 2026): el equipo agenda todo en la cuenta planning@inoo.pe (un calendario por servicio:
 * WEB, BRANDING, GESTIÓN ADS…). Google no dice de quién es cada evento (casi todo lo crea planning@), así que el portal
 * lo sugiere y cada uno lo corrige: el responsable, el cliente y a quién se menciona. Nada de esto se escribe en Google.
 */
import { claveCliente } from "./clientes-tablero";

/** Un evento de Google ya llevado a la hora de Lima. */
export interface EventoGoogle {
  clave: string; // «calendario|evento», único en planning@
  calendario: { id: string; nombre: string; color: string };
  titulo: string;
  fecha: string; // AAAA-MM-DD en Lima
  horaInicio: string | null; // null = todo el día
  horaFin: string | null;
  enlace: string | null; // en Google Calendar
  meet: string | null;
  creador: string | null; // correo
  invitados: string[]; // correos
  notas: string | null;
}

interface FechaGoogle { date?: string; dateTime?: string }
export interface EventoCrudo {
  id: string; status?: string; summary?: string; description?: string; htmlLink?: string; hangoutLink?: string;
  start?: FechaGoogle; end?: FechaGoogle; creator?: { email?: string }; organizer?: { email?: string };
  attendees?: { email?: string; responseStatus?: string; resource?: boolean }[];
}

/** «2026-11-27T10:00:00-05:00» → día y hora en Lima (UTC−5, sin horario de verano). */
function enLima(f: FechaGoogle | undefined): { fecha: string; hora: string | null } | null {
  if (!f) return null;
  if (f.date) return { fecha: f.date, hora: null };
  if (!f.dateTime) return null;
  const d = new Date(new Date(f.dateTime).getTime() - 5 * 3_600_000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
}

export function normalizarEvento(c: { id: string; nombre: string; color: string }, e: EventoCrudo): EventoGoogle | null {
  if (e.status === "cancelled") return null;
  const ini = enLima(e.start);
  if (!ini) return null;
  const fin = enLima(e.end);
  return {
    clave: `${c.id}|${e.id}`, calendario: c, titulo: (e.summary ?? "").trim() || "(sin título)",
    fecha: ini.fecha, horaInicio: ini.hora, horaFin: ini.hora && fin?.fecha === ini.fecha ? fin.hora : null,
    enlace: e.htmlLink ?? null, meet: e.hangoutLink ?? null,
    creador: e.creator?.email?.toLowerCase() ?? null,
    invitados: (e.attendees ?? []).filter((a) => a.email && !a.resource).map((a) => a.email!.toLowerCase()),
    notas: e.description ? e.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000) || null : null,
  };
}

export const CORREO_PLANNING = "planning@inoo.pe";
/** Dominios de correo gratuitos: no dicen de qué cliente es alguien. */
const GRATUITOS = new Set(["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com"]);
export const dominioDe = (correo: string) => correo.split("@")[1]?.toLowerCase() ?? "";
export const dominioUtil = (d: string) => !!d && !GRATUITOS.has(d) && d !== "inoo.pe";

export interface Contexto {
  equipo: { id: string; nombre: string; email: string }[];
  clientes: { id: string; nombre: string }[];
  /** Dominio de correo de las personas de cada cliente (swissrents.com → Swiss Capital). */
  dominios: Map<string, string>;
}

/** El cliente del evento: por su nombre en el título (el más largo que calce) o por el correo de sus invitados. */
export function clienteSugerido(e: EventoGoogle, cx: Contexto): string | null {
  const t = claveCliente(e.titulo);
  let mejor: { id: string; n: number } | null = null;
  for (const c of cx.clientes) {
    const k = claveCliente(c.nombre);
    // Como se escribe en los títulos: el nombre, pegado («Web_TecnillavesPeru») o su primera palabra si es larga («Swiss»).
    const primera = k.split(" ")[0];
    for (const x of [k, k.replace(/ /g, ""), primera.length >= 5 ? primera : ""]) {
      if (x.length >= 3 && new RegExp(`(^|[^a-z0-9])${x}([^a-z0-9]|$)`).test(t) && (!mejor || x.length > mejor.n)) mejor = { id: c.id, n: x.length };
    }
  }
  if (mejor) return mejor.id;
  for (const i of e.invitados) {
    const id = cx.dominios.get(dominioDe(i));
    if (id) return id;
  }
  return null;
}

/** Quién es: quien lo creó si es del equipo (no planning@), o si no, la primera persona del equipo invitada. */
export function responsableSugerido(e: EventoGoogle, cx: Contexto): string | null {
  const de = (correo: string | null) => (correo && correo !== CORREO_PLANNING ? cx.equipo.find((p) => p.email.toLowerCase() === correo)?.id ?? null : null);
  return de(e.creador) ?? e.invitados.map(de).find(Boolean) ?? null;
}

/** Las personas del equipo invitadas (por correo). */
export const invitadosDelEquipo = (e: EventoGoogle, cx: Contexto) =>
  cx.equipo.filter((p) => e.invitados.includes(p.email.toLowerCase()));
/** Los de afuera: el dominio (o el correo, si es gratuito), sin repetir. */
export const invitadosDeAfuera = (e: EventoGoogle) =>
  [...new Set(e.invitados.filter((c) => dominioDe(c) !== "inoo.pe").map((c) => (dominioUtil(dominioDe(c)) ? dominioDe(c) : c)))];

// ───────────────────────────── lo que agrega el portal a cada evento

export interface Guardado { responsableId: string | null; clienteId: string | null; sinResponsable: boolean; sinCliente: boolean; menciones: { id: string; nombre: string }[] }

export interface InfoEvento {
  clave: string;
  calendario: string;
  enlaceGoogle: string | null;
  meet: string | null;
  responsable: { id: string; nombre: string } | null;
  responsableSugerido: boolean;
  cliente: { id: string; nombre: string } | null;
  clienteSugerido: boolean;
  menciones: { id: string; nombre: string }[];
  invitadosEquipo: { id: string; nombre: string }[];
  externos: string[];
}

/** Lo guardado manda; si no hay nada (ni se quitó a propósito), lo sugerido. */
export function infoEvento(g: EventoGoogle, cx: Contexto, s?: Guardado): InfoEvento {
  const persona = (id: string | null) => { const p = id ? cx.equipo.find((x) => x.id === id) : undefined; return p ? { id: p.id, nombre: p.nombre } : null; };
  const cliente = (id: string | null) => { const c = id ? cx.clientes.find((x) => x.id === id) : undefined; return c ? { id: c.id, nombre: c.nombre } : null; };
  const rSug = s?.responsableId || s?.sinResponsable ? null : responsableSugerido(g, cx);
  const cSug = s?.clienteId || s?.sinCliente ? null : clienteSugerido(g, cx);
  return {
    clave: g.clave, calendario: g.calendario.nombre, enlaceGoogle: g.enlace, meet: g.meet,
    responsable: persona(s?.responsableId ?? rSug), responsableSugerido: !s?.responsableId && !!rSug,
    cliente: cliente(s?.clienteId ?? cSug), clienteSugerido: !s?.clienteId && !!cSug,
    menciones: s?.menciones ?? [],
    invitadosEquipo: invitadosDelEquipo(g, cx).map((p) => ({ id: p.id, nombre: p.nombre })),
    externos: invitadosDeAfuera(g),
  };
}

/** ¿Le toca a esta persona? (para «Mi calendario»): es la responsable, la mencionaron o está invitada. */
export const leToca = (g: EventoGoogle, i: InfoEvento, persona: { id: string; email: string }) =>
  i.responsable?.id === persona.id || i.menciones.some((m) => m.id === persona.id) || g.invitados.includes(persona.email.toLowerCase());

/** El evento como uno más de la agenda del portal (no se edita aquí: se cambia en Google). */
export function comoAgenda(g: EventoGoogle, i: InfoEvento) {
  return {
    id: `equipo-${g.clave}`, tipo: "EVENTO" as const, titulo: g.titulo, fecha: g.fecha, horaInicio: g.horaInicio, horaFin: g.horaFin,
    // Lo que se ve en el calendario sin abrirlo: de qué cliente y de quién es.
    detalle: [i.cliente?.nombre, i.responsable?.nombre].filter(Boolean).join(" · ") || null, enlace: null, hecho: false, vencido: false, origen: "EQUIPO" as const, eventoId: null, editable: false,
    notas: g.notas, invitados: i.invitadosEquipo, color: g.calendario.color, equipo: i,
  };
}

/** Lo que llega para cambiar un evento. `null` quita (y deja de sugerirse). */
export function validarCambioEvento(b: { responsableId?: unknown; clienteId?: unknown; mencionIds?: unknown }, esUuid: (x: unknown) => boolean) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.responsableId !== undefined && b.responsableId !== null && !esUuid(b.responsableId)) errores.push({ campo: "responsableId", mensaje: "Elige a alguien del equipo" });
  if (b.clienteId !== undefined && b.clienteId !== null && !esUuid(b.clienteId)) errores.push({ campo: "clienteId", mensaje: "Elige un cliente" });
  if (b.mencionIds !== undefined && !(Array.isArray(b.mencionIds) && b.mencionIds.length <= 20 && b.mencionIds.every(esUuid))) errores.push({ campo: "mencionIds", mensaje: "Hasta 20 personas del equipo" });
  return errores;
}
export const claveValida = (x: unknown): x is string => typeof x === "string" && x.length >= 3 && x.length <= 400 && x.includes("|");
