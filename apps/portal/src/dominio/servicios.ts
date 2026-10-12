/**
 * Catálogo de servicios y plantillas de proyecto (reunión del 12 oct 2026), y las reglas que
 * comparten la API simulada, el backend real y las semillas: días hábiles, etapas desde una
 * plantilla y el % de avance.
 *
 * El catálogo y las plantillas también están en database/migraciones/0005_catalogo_servicios.sql;
 * tests/api/db.test.ts comprueba que ambos coinciden. Los nombres de etapas y sus días son de
 * relleno hasta que el equipo los defina.
 */
import type { components } from "../api/tipos-api";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
export type CodigoServicio = S<"CodigoServicio">;
export type EstadoEtapa = S<"EstadoHito">;
export type Metrica = S<"MetricaProyecto">;

export interface ServicioDeCatalogo {
  codigo: CodigoServicio;
  nombre: string;
  descripcion: string;
  modalidad: "MENSUAL" | "PROYECTO";
  unidad: string;
  variantes: { codigo: string; nombre: string }[];
}

export const CATALOGO_SERVICIOS: ServicioDeCatalogo[] = [
  { codigo: "SOCIAL_MEDIA_PRO", nombre: "Social Media Pro", descripcion: "Creación de contenido para tus redes sociales.", modalidad: "MENSUAL", unidad: "piezas", variantes: [] },
  {
    codigo: "BRANDFORMANCE", nombre: "Brandformance", descripcion: "Estrategia e identidad de una marca que convierte: logo, manual y posicionamiento.", modalidad: "PROYECTO", unidad: "entregas",
    variantes: [{ codigo: "MARCA_NUEVA", nombre: "Marca nueva" }, { codigo: "REBRANDING", nombre: "Rebranding" }],
  },
  { codigo: "PAID_MEDIA", nombre: "Paid Media", descripcion: "Gestión de tu pauta publicitaria.", modalidad: "MENSUAL", unidad: "campañas", variantes: [] },
  {
    codigo: "WEB", nombre: "Diseño y desarrollo web", descripcion: "Diseñamos y desarrollamos tu sitio, de la estructura a la publicación.", modalidad: "PROYECTO", unidad: "entregas",
    variantes: [
      { codigo: "LANDING", nombre: "Landing page" },
      { codigo: "INFORMATIVA", nombre: "Web informativa" },
      { codigo: "ECOMMERCE", nombre: "E-commerce" },
      { codigo: "CATALOGO", nombre: "Catálogo" },
      { codigo: "APLICATIVO", nombre: "Aplicativo web" },
    ],
  },
  { codigo: "CRM_IMPLEMENTACION", nombre: "Implementación de CRM", descripcion: "Levantamos tus procesos, implementamos el CRM y capacitamos a tu equipo.", modalidad: "PROYECTO", unidad: "entregas", variantes: [] },
  { codigo: "CRM_INTEGRACION", nombre: "Integración de CRM", descripcion: "Conectamos tu CRM con otras plataformas mediante APIs.", modalidad: "PROYECTO", unidad: "entregas", variantes: [] },
  {
    codigo: "AUDIOVISUAL", nombre: "Producción audiovisual", descripcion: "Fotografía y video para tu marca, en el nivel de producción que necesitas.", modalidad: "PROYECTO", unidad: "entregas",
    variantes: [
      { codigo: "FOTOGRAFIA", nombre: "Fotografía" },
      { codigo: "FOTO_VIDEO_CRUDO", nombre: "Fotografía y video en crudo" },
      { codigo: "PRODUCCION_POSTPRODUCCION", nombre: "Producción y postproducción" },
      { codigo: "COBERTURA_COMPLETA", nombre: "Preproducción, producción y postproducción" },
    ],
  },
  {
    codigo: "SOPORTE_CONTINUO", nombre: "Soporte continuo", descripcion: "Soporte mensual de tu CRM o tu web: tickets, tareas, sesiones y entregables.", modalidad: "MENSUAL", unidad: "entregas",
    variantes: [{ codigo: "CRM", nombre: "Soporte de CRM" }, { codigo: "WEB", nombre: "Soporte y administración web" }],
  },
];

