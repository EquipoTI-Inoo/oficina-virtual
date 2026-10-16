"use client";
import { useState } from "react";
import { LuArrowRight, LuCalendarDays, LuChevronDown, LuChevronLeft, LuChevronRight, LuCircleCheck, LuFileText } from "react-icons/lu";
import { api, clienteActivo, Enlace, fDiaMes, PERIODO_DEMO, ProblemaApi, useConsulta, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, EtiquetaEstado, Miniatura, useAviso } from "../componentes";

type PiezaUI = S<"PiezaResumen"> & { formato?: string; diseno?: { fondo?: string; titular?: string; bajada?: string; eyebrow?: string; foto?: boolean } };

// ═════════════════════════════════════════════ Equipo · Blog
// El cliente no aprueba blogs (reunión 12 oct): el equipo elige la idea del mes y sigue los artículos.

export function PantallaBlog() {
  return (
    <Estructura espacio="equipo" migas="Blog">
      <Blog />
    </Estructura>
  );
}

function Blog() {
  const avisar = useAviso();
  const ideas = useConsulta<{ datos: S<"IdeaBlog">[]; cupo: { total: number; elegidas: number } }>(`/clientes/${clienteActivo()}/ideas-blog?periodo=${PERIODO_DEMO}`);
  const articulos = useConsulta<{ datos: PiezaUI[] }>(`/clientes/${clienteActivo()}/piezas?tipo=BLOG&periodo=${PERIODO_DEMO}`);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (ideas.error?.status === 403) {
    return <Aviso icono={<LuFileText size={18} />} titulo="El blog es de gestión">Lo ven los account managers y administración. Si necesitas algo de un artículo, pídelo a tu AM.</Aviso>;
  }
  if (ideas.error) return <ErrorCarga error={ideas.error} reintentar={ideas.recargar} />;
  if (!ideas.datos || !articulos.datos) return <Cargando />;
  const elegida = seleccion ?? ideas.datos.datos.find((i) => i.estado === "ELEGIDA")?.id ?? null;
  const arts = articulos.datos.datos;
  const porAprobar = arts.filter((a) => a.estado === "LISTO_REVISION");
  const aprob = arts.filter((a) => a.estado === "APROBADO_CLIENTE" || a.estado === "PUBLICADO").length;
  const enProd = arts.filter((a) => a.estado === "EN_PRODUCCION" || a.estado === "CAMBIOS_SOLICITADOS").length;
  const cupo = ideas.datos.cupo;

  const confirmar = async () => {
    setError(null);
    try {
      await api(`/clientes/${clienteActivo()}/ideas-blog/seleccion`, { metodo: "POST", cuerpo: { periodo: PERIODO_DEMO, ideaIds: elegida ? [elegida] : [] }, idempotente: true });
      avisar({ titulo: "Selección confirmada", texto: "La idea pasa a producción como artículo del mes." });
      setSeleccion(null);
      void ideas.recargar();
      void articulos.recargar();
    } catch (e) {
      setError((e as ProblemaApi).detalle ?? (e as ProblemaApi).titulo);
    }
  };

  return (
    <>
      <Cabecera
        antetitulo="Casa Oliva · Octubre 2026"
        titulo="Blog"
        bajada="Elige la idea del mes y sigue los artículos de octubre de Casa Oliva."
        accion={
          <span className="boton">
            <LuCalendarDays size={18} /> Octubre 2026
          </span>
        }
      />
      <Aviso icono={<LuFileText size={18} />} titulo="4 artículos al mes, una voz de marca">
        {aprob} aprobados · {porAprobar.length} por aprobar · {enProd} en producción. Falta elegir la idea del artículo que queda por desarrollar.
      </Aviso>

      <section className="seccion">
        <div className="seccion-cab">
          <h2 className="seccion-titulo">Ideas propuestas del mes</h2>
          <Etiqueta tono="violeta">
            {elegida ? 1 : 0} de {cupo.total} seleccionada
          </Etiqueta>
        </div>
        <p className="seccion-desc">Se puede cambiar la selección antes de confirmarla. Las ideas no elegidas no consumen el alcance mensual.</p>
        <div className="grid-3">
          {ideas.datos.datos.map((i) => {
            const sel = elegida === i.id;
            return (
              <button
                key={i.id}
                type="button"
                aria-pressed={sel}
                onClick={() => setSeleccion(i.id)}
                className="tarjeta"
                style={{ textAlign: "left", cursor: "pointer", padding: "18px 18px 20px", display: "grid", gap: 12, alignContent: "start", border: sel ? "1.5px solid var(--c-primario)" : undefined }}
              >
                <span className="fila entre">
                  {sel ? <Etiqueta tono="violeta">Seleccionada</Etiqueta> : <Etiqueta tono="gris">Propuesta</Etiqueta>}
                  <span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, border: sel ? 0 : "1px solid #cfd2dc", background: sel ? "var(--c-primario)" : "#fff", color: "#fff", display: "grid", placeItems: "center", fontSize: 11 }}>
                    {sel ? "✓" : ""}
                  </span>
                </span>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{i.titulo}</span>
                <span style={{ display: "grid", gap: 4 }}>
                  <span className="texto-xs texto-muted negrita" style={{ fontSize: 9.5, textTransform: "uppercase" }}>Palabra clave</span>
                  <span className="texto-xs texto-primario">{i.palabraClave}</span>
                </span>
                <span style={{ display: "grid", gap: 4 }}>
                  <span className="texto-xs texto-muted negrita" style={{ fontSize: 9.5, textTransform: "uppercase" }}>Ángulo</span>
                  <span className="texto-xs texto-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{i.angulo}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="fila entre" style={{ marginTop: 14 }}>
          <span className="texto-xs texto-muted" style={{ color: error ? "var(--c-alerta)" : undefined }}>
            {error ?? "La idea elegida pasa a producción."}
          </span>
          <button className="boton boton--primario" style={{ height: 40 }} onClick={confirmar}>
            Confirmar selección
          </button>
        </div>
      </section>

      <section className="seccion">
        <h2 className="seccion-titulo" style={{ marginBottom: 16 }}>Artículos listos para revisión</h2>
        {porAprobar.map((a) => (
          <div key={a.id} className="tarjeta rejilla" style={{ padding: 0, overflow: "hidden", ["--columnas" as string]: "270px 1fr", marginBottom: 12 }}>
            <Miniatura diseno={{ ...a.diseno, foto: false }} alto={166} />
            <div style={{ padding: "18px 20px", display: "grid", gap: 10, alignContent: "start" }}>
              <div>
                <EtiquetaEstado estado={a.estado} />
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>{a.titulo}</h3>
              <p className="texto-xs texto-muted">
                {a.formato} · {a.canal} · {a.fechaProgramada ? fDiaMes(a.fechaProgramada) : ""} 2026
              </p>
              <p className="texto-xs texto-muted">{a.resumen}</p>
              <div>
                <Enlace a={`/equipo/piezas/${a.id}`} className="boton">
                  <LuArrowRight size={16} /> Abrir artículo
                </Enlace>
              </div>
            </div>
          </div>
        ))}
        {porAprobar.length === 0 && <p className="texto-sm texto-muted">No hay artículos listos para revisión.</p>}
      </section>

      <div className="tarjeta seccion" style={{ padding: "22px 18px 8px" }}>
        <h3 className="tarjeta-titulo" style={{ marginBottom: 8 }}>Los demás artículos de octubre</h3>
        <div className="lista-lineas">
          {arts
            .filter((a) => a.estado !== "LISTO_REVISION")
            .map((a) => (
              <div key={a.id} className="fila entre" style={{ paddingRight: 0 }}>
                <div>
                  <p className="negrita" style={{ fontSize: 12.5 }}>{a.titulo}</p>
                  <p className="texto-xs texto-muted" style={{ marginTop: 4, fontSize: 10.5 }}>
                    {a.fechaProgramada ? fDiaMes(a.fechaProgramada) : ""} · {a.canal}
                    {a.ideaSeleccionada ? " · Idea seleccionada" : ""}
                  </p>
                </div>
                <EtiquetaEstado estado={a.estado} />
              </div>
            ))}
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Plan del mes (tablero)

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Qué significa cada columna (solo «Por revisar» depende del cliente). */
const AYUDA_COLUMNA: Record<string, string> = {
  PLANIFICADO: "Ideas aprobadas que todavía no empezamos.",
  EN_PRODUCCION: "Las estamos creando o ajustando.",
  POR_REVISAR: "Esperan la aprobación del cliente.",
  APROBADO: "Listas para publicar en su fecha.",
  PUBLICADO: "Ya están en tus canales.",
};

type TarjetaTablero = PiezaUI & { ajustando: boolean };

// Plan del mes: salió del portal del cliente (reunión 12 oct) y queda como vista del equipo.
export function PantallaPlanMes() {
  return (
    <Estructura espacio="equipo" migas="Plan del mes">
      <PlanMes />
    </Estructura>
  );
}

function PlanMes() {
  const [servicio, setServicio] = useState("");
  const [periodo, setPeriodo] = useState(PERIODO_DEMO);
  const servicios = useConsulta<S<"ServiciosCliente">>(`/clientes/${clienteActivo()}/servicios`);
  const tablero = useConsulta<S<"Tablero">>(`/clientes/${clienteActivo()}/tablero?periodo=${periodo}${servicio ? `&servicioContratadoId=${servicio}` : ""}`);
  const [anio, mes] = periodo.split("-").map(Number);
  const mover = (d: number) => {
    const f = new Date(Date.UTC(anio, mes - 1 + d, 1));
    setPeriodo(`${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const t = tablero.datos;
  const total = t?.columnas.reduce((n, c) => n + c.piezas.length, 0) ?? 0;

  return (
    <>
      <Cabecera
        antetitulo={`Casa Oliva · ${MESES[mes - 1]} ${anio}`.toUpperCase()}
        titulo="Plan del mes"
        bajada="Las piezas del mes por estado. Solo se publica lo que el cliente aprueba."
        accion={
          <label className="boton" style={{ position: "relative", gap: 10 }}>
            <LuChevronDown size={16} />
            <select aria-label="Filtrar por servicio" value={servicio} onChange={(e) => setServicio(e.target.value)} style={{ appearance: "none", border: 0, background: "none", fontWeight: 600, fontSize: 13.5, outline: "none", cursor: "pointer" }}>
              <option value="">Todos los servicios</option>
              {servicios.datos?.servicios
                .filter((s) => s.cantidadMensual > 0)
                .map((s) => (
                  <option key={s.servicioContratadoId} value={s.servicioContratadoId}>
                    {s.nombre}
                  </option>
                ))}
            </select>
          </label>
        }
      />
      <div className="fila entre fila-filtros" style={{ marginBottom: 20 }}>
        <div className="fila" style={{ gap: 16 }}>
          <button className="enlace" style={{ color: "var(--c-tinta)" }} aria-label="Mes anterior" onClick={() => mover(-1)}>
            <LuChevronLeft size={18} />
          </button>
          <h2 className="cal-mes" style={{ fontSize: 22, fontWeight: 600, textTransform: "capitalize", textAlign: "center" }}>
            {MESES[mes - 1]} {anio}
          </h2>
          <button className="enlace" style={{ color: "var(--c-tinta)" }} aria-label="Mes siguiente" onClick={() => mover(1)}>
            <LuChevronRight size={18} />
          </button>
        </div>
        {periodo !== PERIODO_DEMO && (
          <button className="boton" onClick={() => setPeriodo(PERIODO_DEMO)}>
            Mes actual
          </button>
        )}
      </div>

      {tablero.error ? (
        <ErrorCarga error={tablero.error} reintentar={tablero.recargar} />
      ) : !t ? (
        <Cargando />
      ) : !t.planAprobado ? (
        <div className="tarjeta vacio">El plan de {MESES[mes - 1]} todavía no está aprobado.</div>
      ) : total === 0 ? (
        <div className="tarjeta vacio">No hay piezas planificadas para {MESES[mes - 1]}.</div>
      ) : (
        <>
          {t.porRevisar > 0 && (
            <Aviso icono={<LuCircleCheck size={18} />} titulo={t.porRevisar === 1 ? "1 pieza espera al cliente" : `${t.porRevisar} piezas esperan al cliente`}>
              Si se acerca la fecha de publicación, recuérdale al cliente que las revise.
            </Aviso>
          )}
          <div className="tablero" aria-busy={tablero.cargando}>
            {t.columnas.map((c) => (
              <section key={c.clave} className={`tablero-col${c.clave === "POR_REVISAR" ? " tablero-col--accion" : ""}`} aria-label={`${c.titulo}: ${c.piezas.length}`}>
                <header className="tablero-cab">
                  <span className="negrita">{c.titulo}</span>
                  <span className="tablero-contador">{c.piezas.length}</span>
                </header>
                <p className="tablero-ayuda">{AYUDA_COLUMNA[c.clave]}</p>
                {c.piezas.length === 0 && <p className="tablero-vacio">Nada por aquí.</p>}
                {(c.piezas as TarjetaTablero[]).map((p) => {
                  const fecha = p.fechaProgramada ? `${Number(p.fechaProgramada.slice(8, 10))} ${MESES_CORTOS[Number(p.fechaProgramada.slice(5, 7)) - 1]}` : null;
                  const abre = c.clave !== "PLANIFICADO" && c.clave !== "EN_PRODUCCION";
                  const cuerpo = (
                    <>
                      <span className="tablero-titulo">{p.titulo}</span>
                      <span className="tablero-meta">
                        {p.formato ?? "Pieza"} · {p.canal}
                      </span>
                      {p.ajustando && (
                        <Etiqueta tono="ambar" sinPunto>
                          Ajustando comentarios
                        </Etiqueta>
                      )}
                      <span className="tablero-pie">
                        {fecha && <span>{c.clave === "PUBLICADO" ? `Publicada el ${fecha}` : `Se publica el ${fecha}`}</span>}
                        {c.clave === "POR_REVISAR" && <span className="texto-primario negrita">Abrir →</span>}
                      </span>
                    </>
                  );
                  return abre ? (
                    <Enlace key={p.id} a={`/equipo/piezas/${p.id}`} className="tablero-tarjeta tablero-tarjeta--enlace">
                      {cuerpo}
                    </Enlace>
                  ) : (
                    <div key={p.id} className="tablero-tarjeta">
                      {cuerpo}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          <p className="texto-xs texto-muted" style={{ margin: "20px 0" }}>
            {total} piezas en {MESES[mes - 1]}. Las fechas son previstas hasta su publicación.
          </p>
        </>
      )}
    </>
  );
}
