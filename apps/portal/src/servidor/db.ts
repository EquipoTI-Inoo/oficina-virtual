/**
 * Acceso a Postgres para la API real (/api/v1 con API_MODO=db).
 *
 * Todo pasa por `transaccion()`: abre una transacción, ejecuta la función y confirma o revierte.
 * `comoUsuario()` fija dentro de la transacción el rol app_portal (sin BYPASSRLS) y las variables
 * que leen las políticas de RLS del esquema (app.usuario_tipo, app.cliente_ids). Así un error en
 * una consulta nunca expone datos de otro cliente.
 *
 * Funciona con `pg` (Pool, producción) y con PGlite (pruebas): ambos se adaptan a `BaseDatos`.
 */
import type { Pool } from "pg";

export interface Consultor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface BaseDatos {
  transaccion<T>(fn: (c: Consultor) => Promise<T>): Promise<T>;
}

export function desdePool(pool: Pool): BaseDatos {
  return {
    async transaccion(fn) {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        const r = await fn({ query: (sql, params) => cliente.query(sql, params as unknown[]) as never });
        await cliente.query("COMMIT");
        return r;
      } catch (e) {
        await cliente.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        cliente.release();
      }
    },
  };
}

/** Adaptador para PGlite (tipado estructural para no cargar PGlite en producción). */
export function desdePglite(db: { transaction<T>(fn: (tx: Consultor) => Promise<T>): Promise<T> }): BaseDatos {
  return { transaccion: (fn) => db.transaction((tx) => fn(tx)) };
}

export interface SesionDb {
  usuarioId: string;
  tipo: "EQUIPO" | "CLIENTE" | "SERVICIO";
  clienteIds: string[];
}

/** Activa el rol sin privilegios y las variables de RLS para el resto de la transacción. */
export async function comoUsuario(c: Consultor, s: SesionDb) {
  await c.query("SET LOCAL ROLE app_portal");
  await c.query("SELECT set_config('app.usuario_tipo', $1, true), set_config('app.cliente_ids', $2, true), set_config('app.usuario_id', $3, true)", [
    s.tipo,
    `{${s.clienteIds.join(",")}}`,
    s.usuarioId,
  ]);
}

let global: BaseDatos | null = null;

/** Base de datos del proceso: DATABASE_URL con un Pool de `pg` (se crea al primer uso). */
export async function baseDatos(): Promise<BaseDatos> {
  if (global) return global;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL para API_MODO=db");
  const { Pool } = await import("pg");
  global = desdePool(new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 10) }));
  return global;
}

/** Solo pruebas: inyecta otra base (PGlite). */
export function usarBaseDatos(db: BaseDatos | null) {
  global = db;
}
