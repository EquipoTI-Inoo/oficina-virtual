/**
 * Excel (.xlsx) mínimo sin dependencias, para el reporte del proyecto (reunión 15 oct: «que se pueda
 * bajar en Excel»). Un .xlsx es un zip de XML; aquí el zip va sin compresión (método «store») y con
 * CRC-32, que es todo lo que Excel, Numbers y Google Sheets necesitan. Textos como cadenas en línea,
 * números como números y la primera fila en negrita.
 */

export type Celda = string | number | null | undefined;
export interface Hoja {
  nombre: string;
  filas: Celda[][];
  /** Ancho de cada columna en caracteres. */
  anchos?: number[];
}

// ───────────────────────────── CRC-32 y zip «store»

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip sin compresión. Fecha fija (1 ene 2026) para que el archivo sea reproducible. */
export function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const HORA = 0;
  const FECHA = ((2026 - 1980) << 9) | (1 << 5) | 1;
  let offset = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, HORA, true);
    local.setUint16(12, FECHA, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.datos.length, true);
    local.setUint32(22, a.datos.length, true);
    local.setUint16(26, nombre.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, HORA, true);
    c.setUint16(14, FECHA, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nombre);
    offset += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((t, x) => t + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((t, x) => t + x.length, 0));
  let i = 0;
  for (const x of todo) {
    salida.set(x, i);
    i += x.length;
  }
  return salida;
}

// ───────────────────────────── libro de Excel

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const columna = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : columna(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
/** Excel no acepta en el nombre de la hoja : \ / ? * [ ] y lo corta en 31 caracteres. */
const nombreHoja = (s: string) => s.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);

function hojaXml(h: Hoja): string {
  const cols = h.anchos?.length ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const filas = h.filas
    .map((fila, r) => {
      const celdas = fila
        .map((v, c) => {
          if (v === null || v === undefined || v === "") return "";
          const ref = `${columna(c)}${r + 1}`;
          const estilo = r === 0 ? ' s="1"' : "";
          return typeof v === "number" && Number.isFinite(v)
            ? `<c r="${ref}"${estilo}><v>${v}</v></c>`
            : `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${celdas}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${filas}</sheetData></worksheet>`;
}

/** Arma el .xlsx con una hoja por elemento de `hojas`. */
export function libroXlsx(hojas: Hoja[]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const f = (nombre: string, xml: string) => ({ nombre, datos: enc.encode(xml) });
  const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    f("[Content_Types].xml", `${cab}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`),
    f("_rels/.rels", `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    f("xl/workbook.xml", `${cab}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${esc(nombreHoja(h.nombre))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`),
    f("xl/_rels/workbook.xml.rels", `${cab}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    f("xl/styles.xml", `${cab}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
    ...hojas.map((h, i) => f(`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h))),
  ]);
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
