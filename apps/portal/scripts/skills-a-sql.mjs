#!/usr/bin/env node
/**
 * Catálogo de skills de Jarvis (13 nov 2026): convierte carpetas de skills (SKILL.md + archivos de referencia) en el
 * SQL que llena skill_catalogo (migración 0057). Las fuentes son los repos públicos que lista Skillfera; se clonan
 * aparte, cada uno en DIR/<dueño>_<repo>, y el script no ejecuta nada de lo que traen: solo lee texto.
 *
 *   for r in anthropics/skills coreyhaines31/marketingskills ...; do git clone --depth 1 https://github.com/$r DIR/${r/\//_}; done
 *   node scripts/skills-a-sql.mjs DIR > catalogo-skills.sql
 *   psql ... -1 -v ON_ERROR_STOP=1 < catalogo-skills.sql      (con respaldo antes, como toda carga en producción)
 *
 * Es idempotente: si el slug ya existe en el catálogo de Inoo, lo actualiza; nunca toca las skills propias de nadie.
 * Lo que la persona activó se mantiene. Sin dependencias: Node 20 o superior.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, extname, basename, dirname } from "node:path";

const DIR = process.argv[2];
if (!DIR || !existsSync(DIR)) {
  console.error("Uso: node scripts/skills-a-sql.mjs <carpeta con los repos clonados>");
  process.exit(1);
}

// Cada fuente: carpeta clonada, repo, licencia, qué rutas tomar y en qué categoría van.
const KW = { sales: "Ventas", marketing: "Marketing", design: "Diseño", engineering: "Desarrollo", data: "Datos", finance: "Finanzas", "human-resources": "RR. HH.",
  legal: "Legal", operations: "Operaciones", "product-management": "Producto", productivity: "Productividad", "customer-support": "Atención al cliente",
  "small-business": "Negocio", "enterprise-search": "Investigación", "pdf-viewer": "Documentos" };
const DOCS = new Set(["docx", "pdf", "pptx", "xlsx", "doc-coauthoring", "internal-comms"]);
const DISENO = new Set(["frontend-design", "canvas-design", "theme-factory", "algorithmic-art", "brand-guidelines", "slack-gif-creator"]);
const FUENTES = [
  { dir: "anthropics_skills", repo: "https://github.com/anthropics/skills", licencia: "Apache-2.0", incluir: /^skills\//, excluir: /^skills\/(academy-guide|discernment-nudge)\b/,
    categoria: (r, n) => (DOCS.has(n) ? "Documentos" : DISENO.has(n) ? "Diseño" : "Desarrollo") },
  { dir: "anthropics_knowledge-work-plugins", repo: "https://github.com/anthropics/knowledge-work-plugins", licencia: "Apache-2.0",
    incluir: /^(sales|marketing|design|engineering|data|finance|human-resources|legal|operations|product-management|productivity|customer-support|small-business|enterprise-search|pdf-viewer|partner-built\/(brand-voice|common-room|apollo))\//,
    categoria: (r) => (r.startsWith("partner-built/brand-voice") ? "Marketing" : r.startsWith("partner-built/") ? "Ventas" : KW[r.split("/")[0]] ?? "General") },
  { dir: "coreyhaines31_marketingskills", repo: "https://github.com/coreyhaines31/marketingskills", licencia: "MIT", incluir: /^skills\//, categoria: () => "Marketing" },
  { dir: "anthropics_financial-services", repo: "https://github.com/anthropics/financial-services", licencia: "Apache-2.0",
    incluir: /^plugins\/(vertical-plugins\/financial-analysis|agent-plugins\/month-end-closer)\//, categoria: () => "Finanzas" },
  { dir: "obra_superpowers", repo: "https://github.com/obra/superpowers", licencia: "MIT", incluir: /^skills\//, categoria: () => "Desarrollo" },
  { dir: "mattpocock_skills", repo: "https://github.com/mattpocock/skills", licencia: "MIT", incluir: /^skills\//, excluir: /^skills\/in-progress\//,
    categoria: (r) => (r.startsWith("skills/productivity") ? "Productividad" : "Desarrollo") },
  { dir: "addyosmani_agent-skills", repo: "https://github.com/addyosmani/agent-skills", licencia: "MIT", incluir: /^skills\//, categoria: () => "Desarrollo" },
  { dir: "Jeffallan_claude-skills", repo: "https://github.com/Jeffallan/claude-skills", licencia: "MIT", incluir: /^skills\//, categoria: () => "Desarrollo" },
  { dir: "alirezarezvani_claude-skills", repo: "https://github.com/alirezarezvani/claude-skills", licencia: "MIT", incluir: /^[^.]/,
    categoria: (r) => ({ "business-operations": "Operaciones", "business-growth": "Negocio", "c-level-advisor": "Gerencia", marketing: "Marketing", "product-team": "Producto", "project-management": "Producto", "ra-qm-team": "Operaciones", engineering: "Desarrollo", "engineering-team": "Desarrollo" })[r.split("/")[0]] ?? "General" },
  { dir: "OthmanAdi_planning-with-files", repo: "https://github.com/OthmanAdi/planning-with-files", licencia: "MIT", incluir: /^skills\/planning-with-files\//, categoria: () => "Productividad" },
  { dir: "cloudflare_security-audit-skill", repo: "https://github.com/cloudflare/security-audit-skill", licencia: "MIT", incluir: /^skills\//, categoria: () => "Desarrollo" },
  { dir: "cathrynlavery_diagram-design", repo: "https://github.com/cathrynlavery/diagram-design", licencia: "MIT", incluir: /^skills\//, categoria: () => "Diseño" },
  { dir: "nextlevelbuilder_ui-ux-pro-max-skill", repo: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill", licencia: "MIT", incluir: /^\.claude\/skills\//, categoria: () => "Diseño" },
  { dir: "blader_humanizer", repo: "https://github.com/blader/humanizer", licencia: "MIT", incluir: /^/, categoria: () => "Redacción" },
  { dir: "Weizhena_Deep-Research-skills", repo: "https://github.com/Weizhena/Deep-Research-skills", licencia: "MIT", incluir: /^skills\/research-en\//, categoria: () => "Investigación" },
  { dir: "appeeky_aso-skills", repo: "https://github.com/appeeky/aso-skills", licencia: "MIT", incluir: /^plugin\/skills\//, categoria: () => "Marketing de apps" },
  { dir: "EveryInc_charlie-cfo-skill", repo: "https://github.com/EveryInc/charlie-cfo-skill", licencia: "MIT", incluir: /^/, categoria: () => "Finanzas" },
  { dir: "legalopsconsulting_lpm-skills", repo: "https://github.com/legalopsconsulting/lpm-skills", licencia: "Apache-2.0", incluir: /^skills\//, categoria: () => "Gestión de proyectos" },
];

const TEXTO = new Set([".md", ".txt", ".csv", ".json", ".yaml", ".yml"]);
const SCRIPT = new Set([".py", ".js", ".cjs", ".mjs", ".sh", ".ts", ".rb", ".ps1"]);
const MAX_ARCHIVOS = 10;
const MAX_ARCHIVO = 50_000;
const MAX_INSTRUCCIONES = 100_000;

function caminar(d, fuera = new Set([".git", "node_modules", ".github"])) {
  const r = [];
  for (const n of readdirSync(d)) {
    if (fuera.has(n)) continue;
    const p = join(d, n);
    const st = statSync(p);
    if (st.isDirectory()) r.push(...caminar(p, fuera));
    else r.push(p);
  }
  return r;
}

/** Frontmatter YAML simple: «clave: valor», con valores en bloque (| o >) o en varias líneas sangradas. */
function frontmatter(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { datos: {}, cuerpo: texto };
  const datos = {};
  const lineas = m[1].split(/\r?\n/);
  for (let i = 0; i < lineas.length; i++) {
    const x = lineas[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!x) continue;
    let v = x[2].trim();
    if (v === "" || /^[|>][-+]?$/.test(v)) {
      const partes = [];
      while (i + 1 < lineas.length && /^(\s+|$)/.test(lineas[i + 1]) && !/^[A-Za-z_][\w-]*:/.test(lineas[i + 1])) partes.push(lineas[++i].trim());
      v = partes.join(" ").trim();
    }
    datos[x[1]] = v.replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
  return { datos, cuerpo: texto.slice(m[0].length) };
}

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/\u0000/g, "").replace(/'/g, "''")}'`);
const titulo = (n) => n.split("-").map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");

const vistos = new Set();
const filas = [];
const avisos = [];
for (const f of FUENTES) {
  const base = join(DIR, f.dir);
  if (!existsSync(base)) { avisos.push(`falta ${f.dir}`); continue; }
  for (const archivo of caminar(base).filter((p) => basename(p) === "SKILL.md")) {
    const carpeta = dirname(archivo);
    const rel = relative(base, carpeta).split(sep).join("/");
    const relArchivo = relative(base, archivo).split(sep).join("/");
    if (!f.incluir.test(relArchivo) || f.excluir?.test(relArchivo)) continue;
    const { datos, cuerpo } = frontmatter(readFileSync(archivo, "utf8"));
    const nombreCrudo = datos.name || basename(carpeta === base ? f.dir.split("_").pop() : carpeta);
    let s = slug(nombreCrudo);
    if (s.length < 2) continue;
    if (vistos.has(s)) { avisos.push(`repetida: ${s} (${f.dir}/${rel})`); continue; }
    vistos.add(s);
    let instrucciones = cuerpo.trim();
    if (!instrucciones) continue;
    if (instrucciones.length > MAX_INSTRUCCIONES) instrucciones = `${instrucciones.slice(0, MAX_INSTRUCCIONES - 40)}\n\n[…cortado por largo]`;
    const otros = caminar(carpeta).filter((p) => p !== archivo);
    const tieneScripts = otros.some((p) => SCRIPT.has(extname(p).toLowerCase()));
    const archivos = [];
    for (const p of otros.filter((x) => TEXTO.has(extname(x).toLowerCase())).sort()) {
      if (archivos.length >= MAX_ARCHIVOS) break;
      const t = readFileSync(p, "utf8");
      if (t.length > MAX_ARCHIVO || t.includes("\u0000")) continue;
      archivos.push({ nombre: relative(carpeta, p).split(sep).join("/").slice(0, 120), texto: t });
    }
    const descripcion = (datos.description ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
    const nombre = titulo(nombreCrudo.replace(/[_\s]+/g, "-")).replace(/-/g, " ").slice(0, 80);
    const origen = rel ? `${f.repo}/tree/HEAD/${rel}` : f.repo;
    filas.push(`(${q(s)}, ${q(nombre)}, ${q(descripcion)}, ${q(f.categoria(rel, s))}, ${q(origen)}, ${q(f.licencia)}, ${q(instrucciones)}, ${q(JSON.stringify(archivos))}::jsonb, ${tieneScripts})`);
  }
}

// Paquetes de Skillfera (skillfera.dev, sitio propio de Inoo): cada zip descomprimido en DIR/skillfera/<slug>/ y sus datos
// (licencia, categoría, repo) en DIR/skillfera/_meta.json, sacados de data/catalog de skillsfera-web. Van después de los
// repos: si una skill ya vino de su repo, se queda la del repo.
const SF = join(DIR, "skillfera");
const SF_CAT = { "design-systems": "Diseño", "diseno-web": "Diseño", desarrolladores: "Desarrollo", marketing: "Marketing", finanzas: "Finanzas",
  abogados: "Legal", investigacion: "Investigación" };
const SF_PROPIAS = { "frontend-craft": "Diseño", "ui-review-lite": "Diseño", "design-system-guard": "Diseño", "commits-es": "Desarrollo",
  "changelog-claro": "Desarrollo", "readme-claro": "Desarrollo", "actas-reunion": "Productividad", "emails-profesionales": "Redacción" };
if (existsSync(join(SF, "_meta.json"))) {
  const meta = JSON.parse(readFileSync(join(SF, "_meta.json"), "utf8"));
  for (const paquete of readdirSync(SF).filter((n) => meta[n])) {
    const m = meta[paquete];
    const base = join(SF, paquete);
    for (const archivo of caminar(base).filter((p) => basename(p) === "SKILL.md")) {
      const carpeta = dirname(archivo);
      const { datos, cuerpo } = frontmatter(readFileSync(archivo, "utf8"));
      const nombreCrudo = datos.name || basename(carpeta === base ? paquete : carpeta);
      const s = slug(nombreCrudo);
      if (s.length < 2) continue;
      if (vistos.has(s)) { avisos.push(`repetida: ${s} (skillfera/${paquete})`); continue; }
      vistos.add(s);
      let instrucciones = cuerpo.trim();
      if (!instrucciones) continue;
      if (instrucciones.length > MAX_INSTRUCCIONES) instrucciones = `${instrucciones.slice(0, MAX_INSTRUCCIONES - 40)}\n\n[…cortado por largo]`;
      const otros = caminar(carpeta).filter((p) => p !== archivo);
      const archivos = [];
      for (const p of otros.filter((x) => TEXTO.has(extname(x).toLowerCase())).sort()) {
        if (archivos.length >= MAX_ARCHIVOS) break;
        const t = readFileSync(p, "utf8");
        if (t.length > MAX_ARCHIVO || t.includes("\u0000")) continue;
        archivos.push({ nombre: relative(carpeta, p).split(sep).join("/").slice(0, 120), texto: t });
      }
      const propia = !/^https:\/\//.test(m.sourceUrl ?? "");
      const origen = propia ? `https://skillfera.dev/es/skills/${paquete}` : m.sourceUrl;
      const categoria = SF_PROPIAS[s] ?? SF_CAT[m.category] ?? "General";
      const descripcion = (datos.description ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
      const nombre = titulo(nombreCrudo.replace(/[_\s]+/g, "-")).replace(/-/g, " ").slice(0, 80);
      filas.push(`(${q(s)}, ${q(nombre)}, ${q(descripcion)}, ${q(categoria)}, ${q(origen)}, ${q(propia ? "Skillfera (propia de Inoo)" : m.license)}, ${q(instrucciones)}, ${q(JSON.stringify(archivos))}::jsonb, ${otros.some((p) => SCRIPT.has(extname(p).toLowerCase()))})`);
    }
  }
}

process.stdout.write(`-- Catálogo de skills de Jarvis:${filas.length} skills, generado con scripts/skills-a-sql.mjs el ${new Date().toISOString().slice(0, 10)}.\n`);
process.stdout.write("SET client_min_messages = warning;\n");
for (let i = 0; i < filas.length; i += 50) {
  process.stdout.write(`INSERT INTO skill_catalogo (slug, nombre, descripcion, categoria, origen, licencia, instrucciones, archivos, tiene_scripts) VALUES\n${filas.slice(i, i + 50).join(",\n")}\n`);
  process.stdout.write(`ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion, categoria = EXCLUDED.categoria, origen = EXCLUDED.origen,
  licencia = EXCLUDED.licencia, instrucciones = EXCLUDED.instrucciones, archivos = EXCLUDED.archivos, tiene_scripts = EXCLUDED.tiene_scripts, actualizado_en = now()
  WHERE skill_catalogo.dueno_id IS NULL;\n`);
}
console.error(`${filas.length} skills${avisos.length ? `; avisos:\n  ${avisos.join("\n  ")}` : ""}`);
