/**
 * IA para el cliente (fase 16a, pedido del CEO el 17 oct, inspirado en Cosmiq CRM). Sección «Agentes de
 * IA», siempre visible para todos los clientes: crea sus propios agentes, los prueba en un chat y genera
 * contenido con Content AI. Es la IA que el cliente ELIGE usar, por eso aquí sí se nombra; la IA que
 * Inoo usa para su trabajo sigue invisible (ver docs/diseno.md, «La IA no se nota»).
 *
 * Reglas puras, compartidas por la API simulada y el backend real: plantillas, validación, búsqueda de
 * artículos relevantes, instrucciones para el modelo, respuestas simuladas y consumo. Las tarifas son de
 * relleno hasta que se definan.
 */
import type { components } from "../api/tipos-api";

type S<K extends keyof components["schemas"]> = components["schemas"][K];
export type AccionAgente = S<"AccionAgente">;
export type Tono = S<"TonoAgente">;
export type DestinoContenido = S<"DestinoContenido">;
type Errores = { campo: string; mensaje: string }[];

// ───────────────────────────── tarifas y topes (relleno)

/** Lo que paga el cliente, en soles (relleno hasta definir precios). */
export const TARIFAS_PEN = { mensajeAgente: 0.05, mensajeAgenteAvanzado: 0.2, contenidoPorVariacion: 0.03 } as const;
/** El tope mensual del cliente es su límite de gasto de IA (en USD) convertido a soles. Relleno. */
export const TIPO_CAMBIO_PEN = 3.75;
export const ALERTA_CONSUMO_IA = 0.8;

// ───────────────────────────── ahorro de tokens (fase de prueba)

export const LIMITES = {
  tokensRespuestaAgente: 300,
  tokensContenido: 800,
  tokensBorrador: 1200,
  historial: 6,
  articulosRelevantes: 3,
  caracteresArticulo: 1200,
} as const;

// ───────────────────────────── catálogos

export const ACCIONES: { codigo: AccionAgente; nombre: string; descripcion: string }[] = [
  { codigo: "CREAR_LEAD", nombre: "Registrar interesados", descripcion: "Guarda nombre y contacto de quien quiere comprar o cotizar." },
  { codigo: "AGENDAR_CITA", nombre: "Agendar citas", descripcion: "Propone horarios y reserva una cita o reunión." },
  { codigo: "ENVIAR_CATALOGO", nombre: "Enviar catálogo y precios", descripcion: "Comparte el catálogo o la lista de precios." },
  { codigo: "DERIVAR_PERSONA", nombre: "Pasar con una persona", descripcion: "Deriva la conversación a alguien de tu equipo." },
];
export const TONOS: { codigo: Tono; nombre: string }[] = [
  { codigo: "CERCANO", nombre: "Cercano" },
  { codigo: "FORMAL", nombre: "Formal" },
  { codigo: "ENTUSIASTA", nombre: "Entusiasta" },
];
export const DESTINOS: { codigo: DestinoContenido; nombre: string }[] = [
  { codigo: "REDES", nombre: "Redes sociales" },
  { codigo: "BLOG", nombre: "Blog" },
  { codigo: "EMAIL", nombre: "Email" },
  { codigo: "WEB", nombre: "Página web" },
  { codigo: "CONVERSACION", nombre: "Respuesta a clientes" },
];

/**
 * Plantillas hechas por Inoo (no un marketplace). Solo para la operación del propio cliente; las de
 * contenido viven dentro de Content AI.
 */
