"use client";
/**
 * Equipo de Inoo (2 nov 2026). Dos pantallas:
 *  · «Equipo» (nivel ADMIN): altas, cambios y bajas de colaboradores, con su área, acceso, lead y jefe.
 *    Todo se refleja en InooWork, y lo que cambia allá llega aquí (src/dominio/personas-equipo.ts).
 *  · «Organigrama» (todo el equipo): quién reporta a quién.
 */
import { useState } from "react";
import { LuNetwork, LuPencil, LuRefreshCw, LuUserPlus } from "react-icons/lu";
import { api, ProblemaApi, useConsulta, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso } from "../componentes";
import { NIVELES, NOMBRE_NIVEL, type Nivel } from "../dominio/accesos";
import { AREAS, NOMBRE_AREA, type Area } from "../dominio/ia-equipo";

type Ficha = S<"FichaPersona">;
type Nodo = S<"NodoOrganigrama">;

const ESTADO_INOOWORK: Record<Ficha["inoowork"]["estado"], [string, "verde" | "gris" | "ambar"]> = {
  SINCRONIZADO: ["En InooWork", "verde"],
  SIMULADO: ["InooWork simulado", "gris"],
  PENDIENTE: ["Pendiente en InooWork", "ambar"],
};

export function PantallaPersonas() {
  return (
    <Estructura espacio="equipo" migas="Equipo">
      <Personas />
    </Estructura>
  );
}

