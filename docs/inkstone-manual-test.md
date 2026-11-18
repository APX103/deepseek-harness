# Inkstone manual test runbook (KEP-0002 · branch `ours/provider`)

English | [中文](inkstone-manual-test.zh.md)

> Applies from commit `113042e9f1` onward. All endpoints default to staging.

## 0. Preflight

```sh
cd ~/work/deepseek-harness
git checkout ours/provider && git pull
pnpm install --prefer-offline
pnpm build        # 首次必跑：生成各包 lib/ 产物；漏掉它 dev:desktop 会
                  # 报 ERR_MODULE_NOT_FOUND（dsh-official-bundles/lib/index.js）
```

`pnpm build` 全绿标志：`run-gates: 10 passed`；增量约 1~2 分钟；上游 rebase 后需要重跑。

## 1. Unit tests (all green)

```sh
npx vitest run packages/llm/llm-inkstone packages/credentials/inkstone-account packages/inkstone/token-plan
# 预期：6 files / 30 tests passed
```

## 2. Smoke script (real chain, no UI)

```sh
# 方式一：环境变量（密码不落屏）
export INKSTONE_USER=你的用户名
export INKSTONE_PASS=你的密码
npx tsx scripts/inkstone-smoke.ts

# 方式二：交互输入
npx tsx scripts/inkstone-smoke.ts
```

Steps and expectations:

| Step | Expectation |
|---|---|
| Sign-in | ✓ username + ssoUid + token expiry; on ✗ read the error code (table below) |
| 墨点 balance | ✓ `x.xxx` credits (three decimals) |
| Free-grant status | ✓ claimed / not claimed |
| Model catalog | ✓ `N entries: Auto, 书生-Agents-A1, …` |
| Inference | Runs with `--chat <id>`; pick the id from `GET {orbit}/chat/list`, or omit it once and let the script create one |

Inference example:

```sh
npx tsx scripts/inkstone-smoke.ts --chat 61185
```

Known expected failure: a plain web chat returns `422001 LOCAL_AGENT_RUNTIME_MISMATCH`
(a chat is not a local-agent project type) — an archived open question, not a regression.

Error code quick reference:

| Code | Meaning |
|---|---|
| ✓ all pass | The password sign-in contract (account/autoLogin/`账号\|\|密码+timestamp` RSA) is verified against production |
| `AUTH_CAPTCHA_REQUIRED` (msgCode B0501/B0502) | **The expected main hurdle**: the human-verification gate. A real account hits it on the first run — send back the full msg (with traceId); the next revision implements the captcha loop (image-captcha endpoint and captchaid header already located) |
| `AUTH_REJECTED` + wrong-account-or-password msg | Bad credentials |
| `AUTH_NETWORK` / `TOKEN_PLAN_NETWORK` | No network / VPN |
| `TOKEN_PLAN_UNAUTHORIZED` | Sign-in not established or JWT expired |
| `422003 INVALID_INFERENCE_PAYLOAD` | Request schema drifted from production (send back the msg) |
| `404001 CHAT_NOT_FOUND` | The chat id does not exist |

## 3. Desktop app from source

```sh
pnpm dev:desktop        # 首次较慢；= pnpm --filter @deepseek-ai/dsh-desktop run dev
```

After launch, check in the app:

1. **Boots normally; upstream features (sessions, terminal, …) do not regress**
2. **Model picker**: only the `Inkstone · 端砚` provider; the catalog is the static
   fallback (`Inkstone Auto`) while signed out — expected until sign-in UI lands
3. **Send one message**: expected to fail with `ACCOUNT_SIGN_IN_REQUIRED` (sign-in gating)
4. **Models settings page**: the Token Plan panel (balance hero, 收支 / 墨点包 /
   提额申请) renders; custom providers can be added via the pi-ai adapter (KEP-0006)
5. No `[llm-inkstone]` / `[inkstone-account]` errors in the log/console

Known residue (KEP-0003 cleanup, not this round): a DeepSeek sign-in entry may
appear in settings (desktop-host depends on that service).

## 4. Configuration overrides (as needed)

Profile config lives at `~/.inkstone/profiles/<profile>/cordis.patch.yml` (redirect
the root with `DSH_HOME`). Point a route at another endpoint or pin a real chat:

```yaml
- id: llm-inkstone
  config:
    baseURL: https://discovery.intern-ai.org.cn/api/orbit/v1   # 生产
    chatId: 61185
```

## 5. Feedback format

For each issue report: **step number + the complete original error code/message +
(for inference) the trace_id**. Fix one, verify one, close each item in turn.
