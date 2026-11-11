"use client";
/**
 * Importar de Monday (9 nov 2026): para dejar de usar Monday sin perder nada. El nivel ADMIN ve los tableros de
 * la cuenta de Monday, revisa cada uno (cómo se traducen los estados y quién del equipo es cada persona) y lo
 * importa: queda como tablero de InooWork con su historial (actualizaciones, respuestas y archivos).
 */
import { useRef, useState } from "react";
import { LuCheck, LuSearch } from "react-icons/lu";
import { api, Enlace, fCorta, ProblemaApi, useConsulta, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Modal, useAviso } from "../componentes";
import { COLOR_ESTADO, ESTADOS_ITEM, type EstadoItem } from "../dominio/tableros";

type Lista = { conectado: boolean; datos: { id: string; nombre: string; espacio: string | null; items: number; actualizadoEn: string | null; importado: { proyectoId: string; en: string } | null }[] };
type Previa = S<"PreviaMonday">;
type Resultado = { tablero: S<"TableroInooWork">; resumen: Record<string, number>; archivosSinCopiar: { nombre: string; motivo: string }[] };

const USO: Record<Previa["columnas"][number]["uso"], string> = {
  ESTADO: "Estado", PRIORIDAD: "Prioridad", RESPONSABLE: "Responsable", FECHA: "Fecha límite", LINEA_TIEMPO: "Fecha límite (si no hay fecha)", NOTAS: "Descripción",
  COLUMNA: "Columna propia", NO_SE_PASA: "No se pasa",
};

export function PantallaMonday() {
  return (
    <Estructura espacio="equipo" migas="Importar de Monday">
      <ImportarMonday />
    </Estructura>
  );
}

