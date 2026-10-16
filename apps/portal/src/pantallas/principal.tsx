"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  LuArrowRight, LuCheck, LuChevronDown, LuChevronLeft, LuChevronRight,
  LuCircleCheck, LuDownload, LuEyeOff, LuEye, LuInfo, LuLayers, LuMail, LuMessageSquare,
  LuClipboardList, LuExternalLink, LuSearch, LuShieldCheck, LuSparkles, LuWallet,
} from "react-icons/lu";
import {
  api, clienteActivo, Enlace, fCorta, fDiaHora, fDiaMes, fHoyLargo, guardarSesion, HOY_DEMO, leerSesion, ProblemaApi,
  useConsulta, useNavegacion, type S,
} from "../base";
import {
  AvanceLineal, Aviso, Barra, Cabecera, Cargando, detalleServicio, ErrorCarga, Estructura, Etiqueta, EtiquetaPieza, ICONO_SERVICIO, Miniatura, Modal,
  TarjetaPieza, useAviso, usePortal,
} from "../componentes";
import { AvisosInicio } from "./avisos";
import { ETIQUETA_ESTADO_SERVICIO } from "../dominio/equipo";

type PiezaUI = S<"PiezaResumen"> & { formato?: string; diseno?: { fondo?: string; titular?: string; bajada?: string; eyebrow?: string; foto?: boolean } };

// ═════════════════════════════════════════════ Ingreso

export function PantallaIngreso() {
  const { ir } = useNavegacion();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const s = leerSesion();
    if (s) ir(s.tipo === "EQUIPO" ? "/equipo/panel" : "/inicio");
  }, [ir]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await api<{ token: string; tipo: "CLIENTE" | "EQUIPO"; clienteId: string | null }>("/__pruebas/ingresar", { metodo: "POST", cuerpo: { email, clave } });
      guardarSesion({ token: r.token, tipo: r.tipo, clienteId: r.clienteId }, recordar);
      ir(r.tipo === "EQUIPO" ? "/equipo/panel" : "/inicio");
    } catch (err) {
      setError((err as ProblemaApi).titulo);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ingreso">
      <section className="ingreso-izq">
        <div>
          <span className="logo">inoo</span>
          <span className="logo-sub">Portal de clientes</span>
        </div>
        <div style={{ marginTop: 64 }}>
          <div className="antetitulo">Tu marca, siempre cerca</div>
          <h1>
            Un mismo espacio.
            <br />
            Todo lo que creamos.
          </h1>
          <p className="bajada" style={{ fontSize: 16, marginTop: 24, maxWidth: 590, lineHeight: 1.6 }}>
            Revisa tus contenidos, acompaña cada proyecto y descubre cómo crece tu marca con Inoo.
          </p>
        </div>
        <div className="tarjeta" style={{ marginTop: 56, maxWidth: 596, padding: 32, borderRadius: 24 }}>
          <div className="fila entre">
            <span className="icono-caja" style={{ width: 48, height: 48 }}>
              <LuSparkles size={22} />
            </span>
            <Etiqueta tono="verde">Creando juntos</Etiqueta>
          </div>
          <p style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.6, marginTop: 20 }}>
            Ideas que avanzan.
            <br />
            Una marca que conecta.
          </p>
          <div style={{ marginTop: 22 }}>
            <Barra pct={72} />
          </div>
          <div className="grid-3" style={{ marginTop: 16, fontSize: 12, color: "var(--c-muted)" }}>
            {["Comparte", "Revisa", "Crece"].map((t) => (
              <span key={t} style={{ display: "grid", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--c-primario)" }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <p className="texto-xs texto-muted" style={{ marginTop: "auto", paddingTop: 48 }}>
          Marketing digital hecho en Perú. Pensado para tu marca.
        </p>
      </section>

      <section className="ingreso-der">
        <p className="texto-xs texto-muted" style={{ textAlign: "right", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 74, width: "min(480px, 100%)" }}>
          Portal de clientes
        </p>
        <form className="ingreso-form" onSubmit={enviar} noValidate>
          <div>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}>Qué bueno tenerte aquí.</h2>
            <p className="texto-muted" style={{ marginTop: 12, fontSize: 13.5 }}>
              Ingresa a tu cuenta para seguir creando con tu equipo Inoo.
            </p>
          </div>
          <div className="campo">
            <label htmlFor="email">Correo electrónico</label>
            <div className="entrada">
              <input id="email" type="email" autoComplete="email" placeholder="tu@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <span className="icono-campo">
                <LuMail size={18} />
              </span>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <div className="entrada">
              <input id="clave" type={ver ? "text" : "password"} autoComplete="current-password" placeholder="Ingresa tu contraseña" value={clave} onChange={(e) => setClave(e.target.value)} required />
              <button type="button" className="icono-campo" aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVer(!ver)}>
                {ver ? <LuEye size={18} /> : <LuEyeOff size={18} />}
              </button>
            </div>
          </div>
          <div className="fila" style={{ gap: 16 }}>
            <label className="casilla">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} /> Recordar mi sesión
            </label>
            <a className="enlace" href="#olvide" onClick={(e) => e.preventDefault()}>
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          {error && (
            <p role="alert" className="texto-sm" style={{ color: "var(--c-alerta)" }}>
              {error}
            </p>
          )}
          <button className="boton boton--primario boton--bloque" disabled={enviando} style={{ height: 40, borderRadius: 10 }}>
            <LuArrowRight size={16} /> {enviando ? "Ingresando…" : "Ingresar al portal"}
          </button>
          <p className="fila texto-xs texto-muted" style={{ gap: 8 }}>
            <LuShieldCheck size={14} /> Acceso privado a los contenidos y proyectos de tu empresa.
          </p>
        </form>
        <div style={{ width: "min(480px, 100%)", textAlign: "center", marginTop: 72, display: "grid", gap: 10 }}>
          <span className="texto-sm texto-muted">¿Aún no tienes acceso?</span>
          <a className="enlace" style={{ justifyContent: "center" }} href="mailto:hola@inoo.pe">
            Contactar a mi equipo Inoo →
          </a>
          <span className="texto-xs texto-muted">© 2026 Inoo · Privacidad y términos</span>
        </div>
      </section>
    </div>
  );
}