export const servicioDeCatalogo = (codigo: string) => CATALOGO_SERVICIOS.find((s) => s.codigo === codigo);

/** [nombre, % acumulado al terminar, días hábiles, depende del cliente] */
type FilaEtapa = [string, number, number, boolean];
export interface PlantillaDemo {
  servicio: CodigoServicio;
  variante: string | null;
  nombre: string;
  metricas: Metrica[];
  etapas: FilaEtapa[];
}

const R: Metrica[] = ["REUNIONES_REALIZADAS", "REUNIONES_EXITOSAS", "DOCUMENTOS_A_TIEMPO"];
const W: Metrica[] = ["REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO", "REUNIONES_EXITOSAS"];
const AV: Metrica[] = ["REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO", "PIEZAS_APROBADAS"];

export const PLANTILLAS: PlantillaDemo[] = [
  { servicio: "SOCIAL_MEDIA_PRO", variante: null, nombre: "Social Media Pro · mes", metricas: ["PIEZAS_APROBADAS", "REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO"],
    etapas: [["Planificación del mes", 25, 3, false], ["Sesión de contenido", 50, 5, false], ["Producción y revisión", 80, 8, true], ["Publicación", 100, 6, false]] },
  { servicio: "PAID_MEDIA", variante: null, nombre: "Paid Media · mes", metricas: ["RESULTADOS_CAMPANA", "PIEZAS_APROBADAS", "REUNIONES_REALIZADAS"],
    etapas: [["Estrategia y presupuesto", 25, 3, true], ["Configuración de campañas", 50, 3, false], ["Campañas activas", 80, 12, false], ["Reporte del mes", 100, 2, false]] },
  { servicio: "SOPORTE_CONTINUO", variante: null, nombre: "Soporte continuo · mes", metricas: ["TICKETS_RESUELTOS", "REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO"],
    etapas: [["Plan de trabajo del mes", 20, 2, false], ["Atención de tickets y tareas", 70, 14, false], ["Sesión de seguimiento", 85, 2, false], ["Entregables e informe", 100, 2, false]] },
  { servicio: "BRANDFORMANCE", variante: "MARCA_NUEVA", nombre: "Brandformance · marca nueva", metricas: R,
    etapas: [["Diagnóstico y estrategia", 25, 8, true], ["Concepto e identidad visual", 60, 12, true], ["Manual de marca", 90, 8, true], ["Entrega final", 100, 2, false]] },
  { servicio: "BRANDFORMANCE", variante: "REBRANDING", nombre: "Brandformance · rebranding", metricas: R,
    etapas: [["Auditoría de la marca actual", 20, 6, true], ["Estrategia de reposicionamiento", 40, 6, true], ["Nueva identidad visual", 70, 12, true], ["Manual de marca", 90, 6, true], ["Entrega y transición", 100, 3, false]] },
  { servicio: "WEB", variante: "LANDING", nombre: "Web · landing page", metricas: W,
    etapas: [["Brief y estructura", 15, 3, true], ["Diseño", 45, 5, true], ["Desarrollo", 80, 6, false], ["Revisión y publicación", 100, 3, true]] },
  { servicio: "WEB", variante: "INFORMATIVA", nombre: "Web · informativa", metricas: W,
    etapas: [["Brief y arquitectura de contenidos", 15, 5, true], ["Diseño", 40, 10, true], ["Desarrollo", 75, 12, false], ["Carga de contenidos", 90, 5, true], ["Revisión y publicación", 100, 3, true]] },
  { servicio: "WEB", variante: "ECOMMERCE", nombre: "Web · e-commerce", metricas: W,
    etapas: [["Brief y arquitectura de la tienda", 10, 5, true], ["Diseño", 30, 12, true], ["Desarrollo de la tienda", 60, 20, false], ["Carga de productos y pasarela de pago", 80, 8, true], ["Pruebas de compra", 90, 4, false], ["Lanzamiento", 100, 2, true]] },
  { servicio: "WEB", variante: "CATALOGO", nombre: "Web · catálogo", metricas: W,
    etapas: [["Brief y estructura del catálogo", 15, 4, true], ["Diseño", 40, 8, true], ["Desarrollo", 70, 12, false], ["Carga de productos", 90, 6, true], ["Revisión y publicación", 100, 3, true]] },
  { servicio: "WEB", variante: "APLICATIVO", nombre: "Web · aplicativo", metricas: R,
    etapas: [["Levantamiento de requerimientos", 15, 10, true], ["Prototipo", 35, 12, true], ["Desarrollo", 75, 30, false], ["Pruebas y ajustes", 90, 10, true], ["Lanzamiento", 100, 3, false]] },
  // Tres etapas; la tercera son dos capacitaciones (20 → 60 → 80 → 100).
  { servicio: "CRM_IMPLEMENTACION", variante: null, nombre: "Implementación de CRM", metricas: R,
    etapas: [["Levantamiento de información", 20, 10, true], ["Procesos e implementación", 60, 20, false], ["Capacitación 1", 80, 3, true], ["Capacitación 2", 100, 3, true]] },
  { servicio: "CRM_INTEGRACION", variante: null, nombre: "Integración de CRM", metricas: W,
    etapas: [["Análisis de plataformas y accesos", 20, 5, true], ["Desarrollo de la integración", 60, 15, false], ["Pruebas", 85, 5, true], ["Puesta en marcha", 100, 2, false]] },
  { servicio: "AUDIOVISUAL", variante: "FOTOGRAFIA", nombre: "Audiovisual · fotografía", metricas: AV,
    etapas: [["Coordinación de la sesión", 30, 3, true], ["Sesión de fotos", 70, 1, false], ["Selección y retoque", 100, 5, true]] },
  { servicio: "AUDIOVISUAL", variante: "FOTO_VIDEO_CRUDO", nombre: "Audiovisual · foto y video en crudo", metricas: AV,
    etapas: [["Coordinación del rodaje", 30, 3, true], ["Rodaje", 80, 2, false], ["Entrega del material", 100, 2, false]] },
  { servicio: "AUDIOVISUAL", variante: "PRODUCCION_POSTPRODUCCION", nombre: "Audiovisual · producción y postproducción", metricas: AV,
    etapas: [["Coordinación del rodaje", 20, 3, true], ["Rodaje", 50, 2, false], ["Edición y postproducción", 85, 8, true], ["Entrega final", 100, 2, false]] },
  { servicio: "AUDIOVISUAL", variante: "COBERTURA_COMPLETA", nombre: "Audiovisual · cobertura completa", metricas: AV,
    etapas: [["Idea y guion", 20, 5, true], ["Plan de rodaje", 35, 3, true], ["Rodaje", 60, 3, false], ["Edición y postproducción", 90, 10, true], ["Entrega final", 100, 2, false]] },
];

