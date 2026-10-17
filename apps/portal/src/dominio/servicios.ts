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
import { validarBolsa } from "./consumo";

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

/** [nombre, % acumulado al terminar, días hábiles, depende del cliente, reunión clave de la etapa] */
export type FilaEtapa = [string, number, number, boolean, string | null];
export interface PlantillaDemo {
  servicio: CodigoServicio;
  variante: string | null;
  nombre: string;
  metricas: Metrica[];
  etapas: FilaEtapa[];
  /** Requerimientos que se le piden al cliente al crear el proyecto (reunión 15 oct: «todo al inicio»). */
  requerimientos: string[];
}

const R: Metrica[] = ["REUNIONES_REALIZADAS", "REUNIONES_EXITOSAS", "DOCUMENTOS_A_TIEMPO"];
const W: Metrica[] = ["REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO", "REUNIONES_EXITOSAS"];
const AV: Metrica[] = ["REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO", "PIEZAS_APROBADAS"];

// Etapas según los instructivos de proceso (Web, Branding y Marketing, 15 oct 2026). La reunión clave es la
// que cierra cada etapa con un objetivo y un resumen. Los días hábiles son de relleno hasta que cada área
// los confirme (decisión C del roadmap).
const BRIEF_WEB: FilaEtapa = ["Brief y kickoff", 0, 0, true, "Reunión de brief"];
const web = (brief: number, arquitectura: number, accesos: number, prototipo: number, resto: FilaEtapa[]): FilaEtapa[] => [
  [BRIEF_WEB[0], brief, 3, true, BRIEF_WEB[4]],
  ["Arquitectura y benchmark", arquitectura, 5, true, "Aprobación del flujograma"],
  ["Accesos y hosting", accesos, 2, true, null],
  ["Prototipo", prototipo, 10, true, "Presentación del prototipo"],
  ...resto,
];
const REQ_WEB = ["BRIEF_WEB", "ACCESOS_WEB", "MANUAL_MARCA"];

