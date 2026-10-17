/** Reglas puras de la IA del cliente (fase 16a) y la decisión de cuándo simular en vez de llamar al modelo. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { articulosRelevantes, calcularConsumoIa, interpretarRespuesta } from "../../src/dominio/ia-cliente";
import { generar, motivoSimulado } from "../../src/servidor/ia-modelos";

const ARTS = [
  { id: "a1", titulo: "Horarios y ubicación", contenido: "Av. Larco 345, de lunes a sábado." },
  { id: "a2", titulo: "Envíos", contenido: "A todo Lima en 24 horas y a provincias en 3 a 5 días." },
  { id: "a3", titulo: "Cambios", contenido: "Cambios dentro de los 7 días con boleta." },
];

describe("IA del cliente · reglas", () => {
  test("solo manda los artículos que tienen que ver con la pregunta", () => {
    assert.deepEqual(articulosRelevantes("¿Hacen envíos a provincias?", ARTS).map((a) => a.id), ["a2"]);
    assert.deepEqual(articulosRelevantes("¿Cuál es la capital de Francia?", ARTS), []);
  });

  test("interpreta las marcas de la respuesta del modelo y descarta acciones no permitidas", () => {
    assert.deepEqual(interpretarRespuesta("Claro, te agendo. [ACCION:AGENDAR_CITA]", ["AGENDAR_CITA"]), { texto: "Claro, te agendo.", accion: "AGENDAR_CITA", sinRespuesta: false });
    assert.deepEqual(interpretarRespuesta("[SIN_RESPUESTA] No lo sé.", []), { texto: "No lo sé.", accion: null, sinRespuesta: true });
    assert.equal(interpretarRespuesta("Listo [ACCION:CREAR_LEAD]", ["AGENDAR_CITA"]).accion, null, "una acción que el agente no tiene no se registra");
  });

  test("el consumo avisa desde el 80 % del tope y pausa al llegar", () => {
    assert.deepEqual([calcularConsumoIa("2026-10", 10, 0, 4).alerta, calcularConsumoIa("2026-10", 10, 0, 4).pausado], [false, false]);
    const casi = calcularConsumoIa("2026-10", 12.5, 0, 4);
    assert.deepEqual([casi.tope, casi.pct, casi.alerta, casi.pausado], [15, 83, true, false]);
    assert.equal(calcularConsumoIa("2026-10", 14, 1, 4).pausado, true);
  });

  test("solo llama al modelo con IA_MODO=real y la clave puesta; si no, simula sin costo", async () => {
    const antes = { modo: process.env.IA_MODO, clave: process.env.GEMINI_API_KEY };
    try {
      delete process.env.IA_MODO;
      assert.equal(motivoSimulado("GEMINI_FLASH"), "MODO_SIMULADO");
      process.env.IA_MODO = "real";
      delete process.env.GEMINI_API_KEY;
      assert.equal(motivoSimulado("GEMINI_FLASH"), "SIN_CLAVE");
      const r = await generar({ modelo: "GEMINI_FLASH", sistema: "x", mensajes: [{ rol: "user", texto: "hola" }], maxTokens: 10, simulado: () => "respuesta simulada" });
      assert.deepEqual([r.texto, r.simulado, r.motivoSimulado, r.costoUsd], ["respuesta simulada", true, "SIN_CLAVE", 0]);
    } finally {
      if (antes.modo === undefined) delete process.env.IA_MODO;
      else process.env.IA_MODO = antes.modo;
      if (antes.clave !== undefined) process.env.GEMINI_API_KEY = antes.clave;
    }
  });
});
