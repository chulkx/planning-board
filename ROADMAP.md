# Planning Board — Roadmap de Evolución

> Documento vivo. Actualizar al cerrar cada release.
> Fecha de redacción: 2026-03-19 | Última actualización: 2026-04-17
> Estado: R0–R6 implementados. R6-bis y R7 en planificación.

---

## Visión

Mantener el Planning Board como una herramienta Scrum **SQLite-first, LAN-ready**, con CSV como fuente de verdad para la carga de issues, y un flujo de gestión de milestones/issues comparable a GitLab/GitHub. El sistema está diseñado para equipos de hasta ~20 usuarios concurrentes en red interna, sin necesidad de PostgreSQL, OAuth ni WebSockets.

Objetivos concretos:

- **CSV como fuente raíz**: el backlog vive en un CSV (ej: Microsoft Lists); la app importa, mergea y no pisa cambios manuales
- **Milestones e issues prácticos**: crear milestones, asignar issues a cada uno, ver progreso en tiempo real como en GitLab
- **Métricas de rendimiento**: velocity, cycle time, carga y throughput por developer
- **Trazabilidad completa**: cada cambio de estado, asignación o comentario queda en `item_events`
- **Automatización sin opacidad**: cierre de sprint, autoestado y WIP limits dejan huella auditable
- **UX de uso diario sin fricción**: filtros guardados, historial de ítem, rich text, labels flexibles

---

## Principios rectores

1. **Historial primero**: ninguna automatización ni métrica es confiable sin un log de cambios completo.
2. **Cada automatización deja huella**: todo evento generado por el sistema queda en `item_events`.
3. **No bloquear el flujo**: WIP limits, capacidad excedida y cierre incompleto de sprint son advertencias, nunca bloqueos.
4. **Contratos API estables desde el inicio**: prefijo `/api/v1/` desde R1 para no romper integraciones futuras.
5. **Migrar datos, no asumir estado limpio**: cada release incluye su script de migración numerado.
6. **SQLite-first**: el sistema permanece en SQLite. No se migra a PostgreSQL. La escala objetivo es LAN interna ≤20 usuarios concurrentes.

---

## Decisiones de diseño — Cerradas

### D1 — Modelo Sprint ↔ Producto ✅ Opción C

**Decisión**: Sprint como contenedor de tiempo (N:M con productos, modelo actual), más tabla `sprint_product_metrics` para métricas por producto dentro del sprint.

**Motivación**: La Opción A (1:1) obligaría a tener 3 sprints paralelos con las mismas fechas para 3 productos activos simultáneamente — redundancia pura. La Opción B deja las métricas por producto sin soporte. La Opción C da lo mejor de ambas:

- Un solo sprint cubre el período de trabajo del equipo completo.
- `sprint_product_metrics` guarda `committed_sp` y `completed_sp` por producto dentro del sprint → velocity per product sin sprints duplicados.
- Burndown del sprint muestra el total del equipo; burndown por producto se deriva filtrando `item_events` por `product_id` del ítem.
- Capacidad declarada a nivel sprint + developer (no dividida por producto).
- Cierre de sprint es una sola operación; busca el próximo sprint del producto afectado para reasignar ítems no-done.

**Impacto en schema**: sin cambios al modelo de `sprints`. Se agrega tabla `sprint_product_metrics` en R1.

### D2 — Status `blocked` ✅ Status de primera clase

**Decisión**: Agregar `blocked` como status entre `in-progress` y `review` en el enum `BacklogStatus`.

**Motivación**: Modelarlo como flag booleano crea ambigüedad ("bloqueado en qué estado base") y complica las reglas de autoestado. Como status de primera clase queda en `item_events` con plena trazabilidad.

**Impacto**: Solo cambio en `enums.ts` y `STATUS_CONFIG` — el campo `status` en DB ya es `TEXT` libre. Agregar en R0 o inicio de R1 para que el historial sea completo desde el primer día.

**Orden en STATUS_ORDER**: `not-started(0) → in-progress(1) → blocked(2) → review(3) → done(4) → cancelled(5)`

### D3 — Formato rich text ✅ Markdown

