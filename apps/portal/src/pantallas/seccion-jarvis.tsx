"use client";
/**
 * Sección «Jarvis» de la barra lateral del equipo (2 nov 2026, pedido de Ernesto), al estilo de Grok Bot:
 * a la izquierda, los bots de MI área (solo esos) y el «+» para crear uno; a la derecha, el chat con el bot
 * elegido. Arriba del chat, el nombre del bot abre sus opciones (editar, nueva conversación, eliminar).
 * Cada bot tiene su trabajo (instrucciones) y su memoria; cada conversación es una sesión de Hermes.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LuCheck, LuChevronDown, LuCircleAlert, LuHand, LuLoader, LuMessageSquarePlus, LuPaperclip, LuSparkles, LuPencil, LuPlus, LuSend, LuSquare, LuTrash2, LuX } from "react-icons/lu";
import { api, BASE, Enlace, leerSesion, ProblemaApi, useConsulta, type S } from "../base";
import { Cargando, ErrorCarga, Estructura, Modal, useAviso } from "../componentes";
import { COLORES_BOT, FORMAS_BOT, saludoInicial, sinBloqueTrabajo } from "../dominio/ia-equipo";
import { EstadoArea, usd } from "./jarvis";
import { ACEPTA_ADJUNTOS, leerAdjunto, type Adjunto } from "./leer-archivos";

type Bot = S<"BotJarvis">;

export function PantallaJarvis() {
  return (
    <Estructura espacio="equipo" migas="Jarvis">
      <SeccionJarvis />
    </Estructura>
  );
}

export function AvatarBot({ bot, tam = 30 }: { bot: Pick<Bot, "nombre" | "color" | "forma">; tam?: number }) {
  const radio = bot.forma === "CIRCULO" ? "50%" : bot.forma === "CUADRADO" ? "8px" : "4px";
  return (
    <span className="avatar-bot" aria-hidden style={{ width: tam, height: tam, background: bot.color, borderRadius: radio, transform: bot.forma === "ROMBO" ? "rotate(45deg) scale(0.8)" : undefined }}>
      <span style={{ transform: bot.forma === "ROMBO" ? "rotate(-45deg)" : undefined }}>{bot.nombre.trim()[0]?.toUpperCase()}</span>
    </span>
  );
}

function SeccionJarvis() {
  const r = useConsulta<S<"BotsDelArea">>("/jarvis/bots");
  const [elegido, setElegido] = useState<string | null>(null);
  const [editor, setEditor] = useState<Bot | "nuevo" | null>(null);
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const d = r.datos;
  const bot = d.bots.find((b) => b.id === elegido) ?? d.bots[0] ?? null;

  if (!d.area) {
    return (
      <div className="tarjeta" style={{ padding: 24 }}>
        <p className="texto-sm">Todavía no tienes un área asignada, así que no ves bots. Pídele al ADMIN que te asigne una en «Equipo».</p>
      </div>
    );
  }
  return (
    <div className="jarvis">
      <aside className="jarvis-lista" aria-label={`Bots de ${d.consumo?.nombre}`}>
        <div className="fila entre" style={{ padding: "4px 6px 10px" }}>
          <span className="jarvis-lista-titulo">Bots de {d.consumo?.nombre}</span>
          <button className="boton-icono" aria-label="Crear un bot" title="Crear un bot" onClick={() => setEditor("nuevo")}>
            <LuPlus size={16} />
          </button>
        </div>
        {d.bots.length === 0 && <p className="texto-xs texto-muted" style={{ padding: "0 6px" }}>Tu área aún no tiene bots. Crea el primero con «+».</p>}
        {d.bots.map((b) => (
          <button key={b.id} className="jarvis-item" aria-current={bot?.id === b.id ? "true" : undefined} onClick={() => setElegido(b.id)}>
            <AvatarBot bot={b} tam={26} />
            <span className="jarvis-item-nombre">{b.nombre}</span>
          </button>
        ))}
        {d.consumo && (
          <div className="jarvis-consumo">
            <EstadoArea a={d.consumo} />
            <span className="texto-xs texto-muted">
              Hoy {usd(d.consumo.gastoDiaUsd)} de {usd(d.consumo.topeDiarioUsd)} · mes {usd(d.consumo.gastoMesUsd)} de {usd(d.consumo.topeMensualUsd)}
            </span>
          </div>
        )}
      </aside>
      <section className="jarvis-chat">
        {bot ? (
          <ChatBot key={bot.id} bot={bot} conectado={d.conectado} alEditar={() => setEditor(bot)} alCambiar={() => void r.recargar()} />
        ) : (
          <div className="jarvis-vacio">
            <p className="texto-sm texto-muted">Crea un bot para tu área: dale un nombre y cuéntale cuál es su trabajo.</p>
            <button className="boton boton--primario" onClick={() => setEditor("nuevo")}>
              <LuPlus size={14} /> Crear un bot
            </button>
          </div>
        )}
      </section>
      {editor && (
        <EditorBot
          bot={editor === "nuevo" ? null : editor}
          alCerrar={() => setEditor(null)}
          alGuardar={(b) => {
            setEditor(null);
            setElegido(b.id);
            void r.recargar();
          }}
        />
      )}
    </div>
  );
}

function EditorBot({ bot, alCerrar, alGuardar }: { bot: Bot | null; alCerrar: () => void; alGuardar: (b: Bot) => void }) {
  const [nombre, setNombre] = useState(bot?.nombre ?? "");
  const [color, setColor] = useState<string>(bot?.color ?? COLORES_BOT[0]);
  const [forma, setForma] = useState<Bot["forma"]>(bot?.forma ?? "CIRCULO");
  const [instrucciones, setInstrucciones] = useState(bot?.instrucciones ?? "");
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    try {
      const cuerpo = { nombre, color, forma, instrucciones };
      const b = bot ? await api<Bot>(`/jarvis/bots/${bot.id}`, { metodo: "PATCH", cuerpo }) : await api<Bot>("/jarvis/bots", { metodo: "POST", cuerpo });
      avisar({ titulo: bot ? "Bot actualizado" : `${b.nombre} está listo para configurarse` });
      alGuardar(b);
    } catch (e2) {
      if (e2 instanceof ProblemaApi && e2.errores.length) setErr(Object.fromEntries(e2.errores.map((x) => [x.campo, x.mensaje])));
      else avisar({ titulo: "No pudimos guardar el bot", texto: e2 instanceof ProblemaApi ? e2.detalle ?? e2.titulo : undefined });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={bot ? "Editar bot" : "Crear un bot"}>
      <form className="pila" style={{ gap: 14 }} onSubmit={(e) => void guardar(e)}>
        <div className="fila" style={{ gap: 12 }}>
          <AvatarBot bot={{ nombre: nombre || "?", color, forma }} tam={44} />
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>{bot ? "Editar bot" : "Crear un bot"}</h2>
        </div>
        <div className="campo">
          <label htmlFor="bot-nombre">Nombre</label>
          <div className="entrada">
            <input id="bot-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Seguimiento de clientes" maxLength={60} />
          </div>
          {err.nombre && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.nombre}</p>}
        </div>
        <div className="fila" style={{ gap: 20, flexWrap: "wrap" }}>
          <fieldset className="campo" style={{ border: 0, padding: 0 }}>
            <legend>Color</legend>
            <div className="fila" style={{ gap: 6 }}>
              {COLORES_BOT.map((c) => (
                <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} className="muestra-color" style={{ background: c, outline: color === c ? `2px solid ${c}` : undefined }} onClick={() => setColor(c)} />
              ))}
            </div>
          </fieldset>
          <fieldset className="campo" style={{ border: 0, padding: 0 }}>
            <legend>Forma</legend>
            <div className="fila" style={{ gap: 6 }}>
              {FORMAS_BOT.map((f) => (
                <button key={f} type="button" aria-label={`Forma ${f.toLowerCase()}`} aria-pressed={forma === f} className="boton boton--chico" style={forma === f ? { borderColor: color } : undefined} onClick={() => setForma(f)}>
                  <AvatarBot bot={{ nombre: " ", color, forma: f }} tam={16} />
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        {!bot && (
          <p className="texto-xs texto-muted">
            Al crearlo, te hará unas preguntas para entender en qué te ayuda y con eso arma su trabajo. Después lo puedes cambiar aquí o pedírselo en el chat.
          </p>
        )}
        {bot && (
        <div className="campo">
          <label htmlFor="bot-trabajo">Su trabajo</label>
          <textarea
            id="bot-trabajo"
            className="input"
            rows={6}
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            placeholder="Qué hace, con qué información trabaja y qué no debe hacer. Ej.: «Cada mañana revisa mis proyectos en el portal y dime qué está atrasado»."
            maxLength={4000}
          />
          {err.instrucciones && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.instrucciones}</p>}
        </div>
        )}
        <button className="boton boton--primario boton--bloque" type="submit">
          {bot ? "Guardar" : "Crear bot"}
        </button>
      </form>
    </Modal>
  );
}

interface MensajeChat {
  rol: "yo" | "bot" | "aviso";
  texto: string;
  error?: boolean;
  /** rol «aviso»: el bot reescribió su trabajo. */
  trabajo?: TrabajoNuevo & { deshecho?: boolean };
  /** rol «yo»: los archivos que iban con el mensaje (las imágenes, con su miniatura). */
  adjuntos?: { nombre: string; vista?: string }[];
  /** rol «bot»: quien chatea detuvo la respuesta. */
  detenido?: boolean;
}

