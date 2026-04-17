# Guía de Arquitectura de Planning Board

Este documento explica cómo funciona el proyecto como stack completo, tomando como referencia el código real de este repositorio. Sirve tanto como documentación interna como material de aprendizaje para entender cómo trabajan juntos React, Express, SQLite y las librerías clave en una aplicación web full-stack de una sola máquina.

## 1. Qué es este proyecto

`planning-board` es una aplicación web local para gestión de backlog estilo Scrum, orientada a equipos pequeños que trabajan con múltiples productos.

Funcionalidades principales:

- Backlog global con jerarquía (épicos → historias → tareas/bugs)
- Board Kanban con columnas configurables por producto y límites WIP
- Sprint planning con capacidad por developer, burndown, velocity y CFD
- Retrospectivas por sprint
- Importación idempotente de CSV exportados desde Microsoft Lists
- Historial de actividad por ítem (audit log)
- Vistas guardadas (filtros persistidos)
- Backup y restore completo en JSON

Stack tecnológico:

- Express provee el backend con API REST bajo `/api/v1/`.
- SQLite (vía `better-sqlite3`) almacena todos los datos de forma local.
- React renderiza la interfaz como una Single Page Application.
- TanStack Query gestiona el estado del servidor en el frontend (cache, stale time, invalidación).
- Vite compila y sirve el frontend, y actúa como proxy de la API durante el desarrollo.
- TypeScript aporta tipado estático en frontend y backend.
- `@tanstack/react-table` maneja la tabla del backlog.
- `@dnd-kit/*` da el sistema de drag & drop para el board Kanban.
- `papaparse` parsea los archivos CSV.

Esta app no tiene servidor remoto ni base de datos externa. Todo corre localmente.

## 2. El modelo cliente-servidor local

La app tiene dos partes corriendo en la misma máquina:

### Backend: Express + SQLite

```text
server/
  index.ts              # punto de entrada, monta routers, job de snapshots
  db.ts                 # conexión SQLite + runner de migraciones
  routes/               # un archivo por recurso
  services/             # lógica de negocio reutilizable
  repositories/         # capa de acceso a datos (R5)
```

Responsabilidades:

- escuchar en el puerto 3002
- correr las migraciones al arrancar
- leer y escribir SQLite
- registrar eventos en `item_events` por cada cambio de campo
- ejecutar el job de snapshots diarios
- procesar CSV importados

### Frontend: React SPA

```text
src/
  domain/         # tipos, enums, schemas — sin dependencias de React
  api/            # client.ts + queries.ts
  lib/            # csvParser, hashUtils
  features/       # una carpeta por pantalla
```

El frontend nunca accede a SQLite directamente. Todo pasa por la API REST.

## 3. Cómo arranca la app en desarrollo

El comando `npm run dev` lanza dos procesos con `concurrently`:

1. `tsx watch server/index.ts` — backend en el puerto 3002 con recarga automática
2. `vite` — dev server del frontend en el puerto 5173

Cuando el frontend hace `fetch('/api/v1/...')`, Vite redirige esa petición al backend:

```ts
// vite.config.ts
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:3002',
      changeOrigin: true,
    },
  },
},
```

## 4. El sistema de migraciones versionadas

El esquema de la base de datos evoluciona mediante un runner de migraciones en `server/db.ts`. Es uno de los patrones más importantes del proyecto.

### La tabla `schema_versions`

```sql
CREATE TABLE IF NOT EXISTS schema_versions (
  version     INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Registra qué versiones ya se aplicaron. Permite arrancar en cualquier versión y llegar al estado actual sin reaplicar migraciones anteriores.

### El array `MIGRATIONS`

```ts
interface Migration {
  version: number
  description: string
  up: (db: Database) => void
}