**Decisión**: Markdown plano, renderizado en frontend con `marked` + `DOMPurify`.

**Motivación**: Plain text portable, sin riesgo XSS, fácil de exportar, cero migración de datos (los campos `description` y `notes` ya son `TEXT`). Si en el futuro se necesita WYSIWYG completo, la migración Markdown → ProseMirror es directa.

### D8 — Base de datos ✅ SQLite permanente

**Decisión**: El sistema permanece en SQLite con `better-sqlite3`. No se migra a PostgreSQL.

**Motivación**: El caso de uso es LAN interna con ≤20 usuarios concurrentes. SQLite síncrono simplifica el stack, elimina la necesidad de un proceso de DB separado y hace el backup trivial (copiar un archivo). El rendimiento de SQLite es más que suficiente para esta escala. Si en el futuro el equipo crece y se requiere migrar, la capa de repositorios de R5 facilita el cambio sin reescritura total.

---

## R0 — Fundaciones técnicas ✅ Implementado

> Prerequisito obligatorio antes de cualquier cambio de schema.
> No agrega funcionalidad visible al usuario.

### Objetivos

- Sistema de migraciones numeradas que permita `ALTER TABLE` y nuevas tablas de forma controlada.
- Prefijo `/api/v1/` en todas las rutas.
- `sort_order` en `backlog_items` para persistir el orden del drag-and-drop.
- Status `blocked` agregado al enum (D2 cerrada — hacerlo aquí para que R1 ya lo capture en `item_events`).

### Cambios de backend

#### R0.1 — Sistema de migraciones

Reemplazar `migrate()` en `server/db.ts` con un runner numerado:

```sql
CREATE TABLE IF NOT EXISTS schema_versions (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT
);
```

```typescript
// server/db.ts
const MIGRATIONS: { version: number; description: string; sql: string }[] = [
  { version: 1, description: 'initial schema', sql: `/* schema original */` },
  // cada release agrega entradas aquí
]

export function migrate() {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    description TEXT
  )`)
  const applied = new Set(
    (db.prepare('SELECT version FROM schema_versions').all() as { version: number }[])
      .map(r => r.version)
  )
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_versions (version, description) VALUES (?, ?)').run(m.version, m.description)
    })()
  }
}
```

#### R0.2 — Prefijo `/api/v1/`

En `server/index.ts`, cambiar el montaje de routers:
```typescript
// antes:  app.use('/backlog-items', backlogRouter)
// después: app.use('/api/v1/backlog-items', backlogRouter)
```
Aplica a todos los routers. Actualizar `src/api/client.ts` con el nuevo base URL.

#### R0.3 — `sort_order` en backlog_items

Migración v2:
```sql
ALTER TABLE backlog_items ADD COLUMN sort_order INTEGER;
UPDATE backlog_items SET sort_order = rowid WHERE sort_order IS NULL;
```

Nuevo endpoint:
```
PATCH /api/v1/backlog-items/reorder
Body: { ids: string[] }   -- array de IDs en el nuevo orden
```
Actualizar drag-and-drop en `BacklogScreen.tsx` y `BoardScreen.tsx` para llamar al endpoint.

#### R0.4 — Status `blocked` en enums (D2)

No requiere migración de DB. Solo cambios en frontend:

```typescript
// src/domain/enums.ts
export type BacklogStatus = 'not-started' | 'in-progress' | 'blocked' | 'review' | 'done' | 'cancelled'

export const STATUS_ORDER: Record<BacklogStatus, number> = {
  'not-started': 0,
  'in-progress':  1,
  'blocked':      2,
  'review':       3,
  'done':         4,
  'cancelled':    5,
}