/** Un paso del bot mientras trabaja (eventos hermes.tool.progress); se van al llegar la respuesta. */
interface Paso { id: string; etiqueta: string; listo: boolean }
type EventoPaso = { tool?: string; label?: string; toolCallId?: string; status?: string };

/** Lo que hace cada herramienta, en palabras del equipo. */
const PASOS: [RegExp, string][] = [
  [/mi_panel/, "Revisando tu panel"],
  [/mis_proyectos/, "Buscando tus proyectos"],
  [/tareas_proyecto/, "Revisando las tareas del proyecto"],
  [/requerimientos_cliente/, "Revisando lo que falta del cliente"],
  [/proyecto/, "Leyendo el proyecto"],
  [/web_search|search_web/, "Buscando en internet"],
  [/web_extract|fetch|browse|browser/, "Leyendo una página web"],
  [/memory|memoria/, "Consultando su memoria"],
  [/read_file|file_read|search_files/, "Leyendo archivos"],
  [/write_file|patch/, "Escribiendo un archivo"],
  [/terminal|shell|execute/, "Ejecutando un comando"],
  [/skill/, "Usando una habilidad"],
  [/todo/, "Ordenando sus pendientes"],
  [/tool_describe|tool_search|list_tools/, "Revisando sus herramientas"],
  [/clarify/, "Preparando una pregunta"],
];
const etiquetaPaso = (e: EventoPaso) => PASOS.find(([r]) => r.test(e.tool ?? ""))?.[1] ?? "Usando una herramienta";

