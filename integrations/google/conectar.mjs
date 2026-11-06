#!/usr/bin/env node
/**
 * Conecta el correo o Google Drive del portal sin pegar secretos en ningún chat. Se corre en la máquina de quien
 * tiene la cuenta; pide los datos, los prueba y solo si funcionan los guarda en el .env del servidor por SSH.
 *
 *   node integrations/google/conectar.mjs smtp
 *   node integrations/google/conectar.mjs drive
 *
 * Variables opcionales: CORREO_CUENTA (asesoria@inoo.pe), VPS (root@179.66.130.29), LLAVE_SSH (~/.ssh/inoo_vps).
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import readline from "node:readline";

const CUENTA = process.env.CORREO_CUENTA ?? "asesoria@inoo.pe";
const VPS = process.env.VPS ?? "root@179.66.130.29";
const LLAVE = process.env.LLAVE_SSH ?? join(homedir(), ".ssh", "inoo_vps");
const DIR = "/opt/inoo/oficina-virtual/infra/hostinger";

function preguntar(texto, oculto = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) rl._writeToOutput = (s) => { if (s.includes(texto)) process.stdout.write(texto); };
    rl.question(texto, (r) => {
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(r.trim());
    });
  });
}

/** Programa que cambia las variables en un .env: las lee de stdin como JSON. */
export const ACTUALIZAR_ENV = (ruta) => `
import json, re, sys
ruta = ${JSON.stringify(ruta)}
txt = open(ruta).read()
for k, v in json.load(sys.stdin).items():
    linea = k + "=" + v
    txt, n = re.subn(r"(?m)^" + k + r"=.*$", lambda _: linea, txt)
    if not n:
        txt = txt.rstrip("\\n") + "\\n" + linea + "\\n"
open(ruta, "w").write(txt)
`;

/** Guarda las variables en el servidor. Los valores viajan por stdin: no quedan en el historial ni en los procesos. */
function guardarEnServidor(variables, servicios) {
  // En base64 para que pase intacto por el shell remoto.
  const programa = Buffer.from(ACTUALIZAR_ENV(`${DIR}/.env`)).toString("base64");
  const remoto = `set -e; S=/opt/inoo/respaldos/env-antes-conectar-$(date +%Y%m%d-%H%M%S); cp -p ${DIR}/.env $S; chmod 600 $S; python3 -c "import base64; exec(base64.b64decode('${programa}'))"; cp -p ${DIR}/.env /opt/inoo/produccion.env; cd ${DIR}; docker compose up -d --no-deps ${servicios}`;
  const r = spawnSync("ssh", ["-i", LLAVE, "-o", "BatchMode=yes", VPS, remoto], { input: JSON.stringify(variables), encoding: "utf8" });
  if (r.status !== 0) {
    console.error("\nNo se pudo guardar en el servidor. No se cambió nada del portal.");
    console.error((r.stderr ?? "").split("\n").slice(-4).join("\n"));
    process.exit(1);
  }
  console.log("Guardado en el servidor.");
}

async function smtp() {
  console.log(`\nCorreo del portal con ${CUENTA}.\nLa clave de aplicación es la de 16 letras de https://myaccount.google.com/apppasswords, no tu contraseña normal.\n`);
  const clave = (await preguntar("Clave de aplicación (no se ve al escribir): ", true)).replace(/\s+/g, "");
  if (!clave) process.exit(1);
  const require = createRequire(new URL("../../apps/portal/package.json", import.meta.url));
  const nodemailer = require("nodemailer");
  const transporte = nodemailer.createTransport({ host: "smtp.gmail.com", port: 587, secure: false, auth: { user: CUENTA, pass: clave } });
  console.log("Probando con Google…");
  try {
    await transporte.verify();
    await transporte.sendMail({ from: `Inoo <${CUENTA}>`, to: CUENTA, subject: "Prueba del portal de Inoo", text: "Si lees esto, el correo del portal ya funciona." });
  } catch (e) {
    console.error(`\nGoogle rechazó la conexión: ${e.message}\nNo se guardó nada. Revisa la cuenta y la clave, y vuelve a intentarlo.`);
    process.exit(1);
  }
  console.log(`Funcionó: revisa en ${CUENTA} el correo «Prueba del portal de Inoo».`);
  guardarEnServidor({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_SEGURO: "false", SMTP_USUARIO: CUENTA, SMTP_CLAVE: clave, CORREO_REMITENTE: `"Inoo <${CUENTA}>"` }, "portal outbox");
  console.log("\nListo. Avísale a Claude para que revise que el servidor pueda enviar.");
}

