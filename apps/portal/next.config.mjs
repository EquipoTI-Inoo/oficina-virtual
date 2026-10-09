/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // pg carga módulos nativos opcionales: se usa desde node_modules en lugar de empaquetarlo.
  serverExternalPackages: ["pg"],
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
    ];
  },
};
export default config;
