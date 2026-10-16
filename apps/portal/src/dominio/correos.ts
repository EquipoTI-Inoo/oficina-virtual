/**
 * Correos automáticos (INO-04): qué evento del outbox dispara qué correo, a quién y con qué texto.
 * La API arma el correo (POST /integraciones/correos/preparar) y n8n solo lo envía por SMTP, así los
 * textos se revisan en el repo y se prueban. Las reglas activas viven en `regla_correo` (migración 0017).
 */

/** A quién va: decisores del cliente (ADMIN_CLIENTE y APROBADOR), quien hizo la acción, el equipo Inoo
 * («AM»: el responsable de cada servicio del evento, o el AM de la cuenta si el evento no es de un servicio),
 * la persona invitada o quien abrió el ticket. */
export type Destino = "DECISORES" | "ACTOR" | "AM" | "INVITADO" | "CREADOR_TICKET";

export interface ContextoCorreo {
  cliente: string;
  actor?: string | null;
  pieza?: string | null;
  numero?: number | null;
  periodo?: string | null;
  requerimiento?: string | null;
  fechaLimite?: string | null;
  diasAtraso?: number | null;
  respuestaAntesDe?: string | null;
  comentario?: string | null;
  /** Títulos de los servicios del evento (standby). */
  servicios?: string[] | null;
  fechaStandby?: string | null;
  diasSinActividad?: number | null;
  /** Enlace al lugar del portal donde se ve el detalle. */
  enlace: string;
}

