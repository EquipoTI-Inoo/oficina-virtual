/**
 * Formularios que Inoo tenía en Monday (26 oct 2026), ahora nativos del portal:
 *  · los cinco briefs que responde el cliente (web, branding, naming, performance y marketing), como plantillas de
 *    requerimiento (src/dominio/requerimientos.ts);
 *  · el ingreso de cliente, que llena Comercial al dar de alta (no lo ve el cliente).
 *
 * Mismas preguntas, opciones y caminos que en Monday (`mostrarSi`). Cambios a propósito:
 *  · Brief web: «Accesos» ya no pide usuario y contraseña (eso va por el requerimiento de accesos).
 *  · Brief de marketing: en Monday había dos campos de archivo de marca y «Referentes» repetido; queda uno de cada uno,
 *    y el archivo solo aparece si tiene manual o logo.
 *  · Ingreso: las referencias gráficas son enlaces (el cliente todavía no existe y no hay dónde subir archivos).
 * La migración 0030 tiene la misma copia; tests/api/db.test.ts comprueba que coinciden.
 */
import type { components } from "../api/tipos-api";

type Campo = components["schemas"]["CampoFormulario"];
type Extra = Partial<Omit<Campo, "clave" | "etiqueta" | "tipo" | "obligatorio">>;

const c = (clave: string, etiqueta: string, tipo: Campo["tipo"], obligatorio = false, extra: Extra = {}): Campo => ({ clave, etiqueta, tipo, obligatorio, ...extra });
const si = (campo: string, ...valores: string[]) => ({ mostrarSi: { campo, valores } });

// ───────────────────────────── brief de diseño y desarrollo web

const EXISTENTE = "Diseño web nuevo a partir de una página web existente";
const DESDE_CERO = "Diseño web desde cero";

