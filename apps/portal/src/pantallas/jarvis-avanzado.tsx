"use client";
/**
 * Jarvis avanzado (9 nov 2026, reunión del 6 nov): las pestañas de la sección Jarvis además de los chats.
 *  · Skills: instrucciones y archivos reutilizables del área, que se activan en cada bot.
 *  · Rutinas: pedidos que un bot hace solo (cada día, de lunes a viernes, cada semana o cada mes, hora de Lima).
 *  · Automatizaciones: cuando pasa algo en el portal, un bot hace un pedido.
 *  · Biblioteca: lo que generó Jarvis y alguien guardó (con copia en Drive).
 *  · Conectores: los servidores MCP del área (las credenciales las pone TI en el Hermes, nunca aquí).
 *  · Actividad: qué corrió cada rutina o automatización y cuánto se usó cada skill.
 */
import { useState, type FormEvent, type ReactNode } from "react";
import { LuBookOpen, LuDownload, LuPause, LuPlay, LuPlus, LuTrash2, LuPencil, LuZap, LuClock, LuPlug, LuActivity, LuSparkles, LuSearch } from "react-icons/lu";
import { api, fDiaHora, ProblemaApi, useConsulta, type S } from "../base";
import { Cargando, ErrorCarga, Etiqueta, Modal, useAviso } from "../componentes";
import { MAX_ARCHIVOS_SKILL, MAX_TEXTO_ARCHIVO } from "../dominio/jarvis-avanzado";

type Bot = S<"BotJarvis">;
export type VistaJarvis = "CHATS" | "SKILLS" | "RUTINAS" | "AUTOMATIZACIONES" | "BIBLIOTECA" | "CONECTORES" | "ACTIVIDAD";
export const VISTAS_JARVIS: { clave: VistaJarvis; nombre: string }[] = [
  { clave: "CHATS", nombre: "Chats" },
  { clave: "SKILLS", nombre: "Skills" },
  { clave: "RUTINAS", nombre: "Rutinas" },
  { clave: "AUTOMATIZACIONES", nombre: "Automatizaciones" },
  { clave: "BIBLIOTECA", nombre: "Biblioteca" },
  { clave: "CONECTORES", nombre: "Conectores" },
  { clave: "ACTIVIDAD", nombre: "Actividad" },
];

const conArea = (camino: string, espacio: string | null, extra = "") => `${camino}?${espacio ? `area=${espacio}` : ""}${extra}`;
const errores = (e: unknown) => (e instanceof ProblemaApi && e.errores.length ? Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])) : null);
const Error = ({ texto }: { texto?: string }) => (texto ? <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{texto}</p> : null);

function Campo({ id, etiqueta, error, children, ayuda }: { id: string; etiqueta: string; error?: string; children: ReactNode; ayuda?: string }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="entrada">{children}</div>
      {ayuda && <p className="texto-xs texto-muted">{ayuda}</p>}
      <Error texto={error} />
    </div>
  );
}

function Cabeza({ titulo, bajada, accion }: { titulo: string; bajada: string; accion?: ReactNode }) {
  return (
    <div className="fila entre" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{titulo}</h2>
        <p className="texto-sm texto-muted">{bajada}</p>
      </div>
      {accion}
    </div>
  );
}
const Vacio = ({ children }: { children: ReactNode }) => <div className="tarjeta" style={{ padding: 22 }}><p className="texto-sm texto-muted">{children}</p></div>;
const tarjeta = { padding: 18, display: "grid", gap: 8, alignContent: "start" } as const;
const rejilla = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" } as const;

const ESTADO_EJECUCION: Record<S<"EjecucionJarvis">["estado"], [string, "verde" | "violeta" | "gris" | "rojo"]> = {
  PENDIENTE: ["En cola", "violeta"], EN_CURSO: ["Trabajando", "violeta"], HECHA: ["Hecha", "verde"], FALLIDA: ["Falló", "rojo"],
};
function UltimaEjecucion({ e, alAbrirChat }: { e: S<"EjecucionJarvis"> | null; alAbrirChat: (botId: string, sesion: string) => void }) {
  if (!e) return <span className="texto-xs texto-muted">Todavía no corrió.</span>;
  const [t, tono] = ESTADO_EJECUCION[e.estado];
  return (
    <span className="fila texto-xs" style={{ gap: 6, flexWrap: "wrap" }}>
      <Etiqueta tono={tono}>{t}</Etiqueta>
      <span className="texto-muted">{fDiaHora(e.terminadoEn ?? e.creadoEn)}</span>
      {e.sesionId && e.estado === "HECHA" && <button className="enlace" onClick={() => alAbrirChat(e.bot.id, e.sesionId!)}>Ver respuesta</button>}
      {e.error && <span style={{ color: "var(--c-alerta)" }}>{e.error}</span>}
    </span>
  );
}

export function PanelJarvisAvanzado({ vista, espacio, bots, alAbrirChat }: { vista: VistaJarvis; espacio: string | null; bots: Bot[]; alAbrirChat: (botId: string, sesion: string) => void }) {
  const propios = bots.filter((b) => !b.prestadoDe);
  if (vista === "SKILLS") return <Skills espacio={espacio} />;
  if (vista === "RUTINAS") return <Rutinas espacio={espacio} bots={propios} alAbrirChat={alAbrirChat} />;
  if (vista === "AUTOMATIZACIONES") return <Automatizaciones espacio={espacio} bots={propios} alAbrirChat={alAbrirChat} />;
  if (vista === "BIBLIOTECA") return <Biblioteca espacio={espacio} alAbrirChat={alAbrirChat} />;
  if (vista === "CONECTORES") return <Conectores espacio={espacio} />;
  if (vista === "ACTIVIDAD") return <Actividad espacio={espacio} alAbrirChat={alAbrirChat} />;
  return null;
}

