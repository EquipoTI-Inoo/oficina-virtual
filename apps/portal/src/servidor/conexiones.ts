/**
 * Conexiones personales de Jarvis (9 nov 2026). Cada persona conecta su propia cuenta con «Conectar» en Mi cuenta
 * (OAuth 2.0 con PKCE): nadie copia llaves. El portal guarda solo el refresh token, cifrado, y pide un access token
 * cada vez que hace falta. Por ahora: Google Drive en solo lectura. Figma y Canva siguen el mismo patrón cuando Inoo
 * registre una app en cada uno.
 *
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET  cliente OAuth «Aplicación web» del proyecto de Google Cloud,
 *                                                       con la URI de redirección {PORTAL_URL}/api/v1/conexiones/google-drive/vuelta
 *   CONEXIONES_SECRETO                                  opcional: clave para cifrar los tokens (si no, se deriva de SESION_SECRETO)
 *   PORTAL_URL                                          base pública del portal
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const env = (k: string) => process.env[k]?.trim() || undefined;

let enviar: typeof fetch = (...a) => fetch(...a);
/** Solo pruebas: reemplaza fetch para simular a Google. */
export function usarFetchConexiones(f: typeof fetch | null) {
  enviar = f ?? ((...a) => fetch(...a));
}

export interface Proveedor {
  clave: "GOOGLE_DRIVE";
  ruta: string;
  nombre: string;
  descripcion: string;
  autorizar: string;
  token: string;
  revocar: string;
  alcances: string[];
  cliente: () => { id: string; secreto: string } | null;
}
export const PROVEEDORES: Proveedor[] = [
  {
    clave: "GOOGLE_DRIVE", ruta: "google-drive", nombre: "Google Drive",
    descripcion: "Tus bots buscan y leen tus archivos de Drive (solo lectura) cuando se lo pides en tus chats.",
    autorizar: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", revocar: "https://oauth2.googleapis.com/revoke",
    alcances: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"],
    cliente: () => (env("GOOGLE_OAUTH_CLIENT_ID") && env("GOOGLE_OAUTH_CLIENT_SECRET") ? { id: env("GOOGLE_OAUTH_CLIENT_ID")!, secreto: env("GOOGLE_OAUTH_CLIENT_SECRET")! } : null),
  },
];
export const proveedorPorRuta = (ruta: string) => PROVEEDORES.find((p) => p.ruta === ruta) ?? null;

export const urlVuelta = (p: Proveedor) => `${(env("PORTAL_URL") ?? "http://localhost:3000").replace(/\/+$/, "")}/api/v1/conexiones/${p.ruta}/vuelta`;

// ── cifrado de los tokens

