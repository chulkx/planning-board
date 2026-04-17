import { config } from './config.js'

export const logger = {
  info:  (...args: unknown[]) => console.log('[INFO] ', new Date().toISOString(), ...args),
  warn:  (...args: unknown[]) => console.warn('[WARN] ', new Date().toISOString(), ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', new Date().toISOString(), ...args),
  debug: (...args: unknown[]) => { if (!config.isProd) console.log('[DEBUG]', new Date().toISOString(), ...args) },
}
