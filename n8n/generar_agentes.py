"""
Genera n8n/workflows/marketing-jefe/agentes-de-contenido.json a partir de los prompts de prompts/.

    python n8n/generar_agentes.py

Un solo workflow con dos entradas (eventos firmados del portal y pedido manual) y dos ramas:
  · Jefe de Marketing (Claude): planifica el mes → POST /integraciones/calendarios.
  · Producción del mes (Gemini Flash): una versión por pieza aprobada (copies, blogs, guiones y brief visual
    de estáticos) → POST /integraciones/piezas.
Cada rama reporta su consumo en POST /integraciones/ejecuciones. Solo usa nodos estándar (webhook, code,
if, httpRequest, respondToWebhook) para que funcione igual en n8n 1.x y 2.x.
"""
import json
import pathlib
import re
import uuid

RAIZ = pathlib.Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "n8n/workflows/marketing-jefe/agentes-de-contenido.json"

CRED_PORTAL = {"httpHeaderAuth": {"id": "PortalApiKey0001", "name": "Portal Inoo · X-Api-Key"}}
CRED_GEMINI = {"httpHeaderAuth": {"id": "GeminiInooKey001", "name": "Gemini · Inoo"}}
CRED_ANTHROPIC = {"httpHeaderAuth": {"id": "AnthropicInoo001", "name": "Anthropic · Inoo"}}
CLAUDE = "claude-sonnet-5-5"
GEMINI = "gemini-flash-latest"


def prompt(ruta):
    """Sistema y plantilla del usuario de un archivo de prompts/ (sin el bloque de ejemplo JSON del final)."""
    t = (RAIZ / "prompts" / ruta).read_text(encoding="utf8")
    sistema = re.search(r"## Sistema\n(.*?)\n## Usuario", t, re.S).group(1).strip()
    usuario = re.search(r"## Usuario\n(.*)", t, re.S).group(1).strip()
    return {"sistema": sistema, "usuario": usuario}


PROMPTS = {
    "jefe": prompt("marketing-jefe/calendario-mensual.md"),
    "copies": prompt("contenido/copies.md"),
    "blog": prompt("contenido/blog.md"),
    "guion": prompt("audiovisual/guion.md"),
    "visual": prompt("estaticos/brief-visual.md"),
}

COMUN = r"""
// Rellena {{a.b.c}} con los datos; listas separadas por coma y vacío como «—».
const rellenar = (t, d) => t.replace(/{{\s*([\w.]+)\s*}}/g, (_, k) => {
  const v = k.split('.').reduce((o, x) => (o == null ? undefined : o[x]), d);
  return Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '—' : String(v);
});
// El JSON de la respuesta del modelo, aunque venga entre ``` o con texto alrededor.
const leerJson = (t) => {
  const limpio = String(t || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(limpio); } catch (e) {}
  return JSON.parse(limpio.slice(limpio.indexOf('{'), limpio.lastIndexOf('}') + 1));
};
// Nombre del modelo en la tabla de tarifas del portal (tarifa_modelo).
const tarifa = (m) => {
  m = String(m || '');
  if (m.startsWith('claude')) return m.replace(/-(\d+)-(\d+)$/, '-$1.$2');
  if (m.includes('flash-lite')) return 'gemini-3.5-flash-lite';
  return 'gemini-3.8-flash';
};
"""

nodos = []
conexiones = {}


def nodo(nombre, tipo, version, posicion, parametros, **extra):
    n = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"inoo-agentes/{nombre}")),
        "name": nombre,
        "type": tipo,
        "typeVersion": version,
        "position": posicion,
        "parameters": parametros,
        **extra,
    }
    nodos.append(n)
    return nombre


def codigo(nombre, posicion, js, por_item=False):
    p = {"jsCode": (COMUN + js).strip()}
    if por_item:
        p["mode"] = "runOnceForEachItem"
    return nodo(nombre, "n8n-nodes-base.code", 2, posicion, p)


def http(nombre, posicion, metodo, url, credencial, cuerpo=None, headers=None, timeout=30000, nunca_error=False, pausa_ms=0):
    p = {"method": metodo, "url": url, "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth"}
    if headers:
        p["sendHeaders"] = True
        p["headerParameters"] = {"parameters": [{"name": k, "value": v} for k, v in headers.items()]}
    if cuerpo:
        p.update({"sendBody": True, "specifyBody": "json", "jsonBody": cuerpo})
    p["options"] = {"timeout": timeout, **({"response": {"response": {"neverError": True}}} if nunca_error else {})}
    if pausa_ms:
        # De a un pedido por vez, para no pasar el límite de pedidos por minuto del proveedor.
        p["options"]["batching"] = {"batch": {"batchSize": 1, "batchInterval": pausa_ms}}
    return nodo(nombre, "n8n-nodes-base.httpRequest", 4.2, posicion, p, credentials=credencial, retryOnFail=True, maxTries=3, waitBetweenTries=5000)