interface Plantilla {
  destinos: Destino[];
  asunto: (c: ContextoCorreo, d: Destino) => string;
  parrafos: (c: ContextoCorreo, d: Destino) => string[];
  boton: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** "2026-10-16" → "16 de octubre"; "2026-10" → "octubre 2026". */
export function fechaLarga(f: string | null | undefined): string {
  if (!f) return "";
  const [a, m, d] = f.slice(0, 10).split("-").map(Number);
  return d ? `${d} de ${MESES[m - 1]}` : `${MESES[m - 1]} ${a}`;
}

export const PLANTILLAS_CORREO: Record<string, Plantilla> = {
  "pieza.lista_revision": {
    destinos: ["DECISORES"],
    asunto: (c) => `«${c.pieza}» está lista para tu revisión`,
    parrafos: (c) => [`Tu equipo Inoo terminó «${c.pieza}» para ${c.cliente}.`, "Revísala y apruébala o pide cambios desde el portal."],
    boton: "Revisar la pieza",
  },
  "pieza.aprobada": {
    destinos: ["ACTOR", "AM"],
    asunto: (c, d) => (d === "AM" ? `${c.actor} aprobó «${c.pieza}»` : `Aprobaste «${c.pieza}»`),
    parrafos: (c, d) => (d === "AM"
      ? [`${c.actor} (${c.cliente}) aprobó «${c.pieza}» desde el portal.`, "Ya puedes programarla."]
      : [`Registramos tu aprobación de «${c.pieza}».`, "Nos encargamos de programarla y te avisamos cuando se publique."]),
    boton: "Ver la pieza",
  },
  "pieza.cambios_solicitados": {
    destinos: ["ACTOR", "AM"],
    asunto: (c, d) => (d === "AM" ? `${c.actor} pidió cambios en «${c.pieza}»` : `Recibimos tus cambios para «${c.pieza}»`),
    parrafos: (c, d) => {
      const nota = c.comentario ? [`Comentario: «${c.comentario}»`] : [];
      return d === "AM"
        ? [`${c.actor} (${c.cliente}) pidió cambios en «${c.pieza}».`, ...nota]
        : [`Recibimos tus cambios para «${c.pieza}». Te avisamos cuando la nueva versión esté lista.`, ...nota];
    },
    boton: "Ver la pieza",
  },
  "brief.enviado": {
    destinos: ["AM"],
    asunto: (c) => `${c.actor} envió el brief de ${fechaLarga(c.periodo)}`,
    parrafos: (c) => [`${c.cliente} envió el brief de ${fechaLarga(c.periodo)}.`, "Revísalo y confírmalo para que los agentes empiecen a trabajar."],
    boton: "Abrir el brief",
  },
  "ticket.creado": {
    destinos: ["ACTOR"],
    asunto: (c) => `Recibimos tu ticket #${c.numero}`,
    parrafos: (c) => [
      `Registramos tu ticket #${c.numero}.`,
      c.respuestaAntesDe ? `Te respondemos a más tardar el ${c.respuestaAntesDe}.` : "Te respondemos lo antes posible.",
    ],
    boton: "Ver el ticket",
  },
  "ticket.resuelto": {
    destinos: ["CREADOR_TICKET"],
    asunto: (c) => `Ticket #${c.numero} resuelto`,
    parrafos: (c) => [`Tu equipo Inoo marcó como resuelto el ticket #${c.numero}.`, "Si algo sigue sin funcionar, puedes reabrirlo durante los próximos 7 días."],
    boton: "Ver el ticket",
  },
  "miembro.invitado": {
    destinos: ["INVITADO"],
    asunto: (c) => `Te damos la bienvenida al portal de ${c.cliente}`,
    parrafos: (c) => [
      c.actor ? `${c.actor} te dio acceso al portal de ${c.cliente} en Inoo.` : `Ya tienes acceso al portal de ${c.cliente} en Inoo.`,
      "Ahí revisas y apruebas los contenidos, sigues el avance de tus servicios y hablas con tu equipo.",
      "Ingresa con este mismo correo.",
    ],
    boton: "Entrar al portal",
  },
  "requerimiento.creado": {
    destinos: ["DECISORES"],
    asunto: (c) => `Te pedimos: ${c.requerimiento} (hasta el ${fechaLarga(c.fechaLimite)})`,
    parrafos: (c) => [`Para avanzar con tu servicio necesitamos «${c.requerimiento}».`, `Envíanoslo desde el portal hasta el ${fechaLarga(c.fechaLimite)}.`],
    boton: "Responder",
  },
  "requerimiento.atrasado": {
    destinos: ["DECISORES"],
    asunto: (c) => `No podemos avanzar sin «${c.requerimiento}»`,
    parrafos: (c) => [
      `«${c.requerimiento}» venció el ${fechaLarga(c.fechaLimite)}${c.diasAtraso ? ` y lleva ${c.diasAtraso} ${c.diasAtraso === 1 ? "día hábil" : "días hábiles"} de atraso` : ""}.`,
      "Mientras no lo tengamos, las fechas de tu servicio se corren. Envíalo desde el portal para retomar.",
    ],
    boton: "Responder",
  },
  "requerimiento.enviado": {
    destinos: ["AM"],
    asunto: (c) => `${c.actor} envió «${c.requerimiento}»`,
    parrafos: (c) => [`${c.cliente} respondió «${c.requerimiento}».`, "Revísalo y apruébalo u obsérvalo."],
    boton: "Revisar",
  },
  "servicio.standby_proximo": {
    destinos: ["DECISORES", "AM"],
    asunto: (c, d) => (d === "AM" ? `${c.cliente} lleva ${c.diasSinActividad} días sin entrar al portal` : `Tus servicios pasarán a standby el ${fechaLarga(c.fechaStandby)}`),
    parrafos: (c, d) => (d === "AM"
      ? [`Nadie de ${c.cliente} usa el portal hace ${c.diasSinActividad} días.`, `Si no entran hasta el ${fechaLarga(c.fechaStandby)}, pasan a standby: ${lista(c.servicios)}.`, "Es un buen momento para contactarlos."]
      : [
          `Hace ${c.diasSinActividad} días que nadie de ${c.cliente} entra al portal.`,
          `Si no hay actividad hasta el ${fechaLarga(c.fechaStandby)}, pondremos en standby ${lista(c.servicios)} y dejaremos de avanzar hasta que vuelvas.`,
          "Para mantenerlos activos basta con entrar al portal.",
        ]),
    boton: "Entrar al portal",
  },
  "servicio.standby": {
    destinos: ["DECISORES", "AM"],
    asunto: (c, d) => (d === "AM" ? `Los servicios de ${c.cliente} pasaron a standby` : "Tus servicios están en standby"),
    parrafos: (c, d) => (d === "AM"
      ? [`${c.cliente} cumplió ${c.diasSinActividad} días sin entrar al portal y pasaron a standby: ${lista(c.servicios)}.`, "Se reactivan solos cuando alguien del cliente vuelva a usar el portal."]
      : [`Como nadie de ${c.cliente} entró al portal en ${c.diasSinActividad} días, pusimos en standby ${lista(c.servicios)}.`, "Entra al portal cuando quieras retomar: tus servicios se reactivan solos."]),
    boton: "Entrar al portal",
  },
};

/** "A", "A y B", "A, B y C". */
const lista = (xs: string[] | null | undefined) => {
  const v = (xs ?? []).map((x) => `«${x}»`);
  return v.length <= 1 ? v.join("") || "tus servicios" : `${v.slice(0, -1).join(", ")} y ${v[v.length - 1]}`;
};

/** Qué regla de correo corresponde a un evento del outbox (null = ese evento no manda correo). */
export function reglaDeEvento(tipo: string, datos: Record<string, unknown>): string | null {
  if (tipo === "pieza.estado_cambiado") {
    if (datos.estado === "LISTO_REVISION") return "pieza.lista_revision";
    // Solo las decisiones del cliente; las del equipo (blogs) no generan correo.
    if (datos.canal === "PORTAL" && datos.estado === "APROBADO_CLIENTE") return "pieza.aprobada";
    if (datos.canal === "PORTAL" && datos.estado === "CAMBIOS_SOLICITADOS") return "pieza.cambios_solicitados";
    return null;
  }
  if (tipo === "ticket.estado_cambiado") return datos.estado === "RESUELTO" && datos.deEstado !== "RESUELTO" ? "ticket.resuelto" : null;
  return PLANTILLAS_CORREO[tipo] ? tipo : null;
}

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Asunto, HTML (estilos en línea, apto para clientes de correo) y texto plano. */
export function renderizarCorreo(regla: string, c: ContextoCorreo, d: Destino, nombre: string | null) {
  const p = PLANTILLAS_CORREO[regla];
  const saludo = nombre ? `Hola, ${nombre.split(" ")[0]}:` : "Hola:";
  const parrafos = p.parrafos(c, d);
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F3F1EC;font-family:Arial,Helvetica,sans-serif;color:#1F2A24">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px">
<tr><td style="padding:28px 32px 8px;font-size:13px;letter-spacing:.08em;color:#5B6B60">INOO · ${escapar(c.cliente)}</td></tr>
<tr><td style="padding:8px 32px 0;font-size:16px;line-height:1.5">
<p style="margin:0 0 16px">${escapar(saludo)}</p>
${parrafos.map((x) => `<p style="margin:0 0 16px">${escapar(x)}</p>`).join("\n")}
</td></tr>
<tr><td style="padding:8px 32px 32px"><a href="${escapar(c.enlace)}" style="display:inline-block;background:#3F5547;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px">${escapar(p.boton)}</a></td></tr>
</table>
<p style="font-size:12px;color:#5B6B60;margin:16px 0 0">Recibes este correo porque tienes acceso al portal de Inoo. Es un aviso automático; para responder, escríbenos desde el portal.</p>
</td></tr></table></body></html>`;
  const texto = [saludo, "", ...parrafos, "", `${p.boton}: ${c.enlace}`].join("\n");
  return { asunto: p.asunto(c, d), html, texto };
}
