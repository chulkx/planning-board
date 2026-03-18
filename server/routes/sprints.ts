import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const sprintsRouter = Router()

function deserialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    productIds: JSON.parse(row.product_ids as string ?? '[]'),
    status: row.status,
    effortUnit: row.effort_unit,
    createdAt: row.created_at,
  }
}

sprintsRouter.get('/', (_req, res) => {
  res.json((db.prepare('SELECT * FROM sprints ORDER BY start_date DESC').all() as Record<string, unknown>[]).map(deserialize))
})

sprintsRouter.post('/', (req, res) => {
  const { name, startDate, endDate, productIds = [], status = 'planned', effortUnit = 'story-points' } = req.body as {
    name: string; startDate?: string; endDate?: string; productIds?: string[]; status?: string; effortUnit?: string
  }
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  const id = randomUUID()
  db.prepare('INSERT INTO sprints (id, name, start_date, end_date, product_ids, status, effort_unit) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, name, startDate ?? null, endDate ?? null, JSON.stringify(productIds), status, effortUnit)
  res.status(201).json(deserialize(db.prepare('SELECT * FROM sprints WHERE id = ?').get(id) as Record<string, unknown>))
})

sprintsRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  const { name, startDate, endDate, productIds, status, effortUnit } = req.body as Record<string, unknown>
  const sets: string[] = []
  const vals: unknown[] = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (startDate !== undefined) { sets.push('start_date = ?'); vals.push(startDate) }
  if (endDate !== undefined) { sets.push('end_date = ?'); vals.push(endDate) }
  if (productIds) { sets.push('product_ids = ?'); vals.push(JSON.stringify(productIds)) }
  if (status) { sets.push('status = ?'); vals.push(status) }
  if (effortUnit) { sets.push('effort_unit = ?'); vals.push(effortUnit) }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }
  vals.push(req.params.id)
  db.prepare(`UPDATE sprints SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  res.json(deserialize(db.prepare('SELECT * FROM sprints WHERE id = ?').get(req.params.id) as Record<string, unknown>))
})

sprintsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sprints WHERE id = ?').run(req.params.id)
  res.status(204).end()
})