// Agregar a STATUS_CONFIG:
blocked: {
  label: 'Bloqueado',
  color: 'text-status-high-fg',    // reutilizar token de alto (naranja)
  bgColor: 'bg-status-high',
}
```

### Casos de prueba R0

- [ ] Abrir la app con DB existente: migraciones se aplican sin error y sin pérdida de datos.
- [ ] Verificar `schema_versions` tiene registros después del arranque.
- [ ] Drag-and-drop en backlog persiste el orden después de recargar la página.
- [ ] Todas las rutas responden en `/api/v1/...`.
- [ ] Status `blocked` aparece como opción en el selector de estado del panel de edición.
- [ ] Ítem marcado como `blocked` se muestra visualmente diferenciado en backlog y board.

---

## R1 — Métricas e historial operativo ✅ Implementado

> Objetivo: que cada sprint y cada cambio de estado dejen huella suficiente para generar métricas confiables.

### Cambios de modelo y schema

#### R1.1 — Tabla `item_events` (historial unificado)

En lugar de tres tablas separadas (`status_history`, `automation_events`, `change_log`), una sola tabla sirve a burndown, audit log y trail de automatizaciones:

```sql
CREATE TABLE item_events (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  -- valores: 'status_changed' | 'assigned' | 'sprint_changed' | 'priority_changed'
  --          | 'imported' | 'automation' | 'note_added'
  field      TEXT,        -- campo que cambió (null para eventos sin campo específico)
  old_value  TEXT,        -- valor anterior (JSON string)
  new_value  TEXT,        -- valor nuevo (JSON string)
  source     TEXT NOT NULL DEFAULT 'user',
  -- valores: 'user' | 'import' | 'automation' | 'system'
  actor      TEXT,        -- 'user', nombre futuro, o null para sistema
  metadata   TEXT,        -- JSON extra: {"sprint_name": "Sprint 3", "rule": "auto-status"}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_item_events_item    ON item_events(item_id);
CREATE INDEX idx_item_events_type    ON item_events(event_type);
CREATE INDEX idx_item_events_created ON item_events(created_at);
```

**Dónde registrar eventos**:
- `PATCH /api/v1/backlog-items/:id` → detectar campos cambiados, insertar un evento por campo modificado con `source: 'user'`
- Drag-and-drop en board → insertar evento `status_changed` con `source: 'user'`
- `POST /api/v1/imports/commit` → insertar eventos `imported` o `status_changed` con `source: 'import'`

#### R1.2 — Columnas adicionales en `sprints`

Migración v3:
```sql
ALTER TABLE sprints ADD COLUMN closed_at TEXT;
ALTER TABLE sprints ADD COLUMN sprint_goal TEXT;
ALTER TABLE sprints ADD COLUMN committed_story_points REAL;
ALTER TABLE sprints ADD COLUMN completed_story_points REAL;
```

#### R1.3 — Tabla `sprint_product_metrics` (D1 — Opción C)

```sql
CREATE TABLE sprint_product_metrics (
  id                      TEXT PRIMARY KEY,
  sprint_id               TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  product_id              TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  committed_story_points  REAL,
  completed_story_points  REAL,
  UNIQUE(sprint_id, product_id)
);
```

#### R1.4 — Tabla `sprint_daily_snapshots` y endpoint `/burndown`

```sql
CREATE TABLE sprint_daily_snapshots (
  id                       TEXT PRIMARY KEY,
  sprint_id                TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  snapshot_date            TEXT NOT NULL,
  remaining_story_points   REAL NOT NULL DEFAULT 0,
  remaining_estimated_hours REAL NOT NULL DEFAULT 0,
  completed_story_points   REAL NOT NULL DEFAULT 0,
  completed_items          INTEGER NOT NULL DEFAULT 0,
  total_items              INTEGER NOT NULL DEFAULT 0,
  status_counts            TEXT NOT NULL DEFAULT '{}',
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sprint_id, snapshot_date)
);
```

```
GET /api/v1/sprints/:id/burndown
GET /api/v1/reports/velocity?limit=8&productId=optional
GET /api/v1/products/:id/cfd?from=YYYY-MM-DD&to=YYYY-MM-DD
```

### Casos de prueba R1

- [ ] Cambiar status de un ítem desde board → verificar registro en `item_events` con `source: 'user'`
- [ ] Reimportar CSV → verificar eventos `imported` para ítems actualizados
- [ ] Endpoint `/burndown` devuelve línea ideal correcta y marca `isToday`
- [ ] Endpoint `/velocity` devuelve solo sprints con `status = 'completed'`

---

## R2 — Automatización del flujo Scrum ✅ Implementado

> Objetivo: bajar trabajo manual sin volver opacas las reglas. Toda automatización deja huella en `item_events`.

### Reglas de negocio implementadas

- **`POST /api/v1/sprints/:id/close`**: mueve ítems no-done al próximo sprint del producto, registra eventos con `source: 'automation'`
- **`GET /api/v1/sprints/:id/close-preview`**: mismo resultado sin persistir
- **WIP limit check**: en cada cambio de status, responde con `{ wip: { exceeded, current, limit } }` (advertencia, no bloqueo)
- **Autoestado**: `not-started → in-progress` automático cuando `effort_actual_hours > 0`
- **Política de merge en import**: respeta `manualOverrides` para no pisar cambios manuales

### Casos de prueba R2

- [ ] Cerrar sprint con ítems no-done y próximo sprint planned → movimiento correcto con eventos `automation`
- [ ] Exceder WIP limit → advertencia en UI, movimiento se aplica
- [ ] Registrar horas en ítem `not-started` → auto-cambio a `in-progress`
- [ ] Reimportar CSV con `manual_overrides` → campos protegidos no se sobreescriben

---

## R3 — Funcionalidad Scrum completa ✅ Implementado

> Objetivo: cubrir estructura real de trabajo de equipo con jerarquía, capacidad y sprint goal.

### Implementado

- **Jerarquía `epic → story → task/bug`** con `parent_id` en `backlog_items`, validación de ciclos y tipos
- **Tabla `sprint_capacity`** por developer por sprint
- **Tabla `retrospectives`** con `went_well`, `to_improve`, `action_items` (JSON)
- **Endpoints**: `/sprints/:id/capacity`, `/sprints/:id/retrospective`, `/backlog-items/:id/parent`

### Casos de prueba R3

- [ ] Jerarquía `epic → story → task` visible en backlog árbol
- [ ] Intentar asignar parent que crea ciclo → error validación
- [ ] Planificar sprint con developers sobre capacidad → semáforo rojo
- [ ] Card de epic en board muestra progreso de stories hijas

---

## R4 — Productividad y calidad de uso ✅ Implementado

> Objetivo: mejorar uso diario sin tocar arquitectura distribuida.

### Qué se implementó en R4

- **Tabla `saved_views`**: filtros guardados por pantalla
- **Markdown en `description` y `notes`**: renderizado con `marked` + `DOMPurify`
- **Pestaña "Actividad"**: timeline de `item_events` por ítem con ícono por tipo y actor
- **Endpoints**: `/saved-views`, `/backlog-items/:id/events`

### Casos de prueba R4

- [ ] Guardar filtro con `priority=critical + assignee=X` y recuperarlo intacto
- [ ] Actividad de ítem muestra cambios manuales, de import y de automatización en orden cronológico
- [ ] Editar `description` con Markdown y verificar rendering en vista de detalle

---

## R5 — Preparación de plataforma ✅ Implementado

> Objetivo: dejar el sistema listo para multiusuario local sin hacer la migración completa.

### Qué se implementó en R5

- **Capa de repositorios** (`server/repositories/`) encapsulando todo acceso a datos
- **Tabla `users`** mínima (local, sin auth real)
- **Migraciones versionadas** reproducibles en DB vacía y con datos existentes
- **Backup/restore genérico**: dump dinámico de todas las tablas de usuario

### Casos de prueba R5

- [ ] Backup completo incluye tablas de R1–R4
- [ ] Restore desde backup sobre DB vacía reproduce el estado exacto
- [ ] Todos los endpoints responden contratos consistentes (no null donde se espera array)

---

## R6 — Dashboard de analítica ✅ Implementado

> Objetivo: pantalla `/analytics` con métricas derivadas de los datos ya existentes. Sin cambios de schema.

### Endpoints implementados

```
GET /api/v1/reports/cycle-time?productId&from&to
GET /api/v1/reports/throughput?productId&limit
GET /api/v1/reports/wip-aging
GET /api/v1/reports/team-load?sprintId
GET /api/v1/reports/estimation-accuracy?productId&limit
```

### Frontend — `src/features/analytics/AnalyticsScreen.tsx`

Cuatro tabs: **Flujo** (cycle time + WIP aging), **Equipo** (throughput + team load), **Estimaciones** (accuracy), **Retrospectivas** (timeline de retros).

### Casos de prueba R6

- [ ] Cycle time calcula correctamente cuando un ítem volvió a `in-progress` después de `review`
- [ ] WIP aging ordena correctamente por antigüedad y colorea según umbrales
- [ ] Team load del sprint activo refleja inmediatamente un cambio de asignación
- [ ] Todos los paneles muestran estado vacío amigable cuando no hay datos suficientes

---

## R6-bis — Issues & Milestones GitLab-style

> Objetivo: enriquecer el sistema de issues y milestones para acercarlo al workflow de GitLab/GitHub, manteniendo SQLite y el modelo actual.

### R6-bis.1 — Issue linking / bloqueadores

Permite marcar relaciones entre ítems ("bloquea a", "relacionado con").

#### Schema — migración v12

```sql
CREATE TABLE item_links (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  link_type   TEXT NOT NULL DEFAULT 'blocks',  -- 'blocks' | 'related'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, link_type)
);
CREATE INDEX idx_item_links_source ON item_links(source_id);
CREATE INDEX idx_item_links_target ON item_links(target_id);
```

#### Endpoints — links

```
GET    /api/v1/backlog-items/:id/links           -- listar links de un ítem
POST   /api/v1/backlog-items/:id/links           -- crear link
DELETE /api/v1/backlog-items/:id/links/:linkId   -- eliminar link
```

**Body del POST**:
```typescript
{ targetId: string; linkType: 'blocks' | 'related' }
```

**Validaciones**:

- No se puede linkear un ítem consigo mismo
- No se crea el link inverso automáticamente; la UI lo muestra en ambos sentidos consultando por `source_id` y `target_id`
- Registrar evento `link_added` / `link_removed` en `item_events` con `metadata: { linkType, targetId }`

#### UI — links

- Sección "Relaciones" en `ItemEditPanel.tsx`: subsecciones "Bloquea a" y "Bloqueado por", cada una con lista de ítems vinculados (título, status, producto) y botón para desvincular
- Buscador inline para agregar nuevas relaciones (busca por título/ID)
- Badge de advertencia en cards del board cuando el ítem tiene bloqueadores con status activo (no done/cancelled)
- Filtro opcional en backlog: "mostrar solo ítems bloqueados"

### R6-bis.2 — Labels / etiquetas flexibles

Sistema de etiquetas libres con color, complementando las categorías actuales (que se mantienen para compatibilidad con CSV).

#### Schema — migración v13

```sql
CREATE TABLE labels (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#6366f1',  -- hex color
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE item_labels (
  item_id   TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  label_id  TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, label_id)
);
CREATE INDEX idx_item_labels_item  ON item_labels(item_id);
CREATE INDEX idx_item_labels_label ON item_labels(label_id);
```

#### Endpoints — labels

```
GET    /api/v1/labels                            -- listar todos los labels
POST   /api/v1/labels                            -- crear label
PATCH  /api/v1/labels/:id                        -- editar nombre/color
DELETE /api/v1/labels/:id                        -- eliminar label (quita de todos los ítems)
GET    /api/v1/backlog-items/:id/labels          -- labels de un ítem
POST   /api/v1/backlog-items/:id/labels          -- asignar label { labelId }
DELETE /api/v1/backlog-items/:id/labels/:labelId -- quitar label
```

Incluir labels en el payload de `GET /api/v1/backlog-items` (join o campo `labelIds[]`).

#### UI — labels

- Selector de labels tipo chip con color en `ItemEditPanel.tsx`: buscar/crear label inline
- Labels visibles en cards del backlog y del board (chips pequeños de color)
- Filtro por label en backlog y board (multiselect, operador OR entre labels)
- Pantalla de gestión en Settings → Labels: crear, editar color, renombrar, eliminar

### R6-bis.3 — Dashboard de milestones

Vista detallada por milestone, similar a la vista de milestone de GitLab.

#### Endpoint nuevo

```
GET /api/v1/milestones/:id/stats
```

**Response**:
```typescript
{
  milestoneId: string
  name: string
  targetDate: string | null
  status: 'planned' | 'in-progress' | 'done'
  totalItems: number
  openItems: number       // status != 'done' && status != 'cancelled'
  closedItems: number     // status == 'done'
  cancelledItems: number
  overdueItems: number    // due_date < today && status != 'done' && status != 'cancelled'
  completionPct: number   // closedItems / (totalItems - cancelledItems) * 100
  itemsByStatus: Record<string, number>
  burndown: {             // basado en item_events: ítems abiertos por día
    date: string
    open: number
  }[]
}
```

El burndown de milestone se calcula contando ítems cuyo status cambió a `done` antes de cada fecha, derivado de `item_events`.

#### UI — dashboard de milestones

- Nueva pantalla `src/features/milestones/MilestoneDetailScreen.tsx` accesible desde la lista de milestones
- Componentes:
  - Header con nombre, fechas, status y botón de edición
  - Barra de progreso grande con % de completado y contadores abiertos/cerrados
  - Alerta si hay ítems vencidos (`overdueItems > 0`)
  - Gráfico burndown simple (SVG inline, sin librería externa)
  - Lista de ítems del milestone agrupados por status, con filtro por tipo y assignee
- En la lista de milestones (`MilestonesScreen.tsx`): agregar columna de progreso con mini barra de porcentaje

#### Ruta nueva

```tsx
// src/App.tsx
<Route path="/milestones/:id" element={<MilestoneDetailScreen />} />
```

### R6-bis.4 — Comentarios en ítems

Hilo de comentarios por ítem con soporte Markdown.

#### Schema — migración v14

```sql
CREATE TABLE item_comments (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,  -- nombre del dev (tomado del selector global o del usuario activo)
  body       TEXT NOT NULL,  -- Markdown
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_item_comments_item ON item_comments(item_id);
```

#### Endpoints — comentarios

```
GET    /api/v1/backlog-items/:id/comments            -- lista cronológica
POST   /api/v1/backlog-items/:id/comments            -- crear comentario { author, body }
PATCH  /api/v1/backlog-items/:id/comments/:commentId -- editar body (solo el autor)
DELETE /api/v1/backlog-items/:id/comments/:commentId -- eliminar
```

- El `author` lo proporciona el frontend (por ahora, selector del nombre del dev activo — sin auth real)
- Registrar evento `note_added` en `item_events` cuando se crea un comentario

#### UI — comentarios

- Tab "Comentarios" en `ItemEditPanel.tsx` junto a "Actividad"
- Editor: textarea con preview Markdown toggle (mismo patrón que description/notes)
- Lista de comentarios en orden cronológico: avatar con iniciales, nombre, fecha relativa, cuerpo renderizado en Markdown
- Botón editar/eliminar visible solo cuando el comentario es del usuario activo
- Contador de comentarios en la card del board (badge numérico pequeño)

### R6-bis.5 — Tab "Devs" en Analytics

Nuevo tab en `AnalyticsScreen.tsx` con métricas de rendimiento por developer, derivado 100% de datos existentes.

#### Endpoint — developer stats

```
GET /api/v1/reports/developer-stats?sprintId=optional&from=YYYY-MM-DD&to=YYYY-MM-DD
```

**Response**:
```typescript
{
  developers: {
    id: string
    name: string
    throughput: {         // ítems completados por sprint (últimos 6)
      sprintId: string
      sprintName: string
      completed: number
      completedSP: number
    }[]
    avgCycleTimeHours: number | null
    currentLoad: {        // sprint activo
      assignedSP: number
      capacitySP: number | null
      assignedItems: number
    }
    activityHeatmap: {    // ítems cerrados por semana, últimas 12 semanas
      weekStart: string
      closedItems: number
    }[]
  }[]
}
```

Todas las queries derivan de `item_events` (cycle time, actividad) + `backlog_items.assignee_ids` (carga) + `sprint_capacity` (capacidad).

#### UI — nuevo tab "Devs" en `AnalyticsScreen.tsx`

- **Tabla de carga actual**: una fila por developer con barra horizontal SP asignados/capacidad y semáforo (verde/amarillo/rojo)
- **Throughput por dev**: barras agrupadas por sprint, una barra por developer. Máximo 6 sprints
- **Cycle time**: tabla ordenable con promedio por developer y mini-histograma
- **Heatmap de actividad**: grilla de semanas (estilo GitHub contributions) por developer, color por intensidad de ítems cerrados

### Casos de prueba R6-bis

- [ ] Crear link "A bloquea a B" → en panel de B aparece "Bloqueado por A", en panel de A aparece "Bloquea a B"
- [ ] Card de B en board muestra badge de bloqueador mientras A no sea done/cancelled
- [ ] Eliminar link → badge desaparece, sección de relaciones se actualiza
- [ ] Crear label "urgente" (rojo) y asignarlo a 3 ítems → chips visibles en cards, filtro por label devuelve exactamente esos 3
- [ ] Eliminar label → se quita de todos los ítems sin error
- [ ] Milestone con 5 ítems (3 done, 1 in-progress, 1 overdue) → dashboard muestra 60% completado, alerta de 1 vencido
- [ ] Burndown de milestone decrece correctamente al marcar ítems como done
- [ ] Escribir comentario Markdown → se renderiza correctamente en la lista
- [ ] Editar comentario propio → body se actualiza, `updated_at` cambia
- [ ] Tab Devs muestra carga correcta para sprint activo después de cambiar asignaciones

---

## R7 — Build de producción

> Objetivo: poder correr la app desde el build compilado sin Vite. Un solo proceso, un solo puerto. Primera versión usable en la LAN del equipo.

### R7.1 — Variables de entorno

Crear `server/config.ts`:

```typescript
import 'dotenv/config'

export const config = {
  port:     parseInt(process.env.PORT  ?? '3002'),
  nodeEnv:  process.env.NODE_ENV ?? 'development',
  dbPath:   process.env.DB_PATH  ?? 'data/planning.db',
  isProd:   process.env.NODE_ENV === 'production',
}
```

Crear `.env.example`:

```
PORT=3002
NODE_ENV=development
DB_PATH=data/planning.db
```

`.env` en `.gitignore` (ya debe estar).

### R7.2 — Express sirve el frontend compilado en producción

```typescript
// server/index.ts
import path from 'path'
import { config } from './config'

if (config.isProd) {
  const distPath = path.join(process.cwd(), 'dist')
  app.use(express.static(distPath))
  // SPA fallback — debe ir DESPUÉS de los routers de API
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}
```

### R7.3 — Scripts de npm

```json
{
  "scripts": {
    "dev":        "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite",
    "build":      "vite build",
    "start":      "NODE_ENV=production tsx server/index.ts",
    "preview":    "npm run build && npm run start"
  }
}
```

`npm run preview` hace build completo y levanta el servidor de producción local. Comando para verificar antes de deployar.

### R7.4 — Logging básico

```typescript
// server/logger.ts
export const logger = {
  info:  (...args: unknown[]) => console.log('[INFO]',  new Date().toISOString(), ...args),
  warn:  (...args: unknown[]) => console.warn('[WARN]',  new Date().toISOString(), ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', new Date().toISOString(), ...args),
}
```

### R7.5 — Health check

```typescript
// GET /api/v1/health
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version ?? 'unknown',
    uptime: process.uptime(),
    db: 'sqlite',
  })
})
```

### R7.6 — Documentación de arranque

Crear `DEPLOY.md`:

```markdown
## Arrancar en modo producción (LAN)

