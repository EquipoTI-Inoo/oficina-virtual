/**
 * Crea una llave de integración (n8n, InooWork) y su usuario SERVICIO. Imprime la llave una sola
 * vez: en la base queda solo el sha256. Requiere DATABASE_URL (dueño del esquema).
 *   npm run api-key -- n8n-produccion piezas:write,ejecuciones:write,calendarios:write,tickets:sync,requerimientos:write
 */
import { createHash, randomBytes } from "node:crypto";
import { baseDatos } from "../src/servidor/db";

const [nombre, scopes] = process.argv.slice(2);
if (!nombre || !scopes) {
  console.error("Uso: npm run api-key -- <nombre> <scope,scope,...>");
  process.exit(1);
}

// 8 primeros caracteres = prefijo único (48 bits), el resto es el secreto.
const llave = randomBytes(30).toString("base64url");
const db = await baseDatos();
await db.transaccion(async (c) => {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO usuario (email, nombre, tipo) VALUES ($1, $2, 'SERVICIO')
     ON CONFLICT (email) DO UPDATE SET activo = true RETURNING id`,
    [`${nombre}@sistema.inoo.pe`, nombre],
  );
  await c.query("INSERT INTO api_key (nombre, prefijo, hash, scopes, usuario_id) VALUES ($1, $2, $3, $4, $5)", [
    nombre,
    llave.slice(0, 8),
    createHash("sha256").update(llave).digest("hex"),
    scopes.split(",").map((s) => s.trim()).filter(Boolean),
    rows[0].id,
  ]);
});
console.log(`Llave creada para ${nombre}. Guárdala ahora; no se vuelve a mostrar:\n${llave}`);
process.exit(0);
