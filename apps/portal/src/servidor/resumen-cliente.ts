/**
 * «Resumen del avance» para el cliente (16 nov 2026, Ernesto: «IA para el cliente apagada por defecto, activable de
 * forma muy limitada»). Lo activa el equipo por cliente; tope de usos al mes. Usa solo lo que el cliente ya ve en
 * su servicio (avance, etapas, siguiente paso, lo que tiene por revisar y sus requerimientos pendientes): nada
 * interno. No dice que es IA ([[ia-oculta-al-cliente]]). Sin IA disponible, el mismo resumen armado por reglas.
 */
import type { Area } from "../dominio/ia-equipo";
import { completarEquipo, type AlmacenPasarela } from "./pasarela-ia";

export const TOPE_RESUMENES_MES = 20;

export interface DatosResumen {
  titulo: string;
  porcentaje: number;
  etapas: { nombre: string; estado: string; fechaEstimada?: string | null; atrasada?: boolean }[];
  siguientePaso: string | null;
  porRevisar: string[];
  requerimientos: string[];
}

const ESTADO: Record<string, string> = { COMPLETADO: "lista", EN_CURSO: "en curso", SIN_INICIAR: "por empezar", PAUSADO: "en pausa" };

function datosEnTexto(d: DatosResumen) {
  return [
    `Proyecto: ${d.titulo}. Avance: ${d.porcentaje} %.`,
    `Etapas:\n${d.etapas.map((e) => `- ${e.nombre}: ${ESTADO[e.estado] ?? e.estado}${e.fechaEstimada ? ` (prevista para ${e.fechaEstimada})` : ""}${e.atrasada ? " (con retraso)" : ""}`).join("\n") || "- sin etapas"}`,
    `Siguiente paso: ${d.siguientePaso ?? "sin definir"}.`,
    `El cliente tiene por revisar: ${d.porRevisar.join("; ") || "nada"}.`,
    `El cliente nos debe enviar: ${d.requerimientos.join("; ") || "nada"}.`,
  ].join("\n");
}

const SISTEMA = `Eres parte del equipo de Inoo, una agencia de marketing, y le escribes al cliente un resumen breve de cómo va su proyecto.
Español neutro, cálido y directo, en segunda persona (tú). Máximo 120 palabras, en 3 párrafos cortos: en qué va, qué sigue, y qué necesitamos de su parte (si no necesitamos nada, dilo).
Usa solo los datos que te paso; no inventes fechas, nombres ni compromisos. No menciones que eres una inteligencia artificial ni hables de herramientas internas.`;

/** Por reglas: los mismos datos, en frases fijas. */
export function resumenPorReglas(d: DatosResumen): string {
  const actual = d.etapas.find((e) => e.estado === "EN_CURSO") ?? d.etapas.find((e) => e.estado === "SIN_INICIAR");
  const lineas = [
    `Tu proyecto ${d.titulo} va en ${d.porcentaje} %.${actual ? ` Ahora estamos en la etapa «${actual.nombre}»${actual.fechaEstimada ? `, prevista para el ${actual.fechaEstimada}` : ""}.` : ""}`,
    d.siguientePaso ? `Lo que sigue: ${d.siguientePaso}` : "",
    d.porRevisar.length || d.requerimientos.length
      ? `Necesitamos de tu parte: ${[...d.porRevisar.map((x) => `revisar «${x}»`), ...d.requerimientos.map((x) => `enviarnos ${x}`)].join("; ")}.`
      : "Por ahora no necesitamos nada de tu parte.",
  ];
  return lineas.filter(Boolean).join("\n\n");
}

export async function resumenParaCliente(almacen: AlmacenPasarela, quien: { usuarioId: string; area: Area | null }, d: DatosResumen): Promise<string> {
  const r = await completarEquipo(almacen, { ...quien, sistema: SISTEMA, mensaje: datosEnTexto(d), maxTokens: 500 });
  const t = r?.trim();
  return t && t.length > 30 && t.length < 2000 && !/inteligencia artificial|\bIA\b|modelo de lenguaje/i.test(t) ? t : resumenPorReglas(d);
}