// ───────────────────────────── skills

function Skills({ espacio }: { espacio: string | null }) {
  const r = useConsulta<{ datos: S<"SkillJarvis">[] }>(conArea("/jarvis/skills", espacio));
  const [editor, setEditor] = useState<S<"SkillJarvis"> | "nueva" | null>(null);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const borrar = async (s: S<"SkillJarvis">) => {
    if (!window.confirm(`¿Borrar la skill «${s.nombre}»? Se desactiva de sus bots.`)) return;
    await api(`/jarvis/skills/${s.id}`, { metodo: "DELETE" }).then(() => r.recargar(), (e) => avisar({ titulo: "No pudimos borrarla", texto: (e as ProblemaApi).titulo }));
  };
  return (
    <section aria-label="Skills">
      <Cabeza titulo="Skills" bajada="Instrucciones y archivos que se reutilizan. Se activan en cada bot desde «Skills y conectores» de su menú."
        accion={<button className="boton boton--primario" onClick={() => setEditor("nueva")}><LuPlus size={16} /> Nueva skill</button>} />
      {!r.datos.datos.length && <Vacio>Esta área todavía no tiene skills. Una skill es, por ejemplo, «Tono de Inoo» con la guía de estilo adjunta.</Vacio>}
      <div style={rejilla}>
        {r.datos.datos.map((s) => (
          <article key={s.id} className="tarjeta" style={tarjeta}>
            <span className="fila entre" style={{ gap: 8 }}>
              <strong className="fila" style={{ gap: 6 }}><LuSparkles size={15} /> {s.nombre}</strong>
              {s.puedeEditar && (
                <span className="fila" style={{ gap: 2 }}>
                  <button className="boton-icono" aria-label={`Editar ${s.nombre}`} onClick={() => setEditor(s)}><LuPencil size={14} /></button>
                  <button className="boton-icono" aria-label={`Borrar ${s.nombre}`} onClick={() => void borrar(s)}><LuTrash2 size={14} /></button>
                </span>
              )}
            </span>
            {s.descripcion && <p className="texto-sm">{s.descripcion}</p>}
            <p className="texto-xs texto-muted" style={{ whiteSpace: "pre-wrap", maxHeight: 72, overflow: "hidden" }}>{s.instrucciones}</p>
            {s.archivos.length > 0 && <p className="texto-xs">📎 {s.archivos.map((a) => a.nombre).join(", ")}</p>}
            <p className="texto-xs texto-muted">
              {s.bots.length ? `Activa en ${s.bots.map((b) => b.nombre).join(", ")}` : "Ningún bot la tiene activa"} · {s.usos} {s.usos === 1 ? "uso" : "usos"}
              {s.ultimoUso ? ` · último ${fDiaHora(s.ultimoUso)}` : ""}
            </p>
          </article>
        ))}
      </div>
      {editor && <EditorSkill skill={editor === "nueva" ? null : editor} espacio={espacio} alCerrar={() => setEditor(null)} alGuardar={() => { setEditor(null); void r.recargar(); }} />}
    </section>
  );
}

