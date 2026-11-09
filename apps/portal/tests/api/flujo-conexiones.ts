/**
 * Conexiones personales de Jarvis (9 nov): cada persona conecta su Google Drive con OAuth, sin llaves. Escrito una vez
 * y ejecutado contra la API simulada (mock.flujo.test.ts) y el backend real (db.test.ts), con un Google falso.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { uid } from "../../src/mock/datos";
import { olvidarAccesos, usarFetchConexiones } from "../../src/servidor/conexiones";
import { crearLlamar, DIEGO, VALERIA, type Manejador } from "./flujo-piezas";

const CAMILA = `demo.${uid(1, 6)}`;
const ARCHIVO = "demo-propuesta-casa-oliva";

/** Google falso: token, revocación y Drive. */
function googleFalso() {
  const llamadas: string[] = [];
  const idToken = `x.${Buffer.from(JSON.stringify({ email: "diego.castro@inoo.pe" })).toString("base64url")}.y`;
  const archivo = { id: ARCHIVO, name: "Propuesta Casa Oliva 2027", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-11-05T15:00:00Z", webViewLink: "https://docs.google.com/document/d/demo" };
  usarFetchConexiones(async (entrada, init) => {
    const url = String(entrada);
    llamadas.push(url);
    const cuerpo = String(init?.body ?? "");
    if (url.includes("oauth2.googleapis.com/token")) {
      if (cuerpo.includes("grant_type=authorization_code")) {
        assert.ok(cuerpo.includes("code_verifier="), "PKCE: manda el verificador");
        return Response.json({ refresh_token: "refresco-secreto", access_token: "acceso-1", expires_in: 3600, id_token: idToken });
      }
      return Response.json({ access_token: "acceso-2", expires_in: 3600 });
    }
    if (url.includes("oauth2.googleapis.com/revoke")) return new Response(null, { status: 200 });
    if (url.includes("/drive/v3/files?")) return Response.json({ files: [archivo] });
    if (url.includes(`/drive/v3/files/${ARCHIVO}/export`)) return new Response("Propuesta de campaña de verano para Casa Oliva.");
    if (url.includes(`/drive/v3/files/${ARCHIVO}?`)) return Response.json(archivo);
    return new Response("no", { status: 404 });
  });
  return llamadas;
}

export function pruebasConexiones(nombre: string, manejar: Manejador, reiniciar: () => Promise<void> | void) {
  const llamar = crearLlamar(manejar);

  describe(`Conexiones personales · ${nombre}`, () => {
    test("Google Drive: conectar (OAuth con PKCE), buscar y leer, y desconectar; cada persona ve solo lo suyo", async () => {
      await reiniciar();
      const antes = { ...process.env };
      Object.assign(process.env, { GOOGLE_OAUTH_CLIENT_ID: "cliente.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "secreto", SESION_SECRETO: "s".repeat(40), PORTAL_URL: "https://portal.prueba" });
      const llamadas = googleFalso();
      olvidarAccesos();
      try {
        assert.equal((await llamar("GET", "/me/conexiones", VALERIA)).status, 403, "un cliente no");
        const lista = (await llamar("GET", "/me/conexiones", DIEGO)).json.datos;
        assert.deepEqual(lista.map((c: any) => [c.proveedor, c.disponible, c.conectada]), [["google-drive", true, false]]);
        assert.equal((await llamar("GET", "/me/conexiones/google-drive/buscar?q=oliva", DIEGO)).json.codigo, "SIN_CONEXION");
        assert.equal((await llamar("POST", "/me/conexiones/dropbox", DIEGO, {})).status, 404);

        const inicio = await llamar("POST", "/me/conexiones/google-drive", DIEGO, {});
        assert.equal(inicio.status, 200);
        const estado = new URL(inicio.json.url, "https://portal.prueba").searchParams.get("state")!;
        assert.ok(estado);
        const vuelta = await llamar("GET", `/conexiones/google-drive/vuelta?code=codigo-de-google&state=${estado}`);
        assert.equal(vuelta.status, 302);
        assert.match(vuelta.headers.get("location") ?? "", /\/equipo\/mi-cuenta\?conexion=ok/);
        const repetida = await llamar("GET", `/conexiones/google-drive/vuelta?code=codigo-de-google&state=${estado}`);
        assert.match(repetida.headers.get("location") ?? "", /conexion=error/, "el state es de un solo uso");

        const conectada = (await llamar("GET", "/me/conexiones", DIEGO)).json.datos[0];
        assert.equal(conectada.conectada, true);
        assert.equal(typeof conectada.cuenta, "string");
        assert.equal((await llamar("GET", "/me/conexiones", CAMILA)).json.datos[0].conectada, false, "Camila no ve la de Diego");
        assert.equal((await llamar("GET", "/me/conexiones/google-drive/buscar", CAMILA)).json.codigo, "SIN_CONEXION");

        const encontrados = (await llamar("GET", "/me/conexiones/google-drive/buscar?q=oliva", DIEGO)).json.datos;
        assert.equal(encontrados[0].id, ARCHIVO);
        const leido = (await llamar("GET", `/me/conexiones/google-drive/archivos/${ARCHIVO}`, DIEGO)).json;
        assert.match(leido.texto, /Casa Oliva/);
        assert.equal(leido.truncado, false);
        assert.ok(!JSON.stringify(await llamar("GET", "/me/conexiones", DIEGO)).includes("refresco-secreto"), "el token nunca sale");

        assert.equal((await llamar("DELETE", "/me/conexiones/google-drive", DIEGO)).status, 204);
        assert.equal((await llamar("GET", "/me/conexiones", DIEGO)).json.datos[0].conectada, false);
        assert.equal((await llamar("DELETE", "/me/conexiones/google-drive", DIEGO)).status, 404);
        // En el backend real, conectar y desconectar pasan por Google (en la demo no hay Google).
        if (llamadas.length) assert.ok(llamadas.some((u) => u.includes("/revoke")), "al desconectar se revoca en Google");
      } finally {
        usarFetchConexiones(null);
        for (const k of ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "SESION_SECRETO", "PORTAL_URL"]) {
          if (antes[k] === undefined) delete process.env[k];
          else process.env[k] = antes[k];
        }
      }
    });
  });
}
