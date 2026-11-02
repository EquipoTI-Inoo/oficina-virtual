/**
 * Calendario del colaborador (2 nov 2026), escrito una vez y ejecutado contra la API simulada
 * (mock.flujo.test.ts) y el backend real (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const CAMILA = `demo.${uid(1, 6)}`;
const OCTUBRE = "/me/agenda?desde=2026-10-01&hasta=2026-10-31";

export function pruebasAgenda(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  const titulos = (eventos: any[], tipo: string) => eventos.filter((e) => e.tipo === tipo).map((e) => e.titulo).sort();

  describe(`Calendario del colaborador · ${nombre}`, () => {
    test("junta mis tareas, las reuniones y requerimientos de mis proyectos, los feriados y mis pendientes", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", OCTUBRE, VALERIA)).status, 403, "el cliente no tiene calendario del equipo");
      assert.equal((await llamar("GET", "/me/agenda?desde=2026-10-31&hasta=2026-10-01", DIEGO)).status, 422);
      assert.equal((await llamar("GET", "/me/agenda?desde=2026-10-01&hasta=2026-12-31", DIEGO)).status, 422, "más de 62 días");
      const r = await llamar("GET", OCTUBRE, DIEGO);
      assert.equal(r.status, 200);
      const ev = r.json.eventos;
      assert.deepEqual(ev.map((e: any) => e.fecha), [...ev.map((e: any) => e.fecha)].sort(), "ordenados por día");
      assert.deepEqual(titulos(ev, "TAREA"), ["Configurar el pipeline de ventas en el CRM", "Crear las licencias de los usuarios", "Diseñar el inicio y la ficha de producto", "Revisar las fotos de producto que subió el cliente"], "solo las abiertas");
      assert.deepEqual(titulos(ev, "REUNION"), ["Presentación del diseño", "Prioridades de la web en octubre", "Seguimiento mensual de la web", "Validación del mapa de procesos"], "las de sus proyectos, no la de Social Media de Camila");
      const validacion = ev.find((e: any) => e.titulo === "Validación del mapa de procesos");
      assert.deepEqual([validacion.fecha, validacion.horaInicio, validacion.horaFin, validacion.hecho], ["2026-10-08", "10:00", "11:00", false], "en hora de Lima");
      assert.ok(validacion.detalle.includes("Casa Oliva") && validacion.enlace.startsWith("/equipo/proyectos/"));
      const realizada = ev.find((e: any) => e.titulo === "Prioridades de la web en octubre");
      assert.deepEqual([realizada.horaFin, realizada.hecho], ["11:30", true]);
      assert.ok(ev.some((e: any) => e.tipo === "FERIADO" && e.fecha === "2026-10-08" && e.horaInicio === null));
      assert.ok(ev.filter((e: any) => e.tipo === "REQUERIMIENTO").every((e: any) => e.titulo.startsWith("El cliente entrega: ")));
      const vencida = ev.find((e: any) => e.titulo === "Revisar las fotos de producto que subió el cliente");
      assert.equal(vencida.vencido, true, "venció el 5 de octubre");
      assert.deepEqual(titulos(ev, "PENDIENTE"), ["Enviar propuesta a Nativa Café", "Llamar a Valeria por el mapa de procesos"]);
      const plan = ev.find((e: any) => e.tipo === "EVENTO");
      assert.deepEqual([plan.titulo, plan.editable, plan.invitados.map((p: any) => p.nombre)], ["Planificación interna de noviembre", true, ["Camila Paredes"]]);
      assert.deepEqual(r.json.google, { conectado: false, correo: null, conectadoEn: null, simulada: true });

      const camila = (await llamar("GET", OCTUBRE, CAMILA)).json.eventos;
      assert.deepEqual(titulos(camila, "PENDIENTE"), [], "no ve los pendientes de Diego");
      const invitada = camila.find((e: any) => e.titulo === "Planificación interna de noviembre");
      assert.deepEqual([invitada.editable, invitada.invitados.map((p: any) => p.nombre)], [false, ["Diego Castro"]], "la ve como invitada");
      assert.ok(camila.some((e: any) => e.tipo === "REUNION" && e.titulo === "Sesión de contenido de octubre"));
      assert.equal((await llamar("PATCH", `/me/agenda/eventos/${invitada.eventoId}`, CAMILA, { titulo: "Mía" })).status, 403);
      assert.equal((await llamar("DELETE", `/me/agenda/eventos/${invitada.eventoId}`, CAMILA)).status, 403);
      const pendienteDiego = ev.find((e: any) => e.tipo === "PENDIENTE").eventoId;
      assert.equal((await llamar("PATCH", `/me/agenda/eventos/${pendienteDiego}`, CAMILA, { hecho: true })).status, 404, "ni sabe que existe");
    });

    test("crea, edita y elimina pendientes y eventos; los invitados los ven", async () => {
      await reiniciar();
      const malo = await llamar("POST", "/me/agenda/eventos", DIEGO, { tipo: "TAREA", titulo: "x", fecha: "2026-13-01", horaInicio: "25:00" });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["tipo", "titulo", "fecha", "horaInicio"]);
      const alReves = await llamar("POST", "/me/agenda/eventos", DIEGO, { tipo: "EVENTO", titulo: "Llamada", fecha: "2026-10-12", horaInicio: "15:00", horaFin: "14:00" });
      assert.deepEqual(alReves.json.errores.map((e: any) => e.campo), ["horaFin"]);
      const hechoEvento = await llamar("POST", "/me/agenda/eventos", DIEGO, { tipo: "EVENTO", titulo: "Llamada", fecha: "2026-10-12", hecho: true });
      assert.deepEqual(hechoEvento.json.errores.map((e: any) => e.campo), ["hecho"]);
      const cliente = await llamar("POST", "/me/agenda/eventos", DIEGO, { tipo: "EVENTO", titulo: "Llamada", fecha: "2026-10-12", invitadosIds: [uid(1, 1)] });
      assert.deepEqual([cliente.status, cliente.json.errores.map((e: any) => e.campo)], [422, ["invitadosIds"]], "solo se invita al equipo");
      assert.equal((await llamar("POST", "/me/agenda/eventos", VALERIA, { tipo: "PENDIENTE", titulo: "Hola", fecha: "2026-10-12" })).status, 403);

      const evento = await llamar("POST", "/me/agenda/eventos", DIEGO, { tipo: "EVENTO", titulo: "  Revisión con Camila ", fecha: "2026-10-12", horaInicio: "15:00", invitadosIds: [uid(1, 6)] });
      assert.equal(evento.status, 201);
      assert.deepEqual([evento.json.titulo, evento.json.horaInicio, evento.json.horaFin, evento.json.editable, evento.json.tipo], ["Revisión con Camila", "15:00", "16:00", true, "EVENTO"], "dura una hora si no se dice");
      const deCamila = (await llamar("GET", OCTUBRE, CAMILA)).json.eventos.find((e: any) => e.eventoId === evento.json.eventoId);
      assert.deepEqual([deCamila.titulo, deCamila.editable], ["Revisión con Camila", false]);

      const movido = await llamar("PATCH", `/me/agenda/eventos/${evento.json.eventoId}`, DIEGO, { fecha: "2026-10-13", horaFin: "17:30", invitadosIds: [] });
      assert.deepEqual([movido.json.fecha, movido.json.horaInicio, movido.json.horaFin, movido.json.invitados], ["2026-10-13", "15:00", "17:30", []]);
      assert.equal((await llamar("GET", OCTUBRE, CAMILA)).json.eventos.some((e: any) => e.eventoId === evento.json.eventoId), false, "ya no está invitada");
      assert.equal((await llamar("PATCH", `/me/agenda/eventos/${evento.json.eventoId}`, DIEGO, { horaFin: "14:00" })).status, 422);
      const todoElDia = await llamar("PATCH", `/me/agenda/eventos/${evento.json.eventoId}`, DIEGO, { horaInicio: null });
      assert.deepEqual([todoElDia.json.horaInicio, todoElDia.json.horaFin], [null, null], "sin hora es de todo el día");

      const pendiente = await llamar("POST", "/me/agenda/eventos", DIEGO, { tipo: "PENDIENTE", titulo: "Mandar el acta", fecha: "2026-10-12", notas: "  " });
      assert.deepEqual([pendiente.status, pendiente.json.horaInicio, pendiente.json.horaFin, pendiente.json.hecho, pendiente.json.notas], [201, null, null, false, null]);
      assert.equal((await llamar("PATCH", `/me/agenda/eventos/${pendiente.json.eventoId}`, DIEGO, { tipo: "EVENTO" })).status, 422, "no cambia de tipo");
      assert.equal((await llamar("PATCH", `/me/agenda/eventos/${pendiente.json.eventoId}`, DIEGO, { hecho: true })).json.hecho, true);
      assert.equal((await llamar("DELETE", `/me/agenda/eventos/${pendiente.json.eventoId}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", OCTUBRE, DIEGO)).json.eventos.some((e: any) => e.eventoId === pendiente.json.eventoId), false);
      assert.equal((await llamar("DELETE", `/me/agenda/eventos/${pendiente.json.eventoId}`, DIEGO)).status, 404);
    });

    test("Google Calendar: la conexión (simulada) se guarda por persona", async () => {
      await reiniciar();
      const con = await llamar("PUT", "/me/agenda/google", DIEGO);
      assert.deepEqual([con.status, con.json.conectado, con.json.correo, con.json.simulada], [200, true, "diego.castro@inoo.pe", true]);
      assert.ok(con.json.conectadoEn);
      assert.equal((await llamar("GET", OCTUBRE, DIEGO)).json.google.conectado, true);
      assert.equal((await llamar("GET", OCTUBRE, CAMILA)).json.google.conectado, false, "es de cada uno");
      assert.equal((await llamar("PUT", "/me/agenda/google", VALERIA)).status, 403);
      assert.equal((await llamar("DELETE", "/me/agenda/google", DIEGO)).json.conectado, false);
    });
  });
}
