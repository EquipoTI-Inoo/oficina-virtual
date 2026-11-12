/**
 * Jarvis avanzado (9 nov 2026, reunión del 6 nov): skills, conectores, rutinas, automatizaciones y biblioteca.
 * Reglas compartidas por la API simulada y el backend real.
 */
type Errores = { campo: string; mensaje: string }[];

export const MAX_ARCHIVOS_SKILL = 5;
export const MAX_TEXTO_ARCHIVO = 50_000;
/** Lo que se le pasa al bot de todas sus skills juntas; lo que pase de aquí se corta. */
export const MAX_TEXTO_SKILLS = 60_000;

const texto = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.trim().length <= max;

export interface ArchivoSkill { nombre: string; texto: string }
export function validarSkill(b: Record<string, unknown>, parcial = false): Errores {
  const e: Errores = [];
  if ((!parcial || b.nombre !== undefined) && !texto(b.nombre, 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  if (b.descripcion !== undefined && b.descripcion !== null && (typeof b.descripcion !== "string" || b.descripcion.length > 300)) e.push({ campo: "descripcion", mensaje: "Hasta 300 caracteres" });
  if ((!parcial || b.instrucciones !== undefined) && !texto(b.instrucciones, 20_000)) e.push({ campo: "instrucciones", mensaje: "Escribe qué hace la skill (hasta 20 000 caracteres)" });
  if (b.archivos !== undefined) {
    const xs = b.archivos;
    const ok = Array.isArray(xs) && xs.length <= MAX_ARCHIVOS_SKILL && xs.every((a) => a && texto((a as ArchivoSkill).nombre, 120) && typeof (a as ArchivoSkill).texto === "string" && (a as ArchivoSkill).texto.length <= MAX_TEXTO_ARCHIVO);
    if (!ok) e.push({ campo: "archivos", mensaje: `Hasta ${MAX_ARCHIVOS_SKILL} archivos de texto de ${MAX_TEXTO_ARCHIVO.toLocaleString("es-PE")} caracteres cada uno` });
  }
  return e;
}

export const ESTADOS_CONECTOR = ["PENDIENTE", "CONECTADO", "APAGADO"] as const;
export type EstadoConector = (typeof ESTADOS_CONECTOR)[number];
const ESPACIOS = ["ADMINISTRACION", "CRM", "COMERCIAL", "AUDIOVISUAL", "DISENO", "MARKETING", "GERENCIA"];
export function validarConector(b: Record<string, unknown>, parcial = false): Errores {
  const e: Errores = [];
  if ((!parcial || b.nombre !== undefined) && !texto(b.nombre, 60)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 60 caracteres)" });
  if (b.descripcion !== undefined && b.descripcion !== null && (typeof b.descripcion !== "string" || b.descripcion.length > 300)) e.push({ campo: "descripcion", mensaje: "Hasta 300 caracteres" });
  if (b.url !== undefined && b.url !== null && !(typeof b.url === "string" && /^https?:\/\/\S{3,300}$/.test(b.url.trim()))) e.push({ campo: "url", mensaje: "Pon la dirección del servidor MCP (https://…)" });
  if (b.espacios !== undefined && !(Array.isArray(b.espacios) && b.espacios.every((x) => ESPACIOS.includes(x as string)))) e.push({ campo: "espacios", mensaje: "Elige áreas válidas" });
  if (b.estado !== undefined && !ESTADOS_CONECTOR.includes(b.estado as EstadoConector)) e.push({ campo: "estado", mensaje: "Usa PENDIENTE, CONECTADO o APAGADO" });
  // Nada de llaves en el portal: si alguien pega un token, se rechaza.
  for (const k of ["nombre", "descripcion", "url"]) {
    if (typeof b[k] === "string" && /(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-|Bearer\s+\S{16,}|[?&](token|key|api_key|secret)=)/i.test(b[k] as string)) {
      e.push({ campo: k, mensaje: "No pongas llaves ni tokens aquí: TI las configura en el Hermes del área" });
    }
  }
  return e;
}

// ───────────────────────────── rutinas

export const FRECUENCIAS = ["DIARIA", "LABORABLES", "SEMANAL", "MENSUAL"] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];
export interface Horario { frecuencia: Frecuencia; hora: string; diaSemana: number | null; diaMes: number | null }

export function validarRutina(b: Record<string, unknown>, parcial = false): Errores {
  const e: Errores = [];
  if (!parcial && typeof b.botId !== "string") e.push({ campo: "botId", mensaje: "Elige el bot" });
  if ((!parcial || b.nombre !== undefined) && !texto(b.nombre, 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  if ((!parcial || b.pedido !== undefined) && !texto(b.pedido, 4000)) e.push({ campo: "pedido", mensaje: "Escribe qué tiene que hacer (hasta 4000 caracteres)" });
  if ((!parcial || b.frecuencia !== undefined) && !FRECUENCIAS.includes(b.frecuencia as Frecuencia)) e.push({ campo: "frecuencia", mensaje: "Elige cada cuánto" });
  if ((!parcial || b.hora !== undefined) && !(typeof b.hora === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.hora))) e.push({ campo: "hora", mensaje: "Elige la hora (HH:MM)" });
  if (b.frecuencia === "SEMANAL" && !(Number.isInteger(b.diaSemana) && (b.diaSemana as number) >= 1 && (b.diaSemana as number) <= 7)) e.push({ campo: "diaSemana", mensaje: "Elige el día de la semana" });
  if (b.frecuencia === "MENSUAL" && !(Number.isInteger(b.diaMes) && (b.diaMes as number) >= 1 && (b.diaMes as number) <= 28)) e.push({ campo: "diaMes", mensaje: "Elige un día del 1 al 28" });
  if (b.activa !== undefined && typeof b.activa !== "boolean") e.push({ campo: "activa", mensaje: "Debe ser verdadero o falso" });
  return e;
}

export const TOPE_DIARIO_AUTOMATIZACION = 20;

/** Lima no tiene horario de verano: siempre UTC−5. */
const LIMA_MS = 5 * 3_600_000;

/**
 * Siguiente momento (estrictamente después de `desde`) en que toca la rutina, a la hora de Lima.
 * diaSemana: 1 = lunes … 7 = domingo. LABORABLES: de lunes a viernes.
 */
export function proximaEjecucion(h: Horario, desde: Date): Date {
  const [hh, mm] = h.hora.split(":").map(Number);
  const lima = new Date(desde.getTime() - LIMA_MS);
  for (let d = 0; d <= 62; d++) {
    const dia = new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + d, hh, mm));
    const enUtc = new Date(dia.getTime() + LIMA_MS);
    if (enUtc <= desde) continue;
    const semana = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
    if (h.frecuencia === "DIARIA") return enUtc;
    if (h.frecuencia === "LABORABLES" && semana <= 5) return enUtc;
    if (h.frecuencia === "SEMANAL" && semana === h.diaSemana) return enUtc;
    if (h.frecuencia === "MENSUAL" && dia.getUTCDate() === h.diaMes) return enUtc;
  }
  throw new Error("Horario sin próxima ejecución");
}