/** La plantilla de la variante; si no hay, la general del servicio. */
export const plantillaPara = (servicio: string, variante: string | null | undefined) =>
  PLANTILLAS.find((p) => p.servicio === servicio && p.variante === (variante ?? null)) ?? PLANTILLAS.find((p) => p.servicio === servicio && p.variante === null);

// ───────────────────────────── validación de lo que se contrata

export function validarContratacion(b: { servicioCodigo?: unknown; variante?: unknown; detalle?: unknown; fechaInicio?: unknown; fechaFin?: unknown }) {
  const errores: { campo: string; mensaje: string }[] = [];
  const cat = typeof b.servicioCodigo === "string" ? servicioDeCatalogo(b.servicioCodigo) : undefined;
  if (!cat) errores.push({ campo: "servicioCodigo", mensaje: "Ese servicio no está en el catálogo" });
  if (cat && cat.variantes.length && !cat.variantes.some((v) => v.codigo === b.variante)) {
    errores.push({ campo: "variante", mensaje: `Elige una variante: ${cat.variantes.map((v) => v.nombre).join(", ")}` });
  }
  if (cat && !cat.variantes.length && b.variante != null) errores.push({ campo: "variante", mensaje: `${cat.nombre} no tiene variantes` });
  if (b.detalle != null && (typeof b.detalle !== "object" || Array.isArray(b.detalle))) errores.push({ campo: "detalle", mensaje: "El detalle debe ser un objeto" });
  const d = (b.detalle ?? {}) as Record<string, unknown>;
  for (const k of ["licencias", "usuarios"]) {
    if (d[k] !== undefined && !(Number.isInteger(d[k]) && (d[k] as number) >= 0)) errores.push({ campo: `detalle.${k}`, mensaje: "Debe ser un número entero" });
  }
  if (typeof b.fechaInicio !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.fechaInicio)) errores.push({ campo: "fechaInicio", mensaje: "Indica la fecha de inicio (AAAA-MM-DD)" });
  if (typeof b.fechaFin === "string" && typeof b.fechaInicio === "string" && b.fechaFin < b.fechaInicio) errores.push({ campo: "fechaFin", mensaje: "La fecha de fin es anterior al inicio" });
  return { cat, errores };
}

