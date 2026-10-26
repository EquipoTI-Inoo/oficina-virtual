/**
 * Envío directo de los correos automáticos por SMTP (26 oct): el portal arma cada correo y lo manda él,
 * sin pasar por n8n. En local, Mailpit (SMTP en el puerto 1025, bandeja en http://localhost:8025); en
 * producción, cualquier SMTP (Amazon SES, Google Workspace…).
 *
 * Variables: SMTP_HOST, SMTP_PORT (587), SMTP_SEGURO (true = TLS directo, puerto 465), SMTP_USUARIO,
 * SMTP_CLAVE y CORREO_REMITENTE («Inoo <no-responder@inoo.pe>»).
 */
import nodemailer from "nodemailer";

export interface CorreoSaliente { para: string; nombre: string | null; asunto: string; html: string; texto: string }

/** Envía un correo y devuelve su Message-ID. */
export type EnviarCorreo = (c: CorreoSaliente) => Promise<string | null>;

const env = (k: string) => process.env[k]?.trim() || undefined;

/** Cómo se mandan los correos: «portal» (SMTP directo, por defecto) o «n8n» (el workflow correos-por-evento). */
export const correosPor = (): "portal" | "n8n" => (env("CORREOS_POR") === "n8n" ? "n8n" : "portal");

export function remitente() {
  return env("CORREO_REMITENTE") ?? "Inoo <no-responder@inoo.pe>";
}

/** Transporte SMTP según las variables de entorno; null si falta SMTP_HOST. */
export function enviadorSmtp(): EnviarCorreo | null {
  const host = env("SMTP_HOST");
  if (!host) return null;
  const usuario = env("SMTP_USUARIO");
  const transporte = nodemailer.createTransport({
    host,
    port: Number(env("SMTP_PORT") ?? 587),
    secure: env("SMTP_SEGURO") === "true",
    ...(usuario ? { auth: { user: usuario, pass: env("SMTP_CLAVE") ?? "" } } : {}),
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
  return async (c) => {
    const r = await transporte.sendMail({
      from: remitente(),
      to: c.nombre ? { name: c.nombre, address: c.para } : c.para,
      subject: c.asunto,
      html: c.html,
      text: c.texto,
    });
    return r.messageId ?? null;
  };
}
