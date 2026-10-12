import { redirect } from "next/navigation";

/** «Usuarios y avisos» pasó a «Mi cuenta», que se abre desde la foto de perfil (reunión del 12 oct 2026). */
export default function Pagina() {
  redirect("/cuenta/usuarios");
}
