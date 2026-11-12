/**
 * Taller web (fase 19): el flujo web con IA que usa el equipo en un proyecto de Diseño y desarrollo web.
 *
 *  1. Benchmark: capturas de los sitios de referencia (escritorio y móvil) y un puntaje de 1 a 5 por
 *     dimensión, con hallazgos y recomendaciones, como el benchmark de Instituto Palestra.
 *  2. Flujograma en dos versiones: de navegación (páginas por nivel) y estructural (secciones de cada página).
 *     Benchmark + flujograma salen en un PDF que es el primer entregable que aprueba el cliente (reunión 15 oct).
 *  3. Prototipo: pantallas en Stitch a partir del flujograma aprobado. El paso a Figma lo hace una persona.
 *  4. Demo: HTML navegable en un link que vence, sin indexar, con límite de solicitudes y vistas contadas.
 *     El cliente solo ve la demo, no la maqueta (decisión del 10 oct).
 *
 * La IA es invisible para el cliente: el taller es solo del equipo, el PDF y la demo no llevan rastros
 * (limpiarHtml) y lo que se le envía es un entregable más del proyecto. Lo comparten la API simulada y el
 * backend real; no usa nada de Node, porque la vista previa estática corre la API simulada en el navegador.
 */

// ───────────────────────────── dimensiones del benchmark

import { ESQUEMA_MARCAS, REGLA_MARCAS, type Especificaciones, type Estrategia, type MarcaCaptura, mensajeWhatsappEjemplo, normalizarMarcas, textoEspecificaciones } from "./taller-fases";

export type Dimension =
  | "IDENTIDAD_VISUAL" | "JERARQUIA_VISUAL" | "USABILIDAD_MOVIL" | "ARQUITECTURA_INFORMACION"
  | "PROPUESTA_VALOR" | "FICHA_PRODUCTO" | "FLUJO_COMPRA" | "CONVERSION";

export const DIMENSIONES: Record<Dimension, { nombre: string; pregunta: string }> = {
  IDENTIDAD_VISUAL: { nombre: "Identidad visual", pregunta: "¿Logo, color y tipografía forman un sistema coherente y memorable?" },
  JERARQUIA_VISUAL: { nombre: "Jerarquía visual", pregunta: "¿Se entiende de un vistazo qué es lo importante? ¿Se escanea fácil?" },
  USABILIDAD_MOVIL: { nombre: "Usabilidad móvil", pregunta: "¿En el celular se lee, se toca y se navega sin esfuerzo?" },
  ARQUITECTURA_INFORMACION: { nombre: "Arquitectura de información", pregunta: "¿El menú es claro y está bien segmentado? ¿Se encuentra lo que se busca?" },
  PROPUESTA_VALOR: { nombre: "Propuesta de valor", pregunta: "¿Queda claro en segundos qué ofrece y por qué elegirlo?" },
  FICHA_PRODUCTO: { nombre: "Ficha de producto", pregunta: "¿La ficha muestra fotos, precio, detalle y confianza para decidir?" },
  FLUJO_COMPRA: { nombre: "Flujo de compra", pregunta: "¿Cuántos pasos hay hasta pagar? ¿El precio se ve sin registrarse?" },
  CONVERSION: { nombre: "Conversión", pregunta: "¿Las llamadas a la acción son visibles y llevan a contactar o comprar?" },
};

const BASE: Dimension[] = ["IDENTIDAD_VISUAL", "JERARQUIA_VISUAL", "USABILIDAD_MOVIL"];

/** Lo que se mide depende del tipo de web: un e-commerce mira la ficha y el checkout; una landing, la propuesta. */
export function dimensionesPara(variante: string | null | undefined): Dimension[] {
  switch (variante) {
    case "LANDING": return [...BASE, "PROPUESTA_VALOR", "CONVERSION"];
    case "ECOMMERCE": return [...BASE, "ARQUITECTURA_INFORMACION", "FICHA_PRODUCTO", "FLUJO_COMPRA"];
    case "CATALOGO": return [...BASE, "ARQUITECTURA_INFORMACION", "FICHA_PRODUCTO", "CONVERSION"];
    default: return [...BASE, "ARQUITECTURA_INFORMACION", "CONVERSION"];
  }
}

export const LIMITES_TALLER = {
  referencias: 8,
  hallazgos: 6,
  recomendaciones: 6,
  paginas: 40,
  seccionesPorPagina: 12,
  /** Alcanza para el prompt de todo el sitio (todas las páginas en uno) con la plantilla de 21st.dev. */
  promptPrototipo: 30000,
  /** Prompt o código de la plantilla de 21st.dev que pega el equipo. */
  plantilla: 12000,
  /** De la plantilla, lo que entra en el prompt de Stitch (la completa va a las capturas). */
  plantillaEnStitch: 6000,
  /** Capturas de la propuesta visual (una por página y dispositivo). */
  bocetos: 24,
  /** Pantallas de Stitch por proyecto (cada una gasta créditos diarios de Stitch). */
  pantallas: 12,
  /** Vigencia del link de la demo (decisión del 10 oct: vence por días). */
  diasDemoDefecto: 7,
  diasDemoMax: 30,
  /** HTML de una demo cargada a mano. */
  htmlDemoMaxBytes: 1_500_000,
  /** Solicitudes por IP a una misma demo en 10 minutos. */
  solicitudesDemo: 120,
  /** Tokens de salida por llamada (fase de prueba: lo mínimo que sirve). */
  tokensAnalisis: 2500,
  tokensSintesis: 2500,
  tokensFlujograma: 4000,
  tokensDemo: 20000,
  tokensBoceto: 12000,
};

// ───────────────────────────── tipos

export type TipoCaptura = "ESCRITORIO" | "MOVIL";
export type Dispositivo = "ESCRITORIO" | "MOVIL";
export interface Captura { tipo: TipoCaptura; url: string; simulada: boolean }
export interface Puntaje { dimension: Dimension; puntaje: number; comentario: string }
export interface Referencia {
  id: string;
  nombre: string;
  url: string;
  origen: "BRIEF" | "EQUIPO";
  capturas: Captura[];
  puntajes: Puntaje[];
  resumen: string | null;
  analizadaEn: string | null;
  /** 9 nov: puntos numerados sobre las capturas (verde lo que tomamos, rojo lo que evitamos). */
  marcas?: MarcaCaptura[];
}
export interface Punto { titulo: string; texto: string }
export interface PaginaFlujo { id: string; titulo: string; descripcion: string; nivel: number; padreId: string | null; secciones: string[] }
/** `paginaId` y `prompt`: la página del flujograma que se diseñó y el prompt exacto que recibió Stitch. */
/** Quién dibuja el prototipo (6 nov, pedido de Ernesto): Stitch o Claude escribiendo el HTML. */
export const GENERADORES_PROTOTIPO = ["STITCH", "CLAUDE"] as const;
export type GeneradorPrototipo = (typeof GENERADORES_PROTOTIPO)[number];
export interface PantallaPrototipo { id: string; nombre: string; dispositivo: Dispositivo; imagenUrl: string; conHtml: boolean; simulada: boolean; creadaEn: string; paginaId?: string | null; prompt?: string; generador?: GeneradorPrototipo }
export interface Prototipo { prompt: string | null; proyectoStitch: string | null; pantallas: PantallaPrototipo[] }

/** La plantilla de 21st.dev que el equipo elige y pega (su prompt o su código, y el enlace). */
export interface Plantilla { url: string | null; prompt: string }

/**
 * Captura de la propuesta visual (paso 3, 26 oct): Claude escribe el HTML de la página siguiendo la plantilla
 * de 21st.dev y el navegador la fotografía. El equipo la revisa; solo las aprobadas van al PDF.
 */
export interface Boceto { id: string; paginaId: string; nombre: string; dispositivo: Dispositivo; imagenUrl: string; htmlUrl: string | null; aprobado: boolean; simulada: boolean; creadaEn: string; prompt?: string | null }

/** Lo que el taller sabe del proyecto: brief web, resumen de la reunión de brief, alcance y marca. */
export interface Insumos {
  marca: string;
  variante: string | null;
  objetivo: string | null;
  publico: string | null;
  secciones: string[];
  resumenReunion: string | null;
  alcance: string | null;
  cms: string | null;
  mensajeCentral: string | null;
  tono: string | null;
  /** Del manual de marca del cliente (cliente.marca), si los tiene cargados. */
  paleta?: string[];
  tipografias?: string[];
  /** 8 nov: el logo y el manual de marca (enlaces), para todo el flujo del taller. */
  logoUrl?: string | null;
  manualUrl?: string | null;
  /** 9 nov (fase 1): la propuesta de valor y los KPIs del sitio. */
  propuestaValor?: string | null;
  kpis?: string[];
}

/**
 * Lo que el equipo corrige de lo que se sacó del brief y la marca (reunión del 6 nov). Cada campo presente
 * reemplaza al del brief; los que no están siguen saliendo del brief. Se usa en todos los pasos del taller.
 */
export type AjustesTaller = Partial<Pick<Insumos, "objetivo" | "publico" | "alcance" | "cms" | "mensajeCentral" | "tono" | "resumenReunion" | "logoUrl" | "manualUrl" | "propuestaValor">> & {
  secciones?: string[];
  paleta?: string[];
  tipografias?: string[];
  kpis?: string[];
};
const AJUSTES_TEXTO = ["objetivo", "publico", "alcance", "cms", "mensajeCentral", "tono", "resumenReunion", "propuestaValor"] as const;

/** Los insumos con los ajustes del equipo encima. */
export function conAjustes(base: Insumos, a: AjustesTaller | null | undefined): Insumos {
  if (!a) return base;
  const x: Insumos = { ...base };
  for (const k of AJUSTES_TEXTO) if (a[k] !== undefined) x[k] = a[k] ?? null;
  if (a.secciones) x.secciones = a.secciones;
  if (a.paleta) x.paleta = a.paleta;
  if (a.tipografias) x.tipografias = a.tipografias;
  if (a.kpis) x.kpis = a.kpis;
  if (a.logoUrl !== undefined) x.logoUrl = a.logoUrl;
  if (a.manualUrl !== undefined) x.manualUrl = a.manualUrl;
  return x;
}

