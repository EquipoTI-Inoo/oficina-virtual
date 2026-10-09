/** El flujo central de piezas contra la API simulada (la misma suite corre contra Postgres en db.test.ts). */
import { manejarSolicitud, reiniciarMock } from "../../src/mock/api";
import { pruebasFlujoPiezas } from "./flujo-piezas";

pruebasFlujoPiezas("API simulada", (req) => manejarSolicitud(req), reiniciarMock);
