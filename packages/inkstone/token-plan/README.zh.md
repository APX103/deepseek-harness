# @deepseek-ai/dsh-inkstone-token-plan

[English](README.md) | 中文

Inkstone（端砚）Token Plan 服务 —— [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) 里程碑 M3。

墨点余额与提额，从书生·端砚桌面端的 web-api 抽取。平台 `/tokenplan/v1` 面上的六个操作，经 `inkstone-account` 服务鉴权（唯一 token 来源，无环境变量回退）；免费墨点一对按桌面端契约在 `id` 头携带校验过的 `ssoUid`。响应语义遵循 `2026-11-02-token-plan-entry.md`：`available_credits` 以字符串或数字到达，必须是有限非负；UI 经 `formatInkstoneCredits` 显示三位小数。余额信封还携带滑动用量窗口（5h/7d），经 `effectiveCredits`（总额被最紧窗口封顶后的可花值）呈现。

模型选择器经兄弟目录与套餐保持一致：`llm-inkstone` 提供网关 `/local-agent/models` 列表（Auto / 书生-Agents-A1 / 书生-A1.5 / 克劳德-Opus-5 …），配置目录兜底。

```yaml
- id: inkstone-token-plan
  name: '@deepseek-ai/dsh-inkstone-token-plan'
  config:
    apiBaseUrl: https://discovery-staging.intern-ai.org.cn/api
```