export const PLANTILLAS_AGENTE: S<"PlantillaAgente">[] = [
  {
    codigo: "RECEPCIONISTA", categoria: "AGENTE", nombre: "Recepcionista y preguntas frecuentes", descripcion: "Responde lo que más te preguntan: horarios, ubicación, servicios y precios.",
    rol: "Recepcionista virtual", tono: "CERCANO", saludo: "¡Hola! Soy el asistente virtual. ¿En qué te puedo ayudar?",
    instrucciones: "Responde preguntas sobre el negocio usando solo la información de la base de conocimiento. Sé breve y amable. Si no sabes algo, dilo y ofrece pasar con una persona.",
    acciones: ["DERIVAR_PERSONA"],
  },
  {
    codigo: "CALIFICAR_LEAD", categoria: "AGENTE", nombre: "Calificar interesados", descripcion: "Pregunta lo justo para saber si alguien está listo para comprar y guarda su contacto.",
    rol: "Asesor comercial", tono: "ENTUSIASTA", saludo: "¡Hola! Cuéntame qué estás buscando y te ayudo a encontrar la mejor opción.",
    instrucciones: "Averigua qué necesita la persona, para cuándo y su presupuesto aproximado. Cuando muestre interés real, pide su nombre y teléfono para registrarlo. No inventes precios.",
    acciones: ["CREAR_LEAD", "ENVIAR_CATALOGO", "DERIVAR_PERSONA"],
  },
  {
    codigo: "AGENDAR_CITA", categoria: "AGENTE", nombre: "Agendar citas", descripcion: "Ofrece horarios disponibles y reserva citas o reuniones.",
    rol: "Agenda de citas", tono: "FORMAL", saludo: "Buen día. Puedo ayudarte a reservar una cita. ¿Qué día te acomoda?",
    instrucciones: "Ayuda a la persona a elegir día y hora. Confirma nombre, teléfono y motivo antes de reservar. Atendemos de lunes a viernes de 9:00 a 18:00.",
    acciones: ["AGENDAR_CITA", "DERIVAR_PERSONA"],
  },
  {
    codigo: "FUERA_DE_HORARIO", categoria: "AGENTE", nombre: "Fuera de horario", descripcion: "Atiende cuando tu equipo no está y deja todo listo para el día siguiente.",
    rol: "Asistente fuera de horario", tono: "CERCANO", saludo: "¡Hola! Ahora estamos fuera de horario, pero te ayudo con lo que pueda.",
    instrucciones: "Explica que el equipo responde al siguiente día hábil. Resuelve lo que puedas con la base de conocimiento y registra los datos de contacto de quien necesite que lo llamen.",
    acciones: ["CREAR_LEAD"],
  },
  {
    codigo: "ATENCION_CLIENTE", categoria: "AGENTE", nombre: "Atención al cliente", descripcion: "Resuelve dudas de pedidos, cambios y devoluciones.",
    rol: "Atención al cliente", tono: "CERCANO", saludo: "¡Hola! Estoy para ayudarte con tu pedido. ¿Qué pasó?",
    instrucciones: "Ayuda con el estado de pedidos, cambios y devoluciones según las políticas de la base de conocimiento. Si la persona está molesta o el caso es delicado, pásala con una persona.",
    acciones: ["DERIVAR_PERSONA"],
  },
  {
    codigo: "POST_REDES", categoria: "CONTENIDO", nombre: "Post para redes", descripcion: "Un post corto con llamado a la acción.",
    rol: "Redactor", tono: "CERCANO", saludo: "", instrucciones: "Escribe un post de redes sociales sobre: ", acciones: [],
  },
  {
    codigo: "EMAIL_PROMOCION", categoria: "CONTENIDO", nombre: "Email de promoción", descripcion: "Asunto y cuerpo para una promoción o novedad.",
    rol: "Redactor", tono: "ENTUSIASTA", saludo: "", instrucciones: "Escribe un email de promoción sobre: ", acciones: [],
  },
];
export const plantillaAgente = (codigo: string | null | undefined) => PLANTILLAS_AGENTE.find((p) => p.codigo === codigo);

// ───────────────────────────── validación

