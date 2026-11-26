"use client";
/**
 * Calendario del colaborador (2 nov 2026): todo lo que le toca a una persona del equipo, no solo el plan de
 * contenido de los clientes. Vistas de mes, semana y día; filtros por tipo; pendientes y eventos propios
 * (con invitados del equipo); y la conexión con Google Calendar, simulada hasta que TI la active.
 * El plan de contenido mensual sigue en «Planes de contenido» (/equipo/calendarios).
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LuCalendarPlus, LuCheck, LuChevronLeft, LuChevronRight, LuExternalLink, LuPencil, LuPlus, LuTrash2, LuUsers, LuTriangleAlert } from "react-icons/lu";
import { api, Enlace, HOY_PORTAL, ProblemaApi, useConsulta, type S } from "../base";
import { TextoConEnlaces, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso, usePortal, confirmar } from "../componentes";
import type { TipoAgenda } from "../dominio/agenda";
import { usePersonaDeLaUrl } from "./mi-panel";

type Evento = S<"EventoAgenda">;
type Vista = "MES" | "SEMANA" | "DIA";

const TIPOS: { tipo: TipoAgenda; nombre: string; color: string }[] = [
  { tipo: "REUNION", nombre: "Reuniones de proyecto", color: "var(--c-primario)" },
  { tipo: "EVENTO", nombre: "Mis eventos", color: "var(--c-info)" },
  { tipo: "TAREA", nombre: "Vencimiento de tareas", color: "var(--c-semaforo-naranja)" },
  { tipo: "REQUERIMIENTO", nombre: "Entregas del cliente", color: "var(--c-categoria-violeta)" },
  { tipo: "PENDIENTE", nombre: "Pendientes", color: "var(--c-semaforo-verde)" },
  { tipo: "FERIADO", nombre: "Feriados", color: "var(--c-semaforo-rojo)" },
];
const COLOR = Object.fromEntries(TIPOS.map((t) => [t.tipo, t.color])) as Record<TipoAgenda, string>;
/** 26 nov: un evento del calendario del equipo va con el color de su calendario de Google. */
const colorDe = (e: Evento) => e.color ?? COLOR[e.tipo];
/** En «Mi calendario», lo del calendario del equipo tiene su propio filtro (no es «Mis eventos»). */
type Filtro = TipoAgenda | "EQUIPO";
const filtroDe = (e: Evento): Filtro => (e.origen === "EQUIPO" ? "EQUIPO" : e.tipo);
const FILTROS: { tipo: Filtro; nombre: string; color: string }[] = [...TIPOS.slice(0, 2), { tipo: "EQUIPO", nombre: "Calendario del equipo", color: "#0b8043" }, ...TIPOS.slice(2)];
const NOMBRE_TIPO: Record<TipoAgenda, string> = { REUNION: "Reunión de proyecto", EVENTO: "Evento", TAREA: "Vence una tarea", REQUERIMIENTO: "Entrega del cliente", PENDIENTE: "Pendiente", FERIADO: "Feriado" };

// ───────────────────────────── fechas (AAAA-MM-DD, a mediodía UTC para no cruzar de día)