function ImportarMonday() {
  const r = useConsulta<Lista>("/monday/tableros");
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [verImportados, setVerImportados] = useState(false);
  const [todos, setTodos] = useState(false);
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const q = texto.trim().toLowerCase();
  const xs = r.datos.datos.filter((t) => (verImportados || !t.importado) && (!q || `${t.nombre} ${t.espacio ?? ""}`.toLowerCase().includes(q)));
  const hechos = r.datos.datos.filter((t) => t.importado).length;

  return (
    <>
      <Enlace a="/equipo/proyectos" className="volver">← Proyectos</Enlace>
      <Cabecera titulo="Importar de Monday" bajada="Cada tablero de Monday pasa a ser un proyecto aquí, con sus grupos, ítems, subítems, responsables, fechas y columnas. Las actualizaciones y los archivos de cada ítem quedan en su historial." />
      {!r.datos.conectado && (
        <Aviso icono={<LuSearch size={18} />} titulo="Estos son tableros de ejemplo">
          Para ver los de verdad, un admin de Monday crea su clave personal (Perfil → Desarrolladores → Mi token) y la pone en el servidor como MONDAY_API_TOKEN. Al terminar la importación se borra.
        </Aviso>
      )}
      <div className="fila" style={{ gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
        <div className="entrada" style={{ flex: "1 1 220px", maxWidth: 320 }}>
          <input aria-label="Buscar tablero" placeholder="Buscar tablero o espacio" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </div>
        <label className="fila texto-sm" style={{ gap: 6 }}>
          <input type="checkbox" checked={verImportados} onChange={(e) => setVerImportados(e.target.checked)} /> Mostrar los ya importados
        </label>
        <span className="texto-sm texto-muted" style={{ marginLeft: "auto" }}>{hechos} de {r.datos.datos.length} importados</span>
        {hechos < r.datos.datos.length && <button className="boton boton--primario" onClick={() => setTodos(true)}>Importar todos ({r.datos.datos.length - hechos})</button>}
      </div>
      {!xs.length ? (
        <p className="texto-sm texto-muted">{r.datos.datos.length && !verImportados && !q ? "Ya están todos importados. Ya pueden dejar Monday." : "Ningún tablero coincide."}</p>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead><tr><th>Tablero</th><th>Espacio</th><th style={{ width: 80 }}>Ítems</th><th style={{ width: 220 }} /></tr></thead>
            <tbody>
              {xs.map((t) => (
                <tr key={t.id}>
                  <td className="negrita">{t.nombre}</td>
                  <td>{t.espacio ?? "—"}</td>
                  <td>{t.items}</td>
                  <td style={{ textAlign: "right" }}>
                    {t.importado
                      ? <Enlace a={`/equipo/proyectos/tableros/${t.importado.proyectoId}`} className="texto-sm"><LuCheck size={14} /> Importado el {fCorta(t.importado.en)}</Enlace>
                      : <button className="boton boton--chico boton--primario" onClick={() => setAbierto(t.id)}>Revisar e importar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {abierto && <Revision id={abierto} alCerrar={() => setAbierto(null)} alImportar={() => void r.recargar()} />}
      {todos && <ImportarTodos tableros={r.datos.datos.filter((t) => !t.importado)} alCerrar={() => { setTodos(false); void r.recargar(); }} />}
    </>
  );
}

function Revision({ id, alCerrar, alImportar }: { id: string; alCerrar: () => void; alImportar: () => void }) {
  const p = useConsulta<Previa>(`/monday/tableros/${id}`);
  const clientes = useConsulta<{ datos: S<"ClienteResumen">[] }>("/clientes?limite=100");
  const avisar = useAviso();
  const [nombre, setNombre] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [estados, setEstados] = useState<Record<string, EstadoItem>>({});
  const [personas, setPersonas] = useState<Record<string, string | null>>({});
  const [liderId, setLiderId] = useState("");
  const [copiarArchivos, setCopiarArchivos] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [hecho, setHecho] = useState<Resultado | null>(null);
  const d = p.datos;
  const nombres = [...new Set(["Inoo", ...(clientes.datos?.datos ?? []).filter((c) => c.estado !== "BAJA").map((c) => c.nombre)])].sort((a, b) => a.localeCompare(b, "es"));

  const importar = async () => {
    if (!d) return;
    setEnviando(true);
    setErrores({});
    try {
      const res = await api<Resultado>(`/monday/tableros/${id}/importar`, {
        metodo: "POST",
        cuerpo: { nombre: (nombre ?? d.tablero.nombre).trim(), cliente: cliente.trim(), estados, personas, copiarArchivos, ...(liderId ? { liderId } : {}) },
      });
      setHecho(res);
      alImportar();
    } catch (e) {
      if (e instanceof ProblemaApi && e.errores.length) setErrores(Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])));
      avisar({ titulo: "No se pudo importar", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Revisar el tablero de Monday" ancho={860}>
      {p.error ? <ErrorCarga error={p.error} reintentar={p.recargar} /> : !d ? <Cargando /> : hecho ? (
        <div className="pila" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Listo: «{hecho.tablero.nombre}» ya está en el portal</h2>
          <p className="texto-sm">
            {hecho.resumen.items} ítems y {hecho.resumen.subitems} subítems en {hecho.resumen.grupos} grupos, {hecho.resumen.actualizaciones} actualizaciones
            y {hecho.resumen.archivosCopiados} de {hecho.resumen.archivos} archivos copiados.
            {hecho.resumen.sinResponsable > 0 && ` ${hecho.resumen.sinResponsable} ítems quedaron sin responsable.`}
          </p>
          {hecho.archivosSinCopiar.length > 0 && (
            <details className="texto-sm">
              <summary>{hecho.archivosSinCopiar.length} archivos no se pudieron copiar (se ven por nombre en el historial)</summary>
              <ul>{hecho.archivosSinCopiar.slice(0, 50).map((a, i) => <li key={i}>{a.nombre}: {a.motivo}</li>)}</ul>
            </details>
          )}
          <div className="fila" style={{ gap: 8 }}>
            <Enlace a={`/equipo/proyectos/tableros/${hecho.tablero.id}`} className="boton boton--primario">Abrir el tablero</Enlace>
            <button className="boton" onClick={alCerrar}>Seguir con otro</button>
          </div>
        </div>
      ) : (
        <div className="pila" style={{ gap: 16 }}>
          <div>
            <span className="texto-xs texto-muted">{d.tablero.espacio ?? "Monday"}</span>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>{d.tablero.nombre}</h2>
            <p className="texto-sm texto-muted">
              {d.conteo.grupos} grupos · {d.conteo.items} ítems · {d.conteo.subitems} subítems · {d.conteo.actualizaciones} actualizaciones · {d.conteo.archivos} archivos
            </p>
          </div>
          {d.importado && <Aviso icono={<LuCheck size={18} />} titulo="Ya se importó">Este tablero ya está en el portal.</Aviso>}

          <div className="grid-2" style={{ gap: 12 }}>
            <label className="pila" style={{ gap: 4 }}>
              <span className="texto-sm negrita">Nombre del proyecto</span>
              <input className="input" value={nombre ?? d.tablero.nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
              {errores.nombre && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{errores.nombre}</span>}
            </label>
            <label className="pila" style={{ gap: 4 }}>
              <span className="texto-sm negrita">Cliente</span>
              <input className="input" list="monday-clientes" value={cliente} maxLength={120} placeholder="Elige un cliente, o Inoo si es interno" onChange={(e) => setCliente(e.target.value)} />
              <datalist id="monday-clientes">{nombres.map((n) => <option key={n} value={n} />)}</datalist>
              {errores.cliente && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{errores.cliente}</span>}
            </label>
          </div>

          <section className="pila" style={{ gap: 6 }}>
            <h3 className="texto-sm negrita">Personas</h3>
            <p className="texto-xs texto-muted">Emparejadas por correo o por nombre. Quien no tiene ficha en InooWork no puede ser responsable; sus ítems quedan sin asignar.</p>
            {d.personas.length === 0 && <p className="texto-xs texto-muted">El tablero no tiene responsables.</p>}
            {d.personas.map((x) => {
              const valor = x.id in personas ? personas[x.id] : x.sugeridoId;
              return (
                <div key={x.id} className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="texto-sm" style={{ flex: "1 1 220px" }}>
                    {x.nombre}{x.esDueno && <span className="texto-xs texto-muted"> · dueño del tablero</span>}
                    <span className="texto-xs texto-muted"> · {x.cantidad} {x.cantidad === 1 ? "ítem" : "ítems"}</span>
                  </span>
                  <select className="input" style={{ width: 240 }} aria-label={`Quién es ${x.nombre} en el equipo`} value={valor ?? ""} onChange={(e) => setPersonas({ ...personas, [x.id]: e.target.value || null })}>
                    <option value="">Sin asignar</option>
                    {d.equipo.map((e) => <option key={e.id} value={e.id} disabled={!e.conFicha}>{e.nombre}{e.conFicha ? "" : " (sin ficha de InooWork)"}</option>)}
                  </select>
                  {errores[`personas.${x.id}`] && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{errores[`personas.${x.id}`]}</span>}
                </div>
              );
            })}
            <label className="fila" style={{ gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <span className="texto-sm negrita" style={{ flex: "1 1 220px" }}>Líder del proyecto</span>
              <select className="input" style={{ width: 240 }} value={liderId} onChange={(e) => setLiderId(e.target.value)}>
                <option value="">Automático (el dueño en Monday, o tú)</option>
                {d.equipo.filter((e) => e.conFicha).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </label>
            {errores.liderId && <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>{errores.liderId}</span>}
          </section>

          <section className="pila" style={{ gap: 6 }}>
            <h3 className="texto-sm negrita">Estados</h3>
            {d.estados.map((e) => {
              const valor = estados[e.etiqueta] ?? e.sugerido;
              return (
                <div key={e.etiqueta} className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span className="texto-sm" style={{ flex: "1 1 220px" }}>{e.etiqueta || <span className="texto-muted">(sin estado)</span>} <span className="texto-xs texto-muted">· {e.cantidad}</span></span>
                  <select className="pildora" style={{ background: COLOR_ESTADO[valor], width: 180, flex: "0 0 auto" }} aria-label={`Estado para «${e.etiqueta || "sin estado"}»`} value={valor} onChange={(x) => setEstados({ ...estados, [e.etiqueta]: x.target.value as EstadoItem })}>
                    {ESTADOS_ITEM.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              );
            })}
          </section>

          <details>
            <summary className="texto-sm negrita">Columnas ({d.columnas.length})</summary>
            <ul className="texto-sm" style={{ marginTop: 6 }}>
              {d.columnas.map((c) => <li key={c.id}>{c.titulo} → <span className={c.uso === "NO_SE_PASA" ? "texto-muted" : undefined}>{USO[c.uso]}</span></li>)}
            </ul>
            <p className="texto-xs texto-muted">Los archivos de las columnas de archivo van al historial del ítem. Las automatizaciones de Monday no se pasan.</p>
          </details>

          {d.conteo.archivos > 0 && (
            <label className="fila texto-sm" style={{ gap: 8 }}>
              <input type="checkbox" checked={copiarArchivos} onChange={(e) => setCopiarArchivos(e.target.checked)} />
              Copiar los {d.conteo.archivos} archivos al Drive (si no, quedan solo con su nombre en el historial)
            </label>
          )}
          <div className="fila" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button className="boton" onClick={alCerrar}>Cancelar</button>
            <button className="boton boton--primario" disabled={enviando || !!d.importado} onClick={() => void importar()}>
              {enviando ? "Importando… (los archivos pueden tardar)" : "Importar"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────── importar todos de un tirón (11 nov)

type EstadoFila = { estado: "ESPERA" | "IMPORTANDO" | "LISTO" | "ERROR"; detalle?: string; proyectoId?: string };

/** Uno por uno desde el navegador (cada tablero es un pedido corto), con lo sugerido: personas por correo o nombre,
 * estados traducidos y el cliente por asignar. Se puede detener y retomar: lo ya importado no se repite. */
function ImportarTodos({ tableros, alCerrar }: { tableros: Lista["datos"]; alCerrar: () => void }) {
  const [copiar, setCopiar] = useState(false);
  const [filas, setFilas] = useState<Record<string, EstadoFila>>({});
  const [corriendo, setCorriendo] = useState(false);
  const parar = useRef(false);
  const hechos = Object.values(filas).filter((f) => f.estado === "LISTO").length;
  const errores = Object.values(filas).filter((f) => f.estado === "ERROR").length;

  const empezar = async () => {
    parar.current = false;
    setCorriendo(true);
    for (const t of tableros) {
      if (parar.current) break;
      if (filas[t.id]?.estado === "LISTO") continue;
      setFilas((x) => ({ ...x, [t.id]: { estado: "IMPORTANDO" } }));
      try {
        const r = await api<Resultado>(`/monday/tableros/${t.id}/importar`, { metodo: "POST", cuerpo: { copiarArchivos: copiar } });
        setFilas((x) => ({ ...x, [t.id]: { estado: "LISTO", proyectoId: r.tablero.id, detalle: `${r.resumen.items} ítems · ${r.resumen.actualizaciones} actualizaciones${copiar ? ` · ${r.resumen.archivosCopiados}/${r.resumen.archivos} archivos` : ""}` } }));
      } catch (e) {
        const ya = e instanceof ProblemaApi && e.codigo === "YA_IMPORTADO";
        setFilas((x) => ({ ...x, [t.id]: ya ? { estado: "LISTO", detalle: "Ya estaba importado" } : { estado: "ERROR", detalle: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : "No se pudo" } }));
      }
    }
    setCorriendo(false);
  };

  return (
    <Modal abierto alCerrar={() => { if (!corriendo || window.confirm("¿Detener la importación? Lo ya importado se queda.")) { parar.current = true; alCerrar(); } }} etiqueta="Importar todos los tableros" ancho={760}>
      <div className="pila" style={{ gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Importar {tableros.length} tableros de un tirón</h2>
          <p className="texto-sm texto-muted">
            Se importan uno por uno con lo sugerido: cada persona emparejada por correo o nombre, los estados traducidos y el cliente por asignar
            (cada tablero avisa «Falta el cliente» y se pone después). Deja esta ventana abierta hasta que termine; si se corta, vuelve a darle y sigue donde quedó.
          </p>
        </div>
        <label className="fila texto-sm" style={{ gap: 8 }}>
          <input type="checkbox" checked={copiar} disabled={corriendo} onChange={(e) => setCopiar(e.target.checked)} />
          Copiar también los archivos al Drive (tarda mucho más y ocupa espacio en el Drive; sin esto quedan solo con su nombre)
        </label>
        <div className="fila" style={{ gap: 8 }}>
          {!corriendo
            ? <button className="boton boton--primario" onClick={() => void empezar()}>{hechos || errores ? "Seguir" : "Empezar"}</button>
            : <button className="boton" onClick={() => { parar.current = true; }}>Detener después del actual</button>}
          <span className="texto-sm texto-muted">{hechos} de {tableros.length} listos{errores ? ` · ${errores} con error` : ""}</span>
        </div>
        <div className="tabla-envoltura" style={{ maxHeight: 380, overflow: "auto" }}>
          <table className="tabla">
            <tbody>
              {tableros.map((t) => {
                const f = filas[t.id];
                return (
                  <tr key={t.id}>
                    <td className="negrita texto-sm">{t.nombre}<span className="texto-xs texto-muted"> · {t.items} ítems</span></td>
                    <td className="texto-sm" style={{ width: 300 }}>
                      {!f ? <span className="texto-muted">En espera</span>
                        : f.estado === "IMPORTANDO" ? "Importando…"
                          : f.estado === "LISTO" ? <span><LuCheck size={13} /> {f.proyectoId ? <Enlace a={`/equipo/proyectos/tableros/${f.proyectoId}`}>{f.detalle}</Enlace> : f.detalle}</span>
                            : <span style={{ color: "var(--c-alerta)" }}>{f.detalle}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

// ───────────────────────────── historial de un ítem (en el tablero)

type Entrada = S<"EntradaHistorialMonday">;
const fechaHora = (f: string | null) => (f ? new Date(f).toLocaleString("es-PE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const peso = (b: number | null) => (b == null ? "" : b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function HistorialMonday({ proyectoId, item, alCerrar }: { proyectoId: string; item: { id: string; nombre: string }; alCerrar: () => void }) {
  const r = useConsulta<{ datos: Entrada[] }>(`/tableros/${proyectoId}/items/${item.id}/historial-monday`);
  const avisar = useAviso();
  const bajar = async (archivoId: string) => {
    try {
      window.open((await api<{ url: string }>(`/tableros/${proyectoId}/archivos-monday/${encodeURIComponent(archivoId)}`)).url, "_blank", "noopener");
    } catch (e) {
      avisar({ titulo: "No se pudo abrir el archivo", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const Archivos = ({ xs }: { xs: Entrada["archivos"] }) => (
    <ul className="fila" style={{ gap: 6, flexWrap: "wrap", listStyle: "none", padding: 0 }}>
      {xs.map((a) => (
        <li key={a.id}>
          {a.disponible
            ? <button className="chip" onClick={() => void bajar(a.id)}>{a.nombre} <span className="texto-muted">{peso(a.bytes)}</span></button>
            : <span className="chip" title="No se pudo traer de Monday">{a.nombre}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={`Historial de Monday de ${item.nombre}`} ancho={720}>
      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{item.nombre}</h2>
      <p className="texto-xs texto-muted" style={{ marginBottom: 14 }}>Lo que este ítem traía de Monday.</p>
      {r.error ? <ErrorCarga error={r.error} reintentar={r.recargar} /> : !r.datos ? <Cargando /> : !r.datos.datos.length ? (
        <p className="texto-sm texto-muted">Este ítem no tenía actualizaciones ni archivos en Monday.</p>
      ) : (
        <div className="pila" style={{ gap: 12 }}>
          {r.datos.datos.map((h) => (
            <article key={h.id} className="tarjeta" style={{ padding: 12 }}>
              {h.tipo === "ARCHIVOS" ? <p className="texto-sm negrita" style={{ marginBottom: 6 }}>Archivos del ítem</p> : (
                <>
                  <p className="texto-xs texto-muted">{h.autor} · {fechaHora(h.fecha)}</p>
                  <p className="texto-sm" style={{ whiteSpace: "pre-wrap", margin: "4px 0 6px" }}>{h.texto}</p>
                </>
              )}
              {h.archivos.length > 0 && <Archivos xs={h.archivos} />}
              {h.respuestas.map((x, i) => (
                <div key={i} style={{ borderLeft: "3px solid var(--c-borde)", paddingLeft: 10, marginTop: 8 }}>
                  <p className="texto-xs texto-muted">{x.autor} · {fechaHora(x.fecha)}</p>
                  <p className="texto-sm" style={{ whiteSpace: "pre-wrap" }}>{x.texto}</p>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
    </Modal>
  );
}
