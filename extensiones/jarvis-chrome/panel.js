// Panel lateral de Jarvis (18 nov 2026). Vincula este Chrome con un código del portal, chatea con los bots y hace en
// la pestaña prestada lo que Jarvis pide (ver, ir, clic, escribir, teclas, bajar), con los permisos que la persona
// elige, como en Claude in Chrome:
//   · MANUAL (el de siempre): pregunta antes de cada acción, salvo en los sitios que dejó «siempre permitidos».
//   · AUTO: pregunta la primera vez en cada sitio y después actúa.
//   · SIN: no pregunta.
// En cualquier modo: lo de «siempre pregunta» (descargas, datos sensibles, autorizaciones, borrar) pide permiso, y lo
// prohibido (comprar, crear cuentas, tarjetas o documentos, páginas internas) se rechaza sin preguntar. Mirar la
// página (VER, BAJAR, ESPERAR) no pregunta: la pestaña ya se la prestó la persona.
// Las acciones solo corren con este panel abierto: el portal sabe que hay Chrome si el panel le habló hace < 90 s.

const $ = (id) => document.getElementById(id);
const LECTURA = new Set(["VER", "BAJAR", "ESPERAR", "CAPTURA"]);
const AYUDA_MODO = {
  MANUAL: "Jarvis te pregunta antes de cada clic, escritura o cambio de página. Mirar la pestaña no pregunta.",
  AUTO: "Jarvis te pregunta la primera vez en cada sitio y después actúa solo. Lo delicado igual te lo pregunta.",
  SIN: "Jarvis actúa sin preguntar. Lo delicado (descargas, datos sensibles, autorizaciones, borrar) igual te lo pregunta.",
};

const RE_PAGO = /\b(comprar|compra ahora|pagar|checkout|finalizar (la )?compra|realizar (el )?pedido|confirmar (el )?pedido|place order|buy now|pay now|purchase|suscribirme|subscribe|a[ñn]adir tarjeta|agregar tarjeta|donar|donate)\b/i;
const RE_CUENTA = /(crear (una )?cuenta|registrarme|reg[ií]strate|sign ?up|create (an )?account)/i;
const RE_CAMPO_PROHIBIDO = /(cc-(number|csc|exp|name)|card|tarjeta|cvv|cvc|cvn|\bdni\b|pasaporte|passport|\bssn\b|documento de identidad|carn[eé] de extranjer)/i;
const RE_CAMPO_SENSIBLE = /(password|contrase|clave|\bpin\b|otp|one-time-code|token|secret|cuenta bancaria|iban|\bcci\b)/i;
const RE_BORRAR = /(eliminar|borrar|suprimir|vaciar|delete|remove|trash|papelera|descartar)/i;
const RE_AUTORIZA = /(permitir|\ballow\b|autorizar|authorize|conceder|\bgrant\b|continuar con google|sign in with|iniciar sesi[oó]n con|log in with)/i;

const estado = {
  portal: "https://portal.inoo.pe",
  llave: null,
  modo: "MANUAL",
  reglas: [],
  sitios: [], // siempre permitidos (de esta persona, en este Chrome)
  sitiosSesion: new Set(), // modo AUTO: sitios ya aprobados mientras el panel está abierto
  pestana: null,
  pausado: false,
  ocupado: false,
  bots: [],
  sesion: null,
  contexto: null,
  actividad: [],
};

// ───────────── utilidades

