/**
 * De la transcripción de una reunión a datos del portal (2 nov 2026, fases 17 y 18). Solo para el equipo:
 *  · Alta de cliente (Comercial): de la reunión de venta salen la marca, el responsable, el ingreso (rubro,
 *    servicios, objetivos, resumen) y el alcance prometido. Comercial lo revisa antes de crear el cliente.
 *  · Resumen de reunión: al marcarla realizada salen el resumen, si hubo acuerdos y los pendientes de cada lado.
 * La IA solo propone; nada se guarda sin que una persona lo confirme. Si la IA está simulada (IA_MODO), una
 * extracción por reglas da un borrador para que el flujo funcione igual.
 */
import { CAMPOS_INGRESO, SERVICIOS_INGRESO } from "./briefs";

/** Opciones de «Tipo de proyecto (Desarrollo web)» del formulario de ingreso. */
const TIPOS_WEB = (CAMPOS_INGRESO.find((c) => c.clave === "tipoWeb")?.opciones ?? []) as readonly string[];

export const TRANSCRIPCION = { min: 120, max: 60_000 } as const;

export function validarTranscripcion(v: unknown): { campo: string; mensaje: string }[] {
  if (typeof v !== "string" || v.trim().length < TRANSCRIPCION.min) return [{ campo: "transcripcion", mensaje: `Pega la transcripción (al menos ${TRANSCRIPCION.min} caracteres)` }];
  if (v.length > TRANSCRIPCION.max) return [{ campo: "transcripcion", mensaje: `Hasta ${TRANSCRIPCION.max.toLocaleString("es-PE")} caracteres: pega solo la reunión` }];
  return [];
}

export type ServicioIngreso = (typeof SERVICIOS_INGRESO)[number];
export interface PropuestaAlta {
  nombre: string | null;
  contacto: { nombre: string | null; email: string | null; cargo: string | null };
  ingreso: { rubro: string | null; servicios: ServicioIngreso[]; objetivos: string | null; resumen: string | null; tipoWeb: string | null; cantidadProductos: number | null };
  alcance: string | null;
}
export interface PropuestaResumen {
  resumen: string;
  conAcuerdos: boolean;
  pendientes: { texto: string; de: "CLIENTE" | "INOO" }[];
}

// ───────────────────────────── prompts

export const SISTEMA_ALTA = `Eres asistente del área Comercial de Inoo, una agencia de marketing en Perú. Te pasan la transcripción de una reunión de venta con un cliente nuevo. Extrae SOLO lo que se dijo; si algo no aparece, usa null. Responde únicamente un JSON con esta forma:
{"nombre": "marca o empresa del cliente", "contacto": {"nombre": "...", "email": "...", "cargo": "..."}, "ingreso": {"rubro": "qué vende, en una línea", "servicios": [uno o más de ${SERVICIOS_INGRESO.map((s) => `"${s}"`).join(", ")}], "objetivos": "objetivos del cliente, en 1 a 3 líneas", "resumen": "resumen de lo conversado, en 3 a 6 líneas", "tipoWeb": si hay web, uno de ${TIPOS_WEB.map((s) => `"${s}"`).join(", ")}, "cantidadProductos": número de productos pactados o null}, "alcance": "lo que Inoo prometió entregar (páginas, productos, piezas, plazos), en pocas líneas"}`;

export const SISTEMA_RESUMEN = `Eres asistente del equipo de Inoo, una agencia de marketing en Perú. Te pasan la transcripción de una reunión con un cliente. El resumen lo va a leer el cliente: escríbelo en español, claro, en 3 a 6 líneas, sin nombrar herramientas internas ni IA. Los pendientes son tareas concretas que quedaron: "CLIENTE" si las tiene que entregar el cliente, "INOO" si las hace la agencia. Responde únicamente un JSON:
{"resumen": "...", "conAcuerdos": true o false, "pendientes": [{"texto": "...", "de": "CLIENTE" | "INOO"}]}`;

// ───────────────────────────── normalizar lo que responde la IA

const texto = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const correo = (v: unknown) => (typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? v.trim().toLowerCase() : null);