const claveSesion = (botId: string) => `inoo.jarvis.sesion.${botId}`;
function sesionDe(botId: string) {
  try {
    const s = window.localStorage.getItem(claveSesion(botId));
    if (s) return s;
    const n = crypto.randomUUID();
    window.localStorage.setItem(claveSesion(botId), n);
    return n;
  } catch {
    return crypto.randomUUID();
  }
}

/** Lee el SSE de Hermes (formato OpenAI) y entrega cada pedazo de texto. */
type TrabajoNuevo = { anterior: string; nuevo: string };

async function leerRespuesta(cuerpo: ReadableStream<Uint8Array>, alTexto: (t: string) => void, alTrabajo: (t: TrabajoNuevo) => void, alPaso: (p: EventoPaso) => void) {
  const lector = cuerpo.getReader();
  const dec = new TextDecoder();
  let resto = "";
  let evento = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";
    for (const l of lineas) {
      if (!l.trim()) evento = "";
      if (l.startsWith("event:")) evento = l.slice(6).trim();
      if (!l.startsWith("data:")) continue;
      const dato = l.slice(5).trim();
      if (!dato || dato === "[DONE]") continue;
      if (evento === "hermes.tool.progress") {
        try {
          alPaso(JSON.parse(dato) as EventoPaso);
        } catch {
          /* paso ilegible: no se muestra */
        }
        continue;
      }
      let j: { choices?: { delta?: { content?: string } }[]; error?: { message?: string }; inoo?: { trabajo?: TrabajoNuevo } };
      try {
        j = JSON.parse(dato);
      } catch {
        continue;
      }
      if (j.error?.message) throw new Error(j.error.message);
      if (j.inoo?.trabajo) alTrabajo(j.inoo.trabajo);
      const c = j.choices?.[0]?.delta?.content;
      if (c) alTexto(c);
    }
  }
}

