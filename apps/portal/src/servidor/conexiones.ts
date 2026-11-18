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
  clave: "GOOGLE_DRIVE" | "GOOGLE_CALENDAR";
  /** Adónde vuelve la persona después de conectar. */
  vuelveA: string;
  ruta: string;
  nombre: string;
  descripcion: string;
  autorizar: string;
  token: string;
  revocar: string;
  alcances: string[];
  cliente: () => { id: string; secreto: string } | null;
}
function clienteGoogle() {
  return env("GOOGLE_OAUTH_CLIENT_ID") && env("GOOGLE_OAUTH_CLIENT_SECRET") ? { id: env("GOOGLE_OAUTH_CLIENT_ID")!, secreto: env("GOOGLE_OAUTH_CLIENT_SECRET")! } : null;
}
export const PROVEEDORES: Proveedor[] = [
  {
    clave: "GOOGLE_DRIVE", ruta: "google-drive", nombre: "Google Drive",
    descripcion: "Tus bots buscan y leen tus archivos de Drive (solo lectura) cuando se lo pides en tus chats.",
    autorizar: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", revocar: "https://oauth2.googleapis.com/revoke",
    alcances: ["openid", "email", "https://www.googleapis.com/auth/drive.readonly"],
    cliente: clienteGoogle, vuelveA: "/equipo/mi-cuenta",
  },
  {
    // 18 nov: cada persona conecta la cuenta de Google que quiera (también un Gmail personal).
    clave: "GOOGLE_CALENDAR", ruta: "google-calendar", nombre: "Google Calendar",
    descripcion: "Tus reuniones de Google aparecen en tu calendario del portal, y lo que agendas en el portal se copia a tu Google Calendar.",
    autorizar: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", revocar: "https://oauth2.googleapis.com/revoke",
    alcances: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"],
    cliente: clienteGoogle, vuelveA: "/equipo/calendario",
  },
];
export const proveedorPorRuta = (ruta: string) => PROVEEDORES.find((p) => p.ruta === ruta) ?? null;

export const urlVuelta = (p: Proveedor) => `${(env("PORTAL_URL") ?? "http://localhost:3000").replace(/\/+$/, "")}/api/v1/conexiones/${p.ruta}/vuelta`;

// ── cifrado de los tokens

/** Llave del servidor para cifrar en reposo: una por uso (conexiones, bóveda), derivada de su secreto o de SESION_SECRETO. */
function clave(uso: "conexiones" | "boveda" = "conexiones") {
  const base = env(uso === "boveda" ? "BOVEDA_SECRETO" : "CONEXIONES_SECRETO") ?? env("SESION_SECRETO");
  if (!base || base.length < 32) throw new Error("Falta el secreto de cifrado (o SESION_SECRETO) de 32 caracteres o más");
  return createHash("sha256").update(`inoo-${uso}:${base}`).digest();
}
export function cifrar(texto: string, uso: "conexiones" | "boveda" = "conexiones") {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(uso), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${datos.toString("base64url")}`;
}
export function descifrar(cifrado: string, uso: "conexiones" | "boveda" = "conexiones") {
  const [v, iv, tag, datos] = cifrado.split(".");
  if (v !== "v1") throw new Error("Formato de token desconocido");
  const d = createDecipheriv("aes-256-gcm", clave(uso), Buffer.from(iv, "base64url"));
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

// ── Google Calendar (18 nov): leer la agenda de la persona y llevar los eventos del portal a su calendario.

export interface EventoGoogle { id: string; titulo: string; fecha: string; horaInicio: string | null; horaFin: string | null; notas: string | null; delPortal: boolean }
const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

async function calendario(acceso: string, url: string, init: RequestInit = {}) {
  const r = await enviar(url, { ...init, headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
  if (r.status === 401 || r.status === 403) throw new SinPermisoConexion("Calendar no dejó entrar");
  return r;
}
const enLima = (iso: string) => {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString();
  return { fecha: d.slice(0, 10), hora: d.slice(11, 16) };
};

/** Los eventos de su calendario principal entre dos días (Lima). Los que vienen del portal se marcan para no repetirlos. */
export async function eventosDeGoogle(acceso: string, desde: string, hasta: string): Promise<EventoGoogle[]> {
  const q = new URLSearchParams({ timeMin: `${desde}T00:00:00-05:00`, timeMax: `${hasta}T23:59:59-05:00`, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const r = await calendario(acceso, `${CAL}?${q}`);
  if (!r.ok) throw new Error(`Calendar respondió ${r.status}`);
  const j = (await r.json()) as { items?: { id: string; status?: string; summary?: string; description?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string }; extendedProperties?: { private?: Record<string, string> } }[] };
  return (j.items ?? []).filter((e) => e.status !== "cancelled" && (e.start?.date || e.start?.dateTime)).map((e) => {
    const todoElDia = !!e.start?.date;
    const ini = todoElDia ? { fecha: e.start!.date!, hora: null } : enLima(e.start!.dateTime!);
    const fin = !todoElDia && e.end?.dateTime ? enLima(e.end.dateTime).hora : null;
    return { id: e.id, titulo: (e.summary ?? "(Sin título)").slice(0, 200), fecha: ini.fecha, horaInicio: ini.hora, horaFin: fin, notas: e.description ? e.description.slice(0, 1000) : null, delPortal: !!e.extendedProperties?.private?.inooEvento };
  });
}

/** El cuerpo de un evento del portal para Google (con hora en Lima, o de todo el día). */
function cuerpoGoogle(e: { id: string; titulo: string; notas: string | null; fecha: string; horaInicio: string | null; horaFin: string | null }) {
  const siguiente = new Date(`${e.fecha}T12:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  return {
    summary: e.titulo, description: e.notas ?? undefined,
    start: e.horaInicio ? { dateTime: `${e.fecha}T${e.horaInicio}:00-05:00`, timeZone: "America/Lima" } : { date: e.fecha },
    end: e.horaInicio ? { dateTime: `${e.fecha}T${e.horaFin ?? e.horaInicio}:00-05:00`, timeZone: "America/Lima" } : { date: siguiente.toISOString().slice(0, 10) },
    extendedProperties: { private: { inooEvento: e.id } },
  };
}
export async function crearEnGoogle(acceso: string, e: Parameters<typeof cuerpoGoogle>[0]): Promise<string> {
  const r = await calendario(acceso, CAL, { method: "POST", body: JSON.stringify(cuerpoGoogle(e)) });
  if (!r.ok) throw new Error(`Calendar respondió ${r.status}`);
  return ((await r.json()) as { id: string }).id;
}
export async function cambiarEnGoogle(acceso: string, googleId: string, e: Parameters<typeof cuerpoGoogle>[0]) {
  const r = await calendario(acceso, `${CAL}/${encodeURIComponent(googleId)}`, { method: "PUT", body: JSON.stringify(cuerpoGoogle(e)) });
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Calendar respondió ${r.status}`);
}
export async function borrarEnGoogle(acceso: string, googleId: string) {
  const r = await calendario(acceso, `${CAL}/${encodeURIComponent(googleId)}`, { method: "DELETE" });
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`Calendar respondió ${r.status}`);
}
