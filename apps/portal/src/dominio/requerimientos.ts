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
  // Subir contenido (6 nov, pedido de Ernesto): para cualquier proyecto, se manda por enlace y el cliente sube sus
  // archivos (MP4, PDF, Excel, JPG, PNG o Word) sin tener cuenta.
  {
    codigo: "SUBIR_CONTENIDO", nombre: "Subir contenido", descripcion: "Sube aquí los archivos que necesitamos para tu proyecto.", servicios: [], diasHabiles: 5,
    campos: [
      c("archivos", "Tus archivos", "ARCHIVOS", true, { ayuda: "Videos MP4, PDF, Excel, imágenes JPG o PNG y Word. Hasta 100 MB cada uno." }),
      c("notas", "¿Algo que debamos saber de estos archivos?", "TEXTO_LARGO", false),
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
      : typeof v === "string" && v.length <= limiteTexto(f.tipo);
    if (!ok) {
      const mensaje =
        typeof v === "string" && v.length > limiteTexto(f.tipo) ? mensajeLargo(v.length, limiteTexto(f.tipo))
        : f.tipo === "URL" ? "Escribe un enlace que empiece con https://"
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
/**
 * Largo máximo de una respuesta de texto (20 nov). Los textos largos aceptan una transcripción completa; antes todo
 * cortaba en 5.000 y el error decía solo «Respuesta inválida».
 */
export const LIMITE_TEXTO_LARGO = 60_000;
export const LIMITE_TEXTO = 5_000;
export const limiteTexto = (tipo: string) => (tipo === "TEXTO_LARGO" || tipo === "LISTA" ? LIMITE_TEXTO_LARGO : LIMITE_TEXTO);
const miles = (n: number) => n.toLocaleString("es-PE");
export const mensajeLargo = (largo: number, max: number) =>
  `Tiene ${miles(largo)} caracteres y el máximo es ${miles(max)}. Recorta el texto o adjúntalo como archivo: lo que escribiste no se pierde.`;

/**
 * Preguntas editadas antes de enviar un formulario (20 nov, Alonso): se parte de las de la plantilla y el equipo
 * agrega, cambia o quita preguntas para ese cliente. Devuelve las preguntas limpias (una condición que apunta a una
 * pregunta quitada se descarta) o los errores.
 */
export const TIPOS_PREGUNTA = ["TEXTO", "TEXTO_LARGO", "LISTA", "URL", "OPCION", "OPCIONES", "SI_NO", "ARCHIVOS", "NUMERO", "FECHA"] as const;
export function prepararPreguntas(v: unknown): { campos: Campo[]; errores: { campo: string; mensaje: string }[] } {
  const errores: { campo: string; mensaje: string }[] = [];
  if (!Array.isArray(v) || v.length < 1 || v.length > 60) return { campos: [], errores: [{ campo: "campos", mensaje: "Deja entre 1 y 60 preguntas" }] };
  const campos: Campo[] = [];
  const claves = new Set<string>();
  v.forEach((x, i) => {
    const c = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const donde = `campos.${i}`;
    const clave = typeof c.clave === "string" ? c.clave.trim() : "";
    const etiqueta = typeof c.etiqueta === "string" ? c.etiqueta.trim() : "";
    if (!/^[A-Za-z][\w-]{0,59}$/.test(clave) || claves.has(clave)) errores.push({ campo: donde, mensaje: `Pregunta ${i + 1}: identificador inválido o repetido` });
    if (etiqueta.length < 2 || etiqueta.length > 300) errores.push({ campo: donde, mensaje: `Pregunta ${i + 1}: escribe la pregunta (hasta 300 caracteres)` });
    if (!(TIPOS_PREGUNTA as readonly unknown[]).includes(c.tipo)) errores.push({ campo: donde, mensaje: `Pregunta ${i + 1}: elige el tipo de respuesta` });
    const opciones = Array.isArray(c.opciones) ? [...new Set(c.opciones.filter((o): o is string => typeof o === "string").map((o) => o.trim()).filter(Boolean))] : [];
    const conOpciones = c.tipo === "OPCION" || c.tipo === "OPCIONES";
    if (conOpciones && (opciones.length < 2 || opciones.length > 30 || opciones.some((o) => o.length > 120))) errores.push({ campo: donde, mensaje: `Pregunta ${i + 1}: pon entre 2 y 30 opciones` });
    if (typeof c.ayuda === "string" && c.ayuda.length > 500) errores.push({ campo: donde, mensaje: `Pregunta ${i + 1}: la ayuda va hasta 500 caracteres` });
    claves.add(clave);
    const m = c.mostrarSi as { campo?: unknown; valores?: unknown } | undefined;
    campos.push({
      clave, etiqueta, tipo: c.tipo as Campo["tipo"], obligatorio: c.obligatorio === true,
      ...(typeof c.ayuda === "string" && c.ayuda.trim() ? { ayuda: c.ayuda.trim() } : {}),
      ...(conOpciones ? { opciones } : {}),
      ...(typeof c.seccion === "string" && c.seccion.trim() ? { seccion: c.seccion.trim().slice(0, 120) } : {}),
      ...(m && typeof m.campo === "string" && Array.isArray(m.valores) && m.valores.length ? { mostrarSi: { campo: m.campo, valores: m.valores.filter((x): x is string => typeof x === "string") } } : {}),
    });
  });
  // Una condición solo vale si apunta a una pregunta anterior de opción que sigue estando, y con valores que son
  // opciones de esa pregunta (25 nov: condiciones editables; si se cambian las opciones, no quedan colgando).
  const anteriores = new Map<string, Campo>();
  for (const c of campos) {
    const ref = c.mostrarSi ? anteriores.get(c.mostrarSi.campo) : undefined;
    if (c.mostrarSi) {
      const valores = ref && (ref.tipo === "OPCION" || ref.tipo === "OPCIONES") ? c.mostrarSi.valores.filter((x) => (ref.opciones ?? []).includes(x)) : [];
      if (valores.length) c.mostrarSi = { campo: c.mostrarSi.campo, valores };
      else delete c.mostrarSi;
    }
    anteriores.set(c.clave, c);
  }
  return { campos, errores };
}

export function prepararIngreso(v: unknown): { respuestas: Respuestas; errores: { campo: string; mensaje: string }[] } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { respuestas: {}, errores: [{ campo: "ingreso", mensaje: "Respuesta inválida" }] };
  const r = v as Respuestas;
  const errores = validarRespuestas(CAMPOS_INGRESO, r, true).map((e) => ({ ...e, campo: `ingreso.${e.campo}` }));
  return { respuestas: soloVisibles(CAMPOS_INGRESO, r), errores };
}

// ───────────────────────────── enlace para responder sin cuenta

/** Vigencia del enlace de un formulario (días corridos). */
export const ENLACE_FORMULARIO = { diasDefecto: 14, diasMax: 60 } as const;

/** Página pública del formulario (fuera del portal). */
export const urlFormularioPublico = (token: string) => `/f/${token}`;

/** Al enviar por el enlace se pide el nombre de quien responde (no tiene cuenta). */
export function validarNombreEnlace(v: unknown): { campo: string; mensaje: string }[] {
  return typeof v === "string" && v.trim().length >= 3 && v.trim().length <= 120 ? [] : [{ campo: "nombre", mensaje: "Escribe tu nombre y apellido" }];
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

/** 13 nov (auditoría): corregir lo que se le pidió al cliente (nombre, mensaje o plazo) mientras no esté aprobado. */
export function validarEdicionRequerimiento(b: { titulo?: unknown; mensaje?: unknown; fechaLimite?: unknown; campos?: unknown }, hoy: string): { campo: string; mensaje: string }[] {
  const errores: { campo: string; mensaje: string }[] = [];
  if (b.titulo === undefined && b.mensaje === undefined && b.fechaLimite === undefined && b.campos === undefined) errores.push({ campo: "titulo", mensaje: "No hay nada que cambiar" });
  if (b.titulo !== undefined && (typeof b.titulo !== "string" || b.titulo.trim().length < 3)) errores.push({ campo: "titulo", mensaje: "Al menos 3 caracteres" });
  if (b.mensaje !== undefined && b.mensaje !== null && typeof b.mensaje !== "string") errores.push({ campo: "mensaje", mensaje: "Mensaje no válido" });
  if (b.fechaLimite !== undefined && !(typeof b.fechaLimite === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fechaLimite) && !Number.isNaN(Date.parse(b.fechaLimite)))) {
    errores.push({ campo: "fechaLimite", mensaje: "Usa el formato AAAA-MM-DD" });
  } else if (typeof b.fechaLimite === "string" && b.fechaLimite < hoy) errores.push({ campo: "fechaLimite", mensaje: "El plazo no puede ser una fecha pasada" });
  return errores;
}

/**
 * 25 nov (reunión con Ernesto): al contratar no se manda lo que otro formulario del mismo envío ya pide. El brief web
 * pide el manual de marca o el logo, así que «Manual de marca y logo» no va aparte (se puede pedir a mano igual).
 * Los accesos sí van aparte: el brief dice a propósito que no escriban contraseñas ahí.
 */
export const CUBIERTO_POR: Readonly<Record<string, readonly string[]>> = { MANUAL_MARCA: ["BRIEF_WEB"] };
export const requerimientosAlContratar = (codigos: readonly string[]) =>
  codigos.filter((c) => !(CUBIERTO_POR[c] ?? []).some((b) => codigos.includes(b)));
