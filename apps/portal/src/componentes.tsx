"use client";
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LuBell, LuChartNoAxesColumnIncreasing, LuChevronRight, LuChevronsUpDown, LuCircleCheck, LuHouse, LuLayers, LuLogOut, LuMenu, LuSquareKanban, LuUserRound, LuExternalLink, LuBot, LuEye, LuIdCard,
  LuSparkles, LuUsers, LuX, LuCalendarDays, LuInstagram, LuVideo, LuMegaphone, LuGlobe, LuSquareUser,
  LuUserCog, LuNetwork, LuBuilding2, LuVault, LuCoins, LuPalette, LuPlug, LuLifeBuoy, LuWallet, LuClipboardList, LuCalendarOff, LuPartyPopper, LuSearch, LuFileCheck, LuLayoutDashboard, LuListChecks, LuSun, LuMoon, LuMonitor, LuPanelLeftClose, LuPanelLeftOpen,
  LuKeyRound,
  LuShieldCheck,
  LuLayoutGrid,
} from "react-icons/lu";
import { pideAccion } from "./dominio/por-revisar";
import { fDiaHora, api, cambiarClienteActivo, cerrarSesion, clienteActivo, entrarComoCliente, salirDeVistaCliente, Enlace, fCorta, fHoyLargo, leerSesion, useConsulta, useNavegacion, type S, ProblemaApi, comoCliente, rolCliente, cuentaActiva } from "./base";

// ───────────────────────────── etiquetas de estado (Figma: «Etiquetas de estado»)

type Tono = "violeta" | "verde" | "ambar" | "azul" | "gris" | "rojo";
export const ESTADO_PIEZA: Record<string, [string, Tono]> = {
  EN_PRODUCCION: ["En producción", "gris"],
  BORRADOR: ["Borrador", "gris"],
  EN_REVISION_INTERNA: ["Revisión interna", "gris"],
  LISTO_REVISION: ["Listo para revisión", "violeta"],
  APROBADO_CLIENTE: ["Aprobado", "verde"],
  CAMBIOS_SOLICITADOS: ["Cambios solicitados", "ambar"],
  PUBLICADO: ["Publicado", "azul"],
};
export const ESTADO_TICKET: Record<string, [string, Tono]> = {
  ABIERTO: ["Abierto", "ambar"],
  EN_PROCESO: ["En curso", "azul"],
  ESPERANDO_CLIENTE: ["Esperando tu respuesta", "ambar"],
  RESUELTO: ["Resuelto", "verde"],
  CERRADO: ["Cerrado", "gris"],
};
export const CATEGORIA_TICKET: Record<string, string> = {
  MARKETING: "Marketing", DISENO: "Diseño", WEB: "Web", CRM: "CRM", FACTURACION: "Facturación", OTRO: "Otro",
};

export function Etiqueta({ tono = "gris", children, sinPunto }: { tono?: Tono; children: ReactNode; sinPunto?: boolean }) {
  return <span className={`etiqueta etiqueta--${tono}${sinPunto ? " etiqueta--sin-punto" : ""}`}>{children}</span>;
}
export function EtiquetaEstado({ estado, mapa = ESTADO_PIEZA }: { estado: string; mapa?: Record<string, [string, Tono]> }) {
  const [texto, tono] = mapa[estado] ?? [estado, "gris"];
  return <Etiqueta tono={tono}>{texto}</Etiqueta>;
}

/**
 * Lo que el cliente ve de un entregable (reunión 15 oct): solo «Listo para revisar», «Revisado» (pidió
 * cambios), «Aprobado» o «Atrasado» si no lo revisó en su plazo. El significado de cada estado está en
 * docs/diseno.md.
 */
export const ESTADO_PIEZA_CLIENTE: Record<string, [string, Tono]> = {
  EN_PRODUCCION: ["En producción", "gris"],
  LISTO_REVISION: ["Listo para revisar", "violeta"],
  CAMBIOS_SOLICITADOS: ["Revisado", "ambar"],
  APROBADO_CLIENTE: ["Aprobado", "verde"],
  PUBLICADO: ["Publicado", "azul"],
};

const diasHabiles = (n: number) => `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;

/** Estado de una pieza según quién mira; si el cliente no la revisó a tiempo, «Atrasado». */
export function EtiquetaPieza({ p }: { p: { estado: string; atrasada?: boolean; diasAtrasoRevision?: number } }) {
  const esCliente = comoCliente();
  if (p.estado === "LISTO_REVISION" && p.atrasada) {
    const dias = diasHabiles(p.diasAtrasoRevision ?? 1);
    return <Etiqueta tono="rojo">{esCliente ? `Atrasado · ${dias}` : `Cliente atrasado · ${dias}`}</Etiqueta>;
  }
  return <EtiquetaEstado estado={p.estado} mapa={esCliente ? ESTADO_PIEZA_CLIENTE : ESTADO_PIEZA} />;
}

export const ICONO_SERVICIO: Record<string, ReactNode> = {
  SOCIAL_MEDIA_PRO: <LuInstagram size={18} />,
  BRANDFORMANCE: <LuPalette size={18} />,
  PAID_MEDIA: <LuMegaphone size={18} />,
  WEB: <LuGlobe size={18} />,
  CRM_IMPLEMENTACION: <LuSquareUser size={18} />,
  CRM_INTEGRACION: <LuPlug size={18} />,
  AUDIOVISUAL: <LuVideo size={18} />,
  SOPORTE_CONTINUO: <LuLifeBuoy size={18} />,
};

/** Una línea con lo esencial del servicio: variante, CRM y licencias, o la cuota mensual de piezas. */
export function detalleServicio(s: { variante?: S<"VarianteServicio"> | null; detalle?: S<"DetalleServicio">; cantidadMensual: number; unidad: string }): string {
  const d = s.detalle ?? {};
  const partes: string[] = [];
  if (s.variante) partes.push(s.variante.nombre);
  if (d.crm) partes.push(d.tipoLicencia ? `${d.crm} ${d.tipoLicencia}` : d.crm);
  if (typeof d.licencias === "number") partes.push(`${d.licencias} ${d.licencias === 1 ? "licencia" : "licencias"}`);
  if (typeof d.usuarios === "number") partes.push(`${d.usuarios} ${d.usuarios === 1 ? "usuario" : "usuarios"}`);
  if (d.plataformas?.length) partes.push(`con ${d.plataformas.join(", ")}`);
  if (s.cantidadMensual > 0) partes.push(`${s.cantidadMensual} ${s.unidad} / mes`);
  return partes.join(" · ");
}

/** Avance lineal de un servicio: % por etapas y en qué etapa está (reunión 12 oct). */
export function AvanceLineal({ avance: a, compacto }: { avance: S<"AvanceProyecto">; compacto?: boolean }) {
  const etapa = a.etapaActual;
  return (
    <div style={{ display: "grid", gap: compacto ? 6 : 8 }}>
      <div className="fila entre texto-xs texto-muted">
        <span>
          {etapa ? `Etapa ${etapa.orden} de ${a.totalEtapas} · ${etapa.nombre}` : a.totalEtapas ? "Todas las etapas completas" : "Sin etapas programadas"}
        </span>
        <span className="texto-primario negrita">{a.porcentaje} %</span>
      </div>
      <Barra pct={a.porcentaje} tono={etapa?.atrasada ? "ambar" : undefined} />
      {etapa?.atrasada && (
        <span className="texto-xs" style={{ color: "var(--c-alerta)", fontSize: "var(--t-xs)" }}>
          Esta etapa va con retraso{etapa.fechaEstimada ? ` (prevista para el ${etapa.fechaEstimada.slice(8)}/${etapa.fechaEstimada.slice(5, 7)})` : ""}.
        </span>
      )}
    </div>
  );
}

// ───────────────────────────── avisos (feriados, días no laborables, aniversario y generales)

export const TIPO_AVISO: Record<string, string> = { FERIADO: "Feriado", NO_LABORABLE: "Día no laborable", ANIVERSARIO: "Aniversario", GENERAL: "Aviso" };

/** Texto corto de un aviso para el cliente. */
export function textoAviso(a: S<"Aviso">): string {
  const cuando = a.fechaInicio === a.fechaFin ? fHoyLargo(a.fechaInicio) : `del ${fCorta(a.fechaInicio)} al ${fCorta(a.fechaFin)}`;
  if (a.tipo === "FERIADO") return `El ${cuando} es feriado (${a.titulo}). No lo contamos en tus plazos.`;
  if (a.tipo === "NO_LABORABLE") return `${a.titulo}: no trabajaremos ${a.fechaInicio === a.fechaFin ? `el ${cuando}` : cuando}. Tus plazos no cuentan esos días.`;
  return a.mensaje ? `${a.titulo}. ${a.mensaje}` : a.titulo;
}

export const iconoAviso = (tipo: string, size = 18) =>
  tipo === "ANIVERSARIO" ? <LuPartyPopper size={size} /> : tipo === "GENERAL" ? <LuMegaphone size={size} /> : <LuCalendarOff size={size} />;

// ───────────────────────────── piezas básicas

export const Barra = ({ pct, tono }: { pct: number; tono?: "ambar" }) => (
  <div className={`barra${tono ? ` barra--${tono}` : ""}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
    <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
  </div>
);