export const PLANTILLAS: PlantillaDemo[] = [
  { servicio: "SOCIAL_MEDIA_PRO", variante: null, nombre: "Social Media Pro · mes", metricas: ["PIEZAS_APROBADAS", "REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO"],
    etapas: [["Planificación del mes", 25, 3, false, "Reunión de estrategia y planning"], ["Sesión de contenido", 50, 5, false, "Sesión audiovisual"], ["Producción y revisión", 80, 8, true, "Presentación de piezas"], ["Publicación", 100, 6, false, "Reunión de métricas"]],
    requerimientos: ["BRIEF_SOCIAL", "ACCESOS_REDES", "MANUAL_MARCA"] },
  { servicio: "PAID_MEDIA", variante: null, nombre: "Paid Media · mes", metricas: ["RESULTADOS_CAMPANA", "PIEZAS_APROBADAS", "REUNIONES_REALIZADAS"],
    etapas: [["Estrategia y presupuesto", 25, 3, true, "Reunión de estrategia"], ["Configuración de campañas", 50, 3, false, null], ["Campañas activas", 80, 12, false, null], ["Reporte del mes", 100, 2, false, "Reunión de resultados"]],
    requerimientos: ["ACCESOS_REDES"] },
  // Soporte por consumo (fase 15): sin etapas; se mide con la bolsa del mes (src/dominio/consumo.ts).
  { servicio: "SOPORTE_CONTINUO", variante: null, nombre: "Soporte continuo · mes", metricas: ["TICKETS_RESUELTOS", "REUNIONES_REALIZADAS", "DOCUMENTOS_A_TIEMPO"],
    etapas: [],
    requerimientos: [] },
  // Branding: tres reuniones obligatorias (brief, propuestas, presentación final) y los ajustes entre medio.
  { servicio: "BRANDFORMANCE", variante: "MARCA_NUEVA", nombre: "Brandformance · marca nueva", metricas: R,
    etapas: [["Brief", 15, 3, true, "Reunión de brief"], ["Propuestas", 55, 6, false, "Presentación de propuestas"], ["Ajustes", 80, 2, true, null], ["Entrega final", 100, 3, false, "Presentación final"]],
    requerimientos: ["BRIEF_BRANDING"] },
  { servicio: "BRANDFORMANCE", variante: "REBRANDING", nombre: "Brandformance · rebranding", metricas: R,
    etapas: [["Brief y auditoría de la marca actual", 15, 4, true, "Reunión de brief"], ["Estrategia de reposicionamiento", 30, 4, false, null], ["Propuestas", 60, 6, false, "Presentación de propuestas"], ["Ajustes", 80, 2, true, null], ["Entrega final", 100, 3, false, "Presentación final"]],
    requerimientos: ["BRIEF_BRANDING", "MANUAL_MARCA"] },
  // Web: brief → arquitectura y benchmark (primer entregable que aprueba el cliente) → accesos → prototipo → implementación → presentación → entrega.
  { servicio: "WEB", variante: "LANDING", nombre: "Web · landing page", metricas: W,
    etapas: web(10, 25, 30, 55, [["Implementación", 90, 5, false, null], ["Presentación y entrega", 100, 2, true, "Presentación final"]]),
    requerimientos: REQ_WEB },
  { servicio: "WEB", variante: "INFORMATIVA", nombre: "Web · informativa", metricas: W,
    etapas: web(10, 20, 25, 50, [["Implementación", 80, 15, false, null], ["Presentación y capacitación", 95, 2, true, "Presentación final"], ["Entrega", 100, 1, false, null]]),
    requerimientos: REQ_WEB },
  { servicio: "WEB", variante: "ECOMMERCE", nombre: "Web · e-commerce", metricas: W,
    etapas: web(5, 15, 20, 40, [["Implementación de la tienda", 70, 20, false, null], ["Carga de productos y pasarela de pago", 85, 8, true, null], ["Presentación y capacitación", 95, 2, true, "Presentación final"], ["Entrega", 100, 1, false, null]]),
    requerimientos: [...REQ_WEB, "CATALOGO_PRODUCTOS"] },
  { servicio: "WEB", variante: "CATALOGO", nombre: "Web · catálogo", metricas: W,
    etapas: web(5, 15, 20, 40, [["Implementación", 70, 12, false, null], ["Carga de productos", 85, 6, true, null], ["Presentación y capacitación", 95, 2, true, "Presentación final"], ["Entrega", 100, 1, false, null]]),
    requerimientos: [...REQ_WEB, "CATALOGO_PRODUCTOS"] },
  { servicio: "WEB", variante: "APLICATIVO", nombre: "Web · aplicativo", metricas: R,
    etapas: [["Levantamiento de requerimientos", 15, 10, true, "Reunión de levantamiento"], ["Prototipo", 35, 12, true, "Presentación del prototipo"], ["Desarrollo", 75, 30, false, null], ["Pruebas y ajustes", 90, 10, true, "Revisión de la versión beta"], ["Lanzamiento", 100, 3, false, "Presentación final"]],
    requerimientos: ["BRIEF_WEB", "ACCESOS_WEB"] },
  // CRM: 20 → 60 → 80 → 100 (reunión 12 oct). Las 4 reuniones óptimas de la reunión del 15 oct.
  { servicio: "CRM_IMPLEMENTACION", variante: null, nombre: "Implementación de CRM", metricas: R,
    etapas: [["Levantamiento de información", 20, 10, true, "Reunión de levantamiento"], ["Procesos e implementación", 60, 20, false, "Aprobación de la arquitectura"], ["Capacitación 1", 80, 3, true, "Implementación beta"], ["Capacitación 2", 100, 3, true, "Capacitación"]],
    requerimientos: ["KICKOFF_CRM", "USUARIOS_CRM"] },
  { servicio: "CRM_INTEGRACION", variante: null, nombre: "Integración de CRM", metricas: W,
    etapas: [["Análisis de plataformas y accesos", 20, 5, true, "Reunión de levantamiento"], ["Desarrollo de la integración", 60, 15, false, null], ["Pruebas", 85, 5, true, "Revisión de la integración"], ["Puesta en marcha", 100, 2, false, "Puesta en marcha"]],
    requerimientos: ["KICKOFF_CRM", "USUARIOS_CRM"] },
  { servicio: "AUDIOVISUAL", variante: "FOTOGRAFIA", nombre: "Audiovisual · fotografía", metricas: AV,
    etapas: [["Coordinación de la sesión", 30, 3, true, "Reunión de coordinación"], ["Sesión de fotos", 70, 1, false, null], ["Selección y retoque", 100, 5, true, null]],
    requerimientos: [] },
  { servicio: "AUDIOVISUAL", variante: "FOTO_VIDEO_CRUDO", nombre: "Audiovisual · foto y video en crudo", metricas: AV,
    etapas: [["Coordinación del rodaje", 30, 3, true, "Reunión de coordinación"], ["Rodaje", 80, 2, false, null], ["Entrega del material", 100, 2, false, null]],
    requerimientos: [] },
  { servicio: "AUDIOVISUAL", variante: "PRODUCCION_POSTPRODUCCION", nombre: "Audiovisual · producción y postproducción", metricas: AV,
    etapas: [["Coordinación del rodaje", 20, 3, true, "Reunión de coordinación"], ["Rodaje", 50, 2, false, null], ["Edición y postproducción", 85, 8, true, null], ["Entrega final", 100, 2, false, null]],
    requerimientos: [] },
  { servicio: "AUDIOVISUAL", variante: "COBERTURA_COMPLETA", nombre: "Audiovisual · cobertura completa", metricas: AV,
    etapas: [["Idea y guion", 20, 5, true, "Reunión de idea y guion"], ["Plan de rodaje", 35, 3, true, null], ["Rodaje", 60, 3, false, null], ["Edición y postproducción", 90, 10, true, null], ["Entrega final", 100, 2, false, null]],
    requerimientos: [] },
];