1. `npm install`
2. Copiar `.env.example` a `.env` y ajustar `PORT` y `DB_PATH`
3. `npm run build`
4. `npm start`

La app queda disponible en http://[ip-maquina]:3002
Los datos se guardan en DB_PATH (por defecto: data/planning.db)
Para acceso desde la red: asegurarse de que el puerto esté abierto en el firewall.
```

### Casos de prueba R7

- [ ] `npm run preview` levanta sin errores y la app es usable en `localhost:3002`
- [ ] Navegar a `/board` y recargar no devuelve 404
- [ ] `/api/v1/health` responde `{ status: 'ok', db: 'sqlite' }` en modo producción
- [ ] Variables en `.env` sobreescriben los defaults
- [ ] Acceder desde otra máquina de la LAN a `http://[ip]:3002` y usar la app normalmente

---

## Tabla de dependencias entre releases

```
R0 (Fundaciones)
 └── R1 (Métricas + Historial)
      └── R2 (Automatización)
           └── R3 (Scrum completo)
                └── R4 (UX y productividad)
                     └── R5 (Preparación plataforma)
                          └── R6 (Dashboard de analítica)
                               └── R6-bis (Issues & Milestones GitLab-style)
                                    └── R7 (Build de producción — LAN-ready)
```

No iniciar un release sin haber cerrado el anterior. Cada release tiene casos de prueba que validan que el anterior no se rompió.

