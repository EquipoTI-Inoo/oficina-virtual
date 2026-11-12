"use client";
/**
 * «Mi cuenta» del equipo (reunión del 6 nov): se abre desde las iniciales de arriba a la derecha. Perfil con la foto
 * de InooWork, a qué clientes tengo acceso, la contraseña (se cambia en InooWork), notificaciones, lo que gasté en
 * Jarvis este mes y cerrar la sesión en los demás dispositivos.
 */
import { useEffect, useState, type ReactNode } from "react";
import { LuBell, LuBot, LuBuilding2, LuExternalLink, LuKeyRound, LuLogOut, LuPlug, LuUserRound } from "react-icons/lu";
import { actualizarSesion, api, Enlace, fDiaHora, type ProblemaApi, useConsulta, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, useAviso } from "../componentes";
import { NOMBRE_AREA, type Area } from "../dominio/ia-equipo";
import { NOMBRE_NIVEL, type Nivel } from "../dominio/accesos";

export function PantallaMiCuentaEquipo() {
  return (
    <Estructura espacio="equipo" migas="Mi cuenta">
      <MiCuenta />
    </Estructura>
  );
}

const iniciales = (nombre: string) => nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const nombreArea = (a: string | null) => (a ? NOMBRE_AREA[a as Area] ?? a : null);
const usd = (n: number) => `US$ ${n.toFixed(2)}`;

function Tarjeta({ titulo, icono, children }: { titulo: string; icono: ReactNode; children: ReactNode }) {
  return (
    <section className="tarjeta" style={{ padding: "22px 20px", display: "grid", gap: 12, alignContent: "start" }} aria-label={titulo}>
      <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}>{icono}{titulo}</h2>
      {children}
    </section>
  );
}

