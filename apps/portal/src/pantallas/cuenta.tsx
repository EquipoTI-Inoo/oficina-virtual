"use client";
/**
 * «Mi cuenta» (reunión 12 oct): se abre desde la foto de perfil. Reúne lo que el cliente consulta poco:
 * sus datos y contrato, pagos, usuarios, correos y ayuda. Así el menú queda en lo que usa a diario y el
 * soporte queda a mano para quien lo busca, sin estar en primera pantalla (como en la app de un banco).
 * Los números de WhatsApp de Ayuda son de relleno hasta que el equipo los defina.
 */
import type { ReactNode } from "react";
import { LuFileText, LuMail, LuMessageCircle, LuTicket } from "react-icons/lu";
import { api, clienteActivo, Enlace, fCorta, fDiaHora, fDiaMes, useConsulta, useNavegacion, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, useAviso, usePortal } from "../componentes";

export const PESTANAS_CUENTA = [
  { a: "/cuenta", texto: "Mi cuenta" },
  { a: "/cuenta/pagos", texto: "Pagos", soloAdmin: true },
  { a: "/cuenta/usuarios", texto: "Usuarios" },
  { a: "/cuenta/notificaciones", texto: "Notificaciones" },
  { a: "/cuenta/ayuda", texto: "Ayuda" },
];

const ROL_CLIENTE: Record<string, string> = { ADMIN_CLIENTE: "Administra la cuenta", APROBADOR: "Aprueba entregables", LECTOR: "Solo lectura" };
const DESTINATARIOS: Record<string, string> = { MIEMBROS_CLIENTE: "Tu equipo", ACCOUNT_MANAGER: "Inoo", AMBOS: "Tu equipo e Inoo" };
const MONEDA: Record<string, string> = { PEN: "S/", USD: "US$" };
export const fMonto = (monto: number, moneda: string) => `${MONEDA[moneda] ?? moneda} ${monto.toLocaleString("es-PE")}`;

export function PantallaCuenta() {
  return (
    <Estructura espacio="cliente" migas="Mi cuenta">
      <Cuenta />
    </Estructura>
  );
}

function Cuenta() {
  const { ruta } = useNavegacion();
  const { sesion } = usePortal();
  const esAdmin = sesion?.clientes[0]?.rol === "ADMIN_CLIENTE";
  const pestanas = PESTANAS_CUENTA.filter((x) => !x.soloAdmin || esAdmin);
  const actual = pestanas.find((x) => x.a === ruta)?.a ?? "/cuenta";
  return (
    <>
      <Cabecera antetitulo={sesion?.clientes[0]?.nombre?.toUpperCase()} titulo="Mi cuenta" bajada="Tus datos, pagos, usuarios y cómo contactarnos." />
      <nav className="pestanas" role="tablist" aria-label="Secciones de mi cuenta" style={{ marginBottom: 20, maxWidth: "100%", overflowX: "auto" }}>
        {pestanas.map((x) => (
          <Enlace key={x.a} a={x.a} role="tab" aria-selected={x.a === actual} className="pestana" style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>
            {x.texto}
          </Enlace>
        ))}
      </nav>
      {actual === "/cuenta" && <MisDatos />}
      {actual === "/cuenta/pagos" && <Pagos />}
      {actual === "/cuenta/usuarios" && <Usuarios esAdmin={esAdmin} />}
      {actual === "/cuenta/notificaciones" && <Notificaciones />}
      {actual === "/cuenta/ayuda" && <Ayuda />}
    </>
  );
}

const Tarjeta = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section className="tarjeta" style={{ padding: "22px 20px", display: "grid", gap: 14, alignContent: "start" }}>
    <h2 className="tarjeta-titulo">{titulo}</h2>
    {children}
  </section>
);
const Dato = ({ etiqueta, children }: { etiqueta: string; children: ReactNode }) => (
  <div style={{ display: "grid", gap: 4 }}>
    <span className="texto-xs texto-muted">{etiqueta}</span>
    <span className="texto-sm negrita">{children}</span>
  </div>
);

// ───────────────────────────── Mi cuenta

