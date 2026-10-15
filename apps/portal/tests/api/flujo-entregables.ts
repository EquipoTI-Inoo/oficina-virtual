/**
 * Entregables genéricos del proyecto (reunión del 15 oct 2026): flujograma, prototipo, mapa de
 * procesos… con versiones, aprobación del cliente y rebotes. Corre contra la API simulada y Postgres;
 * `hoy` cambia según la implementación (el atraso de revisión depende de ella).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diasNoLaborables, FERIADOS_PERU_2026 } from "../../src/dominio/calendario";
import { diasAtrasoRevision } from "../../src/dominio/revision";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, VALERIA, type Manejador } from "./flujo-piezas";

const WEB = uid(4, 4);
const FLUJOGRAMA = uid(29, 1);
const PROTOTIPO = uid(29, 2);
const MAPA_CRM = uid(29, 3);
const FERIADOS = diasNoLaborables(FERIADOS_PERU_2026.map((f) => ({ tipo: "FERIADO", fechaInicio: f.fecha, fechaFin: f.fecha })));

export function pruebasEntregables(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: () => Promise<{ tipo: string; datos: any }[]>, hoy: string) {
  const llamar = crearLlamar(manejar);

  describe(`entregables del proyecto · ${nombre}`, () => {
    test("el cliente solo ve lo que ya se le envió; el equipo ve todo", async () => {
      await reiniciar();
      const cliente = (await llamar("GET", `/servicios-contratados/${WEB}/entregables`, VALERIA)).json.datos;
      assert.deepEqual(cliente.map((e: any) => e.titulo), ["Flujograma y benchmark de referencias"]);
      const flujo = cliente[0];
      assert.deepEqual([flujo.estado, flujo.formato, flujo.url, flujo.etapaNombre, flujo.servicioTitulo], ["LISTO_REVISION", "PDF", "/muestras/flujograma-casa-oliva.pdf", "Brief y arquitectura de la tienda", "Diseño y desarrollo web - Casa Oliva"]);
      const atraso = diasAtrasoRevision("2026-10-05T16:00:00Z", hoy, FERIADOS);
      assert.deepEqual([flujo.atrasado, flujo.diasAtrasoRevision], [atraso > 0, atraso]);
      const equipo = (await llamar("GET", `/servicios-contratados/${WEB}/entregables`, DIEGO)).json.datos;
      assert.deepEqual(equipo.map((e: any) => [e.titulo, e.estado]), [["Flujograma y benchmark de referencias", "LISTO_REVISION"], ["Prototipo del inicio y la ficha de producto", "EN_PREPARACION"]]);
      assert.equal((await llamar("GET", `/entregables/${PROTOTIPO}`, VALERIA)).status, 404, "lo que no se le envió no existe para el cliente");
      const porRevisar = (await llamar("GET", `/clientes/${CASA_OLIVA}/entregables?estado=LISTO_REVISION`, VALERIA)).json.datos;
      assert.deepEqual(porRevisar.map((e: any) => e.id), [FLUJOGRAMA]);
      const perfil = (await llamar("GET", `/servicios-contratados/${WEB}?periodo=2026-10`, VALERIA)).json;
      assert.deepEqual(perfil.entregables.map((e: any) => e.id), [FLUJOGRAMA]);
    });

    test("historial: versiones y decisiones; los rebotes cuentan los pedidos de cambios", async () => {
      await reiniciar();
      const d = (await llamar("GET", `/entregables/${MAPA_CRM}`, VALERIA)).json;
      assert.deepEqual([d.estado, d.version, d.rebotes, d.versiones.length], ["APROBADO", 2, 1, 2]);
      assert.deepEqual(d.decisiones.map((x: any) => [x.version, x.decision, x.usuario.nombre]), [[1, "CAMBIOS_SOLICITADOS", "Valeria Mendoza"], [2, "APROBADO", "Valeria Mendoza"]]);
      assert.equal(d.versiones[1].nota, "Agregamos la etapa de negociación y quién aprueba cada cotización.");
      assert.equal(d.versiones[1].enviadaPor.nombre, "Diego Castro");
    });

    test("crear, enviar, pedir cambios, nueva versión y aprobar", async () => {
      await reiniciar();
      const ruta = `/servicios-contratados/${WEB}/entregables`;
      assert.equal((await llamar("POST", ruta, VALERIA, { titulo: "x", formato: "PDF", url: "https://x.pe/a.pdf" })).status, 403, "el cliente no sube entregables");
      const malo = await llamar("POST", ruta, DIEGO, { titulo: "ab", formato: "VIDEO", url: "no es un enlace", etapaId: uid(20, 1) });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo).sort(), ["etapaId", "formato", "titulo", "url"]);
      const nuevo = await llamar("POST", ruta, DIEGO, { titulo: "Wireframes en baja", formato: "PDF", url: "https://drive.google.com/file/d/demo/view", etapaId: uid(20, 6) });
      assert.deepEqual([nuevo.status, nuevo.json.estado, nuevo.json.version, nuevo.json.etapaNombre], [201, "EN_PREPARACION", 1, "Diseño"]);
      const id = nuevo.json.id;
      assert.equal((await llamar("GET", `/entregables/${id}`, VALERIA)).status, 404, "todavía no se le envía");

      const enviado = await llamar("POST", `/entregables/${id}/enviar`, DIEGO);
      assert.deepEqual([enviado.status, enviado.json.estado, enviado.json.versiones[0].enviadaPor.nombre], [200, "LISTO_REVISION", "Diego Castro"]);
      assert.ok((await eventos()).some((e) => e.tipo === "entregable.listo_revision" && e.datos.entregableId === id));
      assert.equal((await llamar("POST", `/entregables/${id}/enviar`, DIEGO)).json.codigo, "VERSION_YA_ENVIADA");

      assert.equal((await llamar("POST", `/entregables/${id}/decision`, MARTIN_LECTOR, { decision: "APROBADO" })).status, 403, "quien solo lee no decide");
      assert.equal((await llamar("POST", `/entregables/${id}/decision`, DIEGO, { decision: "APROBADO" })).status, 403, "la decisión es del cliente");
      assert.equal((await llamar("POST", `/entregables/${id}/decision`, VALERIA, { decision: "CAMBIOS_SOLICITADOS" })).json.codigo, "COMENTARIO_REQUERIDO");
      const cambios = await llamar("POST", `/entregables/${id}/decision`, VALERIA, { decision: "CAMBIOS_SOLICITADOS", comentario: "Falta la página de preguntas frecuentes." });
      assert.deepEqual([cambios.json.estado, cambios.json.rebotes], ["CAMBIOS_SOLICITADOS", 1]);
      assert.ok((await eventos()).some((e) => e.tipo === "entregable.decidido" && e.datos.rebotes === 1));
      assert.equal((await llamar("POST", `/entregables/${id}/decision`, VALERIA, { decision: "APROBADO" })).json.codigo, "ENTREGABLE_NO_ESPERA_REVISION");

      const v2 = await llamar("POST", `/entregables/${id}/versiones`, DIEGO, { url: "https://drive.google.com/file/d/demo2/view", nota: "Sumamos preguntas frecuentes." });
      assert.deepEqual([v2.status, v2.json.estado, v2.json.version], [201, "EN_PREPARACION", 2]);
      const visto = (await llamar("GET", `/entregables/${id}`, VALERIA)).json;
      assert.deepEqual([visto.estado, visto.version, visto.versiones.length], ["CAMBIOS_SOLICITADOS", 1, 1], "el cliente sigue viendo la v1 como «Revisado» mientras preparamos la v2");
      await llamar("POST", `/entregables/${id}/enviar`, DIEGO);
      const aprobado = await llamar("POST", `/entregables/${id}/decision`, VALERIA, { decision: "APROBADO" });
      assert.deepEqual([aprobado.json.estado, aprobado.json.version, aprobado.json.rebotes, !!aprobado.json.aprobadoEn], ["APROBADO", 2, 1, true]);
      assert.equal((await llamar("POST", `/entregables/${id}/versiones`, DIEGO, { url: "https://x.pe/v3.pdf" })).json.codigo, "ENTREGABLE_APROBADO");
    });
  });
}
