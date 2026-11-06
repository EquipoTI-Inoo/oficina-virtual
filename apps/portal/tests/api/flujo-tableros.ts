/**
 * Proyectos → Tableros de InooWork (2 nov 2026), contra la API simulada y el backend real. Sin INOOWORK_URL se
 * usan los proyectos de demo; la última prueba conecta un InooWork falso para ver lo que se le manda.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { usarFetchTableros } from "../../src/servidor/tableros";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const ROSA = `demo.${uid(1, 5)}`;
const CAMILA = `demo.${uid(1, 6)}`;

export function pruebasTableros(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  const ids = async (token: string) => (await llamar("GET", "/tableros", token)).json.datos.map((x: any) => x.id).sort();

  describe(`Tableros de InooWork · ${nombre}`, () => {
    test("el líder o un miembro le pone el cliente al tablero; quien no está en el proyecto, no", async () => {
      await reiniciar();
      assert.equal((await llamar("PATCH", "/tableros/PROJ-OPS01", DIEGO, { cliente: "  Casa Oliva " })).json.cliente, "Casa Oliva");
      assert.equal((await llamar("GET", "/tableros", DIEGO)).json.datos.find((x: any) => x.id === "PROJ-OPS01").cliente, "Casa Oliva");
      assert.deepEqual((await llamar("PATCH", "/tableros/PROJ-OPS01", DIEGO, { cliente: " " })).json.errores.map((e: any) => e.campo), ["cliente"]);
      assert.equal((await llamar("PATCH", "/tableros/PROJ-OPS01", CAMILA, { cliente: "Otro" })).status, 404, "no es miembro");
    });

    test("cada uno ve los proyectos donde es líder o miembro; el nivel ADMIN, todos; el cliente, nada", async () => {
      await reiniciar();
      assert.deepEqual(await ids(DIEGO), ["PROJ-MKT01", "PROJ-OPS01"]);
      assert.deepEqual(await ids(CAMILA), ["PROJ-DIS01", "PROJ-MKT01"]);
      assert.deepEqual(await ids(ADMIN), ["PROJ-DIS01", "PROJ-MKT01", "PROJ-OPS01"]);
      assert.equal((await llamar("GET", "/tableros", VALERIA)).status, 403);
      assert.equal((await llamar("GET", "/tableros/PROJ-DIS01", DIEGO)).status, 404, "no es miembro");
      const lista = (await llamar("GET", "/tableros", DIEGO)).json;
      assert.equal(lista.conectado, false, "proyectos de demo");
      const deId = (id: string) => lista.datos.find((x: any) => x.id === id);
      assert.deepEqual([deId("PROJ-MKT01").cliente, deId("PROJ-MKT01").esMio], ["Inoo", true]);
      assert.equal(deId("PROJ-OPS01").cliente, null, "sin cliente asignado todavía");
      assert.equal((await llamar("GET", "/tableros/PROJ-MKT01", DIEGO)).json.cliente, "Inoo");
      const deAdmin = (await llamar("GET", "/tableros", ADMIN)).json.datos.find((x: any) => x.id === "PROJ-DIS01");
      assert.deepEqual([deAdmin.cliente, deAdmin.esMio], ["Casa Oliva", false], "el ADMIN lo ve sin ser miembro");
      assert.deepEqual(lista.datos.find((x: any) => x.id === "PROJ-MKT01").items, { total: 5, completados: 1, vencidos: 3 });

      const t = (await llamar("GET", "/tableros/PROJ-MKT01", DIEGO)).json;
      assert.deepEqual(t.grupos.map((g: any) => g.nombre), ["Octubre", "Noviembre"]);
      assert.deepEqual(t.columnas, [{ id: "col-canal", nombre: "Canal", tipo: "text" }]);
      assert.deepEqual(t.vistas.map((v: any) => v.tipo), ["TABLA", "KANBAN", "LINEA_TIEMPO", "CALENDARIO"]);
      assert.deepEqual(t.personas.map((x: any) => x.nombre), ["Diego Castro", "Camila Paredes"]);
      const cal = t.items.find((i: any) => i.id === "item-mkt-1");
      assert.deepEqual([cal.estado, cal.prioridad, cal.valores["col-canal"], cal.subitems.length], ["En Progreso", "Alta", "LinkedIn", 2]);
    });

    test("ítems, subítems y grupos se editan desde el portal y quedan en InooWork", async () => {
      await reiniciar();
      const nuevo = await llamar("POST", "/tableros/PROJ-MKT01/items", DIEGO, { nombre: "Brief de la campaña", grupoId: "g-mkt-sig" });
      assert.equal(nuevo.status, 200);
      const item = nuevo.json.items.find((i: any) => i.nombre === "Brief de la campaña");
      assert.deepEqual([item.estado, item.prioridad, item.grupoId], ["Sin Iniciar", "Media", "g-mkt-sig"], "como lo crea InooWork");

      const cambio = await llamar("PATCH", `/tableros/PROJ-MKT01/items/${item.id}`, DIEGO, { estado: "En Revisión", responsableId: "EMP-003", fecha: "2026-11-10", prioridad: "Urgente", valores: { "col-canal": "Instagram" } });
      const i2 = cambio.json.items.find((i: any) => i.id === item.id);
      assert.deepEqual([i2.estado, i2.responsable.nombre, i2.fecha, i2.prioridad, i2.valores["col-canal"]], ["En Revisión", "Camila Paredes", "2026-11-10", "Urgente", "Instagram"]);
      const malo = await llamar("PATCH", `/tableros/PROJ-MKT01/items/${item.id}`, DIEGO, { responsableId: "EMP-004", estado: "Hecho", valores: { otra: "x" } });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo).sort(), ["estado", "responsableId", "valores.otra"]);

      // Lo que cambió otra persona entretanto no se pisa: cada cambio parte del proyecto recién leído.
      await llamar("PATCH", `/tableros/PROJ-MKT01/items/${item.id}`, CAMILA, { notas: "Con referencias de la marca" });
      const ambos = (await llamar("GET", "/tableros/PROJ-MKT01", DIEGO)).json.items.find((i: any) => i.id === item.id);
      assert.deepEqual([ambos.estado, ambos.notas], ["En Revisión", "Con referencias de la marca"]);

      const conSub = (await llamar("POST", `/tableros/PROJ-MKT01/items/${item.id}/subitems`, DIEGO, { nombre: "Reunir referencias" })).json;
      const sub = conSub.items.find((i: any) => i.id === item.id).subitems[0];
      assert.deepEqual([sub.nombre, sub.estado], ["Reunir referencias", "Sin Iniciar"]);
      await llamar("PATCH", `/tableros/PROJ-MKT01/items/${item.id}/subitems/${sub.id}`, DIEGO, { estado: "Completado", responsableId: "EMP-002" });
      const subs = (await llamar("GET", "/tableros/PROJ-MKT01", DIEGO)).json.items.find((i: any) => i.id === item.id).subitems;
      assert.deepEqual([subs[0].estado, subs[0].responsable.nombre], ["Completado", "Diego Castro"]);
      assert.equal((await llamar("DELETE", `/tableros/PROJ-MKT01/items/${item.id}/subitems/${sub.id}`, DIEGO)).json.items.find((i: any) => i.id === item.id).subitems.length, 0);

      const g = (await llamar("POST", "/tableros/PROJ-MKT01/grupos", DIEGO, { nombre: "Diciembre" })).json.grupos.at(-1);
      assert.equal(g.nombre, "Diciembre");
      await llamar("PATCH", `/tableros/PROJ-MKT01/items/${item.id}`, DIEGO, { grupoId: g.id });
      const sinGrupo = (await llamar("DELETE", `/tableros/PROJ-MKT01/grupos/${g.id}`, DIEGO)).json;
      assert.equal(sinGrupo.items.find((i: any) => i.id === item.id).grupoId, "g-mkt-mes", "sus ítems pasan al primer grupo");
      assert.equal((await llamar("DELETE", "/tableros/PROJ-DIS01/grupos/g-dis-1", CAMILA)).json.codigo, "ULTIMO_GRUPO");

      assert.equal((await llamar("DELETE", `/tableros/PROJ-MKT01/items/${item.id}`, DIEGO)).json.items.some((i: any) => i.id === item.id), false);
      assert.equal((await llamar("POST", "/tableros/PROJ-OPS01/items", CAMILA, { nombre: "x", grupoId: "g-ops-1" })).status, 404, "Camila no es de Operaciones");
      assert.equal((await llamar("POST", "/tableros/PROJ-MKT01/items", ROSA, { nombre: "Revisar presupuesto", grupoId: "g-mkt-mes" })).status, 200, "el nivel ADMIN edita todo, como el admin de InooWork");
    });

    test("crear un proyecto: plantilla de InooWork, quien lo crea es líder y los miembros lo ven", async () => {
      await reiniciar();
      const lista = (await llamar("GET", "/tableros", DIEGO)).json;
      assert.ok(lista.equipo.some((x: any) => x.nombre === "Camila Paredes"), "el equipo con ficha para elegir miembros");
      assert.ok(lista.equipo.every((x: any) => Object.keys(x).sort().join() === "area,id,nombre"), "solo nombre y área");
      const mal = await llamar("POST", "/tableros", DIEGO, { nombre: " ", cliente: "", color: "rojo", miembros: [uid(1, 99)] });
      assert.deepEqual([mal.status, mal.json.errores.map((e: any) => e.campo).sort()], [422, ["cliente", "color", "nombre"]]);
      const sinFicha = await llamar("POST", "/tableros", DIEGO, { nombre: "X", cliente: "Y", miembros: [uid(1, 99)] });
      assert.deepEqual([sinFicha.status, sinFicha.json.errores.map((e: any) => e.campo)], [422, ["miembros"]]);
      assert.equal((await llamar("POST", "/tableros", VALERIA, { nombre: "X", cliente: "Y" })).status, 403, "un cliente no crea");

      const r = await llamar("POST", "/tableros", DIEGO, { nombre: " Web 2027 ", cliente: "Casa Oliva", descripcion: "Rediseño", color: "#10b981", miembros: [uid(1, 6)] });
      assert.equal(r.status, 200);
      const t = r.json;
      assert.deepEqual([t.nombre, t.cliente, t.descripcion, t.color, t.estado, t.lider.nombre, t.area], ["Web 2027", "Casa Oliva", "Rediseño", "#10b981", "Sin Iniciar", "Diego Castro", "CRM e Innovación"]);
      assert.deepEqual(t.grupos.map((g: any) => g.nombre), ["To-Do"]);
      assert.deepEqual(t.vistas.map((v: any) => v.tipo), ["TABLA", "LINEA_TIEMPO", "KANBAN"]);
      assert.deepEqual(t.personas.map((x: any) => x.nombre), ["Diego Castro", "Camila Paredes"]);
      assert.equal(t.puedeEditar, true);
      assert.ok((await ids(CAMILA)).includes(t.id), "la miembro lo ve");
      const solo = (await llamar("POST", "/tableros", DIEGO, { nombre: "Interno", cliente: "Inoo" })).json;
      assert.ok(!(await ids(CAMILA)).includes(solo.id), "quien no es miembro, no lo ve");
      assert.ok((await ids(ROSA)).includes(solo.id), "el nivel ADMIN, sí");
      assert.equal((await llamar("POST", `/tableros/${t.id}/items`, CAMILA, { nombre: "Mapa del sitio", grupoId: "default" })).status, 200);
    });

    test("conectado a InooWork: lee de su API y guarda el proyecto completo con la llave", async () => {
      await reiniciar();
      const guardados: { metodo: string; url: string; llave: string | null; cuerpo: any }[] = [];
      let proyectos = [{ id: "PROJ-X", name: "Proyecto real", leaderId: "EMP-002", leaderName: "Diego Castro", members: [], groups: [{ id: "g1", name: "To-Do", color: "#6366f1" }], items: [], views: [], department: "CRM", extra: "se conserva" }];
      const antes = { url: process.env.INOOWORK_URL, llave: process.env.INOOWORK_API_KEY };
      process.env.INOOWORK_URL = "http://inoowork.falso";
      process.env.INOOWORK_API_KEY = "llave-de-prueba";
      usarFetchTableros(async (url, init) => {
        const h = new Headers(init?.headers);
        guardados.push({ metodo: init?.method ?? "GET", url: String(url), llave: h.get("x-api-key"), cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
        if (init?.method === "POST") return Response.json(JSON.parse(String(init.body)), { status: 201 });
        if (init?.method === "PUT") {
          const p = JSON.parse(String(init.body));
          proyectos = proyectos.map((x) => (x.id === p.id ? p : x));
          return Response.json(p);
        }
        return Response.json(proyectos);
      });
      try {
        const l = (await llamar("GET", "/tableros", DIEGO)).json;
        assert.deepEqual([l.conectado, l.datos.map((x: any) => x.id)], [true, ["PROJ-X"]]);
        await llamar("POST", "/tableros/PROJ-X/items", DIEGO, { nombre: "Primer ítem", grupoId: "g1" });
        const put = guardados.find((g) => g.metodo === "PUT")!;
        assert.equal(put.url, "http://inoowork.falso/api/projects/PROJ-X");
        assert.equal(put.llave, "llave-de-prueba");
        assert.equal(put.cuerpo.extra, "se conserva", "no se pierde nada del proyecto");
        assert.equal(put.cuerpo.items[0].name, "Primer ítem");
        await llamar("POST", "/tableros", DIEGO, { nombre: "Nuevo", cliente: "Inoo" });
        const post = guardados.find((g) => g.metodo === "POST")!;
        assert.deepEqual([post.url, post.llave, post.cuerpo.leaderId, post.cuerpo.clientName], ["http://inoowork.falso/api/projects", "llave-de-prueba", "EMP-002", "Inoo"]);
        usarFetchTableros(async () => {
          throw new Error("sin red");
        });
        const caido = await llamar("GET", "/tableros", DIEGO);
        assert.deepEqual([caido.status, caido.json.codigo], [502, "INOOWORK_NO_RESPONDE"]);
      } finally {
        usarFetchTableros(null);
        for (const [k, v] of [["INOOWORK_URL", antes.url], ["INOOWORK_API_KEY", antes.llave]] as const) {
          if (v === undefined) delete process.env[k];
          else process.env[k] = v;
        }
      }
    });
  });
}
