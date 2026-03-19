import { randomUUID } from 'crypto'
import Papa from 'papaparse'
import db from '../db.js'
import type { BacklogItem, ImportCommitResult, ImportError } from '../../src/domain/types.js'
import {
  normalizeItemType,
  normalizePriority,
  normalizeStatus,
} from '../../src/domain/enums.js'
import { generateImportHash } from '../../src/lib/hashUtils.js'
import { suggestMappings, normalizeRow } from '../../src/lib/csvParser.js'

function ensureProduct(name: string): string {
  const existing = db.prepare('SELECT id FROM products WHERE name = ?').get(name) as { id: string } | undefined
  if (existing) return existing.id
  const id = randomUUID()
  const colors = ['#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899']
  const color = colors[Math.floor(Math.random() * colors.length)]
  db.prepare('INSERT INTO products (id, name, color) VALUES (?, ?, ?)').run(id, name, color)
  return id
}

function ensureDevelopers(names: string[]): void {
  for (const name of names) {
    const existing = db.prepare('SELECT id FROM developers WHERE name = ?').get(name)
    if (!existing) {
      db.prepare('INSERT INTO developers (id, name) VALUES (?, ?)').run(randomUUID(), name)
    }
  }
}

export function previewImport(csvContent: string, mappings: Record<string, string>) {
  const parsed = Papa.parse<Record<string, string>>(csvContent.replace(/^\ufeff/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const detectedColumns = parsed.meta.fields ?? []
  const suggestedMappings = Object.keys(mappings).length === 0
    ? suggestMappings(detectedColumns)
    : mappings

  const errors: ImportError[] = parsed.errors.map((e) => ({
    row: e.row ?? -1,
    message: e.message,
  }))

  const rows = parsed.data.map((raw, i) => {
    try {
      return normalizeRow(raw, suggestedMappings)
    } catch (e) {
      errors.push({ row: i + 2, message: String(e) })
      return {}
    }
  })

  return { rows, errors, detectedColumns, suggestedMappings }
}

export function commitImport(
  filename: string,
  csvContent: string,
  mappings: Record<string, string>,
): ImportCommitResult {
  const parsed = Papa.parse<Record<string, string>>(csvContent.replace(/^\ufeff/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const detectedColumns = parsed.meta.fields ?? []
  const resolvedMappings = Object.keys(mappings).length === 0
    ? suggestMappings(detectedColumns)
    : mappings

  const errors: ImportError[] = parsed.errors.map((e) => ({
    row: e.row ?? -1,
    message: e.message,
  }))

  let created = 0
  let updated = 0
  let skipped = 0

  const insertItem = db.prepare(`
    INSERT INTO backlog_items (
      id, external_id, title, description, item_type, product_id, feature,
      status, priority, assignee_ids, categories, service, version, client,
      start_date, due_date, report_date,
      effort_story_points, effort_quoted_hours, effort_estimated_hours, effort_actual_hours,
      notes, prod_changes, related_item_id, related_item_title,
      help_desk_id, help_desk_title, created_by, created_at, updated_at,
      import_hash, manual_overrides, raw_fields
    ) VALUES (
      @id, @externalId, @title, @description, @itemType, @productId, @feature,
      @status, @priority, @assigneeIds, @categories, @service, @version, @client,
      @startDate, @dueDate, @reportDate,
      @effortStoryPoints, @effortQuotedHours, @effortEstimatedHours, @effortActualHours,
      @notes, @prodChanges, @relatedItemId, @relatedItemTitle,
      @helpDeskId, @helpDeskTitle, @createdBy, @createdAt, @updatedAt,
      @importHash, @manualOverrides, @rawFields
    )
  `)

  const updateItem = db.prepare(`
    UPDATE backlog_items SET
      title = CASE WHEN 'title' IN (SELECT value FROM json_each(manual_overrides)) THEN title ELSE @title END,
      description = CASE WHEN 'description' IN (SELECT value FROM json_each(manual_overrides)) THEN description ELSE @description END,
      item_type = CASE WHEN 'itemType' IN (SELECT value FROM json_each(manual_overrides)) THEN item_type ELSE @itemType END,
      feature = CASE WHEN 'feature' IN (SELECT value FROM json_each(manual_overrides)) THEN feature ELSE @feature END,
      status = CASE WHEN 'status' IN (SELECT value FROM json_each(manual_overrides)) THEN status ELSE @status END,
      priority = CASE WHEN 'priority' IN (SELECT value FROM json_each(manual_overrides)) THEN priority ELSE @priority END,
      assignee_ids = CASE WHEN 'assigneeIds' IN (SELECT value FROM json_each(manual_overrides)) THEN assignee_ids ELSE @assigneeIds END,
      categories = CASE WHEN 'categories' IN (SELECT value FROM json_each(manual_overrides)) THEN categories ELSE @categories END,
      service = CASE WHEN 'service' IN (SELECT value FROM json_each(manual_overrides)) THEN service ELSE @service END,
      version = CASE WHEN 'version' IN (SELECT value FROM json_each(manual_overrides)) THEN version ELSE @version END,
      client = CASE WHEN 'client' IN (SELECT value FROM json_each(manual_overrides)) THEN client ELSE @client END,
      start_date = CASE WHEN 'startDate' IN (SELECT value FROM json_each(manual_overrides)) THEN start_date ELSE @startDate END,
      due_date = CASE WHEN 'dueDate' IN (SELECT value FROM json_each(manual_overrides)) THEN due_date ELSE @dueDate END,
      effort_story_points = CASE WHEN 'effortStoryPoints' IN (SELECT value FROM json_each(manual_overrides)) THEN effort_story_points ELSE @effortStoryPoints END,
      effort_quoted_hours = CASE WHEN 'effortQuotedHours' IN (SELECT value FROM json_each(manual_overrides)) THEN effort_quoted_hours ELSE @effortQuotedHours END,
      effort_estimated_hours = CASE WHEN 'effortEstimatedHours' IN (SELECT value FROM json_each(manual_overrides)) THEN effort_estimated_hours ELSE @effortEstimatedHours END,
      effort_actual_hours = CASE WHEN 'effortActualHours' IN (SELECT value FROM json_each(manual_overrides)) THEN effort_actual_hours ELSE @effortActualHours END,
      notes = CASE WHEN 'notes' IN (SELECT value FROM json_each(manual_overrides)) THEN notes ELSE @notes END,
      updated_at = @updatedAt,
      import_hash = @importHash,
      raw_fields = @rawFields
    WHERE external_id = @externalId
  `)

  const commitTx = db.transaction((rows: Array<ReturnType<typeof normalizeRow>>) => {
    for (const row of rows) {
      if (!row.title) continue

      const productName = (row as Record<string, unknown>)['_productName'] as string | undefined
      const productId = productName ? ensureProduct(productName) : null
      ensureDevelopers(row.assigneeIds ?? [])

      const params = {
        id: randomUUID(),
        externalId: row.externalId ?? null,
        title: row.title,
        description: row.description ?? null,
        itemType: row.itemType ?? 'task',
        productId,
        feature: row.feature ?? null,
        status: row.status ?? 'not-started',
        priority: row.priority ?? 'medium',
        assigneeIds: JSON.stringify(row.assigneeIds ?? []),
        categories: JSON.stringify(row.categories ?? []),
        service: row.service ?? null,
        version: row.version ?? null,
        client: row.client ?? null,
        startDate: row.startDate ?? null,
        dueDate: row.dueDate ?? null,
        reportDate: row.reportDate ?? null,
        effortStoryPoints: row.effortStoryPoints ?? null,
        effortQuotedHours: row.effortQuotedHours ?? null,
        effortEstimatedHours: row.effortEstimatedHours ?? null,
        effortActualHours: row.effortActualHours ?? null,
        notes: row.notes ?? null,
        prodChanges: row.prodChanges ?? null,
        relatedItemId: row.relatedItemId ?? null,
        relatedItemTitle: row.relatedItemTitle ?? null,
        helpDeskId: row.helpDeskId ?? null,
        helpDeskTitle: row.helpDeskTitle ?? null,
        createdBy: row.createdBy ?? null,
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
        importHash: row.importHash ?? null,
        manualOverrides: '[]',
        rawFields: JSON.stringify(row.rawFields ?? {}),
      }

      if (row.externalId) {
        const existing = db.prepare('SELECT id, import_hash FROM backlog_items WHERE external_id = ?').get(row.externalId) as { id: string; import_hash: string } | undefined
        if (existing) {
          if (existing.import_hash === row.importHash) {
            skipped++
          } else {
            updateItem.run(params)
            db.prepare(`
              INSERT INTO item_events (id, item_id, event_type, source, actor)
              VALUES (?, ?, 'imported', 'import', 'csv-import')
            `).run(randomUUID(), existing.id)
            updated++
          }
        } else {
          insertItem.run(params)
          db.prepare(`
            INSERT INTO item_events (id, item_id, event_type, source, actor)
            VALUES (?, ?, 'imported', 'import', 'csv-import')
          `).run(randomUUID(), params.id)
          created++
        }
      } else {
        insertItem.run(params)
        db.prepare(`
          INSERT INTO item_events (id, item_id, event_type, source, actor)
          VALUES (?, ?, 'imported', 'import', 'csv-import')
        `).run(randomUUID(), params.id)
        created++
      }
    }
  })

  const rows = parsed.data.map((raw, i) => {
    try {
      return normalizeRow(raw, resolvedMappings)
    } catch (e) {
      errors.push({ row: i + 2, message: String(e) })
      return {}
    }
  })

  commitTx(rows)

  const snapshotId = randomUUID()
  db.prepare(`
    INSERT INTO import_snapshots (id, filename, total_rows, created_count, updated_count, skipped_count, errors)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(snapshotId, filename, parsed.data.length, created, updated, skipped, JSON.stringify(errors))

  return { created, updated, skipped, errors, snapshotId }
}
