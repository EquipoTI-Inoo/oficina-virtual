"use client";
/**
 * Carpetas de Proyectos (17 nov 2026, Ernesto: «carpetas por empresa, con las marcas en subcarpetas»), como en Monday:
 * Empresa → Marca → Carpeta → Subcarpeta → Proyectos. El árbol de la izquierda navega y recibe proyectos arrastrados; la
 * vista «Carpetas» muestra el contenido como un explorador. Además, los filtros de Proyectos (persona, área, estado,
 * vencidos, privados, servicio y actividad), que sirven en las dos vistas.
 */
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { LuBuilding2, LuChevronRight, LuFolder, LuFolderPlus, LuLock, LuPencil, LuPlus, LuTag, LuTrash2, LuX } from "react-icons/lu";
import { Enlace, type S } from "../base";
import { claveEmpresa } from "../dominio/carpetas";
import { Barra, Modal } from "../componentes";

export type Tablero = S<"TableroResumen">;
export type Carpeta = S<"CarpetaProyecto">;
export type Marca = S<"MarcaCliente">;

// ───────────────────────────── dónde está cada cosa

/** Un lugar del árbol. marca «__sin»: los de la empresa sin marca (solo en la vista por estado). */
export interface Lugar { empresa: string | null; marca: string | null; carpeta: string | null }
export const RAIZ: Lugar = { empresa: null, marca: null, carpeta: null };

interface Ubicacion { empresa: string; empresaNombre: string; marca: string | null; carpeta: Carpeta | null }
/** Dónde queda un proyecto (o un servicio): su empresa, y su carpeta si es de esa empresa (manda sobre la marca). */
export function ubicar(x: { cliente: string | null; marcaId: string | null; carpetaId?: string | null }, carpetas: Carpeta[]): Ubicacion {
  const empresa = claveEmpresa(x.cliente);
  const carpeta = x.carpetaId ? carpetas.find((c) => c.id === x.carpetaId && c.empresaClave === empresa) ?? null : null;
  return { empresa, empresaNombre: x.cliente ?? "Sin cliente", marca: carpeta ? carpeta.marcaId : x.marcaId, carpeta };
}

/** ¿Está en ese lugar (o más adentro)? */
export function estaEn(u: Ubicacion, l: Lugar): boolean {
  if (!l.empresa) return true;
  if (u.empresa !== l.empresa) return false;
  if (l.marca === "__sin") return !u.marca;
  if (l.marca && u.marca !== l.marca) return false;
  if (l.carpeta) return !!u.carpeta && (u.carpeta.id === l.carpeta || u.carpeta.padreId === l.carpeta);
  return true;
}

// ───────────────────────────── el árbol

export interface NodoCarpeta { carpeta: Carpeta; n: number; hijos: NodoCarpeta[] }
export interface NodoMarca { id: string; nombre: string; n: number; carpetas: NodoCarpeta[] }
export interface NodoEmpresa { clave: string; nombre: string; total: number; sinMarca: number; marcas: NodoMarca[]; carpetas: NodoCarpeta[] }