/** Reuniones óptimas de un proyecto: una por etapa con reunión clave (KPI de la reunión 15 oct). */
export const reunionesOptimas = (p: PlantillaDemo) => p.etapas.filter((e) => e[4]).length;

/**
 * Tamaño del proyecto (reunión 15 oct: «e-commerce mediano con 15 páginas y 50 productos»). Escala los
 * días de las etapas. Los factores son de relleno hasta que cada área defina sus tamaños (decisión C).
 */
export const TAMANOS = { CHICO: 0.75, MEDIANO: 1, GRANDE: 1.4 } as const;
export type Tamano = keyof typeof TAMANOS;

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
  else errores.push(...validarDetalle(b.detalle ?? {}));
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
  reunionClave: string | null;
  fechaInicio: string;
  fechaEstimada: string;
}

/**
 * Copia las etapas de la plantilla (o las de un proyecto personalizado) con fechas encadenadas: cada una
 * empieza el día hábil siguiente al fin de la anterior. El tamaño escala los días de cada etapa.
 */
export function etapasDesdePlantilla(
  p: Pick<PlantillaDemo, "etapas">,
  fechaInicio: string,
  feriados: ReadonlySet<string> = new Set(),
  tamano: Tamano = "MEDIANO",
): EtapaCalculada[] {
  let inicio = sumarDiasHabiles(fechaInicio, 0, feriados);
  return p.etapas.map(([nombre, avancePct, diasBase, esperaCliente, reunionClave], i) => {
    const dias = Math.max(1, Math.round(diasBase * TAMANOS[tamano]));
    const fin = sumarDiasHabiles(inicio, Math.max(dias - 1, 0), feriados);
    const e = { orden: i + 1, nombre, avancePct, esperaCliente, reunionClave: reunionClave ?? null, fechaInicio: inicio, fechaEstimada: fin };
    inicio = sumarDiasHabiles(fin, 1, feriados);
    return e;
  });
}

