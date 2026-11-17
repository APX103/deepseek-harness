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
  LlmResolvedModelInfo,
  StreamChunk,
  TokenUsage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import { fetchGatewayCatalog } from './catalog.ts'
import { rejectionFailure, sseErrorFailure } from './failure.ts'
import { assembleInferenceRequest, newInferenceIds, readOrbitSse } from './protocol.ts'
import type { Config, InkstoneModelEntry } from './config.ts'

const INFERENCE_PATH = '/local-agent/messages'
const MAX_REJECTION_BYTES = 2 * 1024 * 1024

/** Adapter dependencies; all seams are injectable for tests. */
export interface InkstoneAdapterDeps {
  /** Current validated configuration generation. */
  readonly settings: () => Config
  /** Bearer JWT source; the inkstone-account service with an environment fallback. */
  readonly resolveToken: () => string | undefined | Promise<string | undefined>
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
  #catalog: { entries: readonly InkstoneModelEntry[]; fetchedAt: number } | undefined

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

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const entries = await this.#catalogEntries()
    return entries.map(entry => ({
      provider,
      id: entry.id,
      name: entry.name,
      contextWindow: entry.contextWindow,
      maxTokens: entry.maxTokens,
    }))
  }

  override async resolveModel(provider: string, model: string, _signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const entries = await this.#catalogEntries()
    const entry = entries.find(candidate => candidate.id === model)
    // LlmResolvedModelInfo carries identity only; the listing's capacities
    // reach the picker through listModels.
    return { provider, id: model, name: entry?.name ?? model }
  }

  /**
   * The offered catalog: the gateway listing (kept fresh for
   * `catalogMaxAgeMs`) when a token and the listing are available, otherwise
   * the last good listing, otherwise the static fallback. The listing is the
   * same one the Token Plan side serves, keeping the picker consistent.
   */
  async #catalogEntries(): Promise<readonly InkstoneModelEntry[]> {
    const config = this.#deps.settings()
    const now = Date.now()
    if (this.#catalog !== undefined && now - this.#catalog.fetchedAt < config.catalogMaxAgeMs) {
      return this.#catalog.entries
    }
    const token = await this.#deps.resolveToken()
    if (token === undefined || token === '') return config.models
    try {
      const entries = await fetchGatewayCatalog(config.baseURL, token, this.#deps.fetchImpl ?? fetch)
      this.#catalog = { entries, fetchedAt: now }
      return entries
    } catch {
      return this.#catalog?.entries ?? config.models
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const config = this.#deps.settings()
    const token = await this.#deps.resolveToken()
    if (token === undefined) {
      throw new LlmError('Inkstone requires a sign-in through the account provider.', 'ACCOUNT_SIGN_IN_REQUIRED')
    }
    const request = assembleInferenceRequest(options, config, {
      ...(this.#deps.newIds !== undefined ? this.#deps.newIds() : newInferenceIds()),
      // A configured chat id points at a real orbit chat; otherwise the random
      // id only satisfies local validation and the live gateway answers
      // CHAT_NOT_FOUND until chat bootstrap lands (KEP-0002 M2).
      chatId: config.chatId > 0 ? config.chatId : this.#chatId,
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
          const text = event.text ?? ''
          if (openText?.kind === 'reasoning') {
            openText.text += text
            yield { type: 'reasoning-delta', index: blockIndex, text }
          } else {
            yield* openTextBlock('reasoning', text)
          }
          break
        }
        case 'content_delta': {
          const text = event.text ?? ''
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
          openTool = { index: blockIndex, id: event.id ?? '', name: event.name ?? '', json: '' }
          yield { type: 'block-start', index: blockIndex, blockType: 'tool-call' as ContentBlockType }
          break
        }
        case 'tool_input_delta': {
          if (openTool === undefined || openTool.id !== (event.id ?? '')) break
          const delta = event.partial_json ?? ''
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
          yield { type: 'finish', reason: mapFinishReason(event.stop_reason ?? 'stop', toolCallCount) }
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