export function validarAgente(b: Partial<S<"AgenteIaEntrada">>, parcial: boolean): Errores {
  const e: Errores = [];
  const texto = (k: keyof S<"AgenteIaEntrada">, min: number, max: number, mensaje: string) => {
    const v = b[k];
    if ((!parcial || v !== undefined) && !(typeof v === "string" && v.trim().length >= min && v.trim().length <= max)) e.push({ campo: k, mensaje });
  };
  texto("nombre", 3, 60, "Ponle un nombre (3 a 60 caracteres)");
  if (b.rol !== undefined && !(typeof b.rol === "string" && b.rol.length <= 80)) e.push({ campo: "rol", mensaje: "Hasta 80 caracteres" });
  if (b.saludo !== undefined && !(typeof b.saludo === "string" && b.saludo.length <= 300)) e.push({ campo: "saludo", mensaje: "Hasta 300 caracteres" });
  if (b.instrucciones !== undefined && !(typeof b.instrucciones === "string" && b.instrucciones.length <= 4000)) e.push({ campo: "instrucciones", mensaje: "Hasta 4000 caracteres" });
  if (b.derivarCuando !== undefined && b.derivarCuando !== null && !(typeof b.derivarCuando === "string" && b.derivarCuando.length <= 500)) e.push({ campo: "derivarCuando", mensaje: "Hasta 500 caracteres" });
  if (b.tono !== undefined && !TONOS.some((t) => t.codigo === b.tono)) e.push({ campo: "tono", mensaje: "Usa CERCANO, FORMAL o ENTUSIASTA" });
  if (b.acciones !== undefined && !(Array.isArray(b.acciones) && b.acciones.every((a) => ACCIONES.some((x) => x.codigo === a)))) e.push({ campo: "acciones", mensaje: "Acción desconocida" });
  if (b.conocimientoIds !== undefined && !(Array.isArray(b.conocimientoIds) && b.conocimientoIds.every((x) => typeof x === "string"))) e.push({ campo: "conocimientoIds", mensaje: "Lista de bases de conocimiento" });
  if (b.plantillaCodigo !== undefined && b.plantillaCodigo !== null && !plantillaAgente(b.plantillaCodigo)) e.push({ campo: "plantillaCodigo", mensaje: "Plantilla desconocida" });
  if (b.estado !== undefined && !["BORRADOR", "PUBLICADO", "PAUSADO"].includes(b.estado as string)) e.push({ campo: "estado", mensaje: "Estado inválido" });
  return e;
}

