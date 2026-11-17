/**
 * Inkstone 手工冒烟脚本（KEP-0002）：免 UI 走完真链路。
 *
 *   npx tsx scripts/inkstone-smoke.ts [--chat <orbit-chat-id>]
 *
 * 步骤：账密登录 → 用户资料 → 墨点余额 → 免费墨点状态 → 平台模型目录 →
 * （可选，--chat 给定真实 chat id 时）一条 /local-agent/messages 推理。
 *
 * 凭据：INKSTONE_USER / INKSTONE_PASS 环境变量，或交互输入（密码明文可见，
 * 测试环境可接受）。端点默认 staging，可用 INKSTONE_AUTH_BASE /
 * INKSTONE_API_BASE / INKSTONE_SSO_ORIGIN / INKSTONE_ORBIT_BASE 覆盖。
 */
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { AccountSession } from '../packages/credentials/inkstone-account/src/session.ts'
import { TokenPlanClient } from '../packages/inkstone/token-plan/src/client.ts'
import { formatInkstoneCredits } from '../packages/inkstone/token-plan/src/format.ts'
import { assembleInferenceRequest, readOrbitSse } from '../packages/llm/llm-inkstone/src/protocol.ts'

const authBase = process.env['INKSTONE_AUTH_BASE'] ?? 'https://discovery-staging.intern-ai.org.cn/api/user-center/v1'
const apiBase = process.env['INKSTONE_API_BASE'] ?? 'https://discovery-staging.intern-ai.org.cn/api'
const ssoOrigin = process.env['INKSTONE_SSO_ORIGIN'] ?? 'https://sso.staging.openxlab.org.cn'
const orbitBase = process.env['INKSTONE_ORBIT_BASE'] ?? 'https://discovery-staging.intern-ai.org.cn/api/orbit/v1'
const chatArg = process.argv.includes('--chat') ? Number(process.argv[process.argv.indexOf('--chat') + 1]) : undefined

const accountConfig = { authBaseUrl: authBase, ssoOrigin, clientId: '05wrodmwk4z3mze13kmy', source: 'discovery', redirectUrl: 'https://discovery-staging.intern-ai.org.cn/', requestTimeoutMs: 20_000 }
const planConfig = { apiBaseUrl: apiBase, requestTimeoutMs: 15_000 }

let passed = 0
let failed = 0

function report(name: string, error: unknown): void {
  const detail = error instanceof Error ? `${(error as { code?: string }).code ?? ''} ${error.message}` : String(error)
  failed += 1
  console.log(`✗ ${name}: ${detail}`)
}

async function step(name: string, run: () => Promise<string>): Promise<string | undefined> {
  try {
    const detail = await run()
    passed += 1
    console.log(`✓ ${name}: ${detail}`)
    return detail
  } catch (error) {
    report(name, error)
    return undefined
  }
}

async function credentials(): Promise<{ username: string; password: string }> {
  const username = process.env['INKSTONE_USER']
  const password = process.env['INKSTONE_PASS']
  if (username !== undefined && password !== undefined) return { username, password }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const user = (await rl.question('用户名: ')).trim()
  const pass = (await rl.question('密码（输入可见，仅测试用）: ')).trim()
  rl.close()
  return { username: user, password: pass }
}

const { username, password } = await credentials()
const session = new AccountSession({ config: accountConfig, fetch: (input, init) => fetch(input, init) })

const view = await step('登录（uaa byAccount → code → JWT）', async () => {
  const result = await session.signInWithPassword(username, password)
  const name = result.user?.username ?? username
  const phone = result.user?.phone === undefined ? '' : `，手机 ${result.user.phone}`
  return `${name}（ssoUid ${result.user?.ssoUid ?? '?'}${phone}），token 至 ${new Date(result.expiresAtMs).toLocaleString()}`
})
if (view === undefined) {
  console.log('\n登录失败，后续步骤跳过。把上面的错误码发回来即可定位。')
  process.exit(1)
}

const token = await session.resolveToken()
if (token === undefined) {
  console.log('✗ 会话未持有 token')
  process.exit(1)
}
const ssoUid = session.state().user?.ssoUid

const plan = new TokenPlanClient({ config: planConfig, fetch: (input, init) => fetch(input, init) })
await step('墨点余额', async () => {
  const balance = await plan.balance(token)
  return `${formatInkstoneCredits(balance.credits)} 墨点（原值 ${balance.credits}）`
})
if (ssoUid !== undefined) {
  await step('免费墨点状态', async () => {
    const status = await plan.freeGrantStatus(token, ssoUid)
    return status.hasReceived ? '已领取' : '未领取（可 claimFreeGrant）'
  })
} else {
  console.log('– 免费墨点状态：跳过（资料无 ssoUid）')
}

await step('平台模型目录（/local-agent/models）', async () => {
  const response = await fetch(`${orbitBase.replace(/\/+$/, '')}/local-agent/models`, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`status ${response.status}`)
  const envelope = (await response.json()) as { data?: { models?: { id?: string }[] } }
  const models = envelope.data?.models ?? []
  return `${models.length} 个：${models.slice(0, 5).map(m => m.id).join('、')}${models.length > 5 ? ' …' : ''}`
})

if (chatArg !== undefined && Number.isSafeInteger(chatArg) && chatArg > 0) {
  await step(`推理（/local-agent/messages，chat ${chatArg}）`, async () => {
    const request = assembleInferenceRequest(
      { provider: 'inkstone', model: 'auto', messages: [{ role: 'user', content: [{ type: 'text', text: '只回复两个字：成功' }] }] } as never,
      { baseURL: orbitBase, chatId: chatArg, defaultModel: 'auto', thinking: false, thinkingBudgetTokens: 0, locale: 'zh-CN', catalogMaxAgeMs: 0, models: [] },
      { requestId: randomUUID(), inferenceId: randomUUID(), chatId: chatArg },
    )
    const response = await fetch(`${orbitBase.replace(/\/+$/, '')}/local-agent/messages`, {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      redirect: 'error',
    })
    if (!response.ok || response.body === null) {
      const text = await response.text().catch(() => '')
      throw new Error(`status ${response.status} ${text.slice(0, 200)}`)
    }
    let text = ''
    let finish = '(no message_end)'
    for await (const event of readOrbitSse(response.body)) {
      if (event.type === 'content_delta') text += event.text ?? ''
      if (event.type === 'message_end') finish = String(event.stop_reason ?? 'stop')
      if (event.type === 'error') throw new Error(`sse error ${String(event.code ?? '')} ${String(event.message ?? '')}`)
    }
    return `「${text.slice(0, 40)}」stop=${finish}`
  })
} else {
  console.log('– 推理：跳过（加 --chat <真实chatId> 触发；chat id 见 /chat/list）')
}

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
