# @deepseek-ai/dsh-inkstone-token-plan

English | [中文](README.zh.md)

Inkstone (端砚) Token Plan service — [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) milestone M3.

墨点余额与提额，extracted from the 书生·端砚 desktop web-api. Six operations over the
platform `/tokenplan/v1` surface, authenticated by the `inkstone-account` service (the sole
token source; no environment fallback exists); the free-grant pair sends the verified
`ssoUid` in the `id` header per the desktop contract. Response semantics follow
`2026-11-02-token-plan-entry.md`: `available_credits` arrives as string or number
and must be finite non-negative; UI shows three decimals via
`formatInkstoneCredits`.

The model picker stays consistent with the plan through the sibling catalog:
`llm-inkstone` offers exactly the gateway's `/local-agent/models` listing
(Auto / 书生-Agents-A1 / 书生-A1.5 / 克劳德-Opus-5 …) with the configured static
catalog as fallback.

```yaml
- id: inkstone-token-plan
  name: '@deepseek-ai/dsh-inkstone-token-plan'
  config:
    apiBaseUrl: https://discovery-staging.intern-ai.org.cn/api
```
