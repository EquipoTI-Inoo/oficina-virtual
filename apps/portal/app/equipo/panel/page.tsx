import { redirect } from "next/navigation";

// «Panel general» se unió con «Mi panel» (2 nov 2026): se quedó el menos recargado.
export default function Pagina() {
  redirect("/equipo/mi-panel");
}
