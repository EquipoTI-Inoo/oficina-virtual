"use client";
/**
 * Pipeline de proyectos (reunión 15 oct): cada tarjeta es un proyecto (servicio contratado), no una
 * tarea ni un requerimiento. Las columnas muestran en qué situación está cada uno; al entrar se ven
 * sus etapas y sus tareas. Monday sirve solo de referencia visual: el tablero vive aquí.
 * Desde el 6 nov también trae los tableros de InooWork, con el nombre de su cliente: InooWork sigue siendo su fuente.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LuArchive, LuClipboardList, LuFolderTree, LuListTodo, LuLock, LuPlus, LuSearch, LuSquareKanban, LuTag, LuColumns3, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import { api, Enlace, ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { COLORES_GRUPO, columnaDeTablero } from "../dominio/tableros";
import { Barra, Cabecera, Cargando, ErrorCarga, Estructura, ICONO_SERVICIO, Modal, useAviso, usePortal } from "../componentes";
import { NuevoServicio } from "./proyecto-equipo";
import { ArbolProyectos, BarraFiltros, construirArbol, destinoDe, estaEn, ModalNombre, pasaFiltros, RAIZ, SIN_FILTROS, ubicar, useVistaProyectos, VistaCarpetas, type Carpeta, type Filtros, type Lugar } from "./carpetas-proyectos";

export type TipoNuevo = "CATALOGO" | "TABLERO";
const INOO_INTERNO = "Inoo (interno)";

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

/** Encabezado común de los dos formularios de «Nuevo proyecto», con el cambio de tipo. */
export function CabeceraNuevo({ tipo, cambiar, tablero }: { tipo: TipoNuevo; cambiar: (t: TipoNuevo) => void; tablero: boolean }) {
  return (
    <div className="pila" style={{ gap: 10 }}>
      <h2 className="fila" style={{ fontSize: "var(--t-xl)", fontWeight: 600, gap: 8 }}><LuSquareKanban size={20} /> Nuevo proyecto</h2>
      <div className="chips" role="radiogroup" aria-label="Tipo de proyecto">
        <button type="button" role="radio" className="chip" aria-checked={tipo === "CATALOGO"} aria-pressed={tipo === "CATALOGO"} onClick={() => cambiar("CATALOGO")}>Predeterminado</button>
        {tablero && <button type="button" role="radio" className="chip" aria-checked={tipo === "TABLERO"} aria-pressed={tipo === "TABLERO"} onClick={() => cambiar("TABLERO")}>Personalizado</button>}
      </div>
      <p className="texto-sm texto-muted">
        {tipo === "CATALOGO"
          ? "Un servicio del catálogo con las etapas de su plantilla. El cliente lo ve en su portal y se le piden los requerimientos."
          : "Un tablero libre en InooWork (tabla, línea de tiempo y kanban). Tú quedas como líder."}
      </p>
    </div>
  );
}