const MIGRATIONS: Migration[] = [
  { version: 1, description: 'initial schema', up: (db) => db.exec(`...`) },
  { version: 2, description: 'add sort_order', up: (db) => { ... } },
  // ...hasta v11
]
```

La función `migrate()` compara las versiones aplicadas contra `MIGRATIONS` y ejecuta solo las pendientes, cada una en su propia transacción.

### Por qué este diseño

Sin migraciones versionadas, una app que ya tiene datos en producción no puede agregar columnas a tablas existentes: `CREATE TABLE IF NOT EXISTS` ignora si la tabla ya existe pero no puede agregar columnas nuevas. El runner resuelve esto permitiendo hacer `ALTER TABLE` en versiones incrementales.

### Versiones actuales

| Versión | Descripción |
| ------- | ----------- |
| v1 | Esquema inicial (products, developers, backlog_items, sprints, milestones, app_config, import_snapshots) |
| v2 | `sort_order` en backlog_items |
| v3 | Tabla `item_events` (audit log) |
| v4 | Campos de métricas en sprints + tabla `sprint_product_metrics` |
| v5 | Tabla `sprint_daily_snapshots` |
| v6 | `board_columns` de strings a objetos `{name, wipLimit}` |
| v7 | `parent_id` en backlog_items (jerarquía) |
| v8 | Tabla `sprint_capacity` (capacidad por developer por sprint) |
| v9 | Tabla `retrospectives` |
| v10 | Tabla `saved_views` |
| v11 | Tabla `users` |
| v12 | Tabla `item_links` (bloqueadores / relacionados entre ítems) |
| v13 | Tablas `labels` e `item_labels` (etiquetas flexibles) |
| v14 | Tabla `item_comments` (comentarios Markdown por ítem) |

## 5. Cómo se estructura la base de datos

### Tablas del dominio central

| Tabla | Propósito |
| ----- | --------- |
| `products` | Productos/proyectos. Se crean automáticamente desde el CSV. |
| `developers` | Desarrolladores. Se crean automáticamente desde el CSV. |
| `backlog_items` | Los ítems del backlog. Tabla central del sistema. |
| `sprints` | Sprints planificados. Relación N:M con productos via `product_ids` JSON. |
| `milestones` | Hitos de entrega. |
| `app_config` | Configuración global. Una sola fila con `id = 'singleton'`. |
| `import_snapshots` | Historial de importaciones CSV. |

### Tablas de eventos y métricas (R1+)

| Tabla | Propósito |
| ----- | --------- |
| `item_events` | Audit log de cambios. Cada cambio de campo genera una fila. |
| `sprint_product_metrics` | SP comprometidos y completados por producto dentro de un sprint. |
| `sprint_daily_snapshots` | Snapshot diario del estado de cada sprint activo (para burndown/CFD). |

### Tablas de Scrum completo (R2+)

| Tabla | Propósito |
| ----- | --------- |
| `sprint_capacity` | Capacidad en horas/SP de cada developer en cada sprint específico. |
| `retrospectives` | Una retro por sprint: went_well, to_improve, action_items (JSON). |
| `saved_views` | Filtros guardados por pantalla. |
| `users` | Usuarios locales con autenticación JWT. |

### Tablas de Issues GitLab-style (R6-bis)

| Tabla | Propósito |
| ----- | --------- |
| `item_links` | Vínculos entre ítems: `blocks` (bloquea) o `related` (relacionado). |
| `labels` | Etiquetas con nombre y color. |
| `item_labels` | Junction table: asignación de etiquetas a ítems (N:M). |
| `item_comments` | Comentarios Markdown por ítem, con autor y timestamps. |

#### Esquema `item_links`

```sql
CREATE TABLE item_links (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  link_type   TEXT NOT NULL DEFAULT 'blocks',  -- 'blocks' | 'related'
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_id, target_id, link_type)
);
```

#### Esquema `labels` e `item_labels`

```sql
CREATE TABLE labels (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE item_labels (
  item_id  TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, label_id)
);
```

#### Esquema `item_comments`

```sql
CREATE TABLE item_comments (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_item_comments_item ON item_comments(item_id);
```

### Arrays y objetos en SQLite

SQLite no tiene tipo array ni JSON nativo. Los arrays y objetos se guardan como columnas `TEXT` con contenido JSON:

```sql
assignee_ids  TEXT NOT NULL DEFAULT '[]'   -- JSON array de nombres
product_ids   TEXT NOT NULL DEFAULT '[]'   -- en sprints y milestones
board_columns TEXT NOT NULL DEFAULT '[]'   -- JSON array de objetos {name, wipLimit}
```

El backend deserializa con `JSON.parse()` al leer y serializa con `JSON.stringify()` al escribir.

### El campo `board_columns`

Las columnas del Kanban se guardan en `products.board_columns` como un array de objetos:

```json
[
  { "name": "not-started", "wipLimit": null },
  { "name": "in-progress", "wipLimit": 3 },
  { "name": "review",      "wipLimit": null },
  { "name": "done",        "wipLimit": null }
]
```

Esto permite configurar límites WIP por columna por producto. La migración v6 transformó el formato anterior (array de strings) a este formato.

## 6. El modelo de dominio

### `src/domain/types.ts`

Define las interfaces TypeScript. Las más importantes:

**`BacklogItem`** — refleja los campos del CSV más los campos internos:

- `externalId`: el ID del CSV, para reimportar sin duplicar
- `itemType: ItemType`: `'epic' | 'story' | 'bug' | 'feature' | 'task'`
- `parentId: string | null`: para la jerarquía epic → story → task/bug
- `assigneeIds: string[]`: array de nombres de developer
- `sortOrder: number | null`: posición manual en el backlog
- `manualOverrides: string[]`: campos editados desde la UI, protegidos de sobreescritura en reimport
- `importHash`: hash de los campos clave para detectar cambios entre importaciones

**`Product`** — incluye `boardColumns: BoardColumn[]` donde `BoardColumn = { name: string; wipLimit: number | null }`.

**Otras interfaces**: `Sprint`, `SprintCapacityEntry`, `Retrospective`, `RetroActionItem`, `SprintBurndownResponse`, `VelocityResponse`, `CfdResponse`, `SavedView`, `ItemEvent`, `Label`, `ItemLink`, `ItemLinksResponse`, `ItemComment`, `MilestoneStats`, `DeveloperStats`, `DeveloperStatsResponse`.

### `src/domain/enums.ts`

Define los tipos union con lógica de UI (colores, labels, orden de sort) y los mapas de normalización para convertir valores del CSV a esos tipos:

```ts
export type BacklogStatus = 'not-started' | 'in-progress' | 'blocked' | 'review' | 'done' | 'cancelled'
export type Priority      = 'critical' | 'high' | 'medium' | 'low'
export type ItemType      = 'epic' | 'story' | 'bug' | 'feature' | 'task'

export const STATUS_CONFIG: Record<BacklogStatus, { label: string; color: string; bgColor: string }> = { ... }
export const CSV_STATUS_MAP: Record<string, BacklogStatus> = {
  'en progreso': 'in-progress',
  'bloqueado': 'blocked',
  // ...
}
```

Los valores con comportamiento UI son tipos union. Los valores variables sin lógica (categorías, clientes, servicios) son strings libres.

## 7. La capa de API del backend

Todos los endpoints están bajo `/api/v1/`. Cada recurso tiene su router:

| Archivo | Ruta base | Operaciones principales |
| ------- | --------- | ----------------------- |
| `backlog.ts` | `/api/v1/backlog-items` | GET (filtros), PATCH /reorder, PATCH /:id, PATCH /:id/parent, GET /:id/events, DELETE /:id |
| `products.ts` | `/api/v1/products` | CRUD completo |
| `developers.ts` | `/api/v1/developers` | CRUD completo |
| `sprints.ts` | `/api/v1/sprints` | CRUD + GET /:id/burndown + GET/POST /:id/close-preview + POST /:id/close + GET/PUT /:id/capacity/:devId + GET/PUT /:id/retrospective |
| `milestones.ts` | `/api/v1/milestones` | CRUD completo + GET /:id/stats |
| `imports.ts` | `/api/v1/imports` | POST /preview, POST /commit, POST /restore, GET /history |
| `config.ts` | `/api/v1/config` | GET, PATCH |
| `reports.ts` | `/api/v1/reports` | GET /velocity, GET /products/:id/cfd, GET /developer-stats |
| `savedViews.ts` | `/api/v1/saved-views` | GET (?screen=), POST, DELETE /:id |
| `labels.ts` | `/api/v1/labels` | CRUD + POST/DELETE /backlog-items/:id/labels |
| `links.ts` | `/api/v1/backlog-items/:id/links` | GET, POST, DELETE /:linkId |
| `comments.ts` | `/api/v1/backlog-items/:id/comments` | GET, POST, PATCH /:commentId, DELETE /:commentId |
| `index.ts` | `/api/v1/exports/json` | GET (backup completo) |

### WIP limits en `PATCH /api/v1/backlog-items/:id`

Cuando un ítem cambia de columna en el board (cambio de `status`), el endpoint verifica el límite WIP de la columna destino:

```ts
// La respuesta incluye información WIP si se excede el límite
{ ...item, wip: { exceeded: true, current: 4, limit: 3 } }
```

El WIP es una advertencia, nunca bloquea el movimiento.

### Autoestado

En el mismo `PATCH`, si `effort_actual_hours > 0` y el status es `not-started`, el sistema lo transiciona automáticamente a `in-progress` y registra el evento con `source: 'automation'`.

### Cierre de sprint (`POST /api/v1/sprints/:id/close`)

El algoritmo de cierre:

1. Para cada ítem no completado del sprint, busca el próximo sprint `planned` que incluya el mismo `product_id`
2. Si encuentra uno → mueve el ítem a ese sprint
3. Si no → mueve el ítem al backlog (sin sprint)
4. Registra eventos `sprint_changed` con `source: 'automation'`
5. Calcula y guarda `completed_story_points` en el sprint y en `sprint_product_metrics`

## 8. El sistema de eventos (`item_events`)

Toda modificación de un ítem queda registrada en `item_events`:

```sql
CREATE TABLE item_events (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES backlog_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,   -- 'status_changed', 'priority_changed', 'sprint_changed', 'assigned', 'imported', 'automation'
  field      TEXT,
  old_value  TEXT,
  new_value  TEXT,
  source     TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'import' | 'automation' | 'system'
  actor      TEXT,
  metadata   TEXT,            -- JSON con contexto adicional
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

La función `recordEvent()` en `server/services/eventService.ts` centraliza la inserción. La llaman:

- `server/routes/backlog.ts` — cuando cambian status, priority, sprintId, assigneeIds
- `server/services/importService.ts` — para cada ítem creado o actualizado en un import
- `server/routes/sprints.ts` — cuando el cierre de sprint mueve ítems

El frontend lee estos eventos en la pestaña "Actividad" del `ItemEditPanel`.

## 9. Snapshots diarios y métricas de sprint

### `sprint_daily_snapshots`

El job de snapshots (`server/services/snapshotService.ts`) corre al arrancar el servidor y se repite a medianoche:

```ts
// server/index.ts
app.listen(PORT, () => {
  runSnapshotJob()
})
const msUntilMidnight = ...
setTimeout(() => { runSnapshotJob(); setInterval(runSnapshotJob, 86_400_000) }, msUntilMidnight)
```

Para cada sprint activo, guarda el estado del día: SP restantes, SP completados, conteo de ítems por status. Esto permite reconstruir el burndown chart histórico.

### Burndown (`GET /api/v1/sprints/:id/burndown`)

Devuelve los snapshots diarios del sprint más una línea ideal calculada. El frontend los grafica en `SprintPlanningScreen`.

### Velocity (`GET /api/v1/reports/velocity`)

Agrega `completed_story_points` de los sprints cerrados. Si se pasa `productId`, usa `sprint_product_metrics` para velocity por producto.

### CFD (`GET /api/v1/reports/products/:id/cfd`)

Agrega los `status_counts` de `sprint_daily_snapshots` para todos los sprints que incluyen el producto, en el rango de fechas solicitado.

## 10. El pipeline de importación CSV

### Etapa 1: Preview (`POST /api/v1/imports/preview`)

Parsea el CSV sin tocar la base de datos. Devuelve ítems normalizados, errores, columnas detectadas y mapeos sugeridos.

### Etapa 2: Mapeo de columnas (frontend)

El usuario puede ajustar qué columna del CSV mapea a qué campo interno. La auto-detección en `src/lib/csvParser.ts` normaliza headers y los compara contra `DEFAULT_COLUMN_MAPPINGS`.

### Etapa 3: Commit (`POST /api/v1/imports/commit`)

Upsert en transacción SQLite por cada fila:

1. No existe ítem con ese `externalId` → INSERT + evento `imported`
2. Existe y el `importHash` cambió → UPDATE (respetando `manualOverrides`) + evento `imported`
3. Existe y el `importHash` no cambió → skip

### `manualOverrides`

Cuando se edita un campo desde la UI, ese campo se agrega a `manual_overrides`. En la reimportación, esos campos no se sobreescriben aunque el CSV tenga valores distintos.

### El problema del BOM de UTF-8

Los CSV de Microsoft Lists tienen un BOM al inicio (`\ufeff`). Se elimina antes de parsear:

```ts
csvContent.replace(/^\ufeff/, '')
```

## 11. La jerarquía de ítems

Los ítems soportan jerarquía mediante `parent_id`:

- `epic` → `story`
- `story` → `task` | `bug`
- `bug` puede ser raíz o hijo de `story`

El endpoint `PATCH /api/v1/backlog-items/:id/parent` valida que no se creen ciclos (recorriendo el árbol hacia arriba desde el `parentId` propuesto).

El frontend expone esta jerarquía en dos lugares:

- **BacklogScreen**: toggle "Tabla / Árbol" — la vista árbol muestra ítems indentados por nivel con contador de hijos completados (X/N)
- **BoardScreen**: los cards de tipo `epic` muestran una barra de progreso con el porcentaje de historias hijas en estado `done`

## 12. Cómo funciona el frontend

### Routing con React Router

```tsx
// src/App.tsx
<BrowserRouter>
  <Routes>
    <Route path="/"           element={<BacklogScreen />} />
    <Route path="/board"      element={<BoardScreen />} />
    <Route path="/sprints"    element={<SprintPlanningScreen />} />
    <Route path="/milestones" element={<MilestonesScreen />} />
    <Route path="/import"     element={<ImportScreen />} />
    <Route path="/settings"   element={<SettingsScreen />} />
  </Routes>
</BrowserRouter>
```

### La capa de API del frontend

`src/api/client.ts` centraliza todas las llamadas al backend con una función base `request<T>()`. Ningún componente usa `fetch` directamente.

### TanStack Query para el estado del servidor

Todas las pantallas usan `useQuery` y `useMutation` de TanStack Query en lugar de `useEffect + fetch`. El patrón estándar:

```ts
// src/api/queries.ts — claves y stale times centralizados
export const QUERY_KEYS = {
  backlogItems: ['backlog-items'] as const,
  products:     ['products']      as const,
  sprintBurndown: (id: string) => ['sprint-burndown', id] as const,
  savedViews:     (screen?: string) => ['saved-views', screen ?? 'all'] as const,
  itemEvents:     (itemId: string) => ['item-events', itemId] as const,
  // ...
}

export const STALE_TIMES = {
  backlogItems: 30_000,   // 30s
  products:     5 * 60_000,  // 5min
  // ...
}
```

```tsx
// En un componente
const { data: items = [] } = useQuery({
  queryKey: QUERY_KEYS.backlogItems,
  queryFn: () => getBacklogItems(),
  staleTime: STALE_TIMES.backlogItems,
})
```

Las mutaciones usan `queryClient.invalidateQueries()` para refrescar el cache después de un cambio, o `queryClient.setQueryData()` para actualizaciones optimistas.

## 13. El board Kanban con dnd-kit

`BoardScreen.tsx` usa tres librerías de `@dnd-kit`:

- `@dnd-kit/core`: el contexto de drag & drop
- `@dnd-kit/sortable`: hace los cards arrastrables
- `@dnd-kit/utilities`: helpers de CSS para transformaciones

Las **columnas** usan `useDroppable` (drop targets, no arrastrables). Los **cards** usan `useSortable` (arrastrables y drop targets).

### WIP en el board

Cada columna lee `wipLimit` de `product.boardColumns`. Si el conteo actual de la columna supera el límite, el header se muestra en rojo. El valor del límite viene del objeto `BoardColumn` del producto.

### Drop resolution

```ts
// handleDragEnd determina el status destino:
// 1. Si se soltó sobre una columna → targetStatus = col.name
// 2. Si se soltó sobre un card → targetStatus = status del card destino
```

Luego hace optimistic update local y llama a `PATCH /api/v1/backlog-items/:id`. Si el servidor falla, revierte el estado local.

## 14. ItemEditPanel: edición, relaciones, comentarios y actividad

`ItemEditPanel.tsx` es el panel lateral que se abre al clickar un ítem en el backlog o el board. Tiene cuatro pestañas:

**Detalles** — edición de todos los campos del ítem (status, priority, assignees, sprint, milestone, effort, notas, etiquetas). Las notas tienen un toggle "Editar / Vista previa" con `simpleMarkdown()`.

**Relaciones** — vínculos con otros ítems. Secciones "Bloquea a", "Bloqueado por" y "Relacionado con". Buscador inline con mínimo 2 caracteres. Usa los endpoints de `item_links`.

**Comentarios** — lista cronológica de `item_comments`. Editor con selector de autor y soporte Markdown. Permite editar y eliminar comentarios propios.

**Actividad** — timeline de `item_events` del ítem. Muestra tipo de evento, campo cambiado, valores anterior/nuevo, fuente (manual / import / automation) y timestamp.

## 15. Vistas guardadas (saved_views)

`BacklogScreen` permite guardar el estado actual de los filtros como una vista con nombre. Las vistas guardadas se almacenan en `saved_views` vía `POST /api/v1/saved-views` y aparecen como chips bajo los filtros. Clickar un chip restaura todos los filtros guardados.

## 16. Sprint planning: capacidad y retrospectivas

`SprintPlanningScreen` tiene tres áreas principales:

**DevCapacityPanel** — para cada developer, muestra horas comprometidas vs capacidad del sprint (tomada de `sprint_capacity` si existe, sino del `capacity_per_sprint` por defecto del developer). Semáforo: verde < 80%, amarillo 80–100%, rojo > 100%. Los valores son editables inline y se guardan con `PUT /api/v1/sprints/:id/capacity/:devId`.

**RetroPanel** — formulario colapsable para la retrospectiva del sprint: "¿Qué salió bien?", "¿Qué mejorar?" y action items con checkboxes. Se guarda con `PUT /api/v1/sprints/:id/retrospective`.

**Cierre de sprint** — botón que abre un modal de preview (muestra ítems incompletos y a dónde irán) antes de confirmar con `POST /api/v1/sprints/:id/close`.

## 17. La capa de repositorios (R5)

`server/repositories/BacklogItemRepository.ts` encapsula el acceso a datos del backlog:

```ts
export class BacklogItemRepository {
  findAll(filters: BacklogFilters): BacklogItem[]
  findById(id: string): BacklogItem | null
  delete(id: string): RunResult
  reorder(ids: string[]): void
}
```

El patrón separa "cómo se consulta la DB" de "cómo se valida y responde en la ruta". Los route handlers quedan como capas de validación + llamada al repositorio. Las demás entidades (sprints, products, etc.) siguen el mismo patrón pero con el SQL inline en la ruta, lo que es aceptable para una app de este tamaño.

## 18. El sistema de backup y restore

### Export (`GET /api/v1/exports/json`)

Lee todas las tablas de usuario y devuelve el resultado como JSON descargable. Incluye todas las tablas R0–R5: `products`, `developers`, `sprints`, `milestones`, `backlogItems`, `itemEvents`, `sprintCapacity`, `retrospectives`, `savedViews`.

### Restore (`POST /api/v1/imports/restore`)

Limpia y recarga en orden FK-safe dentro de una transacción:

1. DELETE en orden: `saved_views`, `item_events`, `sprint_daily_snapshots`, `sprint_capacity`, `retrospectives`, `sprint_product_metrics`, `backlog_items`, `sprints`, `milestones`, `developers`, `products`
2. INSERT OR IGNORE de cada tabla del backup, con valores por defecto para claves opcionales

Si algo falla, la transacción se revierte: o se restaura todo, o no se restaura nada. Los backups más viejos que no incluyan las tablas R1+ simplemente restauran lo que tienen.

## 19. Organización del frontend por features

```text
src/
  domain/
    types.ts       # interfaces: BacklogItem, Product, Sprint, SavedView, ItemEvent, ...
    enums.ts       # tipos union con config UI: STATUS_CONFIG, PRIORITY_CONFIG, ITEM_TYPE_CONFIG
    schemas.ts     # validación Zod para requests de importación
  api/
    client.ts      # todas las funciones fetch (getBacklogItems, patchBacklogItem, ...)
    queries.ts     # QUERY_KEYS y STALE_TIMES centralizados
  lib/
    csvParser.ts   # parsing y normalización de CSV
    hashUtils.ts   # FNV-1a para importHash
  features/
    backlog/
      BacklogScreen.tsx    # tabla + vista árbol + filtros + vistas guardadas
      ItemEditPanel.tsx    # panel lateral: detalles + relaciones + comentarios + actividad
    board/
      BoardScreen.tsx      # Kanban con WIP limits + progreso de épicos + badge de bloqueados
    sprint/
      SprintPlanningScreen.tsx  # burndown + velocity + capacidad + cierre + retro
    milestones/
      MilestonesScreen.tsx       # lista + asignación de ítems
      MilestoneDetailScreen.tsx  # dashboard: progreso + burndown + ítems por estado
    analytics/
      AnalyticsScreen.tsx  # tabs: Overview + Sprints + Productos + Devs
    import/
      ImportScreen.tsx     # wizard CSV 4 pasos
    settings/
      SettingsScreen.tsx   # config, productos (WIP limits), developers, etiquetas, backup
```

Los archivos de `domain/` no importan nada de React — son TypeScript puro reutilizable tanto por el frontend como por el backend (`importService.ts` importa directamente de `src/domain/enums.ts` y `src/lib/`).

## 20. Dónde encaja TypeScript

TypeScript cubre todo el proyecto. El beneficio principal: la interfaz `BacklogItem` en `src/domain/types.ts` es la misma que usa el frontend para mostrar datos y la que guía cómo el backend construye los objetos antes de responder. Cualquier cambio en la interfaz es detectado en ambos extremos.

## 21. Mapa de archivos para orientarse rápido

Orden de lectura sugerido para alguien nuevo:

1. `package.json` — scripts y dependencias
2. `vite.config.ts` — proxy de desarrollo
3. `server/db.ts` — migraciones y conexión SQLite
4. `server/index.ts` — arranque, routers, job de snapshots
5. `src/domain/types.ts` — interfaces del dominio
6. `src/domain/enums.ts` — tipos union con lógica UI
7. `src/api/client.ts` + `src/api/queries.ts` — capa de API del frontend
8. `src/App.tsx` — routing
9. `server/routes/backlog.ts` — ruta más compleja (filtros, reorder, parent, events, WIP, autoestado)
10. `server/services/importService.ts` — pipeline de importación
11. `server/services/snapshotService.ts` — job de snapshots diarios
12. `src/features/backlog/BacklogScreen.tsx` — vista tabla + árbol + vistas guardadas
13. `src/features/board/BoardScreen.tsx` — Kanban con dnd-kit
14. `src/features/sprint/SprintPlanningScreen.tsx` — burndown, velocity, capacidad, retro

## 22. Logger estructurado (R6-bis)

`server/logger.ts` exporta un objeto `logger` con cuatro niveles:

```ts
logger.info('servidor escuchando en puerto', PORT)
logger.warn('WIP limit superado', { column, current, limit })
logger.error('fallo al aplicar migración', err)
logger.debug('query ejecutada', sql)  // solo en development
```

Formato de salida: `[NIVEL] 2026-04-17T12:00:00.000Z mensaje ...args`. `debug` se suprime en `NODE_ENV=production`.

## 23. Resumen de arquitectura en una sola frase

Este proyecto es una app web full-stack LAN-ready donde Express sirve una API REST versionada (`/api/v1/`) con SQLite como persistencia local y migraciones incrementales hasta v14, React consume esa API a través de TanStack Query con cache por stale time, y el flujo central combina la importación idempotente de CSVs de Microsoft Lists con un sistema completo de Scrum (jerarquía de ítems, Kanban WIP, sprint planning, burndown/velocity/CFD, cierre automatizado, retrospectivas, audit log) más funcionalidades GitLab-style: bloqueadores entre ítems, etiquetas flexibles, comentarios Markdown por ítem, dashboard de milestone con burndown y métricas de rendimiento por developer.
