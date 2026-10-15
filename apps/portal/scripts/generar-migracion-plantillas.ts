/**
 * Genera el bloque de plantillas de database/migraciones/0017_estructura_servicios.sql desde
 * src/dominio/servicios.ts (etapas, reunión clave y requerimientos) para que no se desincronicen.
 * Uso: npx tsx scripts/generar-migracion-plantillas.ts > bloque.sql
 */
import { PLANTILLAS } from "../src/dominio/servicios";

const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const arr = (xs: string[]) => `ARRAY[${xs.map(q).join(",")}]::text[]`;

const filas = PLANTILLAS.map(
  (p) => `    (${q(p.servicio)}, ${q(p.variante)}, ${q(p.nombre)}, ${arr(p.metricas)}, ${arr(p.requerimientos)},\n     ${q(JSON.stringify(p.etapas))})`,
);
console.log(filas.join(",\n"));
