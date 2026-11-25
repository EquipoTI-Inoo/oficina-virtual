/**
 * Carpeta de Drive de un cliente puesta a mano (11 nov 2026): cuando el cliente ya tiene su carpeta, el equipo pega
 * el enlace y n8n no crea otra ni la reemplaza. Se aceptan los enlaces de carpeta de Google Drive.
 */
export function carpetaDeDrive(entrada: unknown): { url: string; id: string } | { error: string } {
  if (typeof entrada !== "string" || !entrada.trim()) return { error: "Pega el enlace de la carpeta de Drive" };
  const s = entrada.trim();
  const m = /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([A-Za-z0-9_-]{10,80})(?:[/?#].*)?$/.exec(s);
  if (!m) return { error: "Tiene que ser el enlace de una carpeta de Google Drive (drive.google.com/drive/folders/…)" };
  return { url: `https://drive.google.com/drive/folders/${m[1]}`, id: m[1] };
}

/** 25 nov: lo que llega para vincular una carpeta (al cliente, a uno de sus servicios o a un proyecto). */
export function validarCarpetaVinculada(b: { url?: unknown; nombre?: unknown; servicio?: unknown; tableroId?: unknown }):
  { datos: { url: string; driveId: string; nombre: string; servicio: string | null; tableroId: string | null }; errores: { campo: string; mensaje: string }[] } {
  const errores: { campo: string; mensaje: string }[] = [];
  const c = carpetaDeDrive(b.url);
  if ("error" in c) errores.push({ campo: "url", mensaje: c.error });
  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : "";
  if (nombre.length < 1 || nombre.length > 80) errores.push({ campo: "nombre", mensaje: "Ponle un nombre (hasta 80 caracteres)" });
  const servicio = typeof b.servicio === "string" && b.servicio.trim() ? b.servicio.trim().slice(0, 40) : null;
  const tableroId = typeof b.tableroId === "string" && /^[A-Za-z0-9_-]{3,60}$/.test(b.tableroId) ? b.tableroId : null;
  if (b.tableroId !== undefined && b.tableroId !== null && !tableroId) errores.push({ campo: "tableroId", mensaje: "Proyecto inválido" });
  return { datos: { url: "error" in c ? "" : c.url, driveId: "error" in c ? "" : c.id, nombre, servicio, tableroId }, errores };
}
