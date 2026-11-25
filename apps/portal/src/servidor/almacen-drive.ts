/**
 * Archivos en Google Drive (6 nov 2026), con la misma interfaz que S3: sin AWS, en la cuenta asesoria@inoo.pe.
 *
 * Google no tiene URLs prefirmadas como S3, así que el navegador sube y descarga por el portal con una URL firmada
 * y de corta duración (/api/v1/archivos-drive/{token}), y el portal pasa los bytes a Drive sin guardarlos.
 * Con el permiso `drive.file`, la app solo ve los archivos que ella misma creó, no el resto de esa cuenta.
 * Cada archivo se busca por el hash de su clave, guardado en sus propiedades de Drive.
 *
 * Variables: DRIVE_CLIENT_ID, DRIVE_CLIENT_SECRET, DRIVE_REFRESH_TOKEN (integrations/google/conectar.mjs),
 * DRIVE_CARPETA_ID (opcional; si no, crea «Portal Inoo»), SESION_SECRETO (firma las URLs) y PORTAL_URL.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Almacen } from "./almacen";
import { ErrorApi } from "./errores";

export interface ConfigDrive {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  carpetaId?: string;
  secreto: string;
  urlPortal: string;
}

const API = "https://www.googleapis.com/drive/v3";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3";
const NOMBRE_CARPETA = "Portal Inoo";
/** Tope por archivo que pasa por el portal. */
export const MAX_BYTES_DRIVE = 250 * 1024 * 1024;

type Permiso = { o: "S"; c: string; m: string; e: number } | { o: "D"; c: string; n: string; e: number };

const firmaDe = (secreto: string, datos: string) => createHmac("sha256", secreto).update(datos).digest("base64url");

