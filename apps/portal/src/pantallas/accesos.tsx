"use client";
/**
 * Accesos del equipo (2 nov 2026): quién trabaja en una cuenta o un proyecto, y asignar o quitar gente.
 * Asigna el nivel ADMIN a cualquiera o un lead a la gente de su área (las mismas reglas de la API).
 */
import { useState, type FormEvent } from "react";
import { LuArchive, LuKeyRound, LuLink, LuMail, LuMessageCircle, LuPlus, LuSquareKanban, LuUsers, LuX } from "react-icons/lu";
import { api, Enlace, fCorta, ProblemaApi, useConsulta, type S } from "../base";
import { Barra, Etiqueta, Modal, useAviso, usePortal, confirmar } from "../componentes";
import { puedeAsignar } from "../dominio/accesos";
import { claveCliente } from "../dominio/clientes-tablero";
import { NOMBRE_AREA } from "../dominio/ia-equipo";
import { bienvenidaCliente, fechaLarga } from "../dominio/correos";

const ORIGEN: Record<S<"AccesoPersona">["origen"], string> = { AM: "AM de la cuenta", RESPONSABLE: "Responsable", ASIGNADO: "Asignado" };

const ESTADO_CUENTA: Record<S<"Cliente">["estado"], string> = { ACTIVO: "Activa", PAUSADO: "En pausa", BAJA: "De baja" };

