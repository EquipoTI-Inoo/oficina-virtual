/**
 * Chat con los bots del área en la sección «Jarvis» (2 nov 2026). El navegador le escribe al portal y el
 * portal, desde el servidor, le escribe al Hermes del área (su API compatible con OpenAI), que piensa con
 * DeepSeek a través de la pasarela /ia-equipo. El navegador nunca ve la clave de Hermes, y cada persona
 * solo llega a los bots de su área.
 *
 *   JARVIS_HERMES  JSON por área: {"CRM": {"url": "http://127.0.0.1:8642", "clave": "…"}}
 *
 * Cada bot es un personaje con su trabajo (mensaje de sistema) y su propia memoria en Hermes
 * (X-Hermes-Session-Key = el bot); cada conversación es una sesión (X-Hermes-Session-Id).
 *
 * Sin llaves personales (2 nov): el Hermes del área entra a la pasarela con la misma clave (OPENAI_API_KEY =
 * su API_SERVER_KEY). El sistema de cada mensaje lleva la marca de la conversación (un id al azar, sin datos):
 *  · Hermes la repite en cada llamada a la pasarela, que busca al dueño de la conversación y le cobra a él;
 *  · el bot la pasa como «conversacion» a las herramientas del portal (mcp-portal.mjs), que leen el portal
 *    con los permisos de esa persona (X-Jarvis-Conversacion), no con los de un usuario fijo.
 */
import { timingSafeEqual } from "node:crypto";
import { AREAS, extraerTrabajo, type Area } from "../dominio/ia-equipo";
import { generar, type ImagenIa } from "./ia-modelos";

export interface HermesDelArea {
  url: string;
  clave: string;
}

export function hermesDelArea(area: Area): HermesDelArea | null {
  try {
    const porArea = JSON.parse(process.env.JARVIS_HERMES ?? "{}") as Record<string, HermesDelArea>;
    const h = porArea[area];
    return h?.url && h?.clave ? h : null;
  } catch {
    return null;
  }
}

export const esSesionChat = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);

/**
 * Archivos del chat (2 nov): el navegador saca el texto (texto plano, CSV, PDF, Word) y lo manda con el mensaje.
 * Las imágenes las lee Gemini en el portal (texto visible y descripción), porque el modelo de los bots
 * (DeepSeek) no ve imágenes: al bot le llega esa lectura como un adjunto más. Nada se guarda.
 */
export const LIMITES_CHAT = { mensaje: 8000, archivos: 5, nombre: 200, texto: 100_000, total: 200_000, imagenBase64: 7_000_000 };
const MIMES_IMAGEN = ["image/jpeg", "image/png", "image/webp"] as const;
export interface ArchivoChat { nombre: string; texto: string; imagen?: ImagenIa }

/** Valida el cuerpo del chat. Sin mensaje vale si hay archivos («resume esto» va implícito). */
export function validarChat(b: { mensaje?: unknown; sesionId?: unknown; archivos?: unknown }): { mensaje: string; sesionId: string; archivos: ArchivoChat[] } | { campo: string; mensaje: string } {
  const mensaje = typeof b.mensaje === "string" ? b.mensaje.trim() : "";
  if (!esSesionChat(b.sesionId)) return { campo: "sesionId", mensaje: "Falta el código de la conversación" };
  if (b.archivos !== undefined && !Array.isArray(b.archivos)) return { campo: "archivos", mensaje: "Los archivos van en una lista" };
  const lista = (b.archivos as unknown[] | undefined) ?? [];
  if (lista.length > LIMITES_CHAT.archivos) return { campo: "archivos", mensaje: `Hasta ${LIMITES_CHAT.archivos} archivos por mensaje` };
  const archivos: ArchivoChat[] = [];
  for (const a of lista) {
    const x = a as { nombre?: unknown; texto?: unknown; imagen?: { mime?: unknown; base64?: unknown } } | null;
    const nombre = typeof x?.nombre === "string" ? x.nombre.trim() : "";
    const texto = typeof x?.texto === "string" ? x.texto : "";
    if (!nombre || nombre.length > LIMITES_CHAT.nombre) return { campo: "archivos", mensaje: "Cada archivo necesita su nombre" };
    if (x?.imagen !== undefined) {
      const { mime, base64 } = x.imagen ?? {};
      if (!MIMES_IMAGEN.includes(mime as ImagenIa["mime"]) || typeof base64 !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(base64)) {
        return { campo: "archivos", mensaje: `«${nombre}»: las imágenes van en JPG, PNG o WebP` };
      }
      if (base64.length > LIMITES_CHAT.imagenBase64) return { campo: "archivos", mensaje: `«${nombre}» pesa demasiado` };
      archivos.push({ nombre, texto: "", imagen: { mime: mime as ImagenIa["mime"], base64 } });
      continue;
    }
    if (!texto.trim()) return { campo: "archivos", mensaje: `No encontramos texto en «${nombre}»` };
    if (texto.length > LIMITES_CHAT.texto) return { campo: "archivos", mensaje: `«${nombre}» es muy largo para el chat` };
    archivos.push({ nombre, texto });
  }
  if (archivos.reduce((t, a) => t + a.texto.length, 0) > LIMITES_CHAT.total) return { campo: "archivos", mensaje: "Los archivos juntos son muy largos para el chat" };
  if ((!mensaje && !archivos.length) || mensaje.length > LIMITES_CHAT.mensaje) return { campo: "mensaje", mensaje: `Escribe tu mensaje (hasta ${LIMITES_CHAT.mensaje} caracteres)` };
  return { mensaje, sesionId: b.sesionId as string, archivos };
}

