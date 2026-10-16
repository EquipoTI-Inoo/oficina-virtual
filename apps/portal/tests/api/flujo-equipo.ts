/**
 * Pedido del 16 oct 2026, escrito una vez y ejecutado contra la API simulada y el backend real:
 * el equipo operativo no ve el blog ni cambia el estado de pago, standby por inactividad del cliente y
 * responsable por servicio contratado.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const CAMILA_ID = uid(1, 6);
/** Desarrollo web: equipo operativo. */
const CAMILA = `demo.${CAMILA_ID}`;
const DIEGO_ID = uid(1, 3);
const WEB = uid(4, 4);
const CRM = uid(4, 3);
const LLAVE = { "x-api-key": "demo-n8n" };

/** AAAA-MM-DD `n` días después de la fecha (ISO) dada. */
const mas = (iso: string, n: number) => new Date(Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function pruebasEquipo(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: () => Promise<{ tipo: string; datos: any }[]>) {
  const llamar = crearLlamar(manejar);
  const ficha = async () => (await llamar("GET", `/clientes/${CASA_OLIVA}`, DIEGO)).json;
  const inactividad = (fecha?: string, token?: string) =>
    llamar("POST", "/integraciones/servicios/inactividad", token, fecha ? { fecha } : {}, token ? {} : LLAVE);
  const estados = async () => (await llamar("GET", `/clientes/${CASA_OLIVA}/servicios`, DIEGO)).json.servicios.map((s: any) => s.estado);

  describe(`equipo operativo, standby y responsables · ${nombre}`, () => {
    test("el blog interno es solo de gestión: el equipo operativo recibe 403", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/ideas-blog?periodo=2026-10`, CAMILA)).status, 403);
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/ideas-blog?periodo=2026-10`, DIEGO)).status, 200);
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/ideas-blog?periodo=2026-10`, VALERIA)).status, 200);
    });

    test("pagos: el equipo operativo no cambia el estado de pago", async () => {
      await reiniciar();
      const ruta = `/clientes/${CASA_OLIVA}/estado-pago`;
      assert.equal((await llamar("PUT", ruta, CAMILA, { situacion: "AL_DIA" })).status, 403);
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, CAMILA)).json.avisoPago, null, "sin detalle de pago en Inicio");
    });

    test("standby: aviso una vez a los 23 días, standby a los 30 y se reactiva cuando el cliente vuelve", async () => {
      await reiniciar();
      const antes = (await ficha()).inactividad;
      assert.deepEqual([antes.estado, antes.diasSinActividad, antes.serviciosEnStandby], ["ACTIVO", 0, 0]);
      const base = antes.ultimaActividad;
      assert.equal(antes.fechaStandby, mas(base, 30));

      assert.equal((await inactividad(undefined, DIEGO)).status, 403, "solo la llave de n8n");
      assert.equal((await inactividad("16/11/2026")).status, 422);
      assert.deepEqual((await inactividad(mas(base, 10))).json, { revisados: 1, avisados: 0, enStandby: 0 });

      assert.deepEqual((await inactividad(mas(base, 25))).json, { revisados: 1, avisados: 1, enStandby: 0 });
      const aviso = (await eventos()).find((e) => e.tipo === "servicio.standby_proximo");
      assert.deepEqual([aviso!.datos.fechaStandby, aviso!.datos.diasSinActividad, aviso!.datos.servicioIds.length], [mas(base, 30), 25, 4]);
      assert.equal((await ficha()).inactividad.estado, "POR_ENTRAR");
      assert.deepEqual((await inactividad(mas(base, 26))).json.avisados, 0, "se avisa una sola vez");

      assert.deepEqual((await inactividad(mas(base, 31))).json, { revisados: 1, avisados: 0, enStandby: 1 });
      assert.deepEqual(await estados(), ["STANDBY", "STANDBY", "STANDBY", "STANDBY"]);
      const f = await ficha();
      assert.deepEqual([f.inactividad.estado, f.inactividad.serviciosEnStandby, f.conteos.serviciosActivos], ["STANDBY", 4, 0]);
      assert.ok((await eventos()).some((e) => e.tipo === "servicio.standby" && e.datos.servicioIds.length === 4));
      assert.equal((await inactividad(mas(base, 32))).json.revisados, 0, "ya no quedan servicios activos");

      // El equipo navegando no cuenta como actividad del cliente; el cliente sí.
      await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, DIEGO);
      assert.deepEqual(await estados(), ["STANDBY", "STANDBY", "STANDBY", "STANDBY"]);
      assert.equal((await llamar("GET", "/me", VALERIA)).status, 200);
      assert.deepEqual(await estados(), ["ACTIVO", "ACTIVO", "ACTIVO", "ACTIVO"]);
      assert.equal((await ficha()).inactividad.estado, "ACTIVO");
      assert.ok((await eventos()).some((e) => e.tipo === "servicio.reactivado" && e.datos.servicioIds.length === 4));
    });

    test("el equipo puede poner o sacar un servicio de standby a mano", async () => {
      await reiniciar();
      const r = await llamar("PATCH", `/servicios-contratados/${CRM}`, DIEGO, { estado: "STANDBY" });
      assert.deepEqual([r.status, r.json.estado], [200, "STANDBY"]);
      assert.equal((await llamar("PATCH", `/servicios-contratados/${CRM}`, DIEGO, { estado: "DORMIDO" })).status, 422);
    });

    test("responsable por servicio: cada servicio muestra quién lo lleva en Inoo", async () => {
      await reiniciar();
      const servicios = (await llamar("GET", `/clientes/${CASA_OLIVA}/servicios`, VALERIA)).json.servicios;
      const resp = Object.fromEntries(servicios.map((s: any) => [s.codigo, s.responsable?.nombre]));
      assert.deepEqual(resp, { SOCIAL_MEDIA_PRO: "Diego Castro", WEB: "Camila Paredes", CRM_IMPLEMENTACION: "Diego Castro", SOPORTE_CONTINUO: "Diego Castro" });
      assert.equal((await llamar("GET", `/servicios-contratados/${WEB}`, VALERIA)).json.responsable.email, "camila.paredes@inoo.pe");
      const inicio = (await llamar("GET", `/clientes/${CASA_OLIVA}/inicio`, VALERIA)).json.servicios.find((s: any) => s.codigo === "WEB");
      assert.equal(inicio.responsable.nombre, "Camila Paredes");
    });

    test("responsable: se elige al contratar (por defecto el AM) y solo gestión lo cambia", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/panel/equipo", VALERIA)).status, 403);
      const equipo = (await llamar("GET", "/panel/equipo", CAMILA)).json.datos.sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
      assert.deepEqual(equipo.map((u: any) => [u.nombre, u.rolEquipo]), [["Admin Inoo", "ADMIN"], ["Camila Paredes", "DESARROLLO_WEB"], ["Diego Castro", "ACCOUNT_MANAGER"], ["Rosa Paredes", "FINANZAS"]]);

      const sinElegir = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, DIEGO, { servicioCodigo: "AUDIOVISUAL", variante: "FOTOGRAFIA", fechaInicio: "2026-10-19" });
      assert.equal(sinElegir.json.responsable.id, DIEGO_ID);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, DIEGO, { servicioCodigo: "PAID_MEDIA", fechaInicio: "2026-10-19", responsableId: uid(1, 1) })).status, 422, "debe ser del equipo");
      const elegido = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, DIEGO, { servicioCodigo: "PAID_MEDIA", fechaInicio: "2026-10-19", responsableId: CAMILA_ID });
      assert.deepEqual([elegido.status, elegido.json.responsable.nombre], [201, "Camila Paredes"]);
      assert.ok((await eventos()).some((e) => e.tipo === "servicio.contratado" && e.datos.responsableId === CAMILA_ID));

      assert.equal((await llamar("PATCH", `/servicios-contratados/${CRM}`, CAMILA, { responsableId: CAMILA_ID })).status, 403, "el equipo operativo no reasigna");
      assert.equal((await llamar("PATCH", `/servicios-contratados/${CRM}`, CAMILA, { siguientePaso: "revisar el mapa" })).status, 200, "pero sí actualiza el proyecto");
      const r = await llamar("PATCH", `/servicios-contratados/${CRM}`, DIEGO, { responsableId: CAMILA_ID });
      assert.deepEqual([r.status, r.json.responsable.nombre], [200, "Camila Paredes"]);
      assert.equal((await llamar("PATCH", `/servicios-contratados/${CRM}`, DIEGO, { responsableId: uid(1, 2) })).status, 422);
    });
  });
}
