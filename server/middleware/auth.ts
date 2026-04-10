import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export interface AuthUser {
  id: string
  name: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization']
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) { res.status(401).json({ error: 'Token requerido' }); return }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

// Para rutas de solo lectura: adjunta el usuario si hay token, pero no bloquea si no hay
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers['authorization']
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret) as AuthUser
    } catch { /* ignorar token inválido en rutas opcionales */ }
  }
  next()
}