function EditorSkill({ skill, espacio, alCerrar, alGuardar }: { skill: S<"SkillJarvis"> | null; espacio: string | null; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(skill?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(skill?.descripcion ?? "");
  const [instrucciones, setInstrucciones] = useState(skill?.instrucciones ?? "");
  // Al editar, los archivos se reemplazan solo si se eligen otros.
  const [archivos, setArchivos] = useState<{ nombre: string; texto: string }[] | null>(skill ? null : []);
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const leer = async (lista: FileList | null) => {
    const xs = [...(lista ?? [])].slice(0, MAX_ARCHIVOS_SKILL);
    const leidos: { nombre: string; texto: string }[] = [];
    for (const f of xs) {
      const texto = await f.text();
      if (texto.length > MAX_TEXTO_ARCHIVO) {
        avisar({ titulo: `«${f.name}» es muy largo`, texto: `Hasta ${MAX_TEXTO_ARCHIVO.toLocaleString("es-PE")} caracteres por archivo.` });
        continue;
      }
      leidos.push({ nombre: f.name, texto });
    }
    setArchivos(leidos);
  };
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    const cuerpo = { nombre, descripcion, instrucciones, ...(archivos ? { archivos } : {}), ...(!skill && espacio ? { espacio } : {}) };
    try {
      if (skill) await api(`/jarvis/skills/${skill.id}`, { metodo: "PATCH", cuerpo });
      else await api("/jarvis/skills", { metodo: "POST", cuerpo });
      avisar({ titulo: skill ? "Skill actualizada" : "Skill creada", texto: skill ? undefined : "Actívala en los bots que la necesiten." });
      alGuardar();
    } catch (x) {
      const m = errores(x);
      if (m) setErr(m);
      else avisar({ titulo: "No pudimos guardarla", texto: (x as ProblemaApi).titulo });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={skill ? "Editar skill" : "Nueva skill"} ancho={560}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{skill ? "Editar skill" : "Nueva skill"}</h2>
        <Campo id="sk-nombre" etiqueta="Nombre" error={err.nombre}><input id="sk-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Tono de Inoo" /></Campo>
        <Campo id="sk-desc" etiqueta="Para qué sirve (opcional)" error={err.descripcion}><input id="sk-desc" value={descripcion} maxLength={300} onChange={(e) => setDescripcion(e.target.value)} /></Campo>
        <Campo id="sk-inst" etiqueta="Instrucciones" error={err.instrucciones} ayuda="Lo que el bot debe hacer o saber cuando la tenga activa.">
          <textarea id="sk-inst" rows={7} value={instrucciones} onChange={(e) => setInstrucciones(e.target.value)} />
        </Campo>
        <Campo id="sk-arch" etiqueta="Archivos de texto (opcional)" error={err.archivos}
          ayuda={archivos === null ? `Tiene ${skill?.archivos.length ?? 0}: ${skill?.archivos.map((a) => a.nombre).join(", ") || "ninguno"}. Elige otros para reemplazarlos.` : `Hasta ${MAX_ARCHIVOS_SKILL} archivos .txt, .md o .csv.`}>
          <input id="sk-arch" type="file" multiple accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" onChange={(e) => void leer(e.target.files)} />
        </Campo>
        {archivos && archivos.length > 0 && <p className="texto-xs">{archivos.map((a) => `${a.nombre} (${a.texto.length.toLocaleString("es-PE")} caracteres)`).join(" · ")}</p>}
        {skill && archivos === null && skill.archivos.length > 0 && <button type="button" className="enlace texto-xs" style={{ justifySelf: "start" }} onClick={() => setArchivos([])}>Quitar los archivos</button>}
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

/** «Skills y conectores» desde el menú del bot. */
export function HerramientasDelBot({ bot, espacio, alCerrar }: { bot: Bot; espacio: string | null; alCerrar: () => void }) {
  const h = useConsulta<S<"HerramientasBot">>(`/jarvis/bots/${bot.id}/herramientas`);
  const sk = useConsulta<{ datos: S<"SkillJarvis">[] }>(conArea("/jarvis/skills", espacio));
  const co = useConsulta<{ datos: S<"ConectorJarvis">[] }>(conArea("/jarvis/conectores", espacio));
  const [skills, setSkills] = useState<string[] | null>(null);
  const [conectores, setConectores] = useState<string[] | null>(null);
  const avisar = useAviso();
  if (!h.datos || !sk.datos || !co.datos) return <Modal abierto alCerrar={alCerrar} etiqueta="Skills y conectores"><Cargando /></Modal>;
  const elegidasS = skills ?? h.datos.skillIds;
  const elegidosC = conectores ?? h.datos.conectorIds;
  const conectoresDelArea = co.datos.datos.filter((c) => !c.espacios.length || (espacio && c.espacios.includes(espacio)));
  const alternar = (xs: string[], id: string, si: boolean) => (si ? [...xs, id] : xs.filter((x) => x !== id));
  const guardar = async () => {
    try {
      await api(`/jarvis/bots/${bot.id}/herramientas`, { metodo: "PUT", cuerpo: { skillIds: elegidasS, conectorIds: elegidosC } });
      avisar({ titulo: `${bot.nombre} actualizado`, texto: "Lo nota desde el próximo mensaje." });
      alCerrar();
    } catch (x) {
      avisar({ titulo: "No pudimos guardar", texto: (x as ProblemaApi).errores?.[0]?.mensaje ?? (x as ProblemaApi).titulo });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={`Skills y conectores de ${bot.nombre}`} ancho={520}>
      <div className="pila" style={{ gap: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Skills y conectores de {bot.nombre}</h2>
        <fieldset className="pila" style={{ gap: 6, border: 0, padding: 0 }}>
          <legend className="negrita texto-sm">Skills</legend>
          {!sk.datos.datos.length && <p className="texto-xs texto-muted">El área no tiene skills. Créalas en la pestaña «Skills».</p>}
          {sk.datos.datos.map((s) => (
            <label key={s.id} className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" disabled={!h.datos!.puedeEditar} checked={elegidasS.includes(s.id)} onChange={(e) => setSkills(alternar(elegidasS, s.id, e.target.checked))} />
              {s.nombre}{s.descripcion ? <span className="texto-xs texto-muted"> · {s.descripcion}</span> : null}
            </label>
          ))}
        </fieldset>
        <fieldset className="pila" style={{ gap: 6, border: 0, padding: 0 }}>
          <legend className="negrita texto-sm">Conectores</legend>
          {!conectoresDelArea.length && <p className="texto-xs texto-muted">El área no tiene conectores. Los agrega un super usuario en «Conectores».</p>}
          {conectoresDelArea.map((c) => (
            <label key={c.id} className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" disabled={!h.datos!.puedeEditar} checked={elegidosC.includes(c.id)} onChange={(e) => setConectores(alternar(elegidosC, c.id, e.target.checked))} />
              {c.nombre} {c.estado !== "CONECTADO" && <Etiqueta tono="gris">{c.estado === "PENDIENTE" ? "Falta conectarlo" : "Apagado"}</Etiqueta>}
            </label>
          ))}
        </fieldset>
        {!h.datos.puedeEditar && <p className="texto-xs texto-muted">Solo quien creó el bot, el lead del área o un ADMIN lo cambia.</p>}
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="boton" onClick={alCerrar}>Cerrar</button>
          {h.datos.puedeEditar && <button className="boton boton--primario" onClick={() => void guardar()}>Guardar</button>}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── rutinas

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
function Rutinas({ espacio, bots, alAbrirChat }: { espacio: string | null; bots: Bot[]; alAbrirChat: (botId: string, sesion: string) => void }) {
  const r = useConsulta<{ datos: S<"RutinaJarvis">[] }>(conArea("/jarvis/rutinas", espacio));
  const [editor, setEditor] = useState<S<"RutinaJarvis"> | "nueva" | null>(null);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const accion = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      avisar({ titulo: ok });
      void r.recargar();
    } catch (x) {
      avisar({ titulo: "No se pudo", texto: (x as ProblemaApi).titulo });
    }
  };
  return (
    <section aria-label="Rutinas">
      <Cabeza titulo="Rutinas" bajada="Pedidos que un bot hace solo. La respuesta queda como un chat del bot y te avisamos en la campana. Cada vez la paga quien creó la rutina."
        accion={<button className="boton boton--primario" disabled={!bots.length} onClick={() => setEditor("nueva")}><LuPlus size={16} /> Nueva rutina</button>} />
      {!r.datos.datos.length && <Vacio>Sin rutinas. Por ejemplo: «De lunes a viernes a las 8:30, dime qué vence hoy en mis proyectos».</Vacio>}
      <div style={rejilla}>
        {r.datos.datos.map((x) => (
          <article key={x.id} className="tarjeta" style={{ ...tarjeta, opacity: x.activa ? 1 : 0.7 }}>
            <span className="fila entre" style={{ gap: 8 }}>
              <strong className="fila" style={{ gap: 6 }}><LuClock size={15} /> {x.nombre}</strong>
              {!x.activa && <Etiqueta tono="gris">En pausa</Etiqueta>}
            </span>
            <p className="texto-xs texto-muted">{x.bot.nombre} · {x.horario}{x.proximaEn ? ` · próxima ${fDiaHora(x.proximaEn)}` : ""}</p>
            <p className="texto-sm" style={{ whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{x.pedido}</p>
            <UltimaEjecucion e={x.ultima} alAbrirChat={alAbrirChat} />
            {x.puedeEditar && (
              <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
                <button className="boton boton--chico" onClick={() => void accion(() => api(`/jarvis/rutinas/${x.id}/ejecutar`, { metodo: "POST", cuerpo: {} }), "En cola: corre en unos minutos")}><LuPlay size={13} /> Correr ahora</button>
                <button className="boton boton--chico" onClick={() => void accion(() => api(`/jarvis/rutinas/${x.id}`, { metodo: "PATCH", cuerpo: { activa: !x.activa } }), x.activa ? "Rutina en pausa" : "Rutina reanudada")}>
                  {x.activa ? <><LuPause size={13} /> Pausar</> : <><LuPlay size={13} /> Reanudar</>}
                </button>
                <button className="boton-icono" aria-label={`Editar ${x.nombre}`} onClick={() => setEditor(x)}><LuPencil size={14} /></button>
                <button className="boton-icono" aria-label={`Borrar ${x.nombre}`} onClick={() => window.confirm(`¿Borrar la rutina «${x.nombre}»?`) && void accion(() => api(`/jarvis/rutinas/${x.id}`, { metodo: "DELETE" }), "Rutina borrada")}><LuTrash2 size={14} /></button>
              </span>
            )}
          </article>
        ))}
      </div>
      {editor && <EditorRutina rutina={editor === "nueva" ? null : editor} espacio={espacio} bots={bots} alCerrar={() => setEditor(null)} alGuardar={() => { setEditor(null); void r.recargar(); }} />}
    </section>
  );
}

function EditorRutina({ rutina, espacio, bots, alCerrar, alGuardar }: { rutina: S<"RutinaJarvis"> | null; espacio: string | null; bots: Bot[]; alCerrar: () => void; alGuardar: () => void }) {
  const [botId, setBotId] = useState(rutina?.bot.id ?? bots[0]?.id ?? "");
  const [nombre, setNombre] = useState(rutina?.nombre ?? "");
  const [pedido, setPedido] = useState(rutina?.pedido ?? "");
  const [frecuencia, setFrecuencia] = useState<S<"FrecuenciaRutina">>(rutina?.frecuencia ?? "LABORABLES");
  const [hora, setHora] = useState(rutina?.hora ?? "08:30");
  const [diaSemana, setDiaSemana] = useState(rutina?.diaSemana ?? 1);
  const [diaMes, setDiaMes] = useState(rutina?.diaMes ?? 1);
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    const cuerpo = { nombre, pedido, frecuencia, hora, diaSemana: frecuencia === "SEMANAL" ? diaSemana : null, diaMes: frecuencia === "MENSUAL" ? diaMes : null, ...(rutina ? {} : { botId, ...(espacio ? { area: espacio } : {}) }) };
    try {
      if (rutina) await api(`/jarvis/rutinas/${rutina.id}`, { metodo: "PATCH", cuerpo });
      else await api("/jarvis/rutinas", { metodo: "POST", cuerpo });
      avisar({ titulo: rutina ? "Rutina actualizada" : "Rutina programada" });
      alGuardar();
    } catch (x) {
      const m = errores(x);
      if (m) setErr(m);
      else avisar({ titulo: "No pudimos guardarla", texto: (x as ProblemaApi).detalle ?? (x as ProblemaApi).titulo });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={rutina ? "Editar rutina" : "Nueva rutina"} ancho={520}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{rutina ? "Editar rutina" : "Nueva rutina"}</h2>
        {!rutina && (
          <Campo id="ru-bot" etiqueta="Bot" error={err.botId}>
            <select id="ru-bot" value={botId} onChange={(e) => setBotId(e.target.value)}>{bots.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
          </Campo>
        )}
        <Campo id="ru-nombre" etiqueta="Nombre" error={err.nombre}><input id="ru-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Resumen del día" /></Campo>
        <Campo id="ru-pedido" etiqueta="Qué tiene que hacer" error={err.pedido}><textarea id="ru-pedido" rows={4} value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ej.: Dime qué vence hoy en mis proyectos y qué le falta entregar a cada cliente." /></Campo>
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <Campo id="ru-frec" etiqueta="Cada cuánto" error={err.frecuencia}>
            <select id="ru-frec" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as S<"FrecuenciaRutina">)}>
              <option value="DIARIA">Todos los días</option>
              <option value="LABORABLES">De lunes a viernes</option>
              <option value="SEMANAL">Una vez por semana</option>
              <option value="MENSUAL">Una vez al mes</option>
            </select>
          </Campo>
          {frecuencia === "SEMANAL" && (
            <Campo id="ru-dia" etiqueta="Día" error={err.diaSemana}>
              <select id="ru-dia" value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))}>{DIAS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
            </Campo>
          )}
          {frecuencia === "MENSUAL" && (
            <Campo id="ru-diames" etiqueta="Día del mes" error={err.diaMes}>
              <select id="ru-diames" value={diaMes} onChange={(e) => setDiaMes(Number(e.target.value))}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select>
            </Campo>
          )}
          <Campo id="ru-hora" etiqueta="Hora (Lima)" error={err.hora}><input id="ru-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
        </div>
        <p className="texto-xs texto-muted">Corre en la primera pasada después de esa hora (cada 10 minutos).</p>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────────── automatizaciones

function Automatizaciones({ espacio, bots, alAbrirChat }: { espacio: string | null; bots: Bot[]; alAbrirChat: (botId: string, sesion: string) => void }) {
  const r = useConsulta<{ datos: S<"AutomatizacionJarvis">[] }>(conArea("/jarvis/automatizaciones", espacio));
  const [editor, setEditor] = useState<S<"AutomatizacionJarvis"> | "nueva" | null>(null);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const accion = async (f: () => Promise<unknown>, ok: string) => {
    try {
      await f();
      avisar({ titulo: ok });
      void r.recargar();
    } catch (x) {
      avisar({ titulo: "No se pudo", texto: (x as ProblemaApi).titulo });
    }
  };
  return (
    <section aria-label="Automatizaciones">
      <Cabeza titulo="Automatizaciones" bajada="Cuando pasa algo en el portal, un bot hace un pedido. Solo recibe los ids de lo que pasó y lee el resto con los permisos de quien la creó, que es quien la paga."
        accion={<button className="boton boton--primario" disabled={!bots.length} onClick={() => setEditor("nueva")}><LuPlus size={16} /> Nueva automatización</button>} />
      {!r.datos.datos.length && <Vacio>Sin automatizaciones. Por ejemplo: «Cuando se crea un cliente, prepara su correo de bienvenida».</Vacio>}
      <div style={rejilla}>
        {r.datos.datos.map((x) => (
          <article key={x.id} className="tarjeta" style={{ ...tarjeta, opacity: x.activa ? 1 : 0.7 }}>
            <span className="fila entre" style={{ gap: 8 }}>
              <strong className="fila" style={{ gap: 6 }}><LuZap size={15} /> {x.nombre}</strong>
              {!x.activa && <Etiqueta tono="gris">En pausa</Etiqueta>}
            </span>
            <p className="texto-xs texto-muted">{x.bot.nombre} · cuando «{x.eventoNombre.toLowerCase()}»</p>
            <p className="texto-sm" style={{ whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{x.pedido}</p>
            <UltimaEjecucion e={x.ultima} alAbrirChat={alAbrirChat} />
            {x.puedeEditar && (
              <span className="fila" style={{ gap: 6 }}>
                <button className="boton boton--chico" onClick={() => void accion(() => api(`/jarvis/automatizaciones/${x.id}`, { metodo: "PATCH", cuerpo: { activa: !x.activa } }), x.activa ? "En pausa" : "Reanudada")}>
                  {x.activa ? <><LuPause size={13} /> Pausar</> : <><LuPlay size={13} /> Reanudar</>}
                </button>
                <button className="boton-icono" aria-label={`Editar ${x.nombre}`} onClick={() => setEditor(x)}><LuPencil size={14} /></button>
                <button className="boton-icono" aria-label={`Borrar ${x.nombre}`} onClick={() => window.confirm(`¿Borrar «${x.nombre}»?`) && void accion(() => api(`/jarvis/automatizaciones/${x.id}`, { metodo: "DELETE" }), "Automatización borrada")}><LuTrash2 size={14} /></button>
              </span>
            )}
          </article>
        ))}
      </div>
      {editor && <EditorAutomatizacion a={editor === "nueva" ? null : editor} espacio={espacio} bots={bots} alCerrar={() => setEditor(null)} alGuardar={() => { setEditor(null); void r.recargar(); }} />}
    </section>
  );
}

function EditorAutomatizacion({ a, espacio, bots, alCerrar, alGuardar }: { a: S<"AutomatizacionJarvis"> | null; espacio: string | null; bots: Bot[]; alCerrar: () => void; alGuardar: () => void }) {
  const ev = useConsulta<{ datos: { clave: string; nombre: string }[] }>("/jarvis/eventos");
  const [botId, setBotId] = useState(a?.bot.id ?? bots[0]?.id ?? "");
  const [nombre, setNombre] = useState(a?.nombre ?? "");
  const [evento, setEvento] = useState(a?.evento ?? "cliente.creado");
  const [pedido, setPedido] = useState(a?.pedido ?? "");
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    const cuerpo = { nombre, evento, pedido, ...(a ? {} : { botId, ...(espacio ? { area: espacio } : {}) }) };
    try {
      if (a) await api(`/jarvis/automatizaciones/${a.id}`, { metodo: "PATCH", cuerpo });
      else await api("/jarvis/automatizaciones", { metodo: "POST", cuerpo });
      avisar({ titulo: a ? "Automatización actualizada" : "Automatización creada" });
      alGuardar();
    } catch (x) {
      const m = errores(x);
      if (m) setErr(m);
      else avisar({ titulo: "No pudimos guardarla", texto: (x as ProblemaApi).detalle ?? (x as ProblemaApi).titulo });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={a ? "Editar automatización" : "Nueva automatización"} ancho={520}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{a ? "Editar automatización" : "Nueva automatización"}</h2>
        {!a && (
          <Campo id="au-bot" etiqueta="Bot" error={err.botId}>
            <select id="au-bot" value={botId} onChange={(e) => setBotId(e.target.value)}>{bots.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
          </Campo>
        )}
        <Campo id="au-nombre" etiqueta="Nombre" error={err.nombre}><input id="au-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Bienvenida al cliente" /></Campo>
        <Campo id="au-evento" etiqueta="Cuando…" error={err.evento}>
          <select id="au-evento" value={evento} onChange={(e) => setEvento(e.target.value)}>
            {(ev.datos?.datos ?? []).map((x) => <option key={x.clave} value={x.clave}>{x.nombre}</option>)}
          </select>
        </Campo>
        <Campo id="au-pedido" etiqueta="…el bot hace esto" error={err.pedido}><textarea id="au-pedido" rows={4} value={pedido} onChange={(e) => setPedido(e.target.value)} /></Campo>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────────── biblioteca

function Biblioteca({ espacio, alAbrirChat }: { espacio: string | null; alAbrirChat: (botId: string, sesion: string) => void }) {
  const [q, setQ] = useState("");
  const [buscar, setBuscar] = useState("");
  const r = useConsulta<{ datos: S<"ElementoBiblioteca">[]; drive: boolean }>(conArea("/jarvis/biblioteca", espacio, buscar ? `&q=${encodeURIComponent(buscar)}` : ""));
  const [abierto, setAbierto] = useState<string | null>(null);
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  return (
    <section aria-label="Biblioteca">
      <Cabeza titulo="Biblioteca" bajada={`Lo que generó Jarvis y alguien guardó con «Guardar en biblioteca» debajo de una respuesta.${r.datos.drive ? " Cada elemento tiene su copia en Drive." : ""}`} />
      <form className="entrada" style={{ maxWidth: 360, marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); setBuscar(q.trim()); }}>
        <span className="icono-inicio"><LuSearch size={17} /></span>
        <input type="search" aria-label="Buscar en la biblioteca" placeholder="Buscar..." value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setBuscar(""); }} />
      </form>
      {!r.datos.datos.length && <Vacio>{buscar ? "No encontramos nada con eso." : "Todavía no se guardó nada en la biblioteca de esta área."}</Vacio>}
      <div style={rejilla}>
        {r.datos.datos.map((x) => (
          <button key={x.id} className="tarjeta" style={{ ...tarjeta, textAlign: "left", cursor: "pointer", border: "1px solid var(--c-borde)" }} onClick={() => setAbierto(x.id)}>
            <strong className="fila" style={{ gap: 6 }}><LuBookOpen size={15} /> {x.titulo}</strong>
            <span className="texto-xs texto-muted">{x.bot.nombre} · {x.creadoPor.nombre} · {fDiaHora(x.creadoEn)}{x.enDrive ? " · en Drive" : ""}</span>
            <span className="texto-sm" style={{ maxHeight: 64, overflow: "hidden" }}>{x.resumen}</span>
          </button>
        ))}
      </div>
      {abierto && <ElementoBiblioteca id={abierto} alCerrar={() => setAbierto(null)} alBorrar={() => { setAbierto(null); void r.recargar(); }} alAbrirChat={alAbrirChat} />}
    </section>
  );
}

function ElementoBiblioteca({ id, alCerrar, alBorrar, alAbrirChat }: { id: string; alCerrar: () => void; alBorrar: () => void; alAbrirChat: (botId: string, sesion: string) => void }) {
  const r = useConsulta<S<"ElementoBiblioteca"> & { contenido: string; descarga: S<"UrlFirmada"> | null }>(`/jarvis/biblioteca/${id}`);
  const avisar = useAviso();
  const x = r.datos;
  const borrar = async () => {
    if (!x || !window.confirm(`¿Sacar «${x.titulo}» de la biblioteca?${x.enDrive ? " La copia en Drive se queda." : ""}`)) return;
    await api(`/jarvis/biblioteca/${x.id}`, { metodo: "DELETE" }).then(alBorrar, (e) => avisar({ titulo: "No se pudo", texto: (e as ProblemaApi).titulo }));
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={x?.titulo ?? "Biblioteca"} ancho={680}>
      {!x ? <Cargando /> : (
        <div className="pila" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{x.titulo}</h2>
          <p className="texto-xs texto-muted">{x.bot.nombre} · guardado por {x.creadoPor.nombre} · {fDiaHora(x.creadoEn)}</p>
          <div className="tarjeta" style={{ padding: 14, whiteSpace: "pre-wrap", maxHeight: 420, overflow: "auto" }}><p className="texto-sm">{x.contenido}</p></div>
          <div className="fila" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {x.sesionId && x.bot.id && <button className="boton" onClick={() => { alCerrar(); alAbrirChat(x.bot.id!, x.sesionId!); }}>Ver el chat</button>}
            <button className="boton" onClick={() => void navigator.clipboard.writeText(x.contenido).then(() => avisar({ titulo: "Copiado" }))}>Copiar</button>
            {x.descarga && <a className="boton" href={x.descarga.url}><LuDownload size={14} /> Descargar de Drive</a>}
            {x.puedeBorrar && <button className="boton" onClick={() => void borrar()}><LuTrash2 size={14} /> Sacar</button>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** «Guardar en biblioteca» debajo de una respuesta del bot. */
export function GuardarEnBiblioteca({ bot, espacio, sesion, contenido, alCerrar }: { bot: Bot; espacio: string | null; sesion: string; contenido: string; alCerrar: () => void }) {
  const [titulo, setTitulo] = useState(() => contenido.split("\n").find((l) => l.trim())?.replace(/^[#*\s-]+/, "").slice(0, 80) ?? "");
  const [err, setErr] = useState<string>();
  const avisar = useAviso();
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const x = await api<S<"ElementoBiblioteca">>("/jarvis/biblioteca", { metodo: "POST", cuerpo: { botId: bot.id, sesionId: sesion, titulo, contenido, ...(espacio ? { area: espacio } : {}) } });
      avisar({ titulo: "Guardado en la biblioteca", texto: x.enDrive ? "Con su copia en Drive." : undefined });
      alCerrar();
    } catch (x) {
      setErr(errores(x)?.titulo ?? (x as ProblemaApi).titulo);
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Guardar en biblioteca" ancho={480}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Guardar en biblioteca</h2>
        <Campo id="bi-titulo" etiqueta="Título" error={err}><input id="bi-titulo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} /></Campo>
        <p className="texto-xs texto-muted" style={{ maxHeight: 120, overflow: "hidden", whiteSpace: "pre-wrap" }}>{contenido.slice(0, 400)}{contenido.length > 400 ? "…" : ""}</p>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────────── conectores

const ESPACIOS = [["CRM", "CRM"], ["COMERCIAL", "Comercial"], ["ADMINISTRACION", "Admin"], ["AUDIOVISUAL", "Audiovisual"], ["DISENO", "Diseño"], ["MARKETING", "Marketing"], ["GERENCIA", "Gerencia"]] as const;
const ESTADO_CONECTOR: Record<S<"EstadoConector">, [string, "verde" | "gris" | "violeta"]> = { CONECTADO: ["Conectado", "verde"], PENDIENTE: ["Falta conectarlo", "violeta"], APAGADO: ["Apagado", "gris"] };

function Conectores({ espacio }: { espacio: string | null }) {
  const r = useConsulta<{ datos: S<"ConectorJarvis">[]; puedeCrear: boolean }>(conArea("/jarvis/conectores", espacio));
  const [editor, setEditor] = useState<S<"ConectorJarvis"> | "nuevo" | null>(null);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const borrar = async (c: S<"ConectorJarvis">) => {
    if (!window.confirm(`¿Quitar el conector «${c.nombre}»? Sus bots dejan de tenerlo.`)) return;
    await api(`/jarvis/conectores/${c.id}`, { metodo: "DELETE" }).then(() => r.recargar(), (e) => avisar({ titulo: "No se pudo", texto: (e as ProblemaApi).titulo }));
  };
  return (
    <section aria-label="Conectores">
      <Cabeza titulo="Conectores" bajada="Servidores MCP (Drive, GitHub, Canva, Figma…) que pueden usar los bots. Las llaves no pasan por el portal: TI las configura en el Hermes del área y lo marca como conectado."
        accion={r.datos.puedeCrear ? <button className="boton boton--primario" onClick={() => setEditor("nuevo")}><LuPlus size={16} /> Nuevo conector</button> : undefined} />
      {!r.datos.datos.length && <Vacio>{r.datos.puedeCrear ? "Todavía no hay conectores." : "Tu área todavía no tiene conectores. Pídeselos a un super usuario."}</Vacio>}
      <div style={rejilla}>
        {r.datos.datos.map((c) => (
          <article key={c.id} className="tarjeta" style={tarjeta}>
            <span className="fila entre" style={{ gap: 8 }}>
              <strong className="fila" style={{ gap: 6 }}><LuPlug size={15} /> {c.nombre}</strong>
              <Etiqueta tono={ESTADO_CONECTOR[c.estado][1]}>{ESTADO_CONECTOR[c.estado][0]}</Etiqueta>
            </span>
            {c.descripcion && <p className="texto-sm">{c.descripcion}</p>}
            <p className="texto-xs texto-muted">
              {c.espacios.length ? `Para ${c.espacios.map((e) => ESPACIOS.find((x) => x[0] === e)?.[1] ?? e).join(", ")}` : "Para todas las áreas"}
              {c.bots.length ? ` · en ${c.bots.map((b) => b.nombre).join(", ")}` : ""}
            </p>
            {c.url && <p className="texto-xs texto-muted" style={{ overflowWrap: "anywhere" }}>{c.url}</p>}
            {c.puedeEditar && (
              <span className="fila" style={{ gap: 2 }}>
                <button className="boton-icono" aria-label={`Editar ${c.nombre}`} onClick={() => setEditor(c)}><LuPencil size={14} /></button>
                <button className="boton-icono" aria-label={`Quitar ${c.nombre}`} onClick={() => void borrar(c)}><LuTrash2 size={14} /></button>
              </span>
            )}
          </article>
        ))}
      </div>
      {editor && <EditorConector c={editor === "nuevo" ? null : editor} alCerrar={() => setEditor(null)} alGuardar={() => { setEditor(null); void r.recargar(); }} />}
    </section>
  );
}

function EditorConector({ c, alCerrar, alGuardar }: { c: S<"ConectorJarvis"> | null; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(c?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(c?.descripcion ?? "");
  const [url, setUrl] = useState(c?.url ?? "");
  const [espacios, setEspacios] = useState<string[]>(c?.espacios ?? []);
  const [estado, setEstado] = useState<S<"EstadoConector">>(c?.estado ?? "PENDIENTE");
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    const cuerpo = { nombre, descripcion, url: url.trim() || null, espacios, estado };
    try {
      if (c) await api(`/jarvis/conectores/${c.id}`, { metodo: "PATCH", cuerpo });
      else await api("/jarvis/conectores", { metodo: "POST", cuerpo });
      avisar({ titulo: c ? "Conector actualizado" : "Conector agregado", texto: estado === "PENDIENTE" ? "Falta que TI lo configure en el Hermes del área." : undefined });
      alGuardar();
    } catch (x) {
      const m = errores(x);
      if (m) setErr(m);
      else avisar({ titulo: "No pudimos guardarlo", texto: (x as ProblemaApi).titulo });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={c ? "Editar conector" : "Nuevo conector"} ancho={520}>
      <form className="pila" style={{ gap: 12 }} onSubmit={(e) => void guardar(e)}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{c ? "Editar conector" : "Nuevo conector"}</h2>
        <Campo id="co-nombre" etiqueta="Nombre" error={err.nombre}><input id="co-nombre" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Google Drive" /></Campo>
        <Campo id="co-desc" etiqueta="Qué permite (opcional)" error={err.descripcion}><input id="co-desc" value={descripcion} maxLength={300} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Leer las carpetas de los clientes" /></Campo>
        <Campo id="co-url" etiqueta="Dirección del servidor MCP (opcional)" error={err.url} ayuda="Sin tokens ni llaves: esas van en el Hermes."><input id="co-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Campo>
        <fieldset className="pila" style={{ gap: 6, border: 0, padding: 0 }}>
          <legend className="negrita texto-sm">Áreas (ninguna = todas)</legend>
          <div className="fila" style={{ gap: "6px 14px", flexWrap: "wrap" }}>
            {ESPACIOS.map(([k, n]) => (
              <label key={k} className="fila texto-sm" style={{ gap: 6 }}>
                <input type="checkbox" checked={espacios.includes(k)} onChange={(e) => setEspacios((xs) => (e.target.checked ? [...xs, k] : xs.filter((x) => x !== k)))} /> {n}
              </label>
            ))}
          </div>
          <Error texto={err.espacios} />
        </fieldset>
        <Campo id="co-estado" etiqueta="Estado" error={err.estado}>
          <select id="co-estado" value={estado} onChange={(e) => setEstado(e.target.value as S<"EstadoConector">)}>
            <option value="PENDIENTE">Falta conectarlo en el Hermes</option>
            <option value="CONECTADO">Conectado (los bots lo usan)</option>
            <option value="APAGADO">Apagado</option>
          </select>
        </Campo>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario">Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────────── actividad

function Actividad({ espacio, alAbrirChat }: { espacio: string | null; alAbrirChat: (botId: string, sesion: string) => void }) {
  const r = useConsulta<S<"ActividadJarvis">>(conArea("/jarvis/actividad", espacio));
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const d = r.datos;
  return (
    <section aria-label="Actividad" className="pila" style={{ gap: 18 }}>
      <Cabeza titulo="Actividad" bajada="Qué hicieron solos los bots del área y cuánto se usa cada skill." />
      <div className="tarjeta" style={{ padding: 18 }}>
        <h3 className="tarjeta-titulo fila" style={{ gap: 6, marginBottom: 10 }}><LuActivity size={16} /> Rutinas y automatizaciones</h3>
        {!d.ejecuciones.length ? <p className="texto-sm texto-muted">Todavía no corrió nada.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table className="tabla" style={{ width: "100%" }}>
              <thead><tr><th>Cuándo</th><th>Qué</th><th>Bot</th><th>Paga</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {d.ejecuciones.map((e) => (
                  <tr key={e.id}>
                    <td className="texto-xs">{fDiaHora(e.terminadoEn ?? e.creadoEn)}</td>
                    <td className="texto-sm">{e.origen === "RUTINA" ? "⏰" : "⚡"} {e.nombre}</td>
                    <td className="texto-sm">{e.bot.nombre}</td>
                    <td className="texto-xs">{e.pagadoPor.nombre}</td>
                    <td><Etiqueta tono={ESTADO_EJECUCION[e.estado][1]}>{ESTADO_EJECUCION[e.estado][0]}</Etiqueta>{e.error && <span className="texto-xs" style={{ color: "var(--c-alerta)", display: "block" }}>{e.error}</span>}</td>
                    <td>{e.sesionId && e.estado === "HECHA" && <button className="enlace texto-xs" onClick={() => alAbrirChat(e.bot.id, e.sesionId!)}>Ver</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="tarjeta" style={{ padding: 18 }}>
        <h3 className="tarjeta-titulo fila" style={{ gap: 6, marginBottom: 10 }}><LuSparkles size={16} /> Uso de skills</h3>
        {!d.skills.length ? <p className="texto-sm texto-muted">El área no tiene skills.</p> : (
          <ul style={{ display: "grid", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {d.skills.map((s) => (
              <li key={s.skillId} className="texto-sm">
                <strong>{s.nombre}</strong> · {s.usos} {s.usos === 1 ? "uso" : "usos"}{s.ultimoUso ? ` · último ${fDiaHora(s.ultimoUso)}` : ""}
                {s.porBot.length > 0 && <span className="texto-xs texto-muted"> ({s.porBot.map((b) => `${b.nombre}: ${b.usos}`).join(", ")})</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