function PipelineProyectos() {
  const { ir: irA } = useNavegacion();
  const { sesion } = usePortal();
  const [mios, setMios] = useState(false);
  const [texto, setTexto] = useState("");
  const params = new URLSearchParams();
  if (mios && sesion) params.set("responsableId", sesion.usuario.id);
  if (texto.trim()) params.set("q", texto.trim());
  const { datos: d, error, recargar } = useConsulta<Pipeline>(`/panel/proyectos${params.toString() ? `?${params}` : ""}`);
  // Si InooWork no responde, los proyectos de clientes se siguen viendo y solo faltan los tableros.
  const r = useConsulta<{ datos: S<"TableroResumen">[]; equipo: { id: string; nombre: string; area: string | null; empleadoId: string }[] }>("/tableros");
  // 8 nov (reunión del 6): al crear se elige entre un proyecto predeterminado (del catálogo) o personalizado (tablero).
  const [creando, setCreando] = useState<TipoNuevo | null>(null);
  // 13 nov: los proyectos archivados (los viejos de Monday, los culminados) se ven aparte y se pueden desarchivar.
  const [archivados, setArchivados] = useState(false);
  const cl = useConsulta<{ datos: S<"ClienteResumen">[] }>(creando ? "/clientes?limite=100" : null);
  const delPortal = (cl.datos?.datos ?? []).filter((c) => c.estado !== "BAJA").map((c) => ({ id: c.id, nombre: c.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const clientes = [...new Set([...delPortal.map((c) => c.nombre), ...(r.datos?.datos ?? []).map((t) => t.cliente).filter((c): c is string => !!c)])].sort((a, b) => a.localeCompare(b, "es"));
  const q = texto.trim().toLowerCase();
  const yoId = sesion?.usuario.id;
  // ¿Hay algo en «Todos» que no sea suyo? Con los datos sin filtro por persona.
  const veMas = !mios && (!!(r.datos?.datos ?? []).some((t) => !t.esMio) || !!(d?.datos ?? []).some((p) => p.responsable?.id !== yoId));
  const tablerosTodos = (r.datos?.datos ?? []).filter((t) => (!mios || t.esMio) && (!q || `${t.cliente ?? ""} ${t.nombre} ${t.area ?? ""} ${t.lider?.nombre ?? ""} ${t.etiquetas.join(" ")}`.toLowerCase().includes(q)));
  // 16 nov (tanda 4, Ernesto): Proyectos (tableros) y Servicios (lo que el cliente compró) separados en la misma sección,
  // con el mismo filtro de Empresa → Marca a la izquierda y etiquetas libres para los tableros.
  const [pestana, setPestana] = useState<"PROYECTOS" | "SERVICIOS">("PROYECTOS");
  // 17 nov (Ernesto): carpetas Empresa → Marca → Carpeta → Subcarpeta, dos vistas (carpetas o por estado) y filtros.
  const [lugar, setLugar] = useState<Lugar>(RAIZ);
  const [vista, setVista] = useVistaProyectos();
  const [arbolMovil, setArbolMovil] = useState(false);
  // 18 nov: el árbol se oculta (sobre todo para la vista por estado, que necesita el ancho); se recuerda.
  const [arbolOculto, setArbolOculto] = useState(false);
  useEffect(() => {
    try { setArbolOculto(localStorage.getItem("inoo.proyectos.arbolOculto") === "1"); } catch { /* sin almacenamiento */ }
  }, []);
  const alternarArbol = () => setArbolOculto((x) => {
    try { localStorage.setItem("inoo.proyectos.arbolOculto", x ? "0" : "1"); } catch { /* sin almacenamiento */ }
    return !x;
  });
  const botonArbol = (
    <button type="button" className="boton boton--chico arbol-alternar" aria-pressed={!arbolOculto} onClick={alternarArbol}
      title={arbolOculto ? "Mostrar empresas y carpetas" : "Ocultar empresas y carpetas"}>
      {arbolOculto ? <LuPanelLeftOpen size={14} /> : <LuPanelLeftClose size={14} />} {arbolOculto ? "Mostrar carpetas" : "Ocultar carpetas"}
    </button>
  );
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [etiqueta, setEtiqueta] = useState<string | null>(null);
  const [nombrando, setNombrando] = useState<{ tipo: "NUEVA"; en: Lugar } | { tipo: "RENOMBRAR"; carpeta: Carpeta } | null>(null);
  const [destino, setDestino] = useState<{ cliente: string; marcaId: string | null; carpetaId: string | null } | null>(null);
  const avisar = useAviso();
  const marcas = useConsulta<{ datos: S<"MarcaCliente">[] }>("/marcas");
  const cq = useConsulta<{ datos: Carpeta[] }>("/carpetas");
  const carpetas = cq.datos?.datos ?? [];
  const listaMarcas = marcas.datos?.datos ?? [];
  const lugarServ: Lugar = { ...lugar, carpeta: null };
  const tableros = tablerosTodos.filter((t) => estaEn(ubicar(t, carpetas), lugar) && pasaFiltros(t, filtros) && (!etiqueta || t.etiquetas.includes(etiqueta)));
  const servicios = (d?.datos ?? []).filter((p) => estaEn(ubicar({ cliente: p.clienteNombre, marcaId: p.marcaId ?? null }, []), lugarServ));
  const etiquetas = [...new Set(tablerosTodos.filter((t) => estaEn(ubicar(t, carpetas), lugar)).flatMap((t) => t.etiquetas))].sort((a, b) => a.localeCompare(b, "es"));
  const arbol = pestana === "PROYECTOS"
    ? construirArbol(tablerosTodos.filter((t) => pasaFiltros(t, filtros)), listaMarcas, carpetas, true)
    : construirArbol((d?.datos ?? []).map((p) => ({ cliente: p.clienteNombre, marcaId: p.marcaId ?? null })), listaMarcas, carpetas, false);
  const enCarpetas = pestana === "PROYECTOS" && vista === "CARPETAS";
  const empresa = arbol.find((e) => e.clave === lugar.empresa);
  const esAdmin = sesion?.usuario.nivelAcceso === "ADMIN";

  /** Arrastrar un proyecto a una carpeta, marca o empresa del árbol: solo dentro de su misma empresa. */
  const mover = async (tableroId: string, l: Lugar) => {
    const t = tablerosTodos.find((x) => x.id === tableroId);
    const dest = destinoDe(l);
    if (!t || !dest) return;
    if (ubicar(t, carpetas).empresa !== dest.empresa) {
      avisar({ titulo: "Solo dentro de la misma empresa", texto: "Para cambiarle el cliente, hazlo dentro del proyecto." });
      return;
    }
    try {
      await api(`/tableros/${t.id}`, { metodo: "PATCH", cuerpo: dest.cambio });
      avisar({ titulo: "Proyecto movido" });
      void r.recargar();
    } catch (x) {
      avisar({ titulo: "No se pudo mover", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const guardarNombre = async (nombre: string): Promise<string | null> => {
    if (!nombrando) return null;
    try {
      if (nombrando.tipo === "RENOMBRAR") await api(`/carpetas/${nombrando.carpeta.id}`, { metodo: "PATCH", cuerpo: { nombre } });
      else {
        const en = nombrando.en;
        const c = carpetas.find((x) => x.id === en.carpeta);
        const marcaId = en.marca && en.marca !== "__sin" ? en.marca : null;
        const nombreEmpresa = arbol.find((e) => e.clave === en.empresa)?.nombre ?? "";
        const nueva = await api<Carpeta>("/carpetas", { metodo: "POST", cuerpo: { empresa: nombreEmpresa, marcaId, ...(c ? { padreId: c.id } : {}), nombre } });
        setLugar({ ...en, carpeta: nueva.id });
      }
      setNombrando(null);
      void cq.recargar();
      return null;
    } catch (x) {
      return x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : "No se pudo guardar";
    }
  };
  const borrarCarpeta = async (c: Carpeta) => {
    if (!window.confirm(`¿Borrar la carpeta «${c.nombre}»? Sus proyectos y subcarpetas suben un nivel; no se borra ningún proyecto.`)) return;
    try {
      await api(`/carpetas/${c.id}`, { metodo: "DELETE" });
      setLugar({ ...lugar, carpeta: c.padreId });
      void cq.recargar();
      void r.recargar();
    } catch (x) {
      avisar({ titulo: "No se pudo borrar", texto: x instanceof ProblemaApi ? x.titulo : undefined });
    }
  };
  return (
    <>
      <Cabecera titulo="Proyectos" bajada="Proyectos son los tableros de trabajo (los mismos de InooWork); Servicios, lo que cada cliente contrató. Ordénalos en carpetas por empresa y marca, y fíltralos a la izquierda." />
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
        <button type="button" className="chip" aria-pressed={archivados} onClick={() => setArchivados(!archivados)}>
          <LuArchive size={14} /> Archivados
        </button>
        <button type="button" className="boton boton--primario" style={{ marginLeft: "auto" }} onClick={() => setCreando("CATALOGO")}>
          <LuPlus size={16} /> Nuevo proyecto
        </button>
      </div>
      {creando === "CATALOGO" && (
        <NuevoServicio abierto clientes={delPortal} cabecera={<CabeceraNuevo tipo="CATALOGO" cambiar={setCreando} tablero={!!r.datos} />}
          alCerrar={() => setCreando(null)} alCrear={(s) => { void recargar(); if (s.servicioContratadoId) irA(`/equipo/proyectos/${s.servicioContratadoId}`); }} />
      )}
      {creando === "TABLERO" && r.datos && <NuevoTablero equipo={r.datos.equipo} clientes={clientes} destino={destino} cabecera={<CabeceraNuevo tipo="TABLERO" cambiar={setCreando} tablero />} alCerrar={() => { setCreando(null); setDestino(null); }} />}
      {r.error && <p className="texto-xs texto-muted" style={{ marginBottom: 12 }}>InooWork no respondió: por ahora no se ven sus tableros.</p>}
      {!archivados && (
        <div className="segmentado" role="tablist" aria-label="Qué ver" style={{ marginBottom: 14 }}>
          <button role="tab" aria-selected={pestana === "PROYECTOS"} className={pestana === "PROYECTOS" ? "activo" : undefined} onClick={() => setPestana("PROYECTOS")}>Proyectos ({tablerosTodos.length})</button>
          <button role="tab" aria-selected={pestana === "SERVICIOS"} className={pestana === "SERVICIOS" ? "activo" : undefined} onClick={() => setPestana("SERVICIOS")}>Servicios ({d?.datos.length ?? 0})</button>
        </div>
      )}
      {archivados ? <Archivados texto={q} /> : error ? (
        <ErrorCarga error={error} reintentar={recargar} />
      ) : !d ? (
        <Cargando />
      ) : (
        <div className={`proyectos-dos-columnas${arbolOculto ? " proyectos-dos-columnas--sin-arbol" : ""}`}>
        <div className={`arbol-columna${arbolMovil ? " arbol-columna--abierta" : ""}`}>
          <button type="button" className="boton boton--chico arbol-boton-movil" aria-expanded={arbolMovil} onClick={() => setArbolMovil((x) => !x)}><LuFolderTree size={14} /> {arbolMovil ? "Ocultar el árbol" : "Ver el árbol de carpetas"}</button>
          <ArbolProyectos arbol={arbol} lugar={lugar} ir={(l) => { setLugar(l); setArbolMovil(false); }} etiqueta="Empresas, marcas y carpetas"
            alSoltar={pestana === "PROYECTOS" ? (id, l) => void mover(id, l) : undefined}
            tableros={pestana === "PROYECTOS" ? tablerosTodos.filter((t) => pasaFiltros(t, filtros) && (!etiqueta || t.etiquetas.includes(etiqueta))) : undefined} carpetas={carpetas}
            acciones={pestana === "PROYECTOS" ? {
              nuevaCarpeta: (l) => setNombrando({ tipo: "NUEVA", en: l }),
              nuevoProyecto: (l) => { const e = arbol.find((x) => x.clave === l.empresa); if (e) { setDestino({ cliente: e.nombre, marcaId: l.marca && l.marca !== "__sin" ? l.marca : null, carpetaId: l.carpeta }); setCreando("TABLERO"); } },
              renombrar: (c) => setNombrando({ tipo: "RENOMBRAR", carpeta: c }),
              borrar: esAdmin ? (c) => void borrarCarpeta(c) : null,
            } : undefined} />
        </div>
        <div style={{ minWidth: 0 }}>
        {pestana === "SERVICIOS" && <div className="fila" style={{ marginBottom: 12 }}>{botonArbol}</div>}
        {pestana === "PROYECTOS" && <BarraFiltros tableros={tablerosTodos} equipo={r.datos?.equipo ?? []} f={filtros} cambiar={setFiltros} izquierda={
          <>{botonArbol}<div className="segmentado" role="tablist" aria-label="Cómo ver los proyectos">
            <button role="tab" aria-selected={vista === "CARPETAS"} className={vista === "CARPETAS" ? "activo" : undefined} onClick={() => setVista("CARPETAS")}><LuFolderTree size={14} /> Carpetas</button>
            <button role="tab" aria-selected={vista === "ESTADO"} className={vista === "ESTADO" ? "activo" : undefined} onClick={() => setVista("ESTADO")}><LuColumns3 size={14} /> Por estado</button>
          </div></>
        } />}
        {pestana === "PROYECTOS" && etiquetas.length > 0 && (
          <div className="chips" role="group" aria-label="Filtrar por etiqueta" style={{ marginBottom: 12 }}>
            <LuTag size={14} aria-hidden style={{ alignSelf: "center", color: "var(--c-muted)" }} />
            {etiquetas.map((x) => <button key={x} type="button" className="chip" aria-pressed={etiqueta === x} onClick={() => setEtiqueta(etiqueta === x ? null : x)}>{x}</button>)}
          </div>
        )}
        {enCarpetas ? (
          <VistaCarpetas arbol={arbol} lugar={lugar} ir={setLugar} tableros={tableros} carpetas={carpetas} marcas={listaMarcas} />
        ) : (
        <div className="pipeline" role="list" aria-label={pestana === "PROYECTOS" ? "Proyectos" : "Servicios"}>
          {d.columnas.map((c) => {
            const xs = pestana === "SERVICIOS" ? servicios.filter((p) => p.columna === c.clave) : [];
            const ts = pestana === "PROYECTOS" ? tableros.filter((t) => columnaDeTablero(t.estado, t.items) === c.clave) : [];
            return (
              <section key={c.clave} className="pipeline-columna" data-columna={c.clave} data-vacia={!xs.length && !ts.length || undefined} role="listitem" aria-label={`${c.titulo}: ${xs.length + ts.length}`}>
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
                    <TarjetaTablero key={t.id} t={t} marca={(marcas.datos?.datos ?? []).find((m) => m.id === t.marcaId)?.nombre} />
                  ))}
                  {!xs.length && !ts.length && <p className="texto-xs texto-muted pipeline-vacio">{pestana === "PROYECTOS" ? "Sin proyectos" : "Sin servicios"}</p>}
                </div>
              </section>
            );
          })}
        </div>
        )}
        </div>
        </div>
      )}
      {nombrando && (
        <ModalNombre titulo={nombrando.tipo === "NUEVA" ? (nombrando.en.carpeta ? "Nueva subcarpeta" : "Nueva carpeta") : "Renombrar carpeta"} etiqueta="Nombre de la carpeta"
          inicial={nombrando.tipo === "RENOMBRAR" ? nombrando.carpeta.nombre : ""} alGuardar={guardarNombre} alCerrar={() => setNombrando(null)} />
      )}
    </>
  );
}

/** Crea el proyecto en InooWork con su plantilla y abre el tablero (6 nov). */
/** Servicios que se pueden anotar en un proyecto personalizado (quedan como etiqueta del tablero). */
const SERVICIOS_TABLERO = ["Desarrollo web", "Branding", "Social Media", "CRM", "SEO", "Marketing", "Audiovisual"] as const;

export function NuevoTablero({ equipo, clientes, cabecera, alCerrar, destino, clienteFijo }: { equipo: { id: string; nombre: string; area: string | null }[]; clientes: string[]; cabecera: ReactNode; alCerrar: () => void; destino?: { cliente: string; marcaId: string | null; carpetaId: string | null } | null; clienteFijo?: string }) {
  const { ir } = useNavegacion();
  const avisar = useAviso();
  const yo = usePortal().sesion?.usuario.id;
  const [nombre, setNombre] = useState("");
  // 17 nov: «Proyecto aquí» desde una carpeta llega con su empresa (y marca o carpeta) puestas.
  const [cliente, setCliente] = useState(clienteFijo ?? destino?.cliente ?? "");
  // 20 nov (Alonso): un proyecto personalizado puede ser de un servicio (Web, Branding…) sin cargar su plantilla.
  const [servicio, setServicio] = useState("");
  const [otro, setOtro] = useState(false);
  // Inoo como cliente interno (27 oct): si InooWork ya lo tiene como «Inoo», se usa ese nombre.
  const base = clientes.some((c) => /^inoo\b/i.test(c)) ? clientes : [INOO_INTERNO, ...clientes];
  const opciones = destino?.cliente && !base.includes(destino.cliente) ? [destino.cliente, ...base] : base;
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
      if (servicio) await api(`/tableros/${t.id}`, { metodo: "PATCH", cuerpo: { etiquetas: [servicio] } }).catch(() => undefined);
      if (destino && (destino.carpetaId || destino.marcaId)) {
        await api(`/tableros/${t.id}`, { metodo: "PATCH", cuerpo: destino.carpetaId ? { carpetaId: destino.carpetaId } : { marcaId: destino.marcaId } }).catch(() => undefined);
      }
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
        {cabecera}
        <div className="campo">
          <label htmlFor="tab-nombre">Nombre del proyecto</label>
          <div className="entrada"><input id="tab-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej.: Web institucional 2027" autoFocus /></div>
          {error("nombre")}
        </div>
        {clienteFijo ? (
          <p className="texto-sm">Cliente: <strong>{clienteFijo}</strong></p>
        ) : (
        <div className="campo">
          <label htmlFor="tab-cliente">Cliente</label>
          <select id="tab-cliente" className="input" value={otro ? "__otro" : cliente} onChange={(e) => {
            const v = e.target.value;
            setOtro(v === "__otro");
            setCliente(v === "__otro" ? "" : v);
          }}>
            <option value="">Elige el cliente</option>
            {opciones.map((c) => <option key={c} value={c}>{c}</option>)}
            <option value="__otro">Otro (todavía no está en el portal)…</option>
          </select>
          {otro && <div className="entrada" style={{ marginTop: 6 }}><input aria-label="Nombre del cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} maxLength={120} placeholder="Nombre del cliente" autoFocus /></div>}
          {error("cliente")}
        </div>
        )}
        {clienteFijo && error("cliente")}
        <div className="campo">
          <label htmlFor="tab-servicio">Servicio <span className="texto-muted">(opcional)</span></label>
          <select id="tab-servicio" className="input" value={servicio} onChange={(e) => setServicio(e.target.value)}>
            <option value="">Sin servicio</option>
            {SERVICIOS_TABLERO.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <p className="texto-xs texto-muted">Se crea vacío, sin la plantilla del servicio: armas tus grupos y columnas.</p>
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

/**
 * «Nuevo proyecto» desde la ficha de un cliente (20 nov, Alonso): lo mismo que en Proyectos, predeterminado (servicio
 * del catálogo con su plantilla) o personalizado (tablero libre), ya vinculado al cliente.
 */
export function NuevoProyectoDeCliente({ clienteId, clienteNombre, abierto, alCerrar, alCrear }: { clienteId: string; clienteNombre: string; abierto: boolean; alCerrar: () => void; alCrear: () => void }) {
  const [tipo, setTipo] = useState<TipoNuevo>("CATALOGO");
  const r = useConsulta<{ datos: S<"TableroResumen">[]; equipo: { id: string; nombre: string; area: string | null; empleadoId: string }[] }>(abierto ? "/tableros" : null);
  if (!abierto) return null;
  const cabecera = <CabeceraNuevo tipo={tipo} cambiar={setTipo} tablero={!!r.datos} />;
  return tipo === "CATALOGO"
    ? <NuevoServicio clienteId={clienteId} abierto cabecera={cabecera} alCerrar={() => { setTipo("CATALOGO"); alCerrar(); }} alCrear={() => alCrear()} />
    : <NuevoTablero equipo={r.datos?.equipo ?? []} clientes={[]} clienteFijo={clienteNombre} cabecera={cabecera} alCerrar={() => { setTipo("CATALOGO"); alCerrar(); }} />;
}

function TarjetaTablero({ t, marca }: { t: S<"TableroResumen">; marca?: string }) {
  const pct = t.items.total ? Math.round((t.items.completados / t.items.total) * 100) : 0;
  return (
    <Enlace a={`/equipo/proyectos/tableros/${t.id}`} className="pipeline-tarjeta">
      <span className="fila entre" style={{ gap: 8 }}>
        <span className="texto-xs texto-muted" style={t.cliente ? undefined : { color: "var(--c-alerta)" }}>{t.cliente ?? "Sin cliente"}{marca ? ` · ${marca}` : ""}</span>
        <span style={{ color: "var(--c-primario)", display: "inline-flex" }} title="Tablero de InooWork" aria-label="Tablero de InooWork" role="img">
          <LuSquareKanban size={16} />
        </span>
      </span>
      <span className="negrita" style={{ fontSize: "var(--t-sm)", lineHeight: 1.35 }}>{t.privado && <LuLock size={12} aria-label="Privado" style={{ marginRight: 4, verticalAlign: "-1px" }} />}{t.nombre}{t.nuevo && <span className="etiqueta-nuevo">Nuevo</span>}</span>
      <span className="texto-xs texto-muted">{t.items.completados} de {t.items.total} completados{t.area ? ` · ${t.area}` : ""}</span>
      {t.etiquetas.length > 0 && <span className="fila" style={{ gap: 4, flexWrap: "wrap" }}>{t.etiquetas.map((x) => <span key={x} className="etiqueta-libre">{x}</span>)}</span>}
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
          <span className="avatar" style={{ width: 26, height: 26, fontSize: "var(--t-xs)" }} title={`Líder: ${t.lider.nombre}`}>
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
      <span className="negrita" style={{ fontSize: "var(--t-sm)", lineHeight: 1.35 }}>{p.titulo}</span>
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
          <span className="avatar" style={{ width: 26, height: 26, fontSize: "var(--t-xs)" }} title={`Lleva la cuenta: ${p.responsable.nombre}`}>
            {iniciales(p.responsable.nombre)}
          </span>
        )}
      </span>
    </Enlace>
  );
}

/** Los tableros archivados (13 nov): guardados, fuera del pipeline. Se abren en solo lectura y se desarchivan desde ahí. */
function Archivados({ texto }: { texto: string }) {
  const r = useConsulta<{ datos: S<"TableroResumen">[] }>("/tableros?archivados=1");
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const xs = r.datos.datos.filter((t) => !texto || `${t.cliente ?? ""} ${t.nombre} ${t.area ?? ""}`.toLowerCase().includes(texto));
  return (
    <section aria-label="Proyectos archivados">
      <p className="texto-sm texto-muted" style={{ marginBottom: 12 }}>
        {r.datos.datos.length} proyectos archivados o cancelados. Siguen guardados con todo su contenido; ábrelos para verlos o desarchivarlos.
      </p>
      {!xs.length ? <p className="texto-sm texto-muted">{r.datos.datos.length ? "Ninguno coincide con la búsqueda." : "No hay proyectos archivados."}</p> : (
        <div className="pila" style={{ gap: 6 }}>
          {xs.map((t) => (
            <Enlace key={t.id} a={`/equipo/proyectos/tableros/${t.id}`} className="fila-suave mi-trabajo-fila">
              <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
                <span className="negrita texto-sm" style={{ overflowWrap: "anywhere" }}>{t.nombre}</span>
                <span className="texto-xs texto-muted">{[t.cliente ?? "Sin cliente", t.area, `${t.items.total} ítems`].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="texto-xs texto-muted">{t.estado === "Cancelado" && !t.archivadoEn ? "Cancelado" : t.archivadoEn ? `Archivado el ${new Date(t.archivadoEn).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}` : "Archivado"}</span>
            </Enlace>
          ))}
        </div>
      )}
    </section>
  );
}
