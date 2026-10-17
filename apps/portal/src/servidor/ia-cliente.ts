/**
 * Servicios de la IA del cliente (fase 16a) que comparten la API simulada y el backend real: el chat de
 * prueba de un agente, Content AI y «Crear con IA». Arma lo que se le manda al modelo (solo los artículos
 * relevantes y los últimos mensajes) y traduce la respuesta. Lo que paga el cliente sale de las tarifas
 * (de relleno) y se cobra también en modo simulado, para que el consumo se vea en las demos; el costo
 * real de la API solo queda en el log.
 */
import type { components } from "../api/tipos-api";
import {
  articulosRelevantes, bloqueConocimiento, borradorSimulado, contenidoSimulado, contarPalabras, DESTINOS, instruccionesSistema, interpretarRespuesta,
  LIMITES, respuestaSimulada, TARIFAS_PEN, type AccionAgente, type Articulo, type ConfigAgente, type DestinoContenido, type Tono,
} from "../dominio/ia-cliente";
import { generar, motivoSimulado, type MensajeIa } from "./ia-modelos";

type S<K extends keyof components["schemas"]> = components["schemas"][K];

export interface RespuestaAgente {
  texto: string;
  accion: AccionAgente | null;
  sinRespuesta: boolean;
  simulado: boolean;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  costoPen: number;
}

/** Responde un mensaje del chat de prueba. `historial`: mensajes anteriores de la conversación, en orden. */
export async function responderAgente(p: {
  config: ConfigAgente;
  razonamientoAvanzado: boolean;
  articulos: Articulo[];
  historial: { rol: "CONTACTO" | "AGENTE"; texto: string }[];
  mensaje: string;
}): Promise<RespuestaAgente> {
  const relevantes = articulosRelevantes(p.mensaje, p.articulos);
  const mensajes: MensajeIa[] = [
    ...p.historial.slice(-LIMITES.historial).map((m): MensajeIa => ({ rol: m.rol === "CONTACTO" ? "user" : "assistant", texto: m.texto })),
    { rol: "user", texto: `${bloqueConocimiento(relevantes)}\n\nMENSAJE DEL CLIENTE: ${p.mensaje}` },
  ];
  // Gemini y Claude piden que la conversación empiece con el usuario.
  while (mensajes.length && mensajes[0].rol !== "user") mensajes.shift();
  const r = await generar({
    modelo: p.razonamientoAvanzado ? "CLAUDE_SONNET" : "GEMINI_FLASH",
    sistema: instruccionesSistema(p.config),
    mensajes,
    maxTokens: LIMITES.tokensRespuestaAgente,
    simulado: () => {
      const s = respuestaSimulada(p.config, p.mensaje, p.articulos);
      return `${s.sinRespuesta ? "[SIN_RESPUESTA] " : ""}${s.texto}${s.accion ? ` [ACCION:${s.accion}]` : ""}`;
    },
  });
  const i = interpretarRespuesta(r.texto, p.config.acciones);
  return {
    ...i, simulado: r.simulado, modelo: r.modelo, tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida,
    costoPen: p.razonamientoAvanzado ? TARIFAS_PEN.mensajeAgenteAvanzado : TARIFAS_PEN.mensajeAgente,
  };
}

const NOMBRE_TONO: Record<Tono, string> = { CERCANO: "cercano", FORMAL: "formal", ENTUSIASTA: "entusiasta" };
const SEPARADOR = "\n===\n";

/** Content AI (Gemini Flash): devuelve las variaciones pedidas. */
export async function generarContenido(p: { negocio: string; destino: DestinoContenido; indicacion: string; tono: Tono | null; variaciones: number }) {
  const destino = DESTINOS.find((d) => d.codigo === p.destino)!.nombre;
  const r = await generar({
    modelo: "GEMINI_FLASH",
    sistema: `Eres redactor de ${p.negocio}. Escribes en español, tono ${NOMBRE_TONO[p.tono ?? "CERCANO"]}, listo para publicar, sin explicaciones ni comentarios. Si piden varias variaciones, sepáralas con una línea que diga solo ===.`,
    mensajes: [{ rol: "user", texto: `Formato: ${destino}. Variaciones: ${p.variaciones}.\nPedido: ${p.indicacion}` }],
    maxTokens: LIMITES.tokensContenido,
    simulado: () => contenidoSimulado(p.destino, p.indicacion, p.variaciones).join(SEPARADOR),
  });
  const variaciones = r.texto.split(/\n\s*===\s*\n/).map((x) => x.trim()).filter(Boolean).slice(0, p.variaciones);
  return { variaciones, palabras: contarPalabras(variaciones), simulado: r.simulado, modelo: r.modelo, costoPen: Math.round(variaciones.length * TARIFAS_PEN.contenidoPorVariacion * 100) / 100 };
}

const ESQUEMA_BORRADOR = {
  type: "object",
  additionalProperties: false,
  required: ["nombre", "rol", "tono", "saludo", "instrucciones", "acciones"],
  properties: {
    nombre: { type: "string" },
    rol: { type: "string" },
    tono: { type: "string", enum: ["CERCANO", "FORMAL", "ENTUSIASTA"] },
    saludo: { type: "string" },
    instrucciones: { type: "string" },
    acciones: { type: "array", items: { type: "string", enum: ["CREAR_LEAD", "AGENDAR_CITA", "ENVIAR_CATALOGO", "DERIVAR_PERSONA"] } },
  },
};

/** «Crear con IA» (Claude Sonnet 5.5, una llamada por agente nuevo): propone un agente a partir del negocio. Es gratis para el cliente: crear no cuesta. */
export async function borradorAgente(descripcion: string, negocio: string): Promise<{ agente: S<"AgenteIaEntrada">; simulado: boolean }> {
  const r = await generar({
    modelo: "CLAUDE_SONNET",
    sistema: "Diseñas agentes de atención por chat para pequeños negocios de Perú. A partir de la descripción del negocio, propone un agente útil y prudente: nombre corto, rol, tono, saludo de una línea, instrucciones claras (qué responde, qué no inventa, cuándo pasa con una persona) y las acciones que le sirven. Todo en español.",
    mensajes: [{ rol: "user", texto: `Negocio: ${negocio}

${descripcion}` }],
    maxTokens: LIMITES.tokensBorrador,
    esquema: ESQUEMA_BORRADOR,
    simulado: () => JSON.stringify(borradorSimulado(descripcion, negocio)),
  });
  let agente: S<"AgenteIaEntrada">;
  try {
    agente = JSON.parse(r.texto) as S<"AgenteIaEntrada">;
  } catch {
    agente = borradorSimulado(descripcion, negocio);
  }
  return { agente: { conocimientoIds: [], plantillaCodigo: null, ...agente }, simulado: r.simulado };
}

/** Si las respuestas de la IA se simulan ahora (para avisarlo en la pantalla). */
export const iaSimulada = () => motivoSimulado("GEMINI_FLASH") !== null;
