/**
 * Tipos de columna de los tableros (11 nov 2026), contra la API simulada y el backend real (InooWork simulado).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analizarFormula, evaluarFormula, TIPOS_COLUMNA, valorDeColumna } from "../../src/dominio/columnas";
import { CASA_OLIVA, crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";
import { claveCliente, clienteEnTexto } from "../../src/dominio/clientes-tablero";
import { carpetaDeDrive } from "../../src/dominio/carpeta-drive";
import { uid } from "../../src/mock/datos";

const CAMILA = `demo.${uid(1, 6)}`;
const T = "PROJ-MKT01";

export function pruebasColumnas(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  const col = async (tipo: string, nombreCol: string, config?: object) => {
    const r = await llamar("POST", `/tableros/${T}/columnas`, DIEGO, { nombre: nombreCol, tipo, ...(config ? { config } : {}) });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return r.json.columnas.find((c: any) => c.nombre === nombreCol);
  };
  const item = async (b: object, id = "item-mkt-1") => llamar("PATCH", `/tableros/${T}/items/${id}`, DIEGO, b);
  const it = (t: any, id = "item-mkt-1") => t.items.find((i: any) => i.id === id);

  describe(`Columnas de los tableros · ${nombre}`, () => {
    test("borrar un proyecto: solo el líder o un admin", async () => {
      await reiniciar();
      assert.deepEqual([(await llamar("GET", `/tableros/${T}`, DIEGO)).json.puedeBorrar, (await llamar("GET", `/tableros/${T}`, CAMILA)).json.puedeBorrar], [true, false]);
      assert.equal((await llamar("DELETE", `/tableros/${T}`, CAMILA)).status, 403, "Camila es miembro, no líder");
      assert.equal((await llamar("DELETE", `/tableros/${T}`, DIEGO)).status, 204);
      assert.equal((await llamar("GET", `/tableros/${T}`, DIEGO)).status, 404);
      assert.ok(!(await llamar("GET", "/tableros", DIEGO)).json.datos.some((t: any) => t.id === T));
    });

    test("archivados: se ven aparte, son de solo lectura y se desarchivan", async () => {
      await reiniciar();
      const N8N = { "x-api-key": "demo-n8n" };
      await llamar("PATCH", "/tableros/PROJ-OPS01", DIEGO, { estado: "Completado" });
      const hoy = new Date().toISOString().slice(0, 10);
      const despues = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
      await llamar("POST", "/integraciones/tableros/archivar", undefined, { fecha: hoy }, N8N);
      await llamar("POST", "/integraciones/tableros/archivar", undefined, { fecha: despues }, N8N);
      assert.ok(!(await llamar("GET", "/tableros", DIEGO)).json.datos.some((t: any) => t.id === "PROJ-OPS01"), "fuera de la lista normal");
      const arch = (await llamar("GET", "/tableros?archivados=1", DIEGO)).json.datos;
      assert.deepEqual(arch.map((t: any) => t.id), ["PROJ-OPS01"]);
      assert.ok(arch[0].archivadoEn);
      const t = (await llamar("GET", "/tableros/PROJ-OPS01", DIEGO)).json;
      assert.deepEqual([t.archivado, t.puedeEditar, t.puedeDesarchivar], [true, false, true]);
      assert.equal((await llamar("PATCH", `/tableros/PROJ-OPS01/items/${t.items[0].id}`, DIEGO, { estado: "Bloqueado" })).status, 409);
      assert.equal((await llamar("POST", "/tableros/PROJ-OPS01/desarchivar", CAMILA)).status, 404, "Camila no está en ese proyecto");
      const d = await llamar("POST", "/tableros/PROJ-OPS01/desarchivar", DIEGO);
      assert.deepEqual([d.status, d.json.archivado, d.json.estado, d.json.puedeEditar], [200, false, "En Progreso", true]);
      assert.ok((await llamar("GET", "/tableros", DIEGO)).json.datos.some((x: any) => x.id === "PROJ-OPS01"));
      assert.equal((await llamar("POST", "/tableros/PROJ-OPS01/desarchivar", DIEGO)).status, 409);
    });

    test("acciones en lote: cambiar varios ítems de una vez o borrarlos", async () => {
      await reiniciar();
      const ids = ["item-mkt-1", "item-mkt-2"];
      assert.equal((await llamar("POST", `/tableros/${T}/items-lote`, DIEGO, { ids: [] , cambio: { estado: "Bloqueado" } })).status, 422);
      assert.equal((await llamar("POST", `/tableros/${T}/items-lote`, DIEGO, { ids: ["no-existe"], cambio: { estado: "Bloqueado" } })).status, 404);
      assert.equal((await llamar("POST", `/tableros/${T}/items-lote`, DIEGO, { ids, cambio: { nombre: "x" } })).status, 422, "el nombre no va en lote");
      const r = await llamar("POST", `/tableros/${T}/items-lote`, DIEGO, { ids, cambio: { estado: "Bloqueado", prioridad: "Urgente", grupoId: "g-mkt-sig" } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      for (const id of ids) assert.deepEqual([it(r.json, id).estado, it(r.json, id).prioridad, it(r.json, id).grupoId], ["Bloqueado", "Urgente", "g-mkt-sig"]);
      assert.equal((await llamar("POST", `/tableros/${T}/items-lote`, CAMILA, { ids, cambio: { estado: "Completado" } })).status, 200, "Camila es miembro");
      const b = await llamar("POST", `/tableros/${T}/items-lote`, DIEGO, { ids, borrar: true });
      assert.ok(ids.every((id) => !b.json.items.some((i: any) => i.id === id)));
    });

    test("mi trabajo y aviso de asignación", async () => {
      await reiniciar();
      const mio = (await llamar("GET", "/mi-trabajo", DIEGO)).json.datos;
      assert.ok(mio.some((x: any) => x.itemId === "item-mkt-1" && x.como === "RESPONSABLE"), "su ítem en curso");
      assert.ok(mio.every((x: any) => x.estado !== "Completado"), "sin lo completado");
      assert.ok(mio.every((x: any, i: number) => !i || (mio[i - 1].fecha ?? "9999") <= (x.fecha ?? "9999")), "por fecha");
      assert.equal((await llamar("GET", "/mi-trabajo", VALERIA)).status, 403);
      const camila = (await llamar("GET", `/tableros/${T}`, DIEGO)).json.personas.find((p: any) => p.nombre === "Camila Paredes").id;
      await llamar("PATCH", `/tableros/${T}/items/item-mkt-2`, DIEGO, { responsableId: camila });
      const avisos = (await llamar("GET", "/me/notificaciones", CAMILA)).json.datos.map((n: any) => n.titulo);
      assert.ok(avisos.includes("Diego Castro te asignó un ítem"));
      assert.ok((await llamar("GET", "/mi-trabajo", CAMILA)).json.datos.some((x: any) => x.itemId === "item-mkt-2"));
      // 13 nov: Mi trabajo también trae las tareas de los servicios, y el panel y el calendario suman los ítems de tableros.
      const camilaTodo = (await llamar("GET", "/mi-trabajo", CAMILA)).json;
      assert.equal(camilaTodo.vinculado, true);
      const panel = (await llamar("GET", "/panel/colaborador", CAMILA)).json;
      assert.ok(panel.resumen.tareasAbiertas >= camilaTodo.datos.length, "el panel cuenta los ítems de tableros");
      const conFecha = camilaTodo.datos.find((x: any) => x.fecha && x.como !== "TAREA");
      if (conFecha) {
        const ag = (await llamar("GET", `/me/agenda?desde=${conFecha.fecha}&hasta=${conFecha.fecha}`, CAMILA)).json;
        assert.ok(ag.eventos.some((e: any) => e.enlace?.includes("?item=")), "el ítem con fecha está en el calendario");
      }
    });

    test("actualizaciones del ítem: escribir, responder y mencionar avisan en la campana", async () => {
      await reiniciar();
      const ruta = `/tableros/${T}/items/item-mkt-1/actualizaciones`;
      assert.equal((await llamar("POST", ruta, DIEGO, { texto: " " })).status, 422);
      assert.equal((await llamar("POST", ruta, DIEGO, { texto: "x", mencionIds: [uid(1, 1)] })).status, 422, "una clienta no es del equipo");
      assert.equal((await llamar("GET", ruta, VALERIA)).status, 403);
      const r = await llamar("POST", ruta, DIEGO, { texto: "@Camila Paredes ¿subes el carrusel hoy?", mencionIds: [uid(1, 6)] });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const a = r.json.datos[0];
      assert.deepEqual([a.autor.nombre, a.menciones.map((m: any) => m.nombre), a.esMia], ["Diego Castro", ["Camila Paredes"], true]);
      const resp = await llamar("POST", ruta, CAMILA, { texto: "Sí, a las 4", padreId: a.id });
      assert.deepEqual(resp.json.datos.map((x: any) => [x.texto, x.padreId === a.id, x.esMia]), [["@Camila Paredes ¿subes el carrusel hoy?", false, false], ["Sí, a las 4", true, true]]);
      assert.equal((await llamar("POST", ruta, DIEGO, { texto: "x", padreId: resp.json.datos[1].id })).status, 422, "solo un nivel de respuestas");
      assert.deepEqual((await llamar("GET", `/tableros/${T}/actualizaciones`, DIEGO)).json.datos, { "item-mkt-1": 2 });

      // Avisos: a Camila por la mención; a Diego porque le respondieron (y es el responsable del ítem).
      const avisos = async (t: string) => (await llamar("GET", "/me/notificaciones", t)).json.datos.map((n: any) => n.titulo);
      assert.ok((await avisos(CAMILA)).some((x: string) => x.startsWith("Diego Castro te mencionó")));
      assert.ok((await avisos(DIEGO)).some((x: string) => x.startsWith("Camila Paredes respondió tu actualización")));
      assert.ok(!(await avisos(DIEGO)).some((x: string) => x.includes("Diego Castro")), "nunca a uno mismo");

      assert.equal((await llamar("PATCH", `${ruta}/${a.id}`, CAMILA, { texto: "otra" })).status, 403, "solo quien la escribió edita");
      assert.equal((await llamar("PATCH", `${ruta}/${a.id}`, DIEGO, { texto: "Editada" })).json.datos[0].editadoEn !== null, true);
      assert.equal((await llamar("DELETE", `${ruta}/${a.id}`, CAMILA)).status, 403);
      assert.deepEqual((await llamar("DELETE", `${ruta}/${a.id}`, DIEGO)).json.datos, [], "se borra con sus respuestas");
    });

    test("el cliente de un tablero se empareja con el del portal o se crea solo; la carpeta de Drive se puede poner a mano", async () => {
      await reiniciar();
      const clientes = async () => (await llamar("GET", "/clientes?limite=100", DIEGO)).json.datos.map((c: any) => c.nombre);
      const antes = (await clientes()).length;
      assert.equal((await llamar("PATCH", "/tableros/PROJ-OPS01", DIEGO, { cliente: "casa oliva s.a.c." })).json.cliente, "Casa Oliva", "el mismo cliente, escrito distinto");
      assert.equal((await clientes()).length, antes, "no se crea otro");
      assert.equal((await llamar("PATCH", "/tableros/PROJ-OPS01", DIEGO, { cliente: "Tecnillaves" })).json.cliente, "Tecnillaves");
      assert.ok((await clientes()).includes("Tecnillaves"), "se crea la ficha en el portal");
      assert.equal((await llamar("PATCH", "/tableros/PROJ-MKT01", DIEGO, { cliente: "TECNILLAVES E.I.R.L." })).json.cliente, "Tecnillaves");
      assert.equal((await clientes()).length, antes + 1, "una sola vez");
      assert.equal((await llamar("PATCH", "/tableros/PROJ-MKT01", DIEGO, { cliente: "inoo" })).json.cliente, "Inoo", "Inoo es interno: no es un cliente");

      // Carpeta de Drive existente, a mano; n8n después no la reemplaza.
      const mal = await llamar("PATCH", `/clientes/${CASA_OLIVA}`, DIEGO, { driveUrl: "https://dropbox.com/x" });
      assert.deepEqual([mal.status, mal.json.errores?.[0]?.campo], [422, "driveUrl"]);
      const ok = await llamar("PATCH", `/clientes/${CASA_OLIVA}`, DIEGO, { driveUrl: "https://drive.google.com/drive/u/0/folders/1AbCdEfGhIjKlMnOp?usp=sharing" });
      assert.equal(ok.json.driveUrl, "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp");
      await llamar("PATCH", `/clientes/${CASA_OLIVA}`, undefined, { driveUrl: "https://drive.google.com/drive/folders/otra-de-n8n" }, { "x-api-key": "demo-n8n" });
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}`, DIEGO)).json.driveUrl, "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp");
      assert.equal((await llamar("PATCH", `/clientes/${CASA_OLIVA}`, VALERIA, { driveUrl: null })).status, 403);
    });

    test("se agregan columnas de la biblioteca y cada valor se valida según su tipo", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `/tableros/${T}/columnas`, DIEGO, { nombre: "X", tipo: "inventado" })).status, 422);
      assert.equal((await llamar("POST", `/tableros/${T}/columnas`, CAMILA, { nombre: "X", tipo: "text" })).status, 200, "Camila es miembro");
      assert.equal((await llamar("POST", `/tableros/${T}/columnas`, VALERIA, { nombre: "X", tipo: "text" })).status, 403);

      const monto = await col("number", "Monto", { unidad: "S/", unidadAntes: true });
      const fase = await col("etiqueta", "Fase");
      const canales = await col("dropdown", "Canales", { opciones: ["Meta", "TikTok", "Google"] });
      const equipo = await col("people", "Equipo");
      const plazo = await col("timeline", "Plazo");
      const listo = await col("checkbox", "Revisado");
      const web = await col("link", "Web");
      const pais = await col("country", "País");
      const nota = await col("rating", "Nota");
      assert.deepEqual(fase.config.etiquetas.map((l: any) => l.texto), ["Listo", "En curso", "Detenido", "Pendiente"]);

      const mal = await item({ valores: { [monto.id]: "mucho", [fase.id]: "Inventada", [canales.id]: ["Radio"], [equipo.id]: ["EMP-X"], [plazo.id]: { desde: "2026-11-10", hasta: "2026-11-01" }, [web.id]: "ftp://x", [pais.id]: "Narnia", [nota.id]: 9 } });
      assert.deepEqual(mal.json.errores.map((e: any) => e.campo.split(".")[0]), Array(8).fill("valores"));

      const r = await item({ valores: {
        [monto.id]: "1500,5", [fase.id]: "En curso", [canales.id]: ["Meta", "Google"], [equipo.id]: [it((await llamar("GET", `/tableros/${T}`, DIEGO)).json).responsable.id],
        [plazo.id]: { desde: "2026-11-01", hasta: "2026-11-15" }, [listo.id]: true, [web.id]: { url: "https://inoo.pe", texto: "Inoo" }, [pais.id]: "Perú", [nota.id]: 4,
      } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const x = it(r.json);
      assert.deepEqual([x.valores[monto.id], x.valores[fase.id], x.valores[canales.id], x.valores[plazo.id], x.valores[listo.id], x.valores[pais.id], x.valores[nota.id]],
        ["1500.5", "En curso", "Meta, Google", "2026-11-01 → 2026-11-15", "✓", "Perú", "4"]);
      assert.deepEqual([x.datos[canales.id], x.datos[plazo.id], x.datos[web.id]], [["Meta", "Google"], { desde: "2026-11-01", hasta: "2026-11-15" }, { texto: "Inoo" }]);
      assert.equal(x.valores[equipo.id], "Diego Castro");

      // Borrar un valor y cambiar las etiquetas: los valores que ya no existen se vacían.
      const sinFase = await llamar("PATCH", `/tableros/${T}/columnas/${fase.id}`, DIEGO, { config: { etiquetas: [{ texto: "Hecho", color: "#00c875", hecho: true }] } });
      assert.equal(it(sinFase.json).valores[fase.id], undefined);
      assert.equal(it((await item({ valores: { [monto.id]: null } })).json).valores[monto.id], undefined);
    });

    test("fórmula, progreso, autonumeración, registro de creación y última actualización se calculan solos", async () => {
      await reiniciar();
      const horas = await col("number", "Horas");
      const tarifa = await col("number", "Tarifa");
      const fase = await col("etiqueta", "Fase");
      const ok = await col("checkbox", "Aprobado");
      const total = await col("formula", "Total", { expresion: "{Horas} * {Tarifa} + IF({Aprobado}, 10, 0)" });
      const prog = await col("progress", "Avance", { columnas: [fase.id, ok.id, "status"] });
      const n = await col("auto_number", "N°");
      const act = await col("last_updated", "Actualizado");
      assert.equal((await llamar("POST", `/tableros/${T}/columnas`, DIEGO, { nombre: "Mala", tipo: "formula", config: { expresion: "{Horas} * (" } })).status, 422);

      const r = await item({ valores: { [horas.id]: 3, [tarifa.id]: 50, [fase.id]: "Listo", [ok.id]: true } });
      const x = it(r.json);
      assert.deepEqual([x.valores[total.id], x.valores[prog.id], x.valores[n.id]], ["160", "67%", "1"]);
      assert.match(x.valores[act.id], /^Diego Castro · \d{4}-\d{2}-\d{2}/);
      assert.equal(it(r.json, "item-mkt-2").valores[n.id], "2");

      const nuevo = await llamar("POST", `/tableros/${T}/items`, DIEGO, { nombre: "Con registro", grupoId: "g-mkt-sig" });
      const creado = await col("creation_log", "Creado");
      const c = (await llamar("GET", `/tableros/${T}`, DIEGO)).json.items.find((i: any) => i.nombre === "Con registro");
      assert.ok(nuevo.status === 200 && c.valores[creado.id].startsWith("Diego Castro · "));
    });

    test("votos, cronómetro y botón se usan con un clic; la dependencia apunta a otros ítems", async () => {
      await reiniciar();
      const votos = await col("vote", "Votos");
      const tiempo = await col("time_tracking", "Tiempo");
      const fase = await col("etiqueta", "Fase");
      const boton = await col("button", "Cerrar", { texto: "Marcar listo", accion: { columnaId: fase.id, valor: "Listo" } });
      const dep = await col("dependency", "Depende de");
      const accion = (c: string, quien = DIEGO) => llamar("POST", `/tableros/${T}/items/item-mkt-1/columnas/${c}/accion`, quien);

      assert.equal(it((await accion(votos.id)).json).valores[votos.id], "1");
      assert.equal(it((await accion(votos.id, CAMILA)).json).valores[votos.id], "2");
      assert.equal(it((await accion(votos.id)).json).valores[votos.id], "1", "votar de nuevo quita el voto");
      const t1 = it((await accion(tiempo.id)).json);
      assert.ok(t1.datos[tiempo.id].desde, "corriendo");
      const t2 = it((await accion(tiempo.id)).json);
      assert.deepEqual([t2.datos[tiempo.id].desde, t2.valores[tiempo.id]], [null, "0m"]);
      assert.equal(it((await accion(boton.id)).json).valores[fase.id], "Listo");
      assert.equal((await accion(fase.id)).status, 409, "una etiqueta no tiene acción");

      assert.equal((await item({ valores: { [dep.id]: ["item-mkt-1"] } })).status, 422, "no depende de sí mismo");
      assert.equal(it((await item({ valores: { [dep.id]: ["item-mkt-2"] } })).json).valores[dep.id], it((await llamar("GET", `/tableros/${T}`, DIEGO)).json, "item-mkt-2").nombre);
    });

    test("archivos en una celda: subir, bajar y quitar; conectar tableros y espejo", async () => {
      await reiniciar();
      const arch = await col("file", "Entregables");
      const ruta = `/tableros/${T}/items/item-mkt-1/columnas/${arch.id}/archivos`;
      assert.equal((await llamar("POST", ruta, DIEGO, { nombre: "a.txt" })).status, 422);
      const r = await llamar("POST", ruta, DIEGO, { nombre: "brief.txt", mime: "text/plain", base64: Buffer.from("hola mundo").toString("base64") });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const f = it(r.json).datos[arch.id][0];
      assert.deepEqual([it(r.json).valores[arch.id], f.nombre, f.bytes], ["brief.txt", "brief.txt", 10]);
      const baja = await manejar(new Request(`http://x/api/v1/tableros/${T}/archivos/${f.id}`, { headers: { authorization: `Bearer ${DIEGO}` } }));
      assert.deepEqual([baja.status, await baja.text()], [200, "hola mundo"]);
      const ajena = await manejar(new Request(`http://x/api/v1/tableros/PROJ-OPS01/archivos/${f.id}`, { headers: { authorization: `Bearer ${DIEGO}` } }));
      assert.equal(ajena.status, 404, "el archivo es de otro tablero");

      // Versiones (V2) y comentarios por archivo, como en Monday.
      const v2 = await llamar("POST", `${ruta}/${f.id}/versiones`, CAMILA, { nombre: "brief-v2.txt", mime: "text/plain", base64: Buffer.from("versión dos").toString("base64") });
      assert.equal(v2.status, 200, JSON.stringify(v2.json));
      const a2 = it(v2.json).datos[arch.id][0];
      assert.deepEqual([a2.id, a2.nombre, a2.version, a2.versiones.map((x: any) => [x.version, x.por])], [f.id, "brief-v2.txt", 2, [[1, "Diego Castro"], [2, "Camila Paredes"]]]);
      assert.equal(it(v2.json).valores[arch.id], "brief-v2.txt");
      const bajarV = async (id: string) => (await manejar(new Request(`http://x/api/v1/tableros/${T}/archivos/${id}?enLinea=1`, { headers: { authorization: `Bearer ${DIEGO}` } })));
      const r1 = await bajarV(a2.versiones[0].id);
      assert.deepEqual([await r1.text(), r1.headers.get("content-type")], ["hola mundo", "application/octet-stream"], "texto: nunca en línea");
      assert.equal(await (await bajarV(a2.versiones[1].id)).text(), "versión dos");
      const com = `/tableros/${T}/archivos/${f.id}/comentarios`;
      assert.equal((await llamar("POST", com, DIEGO, { texto: " " })).status, 422);
      assert.equal((await llamar("POST", com, DIEGO, { texto: "x", version: 9 })).status, 422);
      await llamar("POST", com, DIEGO, { texto: "En la V1 faltaba el logo", version: 1 });
      const c = await llamar("POST", com, CAMILA, { texto: "Listo en la V2" });
      assert.deepEqual(c.json.datos.map((x: any) => [x.version, x.autor, x.texto]), [[1, "Diego Castro", "En la V1 faltaba el logo"], [2, "Camila Paredes", "Listo en la V2"]]);
      assert.equal((await llamar("GET", com, VALERIA)).status, 403);
      assert.equal((await llamar("GET", `/tableros/PROJ-OPS01/archivos/${f.id}/comentarios`, DIEGO)).status, 404, "no es de ese tablero");

      const sin = await llamar("DELETE", `${ruta}/${f.id}`, DIEGO);
      assert.equal(it(sin.json).valores[arch.id], undefined);
      assert.equal((await manejar(new Request(`http://x/api/v1/tableros/${T}/archivos/${f.id}`, { headers: { authorization: `Bearer ${DIEGO}` } }))).status, 404);

      // Conectar con otro tablero donde Diego es miembro (PROJ-OPS01) y mostrar su estado con un espejo.
      const con = await col("board_relation", "Relacionado", { tableroId: "PROJ-OPS01" });
      const espejo = await col("mirror", "Estado allá", { conexionId: con.id, columnaEspejo: "status" });
      const otro = (await llamar("GET", "/tableros/PROJ-OPS01", DIEGO)).json.items[0];
      assert.equal((await item({ valores: { [con.id]: ["no-existe"] } })).status, 422);
      const x = it((await item({ valores: { [con.id]: [otro.id] } })).json);
      assert.deepEqual([x.valores[con.id], x.valores[espejo.id]], [otro.nombre, otro.estado]);

      assert.equal(it((await llamar("DELETE", `/tableros/${T}/columnas/${con.id}`, DIEGO)).json).valores[con.id], undefined);
      assert.equal((await llamar("DELETE", `/tableros/${T}/columnas/status`, DIEGO)).status, 404, "las fijas no se borran");
    });
  });
}

describe("Clientes de los tableros · reglas", () => {
  test("nombres comparables y cliente dentro del nombre del tablero", () => {
    assert.equal(claveCliente("Casa Olíva S.A.C."), "casa oliva");
    assert.equal(claveCliente("Tecnillaves E.I.R.L"), "tecnillaves");
    const cs = [{ nombre: "Casa Oliva" }, { nombre: "Oliva" }, { nombre: "Inoo" }];
    assert.equal(clienteEnTexto("Web Casa Oliva 2026", cs)?.nombre, "Casa Oliva", "el más largo");
    assert.equal(clienteEnTexto("Contenido mensual", cs), undefined);
    assert.equal(clienteEnTexto("Marketing interno Inoo", cs), undefined, "Inoo no es un cliente");
    assert.deepEqual(carpetaDeDrive("https://drive.google.com/open?id=1AbCdEfGhIjK"), { url: "https://drive.google.com/drive/folders/1AbCdEfGhIjK", id: "1AbCdEfGhIjK" });
    assert.ok("error" in carpetaDeDrive("https://drive.google.com/file/d/1AbCdEfGhIjK/view"), "un archivo no es una carpeta");
  });
});

describe("Columnas · reglas", () => {
  test("la biblioteca tiene los tipos de Monday", () => {
    assert.equal(TIPOS_COLUMNA.length, 34);
  });
  test("fórmulas sin eval", () => {
    const v = (e: string, cols: Record<string, unknown> = {}) => evaluarFormula(e, (n) => { if (!(n in cols)) throw new Error(`No hay una columna «${n}»`); return cols[n]; }, "2026-11-11").valor;
    assert.equal(v("ROUND(10 / 3, 2)"), 3.33);
    assert.equal(v('IF({A} > 5, "alto", "bajo")', { A: 7 }), "alto");
    assert.equal(v('CONCATENATE(UPPER("inoo"), " ", {N})', { N: 3 }), "INOO 3");
    assert.equal(v("DAYS({Fin}, TODAY())", { Fin: "2026-11-21" }), 10);
    assert.equal(v("WORKDAYS(\"2026-11-09\", \"2026-11-13\")"), 5);
    assert.equal(v("ADD_DAYS(\"2026-11-30\", 2)"), "2026-12-02");
    assert.equal(evaluarFormula("1/0", () => 0).error, "División entre cero");
    assert.match(evaluarFormula("{Nada}", (n) => { throw new Error(`No hay una columna «${n}»`); }).error!, /Nada/);
    assert.ok(analizarFormula("process.exit()").error, "nada de código");
    assert.ok(analizarFormula("constructor(1)").error);
  });
  test("valores por tipo", () => {
    const ctx = { personas: [], items: [] };
    assert.deepEqual(valorDeColumna({ tipo: "email" }, "Hola@Inoo.PE ", ctx), { texto: "hola@inoo.pe" });
    assert.deepEqual(valorDeColumna({ tipo: "week" }, "2026-W46", ctx), { texto: "2026-W46" });
    assert.deepEqual(valorDeColumna({ tipo: "hour" }, "25:00", ctx), { error: "Usa HH:MM" });
    assert.deepEqual(valorDeColumna({ tipo: "doc" }, "# Acta\nTexto", ctx), { texto: "📄 Acta", dato: { texto: "# Acta\nTexto" } });
    assert.deepEqual(valorDeColumna({ tipo: "tags" }, "seo, web, seo", ctx), { texto: "seo, web", dato: ["seo", "web"] });
    assert.ok("error" in valorDeColumna({ tipo: "formula" }, "1", ctx), "las calculadas no se escriben");
  });
});
