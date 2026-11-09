"use client";
/**
 * Empresas (pedido de Ernesto, 6 nov): Inoo y cada cliente en un solo lugar, con su gente, sus proyectos y quién
 * del equipo tiene acceso. Lo ven quienes trabajan por cuenta (nivel ADMIN o CUENTA); cada uno, las cuentas que ve.
 */
import { useState, type ReactNode } from "react";
import { LuBuilding2, LuFolderKanban, LuKeyRound, LuSearch, LuUsers } from "react-icons/lu";
import { Enlace, useConsulta, useNavegacion, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta } from "../componentes";
import { NOMBRE_AREA, type Area } from "../dominio/ia-equipo";
import { NOMBRE_NIVEL, type Nivel } from "../dominio/accesos";

export function PantallaEmpresas() {
  return (
    <Estructura espacio="equipo" migas="Empresas">
      <ListaEmpresas />
    </Estructura>
  );
}
export function PantallaEmpresa() {
  return (
    <Estructura espacio="equipo" migas="Empresa">
      <DetalleEmpresa />
    </Estructura>
  );
}

const ROL_CLIENTE: Record<string, string> = { ADMIN_CLIENTE: "Administra la cuenta", APROBADOR: "Aprueba entregables", LECTOR: "Solo lectura" };
const ESTADO_EMPRESA: Record<string, [string, "verde" | "violeta" | "gris"]> = { ACTIVO: ["Activa", "verde"], PAUSADO: ["Pausada", "violeta"], BAJA: ["De baja", "gris"] };
const ESTADO_PROYECTO: Record<string, [string, "verde" | "violeta" | "gris"]> = { ACTIVO: ["Activo", "verde"], STANDBY: ["Standby", "violeta"], PAUSADO: ["Pausado", "gris"], FINALIZADO: ["Finalizado", "gris"] };
const MOTIVO: Record<S<"AccesoEmpresa">["motivo"], string> = { AM: "Account manager", ASIGNADO: "Asignado a la cuenta", PROYECTO: "Por sus proyectos", ADMIN: "Ve todas las cuentas" };
const iniciales = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function ListaEmpresas() {
  const { datos, error, recargar } = useConsulta<{ datos: S<"EmpresaResumen">[] }>("/panel/empresas");
  const [buscar, setBuscar] = useState("");
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!datos) return <Cargando />;
  const q = buscar.trim().toLowerCase();
  const xs = datos.datos.filter((e) => !q || e.nombre.toLowerCase().includes(q));
  return (
    <>
      <Cabecera antetitulo="Equipo Inoo · Agencia" titulo="Empresas" bajada="Inoo y cada cliente con su gente, sus proyectos y quién del equipo tiene acceso." />
      <div className="entrada" style={{ maxWidth: 360, marginBottom: 16 }}>
        <span className="icono-inicio">
          <LuSearch size={17} />
        </span>
        <input type="search" placeholder="Buscar empresa..." aria-label="Buscar empresa" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {xs.map((e) => (
          <Enlace key={e.id} a={`/equipo/empresas/${e.id}`} className="tarjeta" style={{ padding: 18, display: "grid", gap: 10, color: "inherit", textDecoration: "none" }}>
            <span className="fila" style={{ gap: 10 }}>
              <span className={`avatar avatar--cuadrado${e.tipo === "CLIENTE" ? " avatar--cliente" : ""}`} aria-hidden>{iniciales(e.nombre)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block" }}>{e.nombre}</strong>
                <span className="texto-xs texto-muted">{e.tipo === "AGENCIA" ? "La agencia" : "Cliente"}</span>
              </span>
              {e.estado && e.estado !== "ACTIVO" && <Etiqueta tono={ESTADO_EMPRESA[e.estado][1]}>{ESTADO_EMPRESA[e.estado][0]}</Etiqueta>}
            </span>
            <span className="texto-xs texto-muted" style={{ display: "grid", gap: 2 }}>
              <span>{plural(e.personas, e.tipo === "AGENCIA" ? "persona en el equipo" : "persona del cliente", e.tipo === "AGENCIA" ? "personas en el equipo" : "personas del cliente")}</span>
              <span>{plural(e.proyectosActivos, "proyecto activo", "proyectos activos")}</span>
              <span>{e.tipo === "AGENCIA" ? plural(e.equipoConAcceso, "persona ve todo", "personas ven todo") : plural(e.equipoConAcceso, "persona de Inoo con acceso", "personas de Inoo con acceso")}</span>
            </span>
          </Enlace>
        ))}
      </div>
      {!xs.length && <p className="texto-sm texto-muted">No hay empresas con ese nombre.</p>}
    </>
  );
}