def si(nombre, posicion, expresion):
    return nodo(nombre, "n8n-nodes-base.if", 2, posicion, {
        "conditions": {
            "options": {"caseSensitive": True, "typeValidation": "loose"},
            "combinator": "and",
            "conditions": [{
                "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"inoo-agentes/si/{nombre}")),
                "leftValue": expresion, "rightValue": True,
                "operator": {"type": "boolean", "operation": "true", "singleValue": True},
            }],
        },
        "options": {},
    })


def unir(desde, hacia, salida=0):
    ramas = conexiones.setdefault(desde, {"main": []})["main"]
    while len(ramas) <= salida:
        ramas.append([])
    ramas[salida].append({"node": hacia, "type": "main", "index": 0})


PORTAL = "={{ $env.PORTAL_API_URL }}/api/v1"
# Datos del pedido (cliente, periodo, comentario, piezas), leídos siempre del nodo «Pedido».
PEDIDO = "$('Pedido').first().json"
# En los parámetros de los nodos HTTP, n8n 1.123 no resuelve $('Nodo') (queda vacío); $node["Nodo"] sí.
PEDIDO_URL = '$node["Pedido"].json'

# ───────────────────────────── entradas

evento = nodo("Evento del portal", "n8n-nodes-base.webhook", 2, [0, 300],
              {"httpMethod": "POST", "path": "inoo-eventos", "responseMode": "responseNode", "options": {"rawBody": True}},
              webhookId="7b2a1f0e-1c4d-4f6a-9b3e-inoo-eventos")
manual = nodo("Pedido manual", "n8n-nodes-base.webhook", 2, [0, 560],
              {"httpMethod": "POST", "path": "agentes/planificar", "responseMode": "responseNode", "options": {}},
              webhookId="8c3b2a1f-2d5e-4a7b-8c4f-inoo-manual")

decidir_evento = codigo("Verificar firma y decidir", [240, 300], r"""
// Firma del despachador del outbox (src/servidor/outbox.ts): sha256=HMAC(secreto, "<timestamp>.<cuerpo>").
const crypto = require('crypto');
const item = $input.first();
const h = item.json.headers || {};
const secreto = $env.INOO_WEBHOOK_SECRETO;
if (!secreto) throw new Error('Falta INOO_WEBHOOK_SECRETO en las variables de n8n');
const crudo = (await this.helpers.getBinaryDataBuffer(0, 'data')).toString('utf8');
const ts = String(h['x-inoo-timestamp'] || '');
const firma = String(h['x-inoo-firma'] || '');
const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(ts + '.' + crudo).digest('hex');
const reciente = Math.abs(Date.now() / 1000 - Number(ts)) < 300;
const igual = firma.length === esperada.length && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
if (!reciente || !igual) return [{ json: { valido: false } }];
const e = JSON.parse(crudo);
const d = e.datos || {};
// Qué hace cada evento: el brief confirmado y los cambios al calendario los planifica el Jefe de Marketing;
// el calendario aprobado pasa a producción. El resto se ignora (los correos los manda el portal).
let accion = 'IGNORAR';
if (e.tipo === 'brief.confirmado' || e.tipo === 'calendario.cambios_solicitados') accion = 'PLANIFICAR';
if (e.tipo === 'calendario.aprobado') accion = 'PRODUCIR';
return [{ json: { valido: true, accion, evento: e.tipo, clienteId: e.clienteId, periodo: d.periodo, comentario: d.comentario || '', piezaIds: d.piezaIds || [] } }];
""")

decidir_manual = codigo("Verificar pedido manual", [240, 560], r"""
// Pedido manual (el equipo relanza a un agente): mismo secreto que los eventos, en la cabecera X-Inoo-Interno.
const item = $input.first();
const h = item.json.headers || {};
const b = item.json.body || {};
const valido = Boolean($env.INOO_WEBHOOK_SECRETO) && h['x-inoo-interno'] === $env.INOO_WEBHOOK_SECRETO;
const accion = b.accion === 'PRODUCIR' ? 'PRODUCIR' : 'PLANIFICAR';
return [{ json: { valido, accion, evento: 'manual', clienteId: b.clienteId, periodo: b.periodo, comentario: b.comentario || '', piezaIds: b.piezaIds || [] } }];
""")

