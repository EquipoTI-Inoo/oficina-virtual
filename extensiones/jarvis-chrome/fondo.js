// Jarvis de Inoo para Chrome. Desde el 18 nov 2026 (2.0.0) vive en el panel lateral: ahí se chatea con los bots y
// Jarvis usa la pestaña que la persona le presta, con los permisos que elija (como Claude in Chrome). Este archivo
// solo abre el panel y mantiene el menú del clic derecho («Enviar a Jarvis»), que deja la página en el chat.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "pagina", title: "Enviar esta página a Jarvis", contexts: ["page"] });
  chrome.contextMenus.create({ id: "seleccion", title: "Enviar «%s» a Jarvis", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "enlace", title: "Enviar este enlace a Jarvis", contexts: ["link"] });
});

// Clic derecho: abre el panel y le deja la página (o lo seleccionado) para el próximo mensaje.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Primero abrir el panel: Chrome solo lo deja abrir en respuesta directa al clic.
  if (tab?.windowId !== undefined) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  const contexto = info.menuItemId === "enlace"
    ? { t: info.linkUrl, u: info.linkUrl, s: "" }
    : { t: (tab?.title || "").slice(0, 300), u: tab?.url || "", s: (info.menuItemId === "seleccion" ? info.selectionText || "" : "").slice(0, 6000) };
  chrome.storage.session.set({ contexto }).then(() => chrome.runtime.sendMessage({ tipo: "contexto" })).catch(() => {});
});