/** El primer objeto JSON dentro del texto (los modelos a veces lo envuelven en ```json). */
export function jsonDe(t: string): Record<string, unknown> | null {
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    const v = JSON.parse(t.slice(i, j + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function normalizarAlta(j: Record<string, unknown>): PropuestaAlta {
  const c = (j.contacto ?? {}) as Record<string, unknown>;
  const i = (j.ingreso ?? {}) as Record<string, unknown>;
  const servicios = Array.isArray(i.servicios) ? i.servicios : [];
  return {
    nombre: texto(j.nombre, 120),
    contacto: { nombre: texto(c.nombre, 120), email: correo(c.email), cargo: texto(c.cargo, 120) },
    ingreso: {
      rubro: texto(i.rubro, 300),
      servicios: SERVICIOS_INGRESO.filter((s) => servicios.some((x) => typeof x === "string" && x.trim().toLowerCase() === s.toLowerCase())),
      objetivos: texto(i.objetivos),
      resumen: texto(i.resumen, 4000),
      tipoWeb: TIPOS_WEB.find((x) => typeof i.tipoWeb === "string" && x.toLowerCase() === i.tipoWeb.trim().toLowerCase()) ?? null,
      cantidadProductos: typeof i.cantidadProductos === "number" && i.cantidadProductos > 0 && i.cantidadProductos < 100_000 ? Math.round(i.cantidadProductos) : null,
    },
    alcance: texto(j.alcance),
  };
}

export function normalizarResumen(j: Record<string, unknown>): PropuestaResumen | null {
  const resumen = texto(j.resumen, 4000);
  if (!resumen) return null;
  const pendientes = (Array.isArray(j.pendientes) ? j.pendientes : [])
    .map((p) => p as Record<string, unknown>)
    .map((p) => ({ texto: texto(p.texto, 300), de: p.de === "INOO" ? ("INOO" as const) : ("CLIENTE" as const) }))
    .filter((p): p is { texto: string; de: "CLIENTE" | "INOO" } => !!p.texto && p.texto.length >= 3)
    .slice(0, 15);
  return { resumen, conAcuerdos: j.conAcuerdos !== false, pendientes };
}

// ───────────────────────────── sin IA (modo simulado): un borrador por reglas

const PALABRAS_SERVICIO: [ServicioIngreso, RegExp][] = [
  ["Branding", /\b(branding|logo|identidad|marca gr[aá]fica|rebranding)\b/i],
  ["Social Media", /\b(redes|instagram|tiktok|facebook|social media|contenido|posts?)\b/i],
  ["Desarrollo web", /\b(web|p[aá]gina|landing|e-?commerce|tienda (en )?l[ií]nea|wordpress|shopify)\b/i],
  ["SEO", /\b(seo|posicionamiento|google org[aá]nico)\b/i],
  ["CRM", /\b(crm|cosmiq|embudo|pipeline|automatizaci[oó]n)\b/i],
];
const oraciones = (t: string) => t.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.replace(/^[^:]{1,40}:\s*/, "").trim()).filter((s) => s.length > 25);

export function altaPorReglas(t: string): PropuestaAlta {
  const email = t.match(/[^@\s<>()"']+@[^@\s<>()"']+\.[a-z]{2,}/i)?.[0] ?? null;
  const nombre = t.match(/\b(?:empresa|marca|negocio)\s+(?:se llama\s+|es\s+|llamad[ao]\s+)?[«"“]?([A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ&.'-]*(?:\s+[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ&.'-]*){0,3})/)?.[1] ?? null;
  const persona = t.match(/\b(?:soy|me llamo|habla)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/)?.[1] ?? null;
  const cargo = t.match(/\b(?:soy (?:el|la)\s+)(gerente[^,.]{0,40}|due[ñn]o|due[ñn]a|fundador[a]?|jef[ea][^,.]{0,40}|director[a]?[^,.]{0,40})/i)?.[1] ?? null;
  const frases = oraciones(t);
  const objetivos = frases.filter((s) => /\b(queremos|quiero|objetivo|buscamos|necesitamos|meta)\b/i.test(s)).slice(0, 3).join(" ") || null;
  const alcance = frases.filter((s) => /\b(\d+\s+(p[aá]ginas|productos|piezas|posts|publicaciones|semanas|d[ií]as)|incluye|entregamos|entregar[ií]amos)\b/i.test(s)).slice(0, 3).join(" ") || null;
  return {
    nombre, contacto: { nombre: persona, email: correo(email), cargo },
    ingreso: {
      rubro: null, servicios: PALABRAS_SERVICIO.filter(([, r]) => r.test(t)).map(([s]) => s), objetivos, resumen: frases.slice(0, 5).join(" ") || null,
      tipoWeb: /e-?commerce|tienda (en )?l[ií]nea/i.test(t) ? TIPOS_WEB.find((x) => /e-commerce/i.test(x)) ?? null : /landing/i.test(t) ? TIPOS_WEB.find((x) => /landing/i.test(x)) ?? null : null,
      cantidadProductos: Number(t.match(/(\d+)\s+productos/i)?.[1]) || null,
    },
    alcance,
  };
}

export function resumenPorReglas(t: string): PropuestaResumen {
  const frases = oraciones(t);
  const pendientes = frases
    .filter((s) => /\b(env[ií]a(?:r|n|mos)?|mand(?:a|ar|amos)|pasa(?:r|n)?|entreg(?:a|ar|amos)|compart(?:e|ir|imos)|prepar(?:a|ar|amos)|qued(?:a|amos) en)\b/i.test(s))
    .slice(0, 8)
    .map((s) => ({ texto: s.slice(0, 300), de: /\b(nosotros|inoo|les (envío|mando|paso)|preparamos|enviamos|mandamos|entregamos)\b/i.test(s) ? ("INOO" as const) : ("CLIENTE" as const) }));
  return { resumen: frases.slice(0, 4).join(" ") || t.trim().slice(0, 400), conAcuerdos: /\b(acordamos|quedamos|de acuerdo|perfecto|listo)\b/i.test(t), pendientes };
}