export const CAMPOS_BRIEF_WEB: Campo[] = [
  c("marca", "Nombre de la marca", "TEXTO", true, { seccion: "Tu marca" }),
  c("historia", "Cuéntanos la historia de tu marca", "TEXTO_LARGO", false, { ayuda: "¿Cómo nació? ¿Qué problema resuelven?" }),
  c("manualMarca", "¿Cuentas con un manual de marca?", "OPCION", false, { opciones: ["Sí", "No", "Solo tengo logo"] }),
  c("archivosMarca", "Sube tu manual de marca o tu logo", "ARCHIVOS", false, { ayuda: "Illustrator o PDF.", ...si("manualMarca", "Sí", "Solo tengo logo") }),
  c("situacion", "Situación actual de tu página web", "OPCION", true, { seccion: "Tu proyecto", opciones: [EXISTENTE, DESDE_CERO] }),
  c("tipoProyecto", "¿Qué tipo de sitio web necesitas?", "OPCION", true, {
    opciones: ["Landing page", "Web corporativa", "Sistema intranet / extranet", "Web e-commerce", "Web catálogo", "One page"], ...si("situacion", DESDE_CERO),
  }),
  c("blog", "¿Necesitas un blog para publicar noticias o artículos?", "OPCION", false, {
    opciones: ["Sí", "No"], ayuda: "Sirve para mantener tu web al día, compartir novedades y atraer visitas con contenido de valor.", ...si("tipoProyecto", "Web corporativa"),
  }),
  c("cantidadProductos", "Cantidad de productos", "OPCION", false, { opciones: ["1 a 25", "25 a 100", "Más de 100"], ...si("tipoProyecto", "Web e-commerce", "Web catálogo") }),
  c("metodosPago", "¿Qué métodos de pago usarás?", "TEXTO", false, { ayuda: "Mercado Pago, Culqi, Izipay, transferencia…", ...si("tipoProyecto", "Web e-commerce") }),
  c("productoPromocionar", "¿Cuál es el producto o servicio específico a promocionar?", "TEXTO_LARGO", false, { ...si("tipoProyecto", "Landing page", "One page") }),
  c("objetivos", "Objetivo principal del nuevo sitio", "OPCION", true, {
    opciones: ["Actualización de contenido", "Implementar un enfoque en ventas", "Mejorar el diseño en general", "Optimización para estrategia SEO", "Todas las anteriores"],
    ...si("situacion", EXISTENTE),
  }),
  c("sitioActual", "Sobre tu sitio web actual", "TEXTO_LARGO", false, { ayuda: "¿En qué año se diseñó? ¿Qué tiene de bueno? ¿Qué tiene de malo?", ...si("situacion", EXISTENTE) }),
  c("paises", "Top 3 de países que visitan tu sitio", "TEXTO", false, { ...si("situacion", EXISTENTE) }),
  c("ciudades", "Top 5 de ciudades que visitan tu sitio", "TEXTO", false, { ...si("situacion", EXISTENTE) }),
  c("contacto", "Datos de contacto y ubicación", "TEXTO_LARGO", true, {
    ayuda: "Los datos oficiales que aparecerán en tu sitio: dirección (calle, número, urbanización y oficina o local), teléfonos, correos y direcciones de sucursales.",
  }),
  c("preguntasFrecuentes", "Preguntas frecuentes al comprar tu producto o servicio", "TEXTO_LARGO", false, { ...si("situacion", EXISTENTE, DESDE_CERO) }),
  c("motivosNoCompra", "Motivos más frecuentes por los que no compran tu producto o servicio", "TEXTO_LARGO", false, { ...si("situacion", EXISTENTE) }),
  c("competencia", "Menciona 3 marcas de tu competencia directa", "TEXTO", false, { ...si("situacion", DESDE_CERO) }),
  c("inspiracion", "3 sitios web que te inspiren para el diseño", "LISTA", false, { ayuda: "Sean o no de tu sector. Un enlace por línea.", ...si("situacion", DESDE_CERO) }),
  c("estilo", "Estilo de la nueva imagen de tu página web", "OPCION", false, {
    opciones: [
      "Tradicional: colores tradicionales, cuadrada y muy exacta",
      "Natural: colores claros, simple y sencilla",
      "Elegante: colores oscuros, bien proporcionada y poco texto",
      "Seductor: colores cálidos",
      "Creativo: colores adicionales a la paleta, con estructuras libres y diferentes",
      "Romántico: colores pastel, un poco más libre en estructura",
      "Dramático: colores fuertes y llamativos, para impactar",
    ],
    ...si("situacion", DESDE_CERO),
  }),
  c("fotos", "Fotografías para el sitio", "TEXTO_LARGO", false, {
    ayuda: "¿Tienen fotografías propias? ¿Quieren comprar fotos de stock? ¿Piensan hacer una sesión de fotos?", ...si("situacion", DESDE_CERO),
  }),
  c("videos", "Videos para el sitio", "TEXTO_LARGO", false, {
    ayuda: "¿Tienen videos propios? ¿Quieren comprar videos de stock? ¿Piensan hacer una sesión de grabación?", ...si("situacion", DESDE_CERO),
  }),
  c("contenido", "Contenido del sitio web", "OPCION", false, {
    opciones: ["Lo realizará la agencia", "Lo realizaremos internamente"], ...si("situacion", DESDE_CERO),
  }),
  c("hosting", "¿Cuentas con hosting y dominio?", "OPCION", false, { seccion: "Hosting y dominio", opciones: ["Sí", "No", "Solo tengo hosting", "Solo tengo dominio"] }),
  c("proveedorHosting", "¿Dónde están tu hosting y tu dominio?", "TEXTO_LARGO", false, {
    ayuda: "La dirección y el proveedor (Hostinger, GoDaddy…). No escribas contraseñas aquí: los accesos te los pedimos aparte.",
    ...si("hosting", "Sí", "Solo tengo hosting", "Solo tengo dominio"),
  }),
];

// ───────────────────────────── brief de branding

