/**
 * The gateway model catalog: `GET {baseURL}/local-agent/models`, the same
 * listing the Token Plan side serves (Auto / 书生-Agents-A1 / 书生-A1.5 /
 * 克劳德-Opus-5 …, verified against staging 2026-11-17). The route stays
 * consistent with the plan by offering exactly this listing.
 *
 * @module dsh-llm-inkstone/catalog
 */
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import type { InkstoneModelEntry } from './config.ts'

/** One normalized gateway model listing row. */
interface GatewayModelRow {
  readonly [field: string]: unknown
}

/** The `models` field of one listing envelope body, when it is an object. */
function modelsFieldOf(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return (value as Record<string, unknown>)['models']
}

function boundedText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function positiveInt(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** Fetch and normalize the gateway model listing behind one bearer token. */
export async function fetchGatewayCatalog(
  baseURL: string,
  token: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<readonly InkstoneModelEntry[]> {
  const response = await fetchImpl(`${baseURL.replace(/\/+$/, '')}/local-agent/models`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...attributionHeaders(),
    },
    redirect: 'error',
    cache: 'no-store',
    credentials: 'omit',
    signal: signal ?? null,
  })
  if (!response.ok) {
    throw new Error(`the gateway model listing returned status ${response.status}`)
  }
  let envelope: unknown
  try {
    envelope = (await response.json()) as unknown
  } catch (cause) {
    throw new Error('the gateway model listing was not JSON', { cause })
  }
  const record = envelope === null || typeof envelope !== 'object' ? undefined : (envelope as Record<string, unknown>)
  const code = record?.['code']
  if (typeof code === 'number' && code !== 0 && code !== 200) {
    throw new Error(`the gateway model listing returned code ${code}`)
  }
  const rows = modelsFieldOf(record?.['data'] ?? record)
  if (!Array.isArray(rows)) {
    throw new Error('the gateway model listing carried no models')
  }
  const entries = (rows as GatewayModelRow[]).flatMap((row): InkstoneModelEntry[] => {
    const id = boundedText(row['id'], 120)
    if (id === '') return []
    const contextWindow = positiveInt(row['context_window'])
    const maxTokens = positiveInt(row['max_output_tokens'])
    if (contextWindow === undefined || maxTokens === undefined) return []
    const name = boundedText(row['display_name'], 200)
    return [{ id, name: name === '' ? id : name, contextWindow, maxTokens }]
  })
  if (entries.length === 0) {
    throw new Error('the gateway model listing carried no usable models')
  }
  return entries
}
