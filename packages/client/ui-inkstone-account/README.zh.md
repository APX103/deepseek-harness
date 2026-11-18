# @deepseek-ai/dsh-client-ui-inkstone-account

[English](README.md) | 中文

Inkstone（端砚）登录面 —— [KEP-0002](../../../../inkstone-keps/KEP-0002-dsh-fork-inkstone-provider.md) 决策 D10。

替换组合中所有上游 DeepSeek 账号面：

- **Host 半**（`src/index.ts`）：loopback 会话端点（`GET/POST/DELETE /<token>/session` 及 `/session/sso`、`/session/code`、`/session/plan/*`），架在 `ctx.inkstoneAccount` 与 `ctx.inkstoneTokenPlan` 上，绑定 `127.0.0.1` 的 OS 分配端口、挂在不可猜测的路径 token 下，经 web 服务器的 index 注入表以 `INKSTONE_ACCOUNT` 全局（`{ baseUrl, registerUrl }`）公告给页面。
- **Client 半**（`src/client/index.ts`）：品牌化账号面——未登录时的全屏登录门（端砚 Inkstone · 上海人工智能实验室）；侧栏品牌占座；登录后的启动器（头像、名字、UID、带用量窗口的墨点余额、设置、退出登录）；以及模型设置页上的墨点面板（余额 hero、收支 / 墨点包 / 提额申请视图，KEP-0005）。注册留在网页端（`registerUrl`）。

```yaml
- id: ui-inkstone-account
  name: '@deepseek-ai/dsh-client-ui-inkstone-account'
  config:
    registerUrl: https://discovery-staging.intern-ai.org.cn
```
