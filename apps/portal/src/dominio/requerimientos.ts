/**
 * Requerimientos: lo que la agencia le pide al cliente para poder avanzar (reunión del 12 oct 2026).
 * Es la única sección donde el cliente opera. Cada requerimiento sale de una plantilla con su
 * formulario, tiene fecha límite en días hábiles (hasta las 23:59 de Lima) y, si se atrasa, corre
 * el cronograma del servicio y avisa al cliente por correo.
 *
 * Las plantillas también están en database/migraciones/0008_requerimientos_agencia.sql;
 * tests/api/db.test.ts comprueba que coinciden. Las preguntas son de relleno hasta que el equipo
 * pase las de sus briefs reales.
 */
import type { components } from "../api/tipos-api";
import { esHabil, sumarDiasHabiles, type CodigoServicio } from "./servicios";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
export type Campo = S<"CampoFormulario">;

export interface PlantillaRequerimientoDemo {
  codigo: string;
  nombre: string;
  descripcion: string;
  /** Servicios donde se suele pedir (vacío = cualquiera). Solo orienta al equipo. */
  servicios: CodigoServicio[];
  diasHabiles: number;
  campos: Campo[];
}

const c = (clave: string, etiqueta: string, tipo: Campo["tipo"], obligatorio = true, extra: Partial<Campo> = {}): Campo => ({ clave, etiqueta, tipo, obligatorio, ...extra });

