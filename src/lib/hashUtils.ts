import type { BacklogItem } from '@/domain/types'

/**
 * Generates a stable hash for a backlog item to detect changes on reimport.
 * Uses a simple FNV-1a-like hash over the key fields.
 */
export function generateImportHash(item: Partial<BacklogItem>): string {
  const fields = [
    item.externalId ?? '',
    item.title ?? '',
    item.description ?? '',
    item.status ?? '',
    item.priority ?? '',
    (item.assigneeIds ?? []).join(';'),
  ]
  return simpleHash(fields.join('|'))
}

function simpleHash(str: string): string {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 16777619) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
