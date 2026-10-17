/**
 * Reporte del proyecto en Excel (reunión del 15 oct 2026). Lo baja el equipo desde la página del
 * proyecto: resumen con los KPIs, etapas con sus atrasos y la causa, entregables con sus rebotes y lo
 * que se le pidió al cliente. Se arma igual en la API simulada y en el backend real.
 */
import type { components } from "../api/tipos-api";
import { ETIQUETA_CAUSA, type CausaAtraso, type Kpi } from "./kpis";
import type { Hoja } from "./xlsx";

type S<K extends keyof components["schemas"]> = components["schemas"][K];

const ESTADO_ETAPA: Record<string, string> = { SIN_INICIAR: "Sin iniciar", EN_PROGRESO: "En curso", EN_REVISION: "En revisión", BLOQUEADO: "Bloqueada", COMPLETADO: "Completada" };
const ESTADO_ENTREGABLE: Record<string, string> = { EN_PREPARACION: "En preparación", LISTO_REVISION: "Por revisar", CAMBIOS_SOLICITADOS: "Cambios solicitados", APROBADO: "Aprobado" };
const ESTADO_REQ: Record<string, string> = { PENDIENTE: "Pendiente", ENVIADO: "Enviado", OBSERVADO: "Observado", APROBADO: "Aprobado" };
const NIVEL: Record<string, string> = { OK: "En orden", ALERTA: "Alerta", CRITICO: "Crítico" };

/** Nombre de archivo sin tildes ni espacios: «reporte-diseno-y-desarrollo-web-casa-oliva.xlsx». */
export const archivoReporte = (titulo: string) =>
  `reporte-${titulo.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.xlsx`;

export function hojasReporte(p: S<"PerfilProyecto">, clienteNombre: string, kpis: Kpi[], requerimientos: S<"Requerimiento">[], generado: string): Hoja[] {
  const resumen: Hoja = {
    nombre: "Resumen",
    anchos: [28, 40, 40, 12],
    filas: [
      ["Reporte del proyecto"],
      ["Proyecto", p.titulo],
      ["Cliente", clienteNombre],
      ["Servicio", [p.nombre, p.variante?.nombre].filter(Boolean).join(" · ")],
      ["Responsable", p.responsable?.nombre ?? "Sin asignar"],
      ["Inicio", p.fechaInicio ?? ""],
      ["Fin previsto", p.fechaFin ?? ""],
      ["Avance (%)", p.avance.porcentaje],
      ["Etapa actual", p.avance.etapaActual?.nombre ?? "—"],
      ["Alcance", p.alcance ?? ""],
      ["Generado", generado],
      [],
      ["KPI", "Valor", "Detalle", "Nivel"],
      ...kpis.map((k) => [k.etiqueta, k.valor, k.detalle, NIVEL[k.nivel]]),
    ],
  };
  const etapas: Hoja = {
    nombre: "Etapas",
    anchos: [34, 10, 14, 12, 12, 12, 30, 10, 14, 14, 40],
    filas: [
      ["Etapa", "% acumulado", "Estado", "Inicio", "Fin previsto", "Terminó", "Reunión clave", "Atrasada", "Causa del atraso", "Días corridos por el cliente", "Justificación"],
      ...p.etapas.map((e) => [
        e.nombre, e.avancePct, ESTADO_ETAPA[e.estado] ?? e.estado, e.fechaInicio, e.fechaEstimada, e.fechaFin, e.reunionClave ?? "", e.atrasada ? "Sí" : "No",
        e.causaAtraso ? ETIQUETA_CAUSA[e.causaAtraso as CausaAtraso] : "", e.diasCorridosCliente ?? 0, e.justificacionAtraso ?? "",
      ]),
    ],
  };
  const entregables: Hoja = {
    nombre: "Entregables",
    anchos: [40, 28, 20, 10, 10, 14],
    filas: [
      ["Entregable", "Etapa", "Estado", "Versión", "Rebotes", "Aprobado"],
      ...(p.entregables ?? []).map((e) => [e.titulo, e.etapaNombre ?? "", ESTADO_ENTREGABLE[e.estado] ?? e.estado, e.version, e.rebotes ?? 0, e.aprobadoEn?.slice(0, 10) ?? ""]),
    ],
  };
  const reqs: Hoja = {
    nombre: "Requerimientos",
    anchos: [40, 14, 14, 12, 14],
    filas: [
      ["Requerimiento", "Estado", "Fecha límite", "Días de atraso", "Enviado"],
      ...requerimientos.map((r) => [r.titulo, ESTADO_REQ[r.estado] ?? r.estado, r.fechaLimite, r.diasAtraso, r.enviadoEn?.slice(0, 10) ?? ""]),
    ],
  };
  return [resumen, etapas, entregables, reqs];
}
