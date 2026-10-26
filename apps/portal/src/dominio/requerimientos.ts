/**
 * Requerimientos: lo que la agencia le pide al cliente para poder avanzar (reunión del 12 oct 2026).
 * Es la única sección donde el cliente opera. Cada requerimiento sale de una plantilla con su
 * formulario, tiene fecha límite en días hábiles (hasta las 23:59 de Lima) y, si se atrasa, corre
 * el cronograma del servicio y avisa al cliente por correo.
 *
 * Las plantillas también están en database/migraciones/0008_requerimientos_agencia.sql (y 0017, 0030);
 * tests/api/db.test.ts comprueba que coinciden. Los cinco briefs son los formularios reales que Inoo tenía en
 * Monday (src/dominio/briefs.ts); el resto de preguntas todavía son de relleno.
 */
import type { components } from "../api/tipos-api";
import { CAMPOS_BRIEF_BRANDING, CAMPOS_BRIEF_MARKETING, CAMPOS_BRIEF_NAMING, CAMPOS_BRIEF_PERFORMANCE, CAMPOS_BRIEF_WEB, CAMPOS_INGRESO } from "./briefs";
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
    codigo: "BRIEF_WEB", nombre: "Brief de diseño y desarrollo web", descripcion: "Lo que necesitamos saber para diseñar tu sitio.", servicios: ["WEB"], diasHabiles: 5,
    campos: CAMPOS_BRIEF_WEB,
  },
  {
    codigo: "BRIEF_BRANDING", nombre: "Brief de branding", descripcion: "Para conocer los alcances e intenciones de tu marca antes de diseñarla (o rediseñarla).", servicios: ["BRANDFORMANCE"], diasHabiles: 5,
    campos: CAMPOS_BRIEF_BRANDING,
  },
  {
    codigo: "BRIEF_NAMING", nombre: "Brief de naming", descripcion: "Para encontrar el nombre de tu marca.", servicios: ["BRANDFORMANCE"], diasHabiles: 5,
    campos: CAMPOS_BRIEF_NAMING,
  },
  {
    codigo: "BRIEF_PERFORMANCE", nombre: "Brief de performance", descripcion: "Tu empresa, tus metas y lo que ya probaste en publicidad digital.", servicios: ["PAID_MEDIA"], diasHabiles: 5,
    campos: CAMPOS_BRIEF_PERFORMANCE,
  },
  {
    codigo: "BRIEF_MARKETING", nombre: "Brief de marketing", descripcion: "Tu marca, tu público y tu identidad visual, para arrancar con tus redes.", servicios: ["SOCIAL_MEDIA_PRO"], diasHabiles: 5,
    campos: CAMPOS_BRIEF_MARKETING,
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
    // Solo CRM (reunión 15 oct): ahí el agente de IA es el producto; en el resto de servicios la IA no se nombra.
    codigo: "INFO_IA", nombre: "Información para tu agente de IA", descripcion: "Con esto entrenamos al agente de IA que atenderá a tus clientes por WhatsApp.", servicios: ["CRM_IMPLEMENTACION", "CRM_INTEGRACION"], diasHabiles: 3,
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
  // Lo que quedó pendiente del lado del cliente en una reunión (reunión 15 oct). Lo crea la API al
  // marcar la reunión como realizada; el título del requerimiento dice qué falta.
  {
    codigo: "PENDIENTE_REUNION", nombre: "Pendiente de la reunión", descripcion: "Lo que quedó pendiente de tu lado en la última reunión.", servicios: [], diasHabiles: 2,
    campos: [c("respuesta", "Tu respuesta", "TEXTO_LARGO"), c("archivos", "Archivos", "ARCHIVOS", false)],
  },
];

export const plantillaRequerimiento = (codigo: string) => PLANTILLAS_REQUERIMIENTO.find((p) => p.codigo === codigo);

// ───────────────────────────── respuestas

export type Respuestas = Record<string, unknown>;

export const respuestaVacia = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/**
 * Claves de las preguntas que se muestran con estas respuestas. Una pregunta con `mostrarSi` aparece solo si la
 * pregunta de la que depende está visible y su respuesta es uno de los valores (en OPCIONES, si eligió alguno);
 * así se siguen los caminos que se bifurcan (p. ej. web desde cero → tipo de proyecto → e-commerce → métodos de pago).
 */
