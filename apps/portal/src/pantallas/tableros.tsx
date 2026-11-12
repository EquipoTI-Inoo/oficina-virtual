"use client";
/**
 * Proyectos → Tableros de InooWork (2 nov 2026). InooWork es la fuente: el portal muestra sus proyectos con
 * su propio estilo y guarda cada cambio por la API de InooWork (src/servidor/tableros.ts). Vistas: tabla
 * (grupos, ítems y subítems, como Monday), kanban, calendario, línea de tiempo y gráfico.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { LuArrowDown, LuArrowUp, LuArrowUpDown, LuChevronDown, LuChevronLeft, LuChevronRight, LuMessageSquare, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { PanelItem } from "./panel-item";
import { BotonAutomatizaciones } from "./automatizaciones-tablero";
import { BibliotecaColumnas, CeldaColumna, ConfigurarColumna, PieNumeros } from "./columnas-tablero";
import { info } from "../dominio/columnas";
import { api, Enlace, fCorta, ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, useAviso } from "../componentes";
import { COLOR_ESTADO, COLOR_PRIORIDAD, COLORES_GRUPO, ESTADOS_ITEM, ESTADOS_PROYECTO_IW, PRIORIDADES_ITEM, type EstadoItem, type PrioridadItem } from "../dominio/tableros";

type Tablero = S<"TableroInooWork">;
type Item = S<"ItemTablero">;
type Vista = S<"TableroInooWork">["vistas"][number]["tipo"];

const NOMBRE_VISTA: Record<Vista, string> = { TABLA: "Tabla", KANBAN: "Kanban", CALENDARIO: "Calendario", LINEA_TIEMPO: "Línea de tiempo", GRAFICO: "Gráfico" };
const fecha = (f: string | null | undefined) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "—");

// ═════════════════════════════════════════════ tablero

export function PantallaTablero() {
  return (
    <Estructura espacio="equipo" migas="Tablero">
      <TableroProyecto />
    </Estructura>
  );
}

/**
 * El cliente del proyecto, elegido de los clientes reales para que no quede escrito de varias formas (13 nov,
 * auditoría: antes era texto libre con sugerencias). «Otro…» sigue existiendo para un cliente que aún no está.
 */
function ClienteDelTablero({ actual, cambiar }: { actual: string | null; cambiar: (ruta: string, metodo: "PATCH", cuerpo: Record<string, unknown>) => Promise<boolean> }) {
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes");
  const nombres = [...new Set(["Inoo", ...(clientes.datos?.datos ?? []).map((c) => c.nombre).sort((x, y) => x.localeCompare(y, "es"))])];
  const enLista = !actual || nombres.some((n) => n.toLowerCase() === actual.toLowerCase());
  const [otro, setOtro] = useState(false);
  const [valor, setValor] = useState("");
  const guardar = (v: string) => { if (v.trim() && v.trim() !== (actual ?? "")) void cambiar("", "PATCH", { cliente: v.trim() }); };
  return (
    <form className="fila" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); guardar(valor); setOtro(false); }}>
      <label htmlFor="tablero-cliente" className="texto-sm negrita" style={actual ? undefined : { color: "var(--c-alerta)" }}>{actual ? "Cliente" : "Falta el cliente"}</label>
      <select id="tablero-cliente" className="input" style={{ width: 240, height: 36 }} disabled={!clientes.datos}
        value={otro ? "__otro" : (nombres.find((n) => n.toLowerCase() === (actual ?? "").toLowerCase()) ?? actual ?? "")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__otro") { setOtro(true); setValor(""); return; }
          setOtro(false);
          guardar(v);
        }}>
        {!actual && <option value="">Elige el cliente</option>}
        {!enLista && actual && <option value={actual}>{actual} (no está en Clientes)</option>}
        {nombres.map((n) => <option key={n} value={n}>{n === "Inoo" ? "Inoo (interno)" : n}</option>)}
        <option value="__otro">Otro cliente (nuevo)…</option>
      </select>
      {otro && (
        <>
          <input className="input" style={{ width: 220 }} aria-label="Nombre del cliente nuevo" value={valor} onChange={(e) => setValor(e.target.value)} maxLength={120} placeholder="Nombre del cliente" autoFocus />
          <button className="boton boton--chico boton--primario" disabled={!valor.trim()}>Guardar</button>
          <button type="button" className="boton boton--chico" onClick={() => setOtro(false)}>Cancelar</button>
        </>
      )}
    </form>
  );
}

/** Estado del proyecto en InooWork (6 nov). «Completado» lo pasa a Culminado; a las 2 semanas se archiva solo. */
function EstadoDelTablero({ t, cambiar }: { t: Tablero; cambiar: (ruta: string, metodo: "PATCH", cuerpo: Record<string, unknown>) => Promise<boolean> }) {
  const completo = t.items.length > 0 && t.items.every((i) => i.estado === "Completado");
  return (
    <div className="fila" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
      <label htmlFor="tablero-estado" className="texto-sm negrita">Estado del proyecto</label>
      <select id="tablero-estado" className="input" style={{ width: 200, height: 36 }} value={t.estado ?? "En Progreso"} onChange={(e) => void cambiar("", "PATCH", { estado: e.target.value })}>
        {ESTADOS_PROYECTO_IW.map((x) => <option key={x} value={x}>{x === "Completado" ? "Completado (culminado)" : x}</option>)}
      </select>
      {t.estado === "Completado" && t.completadoEn && <span className="texto-xs texto-muted">Culminado el {fCorta(t.completadoEn)}: a las 2 semanas se archiva solo.</span>}
      {t.estado !== "Completado" && completo && <span className="texto-xs" style={{ color: "var(--c-primario)" }}>Todo está completado: márcalo como Completado para culminarlo.</span>}
    </div>
  );
}

