# Planning Board — Roadmap de Evolución

> Documento vivo. Actualizar al cerrar cada release.
> Fecha de redacción: 2026-03-19
> Estado: En planificación — ningún release iniciado.

---

## Visión

Convertir el Planning Board local en una Scrum App auditada, multi-producto y eventualmente multiusuaria, que permita:

- Trazabilidad completa de cada cambio de estado de un ítem
- Métricas confiables de velocity, burndown y flujo acumulado (CFD)
- Automatización de operaciones Scrum rutinarias sin opacar las reglas
- Jerarquía épica → historia → tarea con capacidad por developer por sprint
- UX de uso diario sin fricción (filtros guardados, historial de ítem, rich text)
- Arquitectura lista para ser migrada a multiusuario sin reescritura total

---

## Principios rectores

1. **Historial primero**: ninguna automatización ni métrica es confiable sin un log de cambios completo.
2. **Cada automatización deja huella**: todo evento generado por el sistema queda en `item_events`.
3. **No bloquear el flujo**: WIP limits, capacidad excedida y cierre incompleto de sprint son advertencias, nunca bloqueos.
4. **Contratos API estables desde el inicio**: prefijo `/api/v1/` desde R1 para no romper integraciones futuras.
5. **Migrar datos, no asumir estado limpio**: cada release incluye su script de migración numerado.

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

---

## R0 — Fundaciones técnicas

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

## R1 — Métricas e historial operativo

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
-- committed/completed se manejan por producto en sprint_product_metrics (ver R1.3)
-- se mantienen a nivel sprint como agregado total para burndown global
ALTER TABLE sprints ADD COLUMN committed_story_points REAL;
ALTER TABLE sprints ADD COLUMN completed_story_points REAL;
```

#### R1.3 — Tabla `sprint_product_metrics` (D1 — Opción C)

Permite velocity y burndown por producto sin necesitar sprints paralelos:

```sql
CREATE TABLE sprint_product_metrics (
  id                      TEXT PRIMARY KEY,
  sprint_id               TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  product_id              TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  committed_story_points  REAL,   -- SP comprometidos de este producto al iniciar el sprint
  completed_story_points  REAL,   -- SP completados de este producto al cerrar el sprint
  UNIQUE(sprint_id, product_id)
);

