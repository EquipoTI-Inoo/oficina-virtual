"use client";
/**
 * Carpetas de Proyectos (17 nov 2026, Ernesto: «carpetas por empresa, con las marcas en subcarpetas»), como en Monday:
 * Empresa → Marca → Carpeta → Subcarpeta → Proyectos. El árbol de la izquierda navega y recibe proyectos arrastrados; la
 * vista «Carpetas» muestra el contenido como un explorador. Además, los filtros de Proyectos (persona, área, estado,
 * vencidos, privados, servicio y actividad), que sirven en las dos vistas.
 */
import { Fragment, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { LuBuilding2, LuChevronRight, LuEllipsis, LuFolder, LuFolderPlus, LuLayers, LuLock, LuPencil, LuPlus, LuSearch, LuSlidersHorizontal, LuTag, LuTrash2, LuX } from "react-icons/lu";
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

/** Acciones del menú «⋯» de cada fila del árbol. */
export interface AccionesArbol {
  nuevaCarpeta: (l: Lugar) => void;
  nuevoProyecto: (l: Lugar) => void;
  renombrar: (c: Carpeta) => void;
  /** null: no es Admin. */
  borrar: ((c: Carpeta) => void) | null;
}

/** Qué ramas quedaron abiertas, en este navegador. */
function useAbiertos(): [Set<string>, (clave: string, abrir?: boolean) => void] {
  const [xs, setXs] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { setXs(new Set(JSON.parse(localStorage.getItem("inoo.proyectos.abiertos") ?? "[]") as string[])); } catch { /* sin almacenamiento */ }
  }, []);
  const cambiar = (clave: string, abrir?: boolean) => setXs((s) => {
    const n = new Set(s);
    if (abrir ?? !n.has(clave)) n.add(clave); else n.delete(clave);
    try { localStorage.setItem("inoo.proyectos.abiertos", JSON.stringify([...n])); } catch { /* sin almacenamiento */ }
    return n;
  });
  return [xs, cambiar];
}

/**
 * El árbol de la izquierda, como en Monday (18 nov): empresas, marcas, carpetas y proyectos, cada rama con su flecha
 * (varias abiertas a la vez, recordadas). Clic en el nombre: se elige ese lugar. Un menú «⋯» por fila para crear,
 * renombrar o borrar, y se arrastran proyectos de una carpeta a otra. Con `tableros`, los proyectos van dentro.
 */
