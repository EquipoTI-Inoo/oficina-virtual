/**
 * Catálogo real de servicios, plantillas y etapas de proyecto (reunión del 12 oct 2026), escrito una
 * vez y ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, NATIVA, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const CRM = uid(4, 3);

export function pruebasServicios(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: () => Promise<{ tipo: string; datos: any }[]>) {
  const llamar = crearLlamar(manejar);

  describe(`servicios y etapas · ${nombre}`, () => {
    test("el catálogo son los 8 servicios que vende Inoo, con sus variantes", async () => {
      await reiniciar();
      const r = (await llamar("GET", "/servicios", VALERIA)).json.datos;
      assert.deepEqual(r.map((s: any) => s.codigo), ["SOCIAL_MEDIA_PRO", "BRANDFORMANCE", "PAID_MEDIA", "WEB", "CRM_IMPLEMENTACION", "CRM_INTEGRACION", "AUDIOVISUAL", "SOPORTE_CONTINUO"]);
      assert.deepEqual(r.find((s: any) => s.codigo === "WEB").variantes.map((v: any) => v.codigo), ["LANDING", "INFORMATIVA", "ECOMMERCE", "CATALOGO", "APLICATIVO"]);
      assert.equal(r.find((s: any) => s.codigo === "SOPORTE_CONTINUO").modalidad, "MENSUAL");
    });

    test("Mis servicios: solo lo contratado, con título «Servicio - Marca» y avance por etapas", async () => {
      await reiniciar();
      const r = (await llamar("GET", `/clientes/${CASA_OLIVA}/servicios?periodo=2026-10`, VALERIA)).json;
      assert.deepEqual(r.servicios.map((s: any) => s.codigo), ["SOCIAL_MEDIA_PRO", "WEB", "CRM_IMPLEMENTACION", "SOPORTE_CONTINUO"]);
      const crm = r.servicios.find((s: any) => s.codigo === "CRM_IMPLEMENTACION");
      assert.equal(crm.titulo, "Implementación de CRM - Casa Oliva");
      assert.deepEqual([crm.detalle.crm, crm.detalle.licencias], ["HubSpot", 3]);
      assert.deepEqual([crm.avance.porcentaje, crm.avance.etapaActual.nombre, crm.avance.totalEtapas], [20, "Procesos e implementación", 4]);
      assert.equal(crm.progreso, null, "un proyecto de CRM no entrega piezas mensuales");
      const web = r.servicios.find((s: any) => s.codigo === "WEB");
      assert.deepEqual([web.variante.nombre, web.avance.porcentaje], ["E-commerce", 10]);
      const smp = r.servicios.find((s: any) => s.codigo === "SOCIAL_MEDIA_PRO");
      assert.deepEqual([smp.cantidadMensual, smp.avance.porcentaje, smp.avance.periodo], [16, 50, "2026-10"]);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/servicios`, VALERIA)).status, 404);
    });

    test("avance de un proyecto: etapas de la plantilla con sus fechas en días hábiles", async () => {
      await reiniciar();
      const a = (await llamar("GET", `/servicios-contratados/${CRM}/avance`, VALERIA)).json;
      assert.deepEqual(a.etapas.map((e: any) => [e.nombre, e.avancePct, e.estado]), [
        ["Levantamiento de información", 20, "COMPLETADO"],
        ["Procesos e implementación", 60, "EN_PROGRESO"],
        ["Capacitación 1", 80, "SIN_INICIAR"],
        ["Capacitación 2", 100, "SIN_INICIAR"],
      ]);
      assert.deepEqual([a.etapas[0].fechaInicio, a.etapas[0].fechaEstimada, a.etapas[1].fechaInicio], ["2026-09-01", "2026-09-14", "2026-09-15"]);
      assert.equal(a.estado, "EN_CURSO");
    });

    test("plantillas: solo el equipo las ve", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/plantillas", VALERIA)).status, 403);
      const crm = (await llamar("GET", "/plantillas?servicio=CRM_IMPLEMENTACION", DIEGO)).json.datos;
      assert.equal(crm.length, 1);
      assert.deepEqual(crm[0].etapas.map((e: any) => e.avancePct), [20, 60, 80, 100]);
      const web = (await llamar("GET", "/plantillas?servicio=WEB", DIEGO)).json.datos;
      assert.deepEqual(web.map((p: any) => p.variante).sort(), ["APLICATIVO", "CATALOGO", "ECOMMERCE", "INFORMATIVA", "LANDING"]);
    });

    test("el equipo mueve etapas en orden y el % del cliente cambia", async () => {
      await reiniciar();
      const etapas = (await llamar("GET", `/servicios-contratados/${CRM}/avance`, DIEGO)).json.etapas;
      const ruta = (n: number) => `/servicios-contratados/${CRM}/etapas/${etapas[n].id}`;
      assert.equal((await llamar("PATCH", ruta(1), VALERIA, { estado: "COMPLETADO" })).status, 403, "el cliente solo mira");
      assert.equal((await llamar("PATCH", ruta(2), DIEGO, { estado: "COMPLETADO" })).json.codigo, "ETAPA_ANTERIOR_PENDIENTE");
      assert.equal((await llamar("PATCH", ruta(1), DIEGO, { estado: "NADA" })).status, 422);
      const r = await llamar("PATCH", ruta(1), DIEGO, { estado: "COMPLETADO", fechaFin: "2026-10-09" });
      assert.equal(r.status, 200);
      assert.deepEqual([r.json.avance.porcentaje, r.json.avance.etapaActual.nombre], [60, "Capacitación 1"]);
      assert.equal(r.json.etapas[1].fechaFin, "2026-10-09");
      const visto = (await llamar("GET", `/clientes/${CASA_OLIVA}/servicios?periodo=2026-10`, VALERIA)).json.servicios.find((s: any) => s.servicioContratadoId === CRM);
      assert.equal(visto.avance.porcentaje, 60);
      assert.ok((await eventos()).some((e) => e.tipo === "etapa.actualizada" && e.datos.etapaId === etapas[1].id));
      // Reabrir la etapa la saca del %.
      assert.equal((await llamar("PATCH", ruta(1), DIEGO, { estado: "EN_PROGRESO" })).json.avance.porcentaje, 20);
    });

    test("perfil del proyecto: métricas de la plantilla, reuniones y entregables del servicio", async () => {
      await reiniciar();
      const crm = (await llamar("GET", `/servicios-contratados/${CRM}?periodo=2026-10`, VALERIA)).json;
      assert.equal(crm.titulo, "Implementación de CRM - Casa Oliva");
      assert.deepEqual(crm.metricas.map((m: any) => [m.clave, m.valor]), [
        ["REUNIONES_REALIZADAS", "3"],
        ["REUNIONES_EXITOSAS", "2 de 3"],
        ["DOCUMENTOS_A_TIEMPO", "1 de 1"],
      ]);
      assert.deepEqual(crm.reuniones.map((r: any) => r.estado), ["PROGRAMADA", "REALIZADA", "REALIZADA", "REALIZADA"], "próximas primero");
      assert.equal(crm.etapas.length, 4);
      assert.deepEqual(crm.porRevisar, []);
      const smp = (await llamar("GET", `/servicios-contratados/${uid(4, 2)}?periodo=2026-10`, VALERIA)).json;
      assert.equal(smp.metricas[0].clave, "PIEZAS_APROBADAS");
      assert.deepEqual(smp.porRevisar.map((x: any) => x.titulo), ["Tu ritual, tu momento", "Un minuto para cuidarte", "Cuidado que se siente"]);
      assert.equal((await llamar("GET", `/servicios-contratados/${uid(4, 999)}`, VALERIA)).status, 404);
    });

    test("comentarios del proyecto: el cliente consulta y nunca ve las notas internas", async () => {
      await reiniciar();
      const ruta = `/servicios-contratados/${CRM}/comentarios`;
      const cliente = (await llamar("GET", ruta, VALERIA)).json.datos;
      assert.deepEqual(cliente.map((c: any) => c.deEquipo), [false, true]);
      assert.ok(cliente.every((c: any) => c.interno === undefined));
      assert.equal((await llamar("GET", ruta, DIEGO)).json.datos.length, 3, "el equipo sí ve su nota interna");
      assert.equal((await llamar("POST", ruta, MARTIN_LECTOR, { texto: "Hola" })).status, 403);
      assert.equal((await llamar("POST", ruta, VALERIA, { texto: " " })).status, 422);
      const ok = await llamar("POST", ruta, VALERIA, { texto: "¿Podemos mover la capacitación al jueves?", interno: true });
      assert.equal(ok.status, 201);
      assert.equal(ok.json.interno, undefined, "el cliente no puede escribir notas internas");
      assert.equal((await llamar("GET", ruta, VALERIA)).json.datos.length, 3);
      assert.ok((await eventos()).some((e) => e.tipo === "comentario_proyecto.creado" && e.datos.comentarioId === ok.json.id));
    });

    test("tickets del soporte continuo: se generan dentro del servicio y cuentan en sus métricas", async () => {
      await reiniciar();
      const SOPORTE = uid(4, 1);
      const lista = (await llamar("GET", `/clientes/${CASA_OLIVA}/tickets?servicioContratadoId=${SOPORTE}`, VALERIA)).json;
      assert.deepEqual(lista.datos.map((t: any) => [t.codigo, t.servicioTitulo]), [["#1040", "Soporte continuo - Casa Oliva"], ["#1039", "Soporte continuo - Casa Oliva"]]);
      const perfil = (await llamar("GET", `/servicios-contratados/${SOPORTE}?periodo=2026-10`, VALERIA)).json;
      assert.equal(perfil.metricas.find((m: any) => m.clave === "TICKETS_RESUELTOS").valor, "1", "solo los del servicio");
      const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Cambiar el banner de inicio", descripcion: "Para la campaña de noviembre.", servicioContratadoId: SOPORTE });
      assert.equal(ok.status, 201);
      assert.deepEqual([ok.json.categoria, ok.json.servicioContratadoId], ["WEB", SOPORTE], "la categoría sale de la variante del soporte");
      const crm = await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Duda", descripcion: "x", servicioContratadoId: CRM });
      assert.equal(crm.json.codigo, "SERVICIO_SIN_SOPORTE", "la implementación de CRM no recibe tickets");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/tickets`, VALERIA, { asunto: "Duda", descripcion: "x", servicioContratadoId: uid(4, 999) })).status, 422);
      assert.ok((await eventos()).some((e) => e.tipo === "ticket.creado" && e.datos.servicioContratadoId === SOPORTE));
    });

    test("Mi cuenta → Pagos: solo quien administra la cuenta y el equipo", async () => {
      await reiniciar();
      const r = await llamar("GET", `/clientes/${CASA_OLIVA}/pagos`, VALERIA);
      assert.equal(r.status, 200);
      assert.deepEqual([r.json.pendientes[0].concepto, r.json.pendientes[0].estado, r.json.pendientes[0].monto], ["Implementación de CRM · cuota 2 de 3", "VENCIDO", 3200]);
      assert.deepEqual(r.json.pagados.map((x: any) => [x.concepto, x.pagadoEn]), [["Mensualidad de septiembre", "2026-09-14"]]);
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/pagos`, MARTIN_LECTOR)).status, 403);
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/pagos`, DIEGO)).status, 200);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/pagos`, VALERIA)).status, 404);
    });

    test("contratar: variante obligatoria donde aplica y etapas desde la plantilla", async () => {
      await reiniciar();
      const sinVariante = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "AUDIOVISUAL", fechaInicio: "2026-10-12" });
      assert.deepEqual(sinVariante.json.errores.map((e: any) => e.campo), ["variante"]);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "BLOG", fechaInicio: "2026-10-12" })).status, 422, "blog ya no es un servicio");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, DIEGO, { servicioCodigo: "AUDIOVISUAL", variante: "FOTOGRAFIA", fechaInicio: "2026-10-12" })).status, 403);
      const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "AUDIOVISUAL", variante: "FOTOGRAFIA", marca: "Línea Bebé", fechaInicio: "2026-10-16" });
      assert.equal(ok.status, 201);
      assert.equal(ok.json.titulo, "Producción audiovisual - Línea Bebé");
      assert.deepEqual([ok.json.avance.porcentaje, ok.json.avance.totalEtapas], [0, 3]);
      const a = (await llamar("GET", `/servicios-contratados/${ok.json.servicioContratadoId}/avance`, VALERIA)).json;
      // 3 días hábiles desde el viernes 16: 16, 19 y 20 de octubre; la sesión, el 21.
      assert.deepEqual(a.etapas.map((e: any) => [e.fechaInicio, e.fechaEstimada]), [["2026-10-16", "2026-10-20"], ["2026-10-21", "2026-10-21"], ["2026-10-22", "2026-10-28"]]);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "AUDIOVISUAL", variante: "FOTOGRAFIA", fechaInicio: "2026-10-16" })).json.codigo, "SERVICIO_YA_CONTRATADO");
      assert.ok((await eventos()).some((e) => e.tipo === "servicio.contratado" && e.datos.variante === "FOTOGRAFIA"));
    });
  });
}
