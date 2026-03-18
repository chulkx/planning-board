import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const developersRouter = Router()

developersRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM developers ORDER BY name').all())
})

developersRouter.post('/', (req, res) => {
  const { name, capacityPerSprint = 0 } = req.body as { name: string; capacityPerSprint?: number }
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  const id = randomUUID()
  db.prepare('INSERT INTO developers (id, name, capacity_per_sprint) VALUES (?, ?, ?)').run(id, name, capacityPerSprint)
  res.status(201).json(db.prepare('SELECT * FROM developers WHERE id = ?').get(id))
})

developersRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM developers WHERE id = ?').get(req.params.id)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  const { name, capacityPerSprint } = req.body as { name?: string; capacityPerSprint?: number }
  const sets: string[] = []
  const vals: unknown[] = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (capacityPerSprint !== undefined) { sets.push('capacity_per_sprint = ?'); vals.push(capacityPerSprint) }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }
  vals.push(req.params.id)
  db.prepare(`UPDATE developers SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  res.json(db.prepare('SELECT * FROM developers WHERE id = ?').get(req.params.id))
})

developersRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM developers WHERE id = ?').run(req.params.id)
  res.status(204).end()
})
