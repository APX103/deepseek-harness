# Inkstone 手工测试手册（KEP-0002 · 分支 `ours/provider`）

> 适用提交：`113042e9f1` 及之后。所有端点默认 staging。

## 0. 预备

```sh
cd ~/work/deepseek-harness
git checkout ours/provider && git pull
pnpm install --prefer-offline
```

## 1. 单元测试（应全绿）

```sh
npx vitest run packages/llm/llm-inkstone packages/credentials/inkstone-account packages/inkstone/token-plan
# 预期：6 files / 30 tests passed
```

## 2. 冒烟脚本（真链路，免 UI）

```sh
# 方式一：环境变量（密码不落屏）
export INKSTONE_USER=你的用户名
export INKSTONE_PASS=你的密码
npx tsx scripts/inkstone-smoke.ts

# 方式二：交互输入
npx tsx scripts/inkstone-smoke.ts
```

步骤与预期：

| 步骤 | 预期 |
|---|---|
| 登录 | ✓ 用户名 + ssoUid + token 有效期；✗ 则看错误码（见下表） |
| 墨点余额 | ✓ `x.xxx 墨点`（三位小数） |
| 免费墨点状态 | ✓ 已领取/未领取 |
| 模型目录 | ✓ `N 个：Auto、书生-Agents-A1、…` |
| 推理 | `--chat <id>` 时触发；id 从 `GET {orbit}/chat/list` 里挑，或先跑一次 `/chat` 让它自建 |

推理步骤示例：

```sh
npx tsx scripts/inkstone-smoke.ts --chat 61185
```

已知预期失败：普通 web chat 会返回 `422001 LOCAL_AGENT_RUNTIME_MISMATCH`
（chat 不是 local-agent 项目类型）——这是已归档的开放问题，不是回归。

错误码速查：

| 码 | 含义 |
|---|---|
| ✓ 全过 | 账密登录契约（account/autoLogin/`账号\\|\\|密码+时间戳` RSA）已对线上校验通过 |
| `AUTH_CAPTCHA_REQUIRED`（msgCode B0501/B0502） | **预期中的主拦路虎**：人机验证门。真账号第一次跑大概率撞上——把整段 msg（含 traceId）发回，下一版实现验证码回路（图片验证码端点与 captchaid 头已定位） |
| `AUTH_REJECTED` + 账号或密码错误类 msg | 凭据不对 |
| `AUTH_NETWORK` / `TOKEN_PLAN_NETWORK` | 网络不通 / VPN |
| `TOKEN_PLAN_UNAUTHORIZED` | 登录态没建立或 JWT 过期 |
| `422003 INVALID_INFERENCE_PAYLOAD` | 请求 schema 与线上不一致（把 msg 发回） |
| `404001 CHAT_NOT_FOUND` | chat id 不存在 |

## 3. 桌面 App 从源码启动

```sh
pnpm dev:desktop        # 首次较慢；= pnpm --filter @deepseek-ai/dsh-desktop run dev
```

启动后在 App 里检查：

1. **能正常起、会话/终端等上游功能不回归**
2. **模型选择器**：只有 `Inkstone · 端砚` 一个 provider；未登录时目录是静态兜底（`Inkstone Auto`）——登录 UI 未建，属预期
3. **发一条消息**：预期失败，错误含 `ACCOUNT_SIGN_IN_REQUIRED`（登录强制，D8）
4. **Models 设置页**：没有自定义网关/DeepSeek 路由可加（D8 禁用）
5. 日志/console 无 `[llm-inkstone]`、`[inkstone-account]` 报错

已知残留（KEP-0003 清理，非本轮问题）：设置里可能出现 DeepSeek 登录入口
（desktop-host 依赖该服务）。

## 4. 配置覆盖（按需）

profile 配置在 `~/.dsh/profiles/<profile>/cordis.patch.yml`（可用 `DSH_HOME`
重定向根）。给路由换端点或指定真实 chat：

```yaml
- id: llm-inkstone
  config:
    baseURL: https://discovery.intern-ai.org.cn/api/orbit/v1   # 生产
    chatId: 61185
```

## 5. 反馈格式

每条问题给：**步骤编号 + 完整错误码/消息原文 + （推理类）trace_id**。改一条
验一条，逐项闭环。