const aFecha = (f: string) => new Date(`${f}T12:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (f: string, n: number) => aTexto(new Date(aFecha(f).getTime() + n * 86_400_000));
const lunesDe = (f: string) => sumarDias(f, -((aFecha(f).getUTCDay() + 6) % 7));
const primeroDeMes = (f: string) => `${f.slice(0, 7)}-01`;
const sumarMeses = (f: string, n: number) => {
  const d = aFecha(primeroDeMes(f));
  d.setUTCMonth(d.getUTCMonth() + n);
  return aTexto(d);
};
const fmt = (f: string, o: Intl.DateTimeFormatOptions) => aFecha(f).toLocaleDateString("es-PE", { timeZone: "UTC", ...o });
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

function rangoDe(vista: Vista, ancla: string) {
  if (vista === "DIA") return { desde: ancla, hasta: ancla };
  if (vista === "SEMANA") return { desde: lunesDe(ancla), hasta: sumarDias(lunesDe(ancla), 6) };
  const desde = lunesDe(primeroDeMes(ancla));
  return { desde, hasta: sumarDias(desde, 41) };
}

function tituloDe(vista: Vista, ancla: string) {
  if (vista === "MES") return mayus(fmt(ancla, { month: "long", year: "numeric" }));
  if (vista === "DIA") return mayus(fmt(ancla, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  const l = lunesDe(ancla);
  const d = sumarDias(l, 6);
  return l.slice(0, 7) === d.slice(0, 7) ? `${fmt(l, { day: "numeric" })} – ${fmt(d, { day: "numeric", month: "long", year: "numeric" })}` : `${fmt(l, { day: "numeric", month: "short" })} – ${fmt(d, { day: "numeric", month: "short", year: "numeric" })}`;
}

function leerVista(): Vista {
  try {
    const v = localStorage.getItem("inoo.calendario.vista");
    // 11 nov: en el celular la semana no entra (7 columnas); si no eligió otra, abre en el día.
    const porDefecto: Vista = window.innerWidth < 640 ? "DIA" : "SEMANA";
    return v === "MES" || v === "SEMANA" || v === "DIA" ? v : porDefecto;
  } catch {
    return "SEMANA";
  }
}

// ───────────────────────────── pantalla

export function PantallaCalendario() {
  return (
    <Estructura espacio="equipo" migas="Calendario">
      <Calendario />
    </Estructura>
  );
}

type Nuevo = { fecha: string; hora: string | null };

function Calendario() {
  const hoy = HOY_PORTAL;
  const [vista, setVista] = useState<Vista>("SEMANA");
  const [ancla, setAncla] = useState(hoy);
  const [ocultos, setOcultos] = useState<Set<Filtro>>(new Set());
  const [abierto, setAbierto] = useState<Evento | null>(null);
  const [editando, setEditando] = useState<Evento | Nuevo | null>(null);
  const [google, setGoogle] = useState(false);
  // 26 nov: «Equipo» es el calendario compartido de planning@ (?equipo=1 lo abre directo, &fecha= en ese día).
  const [modo, setModo] = useState<"MIO" | "EQUIPO">("MIO");
  const [calOcultos, setCalOcultos] = useState<Set<string>>(new Set());
  const [soloMio, setSoloMio] = useState(false);
  const yoId = usePortal().sesion?.usuario.id ?? null;
  useEffect(() => setVista(leerVista()), []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("equipo") === "1") setModo("EQUIPO");
    const f = q.get("fecha");
    if (f && /^\d{4}-\d{2}-\d{2}$/.test(f)) setAncla(f);
  }, []);
  // 18 nov: al volver de Google (Conectar), se avisa cómo quedó.
  const avisarVuelta = useAviso();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("conexion");
    if (!r || q.get("proveedor") !== "google-calendar") return;
    avisarVuelta(r === "ok" ? { titulo: "Google Calendar conectado", texto: "Tus reuniones de Google ya se ven aquí." } : { titulo: "No se conectó Google Calendar", texto: q.get("motivo") ?? undefined });
    window.history.replaceState(null, "", window.location.pathname);
  }, [avisarVuelta]);
  const cambiarVista = (v: Vista) => {
    setVista(v);
    try {
      localStorage.setItem("inoo.calendario.vista", v);
    } catch {
      /* sin almacenamiento: solo no se recuerda */
    }
  };
  const { desde, hasta } = rangoDe(vista, ancla);
  // 2 nov: el lead (o el ADMIN) puede ver el calendario de alguien de su área, sin sus pendientes.
  const quien = usePersonaDeLaUrl();
  const enEquipo = modo === "EQUIPO" && !quien;
  const mia = useConsulta<S<"Agenda">>(enEquipo ? null : `/me/agenda?desde=${desde}&hasta=${hasta}${quien ? `&usuarioId=${quien}` : ""}`);
  const delEquipo = useConsulta<{ conectado: boolean; calendarios: { nombre: string; color: string }[]; eventos: Evento[] }>(enEquipo ? `/equipo/calendario?desde=${desde}&hasta=${hasta}` : null);
  const agenda = enEquipo ? delEquipo : mia;
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>(quien ? "/panel/equipo" : null);
  const deQuien = equipo.datos?.datos.find((p) => p.id === quien);
  const esMio = (e: Evento) => !!yoId && !!e.equipo && (e.equipo.responsable?.id === yoId || e.equipo.menciones.some((m) => m.id === yoId) || e.equipo.invitadosEquipo.some((m) => m.id === yoId));
  const visibles = useMemo(
    () => enEquipo
      ? (delEquipo.datos?.eventos ?? []).filter((e) => !calOcultos.has(e.equipo?.calendario ?? "") && (!soloMio || esMio(e)))
      : (mia.datos?.eventos ?? []).filter((e) => !ocultos.has(filtroDe(e))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enEquipo, delEquipo.datos, mia.datos, ocultos, calOcultos, soloMio, yoId],
  );
  const mover = (n: number) => setAncla(vista === "MES" ? sumarMeses(ancla, n) : sumarDias(ancla, n * (vista === "SEMANA" ? 7 : 1)));
  const irAlDia = (f: string) => {
    setAncla(f);
    cambiarVista("DIA");
  };
  const g = mia.datos?.google;

  return (
    <>
      {quien && (
        <Enlace a="/equipo/calendario" className="volver">
          ← Volver a mi calendario
        </Enlace>
      )}
      <Cabecera
        titulo={quien ? `Calendario de ${deQuien?.nombre ?? "…"}` : "Calendario"}
        bajada={quien ? "Sus reuniones, eventos y vencimientos. Sus pendientes personales no se muestran."
          : enEquipo ? "El calendario compartido de planning@inoo.pe. Aquí se ve de quién es cada evento y de qué cliente, y puedes mencionar a alguien; en Google no cambia nada."
          : "Tus reuniones, pendientes, vencimientos de tareas, lo que deben entregar tus clientes y lo del calendario del equipo que te toca."}
        accion={quien || enEquipo ? undefined : (
          <button className="boton boton--primario" onClick={() => setEditando({ fecha: vista === "MES" ? hoy : ancla, hora: null })}>
            <LuPlus size={18} /> Nuevo
          </button>
        )}
      />
      {!quien && (
        <div className="segmentado" role="tablist" aria-label="Qué calendario" style={{ marginBottom: 14 }}>
          <button role="tab" aria-selected={!enEquipo} className={!enEquipo ? "activo" : undefined} onClick={() => setModo("MIO")}>Mi calendario</button>
          <button role="tab" aria-selected={enEquipo} className={enEquipo ? "activo" : undefined} onClick={() => setModo("EQUIPO")}>Equipo</button>
        </div>
      )}
      <div className="calendario">
        <aside className="calendario-lateral" aria-label="Filtros del calendario">
          <MiniMes ancla={ancla} hoy={hoy} alElegir={setAncla} />
          {enEquipo ? (
            <div className="pila" style={{ gap: 4 }}>
              <p className="calendario-subtitulo">Calendarios de planning@</p>
              {delEquipo.datos && !delEquipo.datos.conectado && <p className="texto-xs texto-muted">El calendario del equipo no está conectado en este portal.</p>}
              {(delEquipo.datos?.calendarios ?? []).map((c) => {
                const n = (delEquipo.datos?.eventos ?? []).filter((e) => e.equipo?.calendario === c.nombre).length;
                return (
                  <label key={c.nombre} className="calendario-filtro">
                    <input type="checkbox" checked={!calOcultos.has(c.nombre)} style={{ accentColor: c.color }}
                      onChange={() => setCalOcultos((o) => { const x = new Set(o); if (x.has(c.nombre)) x.delete(c.nombre); else x.add(c.nombre); return x; })} />
                    <span style={{ flex: 1 }}>{c.nombre}</span>
                    <span className="texto-xs texto-muted">{n || ""}</span>
                  </label>
                );
              })}
              <label className="calendario-filtro" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={soloMio} onChange={() => setSoloMio((x) => !x)} />
                <span style={{ flex: 1 }}>Solo lo mío</span>
              </label>
              <p className="texto-xs texto-muted">Donde estás a cargo, te mencionaron o te invitaron.</p>
            </div>
          ) : (
          <div className="pila" style={{ gap: 4 }}>
            <p className="calendario-subtitulo">Qué ver</p>
            {FILTROS.map((t) => {
              const n = (agenda.datos?.eventos ?? []).filter((e) => filtroDe(e) === t.tipo).length;
              return (
                <label key={t.tipo} className="calendario-filtro">
                  <input
                    type="checkbox"
                    checked={!ocultos.has(t.tipo)}
                    onChange={() => setOcultos((o) => { const x = new Set(o); if (x.has(t.tipo)) x.delete(t.tipo); else x.add(t.tipo); return x; })}
                    style={{ accentColor: t.color }}
                  />
                  <span style={{ flex: 1 }}>{t.nombre}</span>
                  <span className="texto-xs texto-muted">{n || ""}</span>
                </label>
              );
            })}
          </div>
          )}
          {!quien && !enEquipo && (g?.real || !g?.simulada || !!process.env.NEXT_PUBLIC_FECHA_FIJA) && <div className="tarjeta calendario-google">
            <p className="negrita texto-sm fila" style={{ gap: 8 }}>
              <LogoGoogle /> Google Calendar
            </p>
            {g?.conectado ? (
              <p className="texto-xs texto-muted">Conectado como {g.correo}{g.simulada ? " · conexión de prueba" : ""}</p>
            ) : (
              <p className="texto-xs texto-muted">Ve tus reuniones de Google aquí y lleva lo del portal a tu Google.</p>
            )}
            <button className="boton boton--chico" onClick={() => setGoogle(true)}>{g?.conectado ? "Administrar" : "Conectar"}</button>
          </div>}
          <Enlace a="/equipo/calendarios" className="enlace texto-sm">Planes de contenido de clientes</Enlace>
        </aside>

        <section className="calendario-principal" aria-label="Calendario">
          <div className="calendario-barra">
            <div className="fila" style={{ gap: 6 }}>
              <button className="boton boton--chico" onClick={() => setAncla(hoy)}>Hoy</button>
              <button className="boton boton--chico" aria-label="Anterior" onClick={() => mover(-1)}><LuChevronLeft size={16} /></button>
              <button className="boton boton--chico" aria-label="Siguiente" onClick={() => mover(1)}><LuChevronRight size={16} /></button>
              <h2 className="calendario-titulo">{tituloDe(vista, ancla)}</h2>
            </div>
            <div className="segmentado" role="tablist" aria-label="Vista">
              {(["MES", "SEMANA", "DIA"] as Vista[]).map((v) => (
                <button key={v} role="tab" aria-selected={vista === v} className={vista === v ? "activo" : undefined} onClick={() => cambiarVista(v)}>
                  {v === "MES" ? "Mes" : v === "SEMANA" ? "Semana" : "Día"}
                </button>
              ))}
            </div>
          </div>
          {agenda.error ? (
            <ErrorCarga error={agenda.error} reintentar={agenda.recargar} />
          ) : !agenda.datos ? (
            <Cargando />
          ) : vista === "MES" ? (
            <VistaMes desde={desde} ancla={ancla} hoy={hoy} eventos={visibles} alAbrir={setAbierto} alCrear={(f) => !quien && setEditando({ fecha: f, hora: null })} alVerDia={irAlDia} />
          ) : (
            <VistaHoras dias={vista === "DIA" ? [ancla] : Array.from({ length: 7 }, (_, i) => sumarDias(desde, i))} hoy={hoy} eventos={visibles} alAbrir={setAbierto} alCrear={(fecha, hora) => !quien && setEditando({ fecha, hora })} alVerDia={irAlDia} />
          )}
        </section>
      </div>

      {abierto?.equipo && <DetalleEventoEquipo e={abierto} alCerrar={() => setAbierto(null)} alCambiar={() => { void agenda.recargar(); }} />}
      {abierto && !abierto.equipo && (
        <DetalleEvento
          e={abierto}
          alCerrar={() => setAbierto(null)}
          alEditar={() => { setEditando(abierto); setAbierto(null); }}
          alCambiar={() => { setAbierto(null); void agenda.recargar(); }}
        />
      )}
      {editando && <EditorEvento valor={editando} alCerrar={() => setEditando(null)} alGuardar={() => { setEditando(null); void agenda.recargar(); }} />}
      {google && <ConexionGoogle g={g} alCerrar={() => setGoogle(false)} alCambiar={() => void agenda.recargar()} />}
    </>
  );
}

// ───────────────────────────── navegación: mini mes

function MiniMes({ ancla, hoy, alElegir }: { ancla: string; hoy: string; alElegir: (f: string) => void }) {
  const [mes, setMes] = useState(primeroDeMes(ancla));
  useEffect(() => setMes(primeroDeMes(ancla)), [ancla]);
  const inicio = lunesDe(mes);
  return (
    <div className="mini-mes">
      <div className="fila entre">
        <span className="negrita texto-sm">{mayus(fmt(mes, { month: "long", year: "numeric" }))}</span>
        <span className="fila" style={{ gap: 2 }}>
          <button className="boton-icono" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))}><LuChevronLeft size={14} /></button>
          <button className="boton-icono" aria-label="Mes siguiente" onClick={() => setMes(sumarMeses(mes, 1))}><LuChevronRight size={14} /></button>
        </span>
      </div>
      <div className="mini-mes-grilla">
        {DIAS_SEMANA.map((d) => <span key={d} className="texto-muted">{d[0]}</span>)}
        {Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i)).map((f) => (
          <button
            key={f}
            className={[f === hoy && "hoy", f === ancla && "elegido", f.slice(0, 7) !== mes.slice(0, 7) && "fuera"].filter(Boolean).join(" ")}
            aria-label={fmt(f, { day: "numeric", month: "long" })}
            onClick={() => alElegir(f)}
          >
            {Number(f.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── vista de mes

function Chip({ e, alAbrir }: { e: Evento; alAbrir: (e: Evento) => void }) {
  const lleno = !e.horaInicio;
  return (
    <button
      className={`chip-agenda${lleno ? " chip-agenda--lleno" : ""}${e.hecho ? " chip-agenda--hecho" : ""}`}
      style={lleno ? { background: `color-mix(in srgb, ${colorDe(e)} 16%, var(--c-blanco))`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${colorDe(e)} 45%, transparent)` } : undefined}
      onClick={(x) => { x.stopPropagation(); alAbrir(e); }}
      title={e.titulo}
    >
      {!lleno && <span className="punto" style={{ background: colorDe(e) }} />}
      {e.horaInicio && <span className="chip-hora">{e.horaInicio}</span>}
      {e.vencido && <LuTriangleAlert size={11} aria-label="Vencido" style={{ flex: "none", color: "var(--c-semaforo-rojo)" }} />}<span className="chip-texto">{e.titulo}</span>
    </button>
  );
}