const dominioDe = (url) => {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
const cubre = (regla, dom) => dom === regla || dom.endsWith(`.${regla}`);
function dominioPermitido(dom) {
  if (estado.reglas.some((r) => r.regla === "BLOQUEAR" && cubre(r.dominio, dom))) return false;
  const permitidos = estado.reglas.filter((r) => r.regla === "PERMITIR");
  return !permitidos.length || permitidos.some((r) => cubre(r.dominio, dom));
}
const idSesion = () => `chrome-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(`${estado.portal}/api/v1${ruta}`, {
    method: metodo,
    headers: { "x-navegador-inoo": estado.llave ?? "", ...(cuerpo !== undefined ? { "content-type": "application/json" } : {}) },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 || j.codigo === "NAVEGADOR_DESVINCULADO") await olvidarLlave("Este Chrome se desvinculó desde el portal.");
    const e = new Error(j.detail ? `${j.title}. ${j.detail}` : j.title || `Error ${r.status}`);
    e.codigo = j.codigo;
    throw e;
  }
  return j;
}

function anotar(texto, tipo = "") {
  estado.actividad.unshift({ texto, tipo, hora: new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) });
  estado.actividad = estado.actividad.slice(0, 40);
  const ol = $("actividad");
  ol.replaceChildren(...estado.actividad.map((a) => {
    const li = document.createElement("li");
    li.textContent = `${a.hora} · ${a.texto}`;
    return li;
  }));
}

function lista(id, items) {
  $(id).replaceChildren(...(items.length ? items : ["Ninguno todavía"]).map((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    return li;
  }));
}

function pintarSitios() {
  const ul = $("sitios");
  if (!estado.sitios.length) return lista("sitios", []);
  ul.replaceChildren(...estado.sitios.map((s) => {
    const li = document.createElement("li");
    li.textContent = `${s} `;
    const b = document.createElement("button");
    b.className = "chico enlace";
    b.textContent = "quitar";
    b.addEventListener("click", async () => {
      estado.sitios = estado.sitios.filter((x) => x !== s);
      await chrome.storage.local.set({ sitios: estado.sitios });
      pintarSitios();
    });
    li.append(b);
    return li;
  }));
}

// ───────────── vincular

async function olvidarLlave(motivo) {
  estado.llave = null;
  await chrome.storage.local.remove("llave");
  mostrar(false);
  if (motivo) $("errorVincular").textContent = motivo;
}

function mostrar(vinculado) {
  $("vincular").hidden = vinculado;
  $("app").hidden = !vinculado;
  $("estado").classList.toggle("on", vinculado && !estado.pausado);
  $("estado").title = vinculado ? (estado.pausado ? "Detenido" : "Conectado") : "Sin vincular";
}

$("btnVincular").addEventListener("click", async () => {
  $("errorVincular").textContent = "";
  const portal = ($("portal").value.trim() || estado.portal).replace(/\/$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(portal) && !/^http:\/\/localhost(:\d+)?$/.test(portal)) {
    $("errorVincular").textContent = "La dirección del portal va con https:// y sin ruta.";
    return;
  }
  const codigo = $("codigo").value.trim();
  if (!codigo) return void ($("errorVincular").textContent = "Escribe el código del portal.");
  try {
    const r = await fetch(`${portal}/api/v1/navegador/vincular`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codigo, nombre: "Chrome" }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.title || "No se pudo vincular");
    estado.portal = portal;
    estado.llave = j.llave;
    await chrome.storage.sync.set({ portal });
    await chrome.storage.local.set({ llave: j.llave });
    $("codigo").value = "";
    await arrancar();
  } catch (e) {
    $("errorVincular").textContent = `${e.message}. Revisa el código (vence a los 10 minutos) y vuelve a intentar.`;
  }
});

$("btnDesvincular").addEventListener("click", async () => {
  await olvidarLlave("Listo. Para quitarlo del todo, en el portal: Jarvis → Conectores → Jarvis en Chrome → Desvincular.");
});

// ───────────── modo, pestaña y pausa

$("modo").addEventListener("change", async (ev) => {
  const modo = ev.target.value;
  try {
    await api("PATCH", "/navegador/config", { modo });
    estado.modo = modo;
    estado.sitiosSesion.clear();
    $("ayudaModo").textContent = AYUDA_MODO[modo];
    anotar(`Permisos: ${ev.target.selectedOptions[0].text}`);
  } catch (e) {
    ev.target.value = estado.modo;
    anotar(`No se cambió el modo: ${e.message}`);
  }
});

async function fijarPestana(tab) {
  if (estado.pestana && estado.pestana !== tab?.id) await bannerEn(estado.pestana, false);
  estado.pestana = tab?.id ?? null;
  await chrome.storage.session.set({ pestana: estado.pestana });
  $("pestana").textContent = tab ? (tab.title || tab.url || "sin título").slice(0, 40) : "ninguna";
}

$("btnPestana").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !dominioDe(tab.url || "")) return anotar("Esa pestaña no se puede prestar (páginas internas de Chrome).");
  await fijarPestana(tab);
  anotar(`Pestaña prestada: ${tab.title}`);
});

chrome.tabs.onRemoved.addListener((id) => {
  if (id === estado.pestana) void fijarPestana(null);
});
chrome.tabs.onUpdated.addListener((id, cambio, tab) => {
  if (id === estado.pestana && cambio.title) $("pestana").textContent = (tab.title || "").slice(0, 40);
});

async function pausar(si) {
  estado.pausado = si;
  await chrome.storage.session.set({ pausado: si });
  $("btnPausa").textContent = si ? "Reanudar a Jarvis" : "Detener a Jarvis";
  $("btnPausa").classList.toggle("activo", si);
  mostrar(true);
  if (si && estado.pestana) await bannerEn(estado.pestana, false);
  if (si) cerrarPermiso("no");
  anotar(si ? "Detuviste a Jarvis" : "Jarvis puede seguir");
}
$("btnPausa").addEventListener("click", () => pausar(!estado.pausado));

// ───────────── funciones que corren dentro de la página (no ven nada de este archivo)

function enPaginaVer() {
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[contenteditable=""],[contenteditable=true],[onclick]';
  let n = Number(document.documentElement.dataset.jarvisN || 0);
  const elementos = [];
  const limpio = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 120);
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest("#jarvis-inoo-aviso")) continue;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || st.visibility === "hidden" || st.display === "none") continue;
    if (!el.dataset.jarvisRef) el.dataset.jarvisRef = String(++n);
    const tag = el.tagName.toLowerCase();
    const tipo = (el.getAttribute("type") || el.getAttribute("role") || tag).toLowerCase();
    const campo = tag === "input" || tag === "textarea" || tag === "select";
    const secreto = tipo === "password" || /cc-|one-time-code/.test(el.getAttribute("autocomplete") || "");
    const etiqueta = campo
      ? limpio(el.getAttribute("aria-label") || el.labels?.[0]?.innerText || el.placeholder || el.name || el.title)
      : limpio(el.getAttribute("aria-label") || el.innerText || el.title || el.getAttribute("alt") || el.querySelector("img")?.alt);
    const e = { ref: el.dataset.jarvisRef, tipo, texto: etiqueta };
    if (tag === "a") e.enlace = el.href.slice(0, 200);
    if (campo && tag !== "select" && !secreto && el.value && tipo !== "checkbox" && tipo !== "radio") e.valor = String(el.value).slice(0, 120);
    if (secreto) e.secreto = true;
    if (tipo === "checkbox" || tipo === "radio") e.marcado = el.checked;
    if (tag === "select") e.opcion = el.selectedOptions?.[0]?.text?.slice(0, 80);
    if (r.bottom < 0 || r.top > innerHeight) e.fueraDePantalla = true;
    elementos.push(e);
    if (elementos.length >= 250) break;
  }
  document.documentElement.dataset.jarvisN = String(n);
  const texto = (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 15000);
  return { url: location.href, titulo: document.title, texto, elementos, posicion: Math.round(scrollY), alto: document.documentElement.scrollHeight };
}

function enPaginaDescribir(ref) {
  const el = document.querySelector(`[data-jarvis-ref="${CSS.escape(ref)}"]`);
  if (!el) return null;
  const at = (k) => el.getAttribute(k) || "";
  const tag = el.tagName.toLowerCase();
  const texto = [at("aria-label"), el.innerText, tag === "input" && /submit|button/.test(at("type")) ? el.value : "", at("title"), el.href || ""].join(" ").replace(/\s+/g, " ").slice(0, 400);
  const campo = [at("name"), at("id"), at("autocomplete"), at("placeholder"), at("aria-label"), el.labels?.[0]?.innerText || ""].join(" ").replace(/\s+/g, " ").slice(0, 400);
  const href = tag === "a" ? el.href : "";
  return {
    tag, tipo: at("type").toLowerCase(), texto, campo,
    descarga: tag === "a" && (el.hasAttribute("download") || /\.(zip|exe|msi|dmg|pkg|apk|rar|7z|iso|bat|cmd|ps1|jar)(\?|#|$)/i.test(href)),
    archivo: tag === "a" && /\.(pdf|docx?|xlsx?|pptx?|csv)(\?|#|$)/i.test(href),
  };
}

function enPaginaActuar(accion) {
  const el = accion.ref ? document.querySelector(`[data-jarvis-ref="${CSS.escape(accion.ref)}"]`) : null;
  if (accion.ref && !el) return { error: "Ese elemento ya no está. Mira la página otra vez (navegador_ver)." };
  if (accion.tipo === "CLIC") {
    el.scrollIntoView({ block: "center", inline: "center" });
    el.focus?.({ preventScroll: true });
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    el.click();
    return { hecho: "clic" };
  }
  if (accion.tipo === "ESCRIBIR") {
    el.scrollIntoView({ block: "center" });
    el.focus();
    if (el.isContentEditable) {
      el.textContent = accion.texto;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: accion.texto }));
    } else if (el.tagName === "SELECT") {
      const op = [...el.options].find((o) => o.text.trim() === accion.texto.trim() || o.value === accion.texto);
      if (!op) return { error: `No hay una opción «${accion.texto}»` };
      el.value = op.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, accion.texto);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { hecho: "escrito" };
  }
  if (accion.tipo === "TECLA") {
    const t = accion.tecla;
    const activo = document.activeElement || document.body;
    const ok = activo.dispatchEvent(new KeyboardEvent("keydown", { key: t, bubbles: true, cancelable: true }));
    activo.dispatchEvent(new KeyboardEvent("keyup", { key: t, bubbles: true }));
    if (ok) {
      if (t === "Enter" && activo.form && activo.tagName === "INPUT") activo.form.requestSubmit();
      else if (t === "Enter" && /^(A|BUTTON|SUMMARY)$/.test(activo.tagName)) activo.click();
      else if (t === "Tab") {
        const f = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
        f[(f.indexOf(activo) + 1) % f.length]?.focus();
      } else if (t === "Escape") activo.blur?.();
      else {
        const salto = { ArrowDown: 60, ArrowUp: -60, PageDown: innerHeight * 0.85, PageUp: -innerHeight * 0.85 }[t];
        if (salto) scrollBy(0, salto);
        if (t === "Home") scrollTo(0, 0);
        if (t === "End") scrollTo(0, document.documentElement.scrollHeight);
      }
    }
    return { hecho: `tecla ${t}` };
  }
  if (accion.tipo === "BAJAR") {
    scrollBy(0, typeof accion.cuanto === "number" ? accion.cuanto : innerHeight * 0.85);
    return { posicion: Math.round(scrollY), alto: document.documentElement.scrollHeight };
  }
  return { error: "Acción desconocida" };
}

function enPaginaAviso(mostrar) {
  const ID = "jarvis-inoo-aviso";
  let b = document.getElementById(ID);
  if (!mostrar) return void b?.remove();
  if (b) return;
  b = document.createElement("div");
  b.id = ID;
  b.setAttribute("style", "position:fixed;z-index:2147483647;top:10px;left:50%;transform:translateX(-50%);background:#111;color:#fff;font:13px/1.2 system-ui,sans-serif;padding:7px 8px 7px 14px;border-radius:999px;box-shadow:0 0 0 2px #AD4DFA,0 6px 20px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center");
  const t = document.createElement("span");
  t.textContent = "Jarvis está usando esta pestaña";
  const x = document.createElement("button");
  x.textContent = "Detener";
  x.setAttribute("style", "all:unset;cursor:pointer;background:#fff;color:#111;border-radius:999px;padding:4px 10px;font-weight:600");
  x.addEventListener("click", () => chrome.runtime.sendMessage({ tipo: "detener" }));
  b.append(t, x);
  document.documentElement.appendChild(b);
}

const enPestana = async (tabId, func, args = []) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return r?.result;
};
async function bannerEn(tabId, si) {
  try {
    await enPestana(tabId, enPaginaAviso, [si]);
  } catch {
    /* la pestaña ya no existe o no deja scripts */
  }
}

async function cargaLista(tabId, maxMs = 15000) {
  const fin = Date.now() + maxMs;
  await esperar(300);
  while (Date.now() < fin) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    if (!t || t.status === "complete") return t;
    await esperar(300);
  }
  return chrome.tabs.get(tabId).catch(() => null);
}

// ───────────── permisos

let resolverPermiso = null;
function cerrarPermiso(respuesta) {
  $("permiso").hidden = true;
  if (resolverPermiso) resolverPermiso(respuesta);
  resolverPermiso = null;
}
$("permitirUna").addEventListener("click", () => cerrarPermiso("una"));
$("permitirSitio").addEventListener("click", () => cerrarPermiso("sitio"));
$("rechazar").addEventListener("click", () => cerrarPermiso("no"));

function pedirPermiso(texto, motivo, sitio, puedeSiempre) {
  $("permisoTexto").textContent = texto;
  $("permisoMotivo").textContent = motivo || "";
  $("permitirSitio").hidden = !puedeSiempre || !sitio;
  $("permitirSitio").textContent = `Permitir siempre en ${sitio}`;
  $("permiso").hidden = false;
  $("permiso").scrollIntoView({ block: "nearest" });
  $("permitirUna").focus();
  return new Promise((r) => (resolverPermiso = r));
}

function describirAccion(a, el) {
  const nombre = el?.texto ? `«${el.texto.trim().slice(0, 60)}»` : `el elemento ${a.datos.ref}`;
  switch (a.tipo) {
    case "IR": return `Ir a ${a.datos.url}`;
    case "CLIC": return `Hacer clic en ${nombre}`;
    case "ESCRIBIR": return `Escribir «${a.datos.texto.slice(0, 80)}${a.datos.texto.length > 80 ? "…" : ""}» en ${el?.campo?.trim() ? `«${el.campo.trim().slice(0, 50)}»` : "un campo"}`;
    case "TECLA": return `Apretar ${a.datos.tecla}`;
    default: return a.tipo;
  }
}

/** Lo prohibido (rechaza) y lo que siempre pregunta, mirando el elemento. */
function revisar(a, el, url) {
  if (url && !dominioDe(url)) return { prohibida: "Tocar páginas internas del navegador o archivos del sistema" };
  const dom = a.tipo === "IR" ? dominioDe(a.datos.url) : dominioDe(url || "");
  if (dom && !dominioPermitido(dom)) return { prohibida: `El equipo no deja usar ${dom} con Jarvis` };
  if (a.tipo === "CLIC" && el) {
    if (RE_PAGO.test(el.texto)) return { prohibida: "Comprar o hacer pagos" };
    if (RE_CUENTA.test(el.texto)) return { prohibida: "Crear cuentas" };
    if (el.descarga) return { pregunta: "Descargar un archivo de un tipo que puede ser peligroso" };
    if (el.archivo) return { pregunta: "Descargar un archivo" };
    if (RE_AUTORIZA.test(el.texto)) return { pregunta: "Dar una autorización" };
    if (RE_BORRAR.test(el.texto)) return { pregunta: "Borrar algo" };
  }
  if (a.tipo === "ESCRIBIR" && el) {
    if (RE_CAMPO_PROHIBIDO.test(el.campo)) return { prohibida: "Manejar datos de tarjetas o documentos de identidad" };
    if (el.tipo === "password" || RE_CAMPO_SENSIBLE.test(el.campo)) return { pregunta: "Escribir información sensible" };
  }
  if (a.tipo === "IR" && /accounts\.google\.com\/o\/oauth|\/oauth2?\/authorize/i.test(a.datos.url)) return { pregunta: "Dar una autorización" };
  return {};
}

// ───────────── hacer una acción

async function pestanaParaAccion(a) {
  if (estado.pestana) {
    const t = await chrome.tabs.get(estado.pestana).catch(() => null);
    if (t) return t;
  }
  if (a.tipo === "IR") {
    const t = await chrome.tabs.create({ url: "about:blank", active: true });
    await fijarPestana(t);
    return t;
  }
  return null;
}

async function hacer(a) {
  const tab = await pestanaParaAccion(a);
  if (!tab) return { estado: "FALLIDA", resultado: { error: "La persona todavía no le prestó una pestaña a Jarvis. Pídele que toque «Usar esta pestaña» en el panel, o usa navegador_ir para abrir una." } };
  const urlActual = tab.url && tab.url !== "about:blank" ? tab.url : null;
  const el = a.datos?.ref && urlActual ? await enPestana(tab.id, enPaginaDescribir, [a.datos.ref]).catch(() => null) : null;
  if ((a.tipo === "CLIC" || a.tipo === "ESCRIBIR") && !el) return { estado: "FALLIDA", resultado: { error: "Ese elemento ya no está. Mira la página otra vez (navegador_ver)." } };

  const r = revisar(a, el, urlActual);
  if (r.prohibida) {
    anotar(`Rechazado (prohibido): ${describirAccion(a, el)}`);
    return { estado: "RECHAZADA", resultado: { motivo: `Prohibido: ${r.prohibida}. No lo intentes de otra forma; dile a la persona que lo haga ella.` } };
  }

  const sitio = a.tipo === "IR" ? dominioDe(a.datos.url) : dominioDe(urlActual || "");
  if (!LECTURA.has(a.tipo)) {
    const siempre = sitio && estado.sitios.includes(sitio);
    const preguntar = r.pregunta || (estado.modo === "MANUAL" && !siempre) || (estado.modo === "AUTO" && !siempre && !estado.sitiosSesion.has(sitio));
    if (preguntar) {
      const resp = await pedirPermiso(describirAccion(a, el), r.pregunta ? `Siempre te lo preguntamos: ${r.pregunta}.` : sitio ? `En ${sitio}` : "", sitio, !r.pregunta);
      if (resp === "no") {
        anotar(`Rechazaste: ${describirAccion(a, el)}`);
        return { estado: "RECHAZADA", resultado: { motivo: "La persona no lo aprobó. No insistas; pregúntale qué prefiere." } };
      }
      if (sitio) estado.sitiosSesion.add(sitio);
      if (resp === "sitio" && sitio && !estado.sitios.includes(sitio)) {
        estado.sitios = [...estado.sitios, sitio].sort();
        await chrome.storage.local.set({ sitios: estado.sitios });
        pintarSitios();
      }
    }
  }

  await bannerEn(tab.id, true);
  try {
    if (a.tipo === "IR") {
      await chrome.tabs.update(tab.id, { url: a.datos.url });
      const t = await cargaLista(tab.id);
      await bannerEn(tab.id, true);
      anotar(`Fue a ${a.datos.url}`);
      return { estado: "HECHA", resultado: { url: t?.url, titulo: t?.title } };
    }
    if (a.tipo === "ESPERAR") {
      await esperar((a.datos?.segundos ?? 2) * 1000);
      const t = await cargaLista(tab.id, 5000);
      return { estado: "HECHA", resultado: { url: t?.url, titulo: t?.title, cargada: t?.status === "complete" } };
    }
    if (!urlActual) return { estado: "FALLIDA", resultado: { error: "La pestaña está vacía. Usa navegador_ir primero." } };
    if (a.tipo === "VER" || a.tipo === "CAPTURA") {
      const v = await enPestana(tab.id, enPaginaVer);
      while (JSON.stringify(v).length > 55000 && v.texto.length > 1000) v.texto = v.texto.slice(0, Math.floor(v.texto.length * 0.7));
      anotar(`Miró ${v.titulo || v.url}`);
      return { estado: "HECHA", resultado: v };
    }
    const res = await enPestana(tab.id, enPaginaActuar, [{ tipo: a.tipo, ...a.datos }]);
    if (res?.error) return { estado: "FALLIDA", resultado: res };
    if (a.tipo !== "BAJAR") anotar(describirAccion(a, el));
    const t = await cargaLista(tab.id, 4000);
    return { estado: "HECHA", resultado: { ...res, url: t?.url, titulo: t?.title } };
  } catch (e) {
    return { estado: "FALLIDA", resultado: { error: `Chrome no pudo: ${e.message}` } };
  }
}

async function vuelta() {
  if (!estado.llave || estado.pausado || estado.ocupado) return;
  estado.ocupado = true;
  try {
    const { accion } = await api("GET", "/navegador/pendiente");
    $("estado").classList.add("on");
    if (accion) {
      const r = await hacer(accion);
      await api("POST", `/navegador/acciones/${accion.id}/resultado`, r).catch(() => {});
    }
  } catch {
    $("estado").classList.remove("on");
  } finally {
    estado.ocupado = false;
  }
}
setInterval(vuelta, 1500);

// ───────────── chat con los bots

function burbuja(rol, texto = "") {
  const d = document.createElement("div");
  d.className = `msg ${rol}`;
  d.textContent = texto;
  $("mensajes").append(d);
  d.scrollIntoView({ block: "end" });
  return d;
}

async function leerRespuesta(cuerpo, alTexto, alPaso) {
  const lector = cuerpo.getReader();
  const dec = new TextDecoder();
  let resto = "";
  let evento = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";
    for (const l of lineas) {
      if (!l.trim()) evento = "";
      if (l.startsWith("event:")) evento = l.slice(6).trim();
      if (!l.startsWith("data:")) continue;
      const dato = l.slice(5).trim();
      if (!dato || dato === "[DONE]") continue;
      let j;
      try {
        j = JSON.parse(dato);
      } catch {
        continue;
      }
      if (evento === "hermes.tool.progress") {
        alPaso(j);
        continue;
      }
      if (j.error?.message) throw new Error(j.error.message);
      const c = j.choices?.[0]?.delta?.content;
      if (c) alTexto(c);
    }
  }
}

function pintarContexto() {
  const c = estado.contexto;
  $("btnPagina").textContent = c ? `Quitar «${(c.t || c.u).slice(0, 28)}»` : "Sumar esta página";
}
$("btnPagina").addEventListener("click", async () => {
  if (estado.contexto) {
    estado.contexto = null;
    await chrome.storage.session.remove("contexto");
    return pintarContexto();
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !dominioDe(tab.url || "")) return anotar("Esa página no se puede sumar.");
  const texto = await enPestana(tab.id, () => (document.body?.innerText || "").slice(0, 6000)).catch(() => "");
  estado.contexto = { t: tab.title || "", u: tab.url, s: texto };
  pintarContexto();
});

$("formulario").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const mensaje = $("texto").value.trim();
  const bot = $("bot").value;
  if (!mensaje || !bot) return;
  $("texto").value = "";
  const c = estado.contexto;
  const archivos = c ? [{ nombre: (c.t || "Página").slice(0, 100), texto: `Página: ${c.u}\n\n${c.s || ""}` }] : [];
  burbuja("yo", c ? `${mensaje}\n📎 ${c.t || c.u}` : mensaje);
  estado.contexto = null;
  await chrome.storage.session.remove("contexto");
  pintarContexto();
  const salida = burbuja("bot", "…");
  let texto = "";
  try {
    const r = await fetch(`${estado.portal}/api/v1/jarvis/bots/${encodeURIComponent(bot)}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-navegador-inoo": estado.llave },
      body: JSON.stringify({ mensaje, sesionId: estado.sesion, archivos }),
    });
    if (!r.ok || !r.body) {
      const p = await r.json().catch(() => ({}));
      throw new Error(p.detail ? `${p.title}. ${p.detail}` : p.title || `Error ${r.status}`);
    }
    await leerRespuesta(
      r.body,
      (t) => {
        texto += t;
        salida.textContent = texto;
        salida.scrollIntoView({ block: "end" });
      },
      (p) => ($("paso").textContent = p.status === "completed" ? "" : p.label || (p.tool ? `Usando ${p.tool}…` : "")),
    );
    if (!texto) salida.textContent = "(sin respuesta)";
  } catch (e) {
    salida.textContent = `No se pudo: ${e.message}`;
  } finally {
    $("paso").textContent = "";
  }
});
$("texto").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && !ev.shiftKey) {
    ev.preventDefault();
    $("formulario").requestSubmit();
  }
});