export const tituloServicio = (nombre: string, marca: string) => `${nombre} - ${marca}`;

// ───────────────────────────── días hábiles (America/Lima)

const aDia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);
export const esHabil = (iso: string, feriados: ReadonlySet<string> = new Set()) => {
  const dia = aDia(iso).getUTCDay();
  return dia !== 0 && dia !== 6 && !feriados.has(iso.slice(0, 10));
};

/** El día hábil `dias` después de `desde` (0 = el mismo día si es hábil, o el siguiente hábil). */
export function sumarDiasHabiles(desde: string, dias: number, feriados: ReadonlySet<string> = new Set()): string {
  const d = aDia(desde);
  while (!esHabil(aIso(d), feriados)) d.setUTCDate(d.getUTCDate() + 1);
  let n = dias;
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (esHabil(aIso(d), feriados)) n--;
  }
  return aIso(d);
}

// ───────────────────────────── etapas y avance

export interface EtapaCalculada {
  orden: number;
  nombre: string;
  avancePct: number;
  esperaCliente: boolean;
  fechaInicio: string;
  fechaEstimada: string;
}

/** Copia las etapas de la plantilla con fechas encadenadas: cada una empieza el día hábil siguiente al fin de la anterior. */
export function etapasDesdePlantilla(p: PlantillaDemo, fechaInicio: string, feriados: ReadonlySet<string> = new Set()): EtapaCalculada[] {
  let inicio = sumarDiasHabiles(fechaInicio, 0, feriados);
  return p.etapas.map(([nombre, avancePct, dias, esperaCliente], i) => {
    const fin = sumarDiasHabiles(inicio, Math.max(dias - 1, 0), feriados);
    const e = { orden: i + 1, nombre, avancePct, esperaCliente, fechaInicio: inicio, fechaEstimada: fin };
    inicio = sumarDiasHabiles(fin, 1, feriados);
    return e;
  });
}

export interface EtapaParaAvance {
  orden: number;
  nombre: string;
  avancePct: number;
  estado: EstadoEtapa;
  fechaEstimada?: string | null;
}

export const etapaAtrasada = (e: { estado: EstadoEtapa; fechaEstimada?: string | null }, hoy: string) =>
  e.estado !== "COMPLETADO" && !!e.fechaEstimada && e.fechaEstimada < hoy.slice(0, 10);

