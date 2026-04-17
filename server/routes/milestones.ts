import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const milestonesRouter = Router()

function deserialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    targetDate: row.target_date,
    productIds: JSON.parse(row.product_ids as string ?? '[]'),
    status: row.status,
    createdAt: row.created_at,
  }
}

milestonesRouter.get('/', (_req, res) => {
  res.json((db.prepare('SELECT * FROM milestones ORDER BY target_date').all() as Record<string, unknown>[]).map(deserialize))
})

milestonesRouter.post('/', (req, res) => {
  const { name, targetDate, productIds = [], status = 'planned' } = req.body as {
    name: string; targetDate?: string; productIds?: string[]; status?: string
  }
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  const id = randomUUID()
  db.prepare('INSERT INTO milestones (id, name, target_date, product_ids, status) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, targetDate ?? null, JSON.stringify(productIds), status)
  res.status(201).json(deserialize(db.prepare('SELECT * FROM milestones WHERE id = ?').get(id) as Record<string, unknown>))
})

milestonesRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  const { name, targetDate, productIds, status } = req.body as Record<string, unknown>
  const sets: string[] = []
  const vals: unknown[] = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (targetDate !== undefined) { sets.push('target_date = ?'); vals.push(targetDate) }
  if (productIds) { sets.push('product_ids = ?'); vals.push(JSON.stringify(productIds)) }
  if (status) { sets.push('status = ?'); vals.push(status) }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }
  vals.push(req.params.id)
  db.prepare(`UPDATE milestones SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  res.json(deserialize(db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id) as Record<string, unknown>))
})

milestonesRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM milestones WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// GET /api/v1/milestones/:id/stats
milestonesRouter.get('/:id/stats', (req, res) => {
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined
  if (!milestone) { res.status(404).json({ error: 'Not found' }); return }

  const items = db.prepare(`
    SELECT id, status, due_date, item_id
    FROM backlog_items
    WHERE milestone_id = ?
  `).all(req.params.id) as Array<{ id: string; status: string; due_date: string | null; item_id?: string }>

  const today = new Date().toISOString().slice(0, 10)
  const totalItems = items.length
  const closedItems = items.filter(i => i.status === 'done').length
  const cancelledItems = items.filter(i => i.status === 'cancelled').length
  const openItems = totalItems - closedItems - cancelledItems
  const overdueItems = items.filter(i =>
    i.due_date && i.due_date < today && i.status !== 'done' && i.status !== 'cancelled'
  ).length
  const denominator = totalItems - cancelledItems
  const completionPct = denominator > 0 ? Math.round((closedItems / denominator) * 100) : 0

  const itemsByStatus: Record<string, number> = {}
  for (const item of items) {
    itemsByStatus[item.status] = (itemsByStatus[item.status] ?? 0) + 1
  }

  // Burndown: items open per day based on item_events
  const itemIds = items.map(i => i.id)
  let burndown: Array<{ date: string; open: number }> = []
  if (itemIds.length > 0) {
    const placeholders = itemIds.map(() => '?').join(',')
    const doneEvents = db.prepare(`
      SELECT item_id, MIN(created_at) AS done_at
      FROM item_events
      WHERE event_type = 'status_changed' AND new_value = 'done'
        AND item_id IN (${placeholders})
      GROUP BY item_id
    `).all(...itemIds) as Array<{ item_id: string; done_at: string }>

    const doneDates = new Map(doneEvents.map(e => [e.item_id, e.done_at.slice(0, 10)]))

    // Generate daily series from earliest item creation to today
    const allDates = [...new Set([
      ...items.map(() => today),
      ...doneEvents.map(e => e.done_at.slice(0, 10)),
    ])].sort()

    if (allDates.length > 0) {
      const startDate = allDates[0]
      const days: string[] = []
      const d = new Date(startDate)
      const end = new Date(today)
      while (d <= end) {
        days.push(d.toISOString().slice(0, 10))
        d.setDate(d.getDate() + 1)
      }

      burndown = days.map(day => ({
        date: day,
        open: itemIds.filter(id => {
          const doneDate = doneDates.get(id)
          return !doneDate || doneDate > day
        }).length,
      }))
    }
  }

  res.json({
    milestoneId: req.params.id,
    name: milestone.name,
    targetDate: milestone.target_date,
    status: milestone.status,
    totalItems,
    openItems,
    closedItems,
    cancelledItems,
    overdueItems,
    completionPct,
    itemsByStatus,
    burndown,
  })
})
