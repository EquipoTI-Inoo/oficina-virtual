/** Reglas puras del Jarvis del equipo: horario pico, costo con los precios oficiales y topes por área. */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { costoLlamada, diaYMesLima, esHoraPico, estadoArea, modeloJarvis, validarTopes } from "../../src/dominio/ia-equipo";

describe("Jarvis del equipo · reglas", () => {
  test("horario pico de DeepSeek: 01–04 y 06–10 UTC de lunes a viernes; el resto, fuera de pico", () => {
    assert.equal(esHoraPico(new Date("2026-10-28T02:30:00Z")), true, "miércoles 21:30 en Lima");
    assert.equal(esHoraPico(new Date("2026-10-28T09:59:00Z")), true);
    assert.equal(esHoraPico(new Date("2026-10-28T10:00:00Z")), false);
    assert.equal(esHoraPico(new Date("2026-10-28T15:00:00Z")), false, "jornada laboral en Lima");
    assert.equal(esHoraPico(new Date("2026-10-31T02:30:00Z")), false, "sábado");
  });

  test("costo: caché, entrada y salida con los precios oficiales; fuera de pico cuesta la mitad", () => {
    const uso = { entrada: 1_000_000, cache: 800_000, salida: 100_000 };
    // Flash en pico: 0,8 M × 0,006 + 0,2 M × 0,30 + 0,1 M × 1,20 = 0,0048 + 0,06 + 0,12
    assert.equal(costoLlamada("deepseek-flash", uso, new Date("2026-10-28T02:00:00Z")), 0.1848);
    assert.equal(costoLlamada("deepseek-flash", uso, new Date("2026-10-28T15:00:00Z")), 0.0924);
    assert.equal(costoLlamada("deepseek-v4-flash", uso, new Date("2026-10-28T15:00:00Z")), 0.0924, "nombre antiguo, mismo precio");
    // Pro fuera de pico: (0,8 × 0,044 + 0,2 × 1,32 + 0,1 × 3,96) / 2
    assert.equal(costoLlamada("deepseek-v4-pro", uso, new Date("2026-10-28T15:00:00Z")), 0.3476);
  });

  test("solo los modelos de DeepSeek permitidos", () => {
    assert.equal(modeloJarvis("deepseek-flash"), "deepseek-flash");
    assert.equal(modeloJarvis("deepseek-v4-flash"), "deepseek-flash");
    assert.equal(modeloJarvis("gpt-5"), null);
  });

  test("topes: alerta desde el 80 %, pausa al llegar al diario o al mensual", () => {
    const t = { diarioUsd: 3, mensualUsd: 30 };
    assert.deepEqual(estadoArea(1, 10, t).pausado, null);
    assert.equal(estadoArea(2.4, 10, t).alerta, true);
    assert.equal(estadoArea(3, 10, t).pausado, "DIARIO");
    assert.equal(estadoArea(0, 30, t).pausado, "MENSUAL");
    assert.deepEqual(validarTopes({ topeDiarioUsd: 5, topeMensualUsd: 4 }).map((e) => e.campo), ["topeDiarioUsd"]);
    assert.deepEqual(validarTopes({ topeDiarioUsd: 0, topeMensualUsd: "x" }).map((e) => e.campo), ["topeDiarioUsd", "topeMensualUsd"]);
  });

  test("el día y el mes se cortan en Lima", () => {
    assert.deepEqual(diaYMesLima(new Date("2026-11-01T03:00:00Z")), { dia: "2026-10-31", mes: "2026-10" });
  });
});
