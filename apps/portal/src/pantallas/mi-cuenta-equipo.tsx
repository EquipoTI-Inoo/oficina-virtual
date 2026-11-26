"use client";
/**
 * «Mi cuenta» del equipo (reunión del 6 nov): se abre desde las iniciales de arriba a la derecha. Perfil con la foto
 * de InooWork, a qué clientes tengo acceso, la contraseña (se cambia en InooWork), notificaciones, lo que gasté en
 * Jarvis este mes y cerrar la sesión en los demás dispositivos.
 */
import { SeccionDosPasos } from "./dos-pasos";
import { useEffect, useState, type ReactNode } from "react";
import { LuBell, LuBot, LuBuilding2, LuExternalLink, LuKeyRound, LuLogOut, LuPlug, LuUserRound } from "react-icons/lu";
import { actualizarSesion, api, Enlace, fDiaHora, type ProblemaApi, useConsulta, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, useAviso, confirmar } from "../componentes";
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
          <Enlace a="/equipo/jarvis" className="enlace texto-sm">Abrir Jarvis</Enlace>
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

        <SeccionDosPasos />
        <JarvisDesdeChrome />
        <ConectarUnaIa />

        <Conexiones />
        <Notificaciones />
      </div>
    </>
  );
}

/**
 * Jarvis en Chrome. 16 nov: mandar la página a Jarvis. 18 nov (Ernesto: «que actually pueda controlar mi
 * navegador»): la extensión vive en el panel lateral y Jarvis usa la pestaña que le prestas, con los permisos que
 * elijas ahí (como Claude in Chrome). Aquí se instala, se vincula con un código y se desvincula; un super usuario
 * pone los sitios que el equipo no puede usar con Jarvis (o los únicos que sí).
 */
type ChromeVinculado = { id: string; nombre: string; modo: "MANUAL" | "AUTO" | "SIN"; creadoEn: string; ultimoUso: string | null; conectado: boolean };
type MiNavegador = { vinculos: ChromeVinculado[]; reglas: { dominio: string; regla: "PERMITIR" | "BLOQUEAR" }[]; siemprePide: string[]; prohibido: string[]; puedeEditarReglas: boolean };
const NOMBRE_MODO = { MANUAL: "Aprueba cada acción", AUTO: "Aprueba automáticamente", SIN: "Sin aprobaciones" } as const;

