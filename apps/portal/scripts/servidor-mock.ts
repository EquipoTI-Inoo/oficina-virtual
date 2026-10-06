/**
 * Servidor HTTP solo con la API simulada (sin Next.js), útil para Postman, n8n o pruebas manuales.
 *   npm run mock            → http://localhost:4000/api/v1
 *   PUERTO=4001 npm run mock
 */
import { createServer } from "node:http";
import { manejarSolicitud, RUTAS_IMPLEMENTADAS } from "../src/mock/api";

const puerto = Number(process.env.PUERTO ?? 4000);
createServer(async (req, res) => {
  const trozos: Buffer[] = [];
  for await (const t of req) trozos.push(t as Buffer);
  const cuerpo = trozos.length ? Buffer.concat(trozos) : undefined;
  const r = await manejarSolicitud(
    new Request(`http://localhost:${puerto}${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : cuerpo }),
    "/api/v1",
    Number(process.env.MOCK_LATENCIA_MS ?? 0),
  );
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(puerto, () => {
  console.log(`API simulada en http://localhost:${puerto}/api/v1 (${RUTAS_IMPLEMENTADAS.length} rutas)`);
});