CREATE INDEX idx_sprint_product_metrics_sprint  ON sprint_product_metrics(sprint_id);
CREATE INDEX idx_sprint_product_metrics_product ON sprint_product_metrics(product_id);
```

**Cuándo se actualiza**:

- Al activar un sprint (`status → active`): insertar una fila por cada `product_id` del sprint con `committed_story_points` = suma actual de SP de ítems del sprint para ese producto.
- Al cerrar un sprint (`POST /close`): actualizar `completed_story_points` por producto antes de marcar el sprint como `completed`.

**Cómo se usa**:

- Velocity por producto: `SELECT * FROM sprint_product_metrics WHERE product_id = ?` join con `sprints WHERE status = 'completed'`
- Burndown por producto: filtrar `item_events` (event_type = 'status_changed') por `product_id` del ítem dentro del rango del sprint

#### R1.4 — Tabla `sprint_daily_snapshots`

```sql
CREATE TABLE sprint_daily_snapshots (
  id                       TEXT PRIMARY KEY,
  sprint_id                TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  snapshot_date            TEXT NOT NULL,  -- 'YYYY-MM-DD'
  remaining_story_points   REAL NOT NULL DEFAULT 0,
  remaining_estimated_hours REAL NOT NULL DEFAULT 0,
  completed_story_points   REAL NOT NULL DEFAULT 0,
  completed_items          INTEGER NOT NULL DEFAULT 0,
  total_items              INTEGER NOT NULL DEFAULT 0,
  status_counts            TEXT NOT NULL DEFAULT '{}',
  -- JSON: {"not-started":5,"in-progress":3,"review":1,"done":8,"blocked":0}
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sprint_id, snapshot_date)
);
```

**Job de snapshot**: Al arrancar la app y una vez por día (via `setInterval` o job en startup):
1. Obtener sprints con `status = 'active'`
2. Por cada sprint, calcular el rango de fechas faltantes desde `start_date` hasta hoy
3. Por cada día faltante, calcular los valores a partir de los ítems actuales del sprint
4. Insertar con `INSERT OR IGNORE` (idempotente)

#### R1.4 — Nuevo endpoint `/api/v1/sprints/:id/burndown`

```typescript
GET /api/v1/sprints/:id/burndown
Response: {
  sprintId: string
  sprintName: string
  startDate: string
  endDate: string
  totalCommittedPoints: number
  snapshots: {
    date: string
    remainingStoryPoints: number
    completedStoryPoints: number
    statusCounts: Record<string, number>
    isToday: boolean
    ideal: number  // calculado: total * (diasRestantes / totalDias)
  }[]
}
```

#### R1.5 — Nuevo endpoint `/api/v1/reports/velocity`

Usa `sprint_product_metrics` para desglosar velocity por producto. Si se omite `productId`, retorna el total del equipo (suma de todos los productos del sprint).

```typescript
GET /api/v1/reports/velocity?limit=8&productId=optional
Response: {
  sprints: {
    id: string
    name: string
    closedAt: string
    committedStoryPoints: number   // total del sprint o del producto si productId presente
    completedStoryPoints: number
    velocityRatio: number          // completedStoryPoints / committedStoryPoints
    byProduct?: {                  // solo si productId no se especifica
      productId: string
      productName: string
      committed: number
      completed: number
    }[]
  }[]
  averageVelocity: number
}
```

#### R1.6 — Nuevo endpoint `/api/v1/products/:id/cfd`

```typescript
GET /api/v1/products/:id/cfd?from=YYYY-MM-DD&to=YYYY-MM-DD
Response: {
  dates: string[]
  series: { status: string; counts: number[] }[]
}
```

Calcula agrupando `status_counts` de los snapshots de sprints que incluyen este producto en el rango de fechas, filtrando los ítems por `product_id`.

### Cambios de UI

- **Vista de sprint**: reemplazar el burndown SVG actual con datos del endpoint `/burndown`. Mostrar "datos insuficientes" si hay menos de 2 snapshots.
- **Panel de velocity**: nuevo componente en `SprintPlanningScreen` o pantalla de reportes dedicada. Barras por sprint cerrado, línea de promedio.
- **CFD**: gráfico de área apilada (SVG o librería ligera). Accesible desde pantalla de reportes o desde la vista de producto.
- **Indicador de datos insuficientes**: si `snapshots.length < 2`, mostrar mensaje en lugar del gráfico.

### Casos de prueba R1

- [ ] Cambiar status de un ítem desde board → verificar registro en `item_events` con `source: 'user'`
- [ ] Cambiar prioridad desde panel de edición → verificar evento `priority_changed` en `item_events`
- [ ] Reimportar CSV → verificar eventos `imported` para ítems actualizados
- [ ] Abrir app después de 3 días → verificar backfill correcto de `sprint_daily_snapshots` con fechas faltantes
- [ ] Endpoint `/burndown` devuelve línea ideal correcta y marca `isToday`
- [ ] Endpoint `/velocity` devuelve solo sprints con `status = 'completed'`
- [ ] Drag-and-drop en board → evento `status_changed` registrado en `item_events`

---

## R2 — Automatización del flujo Scrum

> Objetivo: bajar trabajo manual sin volver opacas las reglas. Toda automatización deja huella en `item_events`.

### Cambios de modelo

#### R2.1 — `board_columns` de strings a objetos (breaking change)

**Situación actual**: `products.board_columns = '["not-started","in-progress","review","done"]'`

**Migración v4** (transformar datos existentes):
```sql
-- No es posible en SQL puro; ejecutar en el runner de migraciones como código TypeScript:
const products = db.prepare('SELECT id, board_columns FROM products').all()
for (const p of products) {
  const cols = JSON.parse(p.board_columns)
  const newCols = cols.map((name: string) => ({ name, wipLimit: null }))
  db.prepare('UPDATE products SET board_columns = ? WHERE id = ?')
    .run(JSON.stringify(newCols), p.id)
}
```

**Nuevo formato**:
```json
[
  { "name": "not-started", "wipLimit": null },
  { "name": "in-progress", "wipLimit": 3 },
  { "name": "review",      "wipLimit": 2 },
  { "name": "done",        "wipLimit": null }
]
```

Actualizar `BoardScreen.tsx` y `importService.ts` para leer el nuevo formato.

#### R2.2 — Status `blocked`

Si la decisión D2 fue "status de primera clase":

Migración v5:
```sql
-- No requiere cambio de schema (status es TEXT libre)
-- Solo agregar al enum en enums.ts y al STATUS_CONFIG
-- Posición en STATUS_ORDER: between 'in-progress' (1) y 'review' (2)
```

Actualizar `enums.ts`:
```typescript
export type BacklogStatus = 'not-started' | 'in-progress' | 'blocked' | 'review' | 'done' | 'cancelled'
```

#### R2.3 — Tabla `sprint_automations_log` (opcional si se usa `item_events`)

Si se opta por `item_events` unificado (recomendado en R1), los eventos de automatización ya quedan en esa tabla con `source: 'automation'`. No se necesita tabla adicional.

Si por alguna razón se requiere log de automatizaciones a nivel sprint (no de ítem):
```sql
CREATE TABLE sprint_events (
  id          TEXT PRIMARY KEY,
  sprint_id   TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,  -- 'sprint_closed', 'items_moved', 'wip_exceeded'
  payload     TEXT,           -- JSON con detalles del evento
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Reglas de negocio

#### R2.4 — `POST /api/v1/sprints/:id/close`

El sprint puede cubrir múltiples productos (D1 — Opción C). El cierre opera sobre todos los ítems del sprint y busca el próximo sprint por el `product_id` de cada ítem no-done, no del sprint en general.

Algoritmo:
1. Verificar que el sprint existe y tiene `status = 'active'`
2. Obtener todos los ítems del sprint
3. Identificar ítems no-done (`status != 'done'` y `status != 'cancelled'`)
4. Para cada ítem no-done, buscar el próximo sprint `planned` que incluya su `product_id` con `start_date` más próxima
5. Si existe sprint destino → reasignar ítem (registrar evento `sprint_changed` en `item_events` con `source: 'automation'`, `metadata: { fromSprint, toSprint }`)
6. Si no existe sprint destino → limpiar `sprint_id` del ítem (devolver a backlog, registrar evento)
7. Actualizar `sprint_product_metrics`: fijar `completed_story_points` por producto (suma SP de ítems done de cada producto)
8. Fijar en el sprint: `status = 'completed'`, `closed_at = now()`, `completed_story_points` (total agregado), `committed_story_points` (total agregado)
9. Insertar snapshot final del sprint
10. Retornar resumen: `{ movedToNextSprint: { itemId, productId, toSprintId }[], movedToBacklog: itemId[], completedByProduct: { productId, committed, completed }[] }`

**Preview endpoint** (para UI):
```
GET /api/v1/sprints/:id/close-preview
Response: misma estructura que el close pero sin persistir
```

#### R2.5 — WIP limit check en board moves

En `PATCH /api/v1/backlog-items/:id` cuando `status` cambia:
1. Obtener `product_id` del ítem
2. Obtener `board_columns` del producto y buscar `wipLimit` de la columna destino
3. Si `wipLimit != null`: contar ítems activos en esa columna del mismo sprint
4. Si `count >= wipLimit`: retornar `{ wip: { exceeded: true, current: N, limit: N } }` en el response (HTTP 200, no error)
5. Frontend muestra advertencia pero aplica el movimiento

#### R2.6 — Autoestado: `not-started` → `in-progress`

En `PATCH /api/v1/backlog-items/:id`, si `effort_actual_hours > 0` y el ítem tiene `status = 'not-started'`:
1. Cambiar `status` a `'in-progress'` automáticamente
2. Registrar dos eventos en `item_events`: el cambio manual de horas y el cambio automático de status con `source: 'automation'`, `metadata: '{"rule":"auto-status-from-hours"}'`
3. No aplicar si el status es `blocked`, `review`, o `done`

#### R2.7 — Reimportación con política de merge explícita

Extender `POST /api/v1/imports/commit` con body opcional:
```typescript
{
  mergePolicy?: {
    fields: ('status' | 'assigneeIds' | 'sprintId' | 'milestoneId' | 'priority')[]
    // campos que el import PUEDE sobreescribir (por defecto ninguno si el ítem tiene manual_overrides)
  }
}
```

El response de commit incluye:
```typescript
{
  created: number
  updated: number
  skipped: number
  fieldsPreserved: { itemId: string; fields: string[] }[]  // campos que se mantuvieron por manual_override
  errors: string[]
}
```

### Cambios de UI

- **Botón "Cerrar Sprint"**: modal con preview del impacto (`close-preview`) antes de confirmar.
- **Columnas con WIP**: mostrar contador `actual/límite` en el header de cada columna del board. Resaltar en rojo si excedido.
- **Configuración de columnas**: en Settings → Productos, permitir editar nombre y WIP limit de cada columna.

### Casos de prueba R2

- [ ] Cerrar sprint con ítems no-done y próximo sprint planned → verificar movimiento correcto con eventos en `item_events`
- [ ] Cerrar sprint sin próximo sprint → verificar que los ítems vuelven a backlog (`sprint_id = null`)
- [ ] Exceder WIP limit en board move → respuesta incluye `wip.exceeded = true`, UI muestra advertencia, movimiento se aplica
- [ ] Registrar `effort_actual_hours > 0` en ítem `not-started` → verificar auto-cambio a `in-progress` con evento `source: 'automation'`
- [ ] No aplicar autoestado a ítem `blocked` o `review` al actualizar horas
- [ ] Reimportar CSV con ítems que tienen `manual_overrides` → verificar que los campos listados no se sobreescriben
- [ ] `GET /close-preview` retorna el mismo resultado que `POST /close` sin modificar datos

---

## R3 — Funcionalidad Scrum completa

> Objetivo: cubrir estructura real de trabajo de equipo con jerarquía, capacidad y sprint goal.

### Cambios de modelo

#### R3.1 — Jerarquía en `backlog_items`

Migración v6:
```sql
ALTER TABLE backlog_items ADD COLUMN parent_id TEXT REFERENCES backlog_items(id);
```

Actualizar `item_type` en `enums.ts`:
```typescript
export type ItemType = 'epic' | 'story' | 'bug' | 'feature' | 'task'
```

Jerarquía válida:
- `epic` → `story`
- `story` → `task` | `bug`
- `bug` puede ser raíz o hijo de `story`
- `epic` no puede tener padre

Reglas de validación en `PATCH /api/v1/backlog-items/:id/parent`:
- No se puede crear ciclo (`parent_id` no puede ser descendiente del ítem)
- No se puede asignar `parent_id` que viole la jerarquía de tipos

#### R3.2 — Tabla `sprint_capacity`

Migración v7:
```sql
CREATE TABLE sprint_capacity (
  id                     TEXT PRIMARY KEY,
  sprint_id              TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  developer_id           TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  capacity_hours         REAL NOT NULL DEFAULT 0,
  capacity_story_points  REAL,
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sprint_id, developer_id)
);
```

Deprecar `developers.capacity_per_sprint` (mantener por compatibilidad, pero `sprint_capacity` toma precedencia si existe registro para ese sprint).

#### R3.3 — Tabla `retrospectives`

Migración v8:
```sql
CREATE TABLE retrospectives (
  id           TEXT PRIMARY KEY,
  sprint_id    TEXT NOT NULL UNIQUE REFERENCES sprints(id) ON DELETE CASCADE,
  went_well    TEXT,   -- texto libre o Markdown
  to_improve   TEXT,
  action_items TEXT,   -- JSON: [{ "text": "...", "owner": "...", "done": false }]
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Retrospectiva es **opcional**. No bloquea el cierre de sprint.

### Endpoints nuevos

```
PATCH  /api/v1/backlog-items/:id/parent     -- asignar/quitar parent_id
GET    /api/v1/sprints/:id/capacity         -- obtener capacidad del sprint por developer
PUT    /api/v1/sprints/:id/capacity/:devId  -- crear o actualizar capacidad de un developer en el sprint
GET    /api/v1/sprints/:id/retrospective    -- obtener retro
PUT    /api/v1/sprints/:id/retrospective    -- crear o actualizar retro
```

### Cambios de UI

- **Backlog jerárquico**: vista expandible (árbol) como alternativa a la tabla plana actual. Toggle entre "tabla" y "árbol".
- **Sprint planning con capacidad**: mostrar por developer: horas comprometidas vs capacidad, semáforo (verde/amarillo/rojo).
- **Sprint detail**: campos `sprint_goal`, `committed_story_points`, `completed_story_points`, enlace a retrospectiva.
- **Board**: cards de tipo `epic` muestran progreso de historias hijas (X/N done).

### Casos de prueba R3

- [ ] Crear jerarquía `epic → story → task` y verificar visualización en backlog árbol
- [ ] Intentar asignar parent que crea ciclo → error validación
- [ ] Planificar sprint con 3 developers, 2 sobre capacidad → semáforo rojo en los 2
- [ ] Cerrar sprint con retro registrada → `retrospectives.sprint_id` queda vinculado
- [ ] Card de epic en board muestra progreso de stories hijas actualizado en tiempo real

---

## R4 — Productividad y calidad de uso

> Objetivo: mejorar uso diario sin tocar arquitectura distribuida.

### Cambios de modelo

#### R4.1 — Tabla `saved_views`

Migración v9:
```sql
CREATE TABLE saved_views (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  screen     TEXT NOT NULL,  -- 'backlog' | 'board' | 'sprint'
  filters    TEXT NOT NULL,  -- JSON serializado de los filtros activos
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### R4.2 — Rich text en campos seleccionados

Si la decisión D3 fue Markdown:
- `backlog_items.description` y `backlog_items.notes` ya son `TEXT` — compatible.
- `retrospectives.went_well`, `to_improve`, `action_items` también.
- El frontend renderiza Markdown con una librería ligera (ej: `marked` + sanitización con `DOMPurify`).
- No se necesita migración de datos.

#### R4.3 — Audit log por ítem

`item_events` (creada en R1) ya provee el historial completo. Solo se necesita:
- Endpoint `GET /api/v1/backlog-items/:id/events` que retorne los eventos en orden cronológico
- Componente "Actividad" en `ItemEditPanel.tsx`

### Endpoints nuevos

```
GET  /api/v1/saved-views?screen=backlog  -- listar vistas guardadas por pantalla
POST /api/v1/saved-views                 -- guardar vista
DELETE /api/v1/saved-views/:id           -- eliminar vista guardada
GET  /api/v1/backlog-items/:id/events    -- historial de eventos de un ítem
```

### Cambios de UI

- **Filtros guardados**: botón "Guardar vista" en backlog, board y sprint planning. Dropdown para cargar vista guardada.
- **Compositor de filtros**: operador AND entre todos los filtros activos (OR queda pendiente para versión posterior).
- **Pestaña "Actividad"** en `ItemEditPanel`: timeline de `item_events` con ícono por tipo de evento y actor.
- **Editor Markdown**: modo edición (textarea con syntax hints) + preview toggle en `description` y `notes`.

### Casos de prueba R4

- [ ] Guardar filtro con `priority=critical` + `assignee=X` y recuperarlo intacto después de recargar
- [ ] Abrir actividad de ítem con cambios manuales, de import y de automatización → orden cronológico correcto
- [ ] Editar `description` con Markdown, guardar y verificar rendering en vista de detalle
- [ ] Eliminar vista guardada → desaparece del dropdown

---

## R5 — Preparación de plataforma

> Objetivo: dejar el sistema listo para multiusuario sin hacer la migración completa.

### Trabajo arquitectónico

#### R5.1 — Capa de repositorios

Encapsular todo acceso a datos en clases de repositorio:

```typescript
// server/repositories/BacklogItemRepository.ts
export class BacklogItemRepository {
  findAll(filters: BacklogFilters): BacklogItem[]
  findById(id: string): BacklogItem | null
  create(data: CreateBacklogItemDto): BacklogItem
  update(id: string, data: Partial<BacklogItem>): BacklogItem
  delete(id: string): void
  reorder(ids: string[]): void
}
```

Los route handlers pasan a ser delgados (solo validación + llamada al repositorio).

#### R5.2 — Tabla mínima de usuarios

Migración v10:
```sql
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE,
  role       TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

No implementar autenticación real todavía. Usar un usuario local por defecto. Actualizar `item_events.actor` para aceptar FK opcional a `users.id`.

#### R5.3 — Migraciones versionadas completas

Verificar que todas las migraciones de R0 a R4 sean reproducibles en una DB vacía y en una DB con datos existentes.

#### R5.4 — Backup/restore genérico

Reemplazar la lógica manual de backup en `routes/imports.ts` con un dump dinámico:

```typescript
// Backup: serializar todas las tablas de usuario (no sqlite_master ni schema_versions)
// Restore: transacción que limpia y recarga todas las tablas
```

#### R5.5 — Contratos API

- Documentar todos los endpoints en un archivo `API.md` o generar OpenAPI spec.
- Verificar que todos los IDs son UUIDs (no enteros autoincrementales) — ya es así.
- Verificar que todos los timestamps son ISO 8601.
- No hay WebSockets, auth real, ni PostgreSQL en este release.

### Casos de prueba R5

- [ ] Backup completo incluye tablas de R1, R2, R3, R4 (item_events, sprint_capacity, retrospectives, saved_views)
- [ ] Restore desde backup sobre DB vacía reproduce el estado exacto
- [ ] Restore desde backup sobre DB con datos existentes reemplaza correctamente
- [ ] Crear usuario local en `users` → `item_events.actor` queda vinculado al nombre del usuario
- [ ] Todos los endpoints responden contratos compatibles con OpenAPI (tipos consistentes, no null donde se espera array)

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
                               └── R7 (Build de producción)  ← primer deploy usable
                                    └── R8 (PostgreSQL + async)
                                         └── R9 (Auth OAuth)
                                              └── R10 (Multi-tenancy)
                                                   └── R11 (Real-time WebSockets)
                                                        └── R12 (Deploy SaaS)
```

No iniciar un release sin haber cerrado el anterior. Cada release tiene casos de prueba que validan que el anterior no se rompió.

---

## R6 — Dashboard de analítica

> Objetivo: pantalla `/analytics` con métricas derivadas de los datos ya existentes. Sin cambios de schema.

### Endpoints nuevos (`server/routes/reports.ts`)

```
GET /api/v1/reports/cycle-time?productId&from&to
GET /api/v1/reports/throughput?productId&limit
GET /api/v1/reports/wip-aging
GET /api/v1/reports/team-load?sprintId
GET /api/v1/reports/estimation-accuracy?productId&limit
```

#### R6.1 — Cycle time

Tiempo entre primer `not-started → in-progress` y `→ done` por ítem.

```sql
-- Para cada ítem: fecha del primer evento de inicio y fecha del evento done
WITH started AS (
  SELECT item_id, MIN(created_at) as started_at
  FROM item_events
  WHERE event_type = 'status_changed' AND new_value = 'in-progress'
  GROUP BY item_id
),
done AS (
  SELECT item_id, MIN(created_at) as done_at
  FROM item_events
  WHERE event_type = 'status_changed' AND new_value = 'done'
  GROUP BY item_id
)
SELECT
  b.id, b.title, b.item_type, b.product_id,
  ROUND((JULIANDAY(d.done_at) - JULIANDAY(s.started_at)) * 24, 1) AS cycle_time_hours
FROM backlog_items b
JOIN started s ON s.item_id = b.id
JOIN done d    ON d.item_id = b.id
WHERE b.status = 'done'
ORDER BY d.done_at DESC
```

Respuesta: `{ items: [...], avg: number, p50: number, p90: number }`

#### R6.2 — Throughput

Ítems completados por sprint.

```sql
SELECT
  s.id, s.name, s.closed_at,
  COUNT(CASE WHEN b.status = 'done' THEN 1 END) as completed_items,
  COUNT(*) as total_items,
  COALESCE(SUM(CASE WHEN b.status = 'done' THEN b.effort_story_points END), 0) as completed_sp
FROM sprints s
JOIN backlog_items b ON b.sprint_id = s.id
WHERE s.status = 'closed'
  AND (? IS NULL OR s.id IN (SELECT sprint_id FROM sprint_product_metrics WHERE product_id = ?))
GROUP BY s.id
ORDER BY s.closed_at DESC
LIMIT ?
```

#### R6.3 — WIP aging

Ítems actualmente en estados activos con antigüedad calculada desde el último cambio de estado.

```sql
SELECT
  b.id, b.title, b.status, b.priority, b.product_id,
  e.created_at as status_since,
  ROUND((JULIANDAY('now') - JULIANDAY(e.created_at)) * 24, 1) AS hours_in_status
FROM backlog_items b
JOIN item_events e ON e.id = (
  SELECT id FROM item_events
  WHERE item_id = b.id AND event_type = 'status_changed'
  ORDER BY created_at DESC LIMIT 1
)
WHERE b.status IN ('in-progress', 'review', 'blocked')
ORDER BY hours_in_status DESC
```

#### R6.4 — Team load

Para un sprint: SP asignados por developer vs capacidad.

```sql
SELECT
  d.id, d.name,
  COALESCE(sc.capacity_hours, d.capacity_per_sprint * 8) as capacity_hours,
  sc.capacity_story_points,
  COUNT(b.id) as assigned_items,
  COALESCE(SUM(b.effort_story_points), 0) as assigned_sp,
  COALESCE(SUM(b.effort_estimated_hours), 0) as assigned_hours
FROM developers d
LEFT JOIN sprint_capacity sc ON sc.developer_id = d.id AND sc.sprint_id = ?
LEFT JOIN backlog_items b ON b.sprint_id = ? AND b.assignee_ids LIKE '%' || d.name || '%'
GROUP BY d.id
```

#### R6.5 — Estimation accuracy

Comparar SP estimados vs completados por sprint.

```sql
SELECT
  s.id, s.name, s.closed_at,
  s.committed_story_points,
  s.completed_story_points,
  CASE
    WHEN s.committed_story_points > 0
    THEN ROUND(s.completed_story_points * 100.0 / s.committed_story_points, 1)
    ELSE NULL
  END as completion_pct
FROM sprints s
WHERE s.status = 'closed' AND s.committed_story_points IS NOT NULL
ORDER BY s.closed_at DESC
LIMIT ?
```

### Frontend

#### R6.6 — `src/features/analytics/AnalyticsScreen.tsx`

Cuatro tabs:

##### Flujo

- Histograma de cycle time (distribución en barras: 0-24h, 1-3d, 3-7d, +7d)
- Tabla de WIP aging con color por antigüedad (verde < 2d, amarillo < 5d, rojo > 5d)

##### Equipo

- Throughput por sprint (barras: ítems completados + SP)
- Team load del sprint activo seleccionado (barra de capacidad por developer, semáforo)

##### Estimaciones

- Tabla accuracy por sprint (committed vs completed, % cumplimiento)
- Destaque de ítems sin story points definidos (deuda de estimación)

##### Retrospectivas

- Línea de tiempo de sprints cerrados con excerpt de went_well / to_improve
- Progreso de action items: ítems con done=true vs total por sprint

#### R6.7 — Ruta y nav link

```tsx
// src/App.tsx
<Route path="/analytics" element={<AnalyticsScreen />} />
```

```tsx
// src/components/Header.tsx
<NavLink to="/analytics">Analítica</NavLink>
```

### Casos de prueba R6

- [ ] Cycle time calcula correctamente cuando un ítem volvió a `in-progress` después de `review`
- [ ] WIP aging ordena correctamente por antigüedad y colorea según umbrales
- [ ] Team load del sprint activo refleja inmediatamente un cambio de asignación en el backlog
- [ ] Estimation accuracy muestra `—` para sprints sin `committed_story_points`
- [ ] Todos los paneles muestran estado vacío amigable cuando no hay datos suficientes

---

## R7 — Build de producción

> Objetivo: poder correr la app desde el build compilado sin Vite. Un solo proceso, un solo puerto. Primera versión usable fuera del entorno de desarrollo.

### Por qué este release antes del SaaS

Mientras se desarrollan R8-R12 (PostgreSQL, auth, multi-tenancy), el equipo puede usar la versión compilada de R6+R7 en una máquina de la LAN o servidor interno. No hace falta esperar al SaaS completo para tener algo deployable.

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

Reemplazar todos los valores hardcodeados en `server/index.ts` y `server/db.ts` por `config.*`.

### R7.2 — Express sirve el frontend compilado en producción

```typescript
// server/index.ts
import path from 'path'
import { config } from './config'

if (config.isProd) {
  const distPath = path.join(process.cwd(), 'dist')
  app.use(express.static(distPath))
  // SPA fallback: cualquier ruta no-API devuelve index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}
```

**Importante**: el SPA fallback debe ir DESPUÉS de montar todos los routers de la API.

### R7.3 — Scripts de npm

```json
// package.json
{
  "scripts": {
    "dev":     "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite",
    "build":   "vite build",
    "start":   "NODE_ENV=production tsx server/index.ts",
    "preview": "npm run build && npm run start"
  }
}
```

`npm run preview` hace build completo y levanta el servidor de producción local. Es el comando para verificar que todo funciona antes de deployar.

### R7.4 — Logging básico

Reemplazar `console.log` del servidor con un logger simple:

```typescript
// server/logger.ts
export const logger = {
  info:  (...args: unknown[]) => console.log('[INFO]',  new Date().toISOString(), ...args),
  warn:  (...args: unknown[]) => console.warn('[WARN]',  new Date().toISOString(), ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', new Date().toISOString(), ...args),
}
```

En R12 se reemplazará con `pino` para logging estructurado en JSON.

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

Útil para verificar que el servidor está vivo en cualquier entorno.

### R7.6 — Documentación de arranque

Crear `DEPLOY.md` con instrucciones mínimas:

```markdown
## Arrancar en modo producción

1. `npm install`
2. Copiar `.env.example` a `.env` y ajustar valores
3. `npm run build`
4. `npm start`

La app queda disponible en http://localhost:3002
Los datos se guardan en DB_PATH (por defecto: data/planning.db)
```

### Casos de prueba R7

- [ ] `npm run preview` levanta sin errores y la app es usable en `localhost:3002`
- [ ] Navegar a cualquier ruta frontend (ej: `/board`) y recargar no devuelve 404
- [ ] `/api/v1/health` responde `{ status: 'ok' }` en modo producción
- [ ] Variables en `.env` sobreescriben los defaults (cambiar PORT=4000 y verificar)
- [ ] En modo desarrollo (`npm run dev`) el comportamiento no cambió

---

## R8 — PostgreSQL + arquitectura async

> Objetivo: reemplazar SQLite/better-sqlite3 por PostgreSQL. Todo el servidor pasa a ser async. La capa de repositorios queda completa para todos los recursos.
> **Prerrequisito**: PostgreSQL corriendo localmente (o en Docker). La app de SQLite sigue funcional hasta que este release se complete y valide.

### R8.1 — Dependencias

```bash
npm install pg kysely
npm install -D @types/pg
```

`Kysely` provee un query builder type-safe. Las queries se escriben en TypeScript, no en strings crudos.

### R8.2 — Conexión y schema

```typescript
// server/db.ts — reemplazar better-sqlite3
import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

const pool = new Pool({
  host:     config.dbHost,
  port:     config.dbPort,
  database: config.dbName,
  user:     config.dbUser,
  password: config.dbPassword,
})

export const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) })
```

El tipo `Database` define la forma de cada tabla — Kysely lo usa para que las queries sean type-safe:

```typescript
interface Database {
  backlog_items: BacklogItemTable
  sprints: SprintTable
  // ...
}
```

### R8.3 — Migration runner adaptado

El runner actual usa `schema_versions`. Se mantiene la misma lógica pero las migrations pasan a ser async y usan sintaxis PostgreSQL:

```typescript
// Diferencias de sintaxis clave:
// SQLite: datetime('now')  →  PostgreSQL: NOW()
// SQLite: ?                →  PostgreSQL: $1, $2, $3
// SQLite: TEXT para JSON   →  PostgreSQL: JSONB
// SQLite: AUTOINCREMENT    →  PostgreSQL: SERIAL o GENERATED ALWAYS AS IDENTITY
```

### R8.4 — Completar repositorios para todos los recursos

R5 creó `BacklogItemRepository`. En este release se crean los repositorios para todos los recursos:

```
server/repositories/
  BacklogItemRepository.ts   (ya existe, adaptar a async + Kysely)
  SprintRepository.ts
  ProductRepository.ts
  DeveloperRepository.ts
  MilestoneRepository.ts
  EventRepository.ts
  SnapshotRepository.ts
```

Cada repositorio recibe `db: Kysely<Database>` como dependencia. Los route handlers pasan a ser delgados:

```typescript
// Antes (SQLite síncrono):
router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(req.params.id)
  if (!item) { res.status(404).json({ error: 'Not found' }); return }
  res.json(deserialize(item))
})

// Después (PostgreSQL async):
router.get('/:id', async (req, res) => {
  const item = await backlogRepo.findById(req.params.id)
  if (!item) { res.status(404).json({ error: 'Not found' }); return }
  res.json(item)
})
```

### R8.5 — Variables de entorno ampliadas

```
# .env.example (agregar)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=planning_board
DB_USER=postgres
DB_PASSWORD=
```

### Casos de prueba R8

- [ ] `npm run preview` funciona idéntico a R7 pero con PostgreSQL como backend
- [ ] Backup exportado con SQLite puede restaurarse en PostgreSQL (datos compatibles)
- [ ] Todas las migraciones corren en orden en una DB vacía
- [ ] Cycle time y WIP aging de R6 devuelven los mismos valores que con SQLite

---

## R9 — Autenticación OAuth

> Objetivo: login con Google (o GitHub). JWT propio firmado por el servidor. El `actor` en `item_events` pasa a ser el usuario autenticado.

### R9.1 — Dependencias

```bash
npm install better-auth
# o alternativamente:
npm install passport passport-google-oauth20 jsonwebtoken
npm install -D @types/passport @types/passport-google-oauth20 @types/jsonwebtoken
```

Se recomienda **Better Auth** por su integración TypeScript-first y soporte nativo para Express.

### R9.2 — Variables de entorno

```
# .env.example (agregar)
JWT_SECRET=cambiar-por-secreto-largo-aleatorio
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
FRONTEND_URL=http://localhost:5173
```

### R9.3 — Endpoints de auth

```
GET  /auth/google              → redirect a Google OAuth
GET  /auth/google/callback     → procesa callback, genera JWT, redirect al frontend
GET  /auth/github              → redirect a GitHub OAuth
GET  /auth/github/callback     → procesa callback, genera JWT, redirect al frontend
POST /api/v1/auth/logout       → invalida sesión (si se usa refresh token)
GET  /api/v1/auth/me           → devuelve usuario autenticado actual
```

### R9.4 — Middleware de autenticación

```typescript
// server/middleware/auth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}
```

Aplicar a todas las rutas de la API excepto `/auth/*` y `/api/v1/health`.

### R9.5 — Actor en eventos

```typescript
// server/services/eventService.ts
export function recordEvent(params: RecordEventParams & { userId?: string }) {
  // actor pasa a ser req.user.name o req.user.id
}
```

Todos los endpoints que llaman a `recordEvent` reciben el usuario del middleware y lo propagan.

### R9.6 — Frontend: AuthContext + LoginScreen

```typescript
// src/context/AuthContext.tsx
interface AuthUser { id: string; name: string; email: string; avatarUrl?: string }
interface AuthContext { user: AuthUser | null; isLoading: boolean; logout: () => void }
```

```tsx
// src/features/auth/LoginScreen.tsx
export default function LoginScreen() {
  return (
    <div className="flex flex-col items-center gap-4 py-20">
      <h1>Planning Board</h1>
      <a href="/auth/google" className="btn">Continuar con Google</a>
      <a href="/auth/github" className="btn">Continuar con GitHub</a>
    </div>
  )
}
```

`App.tsx` envuelve las rutas en un guard que redirige a `/login` si no hay usuario autenticado.

### R9.7 — Guardar JWT en frontend

```typescript
// src/api/client.ts
// Después del callback OAuth, el servidor redirige a:
// /auth/callback?token=xxxxx
// El frontend lee el token del query param, lo guarda en localStorage,
// luego redirige a /

function getToken(): string | null {
  return localStorage.getItem('auth_token')
}

// Todas las requests incluyen el token:
headers: { Authorization: `Bearer ${getToken()}` }
```

### Casos de prueba R9

- [ ] Login con Google → usuario se crea en tabla `users` → JWT válido
- [ ] Request sin token → 401 en todas las rutas de la API
- [ ] Request con token expirado → 401 con mensaje claro
- [ ] Cambiar status de un ítem → `item_events.actor` = nombre del usuario autenticado
- [ ] Logout → token ya no es aceptado (si se implementa blacklist o refresh tokens)

---

## R10 — Multi-tenancy

> Objetivo: múltiples organizaciones en la misma instancia. Aislamiento completo de datos por `organization_id`. Roles por organización.

### R10.1 — Tablas nuevas

Migración:

```sql
CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member' | 'viewer'
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);
```

### R10.2 — `organization_id` en todas las tablas de datos

```sql
ALTER TABLE products         ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE developers       ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE backlog_items    ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE sprints          ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE milestones       ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE item_events      ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE sprint_capacity  ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE retrospectives   ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
ALTER TABLE saved_views      ADD COLUMN organization_id TEXT NOT NULL REFERENCES organizations(id);
```

Índices en `organization_id` para todas las tablas (queries siempre filtran por org).

### R10.3 — Middleware de organización

El JWT incluye `orgId` además de `userId`. Un middleware valida que el usuario pertenece a la org y expone `req.orgId`:

```typescript
// server/middleware/org.ts
export function requireOrgMember(req: Request, res: Response, next: NextFunction) {
  const orgId = req.headers['x-organization-id'] as string ?? req.user?.orgId
  if (!orgId) { res.status(400).json({ error: 'Organization requerida' }); return }
  // verificar membership en DB
  req.orgId = orgId
  next()
}
```

### R10.4 — Todos los repositorios reciben `orgId`

```typescript
// Todos los métodos de repositorio firman con orgId obligatorio:
findAll(orgId: string, filters: BacklogFilters): Promise<BacklogItem[]>
findById(orgId: string, id: string): Promise<BacklogItem | null>
create(orgId: string, data: CreateBacklogItemDto): Promise<BacklogItem>
```

El `orgId` va en cada WHERE de cada query. Ninguna query puede olvidarlo porque es un parámetro de la función, no un campo opcional.

### R10.5 — Frontend: selector de organización

Si un usuario pertenece a más de una organización, un selector en el header permite cambiar de contexto. Al cambiar de org, se invalida todo el cache de TanStack Query.

### R10.6 — Flujo de onboarding

```
Usuario nuevo → login OAuth → sin organización →
  opción A: "Crear organización" (slug, nombre)
  opción B: "Unirse por invitación" (código de invitación)
```

Endpoint de invitación:

```
POST /api/v1/organizations/:id/invitations   → genera código
POST /api/v1/invitations/:code/accept        → agrega user a org
```

### Casos de prueba R10

- [ ] Org A no puede ver ni modificar datos de Org B bajo ninguna circunstancia
- [ ] Un usuario con rol `viewer` no puede hacer PATCH ni POST
- [ ] Crear org → usuario queda como `owner` automáticamente
- [ ] Invitación usada → usuario aparece en la org con rol `member`
- [ ] Cambiar de org en el selector → la app muestra datos de la nueva org inmediatamente

---

## R11 — Real-time con WebSockets

> Objetivo: cambios en el board y el backlog se reflejan en tiempo real en todos los clientes conectados a la misma organización.

### R11.1 — Dependencias

```bash
npm install socket.io
npm install -D @types/socket.io  # si es necesario
# frontend:
npm install socket.io-client
```

### R11.2 — Integración con Express

```typescript
// server/index.ts
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'

const httpServer = createServer(app)
const io = new SocketServer(httpServer, {
  cors: { origin: config.frontendUrl, credentials: true },
})

io.on('connection', (socket) => {
  const token = socket.handshake.auth.token
  const payload = verifyJwt(token)
  if (!payload) { socket.disconnect(); return }
  socket.join(`org:${payload.orgId}`)
})

export function emitToOrg(orgId: string, event: string, payload: unknown) {
  io.to(`org:${orgId}`).emit(event, payload)
}

httpServer.listen(config.port)   // reemplaza app.listen()
```

### R11.3 — Eventos emitidos por el servidor

Llamar a `emitToOrg()` después de cada mutación exitosa:

| Mutación | Evento emitido | Payload |
| --- | --- | --- |
| PATCH /backlog-items/:id | `backlog:item:updated` | `{ itemId }` |
| POST /backlog-items | `backlog:item:created` | `{ itemId }` |
| DELETE /backlog-items/:id | `backlog:item:deleted` | `{ itemId }` |
| POST /sprints/:id/close | `sprint:closed` | `{ sprintId }` |
| PATCH /sprints/:id | `sprint:updated` | `{ sprintId }` |
| PUT /sprints/:id/retrospective | `retrospective:updated` | `{ sprintId }` |

### R11.4 — Hook en el frontend

```typescript
// src/hooks/useRealtimeSync.ts
export function useRealtimeSync() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return
    const socket = io({ auth: { token: getToken() } })

    socket.on('backlog:item:updated', () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
    )
    socket.on('backlog:item:created', () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
    )
    socket.on('backlog:item:deleted', () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.backlogItems })
    )
    socket.on('sprint:closed', ({ sprintId }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sprints })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sprintBurndown(sprintId) })
    })
    socket.on('sprint:updated', () =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.sprints })
    )
    socket.on('retrospective:updated', ({ sprintId }) =>
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.retrospective(sprintId) })
    )

    return () => { socket.disconnect() }
  }, [user, queryClient])
}
```

Este hook se monta una sola vez en `App.tsx`. TanStack Query ya sabe cómo refrescar los datos — los WebSockets solo mandan la señal de invalidación.

### Casos de prueba R11

- [ ] Juan mueve card en el board → María ve el cambio en < 500ms sin recargar
- [ ] Cierre de sprint → todos los clientes conectados ven el sprint como cerrado
- [ ] Desconexión de red → al reconectar, socket reestablece la room y se refresca el estado
- [ ] 5 usuarios moviendo cards simultáneamente → sin condiciones de carrera visibles

---

## R12 — Deploy SaaS

> Objetivo: la app corre en un servidor accesible por internet (o intranet de equipo) con zero-downtime deploy.

### R12.1 — Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/domain ./src/domain
COPY --from=builder /app/src/lib ./src/lib
EXPOSE 3002
CMD ["node", "--loader", "tsx/esm", "server/index.ts"]
```

### R12.2 — docker-compose.yml

```yaml
version: '3.9'
services:
  app:
    build: .
    ports:
      - "3002:3002"
    environment:
      NODE_ENV: production
      PORT: 3002
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: planning_board
      DB_USER: postgres
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: planning_board
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### R12.3 — Logging estructurado

```bash
npm install pino pino-pretty
```

```typescript
// server/logger.ts — reemplaza el logger simple de R7
import pino from 'pino'
export const logger = pino({
  level: config.isProd ? 'info' : 'debug',
  ...(config.isProd ? {} : { transport: { target: 'pino-pretty' } }),
})
```

En producción: JSON por stdout, fácil de procesar con Datadog, Grafana Loki, etc.

### R12.4 — Opciones de hosting recomendadas

| Opción | Ideal para | Costo aproximado |
| --- | --- | --- |
| **Railway** | Deploy automático desde GitHub, PostgreSQL incluido | ~$5-20/mes |
| **Render** | Similar a Railway, free tier disponible | $0-25/mes |
| **Fly.io** | Más control, excelente para Docker | $3-15/mes |
| **VPS propio** (DigitalOcean, Hetzner) | Control total, equipo técnico | $5-20/mes |
| **LAN interna** | Uso solo de equipo, sin internet público | Sin costo de hosting |

### Casos de prueba R12

- [ ] `docker compose up` levanta la app sin errores en máquina limpia
- [ ] Las migraciones corren automáticamente en el primer arranque
- [ ] `/api/v1/health` accesible desde fuera del contenedor
- [ ] Reiniciar el contenedor de app no pierde datos (PostgreSQL en volume separado)
- [ ] Variables en `.env` sobreescriben todas las configuraciones

---

## Decisiones cerradas

| ID | Decisión                     | Resolución                                                                                     |
|----|------------------------------|------------------------------------------------------------------------------------------------|
| D1 | Modelo Sprint ↔ Producto     | Opción C: sprint N:M con productos + tabla `sprint_product_metrics` para métricas por producto |
| D2 | `blocked` como status o flag | Status de primera clase, agregado en R0                                                        |
| D3 | Formato rich text            | Markdown con `marked` + `DOMPurify`, implementado en R4                                        |
| D4 | Auth propio vs OAuth         | OAuth externo (Google + GitHub) vía Better Auth, implementado en R9                            |
| D5 | Modelo multi-tenancy         | Row-level con `organization_id` en todas las tablas, implementado en R10                       |
| D6 | DB para SaaS                 | PostgreSQL con Kysely query builder, implementado en R8                                        |
| D7 | Real-time                    | Socket.io con invalidación de cache TanStack Query, implementado en R11                        |

---

## Métricas de éxito por release

| Release | Métrica clave |
|---------|--------------|
| R0 | Todos los tests de migración pasan en DB vacía y DB con datos |
| R1 | Burndown de sprint activo disponible con datos reales de `item_events` |
| R2 | Cierre de sprint automatizado sin ítems perdidos en 3 sprints consecutivos |
| R3 | Planning de sprint con capacidad muestra sobreasignación correctamente |
| R4 | Filtro guardado recuperado intacto en sesión nueva |
| R5 | Backup/restore completo funciona con schema de todos los releases anteriores |
| R6 | Cycle time calculado y WIP aging operativo con datos reales del equipo |
| R7 | `npm run preview` levanta la app lista para uso del equipo en la LAN |
| R8 | App funciona idéntica con PostgreSQL, sin pérdida de datos desde SQLite |
| R9 | Login con Google funciona, `item_events.actor` identifica al usuario real |
| R10 | Dos organizaciones en la misma instancia sin ninguna fuga de datos cross-tenant |
| R11 | Cambio en el board visible en otro cliente en menos de 500ms |
| R12 | `docker compose up` en máquina limpia levanta la app lista para producción |

---

## Stack de dependencias nuevas estimadas

| Librería | Release | Propósito |
| -------- | ------- | --------- |
| `marked` + `dompurify` | R4 | Render de Markdown en frontend |
| `dotenv` | R7 | Variables de entorno |
| `pg` + `kysely` | R8 | Driver PostgreSQL + query builder type-safe |
| `better-auth` | R9 | OAuth (Google, GitHub) + JWT |
| `socket.io` + `socket.io-client` | R11 | WebSockets para real-time |
| `pino` + `pino-pretty` | R12 | Logging estructurado |

---

*Última actualización: 2026-03-20*
