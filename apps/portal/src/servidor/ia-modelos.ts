/**
 * Llamadas a los modelos para la IA del cliente (fase 16a). Solo en el servidor: las claves viven en
 * apps/portal/.env.local y nunca llegan al navegador.
 *
 * Decidido el 17 oct: Gemini Flash para casi todo y Claude Sonnet 5.5 solo para razonamiento («Crear
 * con IA» y agentes de razonamiento avanzado). En fase de prueba se gasta lo mínimo:
 *  · IA_MODO=simulado (por defecto): no llama a nadie; responde la función `simulado` del llamador.
 *  · Tope diario de todo el sistema (IA_TOPE_DIARIO_USD): al llegar, vuelve a simulado y avisa en el log.
 *  · Respuestas cortas (max tokens por llamada), sin razonamiento en Gemini y esfuerzo bajo en Claude.
 *  · Cada llamada real deja una línea en el log con tokens y costo.
 */
import Anthropic from "@anthropic-ai/sdk";

export type ModeloIa = "GEMINI_FLASH" | "CLAUDE_SONNET";
export type MotivoSimulado = "MODO_SIMULADO" | "SIN_CLAVE" | "TOPE_DIARIO";
export interface MensajeIa { rol: "user" | "assistant"; texto: string }
export interface ResultadoIa {
  texto: string;
  modelo: string;
  simulado: boolean;
  motivoSimulado?: MotivoSimulado;
  tokensEntrada: number;
  tokensSalida: number;
  costoUsd: number;
}
export class ErrorIa extends Error {}

/** USD por millón de tokens. Claude Sonnet 5.5 según la tabla de Anthropic; Gemini Flash, de relleno. */
const PRECIOS: Record<ModeloIa, { entrada: number; salida: number }> = {
  GEMINI_FLASH: { entrada: 0.3, salida: 2.5 },
  CLAUDE_SONNET: { entrada: 2, salida: 10 },
};

const env = (k: string) => process.env[k]?.trim() || undefined;
const gastoDelDia = { dia: "", usd: 0 };

function gastoHoy() {
  const dia = new Date().toISOString().slice(0, 10);
  if (gastoDelDia.dia !== dia) Object.assign(gastoDelDia, { dia, usd: 0 });
  return gastoDelDia;
}

/** Por qué una llamada se resolvería en modo simulado (o null si va a la API). */
export function motivoSimulado(modelo: ModeloIa): MotivoSimulado | null {
  if (env("IA_MODO") !== "real") return "MODO_SIMULADO";
  if (!env(modelo === "GEMINI_FLASH" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY")) return "SIN_CLAVE";
  if (gastoHoy().usd >= Number(env("IA_TOPE_DIARIO_USD") ?? 2)) return "TOPE_DIARIO";
  return null;
}

export async function generar(p: {
  modelo: ModeloIa;
  sistema: string;
  mensajes: MensajeIa[];
  maxTokens: number;
  /** JSON Schema para pedir la respuesta en JSON (solo lo usa Claude). */
  esquema?: Record<string, unknown>;
  /** Respuesta cuando no se llama a la API. */
  simulado: () => string;
}): Promise<ResultadoIa> {
  const motivo = motivoSimulado(p.modelo);
  if (motivo) {
    if (motivo === "TOPE_DIARIO") console.warn(JSON.stringify({ ia: "tope_diario", gastoUsd: gastoHoy().usd }));
    return { texto: p.simulado(), modelo: "simulado", simulado: true, motivoSimulado: motivo, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 };
  }
  const r = p.modelo === "GEMINI_FLASH" ? await llamarGemini(p) : await llamarClaude(p);
  const precio = PRECIOS[p.modelo];
  const costoUsd = (r.tokensEntrada * precio.entrada + r.tokensSalida * precio.salida) / 1_000_000;
  gastoHoy().usd += costoUsd;
  console.info(JSON.stringify({ ia: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costoUsd: Number(costoUsd.toFixed(6)), gastoDelDiaUsd: Number(gastoHoy().usd.toFixed(4)) }));
  return { ...r, simulado: false, costoUsd };
}

// ───────────────────────────── Gemini (REST)

async function llamarGemini(p: { sistema: string; mensajes: MensajeIa[]; maxTokens: number }) {
  const modelo = env("GEMINI_MODELO") ?? "gemini-flash-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env("GEMINI_API_KEY")! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: p.sistema }] },
      contents: p.mensajes.map((m) => ({ role: m.rol === "user" ? "user" : "model", parts: [{ text: m.texto }] })),
      // Sin razonamiento: en Gemini Flash los tokens de razonamiento cuentan dentro de maxOutputTokens.
      generationConfig: { maxOutputTokens: p.maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new ErrorIa(`Gemini respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const texto = (j.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
  if (!texto) throw new ErrorIa("Gemini no devolvió texto");
  return { texto, modelo, tokensEntrada: j.usageMetadata?.promptTokenCount ?? 0, tokensSalida: j.usageMetadata?.candidatesTokenCount ?? 0 };
}

// ───────────────────────────── Claude (SDK oficial)

let cliente: Anthropic | null = null;

async function llamarClaude(p: { sistema: string; mensajes: MensajeIa[]; maxTokens: number; esquema?: Record<string, unknown> }) {
  const modelo = env("CLAUDE_MODELO") ?? "claude-sonnet-5-5";
  cliente ??= new Anthropic();
  try {
    const r = await cliente.beta.messages.create({
      model: modelo,
      max_tokens: p.maxTokens,
      // Las instrucciones fijas se cachean para no volver a pagarlas en cada llamada.
      system: [{ type: "text", text: p.sistema, cache_control: { type: "ephemeral" } }],
      messages: p.mensajes.map((m) => ({ role: m.rol, content: m.texto })),
      output_config: { effort: "low", ...(p.esquema ? { format: { type: "json_schema" as const, schema: p.esquema } } : {}) },
      // Si Claude declina por políticas, la API reintenta con el modelo de respaldo que corresponda.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (r.stop_reason === "refusal") throw new ErrorIa("Claude declinó la solicitud");
    const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!texto) throw new ErrorIa("Claude no devolvió texto");
    const u = r.usage;
    return { texto, modelo, tokensEntrada: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), tokensSalida: u.output_tokens };
  } catch (e) {
    if (e instanceof ErrorIa) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new ErrorIa("Claude: demasiadas solicitudes, intenta en un momento");
    if (e instanceof Anthropic.AuthenticationError) throw new ErrorIa("Claude: la clave de API no es válida");
    if (e instanceof Anthropic.APIError) throw new ErrorIa(`Claude respondió ${e.status ?? "?"}: ${e.message.slice(0, 200)}`);
    throw new ErrorIa(`No pudimos conectar con Claude: ${(e as Error).message}`);
  }
}
