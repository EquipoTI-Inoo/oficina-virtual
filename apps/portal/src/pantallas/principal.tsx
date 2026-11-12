"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  LuArrowRight, LuCheck, LuChevronDown, LuChevronLeft, LuChevronRight,
  LuCircleCheck, LuDownload, LuEyeOff, LuEye, LuInfo, LuLayers, LuMail, LuMessageSquare,
  LuClipboardList, LuExternalLink, LuSearch, LuShieldCheck, LuSparkles, LuWallet,
  LuLifeBuoy,
} from "react-icons/lu";
import {
  api, clienteActivo, Enlace, fCorta, fDiaHora, fDiaMes, fHoyLargo, guardarSesion, HOY_PORTAL, leerSesion, ProblemaApi,
  useConsulta, useNavegacion, type S, fMesAnio, nombreMes, PERIODO_PORTAL, rolCliente } from "../base";
import {
  Aviso, Barra, Cabecera, Cargando, detalleServicio, ErrorCarga, ESTADO_PIEZA, ESTADO_PIEZA_CLIENTE, Estructura, Etiqueta, EtiquetaEstado, EtiquetaPieza, ICONO_SERVICIO, Miniatura, Modal,
  TarjetaPieza, useAviso, usePortal,
  ModalPedirCambios,
} from "../componentes";
import { AvisosInicio } from "./avisos";
import { DocumentosPorRevisar, FilaEntregable, rutaDetalle } from "./entregables";
import { AvanceOConsumo } from "./consumo";
import { esPorConsumo } from "../dominio/consumo";
import { ETIQUETA_ESTADO_SERVICIO } from "../dominio/equipo";

type PiezaUI = S<"PiezaResumen"> & { formato?: string; diseno?: { fondo?: string; titular?: string; bajada?: string; eyebrow?: string; foto?: boolean } };

// ═════════════════════════════════════════════ Ingreso

export function PantallaIngreso() {
  const { ir } = useNavegacion();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Pasos además del ingreso (Cognito): contraseña nueva del invitado y «¿Olvidaste tu contraseña?».
  const [modo, setModo] = useState<ModoIngreso>("INGRESAR");
  const [desafio, setDesafio] = useState<{ sesion: string; pool: "CLIENTES" | "EQUIPO" } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    // Desde «Portal de Inoo» en InooWork (6 nov): llega un pase de un solo uso y se entra sin escribir nada.
    const busqueda = new URLSearchParams(window.location.search);
    const pase = busqueda.get("inoowork");
    // Desde InooWork sin pase: se dice por qué, para poder arreglarlo (6 nov).
    if (!pase && busqueda.get("desde") === "inoowork") {
      const motivo = busqueda.get("motivo") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
      setError(motivo === "sin_sesion" ? "InooWork no tiene tu sesión guardada: cierra sesión allá, vuelve a entrar y prueba de nuevo. Mientras, ingresa aquí."
        : motivo === "red" ? "No pudimos hablar con InooWork para pasarte directo. Ingresa con tu usuario."
        : `InooWork no entregó el acceso directo (código ${motivo || "desconocido"}). Ingresa con tu usuario y avísale a TI.`);
    }
    if (pase) {
      window.history.replaceState(null, "", window.location.pathname);
      setEnviando(true);
      api<S<"SesionIniciada">>("/sesion/desde-inoowork", { metodo: "POST", cuerpo: { pase } })
        .then((r) => {
          guardarSesion({ token: r.token, tipo: r.tipo, clienteId: r.clienteId, refreshToken: null, pool: r.pool }, false);
          ir("/equipo/mi-panel");
        })
        .catch((err: ProblemaApi) => setError(`${err.titulo}.${err.detalle ? ` ${err.detalle}` : ""}`))
        .finally(() => setEnviando(false));
      return;
    }
    const s = leerSesion();
    if (s) ir(s.tipo === "EQUIPO" ? "/equipo/mi-panel" : "/inicio");
  }, [ir]);

  const entrar = (r: S<"SesionIniciada">) => {
    guardarSesion({ token: r.token, tipo: r.tipo, clienteId: r.clienteId, refreshToken: r.refreshToken ?? null, pool: r.pool }, recordar);
    ir(r.cuentaPruebas ? "/pruebas" : r.tipo === "EQUIPO" ? "/equipo/mi-panel" : "/inicio");
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      const r = await api<S<"SesionIniciada"> | S<"DesafioNuevaClave">>("/sesion/ingresar", { metodo: "POST", cuerpo: { email, clave } });
      if ("desafio" in r) {
        setDesafio({ sesion: r.sesion, pool: r.pool });
        setModo("NUEVA_CLAVE");
      } else entrar(r);
    } catch (err) {
      setError((err as ProblemaApi).titulo);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ingreso">
      <section className="ingreso-izq">
        <div>
          <span className="logo"><img src="/marca/inoo.jpg" alt="" className="logo-marca" width={34} height={34} />inoo</span>
          <span className="logo-sub">Portal de clientes</span>
        </div>
        <div style={{ marginTop: 64 }}>
          <div className="antetitulo">Tu marca, siempre cerca</div>
          <h1>
            Un mismo espacio.
            <br />
            Todo lo que creamos.
          </h1>
          <p className="bajada" style={{ fontSize: "var(--t-lg)", marginTop: 24, maxWidth: 590, lineHeight: 1.6 }}>
            Revisa tus contenidos, acompaña cada proyecto y descubre cómo crece tu marca con Inoo.
          </p>
        </div>
        <div className="tarjeta" style={{ marginTop: 56, maxWidth: 596, padding: 32, borderRadius: 24 }}>
          <div className="fila entre">
            <span className="icono-caja" style={{ width: 48, height: 48 }}>
              <LuSparkles size={22} />
            </span>
            <Etiqueta tono="verde">Creando juntos</Etiqueta>
          </div>
          <p style={{ fontSize: "var(--t-2xl)", fontWeight: 600, lineHeight: 1.6, marginTop: 20 }}>
            Ideas que avanzan.
            <br />
            Una marca que conecta.
          </p>
          <div style={{ marginTop: 22 }}>
            <Barra pct={72} />
          </div>
          <div className="grid-3" style={{ marginTop: 16, fontSize: "var(--t-xs)", color: "var(--c-muted)" }}>
            {["Comparte", "Revisa", "Crece"].map((t) => (
              <span key={t} style={{ display: "grid", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--c-primario)" }} />
                {t}
              </span>
            ))}
          </div>
        </div>
        <p className="texto-xs texto-muted" style={{ marginTop: "auto", paddingTop: 48 }}>
          Marketing digital hecho en Perú. Pensado para tu marca.
        </p>
      </section>

      <section className="ingreso-der">
        <p className="texto-xs texto-muted" style={{ textAlign: "right", textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 74, width: "min(480px, 100%)" }}>
          Portal de clientes
        </p>
        {modo !== "INGRESAR" ? (
          <FormularioClave
            modo={modo}
            email={email}
            setEmail={setEmail}
            desafio={desafio}
            alEntrar={entrar}
            alTerminar={(texto) => {
              setModo("INGRESAR");
              setClave("");
              setAviso(texto);
            }}
            alCambiarModo={setModo}
          />
        ) : (
        <form className="ingreso-form" onSubmit={enviar} noValidate>
          <div>
            <h2 style={{ fontSize: "var(--t-5xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>Qué bueno tenerte aquí.</h2>
            <p className="texto-muted" style={{ marginTop: 12, fontSize: "var(--t-base)" }}>
              Ingresa a tu cuenta para seguir creando con tu equipo Inoo.
            </p>
          </div>
          <div className="campo">
            <label htmlFor="email">Correo electrónico o usuario</label>
            <div className="entrada">
              {/* 2 nov: el equipo de Inoo también entra con su usuario de InooWork. */}
              <input id="email" type="text" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="tu@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <span className="icono-campo">
                <LuMail size={18} />
              </span>
            </div>
          </div>
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <div className="entrada">
              <input id="clave" type={ver ? "text" : "password"} autoComplete="current-password" placeholder="Ingresa tu contraseña" value={clave} onChange={(e) => setClave(e.target.value)} required />
              <button type="button" className="icono-campo" aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVer(!ver)}>
                {ver ? <LuEye size={18} /> : <LuEyeOff size={18} />}
              </button>
            </div>
          </div>
          <div className="fila" style={{ gap: 16 }}>
            <label className="casilla">
              <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} /> Recordar mi sesión
            </label>
            <a className="enlace" href="#olvide" onClick={(e) => { e.preventDefault(); setError(null); setModo("OLVIDE"); }}>
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          {aviso && (
            <p role="status" className="texto-sm" style={{ color: "var(--c-exito)" }}>
              {aviso}
            </p>
          )}
          {error && (
            <p role="alert" className="texto-sm" style={{ color: "var(--c-alerta)" }}>
              {error}
            </p>
          )}
          <button className="boton boton--primario boton--bloque" disabled={enviando} style={{ height: 40, borderRadius: 10 }}>
            <LuArrowRight size={16} /> {enviando ? "Ingresando…" : "Ingresar al portal"}
          </button>
          <p className="fila texto-xs texto-muted" style={{ gap: 8 }}>
            <LuShieldCheck size={14} /> Acceso privado a los contenidos y proyectos de tu empresa.
          </p>
        </form>
        )}
        <div style={{ width: "min(480px, 100%)", textAlign: "center", marginTop: 72, display: "grid", gap: 10 }}>
          <span className="texto-sm texto-muted">¿Aún no tienes acceso?</span>
          <a className="enlace" style={{ justifyContent: "center" }} href="mailto:hola@inoo.pe">
            Contactar a mi equipo Inoo →
          </a>
          <span className="texto-xs texto-muted">© 2026 Inoo · Privacidad y términos</span>
        </div>
      </section>
    </div>
  );
}

