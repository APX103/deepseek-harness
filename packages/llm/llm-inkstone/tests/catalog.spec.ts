/**
 * Gateway model-catalog tests: listing fetch, static fallback, cache
 * behavior, and model resolution against the fetched entries.
 */
import { describe, expect, it, vi } from 'vitest'
import { InkstoneAdapter } from '../src/adapter.ts'
import type { Config } from '../src/config.ts'

const settings: Config = {
  baseURL: 'https://gw.example/api/orbit/v1',
  tokenEnv: 'INKSTONE_JWT',
  chatId: 0,
  defaultModel: 'auto',
  thinking: false,
  thinkingBudgetTokens: 0,
  locale: 'zh-CN',
  catalogMaxAgeMs: 600_000,
  models: [{ id: 'auto', name: 'Inkstone Auto', contextWindow: 131072, maxTokens: 8192 }],
}

const listing = {
  code: 0,
  msg: 'success',
  data: {
    protocol_version: '2.0',
    models: [
      {
        id: 'Auto',
        canonical_id: 'qwen3.7-plus',
        display_name: 'Default',
        context_window: 1000000,
        max_output_tokens: 16384,
        supports_thinking: true,
        supports_tools: true,
      },
      {
        id: '书生-A1.5',
        canonical_id: 'sage-a1.5',
        display_name: '书生-A1.5',
        context_window: 256000,
        max_output_tokens: 16384,
      },
      { id: 'broken', display_name: 'No capacities' },
    ],
  },
}

function listingFetch() {
  return vi.fn(
    async (_input: RequestInfo | URL) =>
      new Response(JSON.stringify(listing), { status: 200, headers: { 'content-type': 'application/json' } }),
  )
}

type CatalogFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function adapterWith(fetchImpl: CatalogFetch, token = 'jwt-token'): InkstoneAdapter {
  return new InkstoneAdapter({
    settings: () => settings,
    resolveToken: () => token,
    fetchImpl,
  })
}

describe('inkstone gateway catalog', () => {
  it('offers the gateway listing, keeping invalid rows out', async () => {
    const fetchImpl = listingFetch()
    const adapter = adapterWith(fetchImpl)
    await expect(adapter.listModels('inkstone')).resolves.toEqual([
      { provider: 'inkstone', id: 'Auto', name: 'Default', contextWindow: 1000000, maxTokens: 16384 },
      { provider: 'inkstone', id: '书生-A1.5', name: '书生-A1.5', contextWindow: 256000, maxTokens: 16384 },
    ])
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://gw.example/api/orbit/v1/local-agent/models')
  })

  it('resolves model metadata from the listing', async () => {
    const adapter = adapterWith(listingFetch())
    const resolved = await adapter.resolveModel('inkstone', '书生-A1.5')
    expect(resolved).toEqual({ provider: 'inkstone', id: '书生-A1.5', name: '书生-A1.5' })
    const unknown = await adapter.resolveModel('inkstone', 'unknown-model')
    expect(unknown).toEqual({ provider: 'inkstone', id: 'unknown-model', name: 'unknown-model' })
  })

  it('falls back to the static catalog without a token or on failure', async () => {
    const noToken = new InkstoneAdapter({
      settings: () => settings,
      resolveToken: () => undefined,
      // Never called without a token; typed to satisfy the fetch seam.
      fetchImpl: vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
        throw new Error('unexpected fetch without a token')
      }),
    })
    await expect(noToken.listModels('inkstone')).resolves.toEqual([
      { provider: 'inkstone', id: 'auto', name: 'Inkstone Auto', contextWindow: 131072, maxTokens: 8192 },
    ])
    const failing = adapterWith(async () => new Response('no', { status: 500 }))
    await expect(failing.listModels('inkstone')).resolves.toEqual([
      { provider: 'inkstone', id: 'auto', name: 'Inkstone Auto', contextWindow: 131072, maxTokens: 8192 },
    ])
  })

  it('serves a fresh listing from cache without refetching', async () => {
    const fetchImpl = listingFetch()
    const adapter = adapterWith(fetchImpl)
    await adapter.listModels('inkstone')
    await adapter.listModels('inkstone')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
