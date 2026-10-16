/**
 * Plazo del cliente para revisar un entregable (reunión 15 oct): si no lo revisa a tiempo, la pieza
 * aparece como «Atrasado» con sus días hábiles de atraso. El plazo es de relleno hasta que el equipo
 * lo defina por servicio.
 */
import { diasAtraso } from "./requerimientos";
import { sumarDiasHabiles } from "./servicios";

/** Días hábiles que tiene el cliente para revisar una pieza desde que se la enviamos. */
export const DIAS_REVISION_CLIENTE = 3;

/** Fecha hasta la que el cliente puede revisar (23:59 de ese día). */
export const revisionVence = (enviadaEn: string, feriados?: ReadonlySet<string>) => sumarDiasHabiles(enviadaEn.slice(0, 10), DIAS_REVISION_CLIENTE, feriados);

/** Días hábiles de atraso en la revisión del cliente; 0 si todavía está a tiempo. */
export const diasAtrasoRevision = (enviadaEn: string, hoy: string, feriados?: ReadonlySet<string>) => diasAtraso(revisionVence(enviadaEn, feriados), hoy, feriados);