export const CAMPOS_BRIEF_BRANDING: Campo[] = [
  c("marca", "Nombre de la marca", "TEXTO", true, { seccion: "Tu empresa" }),
  c("descripcion", "Descripción de la empresa", "TEXTO_LARGO"),
  c("tiempoMercado", "¿Cuántos años lleva la empresa en el mercado?", "NUMERO"),
  c("motivacion", "¿Qué te motivó a empezar este negocio u organización?", "TEXTO_LARGO"),
  c("mision", "Misión", "TEXTO"),
  c("vision", "Visión", "TEXTO"),
  c("valores", "Menciona los valores de tu marca", "TEXTO"),
  c("personalidad", "¿Cuál consideras que es la personalidad de tu marca?", "TEXTO_LARGO"),
  c("productos", "Información sobre los productos o servicios que brinda la marca", "TEXTO_LARGO", false, { ayuda: "Con detalle." }),
  c("objetivosGenerales", "Menciona los objetivos generales de tu marca", "TEXTO_LARGO", false, { seccion: "Lo que quieres lograr" }),
  c("proposito", "¿Cuál es el propósito de tu marca?", "TEXTO"),
  c("objetivoEspecifico", "¿Cuál es su objetivo específico?", "TEXTO"),
  c("competenciaDirecta", "¿Qué marcas consideras tu competencia directa?", "TEXTO_LARGO", false, {
    seccion: "Competencia y público", ayuda: "Marcas que ofrecen el mismo servicio o producto que tu marca.",
  }),
  c("competenciaIndirecta", "¿Qué marcas consideras tu competencia indirecta?", "TEXTO_LARGO", false, { ayuda: "Marcas que ofrecen servicios o productos similares o sustitutos al tuyo." }),
  c("diferencial", "¿Por qué un cliente debería elegir tu empresa frente a la competencia?", "TEXTO_LARGO"),
  c("demograficos", "Datos demográficos de tu público", "TEXTO_LARGO", false, { ayuda: "Género, dónde viven, sus estudios, nivel socioeconómico." }),
  c("psicograficos", "Datos psicográficos de tu público", "TEXTO_LARGO", false, { ayuda: "Actitudes, personalidad, hábitos de consumo, estilo de vida (trabajo, entretenimiento)." }),
  c("publicoPrincipal", "¿Quién es el público objetivo principal?", "TEXTO_LARGO"),
  c("publicidad", "¿Cuáles son tus principales formas de hacer publicidad?", "TEXTO"),
  c("comoTeConocen", "¿Cómo se entera la mayoría de tus clientes de tu empresa, servicio o producto?", "TEXTO_LARGO"),
  c("think", "Think: ¿qué quieres que piense tu usuario?", "TEXTO_LARGO", false, { seccion: "Concepto e identidad visual" }),
  c("feel", "Feel: ¿qué quieres que sienta tu usuario?", "TEXTO_LARGO"),
  c("do", "Do: ¿qué quieres que haga tu usuario?", "TEXTO_LARGO"),
  c("concepto", "¿Cuál consideras que es el concepto de tu marca?", "TEXTO"),
  c("colores", "¿Qué paletas o gamas de colores prefieres? ¿Alguna razón en particular?", "TEXTO_LARGO"),
  c("elementosLogo", "¿Hay algún elemento que quisieras incluir en el logo?", "TEXTO"),
  c("preferencias", "¿Qué prefieres en íconos, tipografía, colores, etc.?", "TEXTO_LARGO"),
  c("referencias", "Referencias", "ARCHIVOS"),
  c("papeleria", "Papelería y merchandising que deseas incluir", "OPCIONES", false, {
    ayuda: "Marca según el paquete contratado.",
    opciones: ["Carpeta / folder", "Cobertura de camión", "Hoja membretada", "Lanyard", "Lapicero", "Sobres", "Tarjeta de presentación", "Uniforme (polo)", "Otros"],
  }),
  c("papeleriaOtros", "Si marcaste «Otros», especifica cuáles", "TEXTO", false, { ...si("papeleria", "Otros") }),
  c("comentarios", "Comentarios", "TEXTO_LARGO"),
];

// ───────────────────────────── brief de naming

