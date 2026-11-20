/**
 * The Hub pull client (KEP-0008): fetches a config-provided remote catalog
 * endpoint — the SCPHub pattern's pull mechanism, not any real SCPHub data.
 * The wire schema is versioned (`research-catalog-v1`, intern-inkstone's
 * `orbit-*-v1` discipline); the last good payload is kept in the host's
 * memory and revalidated with ETag / If-None-Match. Every failure path keeps
 * the last payload and never masks the bundled catalog.
 *
 * @module dsh-client-ui-research-plugins/hub
 */
import type { ResearchCatalogEntry, ResearchCategory, ResearchKind } from './types.ts'

/** The wire schema version this client speaks. */
export const RESEARCH_CATALOG_SCHEMA_VERSION = 'research-catalog-v1'

/** The categories a hub entry may carry; unknown keys drop to uncategorised. */
const CATEGORIES: readonly ResearchCategory[] = ['literature', 'topic', 'data', 'viz', 'writing', 'outreach', 'office']

/** The kinds a hub entry may carry. */
const KINDS: readonly ResearchKind[] = ['skill', 'connector', 'agent']

/** The cached pull: last good payload plus its validator. */
export interface HubCache {
  readonly entries: readonly ResearchCatalogEntry[]
  readonly etag?: string
}

/** A successful pull: entries to merge and the validator for the next request. */
export interface HubPull {
  readonly entries: readonly ResearchCatalogEntry[]
  readonly etag?: string
}

/**
 * Validate one hub payload object into a catalog entry; `null` for rows this
 * client cannot trust (wrong shape or vocabulary) — a hub is a crowd of
 * contributors, so single bad rows drop instead of failing the pull.
 * @param row - one parsed payload row.
 * @returns the entry, or null when the row is unusable.
 */
function toEntry(row: unknown): ResearchCatalogEntry | null {
  if (typeof row !== 'object' || row === null) return null
  const record = row as Record<string, unknown>
  const { id, ref, name, description } = record
  if (typeof id !== 'string' || id === '' || typeof ref !== 'string' || ref === '') return null
  if (typeof name !== 'string' || name === '' || typeof description !== 'string') return null
  const kind = record.kind as ResearchKind
  if (!KINDS.includes(kind)) return null
  const category = CATEGORIES.includes(record.category as ResearchCategory) ? record.category as ResearchCategory : undefined
  const samplePrompts = Array.isArray(record.samplePrompts)
    ? record.samplePrompts.filter((prompt): prompt is string => typeof prompt === 'string')
    : []
  const order = typeof record.order === 'number' ? record.order : undefined
  return {
    id: `research.hub.${id}`,
    kind,
    ref,
    name,
    description,
    ...(category !== undefined ? { category } : {}),
    samplePrompts,
    ...(order !== undefined ? { order } : {}),
    source: 'hub',
  }
}

/**
 * Pull the hub catalog: conditional GET against the configured endpoint.
 * A 304 replays the cache; a 200 replaces it after validation; anything else
 * (network error, non-2xx, bad payload) leaves the caller's cache untouched.
 * @param hubUrl - the config-provided endpoint; empty means hub-less.
 * @param cache - the last good pull, if any.
 * @param fetchImpl - injectable fetch for tests.
 * @returns the new pull state, or undefined to keep the caller's cache.
 */
export async function pullHub(
  hubUrl: string,
  cache: HubCache | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<HubPull | undefined> {
  if (hubUrl === '') return undefined
  const headers: Record<string, string> = { accept: 'application/json' }
  if (cache?.etag !== undefined) headers['if-none-match'] = cache.etag
  const response = await fetchImpl(hubUrl, { headers })
  if (response.status === 304 && cache !== undefined) {
    return { entries: cache.entries, ...(cache.etag !== undefined ? { etag: cache.etag } : {}) }
  }
  if (!response.ok) return undefined
  const payload: unknown = await response.json()
  if (typeof payload !== 'object' || payload === null) return undefined
  const document = payload as Record<string, unknown>
  if (document.version !== RESEARCH_CATALOG_SCHEMA_VERSION) return undefined
  if (!Array.isArray(document.entries)) return undefined
  const entries = document.entries
    .map(toEntry)
    .filter((entry): entry is ResearchCatalogEntry => entry !== null)
  const etag = response.headers.get('etag') ?? undefined
  return { entries, ...(etag !== undefined ? { etag } : {}) }
}
