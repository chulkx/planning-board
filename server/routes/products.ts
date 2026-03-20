import { Router } from 'express'
import { randomUUID } from 'crypto'
import db from '../db.js'

export const productsRouter = Router()

interface BoardColumn { name: string; wipLimit: number | null }

const DEFAULT_COLUMNS: BoardColumn[] = [
  { name: 'not-started', wipLimit: null },
  { name: 'in-progress', wipLimit: null },
  { name: 'review', wipLimit: null },
  { name: 'done', wipLimit: null },
]

function normalizeBoardColumns(raw: unknown): BoardColumn[] {
  if (typeof raw !== 'string' || raw.trim() === '') return DEFAULT_COLUMNS
  try {
    const parsed = JSON.parse(raw) as Array<string | Partial<BoardColumn>>
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_COLUMNS
    return parsed
      .map((column) => {
        if (typeof column === 'string') return { name: column, wipLimit: null }
        if (!column || typeof column.name !== 'string' || column.name.trim() === '') return null
        return {
          name: column.name,
          wipLimit: typeof column.wipLimit === 'number' ? column.wipLimit : null,
        }
      })
      .filter((column): column is BoardColumn => column !== null)
  } catch {
    return DEFAULT_COLUMNS
  }
}

productsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY name').all()
  res.json(rows.map(deserialize))
})

productsRouter.post('/', (req, res) => {
  const { name, color = '#6366f1', boardColumns } = req.body as {
    name: string
    color?: string
    boardColumns?: BoardColumn[]
  }
  if (!name) { res.status(400).json({ error: 'name is required' }); return }
  const id = randomUUID()
  const cols = boardColumns ?? DEFAULT_COLUMNS
  db.prepare('INSERT INTO products (id, name, color, board_columns) VALUES (?, ?, ?, ?)').run(id, name, color, JSON.stringify(cols))
  res.status(201).json(deserialize(db.prepare('SELECT * FROM products WHERE id = ?').get(id) as Record<string, unknown>))
})

productsRouter.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
  if (!row) { res.status(404).json({ error: 'Not found' }); return }
  const { name, color, boardColumns } = req.body as { name?: string; color?: string; boardColumns?: BoardColumn[] }
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
    boardColumns: normalizeBoardColumns(row.board_columns),
    createdAt: row.created_at,
  }
}