export function firmarUrlDrive(secreto: string, p: Permiso) {
  const datos = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${datos}.${firmaDe(secreto, datos)}`;
}

export function leerUrlDrive(secreto: string, token: string, ahora = Date.now()): Permiso | null {
  const [datos, firma] = token.split(".");
  if (!datos || !firma) return null;
  const a = Buffer.from(firma);
  const b = Buffer.from(firmaDe(secreto, datos));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(datos, "base64url").toString()) as Permiso;
    return p.e > ahora ? p : null;
  } catch {
    return null;
  }
}

const fallo = (titulo: string, detalle: string) => new ErrorApi(502, "ALMACEN_NO_DISPONIBLE", titulo, detalle);
const huella = (clave: string) => createHash("sha256").update(clave).digest("hex");

export interface ClienteDrive extends Almacen {
  /** Abre el archivo desde Drive, o null si no existe. */
  abrir(clave: string): Promise<Response | null>;
  /** Pasa a Drive lo que llega en `cuerpo`, sin guardarlo en el servidor. */
  recibir(clave: string, mime: string, cuerpo: BodyInit, bytes: number | null): Promise<void>;
  /** 18 nov: videos de los tableros, que van directo del navegador a Drive. */
  videos: VideosDrive;
  /**
   * 25 nov: carpetas cuyo nombre contiene `nombre`, en todo lo que ve la cuenta (también lo compartido con ella), con el
   * nombre de su carpeta padre (en el Drive del equipo, el servicio: Branding › Cliente). Solo lectura.
   */
  carpetasConNombre(nombre: string): Promise<{ id: string; nombre: string; padre: string | null }[]>;
}

/**
 * Videos de los tableros (18 nov 2026, Ernesto): viven en el Drive de la organización, en
 * «Videos de proyectos» › Empresa › Proyecto. El navegador los sube directo a Google (subida reanudable que abre el
 * portal) y el portal los reproduce pidiéndole a Drive el tramo que el reproductor necesita.
 */
export interface VideosDrive {
  carpeta(empresa: { clave: string; nombre: string }, proyecto: { id: string; nombre: string }): Promise<string>;
  /** La URL de subida (vale una semana para Google); `marca` identifica el archivo al terminar. */
  iniciarSubida(a: { carpeta: string; nombre: string; mime: string; bytes: number; origen: string; marca: string }): Promise<string>;
  buscar(marca: string): Promise<{ id: string; bytes: number; mime: string } | null>;
  abrir(driveId: string, rango: string | null): Promise<Response>;
  aPapelera(driveId: string): Promise<void>;
}

export function almacenDrive(c: ConfigDrive, enviar: typeof fetch = fetch): ClienteDrive {
  let token: { valor: string; vence: number } | null = null;
  let carpeta: Promise<string> | null = null;

  async function acceso() {
    if (token && token.vence > Date.now()) return token.valor;
    const r = await enviar("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw fallo("No pudimos conectarnos a Google Drive", `Google respondió ${r.status} al renovar el acceso.`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    token = { valor: j.access_token, vence: Date.now() + (j.expires_in - 60) * 1000 };
    return token.valor;
  }
  const cabeceras = async (extra: Record<string, string> = {}) => ({ authorization: `Bearer ${await acceso()}`, ...extra });

  async function buscar(q: string, campos: string) {
    const u = new URL(`${API}/files`);
    u.searchParams.set("q", q);
    u.searchParams.set("fields", `files(${campos})`);
    u.searchParams.set("pageSize", "1");
    const r = await enviar(u, { headers: await cabeceras(), signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw fallo("No pudimos leer Google Drive", `Google respondió ${r.status}.`);
    return ((await r.json()) as { files: { id: string; size?: string }[] }).files[0] ?? null;
  }
  const buscarArchivo = (clave: string) => buscar(`appProperties has { key='portal' and value='${huella(clave)}' } and trashed=false`, "id,size");

  function carpetaId() {
    if (c.carpetaId) return Promise.resolve(c.carpetaId);
    carpeta ??= (async () => {
      const hay = await buscar(`name='${NOMBRE_CARPETA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, "id");
      if (hay) return hay.id;
      const r = await enviar(`${API}/files?fields=id`, {
        method: "POST",
        headers: await cabeceras({ "content-type": "application/json" }),
        body: JSON.stringify({ name: NOMBRE_CARPETA, mimeType: "application/vnd.google-apps.folder" }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) throw fallo("No pudimos preparar Google Drive", `Google respondió ${r.status}.`);
      return ((await r.json()) as { id: string }).id;
    })().catch((e) => {
      carpeta = null;
      throw e;
    });
    return carpeta;
  }

  async function recibir(clave: string, mime: string, cuerpo: BodyInit, bytes: number | null) {
    const existente = await buscarArchivo(clave);
    const meta = existente ? {} : { name: clave.replaceAll("/", "__"), parents: [await carpetaId()], appProperties: { portal: huella(clave) } };
    const sesion = await enviar(`${SUBIDA}/files${existente ? `/${existente.id}` : ""}?uploadType=resumable&fields=id`, {
      method: existente ? "PATCH" : "POST",
      headers: await cabeceras({ "content-type": "application/json", "x-upload-content-type": mime, ...(bytes === null ? {} : { "x-upload-content-length": String(bytes) }) }),
      body: JSON.stringify(meta),
      signal: AbortSignal.timeout(20_000),
    });
    const destino = sesion.headers.get("location");
    if (!sesion.ok || !destino) throw fallo("No pudimos guardar el archivo", `Google respondió ${sesion.status} al iniciar la subida.`);
    const esFlujo = typeof ReadableStream !== "undefined" && cuerpo instanceof ReadableStream;
    const r = await enviar(destino, {
      method: "PUT",
      headers: { "content-type": mime, ...(bytes === null ? {} : { "content-length": String(bytes) }) },
      body: cuerpo,
      ...(esFlujo ? { duplex: "half" } : {}),
      signal: AbortSignal.timeout(15 * 60_000),
    } as RequestInit);
    if (!r.ok) throw fallo("No pudimos guardar el archivo", `Google respondió ${r.status}.`);
  }

  async function abrir(clave: string) {
    const f = await buscarArchivo(clave);
    if (!f) return null;
    const r = await enviar(`${API}/files/${f.id}?alt=media`, { headers: await cabeceras(), signal: AbortSignal.timeout(5 * 60_000) });
    if (r.status === 404) return null;
    if (!r.ok) throw fallo("No pudimos leer el archivo", `Google respondió ${r.status}.`);
    return r;
  }

  // ── videos de los tableros (18 nov)
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const carpetas = new Map<string, string>();
  async function carpetaCon(prop: string, valor: string, nombre: string, padre: string | null) {
    const k = `${prop}:${valor}`;
    let id = carpetas.get(k);
    if (!id) {
      const hay = await buscar(`appProperties has { key='${prop}' and value='${esc(valor)}' } and mimeType='application/vnd.google-apps.folder' and trashed=false`, "id,name");
      if (hay) id = hay.id;
      else {
        const r = await enviar(`${API}/files?fields=id`, {
          method: "POST", headers: await cabeceras({ "content-type": "application/json" }),
          body: JSON.stringify({ name: nombre, mimeType: "application/vnd.google-apps.folder", appProperties: { [prop]: valor }, ...(padre ? { parents: [padre] } : {}) }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!r.ok) throw fallo("No pudimos preparar la carpeta de videos", `Google respondió ${r.status}.`);
        id = ((await r.json()) as { id: string }).id;
      }
      carpetas.set(k, id);
    }
    return id;
  }
  /** Si el proyecto o la empresa cambiaron de nombre, la carpeta también. */
  async function renombrar(id: string, nombre: string) {
    await enviar(`${API}/files/${id}`, { method: "PATCH", headers: await cabeceras({ "content-type": "application/json" }), body: JSON.stringify({ name: nombre }), signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
  }
  const videos: VideosDrive = {
    carpeta: async (empresa, proyecto) => {
      const raiz = await carpetaCon("portalVideos", "raiz", "Videos de proyectos", null);
      const e = await carpetaCon("portalVideosEmpresa", empresa.clave, empresa.nombre.slice(0, 120), raiz);
      const nombre = proyecto.nombre.slice(0, 120);
      const p = await carpetaCon("portalVideosProyecto", proyecto.id, nombre, e);
      void renombrar(e, empresa.nombre.slice(0, 120));
      void renombrar(p, nombre);
      return p;
    },
    iniciarSubida: async (a) => {
      const r = await enviar(`${SUBIDA}/files?uploadType=resumable&fields=id`, {
        method: "POST",
        // Con el Origin del portal, Google deja que el navegador suba directo a la URL que devuelve.
        headers: await cabeceras({ "content-type": "application/json", "x-upload-content-type": a.mime, "x-upload-content-length": String(a.bytes), origin: a.origen }),
        body: JSON.stringify({ name: a.nombre, parents: [a.carpeta], appProperties: { portalVideo: a.marca } }),
        signal: AbortSignal.timeout(20_000),
      });
      const destino = r.headers.get("location");
      if (!r.ok || !destino) throw fallo("No pudimos preparar la subida del video", `Google respondió ${r.status}.`);
      return destino;
    },
    buscar: async (marca) => {
      const f = (await buscar(`appProperties has { key='portalVideo' and value='${esc(marca)}' } and trashed=false`, "id,size,mimeType")) as { id: string; size?: string; mimeType?: string } | null;
      return f ? { id: f.id, bytes: Number(f.size ?? 0), mime: f.mimeType ?? "video/mp4" } : null;
    },
    abrir: async (driveId, rango) => {
      // Sin tope corto: un video largo se sigue mirando por tramos (el reproductor pide Range).
      const r = await enviar(`${API}/files/${encodeURIComponent(driveId)}?alt=media`, { headers: await cabeceras(rango ? { range: rango } : {}), signal: AbortSignal.timeout(3 * 3_600_000) });
      if (r.status === 404) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese video en Drive");
      if (!r.ok) throw fallo("No pudimos leer el video", `Google respondió ${r.status}.`);
      return r;
    },
    aPapelera: async (driveId) => {
      await enviar(`${API}/files/${encodeURIComponent(driveId)}`, { method: "PATCH", headers: await cabeceras({ "content-type": "application/json" }), body: JSON.stringify({ trashed: true }), signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
    },
  };

  const url = (p: Permiso) => `${c.urlPortal.replace(/\/$/, "")}/api/v1/archivos-drive/${firmarUrlDrive(c.secreto, p)}`;
  const vence = (s: number) => Date.now() + s * 1000;
  async function carpetasConNombre(nombre: string) {
    const listar = async (q: string, campos: string, tope: number) => {
      const u = new URL(`${API}/files`);
      u.searchParams.set("q", q);
      u.searchParams.set("fields", `files(${campos})`);
      u.searchParams.set("pageSize", String(tope));
      u.searchParams.set("supportsAllDrives", "true");
      u.searchParams.set("includeItemsFromAllDrives", "true");
      const r = await enviar(u, { headers: await cabeceras(), signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw fallo("No pudimos leer Google Drive", `Google respondió ${r.status}.`);
      return ((await r.json()) as { files: { id: string; name: string; parents?: string[] }[] }).files;
    };
    const seguro = nombre.replace(/\\/g, "").replace(/'/g, "\\'");
    const xs = await listar(`name contains '${seguro}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, "id,name,parents", 30);
    const padres = new Map<string, string | null>();
    for (const id of [...new Set(xs.flatMap((x) => x.parents ?? []))].slice(0, 30)) {
      const r = await enviar(`${API}/files/${id}?fields=name&supportsAllDrives=true`, { headers: await cabeceras(), signal: AbortSignal.timeout(20_000) });
      padres.set(id, r.ok ? ((await r.json()) as { name: string }).name : null);
    }
    return xs.map((x) => ({ id: x.id, nombre: x.name, padre: x.parents?.[0] ? padres.get(x.parents[0]) ?? null : null }));
  }

  return {
    recibir,
    abrir,
    videos,
    carpetasConNombre,
    urlSubida: (clave, mime, segundos = 900) => ({ url: url({ o: "S", c: clave, m: mime, e: vence(segundos) }), headers: { "Content-Type": mime }, expiraEn: new Date(vence(segundos)).toISOString() }),
    urlDescarga: (clave, nombre, segundos = 900) => ({ url: url({ o: "D", c: clave, n: nombre, e: vence(segundos) }), expiraEn: new Date(vence(segundos)).toISOString() }),
    tamano: async (clave) => {
      const f = await buscarArchivo(clave);
      return f ? Number(f.size ?? 0) : null;
    },
    subir: (clave, mime, bytes) => recibir(clave, mime, bytes as BodyInit, bytes.length),
    leer: async (clave) => {
      const r = await abrir(clave);
      return r ? new Uint8Array(await r.arrayBuffer()) : null;
    },
  };
}

const codificar = (t: string) => encodeURIComponent(t).replace(/[!'()*]/g, (x) => `%${x.charCodeAt(0).toString(16).toUpperCase()}`);

/** PUT y GET de /archivos-drive/{token}: la firma es el permiso, igual que una URL prefirmada de S3. */
export async function atenderArchivoDrive(req: Request, token: string, a: ClienteDrive, secreto: string): Promise<Response> {
  const p = leerUrlDrive(secreto, token);
  if (!p) throw new ErrorApi(403, "URL_VENCIDA", "Este enlace ya venció", "Vuelve a abrir el archivo desde el portal.");
  if (p.o === "S" && req.method === "PUT") {
    const largo = req.headers.get("content-length");
    const bytes = largo === null ? null : Number(largo);
    if (bytes === null || !Number.isFinite(bytes)) throw new ErrorApi(411, "FALTA_TAMANO", "No pudimos leer el tamaño del archivo");
    if (bytes > MAX_BYTES_DRIVE) throw new ErrorApi(413, "ARCHIVO_MUY_GRANDE", "El archivo pesa demasiado", `El máximo es ${MAX_BYTES_DRIVE / 1024 / 1024} MB.`);
    await a.recibir(p.c, p.m, (req.body ?? new Uint8Array()) as BodyInit, bytes);
    return new Response(null, { status: 200 });
  }
  if (p.o === "D" && (req.method === "GET" || req.method === "HEAD")) {
    const r = await a.abrir(p.c);
    if (!r) throw new ErrorApi(404, "NO_ENCONTRADO", "No encontramos ese archivo");
    return new Response(req.method === "HEAD" ? null : r.body, {
      headers: {
        "content-type": r.headers.get("content-type") ?? "application/octet-stream",
        ...(r.headers.get("content-length") ? { "content-length": r.headers.get("content-length")! } : {}),
        "content-disposition": `attachment; filename*=UTF-8''${codificar(p.n)}`,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  }
  throw new ErrorApi(405, "METODO_NO_PERMITIDO", "Este enlace no sirve para esa acción");
}