const SISTEMA_IMAGEN = `Lees imágenes para un asistente que no puede verlas. Responde en español, sin saludo:
1. «Texto visible:» transcribe todo el texto tal cual (cifras, nombres, fechas, tablas fila por fila). Si no hay, escribe «ninguno».
2. «Descripción:» qué es la imagen y lo importante para trabajar con ella (tipo de documento o pantalla, diseño, colores, gráficos y sus valores).
No inventes lo que no se lee.`;

/** Gemini no pudo leer una imagen; cada API lo responde como 502 IMAGEN_NO_LEIDA. */
export class ErrorImagenChat extends Error {
  constructor(public nombre: string) {
    super(`No pudimos leer «${nombre}»`);
  }
}

/**
 * Cambia cada imagen por su lectura: Gemini y, si falla (p. ej. 503 por demanda), Claude. Sin IA real, una
 * lectura de relleno que lo dice.
 */
export async function leerImagenes(archivos: ArchivoChat[]): Promise<ArchivoChat[]> {
  return Promise.all(archivos.map(async (a) => {
    if (!a.imagen) return a;
    for (const modelo of ["GEMINI_FLASH", "CLAUDE_SONNET"] as const) {
      try {
        const r = await generar({
          modelo, sistema: SISTEMA_IMAGEN, maxTokens: 4000,
          mensajes: [{ rol: "user", texto: `Imagen: ${a.nombre}`, imagenes: [a.imagen] }],
          simulado: () => "(No se pudo leer la imagen: la IA del portal está en modo simulado.)",
        });
        return { nombre: `${a.nombre} (imagen; lectura del portal)`, texto: r.texto.trim() || "(La imagen no tiene nada legible.)" };
      } catch (e) {
        console.warn(JSON.stringify({ jarvis: "imagen_no_leida", modelo, error: (e as Error).message.slice(0, 200) }));
      }
    }
    throw new ErrorImagenChat(a.nombre);
  }));
}

/** Lo que recibe el bot: el mensaje y, debajo, el texto de cada archivo con su nombre. */
export function contenidoDelMensaje(mensaje: string, archivos: ArchivoChat[]): string {
  if (!archivos.length) return mensaje;
  const pedido = mensaje || "Revisa los archivos adjuntos y dime qué encuentras.";
  const aviso = "(El contenido de los archivos ya está aquí abajo: no los busques en el disco ni en el portal.)";
  return `${pedido}\n\n${aviso}\n\n${archivos.map((a) => `--- Archivo adjunto: ${a.nombre} ---\n${a.texto}\n--- Fin de ${a.nombre} ---`).join("\n\n")}`;
}

/** Área cuyo Hermes usa esta clave, o null. */
export function areaDeClaveHermes(clave: string): Area | null {
  if (!clave) return null;
  const b = Buffer.from(clave);
  for (const a of AREAS) {
    const h = hermesDelArea(a);
    if (!h) continue;
    const c = Buffer.from(h.clave);
    if (c.length === b.length && timingSafeEqual(c, b)) return a;
  }
  return null;
}

