import { redirect } from "next/navigation";

/** «Avance de proyectos» se fusionó con «Mis servicios»: cada servicio tiene su perfil de proyecto. */
export default function Pagina() {
  redirect("/servicios");
}