/** Valida los ajustes: textos de hasta 600 caracteres, listas cortas, colores #RRGGBB y enlaces públicos. */
export function validarAjustes(v: unknown, errores: { campo: string; mensaje: string }[]): AjustesTaller | null {
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    errores.push({ campo: "ajustes", mensaje: "Los datos del brief que corregiste" });
    return null;
  }
  const b = v as Record<string, unknown>;
  const a: AjustesTaller = {};
  for (const k of AJUSTES_TEXTO) {
    if (b[k] === undefined) continue;
    const t = typeof b[k] === "string" ? (b[k] as string).trim() : b[k] === null ? "" : null;
    if (t === null || t.length > 600) errores.push({ campo: `ajustes.${k}`, mensaje: "Hasta 600 caracteres" });
    else a[k] = t || null;
  }
  const lista = (k: "secciones" | "tipografias" | "paleta" | "kpis", max: number, largo: number, patron?: RegExp, mensaje?: string) => {
    if (b[k] === undefined) return;
    const xs = Array.isArray(b[k]) ? (b[k] as unknown[]).map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean) : null;
    if (!xs || xs.length > max || xs.some((x) => x.length > largo || (patron && !patron.test(x)))) errores.push({ campo: `ajustes.${k}`, mensaje: mensaje ?? `Hasta ${max} de ${largo} caracteres` });
    else a[k] = xs;
  };
  lista("secciones", 20, 60);
  lista("tipografias", 4, 60);
  lista("kpis", 8, 160);
  lista("paleta", 8, 7, /^#[0-9A-Fa-f]{6}$/, "Hasta 8 colores en formato #RRGGBB");
  for (const k of ["logoUrl", "manualUrl"] as const) {
    if (b[k] === undefined) continue;
    if (b[k] === null || b[k] === "") a[k] = null;
    else {
      // 9 nov: también el enlace de un material subido al taller (/api/v1/publico/{token}).
      const u = typeof b[k] === "string" && /^\/api\/v1\/publico\/[0-9a-f]{64}$/.test(b[k] as string) ? (b[k] as string) : normalizarUrl(b[k]);
      if (!u) errores.push({ campo: `ajustes.${k}`, mensaje: "Pega un enlace público (https://…)" });
      else a[k] = u;
    }
  }
  return Object.keys(a).length ? a : null;
}

type Errores = { campo: string; mensaje: string }[];

// ───────────────────────────── referencias

const IP_PRIVADA = /^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** https://… de un sitio público (sin IPs privadas: las capturas las saca el servidor). */
export function normalizarUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let t = v.trim();
  if (!t || /\s/.test(t)) return null;
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  try {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || IP_PRIVADA.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** «www.aesop.com/pe» → «Aesop». */
export function nombreDeUrl(url: string): string {
  const host = new URL(url).hostname.replace(/^www\d?\./, "");
  const base = host.split(".")[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const textoDe = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Lo que el taller toma del brief web (src/dominio/briefs.ts). El brief real no pregunta público ni secciones: esos
 * salen de la reunión y del flujograma. Los briefs anteriores (objetivo, publico, secciones) se siguen leyendo.
 */
export function datosDelBriefWeb(r: Record<string, unknown>): { objetivo: string | null; publico: string | null; secciones: string[] } {
  return {
    objetivo: textoDe(r.objetivo) ?? textoDe(r.objetivos) ?? textoDe(r.productoPromocionar) ?? textoDe(r.tipoProyecto),
    publico: textoDe(r.publico),
    secciones: (textoDe(r.secciones) ?? "").split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean),
  };
}

/** Los sitios que inspiran del brief web («inspiracion»; antes «referencias»): un enlace por línea, con o sin comentario. */
export function referenciasDelBrief(respuestas: Record<string, unknown> | null | undefined): { nombre: string; url: string }[] {
  const v = respuestas?.inspiracion ?? respuestas?.referencias;
  const texto = typeof v === "string" ? v : Array.isArray(v) ? v.join("\n") : "";
  const vistas = new Set<string>();
  const r: { nombre: string; url: string }[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/(https?:\/\/[^\s,;]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;]*)?)/i);
    const url = m ? normalizarUrl(m[1].replace(/[).]+$/, "")) : null;
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    r.push({ nombre: nombreDeUrl(url), url });
  }
  return r.slice(0, LIMITES_TALLER.referencias);
}

/** Promedio de los puntajes con un decimal; null si todavía no tiene. */
export function puntajeGlobal(puntajes: Puntaje[]): number | null {
  if (!puntajes.length) return null;
  return Math.round((puntajes.reduce((t, p) => t + p.puntaje, 0) / puntajes.length) * 10) / 10;
}

// ───────────────────────────── edición del equipo

export interface EdicionTaller {
  referencias: { id: string | null; nombre: string; url: string; puntajes: Puntaje[]; resumen: string | null; marcas?: MarcaCaptura[] }[];
  hallazgos: Punto[];
  recomendaciones: Punto[];
  flujograma: PaginaFlujo[];
  promptPrototipo: string | null;
  plantilla: Plantilla | null;
  bocetosAprobados: string[];
  /** undefined = no se mandó. */
  ajustes?: AjustesTaller | null;
}

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function validarPuntos(v: unknown, campo: string, max: number, errores: Errores): Punto[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > max) {
    errores.push({ campo, mensaje: `Hasta ${max}` });
    return [];
  }
  return v.map((x: Record<string, unknown>, i) => {
    const titulo = texto(x?.titulo);
    const t = texto(x?.texto);
    if (titulo.length < 3 || titulo.length > 80) errores.push({ campo: `${campo}.${i}.titulo`, mensaje: "Un título de 3 a 80 caracteres" });
    if (t.length < 3 || t.length > 400) errores.push({ campo: `${campo}.${i}.texto`, mensaje: "Explícalo en 3 a 400 caracteres" });
    return { titulo, texto: t };
  });
}

/** Valida el flujograma: niveles de 0 a 3, una sola página de entrada y padres que existen (sin ciclos). */
export function validarFlujograma(v: unknown, errores: Errores, campo = "flujograma"): PaginaFlujo[] {
  if (!Array.isArray(v) || v.length > LIMITES_TALLER.paginas) {
    errores.push({ campo, mensaje: `Entre 0 y ${LIMITES_TALLER.paginas} páginas` });
    return [];
  }
  const paginas = v.map((x: Record<string, unknown>, i): PaginaFlujo => {
    const id = texto(x?.id) || `p${i + 1}`;
    const titulo = texto(x?.titulo);
    const nivel = Number(x?.nivel);
    const secciones = Array.isArray(x?.secciones) ? (x.secciones as unknown[]).map(texto).filter(Boolean) : [];
    if (titulo.length < 2 || titulo.length > 60) errores.push({ campo: `${campo}.${i}.titulo`, mensaje: "El nombre de la página (2 a 60 caracteres)" });
    if (!Number.isInteger(nivel) || nivel < 0 || nivel > 3) errores.push({ campo: `${campo}.${i}.nivel`, mensaje: "Nivel de 0 a 3" });
    if (secciones.length > LIMITES_TALLER.seccionesPorPagina || secciones.some((s) => s.length > 60)) {
      errores.push({ campo: `${campo}.${i}.secciones`, mensaje: `Hasta ${LIMITES_TALLER.seccionesPorPagina} secciones de 60 caracteres` });
    }
    return { id: id.slice(0, 40), titulo, descripcion: texto(x?.descripcion).slice(0, 200), nivel, padreId: texto(x?.padreId) || null, secciones };
  });
  const ids = new Set(paginas.map((p) => p.id));
  if (ids.size !== paginas.length) errores.push({ campo, mensaje: "Hay páginas repetidas" });
  if (paginas.length && paginas.filter((p) => p.nivel === 0).length !== 1) errores.push({ campo, mensaje: "Tiene que haber una sola página de entrada (nivel 0)" });
  paginas.forEach((p, i) => {
    const padre = paginas.find((x) => x.id === p.padreId);
    if (p.nivel === 0 && p.padreId) errores.push({ campo: `${campo}.${i}.padreId`, mensaje: "La página de entrada no tiene padre" });
    if (p.nivel > 0 && (!padre || padre.nivel !== p.nivel - 1)) errores.push({ campo: `${campo}.${i}.padreId`, mensaje: "Elige una página del nivel anterior" });
  });
  return paginas;
}

export function validarEdicion(b: Record<string, unknown>, dimensiones: Dimension[]): { errores: Errores; datos: EdicionTaller } {
  const errores: Errores = [];
  const refs = b.referencias === undefined ? [] : b.referencias;
  if (!Array.isArray(refs) || refs.length > LIMITES_TALLER.referencias) errores.push({ campo: "referencias", mensaje: `Hasta ${LIMITES_TALLER.referencias} sitios de referencia` });
  const urls = new Set<string>();
  const referencias = (Array.isArray(refs) ? refs : []).map((x: Record<string, unknown>, i) => {
    const url = normalizarUrl(x?.url);
    const nombre = texto(x?.nombre) || (url ? nombreDeUrl(url) : "");
    if (!url) errores.push({ campo: `referencias.${i}.url`, mensaje: "Pega la dirección de un sitio público (https://…)" });
    else if (urls.has(url)) errores.push({ campo: `referencias.${i}.url`, mensaje: "Ese sitio ya está en la lista" });
    else urls.add(url);
    if (nombre.length < 2 || nombre.length > 80) errores.push({ campo: `referencias.${i}.nombre`, mensaje: "El nombre (2 a 80 caracteres)" });
    const puntajes = Array.isArray(x?.puntajes) ? (x.puntajes as Record<string, unknown>[]) : [];
    const ps: Puntaje[] = [];
    puntajes.forEach((p, j) => {
      const n = Number(p?.puntaje);
      if (!dimensiones.includes(p?.dimension as Dimension)) errores.push({ campo: `referencias.${i}.puntajes.${j}.dimension`, mensaje: "Esa dimensión no aplica a este tipo de web" });
      else if (!Number.isInteger(n) || n < 1 || n > 5) errores.push({ campo: `referencias.${i}.puntajes.${j}.puntaje`, mensaje: "Un puntaje de 1 a 5" });
      else ps.push({ dimension: p.dimension as Dimension, puntaje: n, comentario: texto(p?.comentario).slice(0, 160) });
    });
    const resumen = texto(x?.resumen);
    if (resumen.length > 600) errores.push({ campo: `referencias.${i}.resumen`, mensaje: "Hasta 600 caracteres" });
    return { id: texto(x?.id) || null, nombre, url: url ?? "", puntajes: ps, resumen: resumen || null, ...(x?.marcas !== undefined ? { marcas: normalizarMarcas(x.marcas) } : {}) };
  });
  const prompt = b.promptPrototipo === undefined || b.promptPrototipo === null ? null : texto(b.promptPrototipo);
  if (prompt !== null && prompt.length > LIMITES_TALLER.promptPrototipo) errores.push({ campo: "promptPrototipo", mensaje: `Hasta ${LIMITES_TALLER.promptPrototipo} caracteres` });
  // La plantilla de 21st.dev: su prompt (o código) y, si se pega, el enlace.
  let plantilla: Plantilla | null = null;
  if (b.plantilla !== undefined && b.plantilla !== null) {
    const x = b.plantilla as Record<string, unknown>;
    const pr = texto(x?.prompt);
    const url = texto(x?.url) ? normalizarUrl(x.url) : null;
    if (pr.length > LIMITES_TALLER.plantilla) errores.push({ campo: "plantilla.prompt", mensaje: `Hasta ${LIMITES_TALLER.plantilla} caracteres` });
    if (texto(x?.url) && !url) errores.push({ campo: "plantilla.url", mensaje: "Pega el enlace de la plantilla (https://21st.dev/…)" });
    plantilla = pr || url ? { url, prompt: pr } : null;
  }
  const aprobados = b.bocetosAprobados === undefined ? [] : b.bocetosAprobados;
  if (!Array.isArray(aprobados) || aprobados.some((x) => typeof x !== "string")) errores.push({ campo: "bocetosAprobados", mensaje: "La lista de capturas aprobadas" });
  return {
    errores,
    datos: {
      referencias,
      hallazgos: validarPuntos(b.hallazgos, "hallazgos", LIMITES_TALLER.hallazgos, errores),
      recomendaciones: validarPuntos(b.recomendaciones, "recomendaciones", LIMITES_TALLER.recomendaciones, errores),
      flujograma: b.flujograma === undefined ? [] : validarFlujograma(b.flujograma, errores),
      promptPrototipo: prompt || null,
      plantilla,
      bocetosAprobados: Array.isArray(aprobados) ? (aprobados as string[]) : [],
      ...(b.ajustes !== undefined ? { ajustes: validarAjustes(b.ajustes, errores) } : {}),
    },
  };
}

