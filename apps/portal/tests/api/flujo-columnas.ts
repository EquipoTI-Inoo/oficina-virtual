/**
 * Tipos de columna de los tableros (11 nov 2026), contra la API simulada y el backend real (InooWork simulado).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { analizarFormula, evaluarFormula, TIPOS_COLUMNA, valorDeColumna } from "../../src/dominio/columnas";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";
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