/**
 * Lo que Jarvis propuso en esta conversación (6 nov): nada se hace hasta que la persona lo aprueba aquí.
 * Al aprobar, el portal lo hace como ella, con sus permisos.
 */
function PropuestasJarvis({ sesion, version }: { sesion: string; version: number }) {
  const r = useConsulta<{ datos: S<"AccionJarvis">[] }>(`/me/jarvis/propuestas?conversacion=${encodeURIComponent(sesion)}`);
  const avisar = useAviso();
  const [decidiendo, setDecidiendo] = useState<string | null>(null);
  const { recargar } = r;
  useEffect(() => {
    if (version) void recargar();
  }, [version, recargar]);
  const decidir = async (a: S<"AccionJarvis">, aprobar: boolean) => {
    setDecidiendo(a.id);
    try {
      const x = await api<S<"AccionJarvis">>(`/me/jarvis/propuestas/${a.id}/decision`, { metodo: "POST", cuerpo: { aprobar } });
      avisar(x.estado === "APROBADA" ? { titulo: "Hecho" } : x.estado === "FALLIDA" ? { titulo: "No se pudo hacer", texto: x.error ?? undefined } : { titulo: "Propuesta rechazada" });
    } catch (e) {
      avisar({ titulo: "No pudimos decidir", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    } finally {
      setDecidiendo(null);
      void recargar();
    }
  };
  const xs = [...(r.datos?.datos ?? [])].reverse();
  if (!xs.length) return null;
  return (
    <div className="pila" style={{ gap: 8 }} aria-label="Propuestas de Jarvis" role="region">
      {xs.map((a) => (
        <div key={a.id} className={`propuesta-jarvis propuesta-jarvis--${a.estado.toLowerCase()}`}>
          <span className="fila" style={{ gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden style={{ display: "inline-flex", marginTop: 2 }}>
              {a.estado === "PENDIENTE" ? <LuHand size={15} /> : a.estado === "APROBADA" ? <LuCheck size={15} /> : a.estado === "FALLIDA" ? <LuCircleAlert size={15} /> : <LuX size={15} />}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="texto-xs texto-muted" style={{ display: "block" }}>
                {a.estado === "PENDIENTE" ? "Quiere hacer esto. Solo pasa si lo apruebas:" : a.estado === "APROBADA" ? "Hecho" : a.estado === "FALLIDA" ? "No se pudo hacer" : "Rechazado"}
              </span>
              <span className="texto-sm">{a.resumen}</span>
              {a.error && <span className="texto-xs" style={{ display: "block", color: "var(--c-alerta)" }}>{a.error}</span>}
              {a.estado === "APROBADA" && a.enlace && <Enlace a={a.enlace} className="enlace texto-xs">Ver dónde quedó</Enlace>}
            </span>
          </span>
          {a.estado === "PENDIENTE" && (
            <span className="fila" style={{ gap: 8 }}>
              <button className="boton boton--chico boton--primario" disabled={!!decidiendo} onClick={() => void decidir(a, true)}>Aprobar</button>
              <button className="boton boton--chico" disabled={!!decidiendo} onClick={() => void decidir(a, false)}>Rechazar</button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function ChatBot({ bot, conectado, alEditar, alCambiar }: { bot: Bot; conectado: boolean; alEditar: () => void; alCambiar: () => void }) {
  const [sesion, setSesion] = useState(() => (typeof window === "undefined" ? crypto.randomUUID() : sesionDe(bot.id)));
  // Bot recién creado (sin trabajo): saluda y empieza a preguntar para configurarse, como Grok.
  const inicio = (): MensajeChat[] => (bot.instrucciones.trim() ? [] : [{ rol: "bot", texto: saludoInicial(bot.nombre) }]);
  const [mensajes, setMensajes] = useState<MensajeChat[]>(inicio);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pasos, setPasos] = useState<Paso[]>([]);
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [leyendo, setLeyendo] = useState(0);
  const corte = useRef<AbortController | null>(null);
  const selector = useRef<HTMLInputElement>(null);
  const [viendo, setViendo] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  // Sube al terminar cada respuesta: Jarvis pudo haber dejado una propuesta.
  const [vuelta, setVuelta] = useState(0);
  const avisar = useAviso();
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes]);

  const ultimo = (f: (m: MensajeChat) => MensajeChat) =>
    setMensajes((ms) => {
      const i = ms.map((m) => m.rol).lastIndexOf("bot");
      return ms.map((m, j) => (j === i ? f(m) : m));
    });
  const deshacer = async (i: number, t: TrabajoNuevo) => {
    try {
      await api(`/jarvis/bots/${bot.id}`, { metodo: "PATCH", cuerpo: { instrucciones: t.anterior } });
      setMensajes((ms) => ms.map((m, j) => (j === i && m.trabajo ? { ...m, trabajo: { ...m.trabajo, deshecho: true } } : m)));
      avisar({ titulo: "Volví a mi trabajo anterior" });
      alCambiar();
    } catch (e) {
      avisar({ titulo: "No pudimos deshacer el cambio", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const adjuntar = async (lista: FileList | null) => {
    const archivos = [...(lista ?? [])].slice(0, Math.max(0, 5 - adjuntos.length));
    if (lista && lista.length > archivos.length) avisar({ titulo: "Hasta 5 archivos por mensaje" });
    setLeyendo((n) => n + archivos.length);
    for (const f of archivos) {
      try {
        const a = await leerAdjunto(f);
        setAdjuntos((xs) => [...xs, a]);
      } catch (err) {
        avisar({ titulo: "No pudimos adjuntar el archivo", texto: (err as Error).message });
      } finally {
        setLeyendo((n) => n - 1);
      }
    }
  };
  const detener = () => corte.current?.abort();
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const mensaje = texto.trim();
    if ((!mensaje && !adjuntos.length) || enviando || leyendo) return;
    const van = adjuntos;
    setTexto("");
    setAdjuntos([]);
    setEnviando(true);
    setPasos([]);
    setMensajes((ms) => [
      ...ms,
      { rol: "yo", texto: mensaje, adjuntos: van.map((a) => ({ nombre: a.nombre, vista: "vista" in a ? a.vista : undefined })) },
      { rol: "bot", texto: "" },
    ]);
    const control = new AbortController();
    corte.current = control;
    try {
      const s = leerSesion();
      const r = await fetch(`${BASE}/jarvis/bots/${bot.id}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(s ? { authorization: `Bearer ${s.token}` } : {}) },
        body: JSON.stringify({ mensaje, sesionId: sesion, archivos: van.map((a) => ("imagen" in a ? { nombre: a.nombre, imagen: a.imagen } : a)) }),
        signal: control.signal,
      });
      if (!r.ok || !r.body) {
        const p = await r.json().catch(() => ({}));
        throw new Error(p.detail ? `${p.title}. ${p.detail}` : (p.title ?? p.error?.message ?? `Error ${r.status}`));
      }
      await leerRespuesta(
        r.body,
        (t) => ultimo((m) => ({ ...m, texto: m.texto + t })),
        (trabajo) => setMensajes((ms) => [...ms, { rol: "aviso", texto: trabajo.anterior ? "Actualicé mi trabajo." : "Listo, ya tengo mi trabajo configurado.", trabajo }]),
        (p) => {
          const id = p.toolCallId ?? `${p.tool}-${Date.now()}`;
          setPasos((ps) => (p.status === "completed"
            ? ps.map((x) => (x.id === id ? { ...x, listo: true } : x))
            : ps.some((x) => x.id === id) ? ps : [...ps, { id, etiqueta: etiquetaPaso(p), listo: false }]));
        },
      );
      alCambiar();
    } catch (err) {
      if (control.signal.aborted) ultimo((m) => ({ ...m, detenido: true }));
      else ultimo((m) => ({ ...m, texto: (err as Error).message, error: true }));
    } finally {
      corte.current = null;
      setPasos([]);
      setEnviando(false);
      setVuelta((n) => n + 1);
    }
  };
  const nuevaConversacion = () => {
    const n = crypto.randomUUID();
    try {
      window.localStorage.setItem(claveSesion(bot.id), n);
    } catch {
      /* sin almacenamiento: la conversación dura mientras la pantalla esté abierta */
    }
    setSesion(n);
    setMensajes(inicio());
    setMenu(false);
  };
  const eliminar = async () => {
    setMenu(false);
    if (!window.confirm(`¿Eliminar ${bot.nombre}? Tu área deja de verlo.`)) return;
    try {
      await api(`/jarvis/bots/${bot.id}`, { metodo: "DELETE" });
      avisar({ titulo: `${bot.nombre} eliminado` });
      alCambiar();
    } catch (e) {
      avisar({ titulo: "No pudimos eliminar el bot", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };

  return (
    <>
      <header className="jarvis-cabecera">
        <div style={{ position: "relative" }}>
          <button className="jarvis-nombre" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <AvatarBot bot={bot} tam={30} />
            <span>{bot.nombre}</span>
            <LuChevronDown size={14} />
          </button>
          {menu && (
            <div className="jarvis-menu" role="menu">
              <button role="menuitem" onClick={nuevaConversacion}>
                <LuMessageSquarePlus size={14} /> Nueva conversación
              </button>
              {bot.puedeEditar && (
                <button role="menuitem" onClick={() => { setMenu(false); alEditar(); }}>
                  <LuPencil size={14} /> Editar bot
                </button>
              )}
              {bot.puedeEditar && (
                <button role="menuitem" className="jarvis-menu-peligro" onClick={() => void eliminar()}>
                  <LuTrash2 size={14} /> Eliminar bot
                </button>
              )}
            </div>
          )}
        </div>
        <span className="texto-xs texto-muted">Creado por {bot.creadoPor.nombre}</span>
      </header>
      <div className="jarvis-mensajes" aria-live="polite">
        {(mensajes.length === 0 || (!bot.instrucciones.trim() && mensajes.length === 1)) && (
          <div className="jarvis-bienvenida">
            <AvatarBot bot={bot} tam={48} />
            <p className="negrita">{bot.nombre}</p>
            <p className="texto-sm texto-muted" style={{ whiteSpace: "pre-wrap" }}>{bot.instrucciones || "Responde sus preguntas y se configura solo."}</p>
            {!conectado && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>El Jarvis de tu área todavía no está conectado: los bots no pueden responder aún.</p>}
          </div>
        )}
        {mensajes.map((m, i) =>
          m.rol === "aviso" && m.trabajo ? (
            <div key={i} className="aviso-trabajo" role="status">
              <span className="fila" style={{ gap: 6 }}>
                <LuSparkles size={14} /> {m.trabajo.deshecho ? "Deshiciste el cambio a mi trabajo." : m.texto}
              </span>
              {!m.trabajo.deshecho && (
                <span className="fila" style={{ gap: 8 }}>
                  <button className="enlace texto-xs" onClick={() => setViendo(viendo === i ? null : i)}>{viendo === i ? "Ocultar" : "Ver"}</button>
                  {m.trabajo.anterior && bot.puedeEditar && (
                    <button className="enlace texto-xs" onClick={() => void deshacer(i, m.trabajo!)}>Deshacer</button>
                  )}
                </span>
              )}
              {viendo === i && <p className="texto-xs" style={{ whiteSpace: "pre-wrap", flexBasis: "100%" }}>{m.trabajo.nuevo}</p>}
            </div>
          ) : (
            <div key={i} className={`burbuja-jarvis burbuja-jarvis--${m.rol === "yo" ? "yo" : "jarvis"}${m.error ? " burbuja-jarvis--error" : ""}`}>
              {!!m.adjuntos?.length && (
                <span className="jarvis-adjuntos">
                  {m.adjuntos.map((a, j) => (
                    <span key={j} className="jarvis-adjunto">
                      {a.vista ? <img src={a.vista} alt="" /> : <LuPaperclip size={12} />} {a.nombre}
                    </span>
                  ))}
                </span>
              )}
              {enviando && i === mensajes.length - 1 && m.rol === "bot" && pasos.length > 0 && (
                <ul className="jarvis-pasos" aria-label="Lo que está haciendo">
                  {pasos.map((p) => (
                    <li key={p.id} className={p.listo ? "listo" : ""}>
                      {p.listo ? <LuCheck size={12} /> : <LuLoader size={12} className="girando" />} {p.etiqueta}
                    </li>
                  ))}
                </ul>
              )}
              {(m.rol === "bot" ? sinBloqueTrabajo(m.texto) : m.texto) || (enviando && i === mensajes.length - 1 ? "Pensando…" : "")}
              {m.detenido && <span className="jarvis-detenido">Detuviste la respuesta.</span>}
            </div>
          ),
        )}
        <PropuestasJarvis sesion={sesion} version={vuelta} />
        <div ref={fin} />
      </div>
      {(adjuntos.length > 0 || leyendo > 0) && (
        <div className="jarvis-adjuntos jarvis-adjuntos--por-enviar">
          {adjuntos.map((a, j) => (
            <span key={j} className="jarvis-adjunto">
              {"vista" in a ? <img src={a.vista} alt="" /> : <LuPaperclip size={12} />} {a.nombre}
              <button type="button" className="enlace" aria-label={`Quitar ${a.nombre}`} onClick={() => setAdjuntos((xs) => xs.filter((_, k) => k !== j))}>
                <LuX size={12} />
              </button>
            </span>
          ))}
          {leyendo > 0 && <span className="jarvis-adjunto"><LuLoader size={12} className="girando" /> Leyendo…</span>}
        </div>
      )}
      <form className="jarvis-escribir" onSubmit={(e) => void enviar(e)}>
        <input
          ref={selector} type="file" multiple hidden accept={ACEPTA_ADJUNTOS}
          onChange={(e) => { void adjuntar(e.target.files); e.target.value = ""; }}
        />
        <button className="boton" type="button" aria-label="Adjuntar archivos" title="Texto, CSV, PDF, Word o imágenes" disabled={enviando || adjuntos.length >= 5} onClick={() => selector.current?.click()}>
          <LuPaperclip size={14} />
        </button>
        <div className="entrada" style={{ flex: 1 }}>
          <input aria-label={`Mensaje para ${bot.nombre}`} placeholder={`Escríbele a ${bot.nombre}…`} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviando} />
        </div>
        {enviando ? (
          <button className="boton" type="button" onClick={detener} aria-label="Detener respuesta" title="Detener">
            <LuSquare size={14} />
          </button>
        ) : (
          <button className="boton boton--primario" type="submit" disabled={leyendo > 0 || (!texto.trim() && !adjuntos.length)} aria-label="Enviar">
            <LuSend size={14} />
          </button>
        )}
      </form>
    </>
  );
}