export function validarDemo(b: Record<string, unknown>): { errores: Errores; origen: "GENERAR" | "HTML"; html: string | null; dias: number } {
  const errores: Errores = [];
  const origen = b.origen === "HTML" ? "HTML" : b.origen === "GENERAR" || b.origen === undefined ? "GENERAR" : null;
  if (!origen) errores.push({ campo: "origen", mensaje: "Genera la demo o pega su HTML" });
  const html = origen === "HTML" ? (typeof b.html === "string" ? b.html : "") : null;
  if (origen === "HTML" && (!/<html|<body|<main|<section|<div/i.test(html ?? "") || new TextEncoder().encode(html ?? "").length > LIMITES_TALLER.htmlDemoMaxBytes)) {
    errores.push({ campo: "html", mensaje: "Pega el HTML completo de la demo (hasta 1,5 MB)" });
  }
  const dias = b.diasVigencia === undefined ? LIMITES_TALLER.diasDemoDefecto : Number(b.diasVigencia);
  if (!Number.isInteger(dias) || dias < 1 || dias > LIMITES_TALLER.diasDemoMax) errores.push({ campo: "diasVigencia", mensaje: `Entre 1 y ${LIMITES_TALLER.diasDemoMax} días` });
  return { errores, origen: origen ?? "GENERAR", html, dias };
}

export const venceEn = (dias: number, ahora = new Date()) => new Date(ahora.getTime() + dias * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Token de los links de archivos generados: 64 caracteres hexadecimales, imposible de adivinar. */
export function nuevoToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ───────────────────────────── lo que se le manda al modelo

export function textoInsumos(i: Insumos): string {
  const l = [
    `Marca: ${i.marca}`,
    i.variante && `Tipo de web: ${TIPO_WEB[i.variante] ?? i.variante}`,
    i.alcance && `Alcance contratado: ${i.alcance}`,
    i.cms && `CMS: ${i.cms}`,
    i.objetivo && `Objetivo del sitio: ${i.objetivo}`,
    i.publico && `Público: ${i.publico}`,
    i.secciones.length ? `Secciones que imagina el cliente: ${i.secciones.join(", ")}` : null,
    i.mensajeCentral && `Mensaje central de la marca: ${i.mensajeCentral}`,
    i.tono && `Tono: ${i.tono}`,
    i.propuestaValor && `Propuesta de valor: ${i.propuestaValor}`,
    i.kpis?.length ? `KPIs del sitio: ${i.kpis.join("; ")}` : null,
    i.paleta?.length ? `Colores de la marca: ${i.paleta.join(", ")}` : null,
    i.tipografias?.length ? `Tipografías de la marca: ${i.tipografias.join(", ")}` : null,
    i.logoUrl && `Logo: ${i.logoUrl}`,
    i.manualUrl && `Manual de marca: ${i.manualUrl}`,
    i.resumenReunion && `Resumen de la reunión de brief: ${i.resumenReunion}`,
  ];
  return l.filter(Boolean).join("\n");
}

export const TIPO_WEB: Record<string, string> = { LANDING: "Landing page", INFORMATIVA: "Web informativa", ECOMMERCE: "E-commerce", CATALOGO: "Catálogo digital", APLICATIVO: "Aplicativo web" };

export const SISTEMA_ANALISIS = `Eres consultor senior de UX/UI de una agencia digital de Lima. Evalúas el sitio de referencia de las capturas (escritorio y móvil) para el benchmark de un proyecto web.
Reglas:
- Califica cada dimensión de 1 a 5 (5 = referente del mercado, 3 = correcto, 1 = deficiente) mirando SOLO lo que se ve en las capturas.
- El comentario de cada dimensión es una frase corta y concreta (máximo 60 caracteres), estilo «Menú claro, bien segmentado».
- El resumen dice en 2 frases qué tomar de este sitio para el proyecto y qué evitar.
${REGLA_MARCAS}
- Escribe en español neutro. No menciones que eres una IA ni el nombre de ninguna herramienta.`;

export function esquemaAnalisis(dimensiones: Dimension[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["puntajes", "resumen", "marcas"],
    properties: {
      marcas: ESQUEMA_MARCAS,
      puntajes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["dimension", "puntaje", "comentario"],
          properties: { dimension: { type: "string", enum: dimensiones }, puntaje: { type: "integer" }, comentario: { type: "string" } },
        },
      },
      resumen: { type: "string" },
    },
  };
}

export function mensajeAnalisis(ref: { nombre: string; url: string }, dimensiones: Dimension[], insumos: Insumos): string {
  return `${textoInsumos(insumos)}\n\nSitio de referencia: ${ref.nombre} (${ref.url})\nDimensiones a calificar:\n${dimensiones.map((d) => `- ${d}: ${DIMENSIONES[d].pregunta}`).join("\n")}\n\nResponde en JSON.`;
}

export const SISTEMA_SINTESIS = `Eres consultor senior de UX/UI de una agencia digital de Lima. Con el análisis de los sitios de referencia y el brief del cliente, escribes la sección «Hallazgos clave» (lo que el mercado no está haciendo bien) y «Recomendaciones UX prioritarias» del benchmark.
Reglas:
- Entre 3 y 4 hallazgos y entre 3 y 4 recomendaciones. Cada uno con un título corto (máximo 6 palabras) y un texto de 1 a 3 frases.
- Las recomendaciones salen de los hallazgos y del objetivo del cliente; son accionables para el diseño del sitio.
- Español neutro, directo, sin relleno. No menciones que eres una IA ni el nombre de ninguna herramienta.`;

const ESQUEMA_PUNTOS = { type: "array", items: { type: "object", additionalProperties: false, required: ["titulo", "texto"], properties: { titulo: { type: "string" }, texto: { type: "string" } } } };
export const ESQUEMA_SINTESIS = { type: "object", additionalProperties: false, required: ["hallazgos", "recomendaciones"], properties: { hallazgos: ESQUEMA_PUNTOS, recomendaciones: ESQUEMA_PUNTOS } };

export function mensajeSintesis(insumos: Insumos, referencias: Referencia[]): string {
  const refs = referencias.map((r) => `## ${r.nombre} (${r.url})\n${r.puntajes.map((p) => `- ${DIMENSIONES[p.dimension].nombre}: ${p.puntaje}/5 · ${p.comentario}`).join("\n")}${r.resumen ? `\n${r.resumen}` : ""}`).join("\n\n");
  return `${textoInsumos(insumos)}\n\n# Referencias analizadas\n${refs || "(sin referencias analizadas)"}\n\nResponde en JSON.`;
}

export const SISTEMA_FLUJOGRAMA = `Eres arquitecto de información de una agencia digital de Lima. Diseñas el flujograma de un sitio web en dos versiones a la vez:
- De navegación: las páginas por nivel (nivel 0 = la página de entrada; nivel 1 = las del menú principal; nivel 2 = las que cuelgan de ellas; nivel 3 solo si hace falta).
- Estructural: las secciones de cada página, en orden, de arriba hacia abajo.
Reglas:
- Una sola página de nivel 0. Cada página de nivel N > 0 tiene como padre una de nivel N - 1.
- Ids cortos en minúsculas (inicio, tienda, ficha-producto). Respeta el alcance contratado (cantidad de páginas) y las secciones que pidió el cliente.
- Si es e-commerce, incluye tienda, categorías, ficha de producto, carrito y checkout.
- Descripciones de una línea. Secciones de 2 a 5 palabras («Hero con propuesta de valor»).
- Español neutro. No menciones que eres una IA ni el nombre de ninguna herramienta.`;