const MARCA = /⟦inoo:([A-Za-z0-9_-]{8,64})⟧/g;
export const marcaSesion = (sesionId: string) =>
  `\n\nCódigo de esta conversación: ⟦inoo:${sesionId}⟧. En cada herramienta del portal pasa conversacion="${sesionId}"; sin él, el portal no te responde. Si te piden hacer algo (una tarea, un comentario interno o un pendiente), usa proponer_accion: no se hace hasta que la persona lo apruebe aquí en el chat, así que dile que quedó esperando su aprobación.`;

/** La conversación marcada en los mensajes, o null. */
export function leerMarca(mensajes: unknown): string | null {
  if (!Array.isArray(mensajes)) return null;
  for (const m of mensajes) {
    const c = (m as { content?: unknown } | null)?.content;
    const textos = typeof c === "string" ? [c] : Array.isArray(c) ? c.map((p) => (p as { text?: unknown } | null)?.text).filter((t): t is string => typeof t === "string") : [];
    for (const t of textos) {
      const x = [...t.matchAll(MARCA)][0];
      if (x) return x[1];
    }
  }
  return null;
}

/** Lo que el portal hace cuando el bot reescribe su trabajo: lo guarda y devuelve el anterior (null = no se pudo). */
export type AlActualizarTrabajo = (nuevo: string) => Promise<{ anterior: string } | null>;

/**
 * Reenvía el mensaje al Hermes del área y devuelve su respuesta en streaming (SSE en formato OpenAI). Si el bot
 * reescribió su trabajo, al final del stream se guarda y se agrega un evento `{"inoo": {"trabajo": …}}`.
 */
export async function hablarConBot(
  hermes: HermesDelArea,
  p: { botId: string; sistema: string; mensaje: string; sesionId: string; alActualizarTrabajo?: AlActualizarTrabajo },
  senal?: AbortSignal,
): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(`${hermes.url.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${hermes.clave}`,
        "x-hermes-session-id": p.sesionId,
        "x-hermes-session-key": `bot-${p.botId}`,
      },
      body: JSON.stringify({
        model: "hermes-agent",
        stream: true,
        messages: [
          { role: "system", content: `${p.sistema}${marcaSesion(p.sesionId)}` },
          { role: "user", content: p.mensaje },
        ],
      }),
      signal: senal,
    });
  } catch (e) {
    return Response.json({ error: { message: `El Hermes del área no está encendido (${(e as Error).message}).`, code: "JARVIS_APAGADO" } }, { status: 502 });
  }
  if (!r.ok || !r.body) {
    const texto = await r.text().catch(() => "");
    return Response.json({ error: { message: `El Hermes del área respondió ${r.status}: ${texto.slice(0, 300)}`, code: "JARVIS_ERROR" } }, { status: 502 });
  }
  const cuerpo = p.alActualizarTrabajo ? r.body.pipeThrough(vigilarTrabajo(p.alActualizarTrabajo)) : r.body;
  return new Response(cuerpo, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}

/** Deja pasar el stream tal cual, junta el texto y, al terminar, guarda el trabajo nuevo si el bot escribió uno. */
function vigilarTrabajo(alActualizar: AlActualizarTrabajo) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let resto = "";
  let texto = "";
  const leer = (t: string) => {
    resto += t;
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";
    for (const l of lineas) {
      const dato = l.startsWith("data:") ? l.slice(5).trim() : "";
      if (!dato || dato === "[DONE]") continue;
      try {
        texto += (JSON.parse(dato) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? "";
      } catch {
        /* fragmento que no es JSON */
      }
    }
  };
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(trozo, ctrl) {
      leer(dec.decode(trozo, { stream: true }));
      ctrl.enqueue(trozo);
    },
    async flush(ctrl) {
      leer(`${dec.decode()}\n`);
      const nuevo = extraerTrabajo(texto);
      if (!nuevo) return;
      const r = await alActualizar(nuevo).catch(() => null);
      if (r && r.anterior !== nuevo) ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ inoo: { trabajo: { anterior: r.anterior, nuevo } } })}\n\n`));
    },
  });
}
