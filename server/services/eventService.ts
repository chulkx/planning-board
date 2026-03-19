import { randomUUID } from 'crypto'
import db from '../db.js'

export type EventType =
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'sprint_changed'
  | 'imported'
  | 'automation'

export interface RecordEventParams {
  itemId: string
  eventType: EventType
  field?: string
  oldValue?: unknown
  newValue?: unknown
  source: 'user' | 'import' | 'automation' | 'system'
  actor?: string
  metadata?: Record<string, unknown>
}

export function recordEvent(params: RecordEventParams) {
  db.prepare(`
    INSERT INTO item_events (id, item_id, event_type, field, old_value, new_value, source, actor, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    params.itemId,
    params.eventType,
    params.field ?? null,
    params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
    params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
    params.source,
    params.actor ?? null,
    params.metadata ? JSON.stringify(params.metadata) : null,
  )
}
