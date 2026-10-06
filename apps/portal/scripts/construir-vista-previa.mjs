// Construye la vista previa estática (sin Next.js) en dist-vista-previa/.
// Uso: npm run vista-previa   →  luego servir la carpeta (p. ej. `npx serve dist-vista-previa`).
import { build } from "esbuild";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const salida = join(raiz, "dist-vista-previa");
mkdirSync(salida, { recursive: true });

await build({
  entryPoints: [join(raiz, "vista-previa/main.tsx")],
  bundle: true,
  outdir: salida,
  entryNames: "app",
  format: "esm",
  jsx: "automatic",
  target: "es2022",
  minify: process.argv.includes("--min"),
  sourcemap: !process.argv.includes("--min"),
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(":") : [],
  loader: { ".jpg": "file" },
  logLevel: "warning",
});

cpSync(join(raiz, "public"), salida, { recursive: true });
writeFileSync(
  join(salida, "index.html"),
  `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Inoo · Portal de clientes (vista previa)</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="./app.css" />
</head>
<body>
<div id="raiz"></div>
<script type="module" src="./app.js"></script>
</body>
</html>
`,
);
console.log(`Vista previa lista en ${salida}`);