function Personas() {
  const r = useConsulta<{ datos: Ficha[]; inooworkConectado: boolean }>("/panel/personas");
  const [editando, setEditando] = useState<Ficha | "nueva" | null>(null);
  const [verInactivas, setVerInactivas] = useState(false);
  const avisar = useAviso();
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const todas = r.datos.datos;
  const inactivas = todas.filter((p) => !p.activo).length;
  const lista = todas.filter((p) => verInactivas || p.activo);
  const nombreDe = (id: string | null) => todas.find((p) => p.id === id)?.nombre ?? null;

  const activar = async (p: Ficha, activo: boolean) => {
    if (!activo && !window.confirm(`¿Desactivar a ${p.nombre}? Pierde el acceso al portal y a InooWork. Sus registros se conservan y puedes reactivarla cuando quieras.`)) return;
    try {
      await api(`/panel/equipo/${p.id}`, { metodo: "PATCH", cuerpo: { activo } });
      avisar({ titulo: activo ? `${p.nombre} reactivada` : `${p.nombre} desactivada` });
      void r.recargar();
    } catch (e) {
      avisar({ titulo: "No pudimos guardar el cambio", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
    }
  };
  const reintentar = async (p: Ficha) => {
    const x = await api<Ficha>(`/panel/personas/${p.id}/inoowork`, { metodo: "POST" }).catch(() => null);
    avisar({ titulo: x && x.inoowork.estado !== "PENDIENTE" ? `${p.nombre} ya está en InooWork` : "InooWork sigue sin responder", texto: x?.inoowork.error ?? undefined });
    void r.recargar();
  };

  return (
    <>
      <Cabecera
        antetitulo="Agencia"
        titulo="Equipo"
        bajada="Quién trabaja en Inoo, qué ve cada persona y a quién reporta. Los cambios se reflejan en InooWork."
        accion={
          <button className="boton boton--primario" onClick={() => setEditando("nueva")}>
            <LuUserPlus size={16} /> Invitar colaborador
          </button>
        }
      />
      {!r.datos.inooworkConectado && (
        <p className="texto-xs texto-muted" style={{ marginBottom: 12 }}>
          La conexión con InooWork está simulada: se activa al configurar INOOWORK_URL, una vez desplegado su parche de seguridad.
        </p>
      )}
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Área</th>
              <th>Acceso</th>
              <th>Reporta a</th>
              <th>InooWork</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => {
              const [texto, tono] = ESTADO_INOOWORK[p.inoowork.estado];
              return (
                <tr key={p.id} style={{ cursor: "default", opacity: p.activo ? 1 : 0.6 }}>
                  <td>
                    <span className="negrita" style={{ display: "block" }}>{p.nombre}{!p.activo && <span className="texto-xs texto-muted"> · desactivada</span>}</span>
                    <span className="texto-xs texto-muted">{p.cargo ? `${p.cargo} · ` : ""}{p.correo}</span>
                  </td>
                  <td className="texto-sm">{p.area ? NOMBRE_AREA[p.area] : <span style={{ color: "var(--c-alerta)" }}>Sin área</span>}{p.esLead && <span className="texto-xs texto-muted"> · lead</span>}</td>
                  <td className="texto-sm">{NOMBRE_NIVEL[p.nivel]}{p.nivelPersonalizado && <span className="texto-xs texto-muted"> · a medida</span>}</td>
                  <td className="texto-sm">{nombreDe(p.reportaAId) ?? <span className="texto-muted">—</span>}</td>
                  <td>
                    <span title={p.inoowork.error ?? p.inoowork.empleadoId ?? undefined}><Etiqueta tono={tono}>{texto}</Etiqueta></span>
                  </td>
                  <td>
                    <span className="fila" style={{ gap: 6, justifyContent: "flex-end" }}>
                      {p.inoowork.estado === "PENDIENTE" && (
                        <button className="boton boton--chico" onClick={() => void reintentar(p)} aria-label={`Reintentar InooWork para ${p.nombre}`}>
                          <LuRefreshCw size={13} /> Reintentar
                        </button>
                      )}
                      <button className="boton boton--chico" onClick={() => setEditando(p)} aria-label={`Editar a ${p.nombre}`}>
                        <LuPencil size={13} /> Editar
                      </button>
                      <button className="boton boton--chico" onClick={() => void activar(p, !p.activo)}>
                        {p.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {inactivas > 0 && (
        <button className="enlace texto-xs" style={{ marginTop: 10 }} onClick={() => setVerInactivas((x) => !x)}>
          {verInactivas ? "Ocultar desactivadas" : `Ver desactivadas (${inactivas})`}
        </button>
      )}
      {editando && (
        <EditorPersona
          persona={editando === "nueva" ? null : editando}
          equipo={todas.filter((p) => p.activo)}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            void r.recargar();
          }}
        />
      )}
    </>
  );
}

function EditorPersona({ persona, equipo, alCerrar, alGuardar }: { persona: Ficha | null; equipo: Ficha[]; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [correo, setCorreo] = useState(persona?.correo ?? "");
  const [cargo, setCargo] = useState(persona?.cargo ?? "");
  const [area, setArea] = useState<Area | "">(persona?.area ?? "");
  const [nivel, setNivel] = useState<Nivel | "">(persona?.nivelPersonalizado ?? "");
  const [esLead, setEsLead] = useState(persona?.esLead ?? false);
  const [jefe, setJefe] = useState(persona?.reportaAId ?? "");
  const [err, setErr] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const avisar = useAviso();

  const guardar = async () => {
    setErr({});
    setGuardando(true);
    const cuerpo = { nombre, correo, cargo: cargo.trim() || null, area: area || null, nivel: nivel || null, esLead: !!area && esLead, reportaAId: jefe || null };
    try {
      const x = persona
        ? await api<Ficha>(`/panel/equipo/${persona.id}`, { metodo: "PATCH", cuerpo })
        : await api<Ficha>("/panel/personas", { metodo: "POST", cuerpo });
      avisar({
        titulo: persona ? `${x.nombre} actualizada` : `${x.nombre} ya es parte del equipo`,
        texto: x.inoowork.estado === "PENDIENTE" ? "InooWork no respondió: puedes reintentarlo desde la lista." : persona ? undefined : "Le llegará el correo de bienvenida.",
      });
      alGuardar();
    } catch (e) {
      if (e instanceof ProblemaApi && e.errores.length) setErr(Object.fromEntries(e.errores.map((x) => [x.campo, x.mensaje])));
      else avisar({ titulo: "No pudimos guardar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    } finally {
      setGuardando(false);
    }
  };
  const nivelArea = area ? NOMBRE_NIVEL[area === "ADMINISTRACION" ? "ADMIN" : area === "CRM" || area === "COMERCIAL" ? "CUENTA" : "PROYECTO"].toLowerCase() : "por proyecto";

  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={persona ? `Editar a ${persona.nombre}` : "Invitar colaborador"} ancho={520}>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>{persona ? `Editar a ${persona.nombre}` : "Invitar colaborador"}</h2>
      <p className="texto-xs texto-muted">
        {persona ? "Los datos, el área y el jefe también se cambian en InooWork." : "Se crea en el portal y en InooWork con este correo. En InooWork, RRHH le da la contraseña con «Restablecer contraseña»."}
      </p>
      <Campo id="pe-nombre" etiqueta="Nombre" error={err.nombre}>
        <input id="pe-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
      </Campo>
      <Campo id="pe-correo" etiqueta="Correo" error={err.correo}>
        <input id="pe-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" />
      </Campo>
      <Campo id="pe-cargo" etiqueta="Cargo (opcional)" error={err.cargo}>
        <input id="pe-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} autoComplete="off" />
      </Campo>
      <div className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
        <Campo id="pe-area" etiqueta="Área" error={err.area} flex>
          <select id="pe-area" value={area} onChange={(e) => setArea(e.target.value as Area | "")}>
            <option value="">Sin área</option>
            {AREAS.map((a) => <option key={a} value={a}>{NOMBRE_AREA[a]}</option>)}
          </select>
        </Campo>
        <Campo id="pe-nivel" etiqueta="Acceso" error={err.nivel} flex>
          <select id="pe-nivel" value={nivel} onChange={(e) => setNivel(e.target.value as Nivel | "")}>
            <option value="">Según su área ({nivelArea})</option>
            {NIVELES.map((n) => <option key={n} value={n}>{NOMBRE_NIVEL[n]}</option>)}
          </select>
        </Campo>
      </div>
      <label className="fila texto-sm" style={{ gap: 8 }}>
        <input type="checkbox" checked={!!area && esLead} disabled={!area} onChange={(e) => setEsLead(e.target.checked)} />
        Lead de su área: asigna a su gente y ve su carga y su calendario
      </label>
      <Campo id="pe-jefe" etiqueta="Reporta a" error={err.reportaAId}>
        <select id="pe-jefe" value={jefe} onChange={(e) => setJefe(e.target.value)}>
          <option value="">Nadie (primer nivel del organigrama)</option>
          {equipo.filter((p) => p.id !== persona?.id).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.cargo ? ` · ${p.cargo}` : ""}</option>)}
        </select>
      </Campo>
      <button className="boton boton--primario boton--bloque" disabled={guardando} onClick={() => void guardar()}>
        {persona ? "Guardar" : "Invitar"}
      </button>
    </Modal>
  );
}

function Campo({ id, etiqueta, error, flex, children }: { id: string; etiqueta: string; error?: string; flex?: boolean; children: React.ReactNode }) {
  return (
    <div className="campo" style={flex ? { flex: "1 1 180px" } : undefined}>
      <label htmlFor={id}>{etiqueta}</label>
      <div className="entrada">{children}</div>
      {error && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{error}</p>}
    </div>
  );
}

// ───────────────────────────────────────────── organigrama

export function PantallaOrganigrama() {
  return (
    <Estructura espacio="equipo" migas="Organigrama">
      <Organigrama />
    </Estructura>
  );
}

function Organigrama() {
  const r = useConsulta<{ datos: Nodo[] }>("/panel/organigrama");
  const [area, setArea] = useState<Area | "">("");
  if (r.error) return <ErrorCarga error={r.error} reintentar={r.recargar} />;
  if (!r.datos) return <Cargando />;
  const personas = r.datos.datos;
  const hijos = new Map<string | null, Nodo[]>();
  for (const p of personas) hijos.set(p.reportaAId, [...(hijos.get(p.reportaAId) ?? []), p]);
  const raices = hijos.get(null) ?? [];
  const areas = AREAS.filter((a) => personas.some((p) => p.area === a));
  return (
    <>
      <Cabecera
        antetitulo="Equipo Inoo"
        titulo="Organigrama"
        bajada={`${personas.length} ${personas.length === 1 ? "persona" : "personas"} en el equipo. Quién reporta a quién.`}
        accion={
          <label className="fila texto-sm" style={{ gap: 8 }}>
            <span className="texto-muted">Resaltar</span>
            <select className="input" style={{ width: 170 }} value={area} onChange={(e) => setArea(e.target.value as Area | "")} aria-label="Resaltar un área">
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{NOMBRE_AREA[a]}</option>)}
            </select>
          </label>
        }
      />
      {!personas.length ? (
        <p className="texto-sm texto-muted">Todavía no hay nadie en el equipo.</p>
      ) : (
        <div className="organigrama" role="tree" aria-label="Organigrama de Inoo">
          <ul>
            {raices.map((p) => <Rama key={p.id} p={p} hijos={hijos} area={area} />)}
          </ul>
        </div>
      )}
    </>
  );
}

function Rama({ p, hijos, area }: { p: Nodo; hijos: Map<string | null, Nodo[]>; area: Area | "" }) {
  const suyos = hijos.get(p.id) ?? [];
  const apagado = !!area && p.area !== area;
  return (
    <li role="treeitem" aria-expanded={suyos.length ? true : undefined}>
      <div className={`org-nodo${apagado ? " org-nodo--apagado" : ""}`}>
        <span className="org-avatar" aria-hidden>{p.iniciales}</span>
        <span className="org-datos">
          <span className="negrita">{p.nombre}</span>
          <span className="texto-xs texto-muted">{p.cargo ?? "Equipo"}</span>
          <span className="texto-xs">
            {p.area ? NOMBRE_AREA[p.area] : "Sin área"}
            {p.esLead && <span className="org-lead"> · Lead</span>}
          </span>
        </span>
        {suyos.length > 0 && <span className="org-cuenta" title={`${suyos.length} le reportan`}><LuNetwork size={11} /> {suyos.length}</span>}
      </div>
      {suyos.length > 0 && (
        <ul role="group">
          {suyos.map((h) => <Rama key={h.id} p={h} hijos={hijos} area={area} />)}
        </ul>
      )}
    </li>
  );
}