export const ESQUEMA_FLUJOGRAMA = {
  type: "object",
  additionalProperties: false,
  required: ["paginas"],
  properties: {
    paginas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "titulo", "descripcion", "nivel", "padreId", "secciones"],
        properties: {
          id: { type: "string" }, titulo: { type: "string" }, descripcion: { type: "string" }, nivel: { type: "integer" },
          padreId: { type: ["string", "null"] }, secciones: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export function mensajeFlujograma(insumos: Insumos, recomendaciones: Punto[]): string {
  const rec = recomendaciones.length ? `\n\nRecomendaciones del benchmark:\n${recomendaciones.map((r) => `- ${r.titulo}: ${r.texto}`).join("\n")}` : "";
  return `${textoInsumos(insumos)}${rec}\n\nResponde en JSON.`;
}

export const SISTEMA_DEMO = `Eres diseñador UI y desarrollador front-end senior de una agencia digital de Lima. Construyes el PROTOTIPO EN ALTA FIDELIDAD de un sitio web: navegable y funcional, en UN solo archivo HTML (HTML + CSS + JS sin librerías externas, salvo Google Fonts).
Reglas:
- Aplica la identidad de la marca: sus colores, su tipografía y su logo (si hay un enlace, úsalo en un <img>). Diseño profesional y moderno, listo para mostrar al cliente.
- Cada página del flujograma es una pantalla propia; navega entre ellas con el hash de la URL (#inicio, #catalogo…) y un menú. Usa los textos del copywriting tal cual; si falta alguno, escribe uno realista en español del Perú (nada de lorem ipsum).
- Lo que el sitio hace debe funcionar de verdad. Si hay catálogo: productos de ejemplo con las categorías y atributos dados, buscador con sugerencias mientras se escribe y aviso cuando no hay resultados, filtros que filtran y pantalla de «sin resultados». Si hay cotización por WhatsApp: botón «agregar» en el listado y la ficha, carrito (editar cantidades, quitar, aviso de carrito vacío), formulario con los campos dados y su validación, vista previa del mensaje que se actualiza mientras se escribe y botón que abre https://wa.me/<número>?text=<mensaje> con el pedido detallado. Si no hay catálogo, haz funcionar lo que pida el alcance (formularios, pestañas, acordeones de preguntas frecuentes…).
- La primera pantalla (#presentacion) es la guía de revisión para el cliente: el flujo en pasos, un índice con enlaces a cada pantalla, el sistema visual (colores y tipografía), los pendientes por validar y, al pie, «creado por INOO AGENCIA DE MARKETING».
- Responsive de verdad: en el celular, menú desplegable, filtros en panel y barra fija con el botón principal. Accesible (contraste, etiquetas, foco visible).
- Imágenes: ilustraciones con CSS, degradados o SVG en línea; no enlaces a bancos de imágenes.
- Sin comentarios en el código, sin meta generator y sin mencionar IA ni el nombre de ninguna herramienta.
- Responde SOLO con el HTML, empezando por <!doctype html>.`;

export function mensajeDemo(insumos: Insumos, flujograma: PaginaFlujo[], recomendaciones: Punto[], htmlReferencia: string | null, estrategia?: Estrategia | null): string {
  const paginas = flujograma.map((p) => `${"  ".repeat(p.nivel)}- ${p.titulo}${p.descripcion ? ` (${p.descripcion})` : ""}: ${p.secciones.join(" · ")}`).join("\n");
  const rec = recomendaciones.length ? `\n\nRecomendaciones UX:\n${recomendaciones.map((r) => `- ${r.titulo}`).join("\n")}` : "";
  const ref = htmlReferencia ? `\n\nDiseño aprobado de la pantalla principal (úsalo como guía visual: colores, tipografía, estilo):\n${htmlReferencia.slice(0, 20_000)}` : "";
  const e = estrategia ?? null;
  const proyecto = e ? textoEspecificaciones(e.especificaciones) : "";
  const imprescindibles = e?.funcionalidades.filter((f) => f.prioridad === "IMPRESCINDIBLE") ?? [];
  const copy = e?.copy
    ? `\n\nCopywriting aprobado:\n${JSON.stringify({ heros: e.copy.heros.slice(0, 1), paginas: e.copy.paginas, ctas: e.copy.ctas, microcopys: e.copy.microcopys, faq: e.copy.faq }).slice(0, 14_000)}`
    : "";
  return `${textoInsumos(insumos)}${proyecto ? `\n\nLo que necesita el proyecto:\n${proyecto}` : ""}\n\nFlujograma (páginas y secciones):\n${paginas}${imprescindibles.length ? `\n\nFuncionalidades imprescindibles (tienen que funcionar):\n${imprescindibles.map((f) => `- ${f.nombre}: ${f.descripcion}`).join("\n")}` : ""}${e?.pendientes.length ? `\n\nPendientes por validar (van en la presentación):\n${e.pendientes.map((x) => `- ${x}`).join("\n")}` : ""}${copy}${rec}${ref}`;
}

const ANCHO: Record<Dispositivo, string> = { ESCRITORIO: "escritorio (1440 px de ancho)", MOVIL: "móvil (390 px de ancho)" };

/** La página que se diseña: la pedida o, si no existe, la de entrada. */
export const paginaParaPrompt = (flujograma: PaginaFlujo[], paginaId?: string | null) =>
  flujograma.find((p) => p.id === paginaId) ?? flujograma.find((p) => p.nivel === 0) ?? flujograma[0];

/**
 * Prompt para Stitch con una estructura estándar (decidido el 24 oct: lo arma el código, no la IA).
 * Sale del flujograma tal como está en pantalla (también lo no guardado), de los insumos del proyecto y
 * de las recomendaciones del benchmark. Siempre en el mismo orden:
 *   1. Proyecto  2. Marca  3. Navegación del sitio  4. Pantalla a diseñar (sus secciones, en orden)
 *   5. Tener en cuenta (recomendaciones)  6. Reglas
 * Las partes sin datos se omiten; el equipo puede editar el resultado antes de enviarlo.
 */
export function promptStitch(insumos: Insumos, flujograma: PaginaFlujo[], recomendaciones: Punto[], opciones: { paginaId?: string | null; dispositivo?: Dispositivo; plantilla?: Plantilla | null } = {}): string {
  const pagina = paginaParaPrompt(flujograma, opciones.paginaId);
  const dispositivo = opciones.dispositivo ?? "ESCRITORIO";
  const padre = pagina?.padreId ? flujograma.find((p) => p.id === pagina.padreId) : null;
  return armarPrompt(insumos, flujograma, recomendaciones, bloque("Pantalla a diseñar", pagina ? [
    `Página: ${pagina.titulo}${padre ? ` (se llega desde ${padre.titulo})` : ""}${pagina.descripcion ? ` — ${pagina.descripcion}` : ""}.`,
    `Dispositivo: ${ANCHO[dispositivo]}.`,
    pagina.secciones.length ? "Secciones, de arriba hacia abajo:" : null,
    ...pagina.secciones.map((s, i) => `${i + 1}. ${s}`),
  ] : []), ["- Usa solo las secciones listadas, en ese orden."], opciones.plantilla);
}

/**
 * Todo el sitio en un solo prompt (26 oct): la misma estructura estándar, pero con todas las páginas del
 * flujograma, en orden, cada una con sus secciones. Stitch lo recibe de una vez y diseña el sitio completo
 * con un solo sistema visual.
 */
export function promptStitchSitio(insumos: Insumos, flujograma: PaginaFlujo[], recomendaciones: Punto[], opciones: { dispositivo?: Dispositivo; plantilla?: Plantilla | null } = {}): string {
  const dispositivo = opciones.dispositivo ?? "ESCRITORIO";
  const titulo = (id: string | null) => flujograma.find((p) => p.id === id)?.titulo;
  const paginas = flujograma.map((p, i) => [
    `## ${i + 1}. ${p.titulo}${p.descripcion ? ` — ${p.descripcion}` : ""}`,
    p.nivel === 0 ? "Página de entrada." : titulo(p.padreId) ? `Se llega desde ${titulo(p.padreId)}.` : null,
    ...(p.secciones.length ? ["Secciones, de arriba hacia abajo:", ...p.secciones.map((s, j) => `${j + 1}. ${s}`)] : []),
  ].filter(Boolean).join("\n"));
  return armarPrompt(insumos, flujograma, recomendaciones, bloque("Pantallas a diseñar", [
    `Sitio completo: ${flujograma.length} ${flujograma.length === 1 ? "pantalla" : "pantallas"}, una por página, en este orden.`,
    `Dispositivo: ${ANCHO[dispositivo]}.`,
    ...paginas.map((x) => `\n${x}`),
  ]), [
    "- Diseña una pantalla por cada página listada, con el nombre de la página como título de la pantalla.",
    "- Un solo sistema visual en todo el sitio: mismos colores, tipografías, botones, encabezado y pie de página.",
    "- En cada pantalla usa solo las secciones listadas para esa página, en ese orden.",
  ], opciones.plantilla);
}

const recortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max).trimEnd()}…` : s);

function bloque(titulo: string, lineas: (string | null | false | undefined)[]) {
  const xs = lineas.filter(Boolean) as string[];
  return xs.length ? [`# ${titulo}`, ...xs].join("\n") : null;
}

/** Proyecto, marca y navegación, luego lo que se diseña, las recomendaciones y las reglas. */
function armarPrompt(insumos: Insumos, flujograma: PaginaFlujo[], recomendaciones: Punto[], diseno: string | null, reglas: string[], plantilla?: Plantilla | null): string {
  const hijos = (id: string) => flujograma.filter((p) => p.padreId === id);
  const menu = flujograma.filter((p) => p.nivel === 1);
  return [
    bloque("Proyecto", [
      `Sitio: ${TIPO_WEB[insumos.variante ?? ""] ?? "Sitio web"} para ${insumos.marca}${insumos.cms ? ` (${insumos.cms.charAt(0)}${insumos.cms.slice(1).toLowerCase()})` : ""}.`,
      insumos.objetivo && `Objetivo: ${insumos.objetivo}`,
      insumos.publico && `Público: ${insumos.publico}`,
    ]),
    bloque("Marca", [
      insumos.mensajeCentral && `Mensaje central: «${insumos.mensajeCentral}»`,
      insumos.tono && `Tono: ${insumos.tono}`,
      insumos.paleta?.length ? `Paleta: ${insumos.paleta.join(", ")}` : null,
      insumos.tipografias?.length ? `Tipografías: ${insumos.tipografias.join(", ")}` : null,
      insumos.logoUrl && `Logo (úsalo en el encabezado): ${insumos.logoUrl}`,
      insumos.manualUrl && `Manual de marca: ${insumos.manualUrl}`,
    ]),
    bloque("Navegación del sitio", [
      menu.length ? `Menú principal: ${menu.map((p) => p.titulo).join(", ")}.` : null,
      ...menu.filter((p) => hijos(p.id).length).map((p) => `- ${p.titulo} → ${hijos(p.id).map((h) => h.titulo).join(", ")}`),
    ]),
    diseno,
    bloque("Tener en cuenta", recomendaciones.map((r) => `- ${r.titulo}${r.texto ? `: ${r.texto}` : ""}`)),
    plantilla && bloque("Plantilla de referencia (21st.dev)", [
      plantilla.url && `Enlace: ${plantilla.url}`,
      plantilla.prompt && "Toma de aquí el estilo y los componentes (es la misma plantilla de las capturas aprobadas):",
      plantilla.prompt && recortar(plantilla.prompt, LIMITES_TALLER.plantillaEnStitch),
    ]),
    bloque("Reglas", [
      ...reglas,
      "- Encabezado con el menú principal y pie de página con los datos de contacto.",
      "- Textos reales en español, sobre la marca. Nada de lorem ipsum.",
      "- Diseño limpio, con buena jerarquía y llamados a la acción visibles.",
    ]),
  ].filter(Boolean).join("\n\n");
}

// ───────────────────────────── capturas de la propuesta visual (paso 3)

export const SISTEMA_BOCETO = `Eres diseñador UI y desarrollador front-end senior de una agencia digital de Lima. Diseñas UNA página de un sitio web como un solo archivo HTML que luego se fotografía para mostrarla al cliente.
Reglas:
- Toma como base visual la plantilla de 21st.dev que te pasan (su estilo, su composición y sus componentes), adaptada a la marca: sus colores, tipografías y tono.
- Solo las secciones listadas, en ese orden, con encabezado (menú principal) y pie de página.
- Puedes usar Tailwind por CDN (<script src="https://cdn.tailwindcss.com"></script>) y Google Fonts. Nada de React ni de otros scripts.
- Textos reales en español sobre la marca (nada de lorem ipsum). Imágenes: degradados o bloques de color con forma, no enlaces a bancos de imágenes.
- Sin comentarios, sin meta generator y sin mencionar IA, 21st.dev ni ninguna herramienta.
- Responde SOLO con el HTML, empezando por <!doctype html>.`;

/** Para el prototipo con Claude: el mismo prompt armado por script (o el que editó el equipo), sin plantilla aparte. */
export const SISTEMA_PROTOTIPO = SISTEMA_BOCETO.replace(
  "- Toma como base visual la plantilla de 21st.dev que te pasan (su estilo, su composición y sus componentes), adaptada a la marca: sus colores, tipografías y tono.",
  "- Sigue el brief de diseño que te pasan (marca, colores, tipografías, tono, secciones y recomendaciones). Si trae una plantilla de referencia, tómala como base visual.",
);

export function mensajeBoceto(insumos: Insumos, flujograma: PaginaFlujo[], recomendaciones: Punto[], paginaId: string, dispositivo: Dispositivo, plantilla: Plantilla | null): string {
  const base = promptStitch(insumos, flujograma, recomendaciones, { paginaId, dispositivo });
  const ref = plantilla ? `\n\n# Plantilla de 21st.dev\n${plantilla.url ? `Enlace: ${plantilla.url}\n` : ""}${plantilla.prompt}` : "";
  return `${base}${ref}`;
}

