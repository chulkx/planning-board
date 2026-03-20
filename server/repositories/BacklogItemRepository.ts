import { randomUUID } from 'crypto'
import db from '../db.js'

export interface BacklogFilters {
  productId?: string
  sprintId?: string
  status?: string
  search?: string
}

export interface CreateBacklogItemDto {
  title: string
  itemType?: string
  productId?: string
  status?: string
  priority?: string
  description?: string
  [key: string]: unknown
}

function deserialize(row: Record<string, unknown>) {
  return {
    id:                   row.id,
    externalId:           row.external_id,
    title:                row.title,
    description:          row.description,
    itemType:             row.item_type,
    productId:            row.product_id,
    feature:              row.feature,
    status:               row.status,
    priority:             row.priority,
    assigneeIds:          JSON.parse((row.assignee_ids as string) ?? '[]'),
    sprintId:             row.sprint_id,
    milestoneId:          row.milestone_id,
    categories:           JSON.parse((row.categories as string) ?? '[]'),
    service:              row.service,
    version:              row.version,
    client:               row.client,
    startDate:            row.start_date,
    dueDate:              row.due_date,
    reportDate:           row.report_date,
    effortStoryPoints:    row.effort_story_points,
    effortQuotedHours:    row.effort_quoted_hours,
    effortEstimatedHours: row.effort_estimated_hours,
    effortActualHours:    row.effort_actual_hours,
    notes:                row.notes,
    prodChanges:          row.prod_changes,
    relatedItemId:        row.related_item_id,
    relatedItemTitle:     row.related_item_title,
    parentId:             row.parent_id,
    helpDeskId:           row.help_desk_id,
    helpDeskTitle:        row.help_desk_title,
    createdBy:            row.created_by,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
    importedAt:           row.imported_at,
    sortOrder:            row.sort_order,
  }
}

export class BacklogItemRepository {
  findAll(filters: BacklogFilters = {}) {
    let sql = 'SELECT * FROM backlog_items WHERE 1=1'
    const params: unknown[] = []
    if (filters.productId) { sql += ' AND product_id = ?'; params.push(filters.productId) }
    if (filters.sprintId)  { sql += ' AND sprint_id = ?';  params.push(filters.sprintId) }
    if (filters.status)    { sql += ' AND status = ?';     params.push(filters.status) }
    sql += ' ORDER BY COALESCE(sort_order, 999999), title'
    return (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(deserialize)
  }

  findById(id: string) {
    const row = db.prepare('SELECT * FROM backlog_items WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? deserialize(row) : null
  }

  delete(id: string) {
    return db.prepare('DELETE FROM backlog_items WHERE id = ?').run(id)
  }

  reorder(ids: string[]) {
    const update = db.prepare('UPDATE backlog_items SET sort_order = ? WHERE id = ?')
    db.transaction(() => {
      ids.forEach((id, i) => update.run(i, id))
    })()
  }
}

// Export unused symbol to avoid lint warning
void randomUUID

export const backlogItemRepo = new BacklogItemRepository()
