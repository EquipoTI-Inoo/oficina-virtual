"use client";
import { useState } from "react";
import { LuChevronDown, LuChevronLeft, LuChevronRight, LuCircleCheck } from "react-icons/lu";
import { clienteActivo, Enlace, PERIODO_DEMO, useConsulta, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta } from "../componentes";

type PiezaUI = S<"PiezaResumen"> & { formato?: string; diseno?: { fondo?: string; titular?: string; bajada?: string; eyebrow?: string; foto?: boolean } };

// ═════════════════════════════════════════════ Plan del mes (tablero)

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Qué significa cada columna (solo «Por revisar» depende del cliente). */
const AYUDA_COLUMNA: Record<string, string> = {
  PLANIFICADO: "Ideas aprobadas que todavía no empezamos.",
  EN_PRODUCCION: "Las estamos creando o ajustando.",
  POR_REVISAR: "Esperan la aprobación del cliente.",
  APROBADO: "Listas para publicar en su fecha.",
  PUBLICADO: "Ya están en tus canales.",
};

type TarjetaTablero = PiezaUI & { ajustando: boolean };

// Plan del mes: salió del portal del cliente (reunión 12 oct) y queda como vista del equipo.
export function PantallaPlanMes() {
  return (
    <Estructura espacio="equipo" migas="Plan del mes">
      <PlanMes />
    </Estructura>
  );
}

function PlanMes() {
  const [servicio, setServicio] = useState("");
  const [periodo, setPeriodo] = useState(PERIODO_DEMO);
  const servicios = useConsulta<S<"ServiciosCliente">>(`/clientes/${clienteActivo()}/servicios`);
  const tablero = useConsulta<S<"Tablero">>(`/clientes/${clienteActivo()}/tablero?periodo=${periodo}${servicio ? `&servicioContratadoId=${servicio}` : ""}`);
  const [anio, mes] = periodo.split("-").map(Number);
  const mover = (d: number) => {
    const f = new Date(Date.UTC(anio, mes - 1 + d, 1));
    setPeriodo(`${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const t = tablero.datos;
  const total = t?.columnas.reduce((n, c) => n + c.piezas.length, 0) ?? 0;

  return (
    <>
      <Cabecera
        antetitulo={`Casa Oliva · ${MESES[mes - 1]} ${anio}`.toUpperCase()}
        titulo="Plan del mes"
        bajada="Las piezas del mes por estado. Solo se publica lo que el cliente aprueba."
        accion={
          <label className="boton" style={{ position: "relative", gap: 10 }}>
            <LuChevronDown size={16} />
            <select aria-label="Filtrar por servicio" value={servicio} onChange={(e) => setServicio(e.target.value)} style={{ appearance: "none", border: 0, background: "none", fontWeight: 600, fontSize: 13.5, outline: "none", cursor: "pointer" }}>
              <option value="">Todos los servicios</option>
              {servicios.datos?.servicios
                .filter((s) => s.cantidadMensual > 0)
                .map((s) => (
                  <option key={s.servicioContratadoId} value={s.servicioContratadoId}>
                    {s.nombre}
                  </option>
                ))}
            </select>
          </label>
        }
      />
      <div className="fila entre fila-filtros" style={{ marginBottom: 20 }}>
        <div className="fila" style={{ gap: 16 }}>
          <button className="enlace" style={{ color: "var(--c-tinta)" }} aria-label="Mes anterior" onClick={() => mover(-1)}>
            <LuChevronLeft size={18} />
          </button>
          <h2 className="cal-mes" style={{ fontSize: 22, fontWeight: 600, textTransform: "capitalize", textAlign: "center" }}>
            {MESES[mes - 1]} {anio}
          </h2>
          <button className="enlace" style={{ color: "var(--c-tinta)" }} aria-label="Mes siguiente" onClick={() => mover(1)}>
            <LuChevronRight size={18} />
          </button>
        </div>
        {periodo !== PERIODO_DEMO && (
          <button className="boton" onClick={() => setPeriodo(PERIODO_DEMO)}>
            Mes actual
          </button>
        )}
      </div>

      {tablero.error ? (
        <ErrorCarga error={tablero.error} reintentar={tablero.recargar} />
      ) : !t ? (
        <Cargando />
      ) : !t.planAprobado ? (
        <div className="tarjeta vacio">El plan de {MESES[mes - 1]} todavía no está aprobado.</div>
      ) : total === 0 ? (
        <div className="tarjeta vacio">No hay piezas planificadas para {MESES[mes - 1]}.</div>
      ) : (
        <>
          {t.porRevisar > 0 && (
            <Aviso icono={<LuCircleCheck size={18} />} titulo={t.porRevisar === 1 ? "1 pieza espera al cliente" : `${t.porRevisar} piezas esperan al cliente`}>
              Si se acerca la fecha de publicación, recuérdale al cliente que las revise.
            </Aviso>
          )}
          <div className="tablero" aria-busy={tablero.cargando}>
            {t.columnas.map((c) => (
              <section key={c.clave} className={`tablero-col${c.clave === "POR_REVISAR" ? " tablero-col--accion" : ""}`} aria-label={`${c.titulo}: ${c.piezas.length}`}>
                <header className="tablero-cab">
                  <span className="negrita">{c.titulo}</span>
                  <span className="tablero-contador">{c.piezas.length}</span>
                </header>
                <p className="tablero-ayuda">{AYUDA_COLUMNA[c.clave]}</p>
                {c.piezas.length === 0 && <p className="tablero-vacio">Nada por aquí.</p>}
                {(c.piezas as TarjetaTablero[]).map((p) => {
                  const fecha = p.fechaProgramada ? `${Number(p.fechaProgramada.slice(8, 10))} ${MESES_CORTOS[Number(p.fechaProgramada.slice(5, 7)) - 1]}` : null;
                  const abre = c.clave !== "PLANIFICADO" && c.clave !== "EN_PRODUCCION";
                  const cuerpo = (
                    <>
                      <span className="tablero-titulo">{p.titulo}</span>
                      <span className="tablero-meta">
                        {p.formato ?? "Pieza"} · {p.canal}
                      </span>
                      {p.ajustando && (
                        <Etiqueta tono="ambar" sinPunto>
                          Ajustando comentarios
                        </Etiqueta>
                      )}
                      <span className="tablero-pie">
                        {fecha && <span>{c.clave === "PUBLICADO" ? `Publicada el ${fecha}` : `Se publica el ${fecha}`}</span>}
                        {c.clave === "POR_REVISAR" && <span className="texto-primario negrita">Abrir →</span>}
                      </span>
                    </>
                  );
                  return abre ? (
                    <Enlace key={p.id} a={`/equipo/piezas/${p.id}`} className="tablero-tarjeta tablero-tarjeta--enlace">
                      {cuerpo}
                    </Enlace>
                  ) : (
                    <div key={p.id} className="tablero-tarjeta">
                      {cuerpo}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
          <p className="texto-xs texto-muted" style={{ margin: "20px 0" }}>
            {total} piezas en {MESES[mes - 1]}. Las fechas son previstas hasta su publicación.
          </p>
        </>
      )}
    </>
  );
}
