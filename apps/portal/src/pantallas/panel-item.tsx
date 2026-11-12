"use client";
/**
 * Panel del ítem (12 nov 2026), como el de Monday: se abre al costado del tablero con la conversación del ítem
 * (actualizaciones, respuestas y @menciones que avisan en la campana), sus archivos y lo que traía de Monday.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LuAtSign, LuCornerDownRight, LuFile, LuHistory, LuMessageSquare, LuPencil, LuTrash2, LuX } from "react-icons/lu";
import { api, fDiaHora, ProblemaApi, useConsulta, type S } from "../base";
import { useAviso } from "../componentes";
import { COLOR_ESTADO, ESTADOS_ITEM, PRIORIDADES_ITEM, type EstadoItem } from "../dominio/tableros";
import { CeldaColumna } from "./columnas-tablero";
import { HistorialMonday } from "./monday";

type Tablero = S<"TableroInooWork">;
type Item = S<"ItemTablero">;
type Datos = S<"ActualizacionesItem">;
type Act = Datos["datos"][number];
type Persona = Datos["equipo"][number];

// ───────────────────────────── campo con @menciones

/** Un texto donde «@» sugiere personas del equipo; devuelve el texto y a quiénes se mencionó (los que siguen escritos). */
export function CampoMenciones({ equipo, valor, cambiar, placeholder, etiqueta, alEnviar, autoFocus }: {
  equipo: Persona[]; valor: { texto: string; menciones: string[] }; cambiar: (v: { texto: string; menciones: string[] }) => void;
  placeholder: string; etiqueta: string; alEnviar?: () => void; autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [buscando, setBuscando] = useState<string | null>(null);
  const [marcado, setMarcado] = useState(0);
  const sugeridas = useMemo(() => buscando === null ? [] : equipo.filter((p) => p.nombre.toLowerCase().includes(buscando.toLowerCase())).slice(0, 6), [buscando, equipo]);
  const alEscribir = (texto: string, cursor: number) => {
    const antes = texto.slice(0, cursor);
    const m = /(^|\s)@([\p{L} ]{0,30})$/u.exec(antes);
    setBuscando(m ? m[2] : null);
    setMarcado(0);
    cambiar({ texto, menciones: valor.menciones.filter((id) => texto.includes(`@${equipo.find((p) => p.id === id)?.nombre}`)) });
  };
  const elegir = (p: Persona) => {
    const el = ref.current;
    const cursor = el?.selectionStart ?? valor.texto.length;
    const antes = valor.texto.slice(0, cursor).replace(/@[\p{L} ]{0,30}$/u, `@${p.nombre} `);
    const texto = antes + valor.texto.slice(cursor);
    cambiar({ texto, menciones: [...new Set([...valor.menciones, p.id])] });
    setBuscando(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(antes.length, antes.length); });
  };
  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugeridas.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMarcado((n) => (n + 1) % sugeridas.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMarcado((n) => (n - 1 + sugeridas.length) % sugeridas.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); elegir(sugeridas[marcado]); return; }
      if (e.key === "Escape") { setBuscando(null); return; }
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && alEnviar) { e.preventDefault(); alEnviar(); }
  };
  return (
    <div style={{ position: "relative" }}>
      <textarea ref={ref} className="input" aria-label={etiqueta} placeholder={placeholder} value={valor.texto} maxLength={5000} autoFocus={autoFocus}
        style={{ minHeight: 76, padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}
        onChange={(e) => alEscribir(e.target.value, e.target.selectionStart)} onKeyDown={teclas} onBlur={() => setTimeout(() => setBuscando(null), 150)} />
      {sugeridas.length > 0 && (
        <ul className="sugerencias-mencion" role="listbox" aria-label="Mencionar a">
          {sugeridas.map((p, n) => (
            <li key={p.id} role="option" aria-selected={n === marcado}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); elegir(p); }}><LuAtSign size={12} /> {p.nombre}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** El texto con las menciones resaltadas. */
function TextoConMenciones({ a }: { a: Act }) {
  const nombres = a.menciones.map((m) => `@${m.nombre}`).sort((x, y) => y.length - x.length);
  if (!nombres.length) return <>{a.texto}</>;
  const partes = a.texto.split(new RegExp(`(${nombres.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`));
  return <>{partes.map((p, i) => (nombres.includes(p) ? <span key={i} className="mencion">{p}</span> : p))}</>;
}

// ───────────────────────────── panel

type Cambiar = (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>;

export function PanelItem({ t, item, cerrar, alActualizar, cambiar }: { t: Tablero; item: Item; cerrar: () => void; alActualizar?: () => void; cambiar?: Cambiar }) {
  // 13 nov (auditoría): el panel se edita sin volver a la tabla (estado, responsable, prioridad, fecha, descripción y subítems).
  const editable = t.puedeEditar && !!cambiar;
  const guardar = (b: Record<string, unknown>) => cambiar?.(`/items/${item.id}`, "PATCH", b);
  const avisar = useAviso();
  const r = useConsulta<Datos>(`/tableros/${t.id}/items/${item.id}/actualizaciones`);
  const [pestana, setPestana] = useState<"CONVERSACION" | "ARCHIVOS">("CONVERSACION");
  const [nuevo, setNuevo] = useState({ texto: "", menciones: [] as string[] });
  const [respondiendo, setRespondiendo] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState({ texto: "", menciones: [] as string[] });
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [monday, setMonday] = useState(false);
  const equipo = r.datos?.equipo ?? [];
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !monday && cerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [cerrar, monday]);

  const base = `/tableros/${t.id}/items/${item.id}/actualizaciones`;
  const pedir = async (camino: string, metodo: string, cuerpo?: Record<string, unknown>) => {
    try {
      r.setDatos(await api<Datos>(camino, { metodo, cuerpo }));
      alActualizar?.();
      return true;
    } catch (e) {
      avisar({ titulo: "No se pudo", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
      return false;
    }
  };
  const publicar = async () => {
    if (!nuevo.texto.trim()) return;
    if (await pedir(base, "POST", { texto: nuevo.texto.trim(), mencionIds: nuevo.menciones })) setNuevo({ texto: "", menciones: [] });
  };
  const responder = async (padreId: string) => {
    if (!respuesta.texto.trim()) return;
    if (await pedir(base, "POST", { texto: respuesta.texto.trim(), mencionIds: respuesta.menciones, padreId })) { setRespuesta({ texto: "", menciones: [] }); setRespondiendo(null); }
  };

  const principales = (r.datos?.datos ?? []).filter((a) => !a.padreId).reverse();
  const respuestasDe = (id: string) => (r.datos?.datos ?? []).filter((a) => a.padreId === id);
  const archivos = t.columnas.filter((c) => c.tipo === "file").flatMap((c) => ((item.datos ?? {})[c.id] as { id: string; nombre: string; version?: number }[] | undefined ?? []).map((a) => ({ ...a, columna: c.nombre })));

  const Tarjeta = ({ a, respuesta: esRespuesta }: { a: Act; respuesta?: boolean }) => (
    <article className={`actualizacion${esRespuesta ? " actualizacion--respuesta" : ""}`}>
      <header className="fila entre" style={{ gap: 8 }}>
        <span className="fila" style={{ gap: 8, minWidth: 0 }}>
          <span className="avatar" aria-hidden>{a.autor.nombre.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
          <span style={{ minWidth: 0 }}>
            <span className="negrita texto-sm" style={{ display: "block" }}>{a.autor.nombre}</span>
            <span className="texto-xs texto-muted">{fDiaHora(a.creadoEn)}{a.editadoEn ? " · editada" : ""}</span>
          </span>
        </span>
        {a.esMia && (
          <span className="fila" style={{ gap: 2 }}>
            <button className="boton-icono" aria-label="Editar la actualización" onClick={() => setEditando({ id: a.id, texto: a.texto })}><LuPencil size={13} /></button>
            <button className="boton-icono" aria-label="Borrar la actualización" onClick={() => window.confirm(esRespuesta ? "¿Borrar esta respuesta?" : "¿Borrar esta actualización y sus respuestas?") && void pedir(`${base}/${a.id}`, "DELETE")}><LuTrash2 size={13} /></button>
          </span>
        )}
      </header>
      {editando?.id === a.id ? (
        <div className="pila" style={{ gap: 6, marginTop: 8 }}>
          <textarea className="input" aria-label="Editar la actualización" style={{ minHeight: 70, padding: 10 }} value={editando.texto} onChange={(e) => setEditando({ id: a.id, texto: e.target.value })} />
          <span className="fila" style={{ gap: 6, justifyContent: "flex-end" }}>
            <button className="boton boton--chico" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="boton boton--chico boton--primario" disabled={!editando.texto.trim()} onClick={async () => { if (await pedir(`${base}/${a.id}`, "PATCH", { texto: editando.texto.trim() })) setEditando(null); }}>Guardar</button>
          </span>
        </div>
      ) : <p className="texto-sm" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", lineHeight: 1.55 }}><TextoConMenciones a={a} /></p>}
    </article>
  );

  return (
    <div className="velo velo--lateral" onClick={cerrar}>
      <aside className="panel-lateral" role="dialog" aria-modal="true" aria-label={`Ítem ${item.nombre}`} onClick={(e) => e.stopPropagation()}>
        <header className="panel-lateral-cab">
          <div style={{ minWidth: 0 }}>
            <span className="texto-xs texto-muted">{t.grupos.find((g) => g.id === item.grupoId)?.nombre} · {t.nombre}</span>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "2px 0 8px", overflowWrap: "anywhere" }}>{item.nombre}</h2>
            {!editable ? (
              <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="pildora pildora--chica" style={{ background: COLOR_ESTADO[item.estado as EstadoItem] ?? "#c4c4c4", width: "auto" }}>{item.estado}</span>
                <span className="texto-xs texto-muted">{item.responsable?.nombre ?? "Sin responsable"}{item.fecha ? ` · vence ${item.fecha.split("-").reverse().join("/")}` : ""}</span>
              </span>
            ) : (
              <div className="panel-campos">
                <label><span>Estado</span>
                  <select className="pildora" style={{ background: COLOR_ESTADO[item.estado as EstadoItem] ?? "#c4c4c4" }} value={item.estado} onChange={(e) => void guardar({ estado: e.target.value })}>
                    {ESTADOS_ITEM.map((x) => <option key={x}>{x}</option>)}
                  </select></label>
                <label><span>Responsable</span>
                  <select className="input" value={item.responsable?.id ?? ""} onChange={(e) => void guardar({ responsableId: e.target.value || null })}>
                    <option value="">Sin asignar</option>
                    {t.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select></label>
                <label><span>Prioridad</span>
                  <select className="input" value={item.prioridad} onChange={(e) => void guardar({ prioridad: e.target.value })}>
                    {PRIORIDADES_ITEM.map((x) => <option key={x}>{x}</option>)}
                  </select></label>
                <label><span>Fecha límite</span>
                  <input type="date" className="input" value={item.fecha ?? ""} onChange={(e) => void guardar({ fecha: e.target.value || null })} /></label>
                <label className="panel-campo-ancho"><span>Descripción</span>
                  <textarea key={item.notas} className="input" defaultValue={item.notas} placeholder="Agrega una descripción" style={{ minHeight: 60, padding: "8px 10px" }}
                    onBlur={(e) => e.target.value.trim() !== (item.notas ?? "") && void guardar({ notas: e.target.value.trim() })} /></label>
              </div>
            )}
          </div>
          <button className="boton-icono" aria-label="Cerrar" onClick={cerrar}><LuX size={16} /></button>
        </header>
        <div className="segmentado" role="tablist" aria-label="Secciones del ítem" style={{ margin: "0 20px 12px" }}>
          <button role="tab" aria-selected={pestana === "CONVERSACION"} className={pestana === "CONVERSACION" ? "activo" : undefined} onClick={() => setPestana("CONVERSACION")}>
            <LuMessageSquare size={13} /> Actualizaciones{r.datos?.datos.length ? ` (${r.datos.datos.length})` : ""}
          </button>
          <button role="tab" aria-selected={pestana === "ARCHIVOS"} className={pestana === "ARCHIVOS" ? "activo" : undefined} onClick={() => setPestana("ARCHIVOS")}>
            <LuFile size={13} /> Archivos{archivos.length ? ` (${archivos.length})` : ""}
          </button>
          {item.deMonday && <button role="tab" aria-selected={false} onClick={() => setMonday(true)}><LuHistory size={13} /> De Monday</button>}
        </div>
        <div className="panel-lateral-cuerpo">
          {pestana === "CONVERSACION" ? (
            <div className="pila" style={{ gap: 14 }}>
              {(item.subitems.length > 0 || editable) && (
                <section className="pila" style={{ gap: 4 }} aria-label="Subítems">
                  <span className="texto-xs negrita texto-muted">Subítems ({item.subitems.filter((s) => s.estado === "Completado").length}/{item.subitems.length})</span>
                  {item.subitems.map((s) => (
                    <label key={s.id} className="fila texto-sm" style={{ gap: 8 }}>
                      <input type="checkbox" checked={s.estado === "Completado"} disabled={!editable}
                        onChange={(e) => void cambiar?.(`/items/${item.id}/subitems/${s.id}`, "PATCH", { estado: e.target.checked ? "Completado" : "En Progreso" })} />
                      <span style={s.estado === "Completado" ? { textDecoration: "line-through", color: "var(--c-muted)" } : undefined}>{s.nombre}</span>
                      {s.responsable && <span className="texto-xs texto-muted">· {s.responsable.nombre}</span>}
                    </label>
                  ))}
                  {editable && (
                    <input className="celda-texto" aria-label="Nuevo subítem" placeholder="+ Agregar subítem (Enter)"
                      onKeyDown={async (e) => { if (e.key !== "Enter") return; const el = e.currentTarget; const v = el.value.trim(); if (!v) return; if (await cambiar!(`/items/${item.id}/subitems`, "POST", { nombre: v })) el.value = ""; }} />
                  )}
                </section>
              )}
              <div className="pila" style={{ gap: 6 }}>
                <CampoMenciones equipo={equipo} valor={nuevo} cambiar={setNuevo} etiqueta="Escribir una actualización" alEnviar={() => void publicar()}
                  placeholder="Escribe una actualización… Usa @ para mencionar a alguien del equipo." />
                <span className="fila entre" style={{ gap: 8 }}>
                  <span className="texto-xs texto-muted">Ctrl + Enter para publicar</span>
                  <button className="boton boton--chico boton--primario" disabled={!nuevo.texto.trim()} onClick={() => void publicar()}>Publicar</button>
                </span>
              </div>
              {r.error ? <p className="texto-sm">No pudimos cargar la conversación.</p> : !r.datos ? <p className="texto-sm texto-muted">Cargando…</p> : !principales.length ? (
                <div className="vacio-suave">
                  <LuMessageSquare size={22} />
                  <p className="texto-sm negrita">Todavía no hay actualizaciones</p>
                  <p className="texto-xs texto-muted">Escribe el avance, deja una pregunta o menciona a alguien con @ para avisarle.</p>
                </div>
              ) : principales.map((a) => (
                <div key={a.id} className="pila" style={{ gap: 8 }}>
                  <Tarjeta a={a} />
                  {respuestasDe(a.id).map((x) => <Tarjeta key={x.id} a={x} respuesta />)}
                  {respondiendo === a.id ? (
                    <div className="pila" style={{ gap: 6, marginLeft: 28 }}>
                      <CampoMenciones equipo={equipo} valor={respuesta} cambiar={setRespuesta} etiqueta="Responder" placeholder="Responde…" alEnviar={() => void responder(a.id)} autoFocus />
                      <span className="fila" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="boton boton--chico" onClick={() => setRespondiendo(null)}>Cancelar</button>
                        <button className="boton boton--chico boton--primario" disabled={!respuesta.texto.trim()} onClick={() => void responder(a.id)}>Responder</button>
                      </span>
                    </div>
                  ) : (
                    <button className="boton-texto texto-xs" style={{ marginLeft: 28, justifySelf: "start" }} onClick={() => { setRespondiendo(a.id); setRespuesta({ texto: "", menciones: [] }); }}>
                      <LuCornerDownRight size={12} /> Responder
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="pila" style={{ gap: 8 }}>
              {editable && t.columnas.filter((c) => c.tipo === "file").map((c) => (
                <div key={c.id} className="fila-suave" style={{ padding: "10px 12px", flexWrap: "wrap" }}>
                  <span className="texto-xs negrita texto-muted">{c.nombre}</span>
                  <CeldaColumna t={t} col={c} item={item} cambiar={cambiar!} editable />
                </div>
              ))}
              {editable && t.columnas.some((c) => c.tipo === "file") ? null : !archivos.length ? (
                <div className="vacio-suave">
                  <LuFile size={22} />
                  <p className="texto-sm negrita">Este ítem no tiene archivos</p>
                  <p className="texto-xs texto-muted">{t.columnas.some((c) => c.tipo === "file") ? "Súbelos desde la columna de archivos de la tabla." : "Agrega una columna «Archivos» al tablero para adjuntarlos."}</p>
                </div>
              ) : archivos.map((a) => (
                <div key={a.id} className="fila-suave" style={{ padding: "10px 12px" }}>
                  <span className="fila" style={{ gap: 8, minWidth: 0 }}><LuFile size={15} /> <span className="texto-sm" style={{ overflowWrap: "anywhere" }}>{a.nombre}</span></span>
                  <span className="texto-xs texto-muted">{a.columna}{(a.version ?? 1) > 1 ? ` · V${a.version}` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
      {monday && <HistorialMonday proyectoId={t.id} item={item} alCerrar={() => setMonday(false)} />}
    </div>
  );
}
