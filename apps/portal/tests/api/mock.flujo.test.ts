/** Suites compartidas contra la API simulada (las mismas corren contra Postgres en db.test.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { manejarSolicitud, reiniciarMock } from "../../src/mock/api";
import { crearLlamar, DIEGO, pruebasFlujoPiezas } from "./flujo-piezas";
import { pruebasPlanificacion } from "./flujo-planificacion";
import { pruebasServicios } from "./flujo-servicios";
import { pruebasRequerimientos } from "./flujo-requerimientos";
import { pruebasProyectos } from "./flujo-proyectos";
import { pruebasSinIa } from "./flujo-sin-ia";
import { pruebasEntregables } from "./flujo-entregables";
import { pruebasEstructura } from "./flujo-estructura";
import { pruebasKpis } from "./flujo-kpis";
import { pruebasConsumo } from "./flujo-consumo";
import { pruebasIaCliente } from "./flujo-ia-cliente";
import { HOY } from "../../src/mock/datos";

const manejar = (req: Request) => manejarSolicitud(req);
const eventos = async () => (await (await manejar(new Request("http://local/api/v1/__pruebas/eventos"))).json()).datos;

pruebasFlujoPiezas("API simulada", manejar, reiniciarMock);
pruebasPlanificacion("API simulada", manejar, reiniciarMock, eventos);
pruebasServicios("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasRequerimientos("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasProyectos("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasSinIa("API simulada", manejar, reiniciarMock);
pruebasEntregables("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasEstructura("API simulada", manejar, reiniciarMock);
pruebasKpis("API simulada", manejar, reiniciarMock);
pruebasConsumo("API simulada", manejar, reiniciarMock);
pruebasIaCliente("API simulada", manejar, reiniciarMock);

// El panel general (todavía solo en la API simulada) mira proyectos y requerimientos, no piezas (reunión 15 oct).
test("panel general: proyectos con retraso y requerimientos atrasados", async () => {
  reiniciarMock();
  const r = (await crearLlamar(manejar)("GET", "/panel/clientes", DIEGO)).json.resumen;
  assert.equal(r.proyectosConRetraso, 1, "la web de Casa Oliva pasó la fecha de su arquitectura");
  assert.deepEqual(r.retrasoPorCliente, [{ clienteNombre: "Casa Oliva", proyectos: 1 }]);
  assert.ok(r.requerimientosAtrasados >= 1);
});
