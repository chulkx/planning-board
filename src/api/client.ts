import type {
  BacklogItem,
  BacklogFilters,
  ImportCommitResult,
  ImportPreviewResult,
  ImportSnapshot,
  Product,
  Developer,
  Sprint,
  Milestone,
  AppConfig,
} from '@/domain/types'

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? res.statusText)
  }
  return res.json()
}

// --- Backlog ---

export function getBacklogItems(filters: BacklogFilters = {}): Promise<BacklogItem[]> {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, v) })
  const qs = params.toString()
  return request(`/backlog-items${qs ? `?${qs}` : ''}`)
}

export function patchBacklogItem(id: string, updates: Partial<BacklogItem>): Promise<BacklogItem> {
  return request(`/backlog-items/${id}`, { method: 'PATCH', body: JSON.stringify(updates) })
}

export function reorderBacklogItems(ids: string[]): Promise<void> {
  return request('/backlog-items/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) })
}

// --- Imports ---

export function previewImport(csvContent: string, mappings: Record<string, string>): Promise<ImportPreviewResult> {
  return request('/imports/preview', { method: 'POST', body: JSON.stringify({ csvContent, mappings }) })
}

export function commitImport(csvContent: string, mappings: Record<string, string>, filename: string): Promise<ImportCommitResult> {
  return request('/imports/commit', { method: 'POST', body: JSON.stringify({ csvContent, mappings, filename }) })
}

// --- Products ---

export function getProducts(): Promise<Product[]> {
  return request('/products')
}

export function createProduct(data: { name: string; color?: string }): Promise<Product> {
  return request('/products', { method: 'POST', body: JSON.stringify(data) })
}

export function patchProduct(id: string, data: Partial<Product>): Promise<Product> {
  return request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteProduct(id: string): Promise<void> {
  return request(`/products/${id}`, { method: 'DELETE' })
}

// --- Developers ---

export function getDevelopers(): Promise<Developer[]> {
  return request('/developers')
}

export function createDeveloper(data: { name: string; capacityPerSprint?: number }): Promise<Developer> {
  return request('/developers', { method: 'POST', body: JSON.stringify(data) })
}

export function patchDeveloper(id: string, data: Partial<Developer>): Promise<Developer> {
  return request(`/developers/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteDeveloper(id: string): Promise<void> {
  return request(`/developers/${id}`, { method: 'DELETE' })
}

// --- Sprints ---

export function getSprints(): Promise<Sprint[]> {
  return request('/sprints')
}

// --- Milestones ---

export function getMilestones(): Promise<Milestone[]> {
  return request('/milestones')
}

// --- Config ---

export function getConfig(): Promise<AppConfig> {
  return request('/config')
}

export function patchConfig(updates: Partial<AppConfig>): Promise<AppConfig> {
  return request('/config', { method: 'PATCH', body: JSON.stringify(updates) })
}

export function getImportHistory(): Promise<ImportSnapshot[]> {
  return request('/imports/history')
}

// --- Sprints / Milestones (create) ---

export function createSprint(data: Partial<Sprint>): Promise<Sprint> {
  return request('/sprints', { method: 'POST', body: JSON.stringify(data) })
}

export function createMilestone(data: Partial<Milestone>): Promise<Milestone> {
  return request('/milestones', { method: 'POST', body: JSON.stringify(data) })
}
