/**
 * IA para el cliente (fase 16a): sus agentes con chat de prueba, bases de conocimiento, preguntas sin
 * respuesta, Content AI, consumo en soles y pedido de canal. Las pruebas corren en modo simulado (sin
 * IA_MODO=real no se llama a ningún modelo). Corre contra la API simulada y Postgres.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, VALERIA, type Manejador } from "./flujo-piezas";

const AGENTE = uid(30, 1);
const BASE = uid(31, 1);

export function pruebasIaCliente(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  const ia = (ruta: string) => `/clientes/${CASA_OLIVA}/ia${ruta}`;

  describe(`IA del cliente · ${nombre}`, () => {
    test("inicio: consumo en soles contra el tope, métricas y plantillas de Inoo", async () => {
      await reiniciar();
      const r = (await llamar("GET", ia("/resumen"), VALERIA)).json;
      assert.deepEqual([r.consumo.moneda, r.consumo.agentes, r.consumo.contenido, r.consumo.total, r.consumo.tope, r.consumo.pausado], ["PEN", 0.1, 0.03, 0.13, 225, false]);
      assert.deepEqual(r.metricas, { contactos: 1, conversaciones: 1, acciones: 0, citas: 0, minutosAhorrados: 3 });
      assert.deepEqual([r.agentes, r.modoSimulado], [{ total: 1, publicados: 1 }, true]);
      const agentes = (await llamar("GET", ia("/agentes"), MARTIN_LECTOR)).json.datos;
      assert.deepEqual(agentes.map((a: any) => [a.nombre, a.estado, a.version, a.cambiosSinPublicar]), [["Asistente de Casa Oliva", "PUBLICADO", 1, false]], "solo los agentes del cliente, nunca los internos de Inoo");
      const plantillas = (await llamar("GET", "/ia/plantillas", VALERIA)).json.datos;
      assert.ok(plantillas.some((p: any) => p.codigo === "RECEPCIONISTA" && p.categoria === "AGENTE"));
      assert.ok(plantillas.some((p: any) => p.categoria === "CONTENIDO"));
    });

    test("crear desde plantilla, editar, publicar y probar en el chat", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", ia("/agentes"), MARTIN_LECTOR, { nombre: "Agenda" })).status, 403, "quien solo lee no crea agentes");
      const avanzado = await llamar("POST", ia("/agentes"), VALERIA, { nombre: "Agenda", razonamientoAvanzado: true });
      assert.deepEqual(avanzado.json.errores.map((e: any) => e.campo), ["razonamientoAvanzado"], "el razonamiento avanzado lo activa el equipo");
      const nuevo = await llamar("POST", ia("/agentes"), VALERIA, { nombre: "Agenda de Casa Oliva", plantillaCodigo: "AGENDAR_CITA", conocimientoIds: [BASE] });
      assert.equal(nuevo.status, 201);
      const id = nuevo.json.id;
      assert.deepEqual([nuevo.json.estado, nuevo.json.version, nuevo.json.cambiosSinPublicar, nuevo.json.acciones], ["BORRADOR", 0, true, ["AGENDAR_CITA", "DERIVAR_PERSONA"]]);
      assert.deepEqual(nuevo.json.canales, [{ canal: "PRUEBA", estado: "ACTIVO" }]);
      const editado = await llamar("PATCH", `/ia/agentes/${id}`, VALERIA, { tono: "CERCANO", derivarCuando: "Pide hablar con alguien." });
      assert.deepEqual([editado.json.tono, editado.json.derivarCuando], ["CERCANO", "Pide hablar con alguien."]);
      const publicado = (await llamar("POST", `/ia/agentes/${id}/publicar`, VALERIA)).json;
      assert.deepEqual([publicado.estado, publicado.version, publicado.cambiosSinPublicar], ["PUBLICADO", 1, false]);
      assert.equal((await llamar("PATCH", `/ia/agentes/${id}`, VALERIA, { saludo: "¡Hola!" })).json.cambiosSinPublicar, true);

      const cita = await llamar("POST", `/ia/agentes/${id}/probar`, VALERIA, { mensaje: "Quiero agendar una cita para el viernes" });
      assert.equal(cita.status, 200);
      assert.deepEqual([cita.json.respuesta.accion, cita.json.respuesta.simulado, cita.json.respuesta.sinRespuesta], ["AGENDAR_CITA", true, false]);
      const conv = cita.json.conversacionId;
      const donde = (await llamar("POST", `/ia/agentes/${id}/probar`, VALERIA, { mensaje: "¿Dónde está la tienda y en qué horario atienden?", conversacionId: conv })).json;
      assert.match(donde.respuesta.texto, /Larco/, "responde con la base de conocimiento");
      const gift = (await llamar("POST", `/ia/agentes/${id}/probar`, VALERIA, { mensaje: "¿Venden gift cards?", conversacionId: conv })).json;
      assert.equal(gift.respuesta.sinRespuesta, true);
      assert.equal(gift.consumo.agentes, 0.25, "0,10 de antes + 3 respuestas de 0,05");
      const sinRespuesta = (await llamar("GET", ia("/sin-respuesta"), VALERIA)).json.datos;
      assert.ok(sinRespuesta.some((x: any) => x.pregunta === "¿Venden gift cards?" && !x.resuelta && x.agenteNombre === "Agenda de Casa Oliva"));
      const detalle = (await llamar("GET", `/ia/conversaciones/${conv}`, VALERIA)).json;
      assert.deepEqual([detalle.mensajes, detalle.historial.length, detalle.acciones, detalle.historial[0].rol], [6, 6, 1, "CONTACTO"]);
      assert.equal((await llamar("GET", ia(`/conversaciones?agenteId=${id}`), VALERIA)).json.datos.length, 1);

      await llamar("PATCH", `/ia/agentes/${id}`, VALERIA, { estado: "PAUSADO" });
      assert.equal((await llamar("POST", `/ia/agentes/${id}/probar`, VALERIA, { mensaje: "Hola" })).json.codigo, "AGENTE_PAUSADO");
      assert.equal((await llamar("PATCH", `/ia/agentes/${id}`, DIEGO, { razonamientoAvanzado: true })).json.razonamientoAvanzado, true, "el equipo sí lo activa");
      assert.equal((await llamar("DELETE", `/ia/agentes/${id}`, MARTIN_LECTOR)).status, 403);
      assert.equal((await llamar("DELETE", `/ia/agentes/${id}`, VALERIA)).status, 204);
      assert.equal((await llamar("GET", `/ia/agentes/${id}`, VALERIA)).status, 404);
    });

    test("«Crear con IA»: propone un agente a partir del negocio (no lo guarda)", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", ia("/borrador-agente"), VALERIA, { descripcion: "Una clínica" })).status, 422);
      const r = (await llamar("POST", ia("/borrador-agente"), VALERIA, { descripcion: "Clínica dental en Surco. Atendemos con cita previa de lunes a sábado y queremos que nos ayuden a reservar." })).json;
      assert.equal(r.simulado, true);
      assert.ok(r.agente.acciones.includes("AGENDAR_CITA"));
      assert.equal(r.agente.nombre, "Asistente de Casa Oliva");
      assert.equal((await llamar("GET", ia("/agentes"), VALERIA)).json.datos.length, 1, "la propuesta no se guarda sola");
    });

    test("conocimiento: crear, editar artículos y resolver preguntas sin respuesta", async () => {
      await reiniciar();
      const malo = await llamar("POST", ia("/conocimiento"), VALERIA, { nombre: "Promos", articulos: [{ titulo: "x", contenido: "corto" }] });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["articulos.0.titulo", "articulos.0.contenido"]);
      const base = await llamar("POST", ia("/conocimiento"), VALERIA, { nombre: "Promociones de octubre", articulos: [{ titulo: "Día de la madre", contenido: "15 % de descuento en sérums hasta el 31 de octubre." }] });
      assert.equal(base.status, 201);
      const editada = (await llamar("PATCH", `/ia/conocimiento/${base.json.id}`, VALERIA, { articulos: [...base.json.articulos, { titulo: "Gift cards", contenido: "Vendemos gift cards desde S/ 50 en tienda y en la web." }] })).json;
      assert.equal(editada.articulos.length, 2);
      const lista = (await llamar("GET", ia("/conocimiento"), VALERIA)).json.datos;
      assert.equal(lista.find((b: any) => b.id === BASE).preguntasSinRespuesta, 1);
      const resuelta = (await llamar("PATCH", `/ia/sin-respuesta/${uid(33, 1)}`, VALERIA, { resuelta: true })).json;
      assert.equal(resuelta.resuelta, true);
      assert.equal((await llamar("GET", ia("/conocimiento"), VALERIA)).json.datos.find((b: any) => b.id === BASE).preguntasSinRespuesta, 0);
      assert.equal((await llamar("DELETE", `/ia/conocimiento/${BASE}`, VALERIA)).status, 204);
      assert.deepEqual((await llamar("GET", `/ia/agentes/${AGENTE}`, VALERIA)).json.conocimientoIds, [], "el agente deja de usarla");
    });

    test("Content AI: genera variaciones y cobra por cada una", async () => {
      await reiniciar();
      assert.deepEqual((await llamar("POST", ia("/contenido"), VALERIA, { destino: "TIKTOK", indicacion: "corto" })).json.errores.map((e: any) => e.campo), ["destino", "indicacion"]);
      const c = await llamar("POST", ia("/contenido"), VALERIA, { destino: "REDES", indicacion: "Lanzamiento de la crema de noche con ácido hialurónico", variaciones: 2 });
      assert.equal(c.status, 201);
      assert.deepEqual([c.json.variaciones.length, c.json.costo, c.json.simulado, c.json.creadoPor.nombre], [2, 0.06, true, "Valeria Mendoza"]);
      const lista = (await llamar("GET", ia("/contenido"), VALERIA)).json;
      assert.deepEqual([lista.datos.length, lista.datos[0].id, lista.resumen.costo], [2, c.json.id, 0.09]);
      assert.equal((await llamar("GET", ia("/contenido?destino=EMAIL"), VALERIA)).json.datos.length, 0);
      assert.equal((await llamar("POST", ia("/contenido"), MARTIN_LECTOR, { destino: "REDES", indicacion: "Lanzamiento de la crema de noche" })).status, 403);
    });

    test("conectar canal: solo agentes publicados; queda solicitado y abre un ticket", async () => {
      await reiniciar();
      const borrador = (await llamar("POST", ia("/agentes"), VALERIA, { nombre: "Borrador" })).json;
      assert.equal((await llamar("POST", `/ia/agentes/${borrador.id}/conectar-canal`, VALERIA, { canal: "WHATSAPP" })).json.codigo, "AGENTE_SIN_PUBLICAR");
      const a = (await llamar("POST", `/ia/agentes/${AGENTE}/conectar-canal`, VALERIA, { canal: "WHATSAPP" })).json;
      assert.deepEqual(a.canales, [{ canal: "PRUEBA", estado: "ACTIVO" }, { canal: "WHATSAPP", estado: "SOLICITADO" }]);
      assert.equal((await llamar("POST", `/ia/agentes/${AGENTE}/conectar-canal`, VALERIA, { canal: "WHATSAPP" })).json.codigo, "CANAL_YA_PEDIDO");
      const tickets = (await llamar("GET", `/clientes/${CASA_OLIVA}/tickets`, VALERIA)).json.datos;
      assert.ok(tickets.some((t: any) => t.asunto === "Conectar «Asistente de Casa Oliva» a WhatsApp"), "el pedido llega al equipo como ticket");
    });
  });
}
