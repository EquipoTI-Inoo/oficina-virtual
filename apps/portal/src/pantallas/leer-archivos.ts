/**
 * Adjuntos del chat de Jarvis (2 nov): el navegador saca el texto de cada archivo y solo eso viaja al portal
 * (texto plano, CSV, PDF y Word). Las imágenes se achican aquí y las lee el portal (src/servidor/jarvis-chat.ts).
 */

export type Adjunto =
  | { nombre: string; texto: string }
  | { nombre: string; imagen: { mime: "image/jpeg"; base64: string }; vista: string };

export const ACEPTA_ADJUNTOS = ".txt,.md,.csv,.tsv,.json,.xml,.html,.htm,.log,.yaml,.yml,.pdf,.docx,image/png,image/jpeg,image/webp";
const TEXTO_MAXIMO = 100_000;
const PESO_MAXIMO = 15 * 1024 * 1024;
const LADO_MAXIMO = 1600;

const recortar = (t: string) => (t.length > TEXTO_MAXIMO ? `${t.slice(0, TEXTO_MAXIMO)}\n[… recortado: el archivo sigue]` : t);

/** El texto del archivo, o un Error con el motivo para mostrarlo tal cual. */
export async function leerAdjunto(f: File): Promise<Adjunto> {
  if (f.size > PESO_MAXIMO) throw new Error(`«${f.name}» pesa más de 15 MB`);
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  if (f.type.startsWith("image/")) return imagen(f);
  let texto: string;
  if (ext === "pdf") texto = await textoDePdf(f);
  else if (ext === "docx") texto = await textoDeDocx(f);
  else if (ext === "doc" || ext === "xls" || ext === "xlsx" || ext === "ppt" || ext === "pptx") throw new Error(`«${f.name}»: guárdalo como PDF, Word (.docx) o CSV`);
  else texto = await f.text();
  if (!texto.trim()) throw new Error(`No encontramos texto en «${f.name}»${ext === "pdf" ? " (si es escaneado, súbelo como imagen)" : ""}`);
  return { nombre: f.name, texto: recortar(texto) };
}

async function textoDePdf(f: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  const paginas: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    paginas.push(c.items.map((x) => ("str" in x ? x.str + (x.hasEOL ? "\n" : " ") : "")).join(""));
    if (paginas.join("").length > TEXTO_MAXIMO) break;
  }
  return paginas.map((p, i) => `[Página ${i + 1}]\n${p.trim()}`).join("\n\n");
}

/** Word (.docx) es un zip: se busca word/document.xml y se deja el texto, un párrafo por línea. */
async function textoDeDocx(f: File): Promise<string> {
  const datos = new Uint8Array(await f.arrayBuffer());
  const xml = await archivoDelZip(datos, "word/document.xml");
  if (xml === null) throw new Error(`«${f.name}» no parece un Word válido`);
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

async function archivoDelZip(zip: Uint8Array, nombre: string): Promise<string | null> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Fin del directorio central: firma 0x06054b50, a lo sumo 64 KB antes del final.
  let fin = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) return null;
  let p = v.getUint32(fin + 16, true);
  const total = v.getUint16(fin + 10, true);
  const dec = new TextDecoder();
  for (let n = 0; n < total && v.getUint32(p, true) === 0x02014b50; n++) {
    const metodo = v.getUint16(p + 10, true);
    const tam = v.getUint32(p + 20, true);
    const largoNombre = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comentario = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    if (dec.decode(zip.subarray(p + 46, p + 46 + largoNombre)) === nombre) {
      const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const crudo = zip.subarray(inicio, inicio + tam);
      if (metodo === 0) return dec.decode(crudo);
      if (metodo !== 8) return null;
      const flujo = new Blob([new Uint8Array(crudo)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(flujo).text();
    }
    p += 46 + largoNombre + extra + comentario;
  }
  return null;
}

/** JPG de hasta 1600 px por lado: alcanza para leer texto y pesa poco. */
async function imagen(f: File): Promise<Adjunto> {
  const bmp = await createImageBitmap(f).catch(() => {
    throw new Error(`No pudimos abrir la imagen «${f.name}»`);
  });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bmp.width, bmp.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bmp.width * escala);
  lienzo.height = Math.round(bmp.height * escala);
  const ctx = lienzo.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
  const vista = lienzo.toDataURL("image/jpeg", 0.85);
  return { nombre: f.name, imagen: { mime: "image/jpeg", base64: vista.split(",")[1] }, vista };
}