export function validarBase(b: Partial<S<"BaseConocimientoEntrada">>, parcial: boolean): Errores {
  const e: Errores = [];
  if ((!parcial || b.nombre !== undefined) && !(typeof b.nombre === "string" && b.nombre.trim().length >= 3 && b.nombre.length <= 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (3 a 80 caracteres)" });
  if (b.articulos !== undefined) {
    if (!Array.isArray(b.articulos) || b.articulos.length > 100) e.push({ campo: "articulos", mensaje: "Hasta 100 artículos" });
    else b.articulos.forEach((a, i) => {
      if (!(typeof a?.titulo === "string" && a.titulo.trim().length >= 3)) e.push({ campo: `articulos.${i}.titulo`, mensaje: "Ponle un título" });
      if (!(typeof a?.contenido === "string" && a.contenido.trim().length >= 10 && a.contenido.length <= 5000)) e.push({ campo: `articulos.${i}.contenido`, mensaje: "Escribe el contenido (10 a 5000 caracteres)" });
    });
  }
  return e;
}

export function validarContenido(b: Partial<S<"ContenidoIaEntrada">>): Errores {
  const e: Errores = [];
  if (!DESTINOS.some((d) => d.codigo === b.destino)) e.push({ campo: "destino", mensaje: "¿Para dónde es el contenido?" });
  if (!(typeof b.indicacion === "string" && b.indicacion.trim().length >= 10 && b.indicacion.length <= 1000)) e.push({ campo: "indicacion", mensaje: "Cuéntanos qué quieres (10 a 1000 caracteres)" });
  if (b.tono !== undefined && !TONOS.some((t) => t.codigo === b.tono)) e.push({ campo: "tono", mensaje: "Tono desconocido" });
  if (b.variaciones !== undefined && !(Number.isInteger(b.variaciones) && b.variaciones >= 1 && b.variaciones <= 3)) e.push({ campo: "variaciones", mensaje: "Entre 1 y 3 variaciones" });
  return e;
}

// ───────────────────────────── conocimiento relevante (solo los artículos que sirven)

const normalizar = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const VACIAS = new Set(["para", "como", "cual", "cuales", "donde", "cuando", "tienen", "tiene", "hay", "que", "los", "las", "una", "uno", "por", "con", "del", "sus", "mas", "este", "esta", "quiero", "puedo", "saber"]);
const palabras = (s: string) => normalizar(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !VACIAS.has(w));

export interface Articulo { id: string; titulo: string; contenido: string }

/** Los artículos que comparten más palabras con la pregunta (el título pesa el doble). */
export function articulosRelevantes(pregunta: string, articulos: Articulo[], max: number = LIMITES.articulosRelevantes) {
  const q = new Set(palabras(pregunta));
  return articulos
    .map((a) => {
      const t = palabras(a.titulo).filter((w) => q.has(w)).length * 2;
      const c = new Set(palabras(a.contenido).filter((w) => q.has(w))).size;
      return { a, puntaje: t + c };
    })
    .filter((x) => x.puntaje > 0)
    .sort((x, y) => y.puntaje - x.puntaje)
    .slice(0, max)
    .map((x) => x.a);
}

// ───────────────────────────── instrucciones para el modelo

const NOMBRE_TONO: Record<Tono, string> = { CERCANO: "cercano y amable", FORMAL: "formal y respetuoso", ENTUSIASTA: "entusiasta y positivo" };
export interface ConfigAgente {
  nombre: string;
  rol: string;
  tono: Tono;
  saludo: string;
  instrucciones: string;
  acciones: AccionAgente[];
  derivarCuando: string | null;
  negocio: string;
}

/**
 * Instrucciones compactas (se cachean en Claude): quién es, cómo habla, qué puede hacer y cómo marcar
 * una acción o una pregunta sin respuesta, para que la API las registre.
 */
export function instruccionesSistema(c: ConfigAgente): string {
  const acciones = c.acciones.length ? c.acciones.map((a) => `[ACCION:${a}] ${ACCIONES.find((x) => x.codigo === a)!.descripcion}`).join("\n") : "Ninguna.";
  return [
    `Eres «${c.nombre}», ${c.rol || "asistente virtual"} de ${c.negocio}. Hablas en español, con un tono ${NOMBRE_TONO[c.tono]}. Respuestas breves (máximo 3 oraciones).`,
    c.instrucciones,
    "Usa solo la información del bloque CONOCIMIENTO. Si la respuesta no está ahí, no inventes: empieza tu respuesta con [SIN_RESPUESTA] y ofrece pasar con una persona.",
    `Acciones disponibles (si corresponde, escribe la marca al final de tu respuesta):\n${acciones}`,
    c.derivarCuando ? `Pasa con una persona cuando: ${c.derivarCuando}` : "",
  ].filter(Boolean).join("\n\n");
}

export const bloqueConocimiento = (arts: Articulo[]) =>
  arts.length ? `CONOCIMIENTO:\n${arts.map((a) => `## ${a.titulo}\n${a.contenido.slice(0, LIMITES.caracteresArticulo)}`).join("\n\n")}` : "CONOCIMIENTO: (vacío)";

/** Saca las marcas [SIN_RESPUESTA] y [ACCION:X] de la respuesta del modelo. */
export function interpretarRespuesta(texto: string, permitidas: AccionAgente[]) {
  const sinRespuesta = /\[SIN_RESPUESTA\]/.test(texto);
  const m = texto.match(/\[ACCION:([A-Z_]+)\]/);
  const accion = m && permitidas.includes(m[1] as AccionAgente) ? (m[1] as AccionAgente) : null;
  const limpio = texto.replace(/\[SIN_RESPUESTA\]|\[ACCION:[A-Z_]+\]/g, "").replace(/\s+\n/g, "\n").trim();
  return { texto: limpio, accion, sinRespuesta };
}

// ───────────────────────────── modo simulado (sin llamadas a la API)

const INTENCIONES: [AccionAgente, RegExp][] = [
  ["AGENDAR_CITA", /\b(cita|agendar|agenda|reserv|reunion|turno)/],
  ["ENVIAR_CATALOGO", /\b(catalogo|precio|precios|lista|cuanto cuesta|cuesta)/],
  ["DERIVAR_PERSONA", /\b(persona|humano|asesor|alguien real|hablar con)/],
  ["CREAR_LEAD", /\b(comprar|cotiza|interesad|quiero el|me interesa)/],
];

/** Respuesta determinística a partir de la base de conocimiento; sirve para probar sin gastar tokens. */
export function respuestaSimulada(c: ConfigAgente, pregunta: string, arts: Articulo[]): { texto: string; accion: AccionAgente | null; sinRespuesta: boolean } {
  const q = normalizar(pregunta);
  const intencion = INTENCIONES.find(([a, re]) => c.acciones.includes(a) && re.test(q));
  if (intencion) {
    const frases: Record<AccionAgente, string> = {
      AGENDAR_CITA: "Claro, te ayudo a agendar una cita. ¿Qué día y hora te acomodan?",
      ENVIAR_CATALOGO: "Te comparto nuestro catálogo con precios. ¿Buscas algo en particular?",
      DERIVAR_PERSONA: "Te paso con una persona de nuestro equipo, en breve te escribe.",
      CREAR_LEAD: "¡Genial! Déjame tu nombre y teléfono y un asesor te contacta.",
    };
    return { texto: frases[intencion[0]], accion: intencion[0], sinRespuesta: false };
  }
  const [mejor] = articulosRelevantes(pregunta, arts, 1);
  if (!mejor) return { texto: "No tengo esa información todavía. Si quieres, te paso con una persona de nuestro equipo.", accion: null, sinRespuesta: true };
  const resumen = mejor.contenido.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return { texto: resumen, accion: null, sinRespuesta: false };
}

/** Contenido de ejemplo cuando no hay llamadas reales. */
export function contenidoSimulado(destino: DestinoContenido, indicacion: string, variaciones: number): string[] {
  const tema = indicacion.trim().replace(/\.$/, "");
  const base: Record<DestinoContenido, (i: number) => string> = {
    REDES: (i) => [`✨ ${tema}. Descúbrelo hoy y cuéntanos qué te parece. #Novedad`, `¿Ya conoces esto? ${tema}. Escríbenos por DM y te contamos más.`, `${tema}. Pensado para ti. Link en la bio.`][i],
    BLOG: (i) => [`# ${tema}\n\nEn este artículo te contamos lo esencial: qué es, por qué importa y cómo aprovecharlo.`, `# Guía rápida: ${tema}\n\nTres ideas prácticas para empezar hoy mismo.`, `# Todo sobre ${tema}\n\nResolvemos las preguntas más comunes.`][i],
    EMAIL: (i) => [`Asunto: ${tema}\n\nHola, queremos contarte una novedad: ${tema}. ¡Te esperamos!`, `Asunto: Solo por esta semana\n\n${tema}. Responde este correo para reservar.`, `Asunto: Pensamos en ti\n\n${tema}. Conoce los detalles en nuestra web.`][i],
    WEB: (i) => [`${tema}. Calidad y atención cercana, en un solo lugar.`, `Descubre ${tema.toLowerCase()} con nosotros.`, `${tema}: hecho para ti.`][i],
    CONVERSACION: (i) => [`¡Hola! Gracias por escribirnos. Sobre ${tema.toLowerCase()}: con gusto te ayudamos.`, `Hola, ¿cómo estás? Te cuento sobre ${tema.toLowerCase()}.`, `¡Gracias por tu mensaje! ${tema}.`][i],
  };
  return Array.from({ length: variaciones }, (_, i) => base[destino](i));
}

/** Borrador de agente a partir de la descripción del negocio (simulado: elige la plantilla más cercana). */
export function borradorSimulado(descripcion: string, negocio: string): S<"AgenteIaEntrada"> {
  const d = normalizar(descripcion);
  const codigo = /cita|reserva|consulta|clinica|salon|spa/.test(d) ? "AGENDAR_CITA" : /venta|tienda|producto|catalogo/.test(d) ? "CALIFICAR_LEAD" : "RECEPCIONISTA";
  const p = plantillaAgente(codigo)!;
  return { nombre: `Asistente de ${negocio}`.slice(0, 60), rol: p.rol, tono: p.tono, saludo: p.saludo, instrucciones: `${p.instrucciones}\n\nSobre el negocio: ${descripcion.trim()}`, acciones: p.acciones, plantillaCodigo: p.codigo, conocimientoIds: [] };
}

export const contarPalabras = (xs: string[]) => xs.reduce((t, x) => t + x.split(/\s+/).filter(Boolean).length, 0);

// ───────────────────────────── consumo

/** Consumo del mes en soles contra el tope (límite de gasto de IA del cliente convertido a soles). */
export function calcularConsumoIa(periodo: string, agentes: number, contenido: number, limiteUsd: number): S<"ConsumoIa"> {
  const r = (n: number) => Math.round(n * 100) / 100;
  const total = r(agentes + contenido);
  const tope = r(limiteUsd * TIPO_CAMBIO_PEN);
  return { periodo, moneda: "PEN", agentes: r(agentes), contenido: r(contenido), total, tope, pct: tope ? Math.round((total / tope) * 100) : 0, alerta: tope > 0 && total >= tope * ALERTA_CONSUMO_IA, pausado: tope > 0 && total >= tope, tarifasDeRelleno: true };
}

/** Minutos que se ahorra el equipo del cliente por cada respuesta del agente (relleno). */
export const MINUTOS_POR_RESPUESTA = 1.5;
