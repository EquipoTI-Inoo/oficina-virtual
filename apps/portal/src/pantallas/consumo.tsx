"use client";
/**
 * Soporte por consumo (reunión 15 oct, fase 15): el soporte continuo no tiene etapas. Se muestra la
 * bolsa del mes como fichas con medidor (lo usado contra lo incluido), una por recurso, y WhatsApp
 * ilimitado aparte. El estado nunca va solo por color: «Por agotarse» y «Excedido» llevan texto e ícono.
 */
import { LuMessageCircle, LuTriangleAlert } from "react-icons/lu";
import { api, fDiaMes, nombreMes, PERIODO_DEMO, useConsulta, type ProblemaApi, type S } from "../base";
import { AvanceLineal, Cargando, useAviso } from "../componentes";

type Consumo = S<"ConsumoSoporte">;
type Recurso = Consumo["recursos"][number];

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));
const unidad = (r: Recurso) => (r.clave === "HORAS_MEET" ? " h" : "");
const ESTADO: Record<Recurso["nivel"], string | null> = { OK: null, ALERTA: "Por agotarse", EXCEDIDO: "Excedido" };

function Medidor({ r }: { r: Recurso }) {
  const pct = r.incluido > 0 ? Math.min(100, (r.usado / r.incluido) * 100) : r.usado > 0 ? 100 : 0;
  return (
    <span
      className={`medidor medidor--${r.nivel.toLowerCase()}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={r.incluido}
      aria-valuenow={r.usado}
      aria-label={`${r.etiqueta}: ${fmt(r.usado)} de ${fmt(r.incluido)}${unidad(r)}`}
      title={`${r.etiqueta}: ${fmt(r.usado)} de ${fmt(r.incluido)}${unidad(r)}`}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

function EstadoRecurso({ r }: { r: Recurso }) {
  const t = r.nivel === "ALERTA" && r.usado >= r.incluido ? "Agotado" : ESTADO[r.nivel];
  if (!t) return null;
  return (
    <span className={`texto-xs estado-consumo estado-consumo--${r.nivel.toLowerCase()}`}>
      <LuTriangleAlert size={12} aria-hidden /> {t}
    </span>
  );
}

/** La bolsa del mes. `compacto`: una línea por recurso (tarjetas de Inicio y Mis servicios). */
export function BolsaDelMes({ consumo: c, compacto }: { consumo: Consumo; compacto?: boolean }) {
  if (compacto) {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <span className="texto-xs texto-muted">Bolsa de {nombreMes(c.periodo)}</span>
        {c.recursos.map((r) => (
          <div key={r.clave} className="consumo-linea texto-xs">
            <span className="texto-muted">{r.etiqueta}</span>
            <Medidor r={r} />
            <span className="negrita" style={{ whiteSpace: "nowrap" }}>
              {fmt(r.usado)} de {fmt(r.incluido)}{unidad(r)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="grid-3 consumo-fichas">
        {c.recursos.map((r) => (
          <div key={r.clave} className="consumo-ficha">
            <span className="texto-xs texto-muted">{r.etiqueta}</span>
            <span>
              <span className="consumo-valor">{fmt(r.usado)}</span>
              <span className="texto-sm texto-muted"> de {fmt(r.incluido)}{unidad(r)}</span>
            </span>
            <Medidor r={r} />
            <EstadoRecurso r={r} />
          </div>
        ))}
      </div>
      {c.whatsappIlimitado && (
        <span className="texto-xs texto-muted fila" style={{ gap: 6 }}>
          <LuMessageCircle size={14} aria-hidden /> WhatsApp ilimitado durante todo el mes
        </span>
      )}
    </div>
  );
}

/** El avance de un servicio: etapas o, si es por consumo, su bolsa. */
export function AvanceOConsumo({ s, compacto }: { s: { avance: S<"AvanceProyecto">; consumo?: Consumo }; compacto?: boolean }) {
  return s.consumo ? <BolsaDelMes consumo={s.consumo} compacto /> : <AvanceLineal avance={s.avance} compacto={compacto} />;
}

/** La bolsa del soporte, leída de la API (perfil del proyecto). */
export function ConsumoDelServicio({ servicioId, version = "" }: { servicioId: string; version?: string }) {
  const { datos } = useConsulta<Consumo>(`/servicios-contratados/${servicioId}/consumo?periodo=${PERIODO_DEMO}&v=${encodeURIComponent(version)}`);
  return datos ? <BolsaDelMes consumo={datos} /> : <Cargando />;
}

/** Equipo: los tickets del soporte en el mes, para clasificar su complejidad (cuenta contra la bolsa). */
export function TicketsDelSoporte({ clienteId, servicioId, alCambiar }: { clienteId: string; servicioId: string; alCambiar: () => void }) {
  const avisar = useAviso();
  const lista = useConsulta<{ datos: S<"Ticket">[] }>(`/clientes/${clienteId}/tickets?servicioContratadoId=${servicioId}`);
  const delMes = (lista.datos?.datos ?? []).filter((t) => t.creadoEn.startsWith(PERIODO_DEMO));
  const clasificar = async (t: S<"Ticket">, complejidad: string) => {
    try {
      await api(`/tickets/${t.id}`, { metodo: "PATCH", cuerpo: { complejidad } });
      void lista.recargar();
      alCambiar();
    } catch (e) {
      avisar({ titulo: "No se pudo clasificar", texto: (e as ProblemaApi).titulo });
    }
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h3 className="tarjeta-titulo" style={{ fontSize: 14 }}>Tickets de {nombreMes(PERIODO_DEMO)}</h3>
      {!lista.datos && <Cargando />}
      {lista.datos && !delMes.length && <p className="texto-xs texto-muted">Sin tickets este mes.</p>}
      {delMes.map((t) => (
        <div key={t.id} className="fila entre texto-sm" style={{ gap: 10 }}>
          <span>
            <span className="negrita">{t.codigo} · {t.asunto}</span>
            <span className="texto-xs texto-muted" style={{ display: "block" }}>{fDiaMes(t.creadoEn)}</span>
          </span>
          <select className="input" style={{ width: 130 }} aria-label={`Complejidad de ${t.codigo}`} value={t.complejidad ?? "BASICO"} onChange={(e) => void clasificar(t, e.target.value)}>
            <option value="BASICO">Básico</option>
            <option value="COMPLEJO">Complejo</option>
          </select>
        </div>
      ))}
    </div>
  );
}
