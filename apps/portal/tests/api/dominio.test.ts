/** Reglas de dominio sin API: semáforo de requerimientos y plazo de revisión del cliente (reunión 15 oct). */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diasNoLaborables, FERIADOS_PERU_2026 } from "../../src/dominio/calendario";
import { CAMPOS_BRIEF_BRANDING, CAMPOS_BRIEF_WEB, CAMPOS_INGRESO } from "../../src/dominio/briefs";
import { camposVisibles, diasParaVencer, semaforoRequerimiento, validarRespuestas } from "../../src/dominio/requerimientos";
import { diasAtrasoRevision, revisionVence } from "../../src/dominio/revision";
import { plantillaAplica, rastroIa } from "../../src/dominio/ia";

const FERIADOS = diasNoLaborables(FERIADOS_PERU_2026.map((f) => ({ tipo: "FERIADO", fechaInicio: f.fecha, fechaFin: f.fecha })));

describe("semáforo de lo que el cliente debe entregar", () => {
  test("días para vencer cuenta hábiles y salta el feriado del 8 de octubre", () => {
    assert.equal(diasParaVencer("2026-10-06", "2026-10-06T15:00:00Z", FERIADOS), 0, "vence hoy");
    assert.equal(diasParaVencer("2026-10-09", "2026-10-06", FERIADOS), 2, "7 y 9 (el 8 es feriado)");
    assert.equal(diasParaVencer("2026-10-12", "2026-10-09", FERIADOS), 1, "el sábado y domingo no cuentan");
    assert.equal(diasParaVencer("2026-10-05", "2026-10-06", FERIADOS), 0, "ya venció");
  });

  test("verde con tiempo, naranja si vence hoy o el siguiente hábil, rojo si está atrasado", () => {
    assert.equal(semaforoRequerimiento({ estado: "PENDIENTE", diasAtraso: 0, diasParaVencer: 3 }), "VERDE");
    assert.equal(semaforoRequerimiento({ estado: "PENDIENTE", diasAtraso: 0, diasParaVencer: 1 }), "NARANJA");
    assert.equal(semaforoRequerimiento({ estado: "OBSERVADO", diasAtraso: 0, diasParaVencer: 0 }), "NARANJA");
    assert.equal(semaforoRequerimiento({ estado: "PENDIENTE", diasAtraso: 2, diasParaVencer: 0 }), "ROJO");
    assert.equal(semaforoRequerimiento({ estado: "ENVIADO", diasAtraso: 2, diasParaVencer: 0 }), null, "lo enviado no lleva semáforo");
    assert.equal(semaforoRequerimiento({ estado: "APROBADO", diasAtraso: 0, diasParaVencer: 5 }), null);
  });
});

describe("plazo de revisión del cliente", () => {
  test("3 días hábiles desde que se le envía, sin contar el feriado", () => {
    assert.equal(revisionVence("2026-10-05T15:30:00Z", FERIADOS), "2026-10-09", "6, 7 y 9");
    assert.equal(diasAtrasoRevision("2026-10-05T15:30:00Z", "2026-10-09", FERIADOS), 0, "el último día todavía está a tiempo");
    assert.equal(diasAtrasoRevision("2026-10-05T15:30:00Z", "2026-10-13", FERIADOS), 2, "12 y 13");
  });
});

describe("rastro de IA (el cliente no debe notarla)", () => {
  test("detecta las marcas típicas y no confunde palabras comunes", () => {
    for (const t of ['{"autorTipo":"AGENTE"}', "Lo hizo el Agente Editorial", "Generado con Claude", "Gemini 3.8 Flash", "texto de IA", "workflow de n8n"]) assert.ok(rastroIa(t), t);
    for (const t of ["Social Media Pro", "Paid Media", "Lo pediste el día 5", "Equipo de agencia", "Diseño y desarrollo web", "La tienda"]) assert.equal(rastroIa(t), null, t);
  });
  test("una plantilla sin servicios aplica a todos; con servicios, solo a esos", () => {
    assert.equal(plantillaAplica([], "WEB"), true);
    assert.equal(plantillaAplica(["CRM_IMPLEMENTACION", "CRM_INTEGRACION"], "SOCIAL_MEDIA_PRO"), false);
    assert.equal(plantillaAplica(["CRM_IMPLEMENTACION", "CRM_INTEGRACION"], "CRM_INTEGRACION"), true);
  });
});

describe("formularios con caminos (briefs y ingreso de Monday)", () => {
  test("una pregunta depende de otra que también puede estar oculta", () => {
    const v = (r: Record<string, unknown>) => [...camposVisibles(CAMPOS_BRIEF_WEB, r)].filter((k) => ["tipoProyecto", "metodosPago", "cantidadProductos", "blog"].includes(k));
    assert.deepEqual(v({}), []);
    assert.deepEqual(v({ situacion: "Diseño web desde cero", tipoProyecto: "Web e-commerce" }), ["tipoProyecto", "cantidadProductos", "metodosPago"]);
    assert.deepEqual(v({ situacion: "Diseño web desde cero", tipoProyecto: "Web corporativa" }), ["tipoProyecto", "blog"]);
    assert.deepEqual(v({ situacion: "Diseño web nuevo a partir de una página web existente", tipoProyecto: "Web e-commerce" }), [], "si el tipo está oculto, lo que depende de él también");
  });
  test("selección múltiple: «Otros» abre la pregunta de cuáles", () => {
    assert.ok(!camposVisibles(CAMPOS_BRIEF_BRANDING, { papeleria: ["Lapicero"] }).has("papeleriaOtros"));
    assert.ok(camposVisibles(CAMPOS_BRIEF_BRANDING, { papeleria: ["Lapicero", "Otros"] }).has("papeleriaOtros"));
    assert.deepEqual(validarRespuestas(CAMPOS_BRIEF_BRANDING, { marca: "X", papeleria: ["Taza"] }, true).map((e) => e.campo), ["papeleria"]);
  });
  test("ingreso: cada servicio pide su paquete; número y fecha se validan", () => {
    const base = { objetivos: "Vender más", fechaReunionBrief: "2026-10-26" };
    assert.deepEqual(validarRespuestas(CAMPOS_INGRESO, { ...base, servicios: ["Branding", "Desarrollo web"] }, true).map((e) => e.campo), ["paqueteBranding", "tipoWeb", "estructuraWeb"]);
    assert.deepEqual(validarRespuestas(CAMPOS_INGRESO, { ...base, servicios: ["SEO"] }, true), []);
    const malos = validarRespuestas(CAMPOS_INGRESO, { ...base, servicios: ["Desarrollo web"], tipoWeb: "Web e-commerce", estructuraWeb: "Código", cantidadProductos: "muchos", fechaReunionBrief: "26/10" }, true);
    assert.deepEqual(malos.map((e) => [e.campo, e.mensaje]), [["cantidadProductos", "Escribe un número"], ["fechaReunionBrief", "Elige una fecha"]]);
  });
});
