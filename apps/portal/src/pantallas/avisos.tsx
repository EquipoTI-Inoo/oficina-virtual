"use client";
/**
 * Avisos (reunión 12 oct): feriados, días no laborables, aniversario del cliente y avisos generales.
 * El cliente los ve en el recuadro «Estamos contigo» y en su Inicio; el equipo los publica aquí.
 * Nunca se avisan vacaciones del equipo: eso se resuelve internamente.
 * Los feriados y días no laborables dejan de contar como días hábiles en plazos y etapas.
 */
import { useState, type FormEvent } from "react";
import { LuTrash2 } from "react-icons/lu";
import { api, fCorta, type ProblemaApi, useConsulta, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, iconoAviso, textoAviso, TIPO_AVISO, useAviso } from "../componentes";

/** Banners del Inicio (el aniversario primero). */
export function AvisosInicio({ avisos }: { avisos: S<"Aviso">[] }) {
  if (!avisos.length) return null;
  return (
    <div className="pila" style={{ gap: 10, marginBottom: 20 }}>
      {avisos.slice(0, 3).map((a) => (
        <Aviso key={a.id} icono={iconoAviso(a.tipo)} titulo={a.tipo === "ANIVERSARIO" ? a.titulo : undefined}>
          {a.tipo === "ANIVERSARIO" ? a.mensaje : textoAviso(a)}
        </Aviso>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════ Equipo: publicar avisos

export function PantallaAvisosEquipo() {
  return (
    <Estructura espacio="equipo" migas="Avisos">
      <AvisosEquipo />
    </Estructura>
  );
}

function AvisosEquipo() {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: S<"Aviso">[] }>("/avisos");
  const clientes = useConsulta<{ datos: { id: string; nombre: string }[] }>("/clientes");
  const [f, setF] = useState({ tipo: "GENERAL", titulo: "", mensaje: "", fechaInicio: "", fechaFin: "", clienteId: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const publicar = async (e: FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      await api("/avisos", {
        metodo: "POST",
        cuerpo: { tipo: f.tipo, titulo: f.titulo, mensaje: f.mensaje || undefined, fechaInicio: f.fechaInicio, fechaFin: f.fechaFin || undefined, clienteId: f.tipo === "GENERAL" && f.clienteId ? f.clienteId : null },
      });
      avisar({ titulo: "Aviso publicado", texto: f.tipo === "GENERAL" ? "Los clientes lo verán desde 7 días antes." : "Ese día ya no cuenta como hábil en plazos y etapas." });
      setF({ ...f, titulo: "", mensaje: "", fechaInicio: "", fechaFin: "" });
      void lista.recargar();
    } catch (x) {
      setErrores(Object.fromEntries((x as ProblemaApi).errores.map((y) => [y.campo, y.mensaje])));
    }
  };
  const quitar = async (a: S<"Aviso">) => {
    if (!window.confirm(`¿Quitar «${a.titulo}»?`)) return;
    await api(`/avisos/${a.id}`, { metodo: "DELETE" }).catch(() => undefined);
    void lista.recargar();
  };
  const error = (k: string) =>
    errores[k] ? (
      <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
        {errores[k]}
      </span>
    ) : null;
  const nombreCliente = (id: string | null | undefined) => (id ? clientes.datos?.datos.find((c) => c.id === id)?.nombre ?? "Un cliente" : "Todos los clientes");
  return (
    <>
      <Cabecera titulo="Avisos" bajada="Feriados, días no laborables y avisos para los clientes. Nunca avises vacaciones del equipo: eso se resuelve internamente." />
      <div className="con-lateral">
        <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
          <h2 className="tarjeta-titulo">Próximos</h2>
          {lista.error ? (
            <ErrorCarga error={lista.error} reintentar={lista.recargar} />
          ) : !lista.datos ? (
            <Cargando />
          ) : (
            <div className="lista-suave">
              {lista.datos.datos.map((a) => (
                <div key={a.id} className="fila-suave" style={{ padding: "12px 14px" }}>
                  <span className="fila" style={{ gap: 10, alignItems: "flex-start" }}>
                    <span style={{ color: "var(--c-primario)", marginTop: 2 }}>{iconoAviso(a.tipo, 16)}</span>
                    <span style={{ display: "grid", gap: 3 }}>
                      <span className="negrita" style={{ fontSize: 13 }}>{a.titulo}</span>
                      <span className="texto-xs texto-muted">
                        {a.fechaInicio === a.fechaFin ? fCorta(a.fechaInicio) : `${fCorta(a.fechaInicio)} – ${fCorta(a.fechaFin)}`} · {nombreCliente(a.clienteId)}
                      </span>
                    </span>
                  </span>
                  <span className="fila" style={{ gap: 10 }}>
                    <Etiqueta tono={a.tipo === "GENERAL" ? "violeta" : "gris"}>{TIPO_AVISO[a.tipo]}</Etiqueta>
                    <button className="enlace" aria-label={`Quitar ${a.titulo}`} onClick={() => void quitar(a)}>
                      <LuTrash2 size={15} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
        <form className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }} onSubmit={publicar} noValidate>
          <h2 className="tarjeta-titulo">Nuevo aviso</h2>
          <div className="campo">
            <label htmlFor="aviso-tipo">Tipo</label>
            <select id="aviso-tipo" className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="GENERAL">Aviso general</option>
              <option value="FERIADO">Feriado</option>
              <option value="NO_LABORABLE">Día no laborable</option>
            </select>
            {error("tipo")}
          </div>
          <div className="campo">
            <label htmlFor="aviso-titulo">Título</label>
            <div className="entrada">
              <input id="aviso-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
            </div>
            {error("titulo")}
          </div>
          {f.tipo === "GENERAL" && (
            <>
              <div className="campo">
                <label htmlFor="aviso-mensaje">Mensaje (opcional)</label>
                <div className="entrada">
                  <textarea id="aviso-mensaje" rows={2} value={f.mensaje} onChange={(e) => setF({ ...f, mensaje: e.target.value })} />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="aviso-cliente">Para</label>
                <select id="aviso-cliente" className="input" value={f.clienteId} onChange={(e) => setF({ ...f, clienteId: e.target.value })}>
                  <option value="">Todos los clientes</option>
                  {clientes.datos?.datos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {error("clienteId")}
              </div>
            </>
          )}
          <div className="campo">
            <label htmlFor="aviso-inicio">Desde</label>
            <div className="entrada">
              <input id="aviso-inicio" type="date" value={f.fechaInicio} onChange={(e) => setF({ ...f, fechaInicio: e.target.value })} />
            </div>
            {error("fechaInicio")}
          </div>
          <div className="campo">
            <label htmlFor="aviso-fin">Hasta (opcional)</label>
            <div className="entrada">
              <input id="aviso-fin" type="date" value={f.fechaFin} onChange={(e) => setF({ ...f, fechaFin: e.target.value })} />
            </div>
            {error("fechaFin")}
          </div>
          <button className="boton boton--primario">Publicar aviso</button>
        </form>
      </div>
    </>
  );
}
