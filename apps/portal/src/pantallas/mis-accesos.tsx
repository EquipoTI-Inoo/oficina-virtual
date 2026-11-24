"use client";
/**
 * Pedir acceso (24 nov 2026). Dos pantallas:
 *  · «Mis accesos» (todo el equipo): qué marcas y tableros veo y por qué, y pedir lo que me falta eligiendo de la
 *    lista real (así los nombres casan).
 *  · «Pedidos de acceso» (quien asigna accesos o un lead): aprobar o rechazar; al aprobar se aplica solo. Abajo,
 *    qué ve cada persona y por qué, con lo asignado a mano para quitar.
 * Reglas en src/dominio/solicitudes-acceso.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { LuCheck, LuKeyRound, LuPlus, LuSearch, LuSquareKanban, LuTag, LuX } from "react-icons/lu";
import { api, Enlace, fCorta, ProblemaApi, useConsulta, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso, usePortal } from "../componentes";
import { NOMBRE_AREA } from "../dominio/ia-equipo";
import { NOMBRE_MOTIVO_MARCA, NOMBRE_MOTIVO_TABLERO, NOMBRE_ROL_SOLICITUD, type RolSolicitud } from "../dominio/solicitudes-acceso";

type Accesos = S<"AccesosPersona">;
type Pedido = S<"SolicitudAcceso">;
type Catalogo = { marcas: { id: string; nombre: string }[]; tableros: { id: string; nombre: string; cliente: string | null; lider: string | null }[]; inooworkResponde: boolean };

const ESTADO: Record<Pedido["estado"], [string, "ambar" | "verde" | "rojo"]> = { PENDIENTE: ["Pendiente", "ambar"], APROBADA: ["Aprobado", "verde"], RECHAZADA: ["Rechazado", "rojo"] };
const NIVEL: Record<Accesos["persona"]["nivel"], string> = { ADMIN: "Administrador: ve todo", CUENTA: "Por cuenta", PROYECTO: "Por proyecto" };
const errorDe = (e: unknown) => (e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined);

export function PantallaMisAccesos() {
  return (
    <Estructura espacio="equipo" migas="Mis accesos">
      <MisAccesos />
    </Estructura>
  );
}

function MisAccesos() {
  const r = useConsulta<Accesos>("/me/accesos");
  const [pidiendo, setPidiendo] = useState(false);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const d = r.datos;
  const cancelar = async (p: Pedido) => {
    try {
      await api(`/me/solicitudes-acceso/${p.id}`, { metodo: "DELETE" });
      avisar({ titulo: `Cancelaste el pedido de ${p.nombre}` });
      void r.recargar();
    } catch (e) {
      avisar({ titulo: "No pudimos cancelarlo", texto: errorDe(e) });
    }
  };
  return (
    <>
      <Cabecera
        antetitulo="Mi cuenta"
        titulo="Mis accesos"
        bajada="Las marcas y los tableros que ves en el portal, y por qué. Si te falta alguno, pídelo aquí: lo aprueba quien asigna los accesos."
        accion={d.puedePedir ? <button className="boton boton--primario" onClick={() => setPidiendo(true)}><LuPlus size={16} /> Pedir acceso</button> : undefined}
      />
      {!d.puedePedir && <p className="texto-sm tarjeta" style={{ padding: "12px 16px", marginBottom: 14 }}>Con tu nivel ya ves todas las marcas y todos los tableros (salvo los privados).</p>}
      <VistaAccesos d={d} />
      {d.solicitudes.length > 0 && (
        <section className="tarjeta" style={{ padding: "18px 16px", marginTop: 14, display: "grid", gap: 10 }} aria-label="Mis pedidos">
          <h2 className="tarjeta-titulo" style={{ fontSize: "var(--t-md)" }}>Mis pedidos</h2>
          {d.solicitudes.map((p) => (
            <div key={p.id} className="fila entre texto-sm" style={{ gap: 10, flexWrap: "wrap" }}>
              <span>
                <span className="negrita">{p.nombre}</span>
                <span className="texto-xs texto-muted"> · {p.tipo === "MARCA" ? "marca" : "tablero"} · {NOMBRE_ROL_SOLICITUD[p.rol].toLowerCase()} · {fCorta(p.creadoEn)}</span>
                {p.estado === "RECHAZADA" && p.motivo && <span className="texto-xs" style={{ display: "block", color: "var(--c-muted)" }}>Motivo: {p.motivo}</span>}
              </span>
              <span className="fila" style={{ gap: 8 }}>
                <Etiqueta tono={ESTADO[p.estado][1]}>{ESTADO[p.estado][0]}</Etiqueta>
                {p.estado === "PENDIENTE" && <button className="boton boton--chico" onClick={() => void cancelar(p)}>Cancelar</button>}
              </span>
            </div>
          ))}
        </section>
      )}
      {pidiendo && <PedirAcceso mios={d} alCerrar={() => setPidiendo(false)} alPedir={() => { setPidiendo(false); void r.recargar(); }} />}
    </>
  );
}

/** Las marcas y los tableros de una persona, con el motivo. Con `alQuitar`, lo asignado a mano se puede quitar. */
function VistaAccesos({ d, alQuitar }: { d: Accesos; alQuitar?: (clienteId: string, nombre: string) => void }) {
  return (
    <div className="grilla-2" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
      <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 8, alignContent: "start" }} aria-label="Marcas">
        <h2 className="tarjeta-titulo fila" style={{ fontSize: "var(--t-md)", gap: 8 }}><LuTag size={15} /> Marcas ({d.marcas.length})</h2>
        {d.marcas.length === 0 && <p className="texto-sm texto-muted">Todavía no ves ninguna marca.</p>}
        {d.marcas.map((m) => (
          <div key={m.clienteId} className="fila entre texto-sm" style={{ gap: 8 }}>
            <span className="negrita">{m.nombre}</span>
            <span className="fila" style={{ gap: 6 }}>
              <span className="texto-xs texto-muted">{NOMBRE_MOTIVO_MARCA[m.motivo]}</span>
              {alQuitar && m.puedeQuitar && (
                <button className="boton boton--chico" aria-label={`Quitar ${m.nombre}`} onClick={() => alQuitar(m.clienteId, m.nombre)}><LuX size={13} /></button>
              )}
            </span>
          </div>
        ))}
      </section>
      <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 8, alignContent: "start" }} aria-label="Tableros">
        <h2 className="tarjeta-titulo fila" style={{ fontSize: "var(--t-md)", gap: 8 }}><LuSquareKanban size={15} /> Tableros ({d.tableros.length})</h2>
        {!d.inooworkResponde && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>InooWork no respondió: los tableros no se pudieron cargar.</p>}
        {d.sinFichaInooWork && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>Sin ficha en InooWork no se entra a los tableros: pídesela a RR. HH.</p>}
        {d.inooworkResponde && d.tableros.length === 0 && !d.sinFichaInooWork && <p className="texto-sm texto-muted">Todavía no estás en ningún tablero.</p>}
        {d.tableros.slice(0, 200).map((t) => (
          <Enlace key={t.id} a={`/equipo/proyectos/tableros/${t.id}`} className="fila entre texto-sm boton-lista" >
            <span>
              <span className="negrita">{t.nombre}</span>
              {t.cliente && <span className="texto-xs texto-muted"> · {t.cliente}</span>}
            </span>
            <span className="texto-xs texto-muted">{NOMBRE_MOTIVO_TABLERO[t.motivo]}</span>
          </Enlace>
        ))}
      </section>
    </div>
  );
}

