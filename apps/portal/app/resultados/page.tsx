import { redirect } from "next/navigation";

/** Los resultados del mes ahora están en Inicio; el detalle va en el informe descargable. */
export default function Pagina() {
  redirect("/inicio");
}
