/**
 * La IA es un proceso interno de Inoo (reunión 15 oct): el cliente no debe notar que su trabajo se hace
 * con IA. La excepción es CRM, donde los agentes de IA y la configuración de WhatsApp API son el producto
 * que se vende: ahí sí se nombra la IA, pero solo en esos servicios.
 */

/** Servicios donde la IA es el producto. */
export const SERVICIOS_CON_IA = ["CRM_IMPLEMENTACION", "CRM_INTEGRACION"];

/** Lo que delata IA en lo que recibe el cliente. «IA» va aparte para no confundirla con sílabas como «media». */
const MARCAS_IA = /\b(agentes?|gpt|chatgpt|openai|claude|anthropic|gemini|stitch|n8n|midjourney|inteligencia artificial|generad[oa]s? con)\b/i;
const SIGLA_IA = /\b(IA|AI)\b/;

/** Devuelve el primer rastro de IA que encuentre en el texto, o null. */
export function rastroIa(texto: string): string | null {
  return texto.match(MARCAS_IA)?.[0] ?? texto.match(SIGLA_IA)?.[0] ?? null;
}

/** Una plantilla de requerimiento aplica al servicio si no tiene servicios fijados o si lo incluye. */
export const plantillaAplica = (servicios: readonly string[], codigoServicio: string) => servicios.length === 0 || servicios.includes(codigoServicio);
