/**
 * Pasarela de IA del equipo (/api/v1/ia-equipo, 30 oct 2026). Habla el formato de OpenAI, así que Hermes
 * (el Jarvis de cada área) la usa como su proveedor: `base_url` = …/api/v1/ia-equipo y, como API key, la
 * clave de su área (la de JARVIS_HERMES; nadie genera llaves a mano). Por cada llamada:
 *   1. ubica el área por la clave y a la persona por la marca de la conversación (jarvis-chat.ts); sin marca,
 *      se cobra al área sin persona. Las llaves personales jv_… siguen sirviendo para un Hermes local;
 *   2. si el área llegó a su tope diario o mensual, responde 429 sin llamar a DeepSeek;
 *   3. reenvía a DeepSeek con la clave del área (DEEPSEEK_KEYS, o la general DEEPSEEK_API_KEY; solo viven en el portal);
 *   4. anota tokens y costo contra el área y la persona, también cuando la respuesta viene en streaming.
 * La API simulada y el backend real le pasan cómo leer y escribir en su almacén.
 */
import { areaDeClaveHermes, leerMarca } from "./jarvis-chat";
import { costoLlamada, estadoArea, esHoraPico, esLlaveJarvis, MODELOS_JARVIS, modeloJarvis, NOMBRE_AREA, type Area, type TopesArea, type UsoTokens } from "../dominio/ia-equipo";

export interface ConsumoJarvis extends UsoTokens {
  /** null: llamada que Hermes hizo por su cuenta, sin conversación del portal. */
  usuarioId: string | null;
  area: Area;
  modelo: string;
  costoUsd: number;
  horaPico: boolean;
  creadoEn: string;
}

export interface AlmacenPasarela {
  /** Dueño de la llave (ya comparada por hash), o null. */
  buscarLlave(llave: string): Promise<{ usuarioId: string; area: Area | null } | null>;
  /** Dueño de una conversación del chat de ese área, o null. */
  personaDeSesion(sesionId: string, area: Area): Promise<string | null>;
  /** Gasto de hoy y del mes (en Lima) del área, y sus topes. */
  situacion(area: Area, ahora: Date): Promise<{ gastoDiaUsd: number; gastoMesUsd: number; topes: TopesArea }>;
  registrar(c: ConsumoJarvis): Promise<void>;
}

const errorOpenAi = (status: number, code: string, message: string, type = "invalid_request_error") =>
  Response.json({ error: { message, type, code } }, { status });

const urlDeepSeek = () => (process.env.IA_EQUIPO_URL ?? "https://api.deepseek.com").replace(/\/$/, "");

/**
 * Clave de DeepSeek del área (2 nov): una por área en DEEPSEEK_KEYS ({"CRM": "sk-…"}) para ver el consumo de
 * cada área en el panel de DeepSeek; si el área no tiene la suya, la general DEEPSEEK_API_KEY.
 */
export function claveDeepSeek(area: Area): string | undefined {
  try {
    const porArea = JSON.parse(process.env.DEEPSEEK_KEYS ?? "{}") as Record<string, unknown>;
    if (typeof porArea[area] === "string" && porArea[area]) return porArea[area] as string;
  } catch {
    // JSON mal escrito: se usa la general
  }
  return process.env.DEEPSEEK_API_KEY || undefined;
}