type ModoIngreso = "INGRESAR" | "NUEVA_CLAVE" | "OLVIDE" | "RESTABLECER";

/** Contraseña nueva del invitado (primer ingreso con Cognito) y restablecer con el código del correo. */
function FormularioClave({ modo, email, setEmail, desafio, alEntrar, alTerminar, alCambiarModo }: {
  modo: Exclude<ModoIngreso, "INGRESAR">;
  email: string;
  setEmail: (v: string) => void;
  desafio: { sesion: string; pool: "CLIENTES" | "EQUIPO" } | null;
  alEntrar: (r: S<"SesionIniciada">) => void;
  alTerminar: (aviso: string) => void;
  alCambiarModo: (m: ModoIngreso) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pideClave = modo !== "OLVIDE";
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pideClave && clave !== repetir) return setError("Las contraseñas no coinciden");
    setEnviando(true);
    try {
      if (modo === "NUEVA_CLAVE") alEntrar(await api<S<"SesionIniciada">>("/sesion/nueva-clave", { metodo: "POST", cuerpo: { email, sesion: desafio?.sesion, pool: desafio?.pool, clave } }));
      else if (modo === "OLVIDE") {
        const r = await api<{ metodo?: string } | undefined>("/sesion/olvide-clave", { metodo: "POST", cuerpo: { email } });
        if (r?.metodo === "ENLACE") alTerminar("Si ese correo tiene acceso al portal, te mandamos un enlace para crear tu contraseña. Si no te llega, pídeselo a tu equipo Inoo.");
        else alCambiarModo("RESTABLECER");
      } else {
        await api("/sesion/restablecer", { metodo: "POST", cuerpo: { email, codigo, clave } });
        alTerminar("Listo: ya puedes ingresar con tu contraseña nueva.");
      }
    } catch (err) {
      const p = err as ProblemaApi;
      setError(p.errores?.[0]?.mensaje ?? p.titulo);
    } finally {
      setEnviando(false);
    }
  };
  const titulo = { NUEVA_CLAVE: "Crea tu contraseña", OLVIDE: "Restablece tu contraseña", RESTABLECER: "Revisa tu correo" }[modo];
  const bajada = {
    NUEVA_CLAVE: "Es tu primer ingreso: elige la contraseña con la que vas a entrar desde ahora.",
    OLVIDE: "Te mandamos un código a tu correo para crear una contraseña nueva.",
    RESTABLECER: `Si ${email || "el correo"} tiene acceso al portal, te llegó un código. Escríbelo junto con tu contraseña nueva.`,
  }[modo];
  return (
    <form className="ingreso-form" onSubmit={enviar} noValidate>
      <div>
        <h2 style={{ fontSize: "var(--t-4xl)", fontWeight: 700, letterSpacing: "-0.02em" }}>{titulo}</h2>
        <p className="texto-muted" style={{ marginTop: 12, fontSize: "var(--t-base)" }}>{bajada}</p>
      </div>
      {modo === "OLVIDE" && (
        <div className="campo">
          <label htmlFor="email-olvide">Correo electrónico</label>
          <div className="entrada">
            <input id="email-olvide" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        </div>
      )}
      {modo === "RESTABLECER" && (
        <div className="campo">
          <label htmlFor="codigo">Código</label>
          <div className="entrada">
            <input id="codigo" inputMode="numeric" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
          </div>
        </div>
      )}
      {pideClave && (
        <>
          <div className="campo">
            <label htmlFor="clave-nueva">Contraseña nueva</label>
            <div className="entrada">
              <input id="clave-nueva" type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
            </div>
            <span className="ayuda-campo">Al menos 8 caracteres, con mayúsculas, minúsculas y números.</span>
          </div>
          <div className="campo">
            <label htmlFor="clave-repetir">Repite la contraseña</label>
            <div className="entrada">
              <input id="clave-repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
            </div>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="texto-sm" style={{ color: "var(--c-alerta)" }}>
          {error}
        </p>
      )}
      <button className="boton boton--primario boton--bloque" disabled={enviando} style={{ height: 40, borderRadius: 10 }}>
        <LuArrowRight size={16} /> {enviando ? "Un momento…" : modo === "OLVIDE" ? "Enviar el código" : modo === "NUEVA_CLAVE" ? "Guardar y entrar" : "Cambiar la contraseña"}
      </button>
      <button type="button" className="enlace" style={{ justifySelf: "center" }} onClick={() => alCambiarModo("INGRESAR")}>
        ← Volver al ingreso
      </button>
    </form>
  );
}

// ═════════════════════════════════════════════ Inicio

export function PantallaInicio() {
  return (
    <Estructura espacio="cliente" migas="Inicio">
      <Inicio />
    </Estructura>
  );
}

/**
 * Inicio = «Tu cuenta» (reunión 12 oct): lo esencial de la ficha que antes solo veía el equipo.
 * Conciso: servicios con su avance lineal, equipo Inoo, Drive, la marca (solo si aplica) y una
 * actividad reciente breve. De los pagos solo un aviso sin montos; el detalle está en Mi cuenta.
 */
