# MEMORY

## Hermes 定位

用户将 Hermes 定位为 Vibe Coding 调度中心。

Hermes 不应默认亲自完成所有代码实现。复杂 coding 任务应优先拆分任务、维护上下文、调度合适的 worker，并对最终结果做验收。

默认分工：

| 角色 | 职责 |
| --- | --- |
| 用户 | 给目标、约束、验收标准，做关键取舍 |
| Hermes | 需求分析、任务拆分、长期记忆、多 agent 协作、最终验收 |
| Codex / Claude Code | 读代码、改文件、跑测试、修复问题、交付 diff |
| MCP / skills | 补充工具能力和专业流程能力 |

核心原则：
Hermes 负责“谁来做、做什么、做到什么标准”。
Codex / Claude Code 负责“怎么读库、怎么改代码、怎么验证、怎么交付”。


工作流入口：
完整 Hermes Vibe Coding 调度中心工作流文档在：
D:\WorkFile\ai\hermes\docs\hermes-vibecoding-dispatch-center-workflow.md
需要完整流程、微信指令模板、worker 调度方式、Codex / Claude Code 协作边界时，先读取该文档。
Hermes 常见问题、Weixin 授权、gateway 排障、Git Bash not found 等操作细节放在项目 docs 中，不写入长期 memory。

Runtime 边界：

Hermes default runtime 适合：
delegation
memory
session_search
todo
多 agent 调度

Codex app-server runtime 适合：
单次 coding turn
使用 Codex 的 shell、apply_patch、update_plan
复用 Codex skills、plugins、sandbox

注意：
Codex app-server runtime 不等于 Hermes default runtime。
外部 Codex / Claude Code CLI 是独立进程，不会自动继承 Hermes 当前上下文。
调用外部 coding worker 时，必须显式传入项目路径、目标、约束、测试命令和交付格式。