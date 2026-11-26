"use client";
/**
 * Proyectos → Tableros de InooWork (2 nov 2026). InooWork es la fuente: el portal muestra sus proyectos con
 * su propio estilo y guarda cada cambio por la API de InooWork (src/servidor/tableros.ts). Vistas: tabla
 * (grupos, ítems y subítems, como Monday), kanban, calendario, línea de tiempo y gráfico.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { LuArrowDown, LuArrowLeft, LuArrowRight, LuArrowUp, LuArrowUpDown, LuChevronDown, LuChevronLeft, LuChevronRight, LuCopy, LuEllipsis, LuGripVertical, LuLock, LuMessageSquare, LuPlus, LuTrash2, LuX, LuPencil } from "react-icons/lu";
import { PanelItem } from "./panel-item";
import { NuevoServicio, ProyectoEquipo } from "./proyecto-equipo";
import { VincularCarpeta } from "./accesos";
import { BotonAutomatizaciones } from "./automatizaciones-tablero";
import { BotonPersonas } from "./personas-tablero";
import { BotonIaTablero } from "./ia-tablero";
import { BibliotecaColumnas, CeldaColumna, ConfigurarColumna, PieNumeros } from "./columnas-tablero";
import { info } from "../dominio/columnas";
import { api, Enlace, fCorta, ProblemaApi, useConsulta, useNavegacion, type S, fDiaMes } from "../base";
import { TextoConEnlaces, Barra, Cabecera, Cargando, ErrorCarga, Estructura, Modal, useAviso, usePortal, confirmar } from "../componentes";
import { claveCliente, esClienteInterno } from "../dominio/clientes-tablero";
import { claveEmpresa } from "../dominio/carpetas";
import { COLOR_ESTADO, COLOR_PRIORIDAD, COLORES_GRUPO, columnaParaSubitems, ESTADOS_ITEM, ESTADOS_PROYECTO_IW, PRIORIDADES_ITEM, type EstadoItem, type PrioridadItem, fondoConTexto } from "../dominio/tableros";

type Tablero = S<"TableroInooWork">;
type Item = S<"ItemTablero">;
// 13 nov: «Carga» (cuánto tiene cada persona) es del portal; las demás vistas vienen de InooWork.
type Vista = S<"TableroInooWork">["vistas"][number]["tipo"] | "CARGA";

const NOMBRE_VISTA: Record<Vista, string> = { TABLA: "Tabla", KANBAN: "Kanban", CALENDARIO: "Calendario", LINEA_TIEMPO: "Línea de tiempo", GRAFICO: "Resumen", CARGA: "Carga" };
const fecha = (f: string | null | undefined) => (f ? fDiaMes(f) : "—");

// ═════════════════════════════════════════════ tablero

/** 16 nov (Ernesto, «sumas y contadores»): cuántos hay de cada valor, en una barra de colores como la de Monday. */
function BarraReparto({ valores, colores, etiqueta }: { valores: string[]; colores: Record<string, string>; etiqueta: string }) {
  const conteo = new Map<string, number>();
  for (const v of valores) conteo.set(v || "Sin definir", (conteo.get(v || "Sin definir") ?? 0) + 1);
  const total = valores.length;
  if (!total) return null;
  const partes = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
  const texto = partes.map(([v, n]) => `${v}: ${n}`).join(" · ");
  return (
    <span className="barra-reparto" role="img" aria-label={`${etiqueta}: ${texto}`} title={texto}>
      {partes.map(([v, n]) => <span key={v} style={{ width: `${(n / total) * 100}%`, background: colores[v] ?? "var(--c-borde-fuerte)" }} />)}
    </span>
  );
}

type Ultima = { autorId: string | null; autor: string; texto: string; creadoEn: string };
/** 16 nov: cuándo abriste cada ítem por última vez (en este navegador), para marcar lo nuevo. */
function useVistos(tableroId: string): [Record<string, string>, (itemId: string) => void] {
  const clave = `inoo.vistos.${tableroId}`;
  const [vistos, setVistos] = useState<Record<string, string>>({});
  useEffect(() => {
    try { setVistos(JSON.parse(localStorage.getItem(clave) ?? "{}")); } catch { setVistos({}); }
  }, [clave]);
  const marcar = useCallback((itemId: string) => setVistos((v) => {
    const n = { ...v, [itemId]: new Date().toISOString() };
    try { localStorage.setItem(clave, JSON.stringify(n)); } catch { /* sin almacenamiento: solo por esta visita */ }
    return n;
  }), [clave]);
  return [vistos, marcar];
}

/**
 * 20 nov (Alonso): qué columnas del tablero se usan también en los subítems (texto, estado, fecha, archivos, enlaces…).
 * Las calculadas y las que conectan tableros dependen del ítem completo, así que no aparecen.
 */