export const CAMPOS_BRIEF_NAMING: Campo[] = [
  c("empresa", "Nombre del cliente o empresa", "TEXTO", true),
  c("contexto", "¿Existe algún contexto previo a la creación de la marca?", "TEXTO_LARGO"),
  c("rubro", "¿Qué producto o rubro ofrece la marca?", "TEXTO_LARGO"),
  c("publico", "¿Te diriges a un público en específico?", "TEXTO_LARGO", false, { ayuda: "Sexo, edad y nivel socioeconómico." }),
  c("diferencial", "¿Qué te diferencia de tu competencia?", "TEXTO_LARGO"),
  c("valor", "¿Cuál es el valor de marca que quieres proyectar en tu naming?", "TEXTO_LARGO"),
  c("comoHabla", "¿Cómo te gustaría que hable tu marca?", "TEXTO_LARGO", false, { ayuda: "Amigable, formal, sarcástica, etc." }),
  c("evocar", "¿Quieres evocar algo personal (nombre, apellidos, etc.) o basarte en algún concepto?", "TEXTO_LARGO"),
  c("referenciaProducto", "¿Quieres hacer referencia a algún producto en específico o a los productos que vendes?", "TEXTO_LARGO"),
  c("idioma", "¿Alguna preferencia de idioma para el naming?", "TEXTO", false, { ayuda: "Español, inglés, etc." }),
  c("recordacion", "¿Debe ser fácil de recordar? ¿Prefieres un naming corto, siglas o un nombre completo?", "TEXTO_LARGO"),
  c("cincoPalabras", "Menciona las primeras 5 palabras que se te vienen a la cabeza al pensar en tu marca", "TEXTO_LARGO"),
  c("palabrasEvitar", "¿Hay alguna palabra que no quieras que se relacione con tu marca?", "TEXTO_LARGO"),
];

// ───────────────────────────── brief de performance

export const CAMPOS_BRIEF_PERFORMANCE: Campo[] = [
  c("empresa", "Nombre de la empresa", "TEXTO", true, { seccion: "Descripción de la empresa" }),
  c("sector", "Sector o industria", "TEXTO", true),
  c("tamano", "Tamaño de la empresa", "TEXTO", true, { ayuda: "Número de colaboradores y facturación mensual." }),
  c("descripcion", "Pequeña descripción de la empresa", "TEXTO", true),
  c("misionVision", "¿Cuál es la misión y visión de tu empresa?", "TEXTO_LARGO", true),
  c("tiempoMercado", "¿Cuánto tiempo lleva la empresa en el mercado?", "TEXTO"),
  c("productos", "¿Cuáles son los productos o servicios principales que ofrece tu empresa?", "TEXTO_LARGO"),
  c("responsables", "¿Quiénes son los responsables?", "TEXTO_LARGO", false, { ayuda: "Nombres, teléfono y correo." }),
  c("objetivos", "¿Cuáles son los principales objetivos de tu empresa a corto y largo plazo?", "TEXTO_LARGO", false, { seccion: "Objetivos empresariales" }),
  c("metasInoo", "¿Qué metas quieres alcanzar con el servicio de Inoo?", "TEXTO_LARGO"),
  c("competencia", "¿Qué empresas o marcas consideras tu competencia directa?", "TEXTO_LARGO", false, { seccion: "Competencia", ayuda: "De 5 a 10 competidores." }),
  c("presupuesto", "¿Cuál es tu presupuesto actual de marketing digital?", "TEXTO_LARGO", false, { seccion: "Estrategias de marketing anteriores" }),
  c("redes", "¿En qué redes sociales tienen presencia?", "TEXTO"),
  c("frecuencia", "En los últimos meses, ¿con qué frecuencia publicaron en sus redes sociales?", "TEXTO", false, { ayuda: "Total de publicaciones por mes o por semana." }),
  c("campanasPrevias", "¿Han hecho campañas de anuncios pagados en redes? ¿En qué plataformas y con qué presupuesto?", "TEXTO"),
  c("resultados", "¿Qué resultados obtuvieron con esas estrategias?", "TEXTO_LARGO"),
];

// ───────────────────────────── brief de marketing