function clave() {
  const base = env("CONEXIONES_SECRETO") ?? env("SESION_SECRETO");
  if (!base || base.length < 32) throw new Error("Falta CONEXIONES_SECRETO (o SESION_SECRETO) de 32 caracteres o más");
  return createHash("sha256").update(`inoo-conexiones:${base}`).digest();
}
export function cifrar(texto: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${datos.toString("base64url")}`;
}
export function descifrar(cifrado: string) {
  const [v, iv, tag, datos] = cifrado.split(".");
  if (v !== "v1") throw new Error("Formato de token desconocido");
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
}

// ── OAuth con PKCE

export function nuevoInicio(p: Proveedor) {
  const c = p.cliente();
  if (!c) return null;
  const estado = randomBytes(24).toString("base64url");
  const verificador = randomBytes(48).toString("base64url");
  const desafio = createHash("sha256").update(verificador).digest("base64url");
  const q = new URLSearchParams({
    client_id: c.id, redirect_uri: urlVuelta(p), response_type: "code", scope: p.alcances.join(" "), state: estado,
    code_challenge: desafio, code_challenge_method: "S256", access_type: "offline", prompt: "consent", include_granted_scopes: "true",
  });
  return { estado, verificador, url: `${p.autorizar}?${q}` };
}

/** Canjea el código: devuelve el refresh token y la cuenta (el correo del id_token, que llega directo de Google). */
export async function canjearCodigo(p: Proveedor, codigo: string, verificador: string) {
  const c = p.cliente();
  if (!c) throw new Error("La conexión no está configurada");
  const r = await enviar(p.token, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secreto, code: codigo, code_verifier: verificador, grant_type: "authorization_code", redirect_uri: urlVuelta(p) }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; expires_in?: number; id_token?: string; error?: string };
  if (!r.ok || !j.refresh_token) throw new Error(j.error ? `Google respondió ${j.error}` : "Google no devolvió el permiso para seguir conectado");
  let cuenta: string | null = null;
  try {
    cuenta = (JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString()) as { email?: string }).email ?? null;
  } catch {
    cuenta = null;
  }
  if (j.access_token) guardarAcceso(j.refresh_token, j.access_token, j.expires_in ?? 3000);
  return { refresh: j.refresh_token, cuenta };
}

// Los access tokens viven en memoria (unos 50 minutos) y nunca en la base.
const accesos = new Map<string, { valor: string; vence: number }>();
const llaveAcceso = (refresh: string) => createHash("sha256").update(refresh).digest("hex");
function guardarAcceso(refresh: string, valor: string, segundos: number) {
  accesos.set(llaveAcceso(refresh), { valor, vence: Date.now() + Math.max(60, segundos - 120) * 1000 });
}
/** Solo pruebas. */
export const olvidarAccesos = () => accesos.clear();

export class SinPermisoConexion extends Error {}
export async function accesoDe(p: Proveedor, refresh: string) {
  const ya = accesos.get(llaveAcceso(refresh));
  if (ya && ya.vence > Date.now()) return ya.valor;
  const c = p.cliente();
  if (!c) throw new Error("La conexión no está configurada");
  const r = await enviar(p.token, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secreto, refresh_token: refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  // invalid_grant: la persona quitó el permiso en su cuenta de Google o venció.
  if (j.error === "invalid_grant") throw new SinPermisoConexion("El permiso se revocó o venció");
  if (!r.ok || !j.access_token) throw new Error(`Google respondió ${r.status}`);
  guardarAcceso(refresh, j.access_token, j.expires_in ?? 3000);
  return j.access_token;
}

export async function revocar(p: Proveedor, refresh: string) {
  accesos.delete(llaveAcceso(refresh));
  try {
    await enviar(p.revocar, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh }), signal: AbortSignal.timeout(10_000) });
  } catch {
    /* si Google no responde, igual se borra aquí */
  }
}

// ── Google Drive (solo lectura)

export interface ArchivoDrive { id: string; nombre: string; tipo: string; modificado: string | null; enlace: string | null }
const MAX_TEXTO = 50_000;
const EXPORTAR: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

async function drive(acceso: string, ruta: string) {
  const r = await enviar(`https://www.googleapis.com/drive/v3${ruta}`, { headers: { authorization: `Bearer ${acceso}` }, signal: AbortSignal.timeout(20_000) });
  if (r.status === 401 || r.status === 403) throw new SinPermisoConexion("Drive no dejó leer");
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Drive respondió ${r.status}`);
  return r;
}

export async function buscarEnDrive(acceso: string, texto: string): Promise<ArchivoDrive[]> {
  const t = texto.replace(/['\\]/g, " ").trim();
  const q = `trashed = false${t ? ` and (name contains '${t}' or fullText contains '${t}')` : ""}`;
  // Con texto, Drive ordena por relevancia; sin texto, los más recientes.
  const params = new URLSearchParams({ q, pageSize: "15", fields: "files(id,name,mimeType,modifiedTime,webViewLink)", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
  if (!t) params.set("orderBy", "modifiedTime desc");
  const r = await drive(acceso, `/files?${params}`);
  const j = (await r!.json()) as { files?: { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }[] };
  return (j.files ?? []).map((f) => ({ id: f.id, nombre: f.name, tipo: f.mimeType, modificado: f.modifiedTime ?? null, enlace: f.webViewLink ?? null }));
}

export async function leerDeDrive(acceso: string, id: string) {
  if (!/^[\w-]{10,200}$/.test(id)) return null;
  const meta = await drive(acceso, `/files/${id}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`);
  if (!meta) return null;
  const m = (await meta.json()) as { id: string; name: string; mimeType: string; webViewLink?: string };
  const exportar = EXPORTAR[m.mimeType];
  const legible = exportar || /^text\/|json|csv|xml|markdown/.test(m.mimeType);
  let texto: string | null = null;
  if (legible) {
    const r = await drive(acceso, exportar ? `/files/${id}/export?mimeType=${encodeURIComponent(exportar)}` : `/files/${id}?alt=media&supportsAllDrives=true`);
    texto = r ? await r.text() : null;
  }
  return {
    id: m.id, nombre: m.name, tipo: m.mimeType, enlace: m.webViewLink ?? null,
    texto: texto === null ? null : texto.slice(0, MAX_TEXTO), truncado: (texto?.length ?? 0) > MAX_TEXTO,
    aviso: legible ? null : "Este tipo de archivo no se puede leer como texto (por ejemplo PDF, imagen o video). Abre el enlace.",
  };
}
