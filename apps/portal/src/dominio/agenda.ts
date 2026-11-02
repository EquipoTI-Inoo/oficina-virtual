/**
 * Calendario del colaborador (2 nov 2026). Ya no es solo el plan de contenido de los clientes: junta todo lo
 * que le toca a una persona del equipo, con vistas de mes, semana y día:
 *  · TAREA          sus tareas abiertas, el día que vencen
 *  · REUNION        las reuniones de los proyectos donde participa (es responsable o tiene tareas)
 *  · REQUERIMIENTO  lo que el cliente debe entregar en esos proyectos, el día que vence
 *  · FERIADO        feriados y días no laborables de la agencia
 *  · PENDIENTE      sus pendientes (to-dos), con o sin hora, que marca como hechos
 *  · EVENTO         reuniones internas, llamadas o bloques de trabajo que crea, con invitados del equipo
 * Todo en hora de Lima (UTC-5, sin horario de verano). Google Calendar se deja listo para conectar: hoy la
 * conexión es simulada y los eventos llevan su origen (PORTAL o GOOGLE) para cuando se sincronice de verdad.
 */

export const TIPOS_AGENDA = ["REUNION", "TAREA", "REQUERIMIENTO", "FERIADO", "PENDIENTE", "EVENTO"] as const;
export type TipoAgenda = (typeof TIPOS_AGENDA)[number];
/** Los que crea la persona (el resto vienen de los proyectos y la agencia). */
export const TIPOS_PROPIOS = ["PENDIENTE", "EVENTO"] as const;
export type TipoPropio = (typeof TIPOS_PROPIOS)[number];

/** Hasta cuántos días se piden de una vez (la vista de mes muestra 6 semanas). */
export const DIAS_MAXIMOS_AGENDA = 62;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const esFecha = (v: unknown): v is string => typeof v === "string" && FECHA.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`)) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
export const esHora = (v: unknown): v is string => typeof v === "string" && HORA.test(v);

/** Fecha y hora en Lima de un instante (las reuniones de proyecto se guardan como timestamptz). */
export function enLima(instante: string | Date) {
  const iso = new Date(new Date(instante).getTime() - 5 * 3_600_000).toISOString();
  return { fecha: iso.slice(0, 10), hora: iso.slice(11, 16) };
}

export function sumarMinutos(hora: string, minutos: number) {
  const [h, m] = hora.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutos, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Los días entre dos fechas, ambas incluidas. */
export function diasEntre(desde: string, hasta: string) {
  const dias: string[] = [];
  for (let d = new Date(`${desde}T12:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d = new Date(d.getTime() + 86_400_000)) dias.push(d.toISOString().slice(0, 10));
  return dias;
}

/** Valida el rango de GET /me/agenda. */
export function validarRango(desde: unknown, hasta: unknown) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (!esFecha(desde)) errores.push({ campo: "desde", mensaje: "Fecha inválida (AAAA-MM-DD)" });
  if (!esFecha(hasta)) errores.push({ campo: "hasta", mensaje: "Fecha inválida (AAAA-MM-DD)" });
  if (!errores.length && ((hasta as string) < (desde as string) || diasEntre(desde as string, hasta as string).length > DIAS_MAXIMOS_AGENDA)) {
    errores.push({ campo: "hasta", mensaje: `Pide entre 1 y ${DIAS_MAXIMOS_AGENDA} días` });
  }
  return errores;
}

export interface EventoEntrada {
  tipo?: unknown;
  titulo?: unknown;
  fecha?: unknown;
  horaInicio?: unknown;
  horaFin?: unknown;
  notas?: unknown;
  hecho?: unknown;
  invitadosIds?: unknown;
}

/**
 * Valida lo que se manda al crear (todo) o editar (solo lo que venga) un pendiente o evento. `actual` es el
 * evento guardado al editar, para revisar las horas y el tipo combinados.
 */