function Inicio() {
  const { sesion } = usePortal();
  const { datos: d, error, recargar } = useConsulta<S<"InicioCliente">>(`/clientes/${clienteActivo()}/inicio`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const nombre = sesion?.usuario.nombre.split(" ")[0] ?? "";
  const cuenta = d.cuenta;
  const pago = d.avisoPago;
  const req = d.indicadores.requerimientosPendientes;
  const porAprobar = d.indicadores.porAprobar;
  // 13 nov (auditoría): los tickets donde esperamos su respuesta también son algo que necesitamos del cliente.
  const ticketsEspera = (d.ticketsAbiertos ?? []).filter((t) => t.estado === "ESPERANDO_CLIENTE");
  // Quien solo mira (LECTOR) no aprueba ni responde: se le dice qué está pendiente en su cuenta, sin pedirle acción.
  const lector = rolCliente(sesion) === "LECTOR";
  const nada = !pago && !porAprobar && !req && !ticketsEspera.length;
  return (
    <>
      <Cabecera
        antetitulo={fHoyLargo(HOY_PORTAL).toUpperCase()}
        titulo={`Hola, ${nombre} 👋`}
        ligero
        bajada={`Así van tus proyectos con Inoo${cuenta?.nombre ? `, ${cuenta.nombre}` : ""}.`}
      />
      {/* El primer aviso ya está en el menú lateral; arriba solo se repite en celular, donde el menú se esconde. */}
      <div className="solo-movil"><AvisosInicio avisos={(d.avisos ?? []).slice(0, 1)} /></div>
      <AvisosInicio avisos={(d.avisos ?? []).slice(1)} />
      {/* 2 nov (Ernesto): el inicio se centra en el avance. Lo que el cliente debe hacer va en una sola fila. */}
      <section className={`tarjeta pendientes-cliente${nada ? " pendientes-cliente--al-dia" : ""}`} aria-label="Lo que necesitamos de ti">
        {nada ? (
          <p className="fila texto-sm" style={{ gap: 8 }}>
            <LuCircleCheck size={18} style={{ color: "var(--c-exito)" }} /> {lector ? "Todo al día: no hay nada pendiente en tu cuenta." : "Todo al día: por ahora no necesitamos nada de ti."}
          </p>
        ) : (
          <>
            <h2 className="tarjeta-titulo">{lector ? "Pendiente en tu cuenta" : "Lo que necesitamos de ti"}</h2>
            {lector && <p className="texto-xs texto-muted">Lo aprueban o responden las personas de tu equipo con ese permiso; tú puedes verlo.</p>}
            <div className="pendientes-cliente-lista">
              {porAprobar > 0 && (
                <Enlace a="/entregables" className="pendiente-cliente">
                  <LuCircleCheck size={18} /> <span><strong>{porAprobar}</strong> {lector ? (porAprobar === 1 ? "entregable por aprobar" : "entregables por aprobar") : porAprobar === 1 ? "entregable listo para que lo apruebes" : "entregables listos para que los apruebes"}</span>
                </Enlace>
              )}
              {req > 0 && (
                <Enlace a="/requerimientos" className="pendiente-cliente">
                  <LuClipboardList size={18} /> <span><strong>{req}</strong> {req === 1 ? "requerimiento por enviarnos" : "requerimientos por enviarnos"}</span>
                </Enlace>
              )}
              {ticketsEspera.map((t) => (
                <Enlace key={t.id} a={`/soporte?ticket=${t.id}`} className="pendiente-cliente">
                  <LuLifeBuoy size={18} /> <span>Tu ticket <strong>{t.codigo}</strong> «{t.asunto}» espera {lector ? "una respuesta de tu equipo" : "tu respuesta"}</span>
                </Enlace>
              ))}
              {pago && (
                <Enlace a="/cuenta/pagos" className="pendiente-cliente pendiente-cliente--alerta">
                  <LuWallet size={18} /> <span>Tienes un pago con {pago.diasAtraso} {pago.diasAtraso === 1 ? "día" : "días"} de atraso. Si ya pagaste, envíale el comprobante a administración.</span>
                </Enlace>
              )}
            </div>
          </>
        )}
      </section>

      <section className="seccion">
        <div className="seccion-cab">
          <h2 className="seccion-titulo">Tus proyectos</h2>
          <Enlace a="/servicios" className="enlace">Ver todos →</Enlace>
        </div>
        {!d.servicios.length && <p className="texto-sm texto-muted">Tu equipo Inoo está preparando tus proyectos. Aquí vas a ver cómo avanza cada uno.</p>}
        <div className="proyectos-cliente">
          {d.servicios.map((x) => {
            const etapa = x.avance.etapaActual;
            return (
              <Enlace key={x.servicioContratadoId} a={`/servicios/${x.servicioContratadoId}`} className="tarjeta proyecto-cliente">
                <span className="fila" style={{ gap: 10 }}>
                  <span style={{ color: "var(--c-primario)", display: "inline-flex" }}>{ICONO_SERVICIO[x.codigo]}</span>
                  <span className="negrita" style={{ fontSize: "var(--t-md)" }}>{x.titulo}</span>
                </span>
                {esPorConsumo(x.codigo) ? <span className="texto-xs texto-muted">Servicio mensual: el consumo de tu bolsa está en el proyecto.</span> : <AvanceOConsumo s={x} />}
                {etapa?.fechaEstimada && !etapa.atrasada && <span className="texto-xs texto-muted">Esta etapa termina hacia el {fCorta(etapa.fechaEstimada)}.</span>}
                {x.siguientePaso && (
                  <span className="texto-sm">
                    <span className="texto-muted">Qué sigue: </span>
                    {x.siguientePaso}
                  </span>
                )}
                <span className="enlace texto-sm" style={{ marginTop: "auto" }}>Ver proyecto →</span>
              </Enlace>
            );
          })}
        </div>
      </section>

      {(cuenta?.responsable || cuenta?.driveUrl) && (
        <p className="contacto-cliente texto-sm seccion">
          {cuenta?.responsable && (
            <span className="fila" style={{ gap: 10 }}>
              <span className="avatar">{cuenta.responsable.nombre.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>
              <span>
                Tu responsable en Inoo: <strong>{cuenta.responsable.nombre}</strong>
                {cuenta.responsable.email && (
                  <>
                    {" · "}
                    <a className="enlace" href={`mailto:${cuenta.responsable.email}`}>{cuenta.responsable.email}</a>
                  </>
                )}
              </span>
            </span>
          )}
          {cuenta?.driveUrl && (
            <a className="enlace fila" style={{ gap: 6 }} href={cuenta.driveUrl} target="_blank" rel="noreferrer">
              <LuExternalLink size={15} /> Carpeta de Drive
            </a>
          )}
        </p>
      )}
    </>
  );
}
/** «Tu marca»: un resumen corto que se puede abrir. Desde el 2 nov va en el detalle de los proyectos de marca o contenido, no en el inicio. */
export function TuMarca({ marca: m }: { marca: NonNullable<S<"InicioCliente">["marca"]> }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="tarjeta" style={{ padding: "20px 20px" }}>
      <button type="button" className="fila entre" style={{ width: "100%", background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left" }} aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
        <span>
          <span className="tarjeta-titulo" style={{ display: "block" }}>Tu marca</span>
          <span className="texto-sm" style={{ display: "block", marginTop: 8 }}>
            {m.mensajeCentral && <strong>«{m.mensajeCentral}»</strong>}
            {!!m.tono?.length && <span className="texto-muted"> · {m.tono.join(" · ")}</span>}
          </span>
        </span>
        <LuChevronDown size={18} style={{ transform: abierto ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
      </button>
      {abierto && (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {m.descripcion && <p className="texto-sm texto-muted" style={{ lineHeight: 1.6 }}>{m.descripcion}</p>}
          {m.campanaActual && <p className="texto-sm">{m.campanaActual}</p>}
          {m.publico && (
            <p className="texto-xs texto-muted">
              <span className="negrita">Público: </span>
              {m.publico}
            </p>
          )}
          <p className="texto-xs texto-muted">Así entendemos tu marca. Si algo no te representa, cuéntaselo a tu equipo Inoo.</p>
        </div>
      )}
    </section>
  );
}

/** Resultados del mes. Salió de Inicio (reunión 12 oct): va dentro de los servicios que miden resultados. */
export function ResultadosDelMes() {
  const avisar = useAviso();
  const { datos: r } = useConsulta<S<"ReporteResultados">>(`/clientes/${clienteActivo()}/reportes/resultados`);
  if (!r) return null;
  const descargar = async () => {
    try {
      const u = await api<{ url: string }>(`/clientes/${clienteActivo()}/reportes/informe?periodo=${r.periodo.desde.slice(0, 7)}`);
      window.open(u.url, "_blank");
    } catch (e) {
      avisar({ titulo: "No pudimos preparar el informe", texto: (e as ProblemaApi).titulo });
    }
  };
  const numero = (v: number) => v.toLocaleString("es-PE");
  return (
    <section className="seccion">
      <div className="seccion-cab">
        <div className="fila">
          <h2 className="seccion-titulo">Resultados del mes</h2>
          {r.esMuestra && <Etiqueta tono="gris">Datos de ejemplo</Etiqueta>}
        </div>
        {r.informeDisponible && (
          <button className="boton" onClick={descargar}>
            <LuDownload size={16} /> Descargar informe
          </button>
        )}
      </div>
      <p className="seccion-desc">
        Del {fDiaMes(`${r.periodo.desde}T12:00:00Z`)} al {fDiaMes(`${r.periodo.hasta}T12:00:00Z`)}, comparado con el mismo tramo del mes anterior. El detalle por canal y el recorrido de tus clientes están en el informe.
      </p>
      <div className="grid-4">
        {r.indicadores.slice(0, 4).map((k) => (
          <div key={k.clave} className="tarjeta kpi">
            <div className="kpi-cab">{k.etiqueta}</div>
            <div className="kpi-valor">
              {numero(k.valor)}
              {k.unidad ?? ""}
            </div>
            <div className="kpi-pie">
              {typeof k.variacionPct === "number" && (
                <span style={{ color: k.variacionPct >= 0 ? "var(--c-exito)" : "var(--c-alerta)", fontWeight: 600 }}>
                  {k.variacionPct >= 0 ? "▲" : "▼"} {Math.abs(k.variacionPct)}%{" "}
                </span>
              )}
              {k.detalle}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AsiVaElMes({ progreso: a, proxima, nota, conEnlace = true }: { progreso: S<"ProgresoPiezas">; proxima?: { titulo?: string; fechaProgramada?: string } | null; nota?: string; conEnlace?: boolean }) {
  return (
    <div className="tarjeta" style={{ padding: "22px 20px" }}>
      <h3 className="tarjeta-titulo">Así va {nombreMes(PERIODO_PORTAL).toLowerCase()}</h3>
      <div className="fila entre" style={{ marginTop: 14 }}>
        <span className="texto-sm texto-muted">
          {a.aprobadas} de {a.totales} piezas aprobadas
        </span>
        <span style={{ fontSize: "var(--t-3xl)", color: "var(--c-primario)" }}>{a.porcentaje}%</span>
      </div>
      <div style={{ margin: "14px 0 18px" }}>
        <Barra pct={a.porcentaje} />
      </div>
      <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
        <Etiqueta tono="verde">{a.aprobadas} aprobadas</Etiqueta>
        <Etiqueta tono="violeta">{a.porRevisar} por revisar</Etiqueta>
        <Etiqueta tono="gris">{a.enProduccion} en producción</Etiqueta>
      </div>
      {proxima?.titulo && (
        <p className="texto-xs texto-muted" style={{ marginTop: 16 }}>
          Próxima publicación: «{proxima.titulo}» · {fDiaMes(proxima.fechaProgramada!)}
        </p>
      )}
      {nota && <p className="texto-xs texto-muted" style={{ marginTop: 16 }}>{nota}</p>}
      {conEnlace && (
        <Enlace a="/servicios" className="enlace" style={{ marginTop: 18 }}>
          Ver mis servicios →
        </Enlace>
      )}
    </div>
  );
}

export function TodoAlDia() {
  return (
    <div className="tarjeta" style={{ textAlign: "center", padding: 32, display: "grid", justifyItems: "center", gap: 12, maxWidth: 420, margin: "0 auto" }}>
      <span style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--c-exito-suave)", color: "var(--c-exito)", display: "grid", placeItems: "center" }}>
        <LuCheck size={26} />
      </span>
      <h3 style={{ fontSize: "var(--t-2xl)", fontWeight: 600 }}>¡Todo al día!</h3>
      <p className="texto-sm texto-muted">No tienes piezas pendientes de revisión. Te avisaremos cuando haya algo nuevo para ti.</p>
      <Enlace a="/servicios" className="boton boton--bloque">
        Ver mis servicios
      </Enlace>
    </div>
  );
}

// ═════════════════════════════════════════════ Servicios contratados

export function PantallaServicios() {
  return (
    <Estructura espacio="cliente" migas="Mis servicios">
      <Servicios />
    </Estructura>
  );
}

function Servicios() {
  const cuenta = usePortal().sesion?.clientes.find((c) => c.clienteId === clienteActivo())?.nombre;
  const { datos: d, error, recargar } = useConsulta<S<"ServiciosCliente">>(`/clientes/${clienteActivo()}/servicios`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  // La API solo devuelve lo contratado (reunión 12 oct): lo no contratado no ocupa espacio.
  const contratados = d.servicios;
  const r = d.resumenMes;
  return (
    <>
      <Cabecera
        antetitulo={[cuenta, fMesAnio(PERIODO_PORTAL)].filter(Boolean).join(" · ")}
        titulo="Mis servicios"
        bajada="Lo que tienes contratado y en qué etapa está cada servicio."
      />
      <div className="tarjeta" style={{ padding: "24px 24px 20px" }}>
        <div className="fila entre" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "var(--t-2xl)", fontWeight: 600 }}>{d.plan?.nombre}</h2>
            <p className="texto-sm texto-muted" style={{ marginTop: 8 }}>
              {d.plan?.fechaFin ? `Contrato hasta el ${fCorta(d.plan.fechaFin)}${cuenta ? ` · ${cuenta}` : ""}` : cuenta}
            </p>
          </div>
          <div className="fila" style={{ gap: 8 }}>
            {contratados.length > 0 && <Etiqueta tono="verde">{contratados.length} {contratados.length === 1 ? "servicio activo" : "servicios activos"}</Etiqueta>}
            {r.totales > 0 && <Etiqueta tono="violeta">{r.totales} piezas / mes</Etiqueta>}
          </div>
        </div>
        <p className="texto-xs texto-muted" style={{ marginTop: 22 }}>
          {contratados.length ? "El avance de cada servicio se mide por etapas: el porcentaje sube al cerrar cada una." : "Todavía no tienes servicios activos. Cuando tu equipo Inoo los active, vas a verlos aquí con su avance."}
          {r.totales > 0 && ` Piezas de este mes: ${r.entregadas} entregadas, ${r.aprobadas} aprobadas y ${r.enProduccion} en producción.`}
        </p>
      </div>
      <div className="grid-3" style={{ marginTop: 16 }}>
        {contratados.map((s) => (
          <TarjetaServicio key={s.servicioContratadoId} s={s} />
        ))}
      </div>
    </>
  );
}

function TarjetaServicio({ s }: { s: S<"ServicioCliente"> }) {
  const p = s.progreso;
  const linea = detalleServicio(s);
  return (
    <div className="tarjeta" style={{ padding: "18px 18px 20px", display: "grid", gap: 14, alignContent: "start" }}>
      <div className="fila entre">
        <span className="icono-caja" style={{ width: 32, height: 32, borderRadius: 9, color: "var(--c-primario)", background: "var(--c-primario-suave)" }}>
          {ICONO_SERVICIO[s.codigo]}
        </span>
        <Etiqueta tono={s.estado === "ACTIVO" ? "verde" : s.estado === "STANDBY" ? "violeta" : "gris"}>{ETIQUETA_ESTADO_SERVICIO[s.estado]}</Etiqueta>
      </div>
      <h3 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>{s.titulo}</h3>
      {s.responsable && <span className="texto-xs texto-muted" style={{ marginTop: -8 }}>Responsable: {s.responsable.nombre} · Inoo</span>}
      {linea && <p className="negrita" style={{ fontSize: "var(--t-sm)", marginTop: -4 }}>{linea}</p>}
      <AvanceOConsumo s={s} />
      {p && (
        <span className="texto-xs texto-muted" style={{ fontSize: "var(--t-xs)" }}>
          Este mes: {p.aprobadas} aprobados · {p.porRevisar} por revisar · {p.enProduccion} en producción
        </span>
      )}
      <Enlace a={`/servicios/${s.servicioContratadoId}`} className="enlace">
        Ver proyecto →
      </Enlace>
    </div>
  );
}

// ═════════════════════════════════════════════ Entregables por revisar

export function PantallaEntregables() {
  return (
    <Estructura espacio="cliente" migas="Entregables por revisar">
      <Entregables />
    </Estructura>
  );
}

function Entregables() {
  const [q, setQ] = useState("");
  const [canal, setCanal] = useState("");
  const consulta = useMemo(() => {
    const p = new URLSearchParams({ estado: "LISTO_REVISION" });
    if (q) p.set("q", q);
    if (canal) p.set("canal", canal);
    return `/clientes/${clienteActivo()}/piezas?${p}`;
  }, [q, canal]);
  const { datos, error, recargar } = useConsulta<{ datos: PiezaUI[]; paginacion: { total: number } }>(consulta);
  // Reunión 15 oct: además de las piezas de contenido, los documentos y prototipos de los proyectos.
  const documentos = useConsulta<{ datos: S<"Entregable">[] }>(`/clientes/${clienteActivo()}/entregables?estado=LISTO_REVISION`);
  const docs = documentos.datos?.datos ?? [];
  const total = datos?.paginacion.total ?? 0;
  const pendientes = total + docs.length;
  return (
    <>
      <Cabecera antetitulo="Tus proyectos con Inoo" titulo="Entregables por revisar" bajada="El siguiente paso es tuyo. Revisa cada entregable y cuéntanos qué te parece." />
      <Aviso icono={<LuCircleCheck size={18} />} titulo={pendientes === 1 ? "Tienes 1 entregable listo para revisar" : `Tienes ${pendientes} entregables listos para revisar`} elevado>
        Aprueba la versión actual o pide cambios. Avanzamos solo con lo que apruebas.
      </Aviso>
      <div style={{ marginTop: 20 }}>
        <DocumentosPorRevisar entregables={docs} />
      </div>
      {(total > 0 || q || canal) && <h2 className="seccion-titulo" style={{ marginTop: 8 }}>Contenido para redes y blog</h2>}
      <div className="fila fila-filtros" style={{ margin: "24px 0 22px", gap: 12 }}>
        <div className="entrada" style={{ flex: 1 }}>
          <span className="icono-inicio">
            <LuSearch size={17} />
          </span>
          <input aria-label="Buscar una pieza" placeholder="Buscar una pieza..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="selector selector--alto" style={{ position: "relative", fontWeight: 500 }}>
          <span className="sr-only">Canal</span>
          <select value={canal} onChange={(e) => setCanal(e.target.value)} style={{ appearance: "none", border: 0, background: "none", outline: "none", fontSize: "var(--t-sm)", paddingRight: 18, cursor: "pointer" }}>
            <option value="">Todos los canales</option>
            <option>Instagram</option>
            <option>Facebook</option>
            <option>Blog web</option>
          </select>
          <LuChevronDown size={14} style={{ position: "absolute", right: 14, pointerEvents: "none" }} />
        </label>
      </div>
      <div className="fila entre" style={{ marginBottom: 16 }}>
        <Etiqueta tono="violeta">Listo para revisión · {total}</Etiqueta>
        <span className="texto-xs texto-muted">{total} entregables</span>
      </div>
      {error ? (
        <ErrorCarga error={error} reintentar={recargar} />
      ) : !datos ? (
        <Cargando />
      ) : datos.datos.length === 0 ? (
        q || canal ? <p className="vacio">No hay piezas que coincidan con tu búsqueda.</p> : docs.length ? null : <TodoAlDia />
      ) : (
        <div className="grid-2" style={{ gap: 18 }}>
          {datos.datos.map((p) => (
            <TarjetaPieza key={p.id} p={p} />
          ))}
        </div>
      )}
      <YaAprobados />
      <p className="fila texto-xs texto-muted" style={{ marginTop: 28, gap: 8, paddingLeft: 14 }}>
        <LuShieldCheck size={15} /> Cada aprobación queda registrada con el nombre de quien la realizó y la versión aprobada.
      </p>
    </>
  );
}

/** 13 nov (auditoría): lo que el cliente ya aprobó, para volver a verlo (antes desaparecía de esta pantalla). */
function YaAprobados() {
  const docs = useConsulta<{ datos: S<"Entregable">[] }>(`/clientes/${clienteActivo()}/entregables?estado=APROBADO`);
  const piezas = useConsulta<{ datos: PiezaUI[]; paginacion: { total: number } }>(`/clientes/${clienteActivo()}/piezas?estado=APROBADO_CLIENTE,PUBLICADO`);
  const ds = [...(docs.datos?.datos ?? [])].sort((a, b) => (b.aprobadoEn ?? "").localeCompare(a.aprobadoEn ?? ""));
  const ps = [...(piezas.datos?.datos ?? [])].sort((a, b) => b.periodo.localeCompare(a.periodo));
  const total = ds.length + (piezas.datos?.paginacion.total ?? 0);
  if (!docs.datos || !piezas.datos || !total) return null;
  return (
    <details className="tarjeta ya-aprobados" style={{ marginTop: 28, padding: "18px 18px" }}>
      <summary className="fila" style={{ gap: 8, cursor: "pointer" }}>
        <LuCircleCheck size={18} style={{ color: "var(--c-exito)" }} />
        <span className="tarjeta-titulo">Ya aprobados</span>
        <span className="pipeline-contador">{total}</span>
      </summary>
      <div className="pila" style={{ gap: 14, marginTop: 14 }}>
        {ds.length > 0 && (
          <div className="lista-suave" aria-label="Documentos y prototipos aprobados">
            {ds.map((e) => <FilaEntregable key={e.id} e={e} a={rutaDetalle(e.id)} />)}
          </div>
        )}
        {ps.length > 0 && (
          <div className="grid-2" style={{ gap: 18 }}>
            {ps.map((p) => <TarjetaPieza key={p.id} p={p} accion="Ver pieza" />)}
          </div>
        )}
      </div>
    </details>
  );
}

// ═════════════════════════════════════════════ Detalle de pieza

export function PantallaDetallePieza() {
  return (
    <Estructura espacio="cliente" migas="Entregables por revisar">
      <DetallePieza />
    </Estructura>
  );
}

/** Sin diseño propio en Figma: el equipo abre la pieza desde el Kanban del proyecto con el mismo detalle + acciones internas. */
export function PantallaDetallePiezaEquipo() {
  return (
    <Estructura espacio="equipo" migas="Proyectos">
      <DetallePieza alProyecto />
    </Estructura>
  );
}

const ACCIONES_EQUIPO: Record<string, [string, string]> = {
  ENVIAR_REVISION_INTERNA: ["Enviar a revisión interna", "EN_REVISION_INTERNA"],
  LIBERAR_A_CLIENTE: ["Liberar al cliente", "LISTO_REVISION"],
  RETIRAR: ["Retirar de revisión", "EN_REVISION_INTERNA"],
  MARCAR_PUBLICADO: ["Marcar como publicada", "PUBLICADO"],
};

type PiezaDet = S<"Pieza"> & { formato?: string; diseno?: PiezaUI["diseno"] };

/** Solo en estos servicios se ve el historial de la pieza (6 nov): son los que producen piezas mes a mes. */
const SERVICIOS_CON_HISTORIAL = ["PAID_MEDIA", "SOCIAL_MEDIA_PRO"];
const CANAL_DECISION: Record<string, string> = { PORTAL: "desde el portal", PANEL: "desde el panel", TELEGRAM: "por Telegram", SLACK: "por Slack", SISTEMA: "automático" };

/** Quién movió la pieza, a qué estado y cuándo. El cliente solo ve desde que se la enviamos a revisar. */
function HistorialPieza({ piezaId }: { piezaId: string }) {
  const h = useConsulta<{ datos: S<"EventoPieza">[] }>(`/piezas/${piezaId}/historial`);
  const mapa = leerSesion()?.tipo === "CLIENTE" ? ESTADO_PIEZA_CLIENTE : ESTADO_PIEZA;
  const eventos = [...(h.datos?.datos ?? [])].reverse();
  return (
    <div className="tarjeta seccion" style={{ padding: "26px 18px 18px" }}>
      <h2 className="tarjeta-titulo">Historial</h2>
      <p className="texto-xs texto-muted" style={{ margin: "14px 0 16px" }}>Quién la movió y cuándo, de lo más reciente a lo más antiguo.</p>
      {h.error ? (
        <ErrorCarga error={h.error} reintentar={h.recargar} />
      ) : !h.datos ? (
        <Cargando />
      ) : !eventos.length ? (
        <p className="texto-sm texto-muted">Todavía no hay movimientos.</p>
      ) : (
        <ol className="lista-suave" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {eventos.map((e, i) => (
            <li key={i} className="fila-suave rejilla" style={{ ["--columnas" as string]: "150px 1fr" }}>
              <span><EtiquetaEstado estado={e.aEstado} mapa={mapa} /></span>
              <div>
                <p style={{ fontSize: "var(--t-sm)" }}>
                  {e.usuario?.nombre ?? "Inoo"}{e.version ? ` · versión ${e.version}` : ""} · {CANAL_DECISION[e.canal] ?? ""}
                </p>
                <p className="texto-xs texto-muted" style={{ marginTop: 3 }}>{fCorta(e.creadoEn)}, {fDiaHora(e.creadoEn).split(" · ")[1]}</p>
                {e.comentario && <p className="texto-xs" style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>«{e.comentario}»</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function DetallePieza({ alProyecto = false }: { alProyecto?: boolean }) {
  const { params } = useNavegacion();
  const avisar = useAviso();
  const portal = usePortal();
  const pieza = useConsulta<PiezaDet>(`/piezas/${params.id}`);
  const versiones = useConsulta<S<"VersionPieza">[]>(`/piezas/${params.id}/versiones`);
  const comentarios = useConsulta<{ datos: S<"Comentario">[] }>(`/piezas/${params.id}/comentarios`);
  const [texto, setTexto] = useState("");
  const [errorTexto, setErrorTexto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [diapositiva, setDiapositiva] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [pidiendoCambios, setPidiendoCambios] = useState(false);

  if (pieza.error) return <ErrorCarga error={pieza.error} reintentar={pieza.recargar} />;
  if (!pieza.datos) return <Cargando />;
  const p = pieza.datos;
  const v = p.version;
  const c = (v?.contenido ?? {}) as Record<string, unknown> & { imagenes?: { etiqueta?: string; url?: string }[] };
  const imagenes = c.imagenes ?? [];
  const anterior = versiones.datos?.find((x) => !x.actual && x.decision);
  // Blogs: el equipo los aprueba desde la revisión interna (reunión 12 oct), sin la decisión del cliente.
  const blogInterno = p.tipo === "BLOG" && p.estado === "EN_REVISION_INTERNA";
  const puedeDecidir = p.acciones.includes("APROBAR") && !blogInterno;
  const nombreUsuario = portal.sesion?.usuario.nombre ?? "";

  const recargarTodo = () => {
    void pieza.recargar();
    void versiones.recargar();
    void comentarios.recargar();
    portal.refrescar();
  };
  const tratarError = (e: unknown) => {
    const err = e as ProblemaApi;
    if (err.codigo === "VERSION_DESACTUALIZADA") {
      avisar({ titulo: "La pieza cambió mientras la revisabas", texto: err.detalle });
      recargarTodo();
    } else setErrorTexto(err.errores[0]?.mensaje ?? err.titulo);
  };
  const aprobar = async () => {
    setOcupado(true);
    try {
      await api(`/piezas/${p.id}/aprobar`, { metodo: "POST", cuerpo: { version: p.versionCliente }, idempotente: true });
      setConfirmar(false);
      avisar({ titulo: `Versión ${p.versionCliente} aprobada`, texto: `${p.titulo}. Aprobación registrada por ${nombreUsuario}.` });
      recargarTodo();
    } catch (e) {
      setConfirmar(false);
      tratarError(e);
    } finally {
      setOcupado(false);
    }
  };
  // 13 nov (auditoría): «Pedir cambios» abre su modal; el cuadro de comentarios queda para comentar.
  const pedirCambios = async (comentario: string) => {
    await api(`/piezas/${p.id}/solicitar-cambios`, { metodo: "POST", cuerpo: { version: p.versionCliente, comentario }, idempotente: true });
    avisar({ titulo: "Cambios solicitados", texto: "Tu equipo Inoo ya recibió tus comentarios." });
    recargarTodo();
  };
  const comentar = async () => {
    setErrorTexto(null);
    if (!texto.trim()) {
      setErrorTexto("Escribe un comentario.");
      return;
    }
    try {
      await api(`/piezas/${p.id}/comentarios`, { metodo: "POST", cuerpo: { texto } });
      setTexto("");
      void comentarios.recargar();
    } catch (e) {
      tratarError(e);
    }
  };
  const descargar = async () => {
    try {
      const r = await api<{ url: string }>(`/piezas/${p.id}/descarga`);
      window.open(r.url, "_blank");
    } catch (e) {
      avisar({ titulo: "No se pudo descargar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };

  return (
    <>
      <Enlace a={alProyecto ? (p.servicioContratadoId ? `/equipo/proyectos/${p.servicioContratadoId}` : "/equipo/proyectos") : "/entregables"} className="volver">
        ← {alProyecto ? "Volver al proyecto" : "Volver a entregables por revisar"}
      </Enlace>
      <h1 className="titulo titulo--ligero">{p.titulo}</h1>
      <p className="bajada" style={{ marginTop: 6 }}>
        {p.formato} · {p.canal} · Publicación prevista: {p.fechaProgramada ? fCorta(p.fechaProgramada) : "—"}
      </p>
      <div className="fila" style={{ margin: "20px 0 24px" }}>
        <EtiquetaPieza p={p} />
        {v && (
          <span className="texto-xs texto-muted">
            Versión {v.numero} · Actualizada el {fDiaMes(v.enviadaEn ?? v.creadoEn)}
          </span>
        )}
      </div>

      <div className="con-lateral" style={{ ["--columnas" as string]: "minmax(0,1fr) 312px" }}>
        <div className="tarjeta" style={{ padding: 0, overflow: "hidden" }}>
          <div className="fila entre" style={{ padding: "16px 16px 14px" }}>
            <span className="negrita" style={{ fontSize: "var(--t-xs)" }}>{v?.archivo?.nombre ?? p.titulo}</span>
            <button className="enlace" aria-label="Descargar" onClick={descargar}>
              <LuDownload size={18} />
            </button>
          </div>
          {p.tipo === "BLOG" ? (
            <>
              <Miniatura diseno={p.diseno} alto={260} grande />
              <article style={{ padding: "20px 22px 26px", fontSize: "var(--t-sm)", lineHeight: 1.7, whiteSpace: "pre-line" }}>
                <p className="negrita" style={{ marginBottom: 6 }}>{String(c.tituloSeo ?? p.titulo)}</p>
                <p className="texto-xs texto-muted" style={{ marginBottom: 16 }}>{String(c.metaDescripcion ?? "")} · {String(c.palabras ?? "")} palabras</p>
                {String(c.cuerpoMd ?? "").replace(/^#+ /gm, "")}
              </article>
            </>
          ) : (
            <>
              <VistaPieza piezaId={p.id} archivo={v?.archivo ?? null} imagen={imagenes[diapositiva]?.url ?? null} diseno={p.diseno} />
              <div className="fila entre" style={{ padding: "10px 16px", borderBottom: "1px solid var(--c-borde)", fontSize: "var(--t-xs)", color: "var(--c-muted)" }}>
                <button className="enlace" style={{ color: "var(--c-texto)" }} aria-label="Anterior" onClick={() => setDiapositiva(Math.max(0, diapositiva - 1))}>
                  <LuChevronLeft size={16} />
                </button>
                <span className="fila" style={{ gap: 4 }}>
                  {imagenes.map((_, i) => (
                    <span key={i} style={{ width: i === diapositiva ? 16 : 4, height: 4, borderRadius: 4, background: i === diapositiva ? "var(--c-primario)" : "#d5d7e0" }} />
                  ))}
                </span>
                <span>
                  {imagenes[diapositiva]?.etiqueta ?? p.formato} · {diapositiva + 1} de {Math.max(1, imagenes.length)}
                </span>
                <span />
                <button className="enlace" style={{ color: "var(--c-texto)" }} aria-label="Siguiente" onClick={() => setDiapositiva(Math.min(imagenes.length - 1, diapositiva + 1))}>
                  <LuChevronRight size={16} />
                </button>
              </div>
              <div style={{ padding: "20px 18px 24px", fontSize: "var(--t-sm)", lineHeight: 1.6 }}>
                <p className="negrita" style={{ fontSize: "var(--t-sm)", marginBottom: 12 }}>
                  {p.tipo === "GUION" ? "Guion" : "Texto de la publicación"}
                </p>
                {p.tipo === "GUION" ? <Guion c={c} /> : <CopyConHashtags texto={String(c.copyAsociado ?? c.copy ?? "")} />}
              </div>
            </>
          )}
        </div>

        <div className="pila">
          {(p.acciones.some((x) => ACCIONES_EQUIPO[x]) || blogInterno) && (
            <div className="tarjeta" style={{ display: "grid", gap: 10, padding: "22px 18px" }}>
              <h3 className="tarjeta-titulo">Acciones del equipo</h3>
              <p className="texto-xs texto-muted">Estado interno: {p.estado} · versión vigente {p.versionActual}</p>
              {blogInterno && (
                <>
                  <p className="texto-xs texto-muted">Los blogs no pasan por el cliente: apruébalo cuando esté listo para publicar.</p>
                  <button
                    className="boton boton--bloque boton--primario"
                    style={{ height: 40 }}
                    onClick={async () => {
                      try {
                        await api(`/piezas/${p.id}/transiciones`, { metodo: "POST", cuerpo: { aEstado: "APROBADO_CLIENTE" } });
                        avisar({ titulo: "Artículo aprobado", texto: p.titulo });
                        recargarTodo();
                      } catch (e) {
                        tratarError(e);
                      }
                    }}
                  >
                    Aprobar artículo
                  </button>
                </>
              )}
              {p.acciones
                .filter((x) => ACCIONES_EQUIPO[x])
                .map((x) => (
                  <button
                    key={x}
                    className={`boton boton--bloque${x === "LIBERAR_A_CLIENTE" ? " boton--primario" : ""}`}
                    style={{ height: 40 }}
                    onClick={async () => {
                      try {
                        await api(`/piezas/${p.id}/transiciones`, { metodo: "POST", cuerpo: { aEstado: ACCIONES_EQUIPO[x][1] } });
                        avisar({ titulo: ACCIONES_EQUIPO[x][0], texto: p.titulo });
                        recargarTodo();
                      } catch (e) {
                        tratarError(e);
                      }
                    }}
                  >
                    {ACCIONES_EQUIPO[x][0]}
                  </button>
                ))}
            </div>
          )}
          <div className="tarjeta" style={{ display: "grid", gap: 14, padding: "22px 18px" }}>
            <h3 className="tarjeta-titulo">¿Lista para publicar?</h3>
            {p.estado === "LISTO_REVISION" ? (
              <>
                <p className="texto-sm texto-muted" style={{ lineHeight: 1.6 }}>
                  Estás revisando la versión {p.versionCliente}. Tu decisión se guardará solo para esta versión.
                </p>
                <button className="boton boton--primario boton--bloque" style={{ height: 40 }} disabled={!puedeDecidir || ocupado} onClick={() => setConfirmar(true)}>
                  <LuCheck size={16} /> Aprobar
                </button>
                <ModalPedirCambios abierto={pidiendoCambios} titulo={`${p.titulo} · versión ${p.versionCliente}`} alCerrar={() => setPidiendoCambios(false)} alEnviar={pedirCambios} />
                <button className="boton boton--bloque" style={{ height: 40 }} disabled={!puedeDecidir || ocupado} onClick={() => setPidiendoCambios(true)}>
                  <LuMessageSquare size={16} /> Pedir cambios
                </button>
                {!puedeDecidir && <p className="texto-xs texto-muted">Tu rol permite comentar, pero no aprobar.</p>}
                {anterior && (
                  <p className="fila texto-xs texto-muted" style={{ alignItems: "flex-start", gap: 8, fontSize: "var(--t-xs)" }}>
                    <LuInfo size={14} style={{ flex: "none" }} /> La aprobación anterior corresponde a la versión {anterior.numero}, no a esta pieza actual.
                  </p>
                )}
              </>
            ) : (
              <p className="texto-sm texto-muted">
                {p.estado === "APROBADO_CLIENTE" || p.estado === "PUBLICADO"
                  ? `Aprobaste la versión ${p.versionCliente}. La programaremos según el calendario.`
                  : p.estado === "CAMBIOS_SOLICITADOS"
                    ? "Pediste cambios. Te avisaremos cuando la nueva versión esté lista."
                    : "Esta pieza todavía está en producción."}
              </p>
            )}
          </div>

          <div className="tarjeta" style={{ display: "grid", gap: 12, padding: "22px 18px" }}>
            <h3 className="tarjeta-titulo">Comentarios</h3>
            <div className="campo">
              <label htmlFor="comentario">Tu comentario</label>
              <div className="entrada">
                <textarea id="comentario" placeholder="Cuéntanos qué debemos ajustar..." value={texto} onChange={(e) => setTexto(e.target.value)} aria-invalid={!!errorTexto} />
              </div>
              <span className="ayuda-campo" style={errorTexto ? { color: "var(--c-alerta)" } : undefined} role={errorTexto ? "alert" : undefined}>
                {errorTexto ?? "Para dudas o comentarios. Si quieres cambios, usa «Pedir cambios»."}
              </span>
            </div>
            <button className="boton boton--bloque" style={{ height: 40 }} onClick={comentar}>
              Enviar comentario
            </button>
            {comentarios.datos?.datos.map((cm) => (
              <div key={cm.id} style={{ display: "grid", gridTemplateColumns: "32px 1fr", gap: 10, marginTop: 6 }}>
                <span className="avatar">{cm.autor.nombre.split(" ").slice(0, 2).map((x) => x[0]).join("")}</span>
                <div>
                  <p className="negrita" style={{ fontSize: "var(--t-xs)" }}>{cm.autor.nombre}</p>
                  <p className="texto-xs texto-muted" style={{ fontSize: "var(--t-xs)" }}>
                    {fDiaHora(cm.creadoEn)} · Versión {cm.version}
                  </p>
                </div>
                <p className="texto-xs texto-muted" style={{ gridColumn: "1 / -1", lineHeight: 1.6 }}>{cm.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="tarjeta seccion" style={{ padding: "26px 18px 18px" }}>
        <h2 className="tarjeta-titulo">Historial de versiones</h2>
        <p className="texto-xs texto-muted" style={{ margin: "14px 0 16px" }}>Cada versión conserva sus comentarios y su propia aprobación.</p>
        <div className="lista-suave">
          {versiones.datos?.map((x) => (
            <div key={x.numero} className={`fila-suave rejilla${x.actual ? " fila-suave--activa" : ""}`} style={{ ["--columnas" as string]: "1fr 1.3fr 140px" }}>
              <div>
                <p className="negrita" style={{ fontSize: "var(--t-sm)" }}>
                  Versión {x.numero} · {x.actual ? "Actual" : "Anterior"}
                </p>
                <p className="texto-xs texto-muted" style={{ marginTop: 4 }}>
                  {fCorta(x.enviadaEn ?? x.creadoEn)} · {x.enviadaPor?.nombre ?? "Equipo"}, Inoo
                </p>
              </div>
              <div className="texto-xs texto-muted">
                {x.decision ? (
                  <>
                    <p style={{ fontSize: "var(--t-xs)" }}>
                      {x.decision.estado === "APROBADO_CLIENTE" ? "Aprobada" : "Cambios pedidos"} por {x.decision.usuarioNombre} · {fCorta(x.decision.fecha!)}, {fDiaHora(x.decision.fecha!).split(" · ")[1]}
                    </p>
                    {!x.actual && <p style={{ fontSize: "var(--t-xs)", marginTop: 4 }}>Esta aprobación no aplica a la versión actual.</p>}
                  </>
                ) : (
                  <p style={{ fontSize: "var(--t-xs)" }}>Sin aprobación todavía</p>
                )}
              </div>
              <div style={{ justifySelf: "end" }}>
                {x.decision?.estado === "APROBADO_CLIENTE" ? (
                  <Etiqueta tono="verde">Aprobada</Etiqueta>
                ) : x.decision?.estado === "CAMBIOS_SOLICITADOS" ? (
                  <Etiqueta tono="ambar">Cambios solicitados</Etiqueta>
                ) : (
                  <span className="etiqueta" style={{ background: "transparent", color: "var(--c-primario)" }}>Por revisar</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {SERVICIOS_CON_HISTORIAL.includes(p.servicioCodigo ?? "") && <HistorialPieza piezaId={p.id} />}

      <Modal abierto={confirmar} alCerrar={() => setConfirmar(false)} etiqueta="Aprobar esta versión">
        <span className="icono-caja">
          <LuCircleCheck size={18} />
        </span>
        <h2 style={{ fontSize: "var(--t-3xl)", fontWeight: 600 }}>¿Aprobar esta versión?</h2>
        <p className="texto-sm texto-muted">
          «{p.titulo}» · Versión {p.versionCliente}
        </p>
        <p className="texto-sm texto-muted" style={{ lineHeight: 1.6 }}>
          Confirmaremos tu aprobación y el equipo Inoo podrá programar esta pieza.
        </p>
        <div style={{ background: "var(--c-fondo)", borderRadius: 12, padding: "12px 14px" }}>
          <p className="negrita" style={{ fontSize: "var(--t-xs)" }}>Se registrará a nombre de {nombreUsuario}</p>
          <p className="texto-xs texto-muted" style={{ fontSize: "var(--t-xs)", marginTop: 4 }}>
            Solo se aprobará la versión {p.versionCliente} de este entregable.
          </p>
        </div>
        <div className="grid-2" style={{ gap: 10 }}>
          <button className="boton" onClick={() => setConfirmar(false)}>
            Volver a revisar
          </button>
          <button className="boton boton--primario" onClick={aprobar} disabled={ocupado}>
            Confirmar aprobación
          </button>
        </div>
      </Modal>
    </>
  );
}

function CopyConHashtags({ texto }: { texto: string }) {
  return (
    <div style={{ whiteSpace: "pre-line" }}>
      {texto.split(/(#[\wÁÉÍÓÚáéíóúñÑ]+)/g).map((t, i) =>
        t.startsWith("#") ? (
          <span key={i} style={{ color: "var(--c-primario)" }}>
            {t}
          </span>
        ) : (
          t
        ),
      )}
    </div>
  );
}

function Guion({ c }: { c: Record<string, unknown> }) {
  const escenas = (c.escenas ?? []) as { tiempo: string; tipoPlano: string; indicacionVisual: string; audio: string }[];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p>
        <strong>Gancho:</strong> {String(c.gancho ?? "")}
      </p>
      <table className="tabla tabla--tarjetas" style={{ fontSize: "var(--t-xs)" }}>
        <thead>
          <tr>
            <th>Tiempo</th>
            <th>Plano</th>
            <th>Indicación</th>
            <th>Audio</th>
          </tr>
        </thead>
        <tbody>
          {escenas.map((e) => (
            <tr key={e.tiempo} style={{ cursor: "default" }}>
              <td style={{ padding: "10px 20px" }}>{e.tiempo}</td>
              <td style={{ padding: "10px 20px" }}>{e.tipoPlano}</td>
              <td style={{ padding: "10px 20px" }}>{e.indicacionVisual}</td>
              <td style={{ padding: "10px 20px" }}>{e.audio}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>CTA:</strong> {String(c.cta ?? "")}
      </p>
    </div>
  );
}

/**
 * 13 nov (auditoría): el cliente aprueba mirando la pieza real. Primero la imagen de la diapositiva; si no, el archivo
 * de la versión (imagen o video); solo si no hay nada, la maqueta de texto.
 */
function VistaPieza({ piezaId, archivo, imagen, diseno }: { piezaId: string; archivo: { mime: string; nombre: string; miniaturaUrl?: string | null } | null; imagen: string | null; diseno?: Parameters<typeof Miniatura>[0]["diseno"] }) {
  const [url, setUrl] = useState<string | null>(null);
  const media = archivo && /^(image|video)\//.test(archivo.mime) ? archivo.mime : null;
  useEffect(() => {
    if (imagen || !media) return;
    let vivo = true;
    api<{ url: string }>(`/piezas/${piezaId}/descarga`).then((r) => vivo && setUrl(r.url), () => undefined);
    return () => { vivo = false; };
  }, [piezaId, imagen, media]);
  const src = imagen ?? url ?? archivo?.miniaturaUrl ?? null;
  if (!src) return <Miniatura diseno={diseno} alto={322} grande />;
  return (
    <div className="vista-pieza">
      {media?.startsWith("video/") && !imagen ? <video src={src} controls playsInline /> : <img src={src} alt={archivo?.nombre ?? "Pieza"} />}
    </div>
  );
}