function MisDatos() {
  const { sesion } = usePortal();
  const avisar = useAviso();
  const { datos: c, error, recargar } = useConsulta<S<"Cliente">>(`/clientes/${clienteActivo()}`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!c || !sesion) return <Cargando />;
  const verContrato = async () => {
    try {
      const u = await api<{ url: string }>(`/clientes/${clienteActivo()}/plan/contrato`);
      window.open(u.url, "_blank");
    } catch {
      avisar({ titulo: "No encontramos el contrato", texto: "Pídeselo a tu equipo Inoo." });
    }
  };
  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <Tarjeta titulo="Tus datos">
        <Dato etiqueta="Nombre">{sesion.usuario.nombre}</Dato>
        <Dato etiqueta="Correo">{sesion.usuario.email}</Dato>
        <Dato etiqueta="Tu permiso">{ROL_CLIENTE[sesion.clientes[0]?.rol ?? ""] ?? "—"}</Dato>
        <p className="texto-xs texto-muted">Para cambiar tus datos o tu contraseña, escríbele a tu equipo Inoo.</p>
      </Tarjeta>
      <Tarjeta titulo="Tu plan">
        <Dato etiqueta="Empresa">{c.nombre}</Dato>
        <Dato etiqueta="Plan">{c.plan?.nombre ?? "—"}</Dato>
        <Dato etiqueta="Vigencia">
          {c.plan ? `Del ${fCorta(c.plan.fechaInicio!)}${c.plan.fechaFin ? ` al ${fCorta(c.plan.fechaFin)}` : ""}` : "—"}
        </Dato>
        <Dato etiqueta="Responsable en Inoo">{c.accountManager?.nombre ?? "—"}</Dato>
        {c.plan?.tieneContrato && (
          <button className="boton" onClick={verContrato} style={{ justifySelf: "start" }}>
            <LuFileText size={16} /> Ver contrato
          </button>
        )}
      </Tarjeta>
    </div>
  );
}

// ───────────────────────────── Pagos (solo quien administra la cuenta)