export const PLANTILLAS_REQUERIMIENTO: PlantillaRequerimientoDemo[] = [
  {
    codigo: "BRIEF_WEB", nombre: "Brief de desarrollo web", descripcion: "Lo que necesitamos saber para diseñar tu sitio.", servicios: ["WEB"], diasHabiles: 3,
    campos: [
      c("objetivo", "¿Para qué quieres el sitio?", "TEXTO_LARGO", true, { ayuda: "Vender en línea, mostrar tus servicios, captar contactos…" }),
      c("publico", "¿A quién le habla tu sitio?", "TEXTO_LARGO"),
      c("secciones", "Secciones que imaginas", "LISTA", true, { ayuda: "Una por línea: Inicio, Nosotros, Productos, Contacto…" }),
      c("referencias", "Sitios que te gustan", "LISTA", false, { ayuda: "Un enlace por línea y, si quieres, qué te gusta de cada uno." }),
      c("dominio", "¿Ya tienes dominio y hosting?", "OPCION", true, { opciones: ["Sí, ambos", "Solo dominio", "No, necesito ayuda"] }),
      c("marca", "Logo y manual de marca", "ARCHIVOS", false),
    ],
  },
  {
    codigo: "BRIEF_BRANDING", nombre: "Brief de marca", descripcion: "Para entender tu marca antes de diseñarla (o rediseñarla).", servicios: ["BRANDFORMANCE"], diasHabiles: 5,
    campos: [
      c("historia", "Cuéntanos la historia de tu marca", "TEXTO_LARGO"),
      c("valores", "Tres palabras que la describan", "TEXTO"),
      c("competidores", "Competidores principales", "LISTA", true, { ayuda: "Uno por línea." }),
      c("evitar", "¿Qué no quieres que transmita?", "TEXTO_LARGO", false),
      c("referencias", "Marcas que admiras", "LISTA", false),
    ],
  },
  {
    codigo: "KICKOFF_CRM", nombre: "Preguntas del kickoff de CRM", descripcion: "Cómo vendes hoy, para armar tus procesos en el CRM.", servicios: ["CRM_IMPLEMENTACION", "CRM_INTEGRACION"], diasHabiles: 3,
    campos: [
      c("proceso", "¿Cómo es hoy tu proceso de venta, de principio a fin?", "TEXTO_LARGO"),
      c("vendedores", "¿Cuántas personas venden?", "TEXTO"),
      c("canales", "¿Por dónde te llegan los clientes?", "LISTA", true, { ayuda: "WhatsApp, web, redes, referidos…" }),
      c("herramientas", "Herramientas que usan hoy", "TEXTO_LARGO", false, { ayuda: "Excel, otro CRM, WhatsApp Business…" }),
      c("objetivo", "¿Qué esperas lograr con el CRM?", "TEXTO_LARGO"),
    ],
  },
  {
    codigo: "USUARIOS_CRM", nombre: "Usuarios del CRM", descripcion: "Quiénes usarán el CRM, para crear sus licencias.", servicios: ["CRM_IMPLEMENTACION", "CRM_INTEGRACION"], diasHabiles: 2,
    campos: [
      c("usuarios", "Usuarios", "LISTA", true, { ayuda: "Uno por línea: nombre, correo y cargo." }),
      c("administrador", "¿Quién será el administrador del CRM?", "TEXTO"),
    ],
  },
  {
    codigo: "BRIEF_SOCIAL", nombre: "Brief de contenido del mes", descripcion: "Lo que quieres comunicar el próximo mes en redes.", servicios: ["SOCIAL_MEDIA_PRO"], diasHabiles: 5,
    campos: [
      c("objetivo", "¿Qué quieres lograr este mes?", "TEXTO_LARGO"),
      c("fechas", "Fechas importantes", "LISTA", false, { ayuda: "Lanzamientos, promociones, eventos. Una por línea." }),
      c("productos", "Productos o servicios a destacar", "LISTA", false),
      c("material", "Fotos o videos que quieras usar", "ARCHIVOS", false),
    ],
  },
  {
    codigo: "ACCESOS_REDES", nombre: "Accesos a redes sociales", descripcion: "Para publicar y pautar en tus cuentas.", servicios: ["SOCIAL_MEDIA_PRO", "PAID_MEDIA"], diasHabiles: 2,
    campos: [
      c("cuentas", "Tus cuentas", "LISTA", true, { ayuda: "Un enlace por línea (Instagram, Facebook, TikTok…)." }),
      c("business", "¿Nos diste acceso a tu Meta Business Suite?", "SI_NO", true, { ayuda: "Agrega a accesos@inoo.pe como socio. No nos envíes contraseñas." }),
    ],
  },
  {
    codigo: "MANUAL_MARCA", nombre: "Manual de marca y logo", descripcion: "Para que todo lo que hagamos respete tu identidad.", servicios: [], diasHabiles: 2,
    campos: [c("archivos", "Manual de marca, logo y tipografías", "ARCHIVOS"), c("notas", "Algo que debamos saber", "TEXTO_LARGO", false)],
  },
  {
    codigo: "CATALOGO_PRODUCTOS", nombre: "Catálogo de productos", descripcion: "Tus productos con precio y descripción.", servicios: ["WEB", "SOCIAL_MEDIA_PRO", "PAID_MEDIA"], diasHabiles: 3,
    campos: [
      c("archivo", "Catálogo en archivo", "ARCHIVOS", false, { ayuda: "Excel o PDF. Si no lo tienes, lista los productos abajo." }),
      c("lista", "O lista tus productos", "LISTA", false, { ayuda: "Uno por línea: nombre, precio y una frase." }),
    ],
  },
  {
    codigo: "INFO_IA", nombre: "Información de tu empresa para la IA", descripcion: "Con esto entrenamos al asistente que responde por tu marca.", servicios: [], diasHabiles: 3,
    campos: [
      c("empresa", "¿Qué hace tu empresa?", "TEXTO_LARGO"),
      c("preguntas", "Preguntas frecuentes de tus clientes y sus respuestas", "LISTA", true, { ayuda: "Una por línea: pregunta → respuesta." }),
      c("tono", "¿Cómo debe hablar el asistente?", "TEXTO"),
      c("documentos", "Documentos útiles", "ARCHIVOS", false),
    ],
  },
  {
    codigo: "ACCESOS_WEB", nombre: "Acceso a tu sitio web", descripcion: "Para administrar tu web (blogs, páginas, actualizaciones).", servicios: ["SOPORTE_CONTINUO", "WEB"], diasHabiles: 2,
    campos: [
      c("url", "Dirección de tu sitio", "URL"),
      c("usuario", "¿Creaste un usuario administrador para Inoo?", "SI_NO", true, { ayuda: "Usa el correo accesos@inoo.pe. No nos envíes contraseñas." }),
    ],
  },
];

export const plantillaRequerimiento = (codigo: string) => PLANTILLAS_REQUERIMIENTO.find((p) => p.codigo === codigo);

// ───────────────────────────── respuestas

export type Respuestas = Record<string, unknown>;

