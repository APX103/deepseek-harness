/**
 * The Inkstone sign-in surface, host half: a loopback-only session endpoint
 * over the inkstone-account service, announced to pages through the web
 * server's index-injection table (KEP-0002 D10).
 *
 * The endpoint binds 127.0.0.1 on an OS-assigned port under an unguessable
 * path token; the injected `INKSTONE_ACCOUNT` global carries `{ baseUrl,
 * registerUrl }` for the client gate in `./client`. This replaces every
 * upstream DeepSeek account surface in the composition. KEP-0003 adds
 * `GET /session/sso` (the SSO login page URL) and `POST /session/code` (a
 * `uaa::code::` exchange) for the desktop shell's page sign-in window.
 *
 * @module dsh-client-ui-inkstone-account
 */
import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-inkstone-account'
import type {} from '@deepseek-ai/dsh-inkstone-token-plan'
import { Config } from './config.ts'
import { INKSTONE_ACCOUNT_GLOBAL } from './global.ts'
import { buildSsoLoginUrl } from './sso-url.ts'

export { Config } from './config.ts'
export type { Config as InkstoneAccountUiConfig, SsoLocale } from './config.ts'
export { INKSTONE_ACCOUNT_GLOBAL } from './global.ts'
export { buildSsoLoginUrl, readSsoCallbackCode } from './sso-url.ts'
export type { SsoDeployment } from './sso-url.ts'

export const name = 'ui-inkstone-account'
export const inject = ['inkstoneAccount', 'webServer']

const MAX_BODY_BYTES = 16 * 1024

export function apply(ctx: Context, config: Config): void {
  const pathToken = randomBytes(24).toString('hex')
  const server = createServer((request, response) => {
    void handleSessionRequest(ctx, config, pathToken, request, response)
  })
  // The bind races the first index-inject emit, so the port is cached once
  // listening and every later emit uses the settled value.
  let boundPort: number | undefined
  server.on('listening', () => {
    const address = server.address()
    if (address !== null && typeof address !== 'string') boundPort = address.port
  })
  server.listen(0, '127.0.0.1')
  ctx.on('webserver/index-inject', (table) => {
    if (boundPort === undefined) return
    table.push({
      kind: 'global',
      name: INKSTONE_ACCOUNT_GLOBAL,
      value: {
        baseUrl: `http://127.0.0.1:${boundPort}/${pathToken}`,
        registerUrl: config.registerUrl,
      },
    })
  })
  ctx.effect(() => () => {
    server.close()
  })
}