/** Elegir de la lista real las marcas y los tableros que faltan. */
function PedirAcceso({ mios, alCerrar, alPedir }: { mios: Accesos; alCerrar: () => void; alPedir: () => void }) {
  const cat = useConsulta<Catalogo>("/me/accesos/catalogo");
  const [pestana, setPestana] = useState<"MARCA" | "TABLERO">("MARCA");
  const [q, setQ] = useState("");
  const [marcas, setMarcas] = useState<Set<string>>(new Set());
  const [tableros, setTableros] = useState<Set<string>>(new Set());
  const [rol, setRol] = useState<RolSolicitud>("APOYO");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAviso();
  const pendientes = useMemo(() => new Set(mios.solicitudes.filter((s) => s.estado === "PENDIENTE").map((s) => s.clienteId ?? s.tableroId)), [mios]);
  const busca = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const marcasLibres = (cat.datos?.marcas ?? []).filter((m) => !mios.marcas.some((x) => x.clienteId === m.id) && !pendientes.has(m.id));
  const tablerosLibres = (cat.datos?.tableros ?? []).filter((t) => !mios.tableros.some((x) => x.id === t.id) && !pendientes.has(t.id));
  const lista = pestana === "MARCA"
    ? marcasLibres.filter((m) => busca(m.nombre))
    : tablerosLibres.filter((t) => busca(`${t.nombre} ${t.cliente ?? ""} ${t.lider ?? ""}`));
  const elegidos = marcas.size + tableros.size;
  const alternar = (id: string) => {
    const [conj, poner] = pestana === "MARCA" ? [marcas, setMarcas] : [tableros, setTableros];
    const x = new Set(conj);
    if (x.has(id)) x.delete(id); else x.add(id);
    poner(x);
  };
  const enviar = async () => {
    setEnviando(true);
    try {
      const pedidos = [...[...marcas].map((clienteId) => ({ tipo: "MARCA", clienteId })), ...[...tableros].map((tableroId) => ({ tipo: "TABLERO", tableroId }))];
      const r = await api<{ datos: Pedido[] }>("/me/solicitudes-acceso", { metodo: "POST", cuerpo: { pedidos, rol, nota: nota.trim() || null } });
      avisar({ titulo: r.datos.length === 1 ? `Pediste ${r.datos[0].nombre}` : `Pediste ${r.datos.length} accesos`, texto: "Te avisamos cuando se apruebe." });
      alPedir();
    } catch (e) {
      avisar({ titulo: "No pudimos enviar el pedido", texto: errorDe(e) });
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Pedir acceso" ancho={560}>
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Pedir acceso</h2>
      <p className="texto-xs texto-muted">Marca todo lo que te falta, aunque solo vayas de apoyo. No aparecen las marcas ni los tableros que ya ves.</p>
      {cat.error && <ErrorCarga error={cat.error} reintentar={cat.recargar} />}
      {!cat.datos && !cat.error && <Cargando />}
      {cat.datos && (
        <>
          <div className="chips" role="tablist" aria-label="Qué pedir">
            <button type="button" role="tab" className="chip" aria-selected={pestana === "MARCA"} aria-pressed={pestana === "MARCA"} onClick={() => setPestana("MARCA")}>Marcas{marcas.size ? ` (${marcas.size})` : ""}</button>
            <button type="button" role="tab" className="chip" aria-selected={pestana === "TABLERO"} aria-pressed={pestana === "TABLERO"} onClick={() => setPestana("TABLERO")} disabled={mios.sinFichaInooWork} title={mios.sinFichaInooWork ? "Necesitas tu ficha de InooWork" : undefined}>Tableros{tableros.size ? ` (${tableros.size})` : ""}</button>
          </div>
          {pestana === "TABLERO" && !cat.datos.inooworkResponde && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>InooWork no respondió: prueba de nuevo en un rato.</p>}
          <label className="fila input" style={{ gap: 8 }}>
            <LuSearch size={15} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={pestana === "MARCA" ? "Buscar marca" : "Buscar tablero, cliente o líder"} aria-label="Buscar" style={{ border: 0, outline: 0, flex: 1, background: "transparent" }} />
          </label>
          <div role="group" aria-label={pestana === "MARCA" ? "Marcas" : "Tableros"} style={{ maxHeight: 300, overflowY: "auto", display: "grid", gap: 2, border: "1px solid var(--c-borde)", borderRadius: "var(--r-md)", padding: 6 }}>
            {lista.length === 0 && <p className="texto-sm texto-muted" style={{ padding: 8 }}>{q ? "Nada con ese nombre." : "No hay nada más para pedir aquí."}</p>}
            {lista.map((x) => {
              const t = pestana === "TABLERO" ? (x as Catalogo["tableros"][number]) : null;
              const marcado = (pestana === "MARCA" ? marcas : tableros).has(x.id);
              return (
                <label key={x.id} className="fila texto-sm boton-lista" style={{ gap: 10, cursor: "pointer", minHeight: 40 }}>
                  <input type="checkbox" checked={marcado} onChange={() => alternar(x.id)} />
                  <span>
                    <span className="negrita">{x.nombre}</span>
                    {t && (t.cliente || t.lider) && <span className="texto-xs texto-muted" style={{ display: "block" }}>{[t.cliente, t.lider && `líder: ${t.lider}`].filter(Boolean).join(" · ")}</span>}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="pila texto-xs" style={{ gap: 4, flex: "1 1 160px" }}>
              Tu papel
              <select className="input" value={rol} onChange={(e) => setRol(e.target.value as RolSolicitud)}>
                <option value="APOYO">Apoyo</option>
                <option value="RESPONSABLE">Responsable</option>
              </select>
            </label>
            <label className="pila texto-xs" style={{ gap: 4, flex: "2 1 240px" }}>
              Nota (opcional)
              <input className="input" value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: llevo el diseño de esta marca" />
            </label>
          </div>
          <button className="boton boton--primario boton--bloque" disabled={!elegidos || enviando} onClick={() => void enviar()}>
            {elegidos ? `Pedir ${elegidos} ${elegidos === 1 ? "acceso" : "accesos"}` : "Elige al menos uno"}
          </button>
        </>
      )}
    </Modal>
  );
}

// ───────────────────────────── bandeja de quien asigna

export function PantallaPedidosAcceso() {
  return (
    <Estructura espacio="equipo" migas="Pedidos de acceso">
      <PedidosAcceso />
    </Estructura>
  );
}

function PedidosAcceso() {
  const [todas, setTodas] = useState(false);
  const r = useConsulta<{ datos: Pedido[] }>(`/panel/solicitudes-acceso${todas ? "?estado=TODAS" : ""}`);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<Pedido | null>(null);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const pendientes = r.datos.datos.filter((p) => p.estado === "PENDIENTE");
  const aprobar = async (ps: Pedido[]) => {
    let bien = 0;
    const fallas: string[] = [];
    for (const p of ps) {
      setOcupado(p.id);
      try {
        await api(`/panel/solicitudes-acceso/${p.id}/aprobar`, { metodo: "POST" });
        bien++;
      } catch (e) {
        fallas.push(`${p.persona.nombre} · ${p.nombre}: ${errorDe(e) ?? "error"}`);
      }
    }
    setOcupado(null);
    avisar({ titulo: bien ? (bien === 1 ? "Aprobado: ya tiene el acceso" : `${bien} aprobados`) : "No se aprobó", texto: fallas.length ? fallas.join(" · ") : undefined });
    void r.recargar();
  };
  return (
    <>
      <Cabecera
        antetitulo="Agencia"
        titulo="Pedidos de acceso"
        bajada="Lo que la gente pide desde «Mis accesos». Al aprobar se aplica solo: la marca queda asignada o la persona entra al tablero como editora."
        accion={pendientes.length > 1 ? <button className="boton boton--primario" disabled={!!ocupado} onClick={() => void aprobar(pendientes)}><LuCheck size={16} /> Aprobar todos ({pendientes.length})</button> : undefined}
      />
      <div className="chips" role="radiogroup" aria-label="Qué pedidos ver" style={{ marginBottom: 12 }}>
        <button type="button" role="radio" className="chip" aria-checked={!todas} aria-pressed={!todas} onClick={() => setTodas(false)}>Pendientes</button>
        <button type="button" role="radio" className="chip" aria-checked={todas} aria-pressed={todas} onClick={() => setTodas(true)}>Todos</button>
      </div>
      {r.datos.datos.length === 0 ? (
        <div className="tarjeta vacio"><p className="negrita">No hay pedidos {todas ? "" : "pendientes"}.</p><p className="texto-sm texto-muted">La gente los hace desde «Mis accesos», en el menú de su foto.</p></div>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla tabla--tarjetas">
            <thead>
              <tr><th>Persona</th><th>Pide</th><th>Papel y nota</th><th>Fecha</th><th /></tr>
            </thead>
            <tbody>
              {r.datos.datos.map((p) => (
                <tr key={p.id} style={{ cursor: "default" }}>
                  <td>
                    <span className="negrita" style={{ display: "block" }}>{p.persona.nombre}</span>
                    <span className="texto-xs texto-muted">{p.persona.area ? NOMBRE_AREA[p.persona.area] : "Sin área"}</span>
                  </td>
                  <td className="texto-sm">
                    <span className="fila" style={{ gap: 6 }}>{p.tipo === "MARCA" ? <LuTag size={13} aria-label="Marca" /> : <LuSquareKanban size={13} aria-label="Tablero" />}<span className="negrita">{p.nombre}</span></span>
                  </td>
                  <td className="texto-sm">{NOMBRE_ROL_SOLICITUD[p.rol]}{p.nota && <span className="texto-xs texto-muted" style={{ display: "block" }}>{p.nota}</span>}</td>
                  <td className="texto-xs texto-muted">{fCorta(p.creadoEn)}</td>
                  <td>
                    {p.estado === "PENDIENTE" ? (
                      <span className="fila" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <button className="boton boton--chico boton--primario" disabled={!!ocupado} onClick={() => void aprobar([p])} aria-label={`Aprobar ${p.nombre} para ${p.persona.nombre}`}><LuCheck size={13} /> Aprobar</button>
                        <button className="boton boton--chico" disabled={!!ocupado} onClick={() => setRechazando(p)} aria-label={`Rechazar ${p.nombre} para ${p.persona.nombre}`}>Rechazar</button>
                      </span>
                    ) : (
                      <span className="fila" style={{ gap: 6, justifyContent: "flex-end" }} title={p.motivo ?? undefined}>
                        <Etiqueta tono={ESTADO[p.estado][1]}>{ESTADO[p.estado][0]}</Etiqueta>
                        {p.resueltaPor && <span className="texto-xs texto-muted">{p.resueltaPor}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <QueVeCadaUno />
      {rechazando && <Rechazar pedido={rechazando} alCerrar={() => setRechazando(null)} alListo={() => { setRechazando(null); void r.recargar(); }} />}
    </>
  );
}

function Rechazar({ pedido, alCerrar, alListo }: { pedido: Pedido; alCerrar: () => void; alListo: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAviso();
  const enviar = async () => {
    setEnviando(true);
    try {
      await api(`/panel/solicitudes-acceso/${pedido.id}/rechazar`, { metodo: "POST", cuerpo: { motivo: motivo.trim() || null } });
      avisar({ titulo: "Pedido rechazado", texto: `Le avisamos a ${pedido.persona.nombre}.` });
      alListo();
    } catch (e) {
      avisar({ titulo: "No pudimos rechazarlo", texto: errorDe(e) });
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Rechazar pedido" ancho={440}>
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Rechazar {pedido.nombre}</h2>
      <p className="texto-xs texto-muted">El pedido es de {pedido.persona.nombre}. El motivo le llega en el aviso.</p>
      <label className="pila texto-xs" style={{ gap: 4 }}>
        Motivo (opcional)
        <textarea className="input" rows={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: esa marca la lleva otra persona" />
      </label>
      <button className="boton boton--primario boton--bloque" disabled={enviando} onClick={() => void enviar()}>Rechazar</button>
    </Modal>
  );
}

/** Qué ve una persona y por qué. Se abre con ?persona=<id> (el botón «Accesos» de Equipo). */
function QueVeCadaUno() {
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>("/panel/equipo");
  const [quien, setQuien] = useState("");
  useEffect(() => setQuien(new URLSearchParams(window.location.search).get("persona") ?? ""), []);
  const d = useConsulta<Accesos>(quien ? `/panel/personas/${quien}/accesos` : null);
  const avisar = useAviso();
  const yo = usePortal().sesion?.usuario.id;
  const quitar = async (clienteId: string, nombre: string) => {
    if (!window.confirm(`¿Quitarle ${nombre}? Deja de ver esa marca, salvo que le llegue por un proyecto o un tablero.`)) return;
    try {
      await api(`/panel/personas/${quien}/marcas/${clienteId}`, { metodo: "DELETE" });
      avisar({ titulo: `Quitamos ${nombre}` });
      void d.recargar();
    } catch (e) {
      avisar({ titulo: "No pudimos quitarla", texto: errorDe(e) });
    }
  };
  return (
    <section style={{ marginTop: 24, display: "grid", gap: 12 }} aria-label="Qué ve cada persona">
      <h2 className="fila" style={{ fontSize: "var(--t-lg)", fontWeight: 600, gap: 8 }}><LuKeyRound size={17} /> Qué ve cada persona</h2>
      <label className="pila texto-xs" style={{ gap: 4, maxWidth: 360 }}>
        Persona
        <select className="input" value={quien} onChange={(e) => setQuien(e.target.value)}>
          <option value="">Elige a alguien del equipo</option>
          {(equipo.datos?.datos ?? []).filter((p) => p.id !== yo).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.area ? ` · ${NOMBRE_AREA[p.area]}` : ""}</option>)}
        </select>
      </label>
      {quien && d.error && <ErrorCarga error={d.error} reintentar={d.recargar} />}
      {quien && !d.datos && !d.error && <Cargando />}
      {quien && d.datos && (
        <>
          <p className="texto-sm">
            <span className="negrita">{d.datos.persona.nombre}</span> · {d.datos.persona.area ? NOMBRE_AREA[d.datos.persona.area] : "sin área"} · {NIVEL[d.datos.persona.nivel]}
            {d.datos.persona.nivel !== "ADMIN" && <span className="texto-xs texto-muted"> · El nivel y el área se cambian en <Enlace a="/equipo/personas" className="enlace">Equipo</Enlace>.</span>}
          </p>
          <VistaAccesos d={d.datos} alQuitar={(id, n) => void quitar(id, n)} />
        </>
      )}
    </section>
  );
}
