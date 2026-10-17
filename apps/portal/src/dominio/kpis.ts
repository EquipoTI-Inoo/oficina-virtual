/**
 * KPIs internos del proyecto (reunión del 15 oct 2026). Solo los ve el equipo: miden cómo trabaja Inoo,
 * no se muestran al cliente. Las metas y umbrales son de relleno hasta que cada área los confirme.
 *  · Cumplimiento de fechas: etapas terminadas a tiempo.
 *  · Avance vs plan: % real contra el % que el cronograma dice que ya debería tener.
 *  · Rebotes: pedidos de cambio del cliente sobre los entregables (alerta desde 3 en uno).
 *  · Tiempo de implementación (CRM): la etapa de implementación debería durar 2 semanas.
 *  · Reuniones vs óptimas: realizadas contra las reuniones clave de la plantilla.
 *  · Rondas de propuesta (branding): alerta en la 2.ª ronda y crítica en la 4.ª.
 */
import { diasAtraso, type Semaforo } from "./requerimientos";
import { REBOTES_ALERTA } from "./entregables";
import { esHabil } from "./servicios";

export type ClaveKpi = "CUMPLIMIENTO_FECHAS" | "AVANCE_VS_PLAN" | "REBOTES" | "TIEMPO_IMPLEMENTACION" | "REUNIONES_VS_OPTIMAS" | "RONDAS_PROPUESTA";
export type NivelKpi = "OK" | "ALERTA" | "CRITICO";
export interface Kpi {
  clave: ClaveKpi;
  etiqueta: string;
  valor: string;
  /** El número detrás del valor (para el Excel y para ordenar); null si todavía no aplica. */
  numero: number | null;
  detalle: string;
  nivel: NivelKpi;
}

export const META_IMPLEMENTACION_CRM = 10; // días hábiles (2 semanas)
export const RONDAS_ALERTA = 2;
export const RONDAS_CRITICAS = 4;
export const CAUSAS_ATRASO = ["CLIENTE", "INOO", "TERCERO"] as const;
export type CausaAtraso = (typeof CAUSAS_ATRASO)[number];
export const ETIQUETA_CAUSA: Record<CausaAtraso, string> = { CLIENTE: "Cliente", INOO: "Inoo", TERCERO: "Un tercero" };