// ═════════════════════════════════════════════ Inicio

export function PantallaInicio() {
  return (
    <Estructura espacio="cliente" migas="Inicio">
      <Inicio />
    </Estructura>
  );
}

/**
 * Inicio = «Tu cuenta» (reunión 12 oct): lo esencial de la ficha que antes solo veía el equipo.
 * Conciso: servicios con su avance lineal, equipo Inoo, Drive, la marca (solo si aplica) y una
 * actividad reciente breve. De los pagos solo un aviso sin montos; el detalle está en Mi cuenta.
 */
function Inicio() {
  const { sesion } = usePortal();
  const { datos: d, error, recargar } = useConsulta<S<"InicioCliente">>(`/clientes/${clienteActivo()}/inicio`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const nombre = sesion?.usuario.nombre.split(" ")[0] ?? "";
  const cuenta = d.cuenta;
  const pago = d.avisoPago;
  const req = d.indicadores.requerimientosPendientes;
  return (
    <>
      <Cabecera
        antetitulo={fHoyLargo(HOY_DEMO).toUpperCase()}
        titulo={`Hola, ${nombre} 👋`}
        ligero
        bajada={`Así va todo lo que hacemos para ${cuenta?.nombre ?? sesion?.clientes[0]?.nombre ?? "tu marca"}.`}
      />
      <AvisosInicio avisos={d.avisos ?? []} />
      {pago && (
        <Aviso icono={<LuWallet size={18} />} tono="alerta">
          Tienes un pago con {pago.diasAtraso} {pago.diasAtraso === 1 ? "día" : "días"} de atraso. Si ya pagaste, envíale el comprobante a administración.{" "}
          <Enlace a="/cuenta/pagos" className="enlace">
            Ver mis pagos →
          </Enlace>
        </Aviso>
      )}
      <div className={`grid-3 kpis${pago ? " seccion" : ""}`}>
        <Enlace a="/servicios" className="tarjeta kpi">
          <div className="kpi-cab">
            Servicios activos <LuLayers size={16} />
          </div>
          <div className="kpi-valor">{d.indicadores.serviciosActivos}</div>
          <div className="kpi-pie">{d.plan?.nombre ?? "Tu plan"}</div>
        </Enlace>
        <Enlace a="/entregables" className={`tarjeta kpi${d.indicadores.porAprobar > 0 ? " kpi--destacado" : ""}`}>
          <div className="kpi-cab">
            Por aprobar <LuCircleCheck size={16} />
          </div>
          <div className="kpi-valor">{d.indicadores.porAprobar}</div>
          <div className="kpi-pie">{d.indicadores.porAprobar === 1 ? "Entregable listo para ti" : "Entregables listos para ti"}</div>
        </Enlace>
        <Enlace a="/requerimientos" className={`tarjeta kpi${req > 0 ? " kpi--destacado" : ""}`}>
          <div className="kpi-cab">
            Requerimientos <LuClipboardList size={16} />
          </div>
          <div className="kpi-valor">{req}</div>
          <div className="kpi-pie">{req === 0 ? "No te pedimos nada por ahora" : req === 1 ? "Pendiente de enviarnos" : "Pendientes de enviarnos"}</div>
        </Enlace>
      </div>

      <div className="con-lateral seccion">
        <div className="pila">
          <section className="tarjeta" style={{ padding: "22px 20px" }}>
            <div className="fila entre" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 className="tarjeta-titulo">Tu cuenta</h2>
                <p className="texto-sm texto-muted" style={{ marginTop: 8 }}>
                  {cuenta?.nombre} · {d.plan?.nombre}
                  {d.plan?.fechaFin ? ` · Contrato hasta el ${fCorta(d.plan.fechaFin)}` : ""}
                </p>
              </div>
              <Enlace a="/servicios" className="enlace">
                Ver mis servicios →
              </Enlace>
            </div>
            <div style={{ display: "grid", gap: 18, marginTop: 20 }}>
              {d.servicios.map((x) => (
                <div key={x.servicioContratadoId} style={{ display: "grid", gap: 8 }}>
                  <Enlace a={`/servicios/${x.servicioContratadoId}`} className="fila" style={{ color: "inherit", textDecoration: "none" }}>
                    <span style={{ color: "var(--c-primario)", display: "inline-flex" }}>{ICONO_SERVICIO[x.codigo]}</span>
                    <span className="negrita" style={{ fontSize: 13 }}>{x.titulo}</span>
                  </Enlace>
                  <AvanceLineal avance={x.avance} compacto />
                </div>
              ))}
            </div>
          </section>

          {d.marca && <TuMarca marca={d.marca} />}

          {d.actividad && d.actividad.length > 0 && (
            <section className="tarjeta" style={{ padding: "20px 20px 12px" }}>
              <h2 className="tarjeta-titulo" style={{ marginBottom: 6 }}>Actividad reciente</h2>
              <div className="lista-lineas">
                {d.actividad.map((x) => (
                  <div key={`${x.fecha}-${x.texto}`} className="fila entre" style={{ paddingRight: 0 }}>
                    <span className="texto-sm">{x.texto}</span>
                    <span className="texto-xs texto-muted" style={{ whiteSpace: "nowrap" }}>{fDiaMes(x.fecha)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="pila">
          {cuenta?.responsable && (
            <div className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
              <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Tu equipo Inoo</h3>
              <div className="fila">
                <span className="avatar">{cuenta.responsable.nombre.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
                <span>
                  <span className="negrita" style={{ display: "block", fontSize: 13 }}>{cuenta.responsable.nombre}</span>
                  <span className="texto-xs texto-muted">Responsable de tu cuenta</span>
                </span>
              </div>
            </div>
          )}
          {cuenta?.driveUrl && (
            <div className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
              <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Carpeta de Drive</h3>
              <p className="texto-xs texto-muted">Tu material, entregables y documentos del proyecto.</p>
              <a className="boton boton--bloque" href={cuenta.driveUrl} target="_blank" rel="noreferrer">
                <LuExternalLink size={16} /> Abrir carpeta
              </a>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

/** «Tu marca»: un resumen corto que se puede abrir. Solo aparece con servicios de marca o contenido. */
function TuMarca({ marca: m }: { marca: NonNullable<S<"InicioCliente">["marca"]> }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="tarjeta" style={{ padding: "20px 20px" }}>
      <button type="button" className="fila entre" style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }} aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        <span>
          <span className="tarjeta-titulo" style={{ display: "block" }}>Tu marca</span>
          <span className="texto-sm" style={{ display: "block", marginTop: 8 }}>
            {m.mensajeCentral && <strong>«{m.mensajeCentral}»</strong>}
            {!!m.tono?.length && <span className="texto-muted"> · {m.tono.join(" · ")}</span>}
          </span>
        </span>
        <LuChevronDown size={18} style={{ transform: abierto ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
      </button>
      {abierto && (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {m.descripcion && <p className="texto-sm texto-muted" style={{ lineHeight: 1.6 }}>{m.descripcion}</p>}
          {m.campanaActual && <p className="texto-sm">{m.campanaActual}</p>}
          {m.publico && (
            <p className="texto-xs texto-muted">
              <span className="negrita">Público: </span>
              {m.publico}
            </p>
          )}
          <p className="texto-xs texto-muted">Así entendemos tu marca. Si algo no te representa, cuéntaselo a tu equipo Inoo.</p>
        </div>
      )}
    </section>
  );
}

/** Resultados del mes. Salió de Inicio (reunión 12 oct): va dentro de los servicios que miden resultados. */
export function ResultadosDelMes() {
  const avisar = useAviso();
  const { datos: r } = useConsulta<S<"ReporteResultados">>(`/clientes/${clienteActivo()}/reportes/resultados`);
  if (!r) return null;
  const descargar = async () => {
    try {
      const u = await api<{ url: string }>(`/clientes/${clienteActivo()}/reportes/informe?periodo=${r.periodo.desde.slice(0, 7)}`);
      window.open(u.url, "_blank");
    } catch (e) {
      avisar({ titulo: "No pudimos preparar el informe", texto: (e as ProblemaApi).titulo });
    }
  };
  const numero = (v: number) => v.toLocaleString("es-PE");
  return (
    <section className="seccion">
      <div className="seccion-cab">
        <div className="fila">
          <h2 className="seccion-titulo">Resultados del mes</h2>
          {r.esMuestra && <Etiqueta tono="gris">Datos de ejemplo</Etiqueta>}
        </div>
        {r.informeDisponible && (
          <button className="boton" onClick={descargar}>
            <LuDownload size={16} /> Descargar informe
          </button>
        )}
      </div>
      <p className="seccion-desc">
        Del {fDiaMes(`${r.periodo.desde}T12:00:00Z`)} al {fDiaMes(`${r.periodo.hasta}T12:00:00Z`)}, comparado con el mismo tramo del mes anterior. El detalle por canal y el recorrido de tus clientes están en el informe.
      </p>
      <div className="grid-4">
        {r.indicadores.slice(0, 4).map((k) => (
          <div key={k.clave} className="tarjeta kpi">
            <div className="kpi-cab">{k.etiqueta}</div>
            <div className="kpi-valor">
              {numero(k.valor)}
              {k.unidad ?? ""}
            </div>
            <div className="kpi-pie">
              {typeof k.variacionPct === "number" && (
                <span style={{ color: k.variacionPct >= 0 ? "var(--c-exito)" : "var(--c-alerta)", fontWeight: 600 }}>
                  {k.variacionPct >= 0 ? "▲" : "▼"} {Math.abs(k.variacionPct)}%{" "}
                </span>
              )}
              {k.detalle}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AsiVaElMes({ progreso: a, proxima, nota, conEnlace = true }: { progreso: S<"ProgresoPiezas">; proxima?: { titulo?: string; fechaProgramada?: string } | null; nota?: string; conEnlace?: boolean }) {
  return (
    <div className="tarjeta" style={{ padding: "22px 20px" }}>
      <h3 className="tarjeta-titulo">Así va octubre</h3>
      <div className="fila entre" style={{ marginTop: 14 }}>
        <span className="texto-sm texto-muted">
          {a.aprobadas} de {a.totales} piezas aprobadas
        </span>
        <span style={{ fontSize: 22, color: "var(--c-primario)" }}>{a.porcentaje}%</span>
      </div>
      <div style={{ margin: "14px 0 18px" }}>
        <Barra pct={a.porcentaje} />
      </div>
      <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
        <Etiqueta tono="verde">{a.aprobadas} aprobadas</Etiqueta>
        <Etiqueta tono="violeta">{a.porRevisar} por revisar</Etiqueta>
        <Etiqueta tono="gris">{a.enProduccion} en producción</Etiqueta>
      </div>
      {proxima?.titulo && (
        <p className="texto-xs texto-muted" style={{ marginTop: 16 }}>
          Próxima publicación: «{proxima.titulo}» · {fDiaMes(proxima.fechaProgramada!)}
        </p>
      )}
      {nota && <p className="texto-xs texto-muted" style={{ marginTop: 16 }}>{nota}</p>}
      {conEnlace && (
        <Enlace a="/servicios" className="enlace" style={{ marginTop: 18 }}>
          Ver mis servicios →
        </Enlace>
      )}
    </div>
  );
}

export function TodoAlDia() {
  return (
    <div className="tarjeta" style={{ textAlign: "center", padding: 32, display: "grid", justifyItems: "center", gap: 12, maxWidth: 420, margin: "0 auto" }}>
      <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--c-exito-suave)", color: "var(--c-exito)", display: "grid", placeItems: "center" }}>
        <LuCheck size={26} />
      </span>
      <h3 style={{ fontSize: 20, fontWeight: 600 }}>¡Todo al día!</h3>
      <p className="texto-sm texto-muted">No tienes piezas pendientes de revisión. Te avisaremos cuando haya algo nuevo para ti.</p>
      <Enlace a="/servicios" className="boton boton--bloque">
        Ver mis servicios
      </Enlace>
    </div>
  );
}

// ═════════════════════════════════════════════ Servicios contratados

export function PantallaServicios() {
  return (
    <Estructura espacio="cliente" migas="Mis servicios">
      <Servicios />
    </Estructura>
  );
}

function Servicios() {
  const { datos: d, error, recargar } = useConsulta<S<"ServiciosCliente">>(`/clientes/${clienteActivo()}/servicios`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  // La API solo devuelve lo contratado (reunión 12 oct): lo no contratado no ocupa espacio.
  const contratados = d.servicios;
  const r = d.resumenMes;
  return (
    <>
      <Cabecera
        antetitulo="Casa Oliva · Octubre 2026"
        titulo="Mis servicios"
        bajada="Lo que tienes contratado y en qué etapa está cada servicio."
      />
      <div className="tarjeta" style={{ padding: "24px 24px 20px" }}>
        <div className="fila entre" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600 }}>{d.plan?.nombre}</h2>
            <p className="texto-sm texto-muted" style={{ marginTop: 8 }}>
              Contrato hasta el {d.plan?.fechaFin ? fCorta(d.plan.fechaFin) : "—"} · Casa Oliva
            </p>
          </div>
          <div className="fila" style={{ gap: 8 }}>
            <Etiqueta tono="verde">{contratados.length} servicios activos</Etiqueta>
            {r.totales > 0 && <Etiqueta tono="violeta">{r.totales} piezas / mes</Etiqueta>}
          </div>
        </div>
        <p className="texto-xs texto-muted" style={{ marginTop: 22 }}>
          El avance de cada servicio se mide por etapas: el porcentaje sube al cerrar cada una.
          {r.totales > 0 && ` Piezas de este mes: ${r.entregadas} entregadas, ${r.aprobadas} aprobadas y ${r.enProduccion} en producción.`}
        </p>
      </div>
      <div className="grid-3" style={{ marginTop: 16 }}>
        {contratados.map((s) => (
          <TarjetaServicio key={s.servicioContratadoId} s={s} />
        ))}
      </div>
    </>
  );
}

function TarjetaServicio({ s }: { s: S<"ServicioCliente"> }) {
  const p = s.progreso;
  const linea = detalleServicio(s);
  return (
    <div className="tarjeta" style={{ padding: "18px 18px 20px", display: "grid", gap: 14, alignContent: "start" }}>
      <div className="fila entre">
        <span className="icono-caja" style={{ width: 32, height: 32, borderRadius: 9, color: "var(--c-primario)", background: "var(--c-primario-suave)" }}>
          {ICONO_SERVICIO[s.codigo]}
        </span>
        <Etiqueta tono={s.estado === "ACTIVO" ? "verde" : s.estado === "STANDBY" ? "violeta" : "gris"}>{ETIQUETA_ESTADO_SERVICIO[s.estado]}</Etiqueta>
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 600 }}>{s.titulo}</h3>
      {s.responsable && <span className="texto-xs texto-muted" style={{ marginTop: -8 }}>Responsable: {s.responsable.nombre} · Inoo</span>}
      {linea && <p className="negrita" style={{ fontSize: 12.5, marginTop: -4 }}>{linea}</p>}
      <AvanceLineal avance={s.avance} />
      {p && (
        <span className="texto-xs texto-muted" style={{ fontSize: 10.5 }}>
          Este mes: {p.aprobadas} aprobados · {p.porRevisar} por revisar · {p.enProduccion} en producción
        </span>
      )}
      <Enlace a={`/servicios/${s.servicioContratadoId}`} className="enlace">
        Ver proyecto →
      </Enlace>
    </div>
  );
}

// ═════════════════════════════════════════════ Entregables por revisar

export function PantallaEntregables() {
  return (
    <Estructura espacio="cliente" migas="Entregables por revisar">
      <Entregables />
    </Estructura>
  );
}

function Entregables() {
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState("");
  const consulta = useMemo(() => {
    const p = new URLSearchParams({ estado: "LISTO_REVISION", periodo: "2026-10" });
    if (q) p.set("q", q);
    if (canal) p.set("canal", canal);
    return `/clientes/${clienteActivo()}/piezas?${p}`;
  }, [q, canal]);
  const { datos, error, recargar } = useConsulta<{ datos: PiezaUI[]; paginacion: { total: number } }>(consulta);
  const total = datos?.paginacion.total ?? 0;
  return (
    <>
      <Cabecera antetitulo="Contenido de Casa Oliva" titulo="Entregables por revisar" bajada="El siguiente paso es tuyo. Revisa cada pieza y cuéntanos qué te parece." />
      <Aviso icono={<LuCircleCheck size={18} />} titulo={`Tienes ${total} piezas listas para revisión`} elevado>
        Aprueba la versión actual o pide cambios. Publicaremos solo el contenido aprobado.
      </Aviso>
      <div className="fila fila-filtros" style={{ margin: "24px 0 22px", gap: 12 }}>
        <div className="entrada" style={{ flex: 1 }}>
          <span className="icono-inicio">
            <LuSearch size={17} />
          </span>
          <input aria-label="Buscar una pieza" placeholder="Buscar una pieza..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="selector selector--alto" style={{ position: "relative", fontWeight: 500 }}>
          <span className="sr-only">Canal</span>
          <select value={canal} onChange={(e) => setCanal(e.target.value)} style={{ appearance: "none", border: 0, background: "none", outline: "none", fontSize: 12.5, paddingRight: 18, cursor: "pointer" }}>
            <option value="">Todos los canales</option>
            <option>Instagram</option>
            <option>Facebook</option>
            <option>Blog web</option>
          </select>
          <LuChevronDown size={14} style={{ position: "absolute", right: 14, pointerEvents: "none" }} />
        </label>
        <span className="selector selector--alto" style={{ fontWeight: 500, fontSize: 12.5 }}>
          Octubre 2026 <LuChevronDown size={14} />
        </span>
      </div>
      <div className="fila entre" style={{ marginBottom: 16 }}>
        <Etiqueta tono="violeta">Listo para revisión · {total}</Etiqueta>
        <span className="texto-xs texto-muted">{total} entregables</span>
      </div>
      {error ? (
        <ErrorCarga error={error} reintentar={recargar} />
      ) : !datos ? (
        <Cargando />
      ) : datos.datos.length === 0 ? (
        q || canal ? <p className="vacio">No hay piezas que coincidan con tu búsqueda.</p> : <TodoAlDia />
      ) : (
        <div className="grid-2" style={{ gap: 18 }}>
          {datos.datos.map((p) => (
            <TarjetaPieza key={p.id} p={p} />
          ))}
        </div>
      )}
      <p className="fila texto-xs texto-muted" style={{ marginTop: 28, gap: 8, paddingLeft: 14 }}>
        <LuShieldCheck size={15} /> Cada aprobación queda registrada con el nombre de quien la realizó y la versión aprobada.
      </p>
    </>
  );
}

// ═════════════════════════════════════════════ Detalle de pieza

export function PantallaDetallePieza() {
  return (
    <Estructura espacio="cliente" migas="Entregables por revisar">
      <DetallePieza />
    </Estructura>
  );
}

/** Sin diseño propio en Figma: el equipo abre la pieza desde la bandeja con el mismo detalle + acciones internas. */
export function PantallaDetallePiezaEquipo() {
  return (
    <Estructura espacio="equipo" migas="Bandeja de producción">
      <DetallePieza volver="/equipo/produccion" />
    </Estructura>
  );
}

const ACCIONES_EQUIPO: Record<string, [string, string]> = {
  ENVIAR_REVISION_INTERNA: ["Enviar a revisión interna", "EN_REVISION_INTERNA"],
  LIBERAR_A_CLIENTE: ["Liberar al cliente", "LISTO_REVISION"],
  RETIRAR: ["Retirar de revisión", "EN_REVISION_INTERNA"],
  MARCAR_PUBLICADO: ["Marcar como publicada", "PUBLICADO"],
};

type PiezaDet = S<"Pieza"> & { formato?: string; diseno?: PiezaUI["diseno"] };

function DetallePieza({ volver = "/entregables" }: { volver?: string }) {
  const { params } = useNavegacion();
  const avisar = useAviso();
  const portal = usePortal();
  const pieza = useConsulta<PiezaDet>(`/piezas/${params.id}`);
  const versiones = useConsulta<S<"VersionPieza">[]>(`/piezas/${params.id}/versiones`);
  const comentarios = useConsulta<{ datos: S<"Comentario">[] }>(`/piezas/${params.id}/comentarios`);
  const [texto, setTexto] = useState("");
  const [errorTexto, setErrorTexto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [diapositiva, setDiapositiva] = useState(0);
  const [ocupado, setOcupado] = useState(false);

  if (pieza.error) return <ErrorCarga error={pieza.error} reintentar={pieza.recargar} />;
  if (!pieza.datos) return <Cargando />;
  const p = pieza.datos;
  const v = p.version;
  const c = (v?.contenido ?? {}) as Record<string, unknown> & { imagenes?: { etiqueta?: string; url?: string }[] };
  const imagenes = c.imagenes ?? [];
  const anterior = versiones.datos?.find((x) => !x.actual && x.decision);
  // Blogs: el equipo los aprueba desde la revisión interna (reunión 12 oct), sin la decisión del cliente.
  const blogInterno = p.tipo === "BLOG" && p.estado === "EN_REVISION_INTERNA";
  const puedeDecidir = p.acciones.includes("APROBAR") && !blogInterno;
  const nombreUsuario = portal.sesion?.usuario.nombre ?? "";

  const recargarTodo = () => {
    void pieza.recargar();
    void versiones.recargar();
    void comentarios.recargar();
    portal.refrescar();
  };
  const tratarError = (e: unknown) => {
    const err = e as ProblemaApi;
    if (err.codigo === "VERSION_DESACTUALIZADA") {
      avisar({ titulo: "La pieza cambió mientras la revisabas", texto: err.detalle });
      recargarTodo();
    } else setErrorTexto(err.errores[0]?.mensaje ?? err.titulo);
  };
  const aprobar = async () => {
    setOcupado(true);
    try {
      await api(`/piezas/${p.id}/aprobar`, { metodo: "POST", cuerpo: { version: p.versionCliente }, idempotente: true });
      setConfirmar(false);
      avisar({ titulo: `Versión ${p.versionCliente} aprobada`, texto: `${p.titulo}. Aprobación registrada por ${nombreUsuario}.` });
      recargarTodo();
    } catch (e) {
      setConfirmar(false);
      tratarError(e);
    } finally {
      setOcupado(false);
    }
  };
  const pedirCambios = async () => {
    setErrorTexto(null);
    if (!texto.trim()) {
      setErrorTexto("Para pedir cambios, cuéntanos qué te gustaría modificar.");
      document.getElementById("comentario")?.focus();
      return;
    }
    setOcupado(true);
    try {
      await api(`/piezas/${p.id}/solicitar-cambios`, { metodo: "POST", cuerpo: { version: p.versionCliente, comentario: texto }, idempotente: true });
      setTexto("");
      avisar({ titulo: "Cambios solicitados", texto: "Tu equipo Inoo ya recibió tus comentarios." });
      recargarTodo();
    } catch (e) {
      tratarError(e);
    } finally {
      setOcupado(false);
    }
  };
  const comentar = async () => {
    setErrorTexto(null);
    if (!texto.trim()) {
      setErrorTexto("Escribe un comentario.");
      return;
    }
    try {
      await api(`/piezas/${p.id}/comentarios`, { metodo: "POST", cuerpo: { texto } });
      setTexto("");
      void comentarios.recargar();
    } catch (e) {
      tratarError(e);
    }
  };
  const descargar = async () => {
    const r = await api<{ url: string }>(`/piezas/${p.id}/descarga`);
    window.open(r.url, "_blank");
  };

  return (
    <>
      <Enlace a={volver} className="volver">
        ← {volver === "/entregables" ? "Volver a entregables por revisar" : "Volver a la bandeja de producción"}
      </Enlace>
      <h1 className="titulo titulo--ligero">{p.titulo}</h1>
      <p className="bajada" style={{ marginTop: 6 }}>
        {p.formato} · {p.canal} · Publicación prevista: {p.fechaProgramada ? fCorta(p.fechaProgramada) : "—"}
      </p>
      <div className="fila" style={{ margin: "20px 0 24px" }}>
        <EtiquetaPieza p={p} />
        {v && (
          <span className="texto-xs texto-muted">
            Versión {v.numero} · Actualizada el {fDiaMes(v.enviadaEn ?? v.creadoEn)}
          </span>
        )}
      </div>

      <div className="con-lateral" style={{ ["--columnas" as string]: "minmax(0,1fr) 312px" }}>
        <div className="tarjeta" style={{ padding: 0, overflow: "hidden" }}>
          <div className="fila entre" style={{ padding: "16px 16px 14px" }}>
            <span className="negrita" style={{ fontSize: 12 }}>{v?.archivo?.nombre ?? p.titulo}</span>
            <button className="enlace" aria-label="Descargar" onClick={descargar}>
              <LuDownload size={18} />
            </button>
          </div>
          {p.tipo === "BLOG" ? (
            <>
              <Miniatura diseno={p.diseno} alto={260} grande />
              <article style={{ padding: "20px 22px 26px", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-line" }}>
                <p className="negrita" style={{ marginBottom: 6 }}>{String(c.tituloSeo ?? p.titulo)}</p>
                <p className="texto-xs texto-muted" style={{ marginBottom: 16 }}>{String(c.metaDescripcion ?? "")} · {String(c.palabras ?? "")} palabras</p>
                {String(c.cuerpoMd ?? "").replace(/^#+ /gm, "")}
              </article>
            </>
          ) : (
            <>
              <Miniatura diseno={p.diseno} alto={322} grande />
              <div className="fila entre" style={{ padding: "10px 16px", borderBottom: "1px solid var(--c-borde)", fontSize: 11, color: "var(--c-muted)" }}>
                <button className="enlace" style={{ color: "var(--c-texto)" }} aria-label="Anterior" onClick={() => setDiapositiva(Math.max(0, diapositiva - 1))}>
                  <LuChevronLeft size={16} />
                </button>
                <span className="fila" style={{ gap: 4 }}>
                  {imagenes.map((_, i) => (
                    <span key={i} style={{ width: i === diapositiva ? 16 : 4, height: 4, borderRadius: 4, background: i === diapositiva ? "var(--c-primario)" : "#d5d7e0" }} />
                  ))}
                </span>
                <span>
                  {imagenes[diapositiva]?.etiqueta ?? p.formato} · {diapositiva + 1} de {Math.max(1, imagenes.length)}
                </span>
                <span />
                <button className="enlace" style={{ color: "var(--c-texto)" }} aria-label="Siguiente" onClick={() => setDiapositiva(Math.min(imagenes.length - 1, diapositiva + 1))}>
                  <LuChevronRight size={16} />
                </button>
              </div>
              <div style={{ padding: "20px 18px 24px", fontSize: 12.5, lineHeight: 1.6 }}>
                <p className="negrita" style={{ fontSize: 13, marginBottom: 12 }}>
                  {p.tipo === "GUION" ? "Guion" : "Texto de la publicación"}
                </p>
                {p.tipo === "GUION" ? <Guion c={c} /> : <CopyConHashtags texto={String(c.copyAsociado ?? c.copy ?? "")} />}
              </div>
            </>
          )}
        </div>

        <div className="pila">
          {(p.acciones.some((x) => ACCIONES_EQUIPO[x]) || blogInterno) && (
            <div className="tarjeta" style={{ display: "grid", gap: 10, padding: "22px 18px" }}>
              <h3 className="tarjeta-titulo">Acciones del equipo</h3>
              <p className="texto-xs texto-muted">Estado interno: {p.estado} · versión vigente {p.versionActual}</p>
              {blogInterno && (
                <>
                  <p className="texto-xs texto-muted">Los blogs no pasan por el cliente: apruébalo cuando esté listo para publicar.</p>
                  <button
                    className="boton boton--bloque boton--primario"
                    style={{ height: 40 }}
                    onClick={async () => {
                      try {
                        await api(`/piezas/${p.id}/transiciones`, { metodo: "POST", cuerpo: { aEstado: "APROBADO_CLIENTE" } });
                        avisar({ titulo: "Artículo aprobado", texto: p.titulo });
                        recargarTodo();
                      } catch (e) {
                        tratarError(e);
                      }
                    }}
                  >
                    Aprobar artículo
                  </button>
                </>
              )}
              {p.acciones
                .filter((x) => ACCIONES_EQUIPO[x])
                .map((x) => (
                  <button
                    key={x}
                    className={`boton boton--bloque${x === "LIBERAR_A_CLIENTE" ? " boton--primario" : ""}`}
                    style={{ height: 40 }}
                    onClick={async () => {
                      try {
                        await api(`/piezas/${p.id}/transiciones`, { metodo: "POST", cuerpo: { aEstado: ACCIONES_EQUIPO[x][1] } });
                        avisar({ titulo: ACCIONES_EQUIPO[x][0], texto: p.titulo });
                        recargarTodo();
                      } catch (e) {
                        tratarError(e);
                      }
                    }}
                  >
                    {ACCIONES_EQUIPO[x][0]}
                  </button>
                ))}
            </div>
          )}
          <div className="tarjeta" style={{ display: "grid", gap: 14, padding: "22px 18px" }}>
            <h3 className="tarjeta-titulo">¿Lista para publicar?</h3>
            {p.estado === "LISTO_REVISION" ? (
              <>
                <p className="texto-sm texto-muted" style={{ lineHeight: 1.6 }}>
                  Estás revisando la versión {p.versionCliente}. Tu decisión se guardará solo para esta versión.
                </p>
                <button className="boton boton--primario boton--bloque" style={{ height: 40 }} disabled={!puedeDecidir || ocupado} onClick={() => setConfirmar(true)}>
                  <LuCheck size={16} /> Aprobar
                </button>
                <button className="boton boton--bloque" style={{ height: 40 }} disabled={!puedeDecidir || ocupado} onClick={pedirCambios}>
                  <LuMessageSquare size={16} /> Pedir cambios
                </button>
                {!puedeDecidir && <p className="texto-xs texto-muted">Tu rol permite comentar, pero no aprobar.</p>}
                {anterior && (
                  <p className="fila texto-xs texto-muted" style={{ alignItems: "flex-start", gap: 8, fontSize: 10.5 }}>
                    <LuInfo size={14} style={{ flex: "none" }} /> La aprobación anterior corresponde a la versión {anterior.numero}, no a esta pieza actual.
                  </p>
                )}
              </>
            ) : (
              <p className="texto-sm texto-muted">
                {p.estado === "APROBADO_CLIENTE" || p.estado === "PUBLICADO"
                  ? `Aprobaste la versión ${p.versionCliente}. La programaremos según el calendario.`
                  : p.estado === "CAMBIOS_SOLICITADOS"
                    ? "Pediste cambios. Te avisaremos cuando la nueva versión esté lista."
                    : "Esta pieza todavía está en producción."}
              </p>
            )}
          </div>

          <div className="tarjeta" style={{ display: "grid", gap: 12, padding: "22px 18px" }}>
            <h3 className="tarjeta-titulo">Comentarios</h3>
            <div className="campo">
              <label htmlFor="comentario">Tu comentario</label>
              <div className="entrada">
                <textarea id="comentario" placeholder="Cuéntanos qué debemos ajustar..." value={texto} onChange={(e) => setTexto(e.target.value)} aria-invalid={!!errorTexto} />
              </div>
              <span className="ayuda-campo" style={errorTexto ? { color: "var(--c-alerta)" } : undefined} role={errorTexto ? "alert" : undefined}>
                {errorTexto ?? "Para pedir cambios, indica qué te gustaría modificar."}
              </span>
            </div>
            <button className="boton boton--bloque" style={{ height: 40 }} onClick={comentar}>
              Enviar comentario
            </button>
            {comentarios.datos?.datos.map((cm) => (
              <div key={cm.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, marginTop: 6 }}>
                <span className="avatar">{cm.autor.nombre.split(" ").slice(0, 2).map((x) => x[0]).join("")}</span>
                <div>
                  <p className="negrita" style={{ fontSize: 12 }}>{cm.autor.nombre}</p>
                  <p className="texto-xs texto-muted" style={{ fontSize: 10 }}>
                    {fDiaHora(cm.creadoEn)} · Versión {cm.version}
                  </p>
                </div>
                <p className="texto-xs texto-muted" style={{ gridColumn: "1 / -1", lineHeight: 1.6 }}>{cm.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tarjeta seccion" style={{ padding: "26px 18px 18px" }}>
        <h2 className="tarjeta-titulo">Historial de versiones</h2>
        <p className="texto-xs texto-muted" style={{ margin: "14px 0 16px" }}>Cada versión conserva sus comentarios y su propia aprobación.</p>
        <div className="lista-suave">
          {versiones.datos?.map((x) => (
            <div key={x.numero} className={`fila-suave rejilla${x.actual ? " fila-suave--activa" : ""}`} style={{ ["--columnas" as string]: "1fr 1.3fr 140px" }}>
              <div>
                <p className="negrita" style={{ fontSize: 12.5 }}>
                  Versión {x.numero} · {x.actual ? "Actual" : "Anterior"}
                </p>
                <p className="texto-xs texto-muted" style={{ marginTop: 4 }}>
                  {fCorta(x.enviadaEn ?? x.creadoEn)} · {x.enviadaPor?.nombre ?? "Equipo"}, Inoo
                </p>
              </div>
              <div className="texto-xs texto-muted">
                {x.decision ? (
                  <>
                    <p style={{ fontSize: 12 }}>
                      {x.decision.estado === "APROBADO_CLIENTE" ? "Aprobada" : "Cambios pedidos"} por {x.decision.usuarioNombre} · {fCorta(x.decision.fecha!)}, {fDiaHora(x.decision.fecha!).split(" · ")[1]}
                    </p>
                    {!x.actual && <p style={{ fontSize: 10, marginTop: 4 }}>Esta aprobación no aplica a la versión actual.</p>}
                  </>
                ) : (
                  <p style={{ fontSize: 12 }}>Sin aprobación todavía</p>
                )}
              </div>
              <div style={{ justifySelf: "end" }}>
                {x.decision?.estado === "APROBADO_CLIENTE" ? (
                  <Etiqueta tono="verde">Aprobada</Etiqueta>
                ) : x.decision?.estado === "CAMBIOS_SOLICITADOS" ? (
                  <Etiqueta tono="ambar">Cambios solicitados</Etiqueta>
                ) : (
                  <span className="etiqueta" style={{ background: "transparent", color: "var(--c-primario)" }}>Por revisar</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Modal abierto={confirmar} alCerrar={() => setConfirmar(false)} etiqueta="Aprobar esta versión">
        <span className="icono-caja">
          <LuCircleCheck size={18} />
        </span>
        <h2 style={{ fontSize: 22, fontWeight: 600 }}>¿Aprobar esta versión?</h2>
        <p className="texto-sm texto-muted">
          «{p.titulo}» · Versión {p.versionCliente}
        </p>
        <p className="texto-sm texto-muted" style={{ lineHeight: 1.6 }}>
          Confirmaremos tu aprobación y el equipo Inoo podrá programar esta pieza.
        </p>
        <div style={{ background: "var(--c-fondo)", borderRadius: 12, padding: "12px 14px" }}>
          <p className="negrita" style={{ fontSize: 11.5 }}>Se registrará a nombre de {nombreUsuario}</p>
          <p className="texto-xs texto-muted" style={{ fontSize: 10.5, marginTop: 4 }}>
            Solo se aprobará la versión {p.versionCliente} de este entregable.
          </p>
        </div>
        <div className="grid-2" style={{ gap: 10 }}>
          <button className="boton" onClick={() => setConfirmar(false)}>
            Volver a revisar
          </button>
          <button className="boton boton--primario" onClick={aprobar} disabled={ocupado}>
            Confirmar aprobación
          </button>
        </div>
      </Modal>
    </>
  );
}

function CopyConHashtags({ texto }: { texto: string }) {
  return (
    <div style={{ whiteSpace: "pre-line" }}>
      {texto.split(/(#[\wÁÉÍÓÚáéíóúñÑ]+)/g).map((t, i) =>
        t.startsWith("#") ? (
          <span key={i} style={{ color: "var(--c-primario)" }}>
            {t}
          </span>
        ) : (
          t
        ),
      )}
    </div>
  );
}

function Guion({ c }: { c: Record<string, unknown> }) {
  const escenas = (c.escenas ?? []) as { tiempo: string; tipoPlano: string; indicacionVisual: string; audio: string }[];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p>
        <strong>Gancho:</strong> {String(c.gancho ?? "")}
      </p>
      <table className="tabla" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>Tiempo</th>
            <th>Plano</th>
            <th>Indicación</th>
            <th>Audio</th>
          </tr>
        </thead>
        <tbody>
          {escenas.map((e) => (
            <tr key={e.tiempo} style={{ cursor: "default" }}>
              <td style={{ padding: "10px 20px" }}>{e.tiempo}</td>
              <td style={{ padding: "10px 20px" }}>{e.tipoPlano}</td>
              <td style={{ padding: "10px 20px" }}>{e.indicacionVisual}</td>
              <td style={{ padding: "10px 20px" }}>{e.audio}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>CTA:</strong> {String(c.cta ?? "")}
      </p>
    </div>
  );
}