/**
 * El contenido del PDF en markdown, como DESIGN.md del proyecto de Stitch (create_design_system → designMd).
 * Stitch no recibe archivos por su API: así le llega lo mismo que lee el cliente, más la plantilla de 21st.dev.
 */
export function designMdStitch(insumos: Insumos, flujograma: PaginaFlujo[], recomendaciones: Punto[], plantilla: Plantilla | null): string {
  const filas = (xs: [string, string | null | undefined][]) => xs.filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`);
  return [
    `# ${insumos.marca} · sitio web`,
    "## Proyecto",
    ...filas([
      ["Tipo", TIPO_WEB[insumos.variante ?? ""] ?? "Sitio web"], ["Objetivo", insumos.objetivo], ["Público", insumos.publico], ["Alcance", insumos.alcance],
      ["CMS", insumos.cms], ["Secciones pedidas", insumos.secciones.join(", ")],
    ]),
    "## Marca",
    ...filas([
      ["Mensaje central", insumos.mensajeCentral], ["Tono", insumos.tono], ["Paleta", insumos.paleta?.join(", ")], ["Tipografías", insumos.tipografias?.join(", ")],
      ["Logo", insumos.logoUrl], ["Manual de marca", insumos.manualUrl],
    ]),
    "## Flujograma",
    ...flujograma.map((p) => `${"  ".repeat(p.nivel)}- **${p.titulo}**${p.descripcion ? ` — ${p.descripcion}` : ""}${p.secciones.length ? `: ${p.secciones.join(" · ")}` : ""}`),
    ...(recomendaciones.length ? ["## Recomendaciones UX", ...recomendaciones.map((r) => `- **${r.titulo}:** ${r.texto}`)] : []),
    ...(plantilla ? ["## Plantilla de referencia (21st.dev)", ...(plantilla.url ? [plantilla.url] : []), ...(plantilla.prompt ? ["", recortar(plantilla.prompt, LIMITES_TALLER.plantillaEnStitch)] : [])] : []),
  ].join("\n");
}

/** Huella corta de un texto (para saber si el DESIGN.md cambió y hay que volver a subirlo a Stitch). */
export const huella = (s: string) => hash(s).toString(16);

