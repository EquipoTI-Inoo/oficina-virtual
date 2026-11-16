/** La firma de los enlaces para compartir tableros (16 nov 2026): HMAC con SESION_SECRETO. Solo en el servidor. */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { EnlaceTablero } from "../dominio/compartir-tablero";

function secreto(): string | null {
  const s = process.env.SESION_SECRETO;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "secreto-local-de-desarrollo";
}
const firma = (s: string, proyectoId: string, enlaceId: string) => createHmac("sha256", s).update(`${proyectoId}.${enlaceId}`).digest("base64url").slice(0, 22);

/** El texto que va en la URL: proyecto, id del enlace y firma. null si el portal no tiene secreto configurado. */
export function tokenDe(proyectoId: string, e: EnlaceTablero): string | null {
  const s = secreto();
  if (!s) return null;
  return `${Buffer.from(proyectoId).toString("base64url")}.${e.id}.${firma(s, proyectoId, e.id)}`;
}

/** Lee un token: el proyecto y el id del enlace, solo si la firma es válida. */
export function leerToken(token: unknown): { proyectoId: string; enlaceId: string } | null {
  const s = secreto();
  if (!s || typeof token !== "string" || token.length > 300) return null;
  const [p64, enlaceId, f] = token.split(".");
  if (!p64 || !enlaceId || !f) return null;
  const proyectoId = Buffer.from(p64, "base64url").toString();
  const esperada = Buffer.from(firma(s, proyectoId, enlaceId));
  const dada = Buffer.from(f);
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null;
  return { proyectoId, enlaceId };
}
