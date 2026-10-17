"use client";
/**
 * Agentes de IA (fase 16a, pedido del CEO el 17 oct; referencia: la sección de agentes de Cosmiq CRM).
 * Siempre visible para todos los clientes: crean sus propios agentes, los prueban en un chat y generan
 * contenido con Content AI. Es la IA que el cliente ELIGE usar, por eso aquí sí se nombra; el resto del
 * portal sigue sin rastro de IA. Crear no cuesta: se paga por uso (en soles, con tarifas de relleno).
 */
import { useEffect, useRef, useState } from "react";
import { LuBot, LuCopy, LuMessageSquare, LuPlus, LuSend, LuSparkles, LuTrash2, LuTriangleAlert } from "react-icons/lu";
import { api, clienteActivo, Enlace, fCorta, fDiaHora, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso, usePortal } from "../componentes";

type Agente = S<"AgenteIa">;
type Accion = S<"AccionAgente">;
type Tono = S<"TonoAgente">;

const PESTANAS = [
  { a: "/ia", texto: "Inicio" },
  { a: "/ia/agentes", texto: "Mis agentes" },
  { a: "/ia/conocimiento", texto: "Conocimiento" },
  { a: "/ia/plantillas", texto: "Plantillas" },
  { a: "/ia/contenido", texto: "Content AI" },
  { a: "/ia/conversaciones", texto: "Conversaciones" },
];
const ACCIONES: { codigo: Accion; nombre: string; descripcion: string }[] = [
  { codigo: "CREAR_LEAD", nombre: "Registrar interesados", descripcion: "Guarda nombre y contacto de quien quiere comprar o cotizar." },
  { codigo: "AGENDAR_CITA", nombre: "Agendar citas", descripcion: "Propone horarios y reserva una cita o reunión." },
  { codigo: "ENVIAR_CATALOGO", nombre: "Enviar catálogo y precios", descripcion: "Comparte el catálogo o la lista de precios." },
  { codigo: "DERIVAR_PERSONA", nombre: "Pasar con una persona", descripcion: "Deriva la conversación a alguien de tu equipo." },
];
const NOMBRE_ACCION = Object.fromEntries(ACCIONES.map((a) => [a.codigo, a.nombre])) as Record<Accion, string>;
const TONOS: [Tono, string][] = [["CERCANO", "Cercano"], ["FORMAL", "Formal"], ["ENTUSIASTA", "Entusiasta"]];
const DESTINOS: [S<"DestinoContenido">, string][] = [["REDES", "Redes sociales"], ["BLOG", "Blog"], ["EMAIL", "Email"], ["WEB", "Página web"], ["CONVERSACION", "Respuesta a clientes"]];
const NOMBRE_DESTINO = Object.fromEntries(DESTINOS) as Record<S<"DestinoContenido">, string>;
const ESTADO: Record<Agente["estado"], [string, "verde" | "gris" | "ambar"]> = { PUBLICADO: ["Publicado", "verde"], BORRADOR: ["Borrador", "gris"], PAUSADO: ["Pausado", "ambar"] };
const CANAL: Record<string, string> = { PRUEBA: "Chat de prueba", WHATSAPP: "WhatsApp", WEB: "Tu web" };

export const soles = (n: number) => `S/ ${n.toFixed(2).replace(".", ",")}`;
const errorDe = (e: unknown) => (e as ProblemaApi).errores?.[0]?.mensaje ?? (e as ProblemaApi).detalle ?? (e as ProblemaApi).titulo;
const usePuedeEditar = () => {
  const { sesion } = usePortal();
  return sesion?.usuario.tipo === "EQUIPO" || sesion?.clientes[0]?.rol !== "LECTOR";
};

export function PantallaIa() {
  return (
    <Estructura espacio="cliente" migas="Agentes de IA">
      <SeccionIa />
    </Estructura>
  );
}

function SeccionIa() {
  const { ruta, params } = useNavegacion();
  const actual = params.id ? "/ia/agentes" : PESTANAS.find((x) => x.a === ruta)?.a ?? "/ia";
  return (
    <>
      <Cabecera antetitulo="Inteligencia artificial" titulo="Agentes de IA" bajada="Crea asistentes que atienden a tus clientes y genera contenido. Crear no cuesta: pagas solo lo que usas." />
      <nav className="pestanas" role="tablist" aria-label="Secciones de agentes de IA" style={{ marginBottom: 20, maxWidth: "100%", overflowX: "auto" }}>
        {PESTANAS.map((x) => (
          <Enlace key={x.a} a={x.a} role="tab" aria-selected={x.a === actual} className="pestana" style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>
            {x.texto}
          </Enlace>
        ))}
      </nav>
      {params.id ? <EditorAgente id={params.id} /> : null}
      {!params.id && actual === "/ia" && <InicioIa />}
      {!params.id && actual === "/ia/agentes" && <MisAgentes />}
      {actual === "/ia/conocimiento" && <Conocimiento />}
      {actual === "/ia/plantillas" && <Plantillas />}
      {actual === "/ia/contenido" && <ContentAi />}
      {actual === "/ia/conversaciones" && <Conversaciones />}
    </>
  );
}

// ═════════════════════════════════════════════ Consumo

