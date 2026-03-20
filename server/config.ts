import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const config = {
  port:    parseInt(process.env.PORT ?? '3002'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dbPath:  process.env.DB_PATH ?? path.join(__dirname, '..', 'data', 'planning.db'),
  isProd:  process.env.NODE_ENV === 'production',
}
