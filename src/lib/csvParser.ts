import Papa from 'papaparse'
import { normalizeItemType, normalizePriority, normalizeStatus } from '@/domain/enums'
import type { BacklogItem, ImportError, ImportPreviewResult } from '@/domain/types'
import { generateImportHash } from './hashUtils'

/** Known column name mappings from Microsoft Lists CSV → internal field names */
export const DEFAULT_COLUMN_MAPPINGS: Record<string, string> = {
  'id': 'externalId',
  'tipo issue': 'itemType',
  'prioridad': 'priority',
  'producto/proyecto': 'productName',
  'funcionalidad': 'feature',
  'elemento de trabajo': 'title',
  'descripción': 'description',
  'descripcion': 'description',
  'progreso': 'status',
  'asignado a': 'assigneeNames',
  'categoría': 'categories',
  'categoria': 'categories',
  'fecha de inicio': 'startDate',
  'fecha de vencimiento': 'dueDate',
  'fecha de reporte': 'reportDate',
  'notas': 'notes',
  'servicio': 'service',
  'version': 'version',
  'story points': 'effortStoryPoints',
  'esfuerzo cotizado (hs)': 'effortQuotedHours',
  'esfuerzo estimado (hs)': 'effortEstimatedHours',
  'esfuerzo real (hs)': 'effortActualHours',
  'modificaciones para prod': 'prodChanges',
  'modificado': 'updatedAt',
  'creado': 'createdAt',
  'creado por': 'createdBy',
  'cliente': 'client',
  'item asociado': 'relatedItemId',
  'item asociado: title': 'relatedItemTitle',
  'id mesa de ayudas': 'helpDeskId',
}

/**
 * Detects suggested column mappings by comparing CSV headers to known names.
 * Returns a mapping of csvColumn → internalField.
 */
export function suggestMappings(headers: string[]): Record<string, string> {
  const mappings: Record<string, string> = {}
  for (const header of headers) {
    const normalized = header.toLowerCase().trim()
    if (DEFAULT_COLUMN_MAPPINGS[normalized]) {
      mappings[header] = DEFAULT_COLUMN_MAPPINGS[normalized]
    }
  }
  return mappings
}

/**
 * Parses a CSV string and applies column mappings to produce normalized BacklogItem rows.
 * Returns a preview result with parsed rows, errors, and suggested mappings.
 */
export function parseCsvPreview(
  csvContent: string,
  mappings: Record<string, string>,
): ImportPreviewResult {
  const errors: ImportError[] = []

  const result = Papa.parse<Record<string, string>>(csvContent.replace(/^\ufeff/, ''), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (result.errors.length > 0) {
    result.errors.forEach((e) => {
      errors.push({ row: e.row ?? -1, message: e.message })
    })
  }

  const detectedColumns = result.meta.fields ?? []
  const suggestedMappings = Object.keys(mappings).length === 0
    ? suggestMappings(detectedColumns)
    : mappings

  const rows: Partial<BacklogItem>[] = result.data.map((raw, i) => {
    try {
      return normalizeRow(raw, suggestedMappings)
    } catch (e) {
      errors.push({ row: i + 2, message: String(e) })
      return {}
    }
  })

  return { rows, errors, detectedColumns, suggestedMappings }
}

/**
 * Normalizes a single raw CSV row using the provided column mappings.
 */
export function normalizeRow(
  raw: Record<string, string>,
  mappings: Record<string, string>,
): Partial<BacklogItem> {
  // Build a normalized field map by applying mappings
  const fields: Record<string, string> = {}
  for (const [csvCol, internalField] of Object.entries(mappings)) {
    const val = raw[csvCol]?.trim() ?? ''
    if (val) fields[internalField] = val
  }

  // Parse assignees: "GUSTAVO GODOY;GERMAN MENA" → ["GUSTAVO GODOY", "GERMAN MENA"]
  const assigneeIds = fields['assigneeNames']
    ? fields['assigneeNames'].split(';').map((s) => s.trim()).filter(Boolean)
    : []

  // Parse categories: '["Frontend","Backend"]' or "Frontend" → string[]
  let categories: string[] = []
  if (fields['categories']) {
    try {
      const parsed = JSON.parse(fields['categories'])
      categories = Array.isArray(parsed) ? parsed.map(String) : [fields['categories']]
    } catch {
      categories = fields['categories'].split(',').map((s) => s.trim()).filter(Boolean)
    }
  }

  const item: Partial<BacklogItem> = {
    externalId: fields['externalId'] || null,
    title: fields['title'] || '(sin título)',
    description: fields['description'] || null,
    itemType: fields['itemType'] ? normalizeItemType(fields['itemType']) : 'task',
    feature: fields['feature'] || null,
    status: fields['status'] ? normalizeStatus(fields['status']) : 'not-started',
    priority: fields['priority'] ? normalizePriority(fields['priority']) : 'medium',
    assigneeIds,
    categories,
    service: fields['service'] || null,
    version: fields['version'] || null,
    client: fields['client'] || null,
    startDate: parseDate(fields['startDate']),
    dueDate: parseDate(fields['dueDate']),
    reportDate: parseDate(fields['reportDate']),
    effortStoryPoints: parseNumber(fields['effortStoryPoints']),
    effortQuotedHours: parseNumber(fields['effortQuotedHours']),
    effortEstimatedHours: parseNumber(fields['effortEstimatedHours']),
    effortActualHours: parseNumber(fields['effortActualHours']),
    notes: fields['notes'] || null,
    prodChanges: fields['prodChanges'] || null,
    relatedItemId: fields['relatedItemId'] || null,
    relatedItemTitle: fields['relatedItemTitle'] || null,
    helpDeskId: fields['helpDeskId'] || null,
    helpDeskTitle: fields['helpDeskTitle'] || null,
    createdBy: fields['createdBy'] || null,
    createdAt: parseDate(fields['createdAt']),
    updatedAt: parseDate(fields['updatedAt']),
    rawFields: raw,
    // productName stored separately, resolved to productId server-side
    ...(fields['productName'] ? { _productName: fields['productName'] } as Record<string, string> : {}),
  }

  item.importHash = generateImportHash(item)
  return item
}

function parseDate(val: string | undefined): string | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function parseNumber(val: string | undefined): number | null {
  if (!val) return null
  const n = parseFloat(val.replace(',', '.'))
  return isNaN(n) ? null : n
}
