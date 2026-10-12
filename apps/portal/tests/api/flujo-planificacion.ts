/**
 * Brief del mes, referencias, plan del mes (kanban) y propuesta de calendario. Los requerimientos de la
 * agencia al cliente (reunión 12 oct) están en flujo-requerimientos.ts.
 * Suite compartida: corre contra la API simulada (mock.flujo.test.ts) y contra Postgres (db.test.ts).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { CASA_OLIVA, crearLlamar, DIEGO, NATIVA, VALERIA, type Manejador } from "./flujo-piezas";

const N8N = { "x-api-key": "demo-n8n" };
const CAMBIOS = uid(5, 17);
const BRIEF = `/clientes/${CASA_OLIVA}/briefs/2026-10`;

export type LeerEventos = () => Promise<{ tipo: string; datos: any }[]>;

export function pruebasPlanificacion(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void, eventos: LeerEventos) {
  const llamar = crearLlamar(manejar);
  const enviarBrief = () => llamar("POST", `${BRIEF}/enviar`, VALERIA, { declaraDerechos: true });

  describe(`brief · ${nombre}`, () => {
    test("el brief trae las referencias del mes; la ficha, las permanentes", async () => {
      await reiniciar();
      const b = await llamar("GET", BRIEF, VALERIA);
      assert.equal(b.status, 200);
      assert.equal(b.json.requerimientos, undefined, "los requerimientos ya no son parte del brief");
      assert.deepEqual(b.json.referencias.map((r: any) => r.titulo), ["Natura Perú · Competidor"]);
      const ficha = await llamar("GET", `/clientes/${CASA_OLIVA}/referencias`, VALERIA);
      assert.deepEqual(ficha.json.datos.map((r: any) => r.titulo), ["Luz cálida, texturas naturales"]);
    });

    test("referencias: el cliente las agrega al brief, no a la ficha permanente", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/referencias`, VALERIA, { titulo: "Logo nuevo", url: "https://x.pe" })).status, 403);
      assert.equal((await llamar("POST", `${BRIEF}/referencias`, VALERIA, { titulo: "Sin protocolo" , url: "ftp://x" })).status, 422);
      const r = await llamar("POST", `${BRIEF}/referencias`, VALERIA, { titulo: "Campaña de L'Occitane", url: "https://loccitane.com", tipo: "MARCA_ADMIRADA" });
      assert.equal(r.status, 201);
      assert.equal((await llamar("GET", BRIEF, VALERIA)).json.referencias.length, 2);
      assert.equal((await llamar("DELETE", `/clientes/${CASA_OLIVA}/referencias/${r.json.id}`, VALERIA)).status, 204);
      const permanente = (await llamar("GET", `/clientes/${CASA_OLIVA}/referencias`, DIEGO)).json.datos[0];
      assert.equal((await llamar("DELETE", `/clientes/${CASA_OLIVA}/referencias/${permanente.id}`, VALERIA)).status, 403);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/referencias`, DIEGO, { titulo: "Manual de marca 2026", tipo: "MANUAL_MARCA", notas: "Versión vigente" })).status, 201);
    });

    test("enviar y confirmar el brief: el AM confirma y se avisa al Jefe de Marketing", async () => {
      await reiniciar();
      assert.equal((await llamar("POST", `${BRIEF}/confirmar`, DIEGO)).json.codigo, "BRIEF_SIN_ENVIAR");
      assert.equal((await enviarBrief()).status, 200);
      assert.equal((await llamar("POST", `${BRIEF}/referencias`, VALERIA, { titulo: "Tarde", url: "https://x.pe" })).status, 409);
      assert.equal((await llamar("POST", `${BRIEF}/confirmar`, DIEGO)).json.estado, "CONFIRMADO");
      assert.ok((await eventos()).some((e) => e.tipo === "brief.confirmado"));
    });
  });

  describe(`plan del mes (kanban) · ${nombre}`, () => {
    test("columnas por estado: las de cambios pedidos van a producción como «ajustando»", async () => {
      await reiniciar();
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/tablero`, VALERIA)).status, 422);
      assert.equal((await llamar("GET", `/clientes/${NATIVA}/tablero?periodo=2026-10`, VALERIA)).status, 404);
      const t = (await llamar("GET", `/clientes/${CASA_OLIVA}/tablero?periodo=2026-10`, VALERIA)).json;
      assert.equal(t.planAprobado, true);
      assert.deepEqual(t.columnas.map((c: any) => c.clave), ["PLANIFICADO", "EN_PRODUCCION", "POR_REVISAR", "APROBADO", "PUBLICADO"]);
      const total = t.columnas.reduce((n: number, c: any) => n + c.piezas.length, 0);
      assert.equal(total, 20);
      const porRevisar = t.columnas.find((c: any) => c.clave === "POR_REVISAR").piezas;
      assert.equal(t.porRevisar, porRevisar.length);
      assert.ok(porRevisar.every((p: any) => p.estado === "LISTO_REVISION"));
      const ajustando = t.columnas.find((c: any) => c.clave === "EN_PRODUCCION").piezas.find((p: any) => p.id === CAMBIOS);
      assert.equal(ajustando?.ajustando, true);
      const filtrado = (await llamar("GET", `/clientes/${CASA_OLIVA}/tablero?periodo=2026-10&servicioContratadoId=${uid(4, 1)}`, VALERIA)).json;
      assert.ok(filtrado.columnas.every((c: any) => c.piezas.every((p: any) => p.servicioContratadoId === uid(4, 1))));
    });

    test("propuesta del agente: el cliente no ve el mes hasta que el AM aprueba", async () => {
      await reiniciar();
      const propuesta = {
        clienteId: CASA_OLIVA,
        periodo: "2026-11",
        resumen: "Noviembre: rituales de noche",
        entradas: [
          { tipo: "COPY", titulo: "Llega el sérum de noche", canal: "Instagram", fechaProgramada: "2026-11-05T15:00:00Z" },
          { tipo: "BLOG", titulo: "Rutina de noche en 3 pasos", fechaProgramada: "2026-11-12T15:00:00Z" },
        ],
      };
      assert.equal((await llamar("POST", "/integraciones/calendarios", undefined, propuesta, N8N)).status, 201);
      const oculto = (await llamar("GET", `/clientes/${CASA_OLIVA}/tablero?periodo=2026-11`, VALERIA)).json;
      assert.equal(oculto.planAprobado, false);
      assert.ok(oculto.columnas.every((c: any) => c.piezas.length === 0));
      assert.equal((await llamar("GET", `/clientes/${CASA_OLIVA}/tablero?periodo=2026-11`, DIEGO)).json.columnas[0].piezas.length, 2, "el equipo sí ve la propuesta");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-11/aprobar`, DIEGO, { version: 1 })).status, 200);
      const visible = (await llamar("GET", `/clientes/${CASA_OLIVA}/tablero?periodo=2026-11`, VALERIA)).json;
      assert.equal(visible.planAprobado, true);
      assert.deepEqual(visible.columnas[0].piezas.map((p: any) => p.titulo), ["Llega el sérum de noche", "Rutina de noche en 3 pasos"]);
      assert.ok(visible.columnas[0].piezas.every((p: any) => p.estado === "EN_PRODUCCION" && p.ajustando === false));
    });

    test("el AM pide cambios: el agente manda la versión 2 y reemplaza las piezas propuestas", async () => {
      await reiniciar();
      const base = { clienteId: CASA_OLIVA, periodo: "2026-12", entradas: [{ tipo: "COPY", titulo: "Navidad consciente", fechaProgramada: "2026-12-10T15:00:00Z" }] };
      assert.equal((await llamar("POST", "/integraciones/calendarios", undefined, base, N8N)).status, 201);
      assert.equal((await llamar("POST", "/integraciones/calendarios", undefined, base, N8N)).json.codigo, "PROPUESTA_PENDIENTE");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-12/solicitar-cambios`, DIEGO, { version: 1 })).json.codigo, "COMENTARIO_REQUERIDO");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-12/solicitar-cambios`, VALERIA, { version: 1, comentario: "x" })).status, 403);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-12/solicitar-cambios`, DIEGO, { version: 1, comentario: "Suma un blog" })).status, 200);
      const v2 = await llamar("POST", "/integraciones/calendarios", undefined, { ...base, entradas: [...base.entradas, { tipo: "BLOG", titulo: "Regalos que cuidan", fechaProgramada: "2026-12-15T15:00:00Z" }] }, N8N);
      assert.equal(v2.json.version, 2);
      assert.deepEqual(v2.json.entradas.map((e: any) => e.titulo), ["Navidad consciente", "Regalos que cuidan"]);
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-12/aprobar`, DIEGO, { version: 1 })).json.codigo, "VERSION_DESACTUALIZADA");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/calendario/2026-12/aprobar`, DIEGO, { version: 2 })).json.estado, "APROBADO_PLAN");
      assert.ok((await eventos()).some((e) => e.tipo === "calendario.aprobado" && e.datos.piezaIds.length === 2));
    });
  });

  describe(`ideas de blog · ${nombre}`, () => {
    test("el equipo cambia la idea elegida dentro del cupo y la pieza del artículo toma el nuevo título", async () => {
      await reiniciar();
      const ideas = (await llamar("GET", `/clientes/${CASA_OLIVA}/ideas-blog?periodo=2026-10`, VALERIA)).json;
      assert.deepEqual({ total: ideas.cupo.total, elegidas: ideas.cupo.elegidas }, { total: 1, elegidas: 1 });
      const [, segunda, tercera] = ideas.datos;
      const exceso = await llamar("POST", `/clientes/${CASA_OLIVA}/ideas-blog/seleccion`, DIEGO, { periodo: "2026-10", ideaIds: [segunda.id, tercera.id] });
      assert.equal(exceso.json.codigo, "CUPO_EXCEDIDO");
      assert.equal((await llamar("POST", `/clientes/${CASA_OLIVA}/ideas-blog/seleccion`, VALERIA, { periodo: "2026-10", ideaIds: [segunda.id] })).status, 403, "el cliente no elige blogs");
      const r = await llamar("POST", `/clientes/${CASA_OLIVA}/ideas-blog/seleccion`, DIEGO, { periodo: "2026-10", ideaIds: [segunda.id] });
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.datos.map((i: any) => i.estado), ["PROPUESTA", "ELEGIDA", "PROPUESTA"]);
      assert.equal((await llamar("GET", `/piezas/${uid(5, 19)}`, DIEGO)).json.titulo, segunda.titulo);
    });
  });
}
