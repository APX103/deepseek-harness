# @deepseek-ai/dsh-llm-inkstone

[English](README.md) | 中文

Inkstone（端砚）云网关提供商，接入 harness LLM 缝 —— [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) 里程碑 M1。

一次 harness 模型调用对应 orbit 网关上的一次 v2.0 **detached** 推理（`POST {baseURL}/local-agent/messages`），携带 `Authorization: Bearer <JWT>`、harness 归属头，网关 SSE 事件词汇映射为流分块。detached 推理要求具体模型：目录 `Auto` 行的 canonical id 解析经 `canonical_id`（KEP-0001）。Token Plan 业务码（`403005`、`429004`）以终态 `ACCOUNT_QUOTA` 呈现；用户限流 `429005` 映射为 `RATE_LIMIT`，由 harness 重试层退避重试。

鉴权经 `inkstone-account` 服务登录门控（无环境变量回退）；`inkstone-token-plan` 包提供墨点余额面。自定义提供商可经 pi-ai 适配器共存（KEP-0006）。

```yaml
- id: llm-inkstone
  name: '@deepseek-ai/dsh-llm-inkstone'
  config:
    baseURL: https://discovery-staging.intern-ai.org.cn/api/orbit/v1
    models:
      - id: auto
        name: Inkstone Auto
        contextWindow: 131072
        maxTokens: 8192
```
