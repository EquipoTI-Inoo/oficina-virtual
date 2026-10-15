/**
 * El proyecto como eje (reunión del 15 oct 2026): pipeline de proyectos y tareas internas con
 * comentarios y menciones. Se ejecuta contra la API simulada (mock.flujo.test.ts) y Postgres
 * (db.test.ts); `hoy` es la fecha de cada implementación porque las tareas vencidas dependen de ella.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { tareaVencida } from "../../src/dominio/proyectos";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const WEB = uid(4, 4);
const CRM = uid(4, 3);
const DISENAR = uid(27, 2);

export function pruebasProyectos(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: () => Promise<{ tipo: string; datos: any }[]>, hoy: string) {
  const llamar = crearLlamar(manejar);

  describe(`proyecto como eje · ${nombre}`, () => {
    test("pipeline: una tarjeta por proyecto, en la columna de su situación; solo el equipo", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/panel/proyectos", VALERIA)).status, 403);
      const r = (await llamar("GET", "/panel/proyectos", DIEGO)).json;
      assert.deepEqual(r.columnas.map((c: any) => c.clave), ["POR_INICIAR", "EN_CURSO", "ESPERA_CLIENTE", "CON_RETRASO", "POR_CERRAR", "EN_PAUSA"]);
      const deCasaOliva = r.datos.filter((x: any) => x.clienteId === CASA_OLIVA);
      assert.equal(deCasaOliva.length, 4);
      const crm = r.datos.find((x: any) => x.servicioContratadoId === CRM);
      assert.equal(crm.columna, "ESPERA_CLIENTE", "«Usuarios del CRM» venció el 5 de octubre");
      assert.ok(crm.requerimientosAtrasados >= 1);
      assert.equal(crm.responsable.nombre, "Diego Castro");
      const web = r.datos.find((x: any) => x.servicioContratadoId === WEB);
      const fechas = ["2026-10-09", "2026-10-05", "2026-10-20"];
      assert.deepEqual(web.tareas, { abiertas: 3, vencidas: fechas.filter((f) => tareaVencida({ estado: "PENDIENTE", fechaLimite: f }, hoy)).length });
      assert.equal(web.avance.etapaActual.nombre, "Diseño");
      // Filtros: «Admin Inoo» solo tiene una tarea abierta, en la web; la búsqueda mira cliente y servicio.
      assert.deepEqual((await llamar("GET", `/panel/proyectos?responsableId=${uid(1, 4)}`, DIEGO)).json.datos.map((x: any) => x.servicioContratadoId), [WEB]);
      assert.deepEqual((await llamar("GET", "/panel/proyectos?q=crm", DIEGO)).json.datos.map((x: any) => x.servicioContratadoId), [CRM]);
      // Una pausa manda el proyecto a su columna.
      await llamar("PATCH", `/servicios-contratados/${CRM}`, DIEGO, { estado: "PAUSADO" });
      assert.equal((await llamar("GET", "/panel/proyectos?q=crm", DIEGO)).json.datos[0].columna, "EN_PAUSA");
    });

    test("equipo para asignar: solo personas del equipo", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/panel/equipo", VALERIA)).status, 403);
      const xs = (await llamar("GET", "/panel/equipo", DIEGO)).json.datos;
      assert.deepEqual(xs.map((x: any) => x.nombre).sort(), ["Admin Inoo", "Diego Castro", "Rosa Paredes"]);
      assert.ok(xs.every((x: any) => x.iniciales.length === 2));
    });

    test("tareas: el cliente no las ve; abiertas por fecha y las hechas al final", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", `/servicios-contratados/${WEB}/tareas`, VALERIA)).status, 403);
      const xs = (await llamar("GET", `/servicios-contratados/${WEB}/tareas`, DIEGO)).json.datos;
      assert.deepEqual(xs.map((t: any) => t.titulo), [
        "Revisar las fotos de producto que subió el cliente",
        "Diseñar el inicio y la ficha de producto",
        "Pedir las credenciales de la pasarela de pago",
        "Armar flujograma y benchmark de referencias",
      ]);
      const disenar = xs.find((t: any) => t.id === DISENAR);
      assert.deepEqual([disenar.etapaNombre, disenar.responsable.nombre, disenar.comentarios, disenar.estado], ["Diseño", "Diego Castro", 1, "EN_CURSO"]);
      assert.equal(xs[0].vencida, tareaVencida({ estado: "PENDIENTE", fechaLimite: "2026-10-05" }, hoy));
      assert.equal(xs[3].vencida, false, "lo hecho nunca está vencido");
    });

    test("crear, mover, reasignar y borrar una tarea", async () => {
      await reiniciar();
      const ruta = `/servicios-contratados/${WEB}/tareas`;
      const malo = await llamar("POST", ruta, DIEGO, { titulo: "x", responsableId: uid(1, 1), etapaId: uid(20, 1), fechaLimite: "15/10" });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo).sort(), ["etapaId", "fechaLimite", "responsableId", "titulo"], "la etapa 1 es del CRM y Valeria es cliente");
      const nueva = await llamar("POST", ruta, DIEGO, { titulo: "Subir los 50 productos al catálogo", etapaId: uid(20, 8), responsableId: uid(1, 4), fechaLimite: "2026-11-02" });
      assert.deepEqual([nueva.status, nueva.json.estado, nueva.json.etapaNombre, nueva.json.responsable.nombre, nueva.json.creadoPor.nombre], [201, "PENDIENTE", "Carga de productos y pasarela de pago", "Admin Inoo", "Diego Castro"]);
      assert.ok((await eventos()).some((e) => e.tipo === "tarea.asignada" && e.datos.tareaId === nueva.json.id && e.datos.responsableId === uid(1, 4)));
      const hecha = await llamar("PATCH", `/tareas/${nueva.json.id}`, ADMIN, { estado: "HECHA" });
      assert.equal(hecha.json.estado, "HECHA");
      assert.ok(hecha.json.completadaEn);
      const reabierta = await llamar("PATCH", `/tareas/${nueva.json.id}`, ADMIN, { estado: "EN_CURSO", responsableId: uid(1, 3) });
      assert.deepEqual([reabierta.json.completadaEn, reabierta.json.responsable.nombre], [null, "Diego Castro"]);
      assert.ok((await eventos()).some((e) => e.tipo === "tarea.asignada" && e.datos.tareaId === nueva.json.id && e.datos.responsableId === uid(1, 3)));
      assert.equal((await llamar("PATCH", `/tareas/${nueva.json.id}`, VALERIA, { estado: "HECHA" })).status, 403);
      assert.equal((await llamar("DELETE", `/tareas/${nueva.json.id}`, DIEGO)).status, 204);
      assert.equal((await llamar("PATCH", `/tareas/${nueva.json.id}`, DIEGO, { estado: "HECHA" })).status, 404);
    });

    test("comentarios con menciones: solo a personas del equipo, y cada una recibe aviso", async () => {
      await reiniciar();
      const ruta = `/tareas/${DISENAR}/comentarios`;
      const antes = (await llamar("GET", ruta, DIEGO)).json.datos;
      assert.deepEqual(antes.map((c: any) => [c.autor.nombre, c.menciones.map((m: any) => m.nombre)]), [["Admin Inoo", ["Diego Castro"]]]);
      assert.equal((await llamar("POST", ruta, DIEGO, { texto: "@Valeria ¿ya viste?", mencionIds: [uid(1, 1)] })).status, 422, "no se menciona al cliente");
      const nuevo = await llamar("POST", ruta, DIEGO, { texto: "@Rosa Paredes ¿el cliente ya pagó el anticipo?", mencionIds: [uid(1, 5)] });
      assert.deepEqual([nuevo.status, nuevo.json.menciones.map((m: any) => m.nombre)], [201, ["Rosa Paredes"]]);
      assert.ok((await eventos()).some((e) => e.tipo === "tarea.mencion" && e.datos.mencionadoId === uid(1, 5)));
      assert.equal((await llamar("GET", `/servicios-contratados/${WEB}/tareas`, DIEGO)).json.datos.find((t: any) => t.id === DISENAR).comentarios, 2);
      assert.equal((await llamar("GET", ruta, VALERIA)).status, 403);
    });
  });
}
