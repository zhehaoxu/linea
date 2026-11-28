import { parseCircuit, type CircuitData } from './persist'

interface TemplateText {
  zh: string
  en: string
}

export interface CircuitTemplate {
  id: string
  file: string
  featured: boolean
  name: TemplateText
  description: TemplateText
}

export interface LoadedCircuitTemplate extends CircuitTemplate {
  data: CircuitData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseText(value: unknown): TemplateText | null {
  if (!isRecord(value)) return null
  const { zh, en } = value
  if (typeof zh !== 'string' || !zh.trim() || typeof en !== 'string' || !en.trim()) return null
  return { zh, en }
}

function parseCatalog(raw: unknown): CircuitTemplate[] {
  if (!Array.isArray(raw)) throw new Error('invalid template catalog')
  const entries: CircuitTemplate[] = []
  const ids = new Set<string>()
  const files = new Set<string>()
  for (const item of raw) {
    if (!isRecord(item)) throw new Error('invalid template entry')
    const { id, file, featured } = item
    const name = parseText(item.name)
    const description = parseText(item.description)
    if (
      typeof id !== 'string' ||
      !/^[a-z0-9][a-z0-9-]*$/.test(id) ||
      ids.has(id) ||
      typeof file !== 'string' ||
      !/^[a-z0-9][a-z0-9-]*\.json$/.test(file) ||
      files.has(file) ||
      typeof featured !== 'boolean' ||
      !name ||
      !description
    ) {
      throw new Error('invalid template entry')
    }
    ids.add(id)
    files.add(file)
    entries.push({ id, file, featured, name, description })
  }
  return entries
}

export async function loadTemplateCatalog(signal?: AbortSignal): Promise<CircuitTemplate[]> {
  const base = `${import.meta.env.BASE_URL}templates/`
  const response = await fetch(`${base}index.json`, { signal })
  if (!response.ok) throw new Error('failed to load template catalog')
  return parseCatalog(await response.json())
}

export async function loadTemplateData(
  template: CircuitTemplate,
  signal?: AbortSignal,
): Promise<CircuitData> {
  const base = `${import.meta.env.BASE_URL}templates/`
  const response = await fetch(`${base}${template.file}`, { signal })
  if (!response.ok) throw new Error(`failed to load template: ${template.id}`)
  return parseCircuit(await response.text())
}
