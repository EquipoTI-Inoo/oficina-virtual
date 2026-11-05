"use client";
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  LuBell, LuChartNoAxesColumnIncreasing, LuChevronRight, LuChevronsUpDown, LuCircleCheck, LuHouse, LuLayers, LuLogOut, LuMenu, LuShieldCheck, LuSquareKanban, LuUserRound, LuExternalLink, LuBot, LuEye, LuIdCard,
  LuSparkles, LuUsers, LuX, LuCalendarDays, LuInstagram, LuVideo, LuMegaphone, LuGlobe, LuSquareUser,
  LuUserCog, LuNetwork, LuCoins, LuPalette, LuPlug, LuLifeBuoy, LuWallet, LuClipboardList, LuCalendarOff, LuPartyPopper,
} from "react-icons/lu";
import { api, cambiarClienteActivo, cerrarSesion, clienteActivo, entrarComoCliente, salirDeVistaCliente, Enlace, fCorta, fHoyLargo, leerSesion, useConsulta, useNavegacion, type S } from "./base";

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
  const esCliente = leerSesion()?.tipo === "CLIENTE";
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
        <span className="texto-xs" style={{ color: "var(--c-alerta)", fontSize: 10.5 }}>
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

export const Cargando = () => <div className="cargando" aria-busy="true">Cargando…</div>;
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
export function Miniatura({ diseno, alto = 146, foto = "/muestras/serum.jpg", grande }: { diseno?: { fondo?: string; titular?: string; bajada?: string; eyebrow?: string; foto?: boolean }; alto?: number; foto?: string; grande?: boolean }) {
  const d = diseno ?? {};
  const conFoto = d.foto !== false;
  const escala = grande ? 2.2 : 1;
  return (
    <div className={`mini${d.fondo === "salvia" ? " mini--salvia" : ""}${conFoto ? "" : " mini--texto"}`} style={{ height: alto }}>
      <div className="mini-texto" style={grande ? { padding: "0 24px", gap: 14 } : undefined}>
        {d.eyebrow ? (
          <span className="mini-eyebrow" style={grande ? { fontSize: 12 } : undefined}>{d.eyebrow}</span>
        ) : (
          <span className="mini-marca" style={grande ? { fontSize: 15 } : undefined}>casa oliva</span>
        )}
        <span className="mini-titular" style={{ whiteSpace: "pre-line", ...(grande ? { fontSize: 19 * escala } : {}) }}>
          {d.titular}
        </span>
        {d.bajada && (
          <span className={d.eyebrow ? "mini-eyebrow" : "mini-bajada"} style={grande ? { fontSize: 12.5, marginTop: 16 } : undefined}>
            {d.bajada}
          </span>
        )}
      </div>
      {conFoto && <div className="mini-foto" style={{ backgroundImage: `url(${foto})` }} role="img" aria-label="Producto Casa Oliva" />}
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
            {accion} →
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
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto, alCerrar]);
  if (!abierto) return null;
  return (
    <div className="velo" onClick={alCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={etiqueta} onClick={(e) => e.stopPropagation()} style={ancho ? { width: `min(${ancho}px, 100%)` } : undefined}>
        <button className="modal-cerrar" aria-label="Cerrar" onClick={alCerrar}>
          <LuX size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────────── estructura (barra lateral + superior)

// Reunión del 12 oct 2026: el cliente solo ve sus servicios y lo que tiene por revisar.
// Blog y Plan del mes pasan al equipo; Brief se reemplaza por Requerimientos; Biblioteca entra en
// Paid Media. Usuarios, pagos, correos y ayuda (soporte) están en «Mi cuenta», desde la foto de perfil.
const NAV_CLIENTE = [
  { a: "/inicio", texto: "Inicio", icono: <LuHouse /> },
  { a: "/servicios", texto: "Mis servicios", icono: <LuLayers /> },
  { a: "/entregables", texto: "Entregables por revisar", icono: <LuCircleCheck />, contador: "porAprobar" },
  { a: "/requerimientos", texto: "Requerimientos", icono: <LuClipboardList />, contador: "requerimientos" },
];
const NAV_EQUIPO = [
  // 2 nov: «Panel general» se unió con «Mi panel»; el calendario es de cada colaborador (no solo contenido).
  { a: "/equipo/mi-panel", texto: "Mi panel", icono: <LuUserRound /> },
  { a: "/equipo/calendario", texto: "Calendario", icono: <LuCalendarDays /> },
  // Jarvis (2 nov): los agentes de IA del equipo por área y el chat con el propio.
  { a: "/equipo/jarvis", texto: "Jarvis", icono: <LuBot /> },
  { a: "/equipo/proyectos", texto: "Proyectos", icono: <LuSquareKanban /> },
  { a: "/equipo/clientes", texto: "Clientes", icono: <LuUsers /> },
  { a: "/equipo/organigrama", texto: "Organigrama", icono: <LuNetwork />, grupo: "Agencia" },
  { a: "/equipo/personas", texto: "Equipo", icono: <LuUserCog />, permiso: "GESTIONAR_EQUIPO" },
  { a: "/equipo/avisos", texto: "Feriados y avisos", icono: <LuMegaphone /> },
  { a: "/equipo/costos", texto: "Costos de IA", icono: <LuCoins />, permiso: "COSTOS_IA" },
];

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
                <button role="menuitem" aria-current={c.id === actualId} style={{ flex: 1 }} title="Ver su portal como el cliente" onClick={() => { entrarComoCliente(c.id); setAbierto(false); alNavegar?.(); ir("/inicio"); }}>
                  {c.nombre}
                </button>
                {c.acceso !== "PROYECTOS" && (
                  <button className="boton-icono" aria-label={`Ficha de ${c.nombre}`} title="Ficha del cliente" onClick={() => elegir(`/equipo/clientes/${c.id}`)}>
                    <LuIdCard size={14} />
                  </button>
                )}
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

function Lateral({ espacio, contadores, sesion, aviso, cosmiq, alNavegar }: { espacio: "cliente" | "equipo"; contadores: Record<string, number>; sesion: S<"Sesion"> | null; aviso?: S<"Aviso">; cosmiq?: string | null; alNavegar?: () => void }) {
  const { ruta, ir } = useNavegacion();
  // 2 nov: toda el área de Administración (Finanzas incluida) tiene privilegios de ADMIN; por proyecto, «Clientes» son sus marcas.
  const nivel = sesion?.usuario.nivelAcceso;
  const nav = (espacio === "cliente" ? NAV_CLIENTE : NAV_EQUIPO)
    .filter((n) => !("permiso" in n) || sesion?.usuario.permisos?.some((x) => x === n.permiso))
    .map((n) => (n.a === "/equipo/clientes" && nivel === "PROYECTO" ? { ...n, texto: "Mis marcas" } : n));
  const u = sesion?.usuario;
  const salir = () => {
    cerrarSesion();
    ir("/ingresar");
  };
  return (
    <aside className="lateral" aria-label="Menú principal">
      <div className="lateral-interior">
      <Enlace a={espacio === "cliente" ? "/inicio" : "/equipo/mi-panel"} className="logo-bloque" aria-label="Ir al inicio" onClick={alNavegar} style={{ display: "block", color: "inherit", textDecoration: "none" }}>
        <span className="logo">{/* 2 nov: la marca de InooWork */}<img src="/marca/inoo.jpg" alt="" className="logo-marca" width={34} height={34} />inoo</span>
        <span className="logo-sub">{espacio === "cliente" ? "Portal de clientes" : "Espacio de equipo"}</span>
      </Enlace>
      {/* 2 nov: el bloque era de adorno. El equipo lo usa para saltar a la cuenta de un cliente; el cliente ve la
          suya y solo puede cambiar si pertenece a más de una. */}
      {espacio === "cliente" ? <CuentaCliente clientes={sesion?.clientes ?? []} /> : <CuentaEquipo alNavegar={alNavegar} />}
      <nav className="nav" onClick={alNavegar}>
        {nav.map((n, i) => {
          const activo = ruta === n.a || ruta.startsWith(`${n.a}/`) || (n.a === "/equipo/clientes" && ruta.startsWith("/equipo/clientes"));
          const grupo = "grupo" in n ? n.grupo : undefined;
          const anterior = i > 0 && "grupo" in nav[i - 1] ? (nav[i - 1] as { grupo?: string }).grupo : undefined;
          return (
            <Fragment key={n.a}>
              {grupo && grupo !== anterior && <span className="nav-grupo">{grupo}</span>}
              <Enlace a={n.a} className="nav-item" aria-current={activo ? "page" : undefined}>
                {n.icono}
                <span>{n.texto}</span>
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
      {espacio === "cliente" ? (
        <div className="ayuda">
          {aviso ? iconoAviso(aviso.tipo) : <LuSparkles size={18} />}
          <strong>{aviso?.tipo === "ANIVERSARIO" ? aviso.titulo : aviso ? TIPO_AVISO[aviso.tipo] : "Estamos contigo."}</strong>
          {/* El recuadro sirve para comunicar feriados, días no laborables y fechas especiales del cliente. */}
          <span>{aviso ? (aviso.tipo === "ANIVERSARIO" ? aviso.mensaje : textoAviso(aviso)) : "Tu equipo Inoo, a un mensaje de distancia."}</span>
          <Enlace a="/cuenta/ayuda" className="enlace">
            Contactar a mi equipo →
          </Enlace>
        </div>
      ) : (
        <div className="ayuda">
          <LuShieldCheck size={18} />
          <strong>Gestión interna</strong>
          <span>Clientes, producción y costos de IA. Solo para el equipo de agencia.</span>
        </div>
      )}
      <div className="persona">
        {espacio === "cliente" ? (
          <Enlace a="/cuenta" className="avatar" aria-label="Mi cuenta" onClick={alNavegar}>
            {u?.iniciales ?? "··"}
          </Enlace>
        ) : (
          <span className="avatar">{u?.iniciales ?? "··"}</span>
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

/** Foto de perfil del cliente: abre «Mi cuenta» (datos, pagos, usuarios, correos y ayuda). */
function MenuCuenta({ sesion }: { sesion: S<"Sesion"> | null }) {
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
  const esAdmin = sesion?.clientes[0]?.rol === "ADMIN_CLIENTE";
  const opciones = [
    { a: "/cuenta", texto: "Mi cuenta", icono: <LuUserCog size={16} /> },
    ...(esAdmin ? [{ a: "/cuenta/pagos", texto: "Pagos", icono: <LuWallet size={16} /> }] : []),
    { a: "/cuenta/usuarios", texto: "Usuarios", icono: <LuUsers size={16} /> },
    { a: "/cuenta/ayuda", texto: "Ayuda", icono: <LuLifeBuoy size={16} /> },
  ];
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
  const sesionLocal = typeof window !== "undefined" ? leerSesion() : null;
  const me = useConsulta<S<"Sesion">>(sesionLocal ? "/me" : null);
  const inicio = useConsulta<S<"InicioCliente">>(sesionLocal && espacio === "cliente" ? `/clientes/${clienteActivo()}/inicio` : null);
  const [leidas, setLeidas] = useState(false);

  useEffect(() => {
    if (!leerSesion()) ir("/ingresar");
    else if (espacio === "equipo" && leerSesion()?.tipo !== "EQUIPO") ir("/inicio");
    // Volver a las pantallas del equipo cierra «Ver como cliente».
    if (espacio === "equipo" && leerSesion()?.vistaCliente) salirDeVistaCliente();
    else if (espacio === "cliente" && leerSesion()?.tipo === "EQUIPO" && !window.location.search.includes("vista=cliente")) {
      /* el equipo puede ver el portal del cliente de prueba */
    }
  }, [espacio, ir]);
  useEffect(() => {
    if (me.error?.status === 401) ir("/ingresar");
  }, [me.error, ir]);

  const porAprobar = inicio.datos?.indicadores.porAprobar ?? 0;
  const contadores = { porAprobar, requerimientos: inicio.datos?.indicadores.requerimientosPendientes ?? 0 };
  const aviso = inicio.datos?.avisos?.[0];
  const sinLeer = !leidas && (me.datos?.notificacionesSinLeer ?? 0) > 0;
  const nombreCuenta = espacio === "cliente" ? inicio.datos?.cuenta?.nombre ?? me.datos?.clientes[0]?.nombre ?? "Casa Oliva" : "Equipo Inoo";
  const comoCliente = espacio === "cliente" && me.datos?.usuario.tipo === "EQUIPO";
  const marcarLeidas = async () => {
    setLeidas(true);
    await api("/me/notificaciones/leer", { metodo: "POST", cuerpo: {} }).catch(() => undefined);
  };

  return (
    <ContextoPortal.Provider value={{ sesion: me.datos, porAprobar, refrescar: () => void inicio.recargar() }}>
      <div className={`app${flotante ? " app--flotante" : ""}`}>
        <Lateral espacio={espacio} contadores={contadores} sesion={me.datos} aviso={aviso} cosmiq={inicio.datos?.cuenta?.enlaceCosmiq} />
        <div className="principal">
          <div className="superior">
            <div className="fila">
              <button className="boton-menu" aria-label="Abrir menú" onClick={() => setMenu(true)}>
                <LuMenu size={22} />
              </button>
              <Enlace a={espacio === "cliente" ? "/inicio" : "/equipo/mi-panel"} className="logo superior-logo" aria-label="Ir al inicio" style={{ textDecoration: "none" }}>
                <img src="/marca/inoo.jpg" alt="" className="logo-marca" width={34} height={34} />inoo
              </Enlace>
              <nav className="migas" aria-label="Ruta">
                <span>{nombreCuenta}</span>
                <LuChevronRight size={14} color="var(--c-tinta)" />
                <strong>{migas}</strong>
              </nav>
            </div>
            <div className="superior-der">
              <span className="periodo">Octubre 2026</span>
              <button className="campana" data-sin-leer={sinLeer} aria-label={sinLeer ? "Notificaciones sin leer" : "Notificaciones"} onClick={marcarLeidas}>
                <LuBell size={18} />
              </button>
              {espacio === "cliente" ? <MenuCuenta sesion={me.datos} /> : <span className="avatar">{me.datos?.usuario.iniciales ?? ""}</span>}
            </div>
          </div>
          <main className="contenido">
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
    </ContextoPortal.Provider>
  );
}
