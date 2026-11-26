// 26 nov 2026: conecta la cuenta planning@inoo.pe al portal (Drive de solo lectura + Google Calendar).
// Uso, desde esta PC (con la llave SSH del VPS):  node apps/portal/scripts/autorizar-planning.mjs
// 1. Lee la app de Google que ya usa el portal (DRIVE_CLIENT_ID / DRIVE_CLIENT_SECRET) del .env del servidor.
// 2. Muestra un enlace; quien tenga la cuenta planning@ lo abre en ESTA PC, entra y acepta.
// 3. Guarda la autorización como PLANNING_REFRESH_TOKEN en el .env del servidor (y en su copia). Nunca se imprime.
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const VPS = "root@179.66.130.29";
const LLAVE = join(homedir(), ".ssh", "inoo_vps");
const ENVS = ["/opt/inoo/oficina-virtual/infra/hostinger/.env", "/opt/inoo/produccion.env"];
const CUENTA = "planning@inoo.pe";
const PUERTO = 8765;
const REDIRECCION = `http://localhost:${PUERTO}`;
const PERMISOS = ["openid", "email", "https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/calendar"];

const ssh = (cmd, entrada) =>
  execFileSync("ssh", ["-i", LLAVE, "-o", "BatchMode=yes", VPS, cmd], { input: entrada, encoding: "utf8" });

const env = Object.fromEntries(
  ssh(`grep -E '^DRIVE_CLIENT_(ID|SECRET)=' ${ENVS[0]}`).trim().split("\n").map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  }),
);
if (!env.DRIVE_CLIENT_ID || !env.DRIVE_CLIENT_SECRET) throw new Error("El servidor no tiene DRIVE_CLIENT_ID / DRIVE_CLIENT_SECRET");

const estado = Math.random().toString(36).slice(2);
const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url.search = new URLSearchParams({
  client_id: env.DRIVE_CLIENT_ID, redirect_uri: REDIRECCION, response_type: "code", scope: PERMISOS.join(" "),
  access_type: "offline", prompt: "consent", login_hint: CUENTA, state: estado,
}).toString();

const servidor = createServer(async (req, res) => {
  const q = new URL(req.url, REDIRECCION).searchParams;
  const responder = (txt) => { res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }); res.end(txt); };
  if (!q.get("code") && !q.get("error")) return responder("");
  try {
    if (q.get("error")) throw new Error(`Google dijo: ${q.get("error")}`);
    if (q.get("state") !== estado) throw new Error("Respuesta que no corresponde a este enlace");
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: q.get("code"), client_id: env.DRIVE_CLIENT_ID, client_secret: env.DRIVE_CLIENT_SECRET, redirect_uri: REDIRECCION }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) throw new Error(`Google no entregó la autorización (${r.status} ${j.error ?? "sin refresh_token"})`);
    const email = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString()).email;
    if (email !== CUENTA) throw new Error(`Se entró con ${email}, no con ${CUENTA}. Vuelve a correr el script y elige ${CUENTA}.`);
    // Reemplaza la línea si ya existía; la autorización va por la entrada estándar, no en el comando.
    for (const f of ENVS) {
      ssh(`f=${f}; t=$(mktemp); grep -v '^PLANNING_REFRESH_TOKEN=' "$f" > "$t"; printf 'PLANNING_REFRESH_TOKEN=%s\\n' "$(cat)" >> "$t"; cat "$t" > "$f"; rm "$t"`, j.refresh_token);
    }
    responder(`Listo: ${CUENTA} quedó conectada al portal. Puedes cerrar esta pestaña.`);
    console.log(`\nListo: ${CUENTA} conectada. Guardada en el servidor como PLANNING_REFRESH_TOKEN.`);
  } catch (e) {
    responder(`No se pudo: ${e.message}`);
    console.error(`\nNo se pudo: ${e.message}`);
    process.exitCode = 1;
  }
  servidor.close();
});
servidor.listen(PUERTO, () => {
  console.log(`Abre este enlace en esta PC y entra con ${CUENTA}:\n\n${url}\n\n(esperando…)`);
});
