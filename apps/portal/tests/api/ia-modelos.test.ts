/** Cuándo se llama al modelo de IA y cuándo se simula (lo usa el taller web). */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { generar, motivoSimulado } from "../../src/servidor/ia-modelos";

describe("IA · modelos", () => {
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
  test("al llegar al tope diario falla con un error claro (no devuelve relleno)", async () => {
    const antes = { modo: process.env.IA_MODO, clave: process.env.GEMINI_API_KEY, tope: process.env.IA_TOPE_DIARIO_USD };
    try {
      process.env.IA_MODO = "real";
      process.env.GEMINI_API_KEY = "clave-de-prueba";
      process.env.IA_TOPE_DIARIO_USD = "0";
      await assert.rejects(
        generar({ modelo: "GEMINI_FLASH", sistema: "x", mensajes: [{ rol: "user", texto: "hola" }], maxTokens: 10, simulado: () => "relleno" }),
        /tope diario/,
      );
    } finally {
      for (const [k, v] of [["IA_MODO", antes.modo], ["GEMINI_API_KEY", antes.clave], ["IA_TOPE_DIARIO_USD", antes.tope]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
