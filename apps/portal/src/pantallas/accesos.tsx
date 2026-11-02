"use client";
/**
 * Accesos del equipo (2 nov 2026): quién trabaja en una cuenta o un proyecto, y asignar o quitar gente.
 * Asigna el nivel ADMIN a cualquiera o un lead a la gente de su área (las mismas reglas de la API).
 */
import { useState } from "react";
import { LuPlus, LuUsers, LuX } from "react-icons/lu";
import { api, ProblemaApi, useConsulta, type S } from "../base";
import { Etiqueta, useAviso, usePortal } from "../componentes";
import { puedeAsignar } from "../dominio/accesos";
import { NOMBRE_AREA } from "../dominio/ia-equipo";

const ORIGEN: Record<S<"AccesoPersona">["origen"], string> = { AM: "AM de la cuenta", RESPONSABLE: "Responsable", ASIGNADO: "Asignado" };

export function EquipoAsignado({ ruta, titulo, ayuda, soloNivelCuenta }: { ruta: string; titulo: string; ayuda: string; soloNivelCuenta?: boolean }) {
  const avisar = useAviso();
  const yo = usePortal().sesion?.usuario;
  const lista = useConsulta<{ datos: S<"AccesoPersona">[]; puedeAsignar: boolean }>(ruta);
  const equipo = useConsulta<{ datos: S<"PersonaEquipo">[] }>(lista.datos?.puedeAsignar ? "/panel/equipo" : null);
  const [eligiendo, setEligiendo] = useState(false);
  if (!lista.datos) return null;
  const ya = new Set(lista.datos.datos.map((a) => a.persona.id));
  const actor = yo ? { id: yo.id, rolEquipo: yo.rolEquipo ?? null, area: yo.area ?? null, nivelAcceso: yo.nivelAcceso ?? null, esLead: !!yo.esLead } : null;
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
