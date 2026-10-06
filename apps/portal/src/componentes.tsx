"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  LuBell, LuChartNoAxesColumnIncreasing, LuChevronRight, LuChevronsUpDown, LuCircleCheck, LuColumns3, LuFileText,
  LuFolder, LuHeadphones, LuHouse, LuLayers, LuLayoutGrid, LuListChecks, LuLogOut, LuMenu, LuShieldCheck,
  LuSparkles, LuUsers, LuX, LuCalendarDays, LuInstagram, LuImage, LuVideo, LuMegaphone, LuGlobe, LuSquareUser,
} from "react-icons/lu";
import { api, cerrarSesion, clienteActivo, Enlace, leerSesion, useConsulta, useNavegacion, type S } from "./base";

// ───────────────────────────── etiquetas de estado (Figma: «Etiquetas de estado»)

type Tono = "violeta" | "verde" | "ambar" | "azul" | "gris";
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
  MARKETING: "Marketing", DISENO: "Diseño", WEB: "Web", FACTURACION: "Facturación", OTRO: "Otro",
};

export function Etiqueta({ tono = "gris", children, sinPunto }: { tono?: Tono; children: ReactNode; sinPunto?: boolean }) {
  return <span className={`etiqueta etiqueta--${tono}${sinPunto ? " etiqueta--sin-punto" : ""}`}>{children}</span>;
}
export function EtiquetaEstado({ estado, mapa = ESTADO_PIEZA }: { estado: string; mapa?: Record<string, [string, Tono]> }) {
  const [texto, tono] = mapa[estado] ?? [estado, "gris"];
  return <Etiqueta tono={tono}>{texto}</Etiqueta>;
}

export const ICONO_SERVICIO: Record<string, ReactNode> = {
  BLOG: <LuFileText size={18} />,
  REDES_SOCIALES: <LuInstagram size={18} />,
  ESTATICOS: <LuImage size={18} />,
  AUDIOVISUAL: <LuVideo size={18} />,
  PAID_MEDIA: <LuMegaphone size={18} />,
  WEB: <LuGlobe size={18} />,
  CRM: <LuSquareUser size={18} />,
};

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
          <EtiquetaEstado estado={p.estado} />
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

