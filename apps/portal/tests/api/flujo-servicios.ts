/**
 * Catálogo real de servicios, plantillas y etapas de proyecto (reunión del 12 oct 2026), escrito una
 * vez y ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diasAtrasoPago } from "../../src/dominio/pagos";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, NATIVA, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const FINANZAS = `demo.${uid(1, 5)}`;
const CRM = uid(4, 3);

export function pruebasServicios(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: () => Promise<{ tipo: string; datos: any }[]>, hoy: string) {
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

    test("cambio de responsable: el cliente propone a su sucesor y el equipo lo aprueba", async () => {
      await reiniciar();
      const ruta = `/clientes/${CASA_OLIVA}/cambio-responsable`;
      const sucesor = { nombre: "Gabriel Villegas", email: "gabriel@casaoliva.pe", telefono: "+51 987 654 321", cargo: "Jefe de marketing" };
      assert.equal((await llamar("POST", ruta, MARTIN_LECTOR, sucesor)).status, 403, "solo quien administra la cuenta");
      assert.equal((await llamar("POST", ruta, DIEGO, sucesor)).status, 403, "lo pide el cliente, no el equipo");
      assert.deepEqual((await llamar("POST", ruta, VALERIA, { nombre: "G", email: "x", telefono: "1" })).json.errores.map((e: any) => e.campo), ["nombre", "email", "telefono"]);
      const s = await llamar("POST", ruta, VALERIA, sucesor);
      assert.deepEqual([s.status, s.json.estado, s.json.quitarAccesoAnterior], [201, "PENDIENTE", true]);
      assert.equal((await llamar("POST", ruta, VALERIA, sucesor)).json.codigo, "SOLICITUD_PENDIENTE");
      assert.ok((await eventos()).some((e) => e.tipo === "responsable.cambio_solicitado"));
      // Hasta que el equipo apruebe no hay acceso nuevo.
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/miembros`, DIEGO)).json.datos.length, 2);
      const decision = `/solicitudes-responsable/${s.json.id}/decision`;
      assert.equal((await llamar("POST", decision, VALERIA, { decision: "APROBADA" })).status, 403);
      assert.equal((await llamar("POST", decision, DIEGO, { decision: "RECHAZADA" })).json.codigo, "COMENTARIO_REQUERIDO");
      const ok = await llamar("POST", decision, DIEGO, { decision: "APROBADA" });
      assert.equal(ok.json.estado, "APROBADA");
      const miembros = (await llamar("GET", `/clientes/${CASA_OLIVA}/miembros`, DIEGO)).json.datos;
      assert.deepEqual(miembros.map((m: any) => [m.email, m.rol]).sort(), [["gabriel@casaoliva.pe", "ADMIN_CLIENTE"], ["martin@casaoliva.pe", "LECTOR"]], "entra el sucesor y sale quien lo pidió");
      assert.equal((await llamar("GET", ruta, DIEGO)).json.responsable.nombre, "Gabriel Villegas");
      assert.equal((await llamar("POST", decision, DIEGO, { decision: "APROBADA" })).json.codigo, "SOLICITUD_DECIDIDA");
      assert.ok((await eventos()).some((e) => e.tipo === "responsable.cambiado"));
    });

    test("avisos: el equipo publica feriados y días no laborables, y dejan de contar como hábiles", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/avisos", VALERIA)).status, 403);
      const lista = (await llamar("GET", "/avisos", DIEGO)).json.datos;
      assert.ok(lista.some((a: any) => a.tipo === "FERIADO" && a.fechaInicio === "2026-12-25"));
      assert.equal((await llamar("POST", "/avisos", DIEGO, { tipo: "FERIADO", titulo: "x", clienteId: CASA_OLIVA })).status, 422);
      const cierre = await llamar("POST", "/avisos", DIEGO, { tipo: "NO_LABORABLE", titulo: "Cierre por aniversario de Inoo", fechaInicio: "2026-10-19", fechaFin: "2026-10-20" });
      assert.deepEqual([cierre.status, cierre.json.visibleDesde], [201, "2026-10-12"]);
      // Un proyecto que empieza ese día salta el cierre: 3 días hábiles desde el lunes 19 → 21, 22, 23.
      const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "AUDIOVISUAL", variante: "FOTOGRAFIA", fechaInicio: "2026-10-19" });
      const etapas = (await llamar("GET", `/servicios-contratados/${ok.json.servicioContratadoId}/avance`, DIEGO)).json.etapas;
      assert.deepEqual([etapas[0].fechaInicio, etapas[0].fechaEstimada], ["2026-10-21", "2026-10-23"]);
      const general = await llamar("POST", "/avisos", DIEGO, { tipo: "GENERAL", titulo: "Mantenimiento del portal", clienteId: CASA_OLIVA, fechaInicio: "2026-10-30" });
      assert.equal(general.status, 201);
      assert.equal((await llamar("DELETE", `/avisos/${general.json.id}`, VALERIA)).status, 403);
      assert.equal((await llamar("DELETE", `/avisos/${general.json.id}`, DIEGO)).status, 204);
    });

    test("el equipo gestiona el proyecto: siguiente paso, estado y reuniones que alimentan las métricas", async () => {
      await reiniciar();
      assert.equal((await llamar("PATCH", `/servicios-contratados/${CRM}`, VALERIA, { siguientePaso: "x" })).status, 403);
      assert.equal((await llamar("PATCH", `/servicios-contratados/${CRM}`, DIEGO, { estado: "CERRADO" })).status, 422);
      const p = await llamar("PATCH", `/servicios-contratados/${CRM}`, DIEGO, { siguientePaso: "confirmar la fecha de la capacitación 1.", detalle: { crm: "HubSpot", licencias: 4, usuarios: 6 } });
      assert.deepEqual([p.json.siguientePaso.texto, p.json.detalle.licencias], ["Siguiente paso: confirmar la fecha de la capacitación 1.", 4]);
      const ruta = `/servicios-contratados/${CRM}/reuniones`;
      assert.equal((await llamar("POST", ruta, VALERIA, { titulo: "Revisión", fecha: "2026-10-09T15:00:00Z" })).status, 403);
      assert.deepEqual((await llamar("POST", ruta, DIEGO, { titulo: "x", conAcuerdos: true })).json.errores.map((e: any) => e.campo).sort(), ["conAcuerdos", "fecha", "titulo"]);
      const nueva = await llamar("POST", ruta, DIEGO, { titulo: "Revisión del pipeline", fecha: "2026-10-09T15:00:00Z" });
      assert.deepEqual([nueva.status, nueva.json.estado, nueva.json.conAcuerdos], [201, "PROGRAMADA", null]);
      const hecha = await llamar("PATCH", `/reuniones/${nueva.json.id}`, DIEGO, { estado: "REALIZADA", conAcuerdos: true, resumen: "Se aprobó el pipeline de 6 etapas." });
      assert.deepEqual([hecha.json.estado, hecha.json.conAcuerdos], ["REALIZADA", true]);
      const m = (await llamar("GET", `/servicios-contratados/${CRM}?periodo=2026-10`, VALERIA)).json.metricas;
      assert.deepEqual(m.slice(0, 2).map((x: any) => x.valor), ["4", "3 de 4"], "la nueva reunión cuenta para el cliente");
      assert.equal((await llamar("GET", ruta, VALERIA)).json.datos.length, 5);
      assert.equal((await llamar("PATCH", `/reuniones/${nueva.json.id}`, DIEGO, { estado: "CANCELADA", conAcuerdos: true })).status, 422);
    });

    test("estado de pago: cada rol ve lo suyo y solo Administración y Finanzas lo cambian", async () => {
      await reiniciar();
      const ruta = `/clientes/${CASA_OLIVA}/estado-pago`;
      // Casa Oliva está atrasada desde el 28 de setiembre (datos de relleno).
      const dias = diasAtrasoPago("2026-09-28", hoy);
      const finanzas = (await llamar("GET", ruta, FINANZAS)).json;
      assert.deepEqual([finanzas.situacion, finanzas.diasAtraso, finanzas.atrasadoDesde, finanzas.alertaOperaciones], ["ATRASADO", dias, "2026-09-28", dias >= 7]);
      assert.match(finanzas.nota, /Cuota 2 de 3/);
      assert.equal(finanzas.actualizadoPor.nombre, "Rosa Paredes");
      const operaciones = (await llamar("GET", ruta, DIEGO)).json;
      assert.deepEqual([operaciones.situacion, operaciones.alertaOperaciones], ["ATRASADO", dias >= 7]);
      assert.equal(operaciones.nota, undefined, "el equipo operativo no ve la nota de Finanzas");
      assert.deepEqual((await llamar("GET", ruta, VALERIA)).json, { situacion: "ATRASADO", diasAtraso: dias }, "el cliente solo ve situación y días");
      assert.equal((await llamar("GET", ruta, MARTIN_LECTOR)).status, 403);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/estado-pago`, VALERIA)).status, 404);
      // Solo ADMIN y FINANZAS lo cambian.
      assert.equal((await llamar("PUT", ruta, DIEGO, { situacion: "AL_DIA" })).status, 403, "el AM no toca pagos");
      assert.equal((await llamar("PUT", ruta, VALERIA, { situacion: "AL_DIA" })).status, 403);
      const malo = await llamar("PUT", ruta, FINANZAS, { situacion: "ATRASADO", atrasadoDesde: "2099-01-01" });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["atrasadoDesde"], "no puede ser futura");
      assert.equal((await llamar("PUT", ruta, FINANZAS, { situacion: "ATRASADO" })).status, 422, "atrasado exige la fecha");
      const aldia = await llamar("PUT", ruta, FINANZAS, { situacion: "AL_DIA", nota: "Pagó por transferencia" });
      assert.deepEqual([aldia.status, aldia.json.situacion, aldia.json.diasAtraso, aldia.json.atrasadoDesde, aldia.json.alertaOperaciones], [200, "AL_DIA", 0, null, false]);
      assert.ok((await eventos()).some((e) => e.tipo === "pago.situacion_cambiada" && e.datos.situacion === "AL_DIA"));
      const admin = await llamar("PUT", ruta, ADMIN, { situacion: "ATRASADO", atrasadoDesde: hoy });
      assert.deepEqual([admin.json.situacion, admin.json.diasAtraso, admin.json.alertaOperaciones], ["ATRASADO", 0, false], "recién atrasado: sin alerta todavía");
    });

    test("contratar: variante obligatoria donde aplica y etapas desde la plantilla", async () => {
      await reiniciar();
      const sinVariante = await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "AUDIOVISUAL", fechaInicio: "2026-10-12" });
      assert.deepEqual(sinVariante.json.errores.map((e: any) => e.campo), ["variante"]);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, { servicioCodigo: "BLOG", fechaInicio: "2026-10-12" })).status, 422, "blog ya no es un servicio");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, VALERIA, { servicioCodigo: "AUDIOVISUAL", variante: "FOTOGRAFIA", fechaInicio: "2026-10-12" })).status, 403, "el cliente no contrata solo");
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