export function camposVisibles(campos: Campo[], r: Respuestas): Set<string> {
  const visibles = new Set<string>();
  for (const f of campos) {
    const s = f.mostrarSi;
    if (s) {
      if (!visibles.has(s.campo)) continue;
      const v = r[s.campo];
      const elegidos = Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)];
      if (!elegidos.some((x) => s.valores.includes(x))) continue;
    }
    visibles.add(f.clave);
  }
  return visibles;
}

/** Lo que se guarda: solo las respuestas de preguntas visibles (si el cliente cambió de camino, lo del otro se descarta). */
export function soloVisibles(campos: Campo[], r: Respuestas): Respuestas {
  const visibles = camposVisibles(campos, r);
  return Object.fromEntries(Object.entries(r).filter(([k]) => visibles.has(k)));
}

/** Valida lo que manda el cliente. Al enviar, los obligatorios visibles no pueden quedar vacíos; al guardar borrador sí. */
export function validarRespuestas(campos: Campo[], r: Respuestas, enviar: boolean) {
  const errores: { campo: string; mensaje: string }[] = [];
  const claves = new Set(campos.map((x) => x.clave));
  for (const k of Object.keys(r)) if (!claves.has(k)) errores.push({ campo: k, mensaje: "Ese campo no es parte del formulario" });
  const visibles = camposVisibles(campos, r);
  for (const f of campos) {
    if (!visibles.has(f.clave)) continue;
    const v = r[f.clave];
    if (respuestaVacia(v)) {
      if (enviar && f.obligatorio) errores.push({ campo: f.clave, mensaje: "Este campo es obligatorio" });
      continue;
    }
    const ok =
      f.tipo === "SI_NO" ? typeof v === "boolean"
      : f.tipo === "ARCHIVOS" ? Array.isArray(v) && v.every((a) => a && typeof a === "object" && typeof (a as { archivoId?: unknown }).archivoId === "string")
      : f.tipo === "OPCION" ? typeof v === "string" && (f.opciones ?? []).includes(v)
      : f.tipo === "OPCIONES" ? Array.isArray(v) && v.every((x) => typeof x === "string" && (f.opciones ?? []).includes(x))
      : f.tipo === "NUMERO" ? typeof v === "number" && Number.isFinite(v) && v >= 0
      : f.tipo === "FECHA" ? typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
      : f.tipo === "URL" ? typeof v === "string" && /^https?:\/\/\S+\.\S+/.test(v.trim())
      : typeof v === "string" && v.length <= 5000;
    if (!ok) {
      const mensaje =
        f.tipo === "URL" ? "Escribe un enlace que empiece con https://"
        : f.tipo === "OPCION" || f.tipo === "OPCIONES" ? "Elige entre las opciones"
        : f.tipo === "NUMERO" ? "Escribe un número"
        : f.tipo === "FECHA" ? "Elige una fecha"
        : "Respuesta inválida";
      errores.push({ campo: f.clave, mensaje });
    }
  }
  // Un catálogo puede venir como archivo o como lista: al enviar, al menos una de las dos.
  if (enviar && campos.length && campos.every((f) => !f.obligatorio) && !campos.some((f) => visibles.has(f.clave) && !respuestaVacia(r[f.clave]))) {
    errores.push({ campo: campos[0].clave, mensaje: "Completa al menos un campo" });
  }
  return errores;
}

/**
 * El ingreso de cliente que manda Comercial en el alta (o al corregirlo): completo y solo con las preguntas del
 * camino elegido. Los errores llevan el prefijo «ingreso.» porque viajan en el cuerpo del cliente.
 */
export function prepararIngreso(v: unknown): { respuestas: Respuestas; errores: { campo: string; mensaje: string }[] } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { respuestas: {}, errores: [{ campo: "ingreso", mensaje: "Respuesta inválida" }] };
  const r = v as Respuestas;
  const errores = validarRespuestas(CAMPOS_INGRESO, r, true).map((e) => ({ ...e, campo: `ingreso.${e.campo}` }));
  return { respuestas: soloVisibles(CAMPOS_INGRESO, r), errores };
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
