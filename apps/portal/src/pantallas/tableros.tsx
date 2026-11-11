"use client";
/**
 * Proyectos → Tableros de InooWork (2 nov 2026). InooWork es la fuente: el portal muestra sus proyectos con
 * su propio estilo y guarda cada cambio por la API de InooWork (src/servidor/tableros.ts). Vistas: tabla
 * (grupos, ítems y subítems, como Monday), kanban, calendario, línea de tiempo y gráfico.
 */
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type ReactNode } from "react";
import { LuChevronDown, LuChevronLeft, LuChevronRight, LuHistory, LuPlus, LuTrash2 } from "react-icons/lu";
import { HistorialMonday } from "./monday";
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

/** El cliente del proyecto, elegido de los clientes reales para que no quede escrito de varias formas. */
function ClienteDelTablero({ actual, cambiar }: { actual: string | null; cambiar: (ruta: string, metodo: "PATCH", cuerpo: Record<string, unknown>) => Promise<boolean> }) {
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes");
  const [valor, setValor] = useState(actual ?? "");
  const nombres = [...new Set(["Inoo", ...(clientes.datos?.datos ?? []).map((c) => c.nombre)])];
  const cambio = valor.trim() && valor.trim() !== (actual ?? "");
  return (
    <form className="fila" style={{ gap: 8, flexWrap: "wrap", marginBottom: 14 }} onSubmit={(e) => { e.preventDefault(); if (cambio) void cambiar("", "PATCH", { cliente: valor.trim() }); }}>
      <label htmlFor="tablero-cliente" className="texto-sm negrita" style={actual ? undefined : { color: "var(--c-alerta)" }}>{actual ? "Cliente" : "Falta el cliente"}</label>
      <input id="tablero-cliente" className="input" style={{ width: 240 }} list="tablero-clientes" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Elige un cliente, o Inoo si es interno" />
      <datalist id="tablero-clientes">{nombres.map((n) => <option key={n} value={n} />)}</datalist>
      {cambio && <button className="boton boton--chico boton--primario">Guardar</button>}
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
  const { params } = useNavegacion();
  const r = useConsulta<Tablero>(`/tableros/${params.id}`);
  const avisar = useAviso();
  const [vista, setVista] = useState<Vista>("TABLA");
  const [texto, setTexto] = useState("");
  const [responsable, setResponsable] = useState("");
  const [estado, setEstado] = useState("");
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
  const vistas: Vista[] = [...new Set<Vista>(["TABLA", ...t.vistas.map((v) => v.tipo), "GRAFICO"])];
  const ctx = { t, items, cambiar, editable: t.puedeEditar };

  return (
    <>
      <Enlace a="/equipo/proyectos" className="volver">← Proyectos</Enlace>
      <Cabecera
        antetitulo={[t.cliente ?? "Sin cliente", t.area, t.lider ? `Líder: ${t.lider.nombre}` : null].filter(Boolean).join(" · ")}
        titulo={t.nombre}
        bajada={t.descripcion ?? undefined}
        accion={!t.puedeEditar ? <span className="texto-xs texto-muted">Solo lectura: no eres miembro activo</span> : undefined}
      />
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
    </>
  );
}

type Ctx = { t: Tablero; items: Item[]; cambiar: (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>; editable: boolean };

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

function VistaTabla({ t, items, cambiar, editable }: Ctx) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  const [historial, setHistorial] = useState<Item | null>(null);
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

  return (
    <div className="pila" style={{ gap: 18 }}>
      {t.grupos.map((g) => {
        const suyos = items.filter((i) => i.grupoId === g.id);
        const plegado = plegados.has(g.id);
        return (
          <section key={g.id} className="tablero-grupo" style={{ borderLeftColor: g.color }} aria-label={`Grupo ${g.nombre}`}>
            <header className="fila" style={{ gap: 8, marginBottom: 6 }}>
              <button className="boton-icono" aria-label={plegado ? `Mostrar ${g.nombre}` : `Ocultar ${g.nombre}`} aria-expanded={!plegado} onClick={() => setPlegados(alternar(plegados, g.id))} style={{ color: g.color }}>
                <LuChevronDown size={16} style={{ transform: plegado ? "rotate(-90deg)" : undefined }} />
              </button>
              <span className="tablero-grupo-nombre" style={{ color: g.color }}>
                <Texto valor={g.nombre} editable={editable} etiqueta={`Nombre del grupo ${g.nombre}`} guardar={(nombre) => void cambiar(`/grupos/${g.id}`, "PATCH", { nombre })} />
              </span>
              <span className="texto-xs texto-muted">{suyos.length} {suyos.length === 1 ? "ítem" : "ítems"}</span>
              {editable && (
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
                      <th style={{ width: 28 }} />
                      <th style={{ minWidth: 280 }}>Ítem</th>
                      <th style={{ minWidth: 170 }}>Responsable</th>
                      <th style={{ width: 150 }}>Estado</th>
                      <th style={{ width: 110 }}>Prioridad</th>
                      <th style={{ width: 140 }}>Fecha límite</th>
                      <th style={{ minWidth: 180 }}>Descripción</th>
                      {t.columnas.map((c) => (
                        <th key={c.id} style={{ minWidth: c.tipo === "long_text" || c.tipo === "doc" || c.tipo === "people" ? 160 : 120 }} title={info(c.tipo)?.nombre ?? c.tipo}>
                          {editable
                            ? <button type="button" className="boton-texto" style={{ font: "inherit", color: "inherit", textTransform: "inherit", letterSpacing: "inherit" }} aria-label={`Configurar la columna ${c.nombre}`} onClick={() => setConfigurando(c)}>{c.nombre}</button>
                            : c.nombre}
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
                        <tr key={i.id}>
                          <td>
                            <button className="boton-icono" aria-label={abierto ? `Ocultar subítems de ${i.nombre}` : `Ver subítems de ${i.nombre}`} aria-expanded={abierto} onClick={() => setAbiertos(alternar(abiertos, i.id))}>
                              <LuChevronRight size={14} style={{ transform: abierto ? "rotate(90deg)" : undefined }} />
                            </button>
                          </td>
                          <td>
                            <span className="fila" style={{ gap: 6 }}>
                              <Texto valor={i.nombre} editable={editable} etiqueta={`Nombre de ${i.nombre}`} guardar={(nombre) => void item(i, { nombre })} />
                              {i.subitems.length > 0 && <span className="contador-sub">{i.subitems.length}</span>}
                              {i.deMonday && <button className="boton-icono" aria-label={`Historial de Monday de ${i.nombre}`} title="Historial de Monday" onClick={() => setHistorial(i)}><LuHistory size={13} /></button>}
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
                    {editable && <FilaNueva columnas={columnas} etiqueta={`Nuevo ítem en ${g.nombre}`} texto="+ Agregar ítem" crear={(nombre) => cambiar("/items", "POST", { nombre, grupoId: g.id })} />}
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
      {editable && (
        <button className="boton boton--chico" style={{ justifySelf: "start" }} onClick={() => void nuevoGrupo()}>
          <LuPlus size={14} /> Nuevo grupo
        </button>
      )}
      {historial && <HistorialMonday proyectoId={t.id} item={historial} alCerrar={() => setHistorial(null)} />}
      {biblioteca && <BibliotecaColumnas t={t} cambiar={cambiar} cerrar={() => setBiblioteca(false)} />}
      {configurando && <ConfigurarColumna t={t} col={configurando} cambiar={cambiar} cerrar={() => setConfigurando(null)} />}
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

function VistaKanban({ t, items, cambiar, editable }: Ctx) {
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
              <article key={i.id} className="tarjeta kanban-item" draggable={editable} onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}>
                <span className="texto-xs texto-muted">{t.grupos.find((g) => g.id === i.grupoId)?.nombre}</span>
                <span className="negrita texto-sm">{i.nombre}</span>
                <span className="fila entre texto-xs" style={{ gap: 6 }}>
                  <span>{i.responsable?.nombre ?? "Sin asignar"}</span>
                  <span style={i.vencido ? { color: "var(--c-alerta)" } : undefined}>{fecha(i.fecha)}</span>
                </span>
                <span className="fila" style={{ gap: 6 }}>
                  <span className="pildora pildora--chica" style={{ background: COLOR_PRIORIDAD[i.prioridad as PrioridadItem] }}>{i.prioridad}</span>
                  {i.subitems.length > 0 && <span className="texto-xs texto-muted">{i.subitems.filter((s) => s.estado === "Completado").length}/{i.subitems.length} subítems</span>}
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
  const primera = conFecha.map((i) => i.fecha!).sort()[0] ?? new Date().toISOString().slice(0, 10);
  const [mes, setMes] = useState(primera.slice(0, 7));
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
      <h3 className="tarjeta-titulo" style={{ fontSize: 14, marginBottom: 10 }}>{titulo}</h3>
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