async function handleSessionRequest(
  ctx: Context,
  config: ReturnType<typeof Config>,
  pathToken: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  setCorsHeaders(response)
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end()
    return
  }
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const prefix = `/${pathToken}`
  const route = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : undefined
  if (route !== '/session' && route !== '/session/sso' && route !== '/session/code' && route !== '/session/balance'
    && route !== '/session/plan/transactions' && route !== '/session/plan/packages' && route !== '/session/plan/applications') {
    response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
    return
  }
  try {
    if (route === '/session/sso') {
      if (request.method !== 'GET') throw new MethodNotAllowed(request.method)
      // A misconfigured redirectUrl (not an ampersand-free https URL) fails the
      // request here rather than handing the desktop an unusable login page.
      const deployment = ctx.inkstoneAccount.deployment()
      const loginUrl = buildSsoLoginUrl(deployment, config.locale)
      // The desktop recognizes the callback with `redirectUrl` alone.
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ loginUrl, redirectUrl: deployment.redirectUrl }))
      return
    }
    if (route === '/session/code') {
      if (request.method !== 'POST') throw new MethodNotAllowed(request.method)
      const body = await readJsonBody(request)
      const code = typeof body['code'] === 'string' ? body['code'] : ''
      if (code === '') {
        response.writeHead(400, { 'content-type': 'application/json' }).end('{"code":"BAD_REQUEST","message":"缺少登录凭证"}')
        return
      }
      const view = await ctx.inkstoneAccount.signInWithCode(code)
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({ authenticated: true, user: view.user, expiresAtMs: view.expiresAtMs, registerUrl: config.registerUrl }),
      )
      return
    }
    if (route === '/session/balance') {
      if (request.method !== 'GET') throw new MethodNotAllowed(request.method)
      // Optional composition member: without the Token Plan service the route
      // is absent rather than an error, and the client hides the row.
      const plan = ctx.get('inkstoneTokenPlan')
      if (plan === undefined) {
        response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
        return
      }
      const balance = await plan.balance()
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        credits: balance.credits,
        effectiveCredits: balance.effectiveCredits,
        windows: balance.windows,
      }))
      return
    }
    if (route === '/session/plan/transactions') {
      if (request.method !== 'GET') throw new MethodNotAllowed(request.method)
      const plan = ctx.get('inkstoneTokenPlan')
      if (plan === undefined) {
        response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
        return
      }
      const start = url.searchParams.get('start') ?? ''
      const end = url.searchParams.get('end') ?? ''
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        response.writeHead(400, { 'content-type': 'application/json' }).end('{"code":"BAD_REQUEST","message":"start 和 end 必须是 YYYY-MM-DD"}')
        return
      }
      const ledger = await plan.transactions(start, end, page)
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(ledger))
      return
    }
    if (route === '/session/plan/packages') {
      if (request.method !== 'GET') throw new MethodNotAllowed(request.method)
      const plan = ctx.get('inkstoneTokenPlan')
      if (plan === undefined) {
        response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
        return
      }
      const packages = await plan.packages()
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ packages }))
      return
    }
    if (route === '/session/plan/applications') {
      if (request.method !== 'GET') throw new MethodNotAllowed(request.method)
      const plan = ctx.get('inkstoneTokenPlan')
      if (plan === undefined) {
        response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}')
        return
      }
      const applications = await plan.creditIncreaseApplications()
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ applications }))
      return
    }
    if (request.method === 'GET') {
      const state = await ctx.inkstoneAccount.state()
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({ authenticated: state.authenticated, user: state.user, expiresAtMs: state.expiresAtMs }),
      )
      return
    }
    if (request.method === 'DELETE') {
      await ctx.inkstoneAccount.signOut()
      response.writeHead(204).end()
      return
    }
    if (request.method === 'POST') {
      const body = await readJsonBody(request)
      const username = typeof body['username'] === 'string' ? body['username'].trim() : ''
      const password = typeof body['password'] === 'string' ? body['password'] : ''
      if (username === '' || password === '') {
        response.writeHead(400, { 'content-type': 'application/json' }).end('{"code":"BAD_REQUEST","message":"账号和密码不能为空"}')
        return
      }
      const view = await ctx.inkstoneAccount.signInWithPassword(username, password)
      response.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({ authenticated: true, user: view.user, expiresAtMs: view.expiresAtMs, registerUrl: config.registerUrl }),
      )
      return
    }
    throw new MethodNotAllowed(request.method)
  } catch (error) {
    if (error instanceof MethodNotAllowed) {
      response.writeHead(405, { 'content-type': 'application/json' }).end('{"error":"method not allowed"}')
      return
    }
    const code = (error as { code?: string }).code ?? 'AUTH_REJECTED'
    const message = error instanceof Error ? error.message : '登录失败'
    const status = code.startsWith('AUTH_') ? 401 : 500
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify({ code, message }))
  }
}

/** Marker for a wrong method on a known route, rendered as `405` by the request handler. */
class MethodNotAllowed extends Error {
  constructor(method: string | undefined) {
    super(`method ${method ?? 'unknown'} not allowed`)
    this.name = 'MethodNotAllowed'
  }
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type')
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be an object')
  }
  return parsed as Record<string, unknown>
}
