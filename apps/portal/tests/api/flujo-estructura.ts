/**
 * Estructura real de cada servicio (instructivos de proceso y reunión del 15 oct 2026): reunión clave
 * por etapa, requerimientos que se piden al crear el proyecto, tamaño, proyecto personalizado,
 * responsable y detalle del proyecto, y pendientes que salen de una reunión. Corre contra la API
 * simulada y Postgres.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diasNoLaborables, FERIADOS_PERU_2026 } from "../../src/dominio/calendario";
import { etapasDesdePlantilla, plantillaPara } from "../../src/dominio/servicios";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const ADMIN = `demo.${uid(1, 4)}`;
const WEB = uid(4, 4);
const FERIADOS = diasNoLaborables(FERIADOS_PERU_2026.map((f) => ({ tipo: "FERIADO", fechaInicio: f.fecha, fechaFin: f.fecha })));

export function pruebasEstructura(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);
  const contratar = (cuerpo: Record<string, unknown>) => llamar("POST", `/clientes/${CASA_OLIVA}/servicios`, ADMIN, cuerpo);

  describe(`estructura de cada servicio · ${nombre}`, () => {
    test("plantillas con reunión clave por etapa, requerimientos y reuniones óptimas", async () => {
      await reiniciar();
      const pl = (await llamar("GET", "/plantillas?servicio=WEB", DIEGO)).json.datos.find((p: any) => p.variante === "ECOMMERCE");
      assert.deepEqual(pl.etapas.map((e: any) => e.nombre).slice(0, 4), ["Brief y kickoff", "Arquitectura y benchmark", "Accesos y hosting", "Prototipo"]);
      assert.equal(pl.etapas.length, 8);
      assert.equal(pl.etapas[1].reunionClave, "Aprobación del flujograma");
      assert.deepEqual([pl.requerimientos, pl.reunionesOptimas], [["BRIEF_WEB", "ACCESOS_WEB", "MANUAL_MARCA", "CATALOGO_PRODUCTOS"], 4]);
      const crm = (await llamar("GET", "/plantillas?servicio=CRM_IMPLEMENTACION", DIEGO)).json.datos[0];
      assert.deepEqual(crm.etapas.map((e: any) => e.reunionClave), ["Reunión de levantamiento", "Aprobación de la arquitectura", "Implementación beta", "Capacitación"]);
    });

    test("perfil: la reunión clave de cada etapa, el responsable, el alcance y el detalle del proyecto", async () => {
      await reiniciar();
      const p = (await llamar("GET", `/servicios-contratados/${WEB}`, VALERIA)).json;
      assert.deepEqual([p.etapas[0].reunionClave, p.etapas[2].reunionClave], ["Reunión de brief", null]);
      assert.deepEqual([p.responsable.nombre, p.detalle.cms, p.detalle.productos, p.detalle.tamano], ["Diego Castro", "SHOPIFY", 50, "MEDIANO"]);
      assert.match(p.alcance, /15 páginas/);
    });

    test("contratar: el tamaño escala los días, hay responsable y se piden los requerimientos de la plantilla", async () => {
      await reiniciar();
      const malo = await contratar({ servicioCodigo: "WEB", variante: "LANDING", fechaInicio: "2026-10-19", responsableId: uid(1, 1), detalle: { tamano: "XL", cms: "WIX", paginas: -1 } });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo).sort(), ["detalle.cms", "detalle.paginas", "detalle.tamano", "responsableId"]);
      const ok = await contratar({ servicioCodigo: "WEB", variante: "LANDING", fechaInicio: "2026-10-19", responsableId: uid(1, 4), alcance: "Landing con formulario", detalle: { tamano: "GRANDE", paginas: 1, cms: "WORDPRESS", alcanceWeb: "SOLO_WEB" } });
      assert.equal(ok.status, 201);
      const id = ok.json.servicioContratadoId;
      const perfil = (await llamar("GET", `/servicios-contratados/${id}`, VALERIA)).json;
      const esperadas = etapasDesdePlantilla(plantillaPara("WEB", "LANDING")!, "2026-10-19", FERIADOS, "GRANDE");
      assert.deepEqual(perfil.etapas.map((e: any) => [e.nombre, e.fechaEstimada, e.reunionClave]), esperadas.map((e) => [e.nombre, e.fechaEstimada, e.reunionClave]));
      assert.deepEqual([perfil.responsable.nombre, perfil.alcance], ["Admin Inoo", "Landing con formulario"]);
      const reqs = (await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos?servicioContratadoId=${id}`, VALERIA)).json.datos;
      assert.deepEqual(reqs.map((r: any) => r.plantillaCodigo).sort(), ["ACCESOS_WEB", "BRIEF_WEB", "MANUAL_MARCA"], "todo lo que necesitamos, al inicio");
    });

    test("proyecto personalizado: sus propias etapas, con el % que termina en 100", async () => {
      await reiniciar();
      const malo = await contratar({ servicioCodigo: "AUDIOVISUAL", variante: "COBERTURA_COMPLETA", fechaInicio: "2026-10-19", etapas: [{ nombre: "Uno", avancePct: 50, diasHabiles: 2 }] });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo), ["etapas"]);
      const ok = await contratar({
        servicioCodigo: "AUDIOVISUAL", variante: "COBERTURA_COMPLETA", fechaInicio: "2026-10-19",
        etapas: [{ nombre: "Guion del video institucional", avancePct: 40, diasHabiles: 2, esperaCliente: true, reunionClave: "Reunión de guion" }, { nombre: "Rodaje y entrega", avancePct: 100, diasHabiles: 3 }],
      });
      assert.equal(ok.status, 201);
      const a = (await llamar("GET", `/servicios-contratados/${ok.json.servicioContratadoId}/avance`, VALERIA)).json;
      assert.deepEqual(a.etapas.map((e: any) => [e.nombre, e.fechaInicio, e.fechaEstimada, e.reunionClave]), [
        ["Guion del video institucional", "2026-10-19", "2026-10-20", "Reunión de guion"],
        ["Rodaje y entrega", "2026-10-21", "2026-10-23", null],
      ]);
      const reqs = (await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos?servicioContratadoId=${ok.json.servicioContratadoId}`, VALERIA)).json.datos;
      assert.equal(reqs.length, 0, "audiovisual no pide requerimientos al inicio");
    });

    test("reunión realizada: resumen obligatorio; los pendientes se vuelven requerimientos y tareas", async () => {
      await reiniciar();
      const ruta = `/servicios-contratados/${WEB}/reuniones`;
      const sinResumen = await llamar("POST", ruta, DIEGO, { titulo: "Aprobación del flujograma", fecha: "2026-10-06T15:00:00Z", estado: "REALIZADA", conAcuerdos: true });
      assert.deepEqual(sinResumen.json.errores.map((e: any) => e.campo), ["resumen"]);
      const prog = await llamar("POST", ruta, DIEGO, { titulo: "Aprobación del flujograma", fecha: "2026-10-06T15:00:00Z", pendientes: [{ texto: "Algo", de: "CLIENTE" }] });
      assert.deepEqual(prog.json.errores.map((e: any) => e.campo), ["pendientes"], "los pendientes van al cerrar la reunión");
      const r = (await llamar("POST", ruta, DIEGO, { titulo: "Aprobación del flujograma", fecha: "2026-10-06T15:00:00Z" })).json;
      const malResp = await llamar("PATCH", `/reuniones/${r.id}`, DIEGO, { estado: "REALIZADA", resumen: "Se aprobó el flujograma con dos cambios.", pendientes: [{ texto: "Revisar textos", de: "INOO", responsableId: uid(1, 1) }] });
      assert.deepEqual(malResp.json.errores.map((e: any) => e.campo), ["pendientes.0.responsableId"]);
      const hecha = await llamar("PATCH", `/reuniones/${r.id}`, DIEGO, {
        estado: "REALIZADA", conAcuerdos: true, resumen: "Se aprobó el flujograma con dos cambios en el menú.",
        pendientes: [{ texto: "Enviar las fotos de los 50 productos", de: "CLIENTE", diasHabiles: 3 }, { texto: "Ajustar el menú del flujograma", de: "INOO", responsableId: uid(1, 3) }],
      });
      assert.equal(hecha.status, 200);
      assert.deepEqual(hecha.json.pendientesCreados, { requerimientos: 1, tareas: 1 });
      const req = (await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos?servicioContratadoId=${WEB}`, VALERIA)).json.datos.find((x: any) => x.titulo === "Enviar las fotos de los 50 productos");
      assert.deepEqual([req.plantillaCodigo, req.estado, req.mensaje], ["PENDIENTE_REUNION", "PENDIENTE", "Quedó pendiente en la reunión «Aprobación del flujograma»."]);
      const tarea = (await llamar("GET", `/servicios-contratados/${WEB}/tareas`, DIEGO)).json.datos.find((t: any) => t.titulo === "Ajustar el menú del flujograma");
      assert.deepEqual([tarea.estado, tarea.responsable.nombre], ["PENDIENTE", "Diego Castro"]);
    });

    test("editar el proyecto: responsable, alcance y detalle validado", async () => {
      await reiniciar();
      const ruta = `/servicios-contratados/${WEB}`;
      assert.deepEqual((await llamar("PATCH", ruta, DIEGO, { detalle: { productos: -3 } })).json.errores.map((e: any) => e.campo), ["detalle.productos"]);
      const ok = await llamar("PATCH", ruta, DIEGO, { responsableId: uid(1, 4), alcance: "E-commerce con 80 productos", detalle: { tamano: "GRANDE", productos: 80, cms: "SHOPIFY", alcanceWeb: "WEB_Y_CMS" } });
      assert.deepEqual([ok.json.responsable.nombre, ok.json.alcance, ok.json.detalle.productos], ["Admin Inoo", "E-commerce con 80 productos", 80]);
      assert.equal((await llamar("PATCH", ruta, VALERIA, { alcance: "todo gratis" })).status, 403);
    });
  });
}