export function ArbolProyectos({ arbol, lugar, ir, alSoltar, etiqueta, tableros, carpetas = [], acciones }: {
  arbol: NodoEmpresa[]; lugar: Lugar; ir: (l: Lugar) => void; alSoltar?: (tableroId: string, l: Lugar) => void; etiqueta: string;
  tableros?: Tablero[]; carpetas?: Carpeta[]; acciones?: AccionesArbol;
}) {
  const [sobre, setSobre] = useState<string | null>(null);
  const [abiertos, alternar] = useAbiertos();
  const [menu, setMenuRaw] = useState<string | null>(null);
  // El menú flota sobre la página (el árbol tiene su propio scroll y lo cortaría).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const setMenu = (x: string | null) => { setMenuRaw(x); if (!x) setPos(null); };
  const [busca, setBusca] = useState("");
  const q = busca.trim().toLowerCase();
  // Al elegir un lugar (también una carpeta recién creada), se abren las ramas que llevan hasta él.
  useEffect(() => {
    if (lugar.empresa) alternar(`e:${lugar.empresa}`, true);
    if (lugar.marca && lugar.marca !== "__sin") alternar(`m:${lugar.marca}`, true);
    const padre = carpetas.find((c) => c.id === lugar.carpeta)?.padreId;
    if (padre) alternar(`c:${padre}`, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lugar.empresa, lugar.marca, lugar.carpeta]);
  useEffect(() => {
    if (!menu) return;
    const cerrar = (e: globalThis.MouseEvent) => { if (!(e.target as HTMLElement).closest(".arbol-menu")) setMenu(null); };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [menu]);

  // Los proyectos de cada lugar exacto (empresa sin marca, marca sin carpeta, carpeta).
  const porLugar = useMemo(() => {
    const m = new Map<string, Tablero[]>();
    for (const t of tableros ?? []) {
      if (q && !t.nombre.toLowerCase().includes(q)) continue;
      const u = ubicar(t, carpetas);
      const clave = u.carpeta ? `c:${u.carpeta.id}` : u.marca ? `m:${u.marca}` : `e:${u.empresa}`;
      m.set(clave, [...(m.get(clave) ?? []), t]);
    }
    for (const xs of m.values()) xs.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return m;
  }, [tableros, carpetas, q]);
  const conProyectos = !!tableros;
  // Con búsqueda: solo las ramas con coincidencias, todas abiertas.
  const tieneC = (c: NodoCarpeta): boolean => !q || c.carpeta.nombre.toLowerCase().includes(q) || !!porLugar.get(`c:${c.carpeta.id}`)?.length || c.hijos.some(tieneC);
  const tieneM = (e: NodoEmpresa, m: NodoMarca) => !q || m.nombre.toLowerCase().includes(q) || !!porLugar.get(`m:${m.id}`)?.length || m.carpetas.some(tieneC);
  const tieneE = (e: NodoEmpresa) => !q || e.nombre.toLowerCase().includes(q) || !!porLugar.get(`e:${e.clave}`)?.length || e.carpetas.some(tieneC) || e.marcas.some((m) => tieneM(e, m));
  const abierta = (clave: string) => !!q || abiertos.has(clave);

  const menuDe = ({ clave, l, c }: { clave: string; l: Lugar; c?: Carpeta }) => !acciones ? null : (
    <span className="arbol-menu">
      <button type="button" className="boton-icono arbol-mas" aria-label="Más acciones" aria-haspopup="menu" aria-expanded={menu === clave} onClick={(ev) => { if (menu === clave) return setMenu(null); const r = ev.currentTarget.getBoundingClientRect(); setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(window.innerWidth - 216, r.right - 208)) }); setMenu(clave); }}><LuEllipsis size={15} /></button>
      {menu === clave && (
        <span className="arbol-menu-caja" role="menu" style={pos ? { top: pos.top, left: pos.left } : undefined}>
          {!(c && c.padreId) && <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.nuevaCarpeta(l); }}><LuFolderPlus size={14} /> {c ? "Nueva subcarpeta" : "Nueva carpeta"}</button>}
          <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.nuevoProyecto(l); }}><LuPlus size={14} /> Nuevo proyecto aquí</button>
          {c && <button type="button" role="menuitem" onClick={() => { setMenu(null); acciones.renombrar(c); }}><LuPencil size={14} /> Renombrar</button>}
          {c && acciones.borrar && <button type="button" role="menuitem" className="peligro" onClick={() => { setMenu(null); acciones.borrar!(c); }}><LuTrash2 size={14} /> Borrar carpeta</button>}
        </span>
      )}
    </span>
  );
  const fila = ({ clave, l, actual, icono, nombre, n, nivel, expandible, c, conMenu = true }: { clave: string; l: Lugar; actual: boolean; icono: ReactNode; nombre: string; n: number; nivel: number; expandible: boolean; c?: Carpeta; conMenu?: boolean }) => (
    <div className={`arbol-fila${actual ? " arbol-fila--actual" : ""}${sobre === clave ? " arbol-item--soltar" : ""}`} style={{ paddingLeft: 4 + nivel * 14 }} {...recibir(alSoltar, l, setSobre, clave)}>
      {expandible ? (
        <button type="button" className="boton-icono arbol-flecha" aria-label={abierta(clave) ? `Cerrar ${nombre}` : `Abrir ${nombre}`} aria-expanded={abierta(clave)} onClick={() => alternar(clave)}>
          <LuChevronRight size={14} style={{ transform: abierta(clave) ? "rotate(90deg)" : undefined }} />
        </button>
      ) : <span className="arbol-flecha" aria-hidden />}
      <button type="button" className="arbol-nombre" aria-current={actual || undefined} onClick={() => { ir(l); if (expandible) alternar(clave, true); }}>
        <span className="arbol-icono" aria-hidden>{icono}</span><span className="recortar">{nombre}</span>
      </button>
      <span className="arbol-n">{n}</span>
      {conMenu && l.empresa && menuDe({ clave, l, c })}
    </div>
  );
  const proyectos = ({ clave, nivel }: { clave: string; nivel: number }) => (
    <Fragment key={`p-${clave}`}>
      {(porLugar.get(clave) ?? []).map((t) => (
        <Enlace key={t.id} a={`/equipo/proyectos/tableros/${t.id}`} className="arbol-fila arbol-proyecto" style={{ paddingLeft: 4 + nivel * 14 + 20 }}
          draggable={t.puedeEditar} onDragStart={(e) => { e.dataTransfer.setData(TIPO_ARRASTRE, t.id); e.dataTransfer.effectAllowed = "move"; }}>
          <span className="punto-color" style={{ background: t.color }} aria-hidden />
          <span className="recortar">{t.privado && <LuLock size={11} aria-label="Privado" style={{ marginRight: 3 }} />}{t.nombre}</span>
        </Enlace>
      ))}
    </Fragment>
  );
  const carpetasDe = ({ e, marca, xs, nivel }: { e: NodoEmpresa; marca: string | null; xs: NodoCarpeta[]; nivel: number }): ReactNode => (
    <Fragment key={`cs-${marca ?? e.clave}-${nivel}`}>
      {xs.filter(tieneC).map((c) => {
        const clave = `c:${c.carpeta.id}`;
        const expandible = c.hijos.length > 0 || (conProyectos && !!porLugar.get(clave)?.length);
        return (
          <div key={c.carpeta.id} role="group">
            {fila({ clave, l: { empresa: e.clave, marca, carpeta: c.carpeta.id }, actual: lugar.carpeta === c.carpeta.id, icono: <LuFolder size={14} />, nombre: c.carpeta.nombre, n: c.n, nivel, expandible, c: c.carpeta })}
            {abierta(clave) && <>{carpetasDe({ e, marca, xs: c.hijos, nivel: nivel + 1 })}{conProyectos && proyectos({ clave, nivel: nivel + 1 })}</>}
          </div>
        );
      })}
    </Fragment>
  );

  return (
    <nav className="arbol-empresas" aria-label={etiqueta}>
      {conProyectos && (
        <div className="entrada arbol-busca">
          <input aria-label="Buscar en las carpetas" placeholder="Buscar carpeta o proyecto" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <span className="icono-campo" aria-hidden><LuSearch size={14} /></span>
        </div>
      )}
      {fila({ clave: "__todas", l: RAIZ, actual: !lugar.empresa, icono: <LuLayers size={14} />, nombre: "Todas las empresas", n: arbol.reduce((n, e) => n + e.total, 0), nivel: 0, expandible: false, conMenu: false })}
      {arbol.filter(tieneE).map((e) => {
        const clave = `e:${e.clave}`;
        return (
          <div key={e.clave} role="group">
            {fila({ clave, l: { empresa: e.clave, marca: null, carpeta: null }, actual: lugar.empresa === e.clave && !lugar.marca && !lugar.carpeta, icono: <LuBuilding2 size={14} />, nombre: e.nombre, n: e.total, nivel: 0, expandible: true })}
            {abierta(clave) && (
              <>
                {carpetasDe({ e, marca: null, xs: e.carpetas, nivel: 1 })}
                {e.marcas.filter((m) => tieneM(e, m)).map((m) => {
                  const cm = `m:${m.id}`;
                  return (
                    <div key={m.id} role="group">
                      {fila({ clave: cm, l: { empresa: e.clave, marca: m.id, carpeta: null }, actual: lugar.marca === m.id && !lugar.carpeta, icono: <LuTag size={14} />, nombre: m.nombre, n: m.n, nivel: 1,
                        expandible: m.carpetas.length > 0 || (conProyectos && !!porLugar.get(cm)?.length) })}
                      {abierta(cm) && <>{carpetasDe({ e, marca: m.id, xs: m.carpetas, nivel: 2 })}{conProyectos && proyectos({ clave: cm, nivel: 2 })}</>}
                    </div>
                  );
                })}
                {conProyectos ? proyectos({ clave, nivel: 1 }) : e.marcas.length > 0 && e.sinMarca > 0 && (
                  fila({ clave: `${e.clave}__sin`, l: { empresa: e.clave, marca: "__sin", carpeta: null }, actual: lugar.marca === "__sin", icono: <LuTag size={14} />, nombre: "Sin marca", n: e.sinMarca, nivel: 1, expandible: false, conMenu: false })
                )}
              </>
            )}
          </div>
        );
      })}
      {q && !arbol.some(tieneE) && <p className="texto-xs texto-muted" style={{ padding: "6px 10px" }}>Nada coincide con «{busca.trim()}».</p>}
    </nav>
  );
}

