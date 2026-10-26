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
  crearSistema: ["create_design_system"],
  actualizarSistema: ["update_design_system"],
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

export interface PantallaStitch { pantallaId: string | null; titulo: string | null; imagen: Uint8Array | null; mime: string; html: string | null }

/** Cada objeto de la respuesta con su captura propia es una pantalla (con el prompt de todo el sitio vienen varias). */
function pantallasDe(v: unknown, xs: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!v || typeof v !== "object") return xs;
  const o = v as Record<string, unknown>;
  const captura = o.screenshot as { downloadUrl?: string } | undefined;
  if (captura && typeof captura === "object" && captura.downloadUrl) xs.push(o);
  else for (const x of Object.values(o)) pantallasDe(x, xs);
  return xs;
}

/**
 * Crea (o reutiliza) el proyecto en Stitch y genera desde el prompt. Puede tardar minutos.
 * Devuelve todas las pantallas que Stitch generó: una con el prompt de una página, varias con el del sitio.
 */
/** Fuentes que Stitch acepta en su sistema de diseño (las de la marca que no estén, van como Inter). */
const FUENTES = new Set(["INTER", "MANROPE", "MONTSERRAT", "PLUS_JAKARTA_SANS", "DM_SANS", "LEXEND", "WORK_SANS", "RUBIK", "SORA", "OUTFIT", "RALEWAY", "OPEN_SANS", "KARLA",
  "NUNITO_SANS", "PLAYFAIR_DISPLAY", "EB_GARAMOND", "MERRIWEATHER", "LITERATA", "NEWSREADER", "NOTO_SERIF", "NOTO_SANS", "BODONI_MODA", "SPACE_GROTESK", "SYNE", "OSWALD", "BEBAS_NEUE",
  "IBM_PLEX_SANS", "IBM_PLEX_SERIF", "FIRA_SANS", "GEIST", "HANKEN_GROTESK", "LIBRE_FRANKLIN", "QUICKSAND", "EPILOGUE", "PUBLIC_SANS", "BE_VIETNAM_PRO", "ARIMO", "VOLLKORN", "DOMINE"]);
const fuente = (nombre: string | undefined) => {
  const k = (nombre ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return FUENTES.has(k) ? k : "INTER";
};

/**
 * El sistema de diseño del proyecto con el DESIGN.md (el contenido del PDF y la plantilla de 21st.dev):
 * create_design_system y luego update_design_system, como pide Stitch. Devuelve «assets/{id}» para usarlo al generar.
 */
async function crearSistema(proyectoId: string, s: SistemaStitch, elegir: (xs: string[]) => string, sesion: { id: string | null }): Promise<string> {
  const designSystem = {
    displayName: s.nombre,
    theme: {
      colorMode: "LIGHT", roundness: "ROUND_EIGHT", customColor: s.paleta[0] ?? "#14213D", headlineFont: fuente(s.tipografias[0]), bodyFont: fuente(s.tipografias[1] ?? s.tipografias[0]),
      ...(s.paleta[1] ? { overrideSecondaryColor: s.paleta[1] } : {}), designMd: s.designMd,
    },
  };
  const r = await llamarHerramienta(elegir(CANDIDATOS.crearSistema), { projectId: proyectoId, designSystem }, sesion);
  const asset = buscar(r, (k, x) => (typeof x === "string" ? (x.match(/assets\/(\d+)/)?.[0] ?? null) : null)) ?? (typeof r === "string" ? (r.match(/assets\/(\d+)/)?.[0] ?? null) : null);
  if (!asset) throw new ErrorStitch("Stitch no devolvió el id del sistema de diseño");
  try {
    await llamarHerramienta(elegir(CANDIDATOS.actualizarSistema), { projectId: proyectoId, name: asset, designSystem }, sesion);
  } catch {
    /* ya existe; el update solo lo muestra en la interfaz de Stitch */
  }
  return asset;
}

export interface SistemaStitch { nombre: string; designMd: string; huella: string; paleta: string[]; tipografias: string[]; actual: { asset: string; huella: string } | null }

export async function generarPantallaStitch(p: { titulo: string; prompt: string; dispositivo: "ESCRITORIO" | "MOVIL"; proyectoId: string | null; sistema?: SistemaStitch }): Promise<{ proyectoId: string; pantallas: PantallaStitch[]; sistema: { asset: string; huella: string } | null; aviso: string | null }> {
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
  // El DESIGN.md se sube una vez por proyecto y otra vez solo si cambió (otro PDF, otra plantilla).
  let sistema = p.sistema?.actual && p.sistema.actual.huella === p.sistema.huella && p.proyectoId === proyectoId ? p.sistema.actual : null;
  let aviso: string | null = null;
  if (p.sistema && !sistema) {
    try {
      sistema = { asset: await crearSistema(proyectoId, p.sistema, elegir, sesion), huella: p.sistema.huella };
    } catch (e) {
      aviso = `Stitch no aceptó el DESIGN.md (${(e as Error).message.slice(0, 160)}): la pantalla salió solo con el prompt.`;
    }
  }
  let r = await llamarHerramienta(elegir(CANDIDATOS.generar), {
    projectId: proyectoId, prompt: p.prompt, deviceType: p.dispositivo === "MOVIL" ? "MOBILE" : "DESKTOP", ...(sistema ? { designSystem: sistema.asset } : {}),
  }, sesion);
  const pantallaId = idDe(r, "screenId", "screens");
  // Si la generación no trae los enlaces de descarga, se piden con get_screen.
  if (!descargaDe(r, ["screenshot"]) && pantallaId && herramientas.some((h) => CANDIDATOS.pantalla.includes(h))) {
    r = await llamarHerramienta(elegir(CANDIDATOS.pantalla), { projectId: proyectoId, screenId: pantallaId, name: `projects/${proyectoId}/screens/${pantallaId}` }, sesion);
  }
  const encontradas = pantallasDe(r);
  const pantallas: PantallaStitch[] = [];
  for (const x of encontradas.length ? encontradas : [r]) {
    const imagen = await descargar(descargaDe(x, ["screenshot", "image"]));
    const html = await descargar(descargaDe(x, ["htmlCode", "html"]));
    if (!imagen && !html) continue;
    const titulo = typeof (x as Record<string, unknown>)?.title === "string" ? ((x as Record<string, unknown>).title as string) : null;
    pantallas.push({ pantallaId: idDe(x, "screenId", "screens") ?? pantallaId, titulo, imagen, mime: "image/png", html: html ? new TextDecoder().decode(html) : null });
  }
  if (!pantallas.length) throw new ErrorStitch("Stitch generó la pantalla pero no devolvió la imagen ni el HTML (puede que haya que abrir el proyecto una vez en stitch.withgoogle.com)");
  return { proyectoId, pantallas, sistema, aviso };
}