export interface EtapaKpi {
  orden: number;
  nombre: string;
  avancePct: number;
  estado: string;
  fechaInicio: string | null;
  fechaEstimada: string | null;
  fechaFin: string | null;
  reunionClave: string | null;
}
export interface InsumosKpi {
  codigo: string;
  hoy: string;
  feriados?: ReadonlySet<string>;
  etapas: EtapaKpi[];
  reunionesRealizadas: number;
  entregables: { rebotes: number; etapaNombre: string | null; versionesEnviadas: number }[];
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
/** Días hábiles de `desde` a `hasta`, contando ambos. */
const diasHabilesEntre = (desde: string, hasta: string, feriados?: ReadonlySet<string>) =>
  hasta < desde ? 0 : diasAtraso(desde, hasta, feriados) + (esHabil(desde, feriados) ? 1 : 0);

export function cumplimientoFechas(etapas: EtapaKpi[]): Kpi {
  const hechas = etapas.filter((e) => e.estado === "COMPLETADO" && e.fechaFin && e.fechaEstimada);
  const aTiempo = hechas.filter((e) => e.fechaFin! <= e.fechaEstimada!).length;
  const p = pct(aTiempo, hechas.length);
  return {
    clave: "CUMPLIMIENTO_FECHAS", etiqueta: "Cumplimiento de fechas", numero: hechas.length ? p : null, valor: hechas.length ? `${p} %` : "—",
    detalle: hechas.length ? `${aTiempo} de ${hechas.length} etapas a tiempo` : "Todavía no hay etapas terminadas",
    nivel: !hechas.length || p >= 90 ? "OK" : p >= 70 ? "ALERTA" : "CRITICO",
  };
}

export function avanceVsPlan(etapas: EtapaKpi[], hoy: string): Kpi {
  const real = Math.max(0, ...etapas.filter((e) => e.estado === "COMPLETADO").map((e) => e.avancePct));
  const plan = Math.max(0, ...etapas.filter((e) => e.fechaEstimada && e.fechaEstimada < hoy.slice(0, 10)).map((e) => e.avancePct));
  const dif = real - plan;
  return {
    clave: "AVANCE_VS_PLAN", etiqueta: "Avance vs plan", numero: dif, valor: `${real} % / ${plan} %`,
    detalle: dif >= 0 ? "Al día con el cronograma" : `${-dif} puntos detrás del cronograma`,
    nivel: dif >= 0 ? "OK" : dif >= -15 ? "ALERTA" : "CRITICO",
  };
}

export function rebotes(entregables: InsumosKpi["entregables"]): Kpi {
  const total = entregables.reduce((t, e) => t + e.rebotes, 0);
  const max = Math.max(0, ...entregables.map((e) => e.rebotes));
  return {
    clave: "REBOTES", etiqueta: "Rebotes", numero: total, valor: String(total),
    detalle: total ? `El entregable con más cambios tuvo ${max}` : "Sin pedidos de cambio",
    nivel: max >= REBOTES_ALERTA ? "ALERTA" : "OK",
  };
}

/** CRM: días hábiles de la etapa de implementación (la 2.ª), hasta que termina o hasta hoy. */
export function tiempoImplementacion(etapas: EtapaKpi[], hoy: string, feriados?: ReadonlySet<string>): Kpi {
  const e = etapas.find((x) => x.orden === 2);
  const empezo = e?.fechaInicio && e.estado !== "SIN_INICIAR" ? e.fechaInicio : null;
  const dias = empezo ? diasHabilesEntre(empezo, e!.fechaFin ?? hoy.slice(0, 10), feriados) : null;
  return {
    clave: "TIEMPO_IMPLEMENTACION", etiqueta: "Tiempo de implementación", numero: dias, valor: dias === null ? "—" : `${dias} días`,
    detalle: `Meta: 2 semanas (${META_IMPLEMENTACION_CRM} días hábiles)${e?.fechaFin ? "" : dias !== null ? " · en curso" : ""}`,
    nivel: dias === null || dias <= META_IMPLEMENTACION_CRM ? "OK" : dias <= META_IMPLEMENTACION_CRM * 1.5 ? "ALERTA" : "CRITICO",
  };
}

/** Reuniones realizadas contra las óptimas; se esperan las de las etapas ya terminadas o en curso. */
export function reunionesVsOptimas(etapas: EtapaKpi[], realizadas: number): Kpi {
  const optimas = etapas.filter((e) => e.reunionClave).length;
  const esperadas = etapas.filter((e) => e.reunionClave && e.estado !== "SIN_INICIAR").length;
  return {
    clave: "REUNIONES_VS_OPTIMAS", etiqueta: "Reuniones vs óptimas", numero: realizadas, valor: `${realizadas} / ${optimas}`,
    detalle: `A la fecha se esperan ${esperadas}`,
    nivel: realizadas >= esperadas ? "OK" : "ALERTA",
  };
}

/** Branding: rondas de propuesta = versiones enviadas del entregable de propuestas o ajustes que más tuvo. */
export function rondasPropuesta(entregables: InsumosKpi["entregables"]): Kpi {
  const rondas = Math.max(0, ...entregables.filter((e) => /propuesta|ajuste/i.test(e.etapaNombre ?? "")).map((e) => e.versionesEnviadas));
  return {
    clave: "RONDAS_PROPUESTA", etiqueta: "Rondas de propuesta", numero: rondas, valor: String(rondas),
    detalle: `Alerta en la ${RONDAS_ALERTA}.ª ronda; crítica en la ${RONDAS_CRITICAS}.ª`,
    nivel: rondas >= RONDAS_CRITICAS ? "CRITICO" : rondas >= RONDAS_ALERTA ? "ALERTA" : "OK",
  };
}

/** Los KPIs que aplican al servicio, en orden. */
export function calcularKpis(x: InsumosKpi): Kpi[] {
  const ks = [cumplimientoFechas(x.etapas), avanceVsPlan(x.etapas, x.hoy), rebotes(x.entregables)];
  if (x.codigo === "CRM_IMPLEMENTACION" || x.codigo === "CRM_INTEGRACION") ks.push(tiempoImplementacion(x.etapas, x.hoy, x.feriados));
  if (x.etapas.some((e) => e.reunionClave)) ks.push(reunionesVsOptimas(x.etapas, x.reunionesRealizadas));
  if (x.codigo === "BRANDFORMANCE") ks.push(rondasPropuesta(x.entregables));
  return ks;
}

/** Nivel → color del semáforo que ya usa el portal. */
export const semaforoKpi = (n: NivelKpi): Semaforo => (n === "OK" ? "VERDE" : n === "ALERTA" ? "NARANJA" : "ROJO");

/** Valida la causa y la justificación de un atraso que carga el equipo. */
export function validarAtraso(b: { causaAtraso?: unknown; justificacionAtraso?: unknown }) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.causaAtraso !== undefined && b.causaAtraso !== null && !CAUSAS_ATRASO.includes(b.causaAtraso as CausaAtraso)) errores.push({ campo: "causaAtraso", mensaje: "Usa CLIENTE, INOO o TERCERO" });
  if (b.justificacionAtraso !== undefined && b.justificacionAtraso !== null && (typeof b.justificacionAtraso !== "string" || b.justificacionAtraso.length > 500)) {
    errores.push({ campo: "justificacionAtraso", mensaje: "Hasta 500 caracteres" });
  }
  return errores;
}