const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export function textoHorario(h: Horario) {
  if (h.frecuencia === "DIARIA") return `Todos los días a las ${h.hora}`;
  if (h.frecuencia === "LABORABLES") return `De lunes a viernes a las ${h.hora}`;
  if (h.frecuencia === "SEMANAL") return `Cada ${DIAS[h.diaSemana ?? 1]} a las ${h.hora}`;
  return `El día ${h.diaMes} de cada mes a las ${h.hora}`;
}

// ───────────────────────────── automatizaciones

/** Lo que pasa en el portal y puede disparar a un bot (eventos del outbox). */
export const EVENTOS_JARVIS: Record<string, string> = {
  "cliente.creado": "Se crea un cliente",
  "servicio.contratado": "Se crea un proyecto",
  "servicio.cerrado": "Se cierra un proyecto",
  "servicio.standby": "Un proyecto pasa a standby",
  "etapa.actualizada": "Avanza una etapa de un proyecto",
  "tarea.asignada": "Se asigna una tarea",
  "requerimiento.creado": "Se le pide algo al cliente",
  "requerimiento.atrasado": "Un pedido al cliente se atrasa",
  "requerimiento.revisado": "Se revisa lo que mandó el cliente",
  "entregable.listo_revision": "Un entregable queda listo para el cliente",
  "entregable.decidido": "El cliente aprueba o pide cambios a un entregable",
  "ticket.creado": "El cliente abre un ticket de soporte",
  "ticket.mensaje_cliente": "El cliente responde un ticket",
  "comentario_proyecto.creado": "Alguien comenta en un proyecto",
  "pago.situacion_cambiada": "Cambia la situación de pago de un cliente",
  "reunion.proxima": "Se acerca una reunión",
};
export const esEventoJarvis = (v: unknown): v is string => typeof v === "string" && Object.hasOwn(EVENTOS_JARVIS, v);

