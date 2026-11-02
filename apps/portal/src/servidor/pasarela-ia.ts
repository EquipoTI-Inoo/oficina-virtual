/**
 * Pasarela de IA del equipo (/api/v1/ia-equipo, 30 oct 2026). Habla el formato de OpenAI, así que Hermes
 * (el Jarvis de cada colaborador) la usa como su proveedor: `base_url` = …/api/v1/ia-equipo y la llave
 * personal de Jarvis como API key. Por cada llamada:
 *   1. ubica a la persona por su llave y toma su área (sin área no hay Jarvis);
 *   2. si el área llegó a su tope diario o mensual, responde 429 sin llamar a DeepSeek;
 *   3. reenvía a DeepSeek con la clave de Inoo (DEEPSEEK_API_KEY, que solo vive en el portal);
 *   4. anota tokens y costo contra el área y la persona, también cuando la respuesta viene en streaming.
 * La API simulada y el backend real le pasan cómo leer y escribir en su almacén.
 */
import { costoLlamada, estadoArea, esHoraPico, esLlaveJarvis, MODELOS_JARVIS, modeloJarvis, NOMBRE_AREA, type Area, type TopesArea, type UsoTokens } from "../dominio/ia-equipo";

export interface ConsumoJarvis extends UsoTokens {
  usuarioId: string;
  area: Area;
  modelo: string;
  costoUsd: number;
  horaPico: boolean;
  creadoEn: string;
}

export interface AlmacenPasarela {
  /** Dueño de la llave (ya comparada por hash), o null. */
  buscarLlave(llave: string): Promise<{ usuarioId: string; area: Area | null } | null>;
  /** Gasto de hoy y del mes (en Lima) del área, y sus topes. */
  situacion(area: Area, ahora: Date): Promise<{ gastoDiaUsd: number; gastoMesUsd: number; topes: TopesArea }>;
  registrar(c: ConsumoJarvis): Promise<void>;
}

const errorOpenAi = (status: number, code: string, message: string, type = "invalid_request_error") =>
  Response.json({ error: { message, type, code } }, { status });

const urlDeepSeek = () => (process.env.IA_EQUIPO_URL ?? "https://api.deepseek.com").replace(/\/$/, "");

/** Uso que informa DeepSeek (formato OpenAI más prompt_cache_hit_tokens). */
function usoDe(u: unknown): UsoTokens | null {
  if (!u || typeof u !== "object") return null;
  const x = u as { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  if (typeof x.prompt_tokens !== "number") return null;
  return { entrada: x.prompt_tokens, cache: x.prompt_cache_hit_tokens ?? x.prompt_tokens_details?.cached_tokens ?? 0, salida: x.completion_tokens ?? 0 };
}

export async function pasarelaIa(req: Request, ruta: string, almacen: AlmacenPasarela): Promise<Response> {
  const llave = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const duenio = esLlaveJarvis(llave) ? await almacen.buscarLlave(llave) : null;
  if (!duenio) return errorOpenAi(401, "LLAVE_INVALIDA", "Llave de Jarvis inválida o revocada. Genera una nueva en «Mi panel» del portal.", "authentication_error");
  if (!duenio.area) return errorOpenAi(403, "SIN_AREA", "Tu usuario no tiene un área asignada. Pídele al ADMIN que te asigne una en «Costos de IA».", "permission_error");

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
  const ahora = new Date();
  const s = await almacen.situacion(area, ahora);
  const estado = estadoArea(s.gastoDiaUsd, s.gastoMesUsd, s.topes);
  if (estado.pausado) {
    const cuando = estado.pausado === "DIARIO" ? "el tope de hoy" : "el tope del mes";
    return errorOpenAi(429, "TOPE_AREA", `El área ${NOMBRE_AREA[area]} llegó a ${cuando} de IA. Vuelve a estar disponible ${estado.pausado === "DIARIO" ? "mañana" : "el próximo mes"}, o pídele al ADMIN que lo amplíe.`, "insufficient_quota");
  }

  const clave = process.env.DEEPSEEK_API_KEY;
  if (!clave) return errorOpenAi(503, "SIN_CLAVE", "El portal no tiene configurada la clave de DeepSeek (DEEPSEEK_API_KEY).", "server_error");

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
    await almacen.registrar({ usuarioId: duenio.usuarioId, area, modelo, ...uso, costoUsd: costoLlamada(modelo, uso, fecha), horaPico: esHoraPico(fecha), creadoEn: fecha.toISOString() });
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
