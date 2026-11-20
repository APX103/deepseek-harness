---
description: "在 Web 中呈现科研能力：侧栏「科研插件」目录页（技能、连接器、智能体）与平台外链「论文工具」「科研应用」。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-research-plugins

[English](README.md) | 中文

## Summary

在 Web 中呈现科研能力：侧栏「科研插件」目录页（技能、连接器、智能体）与平台外链「论文工具」「科研应用」。

## Table of Contents

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)

-----

<a id="use-this-package"></a>
## 使用本包

Host 服务解析部署的平台外链地址；staging 与 production 部署通过 profile config 覆盖。侧栏根据 `sidebar.nav.links` 的注册渲染两行外链（目标地址走条目的 `inject` face——槽位账目会把注册选项投影到自己的词表，`href` 放不进去），并在新浏览器上下文中打开 `href`；links 读取失败时侧栏宁缺这两行，也不留死链。

<a id="understand-the-implementation"></a>
## 理解实现

KEP-0008 记录设计：一个包同时承载两半；手工编纂的内置目录与 harness 运行态（`ctx.skills`、`ctx.mcpManager`、智能体预设）做软连接；可选的 config 化 Hub 拉取（`research-catalog-v1`）；「去试试」v1 先复制到剪贴板。外链行是纯元数据的槽位注册，侧栏继续独占收起/展开的渲染。
