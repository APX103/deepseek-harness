/**
 * Inkstone adapter unit tests over a mock fetch: stream mapping, request
 * assembly, rejection mapping, and Token Plan failure codes.
 */
import { describe, expect, it, vi } from 'vitest'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { InkstoneAdapter } from '../src/adapter.ts'
import type { Config } from '../src/config.ts'
import type { OrbitSseEvent } from '../src/protocol.ts'

const settings: Config = {
  baseURL: 'https://gw.example/api/orbit/v1',
  tokenEnv: 'INKSTONE_JWT',
  chatId: 0,
  defaultModel: 'auto',
  thinking: false,
  thinkingBudgetTokens: 0,
  locale: 'zh-CN',
  catalogMaxAgeMs: 0,
  models: [{ id: 'auto', name: 'Inkstone Auto', contextWindow: 131072, maxTokens: 8192 }],
}

type FetchMock = ReturnType<typeof vi.fn>

function sseResponse(events: readonly OrbitSseEvent[], init?: { status?: number; contentType?: string }): Response {
  const encoder = new TextEncoder()
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  return new Response(stream, {
    status: init?.status ?? 200,
    headers: { 'content-type': init?.contentType ?? 'text/event-stream' },
  })
}

function jsonResponse(envelope: unknown, status: number): Response {
  return new Response(JSON.stringify(envelope), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const baseOptions = {
  provider: 'inkstone',
  model: 'auto',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
} as unknown as GenerateOptions

async function collect(options: GenerateOptions, fetchImpl: FetchMock): Promise<StreamChunk[]> {
  const adapter = new InkstoneAdapter({ settings: () => settings, resolveToken: () => 'jwt-token', fetchImpl: fetchImpl as unknown as typeof fetch })
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream(options)) chunks.push(chunk)
  return chunks
}

async function failureOf(options: GenerateOptions, fetchImpl: FetchMock): Promise<{ code?: string }> {
  const adapter = new InkstoneAdapter({ settings: () => settings, resolveToken: () => 'jwt-token', fetchImpl: fetchImpl as unknown as typeof fetch })
  try {
    for await (const _chunk of adapter.stream(options)) {
      // drain
    }
  } catch (error) {
    return error as { code?: string }
  }
  throw new Error('expected the stream to fail')
}

function lastCall(fetchImpl: FetchMock): { url: string; init: RequestInit } {
  const call = fetchImpl.mock.calls.at(-1)
  if (call === undefined) throw new Error('fetch was not called')
  return { url: String(call[0]), init: (call[1] ?? {}) as RequestInit }
}

describe('inkstone adapter streaming', () => {
  it('maps a plain text answer', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        { type: 'message_start', response_id: 'r1', model: 'auto' },
        { type: 'content_delta', text: '你' },
        { type: 'content_delta', text: '好' },
        { type: 'usage', usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } },
        { type: 'message_end', stop_reason: 'stop' },
      ]),
    )
    const chunks = await collect(baseOptions, fetchImpl)
    // The gateway sends `usage` before `message_end`, and the trailing text
    // block closes at `message_end`, so the block-end lands after usage.
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: '你' },
      { type: 'text-delta', index: 0, text: '好' },
      { type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 } },
      { type: 'block-end', index: 0, block: { type: 'text', text: '你好' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('maps reasoning before text as two blocks', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        { type: 'message_start', response_id: 'r1', model: 'auto' },
        { type: 'thinking_delta', text: 'let me think' },
        { type: 'content_delta', text: 'answer' },
        { type: 'message_end', stop_reason: 'stop' },
      ]),
    )
    const chunks = await collect(baseOptions, fetchImpl)
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'let me think' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'let me think' } },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'answer' },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'answer' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('maps a tool call with streamed arguments', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        { type: 'message_start', response_id: 'r1', model: 'auto' },
        { type: 'tool_use_start', id: 't1', name: 'get_weather' },
        { type: 'tool_input_delta', id: 't1', partial_json: '{"ci' },
        { type: 'tool_input_delta', id: 't1', partial_json: 'ty":"sh"}' },
        { type: 'tool_use_end', id: 't1', input: { city: 'sh' } },
        { type: 'message_end', stop_reason: 'tool_use' },
      ]),
    )
    const chunks = await collect(baseOptions, fetchImpl)
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 't1', name: 'get_weather', argumentsDelta: '{"ci' },
      { type: 'tool-call-delta', index: 0, id: 't1', argumentsDelta: 'ty":"sh"}' },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id: 't1', name: 'get_weather', arguments: '{"city":"sh"}' } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })
})

