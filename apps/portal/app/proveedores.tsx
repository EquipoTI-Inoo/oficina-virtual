"use client";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ProveedorNavegacion } from "../src/base";
import { ProveedorAvisos } from "../src/componentes";

/** Conecta la navegación de Next.js con las pantallas (que no dependen del framework). */
export function Proveedores({ children }: { children: ReactNode }) {
  const ruta = usePathname() ?? "/";
  const router = useRouter();
  const crudos = useParams() ?? {};
  const params = useMemo(
    () => Object.fromEntries(Object.entries(crudos).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : String(v)])),
    [crudos],
  );
  const valor = useMemo(() => ({ ruta, params, ir: (d: string) => router.push(d) }), [ruta, params, router]);
  return (
    <ProveedorNavegacion valor={valor}>
      <ProveedorAvisos>{children}</ProveedorAvisos>
    </ProveedorNavegacion>
  );
}
