import { Router } from 'express'
import { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import db from '../db.js'
import { config } from '../config.js'
import { authenticateToken } from '../middleware/auth.js'

export const authRouter = Router()

// POST /api/v1/auth/login — recibe { name }, crea o recupera usuario, devuelve JWT
authRouter.post('/login', (req, res) => {
  const { name } = req.body as { name?: string }
  if (!name?.trim()) { res.status(400).json({ error: 'El nombre es obligatorio' }); return }

  const cleanName = name.trim()

  let user = db.prepare('SELECT id, name FROM users WHERE name = ?').get(cleanName) as
    { id: string; name: string } | undefined

  if (!user) {
    const id = randomUUID()
    db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)').run(id, cleanName, 'member')
    user = { id, name: cleanName }
  }

  const token = jwt.sign({ id: user.id, name: user.name }, config.jwtSecret, { expiresIn: '30d' })

  res.json({ token, user: { id: user.id, name: user.name } })
})

// GET /api/v1/auth/me — devuelve el usuario actual desde el token
authRouter.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user })
})

// GET /api/v1/auth/users — lista todos los usuarios (para mostrar quién está en el equipo)
authRouter.get('/users', authenticateToken, (_req, res) => {
  const users = db.prepare('SELECT id, name, role, created_at FROM users ORDER BY name').all()
  res.json(users)
})
