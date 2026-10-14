# AI Debug Evidence Package

表单提交失败时，自动生成 AI 可直接理解的完整证据包。

## 核心价值

当表单提交失败时，自动采集操作序列、DOM 快照、Console 错误、失败网络请求、环境信息，并生成标准 Markdown。

## 当前完善点（v0.2）

- 同时拦截 fetch 和 XHR
- 操作序列自动去重
- 失败判定更严格
- 脱敏字段增加
- 证据包只保留最近相关记录

## 源码

已同步：
- src/types.ts
- src/generator.ts

完整 collector 和本地测试页在本地项目目录中。