async function cargarBots() {
  try {
    const r = await api("GET", "/jarvis/bots");
    estado.bots = r.bots ?? [];
    $("bot").replaceChildren(...estado.bots.map((b) => new Option(b.nombre, b.id)));
    if (!estado.bots.length) $("bot").replaceChildren(new Option("Tu área no tiene bots todavía", ""));
  } catch (e) {
    $("bot").replaceChildren(new Option(e.message, ""));
  }
}

// ───────────── mensajes de fondo.js y del aviso en la pestaña

chrome.runtime.onMessage.addListener((m) => {
  if (m?.tipo === "detener") void pausar(true);
  if (m?.tipo === "contexto") {
    chrome.storage.session.get("contexto").then(({ contexto }) => {
      estado.contexto = contexto ?? null;
      pintarContexto();
      $("texto").focus();
    });
  }
});

// ───────────── arranque

async function arrancar() {
  const config = await api("GET", "/navegador/config");
  estado.modo = config.modo;
  estado.reglas = config.reglas ?? [];
  $("persona").textContent = config.persona;
  $("modo").value = config.modo;
  $("ayudaModo").textContent = AYUDA_MODO[config.modo];
  lista("siemprePide", config.siemprePide ?? []);
  lista("prohibido", config.prohibido ?? []);
  pintarSitios();
  mostrar(true);
  await cargarBots();
  anotar("Conectado con el portal");
}

(async () => {
  const [{ portal }, { llave, sitios }, ses] = await Promise.all([
    chrome.storage.sync.get("portal"),
    chrome.storage.local.get(["llave", "sitios"]),
    chrome.storage.session.get(["pestana", "pausado", "sesion", "contexto"]),
  ]);
  if (portal) estado.portal = portal;
  $("portal").value = estado.portal;
  estado.sitios = sitios ?? [];
  estado.sesion = ses.sesion || idSesion();
  await chrome.storage.session.set({ sesion: estado.sesion });
  estado.contexto = ses.contexto ?? null;
  pintarContexto();
  if (ses.pestana) {
    const t = await chrome.tabs.get(ses.pestana).catch(() => null);
    await fijarPestana(t);
  }
  if (ses.pausado) {
    estado.pausado = true;
    $("btnPausa").textContent = "Reanudar a Jarvis";
    $("btnPausa").classList.add("activo");
  }
  if (!llave) return mostrar(false);
  estado.llave = llave;
  try {
    await arrancar();
  } catch (e) {
    if (estado.llave) {
      mostrar(true);
      anotar(`No se pudo hablar con el portal: ${e.message}`);
    }
  }
})();
