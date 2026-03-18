import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const productsRouter = Router()

productsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY name').all()
  res.json(rows.map(deserialize))
})

productsRouter.post('/', (req, res) => {
  const { name, color = '#6366f1', boardColumns } = req.body as {
    name: string
    color?: string
    boardColumns?: string[]
  }
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  const id = randomUUID()
  const cols = boardColumns ?? ['not-started', 'in-progress', 'review', 'done']
  db.prepare('INSERT INTO products (id, name, color, board_columns) VALUES (?, ?, ?, ?)').run(id, name, color, JSON.stringify(cols))
  res.status(201).json(deserialize(db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>))
})

productsRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  const { name, color, boardColumns } = req.body as { name?: string; color?: string; boardColumns?: string[] }
  const sets: string[] = []
  const vals: unknown[] = []
  if (name) { sets.push('name = ?'); vals.push(name) }
  if (color) { sets.push('color = ?'); vals.push(color) }
  if (boardColumns) { sets.push('board_columns = ?'); vals.push(JSON.stringify(boardColumns)) }
  if (sets.length === 0) { res.status(400).json({ error: 'Nothing to update' }); return }
  vals.push(req.params.id)
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  res.json(deserialize(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as Record<string, unknown>))
})

productsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

function deserialize(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    boardColumns: JSON.parse(row.board_columns as string ?? '[]'),
    createdAt: row.created_at,
  }
}
