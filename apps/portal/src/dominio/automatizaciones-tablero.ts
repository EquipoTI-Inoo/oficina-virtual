/**
 * Automatizaciones de los tableros (13 nov 2026), como las recetas de Monday: «cuando X, hacer Y». Viven en el JSON
 * del proyecto en InooWork (`portalAutomatizaciones`), que guarda los campos que el portal le agrega.
 *
 * Disparadores: se crea un ítem, o su estado cambia a uno dado. Acciones: asignar a alguien, avisarle, moverlo de
 * grupo, cambiar la prioridad o ponerle fecha límite a N días. Corren una sola pasada (una acción no dispara otra).
 */
import { aplicarItem, ESTADOS_ITEM, personasDelProyecto, PRIORIDADES_ITEM, type CambioItem, type Conectados, type ProyectoIW, type Quien } from "./tableros";

export type DisparadorTablero = { tipo: "CREADO" } | { tipo: "ESTADO"; estado: string };
export type AccionTablero =
  | { tipo: "ASIGNAR"; empleadoId: string }
  | { tipo: "AVISAR"; empleadoId: string }
  | { tipo: "MOVER_GRUPO"; grupoId: string }
  | { tipo: "PRIORIDAD"; prioridad: string }
  | { tipo: "FECHA"; dias: number };
export interface AutomatizacionTablero { id: string; activa: boolean; cuando: DisparadorTablero; hacer: AccionTablero; creadaPor: string | null; creadaEn: string }

export const MAX_AUTOMATIZACIONES_TABLERO = 30;
type Errores = { campo: string; mensaje: string }[];

export const automatizacionesDe = (p: ProyectoIW): AutomatizacionTablero[] => (Array.isArray(p.portalAutomatizaciones) ? (p.portalAutomatizaciones as AutomatizacionTablero[]) : []);

export function validarAutomatizacionTablero(b: { cuando?: unknown; hacer?: unknown; activa?: unknown }, p: ProyectoIW, parcial = false): Errores {
  const e: Errores = [];
  if (!parcial || b.cuando !== undefined) {
    const c = b.cuando as Partial<DisparadorTablero> | undefined;
    if (!c || (c.tipo !== "CREADO" && c.tipo !== "ESTADO")) e.push({ campo: "cuando", mensaje: "Elige cuándo corre: al crear un ítem o cuando cambia su estado" });
    else if (c.tipo === "ESTADO" && !(ESTADOS_ITEM as readonly string[]).includes((c as { estado?: string }).estado ?? "")) e.push({ campo: "cuando", mensaje: "Elige el estado" });
  }
  if (!parcial || b.hacer !== undefined) {
    const h = b.hacer as Record<string, unknown> | undefined;
    const personas = new Set(personasDelProyecto(p).map((x) => x.id));
    if (!h || typeof h.tipo !== "string") e.push({ campo: "hacer", mensaje: "Elige qué hace" });
    else if ((h.tipo === "ASIGNAR" || h.tipo === "AVISAR") && !personas.has(h.empleadoId as string)) e.push({ campo: "hacer", mensaje: "Elige a alguien del proyecto" });
    else if (h.tipo === "MOVER_GRUPO" && !(p.groups ?? []).some((g) => g.id === h.grupoId)) e.push({ campo: "hacer", mensaje: "Elige un grupo del proyecto" });
    else if (h.tipo === "PRIORIDAD" && !(PRIORIDADES_ITEM as readonly string[]).includes(h.prioridad as string)) e.push({ campo: "hacer", mensaje: "Elige la prioridad" });
    else if (h.tipo === "FECHA" && !(Number.isInteger(h.dias) && (h.dias as number) >= 0 && (h.dias as number) <= 365)) e.push({ campo: "hacer", mensaje: "Entre 0 y 365 días" });
    else if (!["ASIGNAR", "AVISAR", "MOVER_GRUPO", "PRIORIDAD", "FECHA"].includes(h.tipo)) e.push({ campo: "hacer", mensaje: "Acción desconocida" });
  }
  if (b.activa !== undefined && typeof b.activa !== "boolean") e.push({ campo: "activa", mensaje: "Debe ser verdadero o falso" });
  return e;
}

/** Cómo se lee la regla en la pantalla. */
export function textoAutomatizacion(a: AutomatizacionTablero, p: ProyectoIW): string {
  const persona = (id: string) => personasDelProyecto(p).find((x) => x.id === id)?.nombre ?? "alguien";
  const cuando = a.cuando.tipo === "CREADO" ? "Cuando se crea un ítem" : `Cuando el estado cambia a «${a.cuando.estado}»`;
  const h = a.hacer;
  const hacer = h.tipo === "ASIGNAR" ? `asignarlo a ${persona(h.empleadoId)}`
    : h.tipo === "AVISAR" ? `avisar a ${persona(h.empleadoId)}`
    : h.tipo === "MOVER_GRUPO" ? `moverlo a «${(p.groups ?? []).find((g) => g.id === h.grupoId)?.name ?? "otro grupo"}»`
    : h.tipo === "PRIORIDAD" ? `poner prioridad ${h.prioridad}`
    : h.dias === 0 ? "poner la fecha límite hoy" : `poner la fecha límite en ${h.dias} ${h.dias === 1 ? "día" : "días"}`;
  return `${cuando}, ${hacer}`;
}

export interface AvisoAutomatizacion { empleadoId: string; itemId: string; titulo: string; motivo: "ASIGNADO" | "AVISO" }

const masDias = (hoy: string, n: number) => new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Corre las automatizaciones sobre los ítems que cambiaron. `estadosAntes`: el estado de cada ítem antes del cambio
 * (los que no estaban, se crearon). Devuelve a quién hay que avisar.
 */
export function correrAutomatizaciones(p: ProyectoIW, estadosAntes: Map<string, string>, hoy: string, quien?: Quien, conectados: Conectados = {}): AvisoAutomatizacion[] {
  const reglas = automatizacionesDe(p).filter((a) => a.activa);
  if (!reglas.length) return [];
  const avisos: AvisoAutomatizacion[] = [];
  const robot: Quien = { id: null, nombre: quien?.nombre ? `${quien.nombre} (automatización)` : "Automatización" };
  for (const it of [...(p.items ?? [])]) {
    const antes = estadosAntes.get(it.id);
    const creado = antes === undefined;
    const cambioEstado = !creado && antes !== it.status;
    if (!creado && !cambioEstado) continue;
    for (const a of reglas) {
      const toca = a.cuando.tipo === "CREADO" ? creado : cambioEstado && it.status === a.cuando.estado;
      if (!toca) continue;
      const h = a.hacer;
      const cambio: CambioItem | null = h.tipo === "ASIGNAR" ? { responsableId: h.empleadoId }
        : h.tipo === "MOVER_GRUPO" ? { grupoId: h.grupoId }
        : h.tipo === "PRIORIDAD" ? { prioridad: h.prioridad }
        : h.tipo === "FECHA" ? { fecha: masDias(hoy, h.dias) } : null;
      if (cambio) aplicarItem(p, cambio, it.id, robot, conectados);
      if (h.tipo === "ASIGNAR") avisos.push({ empleadoId: h.empleadoId, itemId: it.id, titulo: it.name, motivo: "ASIGNADO" });
      if (h.tipo === "AVISAR") avisos.push({ empleadoId: h.empleadoId, itemId: it.id, titulo: it.name, motivo: "AVISO" });
    }
  }
  return avisos;
}
