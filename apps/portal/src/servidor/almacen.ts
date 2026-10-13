/**
 * Archivos en S3 (o MinIO en el entorno local) con URLs prefirmadas: el navegador sube y descarga
 * directo del bucket y la API nunca toca los bytes (arquitectura, flujo de subida en 3 pasos).
 *
 * Firma AWS Signature V4 por query string, sin SDK. Variables:
 *   S3_BUCKET                 bucket (p. ej. inoo-contenido-clientes)
 *   S3_REGION                 región (por defecto us-east-1)
 *   S3_ENDPOINT               solo MinIO u otro compatible: http://minio:9000 (usa rutas /bucket/clave)
 *   S3_ENDPOINT_PUBLICO       opcional: la URL que ve el navegador si difiere de S3_ENDPOINT
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN (opcional)
 */
import { createHash, createHmac } from "node:crypto";
import { ErrorApi } from "./errores";

export interface Almacen {
  /** URL para que el navegador suba el objeto con PUT. */
  urlSubida(clave: string, mime: string, segundos?: number): { url: string; headers: Record<string, string>; expiraEn: string };
  /** URL temporal de descarga; `nombre` es el nombre con el que se guarda el archivo. */
  urlDescarga(clave: string, nombre: string, segundos?: number): { url: string; expiraEn: string };
  /** Tamaño del objeto si existe (HEAD), o null si no se subió. */
  tamano(clave: string): Promise<number | null>;
}

export interface CredencialesS3 {
  bucket: string;
  region: string;
  endpoint?: string;
  endpointPublico?: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const hmac = (k: Buffer | string, t: string) => createHmac("sha256", k).update(t).digest();
/** RFC 3986: todo menos letras, dígitos y - _ . ~ */
const codificar = (t: string) => encodeURIComponent(t).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** Prefirma una petición S3 (SigV4, UNSIGNED-PAYLOAD, solo la cabecera host firmada). */
export function prefirmar(
  c: CredencialesS3,
  metodo: "GET" | "PUT" | "HEAD",
  clave: string,
  segundos: number,
  extra: Record<string, string> = {},
  ahora = new Date(),
  publico = true,
): string {
  const base = publico ? c.endpointPublico ?? c.endpoint : c.endpoint;
  const origen = base ? new URL(base) : new URL(`https://${c.bucket}.s3.${c.region === "us-east-1" ? "" : `${c.region}.`}amazonaws.com`);
  const ruta = (base ? `/${c.bucket}/` : "/") + clave.split("/").map(codificar).join("/");
  const fecha = ahora.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dia = fecha.slice(0, 8);
  const alcance = `${dia}/${c.region}/s3/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${c.accessKeyId}/${alcance}`,
    "X-Amz-Date": fecha,
    "X-Amz-Expires": String(segundos),
    "X-Amz-SignedHeaders": "host",
    ...(c.sessionToken ? { "X-Amz-Security-Token": c.sessionToken } : {}),
    ...extra,
  };
  const consulta = Object.keys(query).sort().map((k) => `${codificar(k)}=${codificar(query[k])}`).join("&");
  const canonica = [metodo, ruta, consulta, `host:${origen.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const aFirmar = ["AWS4-HMAC-SHA256", fecha, alcance, sha256(canonica)].join("\n");
  const llave = hmac(hmac(hmac(hmac(`AWS4${c.secretAccessKey}`, dia), c.region), "s3"), "aws4_request");
  const firma = createHmac("sha256", llave).update(aFirmar).digest("hex");
  return `${origen.protocol}//${origen.host}${ruta}?${consulta}&X-Amz-Signature=${firma}`;
}

export function almacenS3(c: CredencialesS3, enviar: typeof fetch = fetch): Almacen {
  const expira = (s: number) => new Date(Date.now() + s * 1000).toISOString();
  return {
    urlSubida: (clave, mime, segundos = 900) => ({ url: prefirmar(c, "PUT", clave, segundos), headers: { "Content-Type": mime }, expiraEn: expira(segundos) }),
    urlDescarga: (clave, nombre, segundos = 900) => ({
      url: prefirmar(c, "GET", clave, segundos, { "response-content-disposition": `attachment; filename*=UTF-8''${codificar(nombre)}` }),
      expiraEn: expira(segundos),
    }),
    async tamano(clave) {
      const r = await enviar(prefirmar(c, "HEAD", clave, 60, {}, new Date(), false), { method: "HEAD", signal: AbortSignal.timeout(10_000) });
      if (r.status === 404 || r.status === 403) return null;
      if (!r.ok) throw new ErrorApi(502, "ALMACEN_NO_DISPONIBLE", "No pudimos verificar el archivo", "Inténtalo de nuevo en unos minutos.");
      return Number(r.headers.get("content-length") ?? 0);
    },
  };
}

let global: Almacen | null = null;

/** Almacén del proceso según las variables de entorno; 503 si no está configurado. */
export function almacen(): Almacen {
  if (global) return global;
  const { S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ENDPOINT_PUBLICO, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN } = process.env;
  if (!S3_BUCKET || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new ErrorApi(503, "ALMACEN_NO_CONFIGURADO", "La subida de archivos todavía no está configurada", "Faltan S3_BUCKET y las credenciales de AWS en el servidor.");
  }
  global = almacenS3({
    bucket: S3_BUCKET, region: S3_REGION ?? "us-east-1", endpoint: S3_ENDPOINT || undefined, endpointPublico: S3_ENDPOINT_PUBLICO || undefined,
    accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY, sessionToken: AWS_SESSION_TOKEN || undefined,
  });
  return global;
}

/** Solo pruebas: inyecta otro almacén. */
export function usarAlmacen(a: Almacen | null) {
  global = a;
}
