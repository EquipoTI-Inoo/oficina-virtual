"use client";
/**
 * Columnas de los tableros (11 nov 2026): la biblioteca de tipos de Monday. La celda de cada tipo, la biblioteca
 * para agregar columnas, su configuración y el resumen de los números al pie.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LuCheck, LuExternalLink, LuMail, LuMapPin, LuMessageCircle, LuPause, LuPhone, LuPlay, LuPlus, LuSearch, LuStar, LuThumbsUp, LuTrash2, LuX,
  LuCircleDot, LuType, LuUsers, LuCalendar, LuHash, LuList, LuSquareCheck, LuAlignLeft, LuTag, LuCalendarRange, LuCalendarDays, LuClock, LuTimer,
  LuGlobe, LuLink, LuFlag, LuPalette, LuPaperclip, LuFileText, LuMousePointerClick, LuGitBranch, LuNetwork, LuCopy, LuSigma, LuChartBar, LuHistory,
  LuRefreshCw, LuFingerprint, LuListOrdered } from "react-icons/lu";
import type { IconType } from "react-icons";
import { api, ProblemaApi, useConsulta, type S } from "../base";
import { Modal, useAviso } from "../componentes";
import {
  COLORES_ETIQUETA, configInicial, FUNCIONES_FORMULA, info, LISTA_PAISES, resumenNumeros, textoDuracion, TIPOS_COLUMNA, ZONAS_HORARIAS,
  type ConfigColumna, type EtiquetaColumna, type TipoColumna,
} from "../dominio/columnas";
import { ESTADOS_ITEM } from "../dominio/tableros";

type Tablero = S<"TableroInooWork">;
type Item = S<"ItemTablero">;
type Columna = Tablero["columnas"][number];
type Cambiar = (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>;

const cfg = (c: Columna) => (c.config ?? {}) as ConfigColumna;
const vacio = <span className="texto-muted">—</span>;

/** Ventana chica para editar un valor que no entra en la celda. */
function Editor({ titulo, abierto, cerrar, children }: { titulo: string; abierto: boolean; cerrar: () => void; children: ReactNode }) {
  return (
    <Modal abierto={abierto} alCerrar={cerrar} etiqueta={titulo} ancho={520}>
      <h3 style={{ fontSize: "var(--t-lg)", fontWeight: 600, marginBottom: 12 }}>{titulo}</h3>
      {children}
    </Modal>
  );
}

const enBase64 = (f: File) => new Promise<string>((ok, mal) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^;]+;base64,/, ""));
  r.onerror = () => mal(r.error);
  r.readAsDataURL(f);
});

function numeroConUnidad(v: string | number | undefined, c: ConfigColumna) {
  if (v === undefined || v === "") return "";
  const n = Number(v);
  const t = Number.isFinite(n) ? n.toLocaleString("es-PE", { maximumFractionDigits: c.decimales ?? 2, minimumFractionDigits: c.decimales ?? 0 }) : String(v);
  return c.unidad ? (c.unidadAntes ? `${c.unidad} ${t}` : `${t} ${c.unidad}`) : t;
}

// ═════════════════════════════════════════════ celda