/** El JSON de la respuesta, aunque venga entre ``` o con texto alrededor. */
export function interpretarJson<T>(t: string): T | null {
  const limpio = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  for (const candidato of [limpio, limpio.slice(limpio.indexOf("{"), limpio.lastIndexOf("}") + 1)]) {
    try {
      return JSON.parse(candidato) as T;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

// ───────────────────────────── respuestas simuladas (IA_MODO=simulado y pruebas)

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const COMENTARIOS: Record<Dimension, [string, string, string]> = {
  IDENTIDAD_VISUAL: ["Genérica, poco memorable", "Correcta y coherente", "Sistema visual impecable"],
  JERARQUIA_VISUAL: ["Densa, cuesta escanear", "Se entiende, algo cargada", "Excelente escaneabilidad"],
  USABILIDAD_MOVIL: ["Menú y botones incómodos", "Responsive correcto", "Mobile-first impecable"],
  ARQUITECTURA_INFORMACION: ["Menú denso y confuso", "Menú claro, poco filtro", "Menú claro, bien segmentado"],
  PROPUESTA_VALOR: ["No se entiende qué ofrece", "Clara, poco diferenciada", "Clara en tres segundos"],
  FICHA_PRODUCTO: ["Pocas fotos, sin detalle", "Completa, algo larga", "Fotos, precio y confianza"],
  FLUJO_COMPRA: ["Compra por WhatsApp o asesor", "Carrito con varios pasos", "Compra en tres clics"],
  CONVERSION: ["CTA escondido", "CTA visible en el inicio", "CTA claro en cada sección"],
};

export function analisisSimulado(ref: { nombre: string; url: string }, dimensiones: Dimension[]): { puntajes: Puntaje[]; resumen: string } {
  const h = hash(ref.url);
  const puntajes = dimensiones.map((d, i) => {
    const puntaje = 2 + ((h >>> (i * 3)) % 4);
    return { dimension: d, puntaje, comentario: COMENTARIOS[d][puntaje <= 2 ? 0 : puntaje <= 4 ? 1 : 2] };
  });
  const mejor = [...puntajes].sort((a, b) => b.puntaje - a.puntaje)[0];
  const peor = [...puntajes].sort((a, b) => a.puntaje - b.puntaje)[0];
  return {
    puntajes,
    resumen: `De ${ref.nombre} tomamos su ${DIMENSIONES[mejor.dimension].nombre.toLowerCase()}. Hay que evitar su ${DIMENSIONES[peor.dimension].nombre.toLowerCase()}: ${peor.comentario.toLowerCase()}.`,
  };
}

export function sintesisSimulada(insumos: Insumos, referencias: Referencia[]): { hallazgos: Punto[]; recomendaciones: Punto[] } {
  const debiles = new Map<Dimension, number>();
  for (const r of referencias) for (const p of r.puntajes) if (p.puntaje <= 3) debiles.set(p.dimension, (debiles.get(p.dimension) ?? 0) + 1);
  const top = [...debiles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d);
  const dims = top.length ? top : dimensionesPara(insumos.variante).slice(0, 3);
  return {
    hallazgos: dims.map((d) => ({
      titulo: `${DIMENSIONES[d].nombre} débil`,
      texto: `${debiles.get(d) ?? 0} de ${referencias.length || 0} referencias fallan en ${DIMENSIONES[d].nombre.toLowerCase()}. Es una oportunidad clara para que ${insumos.marca} se diferencie.`,
    })),
    recomendaciones: dims.map((d) => ({
      titulo: `Cuidar ${DIMENSIONES[d].nombre.toLowerCase()}`,
      texto: `El prototipo tiene que responder bien a esto: ${DIMENSIONES[d].pregunta}`,
    })),
  };
}

const SECCIONES_TIPICAS: Record<string, string[]> = {
  inicio: ["Hero con propuesta de valor", "Beneficios", "Destacados", "Testimonios", "Llamado a la acción"],
  tienda: ["Filtros por categoría", "Grilla de productos", "Paginación"],
  "ficha-producto": ["Galería de fotos", "Precio y variantes", "Agregar al carrito", "Detalle y modo de uso", "Productos relacionados"],
  carrito: ["Resumen del pedido", "Cupón de descuento", "Ir a pagar"],
  checkout: ["Datos de envío", "Medio de pago", "Confirmación"],
  nosotros: ["Historia de la marca", "Valores", "Equipo"],
  contacto: ["Formulario", "WhatsApp", "Mapa y horarios"],
};

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "pagina";

export function flujogramaSimulado(insumos: Insumos): PaginaFlujo[] {
  const pedidas = insumos.secciones.filter((s) => !/^inicio$/i.test(s));
  const tienda = insumos.variante === "ECOMMERCE" || insumos.variante === "CATALOGO";
  const menu = pedidas.length ? pedidas : tienda ? ["Tienda", "Nosotros", "Contacto"] : ["Servicios", "Nosotros", "Contacto"];
  const paginas: PaginaFlujo[] = [{ id: "inicio", titulo: "Inicio", descripcion: "Presentación, propuesta de valor y destacados", nivel: 0, padreId: null, secciones: SECCIONES_TIPICAS.inicio }];
  for (const t of menu.slice(0, 7)) {
    const id = slug(t);
    if (paginas.some((p) => p.id === id)) continue;
    paginas.push({ id, titulo: t, descripcion: `Página de ${t.toLowerCase()}`, nivel: 1, padreId: "inicio", secciones: SECCIONES_TIPICAS[id] ?? ["Encabezado", "Contenido principal", "Llamado a la acción"] });
  }
  if (tienda) {
    const padre = paginas.find((p) => p.id === "tienda") ?? paginas[1] ?? paginas[0];
    const hijo = (id: string, titulo: string, descripcion: string) => ({ id, titulo, descripcion, nivel: padre.nivel + 1, padreId: padre.id, secciones: SECCIONES_TIPICAS[id] });
    paginas.push(hijo("ficha-producto", "Ficha de producto", "Fotos, precio, variantes y compra"));
    if (insumos.variante === "ECOMMERCE") paginas.push(hijo("carrito", "Carrito", "Resumen antes de pagar"), hijo("checkout", "Checkout", "Envío y pago en un solo paso"));
  }
  return paginas;
}

/** Demo de ejemplo armada con el flujograma (modo simulado): una página con navegación por anclas. */
export function demoSimulada(insumos: Insumos, flujograma: PaginaFlujo[]): string {
  const paginas = flujograma.length ? flujograma : flujogramaSimulado(insumos);
  const nav = paginas.filter((p) => p.nivel <= 1).map((p) => `<a href="#${p.id}">${esc(p.titulo)}</a>`).join("");
  const cuerpo = paginas.map((p) => `<section id="${p.id}" class="pagina"><h2>${esc(p.titulo)}</h2><p class="bajada">${esc(p.descripcion)}</p><div class="bloques">${p.secciones.map((s) => `<div class="bloque"><span>${esc(s)}</span></div>`).join("")}</div></section>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(insumos.marca)}</title>
<style>:root{--p:#3d5a40;--f:#f6f3ee;--t:#1f2a1f}*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:var(--f);color:var(--t)}header{position:sticky;top:0;background:#fff;display:flex;gap:18px;align-items:center;padding:14px 24px;box-shadow:0 1px 0 #0001;flex-wrap:wrap}header strong{margin-right:auto;color:var(--p)}header a{color:var(--t);text-decoration:none;font-size:14px}.pagina{padding:56px 24px;max-width:1080px;margin:auto}.pagina h2{margin:0 0 6px;font-size:28px}.bajada{margin:0 0 22px;color:#5b6b5b}.bloques{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.bloque{background:#fff;border-radius:14px;min-height:120px;display:grid;place-items:center;padding:16px;text-align:center;border:1px solid #0001}.bloque:first-child{grid-column:1/-1;min-height:220px;background:linear-gradient(135deg,var(--p),#7d9b76);color:#fff;font-size:20px}</style></head>
<body><header><strong>${esc(insumos.marca)}</strong>${nav}</header><main>${cuerpo}</main></body></html>`;
}

// ───────────────────────────── sin rastros de IA

const HERRAMIENTAS = "ai|ia|claude|anthropic|chatgpt|openai|gpt(?:-?\\d[\\w.]*)?|gemini|stitch|v0|lovable|bolt|copilot|framer ai|midjourney";

/**
 * Quita lo que delataría la IA en el HTML que ve el cliente (reunión 15 oct: «quitar el sello»):
 * comentarios, meta generator, atributos data-* de herramientas y frases como «hecho con IA».
 */
export function limpiarHtml(html: string): string {
  const frase = new RegExp(`\\b(?:generated|created|made|built|designed|powered)\\s+(?:with|by|using)\\s+(?:${HERRAMIENTAS})\\b[^<"]*|\\b(?:generado|creado|hecho|dise[ñn]ado)\\s+(?:con|por|usando)\\s+(?:la\\s+)?(?:${HERRAMIENTAS})\\b[^<"]*`, "gi");
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<meta\b[^>]*\bname\s*=\s*["']?(?:generator|ai-generated|created-by)["']?[^>]*>/gi, "")
    .replace(new RegExp(`\\s+data-(?:${HERRAMIENTAS}|generated|generator)[\\w-]*(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`, "gi"), "")
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a: string, css: string, c: string) => `${a}${css.replace(/\/\*[\s\S]*?\*\//g, "")}${c}`)
    .replace(frase, "");
}

/** Textos que el equipo escribe para el cliente (la nota de una versión): no pueden nombrar la IA ni las herramientas. */
export const mencionaIa = (t: string) => new RegExp(`\\b(?:${HERRAMIENTAS}|inteligencia artificial|taller web)\\b`, "i").test(t);

/** Que los buscadores no la indexen (decisión del 10 oct). */
export function conNoindex(html: string): string {
  if (/<meta[^>]+name=["']?robots/i.test(html)) return html;
  const meta = '<meta name="robots" content="noindex, nofollow">';
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (h) => `${h}${meta}`) : `${meta}${html}`;
}

// ───────────────────────────── imágenes de relleno (sin navegador o sin Stitch)

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Captura de relleno: un boceto gris con el nombre del sitio (NAVEGADOR_MODO=simulado). */
export function capturaSimulada(nombre: string, tipo: TipoCaptura): string {
  const [w, h] = tipo === "ESCRITORIO" ? [1440, 900] : [390, 844];
  const barras = Array.from({ length: 4 }, (_, i) => `<rect x="${w * 0.08}" y="${h * (0.52 + i * 0.09)}" width="${w * (0.84 - i * 0.12)}" height="${h * 0.035}" rx="8" fill="#e3e6ea"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f4f5f7"/><rect width="100%" height="${h * 0.08}" fill="#fff"/><rect x="${w * 0.05}" y="${h * 0.025}" width="${w * 0.14}" height="${h * 0.03}" rx="6" fill="#cfd4da"/><rect x="${w * 0.08}" y="${h * 0.14}" width="${w * 0.84}" height="${h * 0.3}" rx="16" fill="#dde1e6"/><text x="50%" y="${h * 0.3}" text-anchor="middle" font-family="sans-serif" font-size="${tipo === "ESCRITORIO" ? 44 : 22}" fill="#6b7480">${esc(nombre)}</text>${barras}</svg>`;
}

/** Pantalla de relleno del prototipo (sin STITCH_API_KEY): el boceto de las secciones de la página. */
export function pantallaSimulada(pagina: PaginaFlujo | undefined, marca: string, dispositivo: Dispositivo): string {
  const [w, h] = dispositivo === "ESCRITORIO" ? [1440, 1024] : [390, 844];
  const secciones = pagina?.secciones.length ? pagina.secciones : ["Encabezado", "Contenido", "Llamado a la acción"];
  const alto = (h * 0.8) / secciones.length;
  const bloques = secciones.map((s, i) => `<rect x="${w * 0.06}" y="${h * 0.12 + i * alto}" width="${w * 0.88}" height="${alto - 14}" rx="14" fill="${i === 0 ? "#3d5a40" : "#ffffff"}" stroke="#0001"/><text x="${w / 2}" y="${h * 0.12 + i * alto + alto / 2}" text-anchor="middle" font-family="sans-serif" font-size="${dispositivo === "ESCRITORIO" ? 26 : 15}" fill="${i === 0 ? "#fff" : "#4b5563"}">${esc(s)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#f6f3ee"/><rect width="100%" height="${h * 0.08}" fill="#fff"/><text x="${w * 0.05}" y="${h * 0.05}" font-family="sans-serif" font-weight="700" font-size="${dispositivo === "ESCRITORIO" ? 24 : 15}" fill="#3d5a40">${esc(marca)}</text>${bloques}</svg>`;
}

// ───────────────────────────── el PDF de benchmark y flujograma

export interface DatosInforme {
  marca: string;
  /** Lo que se sacó del brief: va en la hoja de alcance. */
  insumos?: Insumos;
  /** Las capturas aprobadas, con su `src` ya resuelto. */
  bocetos?: { titulo: string; secciones: string[]; dispositivo: Dispositivo; src: string }[];
  dominio: string | null;
  dimensiones: Dimension[];
  /** Las capturas con su `src` ya resuelto (data: URI) para que el PDF no dependa de la red. */
  referencias: (Referencia & { srcEscritorio: string | null; srcMovil: string | null })[];
  hallazgos: Punto[];
  recomendaciones: Punto[];
  flujograma: PaginaFlujo[];
  fecha: string;
  /** 9 nov (fase 1): copywriting, matriz, pendientes y lo que pide el proyecto. */
  estrategia?: Estrategia | null;
}

/** Texto claro u oscuro según el fondo (para la portada con el color de la marca). */
function textoSobre(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.62 ? "#1d2433" : "#fff";
}

/** Una captura con sus marcas numeradas encima (verde lo que tomamos, rojo lo que evitamos). */
function capturaMarcada(src: string, marcas: MarcaCaptura[], clase: string, pie: string) {
  const ms = marcas.map((m) => `<span class="marca ${m.tipo === "TOMAR" ? "toma" : "evita"}" style="left:${m.x}%;top:${m.y}%">${m.n}</span>`).join("");
  return `<figure class="${clase}"><div class="marco"><img src="${src}" alt="">${ms}</div><figcaption>${pie}</figcaption></figure>`;
}

/**
 * HTML del entregable «Benchmark y flujograma» con la línea del benchmark de Instituto Palestra:
 * portada, competencia, ficha por referencia, score card, hallazgos, recomendaciones y el flujograma
 * de navegación y estructural. Es lo que se imprime en PDF; firma Inoo, no la IA.
 */
export function informeHtml(d: DatosInforme): string {
  const pie = `<footer>${esc(d.dominio ?? d.marca)}</footer>`;
  // Sin referencias calificadas ni hallazgos, el documento es solo el flujograma (sin portada de benchmark vacía).
  const conBenchmark = d.referencias.length > 0 || d.hallazgos.length > 0 || d.recomendaciones.length > 0;
  const portada = (n: string, t: string) => `<section class="hoja portada"><span class="num">${n}</span><h1>${t}</h1>${pie}</section>`;
  // 8 nov (reunión del 6): sin puntajes. Cada referencia va con sus capturas y un comentario corto.
  const fichas = d.referencias.map((r, i) => {
    const marcas = r.marcas ?? [];
    const de = (c: "ESCRITORIO" | "MOVIL") => marcas.filter((m) => m.captura === c);
    const lista = (tipo: "TOMAR" | "EVITAR", titulo: string) => {
      const xs = marcas.filter((m) => m.tipo === tipo);
      return xs.length ? `<div class="lista ${tipo === "TOMAR" ? "toma" : "evita"}"><h3>${titulo}</h3><ol>${xs.map((m) => `<li><b>${m.n}</b>${esc(m.texto)}</li>`).join("")}</ol></div>` : "";
    };
    return `<section class="hoja ficha"><header><span class="et">Benchmark · ${i + 1}</span><h2>${esc(r.nombre)}</h2><span class="url">${esc(r.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</span>${marcas.length ? `<span class="leyenda"><i class="toma"></i>Tomamos <i class="evita"></i>Evitamos</span>` : ""}</header>
<div class="capturas">${r.srcEscritorio ? capturaMarcada(r.srcEscritorio, de("ESCRITORIO"), "esc", "Escritorio") : ""}${r.srcMovil ? capturaMarcada(r.srcMovil, de("MOVIL"), "mov", "Móvil") : ""}</div>
${marcas.length ? `<div class="listas">${lista("TOMAR", "Lo que tomamos")}${lista("EVITAR", "Lo que evitamos")}</div>` : r.resumen ? `<p class="resumen">${esc(r.resumen)}</p>` : ""}${pie}</section>`;
  }).join("");
  const scorecard = "";
  const puntos = (et: string, titulo: string, xs: Punto[]) => (xs.length ? `<section class="hoja"><span class="et">${et}</span><h2>${titulo}</h2><div class="puntos">${xs.map((x) => `<article><h3>${esc(x.titulo)}</h3><p>${esc(x.texto)}</p></article>`).join("")}</div>${pie}</section>` : "");
  const niveles = [0, 1, 2, 3].map((n) => d.flujograma.filter((p) => p.nivel === n)).filter((xs) => xs.length);
  const nombresNivel = ["Entrada", "Secciones", "Subsecciones", "Detalle"];
  const navegacion = d.flujograma.length
    ? `<section class="hoja"><span class="et">Flujograma de navegación</span><h2>Páginas por nivel</h2>${niveles.map((xs, n) => `<div class="nivel"><span class="nn">Nivel ${n} — ${nombresNivel[n]}</span><div class="cajas">${xs.map((p) => `<div class="caja n${n}"><strong>${esc(p.titulo)}</strong>${p.descripcion ? `<span>${esc(p.descripcion)}</span>` : ""}${p.padreId ? `<em>desde ${esc(d.flujograma.find((x) => x.id === p.padreId)?.titulo ?? "")}</em>` : ""}</div>`).join("")}</div></div>`).join("")}${pie}</section>
<section class="hoja"><span class="et">Flujograma estructural</span><h2>Secciones de cada página</h2><div class="estructura">${d.flujograma.map((p) => `<div class="pag"><strong>${esc(p.titulo)}</strong><ol>${p.secciones.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`).join("")}</div>${pie}</section>`
    : "";
  const i = d.insumos;
  const datoAlcance = (k: string, v: string | null | undefined) => (v ? `<div class="dato"><span>${esc(k)}</span><p>${esc(v)}</p></div>` : "");
  const alcance = i
    ? `<section class="hoja"><span class="et">Alcance</span><h2>Lo que vamos a construir</h2><div class="datos">${[
      datoAlcance("Tipo de sitio", TIPO_WEB[i.variante ?? ""] ?? "Sitio web"), datoAlcance("Objetivo", i.objetivo), datoAlcance("Público", i.publico), datoAlcance("Alcance", i.alcance),
      datoAlcance("Plataforma", i.cms ? `${i.cms.charAt(0)}${i.cms.slice(1).toLowerCase()}` : null), datoAlcance("Secciones pedidas", i.secciones.join(", ") || null),
      datoAlcance("Mensaje central", i.mensajeCentral), datoAlcance("Tono", i.tono), datoAlcance("Tipografías", i.tipografias?.join(", ") || null),
      datoAlcance("Manual de marca", i.manualUrl),
    ].join("")}${i.logoUrl ? `<div class="dato"><span>Logo</span><p><img src="${esc(i.logoUrl)}" alt="" style="max-height:18mm;max-width:60mm"></p></div>` : ""}</div>${i.paleta?.length ? `<div class="paleta">${i.paleta.map((c) => `<span style="background:${esc(c)}"><em>${esc(c)}</em></span>`).join("")}</div>` : ""}${pie}</section>`
    : "";
  const e = d.estrategia ?? null;
  const esp = e?.especificaciones ?? null;
  const estrategia = i && (i.objetivo || i.propuestaValor || i.kpis?.length)
    ? `<section class="hoja"><span class="et">Estrategia</span><h2>Brief consolidado</h2><div class="datos">${[
      datoAlcance("Objetivo del negocio", i.objetivo), datoAlcance("Público objetivo", i.publico), datoAlcance("Propuesta de valor", i.propuestaValor ?? null),
      datoAlcance("Tono de marca", i.tono), datoAlcance("Mensaje central", i.mensajeCentral),
    ].join("")}</div>${i.kpis?.length ? `<h3 class="sub">KPIs del sitio</h3><ul class="kpis">${i.kpis.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""}${pie}</section>`
    : "";
  const catalogo = esp && (esp.catalogo.categorias.length || esp.whatsapp.campos.length || esp.whatsapp.numero)
    ? `<section class="hoja"><span class="et">Arquitectura</span><h2>Catálogo y cotización</h2><div class="dos">
<div>${esp.catalogo.categorias.length ? `<h3 class="sub">Categorías</h3><div class="chips">${esp.catalogo.categorias.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
${esp.catalogo.atributos.length ? `<h3 class="sub">Atributos de cada producto</h3><div class="chips">${esp.catalogo.atributos.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
<p class="nota">${esp.catalogo.conPrecio === null ? "" : esp.catalogo.conPrecio ? "Con precio visible. " : "Sin precio visible: se cotiza. "}${esp.catalogo.cantidad ? `Alrededor de ${esp.catalogo.cantidad} productos.` : ""}</p>
${esp.whatsapp.campos.length ? `<h3 class="sub">Datos que se piden en el formulario</h3><ul class="campos">${esp.whatsapp.campos.map((c) => `<li>${esc(c.nombre)}${c.obligatorio ? " <em>obligatorio</em>" : ""}</li>`).join("")}</ul>` : ""}</div>
<div><h3 class="sub">Así llega la cotización${esp.whatsapp.numero ? ` al ${esc(esp.whatsapp.numero)}` : ""}</h3><pre class="wsp">${esc(mensajeWhatsappEjemplo(d.marca, esp))}</pre></div></div>${pie}</section>`
    : "";
  const matriz = e?.funcionalidades.length
    ? `<section class="hoja"><span class="et">Alcance</span><h2>Matriz de funcionalidades</h2><div class="dos">${(["IMPRESCINDIBLE", "DESEABLE"] as const).map((pr) => {
      const xs = e.funcionalidades.filter((f) => f.prioridad === pr);
      return `<div><h3 class="sub">${pr === "IMPRESCINDIBLE" ? "Imprescindibles" : "Deseables"}</h3>${xs.map((f) => `<article class="func ${pr === "IMPRESCINDIBLE" ? "imp" : ""}"><strong>${esc(f.nombre)}</strong>${f.descripcion ? `<p>${esc(f.descripcion)}</p>` : ""}</article>`).join("") || "<p class=\"nota\">—</p>"}</div>`;
    }).join("")}</div>${pie}</section>`
    : "";
  const copy = e?.copy;
  const copywriting = copy
    ? `${copy.heros.length ? `<section class="hoja"><span class="et">Copywriting</span><h2>Opciones de hero</h2><div class="heros">${copy.heros.map((h, n) => `<article><span class="et">Opción ${n + 1}</span><h3>${esc(h.titulo)}</h3><p>${esc(h.subtitulo)}</p>${h.cta ? `<span class="cta">${esc(h.cta)}</span>` : ""}</article>`).join("")}</div>${pie}</section>` : ""}
${copy.paginas.length ? `<section class="hoja"><span class="et">Copywriting</span><h2>Textos por página</h2><div class="estructura">${copy.paginas.map((pg) => `<div class="pag"><strong>${esc(pg.pagina)}</strong>${pg.bloques.map((b) => `<p><b>${esc(b.nombre)}:</b> ${esc(b.texto)}</p>`).join("")}</div>`).join("")}</div>${pie}</section>` : ""}
${copy.ctas.length || copy.microcopys.length ? `<section class="hoja"><span class="et">Copywriting</span><h2>Botones y microcopys</h2><div class="dos"><div>${copy.ctas.length ? `<h3 class="sub">Botones</h3><div class="chips">${copy.ctas.map((c) => `<span class="cta">${esc(c)}</span>`).join("")}</div>` : ""}</div><div>${copy.microcopys.length ? `<h3 class="sub">Microcopys del flujo</h3><ul class="campos">${copy.microcopys.map((m) => `<li><em>${esc(m.momento)}:</em> ${esc(m.texto)}</li>`).join("")}</ul>` : ""}</div></div>${pie}</section>` : ""}
${copy.faq.length ? `<section class="hoja"><span class="et">Copywriting</span><h2>Preguntas frecuentes</h2><div class="puntos">${copy.faq.map((f) => `<article><h3>${esc(f.pregunta)}</h3><p>${esc(f.respuesta)}</p></article>`).join("")}</div>${pie}</section>` : ""}`
    : "";
  const pendientes = e?.pendientes.length
    ? `<section class="hoja"><span class="et">Para validar</span><h2>Pendientes y supuestos</h2><p class="intro">Antes de diseñar, confirmemos estos puntos:</p><ol class="pend">${e.pendientes.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>${pie}</section>`
    : "";
  const cierre = `<section class="hoja portada cierre"><h1>Gracias</h1><p>${esc(d.marca)} · Fase 1 · Estrategia y alcance</p><span class="firma">creado por INOO AGENCIA DE MARKETING</span></section>`;
  const bocetos = (d.bocetos ?? []).map((x, n) => `<section class="hoja boceto"><span class="et">Propuesta visual · ${n + 1}</span><h2>${esc(x.titulo)}</h2><div class="lienzo ${x.dispositivo === "MOVIL" ? "movil" : ""}"><img src="${x.src}" alt=""></div>${x.secciones.length ? `<p class="secs">${x.secciones.map(esc).join(" · ")}</p>` : ""}${pie}</section>`).join("");
  const numero = (() => {
    let n = 0;
    return () => String(++n).padStart(2, "0");
  })();
  // 9 nov: el PDF lleva la marca del cliente (sus dos primeros colores); sin paleta, los de Inoo.
  const c1 = i?.paleta?.[0] ?? "#14213d";
  const c2 = i?.paleta?.[1] ?? "#e76f51";
  const sobre = textoSobre(c1);
  const portadaInicial = `<section class="hoja portada inicial">${i?.logoUrl ? `<img class="logo" src="${esc(i.logoUrl)}" alt="">` : ""}<span class="num">Fase 1 · Estrategia y alcance</span><h1>${esc(d.marca)}</h1><p>Propuesta de sitio web</p></section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Fase 1 · Estrategia y alcance · ${esc(d.marca)}</title>${i?.tipografias?.[0] ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(i.tipografias[0])}:wght@400;700&display=swap">` : ""}<style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:${i?.tipografias?.[0] ? `"${esc(i.tipografias[0])}",` : ""}"Helvetica Neue",Arial,sans-serif;color:#1d2433;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hoja{width:297mm;height:210mm;padding:16mm 18mm 14mm;position:relative;page-break-after:always;overflow:hidden;background:#fff}
.portada{background:${c1};color:${sobre};display:flex;flex-direction:column;justify-content:center}.inicial .logo{max-height:28mm;max-width:90mm;object-fit:contain;margin-bottom:10mm;background:#fff;border-radius:8px;padding:4mm}.inicial p,.cierre p{font-size:18px;opacity:.8}.cierre .firma{position:absolute;bottom:14mm;left:18mm;font-size:13px;letter-spacing:.14em;text-transform:uppercase;font-weight:700}.portada h1{font-size:64px;margin:0}.portada .num{font-size:22px;opacity:.6}
footer{position:absolute;bottom:8mm;right:18mm;font-size:10px;opacity:.55}.et{text-transform:uppercase;letter-spacing:.12em;font-size:11px;color:${c2};font-weight:700}
h2{font-size:30px;margin:4px 0 14px}.intro{font-size:16px;line-height:1.6;max-width:150mm}
.ficha header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}.ficha h2{margin:0}.url{color:#64748b;font-size:13px}.global{margin-left:auto;background:#14213d;color:#fff;border-radius:20px;padding:4px 12px;font-weight:700}
.capturas{display:flex;gap:10mm;margin:8mm 0 6mm;height:88mm}.capturas figure{margin:0;display:flex;flex-direction:column;gap:4px}.capturas img{height:82mm;border:1px solid #e2e8f0;border-radius:6px;object-fit:cover;object-position:top}.esc img{width:146mm}.mov img{width:40mm}figcaption{font-size:10px;color:#64748b}
.puntajes{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 14px}.puntajes li{display:grid;grid-template-columns:1fr auto;font-size:12px;border-top:1px solid #e2e8f0;padding-top:4px}.dim{font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.06em}.pts{font-weight:700;color:#e76f51}.com{grid-column:1/-1;color:#475569}
.resumen{font-size:14px;line-height:1.55;color:#334155;margin-top:8px;max-width:200mm}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:center}th:first-child,td:first-child{text-align:left}thead th{background:#14213d;color:#fff}.c1,.c2{background:#fde2e1}.c3{background:#fff4d6}.c4,.c5{background:#dcfce7}.total td{font-weight:700;background:#f1f5f9}
.puntos{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.puntos h3{margin:0 0 4px;font-size:16px;color:${c1}}.puntos p{margin:0;font-size:13px;line-height:1.5;color:#334155}
.nivel{margin-bottom:6mm}.nn{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase}.cajas{display:flex;flex-wrap:wrap;gap:4mm;margin-top:2mm}.caja{border-radius:8px;padding:6px 10px;min-width:40mm;max-width:62mm;display:flex;flex-direction:column;gap:2px;font-size:11px;border:1px solid #cbd5e1}.caja strong{font-size:13px}.caja em{color:#94a3b8;font-size:10px}.n0{background:${c1};color:${sobre};border:0}.n1{background:${c2};color:${textoSobre(c2)};border:0}.n2{background:#fff4ec}.n3{background:#f8fafc}
.estructura{display:grid;grid-template-columns:repeat(4,1fr);gap:5mm}.pag{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:11px}.pag strong{font-size:13px;color:${c1}}.pag ol{margin:4px 0 0;padding-left:16px}
.datos{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm 10mm}.dato span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b}.dato p{margin:2px 0 0;font-size:13px;line-height:1.45}
.paleta{display:flex;gap:4mm;margin-top:8mm}.paleta span{width:28mm;height:18mm;border-radius:6px;border:1px solid #e2e8f0;display:flex;align-items:flex-end;padding:3px 5px}.paleta em{font-size:9px;font-style:normal;background:#fff;border-radius:3px;padding:0 3px}
.marco{position:relative;display:inline-block}.marco img{display:block}.marca{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px #0005}.marca.toma,.leyenda i.toma{background:#16a34a}.marca.evita,.leyenda i.evita{background:#dc2626}
.leyenda{margin-left:auto;font-size:11px;display:flex;gap:6px;align-items:center}.leyenda i{display:inline-block;width:10px;height:10px;border-radius:50%}
.capturas .esc .marco{width:146mm;max-height:82mm;overflow:hidden;border:1px solid #e2e8f0;border-radius:6px}.capturas .mov .marco{width:40mm;max-height:82mm;overflow:hidden;border:1px solid #e2e8f0;border-radius:6px}.capturas .marco img{width:100%;height:auto;border:0;border-radius:0}
.listas{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.lista h3{margin:0 0 3px;font-size:13px}.lista.toma h3{color:#16a34a}.lista.evita h3{color:#dc2626}.lista ol{list-style:none;margin:0;padding:0;display:grid;gap:3px}.lista li{font-size:11.5px;line-height:1.4;display:flex;gap:6px}.lista li b{flex:none;width:17px;height:17px;border-radius:50%;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center}.lista.toma li b{background:#16a34a}.lista.evita li b{background:#dc2626}
.sub{font-size:14px;margin:8mm 0 3mm;color:${c1}}.kpis{margin:0;padding-left:18px;font-size:14px;line-height:1.7}.dos{display:grid;grid-template-columns:1fr 1fr;gap:12mm}.chips{display:flex;flex-wrap:wrap;gap:3mm}.chips span{border:1px solid #cbd5e1;border-radius:14px;padding:3px 10px;font-size:12px}.chips .cta,.cta{background:${c2};color:${textoSobre(c2)};border:0;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;display:inline-block}
.nota{font-size:12px;color:#64748b}.campos{margin:0;padding-left:18px;font-size:12.5px;line-height:1.7}.campos em{color:#64748b;font-size:11px}.wsp{background:#e7f8ee;border:1px solid #b7e4c7;border-radius:10px;padding:10px 14px;font-family:inherit;font-size:12.5px;line-height:1.55;white-space:pre-wrap}
.func{border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;margin-bottom:3mm}.func.imp{border-left:4px solid ${c2}}.func strong{font-size:13px}.func p{margin:2px 0 0;font-size:11.5px;color:#475569}
.heros{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}.heros article{border:1px solid #e2e8f0;border-radius:10px;padding:10mm 8mm;background:#f8fafc}.heros h3{font-size:20px;margin:6px 0;color:${c1}}.heros p{font-size:13px;color:#334155;line-height:1.5}
.pag p{margin:3px 0 0;line-height:1.4}.pend{font-size:15px;line-height:1.9;max-width:220mm}
.boceto h2{margin-bottom:6mm}.lienzo{height:140mm;display:flex;justify-content:center}.lienzo img{height:100%;max-width:100%;object-fit:cover;object-position:top;border:1px solid #e2e8f0;border-radius:6px;box-shadow:0 4px 18px #0001}.lienzo.movil img{width:70mm}.secs{font-size:11px;color:#64748b;margin:4mm 0 0}
</style></head><body>
${portadaInicial}
${estrategia || alcance ? `${portada(numero(), "Estrategia y alcance")}${estrategia}${alcance}` : ""}
${conBenchmark ? `${portada(numero(), "Benchmark")}
<section class="hoja"><span class="et">Benchmark</span><h2>Competencia y referencias</h2><p class="intro">Este análisis cruza las necesidades del proyecto conversadas en la reunión de brief con lo que hoy ofrecen los sitios de referencia, y evalúa su identidad, su estructura y su experiencia de uso en escritorio y en el celular.</p>${pie}</section>` : ""}
${fichas}${scorecard}${puntos("Hallazgos clave", "Lo que el mercado no está haciendo bien", d.hallazgos)}${puntos("Recomendaciones", "Recomendaciones UX prioritarias", d.recomendaciones)}
${d.flujograma.length || catalogo ? portada(numero(), "Arquitectura web") : ""}${navegacion}${catalogo}
${matriz}
${copywriting ? `${portada(numero(), "Copywriting")}${copywriting}` : ""}
${bocetos ? `${portada(numero(), "Propuesta visual")}${bocetos}` : ""}
${pendientes}
${cierre}
</body></html>`;
}

// ───────────────────────────── materiales y brief desde la transcripción (9 nov)

/**
 * Materiales del cliente que el equipo sube al taller: el logo, el manual de marca, la transcripción de la reunión
 * de brief y cualquier otro archivo. El logo y el manual pasan a ser el logo y el manual del branding.
 */
export const TIPOS_MATERIAL = ["LOGO", "MANUAL", "TRANSCRIPCION", "OTRO"] as const;
export type TipoMaterial = (typeof TIPOS_MATERIAL)[number];
export interface MaterialTaller { id: string; tipo: TipoMaterial; nombre: string; mime: string; url: string; bytes: number; conTexto: boolean; creadoEn: string }
/** Lo que se guarda: además, el texto que el navegador sacó del archivo (para la IA), que no sale en la vista. */
export type MaterialGuardado = MaterialTaller & { texto?: string | null };

const MIMES_MATERIAL: Record<TipoMaterial, RegExp> = {
  LOGO: /^image\/(png|jpeg|svg\+xml|webp)$/,
  MANUAL: /^(application\/pdf|image\/(png|jpeg|webp))$/,
  TRANSCRIPCION: /^(text\/(plain|vtt|markdown)|application\/(pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|x-subrip)|text\/x-subrip)$/,
  OTRO: /^(image\/(png|jpeg|svg\+xml|webp|gif)|application\/(pdf|zip|vnd\.openxmlformats-officedocument\.[\w.]+)|text\/(plain|csv|markdown)|video\/mp4)$/,
};
export const MAX_BYTES_MATERIAL: Record<TipoMaterial, number> = { LOGO: 5_000_000, MANUAL: 25_000_000, TRANSCRIPCION: 10_000_000, OTRO: 25_000_000 };
export const MAX_MATERIALES = 30;
export const MAX_TEXTO_MATERIAL = 120_000;

export function validarMaterial(b: Record<string, unknown>): { errores: Errores; datos: { tipo: TipoMaterial; nombre: string; mime: string; base64: string | null; texto: string | null } | null } {
  const errores: Errores = [];
  const tipo = b.tipo as TipoMaterial;
  if (!TIPOS_MATERIAL.includes(tipo)) errores.push({ campo: "tipo", mensaje: "Elige qué es: logo, manual, transcripción u otro" });
  const nombre = typeof b.nombre === "string" ? b.nombre.trim().slice(0, 200) : "";
  if (!nombre) errores.push({ campo: "nombre", mensaje: "Falta el nombre del archivo" });
  const mime = typeof b.mime === "string" ? b.mime.toLowerCase() : "";
  const base64 = typeof b.base64 === "string" && b.base64 ? b.base64 : null;
  const texto = typeof b.texto === "string" && b.texto.trim() ? b.texto.slice(0, MAX_TEXTO_MATERIAL) : null;
  // La transcripción puede llegar solo como texto (pegada o leída en el navegador).
  if (!base64 && !(tipo === "TRANSCRIPCION" && texto)) errores.push({ campo: "base64", mensaje: "Falta el archivo" });
  if (base64 && TIPOS_MATERIAL.includes(tipo)) {
    if (!MIMES_MATERIAL[tipo].test(mime)) errores.push({ campo: "mime", mensaje: tipo === "LOGO" ? "El logo va en PNG, JPG, SVG o WebP" : tipo === "MANUAL" ? "El manual va en PDF o imagen" : tipo === "TRANSCRIPCION" ? "La transcripción va en texto, PDF, Word, VTT o SRT" : "Ese tipo de archivo no se puede subir" });
    if (Math.floor((base64.length * 3) / 4) > MAX_BYTES_MATERIAL[tipo]) errores.push({ campo: "base64", mensaje: `Pesa más de ${Math.round(MAX_BYTES_MATERIAL[tipo] / 1_000_000)} MB` });
  }
  return { errores, datos: errores.length ? null : { tipo, nombre, mime: mime || "text/plain", base64, texto } };
}

/** DeepSeek: de la transcripción de la reunión de brief (y el manual, si se subió) saca los datos del brief web. */
export const SISTEMA_BRIEF_WEB = `Eres analista de una agencia de marketing en Perú. Te paso la transcripción de la reunión de brief de una página web con el cliente y, si existe, el texto de su manual de marca. Saca solo lo que se dijo o está escrito; no inventes. Responde SOLO un objeto JSON con estas claves (null o [] si no se mencionó):
{"objetivo": "para qué es la web, en una o dos frases", "publico": "a quién le habla", "propuestaValor": "por qué elegirlos, en una o dos frases", "kpis": ["indicadores del sitio que se mencionaron"], "catalogo": {"categorias": ["categorías de productos"], "atributos": ["medidas, colores, modelos…"], "conPrecio": true o false o null, "cantidad": número de productos o null}, "whatsapp": {"numero": "número de destino o null", "campos": [{"nombre": "dato que se pide al cliente", "obligatorio": true}]}, "alcance": "qué incluye el proyecto (páginas, funciones, integraciones)", "cms": "WordPress, Elementor, Shopify u otro, si se dijo", "mensajeCentral": "la idea principal que debe transmitir", "tono": "cómo debe sonar", "resumenReunion": "resumen de lo acordado, pendientes y fechas, en hasta 6 líneas", "secciones": ["páginas o secciones pedidas"], "tipografias": ["fuentes de la marca"], "paleta": ["colores de la marca en #RRGGBB"], "referencias": [{"nombre": "sitio", "url": "https://…"}]}
Cada texto de hasta 550 caracteres. Hasta 20 secciones, 4 tipografías y 8 colores. Escribe en español.`;

export interface PropuestaBriefWeb { ajustes: AjustesTaller; referencias: { nombre: string; url: string }[]; especificaciones?: unknown }
export function normalizarBriefWeb(j: Record<string, unknown>): PropuestaBriefWeb {
  const t = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, 600) : undefined);
  const l = (v: unknown, max: number, largo: number, patron?: RegExp) =>
    Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === "string" ? x.trim() : "")).filter((x) => x && x.length <= largo && (!patron || patron.test(x))))].slice(0, max) : [];
  const a: AjustesTaller = {};
  for (const k of AJUSTES_TEXTO) {
    const v = t(j[k]);
    if (v) a[k] = v;
  }
  const secciones = l(j.secciones, 20, 60);
  const tipografias = l(j.tipografias, 4, 60);
  const kpis = l(j.kpis, 8, 160);
  if (kpis.length) a.kpis = kpis;
  const paleta = l((Array.isArray(j.paleta) ? j.paleta : []).map((c) => (typeof c === "string" ? c.trim().toUpperCase() : c)), 8, 7, /^#[0-9A-F]{6}$/);
  if (secciones.length) a.secciones = secciones;
  if (tipografias.length) a.tipografias = tipografias;
  if (paleta.length) a.paleta = paleta;
  const referencias = (Array.isArray(j.referencias) ? j.referencias : [])
    .map((r) => ({ nombre: typeof (r as { nombre?: unknown })?.nombre === "string" ? ((r as { nombre: string }).nombre).trim().slice(0, 80) : "", url: normalizarUrl((r as { url?: unknown })?.url) }))
    .filter((r): r is { nombre: string; url: string } => !!r.url).slice(0, 8);
  return { ajustes: a, referencias, especificaciones: { catalogo: j.catalogo, whatsapp: j.whatsapp } };
}
/** Sin IA: al menos la reunión queda resumida con su comienzo. */
export const briefPorReglas = (transcripcion: string): PropuestaBriefWeb => ({ ajustes: { resumenReunion: transcripcion.replace(/\s+/g, " ").trim().slice(0, 600) || null }, referencias: [] });
