/**
 * Transcripción → propuesta (fases 17 y 18), en el servidor. Son herramientas del equipo, así que usan la IA
 * del equipo: DeepSeek, con el tope del área y el gasto anotado a la persona (pasarela-ia.ts). Si el área está
 * pausada, no hay clave o la respuesta no sirve, sale el borrador por reglas del dominio.
 * Lo usan la API simulada y el backend real; ninguna de las dos guarda nada aquí.
 */
import { altaPorReglas, jsonDe, normalizarAlta, normalizarResumen, resumenPorReglas, SISTEMA_ALTA, SISTEMA_RESUMEN, type PropuestaAlta, type PropuestaResumen } from "../dominio/transcripciones";
import type { Area } from "../dominio/ia-equipo";
import { completarEquipo, type AlmacenPasarela } from "./pasarela-ia";

export interface QuienPide { usuarioId: string; area: Area | null }

export async function proponerAlta(almacen: AlmacenPasarela, quien: QuienPide, transcripcion: string): Promise<{ propuesta: PropuestaAlta; conIa: boolean }> {
  const t = await completarEquipo(almacen, { ...quien, sistema: SISTEMA_ALTA, mensaje: transcripcion, maxTokens: 4000 });
  const j = t ? jsonDe(t) : null;
  return j ? { propuesta: normalizarAlta(j), conIa: true } : { propuesta: altaPorReglas(transcripcion), conIa: false };
}

export async function proponerResumen(almacen: AlmacenPasarela, quien: QuienPide, transcripcion: string): Promise<{ propuesta: PropuestaResumen; conIa: boolean }> {
  const t = await completarEquipo(almacen, { ...quien, sistema: SISTEMA_RESUMEN, mensaje: transcripcion, maxTokens: 4000 });
  const j = t ? jsonDe(t) : null;
  const p = j ? normalizarResumen(j) : null;
  return p ? { propuesta: p, conIa: true } : { propuesta: resumenPorReglas(transcripcion), conIa: false };
}