valido = si("¿Válido?", [480, 420], "={{ $json.valido }}")
rechazar = nodo("Rechazar (401)", "n8n-nodes-base.respondToWebhook", 1.1, [720, 560],
                {"respondWith": "json", "responseBody": '={{ { "error": "firma o secreto inválido" } }}', "options": {"responseCode": 401}})
recibido = nodo("Recibido (200)", "n8n-nodes-base.respondToWebhook", 1.1, [720, 300],
                {"respondWith": "json", "responseBody": '={{ { "accion": $json.accion } }}', "options": {"responseCode": 200}})
pedido = codigo("Pedido", [960, 160], "return $input.all();")
planificar = si("¿Planificar?", [960, 300], "={{ $json.accion === 'PLANIFICAR' }}")
producir = si("¿Producir?", [1200, 560], "={{ $json.accion === 'PRODUCIR' }}")

unir(evento, decidir_evento)
unir(manual, decidir_manual)
unir(decidir_evento, valido)
unir(decidir_manual, valido)
unir(valido, pedido, 0)
unir(pedido, recibido)
unir(valido, rechazar, 1)
unir(recibido, planificar)
unir(planificar, producir, 1)

# ───────────────────────────── Jefe de Marketing (Claude)

y = 100
leer_cliente = http("Leer cliente", [1200, y], "GET", PORTAL + f"/clientes/{{{{ {PEDIDO_URL}.clienteId }}}}", CRED_PORTAL)
leer_servicios = http("Leer servicios", [1440, y], "GET", PORTAL + f"/clientes/{{{{ {PEDIDO_URL}.clienteId }}}}/servicios?periodo={{{{ {PEDIDO_URL}.periodo }}}}", CRED_PORTAL)
leer_brief = http("Leer brief", [1680, y], "GET", PORTAL + f"/clientes/{{{{ {PEDIDO_URL}.clienteId }}}}/briefs/{{{{ {PEDIDO_URL}.periodo }}}}", CRED_PORTAL, nunca_error=True)
leer_refs = http("Leer referencias", [1920, y], "GET", PORTAL + f"/clientes/{{{{ {PEDIDO_URL}.clienteId }}}}/referencias", CRED_PORTAL)
prompt_jefe = codigo("Prompt del Jefe de Marketing", [2160, y], f"""
const P = {json.dumps(PROMPTS["jefe"], ensure_ascii=False)};
const pedido = {PEDIDO};
const cliente = $('Leer cliente').first().json;
const servicios = ($('Leer servicios').first().json.servicios || []).filter((s) => s.estado === 'ACTIVO' && (s.entregables || []).length);
const brief = $('Leer brief').first().json || {{}};
const refs = ($('Leer referencias').first().json.datos || []);
if (!servicios.length) throw new Error('El cliente no tiene servicios con piezas mensuales');
const datos = {{
  cliente,
  periodo: pedido.periodo,
  servicios: servicios.map((s) => '- ' + s.titulo + ' (servicioContratadoId: ' + s.servicioContratadoId + '): ' + s.entregables.map((e) => e.cantidadMensual + ' ' + e.tipoPieza).join(', ')).join('\\n'),
  referencias: refs.length ? refs.map((r) => '- ' + r.titulo + (r.notas ? ': ' + r.notas : '') + (r.url ? ' (' + r.url + ')' : '')).join('\\n') : '(sin referencias)',
  brief: {{ objetivoComunicacion: brief.objetivoComunicacion, consideraciones: brief.consideraciones }},
  comentarios: pedido.comentario || '',
}};
const usuario = rellenar(P.usuario, datos) + '\\n\\nLos tipos válidos son exactamente los de la cuota (' + [...new Set(servicios.flatMap((s) => s.entregables.map((e) => e.tipoPieza)))].join(', ') + '). Las fechas, dentro de ' + pedido.periodo + '.';
return [{{ json: {{ cuerpo: {{ model: '{CLAUDE}', max_tokens: 8000, system: P.sistema, messages: [{{ role: 'user', content: usuario }}] }} }} }}];
""")
claude = http("Claude · Jefe de Marketing", [2400, y], "POST", "https://api.anthropic.com/v1/messages", CRED_ANTHROPIC,
              cuerpo="={{ JSON.stringify($json.cuerpo) }}", headers={"anthropic-version": "2023-06-01"}, timeout=240000)