export function validarAutomatizacion(b: Record<string, unknown>, parcial = false): Errores {
  const e: Errores = [];
  if (!parcial && typeof b.botId !== "string") e.push({ campo: "botId", mensaje: "Elige el bot" });
  if ((!parcial || b.nombre !== undefined) && !texto(b.nombre, 80)) e.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  if ((!parcial || b.evento !== undefined) && !esEventoJarvis(b.evento)) e.push({ campo: "evento", mensaje: "Elige qué la dispara" });
  if ((!parcial || b.pedido !== undefined) && !texto(b.pedido, 4000)) e.push({ campo: "pedido", mensaje: "Escribe qué tiene que hacer (hasta 4000 caracteres)" });
  if (b.activa !== undefined && typeof b.activa !== "boolean") e.push({ campo: "activa", mensaje: "Debe ser verdadero o falso" });
  // 13 nov (auditoría): solo los eventos de un cliente y un tope por día.
  if (b.clienteId !== undefined && b.clienteId !== null && typeof b.clienteId !== "string") e.push({ campo: "clienteId", mensaje: "Elige un cliente o todos" });
  if (b.topeDiario !== undefined && !(Number.isInteger(b.topeDiario) && (b.topeDiario as number) >= 1 && (b.topeDiario as number) <= 500)) e.push({ campo: "topeDiario", mensaje: "Entre 1 y 500 veces por día" });
  return e;
}

/** Solo ids, números y estados del evento: nunca textos ni datos personales. */
export function contextoDeEvento(tipo: string, clienteId: string | null, datos: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(datos)) {
    if (!/(Id|Ids|^numero|^estado|^periodo)$/.test(k)) continue;
    if (!["string", "number"].includes(typeof v) && !Array.isArray(v)) continue;
    if (JSON.stringify(v).length > 400) continue;
    r[k] = v;
  }
  return { ...r, evento: tipo, clienteId };
}

/** Lo que recibe el bot en una ejecución automática. */
export function mensajeDeEjecucion(pedido: string, origen: "RUTINA" | "AUTOMATIZACION", nombre: string, contexto: Record<string, unknown>) {
  const cab = origen === "RUTINA"
    ? `Esto es la rutina «${nombre}»: corre sola, nadie está en el chat. Haz el trabajo y deja la respuesta lista para leer.`
    : `Esto es la automatización «${nombre}»: se disparó porque «${EVENTOS_JARVIS[String(contexto.evento)] ?? contexto.evento}». Nadie está en el chat. Usa los ids de abajo para leer lo que necesites con las herramientas del portal.`;
  const datos = origen === "AUTOMATIZACION" ? `\n\nDatos del evento:\n${JSON.stringify(contexto, null, 2)}` : "";
  return `${cab}\n\nPedido:\n${pedido}${datos}`;
}

// ───────────────────────────── lo que sabe el bot

export interface SkillActiva { nombre: string; instrucciones: string; archivos: ArchivoSkill[] }
export interface ConectorActivo { nombre: string; descripcion: string; estado: EstadoConector }

/** Se agrega al sistema del bot: sus skills (con sus archivos) y los conectores que puede usar. */
export function textoHerramientas(skills: SkillActiva[], conectores: ConectorActivo[]): string {
  let r = "";
  if (skills.length) {
    r += "\n\nSkills activas (síguelas cuando apliquen):";
    for (const s of skills) {
      r += `\n\n### ${s.nombre}\n${s.instrucciones.trim()}`;
      for (const a of s.archivos) r += `\n\n--- Archivo «${a.nombre}» ---\n${a.texto.trim()}`;
    }
    if (r.length > MAX_TEXTO_SKILLS) r = `${r.slice(0, MAX_TEXTO_SKILLS)}\n[…el resto de las skills se cortó por largo]`;
  }
  const listos = conectores.filter((c) => c.estado === "CONECTADO");
  if (listos.length) r += `\n\nConectores que puedes usar (herramientas MCP de tu Hermes): ${listos.map((c) => (c.descripcion ? `${c.nombre} (${c.descripcion})` : c.nombre)).join("; ")}.`;
  return r;
}

export function validarBiblioteca(b: Record<string, unknown>): Errores {
  const e: Errores = [];
  if (typeof b.botId !== "string") e.push({ campo: "botId", mensaje: "Indica de qué bot es" });
  if (!texto(b.titulo, 120)) e.push({ campo: "titulo", mensaje: "Ponle un título (hasta 120 caracteres)" });
  if (!texto(b.contenido, 200_000)) e.push({ campo: "contenido", mensaje: "No hay nada que guardar" });
  if (b.sesionId !== undefined && b.sesionId !== null && typeof b.sesionId !== "string") e.push({ campo: "sesionId", mensaje: "Conversación inválida" });
  return e;
}
/** Nombre del archivo .md en Drive. */
export const archivoBiblioteca = (titulo: string) => `${titulo.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "jarvis"}.md`;
