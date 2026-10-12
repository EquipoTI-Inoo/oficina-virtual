/**
 * Requerimientos de la agencia al cliente (reunión del 12 oct 2026), escritos una vez y ejecutados
 * contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts). `hoy` es la fecha de cada
 * implementación (la simulada vive el 6 de octubre; Postgres, en la fecha real), porque los días de
 * atraso dependen de ella.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diasNoLaborables, FERIADOS_PERU_2026 } from "../../src/dominio/calendario";
import { correrFecha as correrSinFeriados, diasAtraso as atrasoSinFeriados, fechaLimite as limiteSinFeriados } from "../../src/dominio/requerimientos";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, MARTIN_LECTOR, NATIVA, VALERIA, type Manejador } from "./flujo-piezas";

const N8N = { "x-api-key": "demo-n8n" };
const USUARIOS_CRM = uid(19, 1);
const CATALOGO = uid(19, 2);
const CRM = uid(4, 3);
// Los feriados (8 de octubre: Combate de Angamos) no cuentan como días hábiles.
const FERIADOS = diasNoLaborables(FERIADOS_PERU_2026.map((f) => ({ tipo: "FERIADO", fechaInicio: f.fecha, fechaFin: f.fecha })));
const diasAtraso = (limite: string, hasta: string) => atrasoSinFeriados(limite, hasta, FERIADOS);
const fechaLimite = (desde: string, dias: number) => limiteSinFeriados(desde, dias, FERIADOS);
const correrFecha = (fecha: string, n: number) => correrSinFeriados(fecha, n, FERIADOS);

export function pruebasRequerimientos(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: () => Promise<{ tipo: string; datos: any }[]>, hoy: string) {
  const llamar = crearLlamar(manejar);

  describe(`requerimientos de la agencia · ${nombre}`, () => {
    test("el cliente ve primero lo pendiente por fecha límite, con sus días de atraso", async () => {
      await reiniciar();
      const r = (await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos`, VALERIA)).json;
      assert.deepEqual(r.datos.map((x: any) => [x.titulo, x.estado]), [
        ["Usuarios del CRM", "PENDIENTE"],
        ["Catálogo de productos para la tienda", "PENDIENTE"],
        ["Brief de contenido de noviembre", "PENDIENTE"],
        ["Brief de la tienda online", "APROBADO"],
        ["Acceso a casaoliva.pe", "APROBADO"],
      ]);
      const crm = r.datos[0];
      assert.equal(crm.servicioTitulo, "Implementación de CRM - Casa Oliva");
      assert.equal(crm.fechaLimite, "2026-10-05", "emitido el jueves 1 con 2 días hábiles: lunes 5");
      assert.equal(crm.diasAtraso, diasAtraso("2026-10-05", hoy));
      assert.deepEqual(crm.campos.map((c: any) => c.clave), ["usuarios", "administrador"]);
      assert.deepEqual(crm.respuestas, { administrador: "Valeria Mendoza" }, "borrador guardado");
      assert.equal(r.pendientes, 3);
      assert.deepEqual(r.datos.slice(1, 3).map((x: any) => x.fechaLimite), ["2026-10-09", "2026-10-14"], "el feriado del 8 no cuenta");
      assert.equal(r.atrasados, ["2026-10-05", "2026-10-09", "2026-10-14"].filter((f) => diasAtraso(f, hoy) > 0).length);
      const soloWeb = (await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos?servicioContratadoId=${uid(4, 4)}`, VALERIA)).json.datos;
      assert.deepEqual(soloWeb.map((x: any) => x.plantillaCodigo), ["CATALOGO_PRODUCTOS", "BRIEF_WEB"]);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/requerimientos`, VALERIA)).status, 404);
      assert.equal((await llamar("GET", `/requerimientos/${USUARIOS_CRM}`, VALERIA)).json.titulo, "Usuarios del CRM");
    });

    test("plantillas: solo el equipo", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", "/plantillas-requerimiento", VALERIA)).status, 403);
      const xs = (await llamar("GET", "/plantillas-requerimiento", DIEGO)).json.datos;
      const web = xs.find((x: any) => x.codigo === "BRIEF_WEB");
      assert.equal(web.diasHabiles, 3);
      assert.ok(web.campos.some((c: any) => c.tipo === "OPCION" && c.opciones.length === 3));
    });

    test("el equipo pide un requerimiento desde una plantilla con su plazo", async () => {
      await reiniciar();
      const cuerpo = { plantillaCodigo: "ACCESOS_REDES", servicioContratadoId: uid(4, 2), diasHabiles: 2, mensaje: "Para publicar desde la cuenta de la marca." };
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/requerimientos`, VALERIA, cuerpo)).status, 403, "el cliente no se pide cosas");
      const malo = await llamar("POST", `/clientes/${CASA_OLIVA}/requerimientos`, DIEGO, { plantillaCodigo: "NADA", servicioContratadoId: uid(4, 999), diasHabiles: 99 });
      assert.deepEqual(malo.json.errores.map((e: any) => e.campo).sort(), ["diasHabiles", "plantillaCodigo", "servicioContratadoId"]);
      const ok = await llamar("POST", `/clientes/${CASA_OLIVA}/requerimientos`, DIEGO, cuerpo);
      assert.equal(ok.status, 201);
      assert.deepEqual([ok.json.titulo, ok.json.estado, ok.json.fechaLimite, ok.json.diasAtraso], ["Accesos a redes sociales", "PENDIENTE", fechaLimite(hoy, 2), 0]);
      assert.equal(ok.json.servicioTitulo, "Social Media Pro - Casa Oliva");
      assert.ok((await eventos()).some((e) => e.tipo === "requerimiento.creado" && e.datos.requerimientoId === ok.json.id));
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos`, VALERIA)).json.pendientes, 4);
    });

    test("el cliente guarda un borrador y lo envía con los obligatorios completos", async () => {
      await reiniciar();
      const ruta = `/requerimientos/${USUARIOS_CRM}/respuesta`;
      assert.equal((await llamar("PUT", ruta, MARTIN_LECTOR, { respuestas: {} })).status, 403);
      assert.equal((await llamar("PUT", ruta, DIEGO, { respuestas: {} })).status, 403, "el equipo no responde por el cliente");
      const borrador = await llamar("PUT", ruta, VALERIA, { respuestas: { usuarios: "Valeria Mendoza, valeria@casaoliva.pe, gerente" } });
      assert.deepEqual([borrador.status, borrador.json.estado], [200, "PENDIENTE"]);
      const incompleto = await llamar("PUT", ruta, VALERIA, { respuestas: { usuarios: "x" }, enviar: true });
      assert.deepEqual(incompleto.json.errores.map((e: any) => e.campo), ["administrador"]);
      assert.equal((await llamar("PUT", ruta, VALERIA, { respuestas: { otro: "x" } })).status, 422, "campos que no son del formulario");
      const enviado = await llamar("PUT", ruta, VALERIA, { respuestas: { usuarios: "Valeria Mendoza, valeria@casaoliva.pe", administrador: "Valeria" }, enviar: true });
      assert.deepEqual([enviado.json.estado, enviado.json.enviadoPor.nombre], ["ENVIADO", "Valeria Mendoza"]);
      assert.ok((await eventos()).some((e) => e.tipo === "requerimiento.enviado" && e.datos.requerimientoId === USUARIOS_CRM));
      assert.equal((await llamar("PUT", ruta, VALERIA, { respuestas: {} })).json.codigo, "REQUERIMIENTO_ENVIADO");
      const url = await llamar("PUT", `/requerimientos/${uid(19, 3)}/respuesta`, VALERIA, { respuestas: { material: "no" } });
      assert.equal(url.status, 422);
    });

    test("atraso: la tarea diaria corre las etapas pendientes del servicio una sola vez", async () => {
      await reiniciar();
      const antes = (await llamar("GET", `/servicios-contratados/${CRM}/avance`, DIEGO)).json.etapas;
      assert.equal((await llamar("POST", "/integraciones/requerimientos/atrasos", DIEGO, {})).status, 403);
      const r = await llamar("POST", "/integraciones/requerimientos/atrasos", undefined, {}, N8N);
      const atraso = diasAtraso("2026-10-05", hoy);
      assert.ok(r.json.corridos >= 1);
      const despues = (await llamar("GET", `/servicios-contratados/${CRM}/avance`, DIEGO)).json.etapas;
      assert.equal(despues[0].fechaEstimada, antes[0].fechaEstimada, "la etapa completa no se mueve");
      assert.deepEqual(despues.slice(1).map((e: any) => e.fechaEstimada), antes.slice(1).map((e: any) => correrFecha(e.fechaEstimada, atraso)));
      assert.equal((await llamar("GET", `/requerimientos/${USUARIOS_CRM}`, VALERIA)).json.diasCorridos, atraso);
      assert.ok((await eventos()).some((e) => e.tipo === "requerimiento.atrasado" && e.datos.requerimientoId === USUARIOS_CRM));
      assert.equal((await llamar("POST", "/integraciones/requerimientos/atrasos", undefined, {}, N8N)).json.corridos, 0, "idempotente");
      // Enviarlo después no vuelve a correr lo ya corrido.
      await llamar("PUT", `/requerimientos/${USUARIOS_CRM}/respuesta`, VALERIA, { respuestas: { usuarios: "Valeria", administrador: "Valeria" }, enviar: true });
      const final = (await llamar("GET", `/servicios-contratados/${CRM}/avance`, DIEGO)).json.etapas;
      assert.deepEqual(final.map((e: any) => e.fechaEstimada), despues.map((e: any) => e.fechaEstimada));
    });

    test("el equipo observa lo enviado con una nota y luego lo aprueba", async () => {
      await reiniciar();
      const revision = `/requerimientos/${CATALOGO}/revision`;
      assert.equal((await llamar("POST", revision, DIEGO, { decision: "APROBADO" })).json.codigo, "REQUERIMIENTO_SIN_ENVIAR");
      await llamar("PUT", `/requerimientos/${CATALOGO}/respuesta`, VALERIA, { respuestas: { lista: "Sérum de noche, S/ 89" }, enviar: true });
      assert.equal((await llamar("POST", revision, VALERIA, { decision: "APROBADO" })).status, 403);
      assert.equal((await llamar("POST", revision, DIEGO, { decision: "OBSERVADO" })).json.codigo, "COMENTARIO_REQUERIDO");
      const obs = await llamar("POST", revision, DIEGO, { decision: "OBSERVADO", nota: "Faltan los precios de la línea corporal." });
      assert.deepEqual([obs.json.estado, obs.json.notaEquipo], ["OBSERVADO", "Faltan los precios de la línea corporal."]);
      assert.ok((await eventos()).some((e) => e.tipo === "requerimiento.revisado" && e.datos.decision === "OBSERVADO"));
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/requerimientos`, VALERIA)).json.pendientes, 3, "observado vuelve a ser pendiente");
      await llamar("PUT", `/requerimientos/${CATALOGO}/respuesta`, VALERIA, { respuestas: { lista: "Sérum de noche, S/ 89\nCrema corporal, S/ 59" }, enviar: true });
      assert.equal((await llamar("POST", revision, DIEGO, { decision: "APROBADO" })).json.estado, "APROBADO");
      assert.equal((await llamar("GET", `/requerimientos/${CATALOGO}`, VALERIA)).json.notaEquipo, null);
    });
  });
}
