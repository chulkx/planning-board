# Changelog — Planning Board

Todas las versiones siguen el esquema de releases definido en [ROADMAP.md](ROADMAP.md).

---

## R6-bis — Issues & Milestones GitLab-style

**Fecha:** 2026-04-17

### Nuevas funcionalidades

#### Issue linking / bloqueadores
- Nueva tabla `item_links` (migración v12): vincula ítems como `blocks` o `related`
- Endpoints: `GET/POST/DELETE /api/v1/backlog-items/:id/links`
- UI: pestaña **Relaciones** en `ItemEditPanel` con secciones "Bloquea a", "Bloqueado por", "Relacionado con" y buscador inline
- Badge "Bloqueado" en tarjetas del Kanban cuando el ítem tiene bloqueadores activos
- Eventos `link_added` / `link_removed` registrados en el audit log

#### Labels / etiquetas flexibles
- Nueva tabla `labels` y tabla de junction `item_labels` (migración v13)
- Endpoints CRUD: `GET/POST/PATCH/DELETE /api/v1/labels`
- Endpoints de asignación: `POST/DELETE /api/v1/backlog-items/:id/labels`
- UI: selector de labels tipo chip en la pestaña Detalles del `ItemEditPanel`
- Filtro por etiqueta en la pantalla de Backlog
- Sección **Etiquetas** en Configuración con paleta de 11 colores

#### Dashboard de milestone
- Nuevo endpoint `GET /api/v1/milestones/:id/stats` con `totalItems`, `openItems`, `closedItems`, `cancelledItems`, `overdueItems`, `completionPct`, `itemsByStatus`, `burndown[]`
- Nueva pantalla `MilestoneDetailScreen` accesible desde el ↗ en la lista de milestones
- Pantalla incluye: barra de progreso, contadores, burndown SVG, lista de ítems por estado con resaltado de vencidos
- Nueva ruta `/milestones/:id` en el router de la app

#### Comentarios en ítems
- Nueva tabla `item_comments` (migración v14) con soporte Markdown
- Endpoints: `GET/POST/PATCH/DELETE /api/v1/backlog-items/:id/comments`
- UI: pestaña **Comentarios** en `ItemEditPanel` con selector de autor, editor y lista cronológica
- Evento `note_added` registrado en el audit log al crear un comentario

#### Tab "Devs" en Analítica
- Nuevo tab en `AnalyticsScreen` con métricas por developer
- Throughput: ítems completados por sprint (últimos 6 sprints) con barra horizontal
- Cycle time promedio: calculado desde evento `in-progress` a `done`
- Carga actual: SP asignados en sprint activo vs capacidad
- Heatmap de actividad: ítems cerrados por semana (últimas 12 semanas)
- Nuevo endpoint `GET /api/v1/reports/developer-stats`

#### Logger estructurado
- Nuevo módulo `server/logger.ts` con niveles `info`, `warn`, `error`, `debug`
- Todos los logs incluyen timestamp ISO y nivel en prefijo
- `debug` solo se emite en modo `development`

### Cambios internos
- Migraciones v12, v13, v14 agregadas al runner en `server/db.ts`
- Nuevos archivos de rutas: `server/routes/links.ts`, `server/routes/labels.ts`, `server/routes/comments.ts`
- Tipos nuevos en `src/domain/types.ts`: `Label`, `ItemLink`, `ItemLinksResponse`, `ItemComment`, `MilestoneStats`, `DeveloperStats`, `DeveloperStatsResponse`
- Nuevas funciones en `src/api/client.ts`: `getLabels`, `createLabel`, `updateLabel`, `deleteLabel`, `getItemLabels`, `addLabelToItem`, `removeLabelFromItem`, `getItemLinks`, `addItemLink`, `removeItemLink`, `getItemComments`, `createItemComment`, `updateItemComment`, `deleteItemComment`, `getMilestoneStats`, `getDeveloperStats`
- Nuevas query keys en `src/api/queries.ts`: `labels`, `itemLabels`, `itemLinks`, `itemComments`, `milestoneStats`, `developerStats`

---

## R6 — Analytics dashboard

**Fecha:** 2025-Q4

### Nuevas funcionalidades
- Pantalla **Analítica** con 3 pestañas: Overview, Sprints, Productos
- Métricas globales: distribución de ítems por estado, prioridad, tipo y producto
- Velocity chart: SP completados por sprint
- CFD (Cumulative Flow Diagram) por producto con selector de rango de fechas
- Endpoint `GET /api/v1/reports/velocity` con soporte de filtro por producto
- Endpoint `GET /api/v1/reports/products/:id/cfd`

