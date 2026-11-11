/**
 * Importar tableros de Monday (9 nov 2026), contra la API simulada y el backend real. Sin MONDAY_API_TOKEN se
 * usan los tableros de demo; la última prueba conecta un Monday falso para ver cómo se lee la API.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { usarFetchMonday } from "../../src/servidor/monday";
import { columnasClave, estadoSugerido, prioridadDe } from "../../src/dominio/monday";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;

export function pruebasMonday(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Importar de Monday · ${nombre}`, () => {
    test("solo el nivel ADMIN ve los tableros de Monday; la vista previa sugiere estados y personas", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/monday/tableros", DIEGO)).status, 403);
      assert.equal((await llamar("GET", "/monday/tableros", VALERIA)).status, 403);
      const lista = (await llamar("GET", "/monday/tableros", ADMIN)).json;
      assert.equal(lista.conectado, false, "tableros de demo");
      assert.deepEqual(lista.datos.map((t: any) => [t.id, t.nombre, t.importado]), [["1001", "Web Casa Oliva", null], ["1002", "Contenido mensual", null]]);

      const p = (await llamar("GET", "/monday/tableros/1001", ADMIN)).json;
      assert.deepEqual(p.conteo, { grupos: 2, items: 3, subitems: 1, actualizaciones: 1, archivos: 3 });
      const sug = Object.fromEntries(p.estados.map((e: any) => [e.etiqueta, e.sugerido]));
      assert.deepEqual([sug["Listo"], sug["Working on it"], sug["Stuck"], sug["Done"]], ["Completado", "En Progreso", "Bloqueado", "Completado"]);
      const per = Object.fromEntries(p.personas.map((x: any) => [x.id, x.sugeridoId]));
      assert.deepEqual(per, { "501": uid(1, 3), "502": uid(1, 6), "503": null }, "por correo, por nombre, y el que no está en el equipo");
      assert.equal(p.personas.find((x: any) => x.id === "501").esDueno, true);
      assert.deepEqual(p.columnas.map((c: any) => c.uso), ["RESPONSABLE", "ESTADO", "PRIORIDAD", "FECHA", "COLUMNA", "NO_SE_PASA", "NO_SE_PASA"]);
      assert.equal((await llamar("GET", "/monday/tableros/9999", ADMIN)).status, 404);
      assert.equal(p.clienteSugerido, "Casa Oliva", "el cliente del portal que aparece en el nombre del tablero");
    });

    test("importar crea el tablero en InooWork con todo y guarda el historial; no se importa dos veces", async () => {
      await reiniciar();
      const mal = await llamar("POST", "/monday/tableros/1001/importar", ADMIN, { cliente: 5, estados: { Stuck: "Otro" } });
      assert.deepEqual(mal.json.errores.map((e: any) => e.campo).sort(), ["cliente", "estados"]);
      const cliente = await llamar("POST", "/monday/tableros/1001/importar", ADMIN, { cliente: "Casa Oliva", personas: { "503": uid(1, 1) } });
      assert.equal(cliente.status, 422, "una clienta no es del equipo");

      const r = await llamar("POST", "/monday/tableros/1001/importar", ADMIN, { cliente: "Casa Oliva", estados: { Stuck: "En Revisión" } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const t = r.json.tablero;
      assert.deepEqual([t.nombre, t.cliente, t.lider?.nombre], ["Web Casa Oliva", "Casa Oliva", "Diego Castro"], "el dueño en Monday es el líder");
      assert.deepEqual(t.grupos.map((g: any) => g.nombre), ["Diseño", "Desarrollo"]);
      assert.deepEqual(t.columnas.map((c: any) => c.nombre), ["Canal"]);
      const it = (n: string) => t.items.find((i: any) => i.nombre === n);
      const home = it("Home y catálogo");
      assert.deepEqual([home.estado, home.responsable?.nombre, home.fecha, home.prioridad, home.valores[t.columnas[0].id]], ["Completado", "Diego Castro", "2026-09-20", "Alta", "Web"]);
      assert.deepEqual(home.subitems.map((s: any) => [s.nombre, s.estado, s.responsable?.nombre]), [["Wireframe", "Completado", "Camila Paredes"]]);
      assert.deepEqual([it("Pruebas en celular").estado, it("Pruebas en celular").prioridad], ["En Revisión", "Urgente"], "el estado corregido por el admin");
      assert.equal(it("Carrito de cotización").responsable, null, "quien ya no está en el equipo queda sin asignar");
      assert.deepEqual(t.personas.map((x: any) => x.nombre).sort(), ["Camila Paredes", "Diego Castro"]);
      assert.deepEqual(r.json.resumen, { grupos: 2, items: 3, subitems: 1, actualizaciones: 1, archivos: 2, archivosCopiados: 0, sinResponsable: 2 });
      assert.equal(r.json.archivosSinCopiar.length, 2);
      assert.ok(r.json.archivosSinCopiar.every((a: any) => a.motivo), "cada archivo dice por qué no se copió");

      assert.equal((await llamar("POST", "/monday/tableros/1001/importar", ADMIN, { cliente: "Casa Oliva" })).status, 409);
      const lista = (await llamar("GET", "/monday/tableros", ADMIN)).json.datos;
      assert.equal(lista.find((x: any) => x.id === "1001").importado.proyectoId, t.id);
      assert.equal((await llamar("GET", "/monday/tableros/1001", ADMIN)).json.importado.proyectoId, t.id);
      assert.ok((await llamar("GET", "/tableros", DIEGO)).json.datos.some((x: any) => x.id === t.id), "Diego lo ve en sus tableros");

      // El historial: lo ve quien ve el tablero.
      const h = await llamar("GET", `/tableros/${t.id}/items/${home.id}/historial-monday`, DIEGO);
      assert.equal(h.status, 200);
      assert.deepEqual(h.json.datos.map((x: any) => x.tipo), ["ARCHIVOS", "ACTUALIZACION"]);
      const act = h.json.datos.find((x: any) => x.tipo === "ACTUALIZACION");
      assert.deepEqual([act.autor, act.texto.startsWith("El cliente aprobó"), act.respuestas[0].autor, act.archivos[0].nombre, act.archivos[0].disponible],
        ["Diego Castro", true, "Camila Paredes", "home-final.pdf", false]);
      assert.deepEqual(h.json.datos.find((x: any) => x.tipo === "ARCHIVOS").archivos.map((a: any) => a.nombre), ["logo.png"]);
      assert.equal((await llamar("GET", `/tableros/${t.id}/items/${home.id}/historial-monday`, VALERIA)).status, 403, "el cliente no lo ve");
      assert.equal((await llamar("GET", `/tableros/${t.id}/archivos-monday/a1`, DIEGO)).status, 409, "sin almacén no se copió");
      assert.equal((await llamar("GET", `/tableros/${t.id}/archivos-monday/zz`, DIEGO)).status, 404);
    });

    test("sin dueño en Monday el líder es quien importa; la línea de tiempo da la fecha", async () => {
      await reiniciar();
      const r = await llamar("POST", "/monday/tableros/1002/importar", ADMIN, { nombre: "Contenido de noviembre", copiarArchivos: false });
      assert.equal(r.json.tablero?.cliente, null, "sin cliente: queda por asignar");
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.deepEqual([r.json.tablero.nombre, r.json.tablero.lider?.nombre], ["Contenido de noviembre", "Admin Inoo"]);
      assert.deepEqual([r.json.tablero.items[0].fecha, r.json.tablero.items[0].estado], ["2026-11-15", "Sin Iniciar"]);
    });
  });
}

describe("Importar de Monday · reglas", () => {
  test("estados, prioridades y columnas clave", () => {
    assert.deepEqual(["Listo", "Working on it", "Stuck", "En revisión", "", "Lo que sea"].map(estadoSugerido), ["Completado", "En Progreso", "Bloqueado", "En Revisión", "Sin Iniciar", "Sin Iniciar"]);
    assert.deepEqual(["High", "Critical ⚠️", "Low", "Medium"].map(prioridadDe), ["Alta", "Urgente", "Baja", "Media"]);
    const k = columnasClave([{ id: "status_1", titulo: "Prioridad", tipo: "status" }, { id: "status", titulo: "Estado", tipo: "status" }, { id: "date", titulo: "Creado", tipo: "date" }, { id: "date2", titulo: "Fecha de entrega", tipo: "date" }]);
    assert.deepEqual([k.estado, k.prioridad, k.fecha], ["status", "status_1", "date2"]);
  });

  test("lee la API de Monday por páginas y no la llama sin clave", async () => {
    const pedidos: string[] = [];
    const antes = process.env.MONDAY_API_TOKEN;
    process.env.MONDAY_API_TOKEN = "clave-de-prueba";
    usarFetchMonday(async (_url, init) => {
      const { query, variables } = JSON.parse(String(init?.body));
      pedidos.push(query.includes("next_items_page") ? "siguiente" : query.includes("users") ? "usuarios" : query.includes("ids") ? "tablero" : "lista");
      const json = (d: unknown) => new Response(JSON.stringify({ data: d }), { headers: { "content-type": "application/json" } });
      if (query.includes("items_count")) return json({ boards: variables.p === 1 ? [{ id: 7, name: "Real", type: "board", items_count: 2, workspace: { name: "Main" } }, { id: 8, name: "Sub", type: "sub_items_board" }] : [] });
      if (query.includes("users")) return json({ users: [{ id: 1, name: "Diego Castro", email: "diego.castro@inoo.pe" }] });
      const it = (id: number) => ({ id, name: `Ítem ${id}`, group: { id: "g" }, column_values: [{ id: "status", text: "Done", value: null }], subitems: [], updates: [], assets: [] });
      if (query.includes("next_items_page")) return json({ next_items_page: { cursor: null, items: [it(2)] } });
      return json({ boards: [{ id: 7, name: "Real", owners: [{ id: 1, name: "Diego Castro" }], columns: [{ id: "name", title: "Name", type: "name" }, { id: "status", title: "Status", type: "status" }], groups: [{ id: "g", title: "G", color: "#579bfc" }], items_page: { cursor: "c1", items: [it(1)] } }] });
    });
    try {
      const { listarTablerosMonday, leerTableroMonday } = await import("../../src/servidor/monday");
      assert.deepEqual((await listarTablerosMonday()).map((t) => [t.id, t.nombre, t.espacio]), [["7", "Real", "Main"]], "sin los tableros de subítems");
      const t = await leerTableroMonday("7");
      assert.deepEqual(t?.items.map((i) => i.nombre), ["Ítem 1", "Ítem 2"]);
      assert.deepEqual(pedidos, ["lista", "tablero", "siguiente", "usuarios"]);
    } finally {
      usarFetchMonday(null);
      if (antes === undefined) delete process.env.MONDAY_API_TOKEN;
      else process.env.MONDAY_API_TOKEN = antes;
    }
  });
});