describe('inkstone request assembly', () => {
  it('sends the detached orbit request with bearer auth and attribution', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([{ type: 'message_end', stop_reason: 'stop' }]))
    const options = {
      provider: 'inkstone',
      model: 'auto',
      system: 'Be brief.',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      tools: [{ name: 'get_weather', description: 'weather', parameters: { type: 'object' } }],
      maxTokens: 512,
    } as unknown as GenerateOptions
    await collect(options, fetchImpl)
    const { url, init } = lastCall(fetchImpl)
    expect(url).toBe('https://gw.example/api/orbit/v1/local-agent/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer jwt-token')
    expect(headers['accept']).toBe('text/event-stream')
    expect(typeof headers['user-agent']).toBe('string')
    const body = JSON.parse((init.body ?? '') as string) as Record<string, unknown>
    expect(body['protocol_version']).toBe('2.0')
    expect(body['inference_kind']).toBe('detached')
    expect(body['chat_id']).toBeGreaterThan(0)
    expect(String(body['request_id'])).toMatch(/^[0-9a-f-]{36}$/)
    expect(String(body['inference_id'])).toMatch(/^[0-9a-f-]{36}$/)
    expect(body['model']).toBe('auto')
    expect(body['system']).toEqual(['Be brief.'])
    expect(body['messages']).toEqual([{ role: 'user', content: [{ type: 'text', text: 'hi' }] }])
    expect(body['tools']).toEqual([{ name: 'get_weather', description: 'weather', input_schema: { type: 'object' } }])
    expect(body['tool_choice']).toEqual({ type: 'auto' })
    expect(body['max_output_tokens']).toBe(512)
  })

  it('maps assistant tool calls and tool results onto the orbit history', async () => {
    const fetchImpl = vi.fn(async () => sseResponse([{ type: 'message_end', stop_reason: 'stop' }]))
    const options = {
      provider: 'inkstone',
      model: 'auto',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'weather?' }] },
        { role: 'assistant', content: [{ type: 'tool-call', id: 't9', name: 'get_weather', arguments: '{"city":"sh"}' }] },
        { role: 'tool', source: { kind: 'tool', callId: 't9' }, content: [{ type: 'text', text: 'sunny' }] },
      ],
    } as unknown as GenerateOptions
    await collect(options, fetchImpl)
    const body = JSON.parse((lastCall(fetchImpl).init.body ?? '') as string) as { messages: unknown[] }
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'weather?' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't9', name: 'get_weather', input: { city: 'sh' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't9', content: 'sunny' }] },
    ])
  })
})

describe('inkstone failures', () => {
  it('requires a token', async () => {
    const adapter = new InkstoneAdapter({ settings: () => settings, resolveToken: () => undefined })
    await expect(async () => {
      for await (const _chunk of adapter.stream(baseOptions)) {
        // drain
      }
    }).rejects.toMatchObject({ code: 'ACCOUNT_SIGN_IN_REQUIRED' })
  })

  it('maps a 403 Token Plan rejection', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: '403005' }, 403))
    await expect(failureOf(baseOptions, fetchImpl)).resolves.toMatchObject({ code: 'ACCOUNT_QUOTA' })
  })

  it('maps a 429 Token Plan rejection', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error_code: '429004' }, 429))
    await expect(failureOf(baseOptions, fetchImpl)).resolves.toMatchObject({ code: 'ACCOUNT_QUOTA' })
  })

  it('maps an expired sign-in', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 'UNAUTHENTICATED' }, 401))
    await expect(failureOf(baseOptions, fetchImpl)).resolves.toMatchObject({ code: 'ACCOUNT_TOKEN_INVALID' })
  })

  it('maps a mid-stream Token Plan error event', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([{ type: 'error', code: '429005', message: 'insufficient credits', retryable: false }]),
    )
    await expect(failureOf(baseOptions, fetchImpl)).resolves.toMatchObject({ code: 'ACCOUNT_QUOTA' })
  })
})
