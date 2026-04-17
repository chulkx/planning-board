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

export function getAuthToken(): string | null { return localStorage.getItem('auth_token') }
export function setAuthToken(token: string)   { localStorage.setItem('auth_token', token) }
export function clearAuthToken()              { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user') }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (res.status === 401) {
    clearAuthToken()
    window.location.href = '/login'
    throw new Error('Sesión expirada')
  }
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

// --- Sprint metrics ---

export function getSprintBurndown(sprintId: string): Promise<import('@/domain/types').SprintBurndownResponse> {
  return request(`/sprints/${sprintId}/burndown`)
}

export function getVelocity(params?: { limit?: number; productId?: string }): Promise<import('@/domain/types').VelocityResponse> {
  const qs = new URLSearchParams()
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.productId) qs.set('productId', params.productId)
  const q = qs.toString()
  return request(`/reports/velocity${q ? `?${q}` : ''}`)
}

export function getCfd(productId: string, from?: string, to?: string): Promise<import('@/domain/types').CfdResponse> {
  const qs = new URLSearchParams()
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  const q = qs.toString()
  return request(`/reports/products/${productId}/cfd${q ? `?${q}` : ''}`)
}

// --- Sprints (new mutations) ---

export function patchSprint(id: string, data: Record<string, unknown>): Promise<import('@/domain/types').Sprint> {
  return request(`/sprints/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteSprint(id: string): Promise<void> {
  return request(`/sprints/${id}`, { method: 'DELETE' })
}

export function patchMilestone(id: string, data: Record<string, unknown>): Promise<import('@/domain/types').Milestone> {
  return request(`/milestones/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteMilestone(id: string): Promise<void> {
  return request(`/milestones/${id}`, { method: 'DELETE' })
}

// --- Sprint close ---

export function getSprintClosePreview(id: string): Promise<import('@/domain/types').SprintClosePreview> {
  return request(`/sprints/${id}/close-preview`)
}

export function closeSprint(id: string): Promise<import('@/domain/types').Sprint> {
  return request(`/sprints/${id}/close`, { method: 'POST' })
}

// --- Sprint capacity ---

export function getSprintCapacity(sprintId: string): Promise<import('@/domain/types').SprintCapacityEntry[]> {
  return request(`/sprints/${sprintId}/capacity`)
}

export function putSprintCapacity(sprintId: string, devId: string, data: { capacityHours?: number; capacityStoryPoints?: number | null; notes?: string | null }): Promise<import('@/domain/types').SprintCapacityEntry> {
  return request(`/sprints/${sprintId}/capacity/${devId}`, { method: 'PUT', body: JSON.stringify(data) })
}

// --- Retrospective ---

export function getRetrospective(sprintId: string): Promise<import('@/domain/types').Retrospective | null> {
  return request(`/sprints/${sprintId}/retrospective`)
}

export function putRetrospective(sprintId: string, data: { wentWell?: string | null; toImprove?: string | null; actionItems?: import('@/domain/types').RetroActionItem[] }): Promise<import('@/domain/types').Retrospective> {
  return request(`/sprints/${sprintId}/retrospective`, { method: 'PUT', body: JSON.stringify(data) })
}

// --- Item parent ---

export function patchItemParent(id: string, parentId: string | null): Promise<import('@/domain/types').BacklogItem> {
  return request(`/backlog-items/${id}/parent`, { method: 'PATCH', body: JSON.stringify({ parentId }) })
}

// --- Saved views ---

export function getSavedViews(screen?: string): Promise<import('@/domain/types').SavedView[]> {
  return request(`/saved-views${screen ? `?screen=${screen}` : ''}`)
}

export function postSavedView(data: { name: string; screen: string; filters: Record<string, unknown> }): Promise<import('@/domain/types').SavedView> {
  return request('/saved-views', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteSavedView(id: string): Promise<void> {
  return request(`/saved-views/${id}`, { method: 'DELETE' })
}

// --- Item events ---

export function getItemEvents(itemId: string): Promise<import('@/domain/types').ItemEvent[]> {
  return request(`/backlog-items/${itemId}/events`)
}

// ─── R6 Analytics ─────────────────────────────────────────────────────────────

export function getCycleTime(params?: { productId?: string; from?: string; to?: string }): Promise<import('@/domain/types').CycleTimeResponse> {
  const q = new URLSearchParams()
  if (params?.productId) q.set('productId', params.productId)
  if (params?.from)      q.set('from', params.from)
  if (params?.to)        q.set('to', params.to)
  return request(`/reports/cycle-time${q.toString() ? '?' + q : ''}`)
}

export function getThroughput(params?: { productId?: string; limit?: number }): Promise<{ sprints: import('@/domain/types').ThroughputSprint[] }> {
  const q = new URLSearchParams()
  if (params?.productId) q.set('productId', params.productId)
  if (params?.limit)     q.set('limit', String(params.limit))
  return request(`/reports/throughput${q.toString() ? '?' + q : ''}`)
}

export function getWipAging(): Promise<{ items: import('@/domain/types').WipAgingItem[] }> {
  return request('/reports/wip-aging')
}

export function getTeamLoad(sprintId?: string): Promise<import('@/domain/types').TeamLoadResponse> {
  return request(`/reports/team-load${sprintId ? '?sprintId=' + sprintId : ''}`)
}

export function getEstimationAccuracy(params?: { productId?: string; limit?: number }): Promise<import('@/domain/types').EstimationAccuracyResponse> {
  const q = new URLSearchParams()
  if (params?.productId) q.set('productId', params.productId)
  if (params?.limit)     q.set('limit', String(params.limit))
  return request(`/reports/estimation-accuracy${q.toString() ? '?' + q : ''}`)
}

// --- Auth ---

export function login(name: string): Promise<{ token: string; user: { id: string; name: string } }> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ name }) })
}

