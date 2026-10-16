/** Suites compartidas contra la API simulada (las mismas corren contra Postgres en db.test.ts). */
import { manejarSolicitud, reiniciarMock } from "../../src/mock/api";
import { pruebasFlujoPiezas } from "./flujo-piezas";
import { pruebasPlanificacion } from "./flujo-planificacion";
import { pruebasServicios } from "./flujo-servicios";
import { pruebasCuentas } from "./flujo-cuentas";
import { pruebasPanel } from "./flujo-panel";
import { pruebasArchivos } from "./flujo-archivos";
import { pruebasRequerimientos } from "./flujo-requerimientos";
import { pruebasEquipo } from "./flujo-equipo";
import { pruebasProyectos } from "./flujo-proyectos";
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
pruebasEquipo("API simulada", manejar, reiniciarMock, eventos);