async function drive() {
  console.log(`\nGoogle Drive del portal con ${CUENTA}.\nEl ID y el secreto salen de la credencial «App de escritorio» de Google Cloud.\n`);
  const clientId = await preguntar("ID de cliente: ");
  const clientSecret = await preguntar("Secreto de cliente (no se ve al escribir): ", true);
  if (!clientId || !clientSecret) process.exit(1);

  const verificador = randomBytes(48).toString("base64url");
  const estado = randomBytes(16).toString("hex");
  const codigo = await new Promise((resolve, reject) => {
    const servidor = createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname !== "/") return res.writeHead(404).end();
      const ok = u.searchParams.get("state") === estado && u.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(ok ? "<h2>Listo. Ya puedes cerrar esta ventana y volver a la terminal.</h2>" : "<h2>No se pudo autorizar. Vuelve a la terminal.</h2>");
      servidor.close();
      if (ok) resolve({ codigo: u.searchParams.get("code"), redirect: `http://127.0.0.1:${servidor.puerto}` });
      else reject(new Error(u.searchParams.get("error") ?? "respuesta inválida"));
    });
    servidor.listen(0, "127.0.0.1", () => {
      servidor.puerto = servidor.address().port;
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [k, v] of Object.entries({
        client_id: clientId, redirect_uri: `http://127.0.0.1:${servidor.puerto}`, response_type: "code", access_type: "offline", prompt: "consent",
        scope: "https://www.googleapis.com/auth/drive.file", login_hint: CUENTA, state: estado,
        code_challenge: createHash("sha256").update(verificador).digest("base64url"), code_challenge_method: "S256",
      })) u.searchParams.set(k, v);
      console.log(`\nSe abrirá el navegador. Entra con ${CUENTA} y acepta.\nSi no se abre, copia esto:\n\n${u}\n`);
      const abrir = platform() === "win32" ? ["cmd", ["/c", "start", "", u.href.replace(/&/g, "^&")]] : platform() === "darwin" ? ["open", [u.href]] : ["xdg-open", [u.href]];
      spawnSync(abrir[0], abrir[1], { stdio: "ignore" });
    });
  });

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", code: codigo.codigo, redirect_uri: codigo.redirect, client_id: clientId, client_secret: clientSecret, code_verifier: verificador }),
  });
  const t = await r.json();
  if (!r.ok || !t.refresh_token) {
    console.error(`\nGoogle no entregó el acceso: ${t.error_description ?? t.error ?? r.status}. No se guardó nada.`);
    process.exit(1);
  }
  const quien = await (await fetch("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", { headers: { authorization: `Bearer ${t.access_token}` } })).json();
  const correo = quien.user?.emailAddress;
  if (correo?.toLowerCase() !== CUENTA.toLowerCase()) {
    console.error(`\nEntraste con ${correo ?? "otra cuenta"}, y debe ser ${CUENTA}. No se guardó nada: vuelve a intentarlo.`);
    process.exit(1);
  }
  console.log(`Autorizado con ${correo}.`);
  guardarEnServidor({ DRIVE_CLIENT_ID: clientId, DRIVE_CLIENT_SECRET: clientSecret, DRIVE_REFRESH_TOKEN: t.refresh_token }, "portal");
  console.log("\nListo. Avísale a Claude para que haga la prueba real de subida.");
}

const modo = process.argv[2];
if (modo === "smtp") await smtp();
else if (modo === "drive") await drive();
else {
  console.log("Uso: node integrations/google/conectar.mjs smtp | drive");
  process.exit(1);
}
process.exit(0);