leer_propuesta = codigo("Leer la propuesta", [2640, y], f"""
const pedido = {PEDIDO};
const r = $input.first().json;
const texto = (r.content || []).map((c) => c.text || '').join('');
const j = leerJson(texto);
const servicios = ($('Leer servicios').first().json.servicios || []).map((s) => s.servicioContratadoId);
const TIPOS = ['BLOG', 'COPY', 'ESTATICO', 'CARRUSEL', 'PORTADA', 'GUION', 'SHOTLIST', 'STORYBOARD', 'ANUNCIO'];
const entradas = (j.entradas || [])
  .filter((e) => TIPOS.includes(e.tipo) && String(e.fechaProgramada || '').startsWith(pedido.periodo) && e.titulo)
  .map((e) => ({{
    tipo: e.tipo, titulo: String(e.titulo).slice(0, 200), canal: e.canal || undefined,
    // 10:00 de Lima: la hora la ajusta el equipo al programar.
    fechaProgramada: String(e.fechaProgramada).slice(0, 10) + 'T15:00:00Z',
    objetivo: e.objetivo || undefined, pilar: e.pilar || undefined,
    servicioContratadoId: servicios.includes(e.servicioContratadoId) ? e.servicioContratadoId : undefined,
  }}));
if (!entradas.length) throw new Error('La propuesta del modelo no trajo publicaciones válidas');
return [{{ json: {{
  propuesta: {{ clienteId: pedido.clienteId, periodo: pedido.periodo, resumen: j.resumen || undefined, entradas }},
  consumo: {{ proveedor: 'anthropic', modelo: tarifa(r.model), tokensEntrada: r.usage?.input_tokens || 0, tokensSalida: r.usage?.output_tokens || 0 }},
}} }}];
""")
guardar_propuesta = http("Guardar propuesta", [2880, y], "POST", PORTAL + "/integraciones/calendarios", CRED_PORTAL, cuerpo="={{ JSON.stringify($json.propuesta) }}")
ejec_jefe = codigo("Ejecución del Jefe de Marketing", [3120, y], f"""
const p = $('Leer la propuesta').first().json;
return [{{ json: {{ ejecucion: {{
  clienteId: p.propuesta.clienteId, agente: 'marketing-jefe', n8nWorkflowId: $workflow.id, n8nExecutionId: String($execution.id),
  estado: 'OK', consumos: [p.consumo],
}} }} }}];
""")
registrar_jefe = http("Registrar ejecución (Jefe de Marketing)", [3360, y], "POST", PORTAL + "/integraciones/ejecuciones", CRED_PORTAL, cuerpo="={{ JSON.stringify($json.ejecucion) }}")

for a, b in [(leer_cliente, leer_servicios), (leer_servicios, leer_brief), (leer_brief, leer_refs), (leer_refs, prompt_jefe),
             (prompt_jefe, claude), (claude, leer_propuesta), (leer_propuesta, guardar_propuesta), (guardar_propuesta, ejec_jefe), (ejec_jefe, registrar_jefe)]:
    unir(a, b)
unir(planificar, leer_cliente, 0)

# ───────────────────────────── Producción del mes (Gemini Flash)

y = 760
leer_cliente_p = http("Leer cliente (producción)", [1440, y], "GET", PORTAL + f"/clientes/{{{{ {PEDIDO_URL}.clienteId }}}}", CRED_PORTAL)
leer_refs_p = http("Leer referencias (producción)", [1680, y], "GET", PORTAL + f"/clientes/{{{{ {PEDIDO_URL}.clienteId }}}}/referencias", CRED_PORTAL)
leer_piezas_mes = http("Leer piezas del mes", [1800, y + 180], "GET",
                       PORTAL + f"/clientes/{{{{ {PEDIDO_URL}.clienteId }}}}/piezas?periodo={{{{ {PEDIDO_URL}.periodo }}}}", CRED_PORTAL)
