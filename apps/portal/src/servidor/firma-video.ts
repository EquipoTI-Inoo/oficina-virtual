/**
 * Firmas cortas para los videos de los tableros (18 nov 2026): la subida directa a Drive (qué video y dónde va) y
 * el enlace con que el reproductor lo mira por tramos (el <video> no manda la sesión del portal). HMAC con
 * SESION_SECRETO; solo en el servidor.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secreto(): string | null {
  const s = process.env.SESION_SECRETO;
  if (s) return `video:${s}`;
  return process.env.NODE_ENV === "production" ? null : "video:secreto-local-de-desarrollo";
}
const firma = (s: string, datos: string) => createHmac("sha256", s).update(datos).digest("base64url");

export function firmarVideo(datos: Record<string, unknown>, segundos: number): string | null {
  const s = secreto();
  if (!s) return null;
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, e: Date.now() + segundos * 1000 })).toString("base64url");
  return `${cuerpo}.${firma(s, cuerpo)}`;
}

export function leerVideo<T extends Record<string, unknown>>(token: unknown): T | null {
  const s = secreto();
  if (!s || typeof token !== "string" || token.length > 2000) return null;
  const [cuerpo, f] = token.split(".");
  if (!cuerpo || !f) return null;
  const a = Buffer.from(f);
  const b = Buffer.from(firma(s, cuerpo));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const x = JSON.parse(Buffer.from(cuerpo, "base64url").toString()) as T & { e: number };
    return x.e > Date.now() ? x : null;
  } catch {
    return null;
  }
}
