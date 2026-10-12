"use client";
/**
 * Pantallas que el contrato necesita pero que no tienen frame en Figma (arquitectura §8, «Pantallas que
 * faltan»). Reutilizan los componentes y tokens del resto del portal; ver docs/diseno.md antes de
 * tomarlas como diseño final.
 */
import { useRef, useState, type FormEvent } from "react";
import { LuCheck, LuChevronLeft, LuChevronRight, LuMail, LuPencil, LuPlus, LuTriangleAlert, LuUpload } from "react-icons/lu";
import { api, CLIENTE_DEMO, clienteActivo, Enlace, fCorta, fDiaHora, fMesAnio, PERIODO_DEMO, ProblemaApi, useConsulta, type S } from "../base";
import { Aviso, Barra, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, EtiquetaEstado, Modal, useAviso, usePortal } from "../componentes";

const usd = (n: number) => `US$ ${n.toFixed(2).replace(".", ",")}`;
const errores = (x: unknown) => Object.fromEntries((x as ProblemaApi).errores.map((e) => [e.campo, e.mensaje]));

function Ayuda({ error, texto }: { error?: string; texto?: string }) {
  if (!error && !texto) return null;
  return (
    <span className="ayuda-campo" role={error ? "alert" : undefined} style={error ? { color: "var(--c-alerta)" } : undefined}>
      {error || texto}
    </span>
  );
}

