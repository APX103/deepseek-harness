# Agent Note: Cordis service classes and the Inkstone gateway wire contract

Status: implemented

[English](2026-11-17-cordis-service-class-contracts.md) | 中文

## Problem

Inkstone 真机集成（KEP-0002/0003）只在真实 cordis 组合里失败，而所有单测都过；Inkstone staging 网关又用四层 422 信封逐层拒绝推理请求。单测要么直接构造服务，要么跑在假 context 上，完全不触及组合真正运行的机制：服务代理、class plugin 的配置 schema、加载器的入口选择、跨 fiber 的激活时序，以及已部署网关的字段校验。有两个问题需要持久答案：`Service` 子类长成什么样才能活过 cordis 机制，以及 harness 如何校验一份读不到源码的外部闭源网关契约。

## Decision

`Service` 子类遵守三条硬契约，每条都来自一次只在真机发生的失败：

- **用 TypeScript `private`，永不使用 ECMAScript `#`。** cordis 把服务实例包进 traceable 代理，方法经 `ctx.<service>` 调用时接收者会被换成 shadow context；代理永远过不了 `#` 的 brand check，任何触碰 `#` 字段的方法都会抛 "Cannot read private member"。这就是仓库里其他 `Service` 子类都不用 `#` 字段的原因。`InkstoneAccount` 和 `InkstoneTokenPlan` 是仅有的两个反例（[修复提交 ac469c4976](https://github.com/APX103/deepseek-harness/commit/ac469c4976)）。
- **每个 class plugin 都要声明 `static Config = Config`。** 加载器以 `(ctx, config)` 实例化 default export 的类；没有静态 schema，schemastery 默认值永远不会解析，构造函数收到 `undefined`，并且要到首次字段访问时才失败，而不是在加载时。同一个文件里的模块 `apply` 函数不会执行：`vendor/loader` 的 `unwrapExports()` 优先取 `export default` 而不是具名 `apply`，所以一个包必须把 default export 当作真正入口，把依赖接线放进类构造函数（经 `ctx.get` 惰性解析），而不是放在旁边的 `apply` 里。
- **跨 fiber 的读取跟随激活时序，而不是构造时序。** 服务构造函数里快照另一个服务（`ctx.get('credentials')`）或对它发起一次性工作，会和那个 fiber 的异步初始化（`Service.init`）竞速；`readRecord` 这类快照式读取在 provider 加载完成前返回空。构造时一次性 restore 会静默丢数据。因此账号 grant 的 restore 是一条串行链，并在 `credentials` 的 `internal/service` 事件上重跑——该事件恰好在那个 fiber 转 ACTIVE 时触发——每个读 token 的方法都 await 这条链。

网关契约的校验手段是：用真实 bearer token 对 staging 跑独立 repro 脚本，重放 `POST /chat/new` 和 `POST /local-agent/messages`，逐字读拒绝信封，修一个字段，再重放。已验证的四层现在记录在 `packages/llm/llm-inkstone/src/protocol.ts` 的 JSDoc 里：所有 JSON 路由都回答 `{code, msg, trace_id, data}` 信封；detached 推理要求具体模型（`auto` 别名经目录的 `canonical_id` 解析）；`metadata.locale` 只接受 `zh`/`en`；每个 `tool_result` 内容块必须带 `is_error` 布尔。`Accept` 必须精确为 `text/event-stream`。

## Alternatives considered

**保留 ECMAScript `#` 字段并在调用点拆代理。** `ctx.get(name, strict)` 返回的同样是 traceable 代理，而且没有受支持的去包装访问器；在每个消费方和代理搏斗，远比用编译期可见性费代码。

**声明 required `inject` 来给 credentials fiber 定序。** required inject 会把 credentials provider 变成强制依赖，破坏不带持久化跑账号服务的组合；而 optional inject 同样不保证 provider 的 init 完成。`internal/service` 重跑方案在提供 persistence 的组合里消除竞速，同时保持它是可选的。

**从 Go core 的 checkout 读网关 schema 而不是重放。** 检入的 core schema 比已部署服务更新（它已经带上了部署会拒绝的字段），所以 core 的校验只是线索，不是契约。已部署网关的信封是唯一权威来源，而且重放比镜像一份 schema 便宜。

## Consequences

今后每个 `Service` 子类按这三条契约成型，两个 host spec（`packages/credentials/inkstone-account/tests/service.host.spec.ts`、`packages/inkstone/token-plan/tests/service.host.spec.ts`）把它们钉住：各自起真 `Context`，经 `ctx.<name>` 代理调用服务，任何退回 `#` 字段的改动都会失败。网关线的变更在动产品代码之前先过重放。代价是两条从包内部看多余的契约（`static Config` 那行、仅限 TS 的私有性），只在组合里才真正承重。
