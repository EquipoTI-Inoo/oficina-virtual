/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // pg carga módulos nativos opcionales: se usa desde node_modules en lugar de empaquetarlo.
  // playwright-core: el navegador del taller web (fase 19) se carga en tiempo de ejecución.
  serverExternalPackages: ["pg", "playwright-core"],
  async headers() {
    return [
      {
        source: "/:ruta*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // El informe del taller web (PDF) se muestra dentro del visor de entregables del propio portal.
      { source: "/api/v1/publico/:token", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
    ];
  },
};
export default config;