function MedidorConsumo({ c }: { c: S<"ConsumoIa"> }) {
  const nivel = c.pausado ? "excedido" : c.alerta ? "alerta" : "ok";
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span className="medidor-texto texto-sm">
        <span className="consumo-valor">{soles(c.total)}</span> <span className="texto-muted">de {soles(c.tope)} este mes</span>
      </span>
      <span className={`medidor medidor--${nivel}`} role="meter" aria-valuemin={0} aria-valuemax={c.tope} aria-valuenow={c.total} aria-label={`Consumo de IA: ${soles(c.total)} de ${soles(c.tope)}`}>
        <span style={{ width: `${Math.min(100, c.pct)}%` }} />
      </span>
      <span className="texto-xs texto-muted">
        Agentes {soles(c.agentes)} · Content AI {soles(c.contenido)}
        {c.tarifasDeRelleno && " · tarifas de prueba"}
      </span>
      {c.pausado && (
        <span className="texto-xs estado-consumo estado-consumo--excedido">
          <LuTriangleAlert size={12} /> Llegaste al tope del mes: la IA está en pausa. Pide a tu equipo Inoo que lo amplíe.
        </span>
      )}
      {!c.pausado && c.alerta && (
        <span className="texto-xs estado-consumo estado-consumo--alerta">
          <LuTriangleAlert size={12} /> Vas por el {c.pct} % de tu tope mensual.
        </span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════ Inicio

function InicioIa() {
  const { datos: r, error, recargar } = useConsulta<S<"ResumenIa">>(`/clientes/${clienteActivo()}/ia/resumen`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!r) return <Cargando />;
  const m = r.metricas;
  return (
    <div className="pila">
      {r.modoSimulado && (
        <Aviso icono={<LuSparkles size={18} />} titulo="Modo de prueba">
          Por ahora las respuestas se arman con tu base de conocimiento, sin conectarse al modelo de IA.
        </Aviso>
      )}
      <div className="grid-4 kpis">
        <div className="tarjeta kpi" style={{ gridColumn: "span 2" }}>
          <div className="kpi-cab">Consumo de {r.consumo.periodo === "2026-10" ? "octubre" : r.consumo.periodo}</div>
          <MedidorConsumo c={r.consumo} />
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Contactos atendidos</div>
          <div className="kpi-valor">{m.contactos}</div>
          <div className="kpi-pie">{m.conversaciones} {m.conversaciones === 1 ? "conversación" : "conversaciones"}</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Tiempo ahorrado</div>
          <div className="kpi-valor">{m.minutosAhorrados} min</div>
          <div className="kpi-pie">
            {m.acciones} acciones · {m.citas} citas
          </div>
        </div>
      </div>
      <CrearConIa />
      <p className="texto-sm texto-muted">
        Tienes {r.agentes.total} {r.agentes.total === 1 ? "agente" : "agentes"} ({r.agentes.publicados} publicados).{" "}
        <Enlace a="/ia/agentes" className="enlace">
          Ver mis agentes →
        </Enlace>
      </p>
    </div>
  );
}

/** «Describe tu negocio» → propuesta de agente (Claude Sonnet 5.5; gratis) → crear y abrir el editor. */
function CrearConIa() {
  const { ir } = useNavegacion();
  const avisar = useAviso();
  const puede = usePuedeEditar();
  const [descripcion, setDescripcion] = useState("");
  const [propuesta, setPropuesta] = useState<S<"AgenteIaEntrada"> | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proponer = async () => {
    setOcupado(true);
    setError(null);
    try {
      setPropuesta((await api<{ agente: S<"AgenteIaEntrada"> }>(`/clientes/${clienteActivo()}/ia/borrador-agente`, { metodo: "POST", cuerpo: { descripcion } })).agente);
    } catch (e) {
      setError(errorDe(e));
    } finally {
      setOcupado(false);
    }
  };
  const crear = async () => {
    try {
      const a = await api<Agente>(`/clientes/${clienteActivo()}/ia/agentes`, { metodo: "POST", cuerpo: propuesta, idempotente: true });
      avisar({ titulo: "Agente creado", texto: "Revísalo, pruébalo en el chat y publícalo." });
      ir(`/ia/agentes/${a.id}`);
    } catch (e) {
      avisar({ titulo: "No se pudo crear", texto: errorDe(e) });
    }
  };
  if (!puede) return null;
  return (
    <section className="tarjeta" style={{ padding: "22px 20px", display: "grid", gap: 12 }}>
      <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}>
        <LuSparkles size={18} color="var(--c-primario)" /> Crear un agente con IA
      </h2>
      <p className="texto-sm texto-muted">Describe tu negocio y qué quieres que haga tu agente. Te proponemos uno listo para probar.</p>
      <div className="entrada">
        <textarea aria-label="Describe tu negocio" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Somos una tienda de cosmética natural en Miraflores. Queremos responder dudas de envíos y recomendar productos." />
      </div>
      {error && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</span>}
      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        <button className="boton boton--primario" disabled={ocupado || descripcion.trim().length < 20} onClick={() => void proponer()}>
          <LuSparkles size={16} /> {ocupado ? "Pensando…" : "Proponer agente"}
        </button>
        <Enlace a="/ia/plantillas" className="boton">
          Usar una plantilla
        </Enlace>
      </div>
      {propuesta && (
        <div className="propuesta-agente">
          <span className="negrita">{propuesta.nombre}</span>
          <span className="texto-xs texto-muted">
            {propuesta.rol} · tono {TONOS.find(([t]) => t === propuesta.tono)?.[1].toLowerCase()}
          </span>
          <span className="texto-sm">«{propuesta.saludo}»</span>
          <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
            {(propuesta.acciones ?? []).map((a) => (
              <Etiqueta key={a} tono="azul">{NOMBRE_ACCION[a]}</Etiqueta>
            ))}
          </span>
          <button className="boton boton--primario boton--chico" style={{ justifySelf: "start" }} onClick={() => void crear()}>
            Crear este agente
          </button>
        </div>
      )}
    </section>
  );
}

// ═════════════════════════════════════════════ Mis agentes

function MisAgentes() {
  const { ir } = useNavegacion();
  const puede = usePuedeEditar();
  const { datos, error, recargar } = useConsulta<{ datos: Agente[] }>(`/clientes/${clienteActivo()}/ia/agentes`);
  const [nuevo, setNuevo] = useState(false);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!datos) return <Cargando />;
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 14 }}>
      <div className="fila entre">
        <h2 className="tarjeta-titulo">Mis agentes</h2>
        {puede && (
          <button className="boton boton--primario boton--chico" onClick={() => setNuevo(true)}>
            <LuPlus size={14} /> Nuevo agente
          </button>
        )}
      </div>
      {!datos.datos.length && <p className="texto-sm texto-muted">Todavía no tienes agentes. Crea uno con IA desde Inicio o parte de una plantilla.</p>}
      {datos.datos.length > 0 && (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Canales</th>
                <th>Conversaciones</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((a) => (
                <tr key={a.id} onClick={() => ir(`/ia/agentes/${a.id}`)}>
                  <td>
                    <Enlace a={`/ia/agentes/${a.id}`} className="negrita" style={{ color: "inherit", textDecoration: "none" }}>
                      {a.nombre}
                    </Enlace>
                    <span className="texto-xs texto-muted" style={{ display: "block" }}>{a.rol}</span>
                  </td>
                  <td>
                    <Etiqueta tono={ESTADO[a.estado][1]}>{ESTADO[a.estado][0]}</Etiqueta>
                    {a.cambiosSinPublicar && a.version > 0 && <span className="texto-xs texto-muted" style={{ display: "block" }}>Cambios sin publicar</span>}
                  </td>
                  <td className="texto-xs">{a.canales.map((c) => `${CANAL[c.canal]}${c.estado === "SOLICITADO" ? " (pedido)" : ""}`).join(", ")}</td>
                  <td>{a.conversaciones}</td>
                  <td className="texto-muted">{fCorta(a.actualizadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NuevoAgente abierto={nuevo} alCerrar={() => setNuevo(false)} />
    </section>
  );
}

function NuevoAgente({ abierto, alCerrar, plantilla }: { abierto: boolean; alCerrar: () => void; plantilla?: S<"PlantillaAgente"> }) {
  const { ir } = useNavegacion();
  const plantillas = useConsulta<{ datos: S<"PlantillaAgente">[] }>(abierto ? "/ia/plantillas" : null);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState(plantilla?.codigo ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setCodigo(plantilla?.codigo ?? "");
  }, [plantilla]);
  const crear = async () => {
    setError(null);
    try {
      const a = await api<Agente>(`/clientes/${clienteActivo()}/ia/agentes`, { metodo: "POST", cuerpo: { nombre, plantillaCodigo: codigo || null }, idempotente: true });
      alCerrar();
      ir(`/ia/agentes/${a.id}`);
    } catch (e) {
      setError(errorDe(e));
    }
  };
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Nuevo agente">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Nuevo agente</h2>
      <div className="campo">
        <label htmlFor="na-nombre">Nombre</label>
        <div className="entrada">
          <input id="na-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Asistente de ventas" />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="na-plantilla">Partir de</label>
        <select id="na-plantilla" className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)}>
          <option value="">Desde cero</option>
          {plantillas.datos?.datos.filter((p) => p.categoria === "AGENTE").map((p) => (
            <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
          ))}
        </select>
      </div>
      {error && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</span>}
      <button className="boton boton--primario boton--bloque" disabled={nombre.trim().length < 3} onClick={() => void crear()}>
        Crear y configurar
      </button>
    </Modal>
  );
}

