"use client";
/**
 * Requerimientos (reunión 12 oct): lo que la agencia necesita del cliente para avanzar. Es la única
 * sección donde el cliente opera: completa el formulario de cada requerimiento y lo envía. La fecha
 * límite cuenta días hábiles; cada día de atraso corre el cronograma del servicio.
 * El equipo pide requerimientos desde la ficha del cliente y revisa lo enviado en esta misma pantalla.
 */
import { Fragment, useRef, useState, type ReactNode } from "react";
import { LuCheck, LuCircleAlert, LuClipboardList, LuPaperclip, LuPlus, LuX } from "react-icons/lu";
import { api, clienteActivo, Enlace, fDiaMes, leerSesion, type ProblemaApi, useConsulta, useNavegacion, type S } from "../base";
import { Aviso, Cabecera, Cargando, ErrorCarga, Estructura, Etiqueta, Modal, useAviso, usePortal } from "../componentes";
import { camposVisibles, semaforoRequerimiento } from "../dominio/requerimientos";

type Req = S<"Requerimiento">;
type Lista = { datos: Req[]; pendientes: number; atrasados: number };

const ESTADO_REQ: Record<string, [string, "ambar" | "violeta" | "azul" | "verde" | "gris"]> = {
  PENDIENTE: ["Pendiente", "violeta"],
  OBSERVADO: ["Falta algo", "ambar"],
  ENVIADO: ["En revisión", "azul"],
  APROBADO: ["Recibido", "verde"],
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Desde 5 días hábiles de atraso el rojo se vuelve más intenso. */
const ATRASO_INTENSO = 5;

/** Luz del semáforo (verde, naranja o rojo) para lo que el cliente tiene pendiente. */
export function LuzSemaforo({ r }: { r: Req }) {
  const color = semaforoRequerimiento(r);
  if (!color) return null;
  return <span className="semaforo" data-color={color} data-intenso={r.diasAtraso >= ATRASO_INTENSO || undefined} aria-hidden />;
}

/** «A tiempo · vence el 8 oct», «Vence hoy», «Vence mañana» o «Atrasado 2 días hábiles»; con su color. */
export function PlazoRequerimiento({ r }: { r: Req }) {
  const color = semaforoRequerimiento(r);
  if (!color) return <span className="texto-xs texto-muted">{r.enviadoEn ? `Enviado el ${fDiaMes(r.enviadoEn)}` : ""}</span>;
  const texto =
    color === "ROJO"
      ? `Atrasado ${plural(r.diasAtraso, "día hábil", "días hábiles")}`
      : r.diasParaVencer === 0
        ? "Vence hoy a las 23:59"
        : r.diasParaVencer === 1
          ? `Vence el próximo día hábil (${fDiaMes(r.fechaLimite)})`
          : `A tiempo · vence el ${fDiaMes(r.fechaLimite)}`;
  return (
    <span className="texto-xs negrita texto-semaforo" data-color={color}>
      {texto}
    </span>
  );
}

export function FilaRequerimiento({ r, accion = "Completar" }: { r: Req; accion?: string }) {
  const [texto, tono] = ESTADO_REQ[r.estado];
  const pendiente = r.estado === "PENDIENTE" || r.estado === "OBSERVADO";
  const color = semaforoRequerimiento(r);
  return (
    <Enlace
      a={`/requerimientos/${r.id}`}
      className="fila-suave fila-req"
      data-semaforo={color ?? undefined}
      data-intenso={(color === "ROJO" && r.diasAtraso >= ATRASO_INTENSO) || undefined}
      style={{ padding: "14px 14px", textDecoration: "none", color: "inherit", alignItems: "center" }}
    >
      <span className="fila" style={{ gap: 12, minWidth: 0, alignItems: "flex-start" }}>
        {color && (
          <span style={{ paddingTop: 4 }}>
            <LuzSemaforo r={r} />
          </span>
        )}
        <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <span className="negrita" style={{ fontSize: 13 }}>{r.titulo}</span>
          <span className="texto-xs texto-muted">{r.servicioTitulo}</span>
          <PlazoRequerimiento r={r} />
        </span>
      </span>
      <span className="fila" style={{ gap: 10, flexShrink: 0 }}>
        <Etiqueta tono={tono}>{texto}</Etiqueta>
        {pendiente && <span className="texto-primario negrita texto-sm">{accion} →</span>}
      </span>
    </Enlace>
  );
}

// ═════════════════════════════════════════════ Lista del cliente

export function PantallaRequerimientos() {
  return (
    <Estructura espacio="cliente" migas="Requerimientos">
      <Requerimientos />
    </Estructura>
  );
}

function Requerimientos() {
  const { datos: d, error, recargar } = useConsulta<Lista>(`/clientes/${clienteActivo()}/requerimientos`);
  if (error) return <ErrorCarga error={error} reintentar={recargar} />;
  if (!d) return <Cargando />;
  const abiertos = d.datos.filter((r) => r.estado === "PENDIENTE" || r.estado === "OBSERVADO");
  const resto = d.datos.filter((r) => !abiertos.includes(r));
  return (
    <>
      <Cabecera titulo="Requerimientos" bajada="Lo que Inoo necesita de ti para avanzar con tus proyectos. Te toca a ti: el color te dice cuánto tiempo te queda." />
      {d.atrasados > 0 && (
        <Aviso icono={<LuCircleAlert size={18} />} tono="alerta" titulo={d.atrasados === 1 ? "Tienes un requerimiento atrasado" : `Tienes ${d.atrasados} requerimientos atrasados`}>
          No podemos avanzar sin esa información: cada día hábil de atraso corre la fecha de entrega del servicio.
        </Aviso>
      )}
      <section className="tarjeta seccion" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
        <h2 className="tarjeta-titulo">Por completar</h2>
        {abiertos.length === 0 ? (
          <div className="vacio" style={{ display: "grid", justifyItems: "center", gap: 8, padding: 24 }}>
            <LuClipboardList size={26} color="var(--c-muted)" />
            <span className="texto-sm texto-muted">No te pedimos nada por ahora. Te avisaremos por correo cuando necesitemos algo.</span>
          </div>
        ) : (
          <div className="lista-suave">
            {abiertos.map((r) => (
              <FilaRequerimiento key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>
      {resto.length > 0 && (
        <section className="tarjeta seccion" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
          <h2 className="tarjeta-titulo">Enviados</h2>
          <div className="lista-suave">
            {resto.map((r) => (
              <FilaRequerimiento key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ═════════════════════════════════════════════ Detalle: formulario (cliente) y revisión (equipo)

export function PantallaRequerimiento() {
  const equipo = typeof window !== "undefined" && leerSesion()?.tipo === "EQUIPO";
  return (
    <Estructura espacio={equipo ? "equipo" : "cliente"} migas="Requerimientos">
      <Requerimiento />
    </Estructura>
  );
}

type Archivo = { archivoId: string; nombre: string };
const vacio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

function Requerimiento() {
  const { params, ir } = useNavegacion();
  const { sesion } = usePortal();
  const avisar = useAviso();
  const { datos: r, error, recargar, setDatos } = useConsulta<Req>(`/requerimientos/${params.id}`);
  const [respuestas, setRespuestas] = useState<Record<string, unknown> | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState(false);
  if (error) return <ErrorCarga error={error} reintentar={error.status === 404 ? undefined : recargar} />;
  if (!r || !sesion) return <Cargando />;
  const esEquipo = sesion.usuario.tipo === "EQUIPO";
  const puedeResponder = !esEquipo && sesion.clientes[0]?.rol !== "LECTOR" && (r.estado === "PENDIENTE" || r.estado === "OBSERVADO");
  const valores = respuestas ?? r.respuestas;
  const cambiar = (clave: string, v: unknown) => setRespuestas({ ...valores, [clave]: v });

  const guardar = async (enviar: boolean) => {
    setErrores({});
    setOcupado(true);
    const limpias = Object.fromEntries(Object.entries(valores).filter(([, v]) => !vacio(v)));
    try {
      const nuevo = await api<Req>(`/requerimientos/${r.id}/respuesta`, { metodo: "PUT", cuerpo: { respuestas: limpias, enviar } });
      setDatos(nuevo);
      setRespuestas(null);
      avisar(enviar ? { titulo: "¡Enviado!", texto: "Tu equipo Inoo lo revisará y te avisará si falta algo." } : { titulo: "Borrador guardado", texto: "Puedes terminarlo después." });
      if (enviar) ir("/requerimientos");
    } catch (e) {
      const p = e as ProblemaApi;
      setErrores(Object.fromEntries(p.errores.map((x) => [x.campo, x.mensaje])));
      if (!p.errores.length) avisar({ titulo: p.titulo, texto: p.detalle });
    } finally {
      setOcupado(false);
    }
  };

  const [estado, tono] = ESTADO_REQ[r.estado];
  return (
    <>
      <Enlace a={esEquipo ? `/equipo/clientes/${clienteActivo()}` : "/requerimientos"} className="volver">
        ← {esEquipo ? "Ficha del cliente" : "Requerimientos"}
      </Enlace>
      <Cabecera antetitulo={r.servicioTitulo.toUpperCase()} titulo={r.titulo} bajada={r.descripcion ?? undefined} accion={<Etiqueta tono={tono}>{estado}</Etiqueta>} />
      <div className="con-lateral">
        <div className="pila">
          {r.estado === "OBSERVADO" && r.notaEquipo && (
            <Aviso icono={<LuCircleAlert size={18} />} tono="alerta" titulo="Tu equipo te pide corregir algo">
              {r.notaEquipo}
            </Aviso>
          )}
          {r.mensaje && (
            <Aviso icono={<LuClipboardList size={18} />} titulo={`Mensaje de ${r.creadoPor?.nombre ?? "tu equipo Inoo"}`}>
              {r.mensaje}
            </Aviso>
          )}
          <section className="tarjeta" style={{ padding: "22px 20px", display: "grid", gap: 18 }}>
            <CamposFormulario campos={r.campos} valores={valores} errores={errores} soloLectura={!puedeResponder} alCambiar={cambiar} />
            {puedeResponder && (
              <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
                <button className="boton boton--primario" disabled={ocupado} onClick={() => void guardar(true)}>
                  Enviar a Inoo
                </button>
                <button className="boton" disabled={ocupado} onClick={() => void guardar(false)}>
                  Guardar borrador
                </button>
              </div>
            )}
          </section>
          {esEquipo && r.estado === "ENVIADO" && <RevisionEquipo r={r} alRevisar={(x) => setDatos(x)} />}
        </div>
        <aside className="pila">
          <div className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 10 }}>
            <h3 className="tarjeta-titulo" style={{ fontSize: 14.5 }}>Plazo</h3>
            <PlazoRequerimiento r={r} />
            <span className="texto-xs texto-muted">Lo pedimos el {fDiaMes(r.emitidoEn)}. Fecha límite: {fDiaMes(r.fechaLimite)}, 23:59.</span>
            {!!r.diasCorridos && (
              <span className="texto-xs" style={{ color: "var(--c-alerta)" }}>
                Por este atraso, el cronograma del servicio se corrió {plural(r.diasCorridos ?? 0, "día hábil", "días hábiles")}.
              </span>
            )}
            <span className="texto-xs texto-muted" style={{ lineHeight: 1.5 }}>Cada día hábil de atraso corre la fecha de entrega del servicio.</span>
          </div>
        </aside>
      </div>
    </>
  );
}

/**
 * Las preguntas de un formulario (requerimiento o ingreso de cliente): con sus títulos de sección y solo las del camino
 * que eligió quien responde (`mostrarSi`, src/dominio/requerimientos.ts).
 */
export function CamposFormulario({ campos, valores, errores, soloLectura, alCambiar }: {
  campos: S<"CampoFormulario">[]; valores: Record<string, unknown>; errores: Record<string, string>; soloLectura: boolean; alCambiar: (clave: string, v: unknown) => void;
}) {
  const visibles = camposVisibles(campos, valores);
  return (
    <>
      {campos.filter((c) => visibles.has(c.clave)).map((c) => (
        <Fragment key={c.clave}>
          {c.seccion && <h3 className="tarjeta-titulo" style={{ fontSize: 15, marginTop: 6 }}>{c.seccion}</h3>}
          <CampoRequerimiento campo={c} valor={valores[c.clave]} error={errores[c.clave]} soloLectura={soloLectura} alCambiar={(v) => alCambiar(c.clave, v)} />
        </Fragment>
      ))}
    </>
  );
}

function CampoRequerimiento({ campo: c, valor, error, soloLectura, alCambiar }: { campo: S<"CampoFormulario">; valor: unknown; error?: string; soloLectura: boolean; alCambiar: (v: unknown) => void }) {
  const id = `campo-${c.clave}`;
  const ayuda = error ?? c.ayuda;
  const etiqueta = (
    <label htmlFor={id}>
      {c.etiqueta}
      {c.obligatorio && !soloLectura && <span className="texto-primario"> *</span>}
    </label>
  );
  let control: ReactNode;
  if (soloLectura) {
    control = <RespuestaLectura campo={c} valor={valor} />;
  } else if (c.tipo === "TEXTO_LARGO" || c.tipo === "LISTA") {
    control = (
      <div className="entrada">
        <textarea id={id} value={(valor as string) ?? ""} onChange={(e) => alCambiar(e.target.value)} aria-invalid={!!error} rows={c.tipo === "LISTA" ? 5 : 4} />
      </div>
    );
  } else if (c.tipo === "OPCION" && ((c.opciones ?? []).length > 5 || (c.opciones ?? []).some((o) => o.length > 40))) {
    // Muchas opciones o muy largas: lista desplegable, como en Monday.
    control = (
      <div className="entrada">
        <select id={id} value={(valor as string) ?? ""} onChange={(e) => alCambiar(e.target.value || undefined)} aria-invalid={!!error}>
          <option value="">Elige una opción</option>
          {(c.opciones ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  } else if (c.tipo === "OPCIONES") {
    const elegidas = (valor as string[] | undefined) ?? [];
    control = (
      <div className="chips" role="group" aria-labelledby={id}>
        {(c.opciones ?? []).map((o) => (
          <button key={o} type="button" className="chip" aria-pressed={elegidas.includes(o)} onClick={() => alCambiar(elegidas.includes(o) ? elegidas.filter((x) => x !== o) : [...elegidas, o])}>
            {elegidas.includes(o) && <LuCheck size={14} />} {o}
          </button>
        ))}
      </div>
    );
  } else if (c.tipo === "NUMERO") {
    control = (
      <div className="entrada">
        <input id={id} type="number" min={0} inputMode="numeric" value={valor === undefined || valor === null ? "" : String(valor)} onChange={(e) => alCambiar(e.target.value === "" ? undefined : Number(e.target.value))} aria-invalid={!!error} />
      </div>
    );
  } else if (c.tipo === "FECHA") {
    control = (
      <div className="entrada">
        <input id={id} type="date" value={(valor as string) ?? ""} onChange={(e) => alCambiar(e.target.value || undefined)} aria-invalid={!!error} />
      </div>
    );
  } else if (c.tipo === "OPCION" || c.tipo === "SI_NO") {
    const opciones: [unknown, string][] = c.tipo === "SI_NO" ? [[true, "Sí"], [false, "No"]] : (c.opciones ?? []).map((o) => [o, o]);
    control = (
      <div className="chips" role="radiogroup" aria-labelledby={id}>
        {opciones.map(([v, t]) => (
          <button key={t} type="button" className="chip" aria-pressed={valor === v} onClick={() => alCambiar(v)}>
            {t}
          </button>
        ))}
      </div>
    );
  } else if (c.tipo === "ARCHIVOS") {
    control = <SubirArchivos id={id} valor={(valor as Archivo[]) ?? []} alCambiar={alCambiar} />;
  } else {
    control = (
      <div className="entrada">
        <input id={id} type={c.tipo === "URL" ? "url" : "text"} placeholder={c.tipo === "URL" ? "https://" : undefined} value={(valor as string) ?? ""} onChange={(e) => alCambiar(e.target.value)} aria-invalid={!!error} />
      </div>
    );
  }
  return (
    <div className="campo">
      {etiqueta}
      {control}
      {ayuda && !soloLectura && (
        <span className="ayuda-campo" role={error ? "alert" : undefined} style={error ? { color: "var(--c-alerta)" } : undefined}>
          {ayuda}
        </span>
      )}
    </div>
  );
}

function RespuestaLectura({ campo: c, valor }: { campo: S<"CampoFormulario">; valor: unknown }) {
  if (vacio(valor)) return <p className="texto-sm texto-muted">Sin respuesta</p>;
  if (c.tipo === "SI_NO") return <p className="texto-sm">{valor ? "Sí" : "No"}</p>;
  if (c.tipo === "OPCIONES") return <p className="texto-sm">{(valor as string[]).join(" · ")}</p>;
  if (c.tipo === "FECHA") return <p className="texto-sm">{fDiaMes(String(valor))}</p>;
  if (c.tipo === "ARCHIVOS") {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {(valor as Archivo[]).map((a) => (
          <span key={a.archivoId} className="fila texto-sm" style={{ gap: 6 }}>
            <LuPaperclip size={14} /> {a.nombre}
          </span>
        ))}
      </div>
    );
  }
  return <p className="texto-sm" style={{ whiteSpace: "pre-line", lineHeight: 1.5 }}>{String(valor)}</p>;
}

const MIME_OK = ["image/jpeg", "image/png", "video/mp4", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

function SubirArchivos({ id, valor, alCambiar }: { id: string; valor: Archivo[]; alCambiar: (v: Archivo[]) => void }) {
  const avisar = useAviso();
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const subir = async (lista: FileList | null) => {
    if (!lista) return;
    setSubiendo(true);
    const nuevos: Archivo[] = [];
    for (const f of Array.from(lista)) {
      if (!MIME_OK.includes(f.type)) {
        avisar({ titulo: `${f.name} no se subió`, texto: "Usa JPG, PNG, MP4, PDF, DOCX o XLSX." });
        continue;
      }
      try {
        const r = await api<{ archivo: { id: string }; subida: { url: string; headers: Record<string, string> } }>(`/clientes/${clienteActivo()}/archivos`, {
          metodo: "POST",
          cuerpo: { nombre: f.name, mime: f.type, bytes: f.size, uso: "REQUERIMIENTO" },
          idempotente: true,
        });
        await fetch(r.subida.url, { method: "PUT", headers: r.subida.headers, body: f });
        await api(`/archivos/${r.archivo.id}/confirmar`, { metodo: "POST", cuerpo: {} });
        nuevos.push({ archivoId: r.archivo.id, nombre: f.name });
      } catch (e) {
        avisar({ titulo: `${f.name} no se subió`, texto: (e as ProblemaApi).titulo });
      }
    }
    alCambiar([...valor, ...nuevos]);
    setSubiendo(false);
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {valor.map((a) => (
        <span key={a.archivoId} className="fila-suave texto-sm" style={{ padding: "8px 12px" }}>
          <span className="fila" style={{ gap: 6 }}>
            <LuPaperclip size={14} /> {a.nombre}
          </span>
          <button type="button" className="enlace" aria-label={`Quitar ${a.nombre}`} onClick={() => alCambiar(valor.filter((x) => x.archivoId !== a.archivoId))}>
            <LuX size={14} />
          </button>
        </span>
      ))}
      <input ref={input} id={id} type="file" multiple hidden accept=".jpg,.jpeg,.png,.mp4,.pdf,.docx,.xlsx" onChange={(e) => void subir(e.target.files)} />
      <button type="button" className="boton" style={{ justifySelf: "start" }} disabled={subiendo} onClick={() => input.current?.click()}>
        <LuPaperclip size={16} /> {subiendo ? "Subiendo…" : "Adjuntar archivos"}
      </button>
    </div>
  );
}

function RevisionEquipo({ r, alRevisar }: { r: Req; alRevisar: (r: Req) => void }) {
  const avisar = useAviso();
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const revisar = async (decision: "APROBADO" | "OBSERVADO") => {
    setError(null);
    try {
      const x = await api<Req>(`/requerimientos/${r.id}/revision`, { metodo: "POST", cuerpo: decision === "OBSERVADO" ? { decision, nota } : { decision } });
      alRevisar(x);
      avisar({ titulo: decision === "APROBADO" ? "Requerimiento aprobado" : "Le pedimos al cliente que lo corrija" });
    } catch (e) {
      setError((e as ProblemaApi).errores[0]?.mensaje ?? (e as ProblemaApi).titulo);
    }
  };
  return (
    <section className="tarjeta" style={{ padding: "20px 18px", display: "grid", gap: 12 }}>
      <h2 className="tarjeta-titulo">Revisión del equipo</h2>
      <div className="campo">
        <label htmlFor="nota-revision">Si falta algo, cuéntale al cliente qué corregir</label>
        <div className="entrada">
          <textarea id="nota-revision" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        {error && (
          <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
            {error}
          </span>
        )}
      </div>
      <div className="fila" style={{ gap: 10 }}>
        <button className="boton boton--primario" onClick={() => void revisar("APROBADO")}>
          Aprobar
        </button>
        <button className="boton" onClick={() => void revisar("OBSERVADO")}>
          Pedir corrección
        </button>
      </div>
    </section>
  );
}

// ═════════════════════════════════════════════ Equipo: pedir y seguir requerimientos (ficha del cliente)

export function RequerimientosDelCliente({ clienteId }: { clienteId: string }) {
  const lista = useConsulta<Lista>(`/clientes/${clienteId}/requerimientos`);
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 12 }}>
      <div className="fila entre">
        <h3 className="tarjeta-titulo">Requerimientos al cliente</h3>
        <button className="boton boton--chico" onClick={() => setAbierto(true)}>
          <LuPlus size={14} /> Pedir requerimiento
        </button>
      </div>
      {!lista.datos ? (
        <Cargando />
      ) : lista.datos.datos.length === 0 ? (
        <p className="texto-xs texto-muted">Todavía no le pedimos nada a este cliente.</p>
      ) : (
        <div className="lista-suave">
          {lista.datos.datos.map((r) => (
            <FilaRequerimiento key={r.id} r={r} accion="Ver" />
          ))}
        </div>
      )}
      <PedirRequerimiento clienteId={clienteId} abierto={abierto} alCerrar={() => setAbierto(false)} alCrear={() => void lista.recargar()} />
    </div>
  );
}

const TIPO_CAMPO: Record<string, string> = {
  TEXTO: "Texto corto", TEXTO_LARGO: "Texto largo", LISTA: "Lista (una por línea)", URL: "Enlace", OPCION: "Una opción", OPCIONES: "Varias opciones", SI_NO: "Sí o no",
  ARCHIVOS: "Archivos", NUMERO: "Número", FECHA: "Fecha",
};

/**
 * Pedir un requerimiento (reunión 15 oct): primero el servicio, luego solo las plantillas que aplican a
 * ese servicio, y una vista previa de los campos que le llegarán al cliente.
 */
function PedirRequerimiento({ clienteId, abierto, alCerrar, alCrear }: { clienteId: string; abierto: boolean; alCerrar: () => void; alCrear: () => void }) {
  const avisar = useAviso();
  const plantillas = useConsulta<{ datos: S<"PlantillaRequerimiento">[] }>(abierto ? "/plantillas-requerimiento" : null);
  const servicios = useConsulta<S<"ServiciosCliente">>(abierto ? `/clientes/${clienteId}/servicios` : null);
  const [plantilla, setPlantilla] = useState("");
  const [servicio, setServicio] = useState("");
  const [dias, setDias] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const codigoServicio = servicios.datos?.servicios.find((s) => s.servicioContratadoId === servicio)?.codigo;
  const disponibles = (plantillas.datos?.datos ?? []).filter((p) => !p.servicios.length || (codigoServicio && p.servicios.includes(codigoServicio)));
  const elegida = disponibles.find((p) => p.codigo === plantilla);
  const pedir = async () => {
    setErrores({});
    try {
      await api(`/clientes/${clienteId}/requerimientos`, {
        metodo: "POST",
        cuerpo: { plantillaCodigo: plantilla, servicioContratadoId: servicio, mensaje: mensaje || undefined, diasHabiles: dias ? Number(dias) : undefined },
        idempotente: true,
      });
      avisar({ titulo: "Requerimiento enviado", texto: "El cliente recibe un correo con la fecha límite." });
      setPlantilla("");
      setServicio("");
      setDias("");
      setMensaje("");
      alCrear();
      alCerrar();
    } catch (e) {
      setErrores(Object.fromEntries((e as ProblemaApi).errores.map((x) => [x.campo, x.mensaje])));
    }
  };
  const error = (k: string) =>
    errores[k] ? (
      <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
        {errores[k]}
      </span>
    ) : null;
  return (
    <Modal abierto={abierto} alCerrar={alCerrar} etiqueta="Pedir requerimiento">
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Pedir requerimiento</h2>
      <div className="campo">
        <label htmlFor="req-servicio">¿Para qué servicio?</label>
        <select
          id="req-servicio"
          className="input"
          value={servicio}
          onChange={(e) => {
            setServicio(e.target.value);
            setPlantilla("");
          }}
        >
          <option value="">Elige un servicio</option>
          {servicios.datos?.servicios.map((s) => (
            <option key={s.servicioContratadoId} value={s.servicioContratadoId}>
              {s.titulo}
            </option>
          ))}
        </select>
        {error("servicioContratadoId")}
      </div>
      <div className="campo">
        <span className="rotulo" id="req-plantilla-rotulo">¿Qué le pedimos?</span>
        {!servicio ? (
          <span className="ayuda-campo">Elige primero el servicio para ver sus plantillas.</span>
        ) : (
          <div className="lista-suave" role="radiogroup" aria-labelledby="req-plantilla-rotulo">
            {disponibles.map((p) => (
              <button
                key={p.codigo}
                type="button"
                role="radio"
                aria-checked={plantilla === p.codigo}
                className={`fila-suave${plantilla === p.codigo ? " fila-suave--activa" : ""}`}
                style={{ border: 0, cursor: "pointer", textAlign: "left", padding: "10px 12px", font: "inherit", color: "inherit" }}
                onClick={() => setPlantilla(p.codigo)}
              >
                <span style={{ display: "grid", gap: 2 }}>
                  <span className="negrita" style={{ fontSize: 13 }}>{p.nombre}</span>
                  <span className="texto-xs texto-muted">{p.descripcion}</span>
                </span>
                <span className="texto-xs texto-muted" style={{ whiteSpace: "nowrap" }}>{p.diasHabiles} días hábiles</span>
              </button>
            ))}
          </div>
        )}
        {error("plantillaCodigo")}
      </div>
      {elegida && (
        <div className="tarjeta" style={{ padding: "14px 16px", display: "grid", gap: 8, boxShadow: "none" }} aria-label="Vista previa del formulario">
          <span className="etiqueta-direccion">Así le llega al cliente</span>
          <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
            {elegida.campos.map((c) => (
              <li key={c.clave} className="texto-sm">
                {c.etiqueta}
                {c.obligatorio && <span className="texto-primario"> *</span>}
                <span className="texto-xs texto-muted">
                  {" "}
                  · {TIPO_CAMPO[c.tipo] ?? c.tipo}
                  {(c.tipo === "OPCION" || c.tipo === "OPCIONES") && c.opciones?.length ? `: ${c.opciones.join(" / ")}` : ""}
                  {c.mostrarSi && ` · solo si «${elegida.campos.find((x) => x.clave === c.mostrarSi!.campo)?.etiqueta ?? c.mostrarSi.campo}» es ${c.mostrarSi.valores.join(" o ")}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="campo">
        <label htmlFor="req-dias">Plazo en días hábiles</label>
        <div className="entrada">
          <input id="req-dias" type="number" min={1} max={30} placeholder={elegida ? String(elegida.diasHabiles) : ""} value={dias} onChange={(e) => setDias(e.target.value)} />
        </div>
        {error("diasHabiles")}
      </div>
      <div className="campo">
        <label htmlFor="req-mensaje">Mensaje para el cliente (opcional)</label>
        <div className="entrada">
          <textarea id="req-mensaje" rows={2} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
        </div>
      </div>
      <button className="boton boton--primario boton--bloque" onClick={() => void pedir()}>
        Pedir al cliente
      </button>
    </Modal>
  );
}

// ═════════════════════════════════════════════ Equipo: aprobar el cambio de responsable

export function CambioResponsableEquipo({ clienteId }: { clienteId: string }) {
  const avisar = useAviso();
  const { datos: d, recargar } = useConsulta<{ responsable: S<"PersonaMini"> | null; solicitudes: S<"SolicitudResponsable">[] }>(`/clientes/${clienteId}/cambio-responsable`);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const x = d?.solicitudes.find((y) => y.estado === "PENDIENTE");
  if (!x) return null;
  const decidir = async (decision: "APROBADA" | "RECHAZADA") => {
    setError(null);
    try {
      await api(`/solicitudes-responsable/${x.id}/decision`, { metodo: "POST", cuerpo: decision === "RECHAZADA" ? { decision, nota } : { decision } });
      avisar({ titulo: decision === "APROBADA" ? `${x.nombre} ya tiene acceso` : "Solicitud rechazada", texto: decision === "APROBADA" ? "Contáctalo para explicarle el portal y cómo van sus proyectos." : undefined });
      void recargar();
    } catch (e) {
      setError((e as ProblemaApi).errores[0]?.mensaje ?? (e as ProblemaApi).titulo);
    }
  };
  return (
    <div className="tarjeta" style={{ padding: "22px 16px", display: "grid", gap: 10, border: "1.5px solid var(--c-primario)" }}>
      <h3 className="tarjeta-titulo">Cambio de responsable pendiente</h3>
      <p className="texto-sm">
        {x.solicitadoPor.nombre} pide que <strong>{x.nombre}</strong> siga la cuenta.
      </p>
      <p className="texto-xs texto-muted">
        {x.email} · {x.telefono}
        {x.cargo ? ` · ${x.cargo}` : ""}
        {x.motivo ? ` · «${x.motivo}»` : ""}
      </p>
      <p className="texto-xs texto-muted">{x.quitarAccesoAnterior ? `Al aprobar, ${x.solicitadoPor.nombre} deja de tener acceso.` : `${x.solicitadoPor.nombre} conserva su acceso.`}</p>
      <div className="campo">
        <label htmlFor="nota-responsable">Nota para el cliente (obligatoria si rechazas)</label>
        <div className="entrada">
          <textarea id="nota-responsable" rows={2} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        {error && (
          <span className="ayuda-campo" role="alert" style={{ color: "var(--c-alerta)" }}>
            {error}
          </span>
        )}
      </div>
      <div className="fila" style={{ gap: 10 }}>
        <button className="boton boton--primario" onClick={() => void decidir("APROBADA")}>
          Aprobar y dar acceso
        </button>
        <button className="boton" onClick={() => void decidir("RECHAZADA")}>
          Rechazar
        </button>
      </div>
    </div>
  );
}
