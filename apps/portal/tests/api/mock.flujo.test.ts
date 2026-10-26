/** Suites compartidas contra la API simulada (las mismas corren contra Postgres en db.test.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { manejarSolicitud, reiniciarMock } from "../../src/mock/api";
import { crearLlamar, DIEGO, pruebasFlujoPiezas } from "./flujo-piezas";
import { pruebasPlanificacion } from "./flujo-planificacion";
import { pruebasServicios } from "./flujo-servicios";
import { pruebasCuentas } from "./flujo-cuentas";
import { pruebasPanel } from "./flujo-panel";
import { pruebasArchivos } from "./flujo-archivos";
import { pruebasRequerimientos } from "./flujo-requerimientos";
import { pruebasEquipo } from "./flujo-equipo";
import { pruebasProyectos } from "./flujo-proyectos";
import { pruebasSinIa } from "./flujo-sin-ia";
import { pruebasEntregables } from "./flujo-entregables";
import { pruebasEstructura } from "./flujo-estructura";
import { pruebasKpis } from "./flujo-kpis";
import { pruebasConsumo } from "./flujo-consumo";
import { pruebasIaCliente } from "./flujo-ia-cliente";
import { pruebasTallerWeb } from "./flujo-taller-web";
import { HOY } from "../../src/mock/datos";

const manejar = (req: Request) => manejarSolicitud(req);
const eventos = async () => (await (await manejar(new Request("http://local/api/v1/__pruebas/eventos"))).json()).datos;

pruebasFlujoPiezas("API simulada", manejar, reiniciarMock);
pruebasPlanificacion("API simulada", manejar, reiniciarMock, eventos);
pruebasServicios("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasCuentas("API simulada", manejar, reiniciarMock, eventos);
pruebasPanel("API simulada", manejar, reiniciarMock);
pruebasArchivos("API simulada", manejar, reiniciarMock, async (url) => {
  await manejar(new Request(`http://local${url}`, { method: "PUT", body: "x" }));
});
pruebasRequerimientos("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasProyectos("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasSinIa("API simulada", manejar, reiniciarMock);
pruebasEntregables("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasEstructura("API simulada", manejar, reiniciarMock);
pruebasKpis("API simulada", manejar, reiniciarMock);
pruebasConsumo("API simulada", manejar, reiniciarMock);
pruebasIaCliente("API simulada", manejar, reiniciarMock);
pruebasTallerWeb("API simulada", manejar, reiniciarMock);
pruebasEquipo("API simulada", manejar, reiniciarMock, eventos);
