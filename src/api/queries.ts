// Central query keys and stale times for TanStack Query
// All screens import from here to avoid typos and ensure cache sharing.

export const QUERY_KEYS = {
  backlogItems: ['backlog-items'] as const,
  products:     ['products']      as const,
  developers:   ['developers']    as const,
  sprints:      ['sprints']       as const,
  milestones:   ['milestones']    as const,
  config:       ['config']        as const,
  importHistory:['import-history']as const,
  sprintBurndown: (id: string) => ['sprint-burndown', id] as const,
  velocity:       (productId?: string) => ['velocity', productId ?? 'all'] as const,
  cfd:            (productId: string) => ['cfd', productId] as const,
  sprintCapacity: (id: string) => ['sprint-capacity', id] as const,
  retrospective:  (id: string) => ['retrospective', id] as const,
  savedViews: (screen?: string) => ['saved-views', screen ?? 'all'] as const,
  itemEvents:  (itemId: string) => ['item-events', itemId] as const,
}

export const STALE_TIMES = {
  backlogItems:  30_000,      // 30s — cambia en cada import
  products:      5 * 60_000,  // 5min — muy estable
  developers:    5 * 60_000,  // 5min
  sprints:       2 * 60_000,  // 2min
  milestones:    2 * 60_000,  // 2min
  config:       10 * 60_000,  // 10min
  importHistory: 60_000,      // 1min
  sprintBurndown: 60_000,     // 1min — changes as items complete
  velocity:       5 * 60_000, // 5min — only changes on sprint close
  cfd:            5 * 60_000, // 5min
  sprintCapacity: 30_000,
  retrospective:  60_000,
  savedViews: 60_000,
  itemEvents: 30_000,
}
