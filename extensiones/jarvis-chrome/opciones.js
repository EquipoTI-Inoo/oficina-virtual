const campo = document.getElementById("portal");
const estado = document.getElementById("estado");
chrome.storage.sync.get("portal").then(({ portal }) => { campo.value = portal || "https://portal.inoo.pe"; });
document.getElementById("guardar").addEventListener("click", async () => {
  const v = campo.value.trim().replace(/\/$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(v)) { estado.textContent = "Escribe una dirección https:// sin ruta."; return; }
  await chrome.storage.sync.set({ portal: v });
  estado.textContent = "Guardado.";
});
