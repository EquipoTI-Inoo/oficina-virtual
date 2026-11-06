/** Archivos en Google Drive contra un Drive falso en memoria: nada toca a Google. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { almacenDrive, atenderArchivoDrive, firmarUrlDrive, leerUrlDrive, MAX_BYTES_DRIVE } from "../../src/servidor/almacen-drive";
import { ErrorApi } from "../../src/servidor/errores";

const SECRETO = "s".repeat(40);

function driveFalso() {
  const archivos = new Map<string, { id: string; name: string; parents?: string[]; hash?: string; mime?: string; bytes: Uint8Array }>();
  const estado = { archivos, tokens: 0, carpetasCreadas: 0, llamadasConTokenMalo: 0 };
  let n = 0;
  const f = (async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(entrada));
    const metodo = init.method ?? "GET";
    if (url.host === "oauth2.googleapis.com") {
      estado.tokens++;
      return Response.json({ access_token: "acceso", expires_in: 3600 });
    }
    if (url.host === "sesion.falsa") {
      const destino = archivos.get(url.pathname.slice(1))!;
      destino.bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
      destino.mime = new Headers(init.headers).get("content-type") ?? undefined;
      return Response.json({ id: destino.id });
    }
    if (new Headers(init.headers).get("authorization") !== "Bearer acceso") estado.llamadasConTokenMalo++;
    if (url.pathname === "/upload/drive/v3/files" && metodo === "POST") {
      const m = JSON.parse(String(init.body));
      const id = `f${++n}`;
      archivos.set(id, { id, name: m.name, parents: m.parents, hash: m.appProperties.portal, bytes: new Uint8Array() });
      return new Response(null, { headers: { location: `https://sesion.falsa/${id}` } });
    }
    const subida = url.pathname.match(/^\/upload\/drive\/v3\/files\/(\w+)$/);
    if (subida && metodo === "PATCH") return new Response(null, { headers: { location: `https://sesion.falsa/${subida[1]}` } });
    if (url.pathname === "/drive/v3/files" && metodo === "GET") {
      const q = url.searchParams.get("q")!;
      if (q.includes("application/vnd.google-apps.folder")) {
        const c = [...archivos.values()].find((x) => x.name === "Portal Inoo");
        return Response.json({ files: c ? [{ id: c.id }] : [] });
      }
      const hash = q.match(/value='(\w+)'/)![1];
      const x = [...archivos.values()].find((y) => y.hash === hash);
      return Response.json({ files: x ? [{ id: x.id, size: String(x.bytes.length) }] : [] });
    }
    if (url.pathname === "/drive/v3/files" && metodo === "POST") {
      estado.carpetasCreadas++;
      const id = `c${++n}`;
      archivos.set(id, { id, name: "Portal Inoo", bytes: new Uint8Array() });
      return Response.json({ id });
    }
    const leer = url.pathname.match(/^\/drive\/v3\/files\/(\w+)$/);
    if (leer && metodo === "GET") {
      const x = archivos.get(leer[1]);
      return x ? new Response(x.bytes as BodyInit, { headers: { "content-type": x.mime ?? "application/octet-stream", "content-length": String(x.bytes.length) } }) : new Response(null, { status: 404 });
    }
    throw new Error(`Llamada inesperada a Drive: ${metodo} ${url}`);
  }) as typeof fetch;
  return { estado, f };
}

const crear = (f: typeof fetch) => almacenDrive({ clientId: "id", clientSecret: "sec", refreshToken: "ref", secreto: SECRETO, urlPortal: "https://portal.inoo.pe/" }, f);
const tokenDe = (url: string) => url.split("/").pop()!;

test("Drive: el navegador sube y descarga por URLs firmadas, y el archivo queda en la carpeta del portal", async () => {
  const { estado, f } = driveFalso();
  const a = crear(f);
  const clave = "clientes/abc/foto final.png";
  assert.equal(await a.tamano(clave), null, "todavía no existe");

  const s = a.urlSubida(clave, "image/png");
  assert.match(s.url, /^https:\/\/portal\.inoo\.pe\/api\/v1\/archivos-drive\//);
  assert.deepEqual(s.headers, { "Content-Type": "image/png" });
  const bytes = new TextEncoder().encode("contenido");
  const subida = await atenderArchivoDrive(new Request(s.url, { method: "PUT", body: bytes, headers: { "content-length": String(bytes.length) } }), tokenDe(s.url), a, SECRETO);
  assert.equal(subida.status, 200);
  assert.equal(await a.tamano(clave), bytes.length);
  assert.equal(estado.carpetasCreadas, 1);
  const guardado = [...estado.archivos.values()].find((x) => x.hash)!;
  assert.deepEqual([guardado.name, guardado.mime], ["clientes__abc__foto final.png", "image/png"]);
  assert.equal(guardado.parents?.length, 1);

  const d = a.urlDescarga(clave, "Foto final ñ.png");
  const bajada = await atenderArchivoDrive(new Request(d.url), tokenDe(d.url), a, SECRETO);
  assert.equal(await bajada.text(), "contenido");
  assert.equal(bajada.headers.get("content-disposition"), "attachment; filename*=UTF-8''Foto%20final%20%C3%B1.png");
  assert.equal(estado.llamadasConTokenMalo, 0);
  assert.equal(estado.tokens, 1, "el acceso se reutiliza");
});

test("Drive: el mismo archivo se reemplaza, y la carpeta no se duplica", async () => {
  const { estado, f } = driveFalso();
  const a = crear(f);
  await a.subir("x/uno.pdf", "application/pdf", new TextEncoder().encode("uno"));
  await a.subir("x/uno.pdf", "application/pdf", new TextEncoder().encode("uno-bis"));
  await a.subir("x/dos.pdf", "application/pdf", new TextEncoder().encode("dos"));
  assert.equal(new TextDecoder().decode((await a.leer("x/uno.pdf"))!), "uno-bis");
  assert.equal([...estado.archivos.values()].filter((x) => x.hash).length, 2);
  assert.equal(estado.carpetasCreadas, 1);
  assert.equal(await a.leer("x/no-existe.pdf"), null);
});

test("Drive: una URL no sirve si está alterada, vencida o para otra acción", async () => {
  const { f } = driveFalso();
  const a = crear(f);
  const rechaza = (req: Request, token: string, status: number) => assert.rejects(atenderArchivoDrive(req, token, a, SECRETO), (e: ErrorApi) => e.status === status);
  const bytes = { "content-length": "3" };

  const s = tokenDe(a.urlSubida("x/a.png", "image/png").url);
  const [datos] = s.split(".");
  const otra = Buffer.from(JSON.stringify({ o: "S", c: "otro/cliente.png", m: "image/png", e: Date.now() + 60000 })).toString("base64url");
  await rechaza(new Request("https://x/", { method: "PUT", body: "abc", headers: bytes }), `${otra}.${s.split(".")[1]}`, 403);
  await rechaza(new Request("https://x/", { method: "PUT", body: "abc", headers: bytes }), `${datos}.firmafalsa`, 403);
  const vencida = firmarUrlDrive(SECRETO, { o: "S", c: "x/a.png", m: "image/png", e: Date.now() - 1 });
  assert.equal(leerUrlDrive(SECRETO, vencida), null);
  await rechaza(new Request("https://x/", { method: "PUT", body: "abc", headers: bytes }), vencida, 403);
  assert.equal(leerUrlDrive("otro-secreto".repeat(4), s), null, "firmada con otro secreto");

  await rechaza(new Request("https://x/"), s, 405);
  const d = tokenDe(a.urlDescarga("x/a.png", "a.png").url);
  await rechaza(new Request("https://x/", { method: "PUT", body: "abc", headers: bytes }), d, 405);
  await rechaza(new Request("https://x/", { method: "PUT", body: "abc", headers: { "content-length": String(MAX_BYTES_DRIVE + 1) } }), s, 413);
  await rechaza(new Request("https://x/"), d, 404);
});
