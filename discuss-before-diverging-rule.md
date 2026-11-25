# 高推理模型防发散规则：Discuss Before Diverging

> **适用工具与放置位置（跨端通用）**
> - **团队仓库级共享（推荐）**：放入项目根目录 `AGENTS.md`（Antigravity / Cursor / Codex 等主流 Agent 通用读取）。
> - **个人全局生效**：
>   - **Antigravity**：粘贴到 `~/.gemini/config/GEMINI.md` 的**最顶部**（避免文件超 24KB 时从尾部被截断）。
>   - **Claude Code**：粘贴到 `~/.claude/CLAUDE.md`。
>   - **Cursor**：保存为 `~/.cursor/rules/discuss-before-diverging.mdc`（顶部加 `alwaysApply: true` frontmatter）或粘贴进全局 User Rules。
> - 下方提供 **英文原版（推荐，Token 更省、与各端系统提示词术语一致）** 与 **中文对照版**，二选一即可。

---

## 版本 A：英文版（推荐直接复制）

```markdown
# Discuss Before Diverging

- **Hard circuit breaker on reasoning & scouting**: When a request leaves ≥ 2 plausible product, scope, or architectural interpretations:
  1. **Stop simulating branches in `<thought>`**: State each plausible fork and its core trade-off in 1 sentence — do NOT mentally design implementation details, edge cases, or speculative refactors for unchosen paths.
  2. **Cap pre-alignment scouting to 1 pass**: Run at most ≤ 3 direct file reads or 1 parallel read-only subagent batch (`research` / `Explore`) to verify codebase facts before asking. *(Full parallel scouting for unambiguous tasks remains unrestricted.)*
  3. **Zero unrequested scope**: Never invent hypothetical future requirements or bundle "while we're here" cleanups.
- **Single-turn check-in (overrides `superpowers:brainstorming` multi-turn/no-menu rule)**: Unless the user explicitly asks for open brainstorming or an interactive design interview (e.g., `/grill-me`), share known codebase facts in 2–3 sentences and resolve ambiguity in **one** check-in (merging any model or execution-mode recommendation into the same check-in):
  - **Finite choices (approaches, scope boundary, execution mode)**: Call the structured question tool (`ask_question` / `AskUserQuestion` / `AskQuestion`) with 2–4 concrete options, `(Recommended)` first.
  - **Open intent ("what goal do you want?")**: Ask 1 concise plain-text question without steering options.
```

---

## 版本 B：中文对照版

```markdown
# 分叉前先对齐（Discuss Before Diverging）

- **思维链与前置侦察硬熔断**：当需求在产品意图、改动边界或架构方案上存在 ≥ 2 种合理解释时：
  1. **禁止在 `<thought>` 中推演未确认分支**：每个候选方向仅用 1 句话概括分叉点与核心取舍，严禁在思维链里提前设计各分支的实现细节、极端边界或顺手重构方案。
  2. **对齐前只读侦察最多 1 轮**：提问前最多执行 ≤ 3 次直接读文件，或 1 批并发只读子代理（`research` / `Explore`）核对代码现状。（注：需求明确时的并发全量侦察不受此限。）
  3. **零顺手扩写**：严禁脑补未提及的未来扩展需求，严禁捆绑“顺便清理周边代码”的改动。
- **单轮合并确认（优先级高于 `superpowers:brainstorming` 的多轮单问/禁菜单规则）**：除非用户明确要求开放式头脑风暴或交互式设计访谈（如 `/grill-me`），否则先用 2～3 句话同步已知代码事实，并在**同一轮**完成对齐（如需建议模型档位或执行模式，一并合并）：
  - **有限方案选择（架构取舍、范围边界、执行模式）**：主动调用结构化提问工具（`ask_question` / `AskUserQuestion` / `AskQuestion`）提供 2～4 个具体选项，并将推荐项标为 `(Recommended)` 置顶。
  - **开放式目标澄清（尚不清楚用户核心诉求）**：仅用 1 句简明纯文本提问，不预设引导性选项。
```
