/**
 * Soporte por consumo (reunión del 15 oct 2026, fase 15): el soporte continuo no tiene etapas; cada
 * mes trae una bolsa (tickets complejos y básicos, horas de Meet, WhatsApp ilimitado). Corre contra la
 * API simulada y Postgres.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const SOPORTE = uid(4, 1);
const WEB = uid(4, 4);
const T1039 = uid(8, 1039);
const RUTA = `/servicios-contratados/${SOPORTE}/consumo?periodo=2026-10`;
const usado = (c: any) => Object.fromEntries(c.recursos.map((r: any) => [r.clave, [r.usado, r.incluido, r.nivel]]));

export function pruebasConsumo(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`soporte por consumo · ${nombre}`, () => {
    test("la bolsa del mes: tickets por complejidad, horas de Meet y WhatsApp ilimitado; sin etapas", async () => {
      await reiniciar();
      const c = (await llamar("GET", RUTA, VALERIA)).json;
      assert.deepEqual(usado(c), { TICKETS_COMPLEJOS: [1, 2, "OK"], TICKETS_BASICOS: [1, 8, "OK"], HORAS_MEET: [1.5, 2, "OK"] });
      assert.equal(c.whatsappIlimitado, true);
      const servicios = (await llamar("GET", `/clientes/${CASA_OLIVA}/servicios?periodo=2026-10`, VALERIA)).json.servicios;
      const soporte = servicios.find((s: any) => s.servicioContratadoId === SOPORTE);
      assert.deepEqual([soporte.avance.totalEtapas, soporte.consumo.recursos.length], [0, 3], "el soporte no tiene etapas: se mide por consumo");
      assert.equal(servicios.find((s: any) => s.servicioContratadoId === WEB).consumo, undefined);
      assert.equal((await llamar("GET", `/servicios-contratados/${WEB}/consumo`, DIEGO)).json.codigo, "SERVICIO_SIN_BOLSA");
      const pipeline = (await llamar("GET", "/panel/proyectos", DIEGO)).json.datos.find((x: any) => x.servicioContratadoId === SOPORTE);
      assert.equal(pipeline.columna, "EN_CURSO");
    });

    test("el equipo clasifica la complejidad de los tickets; el cliente no", async () => {
      await reiniciar();
      assert.equal((await llamar("PATCH", `/tickets/${T1039}`, VALERIA, { complejidad: "COMPLEJO" })).status, 403);
      assert.equal((await llamar("PATCH", `/tickets/${T1039}`, DIEGO, { complejidad: "DIFICIL" })).status, 422);
      const t = await llamar("PATCH", `/tickets/${T1039}`, DIEGO, { complejidad: "COMPLEJO" });
      assert.deepEqual([t.status, t.json.complejidad, t.json.estado], [200, "COMPLEJO", "RESUELTO"], "cambiar la complejidad no toca el estado");
      assert.deepEqual(usado((await llamar("GET", RUTA, VALERIA)).json).TICKETS_COMPLEJOS, [2, 2, "ALERTA"]);
    });

    test("bolsa propia del contrato: se valida y puede excederse", async () => {
      await reiniciar();
      const malo = await llamar("PATCH", `/servicios-contratados/${SOPORTE}`, DIEGO, { detalle: { bolsa: { ticketsComplejos: -1 } } });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["detalle.bolsa.ticketsComplejos"]);
      await llamar("PATCH", `/servicios-contratados/${SOPORTE}`, DIEGO, { detalle: { bolsa: { ticketsComplejos: 1, horasMeet: 4 } } });
      const c = (await llamar("GET", RUTA, VALERIA)).json;
      assert.deepEqual([c.bolsa.ticketsComplejos, c.bolsa.ticketsBasicos, c.bolsa.horasMeet], [1, 8, 4], "lo que no se define sale del plan");
      await llamar("PATCH", `/tickets/${T1039}`, DIEGO, { complejidad: "COMPLEJO" });
      assert.deepEqual(usado((await llamar("GET", RUTA, VALERIA)).json).TICKETS_COMPLEJOS, [2, 1, "EXCEDIDO"]);
    });

    test("las reuniones realizadas suman horas de Meet según su duración", async () => {
      await reiniciar();
      const ruta = `/servicios-contratados/${SOPORTE}/reuniones`;
      assert.deepEqual((await llamar("POST", ruta, DIEGO, { titulo: "Revisión rápida", fecha: "2026-10-12T15:00:00Z", duracionMin: 5 })).json.errores.map((e: any) => e.campo), ["duracionMin"]);
      const r = await llamar("POST", ruta, DIEGO, { titulo: "Revisión del formulario", fecha: "2026-10-12T15:00:00Z", duracionMin: 45, estado: "REALIZADA", resumen: "Probamos el formulario y ya llegan los correos." });
      assert.deepEqual([r.status, r.json.duracionMin], [201, 45]);
      assert.deepEqual(usado((await llamar("GET", RUTA, VALERIA)).json).HORAS_MEET, [2.3, 2, "EXCEDIDO"]);
      // Un ticket nuevo del cliente cuenta como básico hasta que el equipo lo clasifique.
      await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Cambiar el banner de inicio", descripcion: "Queremos el banner de la campaña de noviembre.", servicioContratadoId: SOPORTE, categoria: "WEB" });
      const hoy = (await llamar("GET", `/servicios-contratados/${SOPORTE}/consumo`, VALERIA)).json;
      assert.ok(hoy.recursos.find((x: any) => x.clave === "TICKETS_BASICOS").usado >= 1);
    });
  });
}
