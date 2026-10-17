/**
 * KPIs y reportes (reunión del 15 oct 2026): KPIs internos del proyecto, causa y justificación de los
 * atrasos, reporte en Excel, panel del colaborador y panel general por proyectos. Corre contra la API
 * simulada y Postgres.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const WEB = uid(4, 4);
const CRM = uid(4, 3);
const N8N = { "x-api-key": "demo-n8n" };

export function pruebasKpis(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`KPIs y reportes · ${nombre}`, () => {
    test("KPIs internos según el servicio; el cliente no los ve", async () => {
      await reiniciar();
      const web = (await llamar("GET", `/servicios-contratados/${WEB}/kpis`, DIEGO)).json.datos;
      assert.deepEqual(web.map((k: any) => k.clave), ["CUMPLIMIENTO_FECHAS", "AVANCE_VS_PLAN", "REBOTES", "REUNIONES_VS_OPTIMAS"]);
      const plan = web.find((k: any) => k.clave === "AVANCE_VS_PLAN");
      assert.ok(plan.numero < 0 && plan.nivel !== "OK", "la web va detrás del cronograma");
      const crm = (await llamar("GET", `/servicios-contratados/${CRM}/kpis`, DIEGO)).json.datos;
      assert.ok(crm.some((k: any) => k.clave === "TIEMPO_IMPLEMENTACION"), "CRM mide el tiempo de implementación");
      assert.equal(crm.find((k: any) => k.clave === "REBOTES").numero, 1, "el mapa de procesos tuvo un pedido de cambios");
      assert.equal((await llamar("GET", `/servicios-contratados/${WEB}/kpis`, VALERIA)).status, 403);
    });

    test("branding: las rondas de propuesta alertan desde la 2.ª", async () => {
      await reiniciar();
      const sc = (await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "BRANDFORMANCE", variante: "MARCA_NUEVA", fechaInicio: "2026-10-05" })).json.servicioContratadoId;
      const propuestas = (await llamar("GET", `/servicios-contratados/${sc}/avance`, DIEGO)).json.etapas.find((e: any) => e.nombre === "Propuestas");
      const e = (await llamar("POST", `/servicios-contratados/${sc}/entregables`, DIEGO, { titulo: "Propuestas de logo", formato: "PDF", url: "https://drive.google.com/file/d/a/view", etapaId: propuestas.id })).json;
      await llamar("POST", `/entregables/${e.id}/enviar`, DIEGO, {});
      const ronda = async () => (await llamar("GET", `/servicios-contratados/${sc}/kpis`, DIEGO)).json.datos.find((k: any) => k.clave === "RONDAS_PROPUESTA");
      assert.deepEqual([(await ronda()).numero, (await ronda()).nivel], [1, "OK"]);
      await llamar("POST", `/entregables/${e.id}/decision`, VALERIA, { decision: "CAMBIOS_SOLICITADOS", comentario: "Probemos otra tipografía" });
      await llamar("POST", `/entregables/${e.id}/versiones`, DIEGO, { url: "https://drive.google.com/file/d/b/view" });
      await llamar("POST", `/entregables/${e.id}/enviar`, DIEGO, {});
      assert.deepEqual([(await ronda()).numero, (await ronda()).nivel], [2, "ALERTA"]);
    });

    test("atrasos: causa y justificación solo para el equipo; correr el cronograma marca al cliente", async () => {
      await reiniciar();
      const etapa = (await llamar("GET", `/servicios-contratados/${WEB}/avance`, DIEGO)).json.etapas[1];
      const ruta = `/servicios-contratados/${WEB}/etapas/${etapa.id}`;
      assert.deepEqual((await llamar("PATCH", ruta, DIEGO, { causaAtraso: "OTRO" })).json.errores.map((e: any) => e.campo), ["causaAtraso"]);
      const ok = await llamar("PATCH", ruta, DIEGO, { causaAtraso: "INOO", justificacionAtraso: "El benchmark tomó más de lo previsto" });
      assert.deepEqual([ok.json.etapas[1].causaAtraso, ok.json.etapas[1].justificacionAtraso], ["INOO", "El benchmark tomó más de lo previsto"]);
      const cliente = (await llamar("GET", `/servicios-contratados/${WEB}/avance`, VALERIA)).json.etapas[1];
      assert.deepEqual([cliente.causaAtraso, cliente.justificacionAtraso, cliente.diasCorridosCliente], [undefined, undefined, undefined], "es información interna");
      // El requerimiento atrasado del CRM corre su cronograma: la causa queda en CLIENTE.
      await llamar("POST", "/integraciones/requerimientos/atrasos", undefined, {}, N8N);
      const crm = (await llamar("GET", `/servicios-contratados/${CRM}/avance`, DIEGO)).json.etapas;
      assert.deepEqual([crm[1].causaAtraso, crm[1].diasCorridosCliente > 0], ["CLIENTE", true]);
      assert.equal(crm[0].causaAtraso, null, "la etapa completa no se corrió");
    });

    test("reporte en Excel del proyecto: solo el equipo", async () => {
      await reiniciar();
      const pedir = (token: string) => manejar(new Request(`http://local/api/v1/servicios-contratados/${WEB}/reporte`, { headers: { authorization: `Bearer ${token}` } }));
      assert.equal((await pedir(VALERIA)).status, 403);
      const r = await pedir(DIEGO);
      assert.equal(r.status, 200);
      assert.match(r.headers.get("content-type") ?? "", /spreadsheetml/);
      assert.match(r.headers.get("content-disposition") ?? "", /reporte-diseno-y-desarrollo-web-casa-oliva\.xlsx/);
      const bytes = new Uint8Array(await r.arrayBuffer());
      assert.deepEqual([bytes[0], bytes[1]], [0x50, 0x4b], "es un zip");
      const texto = new TextDecoder().decode(bytes);
      for (const x of ["xl/worksheets/sheet4.xml", "Arquitectura y benchmark", "Flujograma y benchmark de referencias", "Cumplimiento de fechas"]) assert.ok(texto.includes(x), x);
    });

    test("panel del colaborador: sus tareas, sus proyectos con KPIs y su resumen", async () => {
      await reiniciar();
      const p = (await llamar("GET", "/panel/colaborador", DIEGO)).json;
      assert.equal(p.persona.nombre, "Diego Castro");
      assert.deepEqual(p.proyectos.map((x: any) => x.servicioContratadoId).sort(), [CRM, WEB].sort(), "es responsable de la web y del CRM");
      assert.ok(p.proyectos.every((x: any) => x.kpis.length >= 3));
      assert.ok(p.tareas.every((t: any) => t.responsable.nombre === "Diego Castro" && t.estado !== "HECHA"));
      assert.deepEqual([p.resumen.proyectosActivos, p.resumen.tareasAbiertas, p.resumen.rebotes], [2, p.tareas.length, 1]);
      const admin = (await llamar("GET", `/panel/colaborador?usuarioId=${uid(1, 4)}`, DIEGO)).json;
      assert.deepEqual([admin.persona.nombre, admin.proyectos.length], ["Admin Inoo", 0]);
      assert.equal((await llamar("GET", `/panel/colaborador?usuarioId=${uid(1, 1)}`, DIEGO)).status, 404, "una clienta no tiene panel de colaborador");
      assert.equal((await llamar("GET", "/panel/colaborador", VALERIA)).status, 403);
    });

    test("pipeline: el responsable del proyecto aparece en su tarjeta", async () => {
      await reiniciar();
      await llamar("PATCH", `/servicios-contratados/${WEB}`, DIEGO, { responsableId: uid(1, 4) });
      const web = (await llamar("GET", "/panel/proyectos", DIEGO)).json.datos.find((x: any) => x.servicioContratadoId === WEB);
      assert.equal(web.responsable.nombre, "Admin Inoo");
    });
  });
}