export function Modal({ abierto, alCerrar, children, etiqueta }: { abierto: boolean; alCerrar: () => void; children: ReactNode; etiqueta: string }) {
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [abierto, alCerrar]);
  if (!abierto) return null;
  return (
    <div className="velo" onClick={alCerrar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={etiqueta} onClick={(e) => e.stopPropagation()}>
        <button className="modal-cerrar" aria-label="Cerrar" onClick={alCerrar}>
          <LuX size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────────── estructura (barra lateral + superior)

const NAV_CLIENTE = [
  { a: "/inicio", texto: "Inicio", icono: <LuHouse /> },
  { a: "/servicios", texto: "Servicios contratados", icono: <LuLayers /> },
  { a: "/entregables", texto: "Entregables por revisar", icono: <LuCircleCheck />, contador: true },
  { a: "/blog", texto: "Blog", icono: <LuFileText /> },
  { a: "/calendario", texto: "Calendario del mes", icono: <LuCalendarDays /> },
  { a: "/brief", texto: "Brief y referencias", icono: <LuFolder /> },
  { a: "/resultados", texto: "Resultados", icono: <LuChartNoAxesColumnIncreasing /> },
  { a: "/avance", texto: "Avance de proyectos", icono: <LuListChecks /> },
  { a: "/soporte", texto: "Soporte", icono: <LuHeadphones /> },
];
const NAV_EQUIPO = [
  { a: "/equipo/panel", texto: "Panel general", icono: <LuLayoutGrid /> },
  { a: "/equipo/clientes", texto: "Clientes", icono: <LuUsers /> },
  { a: "/equipo/produccion", texto: "Bandeja de producción", icono: <LuColumns3 /> },
];

function Lateral({ espacio, porAprobar, sesion, alNavegar }: { espacio: "cliente" | "equipo"; porAprobar: number; sesion: S<"Sesion"> | null; alNavegar?: () => void }) {
  const { ruta, ir } = useNavegacion();
  const nav = espacio === "cliente" ? NAV_CLIENTE : NAV_EQUIPO;
  const u = sesion?.usuario;
  const salir = () => {
    cerrarSesion();
    ir("/ingresar");
  };
  return (
    <aside className="lateral" aria-label="Menú principal">
      <div className="lateral-interior">
      <div className="logo-bloque">
        <span className="logo">inoo</span>
        <span className="logo-sub">{espacio === "cliente" ? "Portal de clientes" : "Espacio de equipo"}</span>
      </div>
      <button className="cuenta" type="button" aria-label="Cambiar de cuenta">
        <span className={`avatar avatar--cuadrado${espacio === "cliente" ? " avatar--cliente" : ""}`}>{espacio === "cliente" ? "CO" : "IN"}</span>
        <span>
          <span className="cuenta-nombre" style={{ display: "block" }}>{espacio === "cliente" ? sesion?.clientes[0]?.nombre ?? "Casa Oliva" : "Inoo · Agencia"}</span>
          <span className="cuenta-tipo">{espacio === "cliente" ? "Cuenta de cliente" : "Todas las cuentas"}</span>
        </span>
        {espacio === "cliente" && <LuChevronsUpDown className="icono-final" size={14} />}
      </button>
      <nav className="nav" onClick={alNavegar}>
        {nav.map((n) => {
          const activo = ruta === n.a || ruta.startsWith(`${n.a}/`) || (n.a === "/equipo/clientes" && ruta.startsWith("/equipo/clientes"));
          return (
            <Enlace key={n.a} a={n.a} className="nav-item" aria-current={activo ? "page" : undefined}>
              {n.icono}
              <span>{n.texto}</span>
              {"contador" in n && n.contador && porAprobar > 0 && <span className="nav-contador">{porAprobar}</span>}
            </Enlace>
          );
        })}
      </nav>
      {espacio === "cliente" ? (
        <div className="ayuda">
          <LuSparkles size={18} />
          <strong>Estamos contigo.</strong>
          <span>Tu equipo Inoo, a un mensaje de distancia.</span>
          <Enlace a="/soporte/nuevo" className="enlace">
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
        <span className="avatar">{u?.iniciales ?? "··"}</span>
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
    else if (espacio === "cliente" && leerSesion()?.tipo === "EQUIPO" && !window.location.search.includes("vista=cliente")) {
      /* el equipo puede ver el portal del cliente de prueba */
    }
  }, [espacio, ir]);
  useEffect(() => {
    if (me.error?.status === 401) ir("/ingresar");
  }, [me.error, ir]);

  const porAprobar = inicio.datos?.indicadores.porAprobar ?? 0;
  const sinLeer = !leidas && (me.datos?.notificacionesSinLeer ?? 0) > 0;
  const nombreCuenta = espacio === "cliente" ? me.datos?.clientes[0]?.nombre ?? "Casa Oliva" : "Equipo Inoo";
  const marcarLeidas = async () => {
    setLeidas(true);
    await api("/me/notificaciones/leer", { metodo: "POST", cuerpo: {} }).catch(() => undefined);
  };

  return (
    <ContextoPortal.Provider value={{ sesion: me.datos, porAprobar, refrescar: () => void inicio.recargar() }}>
      <div className={`app${flotante ? " app--flotante" : ""}`}>
        <Lateral espacio={espacio} porAprobar={porAprobar} sesion={me.datos} />
        <div className="principal">
          <div className="superior">
            <div className="fila">
              <button className="boton-menu" aria-label="Abrir menú" onClick={() => setMenu(true)}>
                <LuMenu size={22} />
              </button>
              <span className="logo superior-logo">inoo</span>
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
              <span className="avatar">{me.datos?.usuario.iniciales ?? ""}</span>
            </div>
          </div>
          <main className="contenido">{children}</main>
        </div>
      </div>
      {menu && (
        <div className="cajon" onClick={() => setMenu(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Lateral espacio={espacio} porAprobar={porAprobar} sesion={me.datos} alNavegar={() => setMenu(false)} />
            <button className="modal-cerrar" style={{ position: "fixed", left: "min(280px, 78vw)", top: 24, zIndex: 51 }} aria-label="Cerrar menú" onClick={() => setMenu(false)}>
              <LuX size={18} />
            </button>
          </div>
        </div>
      )}
    </ContextoPortal.Provider>
  );
}
