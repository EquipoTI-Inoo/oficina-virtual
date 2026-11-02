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
  `\n\nCódigo de esta conversación: ⟦inoo:${sesionId}⟧. En cada herramienta del portal pasa conversacion="${sesionId}"; sin él, el portal no te responde.`;

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
