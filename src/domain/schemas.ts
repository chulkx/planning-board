import { z } from 'zod'

// Re-export Zod schemas for runtime validation at API boundaries

export const PrioritySchema = z.enum(['critical', 'high', 'medium', 'low'])
export const BacklogStatusSchema = z.enum(['not-started', 'in-progress', 'review', 'done', 'cancelled'])
export const SprintStatusSchema = z.enum(['planned', 'active', 'completed'])
export const MilestoneStatusSchema = z.enum(['planned', 'active', 'completed'])
export const ItemTypeSchema = z.enum(['bug', 'feature', 'task'])
export const EffortUnitSchema = z.enum(['story-points', 'hours-estimated', 'hours-quoted', 'hours-actual'])

export const BacklogItemPatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  itemType: ItemTypeSchema.optional(),
  productId: z.string().nullable().optional(),
  feature: z.string().nullable().optional(),
  status: BacklogStatusSchema.optional(),
  priority: PrioritySchema.optional(),
  assigneeIds: z.array(z.string()).optional(),
  sprintId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  service: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  client: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  effortStoryPoints: z.number().nullable().optional(),
  effortQuotedHours: z.number().nullable().optional(),
  effortEstimatedHours: z.number().nullable().optional(),
  effortActualHours: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  manualOverrides: z.array(z.string()).optional(),
})

export const ProductCreateSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#6366f1'),
  boardColumns: z.array(BacklogStatusSchema).optional(),
})

export const DeveloperCreateSchema = z.object({
  name: z.string().min(1),
  capacityPerSprint: z.number().min(0).default(0),
})

export const SprintCreateSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  productIds: z.array(z.string()).default([]),
  status: SprintStatusSchema.default('planned'),
  effortUnit: EffortUnitSchema.default('story-points'),
})

export const MilestoneCreateSchema = z.object({
  name: z.string().min(1),
  targetDate: z.string().nullable().optional(),
  productIds: z.array(z.string()).default([]),
  status: MilestoneStatusSchema.default('planned'),
})

export const ImportPreviewRequestSchema = z.object({
  csvContent: z.string().min(1),
  mappings: z.record(z.string(), z.string()),
  encoding: z.string().optional(),
})

export const ImportCommitRequestSchema = z.object({
  csvContent: z.string().min(1),
  mappings: z.record(z.string(), z.string()),
  encoding: z.string().optional(),
  profileName: z.string().optional(),
})

export const BacklogFiltersSchema = z.object({
  productId: z.string().optional(),
  status: BacklogStatusSchema.optional(),
  priority: PrioritySchema.optional(),
  assigneeId: z.string().optional(),
  sprintId: z.string().optional(),
  milestoneId: z.string().optional(),
  search: z.string().optional(),
})
