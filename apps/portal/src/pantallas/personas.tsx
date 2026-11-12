"use client";
/**
 * Equipo de Inoo (2 nov 2026). Dos pantallas:
 *  · «Equipo» (permiso GESTIONAR_EQUIPO): altas, cambios y bajas de colaboradores, con su área, lead y jefe.
 *    Todo se refleja en InooWork, y lo que cambia allá llega aquí (src/dominio/personas-equipo.ts).
 *    El nivel, los permisos y quién es super usuario solo los cambia un super usuario (5 nov).
 *  · «Organigrama» (todo el equipo): quién reporta a quién.
 */
import { useState } from "react";
import { LuFlaskConical, LuNetwork, LuPencil, LuRefreshCw, LuUserPlus } from "react-icons/lu";
import { api, fCorta, ProblemaApi, useConsulta, type S } from "../base";
import { Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso, usePortal } from "../componentes";
import { NIVELES, NOMBRE_NIVEL, NOMBRE_PERMISO, permisosDe, PERMISOS, type Nivel, type Permiso } from "../dominio/accesos";
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
  const [traspasando, setTraspasando] = useState<Ficha | null>(null);
  const avisar = useAviso();
  const soySuper = !!usePortal().sesion?.usuario.esSuperUsuario;
  const esPrueba = !!usePortal().sesion?.usuario.esPrueba;
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
  const importar = async () => {
    try {
      const x = await api<{ empleadosLeidos: number; personasCreadas: number; personasActualizadas: number; empleadosSinCorreo: string[] }>("/panel/personas/importar-inoowork", { metodo: "POST", cuerpo: {} });
      avisar({
        titulo: `Equipo importado: ${x.personasCreadas} nuevas y ${x.personasActualizadas} actualizadas`,
        texto: x.empleadosSinCorreo.length ? `${x.empleadosSinCorreo.length} no entraron porque no tienen correo en InooWork: ${x.empleadosSinCorreo.join(", ")}.` : undefined,
      });
      void r.recargar();
    } catch (e) {
      avisar({ titulo: "No pudimos importar", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };
  const reintentar = async (p: Ficha) => {
    const x = await api<Ficha>(`/panel/personas/${p.id}/inoowork`, { metodo: "POST" }).catch(() => null);
    avisar({ titulo: x && x.inoowork.estado !== "PENDIENTE" ? `${p.nombre} ya está en InooWork` : "InooWork sigue sin responder", texto: x?.inoowork.error ?? undefined });
    void r.recargar();
  };

  /** pruebas@inoo.pe (6 nov): un enlace de un solo uso para ponerle o cambiarle la contraseña. */
  const enlacePruebas = async () => {
    try {
      const x = await api<{ ruta: string; email: string }>("/panel/cuenta-pruebas/enlace", { metodo: "POST" });
      const url = `${window.location.origin}${x.ruta}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      avisar({ titulo: "Enlace copiado", texto: `Ábrelo para poner la contraseña de ${x.email}. Sirve una sola vez. ${url}` });
    } catch (e) {
      avisar({ titulo: "No pudimos crear el enlace", texto: e instanceof ProblemaApi ? e.titulo : undefined });
    }
  };

  return (
    <>
      <Cabecera
        antetitulo="Agencia"
        titulo="Equipo"
        bajada="Quién trabaja en Inoo, qué ve cada persona y a quién reporta. Los cambios se reflejan en InooWork."
        accion={
          <span className="fila" style={{ gap: 8, flexWrap: "wrap" }}>
            {soySuper && !esPrueba && (
              <button className="boton" onClick={() => void enlacePruebas()} title="Para poner o cambiar la contraseña de pruebas@inoo.pe">
                <LuFlaskConical size={15} /> Cuenta de pruebas
              </button>
            )}
            {soySuper && r.datos.inooworkConectado && (
              <button className="boton" onClick={() => void importar()}>
                <LuRefreshCw size={15} /> Importar de InooWork
              </button>
            )}
            <button className="boton boton--primario" onClick={() => setEditando("nueva")}>
              <LuUserPlus size={16} /> Invitar colaborador
            </button>
          </span>
        }
      />
      {!r.datos.inooworkConectado && (
        <p className="texto-xs texto-muted" style={{ marginBottom: 12 }}>
          La conexión con InooWork está simulada: se activa al configurar INOOWORK_URL, una vez desplegado su parche de seguridad.
        </p>
      )}
      <div className="tabla-envoltura">
        <table className="tabla tabla--tarjetas">
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
                  <td className="texto-sm">{p.area ? NOMBRE_AREA[p.area] : <span style={{ color: "var(--c-alerta)" }}>Sin área</span>}{p.areasLideradas.length > 0 ? <span className="texto-xs texto-muted"> · lidera {p.areasLideradas.map((a) => NOMBRE_AREA[a]).join(", ")}</span> : p.esLead && <span className="texto-xs texto-muted"> · lead</span>}</td>
                  <td className="texto-sm">
                    {p.esSuperUsuario ? <Etiqueta tono="violeta">Super usuario</Etiqueta> : NOMBRE_NIVEL[p.nivel]}
                    {!p.esSuperUsuario && (p.nivelPersonalizado || Object.keys(p.permisosPersonalizados).length > 0) && <span className="texto-xs texto-muted"> · a medida</span>}
                  </td>
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
                      {(soySuper || !p.esSuperUsuario) && (
                        <>
                          <button className="boton boton--chico" onClick={() => setTraspasando(p)} aria-label={`Traspasar el trabajo de ${p.nombre}`}>Traspasar</button>
                          <button className="boton boton--chico" onClick={() => setEditando(p)} aria-label={`Editar a ${p.nombre}`}>
                            <LuPencil size={13} /> Editar
                          </button>
                          <button className="boton boton--chico" onClick={() => void activar(p, !p.activo)}>
                            {p.activo ? "Desactivar" : "Reactivar"}
                          </button>
                        </>
                      )}
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
      {traspasando && <TraspasarTrabajo persona={traspasando} equipo={todas.filter((x) => x.activo && x.id !== traspasando.id)} alCerrar={() => setTraspasando(null)} />}
      {editando && (
        <EditorPersona
          persona={editando === "nueva" ? null : editando}
          equipo={todas.filter((p) => p.activo)}
          soySuper={soySuper}
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

/** Sus cuentas, proyectos abiertos y tareas abiertas pasan a otra persona. Para cuando alguien se va o cambia de área. */
function TraspasarTrabajo({ persona, equipo, alCerrar }: { persona: Ficha; equipo: Ficha[]; alCerrar: () => void }) {
  const avisar = useAviso();
  const [a, setA] = useState("");
  const [enviando, setEnviando] = useState(false);
  const traspasar = async () => {
    setEnviando(true);
    try {
      const r = await api<{ cuentas: number; proyectos: number; tareas: number }>(`/panel/personas/${persona.id}/traspaso`, { metodo: "POST", cuerpo: { aId: a } });
      avisar({ titulo: "Trabajo traspasado", texto: `${r.cuentas} cuentas, ${r.proyectos} proyectos y ${r.tareas} tareas.` });
      alCerrar();
    } catch (e) {
      avisar({ titulo: "No pudimos traspasarlo", texto: e instanceof ProblemaApi ? e.errores[0]?.mensaje ?? e.titulo : undefined });
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={`Traspasar el trabajo de ${persona.nombre}`} ancho={460}>
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>Traspasar el trabajo de {persona.nombre}</h2>
      <p className="texto-xs texto-muted">Pasan a otra persona sus cuentas, sus proyectos abiertos y sus tareas abiertas. Los tableros de InooWork se cambian allá.</p>
      <Campo id="tr-a" etiqueta="Pasar a">
        <select id="tr-a" value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Elige a alguien</option>
          {equipo.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </Campo>
      <button className="boton boton--primario boton--bloque" disabled={!a || enviando} onClick={() => void traspasar()}>Traspasar</button>
    </Modal>
  );
}

const VALOR_PERMISO = { NIVEL: null, SI: true, NO: false } as const;
type ValorPermiso = keyof typeof VALOR_PERMISO;
const valorDePermiso = (v: boolean | undefined): ValorPermiso => (v === undefined ? "NIVEL" : v ? "SI" : "NO");

function EditorPersona({ persona, equipo, soySuper, alCerrar, alGuardar }: { persona: Ficha | null; equipo: Ficha[]; soySuper: boolean; alCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [correo, setCorreo] = useState(persona?.correo ?? "");
  const [cargo, setCargo] = useState(persona?.cargo ?? "");
  const [area, setArea] = useState<Area | "">(persona?.area ?? "");
  const [nivel, setNivel] = useState<Nivel | "">(persona?.nivelPersonalizado ?? "");
  const [esLead, setEsLead] = useState(persona?.esLead ?? false);
  const [jefe, setJefe] = useState(persona?.reportaAId ?? "");
  const [esSuper, setEsSuper] = useState(persona?.esSuperUsuario ?? false);
  const [lidera, setLidera] = useState<Area[]>(persona?.areasLideradas ?? []);
  const [permisos, setPermisos] = useState<Record<Permiso, ValorPermiso>>(() => Object.fromEntries(PERMISOS.map((x) => [x, valorDePermiso(persona?.permisosPersonalizados[x])])) as Record<Permiso, ValorPermiso>);
  const [err, setErr] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const avisar = useAviso();

  const guardar = async () => {
    setErr({});
    setGuardando(true);
    const cuerpo = {
      nombre, correo, cargo: cargo.trim() || null, area: area || null, nivel: nivel || null, esLead: !!area && esLead, reportaAId: jefe || null,
      ...(soySuper && persona ? { esSuperUsuario: esSuper, areasLideradas: AREAS.filter((a) => lidera.includes(a)), permisos: Object.fromEntries(PERMISOS.map((x) => [x, VALOR_PERMISO[permisos[x]]])) } : {}),
    };
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
  // Lo que daría su nivel con lo elegido en este formulario, sin contar los permisos a medida.
  const delNivel = permisosDe({ rolEquipo: persona?.rolEquipo ?? null, area: area || null, nivelAcceso: nivel || null });
  const nivelArea = area ? NOMBRE_NIVEL[area === "ADMINISTRACION" ? "ADMIN" : area === "CRM" || area === "COMERCIAL" ? "CUENTA" : "PROYECTO"].toLowerCase() : "por proyecto";

  return (
    <Modal abierto alCerrar={alCerrar} etiqueta={persona ? `Editar a ${persona.nombre}` : "Invitar colaborador"} ancho={520}>
      <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600 }}>{persona ? `Editar a ${persona.nombre}` : "Invitar colaborador"}</h2>
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
          <select id="pe-nivel" value={nivel} disabled={!soySuper} onChange={(e) => setNivel(e.target.value as Nivel | "")}>
            <option value="">Según su área ({nivelArea})</option>
            {NIVELES.map((n) => <option key={n} value={n}>{NOMBRE_NIVEL[n]}</option>)}
          </select>
        </Campo>
      </div>
      {!soySuper && <p className="texto-xs texto-muted">El acceso lo cambia un super usuario, también si el cambio de área le cambia el nivel a la persona.</p>}
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
      {soySuper && persona && (
        <fieldset className="pila" style={{ gap: 6, border: 0, padding: 0, margin: 0 }}>
          <legend className="negrita texto-sm" style={{ marginBottom: 4 }}>Áreas que lidera</legend>
          <p className="texto-xs texto-muted">Ve y edita los bots de Jarvis de esas áreas y su gente aparece en «Mi área» de su panel. Puede ser otra que su área (InooWork no lo cambia).</p>
          <div className="fila" style={{ gap: "6px 14px", flexWrap: "wrap" }}>
            {AREAS.map((a) => (
              <label key={a} className="fila texto-sm" style={{ gap: 6 }}>
                <input type="checkbox" checked={lidera.includes(a)} onChange={(e) => setLidera((xs) => (e.target.checked ? [...xs, a] : xs.filter((x) => x !== a)))} />
                {NOMBRE_AREA[a]}
              </label>
            ))}
          </div>
          {err.areasLideradas && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.areasLideradas}</p>}
        </fieldset>
      )}
      {soySuper && persona && (
        <section className="pila" style={{ gap: 8, borderTop: "1px solid var(--c-borde)", paddingTop: 12 }} aria-label="Permisos">
          <label className="fila texto-sm" style={{ gap: 8 }}>
            <input type="checkbox" checked={esSuper} onChange={(e) => setEsSuper(e.target.checked)} />
            Super usuario: ve todo y cambia niveles, permisos y quién es ADMIN
          </label>
          {err.esSuperUsuario && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.esSuperUsuario}</p>}
          {esSuper ? (
            <p className="texto-xs texto-muted">Un super usuario tiene todos los permisos.</p>
          ) : (
            <>
              <h3 className="negrita texto-sm">Permisos</h3>
              {PERMISOS.map((x) => (
                <div key={x} className="fila entre" style={{ gap: 12 }}>
                  <label htmlFor={`pe-permiso-${x}`} className="texto-sm">
                    <span style={{ display: "block" }}>{NOMBRE_PERMISO[x].titulo}</span>
                    <span className="texto-xs texto-muted">{NOMBRE_PERMISO[x].ayuda}</span>
                  </label>
                  <select id={`pe-permiso-${x}`} className="input" style={{ width: 170, flexShrink: 0 }} value={permisos[x]} onChange={(e) => setPermisos((p) => ({ ...p, [x]: e.target.value as ValorPermiso }))}>
                    <option value="NIVEL">Según su nivel ({delNivel.includes(x) ? "sí" : "no"})</option>
                    <option value="SI">Concedido</option>
                    <option value="NO">Quitado</option>
                  </select>
                </div>
              ))}
              {err.permisos && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.permisos}</p>}
            </>
          )}
          <HistorialAcceso personaId={persona.id} />
        </section>
      )}
      {err.activo && <p className="texto-xs" style={{ color: "var(--c-alerta)" }}>{err.activo}</p>}
      <button className="boton boton--primario boton--bloque" disabled={guardando} onClick={() => void guardar()}>
        {persona ? "Guardar" : "Invitar"}
      </button>
    </Modal>
  );
}

/** Qué cambió en el acceso de la persona, quién y cuándo. Solo lo ve un super usuario. */
function HistorialAcceso({ personaId }: { personaId: string }) {
  const r = useConsulta<{ datos: S<"CambioAcceso">[] }>(`/panel/personas/${personaId}/cambios-acceso`);
  if (!r.datos?.datos.length) return null;
  return (
    <details>
      <summary className="texto-xs enlace" style={{ cursor: "pointer" }}>Historial de accesos ({r.datos.datos.length})</summary>
      <ul className="pila" style={{ gap: 4, marginTop: 6, listStyle: "none", padding: 0 }}>
        {r.datos.datos.map((x) => (
          <li key={x.id} className="texto-xs">
            <span className="negrita">{x.campo}:</span> {x.antes} → {x.despues}
            <span className="texto-muted"> · {x.hechoPor?.nombre ?? "Sistema"}, {fCorta(x.creadoEn)}</span>
          </li>
        ))}
      </ul>
    </details>
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