export const CAMPOS_BRIEF_MARKETING: Campo[] = [
  c("marca", "Nombre de la marca", "TEXTO", false, { seccion: "Tu marca" }),
  c("origen", "¿Cómo nació la empresa?", "TEXTO"),
  c("tiempoMercado", "¿Cuántos años lleva la empresa en el mercado?", "NUMERO"),
  c("producto", "Descripción del producto o servicio", "TEXTO_LARGO"),
  c("precio", "¿Cómo consideras tu precio?", "TEXTO_LARGO", false, { ayuda: "En relación al mercado." }),
  c("publicidad", "¿Cuáles son tus principales formas de hacer publicidad? ¿Cuál será el presupuesto para pauta?", "TEXTO"),
  c("agenciaPrevia", "¿Has trabajado antes con alguna agencia de marketing?", "TEXTO"),
  c("beneficiosBasicos", "Beneficios básicos o comunes de la categoría", "TEXTO_LARGO", false, { seccion: "Beneficios y competencia", ayuda: "Incluye el porqué de cada beneficio." }),
  c("beneficioDiferencial", "Beneficio principal o diferencial", "TEXTO_LARGO", false, { ayuda: "¿Qué beneficio tiene tu producto o servicio que lo diferencia del resto, y por qué?" }),
  c("competenciaDirecta", "¿Qué marcas consideras tu competencia directa?", "TEXTO_LARGO", false, { ayuda: "Marcas que ofrecen el mismo servicio o producto que tu marca." }),
  c("competenciaIndirecta", "¿Qué marcas consideras tu competencia indirecta?", "TEXTO_LARGO", false, { ayuda: "Marcas que ofrecen servicios o productos similares o sustitutos al tuyo." }),
  c("demograficos", "Datos demográficos de tu público", "TEXTO_LARGO", false, { seccion: "Tu público", ayuda: "Género, dónde viven, sus estudios, nivel socioeconómico." }),
  c("psicograficos", "Datos psicográficos de tu público", "TEXTO_LARGO", false, { ayuda: "Actitudes, personalidad, hábitos de consumo, estilo de vida (trabajo, entretenimiento)." }),
  c("objetivo", "Objetivo de marketing", "TEXTO_LARGO", false, { seccion: "Estrategia", ayuda: "¿Qué objetivos quieres lograr?" }),
  c("posicionamiento", "Posicionamiento", "TEXTO_LARGO", false, { ayuda: "¿Cómo queremos ser percibidos en la mente de los consumidores?" }),
  c("promesa", "Promesa básica", "TEXTO_LARGO", false, { ayuda: "¿Qué le vas a ofrecer a tu consumidor?" }),
  c("tono", "Tono de comunicación", "TEXTO", false, { ayuda: "Moderno, tecnológico, formal, informal, elegante, racional, emotivo, agresivo, etc." }),
  c("redes", "Redes sociales", "TEXTO", false, { ayuda: "¿Qué redes usas (Facebook, Instagram, TikTok, LinkedIn)? ¿Tienes página web?" }),
  c("locacion", "Locación del local", "TEXTO", false, { ayuda: "¿En qué lugar se harían las sesiones?" }),
  c("manualMarca", "¿Cuentas con manual de marca?", "OPCION", false, { seccion: "Identidad visual", opciones: ["Sí", "No", "Solo logo"], ayuda: "Logo, colores, tipografía, estilo visual." }),
  c("archivosMarca", "Sube tu manual y/o tu logo", "ARCHIVOS", false, { ...si("manualMarca", "Sí", "Solo logo") }),
  c("personalidad", "Personalidad de marca", "TEXTO_LARGO", false, { ayuda: "¿Cómo quieres que se perciba visualmente tu marca en redes? (Moderna, elegante, juvenil, sobria, artesanal, etc.)" }),
  c("colores", "Colores", "TEXTO_LARGO", false, { ayuda: "¿Qué colores crees que identifican mejor a tu marca? ¿Hay alguno que no te gustaría que se use?" }),
  c("estilos", "Estilos", "TEXTO_LARGO", false, { ayuda: "¿Cómo prefieres que sean las publicaciones? (Coloridas, minimalistas, ilustradas, fotográficas, tipográficas, etc.)" }),
  c("referentes", "Referentes", "TEXTO_LARGO", false, { ayuda: "¿Hay alguna marca o cuenta en redes cuyo estilo gráfico te guste y quieras tomar como inspiración?" }),
  c("restricciones", "Restricciones", "TEXTO_LARGO", false, { ayuda: "¿Hay algún caso en el que se pueda flexibilizar la aplicación de la marca? (Días festivos, eventos, promociones especiales, etc.)" }),
  c("contenidoPrevio", "¿Qué tipo de contenido visual se ha usado en la marca hasta ahora?", "TEXTO_LARGO", false, { ayuda: "Fotos, videos, ilustraciones, etc." }),
  c("consistencia", "¿Qué es lo que más te preocupa de la consistencia de la marca?", "TEXTO_LARGO"),
  c("datoImportante", "¿Algún dato importante que debamos saber?", "TEXTO_LARGO"),
];

