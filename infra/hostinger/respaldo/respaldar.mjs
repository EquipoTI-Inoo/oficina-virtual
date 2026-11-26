/**
 * Respaldo diario de la base del portal (6 nov 2026): pg_dump en /respaldos (se guardan 14 días) y una copia en el
 * Google Drive de Inoo, carpeta «Respaldos del portal» (se guardan los últimos 30). Así un problema del VPS no se
 * lleva también los respaldos. Usa la misma credencial de Drive del portal (scope drive.file: solo ve lo que crea).
 * Sin las variables DRIVE_*, solo respalda en el servidor. Corre en el servicio «respaldo» del compose.
 *
 * 23 nov 2026: también la base de InooWork (users.db, SQLite), desde que se mudó al VPS. Se copia con el respaldo
 * en caliente de SQLite (no se corrompe aunque esté en uso), comprimida, a la carpeta «Respaldos de InooWork».
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";

const e = process.env;
const DIR = "/respaldos";
const CARPETA = "Respaldos del portal";
const CARPETA_INOOWORK = "Respaldos de InooWork";
const BASE_INOOWORK = "/inoowork/users.db";
const QUEDAN_EN_DRIVE = 30;
const DIAS_LOCAL = 14;
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function accesoDrive() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: e.DRIVE_REFRESH_TOKEN, client_id: e.DRIVE_CLIENT_ID, client_secret: e.DRIVE_CLIENT_SECRET }),
  });
  const t = await r.json();
  if (!t.access_token) throw new Error(`Google no dio acceso: ${t.error ?? r.status}`);
  return { authorization: `Bearer ${t.access_token}` };
}

async function subirADrive(ruta, nombre, CARPETA) {
  const h = await accesoDrive();
  const api = "https://www.googleapis.com/drive/v3/files";
  const q = (s) => `${api}?q=${encodeURIComponent(s)}&fields=files(id,name,createdTime)&orderBy=createdTime desc&pageSize=200`;
  let carpeta = (await (await fetch(q(`name='${CARPETA}' and mimeType='application/vnd.google-apps.folder' and trashed=false`), { headers: h })).json()).files?.[0]?.id;
  if (!carpeta) {
    const c = await (await fetch(`${api}?fields=id`, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ name: CARPETA, mimeType: "application/vnd.google-apps.folder" }) })).json();
    carpeta = c.id;
    if (!carpeta) throw new Error("No se pudo crear la carpeta en Drive");
  }
  const fd = new FormData();
  fd.append("metadata", new Blob([JSON.stringify({ name: nombre, parents: [carpeta] })], { type: "application/json" }));
  fd.append("file", new Blob([readFileSync(ruta)], { type: "application/octet-stream" }));
  const s = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size", { method: "POST", headers: h, body: fd });
  if (!s.ok) throw new Error(`Drive respondió ${s.status} al subir`);
  log("subido a Drive:", nombre);
  // Los más viejos, a la papelera de Drive (se pueden recuperar 30 días más).
  const todos = (await (await fetch(q(`'${carpeta}' in parents and trashed=false`), { headers: h })).json()).files ?? [];
  for (const f of todos.slice(QUEDAN_EN_DRIVE)) {
    await fetch(`${api}/${f.id}`, { method: "PATCH", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    log("a la papelera de Drive:", f.name);
  }
}

async function respaldar() {
  const nombre = `oficina_${new Date().toISOString().slice(0, 10)}.dump`;
  const ruta = `${DIR}/${nombre}`;
  const d = spawnSync("pg_dump", ["-h", "postgres", "-U", e.POSTGRES_USER, "-Fc", "-f", ruta, e.POSTGRES_DB], { encoding: "utf8", env: { ...e, PGPASSWORD: e.POSTGRES_PASSWORD } });
  if (d.status !== 0) return log("pg_dump falló:", (d.stderr ?? "").trim());
  log("respaldo local:", nombre, `${Math.round(statSync(ruta).size / 1024)} KB`);
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".dump"))) {
    if (Date.now() - statSync(`${DIR}/${f}`).mtimeMs > DIAS_LOCAL * 86_400_000) unlinkSync(`${DIR}/${f}`);
  }
  if (!e.DRIVE_CLIENT_ID || !e.DRIVE_CLIENT_SECRET || !e.DRIVE_REFRESH_TOKEN) return log("sin Drive: el respaldo queda solo en el servidor");
  try {
    await subirADrive(ruta, nombre, CARPETA);
  } catch (x) {
    log("no se pudo subir a Drive (queda en el servidor):", x.message);
  }
}

/**
 * 26 nov (una fila borrada por accidente): además del diario, InooWork se respalda cada hora en el servidor. Los de
 * cada hora se guardan 2 días y no suben a Drive.
 */
