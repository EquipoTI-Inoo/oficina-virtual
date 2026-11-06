"use client";
/**
 * Pipeline de proyectos (reunión 15 oct): cada tarjeta es un proyecto (servicio contratado), no una
 * tarea ni un requerimiento. Las columnas muestran en qué situación está cada uno; al entrar se ven
 * sus etapas y sus tareas. Monday sirve solo de referencia visual: el tablero vive aquí.
 * Desde el 6 nov también trae los tableros de InooWork, con el nombre de su cliente: InooWork sigue siendo su fuente.
 */
import { useState, type FormEvent } from "react";
import { LuClipboardList, LuListTodo, LuPlus, LuSearch, LuSquareKanban } from "react-icons/lu";
import { api, Enlace, ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { COLORES_GRUPO, columnaDeTablero } from "../dominio/tableros";
import { Barra, Cabecera, Cargando, ErrorCarga, Estructura, ICONO_SERVICIO, Modal, useAviso, usePortal } from "../componentes";

type Pipeline = { columnas: { clave: S<"ColumnaProyecto">; titulo: string }[]; datos: S<"ProyectoPipeline">[] };

const AYUDA_COLUMNA: Record<S<"ColumnaProyecto">, string> = {
  POR_INICIAR: "Todavía no arranca ninguna etapa.",
  EN_CURSO: "Avanza según lo previsto.",
  ESPERA_CLIENTE: "El cliente nos debe algo para seguir.",
  CON_RETRASO: "La etapa actual pasó su fecha.",
  POR_CERRAR: "Entrega, capacitación y cierre.",
  CULMINADO: "Terminado: a las 2 semanas se archiva solo.",
  SOPORTE_CONTINUO: "Entregado; seguimos con soporte y mejoras.",
  EN_PAUSA: "Pausado: no corre el cronograma.",
};

export function PantallaPipeline() {
  return (
    <Estructura espacio="equipo" migas="Proyectos">
      <PipelineProyectos />
    </Estructura>
  );
}

const iniciales = (nombre: string) => nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

function PipelineProyectos() {
  const { sesion } = usePortal();
  const [mios, setMios] = useState(false);
  const [texto, setTexto] = useState("");
  const params = new URLSearchParams();
  if (mios && sesion) params.set("responsableId", sesion.usuario.id);
  if (texto.trim()) params.set("q", texto.trim());
  const { datos: d, error, recargar } = useConsulta<Pipeline>(`/panel/proyectos${params.toString() ? `?${params}` : ""}`);
  // Si InooWork no responde, los proyectos de clientes se siguen viendo y solo faltan los tableros.
  const r = useConsulta<{ datos: S<"TableroResumen">[]; equipo: { id: string; nombre: string; area: string | null }[] }>("/tableros");
  const [creando, setCreando] = useState(false);
  const clientes = [...new Set((r.datos?.datos ?? []).map((t) => t.cliente).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es"));
  const q = texto.trim().toLowerCase();
  const yoId = sesion?.usuario.id;
  // ¿Hay algo en «Todos» que no sea suyo? Con los datos sin filtro por persona.
  const veMas = !mios && (!!(r.datos?.datos ?? []).some((t) => !t.esMio) || !!(d?.datos ?? []).some((p) => p.responsable?.id !== yoId));
  const tableros = (r.datos?.datos ?? []).filter((t) => (!mios || t.esMio) && (!q || `${t.cliente ?? ""} ${t.nombre} ${t.area ?? ""} ${t.lider?.nombre ?? ""}`.toLowerCase().includes(q)));
  return (
    <>
      <Cabecera titulo="Proyectos" bajada="Cada tarjeta es un proyecto. Los que tienen el ícono de tablero vienen de InooWork, y lo que cambies en ellos también se ve allá." />
      <div className="fila" style={{ gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {/* Solo si ves más proyectos de los que llevas (ADMIN, leads, por cuenta): si no, los dos dan lo mismo (6 nov). */}
        {(veMas || mios) && <div className="chips" role="group" aria-label="Qué proyectos ver">
          <button type="button" className="chip" aria-pressed={!mios} onClick={() => setMios(false)}>
            Todos
          </button>
          <button type="button" className="chip" aria-pressed={mios} onClick={() => setMios(true)}>
            Mis proyectos
          </button>
        </div>}
        <div className="entrada" style={{ flex: "1 1 220px", maxWidth: 320 }}>
          <input id="buscar-proyecto" aria-label="Buscar proyecto" placeholder="Buscar cliente o servicio" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <span className="icono-campo" aria-hidden>
            <LuSearch size={16} />
          </span>
        </div>
        {r.datos && (
          <button type="button" className="boton boton--primario" style={{ marginLeft: "auto" }} onClick={() => setCreando(true)}>
            <LuPlus size={16} /> Nuevo proyecto
          </button>
        )}
      </div>
      {creando && r.datos && <NuevoTablero equipo={r.datos.equipo} clientes={clientes} alCerrar={() => setCreando(false)} />}
      {r.error && <p className="texto-xs texto-muted" style={{ marginBottom: 12 }}>InooWork no respondió: por ahora no se ven sus tableros.</p>}
      {error ? (
        <ErrorCarga error={error} reintentar={recargar} />
      ) : !d ? (
        <Cargando />
      ) : (
        <div className="pipeline" role="list" aria-label="Pipeline de proyectos">
          {d.columnas.map((c) => {
            const xs = d.datos.filter((p) => p.columna === c.clave);
            const ts = tableros.filter((t) => columnaDeTablero(t.estado, t.items) === c.clave);
            return (
              <section key={c.clave} className="pipeline-columna" data-columna={c.clave} role="listitem" aria-label={`${c.titulo}: ${xs.length + ts.length}`}>
                <header className="pipeline-cab">
                  <span className="negrita">{c.titulo}</span>
                  <span className="pipeline-contador">{xs.length + ts.length}</span>
                </header>
                <p className="texto-xs texto-muted" style={{ margin: "0 2px 10px" }}>{AYUDA_COLUMNA[c.clave]}</p>
                <div style={{ display: "grid", gap: 10 }}>
                  {xs.map((p) => (
                    <TarjetaProyecto key={p.servicioContratadoId} p={p} />
                  ))}
                  {ts.map((t) => (
                    <TarjetaTablero key={t.id} t={t} />
                  ))}
                  {!xs.length && !ts.length && <p className="texto-xs texto-muted pipeline-vacio">Sin proyectos</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Crea el proyecto en InooWork con su plantilla y abre el tablero (6 nov). */
function NuevoTablero({ equipo, clientes, alCerrar }: { equipo: { id: string; nombre: string; area: string | null }[]; clientes: string[]; alCerrar: () => void }) {
  const { ir } = useNavegacion();
  const avisar = useAviso();
  const yo = usePortal().sesion?.usuario.id;
  const [nombre, setNombre] = useState("");
  const [cliente, setCliente] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState<string>(COLORES_GRUPO[0]);
  const [miembros, setMiembros] = useState<string[]>([]);
  const [err, setErr] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const companeros = equipo.filter((p) => p.id !== yo);
  const crear = async (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    setEnviando(true);
    try {
      const t = await api<S<"TableroInooWork">>("/tableros", { metodo: "POST", cuerpo: { nombre, cliente, ...(descripcion.trim() ? { descripcion } : {}), color, miembros } });
      avisar({ titulo: "Proyecto creado", texto: "Ya está también en InooWork." });
      ir(`/equipo/proyectos/tableros/${t.id}`);
    } catch (x) {
      if (x instanceof ProblemaApi && x.errores.length) setErr(Object.fromEntries(x.errores.map((y) => [y.campo, y.mensaje])));
      else avisar({ titulo: "No pudimos crear el proyecto", texto: x instanceof ProblemaApi ? x.detalle ?? x.titulo : undefined });
    } finally {
      setEnviando(false);
    }
  };
  const error = (c: string) => err[c] && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err[c]}</p>;
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Nuevo proyecto" ancho={520}>
      <form className="pila" style={{ gap: 14 }} onSubmit={(e) => void crear(e)}>
        <h2 className="fila" style={{ fontSize: 18, fontWeight: 600, gap: 8 }}><LuSquareKanban size={20} /> Nuevo proyecto</h2>
        <p className="texto-sm texto-muted">Se crea en InooWork con tabla, línea de tiempo y kanban. Tú quedas como líder.</p>
        <div className="campo">
          <label htmlFor="tab-nombre">Nombre del proyecto</label>
          <div className="entrada"><input id="tab-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej.: Web institucional 2027" autoFocus /></div>
          {error("nombre")}
        </div>
        <div className="campo">
          <label htmlFor="tab-cliente">Cliente</label>
          <div className="entrada"><input id="tab-cliente" list="tab-clientes" value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={120} placeholder="Escribe o elige un cliente" /></div>
          <datalist id="tab-clientes">{clientes.map((c) => <option key={c} value={c} />)}</datalist>
          {error("cliente")}
        </div>
        <div className="campo">
          <label htmlFor="tab-descripcion">Descripción <span className="texto-muted">(opcional)</span></label>
          <textarea id="tab-descripcion" className="input" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={2000} />
          {error("descripcion")}
        </div>
        <fieldset className="campo" style={{ border: 0, padding: 0 }}>
          <legend>Color</legend>
          <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            {COLORES_GRUPO.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: color === c ? "3px solid var(--c-texto)" : "2px solid transparent", cursor: "pointer" }} />
            ))}
          </div>
        </fieldset>
        <fieldset className="campo" style={{ border: 0, padding: 0 }}>
          <legend>Miembros</legend>
          {companeros.length ? (
            <div className="invitados">
              {companeros.map((p) => (
                <label key={p.id} className={`chip-persona${miembros.includes(p.id) ? " activo" : ""}`}>
                  <input type="checkbox" checked={miembros.includes(p.id)} onChange={() => setMiembros((xs) => (xs.includes(p.id) ? xs.filter((i) => i !== p.id) : [...xs, p.id]))} />
                  {p.nombre}
                </label>
              ))}
            </div>
          ) : (
            <p className="texto-xs texto-muted">Nadie más del equipo tiene ficha en InooWork todavía.</p>
          )}
          {error("miembros")}
        </fieldset>
        <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton boton--primario" disabled={enviando}>{enviando ? "Creando…" : "Crear proyecto"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TarjetaTablero({ t }: { t: S<"TableroResumen"> }) {
  const pct = t.items.total ? Math.round((t.items.completados / t.items.total) * 100) : 0;
  return (
    <Enlace a={`/equipo/proyectos/tableros/${t.id}`} className="pipeline-tarjeta">
      <span className="fila entre" style={{ gap: 8 }}>
        <span className="texto-xs texto-muted" style={t.cliente ? undefined : { color: "var(--c-alerta)" }}>{t.cliente ?? "Sin cliente"}</span>
        <span style={{ color: "var(--c-primario)", display: "inline-flex" }} title="Tablero de InooWork" aria-label="Tablero de InooWork" role="img">
          <LuSquareKanban size={16} />
        </span>
      </span>
      <span className="negrita" style={{ fontSize: 13, lineHeight: 1.35 }}>{t.nombre}</span>
      <span className="texto-xs texto-muted">{t.items.completados} de {t.items.total} completados{t.area ? ` · ${t.area}` : ""}</span>
      <span className="fila" style={{ gap: 8 }}>
        <span style={{ flex: 1 }}>
          <Barra pct={pct} tono={t.items.vencidos ? "ambar" : undefined} />
        </span>
        <span className="texto-xs negrita">{pct} %</span>
      </span>
      <span className="fila entre" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          {t.items.vencidos > 0 && <span className="pipeline-dato pipeline-dato--rojo"><LuListTodo size={12} /> {t.items.vencidos} vencido{t.items.vencidos === 1 ? "" : "s"}</span>}
        </span>
        {t.lider && (
          <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }} title={`Líder: ${t.lider.nombre}`}>
            {iniciales(t.lider.nombre)}
          </span>
        )}
      </span>
    </Enlace>
  );
}

function TarjetaProyecto({ p }: { p: S<"ProyectoPipeline"> }) {
  const etapa = p.avance.etapaActual;
  return (
    <Enlace a={`/equipo/proyectos/${p.servicioContratadoId}`} className="pipeline-tarjeta">
      <span className="fila entre" style={{ gap: 8 }}>
        <span className="texto-xs texto-muted">{p.clienteNombre}</span>
        <span style={{ color: "var(--c-primario)", display: "inline-flex" }} aria-hidden>
          {ICONO_SERVICIO[p.codigo]}
        </span>
      </span>
      <span className="negrita" style={{ fontSize: 13, lineHeight: 1.35 }}>{p.titulo}</span>
      <span className="texto-xs texto-muted">{etapa ? `Etapa ${etapa.orden} de ${p.avance.totalEtapas} · ${etapa.nombre}` : "Todas las etapas completas"}</span>
      <span className="fila" style={{ gap: 8 }}>
        <span style={{ flex: 1 }}>
          <Barra pct={p.avance.porcentaje} tono={etapa?.atrasada ? "ambar" : undefined} />
        </span>
        <span className="texto-xs negrita">{p.avance.porcentaje} %</span>
      </span>
      <span className="fila entre" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
          {p.tareas.abiertas > 0 && (
            <span className={`pipeline-dato${p.tareas.vencidas ? " pipeline-dato--rojo" : ""}`} title="Tareas abiertas del equipo">
              <LuListTodo size={12} /> {p.tareas.vencidas ? `${p.tareas.vencidas} vencida${p.tareas.vencidas === 1 ? "" : "s"}` : `${p.tareas.abiertas} tarea${p.tareas.abiertas === 1 ? "" : "s"}`}
            </span>
          )}
          {p.requerimientosPendientes > 0 && (
            <span className={`pipeline-dato${p.requerimientosAtrasados ? " pipeline-dato--ambar" : ""}`} title="Requerimientos pendientes del cliente">
              <LuClipboardList size={12} /> {p.requerimientosAtrasados ? `${p.requerimientosAtrasados} atrasado${p.requerimientosAtrasados === 1 ? "" : "s"}` : `${p.requerimientosPendientes} pendiente${p.requerimientosPendientes === 1 ? "" : "s"}`}
            </span>
          )}
        </span>
        {p.responsable && (
          <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }} title={`Lleva la cuenta: ${p.responsable.nombre}`}>
            {iniciales(p.responsable.nombre)}
          </span>
        )}
      </span>
    </Enlace>
  );
}
