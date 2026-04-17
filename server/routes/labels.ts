import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const labelsRouter = Router()
export const itemLabelsRouter = Router({ mergeParams: true })

// ─── /api/v1/labels ───────────────────────────────────────────────────────────

labelsRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM labels ORDER BY name').all())
})

labelsRouter.post('/', (req, res) => {
  const { name, color = '#6366f1' } = req.body as { name: string; color?: string }
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  const id = randomUUID()
  try {
    db.prepare('INSERT INTO labels (id, name, color) VALUES (?, ?, ?)').run(id, name, color)
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Label name already exists' }); return
    }
    throw e
  }
  res.status(201).json(db.prepare('SELECT * FROM labels WHERE id = ?').get(id))
})

labelsRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM labels WHERE id = ?').get(req.params.id)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  const { name, color } = req.body as { name?: string; color?: string }
  const sets: string[] = []
  const vals: unknown[] = []
  if (name)  { sets.push('name = ?');  vals.push(name) }
  if (color) { sets.push('color = ?'); vals.push(color) }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }
  vals.push(req.params.id)
  db.prepare(`UPDATE labels SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  res.json(db.prepare('SELECT * FROM labels WHERE id = ?').get(req.params.id))
})

labelsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM labels WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// ─── /api/v1/backlog-items/:itemId/labels ────────────────────────────────────

itemLabelsRouter.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT l.* FROM labels l
    JOIN item_labels il ON il.label_id = l.id
    WHERE il.item_id = ?
    ORDER BY l.name
  `).all(req.params.itemId)
  res.json(rows)
})

itemLabelsRouter.post('/', (req, res) => {
  const { labelId } = req.body as { labelId: string }
  if (!labelId) { res.status(400).json({ error: 'labelId is required' }); return }
  const label = db.prepare('SELECT * FROM labels WHERE id = ?').get(labelId)
  if (!label) { res.status(404).json({ error: 'Label not found' }); return }
  try {
    db.prepare('INSERT INTO item_labels (item_id, label_id) VALUES (?, ?)').run(req.params.itemId, labelId)
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).message?.includes('UNIQUE') || (e as NodeJS.ErrnoException).message?.includes('PRIMARY KEY')) {
      res.status(409).json({ error: 'Label already assigned' }); return
    }
    throw e
  }
  res.status(201).json(label)
})

itemLabelsRouter.delete('/:labelId', (req, res) => {
  db.prepare('DELETE FROM item_labels WHERE item_id = ? AND label_id = ?')
    .run(req.params.itemId, req.params.labelId)
  res.status(204).end()
})