function Pagos() {
  const { datos: d, error, recargar } = useConsulta<{ pendientes: S<"PagoProgramado">[]; pagados: S<"PagoProgramado">[] }>(`/clientes/${clienteActivo()}/pagos`);
  if (error) return <ErrorCarga error={error} reintentar={error.status === 403 ? undefined : recargar} />;
  if (!d) return <Cargando />;
  const fila = (x: S<"PagoProgramado">) => (
    <tr key={x.id} style={{ cursor: "default" }}>
      <td className="negrita">{x.concepto}</td>
      <td>{x.estado === "PAGADO" && x.pagadoEn ? `Pagado el ${fDiaMes(x.pagadoEn)}` : `${x.estado === "VENCIDO" ? "Venció" : "Vence"} el ${fDiaMes(x.fechaVencimiento)}`}</td>
      <td>
        <Etiqueta tono={x.estado === "VENCIDO" ? "ambar" : x.estado === "PAGADO" ? "verde" : "gris"}>{x.estado === "VENCIDO" ? "Vencido" : x.estado === "PAGADO" ? "Pagado" : "Pendiente"}</Etiqueta>
      </td>
      <td className="negrita" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fMonto(x.monto, x.moneda)}</td>
    </tr>
  );
  return (
    <div className="pila">
      <Tarjeta titulo="Próximos pagos">
        {d.pendientes.length === 0 ? (
          <p className="texto-sm texto-muted">Estás al día. No tienes pagos pendientes.</p>
        ) : (
          <div className="tabla-envoltura">
            <table className="tabla" style={{ fontSize: 12.5 }}>
              <tbody>{d.pendientes.map(fila)}</tbody>
            </table>
          </div>
        )}
        <p className="texto-xs texto-muted">¿Dudas con una factura o un pago? Escríbele a administración desde la pestaña Ayuda.</p>
      </Tarjeta>
      {d.pagados.length > 0 && (
        <Tarjeta titulo="Pagos realizados">
          <div className="tabla-envoltura">
            <table className="tabla" style={{ fontSize: 12.5 }}>
              <tbody>{d.pagados.map(fila)}</tbody>
            </table>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

// ───────────────────────────── Usuarios (solo lectura: los gestiona el equipo)

function Usuarios({ esAdmin }: { esAdmin: boolean }) {
  const { sesion } = usePortal();
  const miembros = useConsulta<{ datos: S<"Miembro">[] }>(esAdmin ? `/clientes/${clienteActivo()}/miembros` : null);
  return (
    <Tarjeta titulo="Usuarios del portal">
      {!esAdmin ? (
        <p className="texto-sm texto-muted">La lista de usuarios la ve la persona que administra la cuenta. Para dar acceso a alguien más, escríbele a tu equipo Inoo.</p>
      ) : miembros.error ? (
        <ErrorCarga error={miembros.error} reintentar={miembros.recargar} />
      ) : !miembros.datos ? (
        <Cargando />
      ) : (
        <>
          <div className="tabla-envoltura">
            <table className="tabla" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Permiso</th>
                </tr>
              </thead>
              <tbody>
                {miembros.datos.datos.map((m) => (
                  <tr key={m.usuarioId} style={{ cursor: "default" }}>
                    <td>
                      <p className="negrita">
                        {m.nombre} {m.usuarioId === sesion?.usuario.id && <span className="texto-muted">(tú)</span>}
                      </p>
                      <p className="texto-xs texto-muted" style={{ marginTop: 4 }}>
                        {m.email} {m.invitacionPendiente && <Etiqueta tono="ambar">Invitación pendiente</Etiqueta>}
                      </p>
                    </td>
                    <td>{ROL_CLIENTE[m.rol] ?? m.rol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="texto-xs texto-muted">
            Para dar acceso a alguien más de tu equipo o cambiar permisos, envíale los datos a tu equipo Inoo y lo hacemos por ti. Si dejas la empresa,
            avísanos quién te reemplaza para no perder el seguimiento de tus proyectos.
          </p>
        </>
      )}
    </Tarjeta>
  );
}

// ───────────────────────────── Notificaciones (correos automáticos)

function Notificaciones() {
  const correos = useConsulta<{ reglas: S<"ReglaCorreo">[]; recientes: S<"CorreoEnviado">[] }>(`/clientes/${clienteActivo()}/correos-automaticos`);
  if (correos.error) return <ErrorCarga error={correos.error} reintentar={correos.recargar} />;
  if (!correos.datos) return <Cargando />;
  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <Tarjeta titulo="Correos que te enviamos">
        {correos.datos.reglas.map((r) => (
          <div key={r.evento} className="fila" style={{ gap: 12 }}>
            <LuMail size={16} color="var(--c-primario)" />
            <span style={{ flex: 1 }}>
              <span className="negrita" style={{ display: "block", fontSize: 12 }}>{r.descripcion}</span>
              <span className="texto-xs texto-muted">Para: {DESTINATARIOS[r.destinatarios ?? "MIEMBROS_CLIENTE"]}</span>
            </span>
            <Etiqueta tono={r.activa ? "verde" : "gris"}>{r.activa ? "Activo" : "Pausado"}</Etiqueta>
          </div>
        ))}
      </Tarjeta>
      <Tarjeta titulo="Últimos correos enviados">
        <div className="lista-suave">
          {correos.datos.recientes.map((c) => (
            <div key={c.id} className="fila-suave" style={{ padding: "12px 6px", display: "grid", gap: 4 }}>
              <span className="negrita" style={{ fontSize: 12 }}>{c.asunto}</span>
              <span className="texto-xs texto-muted">
                {c.para} · {c.enviadoEn ? fDiaHora(c.enviadoEn) : "Pendiente"}
              </span>
            </div>
          ))}
        </div>
      </Tarjeta>
    </div>
  );
}

// ───────────────────────────── Ayuda (soporte escondido, con el canal humano directo)

/** Números de relleno hasta que el equipo los defina. */
const CONTACTOS = [
  { area: "Pagos y facturación", detalle: "Facturas, detracciones y fechas de pago.", whatsapp: "51900000001" },
  { area: "Tu proyecto", detalle: "Avance, fechas de entrega o algo que te preocupa de un servicio.", whatsapp: "51900000002", responsable: true },
];

function Ayuda() {
  const { datos: c } = useConsulta<S<"Cliente">>(`/clientes/${clienteActivo()}`);
  return (
    <div className="pila">
      <Tarjeta titulo="¿Con quién hablo?">
        {CONTACTOS.map((x) => (
          <div key={x.area} className="fila entre" style={{ alignItems: "center", gap: 16 }}>
            <span>
              <span className="negrita" style={{ display: "block", fontSize: 13 }}>{x.area}</span>
              <span className="texto-xs texto-muted">
                {x.detalle}
                {x.responsable && c?.accountManager ? ` Te atiende ${c.accountManager.nombre}.` : ""}
              </span>
            </span>
            <a className="boton boton--chico" href={`https://wa.me/${x.whatsapp}`} target="_blank" rel="noreferrer" style={{ whiteSpace: "nowrap" }}>
              <LuMessageCircle size={16} /> WhatsApp
            </a>
          </div>
        ))}
      </Tarjeta>
      <Tarjeta titulo="¿Algo no funciona en el portal?">
        <p className="texto-sm texto-muted">Si ves un error o algo que no carga, déjanos un ticket y lo revisamos.</p>
        <Enlace a="/soporte/nuevo" className="boton" style={{ justifySelf: "start" }}>
          <LuTicket size={16} /> Reportar un problema
        </Enlace>
      </Tarjeta>
    </div>
  );
}
