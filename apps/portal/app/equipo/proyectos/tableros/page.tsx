import { redirect } from "next/navigation";

// Los tableros de InooWork ahora están en «Proyectos», junto a los de clientes.
export default function Pagina() {
  redirect("/equipo/proyectos");
}