/** Selector con el mismo aspecto que los filtros de la bandeja de producción. */
function Selector({ etiqueta, valor, alCambiar, opciones }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; opciones: [string, string][] }) {
  return (
    <label className="boton" style={{ position: "relative" }}>
      <select aria-label={etiqueta} value={valor} onChange={(e) => alCambiar(e.target.value)} style={{ appearance: "none", border: 0, background: "none", fontWeight: 600, outline: "none", cursor: "pointer" }}>
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}

// ═════════════════════════════════════════════ Cliente · Biblioteca (PMD-01)

export function PantallaBiblioteca() {
  return (
    <Estructura espacio="cliente" migas="Biblioteca">
      <Biblioteca />
    </Estructura>
  );
}

const TIPO_PIEZA: Record<string, string> = { COPY: "Pieza para redes", CARRUSEL: "Carrusel", ESTATICO: "Pieza estática", GUION: "Guion de reel", BLOG: "Artículo de blog", ANUNCIO: "Anuncio" };

function Biblioteca() {
  const avisar = useAviso();
  const { sesion } = usePortal();
  const [origen, setOrigen] = useState("");
  const [tipo, setTipo] = useState("");
  const [derechos, setDerechos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const id = clienteActivo();
  const camino = `/clientes/${id}/biblioteca-paid?${origen ? `origen=${origen}&` : ""}${tipo ? `tipo=${tipo}` : ""}`;
  const { datos: d, error: errorCarga, recargar } = useConsulta<{ datos: S<"ItemBiblioteca">[] }>(camino);
  const puedeSubir = sesion?.clientes[0]?.rol !== "LECTOR";

  const subir = async (f: File | undefined) => {
    if (!f) return;
    if (!derechos) {
      setError("Marca la declaración de derechos antes de subir.");
      return;
    }
    setError(null);
    setSubiendo(true);
    try {
      const r = await api<{ archivo: { id: string }; subida: { url: string; headers: Record<string, string> } }>(`/clientes/${id}/archivos`, {
        metodo: "POST",
        cuerpo: { nombre: f.name, mime: f.type, bytes: f.size, uso: "BIBLIOTECA", declaraDerechos: true },
        idempotente: true,
      });
      await fetch(r.subida.url, { method: "PUT", headers: r.subida.headers, body: f });
      await api(`/archivos/${r.archivo.id}/confirmar`, { metodo: "POST", cuerpo: {} });
      avisar({ titulo: "Archivo agregado", texto: `${f.name} ya está en tu biblioteca.` });
      void recargar();
    } catch (e) {
      setError((e as ProblemaApi).titulo);
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  return (
    <>
      <Cabecera antetitulo="Contenido listo para usar" titulo="Biblioteca" bajada="Piezas aprobadas que podemos usar en anuncios y el material que compartiste con nosotros." />
      <div className="con-lateral">
        <div className="pila">
          <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
            <Selector etiqueta="Origen" valor={origen} alCambiar={setOrigen} opciones={[["", "Todo"], ["PIEZA", "Piezas aprobadas"], ["ARCHIVO_CLIENTE", "Tu contenido"]]} />
            <Selector etiqueta="Tipo" valor={tipo} alCambiar={setTipo} opciones={[["", "Todos los formatos"], ...Object.entries(TIPO_PIEZA).filter(([k]) => k !== "BLOG" && k !== "GUION")]} />
            {d && <span className="texto-xs texto-muted" style={{ marginLeft: "auto" }}>{d.datos.length} elementos</span>}
          </div>
          {errorCarga ? (
            <ErrorCarga error={errorCarga} reintentar={recargar} />
          ) : !d ? (
            <Cargando />
          ) : d.datos.length === 0 ? (
            <div className="tarjeta vacio">No hay elementos con esos filtros.</div>
          ) : (
            <div className="grid-3">
              {d.datos.map((x) => (
                <article key={x.id} className="tarjeta" style={{ padding: 12, display: "grid", gap: 10, alignContent: "start" }}>
                  <div style={{ height: 120, borderRadius: 12, background: x.miniaturaUrl ? `center/cover url(${x.miniaturaUrl})` : "var(--c-crema)" }} role="img" aria-label={x.titulo} />
                  <div className="fila entre">
                    <Etiqueta tono={x.origen === "PIEZA" ? "verde" : "violeta"}>{x.origen === "PIEZA" ? "Pieza aprobada" : "Tu contenido"}</Etiqueta>
                    {x.aprobadoEn && <span className="texto-xs texto-muted">{fCorta(x.aprobadoEn)}</span>}
                  </div>
                  <p className="negrita" style={{ fontSize: 13 }}>{x.titulo}</p>
                  <p className="texto-xs texto-muted">{x.tipo ? TIPO_PIEZA[x.tipo] ?? x.tipo : "Archivo"}</p>
                  {(x.etiquetas ?? []).length > 0 && (
                    <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
                      {x.etiquetas!.map((e) => (
                        <span key={e} className="etiqueta etiqueta--sin-punto" style={{ background: "var(--c-fondo)" }}>{e}</span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
        <aside className="pila">
          <div className="tarjeta" style={{ padding: "22px 18px", display: "grid", gap: 14 }}>
            <h2 className="tarjeta-titulo">Agregar a tu biblioteca</h2>
            {puedeSubir ? (
              <>
                <label className="casilla" style={{ alignItems: "flex-start", fontSize: 11.5, lineHeight: 1.6 }}>
                  <input type="checkbox" checked={derechos} onChange={(e) => setDerechos(e.target.checked)} style={{ marginTop: 3 }} />
                  Declaro que tengo los derechos de uso de este material y autorizo a Inoo a usarlo en contenidos y anuncios de la marca. *
                </label>
                <div className="zona-carga" role="button" tabIndex={0} aria-disabled={subiendo} onClick={() => archivo.current?.click()} onKeyDown={(e) => e.key === "Enter" && archivo.current?.click()} style={{ padding: 24 }}>
                  <LuUpload size={18} />
                  <strong className="texto-primario" style={{ fontSize: 11.5 }}>{subiendo ? "Subiendo…" : "Selecciona una foto o video"}</strong>
                  <span style={{ fontSize: 9.5 }}>JPG, PNG o MP4 · Máximo 100 MB</span>
                  <input ref={archivo} type="file" hidden accept=".jpg,.jpeg,.png,.mp4" onChange={(e) => void subir(e.target.files?.[0])} />
                </div>
                <Ayuda error={error ?? undefined} />
              </>
            ) : (
              <p className="texto-xs texto-muted">Tu usuario es de solo lectura. Pide a la persona administradora de la cuenta que agregue el material.</p>
            )}
          </div>
          <Aviso icono={<LuCheck size={16} />} titulo="¿Qué aparece aquí?">
            Las piezas que aprobaste y que sirven para anuncios, y las fotos o videos que nos compartiste con tu declaración de derechos.
          </Aviso>
        </aside>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Cliente · Usuarios y avisos (POR-01, INO-04)

export function PantallaUsuarios() {
  return (
    <Estructura espacio="cliente" migas="Usuarios y avisos">
      <Usuarios />
    </Estructura>
  );
}

const ROL_CLIENTE: Record<string, string> = { ADMIN_CLIENTE: "Administra la cuenta", APROBADOR: "Aprueba piezas", LECTOR: "Solo lectura" };
const DESTINATARIOS: Record<string, string> = { MIEMBROS_CLIENTE: "Tu equipo", ACCOUNT_MANAGER: "Inoo", AMBOS: "Tu equipo e Inoo" };

function Usuarios() {
  const { sesion } = usePortal();
  const id = clienteActivo();
  const esAdmin = sesion?.clientes[0]?.rol === "ADMIN_CLIENTE";
  const miembros = useConsulta<{ datos: S<"Miembro">[] }>(sesion ? (esAdmin ? `/clientes/${id}/miembros` : null) : null);
  const correos = useConsulta<{ reglas: S<"ReglaCorreo">[]; recientes: S<"CorreoEnviado">[] }>(`/clientes/${id}/correos-automaticos`);
  return (
    <>
      <Cabecera antetitulo="Tu cuenta" titulo="Usuarios y avisos" bajada="Quién entra al portal y qué correos enviamos. Los accesos los gestiona tu equipo Inoo." />
      <section className="tarjeta" style={{ padding: "24px 18px" }}>
        <h2 className="tarjeta-titulo" style={{ marginBottom: 16 }}>Usuarios del portal</h2>
        {!esAdmin ? (
          <p className="texto-sm texto-muted">La lista de usuarios la ve la persona que administra la cuenta. Para dar acceso a alguien más, escríbele a tu equipo Inoo.</p>
        ) : miembros.error ? (
          <ErrorCarga error={miembros.error} reintentar={miembros.recargar} />
        ) : !miembros.datos ? (
          <Cargando />
        ) : (
          <>
            <div className="tabla-envoltura">
              <table className="tabla" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Permiso</th>
                  </tr>
                </thead>
                <tbody>
                  {miembros.datos.datos.map((m) => (
                    <tr key={m.usuarioId} style={{ cursor: "default" }}>
                      <td>
                        <p className="negrita">
                          {m.nombre} {m.usuarioId === sesion?.usuario.id && <span className="texto-muted">(tú)</span>}
                        </p>
                        <p className="texto-xs texto-muted" style={{ marginTop: 4 }}>
                          {m.email} {m.invitacionPendiente && <Etiqueta tono="ambar">Invitación pendiente</Etiqueta>}
                        </p>
                      </td>
                      <td>{ROL_CLIENTE[m.rol] ?? m.rol}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="texto-xs texto-muted" style={{ marginTop: 16 }}>
              Para dar acceso a alguien más de tu equipo o cambiar permisos, envíale los datos a tu equipo Inoo y lo hacemos por ti.
            </p>
          </>
        )}
      </section>

      <section className="grid-2 seccion" style={{ alignItems: "start" }}>
        <div className="tarjeta" style={{ padding: "24px 18px", display: "grid", gap: 14 }}>
          <h2 className="tarjeta-titulo">Correos automáticos</h2>
          {correos.datos?.reglas.map((r) => (
            <div key={r.evento} className="fila" style={{ gap: 12 }}>
              <LuMail size={16} color="var(--c-primario)" />
              <span style={{ flex: 1 }}>
                <span className="negrita" style={{ display: "block", fontSize: 12 }}>{r.descripcion}</span>
                <span className="texto-xs texto-muted">Para: {DESTINATARIOS[r.destinatarios ?? "MIEMBROS_CLIENTE"]}</span>
              </span>
              <Etiqueta tono={r.activa ? "verde" : "gris"}>{r.activa ? "Activo" : "Pausado"}</Etiqueta>
            </div>
          ))}
        </div>
        <div className="tarjeta" style={{ padding: "24px 18px" }}>
          <h2 className="tarjeta-titulo" style={{ marginBottom: 14 }}>Últimos correos enviados</h2>
          {!correos.datos ? (
            <Cargando />
          ) : (
            <div className="lista-suave">
              {correos.datos.recientes.map((c) => (
                <div key={c.id} className="fila-suave" style={{ padding: "12px 6px", display: "grid", gap: 4 }}>
                  <span className="negrita" style={{ fontSize: 12 }}>{c.asunto}</span>
                  <span className="texto-xs texto-muted">
                    {c.para} · {c.enviadoEn ? fDiaHora(c.enviadoEn) : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ═════════════════════════════════════════════ Equipo · Calendarios (CU-02, MKT-02)

export function PantallaCalendarioEquipo() {
  return (
    <Estructura espacio="equipo" migas="Calendarios">
      <CalendarioEquipo />
    </Estructura>
  );
}

const ESTADO_CAL: Record<string, [string, "ambar" | "azul" | "verde"]> = {
  PROPUESTO: ["Propuesta por revisar", "ambar"],
  CAMBIOS_SOLICITADOS: ["El agente está ajustando", "azul"],
  APROBADO_PLAN: ["Plan aprobado", "verde"],
};

function moverPeriodo(p: string, d: number) {
  const [a, m] = p.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + d, 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
}

function CalendarioEquipo() {
  const avisar = useAviso();
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes");
  const [clienteId, setClienteId] = useState(CLIENTE_DEMO);
  const [periodo, setPeriodo] = useState(moverPeriodo(PERIODO_DEMO, 1));
  const cal = useConsulta<S<"Calendario">>(`/clientes/${clienteId}/calendario/${periodo}`);
  const [cambios, setCambios] = useState(false);
  const [comentario, setComentario] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const decidir = async (accion: "aprobar" | "solicitar-cambios") => {
    if (!cal.datos) return;
    setErr(null);
    try {
      await api(`/clientes/${clienteId}/calendario/${periodo}/${accion}`, { metodo: "POST", cuerpo: { version: cal.datos.version, comentario: accion === "aprobar" ? undefined : comentario }, idempotente: true });
      avisar(accion === "aprobar" ? { titulo: "Plan aprobado", texto: "El Jefe de Marketing reparte las tareas a los agentes." } : { titulo: "Cambios enviados", texto: "El agente preparará una nueva versión." });
      setCambios(false);
      setComentario("");
      void cal.recargar();
    } catch (x) {
      setErr((x as ProblemaApi).errores[0]?.mensaje ?? (x as ProblemaApi).titulo);
    }
  };

  const d = cal.datos;
  const [et, tono] = d ? ESTADO_CAL[d.estado] : ["", "verde" as const];
  return (
    <>
      <Cabecera antetitulo="Equipo Inoo · Planificación" titulo="Calendarios" bajada="Revisa la propuesta mensual del Jefe de Marketing antes de que los agentes produzcan." />
      <div className="fila" style={{ gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <Selector etiqueta="Cliente" valor={clienteId} alCambiar={setClienteId} opciones={(clientes.datos?.datos ?? [{ id: CLIENTE_DEMO, nombre: "Casa Oliva" }]).map((c) => [c.id, c.nombre] as [string, string])} />
        <div className="fila" style={{ gap: 4 }}>
          <button className="boton" aria-label="Mes anterior" onClick={() => setPeriodo(moverPeriodo(periodo, -1))}>
            <LuChevronLeft size={16} />
          </button>
          <span className="boton" style={{ minWidth: 150, justifyContent: "center" }}>{fMesAnio(periodo)}</span>
          <button className="boton" aria-label="Mes siguiente" onClick={() => setPeriodo(moverPeriodo(periodo, 1))}>
            <LuChevronRight size={16} />
          </button>
        </div>
      </div>
      {cal.error ? (
        <ErrorCarga error={cal.error} reintentar={cal.recargar} />
      ) : !d ? (
        <Cargando />
      ) : d.entradas.length === 0 ? (
        <div className="tarjeta vacio">
          <p className="negrita" style={{ color: "var(--c-tinta)" }}>Sin propuesta para {fMesAnio(periodo).toLowerCase()}</p>
          <p className="texto-sm">El Jefe de Marketing la genera cuando confirmas el brief del cliente.</p>
        </div>
      ) : (
        <>
          <div className="tarjeta fila" style={{ padding: "20px 18px", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px" }}>
              <div className="fila" style={{ gap: 10 }}>
                <Etiqueta tono={tono}>{et}</Etiqueta>
                <span className="texto-xs texto-muted">Versión {d.version} · {d.entradas.length} publicaciones</span>
              </div>
              {d.resumen && <p className="texto-sm" style={{ marginTop: 10 }}>{d.resumen}</p>}
              {d.aprobadoPor && d.aprobadoEn && <p className="texto-xs texto-muted" style={{ marginTop: 6 }}>Aprobado por {d.aprobadoPor.nombre} el {fCorta(d.aprobadoEn)}</p>}
            </div>
            {d.estado === "PROPUESTO" && (
              <div className="fila" style={{ gap: 10 }}>
                <button className="boton" onClick={() => setCambios(true)}>
                  <LuPencil size={16} /> Pedir cambios
                </button>
                <button className="boton boton--primario" onClick={() => void decidir("aprobar")}>
                  <LuCheck size={16} /> Aprobar plan
                </button>
              </div>
            )}
          </div>
          {err && !cambios && <div style={{ marginTop: 12 }}><Aviso tono="alerta" icono={<LuTriangleAlert size={16} />}>{err}</Aviso></div>}
          <div className="tarjeta seccion" style={{ padding: "18px 14px" }}>
            <div className="tabla-envoltura">
              <table className="tabla" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Publicación</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.entradas.map((p) => (
                    <tr key={p.id} style={{ cursor: "default" }}>
                      <td className="texto-muted">{p.fechaProgramada ? fCorta(p.fechaProgramada) : "—"}</td>
                      <td>
                        <p className="negrita">{p.titulo}</p>
                        <p className="texto-xs texto-muted" style={{ marginTop: 4 }}>{(p as { formato?: string }).formato} · {p.canal}</p>
                      </td>
                      <td>
                        <EtiquetaEstado estado={p.estado} />
                      </td>
                      <td>
                        <Enlace a={`/equipo/piezas/${p.id}`} className="enlace" style={{ fontSize: 11 }}>
                          Abrir →
                        </Enlace>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <Modal abierto={cambios} alCerrar={() => setCambios(false)} etiqueta="Pedir cambios al plan">
        <div style={{ display: "grid", gap: 14 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Pedir cambios al plan</h2>
          <div className="campo">
            <label htmlFor="cal-comentario">¿Qué debe ajustar el agente?</label>
            <div className="entrada">
              <textarea id="cal-comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej. Agrega un estático para el Día de la Canción Criolla." />
            </div>
            <Ayuda error={err ?? undefined} />
          </div>
          <button className="boton boton--primario" onClick={() => void decidir("solicitar-cambios")}>
            Enviar cambios
          </button>
        </div>
      </Modal>
    </>
  );
}

// ═════════════════════════════════════════════ Equipo · Costos de IA (ADM-01)

export function PantallaCostosIa() {
  return (
    <Estructura espacio="equipo" migas="Costos de IA">
      <CostosIa />
    </Estructura>
  );
}

const ESTADO_EJECUCION: Record<string, [string, "verde" | "ambar" | "azul" | "gris"]> = {
  OK: ["Completada", "verde"], ERROR: ["Error", "ambar"], EN_CURSO: ["En curso", "azul"], CANCELADA: ["Cancelada", "gris"],
};

function CostosIa() {
  const [estado, setEstado] = useState("");
  const costos = useConsulta<S<"ReporteCostos">>(`/panel/costos-ia?periodo=${PERIODO_DEMO}`);
  const ejec = useConsulta<{ datos: S<"Ejecucion">[] }>(`/panel/ejecuciones${estado ? `?estado=${estado}` : ""}`);
  if (costos.error?.status === 403) {
    return (
      <>
        <Cabecera antetitulo="Equipo Inoo · Gobernanza" titulo="Costos de IA" />
        <Aviso icono={<LuTriangleAlert size={18} />} titulo="Solo para administración">
          El detalle por modelo y las ejecuciones los ve el rol ADMIN. El consumo por cliente está en el <Enlace a="/equipo/panel" className="enlace">Panel general</Enlace>.
        </Aviso>
      </>
    );
  }
  if (costos.error) return <ErrorCarga error={costos.error} reintentar={costos.recargar} />;
  if (!costos.datos) return <Cargando />;
  const r = costos.datos;
  const enAlerta = r.clientes.filter((c) => c.pctLimite >= 80).length;
  const conError = ejec.datos?.datos.filter((x) => x.estado === "ERROR").length ?? 0;
  return (
    <>
      <Cabecera antetitulo="Equipo Inoo · Gobernanza" titulo="Costos de IA" bajada={`Consumo de ${fMesAnio(r.periodo).toLowerCase()} por cliente y por modelo. Alerta desde el 80 % del límite.`} />
      <div className="grid-4">
        <div className="tarjeta kpi">
          <div className="kpi-cab">Gasto del mes</div>
          <div className="kpi-valor">{usd(r.totalUsd)}</div>
          <div className="kpi-pie">{r.clientes.length} clientes</div>
        </div>
        <div className="tarjeta kpi kpi--destacado">
          <div className="kpi-cab">Clientes en alerta</div>
          <div className="kpi-valor">{enAlerta}</div>
          <div className="kpi-pie">80 % o más de su límite</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Ejecuciones</div>
          <div className="kpi-valor">{ejec.datos?.datos.length ?? "—"}</div>
          <div className="kpi-pie">Registradas por n8n</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Con error</div>
          <div className="kpi-valor" style={conError ? { color: "var(--c-alerta)" } : undefined}>{conError}</div>
          <div className="kpi-pie">Revisar en n8n</div>
        </div>
      </div>
      <div className="tarjeta seccion" style={{ padding: "22px 18px" }}>
        <h2 className="tarjeta-titulo" style={{ marginBottom: 16 }}>Por cliente</h2>
        <div className="tabla-envoltura">
          <table className="tabla" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th style={{ width: 220 }}>Gasto / límite</th>
                <th>Modelos</th>
              </tr>
            </thead>
            <tbody>
              {r.clientes.map((c) => (
                <tr key={c.clienteId} style={{ cursor: "default" }}>
                  <td className="negrita">{c.nombre}</td>
                  <td>
                    <p className="negrita" style={{ fontSize: 11 }}>
                      {usd(c.gastoUsd)} / {usd(c.limiteUsd)} · {String(c.pctLimite).replace(".", ",")} %
                    </p>
                    <div style={{ marginTop: 6 }}>
                      <Barra pct={c.pctLimite} tono={c.pctLimite >= 80 ? "ambar" : undefined} />
                    </div>
                  </td>
                  <td>
                    <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
                      {c.porModelo.map((m) => (
                        <span key={m.modelo} className="etiqueta etiqueta--sin-punto" style={{ background: "var(--c-fondo)" }}>
                          {m.modelo} · {usd(m.costoUsd ?? 0)}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="tarjeta seccion" style={{ padding: "22px 18px" }}>
        <div className="fila entre" style={{ marginBottom: 16 }}>
          <h2 className="tarjeta-titulo">Ejecuciones de agentes</h2>
          <Selector etiqueta="Estado de la ejecución" valor={estado} alCambiar={setEstado} opciones={[["", "Todas"], ["OK", "Completadas"], ["ERROR", "Con error"], ["EN_CURSO", "En curso"]]} />
        </div>
        {!ejec.datos ? (
          <Cargando />
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Cliente</th>
                  <th>Agente</th>
                  <th>Estado</th>
                  <th>Costo</th>
                </tr>
              </thead>
              <tbody>
                {ejec.datos.datos.map((x) => {
                  const [t, tn] = ESTADO_EJECUCION[x.estado];
                  return (
                    <tr key={x.id} style={{ cursor: "default" }}>
                      <td className="texto-muted">{fDiaHora(x.iniciadoEn)}</td>
                      <td>{x.clienteNombre}</td>
                      <td>
                        <p className="negrita">{x.agente}</p>
                        {x.error && <p className="texto-xs" style={{ color: "var(--c-alerta)", marginTop: 4 }}>{x.error}</p>}
                      </td>
                      <td>
                        <Etiqueta tono={tn}>{t}</Etiqueta>
                      </td>
                      <td>{usd(x.costoUsd ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ═════════════════════════════════════════════ Equipo · Alta de cliente y edición de ficha

const CANALES = ["INSTAGRAM", "FACEBOOK", "LINKEDIN", "TIKTOK", "YOUTUBE", "BLOG", "WEB"] as const;

export function NuevoCliente({ abierto, alCerrar, alCrear }: { abierto: boolean; alCerrar: () => void; alCrear: (id: string) => void }) {
  const [nombre, setNombre] = useState("");
  const [limite, setLimite] = useState("25");
  const [canales, setCanales] = useState<string[]>(["INSTAGRAM"]);
  const [err, setErr] = useState<Record<string, string>>({});
  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    try {
      const c = await api<S<"Cliente">>("/clientes", { metodo: "POST", cuerpo: { nombre, limiteGastoIaUsd: Number(limite), canales }, idempotente: true });
      setNombre("");
      alCrear(c.id);
    } catch (x) {
      const p = x as ProblemaApi;
      setErr(p.errores.length ? errores(x) : { nombre: p.titulo });
    }
  };
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Nuevo cliente">
      <form onSubmit={crear} noValidate style={{ display: "grid", gap: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Nuevo cliente</h2>
        <p className="texto-xs texto-muted">Al crearlo, n8n prepara su carpeta en Drive y lo deja listo para recibir briefs (CU-01).</p>
        <div className="campo">
          <label htmlFor="nc-nombre">Nombre de la marca</label>
          <div className="entrada">
            <input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={!!err.nombre} />
          </div>
          <Ayuda error={err.nombre} />
        </div>
        <div className="campo">
          <label htmlFor="nc-limite">Límite mensual de IA (US$)</label>
          <div className="entrada">
            <input id="nc-limite" type="number" min={1} value={limite} onChange={(e) => setLimite(e.target.value)} aria-invalid={!!err.limiteGastoIaUsd} />
          </div>
          <Ayuda error={err.limiteGastoIaUsd} texto="El PRD propone US$ 25 por cliente. Alerta al 80 %." />
        </div>
        <div className="campo">
          <span className="rotulo" id="nc-canales">Canales</span>
          <div className="chips" role="group" aria-labelledby="nc-canales">
            {CANALES.map((c) => (
              <button type="button" key={c} className="chip" aria-pressed={canales.includes(c)} onClick={() => setCanales((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]))}>
                {canales.includes(c) && <LuCheck size={14} />} {c.charAt(0) + c.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <button className="boton boton--primario">
          <LuPlus size={16} /> Crear cliente
        </button>
      </form>
    </Modal>
  );
}

type FichaEditable = S<"Cliente"> & { marca?: { mensajeCentral?: string; campanaActual?: string; descripcion?: string } };

export function EditarFicha({ cliente, abierto, alCerrar, alGuardar }: { cliente: FichaEditable; abierto: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const [mensaje, setMensaje] = useState(cliente.marca?.mensajeCentral ?? "");
  const [campana, setCampana] = useState(cliente.marca?.campanaActual ?? "");
  const [tono, setTono] = useState((cliente.tono?.etiquetas ?? []).join(", "));
  const [tonoDesc, setTonoDesc] = useState(cliente.tono?.descripcion ?? "");
  const [limite, setLimite] = useState(String(cliente.limiteGastoIaUsd ?? ""));
  const [err, setErr] = useState<Record<string, string>>({});
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    try {
      await api(`/clientes/${cliente.id}`, {
        metodo: "PATCH",
        cuerpo: {
          marca: { mensajeCentral: mensaje, campanaActual: campana },
          tono: { etiquetas: tono.split(",").map((t) => t.trim()).filter(Boolean), descripcion: tonoDesc },
          ...(limite ? { limiteGastoIaUsd: Number(limite) } : {}),
        },
      });
      alGuardar();
    } catch (x) {
      const p = x as ProblemaApi;
      setErr(p.errores.length ? errores(x) : { general: p.titulo });
    }
  };
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Editar ficha">
      <form onSubmit={guardar} noValidate style={{ display: "grid", gap: 14 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Editar ficha de {cliente.nombre}</h2>
        <div className="campo">
          <label htmlFor="ef-mensaje">Mensaje central</label>
          <div className="entrada">
            <input id="ef-mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="ef-campana">Campaña actual</label>
          <div className="entrada">
            <input id="ef-campana" value={campana} onChange={(e) => setCampana(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="ef-tono">Tono de voz (separado por comas)</label>
          <div className="entrada">
            <input id="ef-tono" value={tono} onChange={(e) => setTono(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="ef-tono-desc">Cómo hablamos</label>
          <div className="entrada">
            <textarea id="ef-tono-desc" value={tonoDesc} onChange={(e) => setTonoDesc(e.target.value)} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="ef-limite">Límite mensual de IA (US$)</label>
          <div className="entrada">
            <input id="ef-limite" type="number" min={1} value={limite} onChange={(e) => setLimite(e.target.value)} aria-invalid={!!err.limiteGastoIaUsd} />
          </div>
          <Ayuda error={err.limiteGastoIaUsd} />
        </div>
        <Ayuda error={err.general} />
        <button className="boton boton--primario">Guardar cambios</button>
      </form>
    </Modal>
  );
}