function ColumnasEnSubitems({ t, cambiar }: { t: Tablero; cambiar: (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean> }) {
  const [abierto, setAbierto] = useState(false);
  const posibles = t.columnas.filter((c) => columnaParaSubitems(c.tipo));
  const [elegidas, setElegidas] = useState<string[]>(t.columnasSubitems ?? []);
  if (!posibles.length) return null;
  const guardar = async () => {
    if (await cambiar("", "PATCH", { columnasSubitems: elegidas })) setAbierto(false);
  };
  return (
    <>
      <button className="boton boton--chico" onClick={() => { setElegidas(t.columnasSubitems ?? []); setAbierto(true); }}>
        Columnas en subítems{(t.columnasSubitems ?? []).length ? ` (${(t.columnasSubitems ?? []).length})` : ""}
      </button>
      {abierto && (
        <Modal abierto alCerrar={() => setAbierto(false)} etiqueta="Columnas en los subítems" ancho={460}>
          <div className="pila" style={{ gap: 12 }}>
            <h2 style={{ fontSize: "var(--t-lg)", fontWeight: 600 }}>Columnas en los subítems</h2>
            <p className="texto-sm texto-muted">Los subítems siempre tienen nombre, responsable, estado, fecha y descripción. Elige qué otras columnas se llenan también en ellos.</p>
            {posibles.map((c) => (
              <label key={c.id} className="fila texto-sm" style={{ gap: 8 }}>
                <input type="checkbox" checked={elegidas.includes(c.id)} onChange={(e) => setElegidas((xs) => (e.target.checked ? [...xs, c.id] : xs.filter((x) => x !== c.id)))} />
                {c.nombre}
              </label>
            ))}
            <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button className="boton" onClick={() => setAbierto(false)}>Cancelar</button>
              <button className="boton boton--primario" onClick={() => void guardar()}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export function PantallaTablero() {
  return (
    <Estructura espacio="equipo" migas="Tablero">
      <TableroProyecto />
    </Estructura>
  );
}
/** 17 nov: el mismo tablero para un invitado de afuera (en /invitado/tableros/{id}), sin lo interno del equipo. */
export { TableroProyecto };

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

/**
 * 16 nov (tanda 4, Ernesto): la marca del cliente, el servicio contratado al que pertenece (0 o 1) y etiquetas libres.
 * Las marcas y los servicios se filtran por el cliente del tablero; una marca nueva se crea aquí mismo.
 */
function VinculosDelTablero({ t, cambiar, editable }: { t: Tablero; cambiar: (ruta: string, metodo: "PATCH", cuerpo: Record<string, unknown>) => Promise<boolean>; editable: boolean }) {
  const avisar = useAviso();
  const marcas = useConsulta<{ datos: S<"MarcaCliente">[] }>("/marcas");
  const servicios = useConsulta<{ datos: S<"ProyectoPipeline">[] }>("/panel/proyectos");
  // 17 nov: su carpeta en Proyectos (de la misma empresa); elegirla le pone también la marca de la carpeta.
  const cq = useConsulta<{ datos: S<"CarpetaProyecto">[] }>("/carpetas");
  const susCarpetas = (cq.datos?.datos ?? []).filter((c) => c.empresaClave === claveEmpresa(t.cliente));
  const rutaCarpeta = (c: S<"CarpetaProyecto">) => [
    (marcas.datos?.datos ?? []).find((m) => m.id === c.marcaId)?.nombre,
    c.padreId ? susCarpetas.find((x) => x.id === c.padreId)?.nombre : null, c.nombre,
  ].filter(Boolean).join(" › ");
  const [etiqueta, setEtiqueta] = useState("");
  const mismo = (nombre: string) => !!t.cliente && (claveCliente(nombre) === claveCliente(t.cliente) || (esClienteInterno(t.cliente) && /^inoo\b/i.test(nombre)));
  const suyas = (marcas.datos?.datos ?? []).filter((m) => mismo(m.clienteNombre) && (m.activa || m.id === t.marcaId));
  const susServicios = (servicios.datos?.datos ?? []).filter((s) => mismo(s.clienteNombre));
  const clienteId = susServicios[0]?.clienteId ?? suyas[0]?.clienteId ?? null;
  const nuevaMarca = async () => {
    const nombre = window.prompt(`Nombre de la marca nueva de ${t.cliente}`);
    if (!nombre?.trim() || !clienteId) return;
    try {
      const m = await api<S<"MarcaCliente">>(`/clientes/${clienteId}/marcas`, { metodo: "POST", cuerpo: { nombre } });
      marcas.recargar();
      await cambiar("", "PATCH", { marcaId: m.id });
    } catch (e) {
      avisar({ titulo: "No se pudo crear la marca", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
    }
  };
  const quitarEtiqueta = (x: string) => void cambiar("", "PATCH", { etiquetas: t.etiquetas.filter((y) => y !== x) });
  const agregarEtiqueta = () => {
    const x = etiqueta.trim();
    setEtiqueta("");
    if (x) void cambiar("", "PATCH", { etiquetas: [...t.etiquetas, x] });
  };
  return (
    <div className="fila" style={{ gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
      <label className="fila texto-sm" style={{ gap: 8 }}>
        <span className="negrita">Marca</span>
        <select className="input" style={{ width: 200, height: 36 }} disabled={!editable || !marcas.datos} value={t.marcaId ?? ""}
          onChange={(e) => (e.target.value === "__nueva" ? void nuevaMarca() : void cambiar("", "PATCH", { marcaId: e.target.value || null }))}>
          <option value="">Sin marca</option>
          {suyas.map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.activa ? "" : " (inactiva)"}</option>)}
          {editable && clienteId && <option value="__nueva">Nueva marca…</option>}
        </select>
      </label>
      <label className="fila texto-sm" style={{ gap: 8 }}>
        <span className="negrita">Carpeta</span>
        <select className="input" style={{ width: 220, height: 36 }} disabled={!editable || !cq.datos} value={t.carpetaId ?? ""}
          onChange={(e) => void cambiar("", "PATCH", { carpetaId: e.target.value || null })}>
          <option value="">Sin carpeta</option>
          {susCarpetas.map((c) => ({ c, r: rutaCarpeta(c) })).sort((a, b) => a.r.localeCompare(b.r, "es")).map(({ c, r }) => <option key={c.id} value={c.id}>{r}</option>)}
        </select>
      </label>
      <label className="fila texto-sm" style={{ gap: 8 }}>
        <span className="negrita">Servicio del cliente</span>
        <select className="input" style={{ width: 260, height: 36 }} disabled={!editable || !servicios.datos} value={t.servicioId ?? ""}
          onChange={(e) => void cambiar("", "PATCH", { servicioId: e.target.value || null })}>
          <option value="">Sin compartir</option>
          {susServicios.map((s) => <option key={s.servicioContratadoId} value={s.servicioContratadoId}>{s.titulo}</option>)}
        </select>
      </label>
      <span className="fila texto-sm" style={{ gap: 6, flexWrap: "wrap" }}>
        <span className="negrita">Etiquetas</span>
        {t.etiquetas.map((x) => (
          <span key={x} className="chip texto-xs" style={{ gap: 4 }}>
            {x}
            {editable && <button type="button" className="boton-icono" style={{ padding: 0 }} aria-label={`Quitar la etiqueta ${x}`} onClick={() => quitarEtiqueta(x)}><LuX size={11} /></button>}
          </span>
        ))}
        {editable && t.etiquetas.length < 10 && (
          <input className="input" style={{ width: 140, height: 32 }} aria-label="Nueva etiqueta" placeholder="+ Etiqueta" maxLength={30} value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarEtiqueta(); } }} onBlur={agregarEtiqueta} />
        )}
        {!editable && !t.etiquetas.length && <span className="texto-xs texto-muted">Sin etiquetas</span>}
      </span>
    </div>
  );
}

function EditarDatos({ t, cambiar, cerrar }: { t: Tablero; cambiar: (ruta: string, metodo: "PATCH", cuerpo: Record<string, unknown>) => Promise<boolean>; cerrar: () => void }) {
  const [nombre, setNombre] = useState(t.nombre);
  const [descripcion, setDescripcion] = useState(t.descripcion ?? "");
  const [guardando, setGuardando] = useState(false);
  return (
    <form className="tarjeta pila" style={{ gap: 10, padding: 16, marginBottom: 14, maxWidth: 820 }} onSubmit={async (e) => {
      e.preventDefault();
      setGuardando(true);
      const cuerpo: Record<string, unknown> = {};
      if (nombre.trim() && nombre.trim() !== t.nombre) cuerpo.nombre = nombre.trim();
      if (descripcion.trim() !== (t.descripcion ?? "").trim()) cuerpo.descripcion = descripcion;
      const ok = !Object.keys(cuerpo).length || (await cambiar("", "PATCH", cuerpo));
      setGuardando(false);
      if (ok) cerrar();
    }}>
      <div className="campo">
        <label htmlFor="tablero-nombre">Nombre del proyecto</label>
        <div className="entrada"><input id="tablero-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} /></div>
      </div>
      <div className="campo">
        <label htmlFor="tablero-descripcion">Descripción</label>
        <textarea id="tablero-descripcion" className="input" rows={5} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} />
        <span className="texto-xs texto-muted">Los enlaces (https://…) se ven como enlaces. {descripcion.length}/2000</span>
      </div>
      <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="boton" onClick={cerrar}>Cancelar</button>
        <button type="submit" className="boton boton--primario" disabled={guardando || !nombre.trim()}>{guardando ? "Guardando…" : "Guardar"}</button>
      </div>
    </form>
  );
}

/**
 * Progreso del tablero (17 nov, Ernesto: «progreso por tablero, no por columna»): cuánto del tablero está completado,
 * de un vistazo arriba, también para los invitados de afuera. Cuenta los ítems (los subítems son parte de su ítem).
 */
/**
 * 23 nov (auditoría Impeccable): cliente, estado, marca, carpeta, servicio y etiquetas iban como seis selectores
 * abiertos antes de la tabla. Ahora quedan en una línea de resumen que se despliega para editarlos.
 */
function DatosDelProyecto({ t, cambiar }: { t: Tablero; cambiar: (ruta: string, metodo: "PATCH", cuerpo: Record<string, unknown>) => Promise<boolean> }) {
  const [abierto, setAbierto] = useState(false);
  const resumen = [
    t.cliente ?? "Sin cliente",
    t.estado ?? "En Progreso",
    t.servicioId ? "Compartido con el cliente" : null,
    t.etiquetas.length ? t.etiquetas.join(", ") : null,
  ].filter(Boolean).join(" · ");
  return (
    <section className="datos-proyecto">
      <button type="button" className="datos-proyecto-resumen" aria-expanded={abierto} aria-controls="datos-proyecto-cuerpo" onClick={() => setAbierto(!abierto)}>
        <LuChevronRight size={15} aria-hidden="true" className="datos-proyecto-flecha" />
        <span className="negrita">Datos del proyecto</span>
        <span className="texto-muted datos-proyecto-texto">{resumen}</span>
        {t.puedeEditar && <span className="enlace texto-sm" aria-hidden="true">{abierto ? "Listo" : "Cambiar"}</span>}
      </button>
      {abierto && (
        <div id="datos-proyecto-cuerpo" className="datos-proyecto-cuerpo">
          {t.puedeEditar && <ClienteDelTablero actual={t.cliente ?? null} cambiar={cambiar} />}
          {t.puedeEditar && <EstadoDelTablero t={t} cambiar={cambiar} />}
          {t.cliente && <VinculosDelTablero t={t} cambiar={cambiar} editable={t.puedeEditar} />}
          {t.cliente && !esClienteInterno(t.cliente) && <CarpetaDelProyecto t={t} />}
        </div>
      )}
    </section>
  );
}

/** 25 nov: la carpeta de Drive de este proyecto (una que ya existe en el Drive del equipo). */
function CarpetaDelProyecto({ t }: { t: Tablero }) {
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes?limite=100");
  const ficha = (clientes.datos?.datos ?? []).find((c) => claveCliente(c.nombre) === claveCliente(t.cliente ?? ""));
  const q = useConsulta<{ datos: S<"CarpetaVinculada">[] }>(ficha ? `/clientes/${ficha.id}/carpetas` : null);
  const [cambiando, setCambiando] = useState(false);
  if (!ficha) return null;
  const suya = (q.datos?.datos ?? []).find((x) => x.tableroId === t.id);
  return (
    <div className="fila texto-sm" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 14 }}>
      <span className="negrita">Carpeta de Drive</span>
      {cambiando ? (
        <span style={{ flex: "1 1 280px", maxWidth: 420 }}>
          <VincularCarpeta clienteId={ficha.id} nombreInicial={t.nombre} tableroId={t.id} alVincular={() => { setCambiando(false); void q.recargar(); }} alCancelar={() => setCambiando(false)} />
        </span>
      ) : (
        <>
          {suya ? <a className="enlace" href={suya.url} target="_blank" rel="noreferrer">{suya.nombre} ↗</a> : <span className="texto-muted">Sin carpeta</span>}
          {t.puedeEditar && <button type="button" className="boton-texto texto-sm" onClick={() => setCambiando(true)}>{suya ? "Cambiar" : "Vincular una que ya existe"}</button>}
        </>
      )}
    </div>
  );
}

/** 26 nov: la papelera del tablero. Cualquiera que lo edite devuelve una fila o un subítem a su lugar. */
function BotonPapelera({ t, cambiar }: { t: Tablero; cambiar: (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean> }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="boton boton--chico" onClick={() => setAbierta(true)} title="Lo borrado en los últimos 30 días">
        <LuTrash2 size={14} /> Papelera{t.papelera.length ? ` (${t.papelera.length})` : ""}
      </button>
      <Modal abierto={abierta} alCerrar={() => setAbierta(false)} etiqueta="Papelera del tablero">
        <h2 className="tarjeta-titulo">Papelera</h2>
        <p className="texto-sm texto-muted" style={{ marginBottom: 12 }}>Lo borrado en este tablero los últimos 30 días. Vuelve al mismo lugar, con sus comentarios y archivos.</p>
        {!t.papelera.length && <p className="texto-sm">Está vacía. Si borras una fila o un subítem, queda aquí 30 días.</p>}
        <ul className="pila" style={{ gap: 6, listStyle: "none", margin: 0, padding: 0 }}>
          {t.papelera.map((x) => (
            <li key={x.id} className="fila-suave fila entre" style={{ gap: 10 }}>
              <span className="pila" style={{ gap: 0, minWidth: 0 }}>
                <span className="texto-sm">{x.nombre}{x.tipo === "SUBITEM" ? <span className="texto-muted"> · subítem{x.fila ? ` de «${x.fila}»` : ""}</span> : null}</span>
                <span className="texto-xs texto-muted">Borrado {x.borradoPor ? `por ${x.borradoPor} ` : ""}el {fDiaMes(x.en)}</span>
              </span>
              {t.puedeEditar && <button type="button" className="boton boton--chico" onClick={() => void cambiar(`/papelera/${encodeURIComponent(x.id)}/restaurar`, "POST")}>Restaurar</button>}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}

/** Acciones poco usadas o peligrosas, fuera de la fila principal (23 nov). */
function MasAcciones({ borrar, guardarPlantilla }: { borrar?: () => void; guardarPlantilla: () => void }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const cerrar = (e: Event) => { if (!(e.target as HTMLElement).closest?.(".mas-acciones")) setPos(null); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    document.addEventListener("pointerdown", cerrar);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", cerrar); document.removeEventListener("keydown", esc); };
  }, [pos]);
  return (
    <span className="mas-acciones">
      <button type="button" className="boton boton--chico" aria-label="Más acciones" aria-haspopup="menu" aria-expanded={!!pos}
        onClick={(ev) => { if (pos) return setPos(null); const r = ev.currentTarget.getBoundingClientRect(); setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - 216, r.right - 208)) }); }}>
        <LuEllipsis size={16} />
      </button>
      {pos && (
        <span className="arbol-menu-caja" role="menu" style={pos}>
          <button type="button" role="menuitem" onClick={() => { setPos(null); guardarPlantilla(); }}><LuCopy size={14} /> Guardar como plantilla</button>
          {borrar && <button type="button" role="menuitem" className="peligro" onClick={() => { setPos(null); borrar(); }}><LuTrash2 size={14} /> Borrar proyecto</button>}
        </span>
      )}
    </span>
  );
}

function ProgresoTablero({ t }: { t: Tablero }) {
  const total = t.items.length;
  if (!total) return null;
  const hechos = t.items.filter((i) => i.estado === "Completado").length;
  const vencidos = t.items.filter((i) => i.vencido && i.estado !== "Completado").length;
  const pct = Math.round((hechos / total) * 100);
  return (
    <div className="pila" style={{ gap: 6, maxWidth: 520, marginBottom: 14 }}>
      <div className="fila entre texto-sm"><span className="negrita">Progreso del tablero</span><span>{pct} %</span></div>
      <Barra pct={pct} tono={vencidos ? "ambar" : undefined} />
      <span className="texto-xs texto-muted">{hechos} de {total} {total === 1 ? "ítem completado" : "ítems completados"}{vencidos ? ` · ${vencidos} ${vencidos === 1 ? "vencido" : "vencidos"}` : ""}</span>
    </div>
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
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const [parte, setParte] = useState<"TABLERO" | "CLIENTE">(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("parte") === "cliente" ? "CLIENTE" : "TABLERO"));
  const { params, ir } = useNavegacion();
  const r = useConsulta<Tablero>(`/tableros/${params.id}`);
  const avisar = useAviso();
  const [vista, setVista] = useState<Vista>("TABLA");
  const [texto, setTexto] = useState("");
  const [responsable, setResponsable] = useState("");
  const [estado, setEstado] = useState("");
  // 12 nov: el panel del ítem (conversación, archivos, Monday). «?item=» lo abre directo (los avisos de la campana).
  // 17 nov: el nombre y la descripción se editan aquí (quien edita el tablero; no los invitados).
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [panel, setPanel] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("item")));
  const conteo = useConsulta<{ datos: Record<string, number>; ultimas: Record<string, Ultima> }>(`/tableros/${params.id}/actualizaciones`);
  const yoId = usePortal().sesion?.usuario.id ?? null;
  const [vistos, marcarVisto] = useVistos(params.id ?? "");
  // 26 nov: al llegar recién creado («?parte=cliente»), la dirección cambia después del primer render: se relee al montar.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("parte") === "cliente") setParte("CLIENTE");
  }, [params.id]);
  // 26 nov: Ctrl+Z (fuera de un campo de texto) devuelve lo último que se borró en este tablero.
  const deshacer = useRef<(() => void) | null>(null);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z" || !deshacer.current) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      e.preventDefault();
      const x = deshacer.current;
      deshacer.current = null;
      x();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
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
      const nuevo = await api<Tablero>(`/tableros/${t.id}${ruta}`, { metodo, cuerpo });
      r.setDatos(nuevo);
      // 26 nov: lo borrado va a la papelera; «Deshacer» (o Ctrl+Z) lo devuelve a su lugar.
      const borrado = metodo === "DELETE" && /^\/items\/[^/]+(\/subitems\/[^/]+)?$/.test(ruta) ? nuevo.papelera[0] : undefined;
      if (borrado) {
        const devolver = () => void cambiar(`/papelera/${encodeURIComponent(borrado.id)}/restaurar`, "POST");
        deshacer.current = devolver;
        avisar({ titulo: borrado.tipo === "ITEM" ? "Fila borrada" : "Subítem borrado", texto: "Queda 30 días en la papelera del tablero. Ctrl+Z también lo devuelve.", accion: { texto: "Deshacer", hacer: () => { deshacer.current = null; devolver(); } } });
      }
      return true;
    } catch (e) {
      avisar({ titulo: "No pudimos guardar en InooWork", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
      return false;
    }
  };
  const desarchivar = async () => {
    if (!(await confirmar(`¿Desarchivar «${t.nombre}»? Vuelve a la lista de proyectos, en curso.`))) return;
    try {
      r.setDatos(await api<Tablero>(`/tableros/${t.id}/desarchivar`, { metodo: "POST" }));
      avisar({ titulo: "Proyecto desarchivado" });
    } catch (e) {
      avisar({ titulo: "No se pudo desarchivar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const borrarProyecto = async () => {
    if (!(await confirmar(`¿Borrar el proyecto «${t.nombre}» con todos sus ítems? Desaparece del portal y de InooWork (un admin lo puede recuperar en InooWork).${t.servicioId ? " Su parte del cliente queda como servicio sin proyecto." : ""}`))) return;
    try {
      await api(`/tableros/${t.id}`, { metodo: "DELETE" });
      avisar({ titulo: "Proyecto borrado" });
      ir("/equipo/proyectos");
    } catch (e) {
      avisar({ titulo: "No se pudo borrar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const puedeDatos = t.puedeEditar && !t.soyInvitado;
  // 25 nov (fusión): ?parte=cliente abre la pestaña «Para el cliente» (enlaces desde el servicio y desde «Nuevo proyecto»).
  const elegirParte = (x: "TABLERO" | "CLIENTE") => {
    setParte(x);
    const u = new URL(window.location.href);
    if (x === "CLIENTE") u.searchParams.set("parte", "cliente"); else { u.searchParams.delete("parte"); u.searchParams.delete("compartir"); u.searchParams.delete("pestana"); }
    window.history.replaceState(window.history.state, "", u);
  };
  const vistas: Vista[] = [...new Set<Vista>(["TABLA", ...t.vistas.map((v) => v.tipo), "GRAFICO", "CARGA"])];
  const ultimas = conteo.datos?.ultimas ?? {};
  // 16 nov (Ernesto): hay algo nuevo si la última actualización es de otra persona y es posterior a la última vez que abriste el ítem.
  const nuevos = new Set(Object.entries(ultimas).filter(([id, u]) => u.autorId !== yoId && (!vistos[id] || u.creadoEn > vistos[id])).map(([id]) => id));
  const ctx = { t, items, cambiar, editable: t.puedeEditar, abrir: (i: Item) => { marcarVisto(i.id); setPanel(i.id); }, conteo: conteo.datos?.datos ?? {}, ultimas, nuevos };
  const enPanel = panel ? t.items.find((i) => i.id === panel) : undefined;

  return (
    <>
      <Enlace a={t.soyInvitado ? "/invitado" : "/equipo/proyectos"} className="volver">← {t.soyInvitado ? "Tableros compartidos contigo" : "Proyectos"}</Enlace>
      <Cabecera
        antetitulo={[t.cliente ?? (t.soyInvitado ? null : "Sin cliente"), t.soyInvitado ? null : t.area, t.lider ? `Líder: ${t.lider.nombre}` : null].filter(Boolean).join(" · ")}
        titulo={t.nombre}
        bajada={editandoDatos ? undefined : (t.descripcion || puedeDatos) ? (
          <>
            {t.descripcion ? <TextoConEnlaces texto={t.descripcion} /> : <span className="texto-muted">Sin descripción</span>}
            {puedeDatos && <button type="button" className="boton-texto texto-sm" style={{ marginLeft: 8 }} onClick={() => setEditandoDatos(true)}><LuPencil size={13} /> Editar</button>}
          </>
        ) : undefined}
        accion={
          <span className="fila" style={{ gap: 8 }}>
            {t.privado && <span className="chip texto-xs" title="Solo lo ven sus personas, ni los admins"><LuLock size={12} /> Privado</span>}
            {!t.puedeEditar && !t.archivado && <span className="texto-xs texto-muted">{t.miPermiso === "COMENTADOR" ? "Puedes ver y comentar" : "Solo lectura"}</span>}
            {t.soyInvitado && t.puedeEditar && <span className="texto-xs texto-muted">Puedes cambiar y comentar los ítems</span>}
            {!t.soyInvitado && t.puedeEditar && <BotonPapelera t={t} cambiar={cambiar} />}
            {!t.soyInvitado && <BotonPersonas t={t} cambiar={cambiar} />}
            {!t.archivado && !t.soyInvitado && <BotonIaTablero t={t} cambiar={cambiar} />}
            {!t.archivado && !t.soyInvitado && <BotonAutomatizaciones t={t} cambiar={cambiar} />}
            {!t.soyInvitado && (t.puedeBorrar || t.puedeEditar) && <MasAcciones borrar={t.puedeBorrar ? () => void borrarProyecto() : undefined} guardarPlantilla={() => setGuardandoPlantilla(true)} />}
          </span>
        }
      />
      {/* 25 nov (fusión): el proyecto es el tablero; lo que ve el cliente (etapas, formularios, entregables) va en su pestaña. */}
      {!t.soyInvitado && (
        <div className="segmentado" role="tablist" aria-label="Partes del proyecto" style={{ marginBottom: 16 }}>
          <button role="tab" aria-selected={parte === "TABLERO"} className={parte === "TABLERO" ? "activo" : undefined} onClick={() => elegirParte("TABLERO")}>Tablero</button>
          <button role="tab" aria-selected={parte === "CLIENTE"} className={parte === "CLIENTE" ? "activo" : undefined} onClick={() => elegirParte("CLIENTE")}>
            Para el cliente{!t.servicioId && <span className="texto-muted"> · sin compartir</span>}
          </button>
        </div>
      )}
      {parte === "CLIENTE" && !t.soyInvitado ? <ParaElCliente t={t} cambiar={cambiar} /> : (
      <>
        {editandoDatos && <EditarDatos t={t} cambiar={cambiar} cerrar={() => setEditandoDatos(false)} />}
      {guardandoPlantilla && <GuardarPlantilla t={t} cerrar={() => setGuardandoPlantilla(false)} />}
        {t.archivado && (
          <div className="aviso-archivado" role="status">
            <span><strong>Proyecto archivado</strong>{t.archivadoEn ? ` el ${fCorta(t.archivadoEn)}` : ""}. Está en solo lectura.</span>
            {t.puedeDesarchivar && <button className="boton boton--chico boton--primario" onClick={() => void desarchivar()}>Desarchivar</button>}
          </div>
        )}
        <ProgresoTablero t={t} />
        {!t.soyInvitado && <DatosDelProyecto t={t} cambiar={cambiar} />}
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
        {vista === "CARGA" && <VistaCarga t={t} items={items} />}
        {enPanel && <PanelItem t={t} item={enPanel} cambiar={cambiar} cerrar={() => setPanel(null)} alActualizar={() => void conteo.recargar()} />}
      </>
      )}
    </>
  );
}

type Ctx = { t: Tablero; items: Item[]; cambiar: (ruta: string, metodo: "POST" | "PATCH" | "DELETE", cuerpo?: Record<string, unknown>) => Promise<boolean>; editable: boolean; abrir: (i: Item) => void; conteo: Record<string, number>; ultimas: Record<string, Ultima>; nuevos: Set<string> };

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
  if (!editable) return <span className="pildora" style={{ ...fondoConTexto(color(valor)) }}>{valor}</span>;
  return (
    <select className="pildora" aria-label={etiqueta} style={{ ...fondoConTexto(color(valor)) }} value={valor} onChange={(e) => guardar(e.target.value as T)}>
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

function VistaTabla({ t, items, cambiar, editable, abrir, conteo, ultimas, nuevos }: Ctx) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [plegados, setPlegados] = useState<Set<string>>(new Set());
  // 25 nov (Ernesto): la columna nueva puede ir a un lado de otra (clic derecho); `undefined` = al final.
  const [biblioteca, setBiblioteca] = useState<false | { antesDe?: string | null }>(false);
  const [menuCol, setMenuCol] = useState<{ x: number; y: number; col: Tablero["columnas"][number] } | null>(null);
  const [arrastrandoCol, setArrastrandoCol] = useState<string | null>(null);
  const [sobreCol, setSobreCol] = useState<string | null>(null);
  const [configurando, setConfigurando] = useState<Tablero["columnas"][number] | null>(null);
  const alternar = (s: Set<string>, id: string) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };
  const item = (i: Item, b: Record<string, unknown>) => cambiar(`/items/${i.id}`, "PATCH", b);
  const nuevoGrupo = () => cambiar("/grupos", "POST", { nombre: "Nuevo grupo", color: COLORES_GRUPO[t.grupos.length % COLORES_GRUPO.length] });
  const borrarGrupo = async (g: Tablero["grupos"][number]) => {
    if (!(await confirmar(`¿Borrar el grupo «${g.nombre}»? Sus ítems pasan al primer grupo.`))) return;
    void cambiar(`/grupos/${g.id}`, "DELETE");
  };
  const borrarItem = async (i: Item) => {
    if (!(await confirmar(`¿Borrar «${i.nombre}»${i.subitems.length ? " con sus subítems" : ""}? Queda 30 días en la papelera del tablero.`))) return;
    void cambiar(`/items/${i.id}`, "DELETE");
  };
  // 17 nov: un invitado de afuera con permiso de editor cambia los ítems, no la estructura (grupos, columnas, borrar).
  const estructura = editable && !t.soyInvitado;
  const columnas = 7 + t.columnas.length + (estructura ? 1 : 0);
  // 16 nov (Ernesto): «Última actualización» va siempre al final de la fila, como en Monday.
  const enOrden = [...t.columnas.filter((c) => c.tipo !== "last_updated"), ...t.columnas.filter((c) => c.tipo === "last_updated")];
  // 16 nov (Ernesto): la fila de totales va siempre (contadores de ítems, estados y prioridades), no solo con números.
  // 12 nov, como en Monday: agrupar por otra columna, ordenar con el encabezado y elegir varios para cambiarlos juntos.
  const [agrupar, setAgrupar] = useState<Agrupar>("GRUPO");
  const [orden, setOrden] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // 16 nov (Ernesto): arrastrar y soltar filas (reordenar o pasar a otro grupo), solo con los grupos reales y sin orden.
  const [arrastrado, setArrastrado] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const arrastrable = editable && agrupar === "GRUPO" && !orden;
  const soltarEn = (grupoId: string, antesDe: string | null) => (e: DragEvent) => {
    e.preventDefault();
    const id = arrastrado ?? e.dataTransfer.getData("text/plain");
    setArrastrado(null);
    setSobre(null);
    if (!id || id === antesDe) return;
    void cambiar(`/items/${id}/mover`, "POST", { grupoId, antesDe });
  };
  const sobreEn = (clave: string) => (e: DragEvent) => { if (arrastrado) { e.preventDefault(); if (sobre !== clave) setSobre(clave); } };
  const secciones = useMemo(() => seccionesDe(t, items, agrupar), [t, items, agrupar]);
  const ordenar = (xs: Item[]) => (orden ? [...xs].sort((a, b) => comparar(a, b, orden.col) * orden.dir) : xs);
  const alOrdenar = (col: string) => setOrden((o) => (!o || o.col !== col ? { col, dir: 1 } : o.dir === 1 ? { col, dir: -1 } : null));
  // 13 nov: el ancho de cada columna se cambia arrastrando el borde del encabezado (doble clic vuelve al de siempre).
  // Se recuerda por tablero en este navegador: cada persona lo deja a su gusto.
  const [anchos, setAnchos] = useAnchos(t.id);
  // 17 nov (Ernesto): el alto de cada fila se cambia arrastrando su borde de abajo (doble clic: el de siempre), y la
  // densidad de todo el tablero (compacto, normal, amplio). Se recuerda por tablero en este navegador.
  const [altos, setAltos] = useAnchos(t.id, "altos");
  const [densidad, setDensidad] = useAnchos(t.id, "densidad");
  const nivel = (["compacto", "normal", "amplio"] as const)[densidad.n ?? 1] ?? "normal";
  const AsaAlto = ({ item }: { item: Item }) => (
    <span className="fila-asa-alto" role="separator" aria-orientation="horizontal" aria-label={`Cambiar el alto de la fila ${item.nombre}`} title="Arrastra para cambiar el alto (doble clic: el de siempre)"
      onDoubleClick={() => setAltos((a) => { const n = { ...a }; delete n[item.id]; return n; })}
      onPointerDown={(e) => {
        e.preventDefault();
        const fila = e.currentTarget.closest("tr") as HTMLElement;
        const y0 = e.clientY;
        const h0 = fila.getBoundingClientRect().height;
        const mover = (ev: PointerEvent) => setAltos((a) => ({ ...a, [item.id]: Math.min(600, Math.max(28, Math.round(h0 + ev.clientY - y0))) }));
        const soltar = () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); document.body.classList.remove("redimensionando-alto"); };
        document.body.classList.add("redimensionando-alto");
        window.addEventListener("pointermove", mover);
        window.addEventListener("pointerup", soltar);
      }} />
  );
  const ancho = (col: string, base: number): CSSProperties => {
    const w = anchos[col];
    return w ? { width: w, minWidth: w, maxWidth: w } : { minWidth: base };
  };
  const Asa = ({ col }: { col: string }) => (
    <span className="th-asa" role="separator" aria-orientation="vertical" aria-label="Cambiar el ancho de la columna" title="Arrastra para cambiar el ancho"
      draggable={false} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
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
        <div className="segmentado segmentado--chico" role="radiogroup" aria-label="Alto de las filas">
          {(["Compacto", "Normal", "Amplio"] as const).map((x, n) => (
            <button key={x} type="button" role="radio" aria-checked={nivel === x.toLowerCase()} className={nivel === x.toLowerCase() ? "activo" : undefined}
              onClick={() => setDensidad(() => ({ n }))}>{x}</button>
          ))}
        </div>
        {Object.keys(altos).length > 0 && <button className="boton boton--chico" onClick={() => setAltos(() => ({}))}>Igualar filas</button>}
        {estructura && <ColumnasEnSubitems t={t} cambiar={cambiar} />}
        {orden && <button className="boton boton--chico" onClick={() => setOrden(null)}>Quitar orden</button>}
      </div>
      {secciones.map((g) => {
        const suyos = ordenar(g.items);
        const plegado = plegados.has(g.id);
        const real = g.real && agrupar === "GRUPO";
        const todos = estructura && suyos.length > 0 && suyos.every((i) => sel.has(i.id));
        return (
          <section key={g.id} className="tablero-grupo" style={{ borderLeftColor: g.color }} aria-label={`Grupo ${g.nombre}`}>
            <header className="fila" style={{ gap: 8, marginBottom: 6 }}>
              <button className="boton-icono" aria-label={plegado ? `Mostrar ${g.nombre}` : `Ocultar ${g.nombre}`} aria-expanded={!plegado} onClick={() => setPlegados(alternar(plegados, g.id))} style={{ color: g.color }}>
                <LuChevronDown size={16} style={{ transform: plegado ? "rotate(-90deg)" : undefined }} />
              </button>
              <span className="tablero-grupo-nombre" style={{ color: g.color }}>
                {real ? <Texto valor={g.nombre} editable={estructura} etiqueta={`Nombre del grupo ${g.nombre}`} guardar={(nombre) => void cambiar(`/grupos/${g.id}`, "PATCH", { nombre })} /> : <span style={{ padding: "4px 6px" }}>{g.nombre}</span>}
              </span>
              <span className="texto-xs texto-muted">{suyos.length} {suyos.length === 1 ? "ítem" : "ítems"}</span>
              {estructura && real && (
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
                <table className={`tabla tabla-tablero tabla-tablero--${nivel}`}>
                  <thead>
                    <tr>
                      <th style={{ width: 76 }}>
                        {estructura && <input type="checkbox" aria-label={`Elegir todos los ítems de ${g.nombre}`} checked={todos}
                          onChange={(e) => setSel((s) => { const n = new Set(s); for (const i of suyos) (e.target.checked ? n.add(i.id) : n.delete(i.id)); return n; })} />}
                      </th>
                      <Th col="nombre" base={280}>Ítem</Th>
                      <Th col="responsable" base={170}>Responsable</Th>
                      <Th col="estado" base={150}>Estado</Th>
                      <Th col="prioridad" base={110}>Prioridad</Th>
                      <Th col="fecha" base={140}>Fecha límite</Th>
                      <th style={ancho("notas", 180)} className="th-redimensionable">Descripción<Asa col="notas" /></th>
                      {enOrden.map((c) => (
                        <th key={c.id} style={ancho(c.id, c.tipo === "long_text" || c.tipo === "doc" || c.tipo === "people" ? 160 : 120)}
                          className={`th-redimensionable${sobreCol === c.id && arrastrandoCol !== c.id ? " th-soltar" : ""}${arrastrandoCol === c.id ? " th-arrastrando" : ""}`} title={info(c.tipo)?.nombre ?? c.tipo}
                          draggable={estructura && c.tipo !== "last_updated"}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; setArrastrandoCol(c.id); }}
                          onDragEnd={() => { setArrastrandoCol(null); setSobreCol(null); }}
                          onDragOver={(e) => { if (arrastrandoCol && arrastrandoCol !== c.id) { e.preventDefault(); setSobreCol(c.id); } }}
                          onDrop={(e) => { e.preventDefault(); const id = arrastrandoCol; setArrastrandoCol(null); setSobreCol(null); if (id && id !== c.id) void cambiar(`/columnas/${id}`, "PATCH", { antesDe: c.id }); }}
                          onContextMenu={estructura ? (e) => { e.preventDefault(); setMenuCol({ x: e.clientX, y: e.clientY, col: c }); } : undefined}>
                          {estructura
                            ? <button type="button" className="boton-texto" style={{ font: "inherit", color: "inherit", textTransform: "inherit", letterSpacing: "inherit" }} aria-label={`Configurar la columna ${c.nombre}`} onClick={() => setConfigurando(c)}>{c.nombre}</button>
                            : c.nombre}
                          <Asa col={c.id} />
                        </th>
                      ))}
                      {estructura && <th style={{ width: 36 }}><button className="boton-icono" aria-label="Agregar columna" title="Agregar columna" onClick={() => setBiblioteca({})}
                        onDragOver={(e) => { if (arrastrandoCol) { e.preventDefault(); setSobreCol("__fin"); } }}
                        onDrop={(e) => { e.preventDefault(); const id = arrastrandoCol; setArrastrandoCol(null); setSobreCol(null); if (id) void cambiar(`/columnas/${id}`, "PATCH", { antesDe: null }); }}><LuPlus size={14} /></button></th>}
                      {estructura && <th style={{ width: 36 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {suyos.map((i) => {
                      const abierto = abiertos.has(i.id);
                      return [
                        <tr key={i.id} className={[sel.has(i.id) ? "fila-elegida" : "", sobre === i.id ? "fila-soltar" : "", arrastrado === i.id ? "fila-arrastrada" : ""].filter(Boolean).join(" ") || undefined}
                          style={altos[i.id] ? { height: altos[i.id] } : undefined}
                          onDragOver={real && arrastrable ? sobreEn(i.id) : undefined} onDrop={real && arrastrable ? soltarEn(g.id, i.id) : undefined}>
                          <td>
                            <AsaAlto item={i} />
                            <span className="fila" style={{ gap: 2 }}>
                              {real && arrastrable && (
                                <span className="asa-fila" draggable role="button" tabIndex={-1} aria-label={`Arrastrar ${i.nombre}`} title="Arrastrar para mover"
                                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", i.id); e.dataTransfer.effectAllowed = "move"; const fila = e.currentTarget.closest("tr"); if (fila) e.dataTransfer.setDragImage(fila, 20, 20); setArrastrado(i.id); }}
                                  onDragEnd={() => { setArrastrado(null); setSobre(null); }}>
                                  <LuGripVertical size={14} />
                                </span>
                              )}
                              {estructura && <input type="checkbox" aria-label={`Elegir ${i.nombre}`} checked={sel.has(i.id)} onChange={() => setSel((s) => alternar(s, i.id))} />}
                              <button className="boton-icono" aria-label={abierto ? `Ocultar subítems de ${i.nombre}` : `Ver subítems de ${i.nombre}`} aria-expanded={abierto} onClick={() => setAbiertos(alternar(abiertos, i.id))}>
                                <LuChevronRight size={14} style={{ transform: abierto ? "rotate(90deg)" : undefined }} />
                              </button>
                            </span>
                          </td>
                          <td>
                            <span className="fila" style={{ gap: 6 }}>
                              <Texto valor={i.nombre} editable={editable} etiqueta={`Nombre de ${i.nombre}`} guardar={(nombre) => void item(i, { nombre })} />
                              {i.subitems.length > 0 && <span className="contador-sub">{i.subitems.length}</span>}
                              <button className={`boton-conversacion${conteo[i.id] ? " boton-conversacion--con" : ""}${nuevos.has(i.id) ? " boton-conversacion--nuevo" : ""}`}
                                aria-label={`Abrir ${i.nombre}${conteo[i.id] ? ` (${conteo[i.id]} actualizaciones${nuevos.has(i.id) ? ", hay nuevas" : ""})` : ""}`}
                                title={ultimas[i.id] ? `${ultimas[i.id].autor}: ${ultimas[i.id].texto}` : "Actualizaciones, archivos e historial"} onClick={() => abrir(i)}>
                                <LuMessageSquare size={14} />{conteo[i.id] ? <span>{conteo[i.id]}</span> : null}
                              </button>
                            </span>
                          </td>
                          <td><Persona t={t} valor={i.responsable} editable={editable} etiqueta={`Responsable de ${i.nombre}`} guardar={(responsableId) => void item(i, { responsableId })} /></td>
                          <td><Pildora valor={i.estado as EstadoItem} opciones={ESTADOS_ITEM} color={(v) => COLOR_ESTADO[v]} editable={editable} etiqueta={`Estado de ${i.nombre}`} guardar={(estado) => void item(i, { estado })} /></td>
                          <td><Pildora valor={i.prioridad as PrioridadItem} opciones={PRIORIDADES_ITEM} color={(v) => COLOR_PRIORIDAD[v]} editable={editable} etiqueta={`Prioridad de ${i.nombre}`} guardar={(prioridad) => void item(i, { prioridad })} /></td>
                          <td><Fecha valor={i.fecha ?? null} vencido={i.vencido} editable={editable} etiqueta={`Fecha límite de ${i.nombre}`} guardar={(fecha) => void item(i, { fecha })} /></td>
                          <td><Texto valor={i.notas} editable={editable} etiqueta={`Descripción de ${i.nombre}`} placeholder="Agregar" guardar={(notas) => void item(i, { notas })} /></td>
                          {enOrden.map((c) => (
                            <td key={c.id}><CeldaColumna t={t} col={c} item={i} cambiar={cambiar} editable={editable} /></td>
                          ))}
                          {estructura && <td />}
                          {estructura && <td><button className="boton-icono" aria-label={`Borrar ${i.nombre}`} onClick={() => borrarItem(i)}><LuTrash2 size={13} /></button></td>}
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
                                  {/* 20 nov (Alonso): la descripción y las columnas habilitadas para los subítems. */}
                                  <td><Texto valor={s.notas ?? ""} editable={editable} etiqueta={`Descripción de ${s.nombre}`} placeholder="Agregar" guardar={(notas) => void cambiar(`/items/${i.id}/subitems/${s.id}`, "PATCH", { notas })} /></td>
                                  {enOrden.map((c) => (
                                    <td key={c.id}>
                                      {(t.columnasSubitems ?? []).includes(c.id) && (
                                        <CeldaColumna t={t} col={c} editable={editable} cambiar={cambiar} rutaValores={`/items/${i.id}/subitems/${s.id}`}
                                          item={{ ...i, id: s.id, nombre: s.nombre, valores: (s.valores ?? {}) as Record<string, string | number>, datos: s.datos ?? {}, subitems: [] }} />
                                      )}
                                    </td>
                                  ))}
                                  {estructura && <td />}
                                  {estructura && <td><button className="boton-icono" aria-label={`Borrar el subítem ${s.nombre}`} onClick={async () => (await confirmar(`¿Borrar el subítem «${s.nombre}»? Queda 30 días en la papelera del tablero.`)) && void cambiar(`/items/${i.id}/subitems/${s.id}`, "DELETE")}><LuTrash2 size={13} /></button></td>}
                                </tr>
                              )),
                              ...(editable ? [<FilaNueva key={`${i.id}-nuevo`} columnas={columnas} sangria etiqueta={`Nuevo subítem en ${i.nombre}`} texto="+ Agregar subítem" crear={(nombre) => cambiar(`/items/${i.id}/subitems`, "POST", { nombre })} />] : []),
                            ]
                          : []),
                      ];
                    })}
                    {editable && real && arrastrado && (
                      <tr className={`fila-soltar-fin${sobre === `fin:${g.id}` ? " fila-soltar" : ""}`} onDragOver={sobreEn(`fin:${g.id}`)} onDrop={soltarEn(g.id, null)}>
                        <td colSpan={columnas + 1} className="texto-xs texto-muted">Soltar al final de {g.nombre}</td>
                      </tr>
                    )}
                    {editable && real && <FilaNueva columnas={columnas} etiqueta={`Nuevo ítem en ${g.nombre}`} texto="+ Agregar ítem" crear={(nombre) => cambiar("/items", "POST", { nombre, grupoId: g.id })} />}
                    {suyos.length > 0 && (
                      <tr className="fila-pie" aria-label={`Totales de ${g.nombre}`}>
                        <td />
                        <td><span className="texto-xs negrita">{suyos.length} {suyos.length === 1 ? "ítem" : "ítems"}</span></td>
                        <td />
                        <td><BarraReparto valores={suyos.map((i) => i.estado)} colores={COLOR_ESTADO as Record<string, string>} etiqueta="Estados" /></td>
                        <td><BarraReparto valores={suyos.map((i) => i.prioridad ?? "")} colores={COLOR_PRIORIDAD as Record<string, string>} etiqueta="Prioridades" /></td>
                        <td>{(() => { const n = suyos.filter((i) => i.vencido).length; return n ? <span className="texto-xs" style={{ color: "var(--c-semaforo-rojo-intenso)" }}>{n} {n === 1 ? "vencido" : "vencidos"}</span> : null; })()}</td>
                        <td />
                        {enOrden.map((c) => <td key={c.id}><PieNumeros col={c} items={suyos} /></td>)}
                        {estructura && <td colSpan={2} />}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
      {estructura && agrupar === "GRUPO" && (
        <button className="boton boton--chico" style={{ justifySelf: "start" }} onClick={() => void nuevoGrupo()}>
          <LuPlus size={14} /> Nuevo grupo
        </button>
      )}
      {elegidos.length > 0 && <BarraLote t={t} ids={elegidos} cambiar={cambiar} limpiar={() => setSel(new Set())} />}
      {biblioteca && <BibliotecaColumnas t={t} cambiar={cambiar} antesDe={biblioteca.antesDe} cerrar={() => setBiblioteca(false)} />}
      {menuCol && <MenuColumna x={menuCol.x} y={menuCol.y} col={menuCol.col} columnas={enOrden} cerrar={() => setMenuCol(null)}
        configurar={() => setConfigurando(menuCol.col)} agregar={(antesDe) => setBiblioteca({ antesDe })} mover={(antesDe) => void cambiar(`/columnas/${menuCol.col.id}`, "PATCH", { antesDe })} />}
      {configurando && <ConfigurarColumna t={t} col={configurando} cambiar={cambiar} cerrar={() => setConfigurando(null)} />}
    </div>
  );
}

// ───────────────────────────── anchos de columna (13 nov): por tablero, en este navegador

function useAnchos(tableroId: string, tipo = "anchos"): [Record<string, number>, (f: (a: Record<string, number>) => Record<string, number>) => void] {
  const clave = `inoo.${tipo}.${tableroId}`;
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
      <button className="boton boton--chico boton--peligro" onClick={async () => (await confirmar(`¿Borrar ${ids.length} ítem${ids.length === 1 ? "" : "s"}? También se borran en InooWork.`)) && void lote({ borrar: true })}><LuTrash2 size={13} /> Borrar</button>
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
  const pegar = async (e: ClipboardEvent<HTMLInputElement>) => {
    const lineas = e.clipboardData.getData("text").split(/\r?\n/).map((x) => x.split("\t")[0].trim()).filter(Boolean);
    if (lineas.length < 2) return;
    e.preventDefault();
    if (lineas.length > 100) return void window.alert("Pega hasta 100 líneas a la vez.");
    if ((await confirmar(`¿Crear ${lineas.length} ítems, uno por línea?`))) void enviar(lineas);
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

function VistaKanban({ t, items, cambiar, editable, abrir, conteo, nuevos }: Ctx) {
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
            <header className="kanban-cabecera" style={{ ...fondoConTexto(COLOR_ESTADO[estado]) }}>{estado} <span>{suyos.length}</span></header>
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
                  <span className="pildora pildora--chica" style={{ ...fondoConTexto(COLOR_PRIORIDAD[i.prioridad as PrioridadItem]) }}>{i.prioridad}</span>
                  {i.subitems.length > 0 && <span className="texto-xs texto-muted">{i.subitems.filter((s) => s.estado === "Completado").length}/{i.subitems.length} subítems</span>}
                  {conteo[i.id] ? <span className={`texto-xs fila${nuevos.has(i.id) ? " boton-conversacion--nuevo" : " texto-muted"}`} style={{ gap: 3 }}><LuMessageSquare size={11} /> {conteo[i.id]}</span> : null}
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

const masDiasT = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const hoyT = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

/** 13 nov: «Resumen» (antes «Gráfico»), como un dashboard de Monday: cifras clave y cómo se reparte el trabajo. */
function VistaGrafico({ items }: { items: Item[] }) {
  const hoy = hoyT();
  const abiertos = items.filter((i) => i.estado !== "Completado");
  const completados = items.length - abiertos.length;
  const cifras: [string, number | string, string?][] = [
    ["Ítems", items.length],
    ["Completados", items.length ? `${Math.round((completados / items.length) * 100)} %` : "—", `${completados} de ${items.length}`],
    ["Vencidos", abiertos.filter((i) => i.vencido).length],
    ["Vencen esta semana", abiertos.filter((i) => i.fecha && i.fecha >= hoy && i.fecha <= masDiasT(hoy, 7)).length],
    ["Sin responsable", abiertos.filter((i) => !i.responsable).length],
  ];
  const porEstado = ESTADOS_ITEM.map((e) => ({ nombre: e, n: items.filter((i) => i.estado === e).length, color: COLOR_ESTADO[e] }));
  const porPrioridad = PRIORIDADES_ITEM.map((x) => ({ nombre: x, n: abiertos.filter((i) => i.prioridad === x).length, color: COLOR_PRIORIDAD[x] }));
  const personas = new Map<string, number>();
  for (const i of abiertos) personas.set(i.responsable?.nombre ?? "Sin asignar", (personas.get(i.responsable?.nombre ?? "Sin asignar") ?? 0) + 1);
  const porPersona = [...personas.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, n]) => ({ nombre, n, color: "var(--c-primario)" }));
  return (
    <div className="pila" style={{ gap: 16 }}>
      <div className="resumen-cifras">
        {cifras.map(([t, v, sub]) => (
          <div key={t} className="tarjeta resumen-cifra">
            <span className="texto-xs texto-muted">{t}</span>
            <strong>{v}</strong>
            {sub && <span className="texto-xs texto-muted">{sub}</span>}
          </div>
        ))}
      </div>
      <div className="grid-2" style={{ gap: 16 }}>
        <Barras titulo="Ítems por estado" filas={porEstado} />
        <Barras titulo="Abiertos por persona" filas={porPersona} />
        <Barras titulo="Abiertos por prioridad" filas={porPrioridad} />
      </div>
    </div>
  );
}

/**
 * 13 nov: «Carga» (como la vista Workload de Monday): lo abierto de cada persona del tablero, separado en vencido,
 * esta semana, más adelante y sin fecha. Sirve para ver a quién se le está cargando el trabajo.
 */
function VistaCarga({ t, items }: { t: Tablero; items: Item[] }) {
  const hoy = hoyT();
  const semana = masDiasT(hoy, 7);
  const tramos = [
    { clave: "vencido", nombre: "Vencido", color: "var(--c-semaforo-rojo)", es: (i: Item) => !!i.vencido },
    { clave: "semana", nombre: "Esta semana", color: "var(--c-primario)", es: (i: Item) => !i.vencido && !!i.fecha && i.fecha <= semana },
    { clave: "despues", nombre: "Más adelante", color: "var(--c-marca-morado-suave)", es: (i: Item) => !i.vencido && !!i.fecha && i.fecha > semana },
    { clave: "sin", nombre: "Sin fecha", color: "var(--c-borde-fuerte)", es: (i: Item) => !i.fecha },
  ];
  const abiertos = items.filter((i) => i.estado !== "Completado");
  const filas = [...t.personas.map((p) => ({ id: p.id, nombre: p.nombre })), { id: "", nombre: "Sin asignar" }]
    .map((p) => {
      const suyos = abiertos.filter((i) => (i.responsable?.id ?? "") === p.id);
      return { ...p, total: suyos.length, tramos: tramos.map((x) => suyos.filter(x.es).length) };
    })
    .filter((f) => f.total > 0 || f.id)
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <section className="tarjeta" style={{ padding: 16 }} aria-label="Carga de trabajo">
      <div className="fila entre" style={{ gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 className="tarjeta-titulo" style={{ fontSize: "var(--t-base)" }}>Carga de trabajo (ítems abiertos)</h3>
        <span className="fila texto-xs" style={{ gap: 12, flexWrap: "wrap" }}>
          {tramos.map((x) => <span key={x.clave} className="fila" style={{ gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: x.color }} />{x.nombre}</span>)}
        </span>
      </div>
      <div className="pila" style={{ gap: 10 }}>
        {filas.map((f) => (
          <div key={f.id || "sin"} className="grafico-fila" aria-label={`${f.nombre}: ${f.total} abiertos, ${f.tramos[0]} vencidos`}>
            <span className="texto-xs">{f.nombre}</span>
            <span className="grafico-pista" style={{ display: "flex" }}>
              {f.tramos.map((n, k) => n > 0 && <span key={k} title={`${tramos[k].nombre}: ${n}`} style={{ width: `${(n / max) * 100}%`, background: tramos[k].color, borderRadius: 0 }} />)}
            </span>
            <span className="texto-xs negrita" style={{ width: 24, textAlign: "right" }}>{f.total}</span>
          </div>
        ))}
      </div>
    </section>
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

/** 25 nov: guarda la estructura de este tablero como plantilla del equipo. */
function GuardarPlantilla({ t, cerrar }: { t: Tablero; cerrar: () => void }) {
  const avisar = useAviso();
  const [nombre, setNombre] = useState(t.nombre);
  const [descripcion, setDescripcion] = useState("");
  const [conItems, setConItems] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  const guardar = async () => {
    setErr({});
    setOcupado(true);
    try {
      await api("/plantillas-tablero", { metodo: "POST", cuerpo: { tableroId: t.id, nombre, descripcion: descripcion || null, conItems } });
      avisar({ titulo: "Plantilla guardada", texto: "Ya aparece en «Nuevo proyecto» para todo el equipo." });
      cerrar();
    } catch (e) {
      if (e instanceof ProblemaApi && e.errores.length) setErr(Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])));
      else avisar({ titulo: "No se pudo guardar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal abierto alCerrar={cerrar} etiqueta="Guardar como plantilla" ancho={480}>
      <div className="pila" style={{ gap: 12 }}>
        <h2 className="modal-titulo">Guardar como plantilla</h2>
        <p className="texto-sm texto-muted">Se guardan sus {t.grupos.length} grupos y sus columnas propias. Los proyectos nuevos pueden arrancar desde ella.</p>
        <div className="campo">
          <label htmlFor="pl-nombre">Nombre</label>
          <div className="entrada"><input id="pl-nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} /></div>
          {err.nombre && <p className="texto-xs texto-alerta">{err.nombre}</p>}
        </div>
        <div className="campo">
          <label htmlFor="pl-desc">Para qué sirve <span className="texto-muted">(opcional)</span></label>
          <textarea id="pl-desc" className="input" rows={2} maxLength={300} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <label className="fila texto-sm" style={{ gap: 8 }}>
          <input type="checkbox" checked={conItems} onChange={(e) => setConItems(e.target.checked)} /> Incluir sus {t.items.length} ítems como ejemplo (solo los nombres, sin responsables ni fechas)
        </label>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={cerrar}>Cancelar</button>
          <button type="button" className="boton boton--primario" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar plantilla"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── menú de una columna (25 nov, Ernesto: clic derecho → agregar a los lados)

/**
 * Clic derecho (o la tecla de menú / Shift+F10) sobre el encabezado de una columna: agregar otra a su izquierda o a su
 * derecha, moverla un lugar (la alternativa con teclado a arrastrar) o configurarla.
 */
function MenuColumna({ x, y, col, columnas, cerrar, configurar, agregar, mover }: {
  x: number; y: number; col: Tablero["columnas"][number]; columnas: Tablero["columnas"]; cerrar: () => void;
  configurar: () => void; agregar: (antesDe: string | null) => void; mover: (antesDe: string | null) => void;
}) {
  const caja = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const fuera = (e: Event) => { if (!caja.current?.contains(e.target as Node)) cerrar(); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", esc);
    caja.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.removeEventListener("pointerdown", fuera); document.removeEventListener("keydown", esc); };
  }, [cerrar]);
  const movibles = columnas.filter((c) => c.tipo !== "last_updated");
  const i = movibles.findIndex((c) => c.id === col.id);
  const siguiente = (n: number) => movibles[n]?.id ?? null;
  const fija = col.tipo === "last_updated";
  const hacer = (f: () => void) => () => { cerrar(); f(); };
  return (
    <span ref={caja} className="arbol-menu-caja" role="menu" aria-label={`Columna ${col.nombre}`}
      style={{ top: Math.min(y, window.innerHeight - 220), left: Math.min(x, window.innerWidth - 220) }}>
      <button type="button" role="menuitem" onClick={hacer(() => agregar(fija ? null : col.id))} disabled={fija}><LuArrowLeft size={14} /> Agregar columna a la izquierda</button>
      <button type="button" role="menuitem" onClick={hacer(() => agregar(fija ? col.id : siguiente(i + 1)))}><LuArrowRight size={14} /> Agregar columna a la derecha</button>
      {!fija && <button type="button" role="menuitem" disabled={i <= 0} onClick={hacer(() => mover(siguiente(i - 1)))}><LuChevronLeft size={14} /> Mover a la izquierda</button>}
      {!fija && <button type="button" role="menuitem" disabled={i >= movibles.length - 1} onClick={hacer(() => mover(siguiente(i + 2)))}><LuChevronRight size={14} /> Mover a la derecha</button>}
      <button type="button" role="menuitem" onClick={hacer(configurar)}><LuPencil size={14} /> Configurar</button>
    </span>
  );
}

// ───────────────────────────── «Para el cliente» (25 nov, fusión de proyectos y servicios)

/**
 * La parte del cliente de un proyecto: si ya se compartió, el servicio con sus etapas, formularios y entregables; si no,
 * el botón para compartirlo (se elige el tipo de servicio y se crea ya vinculado al tablero). El cliente no ve nada del
 * proyecto hasta que se comparte.
 */
function ParaElCliente({ t, cambiar }: { t: Tablero; cambiar: (ruta: string, metodo: "PATCH", cuerpo: Record<string, unknown>) => Promise<boolean> }) {
  const avisar = useAviso();
  const [compartiendo, setCompartiendo] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("compartir") === "1");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("compartir") === "1") setCompartiendo(true);
  }, []);
  const interno = !t.cliente || esClienteInterno(t.cliente);
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>(!t.servicioId && !interno ? "/clientes?limite=100" : null);
  if (t.servicioId) return <ProyectoEquipo id={t.servicioId} incrustado />;
  const ficha = (clientes.datos?.datos ?? []).find((c) => claveCliente(c.nombre) === claveCliente(t.cliente ?? ""));
  return (
    <section className="tarjeta vacio" style={{ display: "grid", gap: 10, justifyItems: "start", textAlign: "left" }}>
      {interno ? (
        <>
          <p className="negrita">{t.cliente ? "Es un proyecto interno de Inoo" : "Este proyecto no tiene cliente"}</p>
          <p className="texto-sm texto-muted">{t.cliente ? "No tiene parte para el cliente." : "Ponle un cliente en «Datos del proyecto» para poder compartirlo con él."}</p>
        </>
      ) : (
        <>
          <p className="negrita">{t.cliente} todavía no ve este proyecto</p>
          <p className="texto-sm texto-muted" style={{ maxWidth: 620 }}>
            Al compartirlo eliges el tipo de servicio (Branding, Web, CRM…). El cliente ve en su portal las etapas, los entregables y lo que le
            pedimos, y le llegan los formularios del servicio. El tablero sigue siendo solo del equipo.
          </p>
          {clientes.datos && !ficha && <p className="texto-sm">«{t.cliente}» no tiene ficha de cliente en el portal: créala en Clientes para poder compartirlo.</p>}
          {t.puedeEditar && ficha && <button type="button" className="boton boton--primario" onClick={() => setCompartiendo(true)}>Compartir con el cliente</button>}
        </>
      )}
      {compartiendo && ficha && (
        <NuevoServicio clienteId={ficha.id} tableroId={t.id} abierto
          cabecera={<h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Compartir «{t.nombre}» con {ficha.nombre}</h2>}
          alCerrar={() => setCompartiendo(false)}
          alCrear={(s) => { if (s.servicioContratadoId) void cambiar("", "PATCH", { servicioId: s.servicioContratadoId }).then((ok) => { if (!ok) avisar({ titulo: "Se creó el servicio, pero no se pudo vincular", texto: "Vincúlalo en «Datos del proyecto → Servicio del cliente». No lo crees de nuevo." }); }); }} />
      )}
    </section>
  );
}