/** Quién lleva la cuenta y en qué estado está. */
export function GestionCuenta({ cliente, alGuardar }: { cliente: S<"Cliente">; alGuardar: () => void }) {
  const avisar = useAviso();
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>("/panel/equipo");
  const guardar = async (cuerpo: Record<string, unknown>, listo: string) => {
    try {
      await api(`/clientes/${cliente.id}`, { metodo: "PATCH", cuerpo });
      avisar({ titulo: listo });
      alGuardar();
    } catch (x) {
      avisar({ titulo: "No pudimos guardar el cambio", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const cambiarEstado = async (estado: S<"Cliente">["estado"]) => {
    if (estado === "BAJA" && !(await confirmar(`¿Dar de baja a ${cliente.nombre}? Sale de las listas de cuentas activas. Se puede revertir.`))) return;
    void guardar({ estado }, `${cliente.nombre}: ${ESTADO_CUENTA[estado].toLowerCase()}`);
  };
  return (
    <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
      <h3 className="tarjeta-titulo" style={{ fontSize: "var(--t-md)" }}>Gestión de la cuenta</h3>
      <label className="texto-xs" htmlFor="gc-am">Propietario comercial (quién lleva la cuenta)</label>
      <select id="gc-am" className="input" value={cliente.accountManager?.id ?? ""} onChange={(e) => void guardar({ accountManagerId: e.target.value }, "Cambiamos a quien lleva la cuenta")}>
        {!cliente.accountManager && <option value="">Sin asignar</option>}
        {cliente.accountManager && !equipo.datos?.datos.some((p) => p.id === cliente.accountManager?.id) && <option value={cliente.accountManager.id}>{cliente.accountManager.nombre}</option>}
        {(equipo.datos?.datos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <label className="texto-xs" htmlFor="gc-operativo">Responsable operativo (quién lleva el proyecto)</label>
      <select id="gc-operativo" className="input" value={cliente.responsableOperativo?.id ?? ""} onChange={(e) => void guardar({ responsableOperativoId: e.target.value || null }, e.target.value ? "Cambiamos al responsable operativo; ya está en el equipo de sus proyectos" : "Quitamos al responsable operativo")}>
        <option value="">Sin definir</option>
        {cliente.responsableOperativo && !equipo.datos?.datos.some((p) => p.id === cliente.responsableOperativo?.id) && <option value={cliente.responsableOperativo.id}>{cliente.responsableOperativo.nombre}</option>}
        {(equipo.datos?.datos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <label className="texto-xs" htmlFor="gc-estado">Estado de la cuenta</label>
      <select id="gc-estado" className="input" value={cliente.estado} onChange={(e) => cambiarEstado(e.target.value as S<"Cliente">["estado"])}>
        {(Object.keys(ESTADO_CUENTA) as S<"Cliente">["estado"][]).map((x) => <option key={x} value={x}>{ESTADO_CUENTA[x]}</option>)}
      </select>
      {/* 25 nov (Ernesto): «Responsables» y «Gestión de la cuenta» se repetían; queda una sola tarjeta. */}
      {cliente.creadoPor && <p className="texto-xs texto-muted">Creado por {cliente.creadoPor.nombre}{cliente.creadoEn ? ` el ${fCorta(cliente.creadoEn)}` : ""}.</p>}
    </section>
  );
}

/** Lo mismo, solo para leer (quien no gestiona la cuenta). */
export function ResponsablesCuenta({ cliente }: { cliente: S<"Cliente"> }) {
  return (
    <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
      <h3 className="tarjeta-titulo" style={{ fontSize: "var(--t-md)" }}>Responsables</h3>
      {([
        ["Propietario comercial", cliente.accountManager],
        ["Responsable operativo", cliente.responsableOperativo],
        ["Creado por", cliente.creadoPor],
      ] as const).map(([rotulo, persona]) => (
        <div key={rotulo} style={{ display: "grid", gap: 2 }}>
          <span className="texto-xs texto-muted">{rotulo}</span>
          <span className="negrita texto-sm">{persona?.nombre ?? "Sin definir"}</span>
        </div>
      ))}
    </section>
  );
}

/**
 * 25 nov (fusión): los proyectos del cliente son el módulo principal de su ficha. Cada proyecto es su tablero; si ya se
 * compartió, se ve el avance de su parte del cliente. Se agrega uno que ya existe (le pone este cliente) y se archiva.
 */
export function ProyectosDelCliente({ cliente, servicios, gestion, alNuevo }: {
  cliente: { id: string; nombre: string };
  servicios: S<"ServiciosCliente">["servicios"];
  gestion: boolean;
  alNuevo: () => void;
}) {
  const avisar = useAviso();
  const r = useConsulta<{ datos: S<"TableroResumen">[] }>("/tableros");
  const [agregando, setAgregando] = useState(false);
  const todos = r.datos?.datos ?? [];
  const delCliente = (t: S<"TableroResumen">) => !!t.cliente && claveCliente(t.cliente) === claveCliente(cliente.nombre);
  const suyos = todos.filter(delCliente);
  const servicioDe = (id: string | null) => (id ? servicios.find((s) => s.servicioContratadoId === id) : undefined);
  const vinculados = new Set(suyos.map((t) => t.servicioId).filter(Boolean));
  const sueltos = servicios.filter((s) => !vinculados.has(s.servicioContratadoId));
  const archivar = async (t: S<"TableroResumen">) => {
    const compartido = t.servicioId ? " El cliente lo sigue viendo en su portal: para cerrarlo para él, usa «Cerrar proyecto» en «Para el cliente»." : "";
    if (!(await confirmar(`¿Archivar «${t.nombre}»? Sale de las listas y queda en «Archivados» de Proyectos, de donde se puede desarchivar.${compartido}`, { accion: "Archivar" }))) return;
    try {
      await api(`/tableros/${t.id}/archivar`, { metodo: "POST" });
      avisar({ titulo: "Proyecto archivado" });
      void r.recargar();
    } catch (x) {
      avisar({ titulo: "No se pudo archivar", texto: x instanceof ProblemaApi ? x.titulo : undefined });
    }
  };
  return (
    <section className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 14 }} aria-label="Proyectos del cliente">
      <div className="fila entre" style={{ gap: 8, flexWrap: "wrap" }}>
        <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}><LuSquareKanban size={18} /> Proyectos</h2>
        <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="boton boton--chico" onClick={() => setAgregando(true)} disabled={!r.datos}>Agregar existente</button>
          {gestion && <button type="button" className="boton boton--chico boton--primario" onClick={alNuevo}><LuPlus size={14} /> Nuevo proyecto</button>}
        </span>
      </div>
      {r.error && <p className="texto-xs texto-muted">InooWork no respondió: por ahora no se ven los tableros.</p>}
      {r.datos && !suyos.length && !sueltos.length && <p className="texto-sm texto-muted">Todavía no tiene proyectos. Crea uno o agrega uno que ya exista.</p>}
      <div className="lista-suave">
        {suyos.map((t) => {
          const s = servicioDe(t.servicioId);
          const pct = t.items.total ? Math.round((t.items.completados / t.items.total) * 100) : 0;
          return (
            <div key={t.id} className="fila-suave fila-proyecto-cliente">
              <span style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
                <Enlace a={`/equipo/proyectos/tableros/${t.id}`} className="negrita enlace">{t.nombre}</Enlace>
                <span className="texto-xs texto-muted">
                  {[t.lider ? `Líder: ${t.lider.nombre}` : null, `${t.items.completados} de ${t.items.total} ítems`, t.items.vencidos ? `${t.items.vencidos} vencidos` : null].filter(Boolean).join(" · ")}
                </span>
                <span style={{ maxWidth: 320 }}><Barra pct={s ? s.avance.porcentaje : pct} /></span>
              </span>
              <span className="fila" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {s ? (
                  <Enlace a={`/equipo/proyectos/tableros/${t.id}?parte=cliente`} className="etiqueta etiqueta--verde" title="El cliente lo sigue en su portal">
                    El cliente lo ve · {s.avance.porcentaje} %
                  </Enlace>
                ) : <span className="etiqueta" title="El cliente no ve este proyecto">Solo el equipo</span>}
                {t.puedeEditar && <button type="button" className="boton-icono" aria-label={`Archivar ${t.nombre}`} title="Archivar" onClick={() => void archivar(t)}><LuArchive size={15} /></button>}
              </span>
            </div>
          );
        })}
        {sueltos.map((s) => (
          <div key={s.servicioContratadoId} className="fila-suave fila-proyecto-cliente">
            <span style={{ display: "grid", gap: 4, minWidth: 0, flex: 1 }}>
              <Enlace a={`/equipo/proyectos/${s.servicioContratadoId}`} className="negrita enlace">{s.titulo}</Enlace>
              <span className="texto-xs texto-muted">Servicio sin tablero · {s.avance.porcentaje} %{s.responsable ? ` · Responsable: ${s.responsable.nombre}` : ""}</span>
            </span>
            <span className="etiqueta etiqueta--ambar" title="Todavía no está dentro de un proyecto">Sin proyecto</span>
          </div>
        ))}
      </div>
      {agregando && <AgregarProyectoExistente cliente={cliente} tableros={todos} alCerrar={() => setAgregando(false)} alAgregar={() => { setAgregando(false); void r.recargar(); }} />}
    </section>
  );
}

/** Elegir un proyecto que ya existe y ponerle este cliente (25 nov: «un proyecto asignado no sale en la ficha»). */
function AgregarProyectoExistente({ cliente, tableros, alCerrar, alAgregar }: { cliente: { nombre: string }; tableros: S<"TableroResumen">[]; alCerrar: () => void; alAgregar: () => void }) {
  const avisar = useAviso();
  const [q, setQ] = useState("");
  const candidatos = tableros
    .filter((t) => t.puedeEditar && !(t.cliente && claveCliente(t.cliente) === claveCliente(cliente.nombre)))
    .filter((t) => !q.trim() || `${t.nombre} ${t.cliente ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(!!a.cliente) - Number(!!b.cliente) || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 60);
  const agregar = async (t: S<"TableroResumen">) => {
    if (t.cliente && !(await confirmar(`¿Pasar «${t.nombre}» de ${t.cliente} a ${cliente.nombre}?${t.servicioId ? " Deja de estar compartido con el cliente anterior." : ""}`, { accion: "Pasarlo" }))) return;
    try {
      await api(`/tableros/${t.id}`, { metodo: "PATCH", cuerpo: { cliente: cliente.nombre } });
      avisar({ titulo: "Proyecto agregado", texto: `«${t.nombre}» ya es de ${cliente.nombre}.` });
      alAgregar();
    } catch (x) {
      avisar({ titulo: "No se pudo agregar", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta="Agregar un proyecto existente" ancho={560}>
      <div className="pila" style={{ gap: 12 }}>
        <h2 className="modal-titulo">Agregar un proyecto a {cliente.nombre}</h2>
        <p className="texto-sm texto-muted">Primero los que no tienen cliente. Solo salen los proyectos que puedes editar.</p>
        <div className="entrada"><input aria-label="Buscar proyecto" placeholder="Buscar por nombre o cliente…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="lista-suave" style={{ maxHeight: 380, overflowY: "auto" }}>
          {candidatos.map((t) => (
            <button key={t.id} type="button" className="fila-suave fila entre boton-lista" style={{ textAlign: "left", width: "100%", border: 0, cursor: "pointer", font: "inherit" }} onClick={() => void agregar(t)}>
              <span style={{ display: "grid", gap: 2 }}>
                <span className="negrita texto-sm">{t.nombre}</span>
                <span className="texto-xs texto-muted">{t.cliente ?? "Sin cliente"}{t.lider ? ` · ${t.lider.nombre}` : ""}</span>
              </span>
              <LuPlus size={16} aria-hidden="true" />
            </button>
          ))}
          {!candidatos.length && <p className="texto-sm texto-muted">No hay proyectos para agregar{q ? " con esa búsqueda" : ""}.</p>}
        </div>
      </div>
    </Modal>
  );
}

const ROL_CLIENTE: Record<S<"Miembro">["rol"], string> = { ADMIN_CLIENTE: "Administra la cuenta", APROBADOR: "Aprueba entregables", LECTOR: "Solo lectura" };

/**
 * Quién del cliente entra al portal (5 nov 2026). El enlace de acceso es de un solo uso: sirve para el primer
 * ingreso y para quien olvidó su contraseña, y se puede mandar por WhatsApp si el correo no llega.
 */
export function AccesoDelCliente({ clienteId, nombreCliente }: { clienteId: string; nombreCliente: string }) {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: S<"Miembro">[] }>(`/clientes/${clienteId}/miembros`);
  const [agregando, setAgregando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<S<"Miembro">["rol"]>("ADMIN_CLIENTE");
  const [errores, setErrores] = useState<Record<string, string>>({});
  if (!lista.datos) return null;

  const copiarEnlace = async (m: S<"Miembro">) => {
    try {
      const r = await api<{ ruta: string; expiraEn: string }>(`/clientes/${clienteId}/miembros/${m.usuarioId}/enlace-acceso`, { metodo: "POST", cuerpo: {} });
      await navigator.clipboard.writeText(`${window.location.origin}${r.ruta}`);
      avisar({ titulo: `Enlace de ${m.nombre} copiado`, texto: `Sirve una sola vez y vence el ${fCorta(r.expiraEn)}. Pásaselo solo a esa persona.` });
    } catch (x) {
      avisar({ titulo: "No pudimos crear el enlace", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const enviarPorWhatsApp = async (m: S<"Miembro">) => {
    // Se abre antes de pedir el enlace: si no, el navegador lo trata como ventana emergente y la bloquea.
    const ventana = window.open("about:blank", "_blank");
    try {
      const r = await api<{ ruta: string; expiraEn: string }>(`/clientes/${clienteId}/miembros/${m.usuarioId}/enlace-acceso`, { metodo: "POST", cuerpo: {} });
      // 24 nov: el mismo texto que el correo de bienvenida.
      const texto = [`Hola, ${m.nombre.split(/\s+/)[0]}:`, ...bienvenidaCliente({ cliente: nombreCliente, email: m.email, rolCliente: m.rol, enlaceClave: `${window.location.origin}${r.ruta}`, venceEl: fechaLarga(r.expiraEn) }, "WHATSAPP")].join("\n\n");
      const destino = `https://wa.me/?text=${encodeURIComponent(texto)}`;
      if (ventana) ventana.location.href = destino;
      else window.location.href = destino;
    } catch (x) {
      ventana?.close();
      avisar({ titulo: "No pudimos crear el enlace", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const reenviar = async (m: S<"Miembro">) => {
    try {
      const r = await api<{ email: string }>(`/clientes/${clienteId}/miembros/${m.usuarioId}/reenviar-bienvenida`, { metodo: "POST", cuerpo: {} });
      avisar({ titulo: `Le mandamos la bienvenida a ${m.nombre}`, texto: `Llega a ${r.email} en unos minutos${m.invitacionPendiente ? ", con un enlace nuevo para crear su contraseña" : ""}.` });
    } catch (x) {
      avisar({ titulo: "No pudimos mandarla", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const cambiarRol = async (m: S<"Miembro">, rolNuevo: S<"Miembro">["rol"]) => {
    try {
      await api(`/clientes/${clienteId}/miembros/${m.usuarioId}`, { metodo: "PATCH", cuerpo: { rol: rolNuevo } });
      void lista.recargar();
    } catch (x) {
      avisar({ titulo: "No pudimos cambiar su permiso", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const quitarAcceso = async (m: S<"Miembro">) => {
    if (!(await confirmar(`¿Quitarle el acceso a ${m.nombre}? No podrá ver más esta cuenta.`))) return;
    try {
      await api(`/clientes/${clienteId}/miembros/${m.usuarioId}`, { metodo: "DELETE" });
      avisar({ titulo: `${m.nombre} ya no tiene acceso` });
      void lista.recargar();
    } catch (x) {
      avisar({ titulo: "No pudimos quitarle el acceso", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
    }
  };
  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      await api(`/clientes/${clienteId}/miembros`, { metodo: "POST", idempotente: true, cuerpo: { nombre, email, rol } });
      avisar({ titulo: `${nombre} ya tiene acceso`, texto: "Copia su enlace para que cree su contraseña." });
      setAgregando(false);
      setNombre("");
      setEmail("");
      void lista.recargar();
    } catch (x) {
      if (x instanceof ProblemaApi && x.errores.length) setErrores(Object.fromEntries(x.errores.map((y) => [y.campo, y.mensaje])));
      else avisar({ titulo: "No pudimos agregarla", texto: x instanceof ProblemaApi ? x.titulo : undefined });
    }
  };

  return (
    <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
      <div className="fila entre">
        <h3 className="tarjeta-titulo fila" style={{ fontSize: "var(--t-md)", gap: 8 }}><LuKeyRound size={15} /> Acceso del cliente al portal</h3>
        <button className="boton boton--chico" onClick={() => setAgregando((x) => !x)} aria-expanded={agregando}><LuPlus size={14} /> Agregar</button>
      </div>
      {!lista.datos.datos.length && <p className="texto-xs texto-muted">Todavía nadie del cliente tiene acceso.</p>}
      {lista.datos.datos.map((m) => (
        <div key={m.usuarioId} className="fila entre texto-sm" style={{ gap: 8, flexWrap: "wrap", paddingBottom: 10, borderBottom: "1px solid var(--c-borde)" }}>
          <span>
            <span className="negrita" style={{ display: "block" }}>{m.nombre}</span>
            <span className="texto-xs texto-muted" style={{ display: "block" }}>{m.email}</span>
            <select className="input" style={{ marginTop: 4, height: 30, fontSize: "var(--t-xs)" }} aria-label={`Permiso de ${m.nombre}`} value={m.rol} onChange={(e) => void cambiarRol(m, e.target.value as S<"Miembro">["rol"])}>
              {(Object.keys(ROL_CLIENTE) as S<"Miembro">["rol"][]).map((x) => <option key={x} value={x}>{ROL_CLIENTE[x]}</option>)}
            </select>
            {m.invitacionPendiente && <span style={{ display: "block", marginTop: 4 }}><Etiqueta tono="ambar">Todavía no entra</Etiqueta></span>}
          </span>
          <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="boton boton--chico" onClick={() => void reenviar(m)} aria-label={`Reenviar el correo de bienvenida a ${m.nombre}`}><LuMail size={13} /> Reenviar bienvenida</button>
            <button className="boton boton--chico" onClick={() => void enviarPorWhatsApp(m)} aria-label={`Enviar enlace de acceso de ${m.nombre} por WhatsApp`}><LuMessageCircle size={13} /> WhatsApp</button>
            <button className="boton boton--chico" onClick={() => void copiarEnlace(m)} aria-label={`Copiar enlace de acceso de ${m.nombre}`}><LuLink size={13} /> Copiar enlace</button>
            <button className="boton boton--chico boton--peligro" onClick={() => void quitarAcceso(m)} aria-label={`Quitarle el acceso a ${m.nombre}`}><LuX size={13} /> Quitar</button>
          </span>
        </div>
      ))}
      {agregando && (
        <form className="pila" style={{ gap: 8, borderTop: "1px solid var(--c-borde)", paddingTop: 10 }} onSubmit={agregar}>
          <label className="texto-xs" htmlFor="ac-nombre">Nombre</label>
          <input id="ac-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
          {errores.nombre && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{errores.nombre}</p>}
          <label className="texto-xs" htmlFor="ac-email">Correo</label>
          <input id="ac-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          {errores.email && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{errores.email}</p>}
          <label className="texto-xs" htmlFor="ac-rol">Permiso</label>
          <select id="ac-rol" className="input" value={rol} onChange={(e) => setRol(e.target.value as S<"Miembro">["rol"])}>
            {(Object.keys(ROL_CLIENTE) as S<"Miembro">["rol"][]).map((x) => <option key={x} value={x}>{ROL_CLIENTE[x]}</option>)}
          </select>
          <button className="boton boton--primario boton--chico">Dar acceso</button>
        </form>
      )}
    </section>
  );
}

export function EquipoAsignado({ ruta, titulo, ayuda, soloNivelCuenta }: { ruta: string; titulo: string; ayuda: string; soloNivelCuenta?: boolean }) {
  const avisar = useAviso();
  const yo = usePortal().sesion?.usuario;
  const lista = useConsulta<{ datos: S<"AccesoPersona">[]; puedeAsignar: boolean }>(ruta);
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>(lista.datos?.puedeAsignar ? "/panel/equipo" : null);
  const [eligiendo, setEligiendo] = useState(false);
  if (!lista.datos) return null;
  const ya = new Set(lista.datos.datos.map((a) => a.persona.id));
  const actor = yo ? { id: yo.id, rolEquipo: yo.rolEquipo ?? null, area: yo.area ?? null, nivelAcceso: yo.nivelAcceso ?? null, esLead: !!yo.esLead, permisos: yo.permisos ?? [] } : null;
  const candidatos = (equipo.datos?.datos ?? []).filter((p) => !ya.has(p.id) && actor && puedeAsignar(actor, { area: p.area ?? null }) && (!soloNivelCuenta || p.nivel === "CUENTA"));
  const fallo = (x: unknown) => avisar({ titulo: "No pudimos guardar el cambio", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
  const asignar = async (p: S<"PersonaEquipo">) => {
    try {
      await api(ruta, { metodo: "POST", cuerpo: { usuarioId: p.id } });
      avisar({ titulo: `${p.nombre} asignado` });
      setEligiendo(false);
      void lista.recargar();
    } catch (x) {
      fallo(x);
    }
  };
  const quitar = async (a: S<"AccesoPersona">) => {
    if (!(await confirmar(`¿Quitarle el acceso a ${a.persona.nombre}?`))) return;
    try {
      await api(`${ruta}/${a.persona.id}`, { metodo: "DELETE" });
      avisar({ titulo: `${a.persona.nombre} ya no tiene acceso` });
      void lista.recargar();
    } catch (x) {
      fallo(x);
    }
  };
  return (
    <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
      <div className="fila entre">
        <h3 className="tarjeta-titulo fila" style={{ fontSize: "var(--t-md)", gap: 8 }}><LuUsers size={15} /> {titulo}</h3>
        {lista.datos.puedeAsignar && (
          <button className="boton boton--chico" onClick={() => setEligiendo((x) => !x)} aria-expanded={eligiendo}>
            <LuPlus size={14} /> Asignar
          </button>
        )}
      </div>
      <p className="texto-xs texto-muted">{ayuda}</p>
      {lista.datos.datos.map((a) => (
        <div key={a.persona.id} className="fila entre texto-sm" style={{ gap: 8 }}>
          <span>
            <span className="negrita" style={{ display: "block" }}>{a.persona.nombre}</span>
            <span className="texto-xs texto-muted">{a.persona.area ? NOMBRE_AREA[a.persona.area] : "Sin área"}{a.persona.esLead ? " · lead" : ""}</span>
          </span>
          <span className="fila" style={{ gap: 6 }}>
            <Etiqueta tono={a.origen === "ASIGNADO" ? "gris" : "violeta"}>{ORIGEN[a.origen]}</Etiqueta>
            {a.puedeQuitar && (
              <button className="boton-icono" aria-label={`Quitar a ${a.persona.nombre}`} onClick={() => void quitar(a)}><LuX size={14} /></button>
            )}
          </span>
        </div>
      ))}
      {eligiendo && (
        <div className="pila" style={{ gap: 4, borderTop: "1px solid var(--c-borde)", paddingTop: 10 }}>
          {!equipo.datos && <span className="texto-xs texto-muted">Cargando…</span>}
          {equipo.datos && !candidatos.length && <span className="texto-xs texto-muted">No hay más gente que puedas asignar aquí.</span>}
          {candidatos.map((p) => (
            <button key={p.id} className="fila entre texto-sm boton-lista" onClick={() => void asignar(p)}>
              <span>{p.nombre}</span>
              <span className="texto-xs texto-muted">{p.area ? NOMBRE_AREA[p.area] : "Sin área"}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