export function CeldaColumna({ t, col, item, cambiar, editable }: { t: Tablero; col: Columna; item: Item; cambiar: Cambiar; editable: boolean }) {
  const avisar = useAviso();
  const [abierto, setAbierto] = useState(false);
  const [visor, setVisor] = useState<string | null>(null);
  const c = cfg(col);
  const v = item.valores[col.id];
  const texto = v === undefined ? "" : String(v);
  const dato = (item.datos ?? {})[col.id] as unknown;
  const guardar = (valor: unknown) => cambiar(`/items/${item.id}`, "PATCH", { valores: { [col.id]: valor } });
  const accion = () => cambiar(`/items/${item.id}/columnas/${col.id}/accion`, "POST");
  const etiqueta = `${col.nombre} de ${item.nombre}`;
  const i = info(col.tipo);

  if (i?.calculada) {
    if (col.tipo === "progress" && texto) {
      const n = Number(texto.replace("%", ""));
      return (
        <span className="fila" style={{ gap: 6 }} title={texto}>
          <span className="grafico-pista" style={{ flex: 1, minWidth: 60 }}><span style={{ width: `${n}%`, background: n === 100 ? "#00c875" : "var(--c-primario)" }} /></span>
          <span className="texto-xs">{texto}</span>
        </span>
      );
    }
    return <span className={texto.startsWith("⚠") ? "texto-xs" : undefined} style={texto.startsWith("⚠") ? { color: "var(--c-alerta)" } : undefined} title={texto}>{texto || vacio}</span>;
  }

  switch (col.tipo as TipoColumna | "text" | "file") {
    case "etiqueta": {
      const l = (c.etiquetas ?? []).find((x) => x.texto === texto);
      if (!editable) return l ? <span className="pildora" style={{ background: l.color }}>{l.texto}</span> : vacio;
      return (
        <select className="pildora" aria-label={etiqueta} style={{ background: l?.color ?? "#c4c4c4" }} value={texto} onChange={(e) => void guardar(e.target.value || null)}>
          <option value="">—</option>
          {(c.etiquetas ?? []).map((x) => <option key={x.texto} value={x.texto}>{x.texto}</option>)}
        </select>
      );
    }
    case "number":
      if (!editable) return <span>{numeroConUnidad(v, c) || vacio}</span>;
      return <input key={texto} className="celda-texto" type="number" step="any" aria-label={etiqueta} defaultValue={texto} placeholder="—"
        onBlur={(e) => e.target.value !== texto && void guardar(e.target.value === "" ? null : e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
    case "checkbox":
      return <Casilla marcada={texto === "✓"} etiqueta={etiqueta} editable={editable} guardar={guardar} />;
    case "date":
      return editable
        ? <input type="date" className="celda-fecha" aria-label={etiqueta} value={texto} onChange={(e) => void guardar(e.target.value || null)} />
        : <span>{texto || vacio}</span>;
    case "week":
      return editable ? <input type="week" className="celda-fecha" aria-label={etiqueta} value={texto} onChange={(e) => void guardar(e.target.value || null)} /> : <span>{texto || vacio}</span>;
    case "hour":
      return editable ? <input type="time" className="celda-fecha" style={{ minWidth: 100 }} aria-label={etiqueta} value={texto} onChange={(e) => void guardar(e.target.value || null)} /> : <span>{texto || vacio}</span>;
    case "color_picker":
      return (
        <span className="fila" style={{ gap: 6 }}>
          <input type="color" aria-label={etiqueta} disabled={!editable} value={texto || "#cccccc"} onChange={(e) => void guardar(e.target.value)} style={{ width: 28, height: 24, border: 0, background: "none" }} />
          <span className="texto-xs texto-muted">{texto}</span>
        </span>
      );
    case "rating": {
      const max = c.maximo ?? 5;
      const n = Number(texto || 0);
      return (
        <span className="fila" style={{ gap: 1 }} aria-label={`${etiqueta}: ${n} de ${max}`}>
          {Array.from({ length: max }, (_, k) => (
            <button key={k} type="button" className="boton-icono" disabled={!editable} aria-label={`${k + 1} estrellas`} style={{ padding: 1, color: k < n ? "#fdab3d" : "var(--c-borde)" }}
              onClick={() => void guardar(k + 1 === n ? 0 : k + 1)}>
              <LuStar size={14} fill={k < n ? "#fdab3d" : "none"} />
            </button>
          ))}
        </span>
      );
    }
    case "country":
      return editable ? (
        <select className="celda-select" aria-label={etiqueta} value={texto} onChange={(e) => void guardar(e.target.value || null)}>
          <option value="">—</option>
          {LISTA_PAISES.map((p) => <option key={p}>{p}</option>)}
        </select>
      ) : <span>{texto || vacio}</span>;
    case "world_clock":
      return <RelojMundial zona={texto} editable={editable} etiqueta={etiqueta} guardar={guardar} />;
    case "email": case "phone": case "location": case "text": {
      const icono = col.tipo === "email" && texto ? <a href={`mailto:${texto}`} aria-label={`Escribir a ${texto}`}><LuMail size={13} /></a>
        : col.tipo === "phone" && texto ? <><a href={`tel:${texto}`} aria-label={`Llamar a ${texto}`}><LuPhone size={13} /></a><a href={`https://wa.me/${texto.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp a ${texto}`}><LuMessageCircle size={13} /></a></>
          : col.tipo === "location" && texto ? <a href={`https://www.google.com/maps/search/${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${texto} en el mapa`}><LuMapPin size={13} /></a> : null;
      return (
        <span className="fila" style={{ gap: 4 }}>
          {editable
            ? <input key={texto} className="celda-texto" aria-label={etiqueta} defaultValue={texto} placeholder="—" type={col.tipo === "email" ? "email" : col.tipo === "phone" ? "tel" : "text"}
                onBlur={async (e) => { const x = e.target.value.trim(); if (x !== texto && !(await guardar(x || null))) e.target.value = texto; }} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
            : <span>{texto || vacio}</span>}
          {icono}
        </span>
      );
    }
    case "link": {
      const etiq = (dato as { texto?: string } | undefined)?.texto || texto;
      return (
        <span className="fila" style={{ gap: 4 }}>
          {texto ? <a href={texto} target="_blank" rel="noopener noreferrer" className="texto-sm" title={texto}>{etiq} <LuExternalLink size={11} /></a> : vacio}
          {editable && <button className="boton-icono texto-xs" aria-label={`Editar ${etiqueta}`} onClick={() => setAbierto(true)}>✎</button>}
          {abierto && <EditorEnlace titulo={etiqueta} url={texto} texto={(dato as { texto?: string } | undefined)?.texto ?? ""} cerrar={() => setAbierto(false)} guardar={async (x) => { if (await guardar(x)) setAbierto(false); }} />}
        </span>
      );
    }
    case "tags":
      return editable
        ? <input key={texto} className="celda-texto" aria-label={etiqueta} defaultValue={texto} placeholder="separadas por comas" onBlur={(e) => e.target.value.trim() !== texto && void guardar(e.target.value.trim() || null)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        : <span>{texto ? texto.split(", ").map((x) => <span key={x} className="chip" style={{ marginRight: 4, padding: "1px 8px" }}>#{x}</span>) : vacio}</span>;
    case "long_text": case "doc":
      return (
        <>
          <button type="button" className="celda-texto" style={{ textAlign: "left", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }} aria-label={`Abrir ${etiqueta}`} onClick={() => setAbierto(true)}>
            {texto || <span className="texto-muted">{editable ? (col.tipo === "doc" ? "Crear documento" : "Agregar") : "—"}</span>}
          </button>
          {abierto && (
            <EditorTextoLargo titulo={etiqueta} grande={col.tipo === "doc"} editable={editable}
              valor={col.tipo === "doc" ? ((dato as { texto?: string } | undefined)?.texto ?? "") : texto}
              cerrar={() => setAbierto(false)} guardar={async (x) => { if (await guardar(x || null)) setAbierto(false); }} />
          )}
        </>
      );
    case "timeline": {
      const d = dato as { desde?: string; hasta?: string } | undefined;
      return (
        <>
          <button type="button" className="celda-texto" style={{ textAlign: "left", cursor: editable ? "pointer" : "default" }} disabled={!editable} aria-label={`Editar ${etiqueta}`} onClick={() => setAbierto(true)}>{texto || vacio}</button>
          {abierto && (
            <Editor titulo={etiqueta} abierto cerrar={() => setAbierto(false)}>
              <Rango desde={d?.desde ?? ""} hasta={d?.hasta ?? ""} guardar={async (x) => { if (await guardar(x)) setAbierto(false); }} />
            </Editor>
          )}
        </>
      );
    }
    case "dropdown": case "people": case "dependency": case "board_relation": {
      const elegidos = Array.isArray(dato) ? (dato as string[]) : [];
      return (
        <>
          <button type="button" className="celda-texto" style={{ textAlign: "left", cursor: editable ? "pointer" : "default", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }} disabled={!editable} aria-label={`Editar ${etiqueta}`} title={texto} onClick={() => setAbierto(true)}>
            {texto || vacio}
          </button>
          {abierto && <EditorLista t={t} col={col} item={item} elegidos={elegidos} cerrar={() => setAbierto(false)} guardar={async (x) => { if (await guardar(x.length ? x : null)) setAbierto(false); }} />}
        </>
      );
    }
    case "vote": {
      const votos = Array.isArray(dato) ? (dato as string[]) : [];
      return (
        <button type="button" className="chip" aria-label={`Votar en ${etiqueta}`} aria-pressed={false} disabled={!editable} onClick={() => void accion()}>
          <LuThumbsUp size={12} /> {votos.length}
        </button>
      );
    }
    case "time_tracking":
      return <Cronometro item={item} col={col} editable={editable} alternar={accion} />;
    case "button": {
      const listo = !!c.accion;
      return (
        <button type="button" className="boton boton--chico" disabled={!editable || !listo} title={listo ? undefined : "Configura qué hace el botón"} onClick={() => void accion()}>
          {c.texto || "Botón"}
        </button>
      );
    }
    case "file": {
      const xs = Array.isArray(dato) ? (dato as { id: string; nombre: string; bytes: number; version?: number }[]) : [];
      const subir = async (f: File) => {
        if (f.size > 50 * 1024 * 1024) return avisar({ titulo: "El archivo pesa más de 50 MB" });
        await cambiar(`/items/${item.id}/columnas/${col.id}/archivos`, "POST", { nombre: f.name, mime: f.type || "application/octet-stream", base64: await enBase64(f) });
      };
      return (
        <span className="fila" style={{ gap: 4, flexWrap: "wrap" }}>
          {xs.map((a) => (
            <span key={a.id} className="chip" style={{ padding: "1px 6px", gap: 4 }}>
              <button type="button" className="texto-xs" style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => setVisor(a.id)} title={`Ver ${a.nombre}`}>
                {a.nombre}{(a.version ?? 1) > 1 && <span className="texto-muted"> · V{a.version}</span>}
              </button>
              {editable && <button type="button" className="boton-icono" style={{ padding: 0 }} aria-label={`Quitar ${a.nombre}`} onClick={() => window.confirm(`¿Quitar «${a.nombre}» con todas sus versiones y comentarios?`) && void cambiar(`/items/${item.id}/columnas/${col.id}/archivos/${a.id}`, "DELETE")}><LuX size={11} /></button>}
            </span>
          ))}
          {editable && (
            <label className="boton-icono" style={{ cursor: "pointer" }} aria-label={`Subir archivo a ${etiqueta}`} title="Subir archivo">
              <LuPlus size={13} />
              <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subir(f); }} />
            </label>
          )}
          {!xs.length && !editable && vacio}
          {visor && <VisorArchivo t={t} col={col} item={item} archivoId={visor} editable={editable} cambiar={cambiar} cerrar={() => setVisor(null)} />}
        </span>
      );
    }
    default:
      return editable
        ? <input key={texto} className="celda-texto" aria-label={etiqueta} defaultValue={texto} placeholder="—" onBlur={(e) => e.target.value.trim() !== texto && void guardar(e.target.value.trim() || null)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        : <span>{texto || vacio}</span>;
  }
}

/** Se marca al instante; si no se pudo guardar, vuelve a como estaba. */
function Casilla({ marcada, etiqueta, editable, guardar }: { marcada: boolean; etiqueta: string; editable: boolean; guardar: (v: unknown) => Promise<boolean> }) {
  const [v, setV] = useState(marcada);
  useEffect(() => setV(marcada), [marcada]);
  return (
    <input type="checkbox" aria-label={etiqueta} checked={v} disabled={!editable} style={{ width: 18, height: 18 }}
      onChange={async (e) => { const x = e.target.checked; setV(x); if (!(await guardar(x))) setV(!x); }} />
  );
}

function RelojMundial({ zona, editable, etiqueta, guardar }: { zona: string; editable: boolean; etiqueta: string; guardar: (v: unknown) => Promise<boolean> }) {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const x = setInterval(() => setAhora(new Date()), 30_000);
    return () => clearInterval(x);
  }, []);
  const hora = zona ? ahora.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: zona }) : "";
  return (
    <span className="fila" style={{ gap: 6 }}>
      {hora && <span className="negrita texto-sm">{hora}</span>}
      {editable ? (
        <select className="celda-select" style={{ minWidth: 120 }} aria-label={etiqueta} value={zona} onChange={(e) => void guardar(e.target.value || null)}>
          <option value="">—</option>
          {ZONAS_HORARIAS.map((z) => <option key={z} value={z}>{z.replace(/^.*\//, "").replace(/_/g, " ")}</option>)}
        </select>
      ) : <span className="texto-xs texto-muted">{zona.replace(/^.*\//, "").replace(/_/g, " ")}</span>}
    </span>
  );
}

function Cronometro({ item, col, editable, alternar }: { item: Item; col: Columna; editable: boolean; alternar: () => Promise<boolean> }) {
  const d = (item.datos ?? {})[col.id] as { segundos?: number; desde?: string | null } | undefined;
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!d?.desde) return;
    const x = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(x);
  }, [d?.desde]);
  const seg = (d?.segundos ?? 0) + (d?.desde ? Math.max(0, Math.round((Date.now() - Date.parse(d.desde)) / 1000)) : 0);
  return (
    <span className="fila" style={{ gap: 6 }}>
      <button type="button" className="boton-icono" disabled={!editable} aria-label={d?.desde ? "Pausar el cronómetro" : "Iniciar el cronómetro"} onClick={() => void alternar()} style={{ color: d?.desde ? "var(--c-alerta)" : "var(--c-primario)" }}>
        {d?.desde ? <LuPause size={14} /> : <LuPlay size={14} />}
      </button>
      <span className="texto-sm" style={{ fontVariantNumeric: "tabular-nums" }}>{seg ? (d?.desde ? `${textoDuracion(seg)} ${String(seg % 60).padStart(2, "0")}s` : textoDuracion(seg)) : "—"}</span>
    </span>
  );
}

function Rango({ desde, hasta, guardar }: { desde: string; hasta: string; guardar: (v: unknown) => void }) {
  const [a, setA] = useState(desde);
  const [b, setB] = useState(hasta);
  return (
    <div className="pila" style={{ gap: 10 }}>
      <div className="grid-2" style={{ gap: 10 }}>
        <label className="pila" style={{ gap: 4 }}><span className="texto-sm">Inicio</span><input type="date" className="input" value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="pila" style={{ gap: 4 }}><span className="texto-sm">Fin</span><input type="date" className="input" value={b} min={a} onChange={(e) => setB(e.target.value)} /></label>
      </div>
      <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
        {(desde || hasta) && <button className="boton" onClick={() => guardar(null)}>Quitar</button>}
        <button className="boton boton--primario" disabled={!a || !b || b < a} onClick={() => guardar({ desde: a, hasta: b })}>Guardar</button>
      </div>
    </div>
  );
}

function EditorEnlace({ titulo, url, texto, cerrar, guardar }: { titulo: string; url: string; texto: string; cerrar: () => void; guardar: (v: unknown) => void }) {
  const [u, setU] = useState(url);
  const [t, setT] = useState(texto);
  return (
    <Editor titulo={titulo} abierto cerrar={cerrar}>
      <div className="pila" style={{ gap: 10 }}>
        <label className="pila" style={{ gap: 4 }}><span className="texto-sm">Dirección</span><input className="input" value={u} placeholder="https://" onChange={(e) => setU(e.target.value)} /></label>
        <label className="pila" style={{ gap: 4 }}><span className="texto-sm">Texto que se muestra (opcional)</span><input className="input" value={t} maxLength={120} onChange={(e) => setT(e.target.value)} /></label>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          {url && <button className="boton" onClick={() => guardar(null)}>Quitar</button>}
          <button className="boton boton--primario" disabled={!u.trim()} onClick={() => guardar({ url: u.trim(), texto: t.trim() })}>Guardar</button>
        </div>
      </div>
    </Editor>
  );
}

function EditorTextoLargo({ titulo, valor, grande, editable, cerrar, guardar }: { titulo: string; valor: string; grande: boolean; editable: boolean; cerrar: () => void; guardar: (v: string) => void }) {
  const [x, setX] = useState(valor);
  return (
    <Modal abierto alCerrar={cerrar} etiqueta={titulo} ancho={grande ? 820 : 560}>
      <h3 style={{ fontSize: "var(--t-lg)", fontWeight: 600, marginBottom: 12 }}>{titulo}</h3>
      {editable ? (
        <>
          <textarea className="input" style={{ width: "100%", minHeight: grande ? 420 : 200, fontFamily: grande ? "inherit" : undefined, lineHeight: 1.5 }} value={x} maxLength={grande ? 50000 : 5000}
            placeholder={grande ? "# Título\n\nEscribe el documento…" : "Escribe aquí…"} onChange={(e) => setX(e.target.value)} />
          <div className="fila" style={{ gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
            <button className="boton" onClick={cerrar}>Cancelar</button>
            <button className="boton boton--primario" onClick={() => guardar(x.trim())}>Guardar</button>
          </div>
        </>
      ) : <p className="texto-sm" style={{ whiteSpace: "pre-wrap" }}>{valor || "—"}</p>}
    </Modal>
  );
}

/** Elegir varios: opciones del desplegable, personas, ítems de este tablero o del tablero conectado. */
function EditorLista({ t, col, item, elegidos, cerrar, guardar }: { t: Tablero; col: Columna; item: Item; elegidos: string[]; cerrar: () => void; guardar: (v: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(elegidos);
  const [q, setQ] = useState("");
  const otro = useConsulta<Tablero>(col.tipo === "board_relation" && cfg(col).tableroId ? `/tableros/${cfg(col).tableroId}` : null);
  const opciones: { id: string; nombre: string }[] = useMemo(() => {
    if (col.tipo === "dropdown") return (cfg(col).opciones ?? []).map((o) => ({ id: o, nombre: o }));
    if (col.tipo === "people") return t.personas.map((p) => ({ id: p.id, nombre: p.nombre }));
    if (col.tipo === "dependency") return t.items.filter((i) => i.id !== item.id).map((i) => ({ id: i.id, nombre: i.nombre }));
    return (otro.datos?.items ?? []).map((i) => ({ id: i.id, nombre: i.nombre }));
  }, [col, t, item.id, otro.datos]);
  const vistas = opciones.filter((o) => !q.trim() || o.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Editor titulo={`${col.nombre} · ${item.nombre}`} abierto cerrar={cerrar}>
      {col.tipo === "board_relation" && !cfg(col).tableroId ? <p className="texto-sm texto-muted">Primero elige qué tablero conecta esta columna (menú de la columna → Configurar).</p>
        : otro.error ? <p className="texto-sm texto-muted">No puedes ver el tablero conectado.</p> : (
          <div className="pila" style={{ gap: 8 }}>
            {opciones.length > 8 && <div className="entrada"><input aria-label="Buscar" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /><span className="icono-campo" aria-hidden><LuSearch size={14} /></span></div>}
            <div className="pila" style={{ gap: 4, maxHeight: 320, overflow: "auto" }}>
              {!opciones.length && <p className="texto-sm texto-muted">{col.tipo === "dropdown" ? "La columna no tiene opciones: agrégalas en Configurar." : "No hay nada que elegir."}</p>}
              {vistas.map((o) => (
                <label key={o.id} className="fila texto-sm" style={{ gap: 8 }}>
                  <input type="checkbox" checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} /> {o.nombre}
                </label>
              ))}
            </div>
            <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button className="boton" onClick={cerrar}>Cancelar</button>
              <button className="boton boton--primario" onClick={() => guardar(sel)}>Guardar</button>
            </div>
          </div>
        )}
    </Editor>
  );
}

// ═════════════════════════════════════════════ visor de archivos: versiones y comentarios (como en Monday)

type Comentarios = S<"ComentariosArchivo">;
const pesoArchivo = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fechaCorta = (f: string) => (f ? new Date(f).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" }) : "");

function VisorArchivo({ t, col, item, archivoId, editable, cambiar, cerrar }: { t: Tablero; col: Columna; item: Item; archivoId: string; editable: boolean; cambiar: Cambiar; cerrar: () => void }) {
  const avisar = useAviso();
  const r = useConsulta<Comentarios>(`/tableros/${t.id}/archivos/${archivoId}/comentarios`);
  const [verId, setVerId] = useState<string | null>(null);
  const [pestana, setPestana] = useState<"VERSIONES" | "COMENTARIOS">("COMENTARIOS");
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [texto, setTexto] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const a = r.datos?.archivo;
  const v = a?.versiones.find((x) => x.id === verId) ?? a?.versiones[a.versiones.length - 1];
  const tipo = v?.mime ?? "";
  const vista = /^image\//.test(tipo) ? "IMAGEN" : /^video\//.test(tipo) ? "VIDEO" : /^audio\//.test(tipo) ? "AUDIO" : tipo === "application/pdf" ? "PDF" : null;

  useEffect(() => {
    if (!v || !vista) return;
    let vivo = true;
    let creada: string | null = null;
    setCargando(true);
    setUrl(null);
    api<Blob | string>(`/tableros/${t.id}/archivos/${v.id}?enLinea=1`)
      .then((b) => { if (!vivo) return; creada = URL.createObjectURL(b instanceof Blob ? b : new Blob([b], { type: tipo })); setUrl(creada); })
      .catch(() => vivo && setUrl(null))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [t.id, v?.id, vista, tipo]);

  const descargar = async (x: { id: string; nombre: string }) => {
    try {
      const b = await api<Blob | string>(`/tableros/${t.id}/archivos/${x.id}`);
      const u = URL.createObjectURL(b instanceof Blob ? b : new Blob([b]));
      const enl = document.createElement("a");
      enl.href = u;
      enl.download = x.nombre;
      enl.click();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch (e) {
      avisar({ titulo: "No se pudo descargar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const nuevaVersion = async (f: File) => {
    if (f.size > 50 * 1024 * 1024) return avisar({ titulo: "El archivo pesa más de 50 MB" });
    setSubiendo(true);
    try {
      if (await cambiar(`/items/${item.id}/columnas/${col.id}/archivos/${archivoId}/versiones`, "POST", { nombre: f.name, mime: f.type || "application/octet-stream", base64: await enBase64(f) })) {
        setVerId(null);
        await r.recargar();
      }
    } finally {
      setSubiendo(false);
    }
  };
  const comentar = async () => {
    if (!texto.trim() || !v) return;
    try {
      r.setDatos(await api<Comentarios>(`/tableros/${t.id}/archivos/${archivoId}/comentarios`, { metodo: "POST", cuerpo: { texto: texto.trim(), version: v.version } }));
      setTexto("");
    } catch (e) {
      avisar({ titulo: "No se pudo comentar", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
    }
  };

  return (
    <Modal abierto alCerrar={cerrar} etiqueta={`Archivo ${a?.nombre ?? ""}`} ancho={1180}>
      {r.error ? <p className="texto-sm">No pudimos abrir el archivo.</p> : !a || !v ? <p className="texto-sm texto-muted">Cargando…</p> : (
        <div className="visor-archivo">
          <div className="visor-archivo-principal">
            <div className="fila entre" style={{ gap: 8, marginBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: "var(--t-md)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nombre}</h3>
                <span className="texto-xs texto-muted">{item.nombre} · {col.nombre}</span>
              </div>
              <span className="fila" style={{ gap: 6 }}>
                <span className="etiqueta-version">V{v.version}{v.version === a.version ? " · actual" : ""}</span>
                <button className="boton boton--chico" onClick={() => void descargar(v)}>Descargar</button>
              </span>
            </div>
            <div className="visor-archivo-lienzo">
              {!vista ? (
                <div className="pila" style={{ gap: 8, alignItems: "center", color: "var(--c-sobre-oscuro)" }}>
                  <span className="texto-sm">Este tipo de archivo no tiene vista previa.</span>
                  <button className="boton boton--chico" onClick={() => void descargar(v)}>Descargar {pesoArchivo(v.bytes)}</button>
                </div>
              ) : cargando || !url ? <span className="texto-sm" style={{ color: "var(--c-sobre-oscuro)" }}>{cargando ? "Cargando la vista previa…" : "No se pudo cargar la vista previa"}</span>
                : vista === "IMAGEN" ? <img src={url} alt={v.nombre} />
                  : vista === "VIDEO" ? <video src={url} controls />
                    : vista === "AUDIO" ? <audio src={url} controls />
                      : <iframe src={url} title={v.nombre} />}
            </div>
          </div>
          <aside className="visor-archivo-lado">
            <div className="segmentado" role="tablist" aria-label="Panel del archivo" style={{ marginBottom: 10 }}>
              <button role="tab" aria-selected={pestana === "COMENTARIOS"} className={pestana === "COMENTARIOS" ? "activo" : undefined} onClick={() => setPestana("COMENTARIOS")}>Comentarios ({r.datos!.datos.length})</button>
              <button role="tab" aria-selected={pestana === "VERSIONES"} className={pestana === "VERSIONES" ? "activo" : undefined} onClick={() => setPestana("VERSIONES")}>Versiones ({a.versiones.length})</button>
            </div>
            {pestana === "VERSIONES" ? (
              <div className="pila" style={{ gap: 8 }}>
                {editable && (
                  <label className="boton boton--chico boton--primario" style={{ justifySelf: "start", cursor: "pointer" }}>
                    {subiendo ? "Subiendo…" : "Agregar versión"}
                    <input type="file" hidden disabled={subiendo} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void nuevaVersion(f); }} />
                  </label>
                )}
                {[...a.versiones].reverse().map((x) => (
                  <button key={x.id} type="button" className={`version-archivo${x.id === v.id ? " version-archivo--activa" : ""}`} onClick={() => setVerId(x.id)}>
                    <span className="fila entre" style={{ gap: 6 }}>
                      <span className="negrita texto-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.nombre}</span>
                      <span className="etiqueta-version">V{x.version}</span>
                    </span>
                    <span className="texto-xs texto-muted">{[x.por, fechaCorta(x.en), pesoArchivo(x.bytes)].filter(Boolean).join(" · ")}{x.version === a.version ? " · actual" : ""}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="pila" style={{ gap: 8 }}>
                <div className="pila" style={{ gap: 8, maxHeight: 380, overflow: "auto" }}>
                  {!r.datos!.datos.length && <p className="texto-sm texto-muted">Todavía no hay comentarios.</p>}
                  {r.datos!.datos.map((x) => (
                    <div key={x.id} className="comentario-archivo">
                      <span className="fila entre texto-xs" style={{ gap: 6 }}>
                        <span><span className="negrita">{x.autor}</span> <span className="texto-muted">· {fechaCorta(x.en)}</span></span>
                        <button type="button" className="etiqueta-version" onClick={() => setVerId(a.versiones.find((y) => y.version === x.version)?.id ?? null)} title="Ver esa versión">V{x.version}</button>
                      </span>
                      <p className="texto-sm" style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{x.texto}</p>
                    </div>
                  ))}
                </div>
                <textarea className="input" style={{ minHeight: 70 }} aria-label="Comentario" placeholder={`Comentar la V${v.version}…`} value={texto} maxLength={5000} onChange={(e) => setTexto(e.target.value)} />
                <button className="boton boton--chico boton--primario" style={{ justifySelf: "end" }} disabled={!texto.trim()} onClick={() => void comentar()}>Comentar en la V{v.version}</button>
              </div>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}

// ═════════════════════════════════════════════ pie de los números

export function PieNumeros({ col, items }: { col: Columna; items: Item[] }) {
  if (col.tipo !== "number") return null;
  const c = cfg(col);
  const r = resumenNumeros(items.map((i) => String(i.valores[col.id] ?? "")), c.resumen);
  if (r === null) return null;
  const nombre = { SUMA: "suma", PROMEDIO: "promedio", MINIMO: "mín.", MAXIMO: "máx.", NINGUNO: "" }[c.resumen ?? "SUMA"];
  return <span className="texto-xs" title={nombre}><span className="texto-muted">{nombre} </span><span className="negrita">{numeroConUnidad(r, c)}</span></span>;
}

// ═════════════════════════════════════════════ biblioteca y configuración

/**
 * 13 nov 2026: cada tipo con su ícono y su color, como en Monday, para reconocerlo de un vistazo. Los colores son de
 * categoría (no de estado): agrupan los tipos parecidos.
 */
const ICONO_TIPO: Record<string, [IconType, string]> = {
  etiqueta: [LuCircleDot, "#00c875"], text: [LuType, "#579bfc"], people: [LuUsers, "#a25ddc"], date: [LuCalendar, "#fdab3d"],
  number: [LuHash, "#037f4c"], dropdown: [LuList, "#579bfc"], checkbox: [LuSquareCheck, "#00c875"], long_text: [LuAlignLeft, "#579bfc"],
  tags: [LuTag, "#ff642e"], timeline: [LuCalendarRange, "#fdab3d"], week: [LuCalendarDays, "#fdab3d"], hour: [LuClock, "#fdab3d"],
  time_tracking: [LuTimer, "#e2445c"], world_clock: [LuGlobe, "#66ccff"], email: [LuMail, "#0086c0"], phone: [LuPhone, "#0086c0"],
  link: [LuLink, "#0086c0"], country: [LuFlag, "#66ccff"], location: [LuMapPin, "#e2445c"], rating: [LuStar, "#ffcb00"],
  vote: [LuThumbsUp, "#a25ddc"], color_picker: [LuPalette, "#ff158a"], file: [LuPaperclip, "#784bd1"], doc: [LuFileText, "#784bd1"],
  button: [LuMousePointerClick, "#ff642e"], dependency: [LuGitBranch, "#7f5347"], board_relation: [LuNetwork, "#7f5347"], mirror: [LuCopy, "#7f5347"],
  formula: [LuSigma, "#225091"], progress: [LuChartBar, "#00c875"], creation_log: [LuHistory, "#808080"], last_updated: [LuRefreshCw, "#808080"],
  item_id: [LuFingerprint, "#808080"], auto_number: [LuListOrdered, "#808080"],
};
export function IconoTipoColumna({ tipo, tamano = 28 }: { tipo: string; tamano?: number }) {
  const [Icono, color] = ICONO_TIPO[tipo] ?? [LuType, "#808080"];
  return (
    <span aria-hidden="true" className="icono-tipo-columna" style={{ background: color, width: tamano, height: tamano }}>
      <Icono size={Math.round(tamano * 0.55)} />
    </span>
  );
}

export function BibliotecaColumnas({ t, cambiar, cerrar }: { t: Tablero; cambiar: Cambiar; cerrar: () => void }) {
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoColumna | null>(null);
  const grupos = [...new Set(TIPOS_COLUMNA.map((x) => x.grupo))];
  const filtro = (x: (typeof TIPOS_COLUMNA)[number]) => !q.trim() || `${x.nombre} ${x.descripcion}`.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <Modal abierto alCerrar={cerrar} etiqueta="Biblioteca de columnas" ancho={860}>
      {!tipo ? (
        <div className="pila" style={{ gap: 14 }}>
          <div>
            <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Biblioteca de columnas</h2>
            <p className="texto-sm texto-muted">Los mismos tipos de Monday. Elige uno para agregarlo al tablero.</p>
          </div>
          <div className="entrada" style={{ maxWidth: 320 }}>
            <input aria-label="Buscar tipo de columna" placeholder="Buscar: fecha, fórmula, archivos…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="icono-campo" aria-hidden><LuSearch size={14} /></span>
          </div>
          {grupos.map((g) => {
            const xs = TIPOS_COLUMNA.filter((x) => x.grupo === g && filtro(x));
            if (!xs.length) return null;
            return (
              <section key={g} className="pila" style={{ gap: 6 }}>
                <h3 className="texto-sm negrita">{g}</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                  {xs.map((x) => (
                    <button key={x.tipo} type="button" className="tarjeta tipo-columna" onClick={() => setTipo(x.tipo)}>
                      <IconoTipoColumna tipo={x.tipo} />
                      <span style={{ minWidth: 0 }}>
                        <span className="negrita texto-sm" style={{ display: "block" }}>{x.nombre}</span>
                        <span className="texto-xs texto-muted">{x.descripcion}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <FormColumna t={t} tipo={tipo} volver={() => setTipo(null)}
          guardar={async (nombre, config) => { if (await cambiar("/columnas", "POST", { nombre, tipo, config })) cerrar(); }} />
      )}
    </Modal>
  );
}

export function ConfigurarColumna({ t, col, cambiar, cerrar }: { t: Tablero; col: Columna; cambiar: Cambiar; cerrar: () => void }) {
  return (
    <Modal abierto alCerrar={cerrar} etiqueta={`Configurar ${col.nombre}`} ancho={680}>
      <FormColumna t={t} tipo={col.tipo as TipoColumna} col={col}
        guardar={async (nombre, config) => { if (await cambiar(`/columnas/${col.id}`, "PATCH", { nombre, ...(info(col.tipo) ? { config } : {}) })) cerrar(); }}
        borrar={async () => { if (window.confirm(`¿Borrar la columna «${col.nombre}» y todos sus valores? También se borra en InooWork.`) && (await cambiar(`/columnas/${col.id}`, "DELETE"))) cerrar(); }} />
    </Modal>
  );
}

function FormColumna({ t, tipo, col, volver, guardar, borrar }: { t: Tablero; tipo: TipoColumna; col?: Columna; volver?: () => void; guardar: (nombre: string, config: ConfigColumna) => void; borrar?: () => void }) {
  const i = info(tipo);
  const [nombre, setNombre] = useState(col?.nombre ?? i?.nombre ?? "");
  const [c, setC] = useState<ConfigColumna>(() => ({ ...configInicial(tipo), ...((col?.config ?? {}) as ConfigColumna) }));
  const otras = t.columnas.filter((x) => x.id !== col?.id);
  const tableros = useConsulta<{ datos: S<"TableroResumen">[] }>(tipo === "board_relation" ? "/tableros" : null);
  const conexion = otras.find((x) => x.id === c.conexionId);
  const destino = useConsulta<Tablero>(tipo === "mirror" && (conexion?.config as ConfigColumna | null)?.tableroId ? `/tableros/${(conexion!.config as ConfigColumna).tableroId}` : null);
  const objetivo = c.accion ? otras.find((x) => x.id === c.accion!.columnaId) : undefined;

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div>
        {volver && <button className="boton-texto texto-sm" onClick={volver}>← Biblioteca</button>}
        <h2 className="fila" style={{ fontSize: "var(--t-xl)", fontWeight: 600, gap: 10 }}><IconoTipoColumna tipo={tipo} tamano={30} />{col ? "Configurar columna" : "Nueva columna"}: {i?.nombre ?? tipo}</h2>
        {i && <p className="texto-sm texto-muted">{i.descripcion}</p>}
      </div>
      <label className="pila" style={{ gap: 4 }}>
        <span className="texto-sm negrita">Nombre</span>
        <input className="input" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
      </label>

      {tipo === "etiqueta" && <Etiquetas valor={c.etiquetas ?? []} cambiar={(etiquetas) => setC({ ...c, etiquetas })} />}
      {tipo === "dropdown" && (
        <label className="pila" style={{ gap: 4 }}>
          <span className="texto-sm negrita">Opciones (una por línea)</span>
          <textarea className="input" style={{ minHeight: 120 }} value={(c.opciones ?? []).join("\n")} onChange={(e) => setC({ ...c, opciones: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
        </label>
      )}
      {tipo === "number" && (
        <div className="grid-2" style={{ gap: 10 }}>
          <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Unidad</span><input className="input" maxLength={8} placeholder="S/, %, h…" value={c.unidad ?? ""} onChange={(e) => setC({ ...c, unidad: e.target.value })} /></label>
          <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Posición</span>
            <select className="input" value={c.unidadAntes ? "antes" : "despues"} onChange={(e) => setC({ ...c, unidadAntes: e.target.value === "antes" })}><option value="antes">Antes (S/ 100)</option><option value="despues">Después (100 h)</option></select></label>
          <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Resumen al pie</span>
            <select className="input" value={c.resumen ?? "SUMA"} onChange={(e) => setC({ ...c, resumen: e.target.value as ConfigColumna["resumen"] })}>
              <option value="SUMA">Suma</option><option value="PROMEDIO">Promedio</option><option value="MINIMO">Mínimo</option><option value="MAXIMO">Máximo</option><option value="NINGUNO">Ninguno</option>
            </select></label>
          <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Decimales</span>
            <select className="input" value={c.decimales ?? ""} onChange={(e) => setC({ ...c, decimales: e.target.value === "" ? undefined : Number(e.target.value) })}>
              <option value="">Automático</option>{[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>
        </div>
      )}
      {tipo === "rating" && (
        <label className="pila" style={{ gap: 4, maxWidth: 200 }}><span className="texto-sm negrita">Estrellas</span>
          <select className="input" value={c.maximo ?? 5} onChange={(e) => setC({ ...c, maximo: Number(e.target.value) })}>{Array.from({ length: 10 }, (_, k) => <option key={k + 1}>{k + 1}</option>)}</select></label>
      )}
      {tipo === "button" && (
        <div className="pila" style={{ gap: 10 }}>
          <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Texto del botón</span><input className="input" maxLength={30} value={c.texto ?? ""} onChange={(e) => setC({ ...c, texto: e.target.value })} /></label>
          <div className="grid-2" style={{ gap: 10 }}>
            <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Al hacer clic, cambia</span>
              <select className="input" value={c.accion?.columnaId ?? ""} onChange={(e) => setC({ ...c, accion: e.target.value ? { columnaId: e.target.value, valor: "" } : undefined })}>
                <option value="">Elige una columna</option>
                <option value="status">Estado (del ítem)</option>
                {otras.filter((x) => x.tipo === "etiqueta" || x.tipo === "checkbox").map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select></label>
            {c.accion && (
              <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">A</span>
                <select className="input" value={c.accion.valor} onChange={(e) => setC({ ...c, accion: { ...c.accion!, valor: e.target.value } })}>
                  <option value="">Elige</option>
                  {c.accion.columnaId === "status" ? ESTADOS_ITEM.map((x) => <option key={x}>{x}</option>)
                    : objetivo?.tipo === "checkbox" ? <><option value="✓">Marcada</option><option value="false">Desmarcada</option></>
                      : ((objetivo?.config as ConfigColumna | null)?.etiquetas ?? []).map((l) => <option key={l.texto}>{l.texto}</option>)}
                </select></label>
            )}
          </div>
        </div>
      )}
      {tipo === "board_relation" && (
        <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Tablero a conectar</span>
          <select className="input" value={c.tableroId ?? ""} onChange={(e) => setC({ ...c, tableroId: e.target.value || undefined })}>
            <option value="">Elige un tablero</option>
            {(tableros.datos?.datos ?? []).filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id}>{x.cliente ? `${x.cliente} · ` : ""}{x.nombre}</option>)}
          </select></label>
      )}
      {tipo === "mirror" && (
        <div className="grid-2" style={{ gap: 10 }}>
          <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Columna de conexión</span>
            <select className="input" value={c.conexionId ?? ""} onChange={(e) => setC({ ...c, conexionId: e.target.value || undefined, columnaEspejo: undefined })}>
              <option value="">Elige</option>
              {otras.filter((x) => x.tipo === "board_relation").map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            {!otras.some((x) => x.tipo === "board_relation") && <span className="texto-xs texto-muted">Primero agrega una columna «Conectar tableros».</span>}
          </label>
          <label className="pila" style={{ gap: 4 }}><span className="texto-sm negrita">Columna a mostrar</span>
            <select className="input" value={c.columnaEspejo ?? ""} disabled={!destino.datos} onChange={(e) => setC({ ...c, columnaEspejo: e.target.value || undefined })}>
              <option value="">Elige</option>
              <option value="status">Estado</option><option value="assignee">Responsable</option><option value="dueDate">Fecha límite</option>
              {(destino.datos?.columnas ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select></label>
        </div>
      )}
      {tipo === "formula" && <Formula t={t} valor={c.expresion ?? ""} cambiar={(expresion) => setC({ ...c, expresion })} />}
      {tipo === "progress" && (
        <div className="pila" style={{ gap: 4 }}>
          <span className="texto-sm negrita">Cuenta como hecho cuando…</span>
          <span className="texto-xs texto-muted">En las columnas de estado, cuentan las etiquetas marcadas como «hecho».</span>
          {[{ id: "status", nombre: "Estado del ítem = Completado" }, ...otras.filter((x) => x.tipo === "etiqueta" || x.tipo === "checkbox").map((x) => ({ id: x.id, nombre: x.nombre }))].map((x) => (
            <label key={x.id} className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" checked={(c.columnas ?? []).includes(x.id)} onChange={(e) => setC({ ...c, columnas: e.target.checked ? [...(c.columnas ?? []), x.id] : (c.columnas ?? []).filter((y) => y !== x.id) })} /> {x.nombre}
            </label>
          ))}
        </div>
      )}

      <div className="fila" style={{ gap: 8 }}>
        {borrar && <button className="boton" style={{ color: "var(--c-alerta)" }} onClick={() => void borrar()}><LuTrash2 size={14} /> Borrar columna</button>}
        <span style={{ flex: 1 }} />
        <button className="boton boton--primario" disabled={!nombre.trim()} onClick={() => guardar(nombre.trim(), c)}><LuCheck size={14} /> {col ? "Guardar" : "Agregar columna"}</button>
      </div>
    </div>
  );
}

function Etiquetas({ valor, cambiar }: { valor: EtiquetaColumna[]; cambiar: (v: EtiquetaColumna[]) => void }) {
  const poner = (k: number, x: Partial<EtiquetaColumna>) => cambiar(valor.map((l, n) => (n === k ? { ...l, ...x } : l)));
  return (
    <div className="pila" style={{ gap: 6 }}>
      <span className="texto-sm negrita">Etiquetas</span>
      {valor.map((l, k) => (
        <div key={k} className="fila" style={{ gap: 8 }}>
          <select aria-label={`Color de ${l.texto}`} className="pildora" style={{ background: l.color, width: 44, minWidth: 44 }} value={l.color} onChange={(e) => poner(k, { color: e.target.value })}>
            {COLORES_ETIQUETA.map((cl) => <option key={cl} value={cl} style={{ background: cl }}>■</option>)}
          </select>
          <input className="input" aria-label={`Etiqueta ${k + 1}`} maxLength={40} value={l.texto} onChange={(e) => poner(k, { texto: e.target.value })} style={{ flex: 1 }} />
          <label className="fila texto-xs" style={{ gap: 4 }} title="Cuenta como terminado en el seguimiento del progreso"><input type="checkbox" checked={!!l.hecho} onChange={(e) => poner(k, { hecho: e.target.checked })} /> hecho</label>
          <button className="boton-icono" aria-label={`Quitar ${l.texto}`} disabled={valor.length <= 1} onClick={() => cambiar(valor.filter((_, n) => n !== k))}><LuX size={14} /></button>
        </div>
      ))}
      {valor.length < 40 && (
        <button className="boton boton--chico" style={{ justifySelf: "start" }} onClick={() => cambiar([...valor, { texto: `Etiqueta ${valor.length + 1}`, color: COLORES_ETIQUETA[valor.length % COLORES_ETIQUETA.length] }])}>
          <LuPlus size={13} /> Agregar etiqueta
        </button>
      )}
    </div>
  );
}

function Formula({ t, valor, cambiar }: { t: Tablero; valor: string; cambiar: (v: string) => void }) {
  const insertar = (x: string) => cambiar(`${valor}${valor && !valor.endsWith(" ") ? " " : ""}${x}`);
  return (
    <div className="pila" style={{ gap: 6 }}>
      <span className="texto-sm negrita">Fórmula</span>
      <textarea className="input" style={{ minHeight: 80, fontFamily: "ui-monospace, monospace" }} value={valor} placeholder='{Horas} * {Tarifa}   ·   IF({Avance} = 100, "Listo", "Falta")' onChange={(e) => cambiar(e.target.value)} />
      <span className="texto-xs texto-muted">Columnas (clic para insertar):</span>
      <div className="fila" style={{ gap: 4, flexWrap: "wrap" }}>
        {["Nombre", "Estado", "Fecha límite", "Prioridad", ...t.columnas.filter((x) => x.tipo !== "formula").map((x) => x.nombre)].map((n) => (
          <button key={n} type="button" className="chip" style={{ padding: "1px 8px" }} onClick={() => insertar(`{${n}}`)}>{n}</button>
        ))}
      </div>
      <details className="texto-xs">
        <summary>Funciones</summary>
        <p style={{ marginTop: 4 }}>{FUNCIONES_FORMULA.join(" · ")}</p>
        <p className="texto-muted">Operadores: + − * / ^ %, comparaciones = &lt;&gt; &lt; &gt; &lt;= &gt;=, y &amp; para unir texto. Fechas en formato AAAA-MM-DD; DAYS(fin, inicio) da los días entre dos fechas.</p>
      </details>
    </div>
  );
}