/** Valida lo que manda el cliente. Al enviar, los obligatorios no pueden quedar vacíos; al guardar borrador sí. */
export function validarRespuestas(campos: Campo[], r: Respuestas, enviar: boolean) {
  const errores: { campo: string; mensaje: string }[] = [];
  const claves = new Set(campos.map((x) => x.clave));
  for (const k of Object.keys(r)) if (!claves.has(k)) errores.push({ campo: k, mensaje: "Ese campo no es parte del formulario" });
  for (const f of campos) {
    const v = r[f.clave];
    const vacio = v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
    if (vacio) {
      if (enviar && f.obligatorio) errores.push({ campo: f.clave, mensaje: "Este campo es obligatorio" });
      continue;
    }
    const ok =
      f.tipo === "SI_NO" ? typeof v === "boolean"
      : f.tipo === "ARCHIVOS" ? Array.isArray(v) && v.every((a) => a && typeof a === "object" && typeof (a as { archivoId?: unknown }).archivoId === "string")
      : f.tipo === "OPCION" ? typeof v === "string" && (f.opciones ?? []).includes(v)
      : f.tipo === "URL" ? typeof v === "string" && /^https?:\/\/\S+\.\S+/.test(v.trim())
      : typeof v === "string" && v.length <= 5000;
    if (!ok) errores.push({ campo: f.clave, mensaje: f.tipo === "URL" ? "Escribe un enlace que empiece con https://" : f.tipo === "OPCION" ? "Elige una de las opciones" : "Respuesta inválida" });
  }
  // Un catálogo puede venir como archivo o como lista: al enviar, al menos una de las dos.
  if (enviar && campos.length && campos.every((f) => !f.obligatorio)) {
    const alguno = campos.some((f) => {
      const v = r[f.clave];
      return v !== undefined && v !== null && !(typeof v === "string" && !v.trim()) && !(Array.isArray(v) && v.length === 0);
    });
    if (!alguno) errores.push({ campo: campos[0].clave, mensaje: "Completa al menos un campo" });
  }
  return errores;
}

// ───────────────────────────── plazos y atrasos

/** Fecha límite: `dias` hábiles después de la emisión (emitido el viernes con 2 días → martes 23:59). */
export const fechaLimite = (emitidoEn: string, dias: number, feriados?: ReadonlySet<string>) => sumarDiasHabiles(emitidoEn.slice(0, 10), dias, feriados);

/** Días hábiles de atraso: los hábiles después de la fecha límite hasta `hasta` (hoy o el día en que se envió). */
export function diasAtraso(limite: string, hasta: string, feriados: ReadonlySet<string> = new Set()): number {
  let n = 0;
  const d = new Date(`${limite}T12:00:00Z`);
  const fin = hasta.slice(0, 10);
  for (;;) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso > fin) return n;
    if (esHabil(iso, feriados)) n++;
  }
}

/** Corre una fecha `n` días hábiles (el cronograma del servicio cuando el cliente se atrasa). */
export const correrFecha = (fecha: string | null, n: number, feriados?: ReadonlySet<string>) => (fecha && n > 0 ? sumarDiasHabiles(fecha, n, feriados) : fecha);

/** Un requerimiento cuenta como pendiente para el cliente si no lo envió o si el equipo le pidió corregirlo. */
export const pendienteParaCliente = (estado: string) => estado === "PENDIENTE" || estado === "OBSERVADO";

/** Días hábiles que le quedan al cliente antes de la fecha límite: 0 = vence hoy (o ya venció). */
export const diasParaVencer = (limite: string, hoy: string, feriados?: ReadonlySet<string>) => diasAtraso(hoy.slice(0, 10), limite, feriados);

export type Semaforo = "VERDE" | "NARANJA" | "ROJO";

/**
 * Semáforo de lo que el cliente tiene pendiente (reunión 15 oct): verde con tiempo, naranja si vence hoy o
 * el siguiente día hábil, rojo si ya está atrasado. Lo enviado o aprobado no lleva semáforo.
 */
export function semaforoRequerimiento(r: { estado: string; diasAtraso: number; diasParaVencer: number }): Semaforo | null {
  if (!pendienteParaCliente(r.estado)) return null;
  if (r.diasAtraso > 0) return "ROJO";
  return r.diasParaVencer <= 1 ? "NARANJA" : "VERDE";
}