# El evento calendario.aprobado trae los ids; el pedido manual no, y entonces van todas las piezas del mes.
una_pieza = codigo("Una pieza por ítem", [1920, y], f"""
const ids = {PEDIDO}.piezaIds || [];
const delMes = ($input.first().json.datos || []).map((p) => p.id);
return (ids.length ? ids : delMes).map((piezaId) => ({{ json: {{ piezaId }} }}));
""")
leer_pieza = http("Leer pieza", [2160, y], "GET", PORTAL + "/piezas/{{ $json.piezaId }}", CRED_PORTAL)
prompt_pieza = codigo("Prompt de cada pieza", [2400, y], f"""
const P = {json.dumps({k: PROMPTS[k] for k in ("copies", "blog", "guion", "visual")}, ensure_ascii=False)};
const cliente = $('Leer cliente (producción)').first().json;
const refs = ($('Leer referencias (producción)').first().json.datos || []);
const referencias = refs.length ? refs.map((r) => r.titulo + (r.notas ? ': ' + r.notas : '') + (r.paleta?.length ? ' (paleta ' + r.paleta.join(', ') + ')' : '')).join('; ') : '(sin referencias)';
// Qué agente hace cada tipo de pieza.
const AGENTE = {{
  COPY: ['contenido-copies', 'copies', 1500], ANUNCIO: ['contenido-copies', 'copies', 1500],
  BLOG: ['contenido-blog', 'blog', 8000],
  GUION: ['audiovisual-asistido', 'guion', 2500], SHOTLIST: ['audiovisual-asistido', 'guion', 2500], STORYBOARD: ['audiovisual-asistido', 'guion', 2500],
  ESTATICO: ['estaticos', 'visual', 2500], CARRUSEL: ['estaticos', 'visual', 2500], PORTADA: ['estaticos', 'visual', 2500],
}};
const salida = [];
for (const it of $input.all()) {{
  const pieza = it.json;
  const a = AGENTE[pieza.tipo];
  // Solo las piezas sin contenido: las que ya tienen una versión no se pisan.
  if (!a || (pieza.versionActual || 0) > 0) continue;
  const [agente, plantilla, maxTokens] = a;
  const datos = {{
    cliente, referencias, comentarios: '',
    pieza: {{ ...pieza, resumen: pieza.resumen || pieza.titulo, fechaProgramada: String(pieza.fechaProgramada || '').slice(0, 10) }},
    fuentes: '(sin fuentes: no incluyas cifras, estudios ni datos verificables; escribe desde hábitos y experiencia)',
  }};
  salida.push({{ json: {{
    pieza: {{ id: pieza.id, tipo: pieza.tipo, titulo: pieza.titulo, periodo: pieza.periodo, canal: pieza.canal }}, agente, clienteId: cliente.id,
    cuerpo: {{
      systemInstruction: {{ parts: [{{ text: P[plantilla].sistema }}] }},
      contents: [{{ role: 'user', parts: [{{ text: rellenar(P[plantilla].usuario, datos) }}] }}],
      generationConfig: {{ responseMimeType: 'application/json', maxOutputTokens: maxTokens, thinkingConfig: {{ thinkingLevel: 'low' }} }},
    }},
  }} }});
}}
return salida;
""")
gemini = http("Gemini · cada pieza", [2640, y], "POST", f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI}:generateContent", CRED_GEMINI,
              cuerpo="={{ JSON.stringify($json.cuerpo) }}", timeout=240000, pausa_ms=7000)
