// Core enums with UI business logic (colors, sort order, labels)
// These are TypeScript unions — values with no UI logic use plain strings in the DB.

export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type BacklogStatus = 'not-started' | 'in-progress' | 'review' | 'done' | 'cancelled'
export type SprintStatus = 'planned' | 'active' | 'completed'
export type MilestoneStatus = 'planned' | 'active' | 'completed'
export type ItemType = 'bug' | 'feature' | 'task'
export type EffortUnit = 'story-points' | 'hours-estimated' | 'hours-quoted' | 'hours-actual'

// --- CSV normalization maps ---

/** Maps raw CSV priority values to internal Priority enum */
export const CSV_PRIORITY_MAP: Record<string, Priority> = {
  '1-crítico': 'critical',
  '1-critico': 'critical',
  'crítico': 'critical',
  'critico': 'critical',
  'critical': 'critical',
  '2-alto': 'high',
  'alto': 'high',
  'high': 'high',
  '3-media': 'medium',
  '3-medio': 'medium',
  'media': 'medium',
  'medio': 'medium',
  'medium': 'medium',
  '4-baja': 'low',
  'baja': 'low',
  'bajo': 'low',
  'low': 'low',
}

/** Maps raw CSV status values to internal BacklogStatus enum */
export const CSV_STATUS_MAP: Record<string, BacklogStatus> = {
  '1. no iniciado': 'not-started',
  'no iniciado': 'not-started',
  'not started': 'not-started',
  'backlog': 'not-started',
  '2. en curso': 'in-progress',
  'en curso': 'in-progress',
  'in progress': 'in-progress',
  'in-progress': 'in-progress',
  '3. revision': 'review',
  '3. revisión': 'review',
  'revision': 'review',
  'revisión': 'review',
  'review': 'review',
  '4. testing': 'review',
  '5. qa': 'review',
  '6. completado': 'done',
  'completado': 'done',
  'done': 'done',
  'completed': 'done',
  'cerrado': 'done',
  'cancelado': 'cancelled',
  'cancelled': 'cancelled',
  'canceled': 'cancelled',
}

/** Maps raw CSV item type values to internal ItemType enum */
export const CSV_ITEM_TYPE_MAP: Record<string, ItemType> = {
  'bug': 'bug',
  'error': 'bug',
  'defecto': 'bug',
  'funcionalidad': 'feature',
  'feature': 'feature',
  'mejora': 'feature',
  'enhancement': 'feature',
  'task': 'task',
  'tarea': 'task',
}

// --- UI metadata (colors, labels) ---

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Crítico', color: 'text-status-critical-fg', bgColor: 'bg-status-critical' },
  high:     { label: 'Alto',    color: 'text-status-high-fg',     bgColor: 'bg-status-high' },
  medium:   { label: 'Medio',   color: 'text-status-medium-fg',   bgColor: 'bg-status-medium' },
  low:      { label: 'Bajo',    color: 'text-status-neutral-fg',  bgColor: 'bg-status-neutral' },
}

export const STATUS_CONFIG: Record<BacklogStatus, { label: string; color: string; bgColor: string }> = {
  'not-started': { label: 'No iniciado', color: 'text-status-neutral-fg',  bgColor: 'bg-status-neutral' },
  'in-progress': { label: 'En curso',    color: 'text-status-progress-fg', bgColor: 'bg-status-progress' },
  'review':      { label: 'Revisión',    color: 'text-status-review-fg',   bgColor: 'bg-status-review' },
  'done':        { label: 'Completado',  color: 'text-status-done-fg',     bgColor: 'bg-status-done' },
  'cancelled':   { label: 'Cancelado',   color: 'text-status-neutral-fg',  bgColor: 'bg-status-neutral' },
}

export const ITEM_TYPE_CONFIG: Record<ItemType, { label: string; color: string }> = {
  bug:     { label: 'Bug',           color: 'text-status-critical-fg' },
  feature: { label: 'Funcionalidad', color: 'text-status-progress-fg' },
  task:    { label: 'Tarea',         color: 'text-status-neutral-fg' },
}

export const EFFORT_UNIT_LABELS: Record<EffortUnit, string> = {
  'story-points': 'Story Points',
  'hours-estimated': 'Hs Estimadas',
  'hours-quoted': 'Hs Cotizadas',
  'hours-actual': 'Hs Reales',
}

/** Priority sort order (lower = higher priority) */
export const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** Status sort order for kanban column ordering */
export const STATUS_ORDER: Record<BacklogStatus, number> = {
  'not-started': 0,
  'in-progress': 1,
  'review': 2,
  'done': 3,
  'cancelled': 4,
}

export function normalizePriority(raw: string): Priority {
  const key = raw.toLowerCase().trim()
  return CSV_PRIORITY_MAP[key] ?? 'medium'
}

export function normalizeStatus(raw: string): BacklogStatus {
  const key = raw.toLowerCase().trim()
  return CSV_STATUS_MAP[key] ?? 'not-started'
}

export function normalizeItemType(raw: string): ItemType {
  const key = raw.toLowerCase().trim()
  return CSV_ITEM_TYPE_MAP[key] ?? 'task'
}