---

## R5 — Repositorios y multiusuario básico

**Fecha:** 2025-Q3

### Nuevas funcionalidades
- Capa de repositorios: `BacklogItemRepository` encapsula el acceso a datos del backlog
- Sistema de autenticación JWT local (`/api/v1/auth/login`, `/api/v1/auth/me`)
- Tabla `users` (migración v11) con roles `admin` / `developer`
- Pantalla de login con `AuthContext` y `AuthProvider`
- Navegación protegida: redirige a login si no hay sesión activa
- Múltiples usuarios en la misma LAN con sesiones independientes

---

## R4 — Vistas guardadas e historial

**Fecha:** 2025-Q2

### Nuevas funcionalidades
- Tabla `saved_views` (migración v10) para persistir filtros por pantalla
- UI de vistas guardadas: chips debajo de los filtros en Backlog, guardado con nombre
- Tabla `retrospectives` (migración v9) con campos `went_well`, `to_improve`, `action_items`
- Panel de retrospectiva en `SprintPlanningScreen` (colapsable, guardado automático)
- Endpoints: `GET/PUT /api/v1/sprints/:id/retrospective`

---

## R3 — Sprint capacity y cierre de sprint

**Fecha:** 2025-Q1

### Nuevas funcionalidades
- Tabla `sprint_capacity` (migración v8): capacidad por developer por sprint
- Panel **DevCapacityPanel** en Sprint Planning: semáforo verde/amarillo/rojo por carga
- Algoritmo de cierre de sprint: mueve ítems incompletos al próximo sprint o backlog
- Endpoint `POST /api/v1/sprints/:id/close` con preview previo
- Endpoint `GET/PUT /api/v1/sprints/:id/capacity/:devId`

---

## R2 — Burndown, velocity y Kanban WIP

**Fecha:** 2024-Q4

### Nuevas funcionalidades
- Tabla `sprint_daily_snapshots` (migración v5): snapshot diario de sprints activos
- Job de snapshots automático: corre al arrancar y se repite a medianoche
- Burndown chart en Sprint Planning: SP restantes vs línea ideal
- Velocity chart: SP completados por sprint
- WIP limits por columna por producto (migración v6: `board_columns` de strings a objetos)
- Header de columna Kanban en rojo cuando se supera el límite WIP
- Tabla `sprint_product_metrics` (migración v4): métricas de SP por producto por sprint

---

## R1 — Board Kanban y audit log

**Fecha:** 2024-Q3

### Nuevas funcionalidades
- Pantalla **Board** con drag & drop usando `@dnd-kit`
- Soporte multi-producto: filtro por producto en el board
- Tabla `item_events` (migración v3): audit log de todos los cambios de campo
- Función `recordEvent()` centralizada en `eventService.ts`
- Pestaña **Actividad** en `ItemEditPanel` con timeline de cambios
- `sortOrder` en backlog_items (migración v2) para reordenamiento manual
- Jerarquía de ítems con `parent_id` (migración v7): épico → historia → tarea/bug
- Vista árbol en Backlog con indentación y contadores de progreso
- Barra de progreso en cards de épicos en el board
- Endpoint `PATCH /api/v1/backlog-items/:id/parent` con validación de ciclos
- Autoestado: si se registran horas y el ítem está `not-started`, pasa a `in-progress` automáticamente

---

## R0 — MVP funcional

**Fecha:** 2024-Q2

### Funcionalidades iniciales
- Backend Express + SQLite (better-sqlite3) con migraciones versionadas
- Esquema inicial (migración v1): `products`, `developers`, `backlog_items`, `sprints`, `milestones`, `app_config`, `import_snapshots`
- API REST bajo `/api/v1/` con routers separados por recurso
- Frontend React 19 + TypeScript + Vite con TanStack Query
- Pantalla **Backlog**: tabla con filtros, edición inline via panel lateral
- Pantalla **Importar**: wizard 4 pasos para CSV de Microsoft Lists
- Importación idempotente con `externalId`, `importHash` y `manualOverrides`
- Soporte BOM UTF-8 en CSVs de Microsoft Lists
- Pantalla **Milestones**: lista, creación, asignación de ítems, progreso
- Pantalla **Sprints**: CRUD de sprints, asignación de ítems
- Pantalla **Configuración**: gestión de productos, developers, board columns, backup/restore JSON
- Sistema de backup/restore completo en JSON
- Endpoint `GET /api/v1/health`
- Soporte dark mode con preferencia del sistema y toggle manual
