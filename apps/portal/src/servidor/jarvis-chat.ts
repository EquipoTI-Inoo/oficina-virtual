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
 */
import type { Area } from "../dominio/ia-equipo";

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

/** Reenvía el mensaje al Hermes del área y devuelve su respuesta en streaming (SSE en formato OpenAI). */
export async function hablarConBot(
  hermes: HermesDelArea,
  p: { botId: string; sistema: string; mensaje: string; sesionId: string },
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
          { role: "system", content: p.sistema },
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
  return new Response(r.body, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
}