function Bloque({ titulo, icono, accion, children }: { titulo: string; icono: ReactNode; accion?: ReactNode; children: ReactNode }) {
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12, alignContent: "start" }} aria-label={titulo}>
      <div className="fila entre" style={{ gap: 8 }}>
        <h2 className="tarjeta-titulo fila" style={{ gap: 8 }}>{icono}{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

const lista = { display: "grid", gap: 10, listStyle: "none", padding: 0, margin: 0 } as const;

function DetalleEmpresa() {
  const { params } = useNavegacion();
  const { datos: d, error, recargar } = useConsulta<S<"EmpresaDetalle">>(`/panel/empresas/${params.id ?? "inoo"}`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const e = d.empresa;
  const inoo = e.tipo === "AGENCIA";
  const admins = d.accesos.filter((a) => a.motivo === "ADMIN");
  const directos = d.accesos.filter((a) => a.motivo !== "ADMIN");
  return (
    <>
      <Cabecera
        antetitulo="Equipo Inoo · Empresas"
        titulo={e.nombre}
        bajada={inoo ? "La agencia: su equipo, sus proyectos internos y quién ve todas las cuentas." : "Su gente en el portal, sus proyectos y quién de Inoo entra a la cuenta."}
        accion={
          <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            <Enlace a="/equipo/empresas" className="boton">Todas las empresas</Enlace>
            {inoo ? <Enlace a="/equipo/organigrama" className="boton">Organigrama</Enlace> : <Enlace a={`/equipo/clientes/${e.id}`} className="boton">Ficha de cliente</Enlace>}
          </span>
        }
      />
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <Bloque titulo={inoo ? `Equipo (${d.gente.length})` : `Gente del cliente (${d.gente.length})`} icono={<LuUsers size={18} />}>
          {d.gente.length ? (
            <ul style={{ ...lista, maxHeight: 460, overflow: "auto" }}>
              {d.gente.map((g) => (
                <li key={g.id} className="fila" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span className="avatar" aria-hidden>{iniciales(g.nombre)}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                    <span className="texto-sm negrita">{g.nombre}</span>
                    <span className="texto-xs texto-muted">{[g.cargo, g.email].filter(Boolean).join(" · ")}</span>
                    <span className="fila" style={{ gap: 4, flexWrap: "wrap" }}>
                      {g.rolCliente && <Etiqueta sinPunto>{ROL_CLIENTE[g.rolCliente] ?? g.rolCliente}</Etiqueta>}
                      {g.invitacionPendiente && <Etiqueta tono="violeta" sinPunto>Invitación pendiente</Etiqueta>}
                      {g.area && <Etiqueta tono="azul" sinPunto>{NOMBRE_AREA[g.area as Area] ?? g.area}</Etiqueta>}
                      {g.nivel && <Etiqueta sinPunto>{NOMBRE_NIVEL[g.nivel as Nivel] ?? g.nivel}</Etiqueta>}
                      {g.esLead && <Etiqueta tono="verde" sinPunto>Lead</Etiqueta>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="texto-sm texto-muted">{inoo ? "No hay personas activas en el equipo." : "Nadie del cliente tiene usuario en el portal todavía."}</p>
          )}
          {!inoo && <p className="texto-xs texto-muted">Los usuarios del cliente los invita y administra su administrador desde su cuenta, o el equipo desde la ficha.</p>}
        </Bloque>

        <Bloque titulo={`Proyectos (${d.proyectos.length})`} icono={<LuFolderKanban size={18} />}>
          {d.proyectos.length ? (
            <ul style={lista}>
              {d.proyectos.map((x) => (
                <li key={x.servicioContratadoId} style={{ display: "grid", gap: 4 }}>
                  <span className="fila entre" style={{ gap: 8 }}>
                    <Enlace a={`/equipo/proyectos/${x.servicioContratadoId}`} className="enlace texto-sm negrita">{x.titulo}</Enlace>
                    <Etiqueta tono={ESTADO_PROYECTO[x.estado]?.[1] ?? "gris"}>{ESTADO_PROYECTO[x.estado]?.[0] ?? x.estado}</Etiqueta>
                  </span>
                  <span className="barra" aria-label={`Avance ${x.porcentaje} %`}><span style={{ width: `${x.porcentaje}%` }} /></span>
                  <span className="texto-xs texto-muted">{x.porcentaje} %{x.responsable ? ` · Responsable: ${x.responsable.nombre}` : " · Sin responsable"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="texto-sm texto-muted">{inoo ? "No hay proyectos internos. Se crean desde Proyectos con el cliente «Inoo (interno)»." : "Todavía no tiene proyectos."}</p>
          )}
        </Bloque>

        <Bloque titulo="Accesos del equipo" icono={<LuKeyRound size={18} />}>
          {directos.length > 0 && (
            <ul style={lista}>
              {directos.map((a) => (
                <li key={a.persona.id} className="fila" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span className="avatar" aria-hidden>{a.persona.iniciales}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
                    <span className="fila entre" style={{ gap: 6 }}>
                      <span className="texto-sm negrita">{a.persona.nombre}</span>
                      <Etiqueta tono={a.acceso === "COMPLETO" ? "verde" : "gris"} sinPunto>{a.acceso === "COMPLETO" ? "Toda la cuenta" : "Sus proyectos"}</Etiqueta>
                    </span>
                    <span className="texto-xs texto-muted">{[MOTIVO[a.motivo], a.persona.area && (NOMBRE_AREA[a.persona.area as Area] ?? a.persona.area)].filter(Boolean).join(" · ")}</span>
                    {a.proyectos.length > 0 && <span className="texto-xs">{a.proyectos.join(" · ")}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!directos.length && !inoo && <p className="texto-sm texto-muted">Nadie del equipo tiene esta cuenta asignada todavía.</p>}
          {admins.length > 0 && (
            <div style={{ display: "grid", gap: 6, borderTop: directos.length ? "1px solid var(--c-borde)" : undefined, paddingTop: directos.length ? 12 : 0 }}>
              <span className="texto-xs negrita texto-muted">VEN TODAS LAS CUENTAS (NIVEL ADMIN)</span>
              <span className="texto-sm">{admins.map((a) => a.persona.nombre).join(", ")}</span>
            </div>
          )}
          <p className="texto-xs texto-muted">
            {inoo ? "Los niveles se cambian en Equipo." : <>Las cuentas se asignan desde la <Enlace a={`/equipo/clientes/${e.id}`} className="enlace">ficha de cliente</Enlace> y los proyectos desde cada proyecto.</>}
          </p>
        </Bloque>
      </div>
    </>
  );
}
