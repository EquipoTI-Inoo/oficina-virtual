/**
 * Qué archivos se pueden subir (13 nov, auditoría): además de JPG, PNG, MP4, PDF, Word y Excel, lo que de verdad manda
 * un cliente desde su celular o su diseñador: fotos y videos de iPhone (HEIC, MOV), WebP, logos en SVG, AI, EPS o PSD,
 * PowerPoint y ZIP. Lo usan la API (las dos) y el navegador.
 */
export const MIME_ARCHIVO =
  /^(image\/(jpeg|png|webp|gif|heic|heif|svg\+xml|vnd\.adobe\.photoshop)|video\/(mp4|quicktime)|application\/(pdf|msword|postscript|illustrator|zip|x-zip-compressed|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/;

export const FORMATOS_PERMITIDOS = "fotos y videos (también de iPhone), PDF, Word, Excel, PowerPoint, logos (SVG, AI, EPS, PSD) o ZIP";

/** Algunos navegadores (Windows, con HEIC, AI o PSD) no dan el tipo: se deduce de la extensión. */
const POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", svg: "image/svg+xml",
  psd: "image/vnd.adobe.photoshop", mp4: "video/mp4", mov: "video/quicktime", pdf: "application/pdf", ai: "application/postscript", eps: "application/postscript",
  zip: "application/zip", xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
export function mimeDeArchivo(nombre: string, tipo: string): string {
  if (tipo && MIME_ARCHIVO.test(tipo)) return tipo;
  return POR_EXTENSION[nombre.split(".").pop()?.toLowerCase() ?? ""] ?? tipo;
}