# Si falla una pieza (cuota, filtro de seguridad), las demás se guardan igual; la fallida queda en borrador.
next(n for n in nodos if n["name"] == gemini)["onError"] = "continueRegularOutput"
contenido = codigo("Contenido de cada pieza", [2880, y], r"""
const pedidos = $('Prompt de cada pieza').all();
const RED = { instagram: 'INSTAGRAM', facebook: 'FACEBOOK', linkedin: 'LINKEDIN', tiktok: 'TIKTOK' };
const salida = [];
$input.all().forEach((it, i) => {
  const p = pedidos[i].json;
  const r = it.json;
  if (r.error || !r.candidates?.length) return;
  const j = leerJson((r.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join(''));
  const tipo = p.pieza.tipo;
  let c;
  if (tipo === 'BLOG') {
    c = { tipo: 'BLOG', tituloSeo: j.tituloSeo, metaDescripcion: j.metaDescripcion, slug: j.slug, cuerpoMd: j.cuerpoMd, palabras: String(j.cuerpoMd || '').split(/\s+/).filter(Boolean).length };
  } else if (tipo === 'COPY' || tipo === 'ANUNCIO') {
    c = { tipo, red: RED[String(j.red || p.pieza.canal || 'instagram').toLowerCase()] || 'INSTAGRAM', copy: j.copy, hashtags: j.hashtags || [], cta: j.cta, sugerenciaVisual: j.sugerenciaVisual, enfoque: j.enfoque };
  } else if (['GUION', 'SHOTLIST', 'STORYBOARD'].includes(tipo)) {
    // Los campos que muestra el portal (pantalla de la pieza: tiempo, plano, indicación y audio).
    let t = 0;
    const escenas = (j.escenas || []).map((e, k) => {
      const d = Number(e.duracionSeg) || 3;
      const fila = { orden: e.orden || k + 1, tiempo: t + '-' + (t + d) + ' s', tipoPlano: e.plano || '', indicacionVisual: e.accion || '', audio: e.texto || '' };
      t += d;
      return fila;
    });
    c = { tipo, objetivo: j.objetivo, gancho: j.gancho, cta: j.cta, duracionSeg: j.duracionSeg || t, escenas };
  } else {
    // Estáticos: el brief de cada lámina para el diseñador (las imágenes las sube el equipo con la nueva versión).
    const laminas = (j.laminas || []).map((l, k) => ({ orden: l.orden || k + 1, etiqueta: l.etiqueta || 'Lámina ' + (k + 1), textoEnImagen: l.textoEnImagen || '', indicacionVisual: l.indicacionVisual || '' }));
    c = { tipo, formato: j.formato || '1080x1350', imagenes: laminas, copy: [j.copy, (j.hashtags || []).join(' ')].filter(Boolean).join('\n\n'), cta: j.cta };
  }
  const nota = tipo === 'ESTATICO' || tipo === 'CARRUSEL' || tipo === 'PORTADA'
    ? 'Brief visual: ' + c.imagenes.map((l) => l.orden + '. ' + l.etiqueta + ': «' + l.textoEnImagen + '» (' + l.indicacionVisual + ')').join(' · ')
    : undefined;
  salida.push({ json: {
    agente: p.agente, clienteId: p.clienteId,
    cuerpo: {
      clienteId: p.clienteId, tipo, titulo: p.pieza.titulo, periodo: p.pieza.periodo, piezaExistenteId: p.pieza.id,
      version: { contenido: c, agente: p.agente, notaCambios: nota, enviarARevisionInterna: true },
    },
    consumo: { proveedor: 'google', modelo: tarifa(r.modelVersion), tokensEntrada: r.usageMetadata?.promptTokenCount || 0, tokensSalida: r.usageMetadata?.candidatesTokenCount || 0 },
  } });
});
return salida;
""")
guardar_pieza = http("Guardar versión de cada pieza", [3120, y], "POST", PORTAL + "/integraciones/piezas", CRED_PORTAL, cuerpo="={{ JSON.stringify($json.cuerpo) }}")
ejec_prod = codigo("Ejecuciones de producción", [3360, y], r"""
// Una ejecución por agente (el portal la identifica por n8nExecutionId + agente), con el consumo sumado.
const porAgente = {};
for (const it of $('Contenido de cada pieza').all()) {
  const x = it.json;
  porAgente[x.agente] ??= { clienteId: x.clienteId, agente: x.agente, n8nWorkflowId: $workflow.id, n8nExecutionId: String($execution.id), estado: 'OK', consumos: [] };
  porAgente[x.agente].consumos.push(x.consumo);
}
return Object.values(porAgente).map((ejecucion) => ({ json: { ejecucion } }));
""")
registrar_prod = http("Registrar ejecución (producción)", [3600, y], "POST", PORTAL + "/integraciones/ejecuciones", CRED_PORTAL, cuerpo="={{ JSON.stringify($json.ejecucion) }}")

for a, b in [(leer_cliente_p, leer_refs_p), (leer_refs_p, leer_piezas_mes), (leer_piezas_mes, una_pieza), (una_pieza, leer_pieza), (leer_pieza, prompt_pieza), (prompt_pieza, gemini),
             (gemini, contenido), (contenido, guardar_pieza), (guardar_pieza, ejec_prod), (ejec_prod, registrar_prod)]:
    unir(a, b)
unir(producir, leer_cliente_p, 0)

workflow = {
    "id": "AgentesInoo00001",
    "name": "Agentes · Jefe de Marketing y producción del mes",
    "nodes": nodos,
    "connections": conexiones,
    "active": False,
    "settings": {"executionOrder": "v1", "timezone": "America/Lima", "saveDataErrorExecution": "all", "saveDataSuccessExecution": "all"},
    "meta": {"templateCredsSetupCompleted": False},
    "tags": [{"name": "agentes"}, {"name": "portal"}],
    "pinData": {},
}
SALIDA.parent.mkdir(parents=True, exist_ok=True)
SALIDA.write_text(json.dumps(workflow, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(f"{SALIDA.relative_to(RAIZ)}: {len(nodos)} nodos")