---

## Releases descartados (R8–R12)

Los releases R8 (PostgreSQL), R9 (OAuth), R10 (Multi-tenancy), R11 (WebSockets) y R12 (Docker SaaS) fueron **descartados** en la revisión de Abril 2026.

**Razón**: El caso de uso del equipo es LAN interna con ≤20 usuarios concurrentes. SQLite es más que suficiente para esta escala y simplifica significativamente el stack (sin proceso de DB separado, backup trivial = copiar un archivo, sin necesidad de gestionar conexiones async).

**Si en el futuro se requiere escalar**, la capa de repositorios de R5 permite migrar a PostgreSQL + Kysely sin reescribir los route handlers. El camino de migración sería:

1. Agregar Kysely + driver `pg`
2. Crear dialect PostgreSQL en `server/db.ts`
3. Adaptar cada repositorio para queries async (cambios mecánicos, no de lógica)
4. Agregar OAuth (Better Auth) para reemplazar el selector de usuario local
5. Agregar `organization_id` en todas las tablas para multi-tenancy

Pero esto solo tiene sentido si el equipo supera las 20 personas o si se necesita acceso desde internet.

---

## Métricas de éxito por release

| Release | Métrica clave |
| ------- | ------------- |
| R0 | Todos los tests de migración pasan en DB vacía y DB con datos |
| R1 | Burndown de sprint activo disponible con datos reales de `item_events` |
| R2 | Cierre de sprint automatizado sin ítems perdidos en 3 sprints consecutivos |
| R3 | Planning de sprint con capacidad muestra sobreasignación correctamente |
| R4 | Filtro guardado recuperado intacto en sesión nueva |
| R5 | Backup/restore completo funciona con schema de todos los releases anteriores |
| R6 | Cycle time calculado y WIP aging operativo con datos reales del equipo |
| R6-bis | Dashboard de milestone muestra progreso correcto; links de bloqueadores visibles en board |
| R7 | `npm run preview` levanta la app lista para uso del equipo en la LAN |

---

## Stack de dependencias

| Librería | Release | Propósito |
| -------- | ------- | --------- |
| `marked` + `dompurify` | R4 | Render de Markdown en frontend |
| `dotenv` | R7 | Variables de entorno |

No se agregan dependencias pesadas (pg, socket.io, better-auth, kysely) ya que los releases R8–R12 fueron descartados.

---

## Migraciones de schema — índice

| Versión | Release | Descripción |
| ------- | ------- | ----------- |
| v1 | R0 | Schema inicial |
| v2 | R0 | `sort_order` en `backlog_items` |
| v3 | R1 | `item_events`, columnas en `sprints` |
| v4 | R1 | `sprint_product_metrics` |
| v5 | R1 | `sprint_daily_snapshots` |
| v6 | R2 | `board_columns` migrado a objetos con `wipLimit` |
| v7 | R3 | `parent_id` en `backlog_items` |
| v8 | R3 | `sprint_capacity` |
| v9 | R3 | `retrospectives` |
| v10 | R4 | `saved_views` |
| v11 | R5 | `users` mínima |
| v12 | R6-bis | `item_links` |
| v13 | R6-bis | `labels` + `item_labels` |
| v14 | R6-bis | `item_comments` |

---

*Última actualización: 2026-04-17*
