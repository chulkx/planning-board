import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const config = {
  port:       parseInt(process.env.PORT ?? '3002'),
  host:       process.env.HOST ?? '0.0.0.0',
  nodeEnv:    process.env.NODE_ENV ?? 'development',
  dbPath:     process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'planning.db'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  jwtSecret:  process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  isProd:     process.env.NODE_ENV === 'production',
}