function VistaMes({ desde, ancla, hoy, eventos, alAbrir, alCrear, alVerDia }: { desde: string; ancla: string; hoy: string; eventos: Evento[]; alAbrir: (e: Evento) => void; alCrear: (f: string) => void; alVerDia: (f: string) => void }) {
  const MAX = 3;
  return (
    <div className="vista-mes">
      {DIAS_SEMANA.map((d) => <div key={d} className="vista-mes-cab">{d}</div>)}
      {Array.from({ length: 42 }, (_, i) => sumarDias(desde, i)).map((f) => {
        const del = eventos.filter((e) => e.fecha === f);
        const feriado = del.some((e) => e.tipo === "FERIADO");
        return (
          <div key={f} className={`vista-mes-dia${f.slice(0, 7) !== ancla.slice(0, 7) ? " fuera" : ""}${feriado ? " feriado" : ""}`} onClick={() => alCrear(f)}>
            <button className={`num-dia${f === hoy ? " hoy" : ""}`} onClick={(x) => { x.stopPropagation(); alVerDia(f); }} aria-label={`Ver el ${fmt(f, { day: "numeric", month: "long" })}`}>
              {Number(f.slice(8))}
            </button>
            {del.slice(0, MAX).map((e) => <Chip key={e.id} e={e} alAbrir={alAbrir} />)}
            {del.length > MAX && (
              <button className="chip-mas" onClick={(x) => { x.stopPropagation(); alVerDia(f); }}>+{del.length - MAX} más</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── vistas de semana y día (grilla por horas)

const HORA_INICIO = 7;
const HORA_FIN = 22;
const ALTO_HORA = 52;

/** Reparte en carriles los eventos que se cruzan, como Google Calendar. */
function carriles(xs: Evento[]) {
  const orden = [...xs].sort((a, b) => a.horaInicio!.localeCompare(b.horaInicio!));
  const fin = (e: Evento) => minutos(e.horaFin ?? e.horaInicio!) || minutos(e.horaInicio!) + 30;
  const res: { e: Evento; carril: number; de: number }[] = [];
  let grupo: typeof res = [];
  let finGrupo = -1;
  const cerrar = () => {
    const n = Math.max(...grupo.map((g) => g.carril)) + 1;
    grupo.forEach((g) => (g.de = n));
    grupo = [];
  };
  for (const e of orden) {
    if (grupo.length && minutos(e.horaInicio!) >= finGrupo) cerrar();
    const ocupados = grupo.filter((g) => fin(g.e) > minutos(e.horaInicio!)).map((g) => g.carril);
    let carril = 0;
    while (ocupados.includes(carril)) carril++;
    const x = { e, carril, de: 1 };
    grupo.push(x);
    res.push(x);
    finGrupo = Math.max(finGrupo, fin(e));
  }
  if (grupo.length) cerrar();
  return res;
}

function VistaHoras({ dias, hoy, eventos, alAbrir, alCrear, alVerDia }: { dias: string[]; hoy: string; eventos: Evento[]; alAbrir: (e: Evento) => void; alCrear: (f: string, h: string) => void; alVerDia: (f: string) => void }) {
  const horas = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i);
  const columnas = { gridTemplateColumns: `56px repeat(${dias.length}, minmax(0, 1fr))` };
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    const leer = () => { const d = new Date(Date.now() - 5 * 3_600_000); setAhora(d.getUTCHours() * 60 + d.getUTCMinutes()); };
    leer();
    const t = setInterval(leer, 60_000);
    return () => clearInterval(t);
  }, []);
  const deDia = (f: string) => eventos.filter((e) => e.fecha === f);
  return (
    <div className="vista-horas">
      <div className="vista-horas-cab" style={columnas}>
        <span />
        {dias.map((f) => (
          <button key={f} className={`vista-horas-dia${f === hoy ? " hoy" : ""}`} onClick={() => alVerDia(f)}>
            <span className="texto-xs">{mayus(fmt(f, { weekday: "short" }).replace(".", ""))}</span>
            <span className="num">{Number(f.slice(8))}</span>
          </button>
        ))}
      </div>
      <div className="vista-horas-todo" style={columnas}>
        <span className="texto-xs texto-muted" style={{ alignSelf: "center" }}>Todo el día</span>
        {dias.map((f) => (
          <div key={f} className="pila" style={{ gap: 3, padding: 3 }}>
            {deDia(f).filter((e) => !e.horaInicio).map((e) => <Chip key={e.id} e={e} alAbrir={alAbrir} />)}
          </div>
        ))}
      </div>
      <div className="vista-horas-cuerpo">
        <div className="vista-horas-grilla" style={{ ...columnas, height: horas.length * ALTO_HORA }}>
          <div className="vista-horas-etiquetas">
            {horas.map((h) => <span key={h} style={{ top: (h - HORA_INICIO) * ALTO_HORA }}>{`${String(h).padStart(2, "0")}:00`}</span>)}
          </div>
          {dias.map((f) => (
            <div key={f} className="vista-horas-columna">
              {horas.map((h) => (
                <button key={h} className="vista-horas-celda" style={{ height: ALTO_HORA }} aria-label={`Nuevo el ${fmt(f, { day: "numeric", month: "long" })} a las ${h}:00`} onClick={() => alCrear(f, `${String(h).padStart(2, "0")}:00`)} />
              ))}
              {carriles(deDia(f).filter((e) => e.horaInicio)).map(({ e, carril, de }) => {
                const ini = Math.max(minutos(e.horaInicio!), HORA_INICIO * 60);
                const fin = Math.min(e.horaFin ? minutos(e.horaFin) : ini + 30, HORA_FIN * 60);
                return (
                  <button
                    key={e.id}
                    className={`bloque-agenda${e.hecho ? " bloque-agenda--hecho" : ""}`}
                    style={{
                      top: ((ini - HORA_INICIO * 60) / 60) * ALTO_HORA, height: Math.max(((fin - ini) / 60) * ALTO_HORA - 2, 20),
                      left: `calc(${(carril / de) * 100}% + 2px)`, width: `calc(${100 / de}% - 4px)`, borderColor: `color-mix(in srgb, ${colorDe(e)} 45%, transparent)`, background: `color-mix(in srgb, ${colorDe(e)} 14%, var(--c-blanco))`,
                    }}
                    onClick={() => alAbrir(e)}
                  >
                    <span className="negrita">{e.titulo}</span>
                    <span className="texto-xs">{e.horaInicio}{e.horaFin ? ` – ${e.horaFin}` : ""}{e.detalle ? ` · ${e.detalle}` : ""}</span>
                  </button>
                );
              })}
              {f === aTexto(new Date(Date.now() - 5 * 3_600_000)) && ahora !== null && ahora >= HORA_INICIO * 60 && ahora < HORA_FIN * 60 && (
                <div className="linea-ahora" style={{ top: ((ahora - HORA_INICIO * 60) / 60) * ALTO_HORA }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── detalle, editor y Google

function DetalleEvento({ e, alCerrar, alEditar, alCambiar }: { e: Evento; alCerrar: () => void; alEditar: () => void; alCambiar: () => void }) {
  const avisar = useAviso();
  const fallo = (x: unknown) => avisar({ titulo: "No pudimos guardar el cambio", texto: x instanceof ProblemaApi ? x.detalle ?? x.titulo : undefined });
  const marcar = async () => {
    try {
      await api(`/me/agenda/eventos/${e.eventoId}`, { metodo: "PATCH", cuerpo: { hecho: !e.hecho } });
      avisar({ titulo: e.hecho ? "Pendiente reabierto" : "Pendiente hecho" });
      alCambiar();
    } catch (x) {
      fallo(x);
    }
  };
  const eliminar = async () => {
    if (!(await confirmar(`¿Eliminar «${e.titulo}»?${e.invitados.length ? " También desaparece del calendario de los invitados." : ""}`))) return;
    try {
      await api(`/me/agenda/eventos/${e.eventoId}`, { metodo: "DELETE" });
      avisar({ titulo: "Eliminado" });
      alCambiar();
    } catch (x) {
      fallo(x);
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={e.titulo} ancho={440}>
      <div className="pila" style={{ gap: 12 }}>
        <div className="fila" style={{ gap: 10, alignItems: "flex-start" }}>
          <span className="cuadro-tipo" style={{ background: colorDe(e) }} />
          <div>
            <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600, textDecoration: e.hecho && e.tipo === "PENDIENTE" ? "line-through" : undefined }}>{e.titulo}</h2>
            <p className="texto-sm texto-muted">
              {mayus(fmt(e.fecha, { weekday: "long", day: "numeric", month: "long" }))}
              {e.horaInicio ? ` · ${e.horaInicio}${e.horaFin ? ` – ${e.horaFin}` : ""}` : " · todo el día"}
            </p>
          </div>
        </div>
        <p className="texto-xs fila" style={{ gap: 6, flexWrap: "wrap" }}>
          <Etiqueta>{NOMBRE_TIPO[e.tipo]}</Etiqueta>
          {e.vencido && <Etiqueta tono="rojo">Vencido</Etiqueta>}
          {e.hecho && e.tipo === "REUNION" && <Etiqueta tono="verde">Realizada</Etiqueta>}
          {e.origen === "GOOGLE" && <Etiqueta tono="azul">De Google Calendar</Etiqueta>}
        </p>
        {e.detalle && <p className="texto-sm">{e.detalle}</p>}
        {e.invitados.length > 0 && (
          <p className="texto-sm fila" style={{ gap: 6 }}>
            <LuUsers size={15} /> {e.invitados.map((p) => p.nombre).join(", ")}
          </p>
        )}
        {e.notas && <p className="texto-sm"><TextoConEnlaces texto={e.notas} /></p>}
        <div className="fila" style={{ gap: 8, flexWrap: "wrap", marginTop: 4 }}>
          {e.enlace && (
            <Enlace a={e.enlace} className="boton boton--chico">
              <LuExternalLink size={14} /> Abrir proyecto
            </Enlace>
          )}
          {e.editable && e.tipo === "PENDIENTE" && (
            <button className="boton boton--chico" onClick={() => void marcar()}><LuCheck size={14} /> {e.hecho ? "Reabrir" : "Marcar como hecho"}</button>
          )}
          {e.editable && <button className="boton boton--chico" onClick={alEditar}><LuPencil size={14} /> Editar</button>}
          {e.editable && <button className="boton boton--chico" onClick={() => void eliminar()}><LuTrash2 size={14} /> Eliminar</button>}
        </div>
        {!e.editable && e.eventoId && <p className="texto-xs texto-muted">Te invitaron: solo quien lo creó lo puede cambiar.</p>}
      </div>
    </Modal>
  );
}

/**
 * 26 nov: un evento del calendario del equipo (planning@). Se cambia en Google; aquí se dice de quién es, de qué
 * cliente y a quién se menciona (solo en el portal). Lo sugerido por el portal se marca como «sugerido».
 */
function DetalleEventoEquipo({ e, alCerrar, alCambiar }: { e: Evento; alCerrar: () => void; alCambiar: () => void }) {
  const avisar = useAviso();
  const i = e.equipo!;
  const [info, setInfo] = useState(i);
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>("/panel/equipo");
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes?limite=100");
  const [mencion, setMencion] = useState("");
  const guardar = async (cuerpo: Record<string, unknown>, nuevo: typeof info) => {
    const antes = info;
    setInfo(nuevo);
    try {
      await api(`/equipo/calendario/eventos/${encodeURIComponent(i.clave)}`, { metodo: "PATCH", cuerpo: { ...cuerpo, titulo: e.titulo, fecha: e.fecha } });
      alCambiar();
    } catch (x) {
      setInfo(antes);
      avisar({ titulo: "No se guardó", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const personas = equipo.datos?.datos ?? [];
  const nombre = (id: string) => personas.find((p) => p.id === id)?.nombre ?? "";
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={e.titulo} ancho={480}>
      <div className="pila" style={{ gap: 12 }}>
        <div className="fila" style={{ gap: 10, alignItems: "flex-start" }}>
          <span className="cuadro-tipo" style={{ background: colorDe(e) }} />
          <div>
            <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>{e.titulo}</h2>
            <p className="texto-sm texto-muted">
              {mayus(fmt(e.fecha, { weekday: "long", day: "numeric", month: "long" }))}
              {e.horaInicio ? ` · ${e.horaInicio}${e.horaFin ? ` – ${e.horaFin}` : ""}` : " · todo el día"}
            </p>
          </div>
        </div>
        <p className="texto-xs fila" style={{ gap: 6, flexWrap: "wrap" }}>
          <Etiqueta>{i.calendario}</Etiqueta>
          <Etiqueta tono="azul">Calendario del equipo</Etiqueta>
        </p>
        <label className="pila texto-sm" style={{ gap: 4 }}>
          <span className="negrita">De quién es {info.responsableSugerido && <span className="texto-xs texto-muted">(sugerido)</span>}</span>
          <select className="input" value={info.responsable?.id ?? ""} disabled={!equipo.datos}
            onChange={(x) => { const id = x.target.value || null; void guardar({ responsableId: id }, { ...info, responsable: id ? { id, nombre: nombre(id) } : null, responsableSugerido: false }); }}>
            <option value="">Sin asignar</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="pila texto-sm" style={{ gap: 4 }}>
          <span className="negrita">Cliente {info.clienteSugerido && <span className="texto-xs texto-muted">(sugerido)</span>}</span>
          <select className="input" value={info.cliente?.id ?? ""} disabled={!clientes.datos}
            onChange={(x) => { const id = x.target.value || null; const c = clientes.datos?.datos.find((y) => y.id === id); void guardar({ clienteId: id }, { ...info, cliente: c ? { id: c.id, nombre: c.nombre } : null, clienteSugerido: false }); }}>
            <option value="">Sin cliente (interno)</option>
            {info.cliente && !clientes.datos?.datos.some((c) => c.id === info.cliente!.id) && <option value={info.cliente.id}>{info.cliente.nombre}</option>}
            {(clientes.datos?.datos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <div className="pila texto-sm" style={{ gap: 6 }}>
          <span className="negrita">Mencionados</span>
          <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
            {info.menciones.map((m) => (
              <span key={m.id} className="chip texto-xs" style={{ gap: 4 }}>
                @{m.nombre}
                <button type="button" className="boton-icono" style={{ padding: 0 }} aria-label={`Quitar la mención a ${m.nombre}`}
                  onClick={() => { const xs = info.menciones.filter((y) => y.id !== m.id); void guardar({ mencionIds: xs.map((y) => y.id) }, { ...info, menciones: xs }); }}>×</button>
              </span>
            ))}
            <select className="input" style={{ width: 200, height: 32 }} aria-label="Mencionar a alguien" value={mencion}
              onChange={(x) => {
                const id = x.target.value;
                setMencion("");
                if (!id || info.menciones.some((m) => m.id === id)) return;
                const xs = [...info.menciones, { id, nombre: nombre(id) }];
                void guardar({ mencionIds: xs.map((y) => y.id) }, { ...info, menciones: xs });
              }}>
              <option value="">+ Mencionar…</option>
              {personas.filter((p) => !info.menciones.some((m) => m.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <span className="texto-xs texto-muted">Le llega un aviso, y lo ve en su calendario.</span>
        </div>
        {(i.invitadosEquipo.length > 0 || i.externos.length > 0) && (
          <p className="texto-sm fila" style={{ gap: 6, alignItems: "flex-start" }}>
            <LuUsers size={15} style={{ flex: "none", marginTop: 2 }} />
            <span>{[...i.invitadosEquipo.map((p) => p.nombre), ...i.externos].join(", ")}</span>
          </p>
        )}
        {e.notas && <p className="texto-sm"><TextoConEnlaces texto={e.notas} /></p>}
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          {i.meet && <a className="boton boton--chico" href={i.meet} target="_blank" rel="noreferrer"><LuExternalLink size={14} /> Unirse a la reunión</a>}
          {i.enlaceGoogle && <a className="boton boton--chico" href={i.enlaceGoogle} target="_blank" rel="noreferrer"><LuExternalLink size={14} /> Abrir en Google</a>}
        </div>
        <p className="texto-xs texto-muted">La hora, el título y los invitados se cambian en Google Calendar (cuenta planning@).</p>
      </div>
    </Modal>
  );
}

function EditorEvento({ valor, alCerrar, alGuardar }: { valor: Evento | Nuevo; alCerrar: () => void; alGuardar: () => void }) {
  const existente = "eventoId" in valor ? valor : null;
  const nuevo = existente ? null : (valor as Nuevo);
  const [tipo, setTipo] = useState<"EVENTO" | "PENDIENTE">(existente ? (existente.tipo as "EVENTO" | "PENDIENTE") : "EVENTO");
  const [titulo, setTitulo] = useState(existente?.titulo ?? "");
  const [fecha, setFecha] = useState(existente?.fecha ?? nuevo!.fecha);
  const [todoElDia, setTodoElDia] = useState(existente ? !existente.horaInicio : !nuevo!.hora);
  const [inicio, setInicio] = useState(existente?.horaInicio ?? nuevo?.hora ?? "09:00");
  const [fin, setFin] = useState(existente?.horaFin ?? "");
  const [notas, setNotas] = useState(existente?.notas ?? "");
  const [invitados, setInvitados] = useState<string[]>(existente?.invitados.map((p) => p.id) ?? []);
  const [err, setErr] = useState<Record<string, string>>({});
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>(tipo === "EVENTO" ? "/panel/equipo" : null);
  const avisar = useAviso();
  const guardar = async (x: FormEvent) => {
    x.preventDefault();
    setErr({});
    const cuerpo = {
      ...(existente ? {} : { tipo }), titulo, fecha, notas: notas || null,
      horaInicio: todoElDia ? null : inicio, horaFin: todoElDia || !fin ? null : fin,
      ...(tipo === "EVENTO" ? { invitadosIds: invitados } : {}),
    };
    try {
      if (existente) await api(`/me/agenda/eventos/${existente.eventoId}`, { metodo: "PATCH", cuerpo });
      else await api("/me/agenda/eventos", { metodo: "POST", cuerpo });
      avisar({ titulo: existente ? "Cambios guardados" : tipo === "EVENTO" ? "Evento creado" : "Pendiente creado", texto: invitados.length ? "Los invitados ya lo ven en su calendario." : undefined });
      alGuardar();
    } catch (e2) {
      if (e2 instanceof ProblemaApi && e2.errores.length) setErr(Object.fromEntries(e2.errores.map((y) => [y.campo, y.mensaje])));
      else avisar({ titulo: "No pudimos guardar", texto: e2 instanceof ProblemaApi ? e2.detalle ?? e2.titulo : undefined });
    }
  };
  const error = (c: string) => err[c] && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err[c]}</p>;
  const yo = usePortal().sesion?.usuario.id;
  const companeros = (equipo.datos?.datos ?? []).filter((p) => p.id !== yo);
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={existente ? "Editar" : "Nuevo en el calendario"} ancho={480}>
      <form className="pila" style={{ gap: 14 }} onSubmit={(x) => void guardar(x)}>
        <h2 className="fila" style={{ fontSize: "var(--t-xl)", fontWeight: 600, gap: 8 }}><LuCalendarPlus size={20} /> {existente ? "Editar" : "Nuevo en el calendario"}</h2>
        {!existente && (
          <div className="segmentado" role="tablist" aria-label="Tipo">
            <button type="button" role="tab" aria-selected={tipo === "EVENTO"} className={tipo === "EVENTO" ? "activo" : undefined} onClick={() => setTipo("EVENTO")}>Evento o reunión</button>
            <button type="button" role="tab" aria-selected={tipo === "PENDIENTE"} className={tipo === "PENDIENTE" ? "activo" : undefined} onClick={() => setTipo("PENDIENTE")}>Pendiente</button>
          </div>
        )}
        <div className="campo">
          <label htmlFor="ev-titulo">Título</label>
          <div className="entrada">
            <input id="ev-titulo" value={titulo} onChange={(x) => setTitulo(x.target.value)} maxLength={120} placeholder={tipo === "EVENTO" ? "Ej.: Revisión interna del diseño" : "Ej.: Mandar el acta al cliente"} autoFocus />
          </div>
          {error("titulo")}
        </div>
        <div className="fila" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="campo" style={{ flex: "1 1 150px" }}>
            <label htmlFor="ev-fecha">Día</label>
            <div className="entrada"><input id="ev-fecha" type="date" value={fecha} onChange={(x) => setFecha(x.target.value)} /></div>
          </div>
          {!todoElDia && (
            <>
              <div className="campo" style={{ flex: "0 1 110px" }}>
                <label htmlFor="ev-inicio">Desde</label>
                <div className="entrada"><input id="ev-inicio" type="time" value={inicio} onChange={(x) => setInicio(x.target.value)} /></div>
              </div>
              <div className="campo" style={{ flex: "0 1 110px" }}>
                <label htmlFor="ev-fin">Hasta</label>
                <div className="entrada"><input id="ev-fin" type="time" value={fin} onChange={(x) => setFin(x.target.value)} /></div>
              </div>
            </>
          )}
        </div>
        {error("fecha")}
        {error("horaInicio")}
        {error("horaFin")}
        <label className="fila texto-sm" style={{ gap: 8 }}>
          <input type="checkbox" checked={todoElDia} onChange={(x) => setTodoElDia(x.target.checked)} /> Todo el día
        </label>
        {tipo === "EVENTO" && (
          <fieldset className="campo" style={{ border: 0, padding: 0 }}>
            <legend>Invitados del equipo</legend>
            <div className="invitados">
              {companeros.map((p) => (
                <label key={p.id} className={`chip-persona${invitados.includes(p.id) ? " activo" : ""}`}>
                  <input type="checkbox" checked={invitados.includes(p.id)} onChange={() => setInvitados((xs) => (xs.includes(p.id) ? xs.filter((i) => i !== p.id) : [...xs, p.id]))} />
                  {p.nombre}
                </label>
              ))}
            </div>
            {error("invitadosIds")}
          </fieldset>
        )}
        <div className="campo">
          <label htmlFor="ev-notas">Notas</label>
          <textarea id="ev-notas" className="input" rows={3} value={notas} onChange={(x) => setNotas(x.target.value)} maxLength={2000} />
          {error("notas")}
        </div>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">{existente ? "Guardar" : "Crear"}</button>
        </div>
      </form>
    </Modal>
  );
}

function ConexionGoogle({ g, alCerrar, alCambiar }: { g: S<"ConexionGoogle"> | undefined; alCerrar: () => void; alCambiar: () => void }) {
  const avisar = useAviso();
  const cambiar = async (conectar: boolean) => {
    try {
      // 18 nov: la conexión real va por OAuth con la cuenta que la persona elija (como Drive).
      if (g?.real) {
        if (conectar) {
          const r = await api<{ url: string }>("/me/conexiones/google-calendar", { metodo: "POST", cuerpo: {} });
          window.location.assign(r.url);
          return;
        }
        await api("/me/conexiones/google-calendar", { metodo: "DELETE" });
        avisar({ titulo: "Google Calendar desconectado" });
        alCambiar();
        alCerrar();
        return;
      }
      await api("/me/agenda/google", { metodo: conectar ? "PUT" : "DELETE" });
      avisar({ titulo: conectar ? "Google Calendar conectado" : "Google Calendar desconectado", texto: conectar ? "Conexión de prueba: la sincronización real se activa cuando TI configure Google." : undefined });
      alCambiar();
      alCerrar();
    } catch (x) {
      avisar({ titulo: "No pudimos cambiar la conexión", texto: x instanceof ProblemaApi ? x.detalle ?? x.titulo : undefined });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Google Calendar" ancho={440}>
      <div className="pila" style={{ gap: 12 }}>
        <h2 className="fila" style={{ fontSize: "var(--t-xl)", fontWeight: 600, gap: 8 }}><LogoGoogle /> Google Calendar</h2>
        {g?.conectado ? (
          <p className="texto-sm">Conectado como <strong>{g.correo}</strong>.</p>
        ) : (
          <ul className="texto-sm pila" style={{ gap: 6, paddingLeft: 18 }}>
            <li>Tus reuniones y eventos de Google aparecen aquí, junto a lo del portal.</li>
            <li>Los eventos que agendas en el portal se copian a tu Google Calendar (y se cambian o borran allá también).</li>
            <li>Conecta la cuenta de Google que quieras, también un Gmail personal.</li>
            <li>Solo tu calendario: nadie más ve tus eventos de Google.</li>
          </ul>
        )}
        {!g?.real && (g?.simulada ?? true) && <p className="texto-xs texto-muted">Por ahora la conexión es de prueba: queda guardada, pero la sincronización con Google se activa cuando TI configure la cuenta de Inoo.</p>}
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="boton" onClick={alCerrar}>Cerrar</button>
          {g?.conectado ? (
            <button className="boton" onClick={() => void cambiar(false)}>Desconectar</button>
          ) : (
            <button className="boton boton--primario" onClick={() => void cambiar(true)}>Conectar con Google</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

const LogoGoogle = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.5 46 24 46z" />
    <path fill="#FBBC05" d="M11.8 28.3c-.4-1.3-.7-2.8-.7-4.3s.3-3 .7-4.3V14H4.5C3 17 2 20.4 2 24s1 7 2.5 10l7.3-5.7z" />
    <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.5 2 8.1 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
  </svg>
);
