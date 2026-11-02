"use client";
/**
 * Jarvis del equipo (30 oct 2026). En «Costos de IA», el ADMIN ve el consumo por área contra sus topes
 * diario y mensual, los amplía y asigna el área de cada persona. Los bots de cada área y su chat están en la
 * sección «Jarvis» de la barra lateral (seccion-jarvis.tsx).
 */
import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import { api, ProblemaApi, useConsulta, type S } from "../base";
import { Barra, Cargando, ErrorCarga, Etiqueta, Modal, useAviso } from "../componentes";
import { AREAS, NOMBRE_AREA } from "../dominio/ia-equipo";

export const usd = (n: number) => `US$ ${n.toFixed(2).replace(".", ",")}`;
const pct = (n: number) => `${String(n).replace(".", ",")} %`;

export function EstadoArea({ a }: { a: S<"ConsumoArea"> }) {
  if (a.pausado) return <Etiqueta tono="rojo">{a.pausado === "DIARIO" ? "Pausada por hoy" : "Pausada este mes"}</Etiqueta>;
  if (a.alerta) return <Etiqueta tono="ambar">Cerca del tope</Etiqueta>;
  return <Etiqueta tono="verde">Disponible</Etiqueta>;
}

export function GastoContraTope({ gasto, tope, p }: { gasto: number; tope: number; p: number }) {
  return (
    <>
      <p className="negrita" style={{ fontSize: 11 }}>
        {usd(gasto)} / {usd(tope)} · {pct(p)}
      </p>
      <div style={{ marginTop: 6 }}>
        <Barra pct={Math.min(p, 100)} tono={p >= 80 ? "ambar" : undefined} />
      </div>
    </>
  );
}