// ───────────────────────────── ingreso de cliente (Comercial, al dar de alta)

/** Servicios tal como los vende Comercial en el ingreso (no son los códigos del catálogo: SEO no es un servicio del portal). */
export const SERVICIOS_INGRESO = ["Branding", "Social Media", "Desarrollo web", "SEO", "CRM"] as const;

/** El nombre de la empresa y del cliente ya están en el alta (nombre de la marca y responsable). */
export const CAMPOS_INGRESO: Campo[] = [
  c("rubro", "Rubro", "TEXTO", false, { ayuda: "Un breve detalle de qué servicio o producto vende." }),
  c("servicios", "Servicios contratados", "OPCIONES", true, { opciones: [...SERVICIOS_INGRESO] }),
  c("paqueteBranding", "¿Qué paquete adquirió? (Branding)", "OPCION", true, {
    seccion: "Branding", opciones: ["Paquete 01 (MVP)", "Paquete 02 (Complete)", "Paquete 03 (Rebranding)"], ...si("servicios", "Branding"),
  }),
  c("especialesBranding", "Requerimientos especiales (Branding)", "TEXTO_LARGO", false, { ayuda: "Si se modificó el paquete a pedido del cliente, detállalo aquí.", ...si("servicios", "Branding") }),
  c("referenciasBranding", "Referencias gráficas (Branding)", "LISTA", false, { ayuda: "Enlaces, uno por línea.", ...si("servicios", "Branding") }),
  c("paqueteSocial", "¿Qué paquete adquirió? (Social Media)", "OPCION", true, {
    seccion: "Social Media", opciones: ["Display personalizado", "Mínimo viable", "Pro óptimo"], ...si("servicios", "Social Media"),
  }),
  c("especialesSocial", "Requerimientos especiales (Social Media)", "TEXTO_LARGO", false, { ayuda: "Si se modificó el paquete a pedido del cliente, detállalo aquí.", ...si("servicios", "Social Media") }),
  c("referenciasSocial", "Referencias gráficas (Social Media)", "LISTA", false, { ayuda: "Enlaces, uno por línea.", ...si("servicios", "Social Media") }),
  c("redes", "Links de redes sociales o web", "TEXTO_LARGO", true, { ...si("servicios", "Social Media") }),
  c("tipoWeb", "Tipo de proyecto (Desarrollo web)", "OPCION", true, {
    seccion: "Desarrollo web",
    opciones: ["Aplicativo web / app móvil / app de escritorio", "Landing page", "Web catálogo", "Web e-commerce", "Web informativa (básica, empresarial o corporativa)"],
    ...si("servicios", "Desarrollo web"),
  }),
  c("estructuraWeb", "Estructura (Desarrollo web)", "OPCION", true, { opciones: ["CMS (Elementor, Shopify, WordPress)", "Código"], ...si("servicios", "Desarrollo web") }),
  c("cantidadProductos", "Cantidad de productos", "NUMERO", false, { ayuda: "Los productos pactados que se van a subir a la web.", ...si("tipoWeb", "Web catálogo", "Web e-commerce") }),
  c("webSeo", "Página web (SEO)", "URL", false, { seccion: "SEO", ...si("servicios", "SEO") }),
  c("objetivos", "¿Cuáles son los objetivos del cliente?", "TEXTO_LARGO", true, { seccion: "Para todos los servicios" }),
  c("resumen", "Resumen de lo conversado con el cliente", "TEXTO_LARGO"),
  c("fechaReunionBrief", "Fecha de la reunión de brief", "FECHA", true),
];