// ───────────────────────────── a la derecha: la lista del lugar elegido (18 nov)

type Orden = "nombre" | "ubicacion" | "estado" | "lider" | "avance" | "vencidos" | "actividad";
const pct = (t: Tablero) => (t.items.total ? Math.round((t.items.completados / t.items.total) * 100) : 0);
const fechaCorta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" }) : "—");

/**
 * Todos los proyectos del lugar elegido (también los de sus carpetas), con su ruta arriba y una columna «Carpeta»
 * cuando hay proyectos más adentro. Se ordena por cualquier columna y se arrastra al árbol para mover.
 */
export function VistaCarpetas({ arbol, lugar, ir, tableros, carpetas, marcas }: {
  arbol: NodoEmpresa[]; lugar: Lugar; ir: (l: Lugar) => void; tableros: Tablero[]; carpetas: Carpeta[]; marcas: Marca[];
}) {
  const [orden, setOrden] = useState<{ col: Orden; dir: 1 | -1 }>({ col: "nombre", dir: 1 });
  const e = arbol.find((x) => x.clave === lugar.empresa);
  const m = e?.marcas.find((x) => x.id === lugar.marca);
  const c = carpetas.find((x) => x.id === lugar.carpeta);
  const padre = c?.padreId ? carpetas.find((x) => x.id === c.padreId) : undefined;
  // La ruta de cada proyecto desde el lugar elegido hacia adentro.
  const ruta = (t: Tablero) => {
    const u = ubicar(t, carpetas);
    const sup = u.carpeta?.padreId ? carpetas.find((x) => x.id === u.carpeta!.padreId)?.nombre : null;
    const partes = [
      !e ? (u.empresaNombre === "Inoo (interno)" ? "Inoo" : u.empresaNombre) : null,
      !m && u.marca ? marcas.find((x) => x.id === u.marca)?.nombre : null,
      sup && sup !== c?.nombre ? sup : null,
      u.carpeta && u.carpeta.id !== c?.id ? u.carpeta.nombre : null,
    ];
    return partes.filter(Boolean).join(" › ");
  };
  const xs = tableros.filter((t) => estaEn(ubicar(t, carpetas), lugar));
  const conRuta = xs.some((t) => ruta(t));
  const valor = (t: Tablero, col: Orden): string | number => col === "nombre" ? t.nombre.toLowerCase() : col === "ubicacion" ? ruta(t).toLowerCase() : col === "estado" ? t.estado ?? "" : col === "lider" ? t.lider?.nombre ?? "" : col === "avance" ? pct(t) : col === "vencidos" ? t.items.vencidos : t.actualizadoEn ?? "";
  const ordenados = [...xs].sort((a, b) => { const x = valor(a, orden.col), y = valor(b, orden.col); return (x < y ? -1 : x > y ? 1 : 0) * orden.dir; });
  const cab = (col: Orden, texto: string) => (
    <th aria-sort={orden.col === col ? (orden.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className="boton-texto" style={{ font: "inherit", color: "inherit" }} onClick={() => setOrden((o) => ({ col, dir: o.col === col ? (o.dir === 1 ? -1 : 1) : 1 }))}>
        {texto}{orden.col === col ? (orden.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
  return (
    <div className="pila" style={{ gap: 12 }}>
      <nav className="migas-carpeta" aria-label="Dónde estás">
        <button type="button" className="boton-texto" onClick={() => ir(RAIZ)}>Todas las empresas</button>
        {e && <><LuChevronRight size={13} /><button type="button" className="boton-texto" onClick={() => ir({ empresa: e.clave, marca: null, carpeta: null })}>{e.nombre}</button></>}
        {m && <><LuChevronRight size={13} /><button type="button" className="boton-texto" onClick={() => ir({ empresa: e!.clave, marca: m.id, carpeta: null })}>{m.nombre}</button></>}
        {padre && <><LuChevronRight size={13} /><button type="button" className="boton-texto" onClick={() => ir({ ...lugar, carpeta: padre.id })}>{padre.nombre}</button></>}
        {c && <><LuChevronRight size={13} /><strong>{c.nombre}</strong></>}
        <span className="texto-xs texto-muted" style={{ marginLeft: 6 }}>· {xs.length} {xs.length === 1 ? "proyecto" : "proyectos"}</span>
      </nav>
      {ordenados.length ? (
        <div className="tabla-envoltura">
          <table className="tabla tabla-carpeta">
            <thead>
              <tr>
                {cab("nombre", "Proyecto")}
                {conRuta && cab("ubicacion", e ? "Carpeta" : "Ubicación")}
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
                  {conRuta && <td className="texto-xs texto-muted">{ruta(t) || "—"}</td>}
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
      ) : (
        <p className="texto-sm texto-muted">{e ? "No hay proyectos aquí. Arrastra uno desde el árbol o usa «⋯ → Nuevo proyecto aquí»." : "Ningún proyecto coincide con la búsqueda o los filtros."}</p>
      )}
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

/** 18 nov: los filtros van plegados detrás de «Filtros (n)»; los activos se ven siempre como fichas. `izquierda`: lo que va en la misma fila. */
export function BarraFiltros({ tableros, equipo, f, cambiar, izquierda }: { tableros: Tablero[]; equipo: { empleadoId: string; nombre: string }[]; f: Filtros; cambiar: (f: Filtros) => void; izquierda?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
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
      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        {izquierda}
        <button type="button" className="boton boton--chico" aria-expanded={abierto} aria-controls="filtros-proyectos" onClick={() => setAbierto((x) => !x)}>
          <LuSlidersHorizontal size={14} /> Filtros{activos.length ? ` (${activos.length})` : ""}
        </button>
      </div>
      {abierto && <div id="filtros-proyectos" className="fila" style={{ gap: 8, flexWrap: "wrap" }} role="group" aria-label="Filtros de proyectos">
        {sel("Filtrar por persona", f.persona ?? "", [["", "Cualquier persona"], ...personas.map((p) => [p.id, p.nombre] as [string, string])], (v) => cambiar({ ...f, persona: v || null }), 180)}
        {sel("Filtrar por área", f.area ?? "", [["", "Cualquier área"], ...areas.map((a) => [a, a] as [string, string])], (v) => cambiar({ ...f, area: v || null }))}
        {sel("Filtrar por estado", f.estado ?? "", [["", "Cualquier estado"], ...estados.map((a) => [a, a] as [string, string])], (v) => cambiar({ ...f, estado: v || null }))}
        {sel("Filtrar por servicio vinculado", f.servicio ?? "", [["", "Con o sin servicio"], ["CON", "Con servicio vinculado"], ["SIN", "Sin servicio vinculado"]], (v) => cambiar({ ...f, servicio: (v || null) as Filtros["servicio"] }), 190)}
        {sel("Filtrar por actividad", String(f.inactivos ?? ""), [["", "Cualquier actividad"], ["7", "Sin movimiento 7 días"], ["14", "Sin movimiento 14 días"], ["30", "Sin movimiento 30 días"]], (v) => cambiar({ ...f, inactivos: v ? Number(v) : null }), 200)}
        <button type="button" className="chip" aria-pressed={f.vencidos} onClick={() => cambiar({ ...f, vencidos: !f.vencidos })}>Con vencidos</button>
        <button type="button" className="chip" aria-pressed={f.privados} onClick={() => cambiar({ ...f, privados: !f.privados })}><LuLock size={12} /> Privados</button>
      </div>}
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
