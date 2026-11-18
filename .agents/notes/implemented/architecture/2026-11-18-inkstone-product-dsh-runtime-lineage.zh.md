# Agent Note: Inkstone is the product; DeepSeek Harness is its runtime

Status: implemented

[English](2026-11-18-inkstone-product-dsh-runtime-lineage.md) | 中文

## Problem

这个 fork 背负两个名字：仓库和运行时词汇是 DeepSeek Harness（DSH）——`dsh-*` 包、`DSH_*` 环境变量、Cordis 机制——而出货的产品是上海人工智能实验室的端砚 Inkstone。面向模型或用户的界面在两个名字之间漂移：代理从自己的知识技能里回答「我是 DSH」，而系统提示、侧栏和登录门写的是 Inkstone。每个需要这个事实的界面各自重新推导，推导结果在用户面前互相矛盾。

## Decision

关系是被声明的，不是被发现的：**Inkstone 是产品；DeepSeek Harness 是其构建所基于的代理运行时。**每个身份性界面用同一种方式陈述它，并且引用这篇笔记而不是重新推导。

- 模型身份（KEP-0002，`dsh-system-prompt` 的 `identity` 配置）："You are 端砚 Inkstone, an AI agent by Shanghai AI Laboratory (上海人工智能实验室)。"base bundle 设置它；web-app 层重述它，因为 loader patch 会替换整行配置。
- 自我知识（KEP-0004）：`inkstone-doc` 技能（由 `dsh-doc` 更名）以 Who-you-are 段开篇承载这份声明，为操作者过渡一次性注明旧名，并教导 `dsh-*` 名称是运行时词汇、技术回答中保持原样。
- 运行时散文在品牌无所增益处保持中性（"Current file policy"、"the file sandbox"）；在名字是真实制品处保持事实（`$DSH_*` 变量、包名）。
- 产品从不隐瞒血统，也从不冒用运行时的名字：回答「你是什么」时先报 Inkstone，可以提及 DSH 基础；回答内部问题时原样使用 DSH 术语。

## Alternatives considered

**从模型可见文本中彻底抹掉 DSH。**与安装现实矛盾——包、工具、环境变量都带 `dsh` 名，假装否则会产生与用户磁盘所见不一致的回答。

**继续以 DSH 作为模型可见身份。**与商标和其余所有产品面矛盾；线上会话已显示代理自称旧产品。

**各界面自行措辞、没有共享声明。**这就是 KEP-0004 之前的状态：每个界面各自推导关系，并在用户面前互相矛盾。

## Consequences

身份修改变成构造上的双站点编辑——系统提示配置和技能的 Who-you-are 段——加上这篇笔记；skills spec 断言技能体渲染更名后的身份。血统声明是稳定的产品文案；修改它（例如去掉 DSH 提及）是先记录在这里的产品决策。

## Testing

`packages/preset/agent-preset/tests/skills.spec.ts` 钉住技能名、打包正文和仓库技能链接；KEP-0004 的人工验证向运行中的代理同时提问「你是谁」和「你和 DeepSeek Harness 是什么关系」，并期望得到声明中的回答。
