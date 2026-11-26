/**
 * Calendario del equipo (26 nov 2026): lee los calendarios de planning@inoo.pe con la conexión del servidor
 * (PLANNING_REFRESH_TOKEN, scripts/autorizar-planning.mjs). Solo lectura. Guarda un minuto lo leído para que abrir
 * el calendario muchas veces no le pida a Google cada vez.
 */
import { normalizarEvento, type EventoCrudo, type EventoGoogle } from "../dominio/calendario-equipo";

const API = "https://www.googleapis.com/calendar/v3";
type Enviar = typeof fetch;
let enviar: Enviar = (...a) => fetch(...a);
/** Solo pruebas: otra forma de llamar a Google. */
export function usarFetchCalendario(f: Enviar | null) {
  enviar = f ?? ((...a) => fetch(...a));
  token = null;
  calendarios = null;
  copias.clear();
}

export const calendarioEquipoConectado = () => !!(process.env.DRIVE_CLIENT_ID && process.env.DRIVE_CLIENT_SECRET && process.env.PLANNING_REFRESH_TOKEN);

let token: { valor: string; vence: number } | null = null;
async function acceso() {
  if (token && token.vence > Date.now()) return token.valor;
  const e = process.env;
  const r = await enviar("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: e.DRIVE_CLIENT_ID!, client_secret: e.DRIVE_CLIENT_SECRET!, refresh_token: e.PLANNING_REFRESH_TOKEN! }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Google respondió ${r.status} al renovar el acceso de planning@`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { valor: j.access_token, vence: Date.now() + (j.expires_in - 60) * 1000 };
  return token.valor;
}
async function pedir<T>(ruta: string): Promise<T> {
  const r = await enviar(`${API}${ruta}`, { headers: { authorization: `Bearer ${await acceso()}` }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Google Calendar respondió ${r.status}`);
  return (await r.json()) as T;
}

export interface CalendarioEquipo { id: string; nombre: string; color: string }
let calendarios: { hasta: number; datos: CalendarioEquipo[] } | null = null;
/** Los calendarios de planning@ (sin los de feriados: el portal ya tiene los suyos). Se guardan 10 minutos. */
export async function calendariosEquipo(): Promise<CalendarioEquipo[]> {
  if (calendarios && calendarios.hasta > Date.now()) return calendarios.datos;
  const r = await pedir<{ items: { id: string; summary: string; summaryOverride?: string; backgroundColor?: string }[] }>("/users/me/calendarList?maxResults=50");
  const datos = r.items
    .filter((c) => !/holiday|festivos|feriados/i.test(`${c.id} ${c.summary}`))
    .map((c) => ({ id: c.id, nombre: (c.summaryOverride ?? c.summary).trim(), color: c.backgroundColor ?? "#7986cb" }));
  calendarios = { hasta: Date.now() + 10 * 60_000, datos };
  return datos;
}

const copias = new Map<string, { hasta: number; datos: Promise<EventoGoogle[]> }>();
/** Los eventos de todos los calendarios del equipo entre dos días de Lima (inclusive). */
export function eventosEquipo(desde: string, hasta: string): Promise<EventoGoogle[]> {
  const k = `${desde}|${hasta}`;
  const c = copias.get(k);
  if (c && c.hasta > Date.now()) return c.datos;
  const datos = (async () => {
    const min = new Date(`${desde}T05:00:00Z`).toISOString(); // 00:00 en Lima
    const max = new Date(new Date(`${hasta}T05:00:00Z`).getTime() + 86_400_000).toISOString();
    const xs: EventoGoogle[] = [];
    for (const cal of await calendariosEquipo()) {
      let pagina: string | undefined;
      do {
        const q = new URLSearchParams({ timeMin: min, timeMax: max, singleEvents: "true", orderBy: "startTime", maxResults: "250", ...(pagina ? { pageToken: pagina } : {}) });
        const r = await pedir<{ items?: EventoCrudo[]; nextPageToken?: string }>(`/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
        for (const e of r.items ?? []) {
          const n = normalizarEvento(cal, e);
          if (n && n.fecha >= desde && n.fecha <= hasta) xs.push(n);
        }
        pagina = r.nextPageToken;
      } while (pagina);
    }
    return xs;
  })();
  copias.set(k, { hasta: Date.now() + 60_000, datos });
  datos.catch(() => copias.delete(k));
  if (copias.size > 50) for (const [x, v] of copias) if (v.hasta < Date.now()) copias.delete(x);
  return datos;
}

/** Un evento por su clave («calendario|evento»), para avisar a quien se menciona. */
export async function eventoEquipo(clave: string): Promise<EventoGoogle | null> {
  const [calId, id] = clave.split("|");
  if (!calId || !id) return null;
  const cal = (await calendariosEquipo()).find((c) => c.id === calId);
  if (!cal) return null;
  try {
    return normalizarEvento(cal, await pedir<EventoCrudo>(`/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(id)}`));
  } catch {
    return null;
  }
}