/** Sección de «Costos de IA» (solo ADMIN). */
export function JarvisPorArea() {
  const r = useConsulta<S<"ReporteJarvis">>("/panel/ia-equipo");
  const [editando, setEditando] = useState<S<"ConsumoArea"> | null>(null);
  if (r.error?.status === 403) return null;
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const d = r.datos;
  const personas = [...d.areas.flatMap((a) => a.personas ?? []).map((x) => x.persona), ...d.sinArea].sort((a, b) => a.nombre.localeCompare(b.nombre));
  return (
    <div className="tarjeta seccion" style={{ padding: "22px 18px" }}>
      <div className="fila entre" style={{ marginBottom: 4 }}>
        <h2 className="tarjeta-titulo">Jarvis del equipo por área</h2>
        <span className="texto-sm negrita">{usd(d.totalMesUsd)} este mes</span>
      </div>
      <p className="texto-xs texto-muted" style={{ marginBottom: 16 }}>
        Cada área tiene un tope diario y uno mensual. Al llegar a cualquiera, los Jarvis del área se pausan hasta el día o el mes siguiente; puedes ampliarlo cuando quieras.
      </p>
      <div className="tabla-envoltura">
        <table className="tabla" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>Área</th>
              <th style={{ width: 200 }}>Hoy</th>
              <th style={{ width: 200 }}>Este mes</th>
              <th>Estado</th>
              <th>Personas</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {d.areas.map((a) => (
              <tr key={a.area} style={{ cursor: "default" }}>
                <td className="negrita">{a.nombre}</td>
                <td><GastoContraTope gasto={a.gastoDiaUsd} tope={a.topeDiarioUsd} p={a.pctDia} /></td>
                <td><GastoContraTope gasto={a.gastoMesUsd} tope={a.topeMensualUsd} p={a.pctMes} /></td>
                <td><EstadoArea a={a} /></td>
                <td className="texto-xs">
                  {(a.personas ?? []).length
                    ? a.personas!.map((x) => `${x.persona.nombre} (${usd(x.gastoMesUsd)}${x.llaveVigente ? "" : ", sin llave"})`).join(" · ")
                    : <span className="texto-muted">Nadie todavía</span>}
                </td>
                <td>
                  <button className="boton boton--chico" onClick={() => setEditando(a)} aria-label={`Editar topes de ${a.nombre}`}>
                    <LuPencil size={13} /> Topes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="tarjeta-titulo" style={{ fontSize: 14, margin: "22px 0 10px" }}>Área de cada persona</h3>
      {d.sinArea.length > 0 && (
        <p className="texto-xs" style={{ color: "var(--c-alerta)", marginBottom: 10 }}>
          {d.sinArea.length === 1 ? "1 persona no tiene área" : `${d.sinArea.length} personas no tienen área`}: no pueden usar Jarvis hasta que les asignes una.
        </p>
      )}
      <div className="pila" style={{ gap: 8 }}>
        {personas.map((p) => <AreaDePersona key={p.id} p={p} alCambiar={() => void r.recargar()} />)}
      </div>
      {editando && <EditarTopes a={editando} alCerrar={() => setEditando(null)} alGuardar={() => { setEditando(null); void r.recargar(); }} />}
    </div>
  );
}

function AreaDePersona({ p, alCambiar }: { p: S<"PersonaEquipo">; alCambiar: () => void }) {
  const avisar = useAviso();
  const cambiar = async (area: string) => {
    try {
      await api(`/panel/equipo/${p.id}`, { metodo: "PATCH", cuerpo: { area: area || null } });
      avisar({ titulo: `${p.nombre}: ${area ? NOMBRE_AREA[area as keyof typeof NOMBRE_AREA] : "sin área"}` });
      alCambiar();
    } catch (e) {
      avisar({ titulo: "No pudimos cambiar el área", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  return (
    <div className="fila entre texto-sm" style={{ gap: 12 }}>
      <span>{p.nombre} <span className="texto-muted">· {p.cargo ?? "Equipo"}</span></span>
      <select className="input" style={{ width: 180 }} aria-label={`Área de ${p.nombre}`} value={p.area ?? ""} onChange={(e) => void cambiar(e.target.value)}>
        <option value="">Sin área</option>
        {AREAS.map((a) => <option key={a} value={a}>{NOMBRE_AREA[a]}</option>)}
      </select>
    </div>
  );
}

function EditarTopes({ a, alCerrar, alGuardar }: { a: S<"ConsumoArea">; alCerrar: () => void; alGuardar: () => void }) {
  const [diario, setDiario] = useState(String(a.topeDiarioUsd));
  const [mensual, setMensual] = useState(String(a.topeMensualUsd));
  const [err, setErr] = useState<Record<string, string>>({});
  const avisar = useAviso();
  const guardar = async () => {
    setErr({});
    try {
      await api(`/panel/ia-equipo/areas/${a.area}`, { metodo: "PUT", cuerpo: { topeDiarioUsd: Number(diario.replace(",", ".")), topeMensualUsd: Number(mensual.replace(",", ".")) } });
      avisar({ titulo: `Topes de ${a.nombre} actualizados` });
      alGuardar();
    } catch (e) {
      if (e instanceof ProblemaApi && e.errores.length) setErr(Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])));
      else avisar({ titulo: "No pudimos guardar los topes" });
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={`Topes de ${a.nombre}`}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Topes de {a.nombre}</h2>
      <p className="texto-xs texto-muted">Hoy van {usd(a.gastoDiaUsd)} y este mes {usd(a.gastoMesUsd)}. Si el área está pausada y el nuevo tope lo permite, se reactiva al guardar.</p>
      <div className="fila" style={{ gap: 8 }}>
        <CampoUsd id="jv-diario" etiqueta="Tope diario (US$)" valor={diario} cambiar={setDiario} error={err.topeDiarioUsd} />
        <CampoUsd id="jv-mensual" etiqueta="Tope mensual (US$)" valor={mensual} cambiar={setMensual} error={err.topeMensualUsd} />
      </div>
      <button className="boton boton--primario boton--bloque" onClick={() => void guardar()}>
        Guardar
      </button>
    </Modal>
  );
}

function CampoUsd({ id, etiqueta, valor, cambiar, error }: { id: string; etiqueta: string; valor: string; cambiar: (v: string) => void; error?: string }) {
  return (
    <div className="campo" style={{ flex: 1 }}>
      <label htmlFor={id}>{etiqueta}</label>
      <div className="entrada">
        <input id={id} inputMode="decimal" value={valor} onChange={(e) => cambiar(e.target.value)} />
      </div>
      {error && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{error}</p>}
    </div>
  );
}
