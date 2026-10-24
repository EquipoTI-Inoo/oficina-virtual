/**
 * Stitch (Google) para el prototipo del taller web (fase 19b), por su servidor MCP oficial:
 * https://stitch.googleapis.com/mcp con la clave en `X-Goog-Api-Key` (STITCH_API_KEY; no es la de Gemini).
 *
 * Stitch genera pantallas y su HTML, pero no exporta a Figma: ese paso lo hace una persona con
 * «Copy to Figma» (decidido el 13 oct). Sin STITCH_API_KEY o con IA_MODO≠real, el taller usa pantallas de relleno.
 *
 * Probado el 24 oct con la clave de Inoo: create_project + generate_screen_from_text devuelven la imagen y
 * el HTML (unos 3 minutos por pantalla). Igual el cliente pregunta primero qué herramientas expone el
 * servidor (`tools/list`) y busca los ids y los enlaces de descarga en cualquier parte de la respuesta,
 * porque Google todavía cambia la forma de esta API.
 */

const env = (k: string): string | undefined => (typeof process !== "undefined" ? process.env?.[k]?.trim() || undefined : undefined);

export const stitchDisponible = () => env("IA_MODO") === "real" && !!env("STITCH_API_KEY");

export class ErrorStitch extends Error {}

const CANDIDATOS = {
  crearProyecto: ["create_project"],
  generar: ["generate_screen_from_text", "generate_screen"],
  pantalla: ["get_screen"],
};

let secuencia = 0;

async function rpc(metodo: string, params: Record<string, unknown>, sesion: { id: string | null }): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    "x-goog-api-key": env("STITCH_API_KEY")!,
  };
  if (sesion.id) headers["mcp-session-id"] = sesion.id;
  const res = await fetch(env("STITCH_URL") ?? "https://stitch.googleapis.com/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: ++secuencia, method: metodo, params }),
    signal: AbortSignal.timeout(6 * 60_000),
  });
  sesion.id = res.headers.get("mcp-session-id") ?? sesion.id;
  const t = await res.text();
  if (!res.ok) throw new ErrorStitch(`Stitch respondió ${res.status}: ${t.slice(0, 200)}`);
  // Respuesta JSON directa o un stream SSE con líneas «data: {...}».
  const cuerpo = t.trimStart().startsWith("{") ? t : t.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).at(-1) ?? "";
  const j = JSON.parse(cuerpo || "{}") as { result?: Record<string, unknown>; error?: { message?: string } };
  if (j.error) throw new ErrorStitch(`Stitch: ${j.error.message ?? "error"}`);
  return j.result ?? {};
}

async function llamarHerramienta(nombre: string, args: Record<string, unknown>, sesion: { id: string | null }) {
  const r = await rpc("tools/call", { name: nombre, arguments: args }, sesion);
  if (r.isError) throw new ErrorStitch(`Stitch (${nombre}): ${textoDe(r).slice(0, 300)}`);
  return contenidoDe(r);
}

function textoDe(r: Record<string, unknown>) {
  return ((r.content as { type?: string; text?: string }[] | undefined) ?? []).map((c) => c.text ?? "").join("\n");
}

/** structuredContent o el JSON que venga como texto. */
function contenidoDe(r: Record<string, unknown>): unknown {
  if (r.structuredContent) return r.structuredContent;
  const t = textoDe(r);
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

/** Recorre la respuesta buscando una clave (o un nombre «projects/123/screens/456»). */
function buscar(v: unknown, f: (k: string, x: unknown) => string | null): string | null {
  if (!v || typeof v !== "object") return null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const r = f(k, x) ?? buscar(x, f);
    if (r) return r;
  }
  return null;
}
const idDe = (v: unknown, clave: "projectId" | "screenId", segmento: "projects" | "screens") =>
  buscar(v, (k, x) => (k === clave && typeof x === "string" ? x : k === "name" && typeof x === "string" ? (x.match(new RegExp(`${segmento}/([^/]+)$`))?.[1] ?? null) : null)) ??
  (typeof v === "string" ? (v.match(new RegExp(`${segmento}/([\\w-]+)`))?.[1] ?? null) : null);
const descargaDe = (v: unknown, claves: string[]) =>
  buscar(v, (k, x) => (claves.includes(k) && x && typeof x === "object" ? ((x as { downloadUrl?: string }).downloadUrl ?? null) : null));

async function descargar(url: string | null): Promise<Uint8Array | null> {
  if (!url) return null;
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}

export interface PantallaStitch { proyectoId: string; pantallaId: string | null; imagen: Uint8Array | null; mime: string; html: string | null }

/** Crea (o reutiliza) el proyecto en Stitch y genera una pantalla desde el prompt. Puede tardar minutos. */
export async function generarPantallaStitch(p: { titulo: string; prompt: string; dispositivo: "ESCRITORIO" | "MOVIL"; proyectoId: string | null }): Promise<PantallaStitch> {
  const sesion = { id: null as string | null };
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "oficina-virtual", version: "1.0" } }, sesion);
  const herramientas = (((await rpc("tools/list", {}, sesion)).tools as { name: string }[] | undefined) ?? []).map((t) => t.name);
  const elegir = (xs: string[]) => {
    const n = xs.find((x) => herramientas.includes(x));
    if (!n) throw new ErrorStitch(`Stitch no expone ${xs.join(" ni ")} (tiene: ${herramientas.join(", ") || "ninguna"})`);
    return n;
  };
  let proyectoId = p.proyectoId;
  if (!proyectoId) {
    proyectoId = idDe(await llamarHerramienta(elegir(CANDIDATOS.crearProyecto), { title: p.titulo }, sesion), "projectId", "projects");
    if (!proyectoId) throw new ErrorStitch("Stitch no devolvió el id del proyecto");
  }
  let r = await llamarHerramienta(elegir(CANDIDATOS.generar), { projectId: proyectoId, prompt: p.prompt, deviceType: p.dispositivo === "MOVIL" ? "MOBILE" : "DESKTOP" }, sesion);
  const pantallaId = idDe(r, "screenId", "screens");
  // Si la generación no trae los enlaces de descarga, se piden con get_screen.
  if (!descargaDe(r, ["screenshot"]) && pantallaId && herramientas.some((h) => CANDIDATOS.pantalla.includes(h))) {
    r = await llamarHerramienta(elegir(CANDIDATOS.pantalla), { projectId: proyectoId, screenId: pantallaId, name: `projects/${proyectoId}/screens/${pantallaId}` }, sesion);
  }
  const imagen = await descargar(descargaDe(r, ["screenshot", "image"]));
  const html = await descargar(descargaDe(r, ["htmlCode", "html"]));
  if (!imagen && !html) throw new ErrorStitch("Stitch generó la pantalla pero no devolvió la imagen ni el HTML (puede que haya que abrir el proyecto una vez en stitch.withgoogle.com)");
  return { proyectoId, pantallaId, imagen, mime: "image/png", html: html ? new TextDecoder().decode(html) : null };
}