/** Uso que informa DeepSeek (formato OpenAI más prompt_cache_hit_tokens). */
function usoDe(u: unknown): UsoTokens | null {
  if (!u || typeof u !== "object") return null;
  const x = u as { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  if (typeof x.prompt_tokens !== "number") return null;
  return { entrada: x.prompt_tokens, cache: x.prompt_cache_hit_tokens ?? x.prompt_tokens_details?.cached_tokens ?? 0, salida: x.completion_tokens ?? 0 };
}

export async function pasarelaIa(req: Request, ruta: string, almacen: AlmacenPasarela): Promise<Response> {
  const llave = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const areaHermes = esLlaveJarvis(llave) ? null : areaDeClaveHermes(llave);
  const duenio: { usuarioId: string | null; area: Area | null } | null = areaHermes ? { usuarioId: null, area: areaHermes } : esLlaveJarvis(llave) ? await almacen.buscarLlave(llave) : null;
  if (!duenio) return errorOpenAi(401, "LLAVE_INVALIDA", "Clave inválida: la pasarela solo atiende al Hermes de cada área.", "authentication_error");
  if (!duenio.area) return errorOpenAi(403, "SIN_AREA", "Tu usuario no tiene un área asignada. Pídele al ADMIN que te asigne una en «Equipo».", "permission_error");

  if (req.method === "GET" && ruta === "/models") {
    return Response.json({ object: "list", data: MODELOS_JARVIS.map((id) => ({ id, object: "model", owned_by: "inoo" })) });
  }
  if (req.method !== "POST" || ruta !== "/chat/completions") return errorOpenAi(404, "RUTA_NO_ENCONTRADA", `La pasarela no atiende ${req.method} ${ruta}`);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorOpenAi(400, "VALIDACION", "El cuerpo debe ser JSON válido");
  }
  const modelo = modeloJarvis(cuerpo.model);
  if (!modelo) return errorOpenAi(400, "MODELO_NO_PERMITIDO", `Modelos permitidos: ${MODELOS_JARVIS.join(", ")}`);

  const area = duenio.area;
  // Hermes del área: la persona sale de la marca de la conversación (un id al azar; el bot la necesita para
  // las herramientas del portal, así que llega a DeepSeek tal cual).
  const sesionId = duenio.usuarioId ? null : leerMarca(cuerpo.messages);
  const usuarioId = duenio.usuarioId ?? (sesionId ? await almacen.personaDeSesion(sesionId, area) : null);
  const ahora = new Date();
  const s = await almacen.situacion(area, ahora);
  const estado = estadoArea(s.gastoDiaUsd, s.gastoMesUsd, s.topes);
  if (estado.pausado) {
    const cuando = estado.pausado === "DIARIO" ? "el tope de hoy" : "el tope del mes";
    return errorOpenAi(429, "TOPE_AREA", `El área ${NOMBRE_AREA[area]} llegó a ${cuando} de IA. Vuelve a estar disponible ${estado.pausado === "DIARIO" ? "mañana" : "el próximo mes"}, o pídele al ADMIN que lo amplíe.`, "insufficient_quota");
  }

  const clave = claveDeepSeek(area);
  if (!clave) return errorOpenAi(503, "SIN_CLAVE", `El portal no tiene clave de DeepSeek para el área ${NOMBRE_AREA[area]} (DEEPSEEK_KEYS o DEEPSEEK_API_KEY).`, "server_error");

  const stream = cuerpo.stream === true;
  const enviar = { ...cuerpo, model: modelo, ...(stream ? { stream_options: { ...(cuerpo.stream_options as object), include_usage: true } } : {}) };
  let r: Response;
  try {
    r = await fetch(`${urlDeepSeek()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
      body: JSON.stringify(enviar),
      signal: req.signal,
    });
  } catch (e) {
    return errorOpenAi(502, "IA_NO_DISPONIBLE", `No pudimos llegar a DeepSeek: ${(e as Error).message}`, "server_error");
  }
  // Los errores de DeepSeek pasan tal cual y no cuestan.
  if (!r.ok || !r.body) return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });

  const anotar = async (uso: UsoTokens | null) => {
    if (!uso) return;
    const fecha = new Date();
    await almacen.registrar({ usuarioId, area, modelo, ...uso, costoUsd: costoLlamada(modelo, uso, fecha), horaPico: esHoraPico(fecha), creadoEn: fecha.toISOString() });
  };

  if (!stream) {
    const json = (await r.json()) as { usage?: unknown };
    await anotar(usoDe(json.usage));
    return Response.json(json);
  }

  // Streaming (SSE): se reenvía tal cual y se lee el uso del último fragmento al vuelo.
  let resto = "";
  let uso: UsoTokens | null = null;
  const decodificador = new TextDecoder();
  const leer = (texto: string) => {
    resto += texto;
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";
    for (const l of lineas) {
      if (!l.startsWith("data:")) continue;
      const dato = l.slice(5).trim();
      if (!dato || dato === "[DONE]") continue;
      try {
        uso = usoDe((JSON.parse(dato) as { usage?: unknown }).usage) ?? uso;
      } catch {
        /* fragmento que no es JSON: se reenvía igual */
      }
    }
  };
  const espia = new TransformStream<Uint8Array, Uint8Array>({
    transform(trozo, ctrl) {
      leer(decodificador.decode(trozo, { stream: true }));
      ctrl.enqueue(trozo);
    },
    async flush() {
      leer(`${decodificador.decode()}\n`);
      await anotar(uso).catch((e) => console.error("[pasarela-ia] no se pudo anotar el consumo", e));
    },
  });
  return new Response(r.body.pipeThrough(espia), {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") ?? "text/event-stream", "cache-control": "no-cache" },
  });
}

/**
 * Llamada del propio portal a DeepSeek para una herramienta del equipo (2 nov: transcripciones). Mismas reglas
 * que la pasarela: respeta el tope del área y anota el gasto contra el área y la persona. Devuelve null si el
 * área está pausada, no hay clave o DeepSeek no responde: quien llama usa su respaldo.
 */
export async function completarEquipo(
  almacen: AlmacenPasarela,
  p: { usuarioId: string; area: Area | null; sistema: string; mensaje: string; maxTokens: number },
): Promise<string | null> {
  if (!p.area) return null;
  const clave = claveDeepSeek(p.area);
  if (!clave) return null;
  const s = await almacen.situacion(p.area, new Date());
  if (estadoArea(s.gastoDiaUsd, s.gastoMesUsd, s.topes).pausado) return null;
  const modelo = "deepseek-flash";
  try {
    const r = await fetch(`${urlDeepSeek()}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: modelo,
        max_tokens: p.maxTokens,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: p.sistema }, { role: "user", content: p.mensaje }],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      console.error("[pasarela-ia] DeepSeek respondió", r.status);
      return null;
    }
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; usage?: unknown };
    const uso = usoDe(j.usage);
    if (uso) {
      const fecha = new Date();
      await almacen.registrar({ usuarioId: p.usuarioId, area: p.area, modelo, ...uso, costoUsd: costoLlamada(modelo, uso, fecha), horaPico: esHoraPico(fecha), creadoEn: fecha.toISOString() });
    }
    return j.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error("[pasarela-ia] DeepSeek no respondió", (e as Error).message);
    return null;
  }
}
