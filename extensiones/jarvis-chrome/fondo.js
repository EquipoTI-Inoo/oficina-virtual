// Jarvis de Inoo para Chrome (16 nov 2026, Ernesto: «Claude in Chrome para Jarvis»). Abre el Jarvis del portal con
// la página que estás viendo: título, enlace y lo que hayas seleccionado. No lee nada más ni manda nada a otro lado:
// solo abre una pestaña del portal; la sesión es la tuya del portal.
const PORTAL_POR_DEFECTO = "https://portal.inoo.pe";

async function portal() {
  const { portal } = await chrome.storage.sync.get("portal");
  return (portal || PORTAL_POR_DEFECTO).replace(/\/$/, "");
}

async function abrirJarvis(tab, seleccion) {
  let s = seleccion || "";
  if (!s && tab?.id && /^https?:/.test(tab.url || "")) {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(getSelection()) });
      s = r?.result || "";
    } catch { /* páginas donde no se puede leer la selección */ }
  }
  const contexto = { t: (tab?.title || "").slice(0, 300), u: tab?.url || "", s: s.slice(0, 6000) };
  await chrome.tabs.create({ url: `${await portal()}/equipo/jarvis?contexto=${encodeURIComponent(JSON.stringify(contexto))}` });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "pagina", title: "Enviar esta página a Jarvis", contexts: ["page"] });
  chrome.contextMenus.create({ id: "seleccion", title: "Enviar «%s» a Jarvis", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "enlace", title: "Enviar este enlace a Jarvis", contexts: ["link"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "enlace") return abrirJarvis({ title: info.linkUrl, url: info.linkUrl }, "");
  return abrirJarvis(tab, info.menuItemId === "seleccion" ? info.selectionText : "");
});

chrome.action.onClicked.addListener((tab) => abrirJarvis(tab, ""));
