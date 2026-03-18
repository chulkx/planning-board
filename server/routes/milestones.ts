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