/** % = avancePct de la última etapa completada en orden (una completada después de un hueco no cuenta). */
export function calcularAvance(etapas: EtapaParaAvance[], hoy: string, periodo: string | null = null): S<"AvanceProyecto"> {
  const orden = [...etapas].sort((a, b) => a.orden - b.orden);
  let porcentaje = 0;
  let completadas = 0;
  for (const e of orden) {
    if (e.estado !== "COMPLETADO") break;
    porcentaje = e.avancePct;
    completadas++;
  }
  const actual = orden[completadas];
  return {
    porcentaje,
    etapaActual: actual
      ? { orden: actual.orden, nombre: actual.nombre, estado: actual.estado, fechaEstimada: actual.fechaEstimada ?? null, atrasada: etapaAtrasada(actual, hoy) }
      : null,
    totalEtapas: orden.length,
    etapasCompletadas: completadas,
    periodo,
  };
}

/** Reglas al mover una etapa: completar exige la anterior completa; devuelve el código de error o null. */
export function errorAlMoverEtapa(etapas: { orden: number; estado: EstadoEtapa }[], orden: number, nuevo: EstadoEtapa): string | null {
  if (nuevo !== "COMPLETADO") return null;
  const previa = etapas.find((e) => e.orden === orden - 1);
  return previa && previa.estado !== "COMPLETADO" ? "ETAPA_ANTERIOR_PENDIENTE" : null;
}

// ───────────────────────────── métricas del perfil del proyecto

export interface InsumosMetricas {
  reuniones: { estado: "PROGRAMADA" | "REALIZADA" | "CANCELADA"; conAcuerdos: boolean | null }[];
  /** Todas las etapas del proyecto (en servicios mensuales, las de todos los meses). */
  etapas: { estado: EstadoEtapa; fechaFin: string | null; fechaEstimada: string | null }[];
  progreso: S<"ProgresoPiezas"> | null;
  ticketsResueltos: number;
}

/** Valores de las métricas que pide la plantilla, ya formateados (reunión 12 oct: reuniones, éxito y entregas a tiempo). */
export function calcularMetricas(claves: Metrica[], x: InsumosMetricas): S<"MetricaValor">[] {
  const realizadas = x.reuniones.filter((r) => r.estado === "REALIZADA");
  const programadas = x.reuniones.filter((r) => r.estado === "PROGRAMADA").length;
  const cerradas = x.etapas.filter((e) => e.estado === "COMPLETADO" && e.fechaFin);
  const aTiempo = cerradas.filter((e) => !e.fechaEstimada || e.fechaFin! <= e.fechaEstimada).length;
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
  return claves.map((clave): S<"MetricaValor"> => {
    switch (clave) {
      case "REUNIONES_REALIZADAS":
        return { clave, etiqueta: "Reuniones realizadas", valor: String(realizadas.length), detalle: programadas ? plural(programadas, "programada", "programadas") : "Ninguna programada", alerta: false };
      case "REUNIONES_EXITOSAS":
        return { clave, etiqueta: "Reuniones con acuerdos", valor: realizadas.length ? `${realizadas.filter((r) => r.conAcuerdos).length} de ${realizadas.length}` : "—", detalle: "Terminaron con acuerdos claros", alerta: false };
      case "DOCUMENTOS_A_TIEMPO":
        return {
          clave, etiqueta: "Entregas a tiempo", valor: cerradas.length ? `${aTiempo} de ${cerradas.length}` : "—",
          detalle: cerradas.length === 0 ? "Aún no cerramos etapas" : aTiempo === cerradas.length ? "Sin retrasos" : plural(cerradas.length - aTiempo, "entrega con retraso", "entregas con retraso"),
          alerta: aTiempo < cerradas.length,
        };
      case "PIEZAS_APROBADAS":
        return { clave, etiqueta: "Piezas aprobadas", valor: x.progreso ? `${x.progreso.aprobadas} de ${x.progreso.totales}` : "—", detalle: x.progreso ? `${x.progreso.porRevisar} por revisar` : null, alerta: false };
      case "TICKETS_RESUELTOS":
        return { clave, etiqueta: "Tickets resueltos", valor: String(x.ticketsResueltos), detalle: "Este mes", alerta: false };
      case "RESULTADOS_CAMPANA":
        return { clave, etiqueta: "Resultados", valor: "—", detalle: "En el informe del mes", alerta: false };
    }
  });
}