export function JarvisDesdeChrome() {
  const avisar = useAviso();
  const r = useConsulta<MiNavegador>("/me/navegador");
  const [codigo, setCodigo] = useState<{ codigo: string; venceEn: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dominio, setDominio] = useState("");
  const [regla, setRegla] = useState<"BLOQUEAR" | "PERMITIR">("BLOQUEAR");
  const { recargar } = r;
  useEffect(() => {
    // Mientras se vincula, mirar cada pocos segundos para mostrarlo apenas aparezca.
    if (!codigo) return;
    const t = setInterval(() => void recargar(), 4000);
    return () => clearInterval(t);
  }, [codigo, recargar]);

  const hacer = async (clave: string, f: () => Promise<unknown>, error: string) => {
    setOcupado(clave);
    try {
      await f();
      await recargar();
    } catch (x) {
      avisar({ titulo: error, texto: (x as ProblemaApi).detalle ?? (x as ProblemaApi).titulo });
    } finally {
      setOcupado(null);
    }
  };
  const generar = () => hacer("codigo", async () => setCodigo(await api<{ codigo: string; venceEn: string }>("/me/navegador/codigo", { metodo: "POST", cuerpo: {} })), "No se pudo generar el código");
  const desvincular = (v: ChromeVinculado) => hacer(v.id, () => api(`/me/navegador/vinculos/${v.id}`, { metodo: "DELETE" }), "No se pudo desvincular");
  const ponerRegla = () => hacer("regla", async () => {
    await api("/me/navegador/reglas", { metodo: "PUT", cuerpo: { dominio, regla } });
    setDominio("");
  }, "No se guardó la regla");
  const quitarRegla = (d: string) => hacer(`regla-${d}`, () => api(`/me/navegador/reglas/${encodeURIComponent(d)}`, { metodo: "DELETE" }), "No se quitó la regla");

  const d = r.datos;
  const vinculados = d?.vinculos ?? [];
  return (
    <Tarjeta titulo="Jarvis en Chrome" icono={<LuBot size={18} />}>
      <p className="texto-sm">
        Jarvis trabaja en tu Chrome: mira la pestaña que estás viendo, cambia de pestaña, abre páginas, hace clic y llena campos, siempre con los permisos que tú eliges en el panel de la extensión. Desde cualquier chat (aquí o en el panel) le dices «toma el control de mi navegador». Solo funciona mientras tienes ese panel abierto.
      </p>
      <ol className="texto-sm" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        <li><a href="/descargas/jarvis-chrome.zip" download className="enlace">Descarga la extensión</a> y descomprímela.</li>
        <li>En Chrome abre <code>chrome://extensions</code>, prende el «Modo de desarrollador» y usa «Cargar descomprimida» con la carpeta <code>jarvis-chrome</code>. Si ya la tenías, reemplaza la carpeta y toca «Actualizar».</li>
        <li>Toca el ícono de Jarvis en la barra: se abre el panel lateral.</li>
        <li>Genera un código aquí y escríbelo en el panel.</li>
      </ol>

      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="boton boton--primario boton--chico" onClick={() => void generar()} disabled={ocupado === "codigo"}>
          {codigo ? "Generar otro código" : "Generar código"}
        </button>
        {codigo && (
          <span className="texto-sm" aria-live="polite">
            <strong style={{ fontSize: "var(--t-lg)", letterSpacing: 2, fontFamily: "ui-monospace, monospace" }}>{codigo.codigo}</strong>
            <span className="texto-xs texto-muted"> · sirve una vez, hasta las {new Date(codigo.venceEn).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}</span>
          </span>
        )}
      </div>

      {r.error ? <ErrorCarga error={r.error} reintentar={() => void recargar()} /> : !d ? <p className="texto-xs texto-muted">Cargando…</p> : (
        <>
          <div className="pila" style={{ gap: 6 }}>
            <h3 className="texto-sm" style={{ margin: 0, fontWeight: 600 }}>Tus Chrome vinculados</h3>
            {!vinculados.length && <p className="texto-xs texto-muted" style={{ margin: 0 }}>Todavía ninguno.</p>}
            {vinculados.map((v) => (
              <div key={v.id} className="fila" style={{ gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                <span className="texto-sm">
                  {v.nombre} <Etiqueta tono={v.conectado ? "verde" : "gris"}>{v.conectado ? "Panel abierto" : "Panel cerrado"}</Etiqueta>
                  <span className="texto-xs texto-muted"> · {NOMBRE_MODO[v.modo]}{v.ultimoUso ? ` · última vez ${fDiaHora(v.ultimoUso)}` : ""}</span>
                </span>
                <button type="button" className="boton boton--chico" onClick={() => void desvincular(v)} disabled={ocupado === v.id}>Desvincular</button>
              </div>
            ))}
            {codigo && vinculados.some((v) => v.conectado) && <p className="texto-xs" style={{ margin: 0 }}>Listo: tu Chrome ya está conectado.</p>}
          </div>

          <details className="texto-sm">
            <summary style={{ cursor: "pointer" }}>Qué pregunta siempre y qué nunca hace</summary>
            <p className="texto-xs" style={{ margin: "8px 0 2px", fontWeight: 600 }}>Siempre te pregunta antes de:</p>
            <ul className="texto-xs" style={{ margin: 0, paddingLeft: 18 }}>{d.siemprePide.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="texto-xs" style={{ margin: "8px 0 2px", fontWeight: 600 }}>Nunca, aunque le des permiso:</p>
            <ul className="texto-xs" style={{ margin: 0, paddingLeft: 18 }}>{d.prohibido.map((x) => <li key={x}>{x}</li>)}</ul>
          </details>

          {(d.puedeEditarReglas || d.reglas.length > 0) && (
            <div className="pila" style={{ gap: 6 }}>
              <h3 className="texto-sm" style={{ margin: 0, fontWeight: 600 }}>Sitios del equipo</h3>
              <p className="texto-xs texto-muted" style={{ margin: 0 }}>
                Bloqueado: Jarvis no lo usa nunca. Si hay sitios «solo estos», Jarvis no usa ningún otro.
              </p>
              {d.reglas.map((x) => (
                <div key={x.dominio} className="fila" style={{ gap: 8 }}>
                  <span className="texto-sm">{x.dominio}</span>
                  <Etiqueta tono={x.regla === "BLOQUEAR" ? "rojo" : "verde"}>{x.regla === "BLOQUEAR" ? "Bloqueado" : "Solo estos"}</Etiqueta>
                  {d.puedeEditarReglas && (
                    <button type="button" className="boton boton--chico" onClick={() => void quitarRegla(x.dominio)} disabled={ocupado === `regla-${x.dominio}`}>Quitar</button>
                  )}
                </div>
              ))}
              {d.puedeEditarReglas && (
                <form className="fila" style={{ gap: 6, flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); if (dominio.trim()) void ponerRegla(); }}>
                  <input className="input" value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="ejemplo.com" aria-label="Sitio" style={{ flex: 1, minWidth: 140 }} />
                  <select className="input" value={regla} onChange={(e) => setRegla(e.target.value as "BLOQUEAR" | "PERMITIR")} aria-label="Regla" style={{ width: "auto" }}>
                    <option value="BLOQUEAR">Bloquear</option>
                    <option value="PERMITIR">Solo estos</option>
                  </select>
                  <button type="submit" className="boton boton--chico" disabled={ocupado === "regla" || !dominio.trim()}>Agregar</button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </Tarjeta>
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
export function Conexiones() {
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
    if (!(await confirmar(`¿Desconectar ${c.nombre}? Tus bots dejan de poder usarlo.`))) return;
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

/**
 * 26 nov (pedido de Alonso): conectar Claude, Grok u otra IA al portal con el MCP remoto. Cada persona lo agrega como
 * conector personalizado y entra con su cuenta (OAuth): la IA ve y cambia lo mismo que ella.
 */
function ConectarUnaIa() {
  const avisar = useAviso();
  const url = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;
  return (
    <Tarjeta titulo="Conectar Claude, Grok u otra IA" icono={<LuPlug size={18} />}>
      <p className="texto-sm">
        La IA trabaja en el portal <strong>como tú</strong>: ve tus proyectos, clientes y pendientes, y puede crear, cambiar y comentar filas de los
        tableros donde tú puedes. Te pregunta antes de cada cambio.
      </p>
      <div className="fila" style={{ gap: 6 }}>
        <input className="input" readOnly aria-label="Dirección del MCP del portal" value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, minWidth: 0 }} />
        <button type="button" className="boton boton--chico" onClick={() => void navigator.clipboard.writeText(url).then(() => avisar({ titulo: "Dirección copiada" }))}>Copiar</button>
      </div>
      <ol className="texto-sm" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        <li><strong>Claude</strong> (claude.ai o la app): Ajustes → Conectores → Agregar conector personalizado, y pega la dirección.</li>
        <li><strong>Grok</strong> u otra IA que acepte MCP remotos: agrega un servidor MCP con esa dirección.</li>
        <li>Se abre el portal: revisa qué aplicación es y toca «Permitir».</li>
      </ol>
      <p className="texto-xs texto-muted">Para desconectarlas todas, usa «Cerrar sesión en los demás dispositivos» (arriba).</p>
    </Tarjeta>
  );
}
