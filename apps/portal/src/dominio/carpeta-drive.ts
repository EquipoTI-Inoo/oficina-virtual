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
