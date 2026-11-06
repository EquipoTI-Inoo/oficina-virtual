/**
 * Proyectos de InooWork de prueba (formato real de la tabla `projects`), para el modo simulado del
 * menú «Proyectos → Tableros». Los empleados son las personas de demo del portal (usuario.inoowork_empleado_id).
 */
import type { ProyectoIW } from "../dominio/tableros";

export const EMPLEADO_DEMO = { diego: "EMP-002", camila: "EMP-003", rosa: "EMP-004", admin: "ADM-001" } as const;

const vistas = (prefijo: string, extra: { id: string; label: string; type: string }[] = []) => {
  const columnas = [
    { id: "name", label: "Item", type: "text", width: 280, fixed: true },
    { id: "assignee", label: "Responsable", type: "person", width: 160 },
    { id: "priority", label: "Prioridad", type: "priority", width: 120 },
    { id: "status", label: "Estado", type: "status", width: 140 },
    { id: "dueDate", label: "Fecha Límite", type: "date", width: 130 },
    { id: "notes", label: "Descripción", type: "text", width: 200 },
    ...extra.map((c) => ({ ...c, width: 140 })),
  ];
  return [
    { id: `${prefijo}-v1`, name: "Tabla Principal", type: "table", isDefault: true, columns: columnas, filters: [] },
    { id: `${prefijo}-v2`, name: "Kanban", type: "kanban", isDefault: false, columns: columnas, filters: [] },
    { id: `${prefijo}-v3`, name: "Línea de Tiempo", type: "timeline", isDefault: false, columns: columnas, filters: [] },
    { id: `${prefijo}-v4`, name: "Calendario", type: "calendar", isDefault: false, columns: columnas, filters: [] },
  ];
};
const persona = (id: string, nombre: string) => ({ assignee: id, assigneeName: nombre, assigneeAvatar: "" });
const D = "Diego Castro";
const C = "Camila Paredes";
const R = "Rosa Paredes";
const A = "Admin Inoo";