function TableroProyecto() {
  const { params, ir } = useNavegacion();
  const r = useConsulta<Tablero>(`/tableros/${params.id}`);
  const avisar = useAviso();
  const [vista, setVista] = useState<Vista>("TABLA");
  const [texto, setTexto] = useState("");
  const [responsable, setResponsable] = useState("");
  const [estado, setEstado] = useState("");
  // 12 nov: el panel del ítem (conversación, archivos, Monday). «?item=» lo abre directo (los avisos de la campana).
  const [panel, setPanel] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item")));
  const conteo = useConsulta<{ datos: Record<string, number> }>(`/tableros/${params.id}/actualizaciones`);
  const t = r.datos;
  const items = useMemo(
    () => (t?.items ?? []).filter((i) =>
      (!texto.trim() || i.nombre.toLowerCase().includes(texto.trim().toLowerCase()))
      && (!responsable || i.responsable?.id === responsable || i.subitems.some((s) => s.responsable?.id === responsable))
      && (!estado || i.estado === estado)),
    [t, texto, responsable, estado],
  );
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!t) return <Cargando />;

  /** Cada cambio devuelve el tablero ya guardado en InooWork. */
  const cambiar = async (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => {
    try {
      r.setDatos(await api<Tablero>(`/tableros/${t.id}${ruta}`, { metodo, cuerpo }));
      return true;
    } catch (e) {
      avisar({ titulo: "No pudimos guardar en InooWork", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
      return false;
    }
  };
  const desarchivar = async () => {
    if (!window.confirm(`¿Desarchivar «${t.nombre}»? Vuelve a la lista de proyectos, en curso.`)) return;
    try {
      r.setDatos(await api<Tablero>(`/tableros/${t.id}/desarchivar`, { metodo: "POST" }));
      avisar({ titulo: "Proyecto desarchivado" });
    } catch (e) {
      avisar({ titulo: "No se pudo desarchivar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const borrarProyecto = async () => {
    if (!window.confirm(`¿Borrar el proyecto «${t.nombre}» con todos sus ítems? Desaparece del portal y de InooWork (un admin lo puede recuperar en InooWork).`)) return;
    try {
      await api(`/tableros/${t.id}`, { metodo: "DELETE" });
      avisar({ titulo: "Proyecto borrado" });
      ir("/equipo/proyectos");
    } catch (e) {
      avisar({ titulo: "No se pudo borrar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const vistas: Vista[] = [...new Set<Vista>(["TABLA", ...t.vistas.map((v) => v.tipo), "GRAFICO"])];
  const ctx = { t, items, cambiar, editable: t.puedeEditar, abrir: (i: Item) => setPanel(i.id), conteo: conteo.datos?.datos ?? {} };
  const enPanel = panel ? t.items.find((i) => i.id === panel) : undefined;

  return (
    <>
      <Enlace a="/equipo/proyectos" className="volver">← Proyectos</Enlace>
      <Cabecera
        antetitulo={[t.cliente ?? "Sin cliente", t.area, t.lider ? `Líder: ${t.lider.nombre}` : null].filter(Boolean).join(" · ")}
        titulo={t.nombre}
        bajada={t.descripcion ?? undefined}
        accion={
          <span className="fila" style={{ gap: 8 }}>
            {!t.puedeEditar && !t.archivado && <span className="texto-xs texto-muted">Solo lectura: no eres miembro activo</span>}
            {!t.archivado && <BotonAutomatizaciones t={t} cambiar={cambiar} />}
            {t.puedeBorrar && <button className="boton boton--chico boton--peligro" onClick={() => void borrarProyecto()}><LuTrash2 size={13} /> Borrar proyecto</button>}
          </span>
        }
      />
      {t.archivado && (
        <div className="aviso-archivado" role="status">
          <span><strong>Proyecto archivado</strong>{t.archivadoEn ? ` el ${new Date(t.archivadoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}` : ""}. Está en solo lectura.</span>
          {t.puedeDesarchivar && <button className="boton boton--chico boton--primario" onClick={() => void desarchivar()}>Desarchivar</button>}
        </div>
      )}
      {t.puedeEditar && <ClienteDelTablero actual={t.cliente ?? null} cambiar={cambiar} />}
      {t.puedeEditar && <EstadoDelTablero t={t} cambiar={cambiar} />}
      <div className="fila entre" style={{ gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="segmentado" role="tablist" aria-label="Vista del tablero">
          {vistas.map((v) => (
            <button key={v} role="tab" aria-selected={vista === v} className={vista === v ? "activo" : undefined} onClick={() => setVista(v)}>{NOMBRE_VISTA[v]}</button>
          ))}
        </div>
        <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <div className="entrada" style={{ width: 200 }}>
            <input aria-label="Buscar ítem" placeholder="Buscar ítem" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <select className="input" style={{ width: 170 }} aria-label="Filtrar por persona" value={responsable} onChange={(e) => setResponsable(e.target.value)}>
            <option value="">Todas las personas</option>
            {t.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select className="input" style={{ width: 160 }} aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS_ITEM.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </div>
      {vista === "TABLA" && <VistaTabla {...ctx} />}
      {vista === "KANBAN" && <VistaKanban {...ctx} />}
      {vista === "CALENDARIO" && <VistaCalendario items={items} />}
      {vista === "LINEA_TIEMPO" && <VistaLinea t={t} items={items} />}
      {vista === "GRAFICO" && <VistaGrafico items={items} />}
      {enPanel && <PanelItem t={t} item={enPanel} cambiar={cambiar} cerrar={() => setPanel(null)} alActualizar={() => void conteo.recargar()} />}
    </>
  );
}

type Ctx = { t: Tablero; items: Item[]; cambiar: (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>; editable: boolean; abrir: (i: Item) => void; conteo: Record<string, number> };

// ───────────────────────────── celdas

/** Texto que se guarda al salir del campo (o con Enter), solo si cambió. */
function Texto({ valor, guardar, editable, etiqueta, placeholder }: { valor: string; guardar: (v: string) => void; editable: boolean; etiqueta: string; placeholder?: string }) {
  if (!editable) return <span>{valor || <span className="texto-muted">—</span>}</span>;
  return (
    <input
      key={valor}
      className="celda-texto"
      aria-label={etiqueta}
      defaultValue={valor}
      placeholder={placeholder}
      onBlur={(e) => e.target.value.trim() !== valor && e.target.value.trim() && guardar(e.target.value.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

function Pildora<T extends string>({ valor, opciones, color, guardar, editable, etiqueta }: { valor: T; opciones: readonly T[]; color: (v: T) => string; guardar: (v: T) => void; editable: boolean; etiqueta: string }) {
  if (!editable) return <span className="pildora" style={{ background: color(valor) }}>{valor}</span>;
  return (
    <select className="pildora" aria-label={etiqueta} style={{ background: color(valor) }} value={valor} onChange={(e) => guardar(e.target.value as T)}>
      {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Persona({ t, valor, guardar, editable, etiqueta }: { t: Tablero; valor: S<"PersonaInooWork"> | null; guardar: (id: string | null) => void; editable: boolean; etiqueta: string }) {
  if (!editable) return <span>{valor?.nombre ?? <span className="texto-muted">—</span>}</span>;
  return (
    <select className="celda-select" aria-label={etiqueta} value={valor?.id ?? ""} onChange={(e) => guardar(e.target.value || null)}>
      <option value="">Sin asignar</option>
      {t.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  );
}

function Fecha({ valor, guardar, editable, etiqueta, vencido }: { valor: string | null; guardar: (v: string | null) => void; editable: boolean; etiqueta: string; vencido: boolean }) {
  if (!editable) return <span style={vencido ? { color: "var(--c-alerta)" } : undefined}>{fecha(valor)}</span>;
  return <input type="date" className="celda-fecha" aria-label={etiqueta} value={valor ?? ""} style={vencido ? { color: "var(--c-alerta)" } : undefined} onChange={(e) => guardar(e.target.value || null)} />;
}

// ───────────────────────────── tabla (como el workspace de InooWork)

function VistaTabla({ t, items, cambiar, editable, abrir, conteo }: Ctx) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const [biblioteca, setBiblioteca] = useState(false);
  const [configurando, setConfigurando] = useState<Tablero["columnas"][number] | null>(null);
  const alternar = (s: Set<string>, id: string) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };
  const item = (i: Item, b: Record<string, unknown>) => cambiar(`/items/${i.id}`, "PATCH", b);
  const nuevoGrupo = () => cambiar("/grupos", "POST", { nombre: "Nuevo grupo", color: COLORES_GRUPO[t.grupos.length % COLORES_GRUPO.length] });
  const borrarGrupo = (g: Tablero["grupos"][number]) => {
    if (!window.confirm(`¿Borrar el grupo «${g.nombre}»? Sus ítems pasan al primer grupo.`)) return;
    void cambiar(`/grupos/${g.id}`, "DELETE");
  };
  const borrarItem = (i: Item) => {
    if (!window.confirm(`¿Borrar «${i.nombre}»${i.subitems.length ? " con sus subítems" : ""}? También se borra en InooWork.`)) return;
    void cambiar(`/items/${i.id}`, "DELETE");
  };
  const columnas = 7 + t.columnas.length + (editable ? 1 : 0);
  const conPie = t.columnas.some((c) => c.tipo === "number");
  // 12 nov, como en Monday: agrupar por otra columna, ordenar con el encabezado y elegir varios para cambiarlos juntos.
  const [agrupar, setAgrupar] = useState<Agrupar>("GRUPO");
  const [orden, setOrden] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const secciones = useMemo(() => seccionesDe(t, items, agrupar), [t, items, agrupar]);
  const ordenar = (xs: Item[]) => (orden ? [...xs].sort((a, b) => comparar(a, b, orden.col) * orden.dir) : xs);
  const alOrdenar = (col: string) => setOrden((o) => (!o || o.col !== col ? { col, dir: 1 } : o.dir === 1 ? { col, dir: -1 } : null));
  // 13 nov: el ancho de cada columna se cambia arrastrando el borde del encabezado (doble clic vuelve al de siempre).
  // Se recuerda por tablero en este navegador: cada persona lo deja a su gusto.
  const [anchos, setAnchos] = useAnchos(t.id);
  const ancho = (col: string, base: number): CSSProperties => {
    const w = anchos[col];
    return w ? { width: w, minWidth: w, maxWidth: w } : { minWidth: base };
  };
  const Asa = ({ col }: { col: string }) => (
    <span className="th-asa" role="separator" aria-orientation="vertical" aria-label="Cambiar el ancho de la columna" title="Arrastra para cambiar el ancho"
      onDoubleClick={() => setAnchos((a) => { const n = { ...a }; delete n[col]; return n; })}
      onPointerDown={(e) => {
        e.preventDefault();
        const th = (e.currentTarget.parentElement as HTMLElement);
        const x0 = e.clientX;
        const w0 = th.getBoundingClientRect().width;
        const mover = (ev: PointerEvent) => setAnchos((a) => ({ ...a, [col]: Math.max(60, Math.round(w0 + ev.clientX - x0)) }));
        const soltar = () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); document.body.classList.remove("redimensionando"); };
        document.body.classList.add("redimensionando");
        window.addEventListener("pointermove", mover);
        window.addEventListener("pointerup", soltar);
      }} />
  );
  const Th = ({ col, children, base }: { col: string; children: ReactNode; base: number }) => (
    <th style={ancho(col, base)} className="th-redimensionable" aria-sort={orden?.col === col ? (orden.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className="th-orden" onClick={() => alOrdenar(col)} title="Ordenar">
        {children} {orden?.col === col ? (orden.dir === 1 ? <LuArrowUp size={11} /> : <LuArrowDown size={11} />) : <LuArrowUpDown size={11} className="th-orden-icono" />}
      </button>
      <Asa col={col} />
    </th>
  );
  const vivos = new Set(items.map((i) => i.id));
  const elegidos = [...sel].filter((id) => vivos.has(id));

  return (
    <div className="pila" style={{ gap: 18 }}>
      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        <label className="fila texto-sm" style={{ gap: 6 }}>
          <span className="texto-muted">Agrupar por</span>
          <select className="input" style={{ width: 170, height: 34 }} value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)}>
            {(Object.keys(NOMBRE_AGRUPAR) as Agrupar[]).map((a) => <option key={a} value={a}>{NOMBRE_AGRUPAR[a]}</option>)}
          </select>
        </label>
        {orden && <button className="boton boton--chico" onClick={() => setOrden(null)}>Quitar orden</button>}
      </div>
      {secciones.map((g) => {
        const suyos = ordenar(g.items);
        const plegado = plegados.has(g.id);
        const real = g.real && agrupar === "GRUPO";
        const todos = editable && suyos.length > 0 && suyos.every((i) => sel.has(i.id));
        return (
          <section key={g.id} className="tablero-grupo" style={{ borderLeftColor: g.color }} aria-label={`Grupo ${g.nombre}`}>
            <header className="fila" style={{ gap: 8, marginBottom: 6 }}>
              <button className="boton-icono" aria-label={plegado ? `Mostrar ${g.nombre}` : `Ocultar ${g.nombre}`} aria-expanded={!plegado} onClick={() => setPlegados(alternar(plegados, g.id))} style={{ color: g.color }}>
                <LuChevronDown size={16} style={{ transform: plegado ? "rotate(-90deg)" : undefined }} />
              </button>
              <span className="tablero-grupo-nombre" style={{ color: g.color }}>
                {real ? <Texto valor={g.nombre} editable={editable} etiqueta={`Nombre del grupo ${g.nombre}`} guardar={(nombre) => void cambiar(`/grupos/${g.id}`, "PATCH", { nombre })} /> : <span style={{ padding: "4px 6px" }}>{g.nombre}</span>}
              </span>
              <span className="texto-xs texto-muted">{suyos.length} {suyos.length === 1 ? "ítem" : "ítems"}</span>
              {editable && real && (
                <>
                  <span className="fila" style={{ gap: 3 }}>
                    {COLORES_GRUPO.map((c) => (
                      <button key={c} className="muestra-color muestra-color--chica" aria-label={`Color ${c} para ${g.nombre}`} aria-pressed={g.color === c} style={{ background: c }} onClick={() => void cambiar(`/grupos/${g.id}`, "PATCH", { color: c })} />
                    ))}
                  </span>
                  {t.grupos.length > 1 && <button className="boton-icono" aria-label={`Borrar el grupo ${g.nombre}`} onClick={() => borrarGrupo(g)}><LuTrash2 size={14} /></button>}
                </>
              )}
            </header>
            {!plegado && (
              <div className="tabla-envoltura">
                <table className="tabla tabla-tablero">
                  <thead>
                    <tr>
                      <th style={{ width: 52 }}>
                        {editable && <input type="checkbox" aria-label={`Elegir todos los ítems de ${g.nombre}`} checked={todos}
                          onChange={(e) => setSel((s) => { const n = new Set(s); for (const i of suyos) (e.target.checked ? n.add(i.id) : n.delete(i.id)); return n; })} />}
                      </th>
                      <Th col="nombre" base={280}>Ítem</Th>
                      <Th col="responsable" base={170}>Responsable</Th>
                      <Th col="estado" base={150}>Estado</Th>
                      <Th col="prioridad" base={110}>Prioridad</Th>
                      <Th col="fecha" base={140}>Fecha límite</Th>
                      <th style={ancho("notas", 180)} className="th-redimensionable">Descripción<Asa col="notas" /></th>
                      {t.columnas.map((c) => (
                        <th key={c.id} style={ancho(c.id, c.tipo === "long_text" || c.tipo === "doc" || c.tipo === "people" ? 160 : 120)} className="th-redimensionable" title={info(c.tipo)?.nombre ?? c.tipo}>
                          {editable
                            ? <button type="button" className="boton-texto" style={{ font: "inherit", color: "inherit", textTransform: "inherit", letterSpacing: "inherit" }} aria-label={`Configurar la columna ${c.nombre}`} onClick={() => setConfigurando(c)}>{c.nombre}</button>
                            : c.nombre}
                          <Asa col={c.id} />
                        </th>
                      ))}
                      {editable && <th style={{ width: 36 }}><button className="boton-icono" aria-label="Agregar columna" title="Agregar columna" onClick={() => setBiblioteca(true)}><LuPlus size={14} /></button></th>}
                      {editable && <th style={{ width: 36 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {suyos.map((i) => {
                      const abierto = abiertos.has(i.id);
                      return [
                        <tr key={i.id} className={sel.has(i.id) ? "fila-elegida" : undefined}>
                          <td>
                            <span className="fila" style={{ gap: 2 }}>
                              {editable && <input type="checkbox" aria-label={`Elegir ${i.nombre}`} checked={sel.has(i.id)} onChange={() => setSel((s) => alternar(s, i.id))} />}
                              <button className="boton-icono" aria-label={abierto ? `Ocultar subítems de ${i.nombre}` : `Ver subítems de ${i.nombre}`} aria-expanded={abierto} onClick={() => setAbiertos(alternar(abiertos, i.id))}>
                                <LuChevronRight size={14} style={{ transform: abierto ? "rotate(90deg)" : undefined }} />
                              </button>
                            </span>
                          </td>
                          <td>
                            <span className="fila" style={{ gap: 6 }}>
                              <Texto valor={i.nombre} editable={editable} etiqueta={`Nombre de ${i.nombre}`} guardar={(nombre) => void item(i, { nombre })} />
                              {i.subitems.length > 0 && <span className="contador-sub">{i.subitems.length}</span>}
                              <button className={`boton-conversacion${conteo[i.id] ? " boton-conversacion--con" : ""}`} aria-label={`Abrir ${i.nombre}${conteo[i.id] ? ` (${conteo[i.id]} actualizaciones)` : ""}`} title="Actualizaciones, archivos e historial" onClick={() => abrir(i)}>
                                <LuMessageSquare size={14} />{conteo[i.id] ? <span>{conteo[i.id]}</span> : null}
                              </button>
                            </span>
                          </td>
                          <td><Persona t={t} valor={i.responsable} editable={editable} etiqueta={`Responsable de ${i.nombre}`} guardar={(responsableId) => void item(i, { responsableId })} /></td>
                          <td><Pildora valor={i.estado as EstadoItem} opciones={ESTADOS_ITEM} color={(v) => COLOR_ESTADO[v]} editable={editable} etiqueta={`Estado de ${i.nombre}`} guardar={(estado) => void item(i, { estado })} /></td>
                          <td><Pildora valor={i.prioridad as PrioridadItem} opciones={PRIORIDADES_ITEM} color={(v) => COLOR_PRIORIDAD[v]} editable={editable} etiqueta={`Prioridad de ${i.nombre}`} guardar={(prioridad) => void item(i, { prioridad })} /></td>
                          <td><Fecha valor={i.fecha ?? null} vencido={i.vencido} editable={editable} etiqueta={`Fecha límite de ${i.nombre}`} guardar={(fecha) => void item(i, { fecha })} /></td>
                          <td><Texto valor={i.notas} editable={editable} etiqueta={`Descripción de ${i.nombre}`} placeholder="Agregar" guardar={(notas) => void item(i, { notas })} /></td>
                          {t.columnas.map((c) => (
                            <td key={c.id}><CeldaColumna t={t} col={c} item={i} cambiar={cambiar} editable={editable} /></td>
                          ))}
                          {editable && <td />}
                          {editable && <td><button className="boton-icono" aria-label={`Borrar ${i.nombre}`} onClick={() => borrarItem(i)}><LuTrash2 size={13} /></button></td>}
                        </tr>,
                        ...(abierto
                          ? [
                              ...i.subitems.map((s) => (
                                <tr key={s.id} className="fila-subitem">
                                  <td />
                                  <td><Texto valor={s.nombre} editable={editable} etiqueta={`Nombre del subítem ${s.nombre}`} guardar={(nombre) => void cambiar(`/items/${i.id}/subitems/${s.id}`, "PATCH", { nombre })} /></td>
                                  <td><Persona t={t} valor={s.responsable} editable={editable} etiqueta={`Responsable de ${s.nombre}`} guardar={(responsableId) => void cambiar(`/items/${i.id}/subitems/${s.id}`, "PATCH", { responsableId })} /></td>
                                  <td><Pildora valor={s.estado as EstadoItem} opciones={ESTADOS_ITEM} color={(v) => COLOR_ESTADO[v]} editable={editable} etiqueta={`Estado de ${s.nombre}`} guardar={(estado) => void cambiar(`/items/${i.id}/subitems/${s.id}`, "PATCH", { estado })} /></td>
                                  <td />
                                  <td><Fecha valor={s.fecha ?? null} vencido={s.vencido} editable={editable} etiqueta={`Fecha límite de ${s.nombre}`} guardar={(fecha) => void cambiar(`/items/${i.id}/subitems/${s.id}`, "PATCH", { fecha })} /></td>
                                  <td colSpan={1 + t.columnas.length + (editable ? 1 : 0)} />
                                  {editable && <td><button className="boton-icono" aria-label={`Borrar el subítem ${s.nombre}`} onClick={() => window.confirm(`¿Borrar el subítem «${s.nombre}»? También se borra en InooWork.`) && void cambiar(`/items/${i.id}/subitems/${s.id}`, "DELETE")}><LuTrash2 size={13} /></button></td>}
                                </tr>
                              )),
                              ...(editable ? [<FilaNueva key={`${i.id}-nuevo`} columnas={columnas} sangria etiqueta={`Nuevo subítem en ${i.nombre}`} texto="+ Agregar subítem" crear={(nombre) => cambiar(`/items/${i.id}/subitems`, "POST", { nombre })} />] : []),
                            ]
                          : []),
                      ];
                    })}
                    {editable && real && <FilaNueva columnas={columnas} etiqueta={`Nuevo ítem en ${g.nombre}`} texto="+ Agregar ítem" crear={(nombre) => cambiar("/items", "POST", { nombre, grupoId: g.id })} />}
                    {conPie && suyos.length > 0 && (
                      <tr className="fila-pie">
                        <td colSpan={7} />
                        {t.columnas.map((c) => <td key={c.id}><PieNumeros col={c} items={suyos} /></td>)}
                        {editable && <td colSpan={2} />}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {editable && agrupar === "GRUPO" && (
        <button className="boton boton--chico" style={{ justifySelf: "start" }} onClick={() => void nuevoGrupo()}>
          <LuPlus size={14} /> Nuevo grupo
        </button>
      )}
      {elegidos.length > 0 && <BarraLote t={t} ids={elegidos} cambiar={cambiar} limpiar={() => setSel(new Set())} />}
      {biblioteca && <BibliotecaColumnas t={t} cambiar={cambiar} cerrar={() => setBiblioteca(false)} />}
      {configurando && <ConfigurarColumna t={t} col={configurando} cambiar={cambiar} cerrar={() => setConfigurando(null)} />}
    </div>
  );
}

// ───────────────────────────── anchos de columna (13 nov): por tablero, en este navegador

function useAnchos(tableroId: string): [Record<string, number>, (f: (a: Record<string, number>) => Record<string, number>) => void] {
  const clave = `inoo.anchos.${tableroId}`;
  const [anchos, setA] = useState<Record<string, number>>({});
  useEffect(() => {
    try { setA(JSON.parse(localStorage.getItem(clave) ?? "{}")); } catch { setA({}); }
  }, [clave]);
  const cambiar = useCallback((f: (a: Record<string, number>) => Record<string, number>) => setA((a) => {
    const n = f(a);
    try { localStorage.setItem(clave, JSON.stringify(n)); } catch { /* sin almacenamiento: solo por esta visita */ }
    return n;
  }), [clave]);
  return [anchos, cambiar];
}

// ───────────────────────────── agrupar, ordenar y lote (12 nov)

type Agrupar = "GRUPO" | "ESTADO" | "RESPONSABLE" | "PRIORIDAD" | "MES";
const NOMBRE_AGRUPAR: Record<Agrupar, string> = { GRUPO: "Grupo", ESTADO: "Estado", RESPONSABLE: "Responsable", PRIORIDAD: "Prioridad", MES: "Mes de vencimiento" };
const ORDEN_PRIORIDAD: Record<string, number> = { Urgente: 0, Alta: 1, Media: 2, Baja: 3 };

function seccionesDe(t: Tablero, items: Item[], agrupar: Agrupar): { id: string; nombre: string; color: string; items: Item[]; real: boolean }[] {
  if (agrupar === "GRUPO") return t.grupos.map((g) => ({ id: g.id, nombre: g.nombre, color: g.color, items: items.filter((i) => i.grupoId === g.id), real: true }));
  const clave = (i: Item): [string, string, string] => {
    if (agrupar === "ESTADO") return [i.estado, i.estado, COLOR_ESTADO[i.estado as EstadoItem] ?? "#c4c4c4"];
    if (agrupar === "PRIORIDAD") return [i.prioridad, i.prioridad, COLOR_PRIORIDAD[i.prioridad as PrioridadItem] ?? "#c4c4c4"];
    if (agrupar === "RESPONSABLE") return [i.responsable?.id ?? "", i.responsable?.nombre ?? "Sin responsable", i.responsable ? "#579bfc" : "#c4c4c4"];
    const m = i.fecha?.slice(0, 7) ?? "";
    return [m || "~", m ? new Date(`${m}-15T12:00:00`).toLocaleDateString("es-PE", { month: "long", year: "numeric" }) : "Sin fecha", m ? "#a25ddc" : "#c4c4c4"];
  };
  const m = new Map<string, { id: string; nombre: string; color: string; items: Item[]; real: boolean }>();
  for (const i of items) {
    const [k, nombre, color] = clave(i);
    if (!m.has(k)) m.set(k, { id: `v-${k}`, nombre, color, items: [], real: false });
    m.get(k)!.items.push(i);
  }
  const orden = (k: string) => (agrupar === "ESTADO" ? ESTADOS_ITEM.indexOf(k as EstadoItem) : agrupar === "PRIORIDAD" ? ORDEN_PRIORIDAD[k] ?? 9 : 0);
  return [...m.entries()].sort(([a, x], [b, y]) => orden(a) - orden(b) || (agrupar === "MES" ? a.localeCompare(b) : x.nombre.localeCompare(y.nombre, "es"))).map(([, v]) => v);
}

function comparar(a: Item, b: Item, col: string): number {
  const v = (i: Item): string | number => {
    if (col === "nombre") return i.nombre.toLowerCase();
    if (col === "responsable") return i.responsable?.nombre.toLowerCase() ?? "~";
    if (col === "estado") return ESTADOS_ITEM.indexOf(i.estado as EstadoItem);
    if (col === "prioridad") return ORDEN_PRIORIDAD[i.prioridad] ?? 9;
    if (col === "fecha") return i.fecha ?? "9999";
    return String(i.valores[col] ?? "");
  };
  const x = v(a), y = v(b);
  return typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es", { numeric: true });
}

/** La barra de acciones en lote: el mismo cambio a todos los elegidos, en un solo guardado. */
function BarraLote({ t, ids, cambiar, limpiar }: { t: Tablero; ids: string[]; cambiar: Ctx["cambiar"]; limpiar: () => void }) {
  const lote = async (cuerpo: Record<string, unknown>) => { if (await cambiar("/items-lote", "POST", { ids, ...cuerpo })) limpiar(); };
  const elegir = (e: ChangeEvent<HTMLSelectElement>, campo: string) => {
    const v = e.target.value;
    e.target.value = "";
    if (v === "") return;
    void lote({ cambio: { [campo]: v === "__nadie" ? null : v } });
  };
  return (
    <div className="barra-lote" role="region" aria-label="Acciones con los ítems elegidos">
      <span className="negrita texto-sm">{ids.length} elegido{ids.length === 1 ? "" : "s"}</span>
      <select className="input" aria-label="Cambiar el estado" defaultValue="" onChange={(e) => elegir(e, "estado")}>
        <option value="">Estado…</option>{ESTADOS_ITEM.map((x) => <option key={x}>{x}</option>)}
      </select>
      <select className="input" aria-label="Cambiar el responsable" defaultValue="" onChange={(e) => elegir(e, "responsableId")}>
        <option value="">Responsable…</option><option value="__nadie">Sin asignar</option>{t.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <select className="input" aria-label="Cambiar la prioridad" defaultValue="" onChange={(e) => elegir(e, "prioridad")}>
        <option value="">Prioridad…</option>{PRIORIDADES_ITEM.map((x) => <option key={x}>{x}</option>)}
      </select>
      <select className="input" aria-label="Mover a otro grupo" defaultValue="" onChange={(e) => elegir(e, "grupoId")}>
        <option value="">Mover a…</option>{t.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
      </select>
      <input type="date" className="input" aria-label="Cambiar la fecha límite" onChange={(e) => e.target.value && void lote({ cambio: { fecha: e.target.value } })} />
      <button className="boton boton--chico boton--peligro" onClick={() => window.confirm(`¿Borrar ${ids.length} ítem${ids.length === 1 ? "" : "s"}? También se borran en InooWork.`) && void lote({ borrar: true })}><LuTrash2 size={13} /> Borrar</button>
      <button className="boton-icono" aria-label="Quitar la selección" onClick={limpiar}><LuX size={14} /></button>
    </div>
  );
}

function FilaNueva({ columnas, etiqueta, texto, crear, sangria }: { columnas: number; etiqueta: string; texto: string; crear: (nombre: string) => Promise<boolean>; sangria?: boolean }) {
  const [valor, setValor] = useState("");
  // 11 nov: Enter y salir del campo llegaban juntos (o un segundo Enter antes de que respondiera InooWork) y el ítem se
  // creaba dos veces. Ahora se crea una sola vez: el campo se vacía al instante y vuelve si no se pudo guardar.
  const ocupado = useRef(false);
  const enviar = async (nombres: string[]) => {
    const xs = nombres.map((x) => x.trim()).filter(Boolean);
    if (!xs.length || ocupado.current) return;
    ocupado.current = true;
    setValor("");
    try {
      for (const [n, x] of xs.entries()) {
        if (!(await crear(x))) { setValor(xs.slice(n).join(" ")); break; }
      }
    } finally {
      ocupado.current = false;
    }
  };
  /** Pegar varias líneas (de Excel o de Monday) crea un ítem por línea, como en Monday. */
  const pegar = (e: ClipboardEvent<HTMLInputElement>) => {
    const lineas = e.clipboardData.getData("text").split(/\r?\n/).map((x) => x.split("\t")[0].trim()).filter(Boolean);
    if (lineas.length < 2) return;
    e.preventDefault();
    if (lineas.length > 100) return void window.alert("Pega hasta 100 líneas a la vez.");
    if (window.confirm(`¿Crear ${lineas.length} ítems, uno por línea?`)) void enviar(lineas);
  };
  return (
    <tr className="fila-nueva">
      <td />
      <td colSpan={columnas} style={sangria ? { paddingLeft: 26 } : undefined}>
        <input className="celda-texto" aria-label={etiqueta} placeholder={texto} value={valor} onChange={(e) => setValor(e.target.value)} onPaste={pegar}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void enviar([valor]); } }} onBlur={() => void enviar([valor])} />
      </td>
    </tr>
  );
}

// ───────────────────────────── kanban (por estado; se arrastra para cambiarlo)

function VistaKanban({ t, items, cambiar, editable, abrir, conteo }: Ctx) {
  const [sobre, setSobre] = useState<string | null>(null);
  const soltar = (e: DragEvent, estado: string) => {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData("text/plain");
    const i = items.find((x) => x.id === id);
    if (i && i.estado !== estado) void cambiar(`/items/${i.id}`, "PATCH", { estado });
  };
  return (
    <div className="kanban-tablero">
      {ESTADOS_ITEM.map((estado) => {
        const suyos = items.filter((i) => i.estado === estado);
        return (
          <section key={estado} className={`kanban-columna${sobre === estado ? " kanban-columna--sobre" : ""}`} aria-label={estado}
            onDragOver={(e) => { if (editable) { e.preventDefault(); setSobre(estado); } }} onDragLeave={() => setSobre(null)} onDrop={(e) => soltar(e, estado)}>
            <header className="kanban-cabecera" style={{ background: COLOR_ESTADO[estado] }}>{estado} <span>{suyos.length}</span></header>
            {suyos.map((i) => (
              <article key={i.id} className="tarjeta kanban-item" draggable={editable} onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                role="button" tabIndex={0} aria-label={`Abrir ${i.nombre}`} onClick={() => abrir(i)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), abrir(i))} style={{ cursor: "pointer" }}>
                <span className="texto-xs texto-muted">{t.grupos.find((g) => g.id === i.grupoId)?.nombre}</span>
                <span className="negrita texto-sm">{i.nombre}</span>
                <span className="fila entre texto-xs" style={{ gap: 6 }}>
                  <span>{i.responsable?.nombre ?? "Sin asignar"}</span>
                  <span style={i.vencido ? { color: "var(--c-alerta)" } : undefined}>{fecha(i.fecha)}</span>
                </span>
                <span className="fila" style={{ gap: 6 }}>
                  <span className="pildora pildora--chica" style={{ background: COLOR_PRIORIDAD[i.prioridad as PrioridadItem] }}>{i.prioridad}</span>
                  {i.subitems.length > 0 && <span className="texto-xs texto-muted">{i.subitems.filter((s) => s.estado === "Completado").length}/{i.subitems.length} subítems</span>}
                  {conteo[i.id] ? <span className="texto-xs texto-muted fila" style={{ gap: 3 }}><LuMessageSquare size={11} /> {conteo[i.id]}</span> : null}
                </span>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

// ───────────────────────────── calendario (por fecha límite)

function VistaCalendario({ items }: { items: Item[] }) {
  const conFecha = items.filter((i) => i.fecha);
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [a, m] = mes.split("-").map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const inicio = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const mover = (d: number) => {
    const x = new Date(Date.UTC(a, m - 1 + d, 1));
    setMes(x.toISOString().slice(0, 7));
  };
  const titulo = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return (
    <div className="tarjeta" style={{ padding: 14 }}>
      <div className="fila entre" style={{ marginBottom: 10 }}>
        <button className="boton-icono" aria-label="Mes anterior" onClick={() => mover(-1)}><LuChevronLeft size={16} /></button>
        <span className="negrita" style={{ textTransform: "capitalize" }}>{titulo}</span>
        <button className="boton-icono" aria-label="Mes siguiente" onClick={() => mover(1)}><LuChevronRight size={16} /></button>
      </div>
      <div className="calendario-tablero">
        {["lun", "mar", "mié", "jue", "vie", "sáb", "dom"].map((d) => <span key={d} className="texto-xs texto-muted calendario-tablero-dia">{d}</span>)}
        {Array.from({ length: inicio }, (_, i) => <span key={`v${i}`} />)}
        {Array.from({ length: dias }, (_, i) => {
          const f = `${mes}-${String(i + 1).padStart(2, "0")}`;
          const suyos = conFecha.filter((x) => x.fecha === f);
          return (
            <div key={f} className="calendario-tablero-celda">
              <span className="texto-xs texto-muted">{i + 1}</span>
              {suyos.map((x) => <span key={x.id} className="calendario-tablero-item" style={{ borderLeftColor: COLOR_ESTADO[x.estado as EstadoItem] }} title={`${x.nombre} · ${x.estado}`}>{x.nombre}</span>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── línea de tiempo (de la creación a la fecha límite)

function VistaLinea({ t, items }: { t: Tablero; items: Item[] }) {
  const conFecha = items.filter((i) => i.fecha);
  if (!conFecha.length) return <p className="texto-sm texto-muted">Ningún ítem tiene fecha límite.</p>;
  const ms = (f: string) => new Date(`${f}T12:00:00`).getTime();
  const desdeDe = (i: Item) => (i.creadoEn && i.creadoEn <= i.fecha! ? i.creadoEn : i.fecha!);
  const min = Math.min(...conFecha.map((i) => ms(desdeDe(i))));
  const max = Math.max(...conFecha.map((i) => ms(i.fecha!))) + 86_400_000;
  const pos = (f: string) => ((ms(f) - min) / (max - min)) * 100;
  const hoy = new Date().toISOString().slice(0, 10);
  return (
    <div className="tarjeta linea-tablero" style={{ padding: 14 }}>
      {t.grupos.map((g) => {
        const suyos = conFecha.filter((i) => i.grupoId === g.id);
        if (!suyos.length) return null;
        return (
          <div key={g.id} className="pila" style={{ gap: 6, marginBottom: 12 }}>
            <span className="negrita texto-sm" style={{ color: g.color }}>{g.nombre}</span>
            {suyos.map((i) => {
              const ini = pos(desdeDe(i));
              const fin = pos(i.fecha!) + (100 * 86_400_000) / (max - min);
              return (
                <div key={i.id} className="linea-fila">
                  <span className="texto-xs linea-nombre" title={i.nombre}>{i.nombre}</span>
                  <span className="linea-pista">
                    {ms(hoy) >= min && ms(hoy) <= max && <span className="linea-hoy" style={{ left: `${pos(hoy)}%` }} />}
                    <span className="linea-barra" style={{ left: `${ini}%`, width: `${Math.max(fin - ini, 1.5)}%`, background: COLOR_ESTADO[i.estado as EstadoItem] }} title={`${fecha(desdeDe(i))} → ${fecha(i.fecha)}`} />
                  </span>
                  <span className="texto-xs texto-muted" style={{ width: 56, textAlign: "right" }}>{fecha(i.fecha)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── gráfico (cuántos ítems por estado y por persona)

function VistaGrafico({ items }: { items: Item[] }) {
  const porEstado = ESTADOS_ITEM.map((e) => ({ nombre: e, n: items.filter((i) => i.estado === e).length, color: COLOR_ESTADO[e] }));
  const personas = new Map<string, number>();
  for (const i of items) personas.set(i.responsable?.nombre ?? "Sin asignar", (personas.get(i.responsable?.nombre ?? "Sin asignar") ?? 0) + 1);
  const porPersona = [...personas.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, n]) => ({ nombre, n, color: "var(--c-primario)" }));
  return (
    <div className="grid-2" style={{ gap: 16 }}>
      <Barras titulo="Ítems por estado" filas={porEstado} />
      <Barras titulo="Ítems por persona" filas={porPersona} />
    </div>
  );
}

function Barras({ titulo, filas }: { titulo: string; filas: { nombre: string; n: number; color: string }[] }): ReactNode {
  const max = Math.max(1, ...filas.map((f) => f.n));
  return (
    <section className="tarjeta" style={{ padding: 16 }} aria-label={titulo}>
      <h3 className="tarjeta-titulo" style={{ fontSize: "var(--t-base)", marginBottom: 10 }}>{titulo}</h3>
      <div className="pila" style={{ gap: 8 }}>
        {filas.map((f) => (
          <div key={f.nombre} className="grafico-fila">
            <span className="texto-xs">{f.nombre}</span>
            <span className="grafico-pista"><span style={{ width: `${(f.n / max) * 100}%`, background: f.color }} /></span>
            <span className="texto-xs negrita" style={{ width: 24, textAlign: "right" }}>{f.n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