export function getTeamUsers(): Promise<Array<{ id: string; name: string; role: string; created_at: string }>> {
  return request('/auth/users')
}

// ─── R6-bis: Labels ───────────────────────────────────────────────────────────

export function getLabels(): Promise<import('@/domain/types').Label[]> {
  return request('/labels')
}

export function createLabel(data: { name: string; color?: string }): Promise<import('@/domain/types').Label> {
  return request('/labels', { method: 'POST', body: JSON.stringify(data) })
}

export function patchLabel(id: string, data: { name?: string; color?: string }): Promise<import('@/domain/types').Label> {
  return request(`/labels/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteLabel(id: string): Promise<void> {
  return request(`/labels/${id}`, { method: 'DELETE' })
}

export function getItemLabels(itemId: string): Promise<import('@/domain/types').Label[]> {
  return request(`/backlog-items/${itemId}/labels`)
}

export function addItemLabel(itemId: string, labelId: string): Promise<import('@/domain/types').Label> {
  return request(`/backlog-items/${itemId}/labels`, { method: 'POST', body: JSON.stringify({ labelId }) })
}

export function removeItemLabel(itemId: string, labelId: string): Promise<void> {
  return request(`/backlog-items/${itemId}/labels/${labelId}`, { method: 'DELETE' })
}

// ─── R6-bis: Links ────────────────────────────────────────────────────────────

export function getItemLinks(itemId: string): Promise<import('@/domain/types').ItemLinksResponse> {
  return request(`/backlog-items/${itemId}/links`)
}

export function createItemLink(itemId: string, data: { targetId: string; linkType: 'blocks' | 'related' }): Promise<{ id: string }> {
  return request(`/backlog-items/${itemId}/links`, { method: 'POST', body: JSON.stringify(data) })
}

export function deleteItemLink(itemId: string, linkId: string): Promise<void> {
  return request(`/backlog-items/${itemId}/links/${linkId}`, { method: 'DELETE' })
}

// ─── R6-bis: Comments ─────────────────────────────────────────────────────────

export function getItemComments(itemId: string): Promise<import('@/domain/types').ItemComment[]> {
  return request(`/backlog-items/${itemId}/comments`)
}

export function createItemComment(itemId: string, data: { author: string; body: string }): Promise<import('@/domain/types').ItemComment> {
  return request(`/backlog-items/${itemId}/comments`, { method: 'POST', body: JSON.stringify(data) })
}

export function patchItemComment(itemId: string, commentId: string, data: { body: string }): Promise<import('@/domain/types').ItemComment> {
  return request(`/backlog-items/${itemId}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteItemComment(itemId: string, commentId: string): Promise<void> {
  return request(`/backlog-items/${itemId}/comments/${commentId}`, { method: 'DELETE' })
}

// ─── R6-bis: Milestone stats ──────────────────────────────────────────────────

export function getMilestoneStats(milestoneId: string): Promise<import('@/domain/types').MilestoneStats> {
  return request(`/milestones/${milestoneId}/stats`)
}

// ─── R6-bis: Developer stats ──────────────────────────────────────────────────

export function getDeveloperStats(sprintId?: string): Promise<import('@/domain/types').DeveloperStatsResponse> {
  return request(`/reports/developer-stats${sprintId ? `?sprintId=${sprintId}` : ''}`)
}
