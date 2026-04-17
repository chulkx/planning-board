import type {
  Priority,
  BacklogStatus,
  SprintStatus,
  MilestoneStatus,
  ItemType,
  EffortUnit,
} from './enums'

export interface BoardColumn {
  name: BacklogStatus
  wipLimit: number | null
}

export interface BacklogItem {
  id: string
  externalId: string | null
  title: string
  description: string | null
  itemType: ItemType
  productId: string | null
  feature: string | null
  status: BacklogStatus
  priority: Priority
  assigneeIds: string[]
  sprintId: string | null
  milestoneId: string | null
  categories: string[]
  service: string | null
  version: string | null
  client: string | null
  startDate: string | null
  dueDate: string | null
  reportDate: string | null
  effortStoryPoints: number | null
  effortQuotedHours: number | null
  effortEstimatedHours: number | null
  effortActualHours: number | null
  notes: string | null
  prodChanges: string | null
  relatedItemId: string | null
  relatedItemTitle: string | null
  parentId: string | null
  helpDeskId: string | null
  helpDeskTitle: string | null
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
  importedAt: string
  importHash: string | null
  manualOverrides: string[]
  rawFields: Record<string, string>
  sortOrder: number | null
}

export interface Product {
  id: string
  name: string
  color: string
  boardColumns: BoardColumn[]
  createdAt: string
}

export interface Developer {
  id: string
  name: string
  capacityPerSprint: number
  createdAt: string
}

export interface Sprint {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  productIds: string[]
  status: SprintStatus
  effortUnit: EffortUnit
  createdAt: string
}

export interface Milestone {
  id: string
  name: string
  targetDate: string | null
  productIds: string[]
  status: MilestoneStatus
  createdAt: string
}

export interface CsvMappingProfile {
  id: string
  name: string
  mappings: Record<string, string>
  encoding: string
}

export interface AppConfig {
  id: 'singleton'
  defaultEffortUnit: EffortUnit
  csvMappingProfiles: CsvMappingProfile[]
  importHashFields: string[]
}

export interface ImportSnapshot {
  id: string
  importedAt: string
  filename: string
  totalRows: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  errors: ImportError[]
}

export interface ImportError {
  row: number
  field?: string
  message: string
}

// --- API request/response shapes ---

export interface ImportPreviewRequest {
  csvContent: string
  mappings: Record<string, string>
  encoding?: string
}

export interface ImportPreviewResult {
  rows: Partial<BacklogItem>[]
  errors: ImportError[]
  detectedColumns: string[]
  suggestedMappings: Record<string, string>
}

export interface ImportCommitRequest {
  csvContent: string
  mappings: Record<string, string>
  encoding?: string
  profileName?: string
}

export interface ImportCommitResult {
  created: number
  updated: number
  skipped: number
  errors: ImportError[]
  snapshotId: string
}

export interface BacklogFilters {
  productId?: string
  status?: BacklogStatus
  priority?: Priority
  assigneeId?: string
  sprintId?: string
  milestoneId?: string
  search?: string
}

// --- Sprint metrics / reports ---

export interface SprintBurndownResponse {
  sprintId: string
  sprintName: string
  startDate: string | null
  endDate: string | null
  totalCommittedPoints: number
  snapshots: Array<{
    date: string
    remainingStoryPoints: number
    completedStoryPoints: number
    statusCounts: Record<string, number>
    isToday: boolean
    ideal: number
  }>
}

export interface VelocitySprintEntry {
  id: string
  name: string
  closedAt: string
  committedStoryPoints: number
  completedStoryPoints: number
  velocityRatio: number
}

export interface VelocityResponse {
  sprints: VelocitySprintEntry[]
  averageVelocity: number
}

export interface CfdResponse {
  dates: string[]
  series: Array<{ status: string; counts: number[] }>
}

export interface SprintClosePreviewItem {
  id: string
  title: string
  status: string
  productId: string | null
  destination: { type: 'sprint'; sprintId: string; sprintName: string } | { type: 'backlog' }
}

