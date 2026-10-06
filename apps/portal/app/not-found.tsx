import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="vacio" style={{ minHeight: "100vh", display: "grid", placeContent: "center", gap: 16 }}>
      <span className="logo" style={{ justifySelf: "center" }}>inoo</span>
      <p>No encontramos esta página.</p>
      <Link href="/inicio" className="enlace" style={{ justifyContent: "center" }}>Volver al inicio →</Link>
    </main>
  );
}