function MiCuenta() {
  const { datos: d, error, recargar } = useConsulta<S<"MiCuentaEquipo">>("/me/cuenta");
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const p = d.perfil;
  return (
    <>
      <Cabecera titulo="Mi cuenta" bajada="Tus datos, tus accesos y tu sesión. Los datos personales y la contraseña se cambian en InooWork." />
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Tarjeta titulo="Perfil" icono={<LuUserRound size={18} />}>
          <div className="fila" style={{ gap: 14 }}>
            {p.fotoUrl ? (
              <img src={p.fotoUrl} alt={`Foto de ${p.nombre}`} width={64} height={64} style={{ borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <span className="avatar" style={{ width: 64, height: 64, fontSize: "var(--t-3xl)" }} aria-hidden>{iniciales(p.nombre)}</span>
            )}
            <span style={{ display: "grid", gap: 2 }}>
              <strong style={{ fontSize: "var(--t-xl)" }}>{p.nombre}</strong>
              {p.cargo && <span className="texto-sm">{p.cargo}</span>}
              <span className="texto-sm texto-muted">{p.email}</span>
            </span>
          </div>
          <div className="fila" style={{ gap: 6, flexWrap: "wrap" }}>
            {p.area && <Etiqueta tono="azul">{nombreArea(p.area)}</Etiqueta>}
            {p.nivelAcceso && <Etiqueta>{NOMBRE_NIVEL[p.nivelAcceso as Nivel] ?? p.nivelAcceso}</Etiqueta>}
            {p.esSuperUsuario && <Etiqueta tono="verde">Super usuario</Etiqueta>}
          </div>
          {p.areasLideradas.length > 0 && <p className="texto-sm">Lideras: {p.areasLideradas.map(nombreArea).join(", ")}</p>}
          {!p.fotoUrl && <p className="texto-xs texto-muted">Tu foto sale de tu ficha de InooWork.</p>}
        </Tarjeta>

        <Tarjeta titulo="Mis accesos" icono={<LuBuilding2 size={18} />}>
          <p className="texto-sm">
            <Enlace a="/equipo/proyectos" className="enlace">{d.proyectosACargo} {d.proyectosACargo === 1 ? "proyecto" : "proyectos"} a tu cargo</Enlace>
          </p>
          {d.accesos.length ? (
            <ul style={{ display: "grid", gap: 6, listStyle: "none", padding: 0, margin: 0, maxHeight: 260, overflow: "auto" }}>
              {d.accesos.map((a) => (
                <li key={a.clienteId} className="fila entre" style={{ gap: 8 }}>
                  <Enlace a={`/equipo/clientes/${a.clienteId}`} className="texto-sm">{a.nombre}</Enlace>
                  <Etiqueta tono={a.acceso === "COMPLETO" ? "verde" : "gris"} sinPunto>{a.acceso === "COMPLETO" ? "Toda la cuenta" : "Sus proyectos"}</Etiqueta>
                </li>
              ))}
            </ul>
          ) : (
            <p className="texto-sm texto-muted">Todavía no tienes clientes asignados.</p>
          )}
          <p className="texto-xs texto-muted">Los accesos los cambia un administrador desde Equipo.</p>
        </Tarjeta>

        <Tarjeta titulo="Jarvis este mes" icono={<LuBot size={18} />}>
          <p style={{ fontSize: "var(--t-4xl)", fontWeight: 700 }}>{usd(d.jarvis.gastoMesUsd)}</p>
          <p className="texto-sm texto-muted">
            {d.jarvis.mensajesMes} {d.jarvis.mensajesMes === 1 ? "respuesta" : "respuestas"}{d.jarvis.area ? ` · se cobra a ${nombreArea(d.jarvis.area)}` : ""}
          </p>
          <Enlace a="/equipo/jarvis" className="enlace texto-sm">Abrir Jarvis →</Enlace>
        </Tarjeta>

        <Tarjeta titulo="Contraseña y sesiones" icono={<LuKeyRound size={18} />}>
          <p className="texto-sm">Entras con tu usuario de InooWork: la contraseña es la misma y se cambia allá.</p>
          {d.cambiarClaveUrl ? (
            <a href={d.cambiarClaveUrl} target="_blank" rel="noreferrer" className="boton boton--chico" style={{ justifySelf: "start" }}>
              <LuExternalLink size={14} /> Cambiar contraseña en InooWork
            </a>
          ) : (
            <p className="texto-xs texto-muted">InooWork no está conectado en este entorno.</p>
          )}
          <CerrarSesiones ultima={d.sesionesCerradasEn} alCerrar={() => void recargar()} />
        </Tarjeta>

        <Conexiones />
        <Notificaciones />
      </div>
    </>
  );
}

function CerrarSesiones({ ultima, alCerrar }: { ultima: string | null; alCerrar: () => void }) {
  const avisar = useAviso();
  const [enviando, setEnviando] = useState(false);
  const cerrar = async () => {
    setEnviando(true);
    try {
      const r = await api<{ token: string }>("/me/sesiones/cerrar", { metodo: "POST", cuerpo: {} });
      actualizarSesion({ token: r.token });
      avisar({ titulo: "Cerramos tus otras sesiones", texto: "Aquí sigues dentro; en los demás dispositivos hay que volver a ingresar." });
      alCerrar();
    } catch (x) {
      avisar({ titulo: "No pudimos cerrarlas", texto: (x as ProblemaApi).titulo });
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div style={{ display: "grid", gap: 6, borderTop: "1px solid var(--c-borde)", paddingTop: 12 }}>
      <button type="button" className="boton boton--chico" style={{ justifySelf: "start" }} disabled={enviando} onClick={() => void cerrar()}>
        <LuLogOut size={14} /> {enviando ? "Cerrando…" : "Cerrar sesión en los demás dispositivos"}
      </button>
      <span className="texto-xs texto-muted">{ultima ? `La última vez: ${fDiaHora(ultima)}` : "Úsalo si entraste en una computadora que no es tuya."}</span>
    </div>
  );
}

function Notificaciones() {
  const { datos } = useConsulta<{ datos: S<"Notificacion">[] }>("/me/notificaciones");
  const xs = (datos?.datos ?? []).slice(0, 6);
  return (
    <Tarjeta titulo="Notificaciones recientes" icono={<LuBell size={18} />}>
      {!datos ? (
        <Cargando />
      ) : xs.length ? (
        <ul style={{ display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
          {xs.map((n) => (
            <li key={n.id} style={{ display: "grid", gap: 2 }}>
              {n.enlace ? <Enlace a={n.enlace} className="texto-sm negrita">{n.titulo}</Enlace> : <span className="texto-sm negrita">{n.titulo}</span>}
              <span className="texto-xs texto-muted">{fDiaHora(n.creadoEn)}{n.leida ? "" : " · nueva"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="texto-sm texto-muted">No tienes notificaciones.</p>
      )}
      <p className="texto-xs texto-muted">Te avisamos en la campana de arriba. Los correos salen según lo que configure cada proyecto.</p>
    </Tarjeta>
  );
}

/**
 * Conexiones (9 nov): cada persona conecta su propia cuenta para que sus bots la usen en sus chats. «Conectar» lleva
 * al servicio (Google), donde la persona autoriza, y vuelve aquí con ?conexion=ok. Nadie copia llaves.
 */
function Conexiones() {
  const { datos, recargar } = useConsulta<{ datos: S<"ConexionPersonal">[] }>("/me/conexiones");
  const avisar = useAviso();
  const [ocupado, setOcupado] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("conexion");
    if (!r) return;
    avisar(r === "ok" ? { titulo: "Cuenta conectada", texto: "Tus bots ya pueden usarla en tus chats." } : { titulo: "No se conectó", texto: q.get("motivo") ?? undefined });
    window.history.replaceState(null, "", window.location.pathname);
  }, [avisar]);
  const conectar = async (c: S<"ConexionPersonal">) => {
    setOcupado(c.proveedor);
    try {
      const r = await api<{ url: string }>(`/me/conexiones/${c.proveedor}`, { metodo: "POST", cuerpo: {} });
      window.location.assign(r.url);
    } catch (x) {
      avisar({ titulo: "No se pudo conectar", texto: (x as ProblemaApi).detalle ?? (x as ProblemaApi).titulo });
      setOcupado(null);
    }
  };
  const desconectar = async (c: S<"ConexionPersonal">) => {
    if (!window.confirm(`¿Desconectar ${c.nombre}? Tus bots dejan de poder usarlo.`)) return;
    setOcupado(c.proveedor);
    try {
      await api(`/me/conexiones/${c.proveedor}`, { metodo: "DELETE" });
      avisar({ titulo: `${c.nombre} desconectado` });
      void recargar();
    } catch (x) {
      avisar({ titulo: "No se pudo desconectar", texto: (x as ProblemaApi).titulo });
    } finally {
      setOcupado(null);
    }
  };
  return (
    <Tarjeta titulo="Conexiones" icono={<LuPlug size={18} />}>
      <p className="texto-sm">Conecta tus cuentas para que tus bots de Jarvis las usen cuando se lo pidas. Solo en tus chats y con lo que tú puedes ver.</p>
      {!datos ? <Cargando /> : (
        <ul style={{ display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
          {datos.datos.map((c) => (
            <li key={c.proveedor} style={{ display: "grid", gap: 4 }}>
              <span className="fila entre" style={{ gap: 8 }}>
                <span className="texto-sm negrita">{c.nombre}</span>
                {c.conectada ? (
                  <button className="boton boton--chico" disabled={ocupado === c.proveedor} onClick={() => void desconectar(c)}>Desconectar</button>
                ) : (
                  <button className="boton boton--chico boton--primario" disabled={!c.disponible || ocupado === c.proveedor} onClick={() => void conectar(c)}>
                    {ocupado === c.proveedor ? "Abriendo…" : "Conectar"}
                  </button>
                )}
              </span>
              <span className="texto-xs texto-muted">
                {c.conectada ? `Conectado${c.cuenta ? ` con ${c.cuenta}` : ""}${c.ultimoUso ? ` · último uso ${fDiaHora(c.ultimoUso)}` : ""}` : c.disponible ? c.descripcion : "Todavía no disponible: falta que TI lo active."}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
