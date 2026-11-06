"use client";
/**
 * Accesos del equipo (2 nov 2026): quién trabaja en una cuenta o un proyecto, y asignar o quitar gente.
 * Asigna el nivel ADMIN a cualquiera o un lead a la gente de su área (las mismas reglas de la API).
 */
import { useState, type FormEvent } from "react";
import { LuKeyRound, LuLink, LuMessageCircle, LuPlus, LuSquareKanban, LuUsers, LuX } from "react-icons/lu";
import { api, Enlace, fCorta, ProblemaApi, useConsulta, type S } from "../base";
import { Etiqueta, useAviso, usePortal } from "../componentes";
import { puedeAsignar } from "../dominio/accesos";
import { mismoCliente } from "../dominio/tableros";
import { NOMBRE_AREA } from "../dominio/ia-equipo";

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
  const cambiarEstado = (estado: S<"Cliente">["estado"]) => {
    if (estado === "BAJA" && !window.confirm(`¿Dar de baja a ${cliente.nombre}? Sale de las listas de cuentas activas. Se puede revertir.`)) return;
    void guardar({ estado }, `${cliente.nombre}: ${ESTADO_CUENTA[estado].toLowerCase()}`);
  };
  return (
    <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
      <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Gestión de la cuenta</h3>
      <label className="texto-xs" htmlFor="gc-am">Quién lleva la cuenta</label>
      <select id="gc-am" className="input" value={cliente.accountManager?.id ?? ""} onChange={(e) => void guardar({ accountManagerId: e.target.value }, "Cambiamos a quien lleva la cuenta")}>
        {!cliente.accountManager && <option value="">Sin asignar</option>}
        {cliente.accountManager && !equipo.datos?.datos.some((p) => p.id === cliente.accountManager?.id) && <option value={cliente.accountManager.id}>{cliente.accountManager.nombre}</option>}
        {(equipo.datos?.datos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      <label className="texto-xs" htmlFor="gc-estado">Estado de la cuenta</label>
      <select id="gc-estado" className="input" value={cliente.estado} onChange={(e) => cambiarEstado(e.target.value as S<"Cliente">["estado"])}>
        {(Object.keys(ESTADO_CUENTA) as S<"Cliente">["estado"][]).map((x) => <option key={x} value={x}>{ESTADO_CUENTA[x]}</option>)}
      </select>
    </section>
  );
}

/** Los tableros de InooWork de este cliente, según el nombre que tienen allá. */
export function TablerosDelCliente({ nombre }: { nombre: string }) {
  const r = useConsulta<{ datos: S<"TableroResumen">[] }>("/tableros");
  const suyos = (r.datos?.datos ?? []).filter((t) => mismoCliente(t.cliente, nombre));
  if (!suyos.length) return null;
  return (
    <section className="tarjeta" style={{ padding: "18px 16px", display: "grid", gap: 10 }}>
      <h3 className="tarjeta-titulo fila" style={{ fontSize: 14.5, gap: 8 }}><LuSquareKanban size={15} /> Tableros de InooWork</h3>
      {suyos.map((t) => (
        <Enlace key={t.id} a={`/equipo/proyectos/tableros/${t.id}`} className="fila entre texto-sm boton-lista">
          <span className="negrita">{t.nombre}</span>
          <span className="texto-xs texto-muted">{t.items.completados} de {t.items.total}{t.items.vencidos ? ` · ${t.items.vencidos} vencidos` : ""}</span>
        </Enlace>
      ))}
    </section>
  );
}

const ROL_CLIENTE: Record<S<"Miembro">["rol"], string> = { ADMIN_CLIENTE: "Administra la cuenta", APROBADOR: "Aprueba entregables", LECTOR: "Solo lectura" };

/**
 * Quién del cliente entra al portal (5 nov 2026). El enlace de acceso es de un solo uso: sirve para el primer
 * ingreso y para quien olvidó su contraseña, y se puede mandar por WhatsApp si el correo no llega.
 */
export function AccesoDelCliente({ clienteId }: { clienteId: string }) {
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
      const texto = `Hola, ${m.nombre.split(/\s+/)[0]}: ya tienes acceso al portal de Inoo. Crea tu contraseña con este enlace personal, que sirve una sola vez y vence el ${fCorta(r.expiraEn)}: ${window.location.origin}${r.ruta}`;
      const destino = `https://wa.me/?text=${encodeURIComponent(texto)}`;
      if (ventana) ventana.location.href = destino;
      else window.location.href = destino;
    } catch (x) {
      ventana?.close();
      avisar({ titulo: "No pudimos crear el enlace", texto: x instanceof ProblemaApi ? x.errores[0]?.mensaje ?? x.titulo : undefined });
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
    if (!window.confirm(`¿Quitarle el acceso a ${m.nombre}? No podrá ver más esta cuenta.`)) return;
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
        <h3 className="tarjeta-titulo fila" style={{ fontSize: 14.5, gap: 8 }}><LuKeyRound size={15} /> Acceso del cliente al portal</h3>
        <button className="boton boton--chico" onClick={() => setAgregando((x) => !x)} aria-expanded={agregando}><LuPlus size={14} /> Agregar</button>
      </div>
      {!lista.datos.datos.length && <p className="texto-xs texto-muted">Todavía nadie del cliente tiene acceso.</p>}
      {lista.datos.datos.map((m) => (
        <div key={m.usuarioId} className="fila entre texto-sm" style={{ gap: 8, flexWrap: "wrap" }}>
          <span>
            <span className="negrita" style={{ display: "block" }}>{m.nombre}</span>
            <span className="texto-xs texto-muted" style={{ display: "block" }}>{m.email}</span>
            <select className="input" style={{ marginTop: 4, height: 30, fontSize: 12 }} aria-label={`Permiso de ${m.nombre}`} value={m.rol} onChange={(e) => void cambiarRol(m, e.target.value as S<"Miembro">["rol"])}>
              {(Object.keys(ROL_CLIENTE) as S<"Miembro">["rol"][]).map((x) => <option key={x} value={x}>{ROL_CLIENTE[x]}</option>)}
            </select>
            {m.invitacionPendiente && <span style={{ display: "block", marginTop: 4 }}><Etiqueta tono="ambar">Todavía no entra</Etiqueta></span>}
          </span>
          <span className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="boton boton--chico" onClick={() => void enviarPorWhatsApp(m)} aria-label={`Enviar enlace de acceso de ${m.nombre} por WhatsApp`}><LuMessageCircle size={13} /> WhatsApp</button>
            <button className="boton boton--chico" onClick={() => void copiarEnlace(m)} aria-label={`Copiar enlace de acceso de ${m.nombre}`}><LuLink size={13} /> Copiar enlace</button>
            <button className="boton-icono" onClick={() => void quitarAcceso(m)} aria-label={`Quitarle el acceso a ${m.nombre}`}><LuX size={14} /></button>
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
        <h3 className="tarjeta-titulo fila" style={{ fontSize: 14.5, gap: 8 }}><LuUsers size={15} /> {titulo}</h3>
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
