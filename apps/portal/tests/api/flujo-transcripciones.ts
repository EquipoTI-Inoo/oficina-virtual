/**
 * Transcripción → propuesta (fases 17 y 18), contra la API simulada y el backend real. En las pruebas la IA
 * está simulada, así que responde el borrador por reglas (conIa: false).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const CAMILA = `demo.${uid(1, 6)}`;
const WEB = uid(4, 4);
const CRM = uid(4, 3);

const VENTA = `Diego: Buenas tardes, gracias por el tiempo.
Lucía: Hola, soy Lucía Ramos, soy la gerente comercial. Nuestra empresa se llama Panadería Aurora y vendemos pan artesanal en Lima.
Lucía: Queremos vender en línea, necesitamos una tienda en línea con unos 40 productos y también mejorar nuestras redes en Instagram.
Diego: Perfecto. La web incluye 6 páginas y la carga de 40 productos, en unas 6 semanas.
Lucía: Genial. Mi correo es lucia@panaderiaaurora.pe por si necesitan algo.`;

const REUNION = `Camila: Hoy revisamos el mapa del sitio y el avance del diseño de la home.
Valeria: Me gusta la propuesta, de acuerdo con los colores.
Camila: Quedamos en que ustedes nos envían las fotos de los productos esta semana.
Camila: Nosotros preparamos la versión final de la home para el lunes.`;

export function pruebasTranscripciones(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Transcripciones · ${nombre}`, () => {
    test("alta desde la venta: Comercial obtiene una propuesta; nada se guarda", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", "/clientes/propuesta-desde-transcripcion", CAMILA, { transcripcion: VENTA })).status, 403, "nivel por proyecto no da de alta");
      assert.deepEqual((await llamar("POST", "/clientes/propuesta-desde-transcripcion", DIEGO, { transcripcion: "muy corta" })).json.errores.map((e: any) => e.campo), ["transcripcion"]);
      const antes = (await llamar("GET", "/clientes", DIEGO)).json.datos.length;
      const r = await llamar("POST", "/clientes/propuesta-desde-transcripcion", DIEGO, { transcripcion: VENTA });
      assert.equal(r.status, 200);
      const p = r.json.propuesta;
      assert.equal(r.json.conIa, false, "IA simulada: borrador por reglas");
      assert.equal(p.nombre, "Panadería Aurora");
      assert.deepEqual([p.contacto.nombre, p.contacto.email], ["Lucía Ramos", "lucia@panaderiaaurora.pe"]);
      assert.deepEqual(p.ingreso.servicios, ["Social Media", "Desarrollo web"]);
      assert.deepEqual([p.ingreso.tipoWeb, p.ingreso.cantidadProductos], ["Web e-commerce", 40]);
      assert.ok(p.alcance?.includes("40 productos"));
      assert.equal((await llamar("GET", "/clientes", DIEGO)).json.datos.length, antes, "no crea el cliente");
    });

    test("resumen de la reunión: resumen, acuerdos y pendientes de cada lado, sin cerrarla", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `/servicios-contratados/${WEB}/reuniones/propuesta`, VALERIA, { transcripcion: REUNION })).status, 403, "el cliente no");
      assert.equal((await llamar("POST", `/servicios-contratados/${CRM}/reuniones/propuesta`, CAMILA, { transcripcion: REUNION })).status, 404, "solo en sus proyectos");
      const r = await llamar("POST", `/servicios-contratados/${WEB}/reuniones/propuesta`, CAMILA, { transcripcion: REUNION });
      assert.equal(r.status, 200);
      const p = r.json.propuesta;
      assert.ok(p.resumen.length > 20);
      assert.equal(p.conAcuerdos, true);
      assert.deepEqual(p.pendientes.map((x: any) => x.de), ["CLIENTE", "INOO"]);
    });
  });

  describe(`Recordatorios · ${nombre}`, () => {
    test("n8n pide los recordatorios del día: lo del próximo día hábil, una sola vez", async () => {
      await reiniciar();
      const N8N = { "x-api-key": "demo-n8n" };
      const recordar = (fecha: string) => llamar("POST", "/integraciones/recordatorios", undefined, { fecha }, N8N);
      assert.equal((await llamar("POST", "/integraciones/recordatorios", DIEGO, {})).status, 403, "solo n8n");
      // Viernes 6 nov: la ventana llega hasta el lunes 9.
      const lunes = await llamar("POST", `/servicios-contratados/${WEB}/tareas`, DIEGO, { titulo: "Subir el catálogo", responsableId: uid(1, 6), fechaLimite: "2026-11-09" });
      assert.equal(lunes.status, 201);
      await llamar("POST", `/servicios-contratados/${WEB}/tareas`, DIEGO, { titulo: "Más adelante", responsableId: uid(1, 6), fechaLimite: "2026-11-10" });
      await llamar("POST", `/servicios-contratados/${WEB}/tareas`, DIEGO, { titulo: "Sin responsable", fechaLimite: "2026-11-09" });
      assert.equal((await llamar("POST", `/servicios-contratados/${WEB}/reuniones`, DIEGO, { titulo: "Revisión de la home", fecha: "2026-11-09T15:00:00Z" })).status, 201);
      const r = (await recordar("2026-11-06")).json;
      assert.deepEqual([r.tareas, r.reuniones], [1, 1]);
      const otra = (await recordar("2026-11-06")).json;
      assert.deepEqual([otra.tareas, otra.requerimientos, otra.reuniones], [0, 0, 0], "no se repite");
      assert.equal((await recordar("2026-11-09")).json.tareas, 1, "al día siguiente, la que vence el martes");
    });
  });

  describe(`Cierre de proyecto · ${nombre}`, () => {
    test("muestra lo que falta, pide confirmar con pendientes y deja el mensaje al cliente", async () => {
      await reiniciar();
      const c = (await llamar("GET", `/servicios-contratados/${WEB}/cierre`, DIEGO)).json;
      assert.equal(c.cerrado, false);
      assert.equal(c.listo, false, "el e-commerce de demo tiene etapas y tareas abiertas");
      assert.ok(c.pendientes.etapas > 0 && c.pendientes.tareas > 0);
      assert.equal((await llamar("GET", `/servicios-contratados/${WEB}/cierre`, VALERIA)).status, 403, "el cliente no");
      assert.equal((await llamar("POST", `/servicios-contratados/${WEB}/cierre`, DIEGO, { mensaje: "corto" })).status, 422);
      const sinConfirmar = await llamar("POST", `/servicios-contratados/${WEB}/cierre`, DIEGO, { mensaje: "¡Terminamos! Gracias por confiar en Inoo." });
      assert.deepEqual([sinConfirmar.status, sinConfirmar.json.codigo], [409, "CIERRE_CON_PENDIENTES"]);
      const r = await llamar("POST", `/servicios-contratados/${WEB}/cierre`, DIEGO, { mensaje: "¡Terminamos! Gracias por confiar en Inoo.", forzar: true });
      assert.deepEqual([r.status, r.json.cerrado], [200, true]);
      const visto = (await llamar("GET", `/servicios-contratados/${WEB}`, VALERIA)).json;
      assert.ok(visto.siguientePaso?.texto.includes("Gracias por confiar en Inoo"), "el cliente ve el mensaje de cierre en su proyecto");
      assert.equal((await llamar("POST", `/servicios-contratados/${WEB}/cierre`, DIEGO, { mensaje: "Otra vez cerrado.", forzar: true })).json.codigo, "YA_CERRADO");
    });
  });
}
