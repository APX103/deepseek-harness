/**
 * The Inkstone LLM adapter: one detached orbit inference per harness call,
 * mapping gateway SSE events onto the harness stream-chunk vocabulary.
 *
 * Block lifecycle: text and reasoning blocks open lazily on their first
 * delta; tool blocks open on `tool_use_start` and close on `tool_use_end`
 * with the accumulated raw JSON as the call arguments. `message_end` closes
 * any open block and finishes the stream; a stream that ends without it
 * still closes and finishes defensively.
 *
 * @module dsh-llm-inkstone/adapter
 */
import { attributionHeaders, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  ContentBlockType,
  FinishReason,
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  StreamChunk,
  TokenUsage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import { rejectionFailure, sseErrorFailure } from './failure.ts'
import { assembleInferenceRequest, newInferenceIds, readOrbitSse } from './protocol.ts'
import type { Config } from './config.ts'

const INFERENCE_PATH = '/local-agent/messages'
const MAX_REJECTION_BYTES = 2 * 1024 * 1024

/** Adapter dependencies; all seams are injectable for tests. */
export interface InkstoneAdapterDeps {
  /** Current validated configuration generation. */
  readonly settings: () => Config
  /** M1 bearer JWT source; M2 swaps this for the inkstone-account service. */
  readonly resolveToken: () => string | undefined
  /** Injectable fetch for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch
  /** Injectable identity source for tests. */
  readonly newIds?: () => { requestId: string; inferenceId: string }
}

interface OpenText {
  readonly kind: 'text' | 'reasoning'
  text: string
}

interface OpenTool {
  readonly index: number
  readonly id: string
  readonly name: string
  json: string
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function mapUsage(usage: Record<string, unknown> | undefined): TokenUsage {
  const input = toFiniteNumber(usage?.['input_tokens'] ?? usage?.['prompt_tokens']) ?? 0
  const output = toFiniteNumber(usage?.['output_tokens'] ?? usage?.['completion_tokens']) ?? 0
  const total = toFiniteNumber(usage?.['total_tokens'])
  const reasoning = toFiniteNumber(usage?.['reasoning_tokens'] ?? usage?.['thinking_tokens'])
  return {
    inputTokens: input,
    outputTokens: output,
    ...(total !== undefined ? { totalTokens: total } : {}),
    ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
  }
}

function mapFinishReason(stopReason: string, toolCallCount: number): FinishReason {
  if (toolCallCount > 0 || stopReason.includes('tool')) return { kind: 'tool-calls' }
  if (stopReason.includes('length') || stopReason.includes('max') || stopReason.includes('token')) return { kind: 'max-tokens' }
  return { kind: 'stop' }
}

/** The Inkstone adapter over the orbit gateway. */
export class InkstoneAdapter extends LlmAdapter {
  readonly #deps: InkstoneAdapterDeps
  readonly #chatId: number

  constructor(deps: InkstoneAdapterDeps) {
    super()
    this.#deps = deps
    // One stable chat scope per adapter instance; every call stays a detached
    // inference under it. E2E against staging confirms the pairing (KEP-0002 M1).
    this.#chatId = 1 + Math.floor(Math.random() * 2_000_000_000)
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Inkstone · 端砚' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(
      this.#deps.settings().models.map(entry => ({
        provider,
        id: entry.id,
        name: entry.name,
        contextWindow: entry.contextWindow,
        maxTokens: entry.maxTokens,
      })),
    )
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const config = this.#deps.settings()
    const token = this.#deps.resolveToken()
    if (token === undefined) {
      throw new LlmError(
        `Inkstone requires a sign-in; for M1 export ${config.tokenEnv} with the staging JWT (M2 adds account sign-in).`,
        'ACCOUNT_SIGN_IN_REQUIRED',
      )
    }
    const request = assembleInferenceRequest(options, config, {
      ...(this.#deps.newIds !== undefined ? this.#deps.newIds() : newInferenceIds()),
      chatId: this.#chatId,
    })
    const fetchImpl = this.#deps.fetchImpl ?? fetch
    let response: Response
    try {
      response = await fetchImpl(joinUrl(config.baseURL, INFERENCE_PATH), {
        method: 'POST',
        headers: {
          accept: 'text/event-stream',
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          ...attributionHeaders(),
        },
        body: JSON.stringify(request),
        signal: options.signal ?? null,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
      })
    } catch (cause) {
      throw new LlmError('The Inkstone gateway could not be reached.', 'TRANSPORT', { cause })
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
    if (!response.ok || !contentType.includes('text/event-stream') || response.body === null) {
      let envelope: unknown
      try {
        envelope = JSON.parse((await response.text()).slice(0, MAX_REJECTION_BYTES)) as unknown
      } catch {
        envelope = undefined
      }
      throw rejectionFailure(response.status, envelope)
    }

    let blockIndex = -1
    let openText: OpenText | undefined
    let openTool: OpenTool | undefined
    let toolCallCount = 0
    let finished = false
    const endOpen = function* (): Generator<StreamChunk> {
      if (openText !== undefined) {
        yield {
          type: 'block-end',
          index: blockIndex,
          block: openText.kind === 'text' ? { type: 'text', text: openText.text } : { type: 'reasoning', text: openText.text },
        }
        openText = undefined
      } else if (openTool !== undefined) {
        yield {
          type: 'block-end',
          index: openTool.index,
          block: { type: 'tool-call', id: brandString<ToolCallId>(openTool.id), name: openTool.name, arguments: openTool.json },
        }
        openTool = undefined
      }
    }
    const openTextBlock = function* (kind: 'text' | 'reasoning', firstDelta: string): Generator<StreamChunk> {
      yield* endOpen()
      blockIndex += 1
      openText = { kind, text: firstDelta }
      yield { type: 'block-start', index: blockIndex, blockType: kind as ContentBlockType }
      yield { type: kind === 'text' ? 'text-delta' : 'reasoning-delta', index: blockIndex, text: firstDelta }
    }

    for await (const event of readOrbitSse(response.body)) {
      switch (event.type) {
        case 'message_start':
          break
        case 'thinking_delta': {
          const text = String(event.text ?? '')
          if (openText?.kind === 'reasoning') {
            openText.text += text
            yield { type: 'reasoning-delta', index: blockIndex, text }
          } else {
            yield* openTextBlock('reasoning', text)
          }
          break
        }
        case 'content_delta': {
          const text = String(event.text ?? '')
          if (openText?.kind === 'text') {
            openText.text += text
            yield { type: 'text-delta', index: blockIndex, text }
          } else {
            yield* openTextBlock('text', text)
          }
          break
        }
        case 'tool_use_start': {
          yield* endOpen()
          blockIndex += 1
          openTool = { index: blockIndex, id: String(event.id ?? ''), name: String(event.name ?? ''), json: '' }
          yield { type: 'block-start', index: blockIndex, blockType: 'tool-call' as ContentBlockType }
          break
        }
        case 'tool_input_delta': {
          if (openTool === undefined || openTool.id !== String(event.id ?? '')) break
          const delta = String(event.partial_json ?? '')
          yield {
            type: 'tool-call-delta',
            index: openTool.index,
            id: brandString<ToolCallId>(openTool.id),
            ...(openTool.json === '' && openTool.name !== '' ? { name: openTool.name } : {}),
            argumentsDelta: delta,
          }
          openTool.json += delta
          break
        }
        case 'tool_use_end': {
          if (openTool === undefined) break
          if (openTool.json === '' && event.input !== undefined) openTool.json = JSON.stringify(event.input)
          yield* endOpen()
          toolCallCount += 1
          break
        }
        case 'usage':
          yield { type: 'usage', usage: mapUsage(event.usage) }
          break
        case 'message_end': {
          yield* endOpen()
          finished = true
          yield { type: 'finish', reason: mapFinishReason(String(event.stop_reason ?? 'stop'), toolCallCount) }
          break
        }
        case 'error':
          yield* endOpen()
          throw sseErrorFailure(event)
        default:
          break
      }
    }
    if (!finished) {
      yield* endOpen()
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}