export interface SprintClosePreview {
  sprint: Sprint
  completedCount: number
  incompleteItems: SprintClosePreviewItem[]
}

export interface SprintCapacityEntry {
  id: string
  sprintId: string
  developerId: string
  developerName: string
  defaultSp: number
  capacityHours: number
  capacityStoryPoints: number | null
  notes: string | null
  createdAt: string
}

export interface RetroActionItem {
  text: string
  owner?: string
  done: boolean
}

export interface Retrospective {
  id: string
  sprintId: string
  wentWell: string | null
  toImprove: string | null
  actionItems: RetroActionItem[]
  createdAt: string
  updatedAt: string
}

export interface SavedView {
  id: string
  name: string
  screen: 'backlog' | 'board' | 'sprint'
  filters: Record<string, unknown>
  createdAt: string
}

export interface ItemEvent {
  id: string
  itemId: string
  eventType: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  source: 'user' | 'import' | 'automation' | 'system'
  actor: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

// ─── R6 Analytics ─────────────────────────────────────────────────────────────

export interface CycleTimeItem {
  id: string; title: string; itemType: string
  productId: string | null; sprintId: string | null
  startedAt: string; doneAt: string; cycleTimeHours: number
}

export interface CycleTimeResponse {
  items: CycleTimeItem[]
  avg: number | null; p50: number | null; p90: number | null
  buckets: Array<{ label: string; count: number }>
}

export interface ThroughputSprint {
  id: string; name: string; closedAt: string | null
  totalItems: number; completedItems: number; completedSp: number
  bugCount: number; completionRate: number
}

export interface WipAgingItem {
  id: string; title: string; status: string; priority: string
  productId: string | null; sprintId: string | null; assigneeIds: string[]
  statusSince: string | null; hoursInStatus: number
}

export interface TeamLoadDeveloper {
  id: string; name: string
  capacityHours: number; capacityStoryPoints: number | null
  assignedItems: number; completedItems: number
  assignedSp: number; assignedHours: number; loadPct: number | null
}

export interface TeamLoadResponse {
  sprintId: string | null
  developers: TeamLoadDeveloper[]
}

export interface EstimationAccuracySprint {
  id: string; name: string; closedAt: string | null
  committedSp: number | null; completedSp: number | null
  accuracyPct: number | null; itemsWithoutSp: number
}

export interface EstimationAccuracyResponse {
  sprints: EstimationAccuracySprint[]
  avgAccuracy: number | null
}

// ─── R6-bis ───────────────────────────────────────────────────────────────────

export interface Label {
  id: string
  name: string
  color: string
  created_at: string
}

export interface ItemLink {
  id: string
  relatedItemId: string
  relatedItemTitle: string
  relatedItemStatus: string
  relatedProductId: string | null
  direction: 'incoming' | 'outgoing'
  linkType: 'blocks' | 'related'
  createdAt: string
}

export interface ItemLinksResponse {
  blocks: ItemLink[]
  blockedBy: ItemLink[]
  related: ItemLink[]
}

export interface ItemComment {
  id: string
  itemId: string
  author: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface MilestoneStats {
  milestoneId: string
  name: string
  targetDate: string | null
  status: string
  totalItems: number
  openItems: number
  closedItems: number
  cancelledItems: number
  overdueItems: number
  completionPct: number
  itemsByStatus: Record<string, number>
  burndown: Array<{ date: string; open: number }>
}

export interface DeveloperStats {
  id: string
  name: string
  throughput: Array<{ sprintId: string; sprintName: string; completed: number; completedSP: number }>
  avgCycleTimeHours: number | null
  currentLoad: { assignedSP: number; capacitySP: number | null; assignedItems: number }
  activityHeatmap: Array<{ weekStart: string; closedItems: number }>
}

export interface DeveloperStatsResponse {
  sprintId: string | null
  developers: DeveloperStats[]
}