export function construirArbol(xs: { cliente: string | null; marcaId: string | null; carpetaId?: string | null }[], marcas: Marca[], carpetas: Carpeta[], conCarpetas: boolean): NodoEmpresa[] {
  const us = xs.map((x) => ubicar(x, conCarpetas ? carpetas : []));
  const nombres = new Map<string, string>();
  for (const u of us) if (!nombres.has(u.empresa)) nombres.set(u.empresa, u.empresaNombre === "Inoo (interno)" ? "Inoo" : u.empresaNombre);
  if (conCarpetas) for (const c of carpetas) if (!nombres.has(c.empresaClave)) nombres.set(c.empresaClave, c.empresa);
  const nodos = (padre: string | null, empresa: string, marca: string | null): NodoCarpeta[] => (conCarpetas ? carpetas : [])
    .filter((c) => c.empresaClave === empresa && c.padreId === padre && (padre ? true : c.marcaId === marca))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((c) => {
      const hijos = nodos(c.id, empresa, marca);
      return { carpeta: c, hijos, n: us.filter((u) => u.carpeta && (u.carpeta.id === c.id || u.carpeta.padreId === c.id)).length };
    });
  return [...nombres.entries()].map(([clave, nombre]) => {
    const deEsta = us.filter((u) => u.empresa === clave);
    const ms = marcas.filter((m) => claveEmpresa(m.clienteNombre) === clave && (m.activa || deEsta.some((u) => u.marca === m.id)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .map((m) => ({ id: m.id, nombre: m.nombre, n: deEsta.filter((u) => u.marca === m.id).length, carpetas: nodos(null, clave, m.id) }));
    return { clave, nombre, total: deEsta.length, sinMarca: deEsta.filter((u) => !u.marca).length, marcas: ms, carpetas: nodos(null, clave, null) };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Para arrastrar un proyecto: la empresa del lugar y qué cambiar en el proyecto. */
export function destinoDe(l: Lugar): { empresa: string; cambio: Record<string, unknown> } | null {
  if (!l.empresa) return null;
  if (l.carpeta) return { empresa: l.empresa, cambio: { carpetaId: l.carpeta } };
  if (l.marca && l.marca !== "__sin") return { empresa: l.empresa, cambio: { marcaId: l.marca, carpetaId: null } };
  return { empresa: l.empresa, cambio: { marcaId: null, carpetaId: null } };
}

const TIPO_ARRASTRE = "application/x-inoo-tablero";
const recibir = (alSoltar: ((tableroId: string, l: Lugar) => void) | undefined, l: Lugar, set: (x: string | null) => void, clave: string) => alSoltar ? {
  onDragOver: (e: DragEvent) => { if (e.dataTransfer.types.includes(TIPO_ARRASTRE)) { e.preventDefault(); set(clave); } },
  onDragLeave: () => set(null),
  onDrop: (e: DragEvent) => { const id = e.dataTransfer.getData(TIPO_ARRASTRE); set(null); if (id) { e.preventDefault(); alSoltar(id, l); } },
} : {};

/** El árbol de la izquierda: navegar y soltar proyectos. */
export function ArbolProyectos({ arbol, lugar, ir, alSoltar, etiqueta }: { arbol: NodoEmpresa[]; lugar: Lugar; ir: (l: Lugar) => void; alSoltar?: (tableroId: string, l: Lugar) => void; etiqueta: string }) {
  const [sobre, setSobre] = useState<string | null>(null);
  const item = (clave: string, l: Lugar, actual: boolean, contenido: ReactNode, n: number, clase = "", expandida?: boolean) => (
    <button key={clave} type="button" className={`arbol-item ${clase}${sobre === clave ? " arbol-item--soltar" : ""}`} aria-current={actual || undefined} aria-expanded={expandida}
      onClick={() => ir(l)} {...recibir(alSoltar, l, setSobre, clave)}>
      {contenido}<span className="arbol-n">{n}</span>
    </button>
  );
  const carpetas = (e: NodoEmpresa, marca: string | null, xs: NodoCarpeta[], nivel: number): ReactNode => xs.map((c) => {
    const abierta = lugar.carpeta === c.carpeta.id || c.hijos.some((h) => h.carpeta.id === lugar.carpeta);
    return (
      <div key={c.carpeta.id}>
        {item(c.carpeta.id, { empresa: e.clave, marca, carpeta: c.carpeta.id }, lugar.carpeta === c.carpeta.id,
          <span className="fila" style={{ gap: 6, minWidth: 0 }}><LuFolder size={13} style={{ flex: "none" }} /><span className="recortar">{c.carpeta.nombre}</span></span>, c.n, `arbol-item--hijo arbol-nivel-${nivel}`, c.hijos.length ? abierta : undefined)}
        {abierta && carpetas(e, marca, c.hijos, nivel + 1)}
      </div>
    );
  });
  return (
    <nav className="arbol-empresas" aria-label={etiqueta}>
      {item("__todas", RAIZ, !lugar.empresa, <span>Todas las empresas</span>, arbol.reduce((n, e) => n + e.total, 0))}
      {arbol.map((e) => {
        const abierta = lugar.empresa === e.clave;
        return (
          <div key={e.clave}>
            {item(e.clave, { empresa: e.clave, marca: null, carpeta: null }, abierta && !lugar.marca && !lugar.carpeta,
              <span className="fila" style={{ gap: 6, minWidth: 0 }}><LuBuilding2 size={14} style={{ flex: "none" }} /><span className="recortar">{e.nombre}</span></span>, e.total, "", abierta)}
            {abierta && (
              <div className="arbol-hijos">
                {carpetas(e, null, e.carpetas, 1)}
                {e.marcas.map((m) => {
                  const enMarca = lugar.marca === m.id;
                  return (
                    <div key={m.id}>
                      {item(m.id, { empresa: e.clave, marca: m.id, carpeta: null }, enMarca && !lugar.carpeta,
                        <span className="recortar">{m.nombre}</span>, m.n, "arbol-item--hijo", m.carpetas.length ? enMarca : undefined)}
                      {enMarca && carpetas(e, m.id, m.carpetas, 2)}
                    </div>
                  );
                })}
                {e.marcas.length > 0 && e.sinMarca > 0 && !alSoltar &&
                  item(`${e.clave}__sin`, { empresa: e.clave, marca: "__sin", carpeta: null }, lugar.marca === "__sin", <span className="texto-muted">Sin marca</span>, e.sinMarca, "arbol-item--hijo")}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ───────────────────────────── la vista «Carpetas» (un explorador)

type Orden = "nombre" | "estado" | "lider" | "avance" | "vencidos" | "actividad";
const pct = (t: Tablero) => (t.items.total ? Math.round((t.items.completados / t.items.total) * 100) : 0);
const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "—");

export function VistaCarpetas({ arbol, lugar, ir, tableros, carpetas, marcas, plano, alSoltar, crearCarpeta, renombrar, borrar, nuevoProyecto }: {
  arbol: NodoEmpresa[]; lugar: Lugar; ir: (l: Lugar) => void; tableros: Tablero[]; carpetas: Carpeta[]; marcas: Marca[];
  /** Con búsqueda o filtros: todos los que coinciden dentro del lugar, con su ubicación. */
  plano: boolean;
  alSoltar: (tableroId: string, l: Lugar) => void; crearCarpeta: () => void; renombrar: (c: Carpeta) => void; borrar: ((c: Carpeta) => void) | null; nuevoProyecto: () => void;
}) {
  const [orden, setOrden] = useState<{ col: Orden; dir: 1 | -1 }>({ col: "nombre", dir: 1 });
  const [sobre, setSobre] = useState<string | null>(null);
  const e = arbol.find((x) => x.clave === lugar.empresa);
  const m = e?.marcas.find((x) => x.id === lugar.marca);
  const c = carpetas.find((x) => x.id === lugar.carpeta);
  const padre = c?.padreId ? carpetas.find((x) => x.id === c.padreId) : undefined;
  const nodoC = (xs: NodoCarpeta[], id: string): NodoCarpeta | undefined => { for (const x of xs) { if (x.carpeta.id === id) return x; const h = nodoC(x.hijos, id); if (h) return h; } return undefined; };

  // Las «carpetas» de este nivel: empresas, marcas y carpetas.
  const subcarpetas: { clave: string; nombre: string; n: number; l: Lugar; icono: ReactNode }[] = plano ? [] : !e
    ? arbol.map((x) => ({ clave: x.clave, nombre: x.nombre, n: x.total, l: { empresa: x.clave, marca: null, carpeta: null }, icono: <LuBuilding2 size={16} /> }))
    : c
      ? (nodoC([...e.carpetas, ...e.marcas.flatMap((y) => y.carpetas)], c.id)?.hijos ?? []).map((h) => ({ clave: h.carpeta.id, nombre: h.carpeta.nombre, n: h.n, l: { ...lugar, carpeta: h.carpeta.id }, icono: <LuFolder size={16} /> }))
      : m
        ? m.carpetas.map((h) => ({ clave: h.carpeta.id, nombre: h.carpeta.nombre, n: h.n, l: { ...lugar, carpeta: h.carpeta.id }, icono: <LuFolder size={16} /> }))
        : [
          ...e.carpetas.map((h) => ({ clave: h.carpeta.id, nombre: h.carpeta.nombre, n: h.n, l: { empresa: e.clave, marca: null, carpeta: h.carpeta.id }, icono: <LuFolder size={16} /> })),
          ...e.marcas.map((y) => ({ clave: y.id, nombre: y.nombre, n: y.n, l: { empresa: e.clave, marca: y.id, carpeta: null }, icono: <LuTag size={16} /> })),
        ];

  // Los proyectos de este nivel: los que están justo aquí (o, en plano, todos los de adentro).
  const aqui = tableros.filter((t) => {
    const u = ubicar(t, carpetas);
    if (!estaEn(u, lugar)) return false;
    if (plano) return true;
    if (!e) return false;
    if (c) return u.carpeta?.id === c.id;
    if (m) return u.marca === m.id && !u.carpeta;
    return !u.marca && !u.carpeta;
  });
  const valor = (t: Tablero, col: Orden): string | number => col === "nombre" ? t.nombre.toLowerCase() : col === "estado" ? t.estado ?? "" : col === "lider" ? t.lider?.nombre ?? "" : col === "avance" ? pct(t) : col === "vencidos" ? t.items.vencidos : t.actualizadoEn ?? "";
  const ordenados = [...aqui].sort((a, b) => { const x = valor(a, orden.col), y = valor(b, orden.col); return (x < y ? -1 : x > y ? 1 : 0) * orden.dir; });
  const cab = (col: Orden, texto: string) => (
    <th aria-sort={orden.col === col ? (orden.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className="boton-texto" style={{ font: "inherit", color: "inherit" }} onClick={() => setOrden((o) => ({ col, dir: o.col === col ? (o.dir === 1 ? -1 : 1) : 1 }))}>
        {texto}{orden.col === col ? (orden.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  const ubicacion = (t: Tablero) => {
    const u = ubicar(t, carpetas);
    const marca = marcas.find((x) => x.id === u.marca)?.nombre;
    const sup = u.carpeta?.padreId ? carpetas.find((x) => x.id === u.carpeta!.padreId)?.nombre : null;
    return [u.empresaNombre, marca, sup, u.carpeta?.nombre].filter(Boolean).join(" › ");
  };
  // Se puede crear carpeta en la empresa, en una marca o dentro de una carpeta de primer nivel.
  const puedeCrear = !!e && !(c && c.padreId);

  return (
    <div className="pila" style={{ gap: 12 }}>
      <div className="fila entre" style={{ gap: 10, flexWrap: "wrap" }}>
        <nav className="migas-carpeta" aria-label="Dónde estás">
          <button type="button" className="boton-texto" onClick={() => ir(RAIZ)}>Todas las empresas</button>
          {e && <><LuChevronRight size={13} /><button type="button" className="boton-texto" onClick={() => ir({ empresa: e.clave, marca: null, carpeta: null })}>{e.nombre}</button></>}
          {m && <><LuChevronRight size={13} /><button type="button" className="boton-texto" onClick={() => ir({ empresa: e!.clave, marca: m.id, carpeta: null })}>{m.nombre}</button></>}
          {padre && <><LuChevronRight size={13} /><button type="button" className="boton-texto" onClick={() => ir({ ...lugar, carpeta: padre.id })}>{padre.nombre}</button></>}
          {c && <><LuChevronRight size={13} /><strong>{c.nombre}</strong></>}
        </nav>
        <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          {c && <button type="button" className="boton boton--chico" onClick={() => renombrar(c)}><LuPencil size={13} /> Renombrar</button>}
          {c && borrar && <button type="button" className="boton boton--chico boton--peligro" onClick={() => borrar(c)}><LuTrash2 size={13} /> Borrar carpeta</button>}
          {puedeCrear && <button type="button" className="boton boton--chico" onClick={crearCarpeta}><LuFolderPlus size={14} /> {c ? "Subcarpeta" : "Carpeta"}</button>}
          {e && <button type="button" className="boton boton--chico boton--primario" onClick={nuevoProyecto}><LuPlus size={14} /> Proyecto aquí</button>}
        </span>
      </div>

      {subcarpetas.length > 0 && (
        <div className="carpetas-grilla" role="list" aria-label="Carpetas">
          {subcarpetas.map((x) => (
            <button key={x.clave} type="button" role="listitem" className={`tarjeta carpeta-tarjeta${sobre === x.clave ? " carpeta-tarjeta--soltar" : ""}`} onClick={() => ir(x.l)}
              {...(x.l.empresa && e ? recibir(alSoltar, x.l, setSobre, x.clave) : {})}>
              <span className="carpeta-icono" aria-hidden>{x.icono}</span>
              <span className="recortar negrita texto-sm">{x.nombre}</span>
              <span className="texto-xs texto-muted">{x.n} {x.n === 1 ? "proyecto" : "proyectos"}</span>
            </button>
          ))}
        </div>
      )}

      {e || plano ? (
        ordenados.length ? (
          <div className="tabla-envoltura">
            <table className="tabla tabla-carpeta">
              <thead>
                <tr>
                  {cab("nombre", "Proyecto")}
                  {plano && <th>Ubicación</th>}
                  {cab("estado", "Estado")}
                  {cab("lider", "Líder")}
                  {cab("avance", "Avance")}
                  {cab("vencidos", "Vencidos")}
                  {cab("actividad", "Última actividad")}
                </tr>
              </thead>
              <tbody>
                {ordenados.map((t) => (
                  <tr key={t.id} draggable={t.puedeEditar} title={t.puedeEditar ? "Arrastra a una carpeta del árbol para moverlo" : undefined}
                    onDragStart={(ev) => { ev.dataTransfer.setData(TIPO_ARRASTRE, t.id); ev.dataTransfer.effectAllowed = "move"; }}>
                    <td>
                      <Enlace a={`/equipo/proyectos/tableros/${t.id}`} className="fila negrita" style={{ gap: 6, color: "inherit" }}>
                        <span className="punto-color" style={{ background: t.color }} aria-hidden />
                        {t.privado && <LuLock size={12} aria-label="Privado" />}{t.nombre}
                      </Enlace>
                    </td>
                    {plano && <td className="texto-xs texto-muted">{ubicacion(t)}</td>}
                    <td className="texto-sm">{t.estado ?? "—"}</td>
                    <td className="texto-sm">{t.lider?.nombre ?? "—"}</td>
                    <td style={{ minWidth: 140 }}><span className="fila" style={{ gap: 8 }}><span style={{ flex: 1 }}><Barra pct={pct(t)} tono={t.items.vencidos ? "ambar" : undefined} /></span><span className="texto-xs">{pct(t)} %</span></span></td>
                    <td className="texto-sm" style={t.items.vencidos ? { color: "var(--c-alerta)" } : undefined}>{t.items.vencidos || "—"}</td>
                    <td className="texto-sm">{fechaCorta(t.actualizadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !subcarpetas.length ? (
          <p className="texto-sm texto-muted">{plano ? "Ningún proyecto coincide con la búsqueda o los filtros." : "Esta carpeta está vacía. Arrastra proyectos aquí desde otra carpeta o crea uno nuevo."}</p>
        ) : null
      ) : null}
    </div>
  );
}

// ───────────────────────────── crear y renombrar

export function ModalNombre({ titulo, inicial, etiqueta, alGuardar, alCerrar }: { titulo: string; inicial?: string; etiqueta: string; alGuardar: (nombre: string) => Promise<string | null>; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(inicial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={titulo} ancho={420}>
      <form className="pila" style={{ gap: 12 }} onSubmit={async (ev) => {
        ev.preventDefault();
        setEnviando(true);
        setError(await alGuardar(nombre.trim()));
        setEnviando(false);
      }}>
        <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>{titulo}</h2>
        <div className="campo">
          <label htmlFor="carpeta-nombre">{etiqueta}</label>
          <div className="entrada"><input id="carpeta-nombre" value={nombre} onChange={(ev) => setNombre(ev.target.value)} maxLength={80} autoFocus /></div>
          {error && <p className="texto-xs" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</p>}
        </div>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario" disabled={!nombre.trim() || enviando}>{enviando ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ───────────────────────────── filtros (17 nov)

export interface Filtros { persona: string | null; area: string | null; estado: string | null; vencidos: boolean; privados: boolean; servicio: "CON" | "SIN" | null; inactivos: number | null }
export const SIN_FILTROS: Filtros = { persona: null, area: null, estado: null, vencidos: false, privados: false, servicio: null, inactivos: null };
export const hayFiltros = (f: Filtros) => Object.values(f).some((x) => x !== null && x !== false);

export function pasaFiltros(t: Tablero, f: Filtros, ahora = Date.now()) {
  if (f.persona && !t.personaIds.includes(f.persona)) return false;
  if (f.area && t.area !== f.area) return false;
  if (f.estado && (t.estado ?? "Sin estado") !== f.estado) return false;
  if (f.vencidos && !t.items.vencidos) return false;
  if (f.privados && !t.privado) return false;
  if (f.servicio === "CON" && !t.servicioId) return false;
  if (f.servicio === "SIN" && t.servicioId) return false;
  if (f.inactivos && t.actualizadoEn && ahora - new Date(t.actualizadoEn).getTime() < f.inactivos * 86_400_000) return false;
  return true;
}

export function BarraFiltros({ tableros, equipo, f, cambiar }: { tableros: Tablero[]; equipo: { empleadoId: string; nombre: string }[]; f: Filtros; cambiar: (f: Filtros) => void }) {
  const areas = [...new Set(tableros.map((t) => t.area).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "es"));
  const estados = [...new Set(tableros.map((t) => t.estado ?? "Sin estado"))].sort((a, b) => a.localeCompare(b, "es"));
  const personas = useMemo(() => {
    const ids = new Set(tableros.flatMap((t) => t.personaIds));
    const nombres = new Map(equipo.map((p) => [p.empleadoId, p.nombre]));
    for (const t of tableros) if (t.lider && !nombres.has(t.lider.id)) nombres.set(t.lider.id, t.lider.nombre);
    return [...ids].map((id) => ({ id, nombre: nombres.get(id) ?? id })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [tableros, equipo]);
  const activos: { clave: keyof Filtros; texto: string }[] = [
    ...(f.persona ? [{ clave: "persona" as const, texto: `Persona: ${personas.find((p) => p.id === f.persona)?.nombre ?? f.persona}` }] : []),
    ...(f.area ? [{ clave: "area" as const, texto: `Área: ${f.area}` }] : []),
    ...(f.estado ? [{ clave: "estado" as const, texto: `Estado: ${f.estado}` }] : []),
    ...(f.vencidos ? [{ clave: "vencidos" as const, texto: "Con vencidos" }] : []),
    ...(f.privados ? [{ clave: "privados" as const, texto: "Privados" }] : []),
    ...(f.servicio ? [{ clave: "servicio" as const, texto: f.servicio === "CON" ? "Con servicio vinculado" : "Sin servicio vinculado" }] : []),
    ...(f.inactivos ? [{ clave: "inactivos" as const, texto: `Sin movimiento hace ${f.inactivos} días` }] : []),
  ];
  const sel = (etiqueta: string, valor: string, opciones: [string, string][], alCambiar: (v: string) => void, ancho = 160) => (
    <select className="input filtro-select" aria-label={etiqueta} style={{ width: ancho }} value={valor} onChange={(e) => alCambiar(e.target.value)}>
      {opciones.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
    </select>
  );
  return (
    <div className="pila" style={{ gap: 8, marginBottom: 12 }}>
      <div className="fila" style={{ gap: 8, flexWrap: "wrap" }} role="group" aria-label="Filtros de proyectos">
        {sel("Filtrar por persona", f.persona ?? "", [["", "Cualquier persona"], ...personas.map((p) => [p.id, p.nombre] as [string, string])], (v) => cambiar({ ...f, persona: v || null }), 180)}
        {sel("Filtrar por área", f.area ?? "", [["", "Cualquier área"], ...areas.map((a) => [a, a] as [string, string])], (v) => cambiar({ ...f, area: v || null }))}
        {sel("Filtrar por estado", f.estado ?? "", [["", "Cualquier estado"], ...estados.map((a) => [a, a] as [string, string])], (v) => cambiar({ ...f, estado: v || null }))}
        {sel("Filtrar por servicio vinculado", f.servicio ?? "", [["", "Con o sin servicio"], ["CON", "Con servicio vinculado"], ["SIN", "Sin servicio vinculado"]], (v) => cambiar({ ...f, servicio: (v || null) as Filtros["servicio"] }), 190)}
        {sel("Filtrar por actividad", String(f.inactivos ?? ""), [["", "Cualquier actividad"], ["7", "Sin movimiento 7 días"], ["14", "Sin movimiento 14 días"], ["30", "Sin movimiento 30 días"]], (v) => cambiar({ ...f, inactivos: v ? Number(v) : null }), 200)}
        <button type="button" className="chip" aria-pressed={f.vencidos} onClick={() => cambiar({ ...f, vencidos: !f.vencidos })}>Con vencidos</button>
        <button type="button" className="chip" aria-pressed={f.privados} onClick={() => cambiar({ ...f, privados: !f.privados })}><LuLock size={12} /> Privados</button>
      </div>
      {activos.length > 0 && (
        <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          {activos.map((a) => (
            <span key={a.clave} className="chip chip--activo">
              {a.texto}
              <button type="button" className="boton-icono" style={{ padding: 0 }} aria-label={`Quitar el filtro ${a.texto}`} onClick={() => cambiar({ ...f, [a.clave]: SIN_FILTROS[a.clave] })}><LuX size={12} /></button>
            </span>
          ))}
          <button type="button" className="boton-texto texto-xs" onClick={() => cambiar(SIN_FILTROS)}>Limpiar filtros</button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── la vista elegida, recordada en el navegador

export type VistaProyectos = "CARPETAS" | "ESTADO";
export function useVistaProyectos(): [VistaProyectos, (v: VistaProyectos) => void] {
  const [v, setV] = useState<VistaProyectos>("CARPETAS");
  useEffect(() => {
    try { const x = localStorage.getItem("inoo.proyectos.vista"); if (x === "CARPETAS" || x === "ESTADO") setV(x); } catch { /* sin almacenamiento */ }
  }, []);
  return [v, (x) => { setV(x); try { localStorage.setItem("inoo.proyectos.vista", x); } catch { /* sin almacenamiento */ } }];
}