async function respaldarInooworkHora() {
  if (!existsSync(BASE_INOOWORK)) return;
  const ruta = `${DIR}/inoowork-hora_${new Date().toISOString().slice(0, 13).replace("T", "_")}.db`;
  if (existsSync(ruta)) unlinkSync(ruta);
  const b = spawnSync("sqlite3", ["-readonly", BASE_INOOWORK, `.backup '${ruta}'`], { encoding: "utf8" });
  if (b.status !== 0) return log("respaldo de InooWork (hora) falló:", (b.stderr ?? "").trim());
  if (existsSync(`${ruta}.gz`)) unlinkSync(`${ruta}.gz`);
  spawnSync("gzip", ["-9", ruta], { encoding: "utf8" });
  for (const f of readdirSync(DIR).filter((x) => x.startsWith("inoowork-hora_"))) {
    if (Date.now() - statSync(`${DIR}/${f}`).mtimeMs > 2 * 86_400_000) unlinkSync(`${DIR}/${f}`);
  }
}

async function respaldarInoowork() {
  if (!existsSync(BASE_INOOWORK)) return log("sin la base de InooWork montada: se omite");
  const nombre = `inoowork_${new Date().toISOString().slice(0, 10)}.db`;
  const ruta = `${DIR}/${nombre}`;
  if (existsSync(ruta)) unlinkSync(ruta);
  const b = spawnSync("sqlite3", ["-readonly", BASE_INOOWORK, `.backup '${ruta}'`], { encoding: "utf8" });
  if (b.status !== 0) return log("respaldo de InooWork falló:", (b.stderr ?? "").trim());
  if (existsSync(`${ruta}.gz`)) unlinkSync(`${ruta}.gz`);
  const z = spawnSync("gzip", ["-9", ruta], { encoding: "utf8" });
  if (z.status !== 0) return log("no se pudo comprimir el respaldo de InooWork:", (z.stderr ?? "").trim());
  log("respaldo local:", `${nombre}.gz`, `${Math.round(statSync(`${ruta}.gz`).size / 1024)} KB`);
  for (const f of readdirSync(DIR).filter((x) => x.startsWith("inoowork_") && x.endsWith(".db.gz"))) {
    if (Date.now() - statSync(`${DIR}/${f}`).mtimeMs > DIAS_LOCAL * 86_400_000) unlinkSync(`${DIR}/${f}`);
  }
  if (!e.DRIVE_CLIENT_ID || !e.DRIVE_CLIENT_SECRET || !e.DRIVE_REFRESH_TOKEN) return;
  try {
    await subirADrive(`${ruta}.gz`, `${nombre}.gz`, CARPETA_INOOWORK);
  } catch (x) {
    log("no se pudo subir a Drive el de InooWork (queda en el servidor):", x.message);
  }
}

// Una vez al día los dos completos (y a Drive); cada hora, InooWork en el servidor.
for (;;) {
  await respaldar();
  await respaldarInoowork();
  for (let h = 0; h < 24; h++) {
    await new Promise((r) => setTimeout(r, 3_600_000));
    if (h < 23) await respaldarInooworkHora().catch((x) => log("respaldo de InooWork (hora) falló:", x.message));
  }
}