/** Etapas de un proyecto personalizado: nombres, % acumulado creciente que termina en 100 y días hábiles. */
export function validarEtapasPersonalizadas(xs: unknown): { etapas: FilaEtapa[]; errores: { campo: string; mensaje: string }[] } {
  const errores: { campo: string; mensaje: string }[] = [];
  if (!Array.isArray(xs) || xs.length < 1 || xs.length > 15) return { etapas: [], errores: [{ campo: "etapas", mensaje: "Agrega entre 1 y 15 etapas" }] };
  const etapas: FilaEtapa[] = [];
  let anterior = 0;
  xs.forEach((x: Record<string, unknown>, i) => {
    const nombre = typeof x?.nombre === "string" ? x.nombre.trim() : "";
    const pct = x?.avancePct;
    const dias = x?.diasHabiles;
    if (nombre.length < 3) errores.push({ campo: `etapas.${i}.nombre`, mensaje: "Ponle nombre a la etapa" });
    if (!(Number.isInteger(pct) && (pct as number) > anterior && (pct as number) <= 100)) errores.push({ campo: `etapas.${i}.avancePct`, mensaje: "El % acumulado debe crecer etapa a etapa" });
    if (!(Number.isInteger(dias) && (dias as number) >= 1 && (dias as number) <= 120)) errores.push({ campo: `etapas.${i}.diasHabiles`, mensaje: "Entre 1 y 120 días hábiles" });
    if (Number.isInteger(pct)) anterior = pct as number;
    etapas.push([nombre, pct as number, dias as number, x?.esperaCliente === true, typeof x?.reunionClave === "string" && x.reunionClave.trim() ? x.reunionClave.trim() : null]);
  });
  if (!errores.length && etapas[etapas.length - 1][1] !== 100) errores.push({ campo: "etapas", mensaje: "La última etapa debe llegar al 100 %" });
  return { etapas, errores };
}

const CMS = ["WORDPRESS", "SHOPIFY", "CODIGO"];
const ALCANCES_WEB = ["SOLO_WEB", "WEB_Y_CMS"];

/**
 * Datos propios del servicio (reunión 15 oct). Web: tamaño, páginas, productos, CMS y si incluye el panel
 * de administración. CRM: licencias, usuarios, agente de IA y WhatsApp API.
 */
export function validarDetalle(d: unknown): { campo: string; mensaje: string }[] {
  if (typeof d !== "object" || d === null || Array.isArray(d)) return [{ campo: "detalle", mensaje: "El detalle debe ser un objeto" }];
  const x = d as Record<string, unknown>;
  const errores: { campo: string; mensaje: string }[] = [];
  for (const k of ["licencias", "usuarios", "paginas", "productos"]) {
    if (x[k] !== undefined && !(Number.isInteger(x[k]) && (x[k] as number) >= 0)) errores.push({ campo: `detalle.${k}`, mensaje: "Debe ser un número entero" });
  }
  if (x.tamano !== undefined && !(typeof x.tamano === "string" && x.tamano in TAMANOS)) errores.push({ campo: "detalle.tamano", mensaje: "Usa CHICO, MEDIANO o GRANDE" });
  if (x.cms !== undefined && !CMS.includes(x.cms as string)) errores.push({ campo: "detalle.cms", mensaje: "Usa WORDPRESS, SHOPIFY o CODIGO" });
  if (x.alcanceWeb !== undefined && !ALCANCES_WEB.includes(x.alcanceWeb as string)) errores.push({ campo: "detalle.alcanceWeb", mensaje: "Usa SOLO_WEB o WEB_Y_CMS" });
  for (const k of ["agenteIa", "whatsappApi"]) if (x[k] !== undefined && typeof x[k] !== "boolean") errores.push({ campo: `detalle.${k}`, mensaje: "Sí o no" });
  if (x.bolsa !== undefined) errores.push(...validarBolsa(x.bolsa));
  return errores;
}

/** El tamaño guardado en el detalle; MEDIANO si no se indicó. */
export const tamanoDe = (detalle: unknown): Tamano => {
  const t = (detalle as { tamano?: unknown } | null)?.tamano;
  return typeof t === "string" && t in TAMANOS ? (t as Tamano) : "MEDIANO";
};

/**
 * Etapas con que nace un proyecto: las personalizadas (si las hay, ya validadas) o las de la plantilla
 * escaladas por el tamaño del detalle.
 */
export function etapasDelProyectoNuevo(plantilla: Pick<PlantillaDemo, "etapas">, personalizadas: FilaEtapa[] | null, inicio: string, feriados: ReadonlySet<string>, detalle: unknown) {
  return personalizadas ? etapasDesdePlantilla({ etapas: personalizadas }, inicio, feriados) : etapasDesdePlantilla(plantilla, inicio, feriados, tamanoDe(detalle));
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