// ═════════════════════════════════════════════ Editor del agente + chat de prueba

function EditorAgente({ id }: { id: string }) {
  const { ir } = useNavegacion();
  const avisar = useAviso();
  const puede = usePuedeEditar();
  const { sesion } = usePortal();
  const { datos: a, error, recargar, setDatos } = useConsulta<Agente>(`/ia/agentes/${id}`);
  const bases = useConsulta<{ datos: S<"BaseConocimiento">[] }>(`/clientes/${clienteActivo()}/ia/conocimiento`);
  const [f, setF] = useState<Agente | null>(null);
  useEffect(() => {
    if (a) setF(a);
  }, [a]);
  if (error) return <ErrorCarga error={error} reintentar={error.status === 404 ? undefined : recargar} />;
  if (!a || !f) return <Cargando />;
  const sucio = (["nombre", "rol", "tono", "saludo", "instrucciones", "derivarCuando"] as const).some((k) => (f[k] ?? "") !== (a[k] ?? "")) ||
    JSON.stringify(f.acciones) !== JSON.stringify(a.acciones) || JSON.stringify(f.conocimientoIds) !== JSON.stringify(a.conocimientoIds);
  const enviar = async (camino: string, metodo: string, cuerpo: unknown, aviso: string) => {
    try {
      const r = await api<Agente>(camino, { metodo, cuerpo });
      setDatos(r);
      avisar({ titulo: aviso });
    } catch (e) {
      avisar({ titulo: "No se pudo guardar", texto: errorDe(e) });
    }
  };
  const guardar = () =>
    enviar(`/ia/agentes/${id}`, "PATCH", { nombre: f.nombre, rol: f.rol, tono: f.tono, saludo: f.saludo, instrucciones: f.instrucciones, derivarCuando: f.derivarCuando || null, acciones: f.acciones, conocimientoIds: f.conocimientoIds }, "Borrador guardado");
  const publicar = async () => {
    if (sucio) await guardar();
    await enviar(`/ia/agentes/${id}/publicar`, "POST", {}, "Agente publicado");
  };
  const eliminar = async () => {
    try {
      await api(`/ia/agentes/${id}`, { metodo: "DELETE" });
      avisar({ titulo: "Agente eliminado" });
      ir("/ia/agentes");
    } catch (e) {
      avisar({ titulo: "No se pudo eliminar", texto: errorDe(e) });
    }
  };
  const alternar = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const esAdmin = sesion?.usuario.tipo === "EQUIPO" || sesion?.clientes[0]?.rol === "ADMIN_CLIENTE";
  return (
    <>
      <div className="fila entre" style={{ gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <span className="fila" style={{ gap: 10 }}>
          <LuBot size={22} color="var(--c-primario)" />
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>{a.nombre}</h2>
          <Etiqueta tono={ESTADO[a.estado][1]}>{ESTADO[a.estado][0]}</Etiqueta>
          {a.version > 0 && <span className="texto-xs texto-muted">Versión {a.version}</span>}
        </span>
        {puede && (
          <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="boton boton--chico" disabled={!sucio} onClick={() => void guardar()}>
              Guardar borrador
            </button>
            {a.estado !== "PAUSADO" && a.version > 0 && (
              <button className="boton boton--chico" onClick={() => void enviar(`/ia/agentes/${id}`, "PATCH", { estado: "PAUSADO" }, "Agente pausado")}>
                Pausar
              </button>
            )}
            {a.estado === "PAUSADO" && (
              <button className="boton boton--chico" onClick={() => void enviar(`/ia/agentes/${id}`, "PATCH", { estado: "PUBLICADO" }, "Agente reactivado")}>
                Reactivar
              </button>
            )}
            <button className="boton boton--primario boton--chico" disabled={!sucio && !a.cambiosSinPublicar} onClick={() => void publicar()}>
              {a.version ? "Publicar cambios" : "Publicar"}
            </button>
          </span>
        )}
      </div>
      <div className="editor-agente">
        <div className="pila">
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
            <h3 className="tarjeta-titulo">1 · Identidad</h3>
            <div className="grid-2" style={{ gap: 10 }}>
              <Campo id="ag-nombre" etiqueta="Nombre" valor={f.nombre} cambiar={(v) => setF({ ...f, nombre: v })} deshabilitado={!puede} />
              <Campo id="ag-rol" etiqueta="Rol" valor={f.rol} cambiar={(v) => setF({ ...f, rol: v })} deshabilitado={!puede} />
            </div>
            <div className="campo">
              <span className="rotulo" id="ag-tono">Tono</span>
              <div className="chips" role="radiogroup" aria-labelledby="ag-tono">
                {TONOS.map(([v, t]) => (
                  <button key={v} type="button" className="chip" aria-pressed={f.tono === v} disabled={!puede} onClick={() => setF({ ...f, tono: v })}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Campo id="ag-saludo" etiqueta="Saludo" valor={f.saludo} cambiar={(v) => setF({ ...f, saludo: v })} deshabilitado={!puede} />
          </section>
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
            <h3 className="tarjeta-titulo">2 · Instrucciones</h3>
            <div className="entrada">
              <textarea aria-label="Instrucciones del agente" rows={6} value={f.instrucciones} disabled={!puede} onChange={(e) => setF({ ...f, instrucciones: e.target.value })} placeholder="Qué responde, qué no debe inventar, cómo trata a tus clientes…" />
            </div>
          </section>
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
            <h3 className="tarjeta-titulo">3 · Conocimiento</h3>
            <p className="texto-xs texto-muted">El agente solo responde con lo que está en estas bases.</p>
            {bases.datos?.datos.map((b) => (
              <label key={b.id} className="fila texto-sm" style={{ gap: 8 }}>
                <input type="checkbox" disabled={!puede} checked={f.conocimientoIds.includes(b.id)} onChange={() => setF({ ...f, conocimientoIds: alternar(f.conocimientoIds, b.id) })} /> {b.nombre}
                <span className="texto-xs texto-muted">({b.articulos.length} artículos)</span>
              </label>
            ))}
            <Enlace a="/ia/conocimiento" className="enlace texto-xs">
              Administrar bases de conocimiento →
            </Enlace>
          </section>
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
            <h3 className="tarjeta-titulo">4 · Acciones</h3>
            {ACCIONES.map((x) => (
              <label key={x.codigo} className="fila texto-sm" style={{ gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" disabled={!puede} checked={f.acciones.includes(x.codigo)} onChange={() => setF({ ...f, acciones: alternar(f.acciones, x.codigo) })} />
                <span>
                  <span className="negrita">{x.nombre}</span>
                  <span className="texto-xs texto-muted" style={{ display: "block" }}>{x.descripcion}</span>
                </span>
              </label>
            ))}
          </section>
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
            <h3 className="tarjeta-titulo">5 · Cuándo pasar con una persona</h3>
            <div className="entrada">
              <textarea aria-label="Cuándo pasar con una persona" rows={2} disabled={!puede} value={f.derivarCuando ?? ""} onChange={(e) => setF({ ...f, derivarCuando: e.target.value })} placeholder="Ej.: si la persona está molesta o pide hablar con alguien." />
            </div>
          </section>
          <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
            <h3 className="tarjeta-titulo">6 · Canales</h3>
            {a.canales.map((c) => (
              <span key={c.canal} className="fila entre texto-sm">
                {CANAL[c.canal]}
                <Etiqueta tono={c.estado === "ACTIVO" ? "verde" : "ambar"}>{c.estado === "ACTIVO" ? "Activo" : "Pedido al equipo"}</Etiqueta>
              </span>
            ))}
            {puede && (
              <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
                {(["WHATSAPP", "WEB"] as const).filter((c) => !a.canales.some((x) => x.canal === c)).map((c) => (
                  <button key={c} className="boton boton--chico" disabled={a.version === 0} onClick={() => void enviar(`/ia/agentes/${id}/conectar-canal`, "POST", { canal: c }, "Pedido enviado a tu equipo Inoo")}>
                    {c === "WHATSAPP" ? "Conectar a WhatsApp" : "Conectar a tu web"}
                  </button>
                ))}
              </span>
            )}
            <p className="texto-xs texto-muted">
              {a.version === 0 ? "Publica el agente para poder conectarlo. " : ""}Por ahora funciona en el chat de prueba. Para WhatsApp o tu web, tu equipo Inoo lo conecta y te escribe.
            </p>
          </section>
          {esAdmin && (
            <button className="enlace texto-xs" style={{ justifySelf: "start", color: "var(--c-alerta)" }} onClick={() => void eliminar()}>
              <LuTrash2 size={12} /> Eliminar agente
            </button>
          )}
        </div>
        <ChatPrueba agente={a} sucio={sucio} />
      </div>
    </>
  );
}

function Campo({ id, etiqueta, valor, cambiar, deshabilitado }: { id: string; etiqueta: string; valor: string; cambiar: (v: string) => void; deshabilitado?: boolean }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="entrada">
        <input id={id} value={valor} disabled={deshabilitado} onChange={(e) => cambiar(e.target.value)} />
      </div>
    </div>
  );
}

type MensajeChat = S<"MensajeIa">;

function ChatPrueba({ agente: a, sucio }: { agente: Agente; sucio: boolean }) {
  const avisar = useAviso();
  const puede = usePuedeEditar();
  const [conversacion, setConversacion] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [consumo, setConsumo] = useState<S<"ConsumoIa"> | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fin.current?.scrollIntoView?.({ block: "nearest" });
  }, [mensajes]);
  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    setTexto("");
    setMensajes((m) => [...m, { rol: "CONTACTO", texto: t, creadoEn: new Date().toISOString() }]);
    setOcupado(true);
    try {
      const r = await api<S<"RespuestaPrueba">>(`/ia/agentes/${a.id}/probar`, { metodo: "POST", cuerpo: { mensaje: t, conversacionId: conversacion } });
      setConversacion(r.conversacionId);
      setMensajes((m) => [...m, r.respuesta]);
      setConsumo(r.consumo);
    } catch (e) {
      avisar({ titulo: "El agente no pudo responder", texto: errorDe(e) });
    } finally {
      setOcupado(false);
    }
  };
  return (
    <aside className="tarjeta chat-prueba" aria-label="Chat de prueba">
      <div className="fila entre">
        <h3 className="tarjeta-titulo fila" style={{ gap: 8 }}>
          <LuMessageSquare size={16} /> Probar el agente
        </h3>
        <button className="enlace texto-xs" onClick={() => { setConversacion(null); setMensajes([]); }}>
          Nueva conversación
        </button>
      </div>
      {sucio && <p className="texto-xs texto-muted">Guarda el borrador para probar tus últimos cambios.</p>}
      <div className="chat-mensajes" role="log" aria-live="polite">
        {a.saludo && <div className="burbuja burbuja--agente">{a.saludo}</div>}
        {mensajes.map((m, i) => (
          <div key={i} className={`burbuja burbuja--${m.rol === "AGENTE" ? "agente" : "contacto"}`}>
            {m.texto}
            {(m.accion || m.sinRespuesta) && (
              <span className="fila" style={{ gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {m.accion && <Etiqueta tono="azul">Acción: {NOMBRE_ACCION[m.accion]}</Etiqueta>}
                {m.sinRespuesta && <Etiqueta tono="ambar">Sin respuesta en tu conocimiento</Etiqueta>}
              </span>
            )}
          </div>
        ))}
        {ocupado && <div className="burbuja burbuja--agente texto-muted">Escribiendo…</div>}
        <div ref={fin} />
      </div>
      {puede ? (
        <form className="fila" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <div className="entrada" style={{ flex: 1 }}>
            <input aria-label="Mensaje de prueba" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe como si fueras un cliente…" disabled={a.estado === "PAUSADO"} />
          </div>
          <button className="boton boton--primario boton--chico" aria-label="Enviar" disabled={ocupado || !texto.trim() || a.estado === "PAUSADO"}>
            <LuSend size={14} />
          </button>
        </form>
      ) : (
        <p className="texto-xs texto-muted">Tu usuario es de solo lectura.</p>
      )}
      <p className="texto-xs texto-muted">
        Cada respuesta cuesta {soles(a.razonamientoAvanzado ? 0.2 : 0.05)} (tarifa de prueba){consumo ? ` · llevas ${soles(consumo.total)} este mes` : ""}.
      </p>
    </aside>
  );
}

// ═════════════════════════════════════════════ Conocimiento

function Conocimiento() {
  const avisar = useAviso();
  const puede = usePuedeEditar();
  const bases = useConsulta<{ datos: S<"BaseConocimiento">[] }>(`/clientes/${clienteActivo()}/ia/conocimiento`);
  const preguntas = useConsulta<{ datos: S<"PreguntaSinRespuesta">[] }>(`/clientes/${clienteActivo()}/ia/sin-respuesta`);
  const [editando, setEditando] = useState<S<"BaseConocimiento"> | "nueva" | null>(null);
  const [borrador, setBorrador] = useState<{ titulo: string; contenido: string } | null>(null);
  const recargar = () => {
    void bases.recargar();
    void preguntas.recargar();
  };
  const resolver = async (p: S<"PreguntaSinRespuesta">) => {
    try {
      await api(`/ia/sin-respuesta/${p.id}`, { metodo: "PATCH", cuerpo: { resuelta: true } });
      recargar();
    } catch (e) {
      avisar({ titulo: "No se pudo actualizar", texto: errorDe(e) });
    }
  };
  if (bases.error) return <ErrorCarga error={bases.error} reintentar={bases.recargar} />;
  if (!bases.datos) return <Cargando />;
  const pendientes = preguntas.datos?.datos.filter((p) => !p.resuelta) ?? [];
  return (
    <div className="con-lateral">
      <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
        <div className="fila entre">
          <h2 className="tarjeta-titulo">Bases de conocimiento</h2>
          {puede && (
            <button className="boton boton--primario boton--chico" onClick={() => setEditando("nueva")}>
              <LuPlus size={14} /> Nueva base
            </button>
          )}
        </div>
        {!bases.datos.datos.length && <p className="texto-sm texto-muted">Agrega lo que tus agentes deben saber: horarios, envíos, precios, políticas.</p>}
        {bases.datos.datos.map((b) => (
          <div key={b.id} className="fila-suave" style={{ padding: "12px 14px" }}>
            <span style={{ display: "grid", gap: 2 }}>
              <span className="negrita">{b.nombre}</span>
              <span className="texto-xs texto-muted">
                {b.articulos.length} artículos · actualizada el {fCorta(b.actualizadoEn)}
                {b.preguntasSinRespuesta > 0 ? ` · ${b.preguntasSinRespuesta} preguntas sin respuesta` : ""}
              </span>
            </span>
            {puede && (
              <button className="boton boton--chico" onClick={() => setEditando(b)}>
                Editar
              </button>
            )}
          </div>
        ))}
      </section>
      <aside className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
        <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Preguntas sin respuesta</h3>
        <p className="texto-xs texto-muted">Lo que tus agentes no supieron responder. Agrégalo a una base para que la próxima vez sí sepan.</p>
        {!pendientes.length && <p className="texto-xs texto-muted">Nada pendiente.</p>}
        {pendientes.map((p) => (
          <div key={p.id} style={{ display: "grid", gap: 4 }}>
            <span className="texto-sm negrita">{p.pregunta}</span>
            <span className="texto-xs texto-muted">
              {p.agenteNombre} · {fCorta(p.creadoEn)}
            </span>
            {puede && (
              <span className="fila" style={{ gap: 10 }}>
                <button className="enlace texto-xs" onClick={() => { setBorrador({ titulo: p.pregunta, contenido: "" }); setEditando(bases.datos!.datos[0] ?? "nueva"); }}>
                  Responder en una base
                </button>
                <button className="enlace texto-xs" style={{ color: "var(--c-muted)" }} onClick={() => void resolver(p)}>
                  Marcar resuelta
                </button>
              </span>
            )}
          </div>
        ))}
      </aside>
      {editando && (
        <EditarBase
          base={editando === "nueva" ? null : editando}
          articuloInicial={borrador}
          alCerrar={() => { setEditando(null); setBorrador(null); }}
          alGuardar={() => { setEditando(null); setBorrador(null); recargar(); }}
        />
      )}
    </div>
  );
}

function EditarBase({ base, articuloInicial, alCerrar, alGuardar }: { base: S<"BaseConocimiento"> | null; articuloInicial: { titulo: string; contenido: string } | null; alCerrar: () => void; alGuardar: () => void }) {
  const avisar = useAviso();
  const [nombre, setNombre] = useState(base?.nombre ?? "");
  const [articulos, setArticulos] = useState<{ id?: string; titulo: string; contenido: string }[]>([...(base?.articulos ?? []), ...(articuloInicial ? [articuloInicial] : [])]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const cambiar = (i: number, x: Partial<{ titulo: string; contenido: string }>) => setArticulos(articulos.map((a, j) => (j === i ? { ...a, ...x } : a)));
  const guardar = async () => {
    setErrores({});
    try {
      if (base) await api(`/ia/conocimiento/${base.id}`, { metodo: "PATCH", cuerpo: { nombre, articulos } });
      else await api(`/clientes/${clienteActivo()}/ia/conocimiento`, { metodo: "POST", cuerpo: { nombre, articulos }, idempotente: true });
      avisar({ titulo: "Base guardada" });
      alGuardar();
    } catch (e) {
      setErrores(Object.fromEntries(((e as ProblemaApi).errores ?? []).map((x) => [x.campo, x.mensaje])));
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Base de conocimiento" ancho={720}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{base ? "Editar base de conocimiento" : "Nueva base de conocimiento"}</h2>
      <div className="campo">
        <label htmlFor="bc-nombre">Nombre</label>
        <div className="entrada">
          <input id="bc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Preguntas frecuentes" />
        </div>
        {errores.nombre && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{errores.nombre}</span>}
      </div>
      <div style={{ display: "grid", gap: 12, maxHeight: "50vh", overflowY: "auto" }}>
        {articulos.map((a, i) => (
          <div key={i} className="fila-suave" style={{ display: "grid", gap: 6, padding: 12 }}>
            <div className="fila" style={{ gap: 6 }}>
              <div className="entrada" style={{ flex: 1 }}>
                <input aria-label={`Título del artículo ${i + 1}`} value={a.titulo} onChange={(e) => cambiar(i, { titulo: e.target.value })} placeholder="Título" />
              </div>
              <button className="boton boton--chico" aria-label={`Quitar artículo ${i + 1}`} onClick={() => setArticulos(articulos.filter((_, j) => j !== i))}>
                <LuTrash2 size={13} />
              </button>
            </div>
            <div className="entrada">
              <textarea aria-label={`Contenido del artículo ${i + 1}`} rows={3} value={a.contenido} onChange={(e) => cambiar(i, { contenido: e.target.value })} placeholder="La respuesta, con los datos concretos" />
            </div>
            {(errores[`articulos.${i}.titulo`] || errores[`articulos.${i}.contenido`]) && (
              <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{errores[`articulos.${i}.titulo`] ?? errores[`articulos.${i}.contenido`]}</span>
            )}
          </div>
        ))}
      </div>
      <button className="enlace texto-sm" style={{ justifySelf: "start" }} onClick={() => setArticulos([...articulos, { titulo: "", contenido: "" }])}>
        + Agregar artículo
      </button>
      <button className="boton boton--primario boton--bloque" onClick={() => void guardar()}>
        Guardar
      </button>
    </Modal>
  );
}

// ═════════════════════════════════════════════ Plantillas

function Plantillas() {
  const { ir } = useNavegacion();
  const puede = usePuedeEditar();
  const { datos, error, recargar } = useConsulta<{ datos: S<"PlantillaAgente">[] }>("/ia/plantillas");
  const [elegida, setElegida] = useState<S<"PlantillaAgente"> | null>(null);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!datos) return <Cargando />;
  const grupo = (cat: "AGENTE" | "CONTENIDO", titulo: string) => (
    <section className="seccion">
      <h2 className="seccion-titulo" style={{ marginBottom: 12 }}>{titulo}</h2>
      <div className="grid-3">
        {datos.datos.filter((p) => p.categoria === cat).map((p) => (
          <div key={p.codigo} className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 8, alignContent: "start" }}>
            <span className="icono-entregable">{cat === "AGENTE" ? <LuBot size={18} /> : <LuSparkles size={18} />}</span>
            <span className="negrita">{p.nombre}</span>
            <span className="texto-sm texto-muted">{p.descripcion}</span>
            {puede && (
              <button className="boton boton--chico" style={{ justifySelf: "start" }} onClick={() => (cat === "AGENTE" ? setElegida(p) : ir(`/ia/contenido?plantilla=${p.codigo}`))}>
                Usar plantilla
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
  return (
    <>
      {grupo("AGENTE", "Agentes")}
      {grupo("CONTENIDO", "Contenido")}
      <NuevoAgente abierto={!!elegida} alCerrar={() => setElegida(null)} plantilla={elegida ?? undefined} />
    </>
  );
}

// ═════════════════════════════════════════════ Content AI

function ContentAi() {
  const avisar = useAviso();
  const puede = usePuedeEditar();
  const [filtro, setFiltro] = useState<S<"DestinoContenido"> | "">("");
  const lista = useConsulta<{ datos: S<"ContenidoIa">[]; resumen: { palabras: number; costo: number; palabrasPorDia: number } }>(`/clientes/${clienteActivo()}/ia/contenido${filtro ? `?destino=${filtro}` : ""}`);
  const plantilla = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("plantilla") : null;
  const [destino, setDestino] = useState<S<"DestinoContenido">>(plantilla === "EMAIL_PROMOCION" ? "EMAIL" : "REDES");
  const [tono, setTono] = useState<Tono>("CERCANO");
  const [indicacion, setIndicacion] = useState("");
  const [variaciones, setVariaciones] = useState(1);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generar = async () => {
    setOcupado(true);
    setError(null);
    try {
      await api(`/clientes/${clienteActivo()}/ia/contenido`, { metodo: "POST", cuerpo: { destino, tono, indicacion, variaciones }, idempotente: true });
      setIndicacion("");
      void lista.recargar();
    } catch (e) {
      setError(errorDe(e));
    } finally {
      setOcupado(false);
    }
  };
  const copiar = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      avisar({ titulo: "Copiado" });
    } catch {
      avisar({ titulo: "No se pudo copiar" });
    }
  };
  const r = lista.datos?.resumen;
  return (
    <div className="pila">
      <div className="grid-3 kpis">
        <div className="tarjeta kpi">
          <div className="kpi-cab">Palabras generadas</div>
          <div className="kpi-valor">{r?.palabras ?? "—"}</div>
          <div className="kpi-pie">Este mes</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Costo</div>
          <div className="kpi-valor">{r ? soles(r.costo) : "—"}</div>
          <div className="kpi-pie">Tarifa de prueba</div>
        </div>
        <div className="tarjeta kpi">
          <div className="kpi-cab">Palabras por día</div>
          <div className="kpi-valor">{r?.palabrasPorDia ?? "—"}</div>
          <div className="kpi-pie">Promedio del mes</div>
        </div>
      </div>
      {puede && (
        <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
          <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}>
            <LuSparkles size={18} color="var(--c-primario)" /> Generar contenido
          </h2>
          <div className="chips" role="radiogroup" aria-label="Para dónde es">
            {DESTINOS.map(([v, t]) => (
              <button key={v} type="button" className="chip" aria-pressed={destino === v} onClick={() => setDestino(v)}>
                {t}
              </button>
            ))}
          </div>
          <div className="entrada">
            <textarea aria-label="¿Qué quieres escribir?" rows={3} value={indicacion} onChange={(e) => setIndicacion(e.target.value)} placeholder="Ej.: Lanzamiento de la crema de noche con ácido hialurónico, 10 % de descuento esta semana." />
          </div>
          <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
            <select className="input" aria-label="Tono" value={tono} onChange={(e) => setTono(e.target.value as Tono)} style={{ width: 150 }}>
              {TONOS.map(([v, t]) => (
                <option key={v} value={v}>Tono {t.toLowerCase()}</option>
              ))}
            </select>
            <select className="input" aria-label="Variaciones" value={variaciones} onChange={(e) => setVariaciones(Number(e.target.value))} style={{ width: 150 }}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{n} {n === 1 ? "variación" : "variaciones"}</option>
              ))}
            </select>
            <button className="boton boton--primario" disabled={ocupado || indicacion.trim().length < 10} onClick={() => void generar()}>
              {ocupado ? "Generando…" : `Generar (${soles(variaciones * 0.03)})`}
            </button>
          </div>
          {error && <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>{error}</span>}
        </section>
      )}
      <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
        <div className="chips" role="group" aria-label="Filtrar por destino">
          <button type="button" className="chip" aria-pressed={!filtro} onClick={() => setFiltro("")}>
            Todo
          </button>
          {DESTINOS.map(([v, t]) => (
            <button key={v} type="button" className="chip" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>
              {t}
            </button>
          ))}
        </div>
        {!lista.datos ? (
          <Cargando />
        ) : !lista.datos.datos.length ? (
          <p className="texto-sm texto-muted">Todavía no generaste contenido aquí.</p>
        ) : (
          lista.datos.datos.map((c) => (
            <article key={c.id} className="fila-suave contenido-ia" style={{ display: "grid", gap: 8, padding: "12px 14px" }}>
              <span className="fila entre texto-xs texto-muted" style={{ gap: 8 }}>
                <span>
                  {NOMBRE_DESTINO[c.destino]} · {fDiaHora(c.creadoEn)}
                  {c.creadoPor ? ` · ${c.creadoPor.nombre}` : ""}
                </span>
                <span>
                  {c.palabras} palabras · {soles(c.costo)}
                </span>
              </span>
              <span className="texto-xs negrita">{c.indicacion}</span>
              {c.variaciones.map((v, i) => (
                <div key={i} className="variacion">
                  <p className="texto-sm" style={{ whiteSpace: "pre-wrap" }}>{v}</p>
                  <button className="boton boton--chico" aria-label={`Copiar variación ${i + 1}`} onClick={() => void copiar(v)}>
                    <LuCopy size={13} />
                  </button>
                </div>
              ))}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

// ═════════════════════════════════════════════ Conversaciones

function Conversaciones() {
  const { datos, error, recargar } = useConsulta<{ datos: S<"ConversacionIa">[] }>(`/clientes/${clienteActivo()}/ia/conversaciones`);
  const [abierta, setAbierta] = useState<string | null>(null);
  const detalle = useConsulta<S<"ConversacionIaDetalle">>(abierta ? `/ia/conversaciones/${abierta}` : null);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!datos) return <Cargando />;
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
      <h2 className="tarjeta-titulo">Conversaciones de tus agentes</h2>
      {!datos.datos.length ? (
        <p className="texto-sm texto-muted">Aún no hay conversaciones. Prueba un agente desde su página.</p>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Agente</th>
                <th>Contacto</th>
                <th>Canal</th>
                <th>Mensajes</th>
                <th>Acciones</th>
                <th>Última</th>
                <th>Costo</th>
              </tr>
            </thead>
            <tbody>
              {datos.datos.map((c) => (
                <tr key={c.id} onClick={() => setAbierta(c.id)}>
                  <td className="negrita">{c.agenteNombre}</td>
                  <td>{c.contacto}</td>
                  <td>{CANAL[c.canal]}</td>
                  <td>{c.mensajes}</td>
                  <td>{c.acciones}</td>
                  <td className="texto-muted">{fDiaHora(c.ultimaEn)}</td>
                  <td>{soles(c.costo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal abierto={!!abierta} alCerrar={() => setAbierta(null)} etiqueta="Conversación" ancho={560}>
        {!detalle.datos ? (
          <Cargando />
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>{detalle.datos.agenteNombre}</h2>
            <span className="texto-xs texto-muted">
              {detalle.datos.contacto} · {CANAL[detalle.datos.canal]} · {fDiaHora(detalle.datos.iniciadaEn)}
            </span>
            <div className="chat-mensajes" style={{ maxHeight: "55vh" }}>
              {detalle.datos.historial.map((m, i) => (
                <div key={i} className={`burbuja burbuja--${m.rol === "AGENTE" ? "agente" : "contacto"}`}>
                  {m.texto}
                  {m.accion && <Etiqueta tono="azul">Acción: {NOMBRE_ACCION[m.accion]}</Etiqueta>}
                  {m.sinRespuesta && <Etiqueta tono="ambar">Sin respuesta en tu conocimiento</Etiqueta>}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

// ═════════════════════════════════════════════ Equipo: la IA del cliente en su ficha

/** En la ficha del cliente: su consumo, sus agentes y los canales que pidió. Solo el equipo activa el razonamiento avanzado (Claude, más caro). */
export function IaDelCliente({ clienteId }: { clienteId: string }) {
  const avisar = useAviso();
  const resumen = useConsulta<S<"ResumenIa">>(`/clientes/${clienteId}/ia/resumen`);
  const agentes = useConsulta<{ datos: Agente[] }>(`/clientes/${clienteId}/ia/agentes`);
  const avanzado = async (a: Agente) => {
    try {
      await api(`/ia/agentes/${a.id}`, { metodo: "PATCH", cuerpo: { razonamientoAvanzado: !a.razonamientoAvanzado } });
      void agentes.recargar();
    } catch (e) {
      avisar({ titulo: "No se pudo cambiar", texto: errorDe(e) });
    }
  };
  if (!resumen.datos || !agentes.datos) return null;
  const pedidos = agentes.datos.datos.flatMap((a) => a.canales.filter((c) => c.estado === "SOLICITADO").map((c) => `${a.nombre} → ${CANAL[c.canal]}`));
  return (
    <div className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 12 }}>
      <h3 className="tarjeta-titulo fila" style={{ gap: 8 }}>
        <LuBot size={16} /> Agentes de IA del cliente
      </h3>
      <MedidorConsumo c={resumen.datos.consumo} />
      {!agentes.datos.datos.length && <p className="texto-xs texto-muted">Todavía no creó agentes.</p>}
      {agentes.datos.datos.map((a) => (
        <div key={a.id} className="fila entre texto-sm" style={{ gap: 8 }}>
          <span>
            <span className="negrita">{a.nombre}</span>
            <span className="texto-xs texto-muted" style={{ display: "block" }}>
              {ESTADO[a.estado][0]} · {a.conversaciones} {a.conversaciones === 1 ? "conversación" : "conversaciones"}
            </span>
          </span>
          <label className="fila texto-xs" style={{ gap: 6 }}>
            <input type="checkbox" checked={a.razonamientoAvanzado} onChange={() => void avanzado(a)} /> Razonamiento avanzado
          </label>
        </div>
      ))}
      {pedidos.length > 0 && (
        <Aviso tono="alerta" icono={<LuTriangleAlert size={16} />} titulo="Canales por conectar">
          {pedidos.join(" · ")}. Coordina la conexión con el cliente (hay un ticket abierto).
        </Aviso>
      )}
      <p className="texto-xs texto-muted">El razonamiento avanzado usa Claude: responde mejor, pero cada mensaje cuesta más.</p>
    </div>
  );
}
