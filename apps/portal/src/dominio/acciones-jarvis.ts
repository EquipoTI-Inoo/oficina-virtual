/**
 * Acciones de Jarvis con aprobación (6 nov 2026). Jarvis no escribe en el portal: propone. La persona dueña de
 * la conversación aprueba o rechaza en el chat, y al aprobar, el portal la hace como ella (la misma ruta que
 * usaría con un clic, con sus permisos y validaciones). Solo cosas internas: nada le llega al cliente.
 */
import { validarTarea } from "./proyectos";

export const TIPOS_ACCION_JARVIS = ["CREAR_TAREA", "COMENTAR_PROYECTO", "CREAR_PENDIENTE"] as const;
export type TipoAccionJarvis = (typeof TIPOS_ACCION_JARVIS)[number];
export type EstadoAccionJarvis = "PENDIENTE" | "APROBADA" | "RECHAZADA" | "FALLIDA";

type Errores = { campo: string; mensaje: string }[];
/** Lo que se guarda: solo los campos conocidos de cada tipo, ya limpios. */
export type DatosAccion = Record<string, string | null>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const opcional = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Lo único que Jarvis puede mandar por POST: una propuesta que su dueño aprueba en el chat. */
export const esPropuestaJarvis = (req: Request) => {
  if (req.method !== "POST") return false;
  const ruta = new URL(req.url, "http://localhost").pathname;
  // 13 nov: también usar un conector que la persona conectó (su servicio, con su cuenta; el portal no cambia).
  return /\/jarvis\/propuestas$/.test(ruta) || /\/me\/jarvis\/conectores\/[a-z0-9-]+\/usar$/.test(ruta);
};

/** Cada propuesta pendiente de una persona; más que eso, primero tiene que decidir. */
export const MAX_PENDIENTES_JARVIS = 10;

export function validarAccionJarvis(b: { tipo?: unknown; datos?: unknown }): { errores: Errores; tipo?: TipoAccionJarvis; datos?: DatosAccion } {
  if (!TIPOS_ACCION_JARVIS.includes(b.tipo as TipoAccionJarvis)) return { errores: [{ campo: "tipo", mensaje: `Usa uno de: ${TIPOS_ACCION_JARVIS.join(", ")}` }] };
  const tipo = b.tipo as TipoAccionJarvis;
  const d = (b.datos && typeof b.datos === "object" && !Array.isArray(b.datos) ? b.datos : {}) as Record<string, unknown>;
  const e: Errores = [];
  const proyecto = () => {
    if (!UUID.test(texto(d.servicioContratadoId))) e.push({ campo: "datos.servicioContratadoId", mensaje: "Pasa el id del proyecto (servicioContratadoId)" });
  };
  let datos: DatosAccion;
  switch (tipo) {
    case "CREAR_TAREA": {
      proyecto();
      datos = { servicioContratadoId: texto(d.servicioContratadoId), titulo: texto(d.titulo), descripcion: opcional(d.descripcion), responsableId: opcional(d.responsableId), fechaLimite: opcional(d.fechaLimite) };
      for (const x of validarTarea(datos, false)) e.push({ campo: `datos.${x.campo}`, mensaje: x.mensaje });
      if (datos.responsableId && !UUID.test(datos.responsableId)) e.push({ campo: "datos.responsableId", mensaje: "Identificador no válido" });
      break;
    }
    case "COMENTAR_PROYECTO": {
      proyecto();
      datos = { servicioContratadoId: texto(d.servicioContratadoId), texto: texto(d.texto) };
      if (datos.texto!.length < 2 || datos.texto!.length > 2000) e.push({ campo: "datos.texto", mensaje: "Escribe el comentario (hasta 2000 caracteres)" });
      break;
    }
    case "CREAR_PENDIENTE": {
      datos = { titulo: texto(d.titulo), fecha: texto(d.fecha), notas: opcional(d.notas) };
      if (datos.titulo!.length < 2 || datos.titulo!.length > 120) e.push({ campo: "datos.titulo", mensaje: "Escribe el pendiente (hasta 120 caracteres)" });
      if (!FECHA.test(datos.fecha!)) e.push({ campo: "datos.fecha", mensaje: "Usa el formato AAAA-MM-DD" });
      if (datos.notas && datos.notas.length > 2000) e.push({ campo: "datos.notas", mensaje: "Las notas son muy largas" });
      break;
    }
  }
  return e.length ? { errores: e } : { errores: [], tipo, datos };
}

const corto = (s: string | null, n = 80) => (!s ? "" : s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Lo que ve la persona antes de aprobar. */
export function resumenAccionJarvis(tipo: TipoAccionJarvis, d: DatosAccion, nombres: { proyecto?: string | null; responsable?: string | null } = {}): string {
  const en = nombres.proyecto ? ` en «${corto(nombres.proyecto, 60)}»` : "";
  switch (tipo) {
    case "CREAR_TAREA":
      return `Crear la tarea «${corto(d.titulo)}»${en}${nombres.responsable ? ` para ${nombres.responsable}` : ""}${d.fechaLimite ? `, vence el ${d.fechaLimite}` : ""}`;
    case "COMENTAR_PROYECTO":
      return `Dejar un comentario interno${en}: «${corto(d.texto, 120)}»`;
    case "CREAR_PENDIENTE":
      return `Agregar a tu calendario el pendiente «${corto(d.titulo)}» para el ${d.fecha}`;
  }
}

/** La ruta del portal que hace la acción, con el cuerpo de siempre. Los comentarios siempre son internos. */
export function rutaDeAccionJarvis(tipo: TipoAccionJarvis, d: DatosAccion): { camino: string; cuerpo: Record<string, unknown>; enlace: (r: unknown) => string | null } {
  const proyecto = `/equipo/proyectos/${d.servicioContratadoId}`;
  switch (tipo) {
    case "CREAR_TAREA":
      return {
        camino: `/servicios-contratados/${d.servicioContratadoId}/tareas`,
        cuerpo: { titulo: d.titulo, ...(d.descripcion ? { descripcion: d.descripcion } : {}), ...(d.responsableId ? { responsableId: d.responsableId } : {}), ...(d.fechaLimite ? { fechaLimite: d.fechaLimite } : {}) },
        enlace: () => proyecto,
      };
    case "COMENTAR_PROYECTO":
      return { camino: `/servicios-contratados/${d.servicioContratadoId}/comentarios`, cuerpo: { texto: d.texto, interno: true }, enlace: () => proyecto };
    case "CREAR_PENDIENTE":
      return { camino: "/me/agenda/eventos", cuerpo: { tipo: "PENDIENTE", titulo: d.titulo, fecha: d.fecha, notas: d.notas }, enlace: () => "/equipo/calendario" };
  }
}