export const PROYECTOS_DEMO: ProyectoIW[] = [
  {
    id: "PROJ-MKT01", name: "Marketing interno de Inoo", clientName: "Inoo", description: "Contenido y campañas de la propia agencia.", status: "En Progreso", department: "Marketing",
    leaderId: EMPLEADO_DEMO.diego, leaderName: D, leaderAvatar: "", color: "#6366f1", createdAt: "2026-09-15",
    members: [{ employeeId: EMPLEADO_DEMO.camila, name: C, avatar: "", status: "active" }],
    groups: [
      { id: "g-mkt-mes", name: "Octubre", color: "#6366f1", collapsed: false },
      { id: "g-mkt-sig", name: "Noviembre", color: "#10b981", collapsed: false },
    ],
    views: vistas("mkt", [{ id: "col-canal", label: "Canal", type: "text" }]),
    items: [
      {
        id: "item-mkt-1", name: "Calendario de LinkedIn de octubre", status: "En Progreso", ...persona(EMPLEADO_DEMO.diego, D), dueDate: "2026-10-08", priority: "Alta",
        notes: "Ocho publicaciones: dos por semana.", createdAt: "2026-09-28", groupId: "g-mkt-mes", "col-canal": "LinkedIn",
        subitems: [
          { id: "sub-mkt-1", name: "Redactar los copys", status: "Completado", ...persona(EMPLEADO_DEMO.diego, D), dueDate: "2026-10-03", createdAt: "2026-09-28" },
          { id: "sub-mkt-2", name: "Diseñar las piezas", status: "En Progreso", ...persona(EMPLEADO_DEMO.camila, C), dueDate: "2026-10-07", createdAt: "2026-09-28" },
        ],
      },
      { id: "item-mkt-2", name: "Caso de éxito: Casa Oliva", status: "Sin Iniciar", ...persona(EMPLEADO_DEMO.camila, C), dueDate: "2026-10-15", priority: "Media", notes: "", createdAt: "2026-09-30", groupId: "g-mkt-mes", "col-canal": "Web", subitems: [] },
      { id: "item-mkt-3", name: "Newsletter mensual", status: "En Revisión", ...persona(EMPLEADO_DEMO.diego, D), dueDate: "2026-10-03", priority: "Media", notes: "Revisa Ernesto antes de enviar.", createdAt: "2026-09-25", groupId: "g-mkt-mes", "col-canal": "Correo", subitems: [] },
      { id: "item-mkt-4", name: "Actualizar el portafolio web", status: "Completado", ...persona(EMPLEADO_DEMO.camila, C), dueDate: "2026-09-30", priority: "Baja", notes: "", createdAt: "2026-09-15", groupId: "g-mkt-mes", "col-canal": "Web", subitems: [] },
      { id: "item-mkt-5", name: "Campaña de fin de año", status: "Sin Iniciar", assignee: "", assigneeName: "", assigneeAvatar: "", dueDate: "2026-11-20", priority: "Urgente", notes: "", createdAt: "2026-10-01", groupId: "g-mkt-sig", "col-canal": "", subitems: [] },
    ],
  },
  {
    id: "PROJ-OPS01", name: "Operaciones y procesos", description: "Contratos, facturación y procesos internos.", status: "En Progreso", department: "Administración",
    leaderId: EMPLEADO_DEMO.admin, leaderName: A, leaderAvatar: "", color: "#f59e0b", createdAt: "2026-08-01",
    members: [
      { employeeId: EMPLEADO_DEMO.rosa, name: R, avatar: "", status: "active" },
      { employeeId: EMPLEADO_DEMO.diego, name: D, avatar: "", status: "active" },
    ],
    groups: [
      { id: "g-ops-1", name: "Pendientes", color: "#f59e0b", collapsed: false },
      { id: "g-ops-2", name: "Recurrentes", color: "#64748b", collapsed: false },
    ],
    views: vistas("ops"),
    items: [
      { id: "item-ops-1", name: "Plantillas de contratos 2027", status: "En Progreso", ...persona(EMPLEADO_DEMO.admin, A), dueDate: "2026-10-20", priority: "Media", notes: "", createdAt: "2026-09-10", groupId: "g-ops-1", subitems: [] },
      { id: "item-ops-2", name: "Cierre contable de septiembre", status: "Bloqueado", ...persona(EMPLEADO_DEMO.rosa, R), dueDate: "2026-10-05", priority: "Alta", notes: "Falta la factura de Nativa Café.", createdAt: "2026-10-01", groupId: "g-ops-1", subitems: [] },
      { id: "item-ops-3", name: "Facturación mensual de clientes", status: "Soporte Continuo", ...persona(EMPLEADO_DEMO.rosa, R), dueDate: "", priority: "Media", notes: "Los primeros cinco días de cada mes.", createdAt: "2026-08-01", groupId: "g-ops-2", subitems: [] },
    ],
  },
  {
    id: "PROJ-DIS01", name: "Biblioteca de diseño", clientName: "Casa Oliva", description: "Plantillas y recursos gráficos del equipo.", status: "Sin Iniciar", department: "Diseño Grafico",
    leaderId: EMPLEADO_DEMO.camila, leaderName: C, leaderAvatar: "", color: "#ec4899", createdAt: "2026-10-01",
    members: [],
    groups: [{ id: "g-dis-1", name: "To-Do", color: "#ec4899", collapsed: false }],
    views: vistas("dis"),
    items: [
      { id: "item-dis-1", name: "Plantillas de stories", status: "Sin Iniciar", ...persona(EMPLEADO_DEMO.camila, C), dueDate: "2026-10-25", priority: "Media", notes: "", createdAt: "2026-10-01", groupId: "g-dis-1", subitems: [] },
    ],
  },
];
