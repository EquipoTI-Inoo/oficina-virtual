/** Suites compartidas contra la API simulada (las mismas corren contra Postgres en db.test.ts). */
import { manejarSolicitud, reiniciarMock } from "../../src/mock/api";
import { pruebasFlujoPiezas } from "./flujo-piezas";
import { pruebasPlanificacion } from "./flujo-planificacion";
import { pruebasServicios } from "./flujo-servicios";
import { pruebasRequerimientos } from "./flujo-requerimientos";
import { pruebasProyectos } from "./flujo-proyectos";
import { pruebasSinIa } from "./flujo-sin-ia";
import { HOY } from "../../src/mock/datos";

const manejar = (req: Request) => manejarSolicitud(req);
const eventos = async () => (await (await manejar(new Request("http://local/api/v1/__pruebas/eventos"))).json()).datos;

pruebasFlujoPiezas("API simulada", manejar, reiniciarMock);
pruebasPlanificacion("API simulada", manejar, reiniciarMock, eventos);
pruebasServicios("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasRequerimientos("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasProyectos("API simulada", manejar, reiniciarMock, eventos, HOY.slice(0, 10));
pruebasSinIa("API simulada", manejar, reiniciarMock);