export function Cabecera({ antetitulo, titulo, bajada, accion, ligero }: { antetitulo?: string; titulo: string; bajada?: ReactNode; accion?: ReactNode; ligero?: boolean }) {
  return (
    <header className="cabecera">
      <div>
        {antetitulo && <div className="antetitulo">{antetitulo}</div>}
        <h1 className={`titulo${ligero ? " titulo--ligero" : ""}`}>{titulo}</h1>
        {bajada && <p className="bajada">{bajada}</p>}
      </div>
      {accion}
    </header>
  );
}

export function Aviso({ icono, titulo, children, tono, elevado }: { icono: ReactNode; titulo?: ReactNode; children?: ReactNode; tono?: "alerta"; elevado?: boolean }) {
  return (
    <div className={`aviso${tono ? ` aviso--${tono}` : ""}${elevado ? " aviso--elevado" : ""}`} role={tono ? "alert" : undefined}>
      {icono}
      <div>
        {titulo && <strong>{titulo}</strong>}
        {children}
      </div>
    </div>
  );
}

/** 11 nov (revisión UX): un esqueleto del contenido en vez de «Cargando…» suelto, para que no parezca colgado. */
export const Cargando = () => (
  <div className="esqueleto" aria-busy="true" aria-live="polite">
    <span className="sr-only">Cargando…</span>
    <span className="esqueleto-linea" style={{ width: "28%", height: 12 }} />
    <span className="esqueleto-linea" style={{ width: "46%", height: 28 }} />
    <span className="esqueleto-linea" style={{ width: "62%", height: 14 }} />
    <div className="esqueleto-tarjetas">
      <span className="esqueleto-bloque" /><span className="esqueleto-bloque" /><span className="esqueleto-bloque" />
    </div>
  </div>
);
export function ErrorCarga({ error, reintentar }: { error: { titulo: string; detalle?: string }; reintentar?: () => void }) {
  return (
    <div className="tarjeta vacio" role="alert">
      <p className="negrita" style={{ color: "var(--c-tinta)" }}>{error.titulo}</p>
      {error.detalle && <p className="texto-sm">{error.detalle}</p>}
      {reintentar && (
        <button className="boton boton--chico" style={{ marginTop: 16 }} onClick={reintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Miniatura de pieza tal como la dibuja Figma: texto de marca a la izquierda y foto a la derecha. */
export function Miniatura({ diseno, alto = 146, foto, grande }: { diseno?: { fondo?: string; titular?: string; bajada?: string; eyebrow?: string; foto?: boolean }; alto?: number; foto?: string; grande?: boolean }) {
  const d = diseno ?? {};
  const conFoto = !!foto && d.foto !== false;
  const escala = grande ? 2.2 : 1;
  return (
    <div className={`mini${d.fondo === "salvia" ? " mini--salvia" : ""}${conFoto ? "" : " mini--texto"}`} style={{ height: alto }}>
      <div className="mini-texto" style={grande ? { padding: "0 24px", gap: 14 } : undefined}>
        {d.eyebrow ? <span className="mini-eyebrow" style={grande ? { fontSize: "var(--t-xs)" } : undefined}>{d.eyebrow}</span> : null}
        <span className="mini-titular" style={{ whiteSpace: "pre-line", ...(grande ? { fontSize: 19 * escala } : {}) }}>
          {d.titular}
        </span>
        {d.bajada && (
          <span className={d.eyebrow ? "mini-eyebrow" : "mini-bajada"} style={grande ? { fontSize: "var(--t-sm)", marginTop: 16 } : undefined}>
            {d.bajada}
          </span>
        )}
      </div>
      {conFoto && <div className="mini-foto" style={{ backgroundImage: `url(${foto})` }} role="img" aria-label="Imagen de la pieza" />}
    </div>
  );
}

export function TarjetaPieza({ p, accion = "Revisar pieza" }: { p: S<"PiezaResumen"> & { formato?: string; diseno?: object }; accion?: string }) {
  return (
    <article className="tarjeta-pieza">
      <Miniatura diseno={p.diseno as never} />
      <div className="tarjeta-pieza-cuerpo">
        <div>
          <EtiquetaPieza p={p} />
        </div>
        <h3 className="tarjeta-pieza-titulo">{p.titulo}</h3>
        <p className="tarjeta-pieza-meta">
          {p.formato} · {p.canal}
        </p>
        <div className="tarjeta-pieza-pie">
          <span>{p.fechaProgramada ? fCortaSegura(p.fechaProgramada) : ""}</span>
          <Enlace a={`/entregables/${p.id}`} className="enlace">
            {accion}
          </Enlace>
        </div>
      </div>
    </article>
  );
}
const MC = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fCortaSegura(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MC[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ───────────────────────────── avisos flotantes y modal

interface Toast {
  id: number;
  titulo: string;
  texto?: string;
}
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => undefined);
export const useAviso = () => useContext(ToastCtx);

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const avisar = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { ...t, id }]);
    setTimeout(() => setLista((l) => l.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toasts" aria-live="polite">
        {lista.map((t) => (
          <div className="toast" key={t.id}>
            <LuCircleCheck size={18} />
            <div>
              <strong>{t.titulo}</strong>
              {t.texto}
            </div>
            <button aria-label="Cerrar aviso" onClick={() => setLista((l) => l.filter((x) => x.id !== t.id))}>
              <LuX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function Modal({ abierto, alCerrar, children, etiqueta, ancho }: { abierto: boolean; alCerrar: () => void; children: ReactNode; etiqueta: string; ancho?: number }) {
  const velo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    // 25 nov: con dos modales abiertos (una confirmación encima de otro), Escape cierra solo el de arriba.
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const todos = document.querySelectorAll(".velo");
      if (todos.length && todos[todos.length - 1] !== velo.current) return;
      alCerrar();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto, alCerrar]);
  if (!abierto) return null;
  return (
    <div className="velo" ref={velo} onClick={alCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={etiqueta} onClick={(e) => e.stopPropagation()} style={ancho ? { width: `min(${ancho}px, 100%)` } : undefined}>
        <button className="modal-cerrar" aria-label="Cerrar" onClick={alCerrar}>
          <LuX size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────────── confirmaciones (23 nov, auditoría Impeccable)

type PedidoConfirmar = { texto: string; accion: string; peligro: boolean; resolver: (ok: boolean) => void };
let mostrarConfirmar: ((p: PedidoConfirmar) => void) | null = null;
const VERBOS_CONFIRMAR: [RegExp, string][] = [
  [/^¿Borrar/, "Borrar"], [/^¿Eliminar/, "Eliminar"], [/^¿Quitar/, "Quitar"], [/^¿Anular/, "Anular"], [/^¿Dar de baja/, "Dar de baja"],
  [/^¿Desactivar/, "Desactivar"], [/^¿Desconectar/, "Desconectar"], [/^¿Sacar/, "Sacar"], [/^¿Detener/, "Detener"], [/^¿Dejar de/, "Dejar de prestar"],
  [/^¿Desarchivar/, "Desarchivar"], [/^¿Crear/, "Crear"], [/^¿Hacer privado/, "Hacerlo privado"], [/^¿Volver/, "Volver a esta versión"],
];
const PELIGROSAS = new Set(["Borrar", "Eliminar", "Quitar", "Anular", "Dar de baja", "Desactivar", "Desconectar", "Sacar"]);
/**
 * Reemplaza a window.confirm con un modal del portal (las confirmaciones del navegador se ven fuera de estilo y no se
 * pueden leer bien en el celular). Devuelve true si la persona confirma. Sin el host montado, usa el del navegador.
 */
export function confirmar(texto: string, o: { accion?: string; peligro?: boolean } = {}): Promise<boolean> {
  const accion = o.accion ?? VERBOS_CONFIRMAR.find(([re]) => re.test(texto))?.[1] ?? "Confirmar";
  const peligro = o.peligro ?? PELIGROSAS.has(accion);
  if (!mostrarConfirmar) return Promise.resolve(typeof window !== "undefined" && window.confirm(texto));
  return new Promise((resolver) => mostrarConfirmar!({ texto, accion, peligro, resolver }));
}
function HostConfirmar() {
  const [p, setP] = useState<PedidoConfirmar | null>(null);
  const cancelar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    mostrarConfirmar = setP;
    return () => { if (mostrarConfirmar === setP) mostrarConfirmar = null; };
  }, []);
  useEffect(() => { if (p) cancelar.current?.focus(); }, [p]);
  const cerrar = useCallback((ok: boolean) => { setP((x) => { x?.resolver(ok); return null; }); }, []);
  const alCerrar = useCallback(() => cerrar(false), [cerrar]);
  const [pregunta, ...resto] = (p?.texto ?? "").split(/(?<=\?)\s+/);
  return (
    <Modal abierto={!!p} alCerrar={alCerrar} etiqueta="Confirmar" ancho={440}>
      <div className="pila" style={{ gap: 10 }}>
        <h2 className="modal-titulo" style={{ paddingRight: 28 }}>{pregunta}</h2>
        {resto.length > 0 && <p className="texto-sm texto-muted">{resto.join(" ")}</p>}
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
          <button ref={cancelar} type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="button" className={`boton ${p?.peligro ? "boton--peligro-lleno" : "boton--primario"}`} onClick={() => cerrar(true)}>{p?.accion}</button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── búsqueda global del equipo (6 nov)

const GRUPO_BUSQUEDA: Record<S<"ResultadoBusqueda">["tipo"], { titulo: string; icono: ReactNode }> = {
  CLIENTE: { titulo: "Clientes", icono: <LuIdCard size={15} /> },
  PROYECTO: { titulo: "Proyectos", icono: <LuLayers size={15} /> },
  TABLERO: { titulo: "Tableros de InooWork", icono: <LuSquareKanban size={15} /> },
  ENTREGABLE: { titulo: "Entregables", icono: <LuFileCheck size={15} /> },
  REQUERIMIENTO: { titulo: "Pedidos al cliente", icono: <LuClipboardList size={15} /> },
  TICKET: { titulo: "Tickets", icono: <LuLifeBuoy size={15} /> },
};

function BuscadorGlobal({ alCerrar }: { alCerrar: () => void }) {
  const { ir } = useNavegacion();
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [activo, setActivo] = useState(0);
  // Espera a que la persona deje de escribir para no pedir en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);
  const r = useConsulta<{ datos: S<"ResultadoBusqueda">[] }>(busqueda.length >= 2 ? `/buscar?q=${encodeURIComponent(busqueda)}` : null);
  const datos = busqueda.length >= 2 ? r.datos?.datos ?? [] : [];
  useEffect(() => setActivo(0), [r.datos]);
  const abrir = (x: S<"ResultadoBusqueda">) => {
    alCerrar();
    ir(x.enlace);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActivo((i) => Math.min(i + 1, datos.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && datos[activo]) { e.preventDefault(); abrir(datos[activo]); }
  };
  const tipos = [...new Set(datos.map((x) => x.tipo))];
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Buscar en el portal" ancho={560}>
      <div className="pila" style={{ gap: 12 }}>
        {/* El título ocupa la fila de la X de cerrar, para que no quede encima de la caja (6 nov). */}
        <h2 className="fila" style={{ fontSize: "var(--t-lg)", fontWeight: 600, gap: 8, margin: 0, paddingRight: 36, minHeight: 28 }}><LuSearch size={17} /> Buscar en el portal</h2>
        <div className="entrada">
          <input aria-label="Buscar en el portal" role="combobox" aria-expanded={datos.length > 0} aria-controls="busqueda-resultados"
            aria-activedescendant={datos[activo] ? `busqueda-${activo}` : undefined}
            placeholder="Busca un cliente, proyecto, entregable, pedido o ticket" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={tecla} autoFocus />
          <span className="icono-campo" aria-hidden><LuSearch size={16} /></span>
        </div>
        <div id="busqueda-resultados" role="listbox" aria-label="Resultados" className="busqueda-resultados">
          {busqueda.length < 2 && <p className="texto-sm texto-muted">Escribe al menos 2 letras. Solo verás lo que te toca.</p>}
          {busqueda.length >= 2 && !r.datos && !r.error && <p className="texto-sm texto-muted">Buscando…</p>}
          {r.error && busqueda.length >= 2 && <p className="texto-sm texto-muted">No pudimos buscar. Intenta de nuevo.</p>}
          {r.datos && busqueda.length >= 2 && !datos.length && <p className="texto-sm texto-muted">No encontramos nada con «{busqueda}».</p>}
          {tipos.map((tipo) => (
            <div key={tipo} role="group" aria-label={GRUPO_BUSQUEDA[tipo].titulo}>
              <p className="texto-xs texto-muted negrita" style={{ margin: "8px 4px 4px", textTransform: "uppercase", letterSpacing: ".04em" }}>{GRUPO_BUSQUEDA[tipo].titulo}</p>
              {datos.map((x, i) => x.tipo === tipo && (
                <button key={`${x.tipo}-${x.id}`} id={`busqueda-${i}`} type="button" role="option" aria-selected={i === activo} className="busqueda-item" onMouseEnter={() => setActivo(i)} onClick={() => abrir(x)}>
                  <span style={{ color: "var(--c-primario)", display: "inline-flex" }} aria-hidden>{GRUPO_BUSQUEDA[tipo].icono}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="negrita" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.titulo}</span>
                    {x.detalle && <span className="texto-xs texto-muted">{x.detalle}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── estructura (barra lateral + superior)

// Reunión del 12 oct 2026: el cliente solo ve sus servicios y lo que tiene por revisar.
// Blog y Plan del mes pasan al equipo; Brief se reemplaza por Requerimientos; Biblioteca entra en
// Paid Media. Usuarios, pagos, correos y ayuda (soporte) están en «Mi cuenta», desde la foto de perfil.
/** Se avisa cuando alguien vio las novedades de una sección, para que el menú recargue sus contadores (20 nov). */
export const EVENTO_NOVEDADES = "inoo:novedades";
/** Marca como vistas las novedades de una sección al abrirla y actualiza el menú. */
export async function verNovedades(modulo: "PANEL" | "TRABAJO") {
  try {
    await api("/me/novedades/vistas", { metodo: "POST", cuerpo: { modulo } });
    window.dispatchEvent(new Event(EVENTO_NOVEDADES));
  } catch {
    /* si falla, el contador queda hasta la próxima visita */
  }
}

const NAV_CLIENTE = [
  { a: "/inicio", texto: "Inicio", icono: <LuHouse /> },
  { a: "/servicios", texto: "Mis proyectos", icono: <LuLayers /> },
  { a: "/entregables", texto: "Entregables por revisar", icono: <LuCircleCheck />, contador: "porAprobar" },
  { a: "/requerimientos", texto: "Requerimientos", icono: <LuClipboardList />, contador: "requerimientos" },
];
const NAV_EQUIPO = [
  // 2 nov: «Panel general» se unió con «Mi panel»; el calendario es de cada colaborador (no solo contenido).
  { a: "/equipo/mi-panel", texto: "Mi panel", icono: <LuUserRound />, contador: "panel" },
  // 12 nov: Mi trabajo, como en Monday (lo asignado a cada uno en todos los tableros).
  { a: "/equipo/mi-trabajo", texto: "Mi trabajo", icono: <LuListChecks />, contador: "trabajo" },
  // 13 nov (auditoría): la bandeja del AM (requerimientos enviados y entregables por enviar o corregir).
  { a: "/equipo/por-revisar", texto: "Por revisar", icono: <LuFileCheck />, contador: "porRevisar" },
  { a: "/equipo/calendario", texto: "Calendario", icono: <LuCalendarDays /> },
  // Jarvis (2 nov): los agentes de IA del equipo por área y el chat con el propio.
  { a: "/equipo/jarvis", texto: "Jarvis", icono: <LuBot /> },
  { a: "/equipo/proyectos", texto: "Proyectos", icono: <LuSquareKanban /> },
  { a: "/equipo/clientes", texto: "Clientes", icono: <LuUsers /> },
  // Empresas (6 nov): Inoo y cada cliente con su gente, proyectos y accesos. No es para quien trabaja por proyecto.
  // 16 nov (Ernesto): lo de «Agencia» pasó al menú del avatar (arriba a la derecha); el lateral queda para el día a día.
  { a: "/equipo/empresas", texto: "Empresas", icono: <LuBuilding2 />, porCuenta: true, enMenu: true },
  { a: "/equipo/organigrama", texto: "Organigrama", icono: <LuNetwork />, enMenu: true },
  { a: "/equipo/personas", texto: "Equipo", icono: <LuUserCog />, permiso: "GESTIONAR_EQUIPO", enMenu: true },
  // 24 nov: pedir lo que falta (todos) y aprobarlo (quien asigna accesos o un lead).
  { a: "/equipo/mis-accesos", texto: "Mis accesos", icono: <LuKeyRound />, enMenu: true },
  { a: "/equipo/accesos", texto: "Pedidos de acceso", icono: <LuShieldCheck />, asigna: true, enMenu: true },
  { a: "/equipo/avisos", texto: "Feriados y avisos", icono: <LuMegaphone />, enMenu: true },
  { a: "/equipo/costos", texto: "Costos de IA", icono: <LuCoins />, permiso: "COSTOS_IA", enMenu: true },
];
/** Lo que cada persona puede ver del menú (por permiso y por su nivel de acceso). */
function navPara(espacio: "cliente" | "equipo", sesion: S<"Sesion"> | null) {
  const nivel = sesion?.usuario.nivelAcceso;
  return (espacio === "cliente" ? NAV_CLIENTE : NAV_EQUIPO)
    .filter((n) => !("permiso" in n) || sesion?.usuario.permisos?.some((x) => x === n.permiso))
    .filter((n) => !("porCuenta" in n) || (!!nivel && nivel !== "PROYECTO"))
    .filter((n) => !("asigna" in n) || !!sesion?.usuario.esLead || !!sesion?.usuario.permisos?.includes("ASIGNAR_ACCESOS"))
    .map((n) => (n.a === "/equipo/clientes" && nivel === "PROYECTO" ? { ...n, texto: "Mis marcas" } : n));
}

// ───────────────────────────── tema (16 nov, Ernesto): claro, oscuro o según el sistema, en este navegador
type Tema = "claro" | "oscuro" | "sistema";
const CLAVE_TEMA = "inoo.tema";
function aplicarTema(t: Tema) {
  if (t === "sistema") delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = t;
}
function SelectorTema() {
  const [tema, setTema] = useState<Tema>("sistema");
  useEffect(() => {
    try { const t = localStorage.getItem(CLAVE_TEMA); if (t === "claro" || t === "oscuro") setTema(t); } catch { /* sin almacenamiento */ }
  }, []);
  const elegir = (t: Tema) => {
    setTema(t);
    aplicarTema(t);
    try { if (t === "sistema") localStorage.removeItem(CLAVE_TEMA); else localStorage.setItem(CLAVE_TEMA, t); } catch { /* solo por esta visita */ }
  };
  const opciones: [Tema, string, ReactNode][] = [["claro", "Claro", <LuSun key="c" size={14} />], ["oscuro", "Oscuro", <LuMoon key="o" size={14} />], ["sistema", "Sistema", <LuMonitor key="s" size={14} />]];
  return (
    <div className="menu-cuenta-tema" role="radiogroup" aria-label="Tema">
      {opciones.map(([t, texto, icono]) => (
        <button key={t} type="button" role="radio" aria-checked={tema === t} className={tema === t ? "activo" : undefined} onClick={() => elegir(t)}>
          {icono}{texto}
        </button>
      ))}
    </div>
  );
}

/** Equipo: elige un cliente para entrar a su ficha, o «Todas las cuentas» para ver la lista. */
function CuentaEquipo({ alNavegar }: { alNavegar?: () => void }) {
  const { ruta, ir } = useNavegacion();
  const todas = usePortal().sesion?.usuario.nivelAcceso === "ADMIN";
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes");
  const actualId = /^\/equipo\/clientes\/([^/?]+)/.exec(ruta)?.[1];
  const actual = clientes.datos?.datos.find((c) => c.id === actualId);
  const lista = (clientes.datos?.datos ?? []).filter((c) => c.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  const elegir = (a: string) => {
    setAbierto(false);
    setQ("");
    alNavegar?.();
    ir(a);
  };
  return (
    <div style={{ position: "relative" }}>
      <button className="cuenta" type="button" aria-label="Cambiar de cuenta" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        <span className="avatar avatar--cuadrado">{actual ? actual.nombre.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "IN"}</span>
        <span>
          <span className="cuenta-nombre" style={{ display: "block" }}>{actual?.nombre ?? "Inoo · Agencia"}</span>
          <span className="cuenta-tipo">{actual ? "Cuenta de cliente" : todas ? "Todas las cuentas" : "Mis cuentas"}</span>
        </span>
        <LuChevronsUpDown className="icono-final" size={14} />
      </button>
      {abierto && (
        <div className="cuenta-menu" role="menu">
          <div className="entrada" style={{ marginBottom: 4 }}>
            <input aria-label="Buscar cliente" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <button role="menuitem" aria-current={!actual} onClick={() => elegir("/equipo/clientes")}>{todas ? "Todas las cuentas" : "Mis cuentas"}</button>
          <div className="cuenta-menu-lista">
            {!clientes.datos && <span className="texto-xs texto-muted" style={{ padding: 8 }}>Cargando…</span>}
            {clientes.datos && !lista.length && <span className="texto-xs texto-muted" style={{ padding: 8 }}>Ningún cliente se llama así</span>}
            {lista.map((c) => (
              <div key={c.id} className="fila entre" style={{ gap: 4 }}>
                {/* 13 nov (auditoría): el nombre abre la ficha (lo esperado); «ver como cliente» va en el ojo. */}
                <button role="menuitem" aria-current={c.id === actualId} style={{ flex: 1 }}
                  title={c.acceso !== "PROYECTOS" ? "Ficha del cliente" : "Ver su portal como el cliente"}
                  onClick={() => c.acceso !== "PROYECTOS" ? elegir(`/equipo/clientes/${c.id}`) : (entrarComoCliente(c.id), setAbierto(false), alNavegar?.(), ir("/inicio"))}>
                  {c.nombre}
                </button>
                <button className="boton-icono" aria-label={`Ver el portal de ${c.nombre} como el cliente`} title="Ver como cliente" onClick={() => { entrarComoCliente(c.id); setAbierto(false); alNavegar?.(); ir("/inicio"); }}>
                  <LuEye size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** «Ver como cliente» (2 nov): recuerda de quién es la vista y que lo que se haga queda firmado. */
function BarraVistaCliente({ cliente, persona }: { cliente: string; persona: string }) {
  const { ir } = useNavegacion();
  const firmado = !!leerSesion()?.vistaCliente;
  return (
    <div className="barra-vista-cliente" role="status">
      <LuEye size={16} />
      <span>
        Estás viendo el portal de <strong>{cliente}</strong> como lo ve el cliente.
        {firmado ? ` Lo que hagas queda firmado como «${persona} (Inoo), en nombre del cliente».` : " Solo puedes mirar: entra desde el selector de cuentas para actuar en su nombre."}
      </span>
      <button className="boton boton--chico" onClick={() => { salirDeVistaCliente(); ir("/equipo/mi-panel"); }}>Volver al equipo</button>
    </div>
  );
}

function CuentaCliente({ clientes }: { clientes: S<"Sesion">["clientes"] }) {
  const [abierto, setAbierto] = useState(false);
  const activo = clientes.find((c) => c.clienteId === clienteActivo()) ?? clientes[0];
  if (!activo) return null;
  const iniciales = activo.nombre.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const contenido = (
    <>
      <span className="avatar avatar--cuadrado avatar--cliente">{iniciales}</span>
      <span>
        <span className="cuenta-nombre" style={{ display: "block" }}>{activo.nombre}</span>
        <span className="cuenta-tipo">Cuenta de cliente</span>
      </span>
    </>
  );
  if (clientes.length < 2) return <div className="cuenta cuenta--fija">{contenido}</div>;
  const elegir = (id: string) => {
    cambiarClienteActivo(id);
    window.location.assign("/inicio");
  };
  return (
    <div style={{ position: "relative" }}>
      <button className="cuenta" type="button" aria-label="Cambiar de cuenta" aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
        {contenido}
        <LuChevronsUpDown className="icono-final" size={14} />
      </button>
      {abierto && (
        <div className="cuenta-menu" role="menu">
          {clientes.map((c) => (
            <button key={c.clienteId} role="menuitem" aria-current={c.clienteId === activo.clienteId} onClick={() => (c.clienteId === activo.clienteId ? setAbierto(false) : elegir(c.clienteId))}>
              {c.nombre}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Lo que le pasó a la persona. Se abre con la campana. */
function ListaNotificaciones({ alCerrar }: { alCerrar: () => void }) {
  const r = useConsulta<{ datos: S<"Notificacion">[] }>("/me/notificaciones");
  const xs = r.datos?.datos ?? [];
  return (
    <div className="tarjeta" role="dialog" aria-label="Notificaciones" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: "min(340px, 86vw)", maxHeight: 420, overflowY: "auto", zIndex: 40, padding: 12, display: "grid", gap: 4 }}>
      <span className="negrita texto-sm" style={{ padding: "2px 6px 6px" }}>Notificaciones</span>
      {r.datos && !xs.length && <span className="texto-sm texto-muted" style={{ padding: "4px 6px 8px" }}>Por ahora no tienes novedades.</span>}
      {!r.datos && !r.error && <span className="texto-xs texto-muted" style={{ padding: 6 }}>Cargando…</span>}
      {r.error && <span className="texto-xs texto-muted" style={{ padding: 6 }}>No pudimos cargarlas.</span>}
      {xs.map((n) => {
        const texto = (
          <>
            <span className={n.leida ? "texto-sm" : "texto-sm negrita"} style={{ display: "block" }}>{n.titulo}</span>
            {n.cuerpo && <span className="texto-xs texto-muted" style={{ display: "block" }}>{n.cuerpo}</span>}
            <span className="texto-xs texto-muted">{fDiaHora(n.creadoEn)}</span>
          </>
        );
        return n.enlace
          ? <Enlace key={n.id} a={n.enlace} onClick={alCerrar} className="boton-lista" style={{ display: "block", padding: "6px", color: "inherit", textDecoration: "none" }}>{texto}</Enlace>
          : <div key={n.id} style={{ padding: 6 }}>{texto}</div>;
      })}
    </div>
  );
}

/** 18 nov (Ernesto): la barra lateral se contrae a solo íconos; se recuerda en el navegador. */
const CLAVE_LATERAL = "inoo.lateral.plegada";
function useLateralPlegada(): [boolean, () => void] {
  const [plegada, setPlegada] = useState(false);
  useEffect(() => {
    try { setPlegada(localStorage.getItem(CLAVE_LATERAL) === "1"); } catch { /* sin almacenamiento */ }
  }, []);
  return [plegada, () => setPlegada((x) => {
    try { localStorage.setItem(CLAVE_LATERAL, x ? "0" : "1"); } catch { /* sin almacenamiento */ }
    return !x;
  })];
}

function Lateral({ espacio, contadores, sesion, aviso, cosmiq, alNavegar, plegada = false, alPlegar }: { espacio: "cliente" | "equipo"; contadores: Record<string, number>; sesion: S<"Sesion"> | null; aviso?: S<"Aviso">; cosmiq?: string | null; alNavegar?: () => void; plegada?: boolean; alPlegar?: () => void }) {
  const { ruta, ir } = useNavegacion();
  // 2 nov: toda el área de Administración (Finanzas incluida) tiene privilegios de ADMIN; por proyecto, «Clientes» son sus marcas.
  // 26 nov: un cliente invitado a tableros los ve en su menú (solo si tiene alguno).
  const compartidos = useConsulta<{ datos: unknown[] }>(espacio === "cliente" && sesion?.usuario.tipo === "CLIENTE" && !leerSesion()?.vistaCliente ? "/tableros" : null);
  const nav = [
    ...navPara(espacio, sesion).filter((n) => !("enMenu" in n)),
    ...((compartidos.datos?.datos.length ?? 0) > 0 ? [{ a: "/invitado", texto: "Tableros compartidos", icono: <LuLayoutGrid /> }] : []),
  ];
  const u = sesion?.usuario;
  const salir = () => {
    cerrarSesion();
    ir("/ingresar");
  };
  return (
    <aside className={`lateral${plegada ? " lateral--plegada" : ""}`} aria-label="Menú principal">
      <div className="lateral-interior">
      {alPlegar && (
        <button type="button" className="boton-icono lateral-plegar" aria-label={plegada ? "Expandir el menú" : "Contraer el menú"} title={plegada ? "Expandir el menú" : "Contraer el menú"} aria-expanded={!plegada} onClick={alPlegar}>
          {plegada ? <LuPanelLeftOpen size={18} /> : <LuPanelLeftClose size={18} />}
        </button>
      )}
      <Enlace a={espacio === "cliente" ? "/inicio" : "/equipo/mi-panel"} className="logo-bloque" aria-label="Ir al inicio" onClick={alNavegar} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
        <span className="logo"><img src="/marca/inoo-negro.svg" alt="INOO" className="logo-marca" width={102} height={30} /></span>
        <span className="logo-sub">{espacio === "cliente" ? "Portal de clientes" : "Espacio de equipo"}</span>
      </Enlace>
      {/* 2 nov: el bloque era de adorno. El equipo lo usa para saltar a la cuenta de un cliente; el cliente ve la
          suya y solo puede cambiar si pertenece a más de una. */}
      {espacio === "cliente" ? <CuentaCliente clientes={sesion?.clientes ?? []} /> : <CuentaEquipo alNavegar={alNavegar} />}
      <nav className="nav" onClick={alNavegar}>
        {nav.map((n, i) => {
          const activo = ruta === n.a || ruta.startsWith(`${n.a}/`) || (n.a === "/equipo/clientes" && ruta.startsWith("/equipo/clientes"));
          const grupo = "grupo" in n ? (n.grupo as string | undefined) : undefined;
          const anterior = i > 0 && "grupo" in nav[i - 1] ? (nav[i - 1] as { grupo?: string }).grupo : undefined;
          return (
            <Fragment key={n.a}>
              {grupo && grupo !== anterior && <span className="nav-grupo">{grupo}</span>}
              <Enlace a={n.a} className="nav-item" aria-current={activo ? "page" : undefined} title={plegada ? n.texto : undefined}>
                {n.icono}
                <span className="nav-texto">{n.texto}</span>
                {"contador" in n && typeof n.contador === "string" && (contadores[n.contador] ?? 0) > 0 && <span className="nav-contador">{contadores[n.contador]}</span>}
              </Enlace>
            </Fragment>
          );
        })}
        {/* Clientes con CRM: su cuenta en Cosmiq, el CRM de Inoo (30 oct). */}
        {espacio === "cliente" && cosmiq && (
          <a href={cosmiq} target="_blank" rel="noreferrer" className="nav-item">
            <LuExternalLink />
            <span>Cosmiq</span>
          </a>
        )}
      </nav>
      {/* 18 nov (Ernesto): la ayuda no va a la mano (sigue en el menú de la foto → Ayuda). El recuadro queda solo para
          avisos: feriados, días no laborables y fechas especiales del cliente. */}
      {espacio === "cliente" ? (aviso ? (
        <div className="ayuda">
          {iconoAviso(aviso.tipo)}
          <strong>{aviso.tipo === "ANIVERSARIO" ? aviso.titulo : TIPO_AVISO[aviso.tipo]}</strong>
          <span>{aviso.tipo === "ANIVERSARIO" ? aviso.mensaje : textoAviso(aviso)}</span>
        </div>
      ) : null) : null}
      <div className="persona">
        {espacio === "cliente" ? (
          <Enlace a="/cuenta" className="avatar" aria-label="Mi cuenta" onClick={alNavegar}>
            {u?.iniciales ?? "··"}
          </Enlace>
        ) : (
          <Enlace a="/equipo/mi-cuenta" className="avatar" aria-label="Mi cuenta" onClick={alNavegar}>
            {u?.iniciales ?? "··"}
          </Enlace>
        )}
        <span>
          <span className="persona-nombre" style={{ display: "block" }}>{u?.nombre ?? ""}</span>
          <span className="persona-cargo">{u?.cargo ?? ""}</span>
        </span>
        <button aria-label="Cerrar sesión" onClick={salir}>
          <LuLogOut size={18} />
        </button>
      </div>
      </div>
    </aside>
  );
}

/**
 * Iniciales de arriba a la derecha: abren «Mi cuenta». Cliente: datos, pagos, usuarios y ayuda. Equipo (6 nov):
 * Mi cuenta, Mi panel, Calendario y Jarvis.
 */
function MenuCuenta({ sesion, espacio = "cliente" }: { sesion: S<"Sesion"> | null; espacio?: "cliente" | "equipo" | "invitado" }) {
  const { ir } = useNavegacion();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: globalThis.MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [abierto]);
  const esAdmin = rolCliente(sesion) === "ADMIN_CLIENTE";
  const opciones = espacio === "invitado" ? [] : espacio === "equipo" ? [
    // 16 nov (Ernesto): sin repetir lo que ya está en el lateral (Mi panel, Calendario, Jarvis).
    { a: "/equipo/mi-cuenta", texto: "Mi cuenta", icono: <LuUserCog size={16} /> },
    { a: "/equipo/boveda", texto: "Mi bóveda", icono: <LuVault size={16} /> },
  ] : [
    { a: "/cuenta", texto: "Mi cuenta", icono: <LuUserCog size={16} /> },
    ...(esAdmin ? [{ a: "/cuenta/pagos", texto: "Pagos", icono: <LuWallet size={16} /> }] : []),
    { a: "/cuenta/usuarios", texto: "Usuarios", icono: <LuUsers size={16} /> },
    { a: "/cuenta/ayuda", texto: "Ayuda", icono: <LuLifeBuoy size={16} /> },
  ];
  const agencia = espacio === "equipo" ? navPara("equipo", sesion).filter((n) => "enMenu" in n) : [];
  const salir = () => {
    cerrarSesion();
    ir("/ingresar");
  };
  return (
    <div className="menu-cuenta" ref={caja}>
      <button type="button" className="avatar avatar--boton" aria-label="Abrir mi cuenta" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        {sesion?.usuario.iniciales ?? ""}
      </button>
      {abierto && (
        <div className="menu-cuenta-caja" role="menu">
          <div className="menu-cuenta-cab">
            <strong>{sesion?.usuario.nombre}</strong>
            <span>{sesion?.usuario.email}</span>
          </div>
          {opciones.map((o) => (
            <Enlace key={o.a} a={o.a} role="menuitem" className="menu-cuenta-item" onClick={() => setAbierto(false)}>
              {o.icono}
              {o.texto}
            </Enlace>
          ))}
          {agencia.length > 0 && <span className="menu-cuenta-grupo">Agencia</span>}
          {agencia.map((o) => (
            <Enlace key={o.a} a={o.a} role="menuitem" className="menu-cuenta-item" onClick={() => setAbierto(false)}>
              {o.icono}
              {o.texto}
            </Enlace>
          ))}
          <span className="menu-cuenta-grupo">Tema</span>
          <SelectorTema />
          <button type="button" role="menuitem" className="menu-cuenta-item menu-cuenta-salir" onClick={salir}>
            <LuLogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

const ContextoPortal = createContext<{ sesion: S<"Sesion"> | null; porAprobar: number; refrescar: () => void }>({ sesion: null, porAprobar: 0, refrescar: () => undefined });
export const usePortal = () => useContext(ContextoPortal);

export function Estructura({ espacio, migas, children, flotante }: { espacio: "cliente" | "equipo"; migas: string; children: ReactNode; flotante?: boolean }) {
  const { ir } = useNavegacion();
  const [menu, setMenu] = useState(false);
  const [plegada, alternarPlegada] = useLateralPlegada();
  const sesionLocal = typeof window !== "undefined" ? leerSesion() : null;
  const me = useConsulta<S<"Sesion">>(sesionLocal ? "/me" : null);
  const inicio = useConsulta<S<"InicioCliente">>(sesionLocal && espacio === "cliente" ? `/clientes/${clienteActivo()}/inicio` : null);
  const porRevisar = useConsulta<{ datos: S<"PorRevisar">[] }>(sesionLocal && espacio === "equipo" ? "/panel/por-revisar" : null);
  // 20 nov (Alonso): cuántas novedades sin ver hay en «Mi panel» y «Mi trabajo»; se recargan al verlas.
  const novedades = useConsulta<{ panel: number; trabajo: number }>(sesionLocal && espacio === "equipo" ? "/me/novedades" : null);
  const recargarNovedades = novedades.recargar;
  useEffect(() => {
    const f = () => void recargarNovedades();
    window.addEventListener(EVENTO_NOVEDADES, f);
    return () => window.removeEventListener(EVENTO_NOVEDADES, f);
  }, [recargarNovedades]);
  const [leidas, setLeidas] = useState(false);

  useEffect(() => {
    const s = leerSesion();
    if (!s) ir("/ingresar");
    // 17 nov: un invitado de afuera solo tiene sus tableros; un aviso al tablero del equipo lo lleva al suyo.
    else if (s.tipo === "INVITADO" || (s.tipo === "CLIENTE" && /^\/equipo\/proyectos\/tableros\//.test(window.location.pathname))) {
      const m = window.location.pathname.match(/^\/equipo\/proyectos\/tableros\/([^/]+)$/);
      ir(m ? `/invitado/tableros/${m[1]}${window.location.search}` : "/invitado");
    } else if (espacio === "equipo" && s.tipo !== "EQUIPO") ir("/inicio");
    // Volver a las pantallas del equipo cierra «Ver como cliente».
    if (espacio === "equipo" && leerSesion()?.vistaCliente) salirDeVistaCliente();
    else if (espacio === "cliente" && leerSesion()?.tipo === "EQUIPO" && !window.location.search.includes("vista=cliente")) {
      /* el equipo puede ver el portal del cliente de prueba */
    }
  }, [espacio, ir]);
  useEffect(() => {
    if (me.error?.status === 401) ir("/ingresar");
  }, [me.error, ir]);
  // La cuenta de pruebas no trabaja: solo elige usuario de prueba (6 nov).
  useEffect(() => {
    if (me.datos?.usuario.esCuentaPruebas) ir("/pruebas");
  }, [me.datos, ir]);

  const porAprobar = inicio.datos?.indicadores.porAprobar ?? 0;
  const contadores = { porAprobar, requerimientos: inicio.datos?.indicadores.requerimientosPendientes ?? 0,
    porRevisar: porRevisar.datos?.datos.filter((x) => pideAccion(x.accion)).length ?? 0,
    panel: novedades.datos?.panel ?? 0, trabajo: novedades.datos?.trabajo ?? 0 };
  const aviso = inicio.datos?.avisos?.[0];
  const sinLeer = !leidas && (me.datos?.notificacionesSinLeer ?? 0) > 0;
  const nombreCuenta = espacio === "cliente" ? inicio.datos?.cuenta?.nombre ?? cuentaActiva(me.datos)?.nombre ?? "" : "Equipo Inoo";
  const comoCliente = espacio === "cliente" && me.datos?.usuario.tipo === "EQUIPO";
  const [campanaAbierta, setCampanaAbierta] = useState(false);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    if (espacio !== "equipo") return;
    const atajo = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando(true);
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, [espacio]);
  const marcarLeidas = async () => {
    setCampanaAbierta((x) => !x);
    setLeidas(true);
    await api("/me/notificaciones/leer", { metodo: "POST", cuerpo: {} }).catch(() => undefined);
  };

  return (
    <ContextoPortal.Provider value={{ sesion: me.datos, porAprobar, refrescar: () => void inicio.recargar() }}>
      <div className={`app${flotante ? " app--flotante" : ""}${plegada ? " app--lateral-plegada" : ""}`}>
        <a href="#contenido" className="saltar">Saltar al contenido</a>
        <Lateral espacio={espacio} contadores={contadores} sesion={me.datos} aviso={aviso} cosmiq={inicio.datos?.cuenta?.enlaceCosmiq} plegada={plegada} alPlegar={alternarPlegada} />
        <div className="principal">
          <div className="superior">
            <div className="fila">
              <button className="boton-menu" aria-label="Abrir menú" onClick={() => setMenu(true)}>
                <LuMenu size={22} />
              </button>
              <Enlace a={espacio === "cliente" ? "/inicio" : "/equipo/mi-panel"} className="logo superior-logo" aria-label="Ir al inicio" style={{ textDecoration: "none" }}>
                <img src="/marca/inoo-negro.svg" alt="INOO" className="logo-marca" width={102} height={30} />
              </Enlace>
              <nav className="migas" aria-label="Ruta">
                <Enlace a={espacio === "cliente" ? "/inicio" : "/equipo/mi-panel"} style={{ color: "inherit", textDecoration: "none" }}>{nombreCuenta}</Enlace>
                <LuChevronRight size={14} color="var(--c-tinta)" />
                <strong>{migas}</strong>
              </nav>
            </div>
            <div className="superior-der">
              {espacio === "equipo" && (
                <button className="campana" aria-label="Buscar (Ctrl+K)" title="Buscar (Ctrl+K)" onClick={() => setBuscando(true)}>
                  <LuSearch size={18} />
                </button>
              )}
              <span style={{ position: "relative", display: "inline-flex" }}>
              <button className="campana" data-sin-leer={sinLeer} aria-label={sinLeer ? "Notificaciones sin leer" : "Notificaciones"} onClick={marcarLeidas}>
                <LuBell size={18} />
              </button>
                {campanaAbierta && <ListaNotificaciones alCerrar={() => setCampanaAbierta(false)} />}
              </span>
              <MenuCuenta sesion={me.datos} espacio={espacio} />
            </div>
          </div>
          {buscando && <BuscadorGlobal alCerrar={() => setBuscando(false)} />}
          <main className="contenido" id="contenido" tabIndex={-1}>
            {me.datos?.usuario.esPrueba && (
              <div className="barra-pruebas" role="status">
                <span><strong>Entorno de pruebas</strong> · estás como {me.datos.usuario.nombre}. Nada de esto toca clientes reales.</span>
                {leerSesion()?.pruebas ? <Enlace a="/pruebas" className="enlace texto-sm negrita">Cambiar de usuario de prueba</Enlace> : null}
              </div>
            )}
            {comoCliente && <BarraVistaCliente cliente={nombreCuenta} persona={me.datos!.usuario.nombre} />}
            {children}
          </main>
        </div>
      </div>
      {menu && (
        <div className="cajon" onClick={() => setMenu(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Lateral espacio={espacio} contadores={contadores} sesion={me.datos} aviso={aviso} cosmiq={inicio.datos?.cuenta?.enlaceCosmiq} alNavegar={() => setMenu(false)} />
            <button className="modal-cerrar" style={{ position: "fixed", left: "min(280px, 78vw)", top: 24, zIndex: 51 }} aria-label="Cerrar menú" onClick={() => setMenu(false)}>
              <LuX size={18} />
            </button>
          </div>
        </div>
      )}
      <HostConfirmar />
    </ContextoPortal.Provider>
  );
}

/**
 * El espacio de un invitado de afuera (17 nov): sin menú lateral, solo sus tableros compartidos. Arriba, el logo, su
 * nombre y el menú con el tema y cerrar sesión.
 */
export function EstructuraInvitado({ migas, children }: { migas: string; children: ReactNode }) {
  const { ir } = useNavegacion();
  const sesionLocal = typeof window !== "undefined" ? leerSesion() : null;
  const me = useConsulta<S<"Sesion">>(sesionLocal ? "/me" : null);
  useEffect(() => {
    const s = leerSesion();
    if (!s) ir(`/ingresar`);
    else if (s.tipo === "EQUIPO") ir("/equipo/proyectos");
    else if (s.tipo !== "INVITADO" && s.tipo !== "CLIENTE") ir("/inicio");
  }, [ir]);
  useEffect(() => {
    if (me.error?.status === 401) ir("/ingresar");
  }, [me.error, ir]);
  return (
    <ContextoPortal.Provider value={{ sesion: me.datos, porAprobar: 0, refrescar: () => undefined }}>
      <div className="app app--invitado">
        <div className="principal">
          <div className="superior">
            <div className="fila">
              <Enlace a="/invitado" className="logo" aria-label="Ir a mis tableros" style={{ textDecoration: "none" }}>
                <img src="/marca/inoo-negro.svg" alt="INOO" className="logo-marca" width={102} height={30} />
              </Enlace>
              <nav className="migas" aria-label="Ruta">
                <Enlace a="/invitado" style={{ color: "inherit", textDecoration: "none" }}>Tableros compartidos</Enlace>
                <LuChevronRight size={14} color="var(--c-tinta)" />
                <strong>{migas}</strong>
              </nav>
            </div>
            <div className="superior-der">
              {me.datos?.usuario.tipo === "CLIENTE" && <Enlace a="/inicio" className="boton boton--chico">Volver a mi portal</Enlace>}
              <MenuCuenta sesion={me.datos} espacio="invitado" />
            </div>
          </div>
          <main className="contenido" id="contenido" tabIndex={-1}>{children}</main>
        </div>
      </div>
    </ContextoPortal.Provider>
  );
}

/**
 * «Pedir cambios» en su propio modal (13 nov, auditoría): antes dependía de un cuadro de texto en otra tarjeta, o
 * compartido con «Aprobar». Pide qué cambiar antes de enviar.
 */
export function ModalPedirCambios({ abierto, titulo, alCerrar, alEnviar }: { abierto: boolean; titulo: string; alCerrar: () => void; alEnviar: (texto: string) => Promise<void> }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enviar = async () => {
    if (texto.trim().length < 5) {
      setError("Cuéntanos qué te gustaría cambiar.");
      return;
    }
    setError(null);
    setOcupado(true);
    try {
      await alEnviar(texto.trim());
      setTexto("");
      alCerrar();
    } catch (e) {
      setError(e instanceof ProblemaApi ? e.titulo : "No pudimos enviarlo. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Pedir cambios">
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Pedir cambios</h2>
      <p className="texto-sm texto-muted">{titulo}</p>
      <div className="campo">
        <label htmlFor="pedir-cambios">¿Qué te gustaría cambiar?</label>
        <div className="entrada">
          <textarea id="pedir-cambios" rows={4} value={texto} onChange={(e) => setTexto(e.target.value)} aria-invalid={!!error} autoFocus placeholder="Ej.: cambien el fondo por uno más claro y agranden el logo" />
        </div>
        <span className="ayuda-campo" role={error ? "alert" : undefined} style={error ? { color: "var(--c-alerta)" } : undefined}>
          {error ?? "Tu equipo Inoo recibe tus comentarios y prepara una nueva versión."}
        </span>
      </div>
      <button className="boton boton--primario boton--bloque" disabled={ocupado} onClick={() => void enviar()}>Enviar cambios</button>
    </Modal>
  );
}

/**
 * Un texto con sus enlaces clicables, que abren en otra pestaña (17 nov; desde el 24 nov en respuestas de formularios,
 * comentarios y notas). Reconoce http(s) y también «www.…» sin el protocolo. Respeta los saltos de línea.
 */
export function TextoConEnlaces({ texto }: { texto: string }) {
  const partes = texto.split(/((?:https?:\/\/|www\.)[^\s<>"']+)/gi);
  return (
    <span style={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
      {partes.map((x, i) => {
        if (i % 2 === 0) return x;
        const m = x.match(/^(.*?)([.,;:!?)\]»]*)$/);
        const url = m ? m[1] : x;
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        const visible = url.length > 64 ? `${url.slice(0, 61)}…` : url;
        return <span key={i}><a href={href} target="_blank" rel="noopener noreferrer" className="enlace" title={href}>{visible}</a>{m?.[2] ?? ""}</span>;
      })}
    </span>
  );
}