export function validarEvento(b: EventoEntrada, actual?: { tipo: TipoPropio; horaInicio: string | null; horaFin: string | null }) {
  const errores: { campo: string; mensaje: string }[] = [];
  const parcial = !!actual;
  const tipo = (actual?.tipo ?? b.tipo) as TipoPropio;
  if (!parcial && !(TIPOS_PROPIOS as readonly unknown[]).includes(b.tipo)) errores.push({ campo: "tipo", mensaje: "Elige si es un pendiente o un evento" });
  if (parcial && b.tipo !== undefined && b.tipo !== actual.tipo) errores.push({ campo: "tipo", mensaje: "No se puede cambiar el tipo" });
  if ((!parcial || b.titulo !== undefined) && !(typeof b.titulo === "string" && b.titulo.trim().length >= 2 && b.titulo.trim().length <= 120)) {
    errores.push({ campo: "titulo", mensaje: "Ponle un título (2 a 120 caracteres)" });
  }
  if ((!parcial || b.fecha !== undefined) && !esFecha(b.fecha)) errores.push({ campo: "fecha", mensaje: "Elige el día" });
  if (b.horaInicio !== undefined && b.horaInicio !== null && !esHora(b.horaInicio)) errores.push({ campo: "horaInicio", mensaje: "Hora inválida (HH:MM)" });
  if (b.horaFin !== undefined && b.horaFin !== null && !esHora(b.horaFin)) errores.push({ campo: "horaFin", mensaje: "Hora inválida (HH:MM)" });
  const inicio = b.horaInicio !== undefined ? b.horaInicio : actual?.horaInicio ?? null;
  // Quitar la hora de inicio deja el evento de todo el día (su hora de fin se va con ella).
  const fin = b.horaFin !== undefined ? b.horaFin : inicio === null ? null : actual?.horaFin ?? null;
  if (!errores.some((e) => e.campo.startsWith("hora"))) {
    if (fin !== null && inicio === null) errores.push({ campo: "horaInicio", mensaje: "Pon la hora de inicio" });
    else if (fin !== null && (fin as string) <= (inicio as string)) errores.push({ campo: "horaFin", mensaje: "Debe terminar después de empezar" });
  }
  if (b.notas !== undefined && b.notas !== null && !(typeof b.notas === "string" && b.notas.length <= 2000)) errores.push({ campo: "notas", mensaje: "Hasta 2000 caracteres" });
  if (b.hecho !== undefined && (typeof b.hecho !== "boolean" || tipo !== "PENDIENTE")) errores.push({ campo: "hecho", mensaje: "Solo los pendientes se marcan como hechos" });
  if (b.invitadosIds !== undefined) {
    const ok = Array.isArray(b.invitadosIds) && b.invitadosIds.length <= 30 && b.invitadosIds.every((x) => typeof x === "string");
    if (!ok || (tipo !== "EVENTO" && (b.invitadosIds as unknown[]).length)) errores.push({ campo: "invitadosIds", mensaje: "Solo los eventos llevan invitados del equipo" });
  }
  return errores;
}

/** Lo que guarda la base al crear: un evento con hora de inicio y sin fin dura una hora; un pendiente, nada. */
export function horasAlGuardar(tipo: TipoPropio, inicio: string | null, fin: string | null) {
  if (inicio && !fin && tipo === "EVENTO") return { horaInicio: inicio, horaFin: sumarMinutos(inicio, 60) };
  return { horaInicio: inicio, horaFin: fin };
}

/** Orden del día: primero lo de todo el día (feriados, vencimientos), luego por hora. */
const ORDEN_TIPO: Record<TipoAgenda, number> = { FERIADO: 0, TAREA: 1, REQUERIMIENTO: 2, PENDIENTE: 3, REUNION: 4, EVENTO: 5 };
export function ordenarAgenda<T extends { fecha: string; horaInicio: string | null; tipo: TipoAgenda; titulo: string }>(xs: T[]) {
  return [...xs].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || (a.horaInicio ?? "").localeCompare(b.horaInicio ?? "") || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.titulo.localeCompare(b.titulo),
  );
}
